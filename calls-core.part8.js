/**
 * calls-core.part8.js — PART 8/8 — UI BRIDGE, PUBLIC API & INIT
 * Notification system, UI bridge, initialization sequence, top-level message handler (with its own PARENT_READY/signaling handling), the public API surface, and the module core controller.
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



    



    window.__CallsCoreShared.notifyListeners = function notifyListeners(event, data) {



        listeners.forEach(listener => {



            try { listener(event, data); } catch (e) {}



        });



    };



    



    // ==================== UI BRIDGE ====================



    window.__CallsCoreShared.UIBridge = {



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



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'UIBridge initialized');



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



                    if (!window.__CallsCoreShared.assertActive('start-call')) {



                        window.__CallsCoreShared.notifyListeners('session_required', { action: 'start-call' });



                        return;



                    }



                    if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                        window.__CallsCoreShared.notifyListeners('session_required', { action: 'start-call' });



                        return;



                    }



                    window.callCore.startCall(targetUserId, callType).catch(error => {



                        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Call initiation failed', error);



                        window.__CallsCoreShared.notifyListeners('call_error', { error: error.message });



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



            const callId = window._currentIncomingCallId || window.__CallsCoreShared.callsState.activeCallId;



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



            const callId = window._currentIncomingCallId || window.__CallsCoreShared.callsState.activeCallId;



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



            const callId = window.__CallsCoreShared.callsState.activeCallId;



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



                const isMuted = !window.__CallsCoreShared.callsState.micEnabled;



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



                const isVideoOn = window.__CallsCoreShared.callsState.cameraEnabled;



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



                    if (!window.__CallsCoreShared.assertActive('toggle-mic')) return;



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



                    if (!window.__CallsCoreShared.assertActive('toggle-camera')) return;



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



                    if (!window.__CallsCoreShared.assertActive('switch-camera')) return;



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



                    if (!window.__CallsCoreShared.assertActive('screen-share')) return;



                    if (window.__CallsCoreShared.callsState.screenSharing) {



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



                    if (!window.__CallsCoreShared.assertActive('set-mood')) return;



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



                    if (!window.__CallsCoreShared.assertActive('set-intention')) return;



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



                    if (!window.__CallsCoreShared.assertActive('toggle-focus')) return;



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



                    if (!window.__CallsCoreShared.assertActive('send-reaction')) return;



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



                        if (!window.__CallsCoreShared.assertActive('send-message')) return;



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



                    if (!window.__CallsCoreShared.assertActive('send-chat')) return;



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



    



    window.__CallsCoreShared.UIBridge.initialize();



    



    // ==================== INITIALIZATION SEQUENCE ====================



    function initializeModule() {



        if (window.__CallsCoreShared.initializationLock) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Initialization already in progress`);



            return;



        }



        



        window.__CallsCoreShared.initializationLock;



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Starting initialization`);



        



        // Only transition if we're in BOOT state



        if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.BOOT) {



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.INITIALIZING, 'module_start');



        }



        



        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE_NAME, 'Initializing module');



        



        // Setup message listener (already set up in IframeTransport)



        



        // Only transition if we're in INITIALIZING state



        if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.INITIALIZING) {



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.READY, 'init_complete');



            window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE_NAME, 'READY');



        }



        



        // Send CHILD_READY exactly once - only in READY state



        if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.READY && !window.__CallsCoreShared.childReadySent) {



            window.__CallsCoreShared.sendChildReady();



        } else {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Cannot send CHILD_READY - not in READY state (current: ${window.__CallsCoreShared.currentState})`);



        }



        



        window.__CallsCoreShared.initializationLock;



        



        window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE_NAME, `Initialization complete - state: ${window.__CallsCoreShared.currentState}`);



    }



    



    // ==================== MESSAGE HANDLER ====================



    window.addEventListener('message', (event) => {



        setTimeout(() => {



            try {



                if (!window.__CallsCoreShared.isValidOrigin(event.origin)) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE_NAME, 'Invalid origin', { origin: event.origin });



                    return;



                }



                



                const msg = event.data;



                



                if (!msg || typeof msg !== 'object') return;



                



                if (msg.type === 'HANDSHAKE_RETRY') {



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE_NAME, 'Received HANDSHAKE_RETRY - ignoring');



                    return;



                }



                



                if (!window.__CallsCoreShared.validateMessage(msg)) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE_NAME, 'Invalid message format', msg);



                    return;



                }



                



                if (msg.messageId && window.__CallsCoreShared.MessageGuard.isDuplicate(msg.messageId)) {



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE_NAME, 'Duplicate message ignored', { messageId: msg.messageId });



                    return;



                }



                



                if (msg.source && msg.source !== 'parent') {



                    return;



                }



                



                // Handle storage responses



                if (window.__CallsCoreShared.StorageProxy.handleStorageResponse(event)) {



                    return;



                }



                



                // Handle session messages



                if (window.__CallsCoreShared.SessionClient.handleSessionMessage(event)) {



                    return;



                }



                



                // ==================== CRITICAL: PARENT_READY HANDLER ====================



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.PARENT_READY) {



                    window.__CallsCoreShared.handleParentReady(msg);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.HEARTBEAT) {



                    window.__CallsCoreShared.logHeartbeat(window.__CallsCoreShared.MODULE_NAME, 'Heartbeat received');



                    window.__CallsCoreShared.sendHeartbeatAck(msg.messageId);



                    return;



                }



                



                // Handle API_RESPONSE



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.API_RESPONSE) {



                    const requestId = msg.requestId || msg.payload?.requestId;



                    if (requestId && window.__CallsCoreShared.MessageRegistry._pendingMessages.has(requestId)) {



                        const pending = window.__CallsCoreShared.MessageRegistry._pendingMessages.get(requestId);



                        if (pending && pending.resolve && !pending.resolved) {



                            clearTimeout(pending.timeoutId);



                            pending.resolve({



                                success: msg.success !== false,



                                data: msg.payload?.data || msg.data,



                                error: msg.payload?.error || msg.error,



                                requestId: requestId



                            });



                            pending.resolved = true;



                            window.__CallsCoreShared.MessageRegistry._pendingMessages.delete(requestId);



                        }



                    }



                    return;



                }



                



                if (msg.type === 'MODULE_REGISTERED') {



                    window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE_NAME, 'MODULE_REGISTERED received');



                    window.__CallsCoreShared.callsState.registered = true;



                    



                    window.dispatchEvent(new CustomEvent('MODULE_READY', {



                        detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



                    }));



                    



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.MODULE_INIT_DATA) {



                    window.__CallsCoreShared.handleInitData(msg);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_ACTIVE || 



                    msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_DATA ||



                    msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_SYNC) {



                    



                    const sessionData = msg.payload || msg.data || {};



                    if (sessionData.token) {



                        // Session deduplication



                        const sessionId = sessionData.sessionId || sessionData.id;



                        if (sessionId && window.__CallsCoreShared.callsState.lastSessionId === sessionId) {



                            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Duplicate session message ignored', { sessionId });



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



                        



                        if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Session message rejected - invalid session data');



                            return;



                        }



                        



                        if (sessionId) {



                            window.__CallsCoreShared.callsState.lastSessionId = sessionId;



                        }



                        



                        window.__CallsCoreShared.callsState.session = candidateSession;



                        window.__CallsCoreShared.callsState.token = candidateSession.token;



                        window.__CallsCoreShared.callsState.sessionReceived = true;



                        window.__CallsCoreShared.callsState.sessionStatus = 'valid';



                        window.__CallsCoreShared.validSessionConfirmed;



                        window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE_NAME, 'Session received', { sessionId });



                        



                        window.__CallsCoreShared.sessionRequestAttempts;



                        



                        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                            detail: { core: window.callCore, timestamp: Date.now() }



                        }));



                    }



                    



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SESSION_NULL) {



                    window.__CallsCoreShared.callsState.session = null;



                    window.__CallsCoreShared.callsState.token = null;



                    window.__CallsCoreShared.callsState.sessionReceived = false;



                    window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



                    window.__CallsCoreShared.callsState.lastSessionId = null;



                    window.__CallsCoreShared.validSessionConfirmed;



                    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE_NAME, 'SESSION_NULL received');



                    return;



                }



                



                // ==================== CALL SIGNALING HANDLERS ====================



                // ── FIX: accept all naming variants ──



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INCOMING ||



                    msg.type === 'CALL_INCOMING' ||



                    msg.type === 'incoming_call' ||



                    msg.type === 'call_incoming') {



                    console.log('[CallsCore] 📞 CALL_INCOMING (msg router) received, routing to handleIncomingCall');



                    window.__CallsCoreShared.handleIncomingCall(msg.payload || msg.data || msg);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INITIATED) {



                    window.__CallsCoreShared.handleCallInitiated(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_ACCEPT) {



                    window.__CallsCoreShared.handleCallAccepted(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_STARTED) {



                    window.__CallsCoreShared.handleCallStarted(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_CONNECTED) {



                    window.__CallsCoreShared.handleCallConnected(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_REJECTED) {



                    window.__CallsCoreShared.handleCallRejected(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_ENDED) {



                    window.__CallsCoreShared.handleCallEnded(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_FAILED) {



                    window.__CallsCoreShared.handleCallFailed(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_TIMEOUT) {



                    window.__CallsCoreShared.handleCallTimeout(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_BUSY) {



                    window.__CallsCoreShared.handleCallBusy(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.CALL_INITIATED_ACK) {

                    window.__CallsCoreShared.handleCallInitiatedAck(msg.payload || msg.data);

                    return;

                }

                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SIGNAL_OFFER) {



                    window.__CallsCoreShared.handleSignalOffer(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.SIGNAL_ANSWER) {



                    window.__CallsCoreShared.handleSignalAnswer(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.ICE_CANDIDATE) {



                    window.__CallsCoreShared.handleIceCandidate(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.REMOTE_STREAM_ADDED) {



                    window.__CallsCoreShared.handleRemoteStreamAdded(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === window.__CallsCoreShared.MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {



                    window.__CallsCoreShared.handleRemoteStreamRemoved(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'FRIEND_UPDATE' || msg.type === 'CONTACTS_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('contacts_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'CALL_HISTORY_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('call_history_update', msg.payload || msg.data);



                    return;



                }



                



// ── OFFLINE-FIRST: Apply per-key setting changes immediately ──



if (msg.type === 'SETTING_CHANGED' || msg.type === 'SETTINGS_UPDATED') {



    const data = msg.payload || msg.data || {};







    if (msg.type === 'SETTING_CHANGED' && data.section && data.key !== undefined) {



        const { section, key, value } = data;



        applySettingToCallsModule(section, key, value);



        if (data.premium !== undefined) window.__CallsCoreShared.callsState.isPremium = data.premium;



        if (data.premiumFeatures) window.__CallsCoreShared.callsState.premiumFeatures = { ...window.__CallsCoreShared.callsState.premiumFeatures, ...data.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));



        window.__CallsCoreShared.notifyListeners('setting_changed', { section, key, value });



        return;



    }







    if (msg.type === 'SETTINGS_UPDATED' && data.settings) {



        const s = data.settings;



        Object.entries(s).forEach(([sec, secVal]) => {



            if (secVal && typeof secVal === 'object')



                Object.entries(secVal).forEach(([k, v]) => applySettingToCallsModule(sec, k, v));



        });



        if (s.premium !== undefined) window.__CallsCoreShared.callsState.isPremium = s.premium;



        if (s.premiumFeatures) window.__CallsCoreShared.callsState.premiumFeatures = { ...window.__CallsCoreShared.callsState.premiumFeatures, ...s.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));



        window.__CallsCoreShared.notifyListeners('settings_update', s);



        return;



    }



    return;



}



                



                if (msg.type === 'USER_LOGGED_OUT') {



                    window.__CallsCoreShared.resetCallState();



                    window.__CallsCoreShared.callsState.session = null;



                    window.__CallsCoreShared.callsState.token = null;



                    window.__CallsCoreShared.callsState.verified = false;



                    window.__CallsCoreShared.callsState.sessionReceived = false;



                    window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



                    window.__CallsCoreShared.callsState.lastSessionId = null;



                    window.__CallsCoreShared.validSessionConfirmed;



                    window.__CallsCoreShared.notifyListeners('logout', {});



                    return;



                }



                



                if (msg.type === 'SESSION_REFRESHED') {



                    const data = msg.payload || msg.data;



                    if (data && data.token) {



                        // Only update token if we have a valid session



                        if (window.__CallsCoreShared.validSessionConfirmed && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                            window.__CallsCoreShared.callsState.token = data.token;



                            if (window.__CallsCoreShared.callsState.session) {



                                window.__CallsCoreShared.callsState.session.token = data.token;



                            }



                            window.__CallsCoreShared.DiagnosticsAgent.record('session_refresh');



                        }



                    }



                    return;



                }



                



                if (msg.type === 'NEW_MESSAGE') {



                    window.__CallsCoreShared.notifyListeners('new_message', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'STATUS_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('status_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'GROUP_UPDATE') {



                    window.__CallsCoreShared.notifyListeners('group_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'AUTH_ERROR' || msg.type === 'SESSION_ERROR') {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Auth error received, refreshing session');



                    window.__CallsCoreShared.refreshSession();



                    return;



                }



                



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE_NAME, 'Error handling message', error);



            }



        }, 0);



    });



    



    // ==================== PUBLIC API ====================



    window.callCore = {



        moduleName: window.__CallsCoreShared.MODULE_NAME,



        version: window.__CallsCoreShared.CONFIG.VERSION,



        



        getLifecycleState: function() {



            return window.__CallsCoreShared.currentState;



        },



        



        isCoreReady: function() {



            return window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE &&



                   window.__CallsCoreShared.callsState.registered && 



                   window.__CallsCoreShared.callsState.sessionReceived && 



                   window.__CallsCoreShared.callsState.sessionStatus === 'valid' &&



                   window.__CallsCoreShared.callsState.parentReady &&



                   window.__CallsCoreShared.validSessionConfirmed &&



                   window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session);



        },



        



        getState: function() {



            return {



                lifecycleState: window.__CallsCoreShared.currentState,



                registered: window.__CallsCoreShared.callsState.registered,



                initialized: window.__CallsCoreShared.callsState.initialized,



                parentReady: window.__CallsCoreShared.callsState.parentReady,



                coreReady: this.isCoreReady(),



                callState: window.__CallsCoreShared.callsState.callState,



                callActive: window.__CallsCoreShared.callsState.callActive,



                activeCallId: window.__CallsCoreShared.callsState.activeCallId,



                micEnabled: window.__CallsCoreShared.callsState.micEnabled,



                cameraEnabled: window.__CallsCoreShared.callsState.cameraEnabled,



                cameraFacingMode: window.__CallsCoreShared.callsState.cameraFacingMode,



                screenSharing: window.__CallsCoreShared.callsState.screenSharing,



                hasLocalStream: !!window.__CallsCoreShared.callsState.localStream,



                hasRemoteStream: !!window.__CallsCoreShared.callsState.remoteStream,



                deviceInitialized: window.__CallsCoreShared.MediaManager._deviceCheckDone,



                isPremium: window.__CallsCoreShared.callsState.isPremium,



                currentMood: window.__CallsCoreShared.callsState.currentMood,



                currentIntention: window.__CallsCoreShared.callsState.currentIntention,



                currentFocusMode: window.__CallsCoreShared.callsState.currentFocusMode,



                callParticipants: window.__CallsCoreShared.callsState.callParticipants,



                callStartTime: window.__CallsCoreShared.callsState.callStartTime,



                callDuration: window.__CallsCoreShared.callsState.callStartTime ? Math.floor((Date.now() - window.__CallsCoreShared.callsState.callStartTime) / 1000) : 0,



                callType: window.__CallsCoreShared.callsState.callType,



                sessionReceived: window.__CallsCoreShared.callsState.sessionReceived,



                sessionStatus: window.__CallsCoreShared.callsState.sessionStatus,



                degraded: window.__CallsCoreShared.callsState.degraded,



                governorState: window.__CallsCoreShared.CallsStateGovernor.getState(),



                webRTC: window.__CallsCoreShared.WebRTCManager.getStatus(),



                childReadySent: window.__CallsCoreShared.callsState.childReadySent,



                registrationSent: window.__CallsCoreShared.callsState.registrationSent,



                parentReady: window.__CallsCoreShared.parentReady,



                queuedMessages: window.__CallsCoreShared.messageQueue.length,



                signalingState: window.__CallsCoreShared.callsState.signalingState,



                connectionState: window.__CallsCoreShared.callsState.connectionState,



                sessionValid: window.__CallsCoreShared.validSessionConfirmed && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session),



                callData: window.__CallsCoreShared.callsState.callData



            };



        },



        



        getCallsState: function() {



            return { ...window.__CallsCoreShared.callsState };



        },



        



        resetCallState: function() {



            window.__CallsCoreShared.resetCallState();



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Call state manually reset');



            return { success: true };



        },



        



        getCallState: function() {



            return {



                callActive: window.__CallsCoreShared.callsState.callActive,



                callState: window.__CallsCoreShared.callsState.callState,



                activeCallId: window.__CallsCoreShared.callsState.activeCallId,



                callType: window.__CallsCoreShared.callsState.callType,



                callStartTime: window.__CallsCoreShared.callsState.callStartTime,



                callParticipants: [...window.__CallsCoreShared.callsState.callParticipants],



                callData: window.__CallsCoreShared.callsState.callData



            };



        },







        forceResetCallState: function() {



    console.log('[CallsCore] Force resetting call state');



    



    // Reset all call state variables



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



    window.__CallsCoreShared.callsState.callData = null;



    window.__CallsCoreShared.callsState.serverCallId = null;



    window.__CallsCoreShared.callsState.localCallId = null;



    



    // Clear any pending timers



    if (window.__CallsCoreShared.callsState.callInvitationTimer) {



        clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



        window.__CallsCoreShared.callsState.callInvitationTimer = null;



    }



    



    // Clean up media and WebRTC



    if (window.__CallsCoreShared.MediaManager && window.__CallsCoreShared.MediaManager.stopLocalStream) {



        window.__CallsCoreShared.MediaManager.stopLocalStream();



    }



    if (window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager.close) {



        window.__CallsCoreShared.WebRTCManager.close();



    }



    



    // CRITICAL FIX: Restore CallsStateGovernor to ACTIVE so ACTIVE→CALL_READY



    // transition works on the next call attempt. Without this, governor stays



    // in INIT after a force-reset and the INIT→CALL_READY transition is illegal.



    if (window.__CallsCoreShared.CallsStateGovernor) {



        window.__CallsCoreShared.CallsStateGovernor._transitionLock = false;



        // Only force to ACTIVE if we're in a state that's past REGISTERING



        // (i.e. the session was previously valid). This avoids skipping auth.



        const nonTerminalStates = [



            window.__CallsCoreShared.CALLS_STATE.CALL_READY,



            window.__CallsCoreShared.CALLS_STATE.IN_CALL,



            window.__CallsCoreShared.CALLS_STATE.TERMINATED,



            window.__CallsCoreShared.CALLS_STATE.ACTIVE



        ];



        if (nonTerminalStates.includes(window.__CallsCoreShared.CallsStateGovernor._currentState) ||



            window.__CallsCoreShared.CallsStateGovernor._currentState === window.__CallsCoreShared.CALLS_STATE.INIT) {



            window.__CallsCoreShared.CallsStateGovernor._previousState = window.__CallsCoreShared.CallsStateGovernor._currentState;



            window.__CallsCoreShared.CallsStateGovernor._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE;



        }



    }



    



    return { success: true };



},



clearActiveCall: function() {



    window.__CallsCoreShared.callsState.callActive = false;



    window.__CallsCoreShared.callsState.callState = 'idle';



    window.__CallsCoreShared.callsState.activeCallId = null;



    window.__CallsCoreShared.callsState.activeCall = null;



    window.__CallsCoreShared.callsState.callType = null;



    window.__CallsCoreShared.callsState.callParticipants = [];



    window.__CallsCoreShared.callsState.callStartTime = null;



    window.__CallsCoreShared.callsState.connectionState = 'new';



    window.__CallsCoreShared.callsState.signalingState = 'new';



    window.__CallsCoreShared.callsState.callData = null;



    



    if (window.__CallsCoreShared.callsState.callInvitationTimer) {



        clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



        window.__CallsCoreShared.callsState.callInvitationTimer = null;



    }



    



    if (window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager.close) window.__CallsCoreShared.WebRTCManager.close();



    if (window.__CallsCoreShared.MediaManager && window.__CallsCoreShared.MediaManager.stopLocalStream) window.__CallsCoreShared.MediaManager.stopLocalStream();



    



    console.log('[CallsCore] Active call cleared');



    return { success: true };



},







        getSession: function() {



            return window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session) ? { ...window.__CallsCoreShared.callsState.session } : null;



        },



        



        getSessionStatus: function() {



            return window.__CallsCoreShared.callsState.sessionStatus;



        },



        



        isAuthenticated: function() {



            return window.__CallsCoreShared.callsState.sessionStatus === 'valid' && 



                   !!(window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session) && window.__CallsCoreShared.callsState.session.authenticated);



        },



        



        authorizedFetch: function(url, options = {}) {



            if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Blocking API call: session not ready');



                return Promise.reject(new Error('Session not ready'));



            }



            



            if (!this.isCoreReady() && !options.bypassReadyCheck) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Blocking API call: core not ready');



                return Promise.reject(new Error('Core not ready'));



            }



            



            const headers = {



                ...(options.headers || {}),



                'Authorization': `Bearer ${window.__CallsCoreShared.callsState.session.token}`,



                'Content-Type': 'application/json'



            };



            



            return fetch(url, {



                ...options,



                headers



            }).then(response => {



                if (response.status === 401) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Received 401 Unauthorized, refreshing session');



                    window.__CallsCoreShared.refreshSession();



                }



                return response;



            });



        },



        



        checkPermissions: function(required) {



            return window.__CallsCoreShared.PermissionManager.checkPermissions(required);



        },



        



        requestPermissions: function(required) {



            return window.__CallsCoreShared.PermissionManager.requestPermissions(required);



        },



        



        startCall: function(targetUserId, callType = 'voice', options = {}) {



            if (!window.__CallsCoreShared.assertActive('startCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (window.__CallsCoreShared.callsState.callActive) {



                // CRITICAL FIX: If the active call is stale (>90s old with no connection),



                // auto-reset instead of blocking. This prevents the "already in call" loop



                // caused by backend cleanup not propagating to frontend state.



                const callAge = window.__CallsCoreShared.callsState.callStartTime ? Date.now() - window.__CallsCoreShared.callsState.callStartTime : Infinity;



                const hasLiveMedia = !!window.__CallsCoreShared.callsState.localStream || !!window.__CallsCoreShared.callsState.remoteStream;



                const looksDisconnected = !['connected', 'connecting'].includes(window.__CallsCoreShared.callsState.connectionState) &&



                    !['connected', 'ongoing', 'active', 'in_call', 'initiating', 'ringing', 'incoming'].includes(window.__CallsCoreShared.callsState.callState);



                if (callAge > 90000 || (!hasLiveMedia && looksDisconnected)) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Stale callActive detected (>90s), auto-resetting before new call', { callAge, callId: window.__CallsCoreShared.callsState.activeCallId });



                    if (window.callCore && window.callCore.forceResetCallState) {



                        window.callCore.forceResetCallState();



                    } else {



                        window.__CallsCoreShared.resetCallState();



                        window.__CallsCoreShared.callsState.callActive = false;



                        window.__CallsCoreShared.callsState.callState = 'idle';



                        window.__CallsCoreShared.callsState.activeCallId = null;



                        if (window.__CallsCoreShared.CallsStateGovernor) {



                            window.__CallsCoreShared.CallsStateGovernor._transitionLock = false;



                            window.__CallsCoreShared.CallsStateGovernor._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE;



                        }



                    }



                } else {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot start call - another call already active');



                    return Promise.resolve({ success: false, reason: 'call_active' });



                }



            }



            



            if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot start call - no valid session');



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            window.__CallsCoreShared.DiagnosticsAgent.record('call_start');



            



            // Convert targetUserId to participants array



            const participants = targetUserId ? [targetUserId] : [];



            



            // FIX-GROUP-CALL-NOTICE: thread options (groupId/isGroupCall) through
            // instead of dropping them, so group calls keep their group context.
            return window.__CallsCoreShared.CallsStateGovernor.initiateCall(callType, participants, options);



        },



        



        startGroupCall: function(participants = [], callType = 'voice', options = {}) {



            if (!window.__CallsCoreShared.assertActive('startGroupCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (window.__CallsCoreShared.callsState.callActive) {



                const callAge = window.__CallsCoreShared.callsState.callStartTime ? Date.now() - window.__CallsCoreShared.callsState.callStartTime : Infinity;



                if (callAge > 90000) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Stale callActive on group call (>90s), auto-resetting');



                    window.__CallsCoreShared.resetCallState();



                    window.__CallsCoreShared.callsState.callActive = false;



                    window.__CallsCoreShared.callsState.callState = 'idle';



                    window.__CallsCoreShared.callsState.activeCallId = null;



                    if (window.__CallsCoreShared.CallsStateGovernor) { window.__CallsCoreShared.CallsStateGovernor._transitionLock = false; window.__CallsCoreShared.CallsStateGovernor._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE; }



                } else {



                    return Promise.resolve({ success: false, reason: 'call_active' });



                }



            }



            



            if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            // FIX (Forensic Audit P1): Premium gate removed. groupCalls.enabled=true by default.
            // Keep gate logic for future premium-only features but not group calls.
            if (!window.__CallsCoreShared.callsState.isPremium && !window.__CallsCoreShared.callsState.premiumFeatures.groupCalls) {
                // groupCalls is now always true; this branch should not be reached.
                // Log warning in case premiumFeatures gets set externally to false.
                console.warn('[Calls] groupCalls gate triggered but should be open — check premiumFeatures state');



                return { success: false, reason: 'premium_required' };



            }



            



            window.__CallsCoreShared.DiagnosticsAgent.record('call_start');



            



            return window.__CallsCoreShared.CallsStateGovernor.initiateCall(callType, participants);



        },



        



        answerCall: function(callId) {



            if (!window.__CallsCoreShared.assertActive('answerCall')) {



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
            if (window.__CallsCoreShared.callsState.callActive && window.__CallsCoreShared.callsState.activeCall && window.__CallsCoreShared.callsState.activeCallId && window.__CallsCoreShared.callsState.activeCallId !== callId) {



                return Promise.resolve({ success: false, reason: 'call_active' });



            }



            



            if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            window.__CallsCoreShared.DiagnosticsAgent.record('call_accept');



            



            return window.__CallsCoreShared.CallsStateGovernor.acceptCall(callId);



        },



        



        declineCall: function(callId, reason = 'declined') {



            if (!window.__CallsCoreShared.assertActive('declineCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            window.__CallsCoreShared.DiagnosticsAgent.record('call_reject');



            



            return window.__CallsCoreShared.CallsStateGovernor.rejectCall(callId, reason);



        },



        



        endCall: function(callId) {



            if (!window.__CallsCoreShared.assertActive('endCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            window.__CallsCoreShared.DiagnosticsAgent.record('call_end', { reason: 'user_ended' });



            



            return window.__CallsCoreShared.CallsStateGovernor.endCall(callId);



        },



        



        toggleMic: function() {



            if (!window.__CallsCoreShared.assertActive('toggleMic')) {



                return false;



            }



            



            const newState = !window.__CallsCoreShared.callsState.micEnabled;



            const result = window.__CallsCoreShared.MediaManager.toggleMic(newState);



            



            if (result) {



                window.__CallsCoreShared.IframeTransport.sendAction('TOGGLE_MIC', {



                    enabled: newState,



                    timestamp: Date.now()



                });



            }



            



            return result;



        },



        



        toggleCamera: function() {



            if (!window.__CallsCoreShared.assertActive('toggleCamera')) {



                return false;



            }



            



            const newState = !window.__CallsCoreShared.callsState.cameraEnabled;



            const result = window.__CallsCoreShared.MediaManager.toggleCamera(newState);



            



            if (result) {



                window.__CallsCoreShared.IframeTransport.sendAction('TOGGLE_CAMERA', {



                    enabled: newState,



                    timestamp: Date.now()



                });



            }



            



            return result;



        },



        



        switchCamera: function() {



            if (!window.__CallsCoreShared.assertActive('switchCamera')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            return window.__CallsCoreShared.MediaManager.switchCamera().then(result => {



                if (result.success) {

                    // FIX-CAMERA-SWITCH-FROZEN-REMOTE: actually push the new
                    // camera track to the live peer connection's sender.
                    // Previously only the local preview updated and the
                    // remote party's video froze on the old camera.
                    if (typeof window.callsCoreReplaceVideoTrack === 'function') {
                        window.callsCoreReplaceVideoTrack(result.track);
                    }




                    window.__CallsCoreShared.IframeTransport.sendAction('SWITCH_CAMERA', {



                        facingMode: result.facingMode,



                        timestamp: Date.now()



                    });



                }



                return result;



            });



        },



        



        startScreenShare: function() {



            if (!window.__CallsCoreShared.assertActive('startScreenShare')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (!window.__CallsCoreShared.callsState.isPremium && !window.__CallsCoreShared.callsState.premiumFeatures.screenSharing) {



                window.__CallsCoreShared.notifyListeners('premium_required', { feature: 'screenSharing' });



                return Promise.resolve({ success: false, reason: 'premium_required' });



            }



            



            return window.__CallsCoreShared.MediaManager.startScreenShare().then(result => {

                if (result.success) {

                    // FIX-SCREENSHARE-NEVER-SENT: actually push the screen
                    // capture track to the live peer connection's video
                    // sender. Previously only the local preview updated and
                    // the remote party never received the shared screen.
                    if (typeof window.callsCoreReplaceVideoTrack === 'function' && result.track) {
                        window.callsCoreReplaceVideoTrack(result.track);
                    }

                    window.__CallsCoreShared.IframeTransport.sendAction('START_SCREEN_SHARE', {

                        timestamp: Date.now()

                    });

                }

                return result;

            });
        },



        



        stopScreenShare: function() {



            if (!window.__CallsCoreShared.assertActive('stopScreenShare')) return;



            



            var _stopResult = window.__CallsCoreShared.MediaManager.stopScreenShare();

            // FIX-SCREENSHARE-NEVER-SENT: revert the peer connection's video
            // sender back to the camera track that was active before sharing
            // started. Without this, ending screen share left the remote
            // party's video frozen on the last screen-share frame forever.
            if (typeof window.callsCoreReplaceVideoTrack === 'function' && _stopResult && _stopResult.revertTrack) {
                window.callsCoreReplaceVideoTrack(_stopResult.revertTrack);
            }

            window.__CallsCoreShared.IframeTransport.sendAction('STOP_SCREEN_SHARE', {

                timestamp: Date.now()

            });



        },



        



        getLocalStream: function(constraints) {



            return window.__CallsCoreShared.MediaManager.getLocalStream(constraints);



        },



        



        stopLocalStream: function() {



            window.__CallsCoreShared.MediaManager.stopLocalStream();



        },



        



        enumerateDevices: function() {



            return window.__CallsCoreShared.MediaManager.enumerateDevices();



        },



        



        getWebRTCManager: function() {



            return window.__CallsCoreShared.WebRTCManager;



        },



        



        sendDataChannelMessage: function(data) {



            return window.__CallsCoreShared.WebRTCManager.sendData(data);



        },



        



        setMood: function(mood) {



            if (!window.__CallsCoreShared.assertActive('setMood')) return;



            



            window.__CallsCoreShared.callsState.currentMood = mood;



            window.__CallsCoreShared.IframeTransport.sendAction('SET_MOOD', {



                mood,



                timestamp: Date.now()



            });



            window.__CallsCoreShared.notifyListeners('mood_updated', { mood });



        },



        



        setIntention: function(intention) {



            if (!window.__CallsCoreShared.assertActive('setIntention')) return;



            



            window.__CallsCoreShared.callsState.currentIntention = intention;



            window.__CallsCoreShared.IframeTransport.sendAction('SET_INTENTION', {



                intention,



                timestamp: Date.now()



            });



            window.__CallsCoreShared.notifyListeners('intention_updated', { intention });



        },



        



        toggleFocusMode: function() {



            if (!window.__CallsCoreShared.assertActive('toggleFocusMode')) return;



            



            const newState = !window.__CallsCoreShared.callsState.currentFocusMode;



            window.__CallsCoreShared.callsState.currentFocusMode = newState;



            window.__CallsCoreShared.IframeTransport.sendAction('TOGGLE_FOCUS_MODE', {



                enabled: newState,



                timestamp: Date.now()



            });



            window.__CallsCoreShared.notifyListeners('focus_mode_toggled', { enabled: newState });



        },



        



        sendReaction: function(reaction) {



            if (!window.__CallsCoreShared.assertActive('sendReaction')) return;



            



            window.__CallsCoreShared.IframeTransport.sendAction('SEND_REACTION', {



                reaction,



                timestamp: Date.now()



            });



        },



        



        sendChatMessage: function(message) {

            if (!window.__CallsCoreShared.assertActive('sendChatMessage')) return;

            var _chatTs = Date.now();
            var _chatCallId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId;

            // Primary: data channel (low-latency real-time)
            window.__CallsCoreShared.IframeTransport.sendAction('SEND_CHAT_MESSAGE', {
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
                        senderId:  window.__CallsCoreShared.callsState.userId || (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId)
                    });
                }
            } catch (_e) {}
        },



        



        saveNotes: function(notes) {



            if (!window.__CallsCoreShared.assertActive('saveNotes')) return;



            



            window.__CallsCoreShared.IframeTransport.sendAction('SAVE_NOTES', {



                notes,



                timestamp: Date.now()



            });



        },



        



        startWhiteboard: function() {

            if (!window.__CallsCoreShared.assertActive('startWhiteboard')) return;

            // Whiteboard: draw-over-canvas, synced via data channel
            // Creates an overlay canvas, sends draw events as data channel messages.
            if (window.__CallsCoreShared.callsState._whiteboardActive) {
                // Toggle off
                window.__CallsCoreShared.callsState._whiteboardActive = false;
                var existing = document.getElementById('kyn-whiteboard-overlay');
                if (existing) existing.remove();
                window.__CallsCoreShared.IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'stop', timestamp: Date.now() });
                window.__CallsCoreShared.notifyListeners('whiteboard_stopped', {});
                return;
            }

            window.__CallsCoreShared.callsState._whiteboardActive = true;
            window.__CallsCoreShared.IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'start', timestamp: Date.now() });

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
                window.__CallsCoreShared.IframeTransport.sendAction('WHITEBOARD_EVENT', evt);
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
                window.__CallsCoreShared.IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'clear' });
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

            window.__CallsCoreShared.notifyListeners('whiteboard_started', {});
        },



        



        createPoll: function(question, options) {

            if (!window.__CallsCoreShared.assertActive('createPoll')) return;

            if (!question || !Array.isArray(options) || options.length < 2) {
                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'createPoll: question and at least 2 options are required');
                return;
            }

            var pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
            var poll = {
                pollId:    pollId,
                question:  String(question).substring(0, 280),
                options:   options.slice(0, 8).map(function(o, idx) {
                    return { id: String(idx), text: String(o).substring(0, 120), votes: [] };
                }),
                createdBy: window.__CallsCoreShared.callsState.userId || window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId,
                createdAt: Date.now(),
                active:    true,
            };

            // Store locally
            if (!window.__CallsCoreShared.callsState.polls) window.__CallsCoreShared.callsState.polls = {};
            window.__CallsCoreShared.callsState.polls[pollId] = poll;

            // Broadcast via data channel (real-time) AND socket (persistence)
            window.__CallsCoreShared.IframeTransport.sendAction('POLL_EVENT', { action: 'create', poll: poll });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'create', poll: poll });
                }
            } catch(_e) {}

            window.__CallsCoreShared.notifyListeners('poll_created', { poll: poll });
            return pollId;
        },

        votePoll: function(pollId, optionId) {

            if (!window.__CallsCoreShared.assertActive('votePoll')) return;

            var poll = window.__CallsCoreShared.callsState.polls && window.__CallsCoreShared.callsState.polls[pollId];
            if (!poll || !poll.active) { window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'votePoll: poll not found or inactive'); return; }

            var option = poll.options.find(function(o) { return o.id === String(optionId); });
            if (!option) { window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'votePoll: invalid optionId'); return; }

            var myId = String(window.__CallsCoreShared.callsState.userId || (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId));

            // Remove previous vote from all options (one vote per person)
            poll.options.forEach(function(o) {
                o.votes = o.votes.filter(function(v) { return v !== myId; });
            });

            // Add vote
            option.votes.push(myId);

            var votePayload = { pollId: pollId, optionId: String(optionId), voterId: myId, timestamp: Date.now() };

            // Broadcast vote
            window.__CallsCoreShared.IframeTransport.sendAction('POLL_EVENT', { action: 'vote', vote: votePayload });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'vote', vote: votePayload });
                }
            } catch(_e) {}

            window.__CallsCoreShared.notifyListeners('poll_voted', { poll: poll, votePayload: votePayload });
        },

        closePoll: function(pollId) {

            if (!window.__CallsCoreShared.assertActive('closePoll')) return;

            var poll = window.__CallsCoreShared.callsState.polls && window.__CallsCoreShared.callsState.polls[pollId];
            if (!poll) return;
            poll.active = false;

            window.__CallsCoreShared.IframeTransport.sendAction('POLL_EVENT', { action: 'close', pollId: pollId });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'close', pollId: pollId });
                }
            } catch(_e) {}

            window.__CallsCoreShared.notifyListeners('poll_closed', { pollId: pollId, results: poll });
        },

        getPolls: function() {
            return window.__CallsCoreShared.callsState.polls ? Object.values(window.__CallsCoreShared.callsState.polls) : [];
        },




        



        getDevices: function() {



            return { ...window.__CallsCoreShared.callsState.mediaDevices };



        },



        



        hasAudioInput: function() {



            return window.__CallsCoreShared.callsState.mediaDevices.audioInput.length > 0;



        },



        



        hasVideoInput: function() {



            return window.__CallsCoreShared.callsState.mediaDevices.videoInput.length > 0;



        },



        



        isPremium: function() {



            return window.__CallsCoreShared.callsState.isPremium;



        },



        



        hasPremiumFeature: function(feature) {



            return window.__CallsCoreShared.callsState.isPremium || window.__CallsCoreShared.callsState.premiumFeatures[feature];



        },



        



        createCallLink: function(callType = 'voice') {



            if (!window.__CallsCoreShared.assertActive('createCallLink')) return;



            



            if (!window.__CallsCoreShared.callsState.isPremium && !window.__CallsCoreShared.callsState.premiumFeatures.callLinks) {



                window.__CallsCoreShared.notifyListeners('premium_required', { feature: 'callLinks' });



                return;



            }



            window.__CallsCoreShared.IframeTransport.sendAction('CREATE_CALL_LINK', {



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



            window.__CallsCoreShared.MediaManager.addListener(listener);



        },



        



        removeMediaListener: function(listener) {



            window.__CallsCoreShared.MediaManager.removeListener(listener);



        },



        



        addWebRTCListener: function(listener) {



            window.__CallsCoreShared.WebRTCManager.addListener(listener);



        },



        



        removeWebRTCListener: function(listener) {



            window.__CallsCoreShared.WebRTCManager.removeListener(listener);



        },



        



        setRecoveryMode: function(mode) {



            window.__CallsCoreShared.callsState.recoveryMode = mode;



        },



        



        verifyBeforeCall: function() {



            return window.__CallsCoreShared.CallsStateGovernor.verifySession(true);



        },



        



        getPipelineStatus: function() {



            return window.__CallsCoreShared.SessionPipeline ? window.__CallsCoreShared.SessionPipeline.getStatus() : null;



        },



        



        getDiagnostics: function() {



            return window.__CallsCoreShared.DiagnosticsAgent.getReport();



        },



        



        StateGovernor: window.__CallsCoreShared.StateGovernor,



        V5StateGovernor: window.__CallsCoreShared.V5StateGovernor,



        CallsStateGovernor: window.__CallsCoreShared.CallsStateGovernor,



        



        sendToParent: function(type, payload, options) {



            if (!window.__CallsCoreShared.assertActive('sendToParent')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            return window.__CallsCoreShared.safeSend(type, payload, options?.requireAck || false);



        },



        



        sendAction: function(action, payload) {



            if (!window.__CallsCoreShared.assertActive('sendAction')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            return window.__CallsCoreShared.IframeTransport.sendAction(action, payload);



        },



        



        initCall: function(callType, participants) {



            return window.__CallsCoreShared.CallsStateGovernor.initiateCall(callType, participants);



        },



        



        cleanup: function() {



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE_NAME, 'Cleaning up call core');



            



            window.__CallsCoreShared.resetCallState();



            window.__CallsCoreShared.MediaManager.stopLocalStream();



            window.__CallsCoreShared.WebRTCManager.close();



            window.__CallsCoreShared.IframeTransport.cleanup();



            window.__CallsCoreShared.IframeSessionClient.cleanup();



            window.__CallsCoreShared.RecoveryManager.cancelRecovery();



            window.__CallsCoreShared.UIBridge.cleanup();



            window.__CallsCoreShared.StorageProxy.cleanup();



            window.__CallsCoreShared.MessageGuard.cleanup();



            



            window.__CallsCoreShared.messageQueue.length = 0;



            



            window.__CallsCoreShared.resetCallState();



            



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



            return window.__CallsCoreShared.parentReady;



        },



        



        getQueuedMessages: function() {



            return [...window.__CallsCoreShared.messageQueue];



        },



        



        flushQueue: function() {



            window.__CallsCoreShared.flushQueue();



        },



        



        MessageRegistry: window.__CallsCoreShared.MessageRegistry,



        IframeTransport: window.__CallsCoreShared.IframeTransport,



        OriginSecurity: window.__CallsCoreShared.OriginSecurity,



        SafeStorage: window.__CallsCoreShared.SafeStorage,



        PermissionManager: window.__CallsCoreShared.PermissionManager,



        WebRTCManager: window.__CallsCoreShared.WebRTCManager,



        MediaManager: window.__CallsCoreShared.MediaManager,



        CallsStateGovernor: window.__CallsCoreShared.CallsStateGovernor,



        SessionClient: window.__CallsCoreShared.IframeSessionClient,



        NavigationGuard: window.__CallsCoreShared.NavigationGuard,



        ReliabilityEngine: window.__CallsCoreShared.ReliabilityEngine,



        RecoveryManager: window.__CallsCoreShared.RecoveryManager,



        CompatibilityBridge: window.__CallsCoreShared.CompatibilityBridge,



        DiagnosticsAgent: window.__CallsCoreShared.DiagnosticsAgent,



        MultiModuleCoordinator: window.__CallsCoreShared.MultiModuleCoordinator,



        UIFailsafe: window.__CallsCoreShared.UIFailsafe,



        LifecycleController: window.__CallsCoreShared.LifecycleController,



        SessionPipeline: window.__CallsCoreShared.SessionPipeline,



        UIBridge: window.__CallsCoreShared.UIBridge,



        StorageProxy: window.__CallsCoreShared.StorageProxy,



        MessageGuard: window.__CallsCoreShared.MessageGuard,



        SessionClientLegacy: window.__CallsCoreShared.SessionClient,



        



        // Additional utility methods



        isInCall: function() {



            return window.__CallsCoreShared.callsState.callActive && window.__CallsCoreShared.callsState.callState === 'connected';



        },



        



        getCallDuration: function() {



            if (!window.__CallsCoreShared.callsState.callStartTime) return 0;



            return Math.floor((Date.now() - window.__CallsCoreShared.callsState.callStartTime) / 1000);



        },



        



        getActiveCallId: function() {



            return window.__CallsCoreShared.callsState.activeCallId;



        },



        



        getCallParticipants: function() {



            return [...window.__CallsCoreShared.callsState.callParticipants];



        },



        



        // API request helper



        apiRequest: function(endpoint, method = 'GET', data = null, options = {}) {



            return window.__CallsCoreShared.sendApiRequest(endpoint, method, data, options);



        },



        



        // Endpoint normalization helper



        normalizeEndpoint: function(endpoint) {



            return window.__CallsCoreShared.normalizeEndpoint(endpoint);



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



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'ModuleCoreController starting initialization sequence');



                



                window.__CallsCoreShared.OriginSecurity.initialize();



                this._notifyListeners('security_initialized', {});



                



                window.__CallsCoreShared.IframeTransport.initialize();



                this._notifyListeners('connection_initialized', {});



                



                window.__CallsCoreShared.MessageRegistry.initialize();



                this._notifyListeners('dispatcher_initialized', {});



                



                window.__CallsCoreShared.ReliabilityEngine.initialize();



                this._notifyListeners('reliability_initialized', {});



                



                window.__CallsCoreShared.IframeSessionClient.initialize();



                this._notifyListeners('session_initialized', {});



                



                window.__CallsCoreShared.UIBridge.initialize();



                this._notifyListeners('ui_initialized', {});



                



                window.__CallsCoreShared.LifecycleController.initialize();



                this._notifyListeners('lifecycle_initialized', {});



                



                this._initialized = true;



                window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'ModuleCoreController initialization complete');



                



                return { success: true };



                



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'ModuleCoreController initialization failed', error);



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
    window.callCore.handleRemoteOffer  = function(payload) { window.__CallsCoreShared.handleSignalOffer(payload);  };
    window.callCore.handleRemoteAnswer = function(payload) { window.__CallsCoreShared.handleSignalAnswer(payload); };
    window.callCore.resolveCallId = window.__CallsCoreShared.resolveCallId;
    window.callCore.handleIceCandidate = window.callCore.handleIceCandidate ||
                                         function(payload) { window.__CallsCoreShared.handleIceCandidate(payload); };



    



    // ==================== INITIALIZATION ====================



    function initialize() {



        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Initializing call core module');



        



        window.__CallsCoreShared.MediaManager.initialize().catch(error => {



            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Media manager initialization failed', error);



        });



        



        window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Call core module initialized');



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



            { event: 'kyn:call:incoming',   fn: (d) => window.__CallsCoreShared.handleIncomingCall(d) },



            { event: 'kyn:incoming_call',    fn: (d) => window.__CallsCoreShared.handleIncomingCall(d) },



            { event: 'kyn:call_incoming',    fn: (d) => window.__CallsCoreShared.handleIncomingCall(d) },



            { event: 'kyn:call:initiated',   fn: (d) => window.__CallsCoreShared.handleCallInitiated(d) },



            { event: 'kyn:call_initiated',   fn: (d) => window.__CallsCoreShared.handleCallInitiated(d) },



            // accepted / started / connected



            { event: 'kyn:call:accepted',    fn: (d) => window.__CallsCoreShared.handleCallAccepted(d) },



            { event: 'kyn:call_accepted',    fn: (d) => window.__CallsCoreShared.handleCallAccepted(d) },



            { event: 'kyn:call_answered',    fn: (d) => window.__CallsCoreShared.handleCallAccepted(d) },



            { event: 'kyn:call:started',     fn: (d) => window.__CallsCoreShared.handleCallStarted(d) },



            { event: 'kyn:call:connected',   fn: (d) => window.__CallsCoreShared.handleCallConnected(d) },



            // rejected / cancelled / ended



            { event: 'kyn:call:rejected',    fn: (d) => window.__CallsCoreShared.handleCallRejected(d) },



            { event: 'kyn:call_rejected',    fn: (d) => window.__CallsCoreShared.handleCallRejected(d) },

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
                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'call:initiate rejected by server', d);
                window.__CallsCoreShared.handleCallFailed({ ...d, reason: (d && d.code) || 'call_error' });
                window.__CallsCoreShared.notifyListeners('call_error', d);
            }},

            { event: 'kyn:call:dedup_rejected', fn: (d) => {
                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'call:initiate rate-limited by server', d);
                window.__CallsCoreShared.handleCallRejected({ ...d, reason: 'rate_limited' });
                window.__CallsCoreShared.notifyListeners('call_dedup_rejected', d);
            }},

            // FEAT-01 FIX: call:busy was dispatched by server but had no
            // registered CustomEvent listener, so handleCallBusy was only
            // reachable via postMessage (not the WebSocket path). Register it
            // here so the outgoing call UI resets immediately on busy signal.
            { event: 'kyn:call:busy',      fn: (d) => window.__CallsCoreShared.handleCallBusy(d) },
            { event: 'kyn:call_busy',      fn: (d) => window.__CallsCoreShared.handleCallBusy(d) },
            // FEAT-01: call:waiting lets the callee UI show "Tap to switch" banner
            { event: 'kyn:call:waiting',   fn: (d) => { window.__CallsCoreShared.notifyListeners('call_waiting', d); } },
            { event: 'kyn:call_waiting',   fn: (d) => { window.__CallsCoreShared.notifyListeners('call_waiting', d); } },

            // FEAT-02 FIX: this device is a second logged-in device. The user
            // accepted the call on their other device. Dismiss the incoming
            // call ring UI here without doing anything else (the other device
            // owns the actual WebRTC session).
            { event: 'kyn:call:accepted_elsewhere', fn: (d) => {
                window.__CallsCoreShared.logInfo && window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Call accepted on another device — dismissing ring', d);
                const _callId = d && d.callId;
                // Use handleCallRejected to reset the incoming call UI cleanly
                // (it clears the ringing overlay, stops ringtone, resets state)
                // but we pass reason='accepted_elsewhere' so the UX copy differs.
                window.__CallsCoreShared.handleCallRejected({ ...d, reason: 'accepted_elsewhere' });
                window.__CallsCoreShared.notifyListeners('call_accepted_elsewhere', d);
            }},



            { event: 'kyn:call:cancelled',   fn: (d) => window.__CallsCoreShared.handleCallEnded(d) },



            { event: 'kyn:call_cancelled',   fn: (d) => window.__CallsCoreShared.handleCallEnded(d) },



            { event: 'kyn:call:ended',       fn: (d) => window.__CallsCoreShared.handleCallEnded(d) },



            { event: 'kyn:call_ended',       fn: (d) => window.__CallsCoreShared.handleCallEnded(d) },



            // FIX-GROUP-HOST-ONLY-END: when the host ends a group call for everyone,
            // GroupCallEngine tears down the mesh/media, but the visible call screen
            // and bottom-nav restore still go through the same handleCallEnded() path
            // as every other call-ended reason — otherwise non-host participants would
            // be left on a dark call screen even though their media was already released.
            { event: 'kyn:group:call:ended_by_host', fn: (d) => window.__CallsCoreShared.handleCallEnded({ ...d, reason: 'host_ended' }) },

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



            { event: 'kyn:call_force_ended', fn: (d) => window.__CallsCoreShared.handleCallEnded(d) },



            // failed



            { event: 'kyn:call:failed',      fn: (d) => window.__CallsCoreShared.handleCallFailed(d) },



        ];







        CALL_EVENT_MAP.forEach(({ event, fn }) => {



            window.addEventListener(event, function (evt) {



                if (!evt.detail) return;



                console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 📞 DOM bridge event [${event}]`, evt.detail);



                try { fn(evt.detail); } catch (e) {



                    console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Call event bridge error (${event}):`, e.message);



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
                        var _resyncCallId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.localCallId;
                        if (_resyncCallId && window.__CallsCoreShared.callsState.callActive) {
                            window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Reconnected mid-call — requesting state resync', _resyncCallId);
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
                        if (typeof window.__CallsCoreShared._isStaleCallEvent === 'function' && window.__CallsCoreShared._isStaleCallEvent(resp)) return;

                        var roomActive = resp.roomState && resp.roomState.active;
                        if (!roomActive) {
                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'call:resync_response — server reports call no longer active, force-ending locally', resp.callId);
                            window.__CallsCoreShared.handleCallForceEnd({ callId: resp.callId, reason: 'resync_call_ended' });
                            return;
                        }

                        var myId = window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId;
                        var stillParticipant = !myId || !Array.isArray(resp.participants)
                            || resp.participants.some(function(p) { return String(p && (p.userId || p.id || p)) === String(myId); });
                        if (!stillParticipant) {
                            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'call:resync_response — server no longer lists us as a participant, force-ending locally', resp.callId);
                            window.__CallsCoreShared.handleCallForceEnd({ callId: resp.callId, reason: 'resync_removed' });
                            return;
                        }

                        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'call:resync_response — state confirmed consistent', resp.callId);
                    } catch (_) {}
                });
            }







            const RT_MAP = [



                ['call:incoming',  (p) => window.__CallsCoreShared.handleIncomingCall(p)],



                ['incoming_call',  (p) => window.__CallsCoreShared.handleIncomingCall(p)],



                ['call:initiated', (p) => window.__CallsCoreShared.handleCallInitiated(p)],



                ['call:accepted',  (p) => window.__CallsCoreShared.handleCallAccepted(p)],



                ['call_accepted',  (p) => window.__CallsCoreShared.handleCallAccepted(p)],



                ['call_answered',  (p) => window.__CallsCoreShared.handleCallAccepted(p)],



                ['call:started',   (p) => window.__CallsCoreShared.handleCallStarted(p)],



                ['call:connected', (p) => window.__CallsCoreShared.handleCallConnected(p)],



                ['call:rejected',  (p) => window.__CallsCoreShared.handleCallRejected(p)],



                ['call_rejected',  (p) => window.__CallsCoreShared.handleCallRejected(p)],



                ['call:ended',     (p) => window.__CallsCoreShared.handleCallEnded(p)],



                ['call_ended',     (p) => window.__CallsCoreShared.handleCallEnded(p)],



                ['call_force_ended',(p) => window.__CallsCoreShared.handleCallEnded(p)],



                ['call_cancelled', (p) => window.__CallsCoreShared.handleCallEnded(p)],



                ['call:failed',    (p) => window.__CallsCoreShared.handleCallFailed(p)],

                // FIX-CALL-ACK: New signaling events from patched backend
                ['call:no_answer',      (p) => {
                    console.warn('[CallsCore] 📵 call:no_answer — user did not answer', p);
                    if (typeof window.__CallsCoreShared.handleCallFailed === 'function') window.__CallsCoreShared.handleCallFailed({ ...p, reason: 'no_answer' });
                    else if (typeof window.__CallsCoreShared.resetCallState === 'function') window.__CallsCoreShared.resetCallState();
                }],
                ['call:receiver_offline', (p) => {
                    console.warn('[CallsCore] 📵 call:receiver_offline', p);
                    if (typeof window.__CallsCoreShared.handleCallFailed === 'function') window.__CallsCoreShared.handleCallFailed({ ...p, reason: 'receiver_offline' });
                    else if (typeof window.__CallsCoreShared.resetCallState === 'function') window.__CallsCoreShared.resetCallState();
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
                    else if (typeof window.__CallsCoreShared.handleSignalOffer === 'function') window.__CallsCoreShared.handleSignalOffer(p);
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
                    window.__CallsCoreShared.handleCallAcceptedElsewhere(p);
                }],
                ['call:busy', (p) => {
                    console.warn('[CallsCore] 📵 call:busy — target is in another call', p);
                    if (typeof window.__CallsCoreShared.handleCallFailed === 'function') window.__CallsCoreShared.handleCallFailed({ ...p, reason: 'busy' });
                    else if (typeof window.__CallsCoreShared.resetCallState === 'function') window.__CallsCoreShared.resetCallState();
                }],
                ['call:dedup_rejected', (p) => {
                    console.warn('[CallsCore] 📵 call:dedup_rejected — rate limited', p);
                    if (typeof window.__CallsCoreShared.handleCallFailed === 'function') window.__CallsCoreShared.handleCallFailed({ ...p, reason: 'rate_limited' });
                    else if (typeof window.__CallsCoreShared.resetCallState === 'function') window.__CallsCoreShared.resetCallState();
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

                    console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 📞 KynectaRealtime event [${evtName}]`, payload);

                    try { handler(payload); } catch (e) {

                        console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] KynectaRealtime call handler error (${evtName}):`, e.message);

                    }

                };

                rt.__callsCoreRtHandlers.set(evtName, wrapped);
                rt.on(evtName, wrapped);

            });



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}] ✅ Bound to KynectaRealtime call events`);



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
            var token = (e.detail && e.detail.token) || (window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.token) || null;
            _prefetchIceConfig(token);
        });
        var _existingToken = (window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.token) || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token);
        if (_existingToken) setTimeout(function() { _prefetchIceConfig(_existingToken); }, 2000);







        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] ✅ Call event DOM bridge installed`);



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



    



    window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Call core module loaded');



    

})();
