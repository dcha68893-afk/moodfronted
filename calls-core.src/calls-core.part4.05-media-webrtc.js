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



                logInfo(MODULE, 'ICE candidate added');



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







