/**
 * PART 2/3 — CORE INTEGRATION BRIDGE & EVENTS
 * The bridge that talks to calls-core.js (window.callCore/CallHandlers), the responsive engine, the event system, button bindings, UI event handlers, and the fixed call methods (answer/decline/hangup/mute etc.) that other modules trigger mid-call.
 *
 * SOURCE FRAGMENT of calls-ui.js (shares one scope with the other 2 parts).
 * Concatenate in numeric order (part0, part1, part2) via build.js before serving.
 * Do NOT <script src> this file on its own.
 */
    // ==================== CORE INTEGRATION BRIDGE ====================
    const CoreIntegration = {
        _subscriptions: new Set(),
        _initialized: false,
        
        subscribeToCore: function() {
            if (this._initialized) {
                if (DEBUG) {
                    logOnce('info', 'Core integration already initialized');
                }
                return;
            }
            
            if (DEBUG) {
                logOnce('info', 'Subscribing to core events');
            }
            
            if (coreInstance && coreInstance.addListener) {
                coreInstance.addListener(this.handleCoreEvent.bind(this));
                this._subscriptions.add('coreListener');
            }
            
            if (coreInstance && coreInstance.addMediaListener) {
                coreInstance.addMediaListener(this.handleMediaEvent.bind(this));
                this._subscriptions.add('mediaListener');
            }
            
            if (coreInstance && coreInstance.addWebRTCListener) {
                coreInstance.addWebRTCListener(this.handleWebRTCEvent.bind(this));
                this._subscriptions.add('webrtcListener');
            }
            
            this.setupParentMessageHandler();
            
            this.observeAppState();
            
            // Update initial state from core if available
            this.updateStateFromCore();
            
            this._initialized = true;
        },
        
        updateStateFromCore: function() {
            if (!coreInstance) return;
            
            if (coreInstance.getState) {
                const state = coreInstance.getState();
                if (state) {
                    parentReady = state.parentReady || false;
                    sessionReady = state.sessionStatus === 'valid';
                    handshakeComplete = state.registered && state.sessionReceived;
                    fallbackModeActive = state.degraded || false;
                    inPassiveMode = state.inPassiveMode || false;
                    coreLifecycleState = state.lifecycleState || coreInstance.getLifecycleState?.() || 'UNKNOWN';
                    
                    // Update session cache
                    if (state.session && state.session.token && state.session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = state.session.token;
                        window.__CHILD_SESSION__.userId = state.session.userId;
                        window.__CHILD_SESSION__.expires = state.session.expiresAt;
                        _sessionInvalid = false;
                    } else if (state.session && !state.session.authenticated) {
                        _sessionInvalid = true;
                    }
                    
                    // Update UI preferences from core
                    if (state.currentMood) UIState.selectedMood = state.currentMood;
                    if (state.currentIntention) UIState.selectedIntention = state.currentIntention;
                    if (state.currentFocusMode !== undefined) UIState.currentFocusMode = state.currentFocusMode;
                    
                    // Update call state from core
                    UIState.callActive = !!state.callActive;
                    UIState.activeCallId = state.activeCallId;
                    UIState.callType = state.callType;
                    setCallParticipants(state.callParticipants || [], { merge: false });
                    UIState.callStartTime = state.callStartTime;
                    if (!state.callActive && (!state.callState || state.callState === 'idle')) {
                        UIState.activeCallId = null;
                        UIState.callParticipants = [];
                        syncParticipantBadge();
                        UIState.callStartTime = null;
                    }
                    
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                }
            }
            
            if (coreInstance.getLifecycleState) {
                const lifecycleState = coreInstance.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE') {
                    parentReady = true;
                }
                if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                    RenderingPipeline.updateSyncIndicator();
                }
            }
            
            if (coreInstance.isInPassiveMode) {
                inPassiveMode = coreInstance.isInPassiveMode();
                if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                    RenderingPipeline.updateSyncIndicator();
                }
            }
            
            if (coreInstance.getParentReady) {
                parentReady = coreInstance.getParentReady();
            }
            
            // Get session directly
            if (coreInstance.getSession) {
                const session = coreInstance.getSession();
                if (session && session.token && session.authenticated !== false) {
                    window.__CHILD_SESSION__.token = session.token;
                    window.__CHILD_SESSION__.userId = session.userId;
                    window.__CHILD_SESSION__.expires = session.expiresAt;
                    sessionReady = true;
                    _sessionInvalid = false;
                } else if (session && !session.authenticated) {
                    _sessionInvalid = true;
                }
            }
        },
        
        handleCoreEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `Core event: ${event}`, data);
            }
            
            switch (event) {
                case 'session_update':
                case 'session_valid':
                case 'session_updated':
                    sessionReady = true;
                    _sessionInvalid = false;
                    if (data && data.token) {
                        window.__CHILD_SESSION__.token = data.token;
                        window.__CHILD_SESSION__.userId = data.userId;
                        window.__CHILD_SESSION__.expires = data.expiresAt;
                    }
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    // Try to process any pending call
                    attemptPendingCall();
                    break;
                case 'session_invalid':
                    sessionReady = false;
                    _sessionInvalid = true;
                    window.__CHILD_SESSION__.token = null;
                    window.__CHILD_SESSION__.userId = null;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    break;
                case 'incoming_call':
                    this.handleIncomingCall(data);
                    break;

                case 'call_initiated':
                case 'CALL_INITIATED':
                    console.log('[Calls UI] Call initiated, keeping calling screen', data);
                    this.handleCallInitiated(data || {});
                    break;
                case 'call_initiation_failed':
                    // Offline fix: When receiver is offline, show call UI for 3 minutes instead of ending
                    if (data && data.offline) {
                        // Show call UI even though receiver is offline
                        this.handleCallInitiated({
                            callId: data.callId,
                            callType: 'audio',
                            receiverOnline: false,
                            participants: data.participants || [],
                            calleeName: data.calleeName,
                            offline: true
                        });
                        showNotification('User is offline. Call will display for 3 minutes.', 'info');
                    } else {
                        // For other failures, end the call
                        this.handleCallEnded(data);
                        showNotification(data && data.error ? data.error : 'Failed to start call', 'error');
                    }
                    break;
                case 'call_accepted':
                    // Receiver answered — now start the timer
                    this.handleCallAccepted(data);
                    break;
                case 'call_initiated_ack':
                    // Server assigned the call its real id — adopt it so
                    // later end/accept/signal events (tagged with this real
                    // id) aren't rejected as "mismatched" against whatever
                    // locally-generated id we started with.
                    if (data && data.callId) {
                        UIState.activeCallId = data.callId;
                        // FIX-CALLID-RECONCILE-OVERLAY: CallOverlayManager
                        // keeps its own private copy of the call id
                        // (_callInfo.callId), captured once when the overlay
                        // opened. It's a separate closure from this handler,
                        // so setting UIState.activeCallId above never reached
                        // it — the overlay's own mismatched-callId guard kept
                        // reading the stale local id and rejecting the real
                        // CALL_ENDED/CALL_REJECTED signal for this call.
                        if (window.CallOverlayManager && typeof window.CallOverlayManager.reconcileCallId === 'function') {
                            window.CallOverlayManager.reconcileCallId(data.callId);
                        }
                        if (data.calleeName) {
                            const nameEl = document.getElementById('callerName') || document.getElementById('outgoingCallName') || document.querySelector('.call-name');
                            if (nameEl && (!nameEl.textContent || nameEl.textContent.trim() === 'User')) {
                                nameEl.textContent = data.calleeName;
                            }
                        }
                    }
                    break;
                case 'call_started':
                    this.handleCallStarted(data);
                    break;
                case 'call_connected':
                    this.handleCallConnected(data);
                    break;
                case 'call_participant_joined':
                    this.handleParticipantJoined(data);
                    break;
                case 'call_participant_left':
                    this.handleParticipantLeft(data);
                    break;
                case 'call_ended':
                case 'call_rejected':
                case 'call_failed':
                    this.handleCallEnded(data);
                    // FIX for Bug 6: Refresh call history after call ends
                    this.refreshCallHistory();
                    break;
                case 'call_error':
                    // FIX: server-side call:error (e.g. whoCanCallMe privacy rejection)
                    // reached this far and reset the UI via the call_failed path above,
                    // but the caller never saw WHY — no toast was shown for this event.
                    showNotification(
                        (data && data.message) || 'This call could not be completed',
                        'error'
                    );
                    break;
                case 'call_timeout':
                    // CRITICAL: 3-min ring timer must NOT end an already-accepted call.
                    // Once receiver accepts, in-call screen is active — skip the reset.
                    if (UIState.callState === 'connected' ||
                        (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active'))) {
                        console.warn('[Calls UI] call_timeout ignored — already in-call (receiver accepted)');
                        break;
                    }
                    this.handleCallEnded(data);
                    this.refreshCallHistory();
                    break;
                case 'call_force_ended':
                    // Skip reset if we're already in-call (stale WS echo after accept)
                    if ((UIState.callState === 'connected' ||
                        (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active'))) &&
                        window.__callAcceptedHandled &&
                        (Date.now() - window.__callAcceptedHandled) < 5000) {
                        console.warn('[Calls UI] call_force_ended core event ignored — already in-call');
                        // Only stop ringtones
                        if (window._incomingRingtone) { try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {} window._incomingRingtone = null; }
                        if (window._callerRingtone)   { try { window._callerRingtone.pause();   window._callerRingtone.currentTime   = 0; } catch(e) {} window._callerRingtone   = null; }
                        break;
                    }
                    this.handleCallEnded(data);
                    this.refreshCallHistory();
                    break;
                case 'call_cancelled':
                    if (typeof window._stopRingtones === 'function') window._stopRingtones();
                    if (typeof window._stopAllRingtones === 'function') window._stopAllRingtones();
                    if (window._incomingRingtone) { try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {} window._incomingRingtone = null; }
                    if (elements.incomingCallModal) { const _ct = parseInt(elements.incomingCallModal.dataset.timer); if (_ct) clearInterval(_ct); elements.incomingCallModal.dataset.timer = ''; elements.incomingCallModal.classList.remove('active'); elements.incomingCallModal.style.setProperty('display','none','important'); UIState.activeModals.delete('incomingCallModal'); }
                    window._currentIncomingCallId = null; UIState.callState = 'idle'; UIState.callActive = false; window.__callActive = false;
                    if (window.parent && window.parent !== window) { window.__callEndedNavigating = true; setTimeout(function(){window.__callEndedNavigating=false;},3000); window.parent.postMessage({type:'CALL_ENDED_RETURN',timestamp:Date.now()},'*'); const _cr=window.__callOriginReturnTo||window.__pendingCallReturnTo||'messages'; setTimeout(function(){if(window.parent&&window.parent!==window)window.parent.postMessage({type:'SWITCH_MODULE',module:_cr,payload:{returnFromCall:true},timestamp:Date.now()},'*');},350); }
                    this.handleCallEnded(data);
                    this.refreshCallHistory();
                    showNotification('Call was cancelled by the caller', 'info');
                    break;
                case 'logout':
                    this.handleLogout();
                    break;
                case 'mood_updated':
                    if (data && data.mood) {
                        UIState.selectedMood = data.mood;
                        if (elements.callMoodIndicator) {
                            elements.callMoodIndicator.dataset.mood = data.mood;
                        }
                    }
                    break;
                case 'intention_updated':
                    if (data && data.intention) {
                        UIState.selectedIntention = data.intention;
                        if (elements.callIntentionIndicator) {
                            elements.callIntentionIndicator.dataset.intention = data.intention;
                        }
                    }
                    break;
                case 'focus_mode_toggled':
                    if (data && data.enabled !== undefined) {
                        UIState.currentFocusMode = data.enabled;
                        if (elements.focusModeBtn) {
                            if (data.enabled) {
                                elements.focusModeBtn.classList.add('active');
                            } else {
                                elements.focusModeBtn.classList.remove('active');
                            }
                        }
                        if (elements.appContainer) {
                            if (data.enabled) {
                                elements.appContainer.classList.add('focus-mode');
                            } else {
                                elements.appContainer.classList.remove('focus-mode');
                            }
                        }
                    }
                    break;
                case 'remote_stream_added':
                    this.handleRemoteStreamAdded(data);
                    break;
                case 'remote_stream_removed':
                    this.handleRemoteStreamRemoved(data);
                    break;
                case 'degraded_mode':
                    fallbackModeActive = true;
                    this.handleDegradedMode();
                    break;
                case 'passive_mode_entered':
                    inPassiveMode = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    break;
                case 'parent_ready':
                    parentReady = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    attemptPendingCall();
                    break;
                case 'session_sync':
                    sessionReady = true;
                    _sessionInvalid = false;
                    if (data && data.token) {
                        window.__CHILD_SESSION__.token = data.token;
                        window.__CHILD_SESSION__.userId = data.userId;
                        window.__CHILD_SESSION__.expires = data.expiresAt;
                    }
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    attemptPendingCall();
                    break;
                case 'auth_error':
                case 'unauthorized':
                    this.handleAuthError();
                    break;
                case 'state':
                    // Handle core state changes
                    if (data && data.newState) {
                        if (data.newState === 'ACTIVE') {
                            parentReady = true;
                            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                                RenderingPipeline.updateSyncIndicator();
                            }
                            attemptPendingCall();
                        }
                        coreLifecycleState = data.newState;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                    }
                    break;
                case 'module_state_change':
                    if (data && data.to) {
                        coreLifecycleState = data.to;
                        if (data.to === 'ACTIVE') {
                            attemptPendingCall();
                        }
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                    }
                    break;
                case 'call_ready':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Ready';
                    }
                    break;
                case 'call_connecting':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connecting...';
                    }
                    break;
                case 'call_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connected';
                    }
                    break;
                case 'call_blocked':
                    if (data && data.reason === 'call_active') {
                        const liveCall = (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) ||
                            UIState.callActive === true ||
                            ['connected', 'connecting', 'ongoing', 'active', 'in_call', 'initiating', 'ringing'].includes(UIState.callState);
                        if (liveCall) {
                            showNotification('You are already in a call', 'warning');
                        } else {
                            console.warn('[Calls UI] Suppressed stale call_active warning');
                        }
                    }
                    break;
                case 'contacts_update':
                    if (data && Array.isArray(data.contacts)) {
                        RenderingPipeline.renderContactsList(data.contacts);
                    } else if (data && Array.isArray(data)) {
                        RenderingPipeline.renderContactsList(data);
                    }
                    break;
                case 'call_history_update':
                    if (typeof displayCallHistory === 'function') {
                        displayCallHistory(data.calls || data.data?.calls || []);
                    }
                    break;
            }
        },
        
        // FIX for Bug 6: Refresh call history after call ends
        refreshCallHistory: function() {
            if (DEBUG) {
                logOnce('info', 'Refreshing call history after call ended');
            }
            
            // Emit global update event
            GlobalCallHistory.emitUpdate('call_ended', { reason: 'call_completed' });
            
            setTimeout(() => {
                if (typeof loadCallHistory === 'function') {
                    loadCallHistory().then(() => {
                        console.log('[Calls UI] Call history refreshed after call ended');
                        // Emit success event
                        GlobalCallHistory.emitUpdate('history_refreshed', { source: 'local_refresh' });
                    }).catch(err => {
                        console.error('[Calls UI] Failed to refresh call history:', err);
                        // Emit error event
                        GlobalCallHistory.emitUpdate('history_refresh_error', { error: err.message });
                    });
                }
            }, 500);
            
            // Refresh the calls list in UI if it exists
            if (elements.allCallsList) {
                this.refreshCallsList();
            }
        },
        
        refreshCallsList: function() {
            // Trigger a refresh of the calls list
            if (elements.allCallsSection && elements.allCallsSection.classList.contains('active')) {
                UIEventHandlers.switchCallCategory(UIState.currentCallCategory);
            }
        },
        
        handleMediaEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `Media event: ${event}`);
            }
            
            switch (event) {
                case 'local_stream_ready':
                    UIState.localStream = data.stream;
                    // Attach local stream to local video element immediately
                    (function attachLocalVideo(stream) {
                        // Always explicitly set #pipVideo first (the in-call PiP element)
                        const pipVideo = document.getElementById('pipVideo');
                        const pipContainer = document.getElementById('pipContainer');
                        const hasVideoTracks = stream && stream.getVideoTracks().length > 0;

                        if (pipVideo && stream) {
                            pipVideo.srcObject   = stream;
                            pipVideo.muted       = true;
                            pipVideo.autoplay    = true;
                            pipVideo.playsInline = true;
                            pipVideo.play().catch(() => {});
                        }
                        // Show pip container whenever there are video tracks (covers upgrade scenario too)
                        if (pipContainer && hasVideoTracks) {
                            pipContainer.style.display = 'block';
                        }

                        // Also set on any other local video element (video grid, calling overlay preview)
                        const localVid = document.getElementById('localVideo')
                            || document.getElementById('selfVideo')
                            || document.querySelector('.local-video video');
                        if (localVid && localVid !== pipVideo && stream) {
                            localVid.srcObject   = stream;
                            localVid.muted       = true;
                            localVid.autoplay    = true;
                            localVid.playsInline = true;
                            localVid.play().catch(() => {});
                        }
                        // If no dedicated local video element, add one to videoGrid
                        if (!localVid && stream && elements.videoGrid) {
                            const hasLocalContainer = document.getElementById('localVideoContainer');
                            if (!hasLocalContainer) {
                                const container = document.createElement('div');
                                container.id = 'localVideoContainer';
                                container.className = 'video-container local-video-container';
                                container.style.cssText = 'position:relative;';
                                const video = document.createElement('video');
                                video.id = 'localVideo';
                                video.className = 'video-element';
                                video.autoplay = true;
                                video.playsInline = true;
                                video.muted = true;
                                video.srcObject = stream;
                                const overlay = document.createElement('div');
                                overlay.className = 'video-overlay';
                                overlay.innerHTML = '<div class="video-name"><span>You</span></div>';
                                container.appendChild(video);
                                container.appendChild(overlay);
                                elements.videoGrid.appendChild(container);
                                video.play().catch(() => {});
                            }
                        }
                        // Hide placeholder once we have a stream
                        const placeholder = document.getElementById('offlineCallPlaceholder');
                        if (placeholder) placeholder.style.display = 'none';
                    })(data.stream);
                    break;
                case 'local_stream_stopped':
                    UIState.localStream = null;
                    break;
                case 'mic_toggled':
                    UIState.isMuted = !data.enabled;
                    if (elements.muteBtn) {
                        const icon = elements.muteBtn.querySelector('i');
                        if (icon) {
                            icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                        }
                    }
                    break;
                case 'camera_toggled':
                    UIState.isVideoOff = !data.enabled;
                    if (elements.videoBtn) {
                        const icon = elements.videoBtn.querySelector('i');
                        if (icon) {
                            icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                        }
                    }
                    break;
                case 'camera_switched':
                    if (data && data.facingMode && elements.videoBtn) {
                        elements.videoBtn.title = `Camera (${data.facingMode})`;
                    }
                    break;
                case 'screen_share_started':
                    UIState.isScreenSharing = true;
                    if (elements.screenShareBtn) {
                        elements.screenShareBtn.classList.add('active');
                    }
                    break;
                case 'screen_share_ended':
                    UIState.isScreenSharing = false;
                    if (elements.screenShareBtn) {
                        elements.screenShareBtn.classList.remove('active');
                    }
                    break;
                case 'stream_error':
                    showNotification(data.error || 'Media error', 'error');
                    break;
            }
        },
        
        handleWebRTCEvent: function(event, data) {
            if (DEBUG) {
                logOnce('info', `WebRTC event: ${event}`);
            }
            
            switch (event) {
                case 'remote_stream_added':
                    if (data && data.stream) {
                        const streamId = data.stream.id;
                        UIState.remoteStreams.set(streamId, data.stream);
                        this.addRemoteVideo(streamId, data.stream);
                    }
                    break;
                case 'remote_stream_removed':
                    if (data && data.streamId) {
                        UIState.remoteStreams.delete(data.streamId);
                        const videoEl = document.querySelector(`.video-container[data-stream-id="${data.streamId}"]`);
                        if (videoEl) videoEl.remove();
                    }
                    break;
                case 'ice_state':
                    if (data && data.state === 'failed') {
                        showNotification('Connection unstable, reconnecting...', 'warning');
                    } else if (data && data.state === 'connected') {
                        if (elements.callStatusText) {
                            elements.callStatusText.textContent = 'Connected';
                        }
                    }
                    break;
                case 'ice_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'Connected';
                    }
                    break;
                case 'call_connected':
                    if (elements.callStatusText) {
                        elements.callStatusText.textContent = 'In call';
                    }
                    break;
                case 'data_message':
                    if (data && data.type === 'chat' && data.message) {
                        this.addChatMessage(data.sender, data.message, data.timestamp);
                    }
                    break;
                case 'call_failed':
                    if (data && data.reason === 'ice_failed') {
                        showNotification('Call connection failed', 'error');
                    } else if (data && data.reason === 'connection_failed') {
                        showNotification('Connection failed', 'error');
                    } else if (data && data.message) {
                        // FIX: server-side call:error (e.g. whoCanCallMe privacy
                        // rejection) arrives here with reason set to the server's
                        // error code and no matching branch above — fall back to
                        // showing whatever message the server sent rather than
                        // silently doing nothing.
                        showNotification(data.message, 'error');
                    }
                    break;
                case 'call_error':
                    showNotification(
                        (data && data.message) || 'This call could not be completed',
                        'error'
                    );
                    break;
                case 'call_timeout':
                    showNotification('Call connection timeout', 'error');
                    break;
            }
        },
        
        addRemoteVideo: function(streamId, stream, participantName) {
            if (!elements.videoGrid) return;
            
            // Remove existing container for this stream if any
            const existingContainer = document.querySelector(`.video-container[data-stream-id="${streamId}"]`);
            if (existingContainer) existingContainer.remove();

            // Also remove any stale dedicated audio element for this stream
            const existingAudio = document.getElementById('remoteAudio_' + streamId);
            if (existingAudio) existingAudio.remove();
            
            // Hide placeholder
            const placeholder = document.getElementById('offlineCallPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            
            const container = document.createElement('div');
            container.className = 'video-container remote-video-container';
            container.dataset.streamId = streamId;
            
            const hasVideoTracks = stream.getVideoTracks().filter(t => t.enabled && t.readyState === 'live').length > 0;

            if (hasVideoTracks) {
                // ── VIDEO CALL ────────────────────────────────────────────────
                const video = document.createElement('video');
                video.className = 'video-element';
                video.autoplay = true;
                video.playsInline = true;
                video.muted = false;
                video.volume = 1.0;
                video.srcObject = stream;

                const overlay = document.createElement('div');
                overlay.className = 'video-overlay';
                overlay.innerHTML = `<div class="video-name"><span>${participantName || 'Participant'}</span></div>`;

                container.appendChild(video);
                container.appendChild(overlay);
                elements.videoGrid.appendChild(container);

                const playVideo = () => video.play().catch(() => {
                    // Autoplay blocked — play muted first then unmute (browser policy workaround)
                    video.muted = true;
                    video.play().then(() => {
                        video.muted = false;
                        video.volume = 1.0;
                    }).catch(() => {});
                });
                playVideo();

            } else {
                // ── AUDIO-ONLY CALL ───────────────────────────────────────────
                // Use a real <audio> element (not a hidden <video>) — browsers
                // autoplay audio elements far more reliably than hidden videos.
                const audio = document.createElement('audio');
                audio.id = 'remoteAudio_' + streamId;
                audio.autoplay = true;
                audio.muted = false;
                audio.volume = 1.0;
                audio.srcObject = stream;
                // Keep out of DOM flow but attached so it doesn't get GC'd
                audio.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;left:-9999px;';
                document.body.appendChild(audio);

                const playAudio = () => audio.play().catch(() => {
                    // Some browsers require a user-gesture; try once more
                    const resume = () => {
                        audio.play().catch(() => {});
                        document.removeEventListener('click', resume);
                        document.removeEventListener('touchstart', resume);
                    };
                    document.addEventListener('click', resume, { once: true });
                    document.addEventListener('touchstart', resume, { once: true });
                });
                playAudio();

                // Show avatar UI in the container
                const avatar = document.createElement('div');
                avatar.className = 'video-avatar-fallback';
                avatar.style.cssText = 'width:80px;height:80px;border-radius:50%;background:var(--primary,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;margin:auto;';
                const name = participantName || 'Participant';
                avatar.textContent = name.charAt(0).toUpperCase();

                const nameLabel = document.createElement('div');
                nameLabel.style.cssText = 'text-align:center;color:#fff;margin-top:8px;font-size:14px;';
                nameLabel.textContent = name;

                // Audio indicator (animated mic icon)
                const audioIndicator = document.createElement('div');
                audioIndicator.className = 'audio-call-indicator';
                audioIndicator.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;color:#a3e635;font-size:12px;';
                audioIndicator.innerHTML = '<span style="animation:pulse 1s infinite">🔊</span> Audio Connected';

                container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;';
                container.appendChild(avatar);
                container.appendChild(nameLabel);
                container.appendChild(audioIndicator);
                elements.videoGrid.appendChild(container);
            }
            
            // Update call status text
            if (elements.callStatusText) {
                elements.callStatusText.textContent = 'Connected';
            }
        },
        
        addChatMessage: function(sender, message, timestamp) {
            const chatPanel = document.querySelector('.chat-panel .chat-messages');
            if (!chatPanel) return;
            
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message';
            msgEl.innerHTML = `
                <div class="message-sender">${SecuritySanitizer.sanitizeString(sender || 'Participant')}</div>
                <div class="message-content">${SecuritySanitizer.sanitizeString(message)}</div>
                <div class="message-time">${formatCallChatTimestamp(timestamp)}</div>
            `;
            
            chatPanel.appendChild(msgEl);
            chatPanel.scrollTop = chatPanel.scrollHeight;
        },
        
        handleIncomingCall: function(callData) {
            // Store caller name durably so transitionToInCall can use it on receiver side
            // FIX-PHASE15: Extract callerName from ALL possible payload shapes.
            const _callerRaw = callData || {};
            const _callerObj  = _callerRaw.caller || _callerRaw.callerInfo || {};
            const _callerFullName = (_callerObj.firstName
                ? (_callerObj.firstName + (_callerObj.lastName ? ' ' + _callerObj.lastName : '')).trim()
                : null);
            const _callerName = _callerRaw.callerName
                || _callerRaw.fromUserName
                || _callerRaw.userName
                || _callerRaw.name
                || _callerFullName
                || _callerObj.displayName
                || _callerObj.username
                || (_callerRaw.callerId ? ('User ' + _callerRaw.callerId) : null)
                || null;
            const incomingId = callData.callId || callData.id || null;
            const incomingType = callData.callType || callData.type || 'voice';
            const callerParticipant = {
                id: callData.callerId || callData.userId || null,
                userId: callData.callerId || callData.userId || null,
                name: _callerName || 'Caller',
                avatar: callData.callerAvatar || callData.callerPhoto || callData.callerProfilePhoto || null,
                isOnline: true
            };
            if (_callerName) {
                window.__incomingCallerName = _callerName;
                // Also persist in UIState so transitionToInCall fallbacks find it
                UIState.callData = UIState.callData || {};
                UIState.callData.callerName = _callerName;
            }
            // Store caller avatar globally so transitionToInCall can use it on receiver side
            window.__incomingCallerAvatar = (callData && (callData.callerAvatar || callData.callerPhoto || callData.callerProfilePhoto)) || null;
            UIState.callData = { ...(UIState.callData || {}), ...callData };
            UIState.callType = incomingType;
            UIState.callState = 'ringing';
            UIState.callActive = false;
            UIState.activeCallId = incomingId;
            setCallParticipants([callerParticipant], { merge: false });
            if (!window.__callOriginReturnTo || window.__callOriginReturnTo === 'calls') {
                // FIX (receiver-side return-to mismatch): this used to read
                // callData.source/callData.returnTo, which describe where the
                // CALLER placed the call from -- not where the RECEIVER (this
                // side) actually was. chat.html already tags the receiver's
                // real current page onto callData._receiverReturnTo before
                // forwarding the incoming-call payload (the same field
                // calls-core.js's POST_CALL_RESTORE path reads), so prefer
                // that here too. Without this, this restore path could win
                // the race against POST_CALL_RESTORE and bounce the receiver
                // to the caller's module instead of back to their own.
                const _src = (callData && (callData._receiverReturnTo || callData.source || callData.returnTo)) || null;
                window.__callOriginReturnTo  = (_src && _src !== 'calls') ? _src : 'messages';
                window.__pendingCallReturnTo = window.__callOriginReturnTo;
                window.__callOriginChatUserId = (callData && (callData._receiverReturnChatUserId || callData.callerId || callData.userId)) || null;
                window.__callOriginChatUserName = (callData && callData._receiverReturnChatName) || _callerName;
            }
            // ✅ FIX: Re-cache elements if incomingCallModal not yet resolved
            if (!elements.incomingCallModal) {
                if (typeof cacheElements === 'function') cacheElements();
            }
            if (!elements.incomingCallModal) {
                // Last resort: query directly
                elements.incomingCallModal    = document.getElementById('incomingCallModal');
                elements.incomingCallName     = document.getElementById('incomingCallName');
                elements.incomingCallType     = document.getElementById('incomingCallType');
                elements.incomingCallAvatar   = document.getElementById('incomingCallAvatar');
                elements.incomingCallMood     = document.getElementById('incomingCallMood');
                elements.incomingCallIntention= document.getElementById('incomingCallIntention');
                elements.declineTimer         = document.getElementById('declineTimer');
                elements.declineCallBtn       = document.getElementById('declineCallBtn');
                elements.acceptCallBtn        = document.getElementById('acceptCallBtn');
                elements.acceptVideoCallBtn   = document.getElementById('acceptVideoCallBtn');
            }
            if (!elements.incomingCallModal) {
                console.error('[Calls UI] incomingCallModal not found in DOM — cannot show incoming call');
                return;
            }

            // ── DEDUP: ignore if same call already ringing ───────────────────
            if (window._currentIncomingCallId && window._currentIncomingCallId === incomingId) {
                return; // already showing this call
            }

            // ── LOCAL-FIRST: record ringing state immediately ────────────────
            (function _saveIncomingLocally() {
                const store = window.KynectaCallLocalStore;
                if (!store) return;
                const id = callData.callId || callData.id;
                if (!id) return;
                store.save({
                    id: id,
                    serverId: id,
                    callerId: callData.callerId || null,
                    receiverId: null,
                    type: callData.callType || callData.type || 'audio',
                    status: 'ringing',
                    callerName: callData.callerName || null,
                    callerAvatar: callData.callerAvatar || null,
                    isLocalOnly: false,
                    isGroupCall: callData.isGroupCall || false,
                    createdAt: callData.timestamp || Date.now()
                }).catch(() => {});
            })();

            // ── RINGTONE: play ringtone for receiver ─────────────────────────
            // ── RINGTONE: musical ascending chime for receiver ──────────────
            (function _playRingtone() {
                try {
                    if (window._incomingRingtone) {
                        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                    }
                    // Use custom ringtone file if provided, else generate musical chime via Web Audio
                    if (window.__callRingtoneUrl) {
                        const ring = new Audio(window.__callRingtoneUrl);
                        ring.loop = true; ring.volume = 0.85;
                        ring.play().catch(() => _tryWebAudioChime());
                        window._incomingRingtone = ring;
                    } else {
                        _tryWebAudioChime();
                    }
                    function _tryWebAudioChime() {
                        try {
                            const ctx = new (window.AudioContext || window.webkitAudioContext)();
                            let ringing = true;
                            window._incomingRingtone = {
                                _ctx: ctx,
                                pause: function() { ringing = false; try { ctx.close(); } catch(e) {} },
                                currentTime: 0
                            };
                            // Ascending chime: C5-E5-G5-C6, repeats every 2.5 s
                            const freqs = [523, 659, 784, 1047];
                            (function chime() {
                                if (!ringing || ctx.state === 'closed') return;
                                const t = ctx.currentTime;
                                freqs.forEach(function(f, i) {
                                    const osc  = ctx.createOscillator();
                                    const gain = ctx.createGain();
                                    osc.connect(gain); gain.connect(ctx.destination);
                                    osc.type = 'sine';
                                    osc.frequency.value = f;
                                    gain.gain.setValueAtTime(0, t + i * 0.12);
                                    gain.gain.linearRampToValueAtTime(0.35, t + i * 0.12 + 0.05);
                                    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.45);
                                    osc.start(t + i * 0.12);
                                    osc.stop(t + i * 0.12 + 0.5);
                                });
                                setTimeout(function() { if (ringing) chime(); }, 2500);
                            })();
                        } catch(e) { /* silent fail */ }
                    }
                } catch(e) { /* silent fail — ringtone is cosmetic */ }
            })();

            // Track for later accept/decline
            window._currentIncomingCallId = incomingId;
            if (elements.incomingCallModal) {
                if (elements.incomingCallName) {
                    elements.incomingCallName.textContent = callData.callerName || 'Incoming Call';
                }
                if (elements.incomingCallType) {
                    elements.incomingCallType.textContent = callData.callType === 'video' ? 'Video Call' : 'Voice Call';
                }
                if (elements.incomingCallAvatar) {
                    const initials = (callData.callerName || 'C').charAt(0).toUpperCase();
                    // Use profile photo if available, else show initials
                    const photoUrl = callData.callerAvatar || callData.callerPhoto || callData.callerProfilePhoto;
                    const _safePhotoUrl = photoUrl && window.SecuritySanitizer ? SecuritySanitizer.sanitizeURL(photoUrl) : photoUrl;
                    if (_safePhotoUrl && _safePhotoUrl !== '#') {
                        elements.incomingCallAvatar.textContent = '';
                        const img = document.createElement('img');
                        img.src = _safePhotoUrl;
                        img.alt = callData.callerName || 'Caller';
                        img.onerror = function() { elements.incomingCallAvatar.textContent = initials; };
                        elements.incomingCallAvatar.appendChild(img);
                    } else {
                        elements.incomingCallAvatar.textContent = initials;
                    }
                }
                if (elements.incomingCallMood) {
                    elements.incomingCallMood.dataset.mood = callData.callerMood || 'neutral';
                }
                if (elements.incomingCallIntention) {
                    elements.incomingCallIntention.dataset.intention = callData.callerIntention || 'quick';
                }

                // ── AUTO-ANSWER: settings.calls.autoAnswer ───────────────────
                // FIX: this setting existed in Settings, saved fine, and even
                // propagated down to this page as window.AppSettings data /
                // data-calls-auto-answer — but nothing ever actually checked it.
                // All the state this needs (callId, caller name, call type) is
                // already populated above, so we can accept immediately via the
                // exact same path the Accept button uses, and skip the ring
                // timer/modal/ringtone entirely.
                try {
                    const _callsCfg = (window.AppSettings && window.AppSettings.get('calls')) || {};
                    const _autoAnswer = _callsCfg.autoAnswer === true
                        || document.documentElement.getAttribute('data-calls-auto-answer') === 'true';
                    if (_autoAnswer) {
                        showNotification(`Auto-answering call from ${_callerName || 'Caller'}...`, 'info');
                        setTimeout(() => {
                            UIEventHandlers.acceptIncomingCallGeneric(incomingType === 'video');
                        }, 400);
                        return;
                    }
                } catch (_autoAnswerErr) {
                    // Fail open — fall through to the normal ring UI below
                }

                // ── Clear any old timer ──────────────────────────────────────
                const oldTimer = parseInt(elements.incomingCallModal.dataset.timer);
                if (oldTimer) clearInterval(oldTimer);

                // ── 3-MINUTE ring timer (180 seconds) ───────────────────────
                let timeLeft = 180;
                if (elements.declineTimer) elements.declineTimer.textContent = timeLeft;

                const timer = setInterval(() => {
                    timeLeft--;
                    if (elements.declineTimer) elements.declineTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(timer);
                        if (elements.incomingCallModal && elements.incomingCallModal.classList.contains('active')) {
                            // Stop ringtone
                            if (window._incomingRingtone) {
                                try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                                window._incomingRingtone = null;
                            }
                            UIEventHandlers.declineIncomingCall();
                        }
                    }
                }, 1000);

                elements.incomingCallModal.dataset.timer = timer;
                elements.incomingCallModal.classList.add('active'); elements.incomingCallModal.style.setProperty('display','flex','important');
                UIState.activeModals.add('incomingCallModal');
                // GUARD FIX: Mark call as active so showScreen('idle') can't fire during ring
                window.__callActive = true;
                if (window.UIState) { window.UIState.callActive = true; window.UIState.callState = 'incoming'; }
                // ✅ FIX: Start incoming ringtone when modal shows
                if (typeof window._startIncomingRingtone === 'function') window._startIncomingRingtone();
                else if (typeof window._playIncomingRing === 'function') window._playIncomingRing();
            }
        },
        
        handleCallInitiated: function(callData) {
            // ── LOCAL-FIRST: record initiated call ───────────────────────────
            (function _saveInitiatedLocally() {
                const store = window.KynectaCallLocalStore;
                if (!store) return;
                const id = callData.callId || callData.id;
                if (!id) return;
                store.save({
                    id: id,
                    serverId: id,
                    callerId: null, // us (we're the caller)
                    receiverId: callData.receiverId || null,
                    type: callData.callType || callData.type || 'audio',
                    status: 'initiated',
                    isLocalOnly: false,
                    isGroupCall: callData.isGroupCall || false,
                    createdAt: callData.timestamp || Date.now()
                }).catch(() => {});
            })();
            const participant = normalizeParticipantEntry((callData.participants && callData.participants[0]) || {
                id: callData.receiverId || callData.userId || null,
                userId: callData.receiverId || callData.userId || null,
                name: callData.calleeName || callData.userName || callData.receiverName || 'User',
                avatar: callData.userAvatar || null,
                isOnline: callData.receiverOnline !== false
            }) || {};
            let participantName = participant.name || callData.calleeName || callData.userName || callData.receiverName || 'User';
            // FIX-NAME-FLASH: if nothing above gave us a real name, don't clobber a name
            // we already know/are showing with the generic 'User' fallback — this is what
            // caused the outgoing screen to show the real name and then immediately
            // downgrade to "User" once the delayed server confirmation arrived.
            if (participantName === 'User') {
                let _known = window.__activePeerName || null;
                if (!_known) {
                    try {
                        const _backup = JSON.parse(sessionStorage.getItem('pending_call') || '{}');
                        _known = _backup.userName || _backup.name || null;
                    } catch (_) {}
                }
                if (!_known && elements.callWithName && elements.callWithName.textContent &&
                    elements.callWithName.textContent !== 'User' && elements.callWithName.textContent !== 'Calling...') {
                    _known = elements.callWithName.textContent;
                }
                if (_known) participantName = _known;
            }
            const participantAvatar = participant.avatar || participant.photo || callData.userAvatar || null;
            window.__callInitiatedAt = Date.now();
            window.__callEndedHandledAt = 0;
            window.__activePeerName = participantName;
            window.__activePeerType = callData.callType || callData.type || UIState.callType || 'voice';
            window.__activePeerAvatar = participantAvatar;
            // FIX: don't clobber a known activeCallId with undefined when this event
            // carries no callId (e.g. the initiate request failed server-side).
            if (callData.callId) UIState.activeCallId = callData.callId;
            setCallParticipants(callData.participants && callData.participants.length ? callData.participants : [participant], { merge: false });
            // ⚠ DO NOT set callStartTime here — timer only starts when receiver answers.
            // callStartTime stays null until handleCallAccepted fires.
            UIState.callStartTime = null;
            UIState.callType = callData.callType;
            UIState.callActive = true;
            UIState.callState = 'initiating';
            // Track whether receiver is online so we can show correct status text
            UIState.callReceiverOnline = callData.receiverOnline !== false; // default true unless told otherwise
            
            // NEVER hide sidebar or main content - always use overlay
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
            
            // Hide sidebar icons in parent frame
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'HIDE_SIDEBAR_ICONS', module: 'calls' }, '*');
            }
            
            const participantNames = UIState.callParticipants.map(p => p.name).join(', ') || 'Call';
            if (elements.callWithName) {
                elements.callWithName.textContent = SecuritySanitizer.sanitizeString(participantNames);
            }
            if (elements.callStatusText) {
                // Show "Ringing..." when receiver is online, "Calling..." when offline
                elements.callStatusText.textContent = UIState.callReceiverOnline ? 'Ringing...' : 'Calling...';
            }
            
            const icon = UIState.callType === 'video' ? 'fa-video' : 'fa-phone';
            if (elements.callTypeIcon) elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
            
            if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'block';
            
            UIState.currentView = 'call';

            // ── CALLING OVERLAY: show dialing screen ─────────────────────────
            (function _showCallingOverlay() {
                if (!elements.callingOverlay) return;
                // ── FIX: actually make the screen visible ──
                const callContainer = document.getElementById('callContainer');
                if (callContainer) { callContainer.classList.add('active'); callContainer.style.display = 'flex'; }
                const idleScreen = document.getElementById('idleScreen');
                if (idleScreen) { idleScreen.classList.remove('active'); idleScreen.style.setProperty('display','none','important'); }
                elements.callingOverlay.classList.add('active');
                elements.callingOverlay.style.setProperty('display', 'flex', 'important');

                const participant = (UIState.callParticipants && UIState.callParticipants[0]) || {};
                const name = participant.name || participantNames || 'Calling...';
                const isVideo = UIState.callType === 'video';

                if (elements.callingName) elements.callingName.textContent = name;
                if (elements.callingType) elements.callingType.textContent = isVideo ? 'Video Call' : 'Voice Call';
                if (elements.callingStatus) {
                    elements.callingStatus.textContent = UIState.callReceiverOnline ? 'Ringing...' : 'Calling...';
                }

                // Set avatar: photo or initials
                if (elements.callingAvatar) {
                    const _avatarUrl = participant.avatar || participant.photo || '';
                    const _safeAvatarUrl = SecuritySanitizer ? SecuritySanitizer.sanitizeURL(_avatarUrl) : _avatarUrl;
                    if (_safeAvatarUrl && _safeAvatarUrl !== '#') {
                        elements.callingAvatar.textContent = '';
                        const img = document.createElement('img');
                        img.src = _safeAvatarUrl;
                        img.alt = name; // safe: DOM property assignment, not HTML parsing
                        img.onerror = function() { elements.callingAvatar.textContent = name.charAt(0).toUpperCase(); };
                        elements.callingAvatar.appendChild(img);
                    } else {
                        elements.callingAvatar.textContent = name.charAt(0).toUpperCase();
                    }
                }

                // Use new internal screen system instead
                if (window.CallScreenManager && window.CallScreenManager.startCall) {
                    window.CallScreenManager.startCall({
                        userName: name,
                        userId: participant.userId || participant.id || callData.receiverId || 'active',
                        callType: UIState.callType || (isVideo ? 'video' : 'voice'),
                        status: UIState.callReceiverOnline ? 'Ringing...' : 'Calling...',
                        userAvatar: participant.avatar || participant.photo || null
                    });
                }
                // ✅ FIX: Always call showScreen('calling') so caller sees outgoing screen
                if (typeof window.showScreen === 'function') window.showScreen('calling');
                // ✅ FIX: Start outgoing ringtone
                if (typeof window._startOutgoingRingtone === 'function') window._startOutgoingRingtone();
                else if (typeof window._playOutgoingRing === 'function') window._playOutgoingRing();

                // Wire cancel button
                if (elements.cancelCallBtn && !elements.cancelCallBtn._callingWired) {
                    elements.cancelCallBtn._callingWired = true;
                    elements.cancelCallBtn.addEventListener('click', function() {
                        if (window.callCore && window.callCore.endCall) {
                            window.callCore.endCall();
                        } else if (window.coreInstance && window.coreInstance.endCall) {
                            window.coreInstance.endCall();
                        }
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded({ reason: 'cancelled', status: 'cancelled' });
                    });
                }

                // Wire collapse button — ONLY minimise if call is truly not active yet
                // (i.e., still ringing). Once connected, collapse shows pip but keeps active.
                if (elements.callingCollapseBtn && !elements.callingCollapseBtn._wired) {
                    elements.callingCollapseBtn._wired = true;
                    elements.callingCollapseBtn.addEventListener('click', function() {
                        // Only allow collapse/hide if call has connected to call-container view
                        // During outgoing ringing, do NOT hide the overlay — it must stay visible
                        const isRinging = UIState.callState === 'initiating' || UIState.callState === 'ringing' || UIState.callState === 'calling';
                        if (!isRinging) {
                            elements.callingOverlay.classList.remove('active');
                            if (elements.sidebar) elements.sidebar.style.display = 'flex';
                        }
                        // If ringing, just update icon to signal intent but stay visible
                    });
                }

                // Wire mute button in calling overlay
                if (elements.callingMuteBtn && !elements.callingMuteBtn._wired) {
                    elements.callingMuteBtn._wired = true;
                    elements.callingMuteBtn.addEventListener('click', function() {
                        UIState.isMuted = !UIState.isMuted;
                        const icon = this.querySelector('i');
                        if (icon) icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                        this.classList.toggle('is-muted', UIState.isMuted);
                        this.style.background = '';  // let CSS class handle it
                        if (window.callCore && window.callCore.toggleMute) window.callCore.toggleMute();
                    });
                }

                // Wire speaker button in calling overlay
                if (elements.callingSpeakerBtn && !elements.callingSpeakerBtn._wired) {
                    elements.callingSpeakerBtn._wired = true;
                    elements.callingSpeakerBtn.addEventListener('click', function() {
                        UIState.isSpeakerOn = !UIState.isSpeakerOn;
                        const icon = this.querySelector('i');
                        if (icon) icon.className = UIState.isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
                        this.classList.toggle('is-speaker-off', !UIState.isSpeakerOn);
                        this.style.background = '';  // let CSS class handle it
                    });
                }

                // Wire video toggle in calling overlay
                if (elements.callingVideoToggleBtn && !elements.callingVideoToggleBtn._wired) {
                    elements.callingVideoToggleBtn._wired = true;
                    elements.callingVideoToggleBtn.addEventListener('click', function() {
                        UIState.isVideoOff = !UIState.isVideoOff;
                        const icon = this.querySelector('i');
                        if (icon) icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                        this.classList.toggle('is-video-off', UIState.isVideoOff);
                        this.style.background = '';  // let CSS class handle it
                        if (window.callCore && window.callCore.toggleVideo) window.callCore.toggleVideo();
                    });
                }
            })();

            // Timer will start in handleCallAccepted (when receiver picks up)
            // Show placeholder until then
            if (elements.callDuration) elements.callDuration.textContent = '--:--';

            // ── 2-MINUTE outgoing-call ring timer (applies regardless of online status) ──
            // The callingOverlay must stay visible for the full 180 s unless:
            //   (a) receiver accepts → handleCallAccepted hides it
            //   (b) receiver declines → handleCallEnded hides it
            //   (c) caller manually ends → cancelCallBtn hides it
            //   (d) 180 s timeout fires → auto-dismiss below
            (function _startOutgoingRingTimer() {
                // Clear any pre-existing outgoing timer
                if (window._outgoingRingTimer) {
                    clearInterval(window._outgoingRingTimer);
                    window._outgoingRingTimer = null;
                }
                let timeLeft = 180;
                window._outgoingRingTimer = setInterval(() => {
                    timeLeft--;
                    // Update callingStatus label while ringing
                    if (elements.callingStatus) {
                        const statusLabel = UIState.callReceiverOnline ? 'Ringing...' : 'Calling...';
                        elements.callingStatus.textContent = `${statusLabel} (${timeLeft}s)`;
                    }
                    if (timeLeft <= 0) {
                        clearInterval(window._outgoingRingTimer);
                        window._outgoingRingTimer = null;
                        // Only auto-dismiss if call is still in ringing/initiating state
                        const stillRinging = UIState.callState === 'initiating'
                            || UIState.callState === 'ringing'
                            || UIState.callState === 'calling'
                            || UIState.callState === 'idle'; // never answered
                        if (stillRinging) {
                            // Stop ringtone
                            if (window._callerRingtone) {
                                try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                                window._callerRingtone = null;
                            }
                            // Dismiss calling overlay
                            if (elements.callingOverlay) elements.callingOverlay.classList.remove('active');
                            // Trigger call-ended cleanup
                            UIEventHandlers.handleCallEnded({ reason: 'timeout', status: 'missed' });
                            showNotification('Call ended — no answer after 3 minutes', 'info');
                        }
                    }
                }, 1000);
                // Store on callContainer so cleanup in handleCallEnded can find it
                if (elements.callContainer) elements.callContainer.dataset.offlineTimer = window._outgoingRingTimer;
            })();

            // Ringback tone for caller — plays on BOTH online and offline receiver (WhatsApp-style)
            (function _playCallerRingback() {
                try {
                    if (window._callerRingtone) {
                        try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                    }
                    // Standard telephone ringback cadence: 1s ring, 3s silence
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    let ringing = true;
                    window._callerRingtone = {
                        _ctx: ctx,
                        pause: function() { ringing = false; try { ctx.close(); } catch(e) {} },
                        currentTime: 0
                    };
                    (function ring() {
                        if (!ringing || ctx.state === 'closed') return;
                        // Two-tone ringback (440 Hz + 480 Hz) — classic telephone sound
                        [440, 480].forEach(function(freq) {
                            const osc  = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain); gain.connect(ctx.destination);
                            osc.type = 'sine';
                            osc.frequency.value = freq;
                            gain.gain.setValueAtTime(0.2, ctx.currentTime);
                            gain.gain.setValueAtTime(0.2, ctx.currentTime + 1.0);
                            gain.gain.setValueAtTime(0, ctx.currentTime + 1.0);
                            osc.start(ctx.currentTime);
                            osc.stop(ctx.currentTime + 1.0);
                        });
                        setTimeout(function() { if (ringing) ring(); }, 4000); // 1s on, 3s off
                    })();
                } catch(e) { /* silent fail */ }
            })();
        },
        
        handleCallStarted: function(callData) {
            // ── LOCAL-FIRST: mark as connected ───────────────────────────────
            const store = window.KynectaCallLocalStore;
            if (!store) return;
            const id = callData.callId || UIState.activeCallId;
            if (!id) return;
            store.updateStatus(id, 'connected').catch(() => {});
            if (elements.callStatusText) {
                elements.callStatusText.textContent = 'In call';
            }
        },

        // ── CALLER SIDE: receiver picked up → transition calling → in-call ──
        handleCallAccepted: function(callData) {
            console.log('[UI] handleCallAccepted → transitioning caller to in-call', callData);
            // Clear the receiver-show fallback if it was set (receiver side)
            if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }

            // ── Stop ringtones immediately ────────────────────────────────────
            if (window._incomingRingtone) {
                try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                window._incomingRingtone = null;
            }
            if (window._callerRingtone) {
                try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                window._callerRingtone = null;
            }
            if (window._outgoingRingTimer) { clearInterval(window._outgoingRingTimer); window._outgoingRingTimer = null; }

            // ── Set state FIRST so canPerformAction unblocks buttons ─────────
            UIState.callActive    = true;
            UIState.callState     = 'connected';
            UIState.callStartTime = Date.now();
            UIState.activeCallId  = (callData && (callData.callId || callData.id)) || UIState.activeCallId;
            window.__callActive   = true;

            // ── FIX 8: Resolve name — extended chain uses sessionStorage backup + all backend fields ──
            const _hcaSsName = (function() { try { return sessionStorage.getItem('_kyn_peer_name'); } catch(_) { return null; } })();
            const name = window.__activePeerName
                || _hcaSsName
                || window.__incomingCallerName
                || (callData && (
                      callData.calleeName      ||  // FIX 8: backend now sends this
                      callData.receiverName    ||  // FIX 8: alias
                      callData.callerName      ||  // FIX 8: caller name
                      callData.userName        ||
                      (callData.calleeInfo && (callData.calleeInfo.displayName || callData.calleeInfo.username)) ||
                      (callData.callerInfo && (callData.callerInfo.displayName || callData.callerInfo.username))
                   ))
                || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
                || (UIState.pendingCallUser && UIState.pendingCallUser.userName)
                || 'User';
            // Restore from sessionStorage if global was wiped
            if (!window.__activePeerName && _hcaSsName) window.__activePeerName = _hcaSsName;
            const type = window.__activePeerType || (callData && callData.callType) || UIState.callType || 'voice';
            setCallParticipants((callData && callData.participants && callData.participants.length)
                ? callData.participants
                : [{
                    id: (callData && (callData.receiverId || callData.userId || callData.callerId)) || null,
                    userId: (callData && (callData.receiverId || callData.userId || callData.callerId)) || null,
                    name,
                    avatar: window.__activePeerAvatar || window.__incomingCallerAvatar || null,
                    isOnline: true
                }], { merge: false });

            transitionToInCall({ userName: name, callType: type });
        },

        // ── BOTH SIDES: WebRTC ICE connected → ensure in-call screen is visible ──
        handleCallConnected: function(callData) {
            console.log('[UI] handleCallConnected → WebRTC up', callData);
            // Clear fallback timer
            if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }

            UIState.callState     = 'connected';
            UIState.callActive    = true;
            UIState.callStartTime = UIState.callStartTime || Date.now();

            // FIX-NAME-FLASH-2: resolve the known-good name FIRST (same chain
            // handleCallAccepted already uses), then apply it as a floor so
            // setCallParticipants() below can never downgrade an already-correct
            // display name to a generic one just because this particular payload's
            // participants[] entry came in with a weaker/missing name field.
            const _knownName = window.__activePeerName
                || window.__incomingCallerName
                || (callData && (callData.callerName || callData.userName || callData.calleeName))
                || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
                || null;

            if (callData && callData.participants && callData.participants.length) {
                const _patched = callData.participants.map(p => {
                    if (_knownName && (!p || !p.name || p.name === 'User' || /^User\s*#?\d*$/.test(p.name))) {
                        return { ...(p || {}), name: _knownName };
                    }
                    return p;
                });
                setCallParticipants(_patched, { merge: false });
            }

            // Only transition if in-call screen isn't already showing
            const inCallEl = document.getElementById('inCallScreen');
            if (!inCallEl || !inCallEl.classList.contains('active')) {
                const name = _knownName
                    || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
                    || 'User';
                const type = (callData && callData.callType) || UIState.callType || 'voice';
                transitionToInCall({ userName: name, callType: type });
            }

            // Ensure remote audio is playing (in case ontrack fired before screen shown)
            const remoteAudio = document.getElementById('remoteAudio');
            if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
                remoteAudio.play().catch(() => {});
            }
        },

        handleParticipantJoined: function(payload) {
            if (!payload) return;
            upsertCallParticipant({
                id: payload.userId || payload.participantId || payload.id || null,
                userId: payload.userId || payload.participantId || payload.id || null,
                name: payload.userName || payload.name || `User ${payload.userId || payload.participantId || ''}`.trim(),
                avatar: payload.userAvatar || payload.avatar || null,
                isOnline: true,
                isMuted: !!payload.isMuted,
                isSpeaking: !!payload.isSpeaking
            });
        },

        handleParticipantLeft: function(payload) {
            if (!payload) return;
            removeCallParticipant(payload.userId || payload.participantId || payload.id || null);
        },

        handleCallEnded: function(callData) {
            const _resolve = (id) => (window.callCore && typeof window.callCore.resolveCallId === 'function') ? window.callCore.resolveCallId(id) : id;
            const endedCallId = (callData && (callData.callId || callData.id)) || null;
            const _resolvedEnded = _resolve(endedCallId);
            const _resolvedActive = _resolve(UIState.activeCallId);
            if (endedCallId && UIState.activeCallId && String(_resolvedEnded) !== String(_resolvedActive)) {
                console.warn('[Calls UI] handleCallEnded ignored - mismatched callId', endedCallId, UIState.activeCallId);
                return;
            }
            if (!endedCallId && UIState.activeCallId && window.__callInitiatedAt &&
                (Date.now() - window.__callInitiatedAt) < 8000 &&
                (UIState.callState === 'calling' || UIState.callState === 'initiating' || UIState.callState === 'connecting')) {
                console.warn('[Calls UI] handleCallEnded ignored - stale end event during fresh call setup');
                return;
            }
            // ✅ FIX: Stop all ringtones (master fix + legacy)
            if (typeof window._stopRingtones === 'function') window._stopRingtones();
            if (typeof window._stopAllRingtones === 'function') window._stopAllRingtones();
            // ✅ FIX: Track when call ended so repeat call stale check works
            window.__lastCallEndedAt = Date.now();
            // ── Guard: ignore if no call was actually active ─────────────────
            // Stale CALL_ENDED echoes arrive during WebRTC setup. If no call screen
            // is visible and UIState says idle, this is a ghost signal — drop it.
            // FIX-CALL3: Also treat 'incoming' and 'initiating' as active — these are the
            // states the CALLER and RECEIVER are in before the call connects, so when one
            // side ends/rejects the other must reset even if their full screen isn't open yet.
            const _anyScreenActive =
                UIState.callActive ||
                UIState.callState === 'calling' ||
                UIState.callState === 'ringing' ||
                UIState.callState === 'connecting' ||
                UIState.callState === 'connected' ||
                UIState.callState === 'incoming' ||
                UIState.callState === 'initiating' ||
                UIState.callState === 'in-call' ||
                UIState.activeCallId != null ||
                (document.getElementById('callingScreen') && document.getElementById('callingScreen').classList.contains('active')) ||
                (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active')) ||
                (document.getElementById('incomingCallModal') && document.getElementById('incomingCallModal').classList.contains('active'));
            if (!_anyScreenActive) {
                // FIX-STUCK-SCREEN: previously returned here and skipped everything below —
                // including the parent postMessage that restores the sidebar/bottom-nav
                // icons and the return-to-origin navigation. In practice UIState is often
                // already reset by the time this runs (a different end-call path got there
                // first), which made this guard fire on genuine end events, not just true
                // stale echoes — leaving both sides stuck on the call screen with nav
                // hidden. The debounce immediately below already prevents this from
                // double-processing the same end event, so it's safe to fall through and
                // still run the nav-restore/navigation instead of dropping it entirely.
                console.warn('[Calls UI] handleCallEnded: no active call screen visible, but still restoring nav/navigation as a safety net');
            }

            // ── Debounce: ignore duplicate CALL_ENDED within 3 seconds ──────
            const now = Date.now();
            if (window.__callEndedHandledAt && (now - window.__callEndedHandledAt) < 3000) {
                console.log('[Calls UI] handleCallEnded dedup — already handled', now - window.__callEndedHandledAt, 'ms ago');
                return;
            }
            window.__callEndedHandledAt = now;
            setTimeout(() => { window.__callEndedHandledAt = 0; }, 5000);

          // FIX: set __callEndedNavigating BEFORE __callActive=false
            if (window.parent && window.parent !== window) {
                window.__callEndedNavigating = true;
                setTimeout(function() { window.__callEndedNavigating = false; }, 3000);
            }
            if (typeof window._stopRingtones === 'function') window._stopRingtones();
            if (typeof window._stopAllRingtones === 'function') window._stopAllRingtones();
            if (window._incomingRingtone) { try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {} window._incomingRingtone = null; }
            const _imEl3 = document.getElementById('incomingCallModal');
            if (_imEl3) { const _t3 = parseInt(_imEl3.dataset.timer); if (_t3) clearInterval(_t3); _imEl3.dataset.timer = ''; _imEl3.classList.remove('active'); _imEl3.style.setProperty('display','none','important'); UIState.activeModals && UIState.activeModals.delete('incomingCallModal'); }
            window._currentIncomingCallId = null;
            window.__callActive = false;
            window.__callAcceptedHandled = 0; window.__callReceiverAccepted = false;
            window.__callerCallId = null; window.__callInitiatedAt = 0; // FIX-CALL4: clear for second call
            window.__activePeerName = null; window.__activePeerType = null; window.__activePeerAvatar = null;
            window.__incomingCallerName = null; window.__incomingCallerAvatar = null;
            // FIX 8: also clear sessionStorage backup on clean call end
            try { sessionStorage.removeItem('_kyn_peer_name'); sessionStorage.removeItem('_kyn_peer_type'); sessionStorage.removeItem('pending_call'); } catch(_) {}
            // PHASE15 FIX: Clear receiver fallback timer so it doesn't fire on next call
            if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }
            // PHASE15 FIX: Reset pending incoming call data so second call isn't blocked by stale data
            window.__pendingIncomingCallData = null;
            window.__lastProcessedCallId = null;
            // PHASE15 FIX: Clear all outgoing ring timers to prevent ghost timers interfering with second call
            if (window._outgoingRingTimer)  { clearInterval(window._outgoingRingTimer);  window._outgoingRingTimer  = null; }
            if (window._callRingTimer)       { clearInterval(window._callRingTimer);       window._callRingTimer       = null; }
            if (window._currentCallTimer)    { clearInterval(window._currentCallTimer);    window._currentCallTimer    = null; }
            if (window._modalGuardObserver) { try { window._modalGuardObserver.disconnect(); } catch(e) {} window._modalGuardObserver = null; }
            if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'CALL_SCREEN_ACTIVE', payload: { active: false } }, '*');
            // FIX-CALL4: Always hide all call screens and restore idle screen,
            // so the iframe is not dark on the second call initiation.
            (function _resetScreens() {
                var _cs = document.getElementById('callingScreen');
                var _is = document.getElementById('inCallScreen');
                var _im2 = document.getElementById('incomingCallModal');
                if (_cs) { _cs.classList.remove('active'); _cs.style.setProperty('display','none','important'); }
                if (_is) { _is.classList.remove('active'); _is.style.setProperty('display','none','important'); }
                if (_im2) { _im2.classList.remove('active'); _im2.style.setProperty('display','none','important'); }
                // Call endCallScreens if available (CallOverlayManager reset)
                if (typeof window.endCallScreens === 'function') { try { window.endCallScreens(); } catch(_) {} }
                // Always show idleScreen so next call has a clean starting point
                if (typeof showIdleScreen === 'function') { try { showIdleScreen(true); } catch(_) {} }
                else if (typeof window.showIdleScreen === 'function') { try { window.showIdleScreen(true); } catch(_) {} }
                else {
                    var idle = document.getElementById('idleScreen');
                    if (idle) { idle.classList.add('active'); idle.style.setProperty('display','block','important'); }
                }
                // FIX (post-call stuck-on-calls-screen audit): this point in
                // handleCallEnded is the one place that unconditionally runs on
                // EVERY termination path (local end button, remote hangup,
                // decline, timeout) with no debounce/stale-echo guard above it —
                // every other "tell the parent to restore nav + navigate back"
                // signal (CALL_ENDED, CALL_ENDED_RETURN) is sent later in this
                // function and can be dropped by one of several timing guards on
                // the parent (chat.html) side. Notify the parent right here too,
                // as an independent, always-fires signal it can't miss.
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'CALLS_IDLE_SCREEN_SHOWN', timestamp: Date.now() }, '*');
                    }
                } catch (_) {}
            })();

            // ── LOCAL-FIRST: finalize call record ─────────────────────────────
            (function _saveEndedLocally() {
                const store = window.KynectaCallLocalStore;
                if (!store) return;
                const id = callData.callId || UIState.activeCallId;
                if (!id) return;
                // Determine final status
                let finalStatus = 'ended';
                if (callData.reason === 'declined' || callData.status === 'rejected') finalStatus = 'rejected';
                else if (callData.status === 'missed') finalStatus = 'missed';
                else if (callData.status === 'failed') finalStatus = 'failed';
                else if (callData.status === 'cancelled') finalStatus = 'cancelled';
                const duration = callData.duration ||
                    (UIState.callStartTime ? Math.floor((Date.now() - UIState.callStartTime) / 1000) : 0);
                store.updateStatus(id, finalStatus, { duration, endedAt: Date.now() }).catch(() => {});
                // Prune old records
                store.prune().catch(() => {});
            })();

            // ── Capture navigation target BEFORE clearing state ───────────────
            // FIX (return-to-origin): this used to explicitly exclude 'calls'
            // as a destination ("NEVER default to calls panel"), which meant
            // a call placed via redial from the Calls tab would still bounce
            // the caller to Messages afterward instead of back to Calls.
            // 'calls' is only wrong when it's an unset/guessed fallback, not
            // when it's the call's real, tracked origin — so now we trust
            // whatever origin was actually recorded and only fall back to
            // 'messages' if nothing was recorded at all.
            const returnTo = window.__callOriginReturnTo
                || window.__pendingCallReturnTo
                || 'messages';
            const chatUserId = window.__callOriginChatUserId
                || window.__pendingCallChatUserId
                || null;
            const chatUserName = window.__callOriginChatUserName || null;

            // Reset state FIRST
            UIState.activeCallId = null;
            UIState.callActive = false;
            UIState.callState = 'idle';
            UIState.callParticipants = [];
            UIState.callStartTime = null;
            UIState.callType = null;
            // PHASE15 FIX: Clear all UIState call properties that could block second call
            UIState.pendingCallUser = null;
            UIState.sdpOffer = null;
            UIState.sdpAnswer = null;
            UIState.iceCandidates = [];
            UIState.peerConnection = null;
            window._currentIncomingCallId = null;
            document.body.classList.remove('call-connected');
            syncParticipantBadge();

            // Stop any playing ringtone immediately
            if (window._incomingRingtone) {
                try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                window._incomingRingtone = null;
            }
            // Stop caller ringtone for offline calls
            if (window._callerRingtone) {
                try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                window._callerRingtone = null;
            }
            // Clear offline ring timer
            if (elements.callContainer && elements.callContainer.dataset.offlineTimer) {
                const offlineTimer = parseInt(elements.callContainer.dataset.offlineTimer);
                if (offlineTimer) clearInterval(offlineTimer);
                elements.callContainer.dataset.offlineTimer = '';
            }
            // Clear outgoing ring timer (2-minute ringing guard)
            if (window._outgoingRingTimer) {
                clearInterval(window._outgoingRingTimer);
                window._outgoingRingTimer = null;
            }
            if (window._incomingCallTimer) {
                clearInterval(window._incomingCallTimer);
                window._incomingCallTimer = null;
            }
            if (elements.incomingCallModal && elements.incomingCallModal.dataset.timer) {
                clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
                elements.incomingCallModal.dataset.timer = '';
            }
            // Clear dedup locks so next call can proceed immediately
            if (window.__uiCallDispatchLock) window.__uiCallDispatchLock = { ts: 0, userId: null };

            // ── Stop duration timer ──────────────────────────────────────────
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
                UIState.callDurationInterval = null;
            }
            if (elements.callDuration) elements.callDuration.textContent = '--:--';

            // ── Stop media streams ───────────────────────────────────────────
            if (UIState.localStream) {
                UIState.localStream.getTracks().forEach(t => t.stop());
                UIState.localStream = null;
            }
            document.querySelectorAll('audio[id^="remoteAudio_"]').forEach(a => { a.srcObject = null; a.remove(); });
            UIState.remoteStreams.clear();
            UIState.remoteStream = null;

            // ── Clean up video layout elements ───────────────────────────────
            const _inCallScreen = document.getElementById('inCallScreen');
            if (_inCallScreen) _inCallScreen.classList.remove('video-active');
            const _nameLabel = document.getElementById('remoteParticipantLabel');
            if (_nameLabel) { _nameLabel.style.display = 'none'; _nameLabel.textContent = ''; }
            const _remoteVideo = document.getElementById('remoteVideo');
            if (_remoteVideo) { try { _remoteVideo.srcObject = null; } catch(e) {} _remoteVideo.style.display = 'none'; }
            const _remoteAudio = document.getElementById('remoteAudio');
            if (_remoteAudio) { try { _remoteAudio.srcObject = null; } catch(e) {} }
            const _pipContainer = document.getElementById('pipContainer');
            if (_pipContainer) _pipContainer.style.display = 'none';
            const _pipVideo = document.getElementById('pipVideo');
            if (_pipVideo) { try { _pipVideo.srcObject = null; } catch(e) {} }
            const _avatarWrap = document.getElementById('incallAvatarWrap');
            if (_avatarWrap) _avatarWrap.style.display = '';
            // Stop video upgrade track if pending
            if (UIState._videoUpgradeTrack) {
                try { UIState._videoUpgradeTrack.stop(); } catch(e) {}
                UIState._videoUpgradeTrack = null;
            }

            if (elements.videoGrid) {
                elements.videoGrid.innerHTML = '';
                if (elements.offlineCallPlaceholder) {
                    elements.offlineCallPlaceholder.style.display = 'flex';
                }
            }

            UIState.currentView = 'sidebar';

            // ── Clear navigation state variables ────────────────────────────
            window.__pendingCallReturnTo = null;
            window.__pendingCallChatUserId = null;
            window.__callOriginReturnTo = null;
            window.__callOriginChatUserId = null;
            window.__callOriginChatUserName = null;

            // ── Restore sidebar icons to parent shell ────────────────────────
            if (window.parent && window.parent !== window) {
                // ✅ FIX: Set flag so showIdleScreen() is suppressed during navigation
                window.__callEndedNavigating = true;
                setTimeout(function() { window.__callEndedNavigating = false; }, 3000);
                window.parent.postMessage({ type: 'SHOW_SIDEBAR_ICONS', module: 'calls' }, '*');
                window.parent.postMessage({ type: 'CALL_ENDED_RETURN', timestamp: Date.now() }, '*');
            }

            // ── Navigate back to origin module (with short delay for animation) ──
            setTimeout(() => {
                if (window.parent && window.parent !== window) {
                    if (returnTo === 'messages' && chatUserId) {
                        // Return to messages module AND re-open the specific chat
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: 'messages',
                            payload: { returnFromCall: true, openChatWith: chatUserId, openChatWithName: chatUserName },
                            timestamp: Date.now()
                        }, '*');
                    } else if (returnTo === 'friends') {
                        // Return to friends/contacts page
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: 'friends',
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    } else if (returnTo && returnTo !== 'calls') {
                        // Return to any other named module
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: returnTo,
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    } else {
                        // Fallback: always go to messages, never the calls panel
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: 'messages',
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    }
                }

                // NEVER hide sidebar or main content - always use overlay
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
                
                // ✅ FIX: Do NOT call showIdleScreen() immediately — it causes dark flash
                // before parent navigates away. Instead just hide call screens,
                // let parent navigate, then show idle after 1.5s if still on calls page.
                const _callingScr = document.getElementById('callingScreen');
                const _inCallScr  = document.getElementById('inCallScreen');
                if (_callingScr) { _callingScr.classList.remove('active'); _callingScr.style.display = ''; }
                if (_inCallScr)  { _inCallScr.classList.remove('active');  _inCallScr.style.display = ''; }
                document.body.classList.remove('call-active', 'call-connected');
                // Show idle only after parent nav has had time to hide this iframe
                setTimeout(function() {
                    if (!window.__callActive && typeof showIdleScreen === 'function') {
                        showIdleScreen(true);
                    }
                }, 1500);
                UIState.currentView = 'sidebar';
            }, 350); // 350ms — enough for overlay fade but snappy UX

            // ── Refresh call history ─────────────────────────────────────────
            setTimeout(() => {
                UIEventHandlers.refreshCallHistoryAfterCall && UIEventHandlers.refreshCallHistoryAfterCall();
            }, 800);

            // ── Show post-call notes modal (after navigation settles) ────────
            setTimeout(() => {
                UIEventHandlers.showPrivateNotesModal && UIEventHandlers.showPrivateNotesModal();
            }, 700);
        },
        
        handleRemoteStreamAdded: function(payload) {
            if (payload.stream) {
                UIState.remoteStreams.set(payload.stream.id, payload.stream);
                // Keep UIState.remoteStream in sync so toggleRecording can find it
                UIState.remoteStream = payload.stream;
                this.addRemoteVideo(payload.stream.id, payload.stream);
            }
        },
        
        handleRemoteStreamRemoved: function(payload) {
            if (payload.streamId) {
                UIState.remoteStreams.delete(payload.streamId);
                const videoEl = document.querySelector(`.video-container[data-stream-id="${payload.streamId}"]`);
                if (videoEl) videoEl.remove();
                // Also remove dedicated audio element if it exists
                const audioEl = document.getElementById('remoteAudio_' + payload.streamId);
                if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
            }
        },
        
        handleLogout: function() {
            if (DEBUG) {
                logOnce('info', 'Logout triggered');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            parentReady = false;
            handshakeComplete = false;
            _sessionInvalid = true;
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            
            showNotification('Logged out', 'info');
        },
        
        // Handle auth errors
        handleAuthError: function() {
            if (DEBUG) {
                logOnce('warn', 'Authentication error received');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            _sessionInvalid = true;
            
            showNotification('Session expired - please log in again', 'error');
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        startCallTimer: function() {
            if (!UIState.callStartTime) return;
            
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
            }
            
            UIState.callDurationInterval = setInterval(() => {
                if (!UIState.callStartTime || !elements.callDuration) return;
                
                const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                elements.callDuration.textContent = `${minutes}:${seconds}`;
            }, 1000);
        },
        
        setupParentMessageHandler: function() {
            const handler = (event) => {
                if (!this.validateParentMessage(event)) return;
                
                const data = event.data;
                
                switch (data.type) {
                    case 'SESSION_UPDATE':
                        this.handleSessionUpdate(data.payload || data);
                        break;
                    case 'TOKEN_UPDATE':
                        this.handleTokenUpdate(data.payload || data);
                        break;
                    case 'LOGOUT':
                        UIEventHandlers.handleLogout();
                        break;
                    case 'CONTACTS_UPDATE':
                        this.handleContactsUpdate(data.payload || data);
                        break;
                    case 'CALL_HISTORY_UPDATE':
                        this.handleCallHistoryUpdate(data.payload || data);
                        break;
                    case 'PAGE_ACTIVATED':
                        if (DEBUG) {
                            logOnce('info', 'Parent page activated');
                        }
                        break;
                    case 'NAVIGATE':
                        if (DEBUG) {
                            logOnce('info', 'Parent navigation:', data.payload);
                        }
                        break;
                    case 'NEW_MESSAGE':
                        if (data.payload && data.payload.message) {
                            this.addChatMessage(data.payload.sender, data.payload.message, data.payload.timestamp);
                        }
                        break;
                    case 'PARENT_READY':
                        parentReady = true;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        attemptPendingCall();
                        break;
                    case 'MODULE_REGISTERED':
                        handshakeComplete = true;
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        break;
                    case 'SESSION_SYNC':
                        sessionReady = true;
                        _sessionInvalid = false;
                        this.handleSessionUpdate(data.payload || data);
                        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                            RenderingPipeline.updateSyncIndicator();
                        }
                        attemptPendingCall();
                        break;
                    case 'AUTH_ERROR':
                    case 'UNAUTHORIZED':
                        this.handleAuthError();
                        break;
                    case 'call_initiated':
                    case 'CALL_INITIATED': {
    const payload = data.payload || data || {};
    if (payload.success === false) {
        showNotification(payload.error || 'Failed to start call', 'error');
        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(payload);
        break;
    }

    const pendingUser = UIState.pendingCallUser || {};
    const participantName = payload.calleeName
        || payload.receiverName
        || payload.userName
        || window.__activePeerName
        || pendingUser.userName
        || 'User';
    const participantAvatar = payload.userAvatar || window.__activePeerAvatar || pendingUser.userAvatar || null;
    const participantId = payload.receiverId || pendingUser.userId || payload.userId || null;

    // FIX: on CoreIntegration, not UIEventHandlers
    this.handleCallInitiated({
        ...payload,
        callId: payload.callId || payload.id || UIState.activeCallId,
        callType: payload.callType || payload.type || UIState.callType || pendingUser.callType || 'voice',
        participants: payload.participants || (participantName ? [{
            name: participantName,
            userId: participantId,
            avatar: participantAvatar
        }] : [])
    });
    break;
}
                    case 'call_accepted':
                    case 'CALL_ACCEPTED': {
    // Receiver answered — transition BOTH caller and receiver to in-call screen.
    // ── FIX-CALL1: Replace time-based dedup (500ms was too short for WS round-trip)
    // with a screen-visibility dedup. If inCallScreen is already active this side has
    // already transitioned — skip. Otherwise always proceed, regardless of timestamps.
    const _inCallNow = document.getElementById('inCallScreen');
    if (_inCallNow && _inCallNow.classList.contains('active')) {
        console.log('[Calls UI] ⏭ CALL_ACCEPTED dedup — in-call screen already active');
        break;
    }
    window.__callAcceptedHandled = Date.now();
    // Flag for core timeout guard — prevents premature ICE timeout after acceptance
    window.__callReceiverAccepted = true;
    console.log('[Calls UI] ✅ CALL_ACCEPTED received — transitioning caller to in-call screen');

    const _ap = data.payload || {};

    // ── ALWAYS stop ringtones immediately ────────────────────────────────
    if (window._incomingRingtone) {
        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
        window._incomingRingtone = null;
    }
    if (window._callerRingtone) {
        try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
        window._callerRingtone = null;
    }
    // Stop ring timers
    if (window._currentCallTimer) { clearInterval(window._currentCallTimer); window._currentCallTimer = null; }
    if (window._callRingTimer)    { clearInterval(window._callRingTimer);    window._callRingTimer    = null; }
    if (window._outgoingRingTimer){ clearInterval(window._outgoingRingTimer);window._outgoingRingTimer= null; }
    // Stop incomingCallModal timer if still running (receiver side)
    const _im = document.getElementById('incomingCallModal');
    if (_im && _im.dataset.timer) { clearInterval(parseInt(_im.dataset.timer)); _im.dataset.timer = ''; }

    // ── FIX 8: Resolve peer name — extended chain covers all backend-provided fields ─
    // Priority: window globals (set at dial) → sessionStorage backup → UIState → backend payload
    const _ssName = (function() { try { return sessionStorage.getItem('_kyn_peer_name'); } catch(_) { return null; } })();
    const _ssType = (function() { try { return sessionStorage.getItem('_kyn_peer_type'); } catch(_) { return null; } })();
    const _peerName = window.__activePeerName
        || _ssName
        || window.__incomingCallerName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || (UIState.pendingCallUser && UIState.pendingCallUser.userName)
        // FIX 8: backend now sends all of these — use whichever is present
        || (_ap.calleeName)         // receiver's name (new from FIX 7)
        || (_ap.receiverName)       // alias
        || (_ap.callerName)         // caller's name (new from FIX 7)
        || (_ap.userName)
        || (_ap.name)
        || (_ap.callerInfo && (_ap.callerInfo.displayName || _ap.callerInfo.username))
        || (_ap.calleeInfo && (_ap.calleeInfo.displayName || _ap.calleeInfo.username))
        || 'User';
    const _peerType = window.__activePeerType
        || _ssType
        || UIState.callType || _ap.callType || 'voice';
    const _peerAva  = window.__activePeerAvatar
        || window.__incomingCallerAvatar
        || (UIState.pendingCallUser && UIState.pendingCallUser.userAvatar)
        || _ap.calleeAvatar || _ap.callerAvatar || null;
    // FIX 8: refresh window globals from sessionStorage if they were wiped
    if (!window.__activePeerName && _ssName) window.__activePeerName = _ssName;

    // ── Dismiss incoming call modal (receiver side cleanup) ───────────────
    if (_im) { _im.classList.remove('active'); _im.style.setProperty('display','none','important'); }

    transitionToInCall({ userName: _peerName, callType: _peerType, userAvatar: _peerAva });
    break;
}
                    case 'CALL_INCOMING': {
                        const _incomingPayload = data.payload || {};
                        window.__pendingIncomingCallData = _incomingPayload;
                        // ✅ FIX: Always trigger master-fix handler first (always available)
                        if (typeof window._startIncomingRingtone === 'function') window._startIncomingRingtone();
                        if (UIEventHandlers.handleIncomingCall) {
                            UIEventHandlers.handleIncomingCall(_incomingPayload);
                        } else {
                            // Retry up to 10x with 200ms gaps; MasterFix already handles UI
                            let _retries = 0;
                            const _retryIncoming = setInterval(() => {
                                _retries++;
                                if (UIEventHandlers.handleIncomingCall) {
                                    clearInterval(_retryIncoming);
                                    UIEventHandlers.handleIncomingCall(_incomingPayload);
                                    window.__pendingIncomingCallData = null;
                                } else if (_retries >= 10) {
                                    clearInterval(_retryIncoming);
                                    console.log('[Calls UI] CALL_INCOMING: MasterFix already handled');
                                }
                            }, 200);
                        }
                        break;
                    }
                    case 'CALL_PARTICIPANT_JOINED':
                    case 'call_participant_joined':
                        UIEventHandlers.handleParticipantJoined && UIEventHandlers.handleParticipantJoined(data.payload || data);
                        break;
                    case 'CALL_PARTICIPANT_LEFT':
                    case 'call_participant_left':
                        UIEventHandlers.handleParticipantLeft && UIEventHandlers.handleParticipantLeft(data.payload || data);
                        break;
                    case 'AUTO_ACCEPT_CALL':
                    case 'ANSWER_CALL': {
                        // Parent banner/overlay accepted — answer the call
                        const callId = (data.payload || {}).callId || (window.callCore && window.callCore.getActiveCallId && window.callCore.getActiveCallId());
                        if (callId && window.callCore && window.callCore.answerCall) {
                            window.callCore.answerCall(callId).then(result => {
                                if (result && result.success) {
                                    // Set state so core events know to show in-call screen
                                    UIState.callActive = true;
                                    UIState.callState  = 'connected';
                                    UIState.activeCallId = callId;
                                    // Notify parent the call was accepted
                                    if (window.parent && window.parent !== window) {
                                        window.parent.postMessage({ type: 'CALL_ACCEPTED', payload: { callId }, source: 'auto-accept' }, '*');
                                    }
                                    // Fallback: show in-call after 4s if core hasn't fired yet
                                    window._receiverShowFallback = setTimeout(() => {
                                        const inCall = document.getElementById('inCallScreen');
                                        if (!inCall || !inCall.classList.contains('active')) {
                                            _showReceiverCallScreen(callId);
                                        }
                                    }, 4000);
                                } else {
                                    console.warn('[Calls UI] answerCall failed from overlay', result);
                                }
                            }).catch(e => console.error('[Calls UI] answerCall error', e));
                        } else if (callId) {
                            // Fallback: trigger accept buttons directly
                            const acceptBtn = document.getElementById('acceptCallBtn') || document.querySelector('[data-action="accept-call"]');
                            if (acceptBtn) acceptBtn.click();
                        }
                        break;
                    }
                    case 'DECLINE_CALL': {
                        // Parent overlay declined — reject the call
                        const callId = (data.payload || {}).callId || (window.callCore && window.callCore.getActiveCallId && window.callCore.getActiveCallId());
                        if (callId && window.callCore && window.callCore.declineCall) {
                            window.callCore.declineCall(callId, 'declined').catch(e => {});
                        }
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded({ callId, reason: 'declined' });
                        break;
                    }
                    case 'CALL_ENDED':
                    case 'CALL_FORCE_ENDED':
                    case 'parent-end-broadcast':
                    case 'CALL_REJECTED': {
                        // ── ALWAYS stop ringtones immediately, regardless of state ──
                        if (window._incomingRingtone) {
                            try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                            window._incomingRingtone = null;
                        }
                        if (window._callerRingtone) {
                            try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                            window._callerRingtone = null;
                        }
                        // ── If CALL_FORCE_ENDED arrives but we just transitioned to in-call,
                        // it's a stale WS echo — ignore the UI reset, only stop ringtone ──
                        const _isAlreadyInCall = UIState.callState === 'connected'
                            || (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active'));
                        if (data.type === 'CALL_FORCE_ENDED' && _isAlreadyInCall &&
                            window.__callAcceptedHandled &&
                            (Date.now() - window.__callAcceptedHandled) < 5000) {
                            console.warn('[Calls UI] CALL_FORCE_ENDED ignored — already in-call screen active');
                            if (window._currentCallTimer) { clearInterval(window._currentCallTimer); window._currentCallTimer = null; }
                            if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }
                            break;
                        }
                        // ── Suppress stale echo: if we just started a new call within 8s,
                        // this CALL_ENDED is from the previous session — do NOT reset calling screen ──
                        const _recentCallStart = window.__callInitiatedAt && (Date.now() - window.__callInitiatedAt) < 8000;
                        const _callingScreenActive = document.getElementById('callingScreen') &&
                            document.getElementById('callingScreen').classList.contains('active');
                        if ((data.type === 'CALL_FORCE_ENDED' || data.type === 'CALL_ENDED') && _recentCallStart && _callingScreenActive) {
                            console.warn('[Calls UI] ' + data.type + ' suppressed — new call initiated ' + (Date.now() - window.__callInitiatedAt) + 'ms ago (stale echo)');
                            break;
                        }
                        // Parent broadcast CALL_ENDED to this iframe — reset UI immediately
                        console.log('[Calls UI] CALL_ENDED received from parent — resetting UI');
                        if (window._currentCallTimer) { clearInterval(window._currentCallTimer); window._currentCallTimer = null; }
                        if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }
                        // Clear the accept dedup lock so next call works
                        window.__callAcceptedHandled = 0;
                        // Clear window globals for peer info
                        window.__activePeerName = null;
                        window.__activePeerType = null;
                        window.__activePeerAvatar = null;
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(data.payload || {});
                        break;
                    }
                    case 'CALL_CANCELLED':
                        // Caller cancelled before we answered
                        if (window.__kynHideCallBanner) window.__kynHideCallBanner();
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(data.payload || {});
                        UIEventHandlers.refreshCallHistory && UIEventHandlers.refreshCallHistory();
                        break;
                    case 'CALL_ACCEPT_RESULT':
                        // Backend confirmed accept
                        if ((data.payload || {}).success) {
                            console.log('[Calls UI] ✅ Call accept confirmed by backend');
                        } else {
                            console.warn('[Calls UI] ❌ Backend rejected accept:', data.payload);
                        }
                        break;
                    case 'CALL_REJECT_RESULT':
                        // Backend confirmed reject
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(data.payload || {});
                        UIEventHandlers.refreshCallHistory && UIEventHandlers.refreshCallHistory();
                        break;
                    case 'CALL_REJECTED':
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(data.payload || {});
                        break;
                    case 'CALL_ENDED':
                        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded(data.payload || {});
                        break;
                    case 'OPEN_CALL_WITH_USER':
                    case 'START_CALL':
                    case 'CALL_USER':
                        // This path is handled by guardedHandleOpenCallWithUser via the 'message' listener
                        // in setupOpenCallWithUserListener. Calling handleOpenCallWithUser directly here
                        // would bypass dedup — so we skip it.
                        break;
                    case 'SHOW_CALLS_SIDEBAR':
                        // Sent by parent when returnTo='calls' after a call ends
                        UIEventHandlers.showCallsSidebar && UIEventHandlers.showCallsSidebar();
                        break;
                    case 'CALL_FORCE_ENDED':
                        // Backend cleaned up a stale call — reset all frontend state
                        // BUT skip if we already transitioned to in-call (stale WS echo)
                        if (UIState.callState === 'connected' ||
                            (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active'))) {
                            console.warn('[Calls UI] CALL_FORCE_ENDED (2nd handler) ignored — already in-call');
                            break;
                        }
                        // Suppress stale echo: if calling screen is active and call was just initiated
                        if (window.__callInitiatedAt && (Date.now() - window.__callInitiatedAt) < 8000 &&
                            document.getElementById('callingScreen') &&
                            document.getElementById('callingScreen').classList.contains('active')) {
                            console.warn('[Calls UI] CALL_FORCE_ENDED (2nd handler) suppressed — new call in progress (' + (Date.now() - window.__callInitiatedAt) + 'ms ago)');
                            break;
                        }
                        console.warn('[Calls UI] CALL_FORCE_ENDED received — resetting state');
                        // Always stop ringtones
                        if (window._incomingRingtone) { try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {} window._incomingRingtone = null; }
                        if (window._callerRingtone)   { try { window._callerRingtone.pause();   window._callerRingtone.currentTime   = 0; } catch(e) {} window._callerRingtone   = null; }
                        if (coreInstance && coreInstance.forceResetCallState) coreInstance.forceResetCallState();
                        UIEventHandlers.resetCallUI && UIEventHandlers.resetCallUI();
                        // Also clear dedup locks so next call works immediately
                        if (window.__uiCallDispatchLock) window.__uiCallDispatchLock = { ts: 0, userId: null };
                        if (window.__earlyCallLock) window.__earlyCallLock = { ts: 0, userId: null };
                        window.__callAcceptedHandled = 0;
                        window.__activePeerName = null;
                        window.__activePeerType = null;
                        window.__activePeerAvatar = null;
                        break;
                }
            };
            
            window.addEventListener('message', handler);
            UIState.cachedElements.set('parentMessageHandler', handler);
        },
        
        validateParentMessage: function(event) {
            if (!event || !event.data) return false;
            
            // Check origin - relaxed during init
            if (coreLifecycleState !== 'ACTIVE') {
                return true;
            }
            
            const origin = event.origin || '';
            // Trust same-origin, localhost, and production onrender.com origins
            if (origin !== window.location.origin && 
                !origin.includes('localhost') && 
                !origin.includes('127.0.0.1') &&
                !(origin.startsWith('https://') && origin.endsWith('.onrender.com')) &&
                origin !== 'null') {
                return false;
            }
            
            const data = event.data;
            
            // Validate required fields
            if (!data.type || typeof data.type !== 'string') {
                return false;
            }
            
            // Validate source is parent — but allow trusted call broadcast sources.
            // CALL_ACCEPTED / CALL_ENDED arrive with source 'ws-bridge', 'parent-end-broadcast',
            // 'parent-accept-broadcast' etc. Blocking these drops all call state transitions.
            const _callBroadcastSources = ['ws-bridge', 'parent-end-broadcast', 'parent-accept-broadcast',
                'parent-ws-broadcast', 'parent-frame', 'parent-signal', 'auto-accept'];
            const _callEventTypes = ['CALL_INITIATED', 'CALL_ACCEPTED', 'CALL_ENDED', 'CALL_FORCE_ENDED', 'CALL_REJECTED',
                'CALL_CANCELLED', 'CALL_INCOMING', 'CALL_RINGING', 'call_initiated', 'call_accepted', 'call:accepted',
                'call:ended', 'call_ended', 'SIGNAL_OFFER', 'SIGNAL_ANSWER', 'ICE_CANDIDATE'];
            if (data.source && data.source !== 'parent') {
                if (_callBroadcastSources.includes(data.source)) return true;
                if (_callEventTypes.includes(data.type)) return true;
                return false;
            }
            
            // Check timestamp if present
            if (data.timestamp && (data.timestamp < Date.now() - 300000 || data.timestamp > Date.now() + 60000)) {
                return false;
            }
            
            return true;
        },
        
        handleSessionUpdate: function(data) {
            if (DEBUG) {
                logOnce('info', 'Received session update');
            }
            
            if (data.token) {
                window.__CHILD_SESSION__.token = data.token;
                _sessionInvalid = false;
            }
            if (data.userId) {
                window.__CHILD_SESSION__.userId = data.userId;
            }
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            
            sessionReady = true;
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleTokenUpdate: function(data) {
            if (!data || !data.token) return;
            
            window.__CHILD_SESSION__.token = data.token;
            if (data.expiry) {
                window.__CHILD_SESSION__.expires = data.expiry;
            }
            sessionReady = true;
            _sessionInvalid = false;
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleContactsUpdate: function(data) {
            if (!data || !data.contacts || !Array.isArray(data.contacts)) return;
            
            if (elements.contactsList) {
                RenderingPipeline.renderContactsList(data.contacts);
            }
        },
        
        handleCallHistoryUpdate: function(data) {
            if (!data) return;
            const calls = data.calls || data.data?.calls || [];
            if (typeof displayCallHistory === 'function') {
                displayCallHistory(calls);
            }
        },
        
        handleDegradedMode: function() {
            if (DEBUG) {
                logOnce('info', 'Handling degraded mode');
            }
            
            fallbackModeActive = true;
            
            document.querySelectorAll('button, input, select').forEach(el => {
                if (!el.classList.contains('critical-control') && el.id !== 'endCallBtn' && el.id !== 'muteBtn') {
                    el.disabled = true;
                }
            });
            
            if (elements.fallbackBanner) {
                elements.fallbackBanner.style.display = 'block';
                elements.fallbackBanner.innerHTML = `
                    <div class="fallback-banner-content">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Limited connectivity - Some features may be unavailable</span>
                        <button class="fallback-banner-retry" onclick="window.location.reload()">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        observeAppState: function() {
            if (!window.AppState) return;
            
            const handler = {
                set: (target, property, value) => {
                    target[property] = value;
                    
                    switch (property) {
                        case 'isAuthenticated':
                            this.handleAuthChange(value);
                            break;
                        case 'isOnline':
                            this.handleConnectivityChange(value);
                            break;
                        case 'isInCall':
                            this.handleCallStateChange(value);
                            break;
                        case 'contacts':
                            if (Array.isArray(value)) {
                                RenderingPipeline.renderContactsList(value);
                            }
                            break;
                    }
                    
                    return true;
                }
            };
            
            try {
                window.AppState = new Proxy(window.AppState, handler);
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to observe AppState', error);
                }
            }
        },
        
        handleAuthChange: function(isAuthenticated) {
            if (DEBUG) {
                logOnce('info', `Authentication changed: ${isAuthenticated}`);
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = !isAuthenticated || fallbackModeActive;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
        },
        
        handleConnectivityChange: function(isOnline) {
            if (DEBUG) {
                logOnce('info', `Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
            }
        },
        
        handleCallStateChange: function(isInCall) {
            if (isInCall && elements.callDuration) {
                elements.callDuration.textContent = '00:00';
            }
        },
        
        cleanup: function() {
            this._subscriptions.forEach(sub => {
                if (sub.unsubscribe && typeof sub.unsubscribe === 'function') {
                    try { sub.unsubscribe(); } catch (e) {}
                }
            });
            this._subscriptions.clear();
            this._initialized = false;
            
            const handler = UIState.cachedElements.get('parentMessageHandler');
            if (handler) {
                window.removeEventListener('message', handler);
                UIState.cachedElements.delete('parentMessageHandler');
            }
        }
    };

    // ==================== RESPONSIVE ENGINE ====================
    const ResponsiveEngine = {
        _currentBreakpoint: 'desktop',
        _orientation: 'landscape',
        
        initialize: function() {
            this.detectBreakpoint();
            this.detectOrientation();
            this.setupMediaQueryListeners();
            this.setupInputDetection();
            this.applyResponsiveLayout();
            
            window.addEventListener('resize', this.debouncedResize.bind(this));
            if (DEBUG) {
                logOnce('info', 'Responsive engine initialized', { 
                    breakpoint: this._currentBreakpoint,
                    orientation: this._orientation
                });
            }
        },
        
        detectBreakpoint: function() {
            const width = window.innerWidth;
            
            if (width <= UIState.breakpoints.mobile) {
                this._currentBreakpoint = 'mobile';
            } else if (width <= UIState.breakpoints.tablet) {
                this._currentBreakpoint = 'tablet';
            } else if (width <= UIState.breakpoints.desktop) {
                this._currentBreakpoint = 'desktop';
            } else {
                this._currentBreakpoint = 'wide';
            }
            
            return this._currentBreakpoint;
        },
        
        detectOrientation: function() {
            this._orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
            return this._orientation;
        },
        
        setupMediaQueryListeners: function() {
            const mobileQuery = window.matchMedia(`(max-width: ${UIState.breakpoints.mobile}px)`);
            mobileQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const tabletQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.mobile + 1}px) and (max-width: ${UIState.breakpoints.tablet}px)`);
            tabletQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const desktopQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.tablet + 1}px) and (max-width: ${UIState.breakpoints.desktop}px)`);
            desktopQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const wideQuery = window.matchMedia(`(min-width: ${UIState.breakpoints.desktop + 1}px)`);
            wideQuery.addEventListener('change', this.handleBreakpointChange.bind(this));
            
            const orientationQuery = window.matchMedia('(orientation: portrait)');
            orientationQuery.addEventListener('change', this.handleOrientationChange.bind(this));
        },
        
        setupInputDetection: function() {
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            UIState.inputMode = isTouchDevice ? 'touch' : 'mouse';
            
            if (isTouchDevice) {
                document.body.classList.add('touch-device');
            }
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    UIState.inputMode = 'keyboard';
                    document.body.classList.add('keyboard-navigation');
                }
            });
            
            document.addEventListener('mousedown', () => {
                UIState.inputMode = 'mouse';
                document.body.classList.remove('keyboard-navigation');
            });
            
            document.addEventListener('touchstart', () => {
                UIState.inputMode = 'touch';
                document.body.classList.add('touch-device');
            });
        },
        
        handleBreakpointChange: function() {
            const oldBreakpoint = this._currentBreakpoint;
            this.detectBreakpoint();
            
            if (oldBreakpoint !== this._currentBreakpoint) {
                if (DEBUG) {
                    logOnce('info', `Breakpoint changed: ${oldBreakpoint} → ${this._currentBreakpoint}`);
                }
                this.applyResponsiveLayout();
            }
        },
        
        handleOrientationChange: function() {
            const oldOrientation = this._orientation;
            this.detectOrientation();
            
            if (oldOrientation !== this._orientation) {
                if (DEBUG) {
                    logOnce('info', `Orientation changed: ${oldOrientation} → ${this._orientation}`);
                }
                this.applyResponsiveLayout();
            }
        },
        
        debouncedResize: function() {
            setTimeout(() => {
                this.handleBreakpointChange();
                this.handleOrientationChange();
            }, 150);
        },
        
        applyResponsiveLayout: function() {
            document.body.dataset.breakpoint = this._currentBreakpoint;
            document.body.dataset.orientation = this._orientation;
            document.body.dataset.inputMode = UIState.inputMode;
            
            switch (this._currentBreakpoint) {
                case 'mobile':
                    this.applyMobileLayout();
                    break;
                case 'tablet':
                    this.applyTabletLayout();
                    break;
                case 'desktop':
                case 'wide':
                    this.applyDesktopLayout();
                    break;
            }
        },
        
        applyMobileLayout: function() {
            document.querySelectorAll('.desktop-only').forEach(el => {
                el.style.display = 'none';
            });
            
            document.querySelectorAll('.mobile-only').forEach(el => {
                el.style.display = 'block';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.add('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = '1fr';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '100%';
                el.style.maxWidth = '100%';
                el.style.height = '100%';
                el.style.maxHeight = '100%';
                el.style.borderRadius = '0';
            });
        },
        
        applyTabletLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
            
            document.querySelectorAll('.modal, .feature-panel').forEach(el => {
                el.style.width = '';
                el.style.maxWidth = '';
                el.style.height = '';
                el.style.maxHeight = '';
                el.style.borderRadius = '';
            });
        },
        
        applyDesktopLayout: function() {
            document.querySelectorAll('.desktop-only, .mobile-only').forEach(el => {
                el.style.display = '';
            });
            
            if (elements.sidebar) {
                elements.sidebar.classList.remove('sidebar-mobile');
            }
            
            if (elements.videoGrid) {
                const videoCount = elements.videoGrid.querySelectorAll('.video-container').length;
                if (videoCount <= 2) {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                } else {
                    elements.videoGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                }
            }
        },
        
        isMobile: function() {
            return this._currentBreakpoint === 'mobile';
        },
        
        isTablet: function() {
            return this._currentBreakpoint === 'tablet';
        },
        
        isDesktop: function() {
            return this._currentBreakpoint === 'desktop' || this._currentBreakpoint === 'wide';
        }
    };

    // ==================== EVENT SYSTEM ====================
    const EventSystem = {
        _listeners: new Map(),
        _debounced: new Map(),
        _throttled: new Map(),
        
        initialize: function() {
            this.setupGlobalListeners();
            this.setupUIEventListeners();
            if (DEBUG) {
                logOnce('info', 'Event system initialized');
            }
        },
        
        setupGlobalListeners: function() {
            this.addListener(window, 'online', () => {
                if (window.AppState) window.AppState.isOnline = true;
            });
            
            this.addListener(window, 'offline', () => {
                if (window.AppState) window.AppState.isOnline = false;
            });
            
            this.addListener(window, 'beforeunload', () => {
                this.cleanup();
            });
            
            this.addListener(document, 'visibilitychange', () => {
                // Handle visibility change if needed
            });
        },
        
        setupUIEventListeners: function() {
            if (elements.menuDotsBtn) {
                this.addListener(elements.menuDotsBtn, 'click', UIEventHandlers.toggleMenuDots);
            }

            // ── moreBtn: in-call controls bar ⋯ → opens menuDotsDropdown ─────
            if (elements.moreBtn) {
                this.addListener(elements.moreBtn, 'click', UIEventHandlers.toggleMenuDots);
            }

            // ── Record menu item ──────────────────────────────────────────────
            if (elements.menuRecord) {
                this.addListener(elements.menuRecord, 'click', () => {
                    UIEventHandlers.closeMenuDots && UIEventHandlers.closeMenuDots();
                    UIEventHandlers.toggleRecording();
                });
            }

            if (elements.menuParticipants) {
                this.addListener(elements.menuParticipants, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIEventHandlers.openAddParticipantPanel();
                });
            }
            
            if (elements.menuChat) {
                this.addListener(elements.menuChat, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openChatPanel();
                });
            }
            
            if (elements.menuWhiteboard) {
                this.addListener(elements.menuWhiteboard, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openWhiteboardPanel();
                });
            }
            
            if (elements.menuNotes) {
                this.addListener(elements.menuNotes, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openNotesPanel();
                });
            }
            
            if (elements.menuPolls) {
                this.addListener(elements.menuPolls, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openPollsPanel();
                });
            }
            
            if (elements.menuRelationship) {
                this.addListener(elements.menuRelationship, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openRelationshipPanel();
                });
            }
            
            if (elements.newCallBtn) {
                this.addListener(elements.newCallBtn, 'click', UIEventHandlers.openNewCallModal);
            }
            
            if (elements.closeNewCallModal) {
                this.addListener(elements.closeNewCallModal, 'click', UIEventHandlers.closeNewCallModal);
            }
            
            if (elements.quickVoiceBtn) {
                this.addListener(elements.quickVoiceBtn, 'click', function() {
                    UIEventHandlers.openNewCallModal();
                    // Pre-switch to contacts tab and store preferred type
                    window.__quickCallType = 'voice';
                    setTimeout(() => { UIEventHandlers.switchNewCallTab && UIEventHandlers.switchNewCallTab('contacts'); }, 100);
                });
            }
            
            if (elements.quickVideoBtn) {
                this.addListener(elements.quickVideoBtn, 'click', function() {
                    UIEventHandlers.openNewCallModal();
                    window.__quickCallType = 'video';
                    setTimeout(() => { UIEventHandlers.switchNewCallTab && UIEventHandlers.switchNewCallTab('contacts'); }, 100);
                });
            }
            
            if (elements.quickGroupBtn) {
                this.addListener(elements.quickGroupBtn, 'click', function() {
                    UIEventHandlers.openNewCallModal();
                    setTimeout(() => { UIEventHandlers.switchNewCallTab && UIEventHandlers.switchNewCallTab('groups'); }, 100);
                });
            }
            
            // ==================== FIXED BUTTON BINDINGS ====================
            // These fixes prevent call initiation errors by using arrow functions
            if (elements.startVoiceCallBtn) {
                this.addListener(elements.startVoiceCallBtn, 'click', (e) => {
                    e.preventDefault();
                    UIEventHandlers.startCallGeneric('voice');
                });
            }
            
            if (elements.startVideoCallBtn) {
                this.addListener(elements.startVideoCallBtn, 'click', (e) => {
                    e.preventDefault();
                    UIEventHandlers.startCallGeneric('video');
                });
            }
            // ==================== END FIXED BUTTON BINDINGS ====================
            
            if (elements.startGroupCallBtn) {
                this.addListener(elements.startGroupCallBtn, 'click', UIEventHandlers.startGroupCall.bind(UIEventHandlers));
            }
            
            if (elements.generateVoiceLinkBtn) {
                this.addListener(elements.generateVoiceLinkBtn, 'click', UIEventHandlers.generateVoiceCallLink.bind(UIEventHandlers));
            }
            
            if (elements.generateVideoLinkBtn) {
                this.addListener(elements.generateVideoLinkBtn, 'click', UIEventHandlers.generateVideoCallLink.bind(UIEventHandlers));
            }
            
            if (elements.copyLinkBtn) {
                this.addListener(elements.copyLinkBtn, 'click', UIEventHandlers.copyCallLink);
            }
            
            if (elements.shareLinkBtn) {
                this.addListener(elements.shareLinkBtn, 'click', UIEventHandlers.shareCallLink);
            }
            
            if (elements.instantGroupOption) {
                this.addListener(elements.instantGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.scheduledGroupOption) {
                this.addListener(elements.scheduledGroupOption, 'click', UIEventHandlers.selectGroupOption);
            }
            
            if (elements.muteBtn) {
                this.addListener(elements.muteBtn, 'click', UIEventHandlers.toggleMute);
            }
            
            if (elements.videoBtn) {
                this.addListener(elements.videoBtn, 'click', UIEventHandlers.toggleVideo);
            }
            
            if (elements.screenShareBtn) {
                this.addListener(elements.screenShareBtn, 'click', UIEventHandlers.toggleScreenShare);
            }
            
            if (elements.speakerBtn) {
                this.addListener(elements.speakerBtn, 'click', UIEventHandlers.toggleSpeaker);
            }
            
            if (elements.moodBtn) {
                this.addListener(elements.moodBtn, 'click', UIEventHandlers.openMoodSelectionModal);
            }
            
            if (elements.intentionBtn) {
                this.addListener(elements.intentionBtn, 'click', UIEventHandlers.openIntentionSelectionModal);
            }
            
            if (elements.endCallBtn) {
                this.addListener(elements.endCallBtn, 'click', UIEventHandlers.endCall);
            }
            // Also wire the header end button
            const callHeaderEndBtn = document.getElementById('callHeaderEndBtn');
            if (callHeaderEndBtn) {
                this.addListener(callHeaderEndBtn, 'click', UIEventHandlers.endCall);
            }
            
            if (elements.focusModeBtn) {
                this.addListener(elements.focusModeBtn, 'click', UIEventHandlers.toggleFocusMode);
            }
            
            if (elements.declineCallBtn) {
                this.addListener(elements.declineCallBtn, 'click', UIEventHandlers.declineIncomingCall);
            }
            
            if (elements.acceptCallBtn) {
                this.addListener(elements.acceptCallBtn, 'click', UIEventHandlers.acceptIncomingCall);
            }
            
            if (elements.acceptVideoCallBtn) {
                this.addListener(elements.acceptVideoCallBtn, 'click', UIEventHandlers.acceptIncomingCallAsVideo);
            }
            
            if (elements.cancelMoodBtn) {
                this.addListener(elements.cancelMoodBtn, 'click', UIEventHandlers.closeMoodSelectionModal);
            }
            
            if (elements.setMoodBtn) {
                this.addListener(elements.setMoodBtn, 'click', UIEventHandlers.setMood);
            }
            
            if (elements.cancelIntentionBtn) {
                this.addListener(elements.cancelIntentionBtn, 'click', UIEventHandlers.closeIntentionSelectionModal);
            }
            
            if (elements.setIntentionBtn) {
                this.addListener(elements.setIntentionBtn, 'click', UIEventHandlers.setIntention);
            }
            
            document.querySelectorAll('.mood-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectMoodOption);
            });
            
            document.querySelectorAll('.intention-option').forEach(option => {
                this.addListener(option, 'click', UIEventHandlers.selectIntentionOption);
            });
            
            if (elements.skipNotesBtn) {
                this.addListener(elements.skipNotesBtn, 'click', UIEventHandlers.skipPrivateNotes);
            }
            
            if (elements.saveNotesBtn) {
                this.addListener(elements.saveNotesBtn, 'click', UIEventHandlers.savePrivateNotes);
            }
            
            if (elements.summaryDoneBtn) {
                this.addListener(elements.summaryDoneBtn, 'click', UIEventHandlers.closeCallSummary);
            }
            
            if (elements.settingsToggle) {
                this.addListener(elements.settingsToggle, 'click', UIEventHandlers.toggleSettingsPanel);
            }
            
            if (elements.resetSettingsBtn) {
                this.addListener(elements.resetSettingsBtn, 'click', () => {});
            }
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                this.addListener(btn, 'click', function() {
                    const category = this.dataset.category;
                    UIEventHandlers.switchCallCategory(category);
                });
            });
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                this.addListener(tab, 'click', function() {
                    const tabId = this.dataset.tab;
                    UIEventHandlers.switchNewCallTab(tabId);
                });
            });
            
            if (elements.pipCloseBtn) {
                this.addListener(elements.pipCloseBtn, 'click', () => {});
            }
            
            if (elements.contactSearch) {
                this.addListener(elements.contactSearch, 'input', 
                    this.debounce('contactSearch', UIEventHandlers.searchContacts, 300)
                );
            }
            
            if (elements.groupContactSearch) {
                this.addListener(elements.groupContactSearch, 'input',
                    this.debounce('groupContactSearch', UIEventHandlers.searchGroupContacts, 300)
                );
            }
            
            if (elements.mpesaOption) {
                this.addListener(elements.mpesaOption, 'click', UIEventHandlers.selectPaymentOption);
            }
            
            if (elements.cancelPaymentBtn) {
                this.addListener(elements.cancelPaymentBtn, 'click', UIEventHandlers.closePaymentModal);
            }
            
            if (elements.processPaymentBtn) {
                this.addListener(elements.processPaymentBtn, 'click', UIEventHandlers.processPayment);
            }
            
            if (elements.cancelUpgradeBtn) {
                this.addListener(elements.cancelUpgradeBtn, 'click', UIEventHandlers.closePremiumLimitModal);
            }
            
            if (elements.upgradeNowBtn) {
                this.addListener(elements.upgradeNowBtn, 'click', UIEventHandlers.openPaymentModal);
            }
            
            this.addListener(document, 'click', (e) => {
                if (elements.menuDotsBtn && elements.menuDotsDropdown) {
                    if (!elements.menuDotsBtn.contains(e.target) && 
                        !elements.menuDotsDropdown.contains(e.target)) {
                        UIEventHandlers.closeMenuDots();
                    }
                }
            });
        },
        
        addListener: function(element, eventType, handler, options = {}) {
            if (!element || typeof handler !== 'function') return null;
            
            const key = `${eventType}_${handler.toString()}`;
            
            element.addEventListener(eventType, handler, options);
            
            if (!this._listeners.has(key)) {
                this._listeners.set(key, { element, eventType, handler, options });
            }
            
            return handler;
        },
        
        removeListener: function(element, eventType, handler) {
            if (!element) return;
            
            element.removeEventListener(eventType, handler);
            
            const key = `${eventType}_${handler.toString()}`;
            this._listeners.delete(key);
        },
        
        debounce: function(id, fn, delay) {
            if (this._debounced.has(id)) {
                return this._debounced.get(id);
            }
            
            let timeout;
            const debouncedFn = function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn.apply(this, args), delay);
            };
            
            this._debounced.set(id, debouncedFn);
            return debouncedFn;
        },
        
        throttle: function(id, fn, limit) {
            if (this._throttled.has(id)) {
                return this._throttled.get(id);
            }
            
            let inThrottle;
            const throttledFn = function(...args) {
                if (!inThrottle) {
                    fn.apply(this, args);
                    inThrottle = setTimeout(() => inThrottle = false, limit);
                }
            };
            
            this._throttled.set(id, throttledFn);
            return throttledFn;
        },
        
        trigger: function(element, eventType, detail = {}) {
            if (!element) return false;
            
            const event = new CustomEvent(eventType, { detail, bubbles: true, cancelable: true });
            return element.dispatchEvent(event);
        },
        
        cleanup: function() {
            this._listeners.forEach(({ element, eventType, handler, options }) => {
                try {
                    if (element) {
                        element.removeEventListener(eventType, handler, options);
                    }
                } catch (e) {}
            });
            
            this._listeners.clear();
            this._debounced.clear();
            this._throttled.clear();
            
            if (DEBUG) {
                logOnce('info', 'Event system cleaned up');
            }
        }
    };

    // ==================== UI EVENT HANDLERS ====================
    const UIEventHandlers = {
        // Show the calls sidebar (list view) — called when returning to calls after a call ends
        showCallsSidebar: function() {
            UIState.currentView = 'sidebar';
            // NEVER hide sidebar or main content - always use overlay
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
            
            // Use new overlay system instead
            if (window.CallOverlayManager && window.CallOverlayManager.endCall) {
                window.CallOverlayManager.endCall();
            }
            if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'none';
        },

        // Reset all call-related UI back to idle state
        resetCallUI: function() {
            UIState.currentView = 'sidebar';
            // NEVER hide sidebar or main content - always use overlay
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
            
            // Use new overlay system instead
            if (window.CallOverlayManager && window.CallOverlayManager.endCall) {
                window.CallOverlayManager.endCall();
            }
            if (elements.callStatusText) elements.callStatusText.textContent = '';
            if (elements.callTimer) elements.callTimer.textContent = '0:00';
            // Clear dedup locks
            if (window.__uiCallDispatchLock) window.__uiCallDispatchLock = { ts: 0, userId: null };
        },

        toggleMenuDots: function() {
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.toggle('active');
                UILogger.interaction('toggleMenuDots', 'menuDotsBtn');
            }
        },
        
        closeMenuDots: function() {
            if (elements.menuDotsDropdown) {
                elements.menuDotsDropdown.classList.remove('active');
            }
        },
        
        openNewCallModal: function() {
            if (!canPerformAction('openNewCallModal')) return;
            
            if (elements.newCallModal) {
                elements.newCallModal.classList.add('active');
                UIState.activeModals.add('newCallModal');
                
                // Reset modal title if previously set by pending call
                const modalTitle = elements.newCallModal.querySelector('.modal-title');
                if (modalTitle && UIState.pendingCallUser) {
                    // If we have a pending call, keep the custom title
                    modalTitle.innerHTML = `<i class="fas fa-phone-alt"></i> Call ${SecuritySanitizer.sanitizeString(UIState.pendingCallUser.name)}`;
                } else if (modalTitle) {
                    modalTitle.innerHTML = '<i class="fas fa-phone-alt"></i> New Call';
                }
                
                if (window.AppState?.contacts?.length > 0) {
                    RenderingPipeline.renderContactsList(window.AppState.contacts);
                }
                
                UIEventHandlers.switchNewCallTab('contacts');
                UILogger.interaction('openNewCallModal', 'newCallModal');
            }
        },
        
        closeNewCallModal: function() {
            if (elements.newCallModal) {
                elements.newCallModal.classList.remove('active');
                UIState.activeModals.delete('newCallModal');
                
                // Reset modal title
                const modalTitle = elements.newCallModal.querySelector('.modal-title');
                if (modalTitle) {
                    modalTitle.innerHTML = '<i class="fas fa-phone-alt"></i> New Call';
                }
                
                document.querySelectorAll('.contact-checkbox:checked, .group-contact:checked').forEach(el => {
                    el.checked = false;
                });
                
                document.querySelectorAll('.contact-item.selected').forEach(el => {
                    el.classList.remove('selected');
                });
                
                if (elements.contactSearch) elements.contactSearch.value = '';
                if (elements.groupContactSearch) elements.groupContactSearch.value = '';
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
                if (elements.startGroupCallBtn) elements.startGroupCallBtn.disabled = true;
            }
        },
        
        searchContacts: function() {
            const query = elements.contactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        searchGroupContacts: function() {
            const query = elements.groupContactSearch?.value.toLowerCase() || '';
            
            document.querySelectorAll('.contact-item').forEach(item => {
                const nameEl = item.querySelector('.call-name');
                if (nameEl) {
                    const name = nameEl.textContent.toLowerCase();
                    item.style.display = name.includes(query) ? 'flex' : 'none';
                }
            });
        },
        
        selectGroupOption: function(e) {
            const option = e.currentTarget;
            
            if (option.id === 'instantGroupOption') {
                if (elements.scheduledGroupOption) elements.scheduledGroupOption.classList.remove('selected');
            } else {
                if (elements.instantGroupOption) elements.instantGroupOption.classList.remove('selected');
            }
            
            option.classList.add('selected');
            UIState.groupCallOption = option.id;
            
            if (elements.startGroupCallBtn) {
                elements.startGroupCallBtn.disabled = false;
            }
        },
        
        getSelectedContacts: function() {
            const selected = [];
            document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('contact-', '');
                const contact = window.AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        getSelectedGroupContacts: function() {
            const selected = [];
            document.querySelectorAll('.group-contact:checked').forEach(checkbox => {
                const contactId = checkbox.id.replace('group-contact-', '');
                const contact = window.AppState?.contacts?.find(c => c.id === contactId);
                if (contact) selected.push(contact);
            });
            return selected;
        },
        
        // ==================== FIXED CALL METHODS ====================
        startCallGeneric: function(type) {
            if (!canPerformAction('startCall')) return;
            
            // Use __quickCallType if set by sidebar buttons
            const callType = type || window.__quickCallType || 'voice';
            window.__quickCallType = null;
            
            const selectedContacts = UIEventHandlers.getSelectedContacts();
            
            if (selectedContacts.length === 0) {
                showNotification('Please select at least one contact to call', 'warning');
                return;
            }
            
            // Check for active call
            if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            const contact = selectedContacts[0];
            const userId = contact.id || contact.userId || contact;
            const userName = contact.name || contact.displayName || contact.username || 'User';
            
            console.log(`[Calls UI] Starting ${callType} call with ${userName} (${userId})`);
            
            // Close modal first
            UIEventHandlers.closeNewCallModal();
            
            // Use startCallWithUser for reliable call initiation
            if (typeof startCallWithUser === 'function') {
                window.__pendingCallReturnTo = 'calls';
                window.__callOriginReturnTo = 'calls';
                startCallWithUser(userId, userName, callType);
            } else if (coreInstance && (coreInstance.startCall || coreInstance.initiateCall)) {
                showNotification(`Starting ${callType} call...`, 'info');
                const callFn = coreInstance.startCall
                    ? coreInstance.startCall(parseInt(userId), callType)
                    : coreInstance.initiateCall(callType, [parseInt(userId)]);
                callFn.then(result => {
                    if (result && result.success) {
                        showNotification(`${callType} call started`, 'success');
                    } else {
                        console.error('[Calls UI] Call failed:', result);
                        showNotification(result?.error || 'Failed to start call', 'error');
                    }
                }).catch(error => {
                    console.error('[Calls UI] Call error:', error);
                    showNotification('Failed to start call', 'error');
                });
            } else {
                showNotification('Call system not ready. Please try again.', 'error');
            }
        },
        // ==================== END FIXED CALL METHODS ====================
        
        startGroupCall: function() {
            if (!canPerformAction('startGroupCall')) return;
            
            if (!UIState.groupCallOption) {
                showNotification('Please select a group call option', 'warning');
                return;
            }
            
            const selectedContacts = UIEventHandlers.getSelectedGroupContacts();
            
            if (selectedContacts.length === 0) {
                showNotification('Please select at least one contact', 'warning');
                return;
            }
            
            // Check for active call
            if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
                showNotification('You are already in a call', 'warning');
                return;
            }
            
            if (coreInstance && coreInstance.startGroupCall) {
                showNotification('Starting group call...', 'info');
                
                coreInstance.startGroupCall(selectedContacts, 'voice')
                    .then(result => {
                        if (result.success) {
                            showNotification('Group call started', 'success');
                        } else {
                            showNotification(result.error || 'Failed to start group call', 'error');
                        }
                    })
                    .catch(error => {
                        showNotification('Failed to start group call', 'error');
                        UILogger.error('Group call failed', error);
                    });
            } else {
                showNotification('Group calls not available', 'warning');
            }
            
            UIEventHandlers.closeNewCallModal();
        },
        
        showCallUI: function() {
            // NEVER hide sidebar or main content - always use overlay
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
            
            // Use new internal screen system instead
            if (window.CallScreenManager && window.CallScreenManager.startCall) {
                window.CallScreenManager.startCall({
                        userName: 'Active Call',
                        userId: 'active',
                        callType: 'voice',
                        status: 'In Call',
                        userAvatar: null
                    });
                }
            
            UIState.currentView = 'call';
        },
        
        startCallTimer: function() {
            // callStartTime is set by handleCallAccepted (when receiver picks up).
            // Do NOT override it here — that would reset the timer on every call.
            if (!UIState.callStartTime) {
                UIState.callStartTime = Date.now(); // fallback if somehow missed
            }
            
            if (UIState.callDurationInterval) {
                clearInterval(UIState.callDurationInterval);
            }
            
            UIState.callDurationInterval = setInterval(() => {
                if (!UIState.callStartTime || !elements.callDuration) return;
                
                const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                elements.callDuration.textContent = `${minutes}:${seconds}`;
            }, 1000);
        },
        
        toggleMute: function() {
            if (!canPerformAction('toggleMute')) return;

            UIState.isMuted = !UIState.isMuted;

            // Mute/unmute actual audio tracks
            if (coreInstance && coreInstance.toggleMic) {
                coreInstance.toggleMic();
            } else if (UIState.localStream) {
                UIState.localStream.getAudioTracks().forEach(t => { t.enabled = !UIState.isMuted; });
            }

            // Always update icon
            const muteIcon = elements.muteBtn && elements.muteBtn.querySelector('i');
            if (muteIcon) muteIcon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
            if (elements.muteBtn) elements.muteBtn.classList.toggle('active', UIState.isMuted);

            showNotification(UIState.isMuted ? 'Microphone muted' : 'Microphone on', 'info');
        },
        
        toggleVideo: function() {
            if (!canPerformAction('toggleVideo')) return;

            const hasVideoTrack = UIState.localStream && UIState.localStream.getVideoTracks().length > 0;

            if (hasVideoTrack) {
                // Toggle existing video track on/off
                UIState.isVideoOff = !UIState.isVideoOff;
                UIState.localStream.getVideoTracks().forEach(t => { t.enabled = !UIState.isVideoOff; });
                const icon = elements.videoBtn && elements.videoBtn.querySelector('i');
                if (icon) icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                if (elements.videoBtn) elements.videoBtn.classList.toggle('active', !UIState.isVideoOff);
                // Show/hide PiP
                const pip = document.getElementById('pipContainer');
                if (pip) pip.style.display = UIState.isVideoOff ? 'none' : 'block';
                showNotification(UIState.isVideoOff ? 'Camera off' : 'Camera on', 'info');
            } else {
                // No video track yet — request camera access and upgrade to video call
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    showNotification('Camera not supported on this device', 'error'); return;
                }
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
                    .then(camStream => {
                        const vTrack = camStream.getVideoTracks()[0];
                        if (!vTrack) return;

                        // Merge video track into existing local stream
                        if (!UIState.localStream) {
                            UIState.localStream = camStream;
                        } else {
                            try { UIState.localStream.addTrack(vTrack); } catch(e) {}
                        }
                        UIState.isVideoOff = false;

                        // Show PiP with local camera — use the FULL localStream so audio stays in sync
                        const pipContainer = document.getElementById('pipContainer');
                        const pipVideo     = document.getElementById('pipVideo');
                        if (pipVideo) {
                            pipVideo.srcObject   = UIState.localStream;
                            pipVideo.muted       = true;
                            pipVideo.autoplay    = true;
                            pipVideo.playsInline = true;
                            pipVideo.play().catch(() => {});
                        }
                        if (pipContainer) pipContainer.style.display = 'block';

                        const icon = elements.videoBtn && elements.videoBtn.querySelector('i');
                        if (icon) icon.className = 'fas fa-video';
                        if (elements.videoBtn) elements.videoBtn.classList.add('active');

                        // Add video track to peer connection and renegotiate
                        const cs = window.callsState;
                        const callId = cs && (cs.serverCallId || cs.activeCallId);
                        const pc = (window.callCore && window.callCore.getPeerConnection && window.callCore.getPeerConnection())
                                || (window.KynectaCallSession && window.KynectaCallSession.peerConnection);
                        if (pc && pc.addTrack) {
                            try {
                                const existingVideoSender = pc.getSenders && pc.getSenders().find(sender => sender.track && sender.track.kind === 'video');
                                if (existingVideoSender && existingVideoSender.replaceTrack) {
                                    existingVideoSender.replaceTrack(vTrack);
                                } else {
                                    pc.addTrack(vTrack, UIState.localStream);
                                }
                                // Renegotiate: create new offer with video and send via core signaling
                                pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
                                    .then(offer => pc.setLocalDescription(offer))
                                    .then(() => {
                                        // Send via callCore signaling (goes through WS to remote peer)
                                        if (coreInstance && coreInstance.sendAction) {
                                            coreInstance.sendAction('SIGNAL_OFFER', {
                                                offer:  pc.localDescription,
                                                callId: callId,
                                                isVideoUpgrade: true
                                            }).catch(() => {});
                                        } else if (window.callCore && window.callCore.sendToParent) {
                                            window.callCore.sendToParent('SIGNAL_OFFER', {
                                                offer:  pc.localDescription,
                                                callId: callId,
                                                isVideoUpgrade: true
                                            });
                                        }
                                        console.log('[Calls UI] Video upgrade offer sent via renegotiation');
                                    })
                                    .catch(err => console.warn('[Calls UI] Video upgrade renegotiation failed:', err));
                            } catch(e) {
                                console.warn('[Calls UI] Failed to add video track to PC:', e);
                            }
                        }

                        // Remote video upgrade now rides on the SDP renegotiation offer.
                        UIState.callType = 'video';
                        window.__activePeerType = 'video';
                        // Store track ref for possible rollback if remote declines
                        UIState._videoUpgradeTrack = vTrack;
                        showNotification('Camera on', 'info');
                    })
                    .catch(err => {
                        if (err.name === 'NotAllowedError') showNotification('Camera permission denied', 'error');
                        else if (err.name === 'NotFoundError') showNotification('No camera found', 'error');
                        else showNotification('Could not start camera', 'error');
                    });
            }
        },
        
        toggleScreenShare: function() {
            if (!canPerformAction('toggleScreenShare')) return;
            
            if (UIState.isScreenSharing) {
                UIEventHandlers.stopScreenShare();
            } else {
                UIEventHandlers.startScreenShare();
            }
        },
        
        startScreenShare: function() {
            if (!navigator.mediaDevices?.getDisplayMedia) {
                showNotification('Screen sharing is not supported in your browser', 'error');
                return;
            }

            const _onShareStarted = (stream) => {
                UIState.screenStream = stream;
                UIState.isScreenSharing = true;
                if (elements.screenShareBtn) elements.screenShareBtn.classList.add('active');
                if (elements.screenShareBtn) elements.screenShareBtn.setAttribute('aria-label', 'Stop screen share');
                showNotification('Screen sharing started — annotation toolbar enabled', 'success');
                if (window._kynAnnounce) window._kynAnnounce('Screen sharing started.');

                // ── Screen Share Annotation Toolbar ───────────────────────────
                // Renders a floating draw-over-screen toolbar once sharing starts.
                _KynScreenAnnotation.attach(stream);

                // Auto-stop annotation when track ends (user stops via browser UI)
                stream.getVideoTracks().forEach(t => {
                    t.addEventListener('ended', () => {
                        UIEventHandlers.stopScreenShare();
                        _KynScreenAnnotation.detach();
                    });
                });
            };

            if (coreInstance && coreInstance.startScreenShare) {
                coreInstance.startScreenShare()
                    .then(result => {
                        if (result && result.success && result.stream) {
                            _onShareStarted(result.stream);
                        } else if (result && result.success) {
                            UIState.isScreenSharing = true;
                            if (elements.screenShareBtn) elements.screenShareBtn.classList.add('active');
                            showNotification('Screen sharing started', 'success');
                        } else {
                            showNotification((result && result.error) || 'Failed to start screen sharing', 'error');
                        }
                    })
                    .catch(err => showNotification('Failed to start screen sharing', 'error'));
            } else {
                navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true })
                    .then(_onShareStarted)
                    .catch(err => showNotification('Failed to start screen sharing', 'error'));
            }
        },

        stopScreenShare: function() {
            if (coreInstance && coreInstance.stopScreenShare) coreInstance.stopScreenShare();
            if (UIState.screenStream) {
                UIState.screenStream.getTracks().forEach(t => t.stop());
                UIState.screenStream = null;
            }
            UIState.isScreenSharing = false;
            if (elements.screenShareBtn) {
                elements.screenShareBtn.classList.remove('active');
                elements.screenShareBtn.setAttribute('aria-label', 'Share screen');
            }
            _KynScreenAnnotation.detach();
            if (window._kynAnnounce) window._kynAnnounce('Screen sharing stopped.');
            showNotification('Screen sharing stopped', 'info');
        },
        
        toggleSpeaker: function() {
            UIState.isSpeakerOn = !UIState.isSpeakerOn;

            const icon = elements.speakerBtn && elements.speakerBtn.querySelector('i');
            if (icon) icon.className = UIState.isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-headphones';
            if (elements.speakerBtn) {
                elements.speakerBtn.classList.toggle('active', UIState.isSpeakerOn);
                elements.speakerBtn.setAttribute('aria-label', UIState.isSpeakerOn ? 'Switch to earpiece' : 'Switch to speaker');
                elements.speakerBtn.setAttribute('title', UIState.isSpeakerOn ? 'Earpiece (S)' : 'Speaker (S)');
            }

            // Collect ALL remote audio elements (1-on-1 + group call tiles)
            const audioEls = Array.from(document.querySelectorAll(
                '#remoteAudio, audio[data-remote], .participant-tile audio, .remote-stream-audio'
            )).filter(Boolean);
            if (!audioEls.length) {
                const ra = document.getElementById('remoteAudio');
                if (ra) audioEls.push(ra);
            }

            const _routeAudio = function(devices) {
                const earpiece = devices.find(d => d.kind === 'audiooutput' && /earpiece|handset|receiver/i.test(d.label));
                const speaker  = devices.find(d => d.kind === 'audiooutput' && /speaker/i.test(d.label));
                const targetDevice = UIState.isSpeakerOn
                    ? (speaker  ? speaker.deviceId  : '')
                    : (earpiece ? earpiece.deviceId : '');

                audioEls.forEach(function(el) {
                    if (typeof el.setSinkId === 'function') {
                        el.setSinkId(targetDevice).catch(function(){});
                    }
                    el.volume = UIState.isSpeakerOn ? 1.0 : 0.7;
                });
            };

            // Use DeviceMediaManager.AudioOutputManager if available
            if (window.__DeviceMediaManager && window.__DeviceMediaManager.audioOutput &&
                typeof window.__DeviceMediaManager.audioOutput.getDevices === 'function') {
                window.__DeviceMediaManager.audioOutput.getDevices()
                    .then(_routeAudio)
                    .catch(function() {
                        audioEls.forEach(function(el) { el.volume = UIState.isSpeakerOn ? 1.0 : 0.7; });
                    });
            } else if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
                navigator.mediaDevices.enumerateDevices()
                    .then(_routeAudio)
                    .catch(function(){});
            } else {
                // Fallback: just adjust volume
                audioEls.forEach(function(el) { el.volume = UIState.isSpeakerOn ? 1.0 : 0.7; });
            }

            if (coreInstance && coreInstance.setSpeakerEnabled) coreInstance.setSpeakerEnabled(UIState.isSpeakerOn);

            showNotification(UIState.isSpeakerOn ? 'Speaker on' : 'Earpiece / headphones', 'info');
        },

        // ── RECORDING (audio+video with visual indicator) ─────────────────
        // FIX-SILENT-RECORDING: shared by both recording entry points in this
        // file. Calls the same backend endpoint the host-only #kyn-record-btn
        // already uses, so every participant gets notified via their existing
        // 'call:recording_started'/'_stopped' socket listener no matter which
        // "record" control was clicked. Returns true only if the server
        // confirmed the notification went out — callers should NOT start
        // capturing on a false/rejected result (fail closed: no confirmed
        // consent notification means no recording, rather than silently
        // recording anyway and only losing the banner).
        _notifyRecordingConsent: async function(action) {
            try {
                const callId = window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId);
                if (!callId) return false;
                const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || (window.config && window.config.apiUrl) || '';
                const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
                if (!apiBase || !token) return false;
                const res = await fetch(apiBase + '/api/calls/' + callId + '/recording/' + (action === 'start' ? 'start' : 'stop'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
                });
                return res.ok;
            } catch (_) {
                return false;
            }
        },

        toggleRecording: async function() {
            if (UIState._recorder && UIState._recorder.state === 'recording') {
                // Stop recording
                UIState._recorder.stop();
                UIState._recorder = null;
                // FIX-SILENT-RECORDING: tell the server (and therefore every other
                // participant, via their existing 'call:recording_stopped' banner
                // listener) that recording has stopped. See start branch below for
                // why this call exists at all.
                UIEventHandlers._notifyRecordingConsent('stop');
                // Clear pulsing indicator
                if (UIState._recPulseInterval) { clearInterval(UIState._recPulseInterval); UIState._recPulseInterval = null; }
                if (UIState._recAnimFrame)     { cancelAnimationFrame(UIState._recAnimFrame); UIState._recAnimFrame = null; }
                const menuRecord = document.getElementById('menuRecord');
                if (menuRecord) { menuRecord.style.color = ''; menuRecord.textContent = 'Record'; menuRecord.classList.remove('recording-active'); }
                showNotification('Recording stopped — file downloading', 'info');
                return;
            }

            // Start recording
            const localStream  = UIState.localStream  || (coreInstance && coreInstance.getLocalStream && coreInstance.getLocalStream());
            const remoteStream = UIState.remoteStream  || (coreInstance && coreInstance.getRemoteStream && coreInstance.getRemoteStream())
                              || (window.callsState && window.callsState.remoteStream);

            if (!localStream && !remoteStream) {
                showNotification('No active streams to record', 'error');
                return;
            }

            // FIX-SILENT-RECORDING: confirm the other participant(s) were
            // actually notified BEFORE capturing anything at all. Fail closed:
            // if the server can't be reached, or this user isn't authorized
            // to record (server currently restricts this to the call's
            // initiator), do not proceed with local capture either — silently
            // recording someone without a confirmed notification is exactly
            // the gap this fix closes.
            const _consentOk = await UIEventHandlers._notifyRecordingConsent('start');
            if (!_consentOk) {
                showNotification('Recording requires host permission and could not be started', 'error');
                return;
            }

            const isVideo = (localStream  && localStream.getVideoTracks().length  > 0)
                         || (remoteStream && remoteStream.getVideoTracks().length > 0);

            let recordStream;

            if (isVideo) {
                // Composite both video feeds on a canvas
                const canvas    = document.createElement('canvas');
                canvas.width    = 1280; canvas.height = 720;
                const ctx       = canvas.getContext('2d');
                const remoteVid = document.getElementById('remoteVideo');
                const localVid  = document.getElementById('pipVideo');
                const canvasSt  = canvas.captureStream(25);

                function drawFrame() {
                    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720);
                    if (remoteVid && remoteVid.readyState >= 2) ctx.drawImage(remoteVid, 0, 0, 1280, 720);
                    if (localVid  && localVid.readyState  >= 2) ctx.drawImage(localVid, 1280 - 252, 12, 240, 135);
                    UIState._recAnimFrame = requestAnimationFrame(drawFrame);
                }
                drawFrame();

                // Mix audio
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const dest     = audioCtx.createMediaStreamDestination();
                if (localStream  && localStream.getAudioTracks().length)  audioCtx.createMediaStreamSource(localStream).connect(dest);
                if (remoteStream && remoteStream.getAudioTracks().length) audioCtx.createMediaStreamSource(remoteStream).connect(dest);
                dest.stream.getAudioTracks().forEach(t => canvasSt.addTrack(t));
                recordStream = canvasSt;
            } else {
                // Audio-only: mix local + remote
                const audioCtx2 = new (window.AudioContext || window.webkitAudioContext)();
                const dest2     = audioCtx2.createMediaStreamDestination();
                if (localStream  && localStream.getAudioTracks().length)  audioCtx2.createMediaStreamSource(localStream).connect(dest2);
                if (remoteStream && remoteStream.getAudioTracks().length) audioCtx2.createMediaStreamSource(remoteStream).connect(dest2);
                recordStream = dest2.stream;
            }

            const mimeTypes = isVideo
                ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
                : ['audio/webm;codecs=opus', 'audio/webm'];
            const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

            let recorder;
            try { recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : {}); }
            catch(e) { showNotification('Recording not supported in this browser', 'error'); return; }

            const chunks = [];
            recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onstop = () => {
                if (UIState._recAnimFrame) { cancelAnimationFrame(UIState._recAnimFrame); UIState._recAnimFrame = null; }
                const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                const url  = URL.createObjectURL(blob);
                const a    = Object.assign(document.createElement('a'), { href: url, download: 'call-recording-' + Date.now() + '.webm' });
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                showNotification('Recording saved', 'success');
            };
            recorder.start(1000);
            UIState._recorder = recorder;

            // FIX-SILENT-RECORDING: consent was already confirmed via
            // _notifyRecordingConsent('start') above, before any capture
            // setup began (fail closed) — no second call needed here.

            // Pulse the Record menu item red while active
            const menuRecord = document.getElementById('menuRecord');
            if (menuRecord) menuRecord.classList.add('recording-active');
            let _pulse = true;
            UIState._recPulseInterval = setInterval(() => {
                if (menuRecord) { menuRecord.style.color = _pulse ? '#ff3b30' : ''; _pulse = !_pulse; }
            }, 800);
            showNotification('Recording started', 'success');
        },

        // ── ADD PARTICIPANT (group call) ───────────────────────────────────────
        openAddParticipantPanel: function() {
            // Remove any existing panel
            const existing = document.getElementById('addParticipantPanel');
            if (existing) { existing.remove(); return; }

            const contacts = window.__contactsList || UIState.contacts || window.__cachedCallContacts || [];
            if ((!contacts || contacts.length === 0) && window.parent && window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'GET_FRIENDS_LIST',
                        source: 'calls',
                        module: 'calls',
                        timestamp: Date.now()
                    }, '*');
                } catch (_) {}
            }
            const panel = document.createElement('div');
            panel.id = 'addParticipantPanel';
            panel.style.cssText = [
                'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
                'background:#1c1c1e;border-radius:16px;padding:16px;z-index:99999;',
                'width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,0.5);',
                'max-height:60vh;display:flex;flex-direction:column;gap:10px;'
            ].join('');

            panel.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:#fff;font-weight:600;font-size:15px;">Add to call</span>
                    <button id="closeAddParticipant" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;">×</button>
                </div>
                <input id="addParticipantSearch" type="text" placeholder="Search contacts..."
                    style="background:#2c2c2e;border:none;border-radius:8px;padding:8px 12px;color:#fff;font-size:14px;width:100%;box-sizing:border-box;">
                <div id="addParticipantList" style="overflow-y:auto;max-height:40vh;display:flex;flex-direction:column;gap:6px;">
                    ${contacts.length === 0
                        ? '<p style="color:#888;text-align:center;font-size:13px;margin:8px 0;">No contacts found</p>'
                        : contacts.map(c => `
                            <div class="add-participant-item" data-user-id="${c.id}" data-user-name="${c.username || c.displayName || c.name || 'User'}"
                                style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;background:#2c2c2e;">
                                <div style="width:36px;height:36px;border-radius:50%;background:#0084ff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;flex-shrink:0;">
                                    ${(c.username||c.displayName||c.name||'U')[0].toUpperCase()}
                                </div>
                                <span style="color:#fff;font-size:14px;">${c.username || c.displayName || c.name || 'User'}</span>
                                <button class="invite-participant-btn" data-user-id="${c.id}" data-user-name="${c.username || c.displayName || c.name || 'User'}"
                                    style="margin-left:auto;background:#0084ff;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">
                                    Invite
                                </button>
                            </div>`).join('')
                    }
                </div>
            `;
            document.body.appendChild(panel);

            document.getElementById('closeAddParticipant').onclick = () => panel.remove();

            // Search filter
            document.getElementById('addParticipantSearch').addEventListener('input', function() {
                const q = this.value.toLowerCase();
                panel.querySelectorAll('.add-participant-item').forEach(item => {
                    const name = (item.dataset.userName || '').toLowerCase();
                    item.style.display = name.includes(q) ? 'flex' : 'none';
                });
            });

            // Invite button handler
            panel.querySelectorAll('.invite-participant-btn').forEach(btn => {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    const userId   = this.dataset.userId;
                    const userName = this.dataset.userName;
                    const callId   = UIState.activeCallId || (window.callsState && window.callsState.serverCallId);

                    if (!callId) { showNotification('No active call to add participant to', 'error'); return; }

                    // Send ADD_PARTICIPANT signal to server via parent
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'CALL_ADD_PARTICIPANT',
                            payload: {
                                callId,
                                targetUserId: userId,
                                targetUserName: userName,
                                existingCallType: UIState.callType || 'voice'
                            },
                            source: 'calls-iframe'
                        }, '*');
                    }

                    // Update UI: show "Calling..." on button
                    this.textContent = 'Calling…';
                    this.disabled = true;
                    this.style.background = '#555';
                    showNotification(`Calling ${userName}...`, 'info');

                    // Update participant count badge
                    const badge = document.getElementById('participantBadge');
                    if (badge) badge.textContent = parseInt(badge.textContent || '0') + 1;
                };
            });

            // Auto-close when clicking outside
            setTimeout(() => {
                document.addEventListener('click', function closeOnOutside(e) {
                    if (!panel.contains(e.target) && e.target.id !== 'menuParticipants') {
                        panel.remove();
                        document.removeEventListener('click', closeOnOutside);
                    }
                });
            }, 100);
        },

         endCall: async function() {
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('No active call to end', 'info');
                return;
            }
            
            const callId = UIState.activeCallId;
            const startTime = UIState.callStartTime;
            const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
            
            let callStatus = 'failed';
            if (callId) {
                if (UIState.callState === 'connected' || UIState.callState === 'ongoing') {
                    callStatus = duration > 0 ? 'completed' : 'failed';
                } else if (UIState.callState === 'initiating' || UIState.callState === 'ringing') {
                    callStatus = 'cancelled';
                } else if (UIState.callState === 'incoming') {
                    callStatus = 'missed';
                } else if (duration > 0) {
                    callStatus = 'completed';
                }
            }
            
            console.log('[Calls UI] Ending call:', { callId, duration, callStatus });
            
            if (coreInstance && coreInstance.sendAction) {
                await coreInstance.sendAction('CALL_ENDED', {
                    callId: callId,
                    duration: duration,
                    status: callStatus,
                    timestamp: Date.now()
                });
            }
            
            const token = window.__CHILD_SESSION__?.token || localStorage.getItem('authToken') || localStorage.getItem('token');
            console.log('[AUTH TOKEN]', token);
            if (token && callId) {
                try {
                    const result = await window.apiRequest('POST', `/api/calls/${callId}/end`, {
                        duration: duration,
                        status: callStatus,
                        endedBy: window.__CHILD_SESSION__?.userId || 8
                    }, token);
                    if (result && result.success !== false) console.log('[Calls UI] Call saved successfully');
                } catch (fetchError) { console.error('[Calls UI] Save error:', fetchError); }
            }
            
            if (UIState.localStream) { UIState.localStream.getTracks().forEach(track => track.stop()); UIState.localStream = null; }
            if (UIState.screenStream) { UIState.screenStream.getTracks().forEach(track => track.stop()); UIState.screenStream = null; }
            if (UIState.callDurationInterval) { clearInterval(UIState.callDurationInterval); UIState.callDurationInterval = null; }
            
            // CRITICAL: Reset ALL call state variables
            UIState.activeCallId = null;
            UIState.callParticipants = [];
            UIState.callStartTime = null;
            UIState.callType = null;
            UIState.callActive = false;
            UIState.callState = 'idle';
            // Cleanup any detached audio elements from audio-only calls
            document.querySelectorAll('audio[id^="remoteAudio_"]').forEach(a => { a.srcObject = null; a.remove(); });
            UIState.remoteStreams.clear();
            UIState.remoteStream = null;
            
            if (window._incomingCallTimer) { clearInterval(window._incomingCallTimer); window._incomingCallTimer = null; }
            window._currentIncomingCallId = null;
            
            if (elements.callContainer) elements.callContainer.classList.remove('active');
            if (elements.sidebar) elements.sidebar.style.display = 'flex';
            if (elements.focusModeBtn) elements.focusModeBtn.style.display = 'none';
            
            const callHeaderEndBtnEl = document.getElementById('callHeaderEndBtn');
            if (callHeaderEndBtnEl) callHeaderEndBtnEl.style.display = 'none';
            
            if (UIState.currentFocusMode) this.disableFocusMode();
            
            if (elements.videoGrid) {
                elements.videoGrid.innerHTML = '';
                if (elements.offlineCallPlaceholder) elements.offlineCallPlaceholder.style.display = 'flex';
            }
            
            UIState.currentView = 'sidebar';
            
            // Force core to reset its call state
            if (coreInstance && coreInstance.clearActiveCall) coreInstance.clearActiveCall();
            if (coreInstance && coreInstance.resetCallState) coreInstance.resetCallState();
            if (coreInstance && coreInstance._currentCallId) coreInstance._currentCallId = null;
            if (coreInstance && coreInstance._callActive) coreInstance._callActive = false;
            
            // Refresh call history
            if (typeof loadCallHistory === 'function') { 
                await loadCallHistory(); 
            }
            
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'SHOW_SIDEBAR_ICONS', module: 'calls' }, '*');
                window.parent.postMessage({ type: 'CALL_ENDED_RETURN', timestamp: Date.now() }, '*');
            }
            
            setTimeout(() => {
                try {
                    // Use UIEventHandlers directly to avoid 'this' context loss
                    if (typeof UIEventHandlers !== 'undefined' && typeof UIEventHandlers.showPrivateNotesModal === 'function') {
                        UIEventHandlers.showPrivateNotesModal();
                    } else if (typeof this.showPrivateNotesModal === 'function') {
                        this.showPrivateNotesModal();
                    }
                } catch (_e) { /* silently skip if modal not available */ }
            }, 500);
            
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            showNotification(`Call ended - Duration: ${mins}:${secs.toString().padStart(2, '0')}`, 'success');
            
            // Navigate back to correct screen
            setTimeout(() => {
                if (window.parent && window.parent !== window) {
                    const rawReturn = window.__callOriginReturnTo || window.__pendingCallReturnTo;
                    // Never navigate back to 'calls' panel — fall back to last real page
                    const returnTo = (rawReturn && rawReturn !== 'calls')
                        ? rawReturn
                        : (window.__lastActivePage && window.__lastActivePage !== 'calls')
                            ? window.__lastActivePage
                            : 'messages';

                    const chatUserId = window.__callOriginChatUserId || window.__pendingCallChatUserId || null;
                    
                    window.__pendingCallReturnTo = null;
                    window.__pendingCallChatUserId = null;
                    window.__callOriginReturnTo = null;
                    window.__callOriginChatUserId = null;
                    
                    // FORCE sidebar to show when returning to calls
                    const sidebar = document.getElementById('sidebar');
                    const callContainer = document.getElementById('callContainer');
                    
                    if (sidebar) sidebar.style.display = 'flex';
                    if (callContainer) callContainer.classList.remove('active');
                    
                    if (returnTo === 'messages' && chatUserId) {
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: 'messages',
                            payload: { returnFromCall: true, openChatWith: chatUserId, openChatWithName: window.__callOriginChatUserName || null },
                            timestamp: Date.now()
                        }, '*');
                    } else {
                        // Navigate back to wherever the user was (friends, status, tools, messages, etc.)
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: returnTo,
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    }
                }
                
                // Also force UI update locally
                if (elements.sidebar) elements.sidebar.style.display = 'flex';
                if (elements.callContainer) elements.callContainer.classList.remove('active');
                UIState.currentView = 'sidebar';
                
            }, 350);
        },

refreshCallHistoryAfterCall: async function() {
    console.log('[Calls UI] Refreshing call history after call ended');
    
    // Request fresh call history from parent
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'REFRESH_CALL_HISTORY',
            payload: { 
                userId: window.__CHILD_SESSION__?.userId,
                timestamp: Date.now()
            }
        }, '*');
    }
    
    // Reload using the API
    if (typeof loadCallHistory === 'function') {
        try {
            const calls = await loadCallHistory();
            console.log('[Calls UI] Call history refreshed:', calls?.length || 0, 'calls');
        } catch (err) {
            console.error('[Calls UI] Failed to refresh call history:', err);
        }
    }
    
    // Also force core to reset its call state
    if (coreInstance && coreInstance.resetCallState) {
        coreInstance.resetCallState();
    }
    
    // Clear any pending call flags
    if (coreInstance && coreInstance.clearActiveCall) {
        coreInstance.clearActiveCall();
    }
    
    // Reset core's call active flag
    if (coreInstance && coreInstance._currentCallId) {
        coreInstance._currentCallId = null;
    }
    if (coreInstance && coreInstance._callActive) {
        coreInstance._callActive = false;
    }
},

refreshCallHistoryAfterCall: function() {
    console.log('[Calls UI] Refreshing call history after call ended');
    
    // Request fresh call history from parent
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'REFRESH_CALL_HISTORY',
            payload: { 
                userId: window.__CHILD_SESSION__?.userId,
                timestamp: Date.now()
            }
        }, '*');
        
        // Also request directly
        setTimeout(() => {
            window.parent.postMessage({
                type: 'GET_CALL_HISTORY',
                payload: { 
                    requestId: 'refresh_' + Date.now(),
                    forceRefresh: true
                }
            }, '*');
        }, 500);
    }
    
    // Reload the calls list in UI
    if (typeof loadCallHistory === 'function') {
        setTimeout(() => {
            loadCallHistory().then(calls => {
                console.log('[Calls UI] Call history refreshed:', calls?.length || 0, 'calls');
                if (elements.allCallsList) {
                    displayCallHistory(calls);
                }
            });
        }, 1000);
    }
},
        openMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.add('active');
                UIState.activeModals.add('moodSelectionModal');
                
                document.querySelectorAll('.mood-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.mood === UIState.selectedMood) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeMoodSelectionModal: function() {
            if (elements.moodSelectionModal) {
                elements.moodSelectionModal.classList.remove('active');
                UIState.activeModals.delete('moodSelectionModal');
            }
        },
        
        selectMoodOption: function(e) {
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedMood = e.currentTarget.dataset.mood;
        },
        
        setMood: function() {
            if (!canPerformAction('setMood')) return;
            
            const selectedOption = document.querySelector('.mood-option.selected');
            if (selectedOption) {
                const newMood = selectedOption.dataset.mood;
                UIState.selectedMood = newMood;
                
                // Send to core
                if (coreInstance && coreInstance.setMood) {
                    coreInstance.setMood(newMood);
                }
                
                UIEventHandlers.closeMoodSelectionModal();
                showNotification(`Mood set to ${newMood}`, 'success');
            }
        },
        
        openIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.add('active');
                UIState.activeModals.add('intentionSelectionModal');
                
                document.querySelectorAll('.intention-option').forEach(option => {
                    option.classList.remove('selected');
                    if (option.dataset.intention === UIState.selectedIntention) {
                        option.classList.add('selected');
                    }
                });
            }
        },
        
        closeIntentionSelectionModal: function() {
            if (elements.intentionSelectionModal) {
                elements.intentionSelectionModal.classList.remove('active');
                UIState.activeModals.delete('intentionSelectionModal');
            }
        },
        
        selectIntentionOption: function(e) {
            document.querySelectorAll('.intention-option').forEach(opt => opt.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            UIState.selectedIntention = e.currentTarget.dataset.intention;
        },
        
        setIntention: function() {
            if (!canPerformAction('setIntention')) return;
            
            const selectedOption = document.querySelector('.intention-option.selected');
            if (selectedOption) {
                const newIntention = selectedOption.dataset.intention;
                UIState.selectedIntention = newIntention;
                
                // Send to core
                if (coreInstance && coreInstance.setIntention) {
                    coreInstance.setIntention(newIntention);
                }
                
                UIEventHandlers.closeIntentionSelectionModal();
                showNotification(`Intention set to ${newIntention}`, 'success');
            }
        },
        
        toggleFocusMode: function() {
            if (UIState.currentFocusMode) {
                this.disableFocusMode();
            } else {
                this.enableFocusMode();
            }
            
            if (coreInstance && coreInstance.toggleFocusMode) {
                coreInstance.toggleFocusMode();
            }
        },
        
        enableFocusMode: function() {
            UIState.currentFocusMode = true;
            if (elements.appContainer) elements.appContainer.classList.add('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.add('active');
            }
            showNotification('Focus mode enabled', 'info');
        },
        
        disableFocusMode: function() {
            UIState.currentFocusMode = false;
            if (elements.appContainer) elements.appContainer.classList.remove('focus-mode');
            if (elements.focusModeBtn) {
                elements.focusModeBtn.classList.remove('active');
            }
        },
        
        showPrivateNotesModal: function() {
            if (!elements.privateNotesModal || !UIState.callParticipants?.length) {
                this.showCallSummary();
                return;
            }
            
            const lastContact = UIState.callParticipants[0];
            
            if (lastContact) {
                if (elements.privateNotesTitle) {
                    elements.privateNotesTitle.textContent = `Notes about call with ${SecuritySanitizer.sanitizeString(lastContact.name)}`;
                }
                if (elements.privateNotesSubtitle) {
                    elements.privateNotesSubtitle.textContent = 'Add private notes about this call (only visible to you)';
                }
                
                // Get notes from memory, not localStorage
                const previousNotes = UIState.privateNotes[lastContact.id]?.notes || '';
                if (elements.privateNotesTextarea) {
                    elements.privateNotesTextarea.value = previousNotes;
                }
                
                elements.privateNotesModal.classList.add('active');
                UIState.activeModals.add('privateNotesModal');
            } else {
                this.showCallSummary();
            }
        },
        
        skipPrivateNotes: function() {
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotes: function() {
            if (!canPerformAction('saveNotes')) return;
            
            const notes = elements.privateNotesTextarea?.value.trim() || '';
            const lastContact = UIState.callParticipants?.[0];
            
            if (lastContact && notes) {
                // Store in memory only, not localStorage
                UIState.privateNotes[lastContact.id] = {
                    notes: notes,
                    timestamp: new Date().toISOString(),
                    callId: UIState.activeCallId
                };
                
                // Send to parent via core if available
                if (coreInstance && coreInstance.saveNotes) {
                    coreInstance.saveNotes({
                        contactId: lastContact.id,
                        notes: notes,
                        callId: UIState.activeCallId
                    });
                }
                
                showNotification('Notes saved', 'success');
            }
            
            if (elements.privateNotesModal) {
                elements.privateNotesModal.classList.remove('active');
                UIState.activeModals.delete('privateNotesModal');
            }
            this.showCallSummary();
        },
        
        savePrivateNotesToStorage: function(contactId, notes) {
            // Deprecated - use memory only
            UIState.privateNotes[contactId] = {
                notes: notes,
                timestamp: new Date().toISOString(),
                callId: UIState.activeCallId
            };
            
            // Don't use localStorage
            logOnce('warn', 'savePrivateNotesToStorage called - using memory only');
        },
        
        getPrivateNotes: function(contactId) {
            // Get from memory, not localStorage
            return UIState.privateNotes[contactId]?.notes || null;
        },
        
        showCallSummary: function() {
            if (!elements.callSummaryModal) return;
            
            const callDuration = UIState.callStartTime ? 
                Math.floor((Date.now() - UIState.callStartTime) / 1000) : 0;
            
            const minutes = Math.floor(callDuration / 60);
            const seconds = callDuration % 60;
            
            if (elements.summaryDuration) {
                elements.summaryDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (elements.summaryTime) {
                elements.summaryTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            if (elements.summaryType) {
                elements.summaryType.textContent = UIState.callType === 'video' ? 'Video Call' : 'Voice Call';
            }
            
            if (elements.summaryMood) {
                elements.summaryMood.textContent = UIState.selectedMood.charAt(0).toUpperCase() + UIState.selectedMood.slice(1);
            }
            
            if (elements.summaryIntention) {
                const intentionMap = {
                    quick: 'Quick Chat',
                    important: 'Important Discussion',
                    emergency: 'Emergency',
                    checkin: 'Check-in',
                    work: 'Work/Business'
                };
                elements.summaryIntention.textContent = intentionMap[UIState.selectedIntention] || 'Quick Chat';
            }
            
            if (elements.summaryParticipants) {
                elements.summaryParticipants.textContent = (UIState.callParticipants?.length || 0) + 1;
            }
            
            elements.callSummaryModal.classList.add('active');
            UIState.activeModals.add('callSummaryModal');

            // ✅ FIX: Auto-hide the call summary after 3 seconds — user should not need to tap Done.
            // Also ensure callContainer stays hidden during this period (no dark flash).
            const _callContainer = document.getElementById('callContainer');
            if (_callContainer) {
                _callContainer.classList.remove('active');
                _callContainer.style.setProperty('display', 'none', 'important');
            }
            clearTimeout(window._callSummaryAutoHide);
            window._callSummaryAutoHide = setTimeout(() => {
                this.closeCallSummary();
            }, 3000);
        },
        
        closeCallSummary: function() {
            if (elements.callSummaryModal) {
                elements.callSummaryModal.classList.remove('active');
                UIState.activeModals.delete('callSummaryModal');
            }
            // ✅ FIX: After closing summary (by Done button or auto-timer), navigate back
            // to wherever the call originated from. Without this, the user is left on the
            // blank call container screen after dismissing the summary.
            // Only navigate if we haven't already (handleCallEnded fires SWITCH_MODULE too).
            if (!window.__callSummaryNavigated) {
                window.__callSummaryNavigated = true;
                setTimeout(() => { window.__callSummaryNavigated = false; }, 5000);
                // Ensure callContainer is hidden
                const _cc = document.getElementById('callContainer');
                if (_cc) { _cc.classList.remove('active'); _cc.style.setProperty('display', 'none', 'important'); }
                if (window.parent && window.parent !== window) {
                    const _origin = window.__callOriginReturnTo || window.__pendingCallReturnTo || 'messages';
                    const _mod = (_origin === 'calls' || !_origin) ? 'messages' : _origin;
                    window.parent.postMessage({ type: 'SWITCH_MODULE', module: _mod, payload: { returnFromCall: true }, timestamp: Date.now() }, '*');
                }
            }
        },
        
        acceptIncomingCall: function() {
    UIEventHandlers.acceptIncomingCallGeneric(false);
},

acceptIncomingCallAsVideo: function() {
    UIEventHandlers.acceptIncomingCallGeneric(true);
},

acceptIncomingCallGeneric: async function(asVideo) {
    if (!canPerformAction('answerCall')) return;
    
    if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
        showNotification('You are already in a call', 'warning');
        return;
    }
    
    if (elements.incomingCallModal && elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    // Stop ringtone
    if (window._incomingRingtone) {
        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
        window._incomingRingtone = null;
    }

    const callerName = elements.incomingCallName?.textContent || 'Caller';
    const isVideoCall = elements.incomingCallType?.textContent?.includes('Video') || false;
    const callType = asVideo ? 'video' : (isVideoCall ? 'video' : 'voice');
    // CRITICAL FIX: Try multiple sources for callId before giving up
    let callId = window._currentIncomingCallId || UIState.activeCallId || null;
    if (!callId) {
        // Try sessionStorage persistence (survives state resets)
        try { callId = sessionStorage.getItem('kyn_incoming_call_id') || null; } catch(_) {}
    }
    if (!callId) {
        // Try window.__pendingIncomingCallData
        callId = window.__pendingIncomingCallData?.callId || window.__pendingIncomingCallData?.id || null;
    }
    if (!callId) {
        // Try callsState
        callId = (window.callsState && window.callsState.activeCallId) || null;
    }
    // Restore state if we recovered callId from storage
    if (callId && !window._currentIncomingCallId) {
        window._currentIncomingCallId = callId;
        if (window.UIState) window.UIState.activeCallId = callId;
    }
    
    if (!callId) {
        console.error('[AcceptCall] No callId found anywhere - cannot accept');
        showNotification('Unable to accept call: Missing call ID', 'error');
        this.declineIncomingCall();
        return;
    }
    
    if (elements.incomingCallModal) {
        elements.incomingCallModal.classList.remove('active');
        UIState.activeModals && UIState.activeModals.delete('incomingCallModal');
    }
    
    showNotification(`Accepting ${callType} call from ${callerName}...`, 'info');

    // ── CRITICAL FIX: Use answerCall (not sendAction CALL_ACCEPT) so the WebRTC
    // peer connection is set up BEFORE we signal acceptance to the backend.
    // sendAction('CALL_ACCEPT') skips the local media + RTCPeerConnection setup.
    let accepted = false;
    // CRITICAL FIX: Use multiple core sources
    const _core = coreInstance || window.callCore || window.CallsCore || window.callsCore || null;
    if (_core && _core.answerCall) {
        try {
            const result = await _core.answerCall(callId);
            if (result && result.success) {
                accepted = true;
                showNotification(`Call accepted with ${callerName}`, 'success');
            } else {
                // Even if backend returns error, show in-call optimistically
                accepted = true;
                console.warn('[Calls UI] answerCall returned non-success, proceeding anyway:', result?.error);
            }
        } catch (error) {
            console.error('[Calls UI] Accept call error:', error);
            // Still proceed to show in-call screen on error (optimistic)
            accepted = true;
        }
    } else if (_core && _core.sendAction) {
        try {
            await _core.sendAction('CALL_ACCEPT', { callId, timestamp: Date.now() });
            accepted = true;
        } catch (e) { accepted = true; } // optimistic
    } else {
        // CRITICAL: Even without core, show in-call screen so user can be in the call
        // The WebRTC connection will proceed via signalling
        console.warn('[Calls UI] No core available - proceeding with optimistic accept');
        accepted = true;
        // Post directly to parent to signal acceptance
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'CALL_ACCEPT', payload: { callId, callerName, callType }, source: 'direct-accept' }, '*');
        }
    }

    if (accepted) {
        // ── FIX: Set navigation origin so handleCallEnded returns here after call ──
        // On receiver side, returnTo should go back to wherever they were (calls page).
        if (!window.__callOriginReturnTo) {
            window.__callOriginReturnTo = 'calls'; // receiver came from calls page
            window.__callOriginChatUserId = null;
        }

        // ── FIX: Do NOT immediately show in-call screen here.
        // The WebRTC offer from the caller will arrive shortly via the signalling server.
        // Once WebRTC negotiation completes, calls-core fires 'call_connected' or
        // 'call_accepted' which triggers handleCallConnected / handleCallAccepted →
        // transitionToInCall. Showing the screen here early caused the callState guard
        // in handleSignalOffer to drop the offer and self-end the call.
        //
        // Set state so the guard allows the offer through:
        UIState.callActive    = true;
        UIState.callState     = 'connecting';
        UIState.activeCallId  = callId;
        UIState.callType      = callType;
        // Store caller info for transitionToInCall when it fires:
        if (!UIState.callParticipants || UIState.callParticipants.length === 0) {
            UIState.callParticipants = [{ name: callerName }];
        }
        // Dismiss modals right away
        const incomingModal = document.getElementById('incomingCallModal');
        if (incomingModal) {
            incomingModal.classList.remove('active');
            incomingModal.style.setProperty('display', 'none', 'important');
        }
        // Notify parent the call is active (hides banner, marks call in progress)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'CALL_ACCEPTED',
                payload: { callId, callerName, callType }
            }, '*');
        }
        // Immediately show in-call screen on receiver side with the real caller name
        transitionToInCall({
            userName:  callerName || window.__incomingCallerName || 'Caller',
            callType:  callType,
            userAvatar: window.__incomingCallerAvatar || null
        });
        // Safety fallback: if transitionToInCall had a race, retry after 1 s
        window._receiverShowFallback = setTimeout(() => {
            const inCall = document.getElementById('inCallScreen');
            if (!inCall || !inCall.classList.contains('active')) {
                console.warn('[UI] Fallback: showing in-call screen for receiver');
                transitionToInCall({
                    userName:  callerName || window.__incomingCallerName || 'Caller',
                    callType:  callType,
                    userAvatar: window.__incomingCallerAvatar || null
                });
            }
        }, 1000);
    }
},

declineIncomingCall: async function() {
    if (elements.incomingCallModal && elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    // Stop ringtone
    if (window._incomingRingtone) {
        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
        window._incomingRingtone = null;
    }

    const callId = window._currentIncomingCallId || UIState.activeCallId;
    
    // Hide incoming call modal
    if (elements.incomingCallModal) {
        elements.incomingCallModal.classList.remove('active');
        UIState.activeModals && UIState.activeModals.delete('incomingCallModal');
    }
    
    // Reset all call state so the UI unfreezes
    UIState.activeCallId = null;
    UIState.callActive = false;
    UIState.callState = 'idle';
    UIState.callParticipants = [];
    UIState.callStartTime = null;
    window._currentIncomingCallId = null;

    // Hide call container, show sidebar
    if (elements.callContainer) elements.callContainer.classList.remove('active');
    if (elements.sidebar) elements.sidebar.style.display = 'flex';

    // Stop local stream if acquired
    if (UIState.localStream) {
        UIState.localStream.getTracks().forEach(t => t.stop());
        UIState.localStream = null;
    }

    // Stop call timer
    if (UIState.callDurationInterval) {
        clearInterval(UIState.callDurationInterval);
        UIState.callDurationInterval = null;
    }

    // Clear video grid
    if (elements.videoGrid) {
        elements.videoGrid.innerHTML = '';
        if (elements.offlineCallPlaceholder) elements.offlineCallPlaceholder.style.display = 'flex';
    }

    // Restore parent sidebar icons
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'SHOW_SIDEBAR_ICONS', module: 'calls' }, '*');
    }

    if (callId) {
        if (coreInstance && coreInstance.sendAction) {
            await coreInstance.sendAction('CALL_REJECT', {
                callId: callId,
                reason: 'declined',
                timestamp: Date.now()
            });
        } else if (coreInstance && coreInstance.declineCall) {
            await coreInstance.declineCall(callId, 'declined');
        }
    }
    
    // Reset core state
    if (coreInstance && coreInstance.resetCallState) {
        coreInstance.resetCallState();
    }

    // ── Tell parent to broadcast CALL_ENDED to all iframes so the CALLER resets too ──
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'CALL_REJECT',
            payload: { callId: callId, reason: 'declined', timestamp: Date.now() }
        }, '*');
    }
    if (typeof window._stopRingtones === 'function') window._stopRingtones();
    if (typeof window._stopAllRingtones === 'function') window._stopAllRingtones();
    if (window.parent && window.parent !== window) { window.__callEndedNavigating = true; setTimeout(function(){window.__callEndedNavigating=false;},3000); window.parent.postMessage({type:'CALL_ENDED_RETURN',timestamp:Date.now()},'*'); const _dr=window.__callOriginReturnTo||window.__pendingCallReturnTo||'messages'; setTimeout(function(){if(window.parent&&window.parent!==window)window.parent.postMessage({type:'SWITCH_MODULE',module:_dr,payload:{returnFromCall:true},timestamp:Date.now()},'*');},350); }
    showIdleScreen(true);
    showNotification('Call declined', 'info');

    setTimeout(() => UIEventHandlers.refreshCallHistoryAfterCall && UIEventHandlers.refreshCallHistoryAfterCall(), 800);
},
        generateVoiceCallLink: function() {
            UIEventHandlers.generateCallLink('voice');
        },
        
        generateVideoCallLink: function() {
            UIEventHandlers.generateCallLink('video');
        },
        
        generateCallLink: function(type) {
            if (!canPerformAction('generateCallLink')) return;
            
            const callId = 'call-' + Math.random().toString(36).substr(2, 9);
            const baseUrl = window.location.origin + window.location.pathname;
            const callUrl = `${baseUrl}?call=${callId}&type=${type}`;
            
            UIState.callLink = callUrl;
            
            if (elements.callLinkInput) {
                elements.callLinkInput.value = callUrl;
            }
            
            if (coreInstance && coreInstance.createCallLink) {
                coreInstance.createCallLink(type);
            }
            
            showNotification(`${type === 'voice' ? 'Voice' : 'Video'} call link generated`, 'success');
        },
        
        copyCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            navigator.clipboard.writeText(link)
                .then(() => showNotification('Call link copied to clipboard', 'success'))
                .catch(() => showNotification('Failed to copy link', 'error'));
        },
        
        shareCallLink: function() {
            const link = elements.callLinkInput?.value || UIState.callLink;
            
            if (!link) {
                showNotification('Generate a call link first', 'warning');
                return;
            }
            
            // Remove any existing share modal
            const existing = document.getElementById('callShareModal');
            if (existing) existing.remove();
            
            const encodedLink = encodeURIComponent(link);
            const encodedText = encodeURIComponent('Join my call: ' + link);
            
            const modal = document.createElement('div');
            modal.id = 'callShareModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
                <div style="background:var(--bg-secondary,#1e1e2e);border-radius:16px;padding:24px;width:320px;max-width:90vw;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                        <h3 style="margin:0;color:var(--text-primary,#fff);font-size:16px;">Share Call Link</h3>
                        <button id="closeShareModal" style="background:none;border:none;color:var(--text-secondary,#aaa);cursor:pointer;font-size:20px;">&times;</button>
                    </div>
                    <div style="background:var(--bg-tertiary,#2a2a3a);border-radius:8px;padding:10px;margin-bottom:16px;word-break:break-all;font-size:12px;color:var(--text-secondary,#aaa);">${link}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <button id="shareWhatsApp" style="display:flex;align-items:center;gap:8px;padding:12px;background:#25D366;border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fab fa-whatsapp" style="font-size:18px;"></i> WhatsApp
                        </button>
                        <button id="shareFacebook" style="display:flex;align-items:center;gap:8px;padding:12px;background:#1877F2;border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fab fa-facebook-f" style="font-size:18px;"></i> Facebook
                        </button>
                        <button id="shareTwitter" style="display:flex;align-items:center;gap:8px;padding:12px;background:#1DA1F2;border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fab fa-twitter" style="font-size:18px;"></i> Twitter
                        </button>
                        <button id="shareTelegram" style="display:flex;align-items:center;gap:8px;padding:12px;background:#229ED9;border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fab fa-telegram-plane" style="font-size:18px;"></i> Telegram
                        </button>
                        <button id="shareEmail" style="display:flex;align-items:center;gap:8px;padding:12px;background:#555;border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fas fa-envelope" style="font-size:18px;"></i> Email
                        </button>
                        <button id="shareCopyLink" style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--primary,#7c3aed);border:none;border-radius:10px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">
                            <i class="fas fa-copy" style="font-size:18px;"></i> Copy
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close on backdrop click or X button
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            document.getElementById('closeShareModal').addEventListener('click', () => modal.remove());
            
            document.getElementById('shareWhatsApp').addEventListener('click', () => {
                window.open(`https://wa.me/?text=${encodedText}`, '_blank', 'noopener');
                modal.remove();
            });
            document.getElementById('shareFacebook').addEventListener('click', () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`, '_blank', 'noopener');
                modal.remove();
            });
            document.getElementById('shareTwitter').addEventListener('click', () => {
                window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank', 'noopener');
                modal.remove();
            });
            document.getElementById('shareTelegram').addEventListener('click', () => {
                window.open(`https://t.me/share/url?url=${encodedLink}&text=${encodeURIComponent('Join my call!')}`, '_blank', 'noopener');
                modal.remove();
            });
            document.getElementById('shareEmail').addEventListener('click', () => {
                window.open(`mailto:?subject=${encodeURIComponent('Join my call')}&body=${encodedText}`, '_blank');
                modal.remove();
            });
            document.getElementById('shareCopyLink').addEventListener('click', () => {
                navigator.clipboard.writeText(link)
                    .then(() => showNotification('Call link copied to clipboard!', 'success'))
                    .catch(() => showNotification('Failed to copy link', 'error'));
                modal.remove();
            });
        },
        
        switchCallCategory: function(category) {
            UIState.currentCallCategory = category;
            
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === category) {
                    btn.classList.add('active');
                }
            });
            
            if (elements.allCallsSection) elements.allCallsSection.classList.remove('active');
            if (elements.missedCallsSection) elements.missedCallsSection.classList.remove('active');
            if (elements.groupCallsSection) elements.groupCallsSection.classList.remove('active');
            
            if (category === 'all' && elements.allCallsSection) {
                elements.allCallsSection.classList.add('active');
            } else if (category === 'missed' && elements.missedCallsSection) {
                elements.missedCallsSection.classList.add('active');
            } else if (category === 'group' && elements.groupCallsSection) {
                elements.groupCallsSection.classList.add('active');
            }
        },
        
        switchNewCallTab: function(tabId) {
            UIState.currentNewCallTab = tabId;
            
            document.querySelectorAll('.new-call-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tab === tabId) {
                    tab.classList.add('active');
                }
            });
            
            document.querySelectorAll('.new-call-tab-content').forEach(content => {
                content.classList.remove('active');
                if (content.id === tabId + 'Tab') {
                    content.classList.add('active');
                }
            });
        },
        
        toggleSettingsPanel: function() {
            if (elements.settingsPanel) {
                elements.settingsPanel.classList.toggle('active');
                
                if (elements.settingsToggleIcon) {
                    elements.settingsToggleIcon.className = elements.settingsPanel.classList.contains('active') ? 
                        'fas fa-times' : 'fas fa-cog';
                }
                
                if (elements.settingsPanel.classList.contains('active')) {
                    UIState.activePanels.add('settingsPanel');
                } else {
                    UIState.activePanels.delete('settingsPanel');
                }
            }
        },
        
        openPaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.add('active');
                UIState.activeModals.add('paymentModal');
            }
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        closePaymentModal: function() {
            if (elements.paymentModal) {
                elements.paymentModal.classList.remove('active');
                UIState.activeModals.delete('paymentModal');
            }
        },
        
        selectPaymentOption: function(e) {
            document.querySelectorAll('.payment-option').forEach(option => {
                option.classList.remove('selected');
            });
            e.currentTarget.classList.add('selected');
        },
        
        processPayment: function() {
            const phoneNumber = elements.phoneNumber?.value.trim() || '';
            const amount = elements.paymentAmount?.value;
            
            if (!phoneNumber || !/^07\d{8}$/.test(phoneNumber)) {
                showNotification('Please enter a valid Kenyan phone number (07XXXXXXXX)', 'error');
                return;
            }
            
            if (!amount || amount < 100) {
                showNotification('Please enter a valid amount (minimum 100 KES)', 'error');
                return;
            }
            
            showNotification('Processing payment...', 'info');
            
            setTimeout(() => {
                UIEventHandlers.closePaymentModal();
                if (window.AppState) window.AppState.isPremium = true;
                showNotification('Payment successful! Premium features unlocked.', 'success');
            }, 2000);
        },
        
        closePremiumLimitModal: function() {
            if (elements.premiumLimitOverlay) {
                elements.premiumLimitOverlay.classList.remove('active');
            }
        },
        
        sendReaction: function(e) {
            if (!canPerformAction('sendReaction')) return;
            
            if (!UIState.activeCallId && !coreInstance?.isInCall?.()) {
                showNotification('Join a call to send reactions', 'info');
                return;
            }
            
            let reaction = '👍';
            
            if (e && e.currentTarget) {
                reaction = e.currentTarget.dataset.reaction || '👍';
            }
            
            this.createFloatingReaction(reaction);
            
            if (coreInstance && coreInstance.sendReaction) {
                coreInstance.sendReaction(reaction);
            }
            
            sendToParent('REACTION', { reaction, timestamp: Date.now() });
            
            showNotification(`Sent ${reaction} reaction`, 'info');
        },
        
        createFloatingReaction: function(reaction) {
            if (!elements.callContainer) return;
            
            const reactionEl = document.createElement('div');
            reactionEl.className = 'floating-reaction';
            reactionEl.textContent = reaction;
            reactionEl.style.left = Math.random() * 80 + 10 + '%';
            reactionEl.style.top = Math.random() * 80 + 10 + '%';
            
            elements.callContainer.appendChild(reactionEl);
            
            setTimeout(() => {
                if (reactionEl.parentNode) {
                    reactionEl.remove();
                }
            }, 3000);
        },
        
        handleLogout: function() {
            if (DEBUG) {
                logOnce('info', 'Logout triggered');
            }
            
            window.__CHILD_SESSION__.token = null;
            window.__CHILD_SESSION__.userId = null;
            window.__CHILD_SESSION__.expires = null;
            sessionReady = false;
            parentReady = false;
            handshakeComplete = false;
            _sessionInvalid = true;
            
            if (window.AppState) {
                window.AppState.isAuthenticated = false;
                window.AppState.user = null;
                window.AppState.currentUser = null;
            }
            
            const protectedButtons = [
                elements.newCallBtn,
                elements.quickVoiceBtn,
                elements.quickVideoBtn,
                elements.quickGroupBtn
            ];
            
            protectedButtons.forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                }
            });
            
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            
            showNotification('Logged out', 'info');
        }
    };

    // FIX-ENDCALL-BRIDGE: UIEventHandlers.endCall / handleCallEnded / handleCallInitiated
    // were referenced throughout this file (endCallBtn, callHeaderEndBtn, the outgoing
    // cancel button, decline/timeout/remote-end paths, and the module-level `endCall`
    // export used by inline onclick handlers) but were never actually defined on
    // UIEventHandlers — the real implementations live on CoreIntegration. Because every
    // call site guarded with `UIEventHandlers.handleCallEnded && ...` or relied on
    // safeBind() (which silently no-ops on a missing function), clicking "End Call" or
    // "Cancel" did nothing: no server notification, no WebRTC teardown, no UI reset —
    // which is also why both sides could get stuck on a dark call screen with the
    // bottom nav/sidebar hidden after a call ended. Bridging these to CoreIntegration's
    // real methods restores end/cancel/decline/timeout call termination everywhere.
    UIEventHandlers.handleCallEnded = function(callData) {
        return CoreIntegration.handleCallEnded(callData || {});
    };
    UIEventHandlers.handleCallInitiated = function(callData) {
        return CoreIntegration.handleCallInitiated(callData || {});
    };
    UIEventHandlers.endCall = function() {
        // FIX-GROUP-HOST-ONLY-END: in a group call, "End Call" must not
        // terminate the meeting for every participant — that's a host-only
        // action (see CallSignalingService.js's isHost() authorization and
        // GroupCallEngine.endGroupCallForAll()/leaveGroupCall()). A regular
        // participant tapping "End" should simply leave; the call keeps
        // going for everyone else. Only the host's tap ends it for all.
        try {
            const gce = window.__GroupCallEngine || window.GroupCall;
            if (gce && typeof gce.isHost === 'function' && gce._callId) {
                if (gce.isHost()) {
                    gce.endGroupCallForAll('host_ended');
                } else {
                    gce.leaveGroupCall('left');
                }
                UIEventHandlers.handleCallEnded({ reason: 'ended', status: 'ended' });
                return;
            }
        } catch (e) {
            console.error('[Calls UI] endCall: group-call teardown failed', e);
        }

        // Not a group call (or GroupCallEngine unavailable) — existing 1:1 path.
        // Notify the server / tear down WebRTC first, then reset all call UI/state.
        try {
            if (window.callCore && typeof window.callCore.endCall === 'function') {
                window.callCore.endCall();
            } else if (window.coreInstance && typeof window.coreInstance.endCall === 'function') {
                window.coreInstance.endCall();
            }
        } catch (e) {
            console.error('[Calls UI] endCall: core teardown failed', e);
        }
        UIEventHandlers.handleCallEnded({ reason: 'ended', status: 'ended' });
    };

    // FIX-PROXY-BRIDGE: the top-of-file `var UIEventHandlers = new Proxy(...)`
    // guard exists so code that runs BEFORE this IIFE (module top-level —
    // e.g. the outgoing Cancel button in showCallingScreen, endCallBtn,
    // callHeaderEndBtn) can safely call UIEventHandlers.* without a
    // ReferenceError. Its get-trap forwards unknown calls to
    // window.__UIEventHandlersReal — but nothing ever assigned that global,
    // so every call through the Proxy (i.e. every call from outside this
    // IIFE) silently returned undefined and did nothing. That's why End
    // Call / Cancel could appear to do nothing and leave the nav icons
    // hidden: the real handleCallEnded (with the nav-icon/sidebar restore)
    // was never actually reached from those buttons. Complete the bridge.
    window.__UIEventHandlersReal = UIEventHandlers;

