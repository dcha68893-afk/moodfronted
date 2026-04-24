/**
 * CallOverlay Manager - 3-State Overlay System
 * IDLE -> CALLING -> IN-CALL
 * Never replaces main page, always floats above content
 */

(function() {
    'use strict';

    // ==================== GLOBAL STATE ====================
    const CallOverlayState = {
        IDLE: 'idle',
        CALLING: 'calling', 
        IN_CALL: 'in-call'
    };

    let currentState = CallOverlayState.IDLE;
    let callData = null;
    let timerInterval = null;
    let isMuted = false;
    let isVideoOn = false;
    let isSpeakerOn = true;

    // ==================== DOM ELEMENTS ====================
    const elements = {
        overlay: null,
        floatingPanel: null,
        expandedPanel: null,
        floatingAvatar: null,
        floatingName: null,
        floatingStatus: null,
        floatingCancel: null,
        expandedAvatar: null,
        expandedName: null,
        expandedTimer: null,
        expandedMinimize: null,
        expandedEnd: null,
        expandedMute: null,
        expandedVideo: null,
        expandedSpeaker: null,
        expandedVideoArea: null
    };

    // ==================== ELEMENT CACHING ====================
    function cacheElements() {
        elements.overlay = document.getElementById('callOverlay');
        elements.floatingPanel = document.getElementById('callFloatingPanel');
        elements.expandedPanel = document.getElementById('callExpandedPanel');
        elements.floatingAvatar = document.getElementById('floatingAvatar');
        elements.floatingName = document.getElementById('floatingName');
        elements.floatingStatus = document.getElementById('floatingStatus');
        elements.floatingCancel = document.getElementById('floatingCancelBtn');
        elements.expandedAvatar = document.getElementById('expandedAvatar');
        elements.expandedName = document.getElementById('expandedName');
        elements.expandedTimer = document.getElementById('expandedTimer');
        elements.expandedMinimize = document.getElementById('expandedMinimizeBtn');
        elements.expandedEnd = document.getElementById('expandedEndBtn');
        elements.expandedMute = document.getElementById('expandedMuteBtn');
        elements.expandedVideo = document.getElementById('expandedVideoBtn');
        elements.expandedSpeaker = document.getElementById('expandedSpeakerBtn');
        elements.expandedVideoArea = document.getElementById('expandedVideoArea');
    }

    // ==================== STATE MANAGEMENT ====================
    function setState(newState, newCallData = null) {
        if (currentState === newState && !newCallData) return;

        currentState = newState;
        callData = newCallData;
        
        updateOverlayState();
        wireEventListeners();
    }

    function updateOverlayState() {
        if (!elements.overlay) return;

        // Update data-state attribute
        elements.overlay.setAttribute('data-state', currentState);

        // Handle state-specific UI updates
        switch (currentState) {
            case CallOverlayState.IDLE:
                hideAllPanels();
                stopTimer();
                break;

            case CallOverlayState.CALLING:
                showFloatingPanel();
                hideExpandedPanel();
                updateFloatingInfo();
                break;

            case CallOverlayState.IN_CALL:
                hideFloatingPanel();
                showExpandedPanel();
                updateExpandedInfo();
                startTimer();
                break;
        }
    }

    // ==================== PANEL VISIBILITY ====================
    function showFloatingPanel() {
        if (elements.floatingPanel) {
            elements.floatingPanel.style.display = 'block';
        }
    }

    function hideFloatingPanel() {
        if (elements.floatingPanel) {
            elements.floatingPanel.style.display = 'none';
        }
    }

    function showExpandedPanel() {
        if (elements.expandedPanel) {
            elements.expandedPanel.style.display = 'flex';
        }
    }

    function hideExpandedPanel() {
        if (elements.expandedPanel) {
            elements.expandedPanel.style.display = 'none';
        }
    }

    function hideAllPanels() {
        hideFloatingPanel();
        hideExpandedPanel();
    }

    // ==================== UI UPDATES ====================
    function updateFloatingInfo() {
        if (!callData || !elements.floatingName || !elements.floatingStatus) return;

        if (elements.floatingName) {
            elements.floatingName.textContent = callData.userName || 'User';
        }

        if (elements.floatingStatus) {
            elements.floatingStatus.textContent = callData.status || 'Calling...';
        }

        if (elements.floatingAvatar && callData.userAvatar) {
            elements.floatingAvatar.innerHTML = callData.userAvatar;
        } else if (elements.floatingAvatar) {
            elements.floatingAvatar.innerHTML = '<i class="fas fa-user"></i>';
        }
    }

    function updateExpandedInfo() {
        if (!callData) return;

        if (elements.expandedName) {
            elements.expandedName.textContent = callData.userName || 'User';
        }

        if (elements.expandedAvatar && callData.userAvatar) {
            elements.expandedAvatar.innerHTML = callData.userAvatar;
        } else if (elements.expandedAvatar) {
            elements.expandedAvatar.innerHTML = '<i class="fas fa-user"></i>';
        }

        updateControlStates();
    }

    function updateControlStates() {
        // Update mute button
        if (elements.expandedMute) {
            const icon = elements.expandedMute.querySelector('i');
            const label = elements.expandedMute.querySelector('.control-label');
            
            if (icon) {
                icon.className = isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
            }
            if (label) {
                label.textContent = isMuted ? 'Unmute' : 'Mute';
            }
        }

        // Update video button
        if (elements.expandedVideo) {
            const icon = elements.expandedVideo.querySelector('i');
            const label = elements.expandedVideo.querySelector('.control-label');
            
            if (icon) {
                icon.className = isVideoOn ? 'fas fa-video' : 'fas fa-video-slash';
            }
            if (label) {
                label.textContent = isVideoOn ? 'Video' : 'Video Off';
            }
        }

        // Update speaker button
        if (elements.expandedSpeaker) {
            const icon = elements.expandedSpeaker.querySelector('i');
            const label = elements.expandedSpeaker.querySelector('.control-label');
            
            if (icon) {
                icon.className = isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            }
            if (label) {
                label.textContent = isSpeakerOn ? 'Speaker' : 'Muted';
            }
        }
    }

    // ==================== TIMER MANAGEMENT ====================
    function startTimer() {
        if (timerInterval) return;
        
        const startTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            
            if (elements.expandedTimer) {
                elements.expandedTimer.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        if (elements.expandedTimer) {
            elements.expandedTimer.textContent = '00:00';
        }
    }

    // ==================== EVENT HANDLERS ====================
    function wireEventListeners() {
        // Remove existing listeners
        unwireEventListeners();

        switch (currentState) {
            case CallOverlayState.CALLING:
                wireCallingListeners();
                break;
            case CallOverlayState.IN_CALL:
                wireInCallListeners();
                break;
        }
    }

    function wireCallingListeners() {
        if (elements.floatingCancel && !elements.floatingCancel._overlayWired) {
            elements.floatingCancel._overlayWired = true;
            elements.floatingCancel.addEventListener('click', handleCancelCall);
        }
    }

    function wireInCallListeners() {
        if (elements.expandedMinimize && !elements.expandedMinimize._overlayWired) {
            elements.expandedMinimize._overlayWired = true;
            elements.expandedMinimize.addEventListener('click', handleMinimize);
        }

        if (elements.expandedEnd && !elements.expandedEnd._overlayWired) {
            elements.expandedEnd._overlayWired = true;
            elements.expandedEnd.addEventListener('click', handleEndCall);
        }

        if (elements.expandedMute && !elements.expandedMute._overlayWired) {
            elements.expandedMute._overlayWired = true;
            elements.expandedMute.addEventListener('click', handleMuteToggle);
        }

        if (elements.expandedVideo && !elements.expandedVideo._overlayWired) {
            elements.expandedVideo._overlayWired = true;
            elements.expandedVideo.addEventListener('click', handleVideoToggle);
        }

        if (elements.expandedSpeaker && !elements.expandedSpeaker._overlayWired) {
            elements.expandedSpeaker._overlayWired = true;
            elements.expandedSpeaker.addEventListener('click', handleSpeakerToggle);
        }
    }

    function unwireEventListeners() {
        // Remove all overlay-specific event listeners
        const allElements = [
            elements.floatingCancel,
            elements.expandedMinimize,
            elements.expandedEnd,
            elements.expandedMute,
            elements.expandedVideo,
            elements.expandedSpeaker
        ];

        allElements.forEach(el => {
            if (el && el._overlayWired) {
                el.removeEventListener('click', el._overlayHandler);
                el._overlayWired = false;
            }
        });
    }

    // ==================== ACTION HANDLERS ====================
    function handleCancelCall() {
        if (window.callCore && window.callCore.endCall) {
            window.callCore.endCall();
        }
        setState(CallOverlayState.IDLE);
    }

    function handleEndCall() {
        if (window.callCore && window.callCore.endCall) {
            window.callCore.endCall();
        }
        setState(CallOverlayState.IDLE);
    }

    function handleMinimize() {
        setState(CallOverlayState.CALLING, callData);
    }

    function handleMuteToggle() {
        isMuted = !isMuted;
        
        if (window.callCore && window.callCore.setMuted) {
            window.callCore.setMuted(isMuted);
        }
        
        updateControlStates();
    }

    function handleVideoToggle() {
        isVideoOn = !isVideoOn;
        
        if (window.callCore && window.callCore.setVideoEnabled) {
            window.callCore.setVideoEnabled(isVideoOn);
        }
        
        updateControlStates();
    }

    function handleSpeakerToggle() {
        isSpeakerOn = !isSpeakerOn;
        
        if (window.callCore && window.callCore.setSpeakerEnabled) {
            window.callCore.setSpeakerEnabled(isSpeakerOn);
        }
        
        updateControlStates();
    }

    // ==================== PUBLIC API ====================
    window.CallOverlayManager = {
        // State management
        setState: setState,
        getState: () => ({ state: currentState, data: callData }),
        isIdle: () => currentState === CallOverlayState.IDLE,
        isCalling: () => currentState === CallOverlayState.CALLING,
        isInCall: () => currentState === CallOverlayState.IN_CALL,

        // Control state
        setMuted: (muted) => { isMuted = muted; updateControlStates(); },
        setVideoOn: (videoOn) => { isVideoOn = videoOn; updateControlStates(); },
        setSpeakerOn: (speakerOn) => { isSpeakerOn = speakerOn; updateControlStates(); },
        
        // Integration helpers
        startCall: (callInfo) => setState(CallOverlayState.CALLING, callInfo),
        answerCall: (callInfo) => setState(CallOverlayState.IN_CALL, callInfo),
        endCall: () => setState(CallOverlayState.IDLE),
        minimizeCall: () => setState(CallOverlayState.CALLING, callData),
        maximizeCall: () => setState(CallOverlayState.IN_CALL, callData),
        
        // Video area management
        setVideoElement: (videoElement) => {
            if (elements.expandedVideoArea) {
                elements.expandedVideoArea.innerHTML = '';
                elements.expandedVideoArea.appendChild(videoElement);
            }
        },
        
        // Initialization
        initialize: () => {
            cacheElements();
            setState(CallOverlayState.IDLE);
            console.log('[CallOverlay] 3-state overlay system initialized');
        }
    };

    // ==================== AUTO-INITIALIZATION ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.CallOverlayManager.initialize);
    } else {
        window.CallOverlayManager.initialize();
    }

})();
