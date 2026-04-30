// calls-ui.js
// ==================== RESILIENT UI CONTROLLER - DETERMINISTIC LIFECYCLE ====================
// Version: 5.2.1 - FIXED: createNotification HTML sanitizer, call history refresh
// Dependencies: calls-core.js v9.0.1
// =======================================================================================

// ==================== EARLY OPEN_CALL_WITH_USER LISTENER ====================
// Set up immediately when script loads, before any initialization

// ==================== UI STATE DEFINITION ====================
const UIState = {
    // Call state
    activeCallId: null,
    callActive: false,
    callState: 'idle',
    callParticipants: [],
    callStartTime: null,
    callType: null,
    callDurationInterval: null,
    localStream: null,
    remoteStream: null,
    remoteStreams: new Map(),
    screenStream: null,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    isSpeakerOn: true,
    currentFocusMode: false,
    
    // UI state
    currentView: 'sidebar',
    viewHistory: [],
    restorePoints: new Map(),
    activeModals: new Set(),
    activePanels: new Set(),
    activeOverlays: new Set(),
    cachedElements: new Map(),
    renderStages: { skeleton: false, initial: false, enhanced: false, live: false },
    renderStartTime: 0,
    lastRenderTime: 0,
    renderCount: 0,
    cachedTemplates: new Map(),
    mutationObserver: null,
    breakpoints: { mobile: 480, tablet: 768, desktop: 1024, wide: 1440 },
    inputMode: 'mouse',
    errorRecovery: { attempts: new Map(), maxAttempts: 3, backoffMs: 1000 },
    security: { sanitizing: false, maxSanitizeDepth: 10, currentDepth: 0 },
    initialized: false,
    
    // Call-specific UI state
    selectedMood: 'neutral',
    selectedIntention: 'quick',
    currentCallCategory: 'all',
    currentNewCallTab: 'contacts',
    selectedContacts: [],
    selectedGroupContacts: [],
    groupCallOption: null,
    callLink: null,
    
    // Chat and collaboration
    chatMessages: [],
    unreadChatCount: 0,
    activePolls: [],
    pollResults: [],
    sharedNotes: [],
    privateNotes: {},
    relationshipData: null,
    
    // Legacy compatibility
    contacts: [],
    callChatMessages: [],
    callNotes: '',
    callPolls: [],
    callHistory: [],
    
    // No polling intervals - rely on core events
    handshakeCheckInterval: null,
    
    // Pending call user info for modal pre-fill
    pendingCallUser: null
};

function showCallingScreenViaPatch(callInfo) {
    console.log('[UI] showCallingScreenViaPatch → caller outgoing screen', callInfo);

    // ── Set call-active FIRST so the guard allows callContainer to show ──
    UIState.callActive      = true;
    UIState.callState       = 'calling';
    UIState.pendingCallUser = callInfo;
    window.__callActive     = true;
    document.body.classList.add('call-active');

    // Fix 4: Persist peer info durably so CALL_ACCEPTED survives a force_ended wipe
    window.__activePeerName   = callInfo.userName   || null;
    window.__activePeerType   = callInfo.callType   || 'voice';
    window.__activePeerAvatar = callInfo.userAvatar || null;
    // Reset accept dedup so this new call can be handled
    window.__callAcceptedHandled = 0;

    // ── PRIMARY: Use CallOverlayManager fullscreen overlay ──
    if (window.CallOverlayManager) {
        const fName   = document.getElementById('floatingName');
        const fStatus = document.getElementById('floatingStatus');
        const fAvatar = document.getElementById('floatingAvatar');
        if (fName)   fName.textContent   = callInfo.userName || 'User';
        if (fStatus) fStatus.textContent = callInfo.status   || 'Calling...';
        if (fAvatar) fAvatar.innerHTML   = callInfo.userAvatar || '<i class="fas fa-user"></i>';
        window.CallOverlayManager.startCall(callInfo);
    }

    // ── FALLBACK: also manage internal screens ──
    const idleScreen   = document.getElementById('idleScreen');
    const inCallScreen = document.getElementById('inCallScreen');
    const callContainer = document.getElementById('callContainer');

    if (callContainer) { callContainer.classList.add('active'); callContainer.style.display = 'flex'; }
    if (idleScreen)    { idleScreen.classList.remove('active'); idleScreen.style.setProperty('display','none','important'); }
    if (inCallScreen)  { inCallScreen.classList.remove('active'); inCallScreen.style.setProperty('display','none','important'); }

    // ── Show the unified OUTGOING CALLING screen ──
    const callingScreen = document.getElementById('callingScreen');
    if (!callingScreen) { console.error('[UI] #callingScreen not found'); return; }
    callingScreen.classList.add('active');
    callingScreen.style.setProperty('display','flex','important');

    // ── Populate contact info ──
    const avatar = callingScreen.querySelector('#callingAvatar') || document.getElementById('callingAvatar');
    const name   = callingScreen.querySelector('#callingName')   || document.getElementById('callingName');
    const status = callingScreen.querySelector('#callingStatus') || document.getElementById('callingStatus');
    const type   = callingScreen.querySelector('#callingType')   || document.getElementById('callingType');
    const label  = callingScreen.querySelector('#callingLabel')  || document.getElementById('callingLabel');

    if (avatar) avatar.innerHTML = callInfo.userAvatar || '<i class="fas fa-user"></i>';
    if (name)   name.textContent  = callInfo.userName  || 'User';
    if (status) status.textContent = callInfo.status   || 'Ringing...';
    if (type)   type.textContent  = callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
    if (label)  label.textContent = 'Calling…';

    // ── Wire the Cancel button (once) ──
    const cancelBtn = callingScreen.querySelector('#callingCancelBtn') || document.getElementById('callingCancelBtn');
    if (cancelBtn && !cancelBtn._unified_wired) {
        cancelBtn._unified_wired = true;
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            if (window.callCore && window.callCore.endCall) window.callCore.endCall();
            // Safe call: showIdleScreen may not be hoisted yet in some execution contexts
            if (typeof showIdleScreen === 'function') {
                showIdleScreen();
            } else if (typeof window.showIdleScreen === 'function') {
                window.showIdleScreen();
            } else {
                // Fallback: manually hide calling screen and show idle
                const _cs = document.getElementById('callingScreen');
                const _is = document.getElementById('idleScreen');
                if (_cs) { _cs.classList.remove('active'); _cs.style.setProperty('display','none','important'); }
                if (_is) { _is.classList.add('active'); _is.style.setProperty('display','flex','important'); }
            }
        };
    }

    // ── State ──
    UIState.callActive      = true;
    UIState.callState       = 'calling';
    UIState.pendingCallUser = callInfo;
    window.__callActive     = true;
    document.body.classList.add('call-active');

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CALL_SCREEN_ACTIVE', payload: { active: true } }, '*');
    }
    console.log('[UI] Caller outgoing screen VISIBLE ✓');
}

// ==================== CRITICAL FIX: FORCE CALLING SCREEN VISIBILITY ====================
// This ensures the calling screen appears and STAYS visible for 2 minutes
// ==================== GLOBAL CALL HISTORY UPDATES ====================
const GlobalCallHistory = {
    emitUpdate: function(eventType, data = {}) {
        const eventData = {
            type: eventType,
            timestamp: Date.now(),
            source: 'calls-module',
            ...data
        };
        
        if (window.KynectaEventBus) {
            window.KynectaEventBus.emit('CALL_HISTORY_UPDATE', eventData);
        }
        
        window.dispatchEvent(new CustomEvent('kyn:callHistory:update', { detail: eventData }));
        document.dispatchEvent(new CustomEvent('callHistory:update', { detail: eventData }));
        
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'CALL_HISTORY_UPDATE',
                payload: eventData
            }, '*');
        }
        
        console.log('[Calls UI] Global call history update emitted:', eventType);
    },
    
    onUpdate: function(callback) {
        if (typeof callback !== 'function') return;
        
        let eventBusUnsub = null;
        if (window.KynectaEventBus) {
            eventBusUnsub = window.KynectaEventBus.on('CALL_HISTORY_UPDATE', callback);
        }
        
        const domHandler = (event) => callback(event.detail);
        window.addEventListener('kyn:callHistory:update', domHandler);
        document.addEventListener('callHistory:update', domHandler);
        
        const messageHandler = (event) => {
            if (event.data && event.data.type === 'CALL_HISTORY_UPDATE') {
                callback(event.data.payload);
            }
        };
        window.addEventListener('message', messageHandler);
        
        return () => {
            if (eventBusUnsub) eventBusUnsub();
            window.removeEventListener('kyn:callHistory:update', domHandler);
            document.removeEventListener('callHistory:update', domHandler);
            window.removeEventListener('message', messageHandler);
        };
    }
};

// ==================== EARLY LISTENER SETUP ====================
(function setupEarlyCallListener() {
    'use strict';

    if (window.registerModuleInit && !window.registerModuleInit('calls-ui')) {
        console.warn('[Calls UI] Duplicate initialization skipped');
        return;
    }
    
    let pendingOpenCall = null;
    let listenerEstablished = false;

    async function startCallWithUser(userId, userName, callType) {
    console.log('[Calls UI] startCallWithUser → userId:', userId, '| type:', callType);
    
    if (!userId) {
        console.error('[Calls UI] Cannot start call: No userId');
        showNotificationInCalls('Cannot start call: Missing user information', 'error');
        return;
    }
    
    // Force reset any stale call state
    if (window.callCore && window.callCore.forceResetCallState) {
        console.log('[Calls UI] Force resetting call state');
        window.callCore.forceResetCallState();
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Check if already in a call
    if (window.callCore && window.callCore.isInCall && window.callCore.isInCall()) {
        console.log('[Calls UI] Already in a call');
        showNotificationInCalls('You are already in a call', 'warning');
        return;
    }
    
    // ========== STEP 1: SHOW CALLING SCREEN IMMEDIATELY ==========
    console.log('[Calls UI] Showing calling screen IMMEDIATELY');
    
    // Get avatar if available
    let userAvatar = null;
    const contacts = window.__cachedCallContacts || [];
    const contact = contacts.find(c => String(c.id) === String(userId) || String(c.userId) === String(userId));
    const photoUrl = contact && (contact.avatar || contact.photo || contact.profilePhoto);
    
    if (photoUrl) {
        userAvatar = `<img src="${photoUrl}" alt="${userName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        userAvatar = `<i class="fas fa-user"></i>`;
    }
    
    // Create call info object
    const callInfo = {
        userName: userName || 'User',
        userId: userId,
        callType: callType || 'voice',
        status: 'Calling...',
        userAvatar: userAvatar
    };
    
    // SHOW THE CALLING SCREEN
    showCallingScreen(callInfo);
    
    // Small delay to ensure screen renders
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // ========== STEP 2: Check permissions ==========
    try {
        const hasPermissions = await requestMediaPermissions(callType);
        if (!hasPermissions) {
            console.log('[Calls UI] Permission denied');
            showNotificationInCalls('Microphone access is required for calls', 'error');
            showIdleScreen();
            return;
        }
        console.log('[Calls UI] Permissions granted');
    } catch (permError) {
        console.error('[Calls UI] Permission error:', permError);
        showNotificationInCalls('Cannot access microphone. Please check permissions.', 'error');
        showIdleScreen();
        return;
    }
    
    // ========== STEP 3: Update status to ringing ==========
    const _callingScreen = document.getElementById('callingScreen');
    const statusEl = (_callingScreen && _callingScreen.querySelector('#callingStatus')) || document.getElementById('callingStatus');
    if (statusEl) {
        statusEl.textContent = 'Ringing...';
    }
    
    showNotificationInCalls(`Calling ${userName}...`, 'info');
    
    // ========== STEP 4: Start 2-minute timer ==========
    let callActive = false;
    let timeLeft = 120; // 2 minutes
    let ringTimer = null;
    
    const startRingTimer = () => {
        if (ringTimer) clearInterval(ringTimer);
        
        ringTimer = setInterval(() => {
            if (callActive) return;
            
            timeLeft--;
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            
            if (statusEl && !callActive) {
                statusEl.textContent = `Ringing... (${mins}:${String(secs).padStart(2, '0')})`;
            }
            
            if (timeLeft <= 0) {
                if (ringTimer) clearInterval(ringTimer);
                ringTimer = null;
                if (!callActive) {
                    console.log('[Calls UI] Call timed out after 2 minutes');
                    if (window.callCore && window.callCore.endCall) {
                        window.callCore.endCall();
                    }
                    showIdleScreen();
                    showNotificationInCalls('Call ended - no answer after 2 minutes', 'info');
                }
            }
        }, 1000);
    };
    
    startRingTimer();
    
    // Store timer for cleanup
    window._currentCallTimer = ringTimer;
    
    // ========== STEP 5: Initiate the actual call ==========
    try {
        let result = null;
        
        if (window.callCore && window.callCore.startCall) {
            console.log('[Calls UI] Using callCore.startCall');
            result = await window.callCore.startCall(parseInt(userId), callType);
        } else if (window.callCore && window.callCore.initiateCall) {
            console.log('[Calls UI] Using callCore.initiateCall');
            result = await window.callCore.initiateCall(callType, [parseInt(userId)]);
        } else {
            throw new Error('No call initiation method available');
        }
        
        console.log('[Calls UI] Call initiation result:', result);
        
        if (result && result.success) {
            console.log('[Calls UI] Call initiated successfully');
            // Keep calling screen, just update status
            if (statusEl && statusEl.textContent.includes('Ringing')) {
                // Already showing ringing
            }
        } else if (result && result.reason === 'call_active') {
            // Stale state - reset and retry once
            console.log('[Calls UI] Stale call state detected, resetting...');
            if (window.callCore && window.callCore.forceResetCallState) {
                window.callCore.forceResetCallState();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            // Retry
            if (window.callCore && window.callCore.startCall) {
                result = await window.callCore.startCall(parseInt(userId), callType);
            } else if (window.callCore && window.callCore.initiateCall) {
                result = await window.callCore.initiateCall(callType, [parseInt(userId)]);
            }
            if (result && result.success) {
                console.log('[Calls UI] Retry successful');
            } else {
                throw new Error(result?.error || 'Call failed after reset');
            }
        } else if (result && result.reason === 'offline') {
            // Receiver offline - keep calling screen active!
            console.log('[Calls UI] Receiver is offline - keeping calling screen');
            if (statusEl) {
                statusEl.textContent = 'User is offline - waiting...';
            }
            showNotificationInCalls(`${userName} is offline. Call will ring for 2 minutes.`, 'info');
        } else {
            throw new Error(result?.error || result?.reason || 'Failed to start call');
        }
        
        // Store call info
        UIState.activeCallId = result?.callId || `call_${Date.now()}`;
        UIState.callType = callType;
        UIState.callActive = true;
        UIState.callState = 'calling';
        
    } catch (error) {
        console.error('[Calls UI] Call initiation error:', error);
        showNotificationInCalls(`Call failed: ${error.message}`, 'error');
        
        // Wait a moment then go back to idle
        setTimeout(() => {
            if (ringTimer) clearInterval(ringTimer);
            showIdleScreen();
        }, 2000);
    }
}

    async function requestMediaPermissions(callType) {
        try {
            const constraints = {
                audio: true,
                video: callType === 'video'
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('[Calls UI] Permission request failed:', error);
            if (error.name === 'NotAllowedError') {
                showNotificationInCalls('Please allow microphone access to make calls', 'error');
            }
            return false;
        }
    }

    function showCallingScreen(callInfo) {
    console.log('[Calls UI] ========== SHOWING CALLING SCREEN ==========');
    console.log('[Calls UI] callInfo:', callInfo);
    
    // Get all screen elements
    const idleScreen = document.getElementById('idleScreen');
    const callingScreen = document.getElementById('callingScreen');
    const inCallScreen = document.getElementById('inCallScreen');
    const sidebar = document.getElementById('sidebar');
    const callContainer = document.getElementById('callContainer');
    
    // FIX: callContainer is the PARENT of all screens — it must be VISIBLE (not hidden).
    // CSS: .call-container { display:none } / .call-container.active { display:flex }
    // Previously this block removed .active and set display:none — hiding callingScreen's parent.
    if (callContainer) {
        callContainer.classList.add('active');
        callContainer.style.display = 'flex';
    }
    
    // Hide idle screen — CSS uses !important so setProperty is required
    if (idleScreen) {
        idleScreen.classList.remove('active');
        idleScreen.style.setProperty('display', 'none', 'important');
        console.log('[Calls UI] Idle screen hidden');
    }
    
    // Hide in-call screen
    if (inCallScreen) {
        inCallScreen.classList.remove('active');
        inCallScreen.style.setProperty('display', 'none', 'important');
    }
    
    // Show calling screen — CSS uses !important on .active { display:flex }
    if (callingScreen) {
        callingScreen.classList.add('active');
        callingScreen.style.setProperty('display', 'flex', 'important');
        console.log('[Calls UI] Calling screen is now VISIBLE');
        
        // Update calling screen content — scope queries to callingScreen to avoid duplicate ID confusion
        const callingAvatar  = callingScreen.querySelector('#callingAvatar')  || document.getElementById('callingAvatar');
        const callingName    = callingScreen.querySelector('#callingName')    || document.getElementById('callingName');
        const callingStatus  = callingScreen.querySelector('#callingStatus')  || document.getElementById('callingStatus');
        const callingType    = callingScreen.querySelector('#callingType')    || document.getElementById('callingType');
        const callingCancelBtn = callingScreen.querySelector('#callingCancelBtn') || document.getElementById('callingCancelBtn');
        
        if (callingAvatar) {
            if (callInfo.userAvatar) {
                callingAvatar.innerHTML = callInfo.userAvatar;
            } else {
                callingAvatar.innerHTML = '<i class="fas fa-user"></i>';
            }
        }
        
        if (callingName) {
            callingName.textContent = callInfo.userName || 'User';
        }
        
        if (callingStatus) {
            callingStatus.textContent = callInfo.status || 'Calling...';
        }
        
        if (callingType) {
            callingType.textContent = callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
        }
        
        // Wire cancel button (only once)
        if (callingCancelBtn && !callingCancelBtn._wired) {
            callingCancelBtn._wired = true;
            callingCancelBtn.onclick = function() {
                console.log('[Calls UI] Cancel button clicked');
                if (window._currentCallTimer) {
                    clearInterval(window._currentCallTimer);
                    window._currentCallTimer = null;
                }
                if (window.callCore && window.callCore.endCall) {
                    window.callCore.endCall();
                }
                showIdleScreen();
                showNotificationInCalls('Call cancelled', 'info');
            };
        }
    } else {
        console.error('[Calls UI] callingScreen element NOT FOUND in DOM!');
    }
    
    // Mark body as call-active for CSS body.call-active rules
    document.body.classList.add('call-active');

    // Keep sidebar visible always (it stays behind the fixed overlay)
    if (sidebar) {
        sidebar.style.display = 'flex';
    }
    
    UIState.callActive = true;
    UIState.callState  = 'calling';
    window.__callActive = true;
    // Fix 4: Persist peer info durably
    window.__activePeerName   = callInfo.userName   || window.__activePeerName   || null;
    window.__activePeerType   = callInfo.callType   || window.__activePeerType   || 'voice';
    window.__activePeerAvatar = callInfo.userAvatar || window.__activePeerAvatar || null;
    window.__callAcceptedHandled = 0; // reset dedup for this new call

    console.log('[Calls UI] Calling screen setup complete');
}

// Expose on window so other IIFEs / global functions can reach it
window.showCallingScreen = showCallingScreen;
window.startCallWithUser = startCallWithUser;

function showIdleScreen() {
    console.log('[UI] showIdleScreen → returning to idle (no arrows)');
    // Expose on window immediately so cancelBtn.onclick can always reach it
    window.showIdleScreen = showIdleScreen;

    // ── Stop timers ──
    if (window._currentCallTimer)  { clearInterval(window._currentCallTimer);  window._currentCallTimer  = null; }
    if (window._callRingTimer)      { clearInterval(window._callRingTimer);      window._callRingTimer      = null; }
    // Disconnect incoming modal guard observer so future calls can show it
    if (window._modalGuardObserver) { try { window._modalGuardObserver.disconnect(); } catch(e) {} window._modalGuardObserver = null; }

    // ── PRIMARY: Reset CallOverlayManager to idle ──
    if (window.CallOverlayManager) {
        window.CallOverlayManager.endCall();
    }

    const idleScreen    = document.getElementById('idleScreen');
    const callingScreen = document.getElementById('callingScreen');
    const inCallScreen  = document.getElementById('inCallScreen');
    const callContainer = document.getElementById('callContainer');

    // ── Hide outgoing calling screen ──
    if (callingScreen) {
        callingScreen.classList.remove('active');
        callingScreen.style.setProperty('display', 'none', 'important');
        const s = document.getElementById('callingStatus');
        if (s) s.textContent = 'Ringing...';
    }

    // ── Hide in-call screen ──
    if (inCallScreen) {
        inCallScreen.classList.remove('active');
        inCallScreen.style.setProperty('display', 'none', 'important');
    }

    // ── Hide incoming call screen (receiver declined or caller cancelled) ──
    const incoming = document.getElementById('incomingCallModal');
    if (incoming) {
        incoming.classList.remove('active');
        incoming.style.setProperty('display', 'none', 'important');
    }

    // ── Show idle screen ──
    if (callContainer) { callContainer.classList.add('active'); callContainer.style.display = 'flex'; }
    if (idleScreen) {
        idleScreen.classList.add('active');
        idleScreen.style.setProperty('display', 'block', 'important');
    }

    // ── Reset state ──
    UIState.callActive      = false;
    UIState.callState       = 'idle';
    UIState.activeCallId    = null;
    UIState.pendingCallUser = null;
    window.__callActive     = false;
    document.body.classList.remove('call-active');
    document.body.classList.remove('call-connected');

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CALL_SCREEN_ACTIVE', payload: { active: false } }, '*');
    }
    console.log('[UI] Idle screen VISIBLE ✓');
}

function transitionToInCall(callInfo) {
    console.log('[UI] transitionToInCall → showing in-call screen for BOTH sides', callInfo);

    if (window._callRingTimer) { clearInterval(window._callRingTimer); window._callRingTimer = null; }
    if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }

    // ── Always stop ringtones ─────────────────────────────────────────────
    if (window._incomingRingtone) {
        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
        window._incomingRingtone = null;
    }
    if (window._callerRingtone) {
        try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
        window._callerRingtone = null;
    }
    if (window._outgoingRingTimer) { clearInterval(window._outgoingRingTimer); window._outgoingRingTimer = null; }

    if (window.CallOverlayManager) window.CallOverlayManager.answerCall(callInfo);

    // ── Hide calling screen + incoming modal — be aggressive about the modal ─
    ['callingScreen', 'incomingCallModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Clear any countdown timer stored on the modal
            if (el.dataset && el.dataset.timer) { clearInterval(parseInt(el.dataset.timer)); el.dataset.timer = ''; }
            el.classList.remove('active');
            el.style.setProperty('display', 'none', 'important');
            // Belt-and-suspenders: override z-index so it can't sit on top
            el.style.setProperty('z-index', '-1', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
        }
    });

    const inCallScreen = document.getElementById('inCallScreen');
    if (!inCallScreen) { console.error('[UI] #inCallScreen not found'); return; }
    inCallScreen.classList.add('active');
    inCallScreen.style.setProperty('display', 'flex', 'important');

    // ── NUCLEAR OPTION: Watch the incoming modal and force-hide it while in-call ──
    // If anything re-adds .active to incomingCallModal, yank it off immediately.
    // Also guard callingScreen (caller side) so it can't re-appear over inCallScreen.
    const _modalGuardEl = document.getElementById('incomingCallModal');
    const _callingGuardEl = document.getElementById('callingScreen');
    const _guardEls = [_modalGuardEl, _callingGuardEl].filter(Boolean);
    _guardEls.forEach(el => {
        if (el.dataset && el.dataset.timer) { clearInterval(parseInt(el.dataset.timer)); el.dataset.timer = ''; }
        el.classList.remove('active');
        el.style.cssText = 'display:none!important;visibility:hidden!important;pointer-events:none!important;z-index:-1!important;';
    });
    if (_modalGuardEl) {
        // Install MutationObserver to prevent re-activation of EITHER screen
        if (window._modalGuardObserver) { try { window._modalGuardObserver.disconnect(); } catch(e) {} }
        window._modalGuardObserver = new MutationObserver(() => {
            if (!UIState.callActive || UIState.callState !== 'connected') {
                if (window._modalGuardObserver) { window._modalGuardObserver.disconnect(); window._modalGuardObserver = null; }
                return;
            }
            _guardEls.forEach(el => {
                if (el.classList.contains('active') || (el.style.display && el.style.display !== 'none')) {
                    el.classList.remove('active');
                    el.style.cssText = 'display:none!important;visibility:hidden!important;pointer-events:none!important;z-index:-1!important;';
                }
            });
        });
        _guardEls.forEach(el => {
            window._modalGuardObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        });
    }

    // ── Resolve peer name ─────────────────────────────────────────────────
    const name = callInfo.userName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || 'User';
    const callType = callInfo.callType || UIState.callType || 'voice';

    // ── Populate name + timer fields ──────────────────────────────────────
    const callWithName = document.getElementById('callWithName');
    const callDuration = document.getElementById('callDuration');
    if (callWithName) callWithName.textContent = name;
    if (callDuration) callDuration.textContent = '0:00';

    // ── Avatar (initial letter or photo) ─────────────────────────────────
    const incallAvatar = document.getElementById('incallAvatar') || document.getElementById('callAvatar');
    if (incallAvatar) {
        const participant = (UIState.callParticipants && UIState.callParticipants[0]) || {};
        const photo = callInfo.userAvatar || participant.avatar || participant.photo;
        if (photo) {
            incallAvatar.innerHTML = `<img src="${photo}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentNode.textContent='${name.charAt(0).toUpperCase()}'">`;
        } else {
            incallAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }

    // ── Timer (elapsed from callStartTime) ───────────────────────────────
    UIState.callStartTime = UIState.callStartTime || Date.now();
    if (window._currentCallTimer) clearInterval(window._currentCallTimer);
    window._currentCallTimer = setInterval(() => {
        if (!UIState.callActive) { clearInterval(window._currentCallTimer); return; }
        const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
        const m = Math.floor(elapsed / 60), s = elapsed % 60;
        if (callDuration) callDuration.textContent = `${m}:${String(s).padStart(2,'0')}`;
    }, 1000);

    // ── End-call button: terminates call on BOTH sides ────────────────────
    const endCallBtn = document.getElementById('endCallBtn');
    const callHeaderEndBtn = document.getElementById('callHeaderEndBtn');
    const endHandler = function () {
        if (this._ending) return;
        this._ending = true;
        if (window._currentCallTimer) { clearInterval(window._currentCallTimer); window._currentCallTimer = null; }

        const cid = UIState.activeCallId;

        // 1. Tell core to close WebRTC + signal backend
        const core = window.callCore || (window.coreInstance && window.coreInstance.endCall ? window.coreInstance : null);
        if (core && core.endCall) core.endCall(cid).catch(() => {});

        // 2. Tell parent → parent broadcasts CALL_ENDED to ALL iframes (remote side resets too)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'CALL_ENDED',
                payload: { callId: cid, reason: 'ended', status: 'ended' },
                source: 'end-btn'
            }, '*');
        }

        // 3. Reset this side immediately
        UIEventHandlers.handleCallEnded && UIEventHandlers.handleCallEnded({ callId: cid, reason: 'ended' });
    };
    if (endCallBtn && !endCallBtn._wired) { endCallBtn._wired = true; endCallBtn.onclick = endHandler; }
    if (callHeaderEndBtn && !callHeaderEndBtn._wired) { callHeaderEndBtn._wired = true; callHeaderEndBtn.onclick = endHandler; }

    // ── Ensure remote audio is playing ───────────────────────────────────
    setTimeout(() => {
        const remoteAudio = document.getElementById('remoteAudio');
        if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
            remoteAudio.play().catch(() => {});
        }
    }, 500);

    UIState.callActive = true;
    UIState.callState  = 'connected';
    window.__callActive = true;
    document.body.classList.add('call-active');
    document.body.classList.add('call-connected'); // suppresses callingScreen + incomingModal via CSS

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CALL_SCREEN_ACTIVE', payload: { active: true } }, '*');
    }
    console.log('[UI] ✅ In-call screen VISIBLE for both sides');
}

function showInCallScreen(callInfo) {
    // Delegate to transitionToInCall so both caller and receiver get identical screen
    console.log('[UI] showInCallScreen → transitionToInCall', callInfo);
    transitionToInCall(callInfo || {});
}

    function showNotificationInCalls(message, type = 'info') {
        const notificationArea = document.getElementById('notificationArea') || document.getElementById('call-notification-container') || document.body;
        const notification = document.createElement('div');
        notification.className = 'call-notification ' + type;
        notification.setAttribute('role', 'alert');

        const iconMap = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const iconEl = document.createElement('i');
        iconEl.className = 'fas ' + (iconMap[type] || 'fa-bell');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'call-notification-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'call-notification-title';
        titleDiv.textContent = type.charAt(0).toUpperCase() + type.slice(1);

        const msgDiv = document.createElement('div');
        msgDiv.className = 'call-notification-message';
        msgDiv.textContent = message;

        contentDiv.appendChild(titleDiv);
        contentDiv.appendChild(msgDiv);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'call-notification-close';
        closeBtn.setAttribute('aria-label', 'Close');
        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);
        closeBtn.addEventListener('click', function() { notification.remove(); });

        notification.appendChild(iconEl);
        notification.appendChild(contentDiv);
        notification.appendChild(closeBtn);

        notificationArea.appendChild(notification);
        setTimeout(function() { if (notification.parentNode) notification.remove(); }, 4000);
    }
    
    function processPendingCall() {
        if (!pendingOpenCall) return;
        
        const callData = pendingOpenCall;
        pendingOpenCall = null;
        
        const isCoreActive = window.callCore && 
            ((window.callCore.getLifecycleState && window.callCore.getLifecycleState() === 'ACTIVE') ||
             (window.callCore.isCoreReady && window.callCore.isCoreReady()));
        
        if (isCoreActive) {
            startCallWithUser(callData.userId, callData.userName, callData.callType);
        } else {
            console.log('[Calls UI] Core not ready, waiting...');
            pendingOpenCall = callData;
            setTimeout(processPendingCall, 500);
        }
    }
    
    if (!window.__earlyCallLock) window.__earlyCallLock = { ts: 0, userId: null };
    window.addEventListener('OPEN_CALL_WITH_USER', function(event) {
        const data = event.detail || event.data || {};
        const userId = data.userId || data.user_id || data.id;
        if (userId) {
            const lock = window.__earlyCallLock;
            if (lock.userId === String(userId) && (Date.now() - lock.ts) < 2000) {
                console.log('[Calls UI][Early] ⏭ Duplicate suppressed for userId', userId);
                return;
            }
            window.__earlyCallLock = { ts: Date.now(), userId: String(userId) };
        }
        const userName = data.userName || data.name || data.user_name || 'User';
        const callType = data.callType || data.type || data.call_type || 'voice';
        const source = data.source || data.origin || data.from || 'calls';
        let returnTo = data.returnTo || source;
        if (returnTo === 'friends-page' || returnTo === 'friends' || returnTo === 'friend') returnTo = 'friends';
        else if (returnTo === 'messages' || returnTo === 'chat' || returnTo === 'message') returnTo = 'messages';
        else returnTo = 'calls';

        const chatUserId = data.chatUserId || data.conversationUserId || null;
        
        console.log('[Calls UI][Early] Received OPEN_CALL_WITH_USER:', { userId, userName, callType, returnTo, chatUserId });
        
        if (!userId) return;
        
        window.__pendingCallReturnTo = returnTo;
        window.__pendingCallChatUserId = chatUserId || userId;
        window.__callOriginReturnTo = returnTo;
        window.__callOriginChatUserId = chatUserId || userId;
        window.__callOriginChatUserName = userName || null;
        
        pendingOpenCall = { userId, userName, callType };
        
        const isCoreActive = window.callCore && 
            ((window.callCore.getLifecycleState && window.callCore.getLifecycleState() === 'ACTIVE') ||
             (window.callCore.isCoreReady && window.callCore.isCoreReady()));
        
        if (isCoreActive) {
            processPendingCall();
        } else {
            const checkInterval = setInterval(() => {
                const isReady = window.callCore && 
                    ((window.callCore.getLifecycleState && window.callCore.getLifecycleState() === 'ACTIVE') ||
                     (window.callCore.isCoreReady && window.callCore.isCoreReady()));
                
                if (isReady) {
                    clearInterval(checkInterval);
                    processPendingCall();
                }
            }, 200);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                if (pendingOpenCall) {
                    console.warn('[Calls UI] Timeout waiting for core');
                    showNotificationInCalls('Unable to start call - please try again', 'error');
                    pendingOpenCall = null;
                }
            }, 10000);
        }
    });
    
    console.log('[Calls UI][Early] OPEN_CALL_WITH_USER listener established');
})();

// ==================== LOAD CALL HISTORY ====================
async function loadCallHistory() {
    console.log('[Calls UI] Loading call history (OFFLINE-FIRST)...');
    
    const cacheLoaded = loadCachedCallHistory();
    if (cacheLoaded) {
        console.log('[Calls UI] Loaded cached history for instant UI');
    }
    
    const token = window.__CHILD_SESSION__?.token || localStorage.getItem('authToken') || localStorage.getItem('token');
    
    if (!token) {
        console.warn('[Calls UI] No token for call history sync - using cache only');
        return [];
    }
    
    try {
        const data = await new Promise((resolve, reject) => {
            const reqId = 'calls_hist_sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 8000);
            function handler(ev) {
                const msg = ev.data;
                if (msg && msg.type === 'API_RESPONSE' && msg.requestId === reqId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve(msg.payload || msg.data || {});
                }
                if (msg && msg.type === 'CALL_HISTORY_UPDATE' && msg._reqId === reqId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve({ data: { calls: msg.calls || [] }, success: true });
                }
            }
            window.addEventListener('message', handler);
            window.parent.postMessage({
                type: 'API_REQUEST',
                requestId: reqId,
                source: 'calls-iframe',
                payload: { method: 'GET', endpoint: '/calls/history?limit=50', requestId: reqId }
            }, '*');
        });

        const calls = data?.data?.calls || data?.calls || [];
        if (calls.length > 0 || data?.success !== false) {
            console.log('[Calls UI] Background sync: Updated call history:', calls.length, 'calls');
            displayCallHistory(calls);
            cacheCallHistory(calls);
            return calls;
        } else {
            console.warn('[Calls UI] Background sync failed, keeping cache');
            return [];
        }
    } catch (error) {
        console.warn('[Calls UI] Background sync error, keeping cache:', error.message);
        return [];
    }
}

function formatCallClockTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCallChatTimestamp(timestamp) {
    const date = new Date(timestamp || Date.now());
    if (isNaN(date.getTime())) return formatCallClockTime(Date.now());
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return formatCallClockTime(date);
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${formatCallClockTime(date)}`;
}

function handleCallActionClick(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    var btn = this;
    var userId = btn.dataset && btn.dataset.userId;
    var userName = (btn.dataset && btn.dataset.userName) || 'User';
    var callType = (btn.dataset && btn.dataset.callType) || 'voice';

    if (!userId) {
        console.warn('[Calls UI] handleCallActionClick: missing data-user-id on button', btn);
        return;
    }

    console.log('[Calls UI] Call-back triggered:', { userId: userId, userName: userName, callType: callType });

    // FIX: startCallWithUser lives inside setupEarlyCallListener IIFE — use window export
    const _startCall = (typeof startCallWithUser === 'function')
        ? startCallWithUser
        : window.startCallWithUser;
    if (typeof _startCall === 'function') {
        _startCall(userId, userName, callType);
    } else if (window.callCore && typeof window.callCore.startCall === 'function') {
        window.callCore.startCall(userId, callType);
    } else {
        try {
            window.parent.postMessage({
                type: 'INITIATE_CALL',
                payload: { userId: userId, userName: userName, callType: callType },
                source: 'calls-iframe',
                timestamp: Date.now()
            }, '*');
        } catch (err) {
            console.error('[Calls UI] handleCallActionClick: could not initiate call', err);
        }
    }
}

function displayCallHistory(calls) {
    const allCallsList = document.getElementById('allCallsList');
    const missedCallsList = document.getElementById('missedCallsList');
    
    if (!allCallsList) return;
    
    if (calls && calls.length > 0) {
        try {
            localStorage.setItem('cached_call_history', JSON.stringify({
                calls: calls,
                timestamp: Date.now(),
                userId: window.__CHILD_SESSION__?.userId
            }));
        } catch(e) { console.warn('Failed to cache call history:', e); }
    }
    
    if (!calls || calls.length === 0) {
        try {
            const cached = localStorage.getItem('cached_call_history');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.calls && parsed.calls.length > 0) {
                    calls = parsed.calls;
                    console.log('[Calls UI] Loaded call history from cache:', calls.length);
                }
            }
        } catch(e) {}
        
        if (!calls || calls.length === 0) {
            allCallsList.innerHTML = `
                <div class="offline-state">
                    <i class="fas fa-phone-slash"></i>
                    <p>No recent calls</p>
                    <p class="subtext">Your call history will appear here</p>
                </div>
            `;
            return;
        }
    }
    
    allCallsList.innerHTML = '';
    const missedFragment = document.createDocumentFragment();
    let hasMissed = false;
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    function formatCallDateTime(dateString) {
        try {
            var normalizedDate = dateString;
            if (typeof dateString === 'string') {
                normalizedDate = dateString.replace(' ', 'T');
                normalizedDate = normalizedDate.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
            }
            // If it looks like a Unix timestamp in seconds (small number < 1e10), convert to ms
            if (typeof normalizedDate === 'number' && normalizedDate > 0 && normalizedDate < 1e10) {
                normalizedDate = normalizedDate * 1000;
            }
            const date = new Date(normalizedDate);
            const now = new Date();
            // Reject invalid, epoch-zero, or pre-2020 dates (likely unset/corrupt timestamps)
            if (isNaN(date.getTime()) || date.getTime() === 0 || date.getFullYear() < 2020) {
                return { dateStr: '', timeStr: '' };  // no fake timestamp — server data was missing/invalid
            }
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const callDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

            const diffDays = Math.floor((today - callDate) / (1000 * 60 * 60 * 24));
            
            let dateStr = '';
            if (diffDays === 0) {
                dateStr = 'Today';
            } else if (diffDays === 1) {
                dateStr = 'Yesterday';
            } else if (diffDays < 7) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                dateStr = days[date.getDay()];
            } else {
                dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            }
            
            const timeStr = formatCallClockTime(date);
            return { dateStr, timeStr };
        } catch(e) {
            const now = new Date();
            return { dateStr: '', timeStr: '' };  // no fake timestamp — server data was missing/invalid
        }
    }
    
    function getCallDirectionInfo(call) {
        let isOutgoing, isMissed;

        const currentUserId = window.__CHILD_SESSION__?.userId
            || window.__SESSION__?.userId
            || window.__currentUserId
            || (window.callsState && window.callsState.userId);

        if (call.direction === 'outgoing') {
            isOutgoing = true;
            isMissed = false; // Outgoing calls are NEVER missed for the caller
        } else if (call.direction === 'incoming') {
            isOutgoing = false;
            // Missed = incoming call receiver did NOT answer (server confirmed, real record)
            isMissed = call.status === 'missed' && !!call.id && !call.isLocalOnly;
        } else {
            // Fallback: derive direction from callerId vs current user
            isOutgoing = currentUserId != null && (String(call.callerId) === String(currentUserId));
            // Missed only applies to the receiver (incoming side)
            isMissed = call.status === 'missed' && !isOutgoing && !!call.id && !call.isLocalOnly;
        }

        // CRITICAL: outgoing calls are NEVER missed — caller sees "No Answer" or "Outgoing" instead
        if (isOutgoing) isMissed = false;
        // Double-check: only server-confirmed missed calls (has real id, not local-only)
        if (isMissed && (!call.id || call.isLocalOnly)) isMissed = false;

        // Outgoing unanswered: status=missed from server but direction=outgoing → show "No Answer"
        const isNoAnswer = isOutgoing && call.status === 'missed';

        let directionIcon = '';
        let directionText = '';
        let directionColor = '';

        if (isOutgoing && isNoAnswer) {
            directionIcon = '<i class="fas fa-phone-slash" style="font-size:10px;"></i>';
            directionText = 'No Answer';
            directionColor = '#f59e0b';
        } else if (isOutgoing) {
            directionIcon = '<i class="fas fa-phone" style="transform:rotate(-45deg);font-size:10px;"></i>';
            directionText = 'Outgoing';
            directionColor = '#10b981';
        } else if (isMissed) {
            directionIcon = '<i class="fas fa-phone-slash"></i>';
            directionText = 'Missed';
            directionColor = '#ef4444';
        } else {
            directionIcon = '<i class="fas fa-phone" style="transform:rotate(135deg);font-size:10px;"></i>';
            directionText = 'Incoming';
            directionColor = '#3b82f6';
        }

        return { directionIcon, directionText, directionColor, isOutgoing, isMissed };
    }
    
    calls.forEach(function(call) {
        const otherParticipant = (call.otherParticipants && call.otherParticipants[0]) || call.caller;
        const currentUserId = window.__CHILD_SESSION__?.userId
            || window.__SESSION__?.userId
            || window.__currentUserId;
        const isOutgoingCall = call.direction === 'outgoing' || (call.direction == null && String(call.callerId) === String(currentUserId));
        const otherId = isOutgoingCall ? call.receiverId : call.callerId;
        const contactMatch = (UIState.contacts || window.__cachedCallContacts || []).find(c => c.id == otherId || c.userId == otherId);
        
        const name = (otherParticipant && (otherParticipant.displayName || otherParticipant.username))
            || (contactMatch && (contactMatch.displayName || contactMatch.username || contactMatch.name))
            || (call.callerInfo?.username) || (call.calleeInfo?.username)
            || ('User #' + (otherId || '?'));

        const initials = name.split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().substring(0, 2);
        const avatarUrl = otherParticipant?.avatar || otherParticipant?.photoURL || contactMatch?.avatar || contactMatch?.photoURL || '';
        // Real-time status: prefer live UIState contacts data over stale call record
        const _liveContact = (UIState.contacts || window.__cachedCallContacts || []).find(c =>
            c.id == otherId || c.userId == otherId
        );
        const _rawStatus = (_liveContact?.status || _liveContact?.online === true ? 'online' : null)
            || contactMatch?.status
            || (contactMatch?.isOnline ? 'online' : null)
            || 'offline';
        const contactStatus = String(_rawStatus).toLowerCase();
        const contactStatusLabel = contactStatus === 'online'
            ? 'Online'
            : (contactStatus === 'away' ? 'Away' : 'Offline');
        const directionInfo = getCallDirectionInfo(call);
        const { dateStr, timeStr } = formatCallDateTime(call.startedAt || call.createdAt);
        
        let durationDisplay;
        if (call.status === 'missed') {
            durationDisplay = '<span style="color:#ef4444;">Missed</span>';
        } else if (call.status === 'cancelled') {
            durationDisplay = '<span style="color:#f59e0b;">Cancelled</span>';
        } else if (call.status === 'rejected') {
            durationDisplay = '<span style="color:#f59e0b;">Declined</span>';
        } else if (call.duration && call.duration > 0) {
            const mins = Math.floor(call.duration / 60);
            const secs = call.duration % 60;
            durationDisplay = mins + ':' + String(secs).padStart(2, '0');
        } else {
            durationDisplay = call.displayDuration || '0:00';
        }
        
        const item = document.createElement('div');
        item.className = `call-history-item ${directionInfo.isOutgoing ? 'outgoing' : (directionInfo.isMissed ? 'missed' : 'incoming')}`;
        item.style.cssText = 'padding: 8px 12px; margin: 4px 8px;';
        item.dataset.callId = call.id || '';
        
        item.innerHTML = `
            <div class="call-avatar" style="width: 44px; height: 44px; background-color: #6c5ce7; flex-shrink: 0;">
                ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}">` : `<span style="font-size: 14px;">${escapeHtml(initials)}</span>`}
            </div>
            <div class="call-info" style="flex: 1; min-width: 0;">
                <div class="call-name" style="font-size: 14px; margin-bottom: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-weight: 600;">${escapeHtml(name)}</span>
                    <span class="call-direction-badge" style="font-size: 10px; padding: 2px 6px; border-radius: 10px; background: ${directionInfo.directionColor}20; color: ${directionInfo.directionColor};">
                        ${directionInfo.directionIcon} ${directionInfo.directionText}
                    </span>
                    ${call.type === 'video' ? '<span style="font-size: 10px; padding: 2px 6px; border-radius: 10px; background: #8b5cf620; color: #8b5cf6;"><i class="fas fa-video"></i> Video</span>' : '<span style="font-size: 10px; padding: 2px 6px; border-radius: 10px; background: #10b98120; color: #10b981;"><i class="fas fa-phone"></i> Voice</span>'}
                </div>
                <div class="contact-status ${escapeHtml(contactStatus)}" style="margin-bottom: 4px;">
                    <span class="status-dot"></span>
                    ${escapeHtml(contactStatusLabel)}
                </div>
                <div class="call-details" style="font-size: 11px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="display: flex; align-items: center; gap: 3px;">
                        <i class="far fa-clock"></i> ${durationDisplay}
                    </span>
                    ${dateStr ? `<span style="display:flex;align-items:center;gap:3px;"><i class="far fa-calendar-alt"></i> ${escapeHtml(dateStr)}</span>` : ""}
                    ${timeStr ? `<span style="display:flex;align-items:center;gap:3px;"><i class="far fa-clock"></i> ${escapeHtml(timeStr)}</span>` : ""}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:center;">
                <button class="call-action-btn" data-user-id="${escapeHtml(String(otherParticipant?.id || otherId || ''))}" data-user-name="${escapeHtml(name)}" data-call-type="${call.type || 'voice'}" title="Call ${escapeHtml(name)}" style="width:32px;height:32px;font-size:13px;border:none;border-radius:50%;background:#10b98120;color:#10b981;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="chat-action-btn" data-user-id="${escapeHtml(String(otherParticipant?.id || otherId || ''))}" data-user-name="${escapeHtml(name)}" title="Message ${escapeHtml(name)}" style="width:32px;height:32px;font-size:13px;border:none;border-radius:50%;background:#3b82f620;color:#3b82f6;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-comment"></i>
                </button>
            </div>
        `;
        
        allCallsList.appendChild(item);
        
        if (call.status === 'missed') {
            hasMissed = true;
            const missedItem = item.cloneNode(true);
            missedFragment.appendChild(missedItem);
        }
    });
    
    if (missedCallsList) {
        missedCallsList.innerHTML = '';
        if (hasMissed) {
            missedCallsList.appendChild(missedFragment);
        } else {
            const emptyMissed = document.createElement('div');
            emptyMissed.className = 'offline-state';
            emptyMissed.style.padding = '20px';
            emptyMissed.innerHTML = '<i class="fas fa-phone-slash"></i><p style="font-size: 13px;">No missed calls</p>';
            missedCallsList.appendChild(emptyMissed);
        }
    }
    
    document.querySelectorAll('.call-action-btn').forEach(function(btn) {
        btn.removeEventListener('click', handleCallActionClick);
        btn.addEventListener('click', function(e) {
            window.__pendingCallReturnTo = 'calls';
            window.__pendingCallChatUserId = null;
            handleCallActionClick.call(btn, e);
        });
    });

    document.querySelectorAll('.chat-action-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var userId = this.dataset.userId;
            var userName = this.dataset.userName || 'User';
            if (!userId) return;

            console.log('[Calls UI] Opening chat with userId:', userId, userName);

            try {
                window.parent.postMessage({
                    type: 'DIRECT_CHAT_REQUEST',
                    payload: { userId: userId, userName: userName, findExisting: true },
                    source: 'calls-iframe',
                    timestamp: Date.now()
                }, '*');
                return;
            } catch (err) {
                console.warn('[Calls UI] postMessage failed, trying fallback:', err.message);
            }

            try {
                if (window.navigateToPage) { window.navigateToPage('messages'); }
                var msgIframe = document.getElementById('messagesIframe');
                if (msgIframe && msgIframe.contentWindow) {
                    msgIframe.contentWindow.postMessage({
                        type: 'OPEN_CHAT_WITH_USER',
                        payload: { userId: userId, userName: userName, findExisting: true },
                        source: 'calls-module',
                        timestamp: Date.now()
                    }, '*');
                }
            } catch (err2) {
                console.warn('[Calls UI] Fallback chat navigation failed:', err2.message);
            }
        });
    });
}

function loadCachedCallHistory() {
    try {
        const cached = localStorage.getItem('cached_call_history');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.timestamp && (Date.now() - parsed.timestamp) < 86400000) {
                if (parsed.calls && parsed.calls.length > 0) {
                    console.log('[Calls UI] Restoring call history from cache:', parsed.calls.length);
                    displayCallHistory(parsed.calls);
                    return true;
                }
            }
        }
    } catch(e) {
        console.warn('[Calls UI] Failed to load cached history:', e);
    }
    return false;
}

function cacheCallHistory(calls) {
    try {
        if (calls && calls.length > 0) {
            localStorage.setItem('cached_call_history', JSON.stringify({
                calls: calls,
                timestamp: Date.now(),
                userId: window.__CHILD_SESSION__?.userId
            }));
            console.log('[Calls UI] Cached call history:', calls.length, 'calls');
        }
    } catch(e) {
        console.warn('[Calls UI] Failed to cache call history:', e);
    }
}

// ==================== MODULE INITIALIZATION ====================
(function() {
    const CURRENT_MODULE_NAME = 'calls-ui';
    const MODULE_INIT_FLAG = '__CALLS_UI_INIT__';
    
    if (window[MODULE_INIT_FLAG]) {
        return;
    }
    window[MODULE_INIT_FLAG] = true;

    window.__CHILD_SESSION__ = window.__CHILD_SESSION__ || {
        token: null,
        userId: null,
        expires: null
    };

    window.__IFRAME_DEBUG__ = window.__IFRAME_DEBUG__ || false;
    const DEBUG = window.__IFRAME_DEBUG__;

    let coreInstance = null;
    let coreReady = false;
    let coreInitializationStartTime = Date.now();
    let _coreListenersInitialized = false;

    let parentReady = false;
    let sessionReady = false;
    let handshakeComplete = false;
    let fallbackModeActive = false;
    let inPassiveMode = false;
    let coreLifecycleState = 'BOOT';
    let _sessionInvalid = false;
    
    let pendingCall = {
        userId: null,
        userName: null,
        callType: null,
        initiated: false,
        retryCount: 0,
        maxRetries: 5,
        retryDelay: 500,
        retryTimer: null
    };

    const _onceErrors = new Map();
    const _onceTimers = new Map();

    function logOnce(level, message, data) {
        const key = `${level}:${message}`;
        if (_onceErrors.has(key)) return;
        
        _onceErrors.set(key, Date.now());
        
        const timer = setTimeout(() => {
            _onceErrors.delete(key);
            _onceTimers.delete(key);
        }, 60000);
        _onceTimers.set(key, timer);
        
        if (level === 'error') {
            console.error(`[Calls UI] ${message}`, data || '');
        } else if (level === 'warn') {
            console.warn(`[Calls UI] ${message}`, data || '');
        } else {
            console.log(`[Calls UI] ${message}`, data || '');
        }
    }

    function assertCoreActive(actionName) {
        if (!coreInstance) {
            logOnce('warn', `Cannot perform ${actionName} - core not available`);
            return false;
        }
        
        if (coreInstance.assertActive && typeof coreInstance.assertActive === 'function') {
            return coreInstance.assertActive(actionName);
        }
        
        if (coreInstance.getLifecycleState) {
            const state = coreInstance.getLifecycleState();
            coreLifecycleState = state;
            if (state !== 'ACTIVE') {
                logOnce('warn', `Cannot perform ${actionName} - core not ACTIVE (current: ${state})`);
                return false;
            }
            return true;
        }
        
        if (coreInstance.isInCall && coreInstance.isInCall()) {
            logOnce('warn', `Cannot perform ${actionName} - already in a call`);
            return false;
        }
        
        return coreReady && parentReady && sessionReady;
    }

    function sendToParent(type, payload = {}) {
        try {
            if (inPassiveMode) {
                if (DEBUG) {
                    logOnce('info', `Not sending ${type} - in passive mode`);
                }
                return false;
            }
            
            if (window.parent && window.parent !== window) {
                if (coreInstance && coreInstance.sendAction) {
                    coreInstance.sendAction(type, payload);
                    return true;
                }
                
                if (coreInstance && coreInstance.sendToParent) {
                    coreInstance.sendToParent(type, payload, { requireAck: false })
                        .catch(() => {});
                    return true;
                }
                
                const message = {
                    protocol: 'KYN-9.0',
                    type: type,
                    source: CURRENT_MODULE_NAME,
                    target: 'parent',
                    messageId: (window.crypto && window.crypto.randomUUID) ? 
                        window.crypto.randomUUID() : 
                        'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                    timestamp: Date.now(),
                    payload: payload || {},
                    version: '5.2.1'
                };
                window.parent.postMessage(message, '*');
                return true;
            }
        } catch (e) {
            if (DEBUG) {
                logOnce('warn', 'Send to parent failed', e);
            }
        }
        return false;
    }

    function isSessionValid() {
        if (coreInstance && coreInstance.isAuthenticated) {
            return coreInstance.isAuthenticated();
        }
        
        if (coreInstance && coreInstance.getSessionStatus) {
            return coreInstance.getSessionStatus() === 'valid';
        }
        
        if (coreInstance && coreInstance.getSession) {
            const session = coreInstance.getSession();
            if (session && session.token && session.authenticated !== false) {
                return true;
            }
        }
        
        return !!(window.__CHILD_SESSION__ && 
                 window.__CHILD_SESSION__.token && 
                 window.__CHILD_SESSION__.token.length > 10 &&
                 (!window.__CHILD_SESSION__.expires || 
                  window.__CHILD_SESSION__.expires > Date.now()));
    }

    function canPerformAction(actionName) {
        if (inPassiveMode) {
            showNotification('Waiting for parent connection...', 'info');
            return false;
        }
        
        if (fallbackModeActive) {
            showNotification('Limited connectivity - Please retry later', 'warning');
            return false;
        }
        
        const mediaActions = ['toggleMute', 'toggleVideo', 'toggleScreenShare'];
        if (mediaActions.includes(actionName)) {
            const activeStates = ['connected', 'ongoing', 'active', 'call_ready', 'in_call', 'ACTIVE', 'initiating'];
            if (activeStates.includes(UIState.callState) || UIState.callActive === true || !!UIState.activeCallId) {
                return true;
            }
        }
        
        if (coreInstance && coreInstance.assertActive) {
            if (!coreInstance.assertActive(actionName)) {
                showNotification('Call system initializing...', 'info');
                return false;
            }
        } else if (!coreReady) {
            showNotification('Call system initializing...', 'info');
            return false;
        }
        
        const authRequiredActions = [
            'startCall', 'answerCall', 'sendReaction', 
            'setMood', 'setIntention', 'saveNotes'
        ];
        
        if (authRequiredActions.includes(actionName) && !isSessionValid()) {
            showNotification('Please log in to use this feature', 'warning');
            return false;
        }
        
        const callRequiredActions = ['sendReaction', 'sendChatMessage', 'saveNotes'];
        if (callRequiredActions.includes(actionName)) {
            if (coreInstance && coreInstance.isInCall && !coreInstance.isInCall()) {
                showNotification('Join a call to use this feature', 'info');
                return false;
            }
        }
        
        return true;
    }

    // ==================== EVENT-DRIVEN CORE READINESS ====================
    function setupCoreReadyListener() {
        if (_coreListenersInitialized) {
            if (DEBUG) {
                logOnce('info', 'Core ready listeners already initialized');
            }
            return;
        }
        
        if (DEBUG) {
            logOnce('info', 'Setting up core ready listeners');
        }

        // Listen for core ready events - no timeouts
        window.addEventListener('CALLS_CORE_READY', function(event) {
            if (DEBUG) {
                logOnce('success', 'Received CALLS_CORE_READY event', event.detail);
            }
            handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
        });

        window.addEventListener('MODULE_READY', function(event) {
            if (event.detail?.module === 'calls' || !event.detail) {
                if (DEBUG) {
                    logOnce('success', 'Received MODULE_READY for calls module', event.detail);
                }
                handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
            }
        });

        window.addEventListener('core.ready', function(event) {
            if (event.detail?.module === 'calls' || !event.detail) {
                if (DEBUG) {
                    logOnce('success', 'Received core.ready for calls module');
                }
                handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
            }
        });

        window.addEventListener('calls-ready', function(event) {
            if (DEBUG) {
                logOnce('success', 'Received calls-ready event');
            }
            handleCoreReady(window.callCore || window.CallsCore || window.callsCore);
        });

        // Also listen for lifecycle state changes from core
        window.addEventListener('module_state_change', function(event) {
            const detail = event.detail;
            if (detail && detail.module === 'calls') {
                coreLifecycleState = detail.to;
                if (DEBUG) {
                    logOnce('info', `Core lifecycle state changed: ${detail.from} → ${detail.to}`, detail.reason);
                }
                
                // Update UI state based on core lifecycle
                if (detail.to === 'ACTIVE') {
                    coreReady = true;
                    parentReady = true;
                    handshakeComplete = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                    // Try to process any pending call now that core is active
                    attemptPendingCall();
                } else if (detail.to === 'WAIT_PARENT') {
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                } else if (detail.to === 'ERROR') {
                    fallbackModeActive = true;
                    if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                        RenderingPipeline.updateSyncIndicator();
                    }
                }
            }
        });

        // Listen for parent ready from core
        window.addEventListener('parent_ready', function() {
            parentReady = true;
            if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
                RenderingPipeline.updateSyncIndicator();
            }
            attemptPendingCall();
        });

        _coreListenersInitialized = true;
        
        if (DEBUG) {
            logOnce('info', 'Core ready listeners established');
        }
    }

    function handleCoreReady(core) {
        if (coreReady) {
            if (DEBUG) {
                logOnce('info', 'Core already marked as ready, skipping duplicate');
            }
            return;
        }
        
        if (DEBUG) {
            logOnce('success', 'Core is now ready after ' + (Date.now() - coreInitializationStartTime) + 'ms');
        }
        
        coreReady = true;
        coreInstance = core || window.callCore || window.CallsCore || window.callsCore;
        
        // Update state from core
        if (coreInstance) {
            if (coreInstance.getState) {
                const state = coreInstance.getState();
                parentReady = state.parentReady || false;
                sessionReady = state.sessionStatus === 'valid';
                handshakeComplete = state.registered && state.sessionReceived;
                fallbackModeActive = state.degraded || false;
                inPassiveMode = state.inPassiveMode || false;
                coreLifecycleState = state.lifecycleState || coreInstance.getLifecycleState?.() || 'UNKNOWN';
                
                // Update session cache from core
                if (state.session && state.session.token && state.session.authenticated !== false) {
                    window.__CHILD_SESSION__.token = state.session.token;
                    window.__CHILD_SESSION__.userId = state.session.userId;
                    window.__CHILD_SESSION__.expires = state.session.expiresAt;
                    _sessionInvalid = false;
                } else if (state.session && !state.session.authenticated) {
                    _sessionInvalid = true;
                }
            }
            
            if (coreInstance.getLifecycleState) {
                const lifecycleState = coreInstance.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE') {
                    parentReady = true;
                }
            }
            
            // Get parent ready status
            if (coreInstance.getParentReady) {
                parentReady = coreInstance.getParentReady();
            }
            
            // Get session status
            if (coreInstance.isAuthenticated) {
                sessionReady = coreInstance.isAuthenticated();
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
        }
        
        performFullInitialization();
        attemptPendingCall();
    }

    function detectExistingCore() {
        if (window.callCore) {
            // Check if core is in ACTIVE state
            if (window.callCore.getLifecycleState && window.callCore.getLifecycleState() === 'ACTIVE') {
                if (DEBUG) {
                    logOnce('success', 'callCore is in ACTIVE state');
                }
                coreReady = true;
                coreInstance = window.callCore;
                coreLifecycleState = 'ACTIVE';
                parentReady = true;
                
                // Get session
                if (window.callCore.getSession) {
                    const session = window.callCore.getSession();
                    if (session && session.token && session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = session.token;
                        window.__CHILD_SESSION__.userId = session.userId;
                        window.__CHILD_SESSION__.expires = session.expiresAt;
                        sessionReady = true;
                        _sessionInvalid = false;
                    }
                }
                
                return true;
            }
            
            // Check if core reports ready
            if (window.callCore.isCoreReady && typeof window.callCore.isCoreReady === 'function') {
                if (window.callCore.isCoreReady()) {
                    if (DEBUG) {
                        logOnce('success', 'callCore.isCoreReady() returned true');
                    }
                    coreReady = true;
                    coreInstance = window.callCore;
                    
                    if (window.callCore.getState) {
                        const state = window.callCore.getState();
                        parentReady = state.parentReady || false;
                        sessionReady = state.sessionStatus === 'valid';
                        
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            _sessionInvalid = false;
                        }
                    }
                    
                    if (window.callCore.getLifecycleState) {
                        coreLifecycleState = window.callCore.getLifecycleState();
                    }
                    
                    return true;
                }
            }
            
            // Check session status
            if (window.callCore.getSessionStatus && window.callCore.getSessionStatus() === 'valid') {
                if (DEBUG) {
                    logOnce('success', 'callCore session status is valid');
                }
                coreReady = true;
                coreInstance = window.callCore;
                sessionReady = true;
                
                if (window.callCore.getParentReady) {
                    parentReady = window.callCore.getParentReady();
                }
                
                // Update session cache
                const session = window.callCore.getSession();
                if (session && session.token) {
                    window.__CHILD_SESSION__.token = session.token;
                    window.__CHILD_SESSION__.userId = session.userId;
                    window.__CHILD_SESSION__.expires = session.expiresAt;
                    _sessionInvalid = false;
                }
                
                if (window.callCore.getLifecycleState) {
                    coreLifecycleState = window.callCore.getLifecycleState();
                }
                
                return true;
            }
            
            if (window.callCore.getState) {
                const state = window.callCore.getState();
                if (state && state.coreReady) {
                    if (DEBUG) {
                        logOnce('success', 'callCore state shows coreReady');
                    }
                    coreReady = true;
                    coreInstance = window.callCore;
                    parentReady = state.parentReady || false;
                    sessionReady = state.sessionStatus === 'valid';
                    coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                    
                    // Update session cache
                    if (state.session && state.session.token && state.session.authenticated !== false) {
                        window.__CHILD_SESSION__.token = state.session.token;
                        window.__CHILD_SESSION__.userId = state.session.userId;
                        window.__CHILD_SESSION__.expires = state.session.expiresAt;
                        _sessionInvalid = false;
                    }
                    
                    return true;
                }
            }
            
            if (window.callCore.getLifecycleState) {
                const lifecycleState = window.callCore.getLifecycleState();
                coreLifecycleState = lifecycleState;
                if (lifecycleState === 'ACTIVE' || lifecycleState === 'WAIT_PARENT') {
                    if (DEBUG) {
                        logOnce('success', `callCore lifecycle state: ${lifecycleState}`);
                    }
                    coreReady = lifecycleState === 'ACTIVE';
                    coreInstance = window.callCore;
                    if (lifecycleState === 'ACTIVE') {
                        parentReady = true;
                    }
                    
                    // Try to get session
                    if (window.callCore.getSession) {
                        const session = window.callCore.getSession();
                        if (session && session.token && session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = session.token;
                            window.__CHILD_SESSION__.userId = session.userId;
                            window.__CHILD_SESSION__.expires = session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    
                    return true;
                }
            }
        }
        
        return false;
    }

    function waitForCoreReady() {
        return new Promise((resolve) => {
            if (detectExistingCore()) {
                if (DEBUG) {
                    logOnce('success', 'Core already ready, resolving immediately');
                }
                resolve(true);
                return;
            }
            
            if (DEBUG) {
                logOnce('info', 'Waiting for core to become ready via events');
            }
            
            // Set up one-time event listeners
            const readyHandler = function() {
                window.removeEventListener('CALLS_CORE_READY', readyHandler);
                window.removeEventListener('MODULE_READY', moduleHandler);
                window.removeEventListener('core.ready', coreReadyHandler);
                window.removeEventListener('calls-ready', callsReadyHandler);
                
                if (DEBUG) {
                    logOnce('success', 'Core ready detected via event');
                }
                
                coreReady = true;
                coreInstance = window.callCore || window.CallsCore || window.callsCore;
                
                if (coreInstance) {
                    if (coreInstance.getState) {
                        const state = coreInstance.getState();
                        parentReady = state.parentReady || false;
                        coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                        
                        // Update session cache
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    if (coreInstance.getLifecycleState) {
                        coreLifecycleState = coreInstance.getLifecycleState();
                    }
                }
                
                resolve(true);
            };
            
            const moduleHandler = function(event) {
                if (event.detail?.module === 'calls' || !event.detail) {
                    window.removeEventListener('CALLS_CORE_READY', readyHandler);
                    window.removeEventListener('MODULE_READY', moduleHandler);
                    window.removeEventListener('core.ready', coreReadyHandler);
                    window.removeEventListener('calls-ready', callsReadyHandler);
                    
                    if (DEBUG) {
                        logOnce('success', 'Core ready detected via MODULE_READY');
                    }
                    
                    coreReady = true;
                    coreInstance = window.callCore || window.CallsCore || window.callsCore;
                    
                    if (coreInstance) {
                        if (coreInstance.getState) {
                            const state = coreInstance.getState();
                            parentReady = state.parentReady || false;
                            coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                            
                            if (state.session && state.session.token && state.session.authenticated !== false) {
                                window.__CHILD_SESSION__.token = state.session.token;
                                window.__CHILD_SESSION__.userId = state.session.userId;
                                window.__CHILD_SESSION__.expires = state.session.expiresAt;
                                sessionReady = true;
                                _sessionInvalid = false;
                            }
                        }
                        if (coreInstance.getLifecycleState) {
                            coreLifecycleState = coreInstance.getLifecycleState();
                        }
                    }
                    
                    resolve(true);
                }
            };
            
            const coreReadyHandler = function(event) {
                if (event.detail?.module === 'calls' || !event.detail) {
                    window.removeEventListener('CALLS_CORE_READY', readyHandler);
                    window.removeEventListener('MODULE_READY', moduleHandler);
                    window.removeEventListener('core.ready', coreReadyHandler);
                    window.removeEventListener('calls-ready', callsReadyHandler);
                    
                    if (DEBUG) {
                        logOnce('success', 'Core ready detected via core.ready');
                    }
                    
                    coreReady = true;
                    coreInstance = window.callCore || window.CallsCore || window.callsCore;
                    
                    if (coreInstance) {
                        if (coreInstance.getState) {
                            const state = coreInstance.getState();
                            parentReady = state.parentReady || false;
                            coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                            
                            if (state.session && state.session.token && state.session.authenticated !== false) {
                                window.__CHILD_SESSION__.token = state.session.token;
                                window.__CHILD_SESSION__.userId = state.session.userId;
                                window.__CHILD_SESSION__.expires = state.session.expiresAt;
                                sessionReady = true;
                                _sessionInvalid = false;
                            }
                        }
                        if (coreInstance.getLifecycleState) {
                            coreLifecycleState = coreInstance.getLifecycleState();
                        }
                    }
                    
                    resolve(true);
                }
            };
            
            const callsReadyHandler = function() {
                window.removeEventListener('CALLS_CORE_READY', readyHandler);
                window.removeEventListener('MODULE_READY', moduleHandler);
                window.removeEventListener('core.ready', coreReadyHandler);
                window.removeEventListener('calls-ready', callsReadyHandler);
                
                if (DEBUG) {
                    logOnce('success', 'Core ready detected via calls-ready');
                }
                
                coreReady = true;
                coreInstance = window.callCore || window.CallsCore || window.callsCore;
                
                if (coreInstance) {
                    if (coreInstance.getState) {
                        const state = coreInstance.getState();
                        parentReady = state.parentReady || false;
                        coreLifecycleState = state.lifecycleState || 'UNKNOWN';
                        
                        if (state.session && state.session.token && state.session.authenticated !== false) {
                            window.__CHILD_SESSION__.token = state.session.token;
                            window.__CHILD_SESSION__.userId = state.session.userId;
                            window.__CHILD_SESSION__.expires = state.session.expiresAt;
                            sessionReady = true;
                            _sessionInvalid = false;
                        }
                    }
                    if (coreInstance.getLifecycleState) {
                        coreLifecycleState = coreInstance.getLifecycleState();
                    }
                }
                
                resolve(true);
            };
            
            window.addEventListener('CALLS_CORE_READY', readyHandler);
            window.addEventListener('MODULE_READY', moduleHandler);
            window.addEventListener('core.ready', coreReadyHandler);
            window.addEventListener('calls-ready', callsReadyHandler);
            
            // No timeout - just wait for events
        });
    }

    // ==================== OPEN_CALL_WITH_USER EVENT HANDLER ====================
    function handleOpenCallWithUser(event) {
        const data = event.detail || event.data || {};
        
        if (DEBUG) {
            logOnce('info', 'Received OPEN_CALL_WITH_USER event', data);
        }
        
        // Extract call details
        const userId = data.userId || data.user_id || data.id;
        const userName = data.userName || data.name || data.user_name || 'User';
        let callType = data.callType || data.type || data.call_type || 'voice';
        
        // Validate call type
        if (callType !== 'voice' && callType !== 'video') {
            callType = 'voice';
        }
        
        if (!userId) {
            logOnce('error', 'OPEN_CALL_WITH_USER missing userId', data);
            showNotification('Cannot start call: missing user information', 'error');
            return;
        }
        
        // Check if already in a call
        if (coreInstance && coreInstance.isInCall && coreInstance.isInCall()) {
            showNotification('You are already in a call. End current call to start a new one.', 'warning');
            return;
        }
        
        // Store pending call
        pendingCall.userId = userId;
        pendingCall.userName = userName;
        pendingCall.callType = callType;
        pendingCall.initiated = false;
        pendingCall.retryCount = 0;
        
        // Clear any existing retry timer
        if (pendingCall.retryTimer) {
            clearTimeout(pendingCall.retryTimer);
            pendingCall.retryTimer = null;
        }
        
        // Update call panel header with source context
        // (shows the user where this call originated from)
        const callSource = data.source || data.origin || data.from || 'calls';
        const returnTo = data.returnTo || callSource;
        const callSourceCtxEl = document.getElementById('callSourceCtx');
        if (callSourceCtxEl) {
            let sourceLabel = '';
            if (returnTo === 'messages' || returnTo === 'chat' || callSource === 'messages-module') {
                sourceLabel = '← From Messages';
            } else if (returnTo === 'friends' || callSource === 'friends-module') {
                sourceLabel = '← From Friends';
            }
            // 'calls' origin = no label needed (already on calls page)
            if (sourceLabel) {
                callSourceCtxEl.textContent = sourceLabel;
                callSourceCtxEl.style.display = 'block';
            } else {
                callSourceCtxEl.style.display = 'none';
            }
        }

        // Pre-fill UI only when call comes from within the calls module
        // (no need to pre-fill when user already chose someone in messages/friends)
        const isExternalSource = (callSource === 'messages-module' || callSource === 'friends-module'
                                || returnTo === 'messages' || returnTo === 'friends');

        // If the "New Call" contacts picker is open from a previous action, close it —
        // external calls skip that screen entirely and go straight to dialling.
        if (isExternalSource && elements.newCallModal && elements.newCallModal.classList.contains('active')) {
            elements.newCallModal.classList.remove('active');
            UIState.activeModals && UIState.activeModals.delete('newCallModal');
        }

        if (!isExternalSource) {
            prefillCallModal(userId, userName, callType);
        }

        // Open call modal — skipped when triggered from messages or friends module
        openCallModalForUser(userId, userName, callType, callSource);
        
        // Attempt to initiate call (will retry if core not ready)
        attemptPendingCall();
    }
    
    function prefillCallModal(userId, userName, callType) {
        // Store selected user info in UI state for modal pre-fill
        UIState.pendingCallUser = {
            id: userId,
            name: userName,
            type: callType,
            timestamp: Date.now()
        };
        
        // If contacts list is available, pre-select this user
        setTimeout(() => {
            const contactCheckbox = document.querySelector(`.contact-checkbox[id="contact-${userId}"]`);
            if (contactCheckbox) {
                contactCheckbox.checked = true;
                const contactItem = contactCheckbox.closest('.contact-item');
                if (contactItem) {
                    contactItem.classList.add('selected');
                }
            } else {
                // If contact not found in list, try to find by data-id
                const contactItem = document.querySelector(`.contact-item[data-id="${userId}"]`);
                if (contactItem) {
                    const checkbox = contactItem.querySelector('.contact-checkbox');
                    if (checkbox) {
                        checkbox.checked = true;
                        contactItem.classList.add('selected');
                    }
                }
            }
        }, 100);
    }
    
    function openCallModalForUser(userId, userName, callType, source) {
        // If the call was triggered from messages or friends module, the user already
        // chose who to call — skip the "New Call" contacts picker modal entirely.
        const isExternal = source === 'messages-module' || source === 'friends-module'
                        || source === 'messages'         || source === 'friends'
                        || source === 'messages-module'  || source === 'parent-frame';

        if (isExternal) {
            // Just show a brief toast — no modal, no contacts screen
            showNotification(`Starting ${callType} call with ${userName}...`, 'info');
            return;
        }

        // Called from within the calls module — show the contacts picker as normal
        if (elements.newCallModal) {
            elements.newCallModal.classList.add('active');
            UIState.activeModals.add('newCallModal');
            
            // Switch to contacts tab
            UIEventHandlers.switchNewCallTab && UIEventHandlers.switchNewCallTab('contacts');
            
            // Update modal title
            const modalTitle = elements.newCallModal.querySelector('.modal-title');
            if (modalTitle) {
                modalTitle.innerHTML = `<i class="fas fa-phone-alt"></i> Call ${SecuritySanitizer.sanitizeString(userName)}`;
            }
            
            showNotification(`Preparing ${callType} call with ${userName}...`, 'info');
        } else {
            showNotification(`Starting ${callType} call with ${userName}...`, 'info');
        }
    }
    
    async function attemptPendingCall() {
        // Check if there's a pending call
        if (!pendingCall.userId || pendingCall.initiated) {
            return;
        }
        
        // Check if core is ready
        const isCoreActive = coreInstance && 
            ((coreInstance.getLifecycleState && coreInstance.getLifecycleState() === 'ACTIVE') ||
             (coreInstance.isCoreReady && coreInstance.isCoreReady()) ||
             coreReady);
        
        const isParentReadyFlag = parentReady || (coreInstance && coreInstance.getParentReady && coreInstance.getParentReady());
        
        if (!isCoreActive || !isParentReadyFlag) {
            // Core not ready yet - schedule retry
            if (pendingCall.retryCount < pendingCall.maxRetries) {
                pendingCall.retryCount++;
                const delay = pendingCall.retryDelay * Math.pow(1.5, pendingCall.retryCount - 1);
                
                if (DEBUG) {
                    logOnce('info', `Core not ready for call, retry ${pendingCall.retryCount}/${pendingCall.maxRetries} in ${delay}ms`);
                }
                
                pendingCall.retryTimer = setTimeout(() => {
                    attemptPendingCall();
                }, delay);
            } else {
                // Max retries exceeded
                logOnce('error', `Failed to initiate call after ${pendingCall.maxRetries} retries - core not ready`);
                showNotification(`Unable to start call with ${pendingCall.userName}. Please try again later.`, 'error');
                clearPendingCall();
            }
            return;
        }
        
        // Check if already in a call — but auto-reset if stale
        if (coreInstance.isInCall && coreInstance.isInCall()) {
            // Check if this is a genuinely active call or just stale state
            const callState = coreInstance.getCallState ? coreInstance.getCallState() : null;
            const callAge = callState?.callStartTime ? Date.now() - callState.callStartTime : Infinity;
            if (callAge > 90000) {
                // Stale — reset and continue
                console.warn('[Calls UI] Stale isInCall detected, auto-resetting before pending call');
                if (coreInstance.forceResetCallState) coreInstance.forceResetCallState();
                await new Promise(resolve => setTimeout(resolve, 200));
            } else {
                showNotification('You are already in a call. End current call to start a new one.', 'warning');
                clearPendingCall();
                return;
            }
        }
        
        // Core is ready - initiate the call
        await initiateCallWithPendingUser();
    }

// In calls-ui.js, around the initiateCallWithPendingUser function
async function initiateCallWithPendingUser() {
    if (!pendingCall.userId || pendingCall.initiated) return;
    
    const { userId, userName, callType } = pendingCall;
    
    pendingCall.initiated = true;
    
    if (pendingCall.retryTimer) {
        clearTimeout(pendingCall.retryTimer);
        pendingCall.retryTimer = null;
    }
    
    try {
        if (!coreInstance) throw new Error('Core not ready');
        
        // CRITICAL FIX: Wait for core to be in ACTIVE state
        const lifecycleState = coreInstance.getLifecycleState ? coreInstance.getLifecycleState() : null;
        if (lifecycleState !== 'ACTIVE') {
            console.log('[Calls UI] Core not ACTIVE (state: ' + lifecycleState + '), waiting...');
            // Wait for core to become active
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    const state = coreInstance.getLifecycleState ? coreInstance.getLifecycleState() : null;
                    if (state === 'ACTIVE') {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 5000);
            });
        }
        
        // Ensure we have a valid session
        const hasValidSession = coreInstance.isAuthenticated ? coreInstance.isAuthenticated() : false;
        if (!hasValidSession) {
            throw new Error('No valid session');
        }
        
        // Force-clear any stale call state from previous call (prevents "already active" ghost state)
        if (coreInstance.forceResetCallState) {
            try { coreInstance.forceResetCallState(); } catch(_) {}
        }

        // Show calling screen IMMEDIATELY — before the async startCall so user sees feedback right away
        // NOTE: showCallingScreen is defined in a sibling IIFE (setupEarlyCallListener), so we
        // always access it through window.showCallingScreen which is exported from that scope.
        const _showCalling = (typeof showCallingScreen === 'function')
            ? showCallingScreen
            : window.showCallingScreen;
        if (typeof _showCalling === 'function') {
            _showCalling({
                userId:    userId,
                userName:  userName,
                callType:  callType,
                status:    'Calling...',
                userAvatar: null
            });
        } else {
            console.error('[Calls UI] showCallingScreen not available — check IIFE export');
        }

        // CRITICAL FIX: Use startCall method instead of sendAction
        if (coreInstance.startCall) {
            const result = await coreInstance.startCall(parseInt(userId), callType);
            if (result && result.success) {
                // Store call context so CALL_ACCEPTED can resolve peer name + type
                UIState.callActive = true;
                UIState.callState = 'calling';
                UIState.callType = callType;
                UIState.activeCallId = result.callId;
                UIState.callParticipants = [{ name: userName, userId: userId }];
                UIState.pendingCallUser = { userName, userId, callType, userAvatar: null };
                // Fix 4: Persist peer info in durable window globals so CALL_ACCEPTED can
                // recover them even if a race-condition call_force_ended wiped UIState first.
                window.__activePeerName = userName;
                window.__activePeerType = callType;
                window.__activePeerAvatar = null;
                showNotification(`${callType === 'video' ? 'Video call' : 'Voice call'} started with ${userName}`, 'success');
                clearPendingCall();
                
                if (elements.newCallModal) {
                    elements.newCallModal.classList.remove('active');
                    UIState.activeModals.delete('newCallModal');
                }
            } else if (result && result.reason === 'call_active') {
                // CRITICAL FIX: call_active on startCall means stale state — force reset and retry once
                console.warn('[Calls UI] call_active on startCall, force-resetting and retrying once');
                if (coreInstance.forceResetCallState) coreInstance.forceResetCallState();
                await new Promise(resolve => setTimeout(resolve, 300));
                const retryResult = await coreInstance.startCall(parseInt(userId), callType);
                if (retryResult && retryResult.success) {
                    showNotification(`${callType === 'video' ? 'Video call' : 'Voice call'} started with ${userName}`, 'success');
                    clearPendingCall();
                    if (elements.newCallModal) {
                        elements.newCallModal.classList.remove('active');
                        UIState.activeModals.delete('newCallModal');
                    }
                } else {
                    throw new Error(retryResult?.error || retryResult?.reason || 'Call initiation failed after reset');
                }
            } else {
                throw new Error(result?.error || 'Call initiation failed');
            }
        } else if (coreInstance.initiateCall) {
            const result = await coreInstance.initiateCall(callType, [parseInt(userId)]);
            if (result && result.success) {
                showNotification(`${callType === 'video' ? 'Video call' : 'Voice call'} started with ${userName}`, 'success');
                clearPendingCall();
            } else {
                throw new Error(result?.error || 'Call initiation failed');
            }
        } else {
            throw new Error('No call initiation method available');
        }
        
    } catch (error) {
        console.error('[Calls UI] Call initiation error:', error);
        showNotification(`Failed to start call: ${error.message}`, 'error');
        clearPendingCall();
        
        // Reset call UI - use new overlay system
        if (window.CallOverlayManager) {
            window.CallOverlayManager.endCall();
        }
        if (elements.sidebar) {
            elements.sidebar.style.display = 'flex';
        }
    }
}

    function clearPendingCall() {
        if (pendingCall.retryTimer) {
            clearTimeout(pendingCall.retryTimer);
            pendingCall.retryTimer = null;
        }
        
        pendingCall.userId = null;
        pendingCall.userName = null;
        pendingCall.callType = null;
        pendingCall.initiated = false;
        pendingCall.retryCount = 0;
        
        // Clear pre-filled UI state
        UIState.pendingCallUser = null;
    }
    
    // Listen for OPEN_CALL_WITH_USER events — single unified listener with dedup lock
    function setupOpenCallWithUserListener() {
        // Dedup lock: drop any duplicate for the same userId within 2 seconds
        if (!window.__uiCallDispatchLock) window.__uiCallDispatchLock = { ts: 0, userId: null };

        function isUICallDuplicate(userId) {
            const lock = window.__uiCallDispatchLock;
            return lock.userId === String(userId) && (Date.now() - lock.ts) < 2000;
        }

        function guardedHandleOpenCallWithUser(event) {
            const data = event.detail || event.data || {};
            const userId = data.userId || data.user_id || data.id;
            if (!userId) return handleOpenCallWithUser(event);
            if (isUICallDuplicate(userId)) {
                console.log('[Calls UI] ⏭ Duplicate OPEN_CALL_WITH_USER suppressed for', userId);
                return;
            }
            window.__uiCallDispatchLock = { ts: Date.now(), userId: String(userId) };
            handleOpenCallWithUser(event);
        }

        // CustomEvent path (dispatched internally within calls-ui.js)
        window.addEventListener('OPEN_CALL_WITH_USER', guardedHandleOpenCallWithUser);

        // postMessage path (from parent iframe)
        window.addEventListener('message', function(event) {
            const data = event.data;
            if (data && (data.type === 'OPEN_CALL_WITH_USER' || data.type === 'START_CALL' || data.type === 'CALL_USER')) {
                guardedHandleOpenCallWithUser({ detail: data.payload || data });
            }
        });

        if (DEBUG) {
            logOnce('info', 'OPEN_CALL_WITH_USER listener established (dedup-locked)');
        }
    }

    // ==================== DOM ELEMENTS CACHE ====================
    const elements = {};

    function cacheElements() {
        return UIErrorBoundary.execute(() => {
            const startTime = performance.now();
            
            const selectors = {
                appContainer: '#appContainer',
                sidebar: '#sidebar',
                callContainer: '#callContainer',
                
                newCallBtn: '#newCallBtn',
                quickVoiceBtn: '#quickVoiceBtn',
                quickVideoBtn: '#quickVideoBtn',
                quickGroupBtn: '#quickGroupBtn',
                settingsToggle: '#settingsToggle',
                settingsToggleIcon: '#settingsToggleIcon',
                menuDotsBtn: '#menuDotsBtn',
                menuDotsDropdown: '#menuDotsDropdown',
                
                menuParticipants: '#menuParticipants',
                menuChat: '#menuChat',
                menuWhiteboard: '#menuWhiteboard',
                menuNotes: '#menuNotes',
                menuPolls: '#menuPolls',
                menuRelationship: '#menuRelationship',
                
                muteBtn: '#muteBtn',
                videoBtn: '#videoBtn',
                screenShareBtn: '#screenShareBtn',
                speakerBtn: '#speakerBtn',
                moodBtn: '#moodBtn',
                intentionBtn: '#intentionBtn',
                focusModeBtn: '#focusModeBtn',
                endCallBtn: '#endCallBtn',
                
                callWithName: '#callWithName',
                callStatusText: '#callStatusText',
                callTypeIcon: '#callTypeIcon',
                callDuration: '#callDuration',
                callMoodIndicator: '#callMoodIndicator',
                callIntentionIndicator: '#callIntentionIndicator',
                videoGrid: '#videoGrid',
                offlineCallPlaceholder: '#offlineCallPlaceholder',
                reactionsContainer: '#reactionsContainer',
                
                newCallModal: '#newCallModal',
                closeNewCallModal: '#closeNewCallModal',
                callingOverlay: '#callingScreen',   // FIX: actual DOM id is callingScreen, not callingOverlay
                callingName: '#callingName',
                callingStatus: '#callingStatus',
                callingType: '#callingType',
                callingAvatar: '#callingAvatar',
                cancelCallBtn: '#cancelCallBtn',
                callingCollapseBtn: '#callingCollapseBtn',
                callingAddBtn: '#callingAddBtn',
                callingMuteBtn: '#callingMuteBtn',
                callingSpeakerBtn: '#callingSpeakerBtn',
                callingVideoToggleBtn: '#callingVideoToggleBtn',
                callingMoreBtn: '#callingMoreBtn',
                incomingCallModal: '#incomingCallModal',
                incomingCallName: '#incomingCallName',
                incomingCallType: '#incomingCallType',
                incomingCallAvatar: '#incomingCallAvatar',
                incomingCallMood: '#incomingCallMood',
                incomingCallIntention: '#incomingCallIntention',
                declineTimer: '#declineTimer',
                declineCallBtn: '#declineCallBtn',
                acceptCallBtn: '#acceptCallBtn',
                acceptVideoCallBtn: '#acceptVideoCallBtn',
                
                settingsPanel: '#settingsPanel',
                resetSettingsBtn: '#resetSettingsBtn',
                emotionalContextToggle: '#emotionalContextToggle',
                callIntentionToggle: '#callIntentionToggle',
                inCallChatToggle: '#inCallChatToggle',
                whiteboardToggle: '#whiteboardToggle',
                pollsToggle: '#pollsToggle',
                notesToggle: '#notesToggle',
                focusModeToggle: '#focusModeToggle',
                liveReactionsToggle: '#liveReactionsToggle',
                
                contactSearch: '#contactSearch',
                groupContactSearch: '#groupContactSearch',
                contactsList: '#contactsList',
                groupContactsList: '#groupContactsList',
                contactsLoading: '#contactsLoading',
                callsLoading: '#callsLoading',
                startVoiceCallBtn: '#startVoiceCallBtn',
                startVideoCallBtn: '#startVideoCallBtn',
                startGroupCallBtn: '#startGroupCallBtn',
                instantGroupOption: '#instantGroupOption',
                scheduledGroupOption: '#scheduledGroupOption',
                
                copyLinkBtn: '#copyLinkBtn',
                shareLinkBtn: '#shareLinkBtn',
                generateVoiceLinkBtn: '#generateVoiceLinkBtn',
                generateVideoLinkBtn: '#generateVideoLinkBtn',
                callLinkInput: '#callLinkInput',
                
                mpesaOption: '#mpesaOption',
                cancelPaymentBtn: '#cancelPaymentBtn',
                processPaymentBtn: '#processPaymentBtn',
                cancelUpgradeBtn: '#cancelUpgradeBtn',
                upgradeNowBtn: '#upgradeNowBtn',
                paymentModal: '#paymentModal',
                premiumLimitOverlay: '#premiumLimitOverlay',
                phoneNumber: '#phoneNumber',
                paymentAmount: '#paymentAmount',
                
                cancelMoodBtn: '#cancelMoodBtn',
                setMoodBtn: '#setMoodBtn',
                cancelIntentionBtn: '#cancelIntentionBtn',
                setIntentionBtn: '#setIntentionBtn',
                moodSelectionModal: '#moodSelectionModal',
                intentionSelectionModal: '#intentionSelectionModal',
                
                skipNotesBtn: '#skipNotesBtn',
                saveNotesBtn: '#saveNotesBtn',
                summaryDoneBtn: '#summaryDoneBtn',
                privateNotesModal: '#privateNotesModal',
                privateNotesTitle: '#privateNotesTitle',
                privateNotesSubtitle: '#privateNotesSubtitle',
                privateNotesTextarea: '#privateNotesTextarea',
                callSummaryModal: '#callSummaryModal',
                summaryDuration: '#summaryDuration',
                summaryTime: '#summaryTime',
                summaryType: '#summaryType',
                summaryMood: '#summaryMood',
                summaryIntention: '#summaryIntention',
                summaryParticipants: '#summaryParticipants',
                
                urlParamCancelBtn: '#urlParamCancelBtn',
                urlParamJoinBtn: '#urlParamJoinBtn',
                urlParamOverlay: '#urlParamOverlay',
                urlParamCallId: '#urlParamCallId',
                
                allCallsSection: '#allCallsSection',
                missedCallsSection: '#missedCallsSection',
                groupCallsSection: '#groupCallsSection',
                allCallsList: '#allCallsList',
                missedCallsList: '#missedCallsList',
                groupCallsList: '#groupCallsList',
                
                pipCloseBtn: '#pipCloseBtn',
                pipContainer: '#pipContainer',
                
                syncIndicator: '#syncIndicator',
                apiStatusIndicator: '#apiStatusIndicator',
                apiStatusText: '#apiStatusText',
                offlineBanner: '#offlineBanner',
                notificationArea: '#notificationArea',
                
                debugToggle: '#debugToggle',
                debugPanel: '#debugPanel',
                envBadge: '#envBadge',
                envText: '#envText',
                recoveryIndicator: '#recoveryIndicator',
                recoveryMessage: '#recoveryMessage',
                
                fallbackBanner: '#fallbackBanner'
            };
            
            Object.entries(selectors).forEach(([key, selector]) => {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        elements[key] = element;
                        UIState.cachedElements.set(key, element);
                    }
                } catch (error) {
                    if (DEBUG) {
                        logOnce('warn', `Failed to cache element: ${key}`, { selector, error: error.message });
                    }
                }
            });
            
            try {
                elements.categoryBtns = document.querySelectorAll('.category-btn');
                elements.newCallTabs = document.querySelectorAll('.new-call-tab');
                elements.moodOptions = document.querySelectorAll('.mood-option');
                elements.intentionOptions = document.querySelectorAll('.intention-option');
                elements.reactionBtns = document.querySelectorAll('.reaction-btn');
                elements.paymentOptions = document.querySelectorAll('.payment-option');
                
                Object.defineProperty(elements, 'contactCheckboxes', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.contact-checkbox'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'groupContactCheckboxes', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.group-contact'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
                
                Object.defineProperty(elements, 'selectedContacts', {
                    get: function() { 
                        try {
                            return document.querySelectorAll('.contact-item.selected'); 
                        } catch (e) {
                            return [];
                        }
                    }
                });
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to cache dynamic element groups', error);
                }
            }
            
            UIState.lastRenderTime = performance.now() - startTime;
            
            return Object.keys(elements).length;
        }, 'cacheElements', 0);
    }

    // ==================== UI LOGGER ====================
    const UILogger = {
        _history: [],
        _errors: new Map(),
        _metrics: {
            render: [],
            interaction: [],
            error: []
        },
        _debugMode: DEBUG,
        
        _hash: function(msg) {
            let hash = 0;
            for (let i = 0; i < msg.length; i++) {
                hash = ((hash << 5) - hash) + msg.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },
        
        _sanitize: function(data) {
            try {
                return JSON.parse(JSON.stringify(data, (key, value) => {
                    if (key === 'stream' || key === 'peer' || key.includes('Stream')) {
                        return '[Stream]';
                    }
                    if (key === 'token' || key.includes('Token') || key.includes('auth')) {
                        return '[REDACTED]';
                    }
                    if (key === 'password' || key.includes('Password') || key.includes('secret')) {
                        return '[REDACTED]';
                    }
                    return value;
                }));
            } catch {
                return String(data);
            }
        },
        
        _store: function(level, msg, data) {
            const entry = {
                timestamp: Date.now(),
                level,
                msg,
                data: data ? this._sanitize(data) : null,
                id: this._hash(msg + Date.now()),
                module: 'calls-ui'
            };
            this._history.push(entry);
            if (this._history.length > 100) this._history.shift();
            return entry;
        },
        
        info: function(msg, data = null) {
            this._store('info', msg, data);
            if (this._debugMode) {
                logOnce('info', msg, data);
            }
        },
        
        warn: function(msg, data = null) {
            this._store('warn', msg, data);
            if (this._debugMode) {
                logOnce('warn', msg, data);
            }
        },
        
        error: function(msg, error = null, context = null) {
            const hash = this._hash(msg + (error?.stack || '') + (context || ''));
            const now = Date.now();
            
            if (this._errors.has(hash)) {
                const lastLog = this._errors.get(hash);
                if (now - lastLog < 60000) return;
            }
            
            this._errors.set(hash, now);
            this._store('error', msg, { error: error?.message || error, context });
            
            logOnce('error', msg, { error: error?.message, context });
            
            setTimeout(() => this._errors.delete(hash), 60000);
        },
        
        once: function(msg, data = null) {
            const hash = this._hash(msg);
            if (!this._errors.has(hash)) {
                this._errors.set(hash, Date.now());
                this._store('once', msg, data);
                logOnce('info', msg, data);
                setTimeout(() => this._errors.delete(hash), 5000);
            }
        },
        
        performance: function(operation, duration) {
            this._metrics.render.push({ operation, duration, timestamp: Date.now() });
            if (this._metrics.render.length > 50) this._metrics.render.shift();
            
            if (this._debugMode && duration > 100) {
                logOnce('warn', `Slow operation: ${operation} took ${duration.toFixed(2)}ms`);
            }
        },
        
        interaction: function(action, target) {
            this._metrics.interaction.push({ action, target, timestamp: Date.now() });
            if (this._metrics.interaction.length > 100) this._metrics.interaction.shift();
        },
        
        enableDebug: function() { this._debugMode = true; },
        disableDebug: function() { this._debugMode = false; },
        
        getMetrics: function() {
            return {
                historySize: this._history.length,
                errorCount: this._errors.size,
                avgRenderTime: this._metrics.render.reduce((acc, r) => acc + r.duration, 0) / 
                              (this._metrics.render.length || 1),
                interactionCount: this._metrics.interaction.length
            };
        }
    };

    // ==================== UI ERROR BOUNDARY ====================
    const UIErrorBoundary = {
        execute: function(fn, context, fallback = null) {
            try {
                return fn();
            } catch (error) {
                UILogger.error(`UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        executeAsync: async function(fn, context, fallback = null) {
            try {
                return await fn();
            } catch (error) {
                UILogger.error(`Async UI Error in ${context}`, error);
                this.showFallbackUI(context);
                return fallback;
            }
        },
        
        createBoundary: function(featureName, fallbackFn) {
            return {
                execute: (fn) => {
                    try {
                        return fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                },
                executeAsync: async (fn) => {
                    try {
                        return await fn();
                    } catch (error) {
                        UILogger.error(`Feature ${featureName} async failed`, error);
                        this.showFeatureFallback(featureName);
                        return fallbackFn ? fallbackFn() : null;
                    }
                }
            };
        },
        
        showFallbackUI: function(context) {
            if (!elements.appContainer) return;
            
            const fallbackId = `fallback-${context.replace(/[^a-z0-9]/gi, '-')}`;
            if (document.getElementById(fallbackId)) return;
            
            const fallbackEl = document.createElement('div');
            fallbackEl.id = fallbackId;
            fallbackEl.className = 'ui-fallback';
            fallbackEl.setAttribute('role', 'alert');
            fallbackEl.innerHTML = `
                <div class="ui-fallback-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>This section is temporarily unavailable</p>
                    <button class="ui-fallback-retry" onclick="window.location.reload()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
            
            elements.appContainer.appendChild(fallbackEl);
            
            setTimeout(() => {
                if (fallbackEl.parentNode) fallbackEl.remove();
            }, 5000);
        },
        
        showFeatureFallback: function(featureName) {
            UILogger.once(`Feature ${featureName} unavailable`, { feature: featureName });
            
            const notification = createNotification({
                type: 'warning',
                title: 'Feature Unavailable',
                message: `${featureName} is temporarily unavailable`,
                duration: 3000
            });
            
            if (notification) {
                const notificationArea = elements.notificationArea || document.body;
                notificationArea.appendChild(notification);
            }
        }
    };

    // ==================== UI DIAGNOSTICS ====================
    const UIDiagnostics = {
        errors: [],
        
        logError: function(context, error) {
            this.errors.push({
                context,
                message: error?.message || String(error),
                stack: error?.stack,
                timestamp: Date.now(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });
            
            if (this.errors.length > 20) this.errors.shift();
        },
        
        getReport: function() {
            return {
                errors: this.errors,
                elementCache: UIState.cachedElements.size,
                renderStages: { ...UIState.renderStages },
                renderCount: UIState.renderCount,
                activeViews: {
                    currentView: UIState.currentView,
                    panels: Array.from(UIState.activePanels),
                    modals: Array.from(UIState.activeModals)
                },
                responsive: {
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    inputMode: UIState.inputMode,
                    breakpoint: this.getCurrentBreakpoint()
                },
                performance: UILogger.getMetrics(),
                handshake: {
                    parentReady,
                    sessionReady,
                    handshakeComplete,
                    inPassiveMode,
                    coreReady,
                    coreLifecycleState
                },
                session: {
                    valid: isSessionValid(),
                    hasToken: !!(window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token),
                    invalid: _sessionInvalid
                },
                coreAvailable: !!coreInstance,
                coreLifecycle: coreLifecycleState,
                activeCall: {
                    active: coreInstance ? coreInstance.isInCall ? coreInstance.isInCall() : false : false,
                    callId: coreInstance ? coreInstance.getActiveCallId ? coreInstance.getActiveCallId() : null : null
                },
                pendingCall: {
                    hasPending: !!pendingCall.userId,
                    userId: pendingCall.userId,
                    userName: pendingCall.userName,
                    callType: pendingCall.callType,
                    initiated: pendingCall.initiated,
                    retryCount: pendingCall.retryCount
                }
            };
        },
        
        getCurrentBreakpoint: function() {
            const width = window.innerWidth;
            if (width <= 480) return 'mobile';
            if (width <= 768) return 'tablet';
            if (width <= 1024) return 'desktop';
            return 'wide';
        }
    };

    // ==================== SECURITY SANITIZER ====================
    const SecuritySanitizer = {
        allowedTags: new Set([
            'div', 'span', 'button', 'input', 'label', 'i', 'strong', 'em',
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
            'img', 'video', 'canvas', 'svg', 'path', 'circle', 'rect',
            'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
        ]),
        
        allowedAttributes: new Set([
            'id', 'class', 'style', 'src', 'alt', 'title', 'width', 'height',
            'data-id', 'data-type', 'data-mood', 'data-intention', 'data-category',
            'data-tab', 'data-tool', 'data-color', 'data-action', 'data-reaction',
            'disabled', 'checked', 'selected', 'placeholder', 'autoplay', 'playsinline',
            'muted', 'controls', 'type', 'name', 'value', 'min', 'max', 'step',
            'role', 'aria-label', 'aria-hidden', 'aria-expanded', 'aria-selected',
            'for', 'href', 'target', 'rel', 'download'
        ]),
        
        allowedProtocols: new Set(['http:', 'https:', 'data:', 'blob:', 'mailto:', 'tel:']),
        
        _patching: false,
        _isSanitizing: false,
        
        initialize: function() {
            if (this._patching) return;
            this._patching = true;
            
            try {
                this.patchDOMMethods();
                if (DEBUG) {
                    logOnce('info', 'Security sanitizer initialized');
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('error', 'Failed to initialize security sanitizer', error);
                }
            } finally {
                this._patching = false;
            }
        },
        
        patchDOMMethods: function() {
            // DOM patching intentionally disabled.
            // The global innerHTML override was converting onclick→data-onclick and
            // escaping < > in every HTML template string, causing notifications and
            // call UI elements to render as raw escaped text instead of HTML.
            // Security is handled at the point of rendering by using textContent for
            // user-supplied strings and DOM APIs (createElement/appendChild) for structure.
            if (DEBUG) {
                logOnce('info', 'DOM method patching skipped (handled at point of use)');
            }
        },
        
        sanitizeHTML: function(html) {
            if (!html || typeof html !== 'string') return html;
            return this.sanitizeString(html);
        },
        
        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return str || '';
            // Only strip genuinely dangerous XSS vectors from plain text output.
            // Do NOT escape < > or replace onclick — that breaks all HTML templates.
            // User-supplied strings rendered into the DOM must use textContent, not innerHTML.
            let sanitized = str
                .replace(/javascript:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<iframe[\s\S]*?>/gi, '')
                .replace(/expression\s*\(/gi, '')
                .replace(/onabort/gi, 'data-onabort');
            
            return sanitized;
        },
        
        sanitizeNode: function(node) {
            if (!node) return;
            
            if (node.nodeType === 1) {
                const tagName = node.tagName.toLowerCase();
                
                if (!this.allowedTags.has(tagName)) {
                    const span = document.createElement('span');
                    while (node.firstChild) {
                        span.appendChild(node.firstChild);
                    }
                    span.className = `sanitized-${tagName}`;
                    if (node.parentNode) {
                        node.parentNode.replaceChild(span, node);
                    }
                    node = span;
                }
                
                const attrs = Array.from(node.attributes);
                attrs.forEach(attr => {
                    const attrName = attr.name.toLowerCase();
                    
                    if (!this.allowedAttributes.has(attrName)) {
                        node.removeAttribute(attr.name);
                        return;
                    }
                    
                    if (attrName === 'src' || attrName === 'href') {
                        const value = attr.value.toLowerCase();
                        const protocol = value.split(':')[0] + ':';
                        if (!this.allowedProtocols.has(protocol) && !value.startsWith('/') && !value.startsWith('#')) {
                            node.removeAttribute(attr.name);
                        }
                    }
                    
                    if (attrName.startsWith('on')) {
                        node.removeAttribute(attr.name);
                    }
                    
                    if (attrName === 'style') {
                        node.setAttribute('style', this.sanitizeCSS(attr.value));
                    }
                });
                
                Array.from(node.childNodes).forEach(child => this.sanitizeNode(child));
            }
        },
        
        sanitizeCSS: function(css) {
            if (!css || typeof css !== 'string') return css;
            
            return css
                .replace(/javascript:/gi, '')
                .replace(/expression\(/gi, '')
                .replace(/@import/gi, '')
                .replace(/url\(['"]?javascript:/gi, 'url()')
                .replace(/behavior:/gi, '')
                .replace(/-moz-binding/gi, '');
        },
        
        sanitizeUserInput: function(input) {
            if (input === null || input === undefined) return '';
            if (typeof input !== 'string') input = String(input);
            return this.sanitizeString(input).trim();
        },
        
        sanitizeURL: function(url) {
            if (!url || typeof url !== 'string') return '';
            
            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
            try {
                const urlObj = new URL(url, window.location.origin);
                if (safeProtocols.includes(urlObj.protocol)) {
                    return url;
                }
            } catch (e) {
                return this.sanitizeString(url);
            }
            return '#';
        },
        
        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to parse JSON', e);
                }
                return fallback;
            }
        },
        
        // Storage methods - warn but allow for non-auth data
        safeLocalStorageGet: function(key, fallback = null) {
            // Warn about auth tokens
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Attempted to read '${key}' from localStorage - use session/call memory instead`);
                return fallback;
            }
            
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from localStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeLocalStorageSet: function(key, value) {
            // Block auth tokens and call state
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Blocked storing '${key}' in localStorage - use session/call memory only`);
                return false;
            }
            
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to localStorage: ${key}`, e);
                }
                return false;
            }
        },
        
        safeSessionStorageGet: function(key, fallback = null) {
            // Warn about auth tokens
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Attempted to read '${key}' from sessionStorage - use session/call memory instead`);
                return fallback;
            }
            
            try {
                const value = sessionStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to read from sessionStorage: ${key}`, e);
                }
                return fallback;
            }
        },
        
        safeSessionStorageSet: function(key, value) {
            // Block auth tokens and call state
            if (key === 'token' || key.includes('token') || key.includes('auth') || key === 'session' || key.includes('call')) {
                logOnce('warn', `Blocked storing '${key}' in sessionStorage - use session/call memory only`);
                return false;
            }
            
            try {
                sessionStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                if (DEBUG) {
                    logOnce('warn', `Failed to write to sessionStorage: ${key}`, e);
                }
                return false;
            }
        }
    };

    // UIState already defined globally - using the merged definition

    // ==================== RENDERING PIPELINE ====================
    const RenderingPipeline = {
        skeleton: function() {
            return UIErrorBoundary.execute(() => {
                if (DEBUG) {
                    logOnce('info', 'Rendering skeleton UI');
                }
                UIState.renderStartTime = performance.now();
                
                let container = elements.appContainer || document.getElementById('appContainer');
                if (!container) {
                    container = document.createElement('div');
                    container.id = 'appContainer';
                    container.className = 'app-container skeleton';
                    document.body.appendChild(container);
                    elements.appContainer = container;
                    UIState.cachedElements.set('appContainer', container);
                }
                
                const loadingEls = document.querySelectorAll('.loading-indicator, .initializing-overlay, .core-loading-message');
                loadingEls.forEach(el => {
                    if (el) el.style.display = 'none';
                });
                
                container.style.visibility = 'visible';
                container.style.opacity = '1';
                container.style.display = 'block';
                
                container.classList.add('ui-skeleton');
                
                this.renderSkeletonSidebar(container);
                
                UIState.renderStages.skeleton = true;
                UIState.renderCount++;
                
                UILogger.performance('skeleton', performance.now() - UIState.renderStartTime);
                
                return true;
            }, 'skeleton', false);
        },
        
        renderSkeletonSidebar: function(container) {
            let sidebar = elements.sidebar || document.getElementById('sidebar');
            if (!sidebar) {
                sidebar = document.createElement('div');
                sidebar.id = 'sidebar';
                sidebar.className = 'sidebar skeleton';
                sidebar.innerHTML = `
                    <div class="sidebar-header skeleton-pulse"></div>
                    <div class="sidebar-content">
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                    </div>
                `;
                container.appendChild(sidebar);
                elements.sidebar = sidebar;
                UIState.cachedElements.set('sidebar', sidebar);
            }
            
            sidebar.style.display = 'flex';
            
            return sidebar;
        },
        
        initialRender: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Performing initial render');
                }
                const startTime = performance.now();
                
                await this.waitForCoreReady();
                
                this.renderCachedContacts();
                
                this.updateSyncIndicator();
                
                if (elements.appContainer) {
                    elements.appContainer.classList.remove('ui-skeleton');
                }
                
                UIState.renderStages.initial = true;
                
                UILogger.performance('initialRender', performance.now() - startTime);
                
                return true;
            }, 'initialRender', false);
        },
        
        updateSyncIndicator: function() {
            if (!elements.syncIndicator) return;
            
            if (inPassiveMode) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-clock"></i><span>Waiting for parent</span>';
                elements.syncIndicator.className = 'sync-indicator passive';
                return;
            }
            
            if (fallbackModeActive) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Limited Mode</span>';
                elements.syncIndicator.className = 'sync-indicator error';
                return;
            }
            
            // Show core lifecycle state
            if (coreLifecycleState === 'BOOT' || coreLifecycleState === 'INITIALIZING') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-cog fa-spin"></i><span>Booting...</span>';
                elements.syncIndicator.className = 'sync-indicator booting';
            } else if (coreLifecycleState === 'READY') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-hand-peace"></i><span>Ready</span>';
                elements.syncIndicator.className = 'sync-indicator ready';
            } else if (coreLifecycleState === 'WAIT_PARENT') {
                elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                elements.syncIndicator.className = 'sync-indicator connecting';
            } else if (!parentReady) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-handshake"></i><span>Connecting...</span>';
                elements.syncIndicator.className = 'sync-indicator connecting';
            } else if (!sessionReady && !_sessionInvalid) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Syncing...</span>';
                elements.syncIndicator.className = 'sync-indicator syncing';
            } else if (_sessionInvalid) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Login Required</span>';
                elements.syncIndicator.className = 'sync-indicator error';
            } else {
                elements.syncIndicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Ready</span>';
                elements.syncIndicator.className = 'sync-indicator synced';
            }
        },
        
        waitForCoreReady: function() {
            return new Promise((resolve) => {
                cacheElements();
                
                if (elements.appContainer && elements.sidebar) {
                    resolve();
                    return;
                }
                
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    
                    cacheElements();
                    
                    if ((elements.appContainer && elements.sidebar) || attempts > 20) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 50);
            });
        },
        
renderContactsList: function(contacts) {
    if (!elements.contactsList) return;
    
    console.log('[Calls UI] renderContactsList called with:', contacts?.length || 0, 'contacts');
    
    try {
        if (!contacts || contacts.length === 0) {
            elements.contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
            return;
        }
        
        let html = '';
        contacts.forEach(contact => {
            // CRITICAL: Extract name correctly from various formats
            const name = contact.displayName || contact.username || contact.name || contact.fullName || ('User #' + (contact.id || contact.userId));
            const userId = contact.id || contact.userId;
            const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
            const bgColor = '#6c5ce7';
            const status = contact.status || (contact.isOnline ? 'online' : 'offline');
            
            html += `
                <div class="contact-item" data-id="${userId}" data-name="${this.sanitizeHTML(name)}">
                    <div class="contact-checkbox-container">
                        <input type="checkbox" class="contact-checkbox" id="contact-${userId}" value="${userId}">
                    </div>
                    <div class="call-avatar" style="background-color: ${bgColor}">
                        ${contact.avatar ? `<img src="${contact.avatar}" alt="${this.sanitizeHTML(name)}">` : `<span>${this.sanitizeHTML(initials)}</span>`}
                    </div>
                    <div class="call-info">
                        <div class="call-name">
                            ${this.sanitizeHTML(name)}
                            ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                        </div>
                        <div class="contact-status ${status}">
                            <span class="status-dot"></span>
                            ${status === 'online' ? 'Online' : (status === 'away' ? 'Away' : 'Offline')}
                        </div>
                    </div>
                    <div class="contact-call-actions">
                        <button class="contact-audio-call-btn" data-user-id="${userId}" data-user-name="${this.sanitizeHTML(name)}" title="Audio call">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="contact-video-call-btn" data-user-id="${userId}" data-user-name="${this.sanitizeHTML(name)}" title="Video call">
                            <i class="fas fa-video"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        elements.contactsList.innerHTML = html;
        
        // Also update group contacts list
        if (elements.groupContactsList) {
            elements.groupContactsList.innerHTML = html.replace(/contact-checkbox/g, 'group-contact').replace(/id="contact-/g, 'id="group-contact-');
        }
        
        if (elements.contactsLoading) {
            elements.contactsLoading.style.display = 'none';
        }
        
        // Attach click handlers via delegation (idempotent - only binds once)
        if (!elements.contactsList.__callDelegationBound) {
            elements.contactsList.__callDelegationBound = true;
            elements.contactsList.addEventListener('click', function(e) {
                const audioBtn = e.target.closest('.contact-audio-call-btn');
                if (audioBtn) {
                    e.stopPropagation();
                    const uid = audioBtn.dataset.userId;
                    const uname = audioBtn.dataset.userName || 'User';
                    if (!uid) return;
                    window.__pendingCallReturnTo = 'calls';
                    window.__callOriginReturnTo = 'calls';
                    if (typeof startCallWithUser === 'function') startCallWithUser(uid, uname, 'voice');
                    else window.dispatchEvent(new CustomEvent('OPEN_CALL_WITH_USER', { detail: { userId: uid, userName: uname, callType: 'voice', returnTo: 'calls' } }));
                    return;
                }
                const videoBtn = e.target.closest('.contact-video-call-btn');
                if (videoBtn) {
                    e.stopPropagation();
                    const uid = videoBtn.dataset.userId;
                    const uname = videoBtn.dataset.userName || 'User';
                    if (!uid) return;
                    window.__pendingCallReturnTo = 'calls';
                    window.__callOriginReturnTo = 'calls';
                    if (typeof startCallWithUser === 'function') startCallWithUser(uid, uname, 'video');
                    else window.dispatchEvent(new CustomEvent('OPEN_CALL_WITH_USER', { detail: { userId: uid, userName: uname, callType: 'video', returnTo: 'calls' } }));
                    return;
                }
            });
        }
        
        console.log('[Calls UI] Contacts rendered:', contacts.length);
        
    } catch (error) {
        console.error('[Calls UI] renderContactsList error:', error);
        elements.contactsList.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load contacts</p></div>';
    }
},

// Add this helper method
sanitizeHTML: function(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
},

handleContactItemClick: function(e) {
    if (e.target.closest('.contact-checkbox')) return;
    
    const checkbox = this.querySelector('.contact-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            this.classList.add('selected');
        } else {
            this.classList.remove('selected');
        }
    }
},

        renderCachedContacts: function() {
            try {
                // Don't use localStorage for contacts - rely on parent or core
                if (coreInstance && coreInstance.getState) {
                    const state = coreInstance.getState();
                    if (state && state.contacts) {
                        this.renderContactsList(state.contacts);
                        return;
                    }
                }
                
                // If we have AppState with contacts, use that
                if (window.AppState && window.AppState.contacts && Array.isArray(window.AppState.contacts)) {
                    this.renderContactsList(window.AppState.contacts);
                    return;
                }

                if (Array.isArray(window.__cachedCallContacts) && window.__cachedCallContacts.length > 0) {
                    this.renderContactsList(window.__cachedCallContacts);
                    return;
                }

                const localFriends = JSON.parse(localStorage.getItem('friends') || '[]');
                if (Array.isArray(localFriends) && localFriends.length > 0) {
                    const contacts = localFriends.map((friend) => ({
                        id: friend.id || friend.userId,
                        userId: friend.id || friend.userId,
                        name: friend.displayName || friend.username || friend.name || ('User #' + (friend.id || friend.userId)),
                        displayName: friend.displayName || friend.username || friend.name || ('User #' + (friend.id || friend.userId)),
                        username: friend.username || friend.name || '',
                        status: friend.status || (friend.online ? 'online' : 'offline'),
                        isOnline: friend.online || friend.isOnline || friend.status === 'online',
                        avatar: friend.avatar || friend.photoURL || '',
                        isPremium: !!friend.isPremium
                    }));
                    UIState.contacts = contacts;
                    window.__cachedCallContacts = contacts;
                    this.renderContactsList(contacts);
                }
            } catch (error) {
                if (DEBUG) {
                    logOnce('warn', 'Failed to render contacts', error);
                }
            }
        },
        
        renderContactsList: function(contacts) {
            if (!elements.contactsList) return;
            
            try {
                const getAvatarFallback = (name, bgColor = '#6c5ce7') => {
                    const safeName = String(name || 'User').trim() || 'User';
                    const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U';
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="${bgColor}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
                    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
                };

                if (!contacts || contacts.length === 0) {
                    elements.contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
                    return;
                }
                
                let html = '';
                contacts.slice(0, 20).forEach(contact => {
                    const name = contact.displayName || contact.username || contact.name || ('User #' + contact.id);
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    const bgColor = '#6c5ce7'; // Default color
                    const avatarUrl = (!navigator.onLine && /ui-avatars\.com/i.test(String(contact.avatar || '')))
                        ? ''
                        : (contact.avatar || '');
                    const fallbackAvatar = getAvatarFallback(name, bgColor);
                    
                    html += `
                        <div class="contact-item" data-id="${SecuritySanitizer.sanitizeString(contact.id)}" data-name="${SecuritySanitizer.sanitizeString(name)}">
                            <div class="contact-checkbox-container">
                                <input type="checkbox" class="contact-checkbox" id="contact-${SecuritySanitizer.sanitizeString(contact.id)}">
                            </div>
                            <div class="call-avatar" style="background-color: ${bgColor}">
                                ${avatarUrl ? `<img src="${SecuritySanitizer.sanitizeURL(avatarUrl)}" alt="${SecuritySanitizer.sanitizeString(name)}" onerror="this.onerror=null;this.src='${fallbackAvatar}'">` : 
                                  `<span>${SecuritySanitizer.sanitizeString(initials)}</span>`}
                            </div>
                            <div class="call-info">
                                <div class="call-name">
                                    ${SecuritySanitizer.sanitizeString(name)}
                                    ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                                </div>
                                <div class="contact-status ${SecuritySanitizer.sanitizeString(contact.status || 'offline')}">
                                    <span class="status-dot"></span>
                                    ${SecuritySanitizer.sanitizeString(contact.status || 'Offline')}
                                </div>
                            </div>
                            <div class="contact-call-actions">
                                <button class="contact-audio-call-btn" data-user-id="${SecuritySanitizer.sanitizeString(contact.id)}" data-user-name="${SecuritySanitizer.sanitizeString(name)}" title="Audio call">
                                    <i class="fas fa-phone"></i>
                                </button>
                                <button class="contact-video-call-btn" data-user-id="${SecuritySanitizer.sanitizeString(contact.id)}" data-user-name="${SecuritySanitizer.sanitizeString(name)}" title="Video call">
                                    <i class="fas fa-video"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                elements.contactsList.innerHTML = html;
                
                if (elements.groupContactsList) {
                    elements.groupContactsList.innerHTML = html.replace(/contact-checkbox/g, 'group-contact').replace(/id="contact-/g, 'id="group-contact-');
                }
                
                if (elements.contactsLoading) {
                    elements.contactsLoading.style.display = 'none';
                }
                
                EventSystem.debounce('attachContactEvents', () => {
                    this.attachContactEvents();
                }, 100);
                
            } catch (error) {
                UILogger.error('renderContactsList', error);
                elements.contactsList.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load contacts</p></div>';
            }
        },
        
        attachContactEvents: function() {
            // Use event delegation on the contactsList container so buttons fire even after innerHTML re-renders
            const contactsListEl = elements.contactsList;
            if (contactsListEl && !contactsListEl.__callDelegationBound) {
                contactsListEl.__callDelegationBound = true;
                contactsListEl.addEventListener('click', function(e) {
                    // Audio call button
                    const audioBtn = e.target.closest('.contact-audio-call-btn');
                    if (audioBtn) {
                        e.stopPropagation();
                        const userId = audioBtn.dataset.userId;
                        const userName = audioBtn.dataset.userName || 'User';
                        if (!userId) return;
                        console.log('[Calls UI] Audio call btn clicked:', userId, userName);
                        window.__pendingCallReturnTo = 'calls';
                        window.__callOriginReturnTo = 'calls';
                        window.__pendingCallChatUserId = null;
                        window.__callOriginChatUserId = null;
                        if (typeof startCallWithUser === 'function') {
                            startCallWithUser(userId, userName, 'voice');
                        } else {
                            window.dispatchEvent(new CustomEvent('OPEN_CALL_WITH_USER', {
                                detail: { userId, userName, callType: 'voice', source: 'calls', returnTo: 'calls' }
                            }));
                        }
                        return;
                    }
                    // Video call button
                    const videoBtn = e.target.closest('.contact-video-call-btn');
                    if (videoBtn) {
                        e.stopPropagation();
                        const userId = videoBtn.dataset.userId;
                        const userName = videoBtn.dataset.userName || 'User';
                        if (!userId) return;
                        console.log('[Calls UI] Video call btn clicked:', userId, userName);
                        window.__pendingCallReturnTo = 'calls';
                        window.__callOriginReturnTo = 'calls';
                        window.__pendingCallChatUserId = null;
                        window.__callOriginChatUserId = null;
                        if (typeof startCallWithUser === 'function') {
                            startCallWithUser(userId, userName, 'video');
                        } else {
                            window.dispatchEvent(new CustomEvent('OPEN_CALL_WITH_USER', {
                                detail: { userId, userName, callType: 'video', source: 'calls', returnTo: 'calls' }
                            }));
                        }
                        return;
                    }
                    // Contact item (checkbox selection)
                    const contactItem = e.target.closest('.contact-item');
                    if (contactItem) {
                        handleContactClick({ currentTarget: contactItem });
                    }
                });
            }
        },
        
        progressiveEnhancement: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Applying progressive enhancement');
                }
                const startTime = performance.now();
                
                EventSystem.initialize();
                
                SecuritySanitizer.initialize();
                
                this.attachReactionEvents();
                
                // Load user preferences from core session, not localStorage
                this.loadUserPreferences();
                
                UIState.renderStages.enhanced = true;
                
                UILogger.performance('progressiveEnhancement', performance.now() - startTime);
                
                return true;
            }, 'progressiveEnhancement', false);
        },
        
        // Load preferences from core session, not localStorage
        loadUserPreferences: function() {
            if (coreInstance && coreInstance.getState) {
                const state = coreInstance.getState();
                if (state) {
                    UIState.selectedMood = state.currentMood || 'neutral';
                    UIState.selectedIntention = state.currentIntention || 'quick';
                    UIState.currentFocusMode = state.currentFocusMode || false;
                }
            }
            
            // Apply focus mode if active
            if (UIState.currentFocusMode && elements.appContainer) {
                elements.appContainer.classList.add('focus-mode');
            }
            if (UIState.currentFocusMode && elements.focusModeBtn) {
                elements.focusModeBtn.classList.add('active');
            }
        },
        
        attachReactionEvents: function() {
            document.querySelectorAll('.reaction-btn').forEach(btn => {
                btn.removeEventListener('click', UIEventHandlers.sendReaction);
                btn.addEventListener('click', UIEventHandlers.sendReaction);
            });
        },
        
        liveUpdate: function() {
            return UIErrorBoundary.executeAsync(async () => {
                if (DEBUG) {
                    logOnce('info', 'Starting live updates');
                }
                
                CoreIntegration.subscribeToCore();
                
                UIState.renderStages.live = true;
                
                return true;
            }, 'liveUpdate', false);
        },
        
        sanitizeHTML: function(str) {
            return SecuritySanitizer.sanitizeString(str);
        },
        
        execute: async function() {
            if (DEBUG) {
                logOnce('info', 'Executing full rendering pipeline');
            }
            
            this.skeleton();
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await this.initialRender();
            
            await this.progressiveEnhancement();
            
            await this.liveUpdate();
            
            if (DEBUG) {
                logOnce('info', 'Rendering pipeline complete', UIState.renderStages);
            }
            
            return {
                success: true,
                stages: { ...UIState.renderStages },
                renderCount: UIState.renderCount
            };
        }
    };

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
                    UIState.callParticipants = state.callParticipants || [];
                    UIState.callStartTime = state.callStartTime;
                    if (!state.callActive && (!state.callState || state.callState === 'idle')) {
                        UIState.activeCallId = null;
                        UIState.callParticipants = [];
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
    // Call initiated - keep calling screen visible
    console.log('[Calls UI] Call initiated, keeping calling screen');
    UIState.activeCallId = callData.callId;
    UIState.callParticipants = callData.participants || [];
    UIState.callType = callData.callType;
    UIState.callActive = true;
    UIState.callState = 'calling';
    
    // Update calling screen status
    const statusEl = document.getElementById('callingStatus');
    if (statusEl) {
        if (callData.receiverOnline === false) {
            statusEl.textContent = 'User is offline - waiting...';
        } else {
            statusEl.textContent = 'Ringing...';
        }
    }
    break;
                case 'call_initiation_failed':
                    // Offline fix: When receiver is offline, show call UI for 2 minutes instead of ending
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
                        showNotification('User is offline. Call will display for 2 minutes.', 'info');
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
                case 'call_started':
                    this.handleCallStarted(data);
                    break;
                case 'call_connected':
                    this.handleCallConnected(data);
                    break;
                case 'call_ended':
                case 'call_rejected':
                case 'call_failed':
                case 'call_timeout':
                    this.handleCallEnded(data);
                    // FIX for Bug 6: Refresh call history after call ends
                    this.refreshCallHistory();
                    break;
                case 'call_force_ended':
                    // Skip reset if we're already in-call (stale WS echo after accept)
                    if (UIState.callState === 'connected' ||
                        (document.getElementById('inCallScreen') && document.getElementById('inCallScreen').classList.contains('active'))) {
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
                    // FIXED: Caller cancelled before receiver answered — dismiss incoming modal immediately
                    if (window._incomingRingtone) {
                        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                        window._incomingRingtone = null;
                    }
                    if (elements.incomingCallModal && elements.incomingCallModal.classList.contains('active')) {
                        elements.incomingCallModal.classList.remove('active');
                        UIState.activeModals.delete('incomingCallModal');
                        const timerId = parseInt(elements.incomingCallModal.dataset.timer);
                        if (timerId) clearInterval(timerId);
                        elements.incomingCallModal.dataset.timer = '';
                    }
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
                    // FIXED: attach local stream to local video element immediately
                    (function attachLocalVideo(stream) {
                        // Try multiple possible local video element ids
                        const localVid = document.getElementById('localVideo')
                            || document.getElementById('selfVideo')
                            || document.getElementById('pipVideo')
                            || document.querySelector('.local-video video')
                            || document.querySelector('.pip-video');
                        if (localVid && stream) {
                            localVid.srcObject = stream;
                            localVid.muted = true; // prevent echo
                            localVid.autoplay = true;
                            localVid.playsInline = true;
                            localVid.play().catch(() => {});
                            // Also show pip container if video call
                            const pipContainer = document.getElementById('pipContainer');
                            if (pipContainer && UIState.callType === 'video') {
                                pipContainer.style.display = 'block';
                            }
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
                    }
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
            const incomingId = callData.callId || callData.id || null;
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
            (function _playRingtone() {
                try {
                    if (window._incomingRingtone) {
                        try { window._incomingRingtone.pause(); window._incomingRingtone.currentTime = 0; } catch(e) {}
                    }
                    // Use a data-URI ringtone so it works without a separate file
                    // Falls back to Web Audio API beep if Audio fails
                    const audioSrc = window.__callRingtone ||
                        'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA' + // minimal fallback
                        'AAAQABAAQAAAA==';
                    let ring;
                    try {
                        ring = new Audio();
                        ring.src = audioSrc;
                        ring.loop = true;
                        ring.volume = 0.8;
                        const playPromise = ring.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {
                                // Autoplay blocked — try Web Audio beep instead
                                _tryWebAudioRing();
                            });
                        }
                        window._incomingRingtone = ring;
                    } catch(e) {
                        _tryWebAudioRing();
                    }

                    function _tryWebAudioRing() {
                        try {
                            const ctx = new (window.AudioContext || window.webkitAudioContext)();
                            let ringing = true;
                            window._incomingRingtone = { _ctx: ctx, pause: function() { ringing = false; try { ctx.close(); } catch(e) {} }, currentTime: 0 };
                            (function beep() {
                                if (!ringing || ctx.state === 'closed') return;
                                const osc = ctx.createOscillator();
                                const gain = ctx.createGain();
                                osc.connect(gain);
                                gain.connect(ctx.destination);
                                osc.frequency.value = 520;
                                gain.gain.setValueAtTime(0.4, ctx.currentTime);
                                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                                osc.start(ctx.currentTime);
                                osc.stop(ctx.currentTime + 0.4);
                                osc.onended = function() { if (ringing) setTimeout(beep, 800); };
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
                    if (photoUrl) {
                        elements.incomingCallAvatar.innerHTML = `<img src="${photoUrl}" alt="${callData.callerName || 'Caller'}" onerror="this.parentNode.innerHTML='${initials}'">`;
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

                // ── Clear any old timer ──────────────────────────────────────
                const oldTimer = parseInt(elements.incomingCallModal.dataset.timer);
                if (oldTimer) clearInterval(oldTimer);

                // ── 2-MINUTE ring timer (120 seconds) ───────────────────────
                let timeLeft = 120;
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
            UIState.activeCallId = callData.callId;
            UIState.callParticipants = callData.participants || [];
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
                    if (participant.avatar || participant.photo) {
                        elements.callingAvatar.innerHTML = `<img src="${SecuritySanitizer ? SecuritySanitizer.sanitizeString(participant.avatar || participant.photo) : (participant.avatar || participant.photo)}" alt="${name}" onerror="this.parentNode.innerHTML='${name.charAt(0).toUpperCase()}'">`;
                    } else {
                        elements.callingAvatar.textContent = name.charAt(0).toUpperCase();
                    }
                }

                // Use new internal screen system instead
                if (window.CallScreenManager && window.CallScreenManager.startCall) {
                    window.CallScreenManager.startCall({
                        userName: 'Active Call',
                        userId: 'active',
                        callType: callType,
                        status: 'In Call',
                        userAvatar: null
                    });
                }

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
            // The callingOverlay must stay visible for the full 120 s unless:
            //   (a) receiver accepts → handleCallAccepted hides it
            //   (b) receiver declines → handleCallEnded hides it
            //   (c) caller manually ends → cancelCallBtn hides it
            //   (d) 120 s timeout fires → auto-dismiss below
            (function _startOutgoingRingTimer() {
                // Clear any pre-existing outgoing timer
                if (window._outgoingRingTimer) {
                    clearInterval(window._outgoingRingTimer);
                    window._outgoingRingTimer = null;
                }
                let timeLeft = 120;
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
                            showNotification('Call ended — no answer after 2 minutes', 'info');
                        }
                    }
                }, 1000);
                // Store on callContainer so cleanup in handleCallEnded can find it
                if (elements.callContainer) elements.callContainer.dataset.offlineTimer = window._outgoingRingTimer;
            })();

            // If receiver is offline, also play ringtone for caller
            if (!UIState.callReceiverOnline) {
                (function _playCallerRingtone() {
                    try {
                        if (window._callerRingtone) {
                            try { window._callerRingtone.pause(); window._callerRingtone.currentTime = 0; } catch(e) {}
                        }
                        const audioSrc = window.__callRingtone ||
                            'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA' + // minimal fallback
                            'AAAQABAAQAAAA==';
                        let ring;
                        try {
                            ring = new Audio();
                            ring.src = audioSrc;
                            ring.loop = true;
                            ring.volume = 0.6;
                            const playPromise = ring.play();
                            if (playPromise && typeof playPromise.catch === 'function') {
                                playPromise.catch(() => { _tryWebAudioBeep(); });
                            }
                            window._callerRingtone = ring;
                        } catch(e) {
                            _tryWebAudioBeep();
                        }

                        function _tryWebAudioBeep() {
                            try {
                                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                                let ringing = true;
                                window._callerRingtone = { _ctx: ctx, pause: function() { ringing = false; try { ctx.close(); } catch(e) {} }, currentTime: 0 };
                                (function beep() {
                                    if (!ringing || ctx.state === 'closed') return;
                                    const osc = ctx.createOscillator();
                                    const gain = ctx.createGain();
                                    osc.connect(gain);
                                    gain.connect(ctx.destination);
                                    osc.frequency.value = 600;
                                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                                    osc.start(ctx.currentTime);
                                    osc.stop(ctx.currentTime + 0.3);
                                    osc.onended = function() { if (ringing) setTimeout(beep, 1000); };
                                })();
                            } catch(e) { /* silent fail */ }
                        }
                    } catch(e) { /* silent fail */ }
                })();
            }
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

            UIState.callStartTime = UIState.callStartTime || Date.now();
            UIState.callActive    = true;
            UIState.callState     = 'connected';

            const name = (callData && (callData.callerName || callData.userName || callData.receiverName || callData.calleeName))
                || window.__activePeerName
                || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name) || 'User';
            const type = (callData && callData.callType) || window.__activePeerType || UIState.callType || 'voice';

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

            // Only transition if in-call screen isn't already showing
            const inCallEl = document.getElementById('inCallScreen');
            if (!inCallEl || !inCallEl.classList.contains('active')) {
                const name = (callData && (callData.callerName || callData.userName || callData.calleeName))
                    || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name) || 'User';
                const type = (callData && callData.callType) || UIState.callType || 'voice';
                transitionToInCall({ userName: name, callType: type });
            }

            // Ensure remote audio is playing (in case ontrack fired before screen shown)
            const remoteAudio = document.getElementById('remoteAudio');
            if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
                remoteAudio.play().catch(() => {});
            }
        },

        handleCallEnded: function(callData) {
            // ── FIX: Immediately restore parent layout + reset to idle screen ──
            window.__callActive = false;
            // Clear the CALL_ACCEPTED dedup lock and peer globals so next call works
            window.__callAcceptedHandled = 0;
            window.__activePeerName   = null;
            window.__activePeerType   = null;
            window.__activePeerAvatar = null;
            // Disconnect the incoming-modal guard observer
            if (window._modalGuardObserver) { try { window._modalGuardObserver.disconnect(); } catch(e) {} window._modalGuardObserver = null; }
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'CALL_SCREEN_ACTIVE', payload: { active: false } }, '*');
            }
            // Reset screens inside iframe to idle
            const callingScreen = document.getElementById('callingScreen');
            const inCallScreen  = document.getElementById('inCallScreen');
            const idleScreen    = document.getElementById('idleScreen');
            const callContainer = document.getElementById('callContainer');
            if (callingScreen) { callingScreen.classList.remove('active'); callingScreen.style.setProperty('display', 'none', 'important'); }
            if (inCallScreen)  { inCallScreen.classList.remove('active');  inCallScreen.style.setProperty('display', 'none', 'important'); }
            if (callContainer) { callContainer.classList.add('active'); callContainer.style.display = 'flex'; }
            if (idleScreen)    { idleScreen.classList.add('active'); idleScreen.style.setProperty('display', 'block', 'important'); }

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
            const returnTo = window.__callOriginReturnTo
                || window.__pendingCallReturnTo
                || 'calls';
            const chatUserId = window.__callOriginChatUserId
                || window.__pendingCallChatUserId
                || null;

            // Reset state FIRST
            UIState.activeCallId = null;
            UIState.callActive = false;
            UIState.callState = 'idle';
            UIState.callParticipants = [];
            UIState.callStartTime = null;
            UIState.callType = null;
            window._currentIncomingCallId = null;
            document.body.classList.remove('call-connected');

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
                            payload: { returnFromCall: true, openChatWith: chatUserId, openChatWithName: window.__callOriginChatUserName || null },
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
                    }
                    // If returnTo === 'calls', stay on this screen — no SWITCH_MODULE needed
                }

                // NEVER hide sidebar or main content - always use overlay
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.style.display = 'flex'; // Always keep sidebar visible
                
                // Show idle screen
                if (typeof showIdleScreen === 'function') {
                    showIdleScreen();
                } else {
                    // Fallback: manually show idle screen
                    const idleScreen = document.getElementById('idleScreen');
                    const callingOverlay = document.getElementById('callingScreen'); // unified screen
                    if (idleScreen) {
                        idleScreen.classList.add('active');
                        idleScreen.style.display = 'flex';
                    }
                    if (callingOverlay) {
                        callingOverlay.classList.remove('active');
                        callingOverlay.style.display = 'none';
                    }
                }
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
                        case 'call_accepted':
case 'CALL_ACCEPTED': {
    // Receiver answered — transition caller to in-call screen
    // ── Dedup: ignore if we already transitioned to in-call ──────────────
    if (window.__callAcceptedHandled && (Date.now() - window.__callAcceptedHandled) < 5000) {
        console.log('[Calls UI] ⏭ CALL_ACCEPTED dedup — already handled');
        break;
    }
    window.__callAcceptedHandled = Date.now();
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

    // ── Resolve peer name: use window globals first (survive force_ended wipe) ─
    const _peerName = window.__activePeerName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || (UIState.pendingCallUser && UIState.pendingCallUser.userName)
        || _ap.callerName || _ap.userName || _ap.name || 'User';
    const _peerType = window.__activePeerType
        || UIState.callType || _ap.callType || 'voice';
    const _peerAva  = window.__activePeerAvatar
        || (UIState.pendingCallUser && UIState.pendingCallUser.userAvatar) || null;

    // ── Restore UIState in case a stale call_force_ended wiped it ────────
    UIState.callActive    = true;
    UIState.callState     = 'connected';
    UIState.callStartTime = UIState.callStartTime || Date.now();
    window.__callActive   = true;
    document.body.classList.add('call-active');

    // ── Dismiss incoming call modal on receiver side ──────────────────────
    if (_im) { _im.classList.remove('active'); _im.style.setProperty('display','none','important'); }

    transitionToInCall({ userName: _peerName, callType: _peerType, userAvatar: _peerAva });
    break;
}
                    case 'CALL_INCOMING': {
                        const _incomingPayload = data.payload || {};
                        // Store so late-arriving callCore listeners can still pick it up
                        window.__pendingIncomingCallData = _incomingPayload;
                        if (UIEventHandlers.handleIncomingCall) {
                            UIEventHandlers.handleIncomingCall(_incomingPayload);
                        } else {
                            // callCore or UI not fully ready — retry up to 3x with 300ms gaps
                            let _retries = 0;
                            const _retryIncoming = setInterval(() => {
                                _retries++;
                                if (UIEventHandlers.handleIncomingCall) {
                                    clearInterval(_retryIncoming);
                                    UIEventHandlers.handleIncomingCall(_incomingPayload);
                                    window.__pendingIncomingCallData = null;
                                } else if (_retries >= 3) {
                                    clearInterval(_retryIncoming);
                                    console.warn('[Calls UI] handleIncomingCall still not ready after retries');
                                }
                            }, 300);
                        }
                        break;
                    }
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
                        if (data.type === 'CALL_FORCE_ENDED' && _isAlreadyInCall) {
                            console.warn('[Calls UI] CALL_FORCE_ENDED ignored — already in-call screen active');
                            if (window._currentCallTimer) { clearInterval(window._currentCallTimer); window._currentCallTimer = null; }
                            if (window._receiverShowFallback) { clearTimeout(window._receiverShowFallback); window._receiverShowFallback = null; }
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
            const _callEventTypes = ['CALL_ACCEPTED', 'CALL_ENDED', 'CALL_FORCE_ENDED', 'CALL_REJECTED',
                'CALL_CANCELLED', 'CALL_INCOMING', 'CALL_RINGING', 'call_accepted', 'call:accepted',
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
            
            if (elements.menuParticipants) {
                this.addListener(elements.menuParticipants, 'click', () => {
                    UIEventHandlers.closeMenuDots();
                    UIPanelHandlers.openParticipantsPanel();
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
            if (window.__earlyCallLock) window.__earlyCallLock = { ts: 0, userId: null };
            window.__pendingCallReturnTo = null;
            window.__pendingCallChatUserId = null;
        },

        toggleMenuDots: function(e) {
            e?.stopPropagation();
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
            
            if (coreInstance && coreInstance.toggleMic) {
                coreInstance.toggleMic();
            } else if (UIState.localStream) {
                const audioTracks = UIState.localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    UIState.isMuted = !UIState.isMuted;
                    audioTracks.forEach(track => {
                        track.enabled = !UIState.isMuted;
                    });
                    
                    const icon = elements.muteBtn.querySelector('i');
                    if (icon) {
                        icon.className = UIState.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    }
                    
                    showNotification(UIState.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
                }
            }
        },
        
        toggleVideo: function() {
            if (!canPerformAction('toggleVideo')) return;
            
            if (coreInstance && coreInstance.toggleCamera) {
                coreInstance.toggleCamera();
            } else if (UIState.localStream) {
                const videoTracks = UIState.localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    UIState.isVideoOff = !UIState.isVideoOff;
                    videoTracks.forEach(track => {
                        track.enabled = !UIState.isVideoOff;
                    });
                    
                    const icon = elements.videoBtn.querySelector('i');
                    if (icon) {
                        icon.className = UIState.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
                    }
                    
                    showNotification(UIState.isVideoOff ? 'Camera turned off' : 'Camera turned on', 'info');
                }
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
            
            if (coreInstance && coreInstance.startScreenShare) {
                coreInstance.startScreenShare()
                    .then(result => {
                        if (result.success) {
                            UIState.isScreenSharing = true;
                            if (elements.screenShareBtn) {
                                elements.screenShareBtn.classList.add('active');
                            }
                            showNotification('Screen sharing started', 'success');
                        } else {
                            showNotification(result.error || 'Failed to start screen sharing', 'error');
                        }
                    })
                    .catch(error => {
                        UILogger.error('Error starting screen share', error);
                        showNotification('Failed to start screen sharing', 'error');
                    });
            } else {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(stream => {
                        UIState.screenStream = stream;
                        UIState.isScreenSharing = true;
                        
                        if (elements.screenShareBtn) {
                            elements.screenShareBtn.classList.add('active');
                        }
                        
                        showNotification('Screen sharing started', 'success');
                    })
                    .catch(error => {
                        UILogger.error('Error starting screen share', error);
                        showNotification('Failed to start screen sharing', 'error');
                    });
            }
        },
        
        stopScreenShare: function() {
            if (coreInstance && coreInstance.stopScreenShare) {
                coreInstance.stopScreenShare();
            }
            
            if (UIState.screenStream) {
                UIState.screenStream.getTracks().forEach(track => track.stop());
                UIState.screenStream = null;
            }
            
            UIState.isScreenSharing = false;
            
            if (elements.screenShareBtn) {
                elements.screenShareBtn.classList.remove('active');
            }
            
            showNotification('Screen sharing stopped', 'info');
        },
        
        toggleSpeaker: function() {
            UIState.isSpeakerOn = !UIState.isSpeakerOn;
            
            const icon = elements.speakerBtn.querySelector('i');
            if (icon) {
                icon.className = UIState.isSpeakerOn ? 'fas fa-volume-up' : 'fas fa-headphones';
            }
            
            showNotification(`Switched to ${UIState.isSpeakerOn ? 'speaker' : 'headphones'}`, 'info');
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
            
            setTimeout(() => this.showPrivateNotesModal(), 500);
            
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            showNotification(`Call ended - Duration: ${mins}:${secs.toString().padStart(2, '0')}`, 'success');
            
            // Navigate back to correct screen
            setTimeout(() => {
                if (window.parent && window.parent !== window) {
                    const returnTo = window.__callOriginReturnTo || window.__pendingCallReturnTo || 'calls';
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
                    } else if (returnTo === 'friends') {
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: 'friends',
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    } else if (returnTo && returnTo !== 'calls') {
                        // Any other origin module — navigate back to it
                        window.parent.postMessage({
                            type: 'SWITCH_MODULE',
                            module: returnTo,
                            payload: { returnFromCall: true },
                            timestamp: Date.now()
                        }, '*');
                    }
                    // returnTo === 'calls' → stay here, no SWITCH_MODULE needed
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
        },
        
        closeCallSummary: function() {
            if (elements.callSummaryModal) {
                elements.callSummaryModal.classList.remove('active');
                UIState.activeModals.delete('callSummaryModal');
            }
        },
        
        acceptIncomingCall: function() {
    this.acceptIncomingCallGeneric(false);
},

acceptIncomingCallAsVideo: function() {
    this.acceptIncomingCallGeneric(true);
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
    const callId = window._currentIncomingCallId || UIState.activeCallId;
    
    if (!callId) {
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
    if (coreInstance && coreInstance.answerCall) {
        try {
            const result = await coreInstance.answerCall(callId);
            if (result && result.success) {
                accepted = true;
                showNotification(`Call accepted with ${callerName}`, 'success');
            } else {
                showNotification(result?.error || 'Failed to accept call', 'error');
            }
        } catch (error) {
            console.error('[Calls UI] Accept call error:', error);
            showNotification('Failed to accept call', 'error');
        }
    } else if (coreInstance && coreInstance.sendAction) {
        // Fallback path (no answerCall available)
        try {
            const result = await coreInstance.sendAction('CALL_ACCEPT', {
                callId: callId,
                timestamp: Date.now()
            });
            if (result && result.success) {
                accepted = true;
            }
        } catch (e) {}
    } else {
        showNotification('Call system not ready', 'error');
        this.declineIncomingCall();
        return;
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
        UIState.callState     = 'connected';
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
        // Fallback: if core never fires call_connected within 4 s, show in-call anyway
        window._receiverShowFallback = setTimeout(() => {
            const inCall = document.getElementById('inCallScreen');
            if (!inCall || !inCall.classList.contains('active')) {
                console.warn('[UI] Fallback: showing in-call screen for receiver');
                transitionToInCall({ userName: callerName, callType });
            }
        }, 4000);
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

    showIdleScreen();
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

    // ==================== UI PANEL HANDLERS ====================
    const UIPanelHandlers = {
        openParticipantsPanel: function() {
            this.createParticipantsPanel();
        },
        
        openChatPanel: function() {
            this.createChatPanel();
        },
        
        openWhiteboardPanel: function() {
            this.createWhiteboardPanel();
        },
        
        openNotesPanel: function() {
            this.createNotesPanel();
        },
        
        openPollsPanel: function() {
            this.createPollsPanel();
        },
        
        openRelationshipPanel: function() {
            this.createRelationshipPanel();
        },
        
        createParticipantsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel participants-panel';

            // Get real participants from call state
            const currentUserId = window.__CHILD_SESSION__?.userId;
            const currentUsername = window.__CHILD_SESSION__?.username || 'You';
            const callParticipants = UIState.callParticipants || callsState?.callParticipants || [];
            const contacts = UIState.contacts || window.__cachedCallContacts || [];

            // Build participant rows
            const participantRows = callParticipants.map(function(p) {
                const contact = contacts.find(function(c){ return c.id === p.id || c.userId === p.id; });
                const name = p.name || p.username || (contact && (contact.displayName || contact.username)) || ('User ' + p.id);
                const initials = name.split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().substring(0,2) || '??';
                const isOnline = p.isOnline !== undefined ? p.isOnline : true;
                return `<div class="participant-item" data-id="${p.id}">
                    <div class="participant-avatar" style="background-color:#6c5ce7">${initials}</div>
                    <div class="participant-info">
                        <div class="participant-name">${name}</div>
                        <div class="participant-status ${isOnline ? 'online' : 'offline'}">
                            <span class="status-dot"></span> ${isOnline ? 'Connected' : 'Disconnected'}
                        </div>
                    </div>
                    ${p.isHost ? '<span class="host-badge">Host</span>' : ''}
                    <button class="participant-action-btn mute-participant" data-id="${p.id}" title="Mute"><i class="fas fa-microphone-slash"></i></button>
                </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-users"></i> Participants (${callParticipants.length + 1})</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="participant-item self">
                        <div class="participant-avatar" style="background-color:#6c5ce7">${currentUsername.substring(0,2).toUpperCase()}</div>
                        <div class="participant-info">
                            <div class="participant-name">${currentUsername} (You)</div>
                            <div class="participant-status online"><span class="status-dot"></span> Connected</div>
                        </div>
                        <span class="host-badge">You</span>
                    </div>
                    ${participantRows || '<div class="empty-participants"><i class="fas fa-user-plus"></i><p>No other participants yet</p></div>'}
                </div>
                <div class="panel-footer">
                    <button class="panel-action-btn invite-btn" id="inviteParticipantBtn">
                        <i class="fas fa-user-plus"></i> Invite
                    </button>
                </div>`;

            document.body.appendChild(panel);
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('participantsPanel'); });
            panel.querySelector('#inviteParticipantBtn')?.addEventListener('click', () => {
                showNotification('Share the call link to invite participants', 'info');
                if (window.callCore && window.callCore.getCallLink) {
                    window.callCore.getCallLink().then(function(link){ if(link){ navigator.clipboard?.writeText(link); showNotification('Call link copied!', 'success'); }});
                }
            });
            UIState.activePanels.add('participantsPanel');
        },

        createChatPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel chat-panel';
            const now = formatCallClockTime(Date.now());
            const currentUsername = window.__CHILD_SESSION__?.username || 'You';

            // Load chat history from state
            const chatMessages = UIState.callChatMessages || [];
            const messagesHtml = chatMessages.map(function(m) {
                const isSelf = m.senderId === (window.__CHILD_SESSION__?.userId);
                return `<div class="chat-message ${isSelf ? 'self' : 'other'}">
                    <div class="message-sender">${isSelf ? 'You' : (m.senderName || 'Participant')}</div>
                    <div class="message-content">${m.text}</div>
                    <div class="message-time">${formatCallChatTimestamp(m.timestamp)}</div>
                </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-comment"></i> In-Call Chat</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="chat-messages" id="chatMessagesPanel">
                        <div class="chat-message system">
                            <div class="message-content">Chat started • ${now}</div>
                        </div>
                        ${messagesHtml}
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chatInputPanel" placeholder="Type a message..." aria-label="Chat message">
                        <button class="chat-send-btn" id="chatSendPanel" aria-label="Send message"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>`;

            document.body.appendChild(panel);
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('chatPanel'); });

            const chatInput = panel.querySelector('#chatInputPanel');
            const chatSend = panel.querySelector('#chatSendPanel');
            const messagesContainer = panel.querySelector('.chat-messages');

            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (!message) return;
                // Send via core
                if (coreInstance && coreInstance.sendChatMessage) {
                    coreInstance.sendChatMessage(message);
                } else if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_CHAT_MESSAGE', payload: { message, senderId: window.__CHILD_SESSION__?.userId, senderName: currentUsername, timestamp: Date.now() }}, '*');
                }
                // Append locally
                const msgEl = document.createElement('div');
                msgEl.className = 'chat-message self';
                msgEl.innerHTML = `<div class="message-sender">You</div><div class="message-content">${message}</div><div class="message-time">${formatCallChatTimestamp(Date.now())}</div>`;
                messagesContainer.appendChild(msgEl);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                // Store in state
                if (!UIState.callChatMessages) UIState.callChatMessages = [];
                UIState.callChatMessages.push({ senderId: window.__CHILD_SESSION__?.userId, senderName: 'You', text: message, timestamp: Date.now() });
                chatInput.value = '';
            };

            chatSend.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

            // Listen for incoming messages
            window.__callChatPanelRef = panel;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            UIState.activePanels.add('chatPanel');
        },

        createWhiteboardPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel whiteboard-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-chalkboard"></i> Shared Whiteboard</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="whiteboard-toolbar">
                        <button class="tool-btn active" data-tool="pen" title="Pen"><i class="fas fa-pen"></i></button>
                        <button class="tool-btn" data-tool="eraser" title="Eraser"><i class="fas fa-eraser"></i></button>
                        <button class="tool-btn" data-tool="text" title="Text"><i class="fas fa-font"></i></button>
                        <button class="tool-btn" data-tool="line" title="Line"><i class="fas fa-slash"></i></button>
                        <button class="tool-btn" data-tool="rect" title="Rectangle"><i class="fas fa-square"></i></button>
                        <span class="toolbar-sep"></span>
                        <input type="color" id="wbColorPicker" value="#ff3b30" title="Color" style="width:32px;height:32px;padding:2px;cursor:pointer;border:none;background:none;">
                        <input type="range" id="wbSizeSlider" min="1" max="20" value="3" title="Size" style="width:60px;">
                        <button class="tool-btn" id="wbUndoBtn" title="Undo"><i class="fas fa-undo"></i></button>
                        <button class="tool-btn" id="wbClearBtn" title="Clear"><i class="fas fa-trash"></i></button>
                        <button class="tool-btn" id="wbSaveBtn" title="Save image"><i class="fas fa-download"></i></button>
                    </div>
                    <canvas id="wbCanvas" style="background:#fff;cursor:crosshair;touch-action:none;width:100%;max-height:420px;display:block;" width="800" height="420"></canvas>
                </div>`;

            document.body.appendChild(panel);

            const canvas = panel.querySelector('#wbCanvas');
            const ctx = canvas.getContext('2d');
            let drawing = false, lastX = 0, lastY = 0, currentTool = 'pen';
            let currentColor = '#ff3b30', currentSize = 3;
            const history = [];

            const saveHistory = () => history.push(canvas.toDataURL());
            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
                const src = e.touches ? e.touches[0] : e;
                return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
            };

            const startDraw = (e) => { drawing = true; saveHistory(); const p = getPos(e); lastX = p.x; lastY = p.y; };
            const draw = (e) => {
                if (!drawing) return;
                e.preventDefault();
                const p = getPos(e);
                ctx.beginPath();
                if (currentTool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = currentSize * 5; }
                else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = currentColor; ctx.lineWidth = currentSize; }
                ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
                lastX = p.x; lastY = p.y;
            };
            const stopDraw = () => { drawing = false; };

            canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDraw); canvas.addEventListener('mouseleave', stopDraw);
            canvas.addEventListener('touchstart', startDraw, {passive:false}); canvas.addEventListener('touchmove', draw, {passive:false}); canvas.addEventListener('touchend', stopDraw);

            panel.querySelectorAll('.tool-btn[data-tool]').forEach(btn => btn.addEventListener('click', () => { panel.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentTool = btn.dataset.tool; }));
            panel.querySelector('#wbColorPicker').addEventListener('input', (e) => { currentColor = e.target.value; });
            panel.querySelector('#wbSizeSlider').addEventListener('input', (e) => { currentSize = parseInt(e.target.value); });
            panel.querySelector('#wbUndoBtn').addEventListener('click', () => { if (history.length > 0) { const img = new Image(); img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0); }; img.src = history.pop(); } });
            panel.querySelector('#wbClearBtn').addEventListener('click', () => { if (confirm('Clear whiteboard?')) { saveHistory(); ctx.clearRect(0,0,canvas.width,canvas.height); } });
            panel.querySelector('#wbSaveBtn').addEventListener('click', () => { const a = document.createElement('a'); a.download = 'whiteboard.png'; a.href = canvas.toDataURL(); a.click(); });
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('whiteboardPanel'); });
            UIState.activePanels.add('whiteboardPanel');
        },

        createNotesPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel notes-panel';
            const savedNotes = UIState.callNotes || localStorage.getItem('call_notes_' + (UIState.activeCallId || 'default')) || '';
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-sticky-note"></i> Call Notes</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="notes-meta" style="font-size:11px;color:#888;padding:4px 8px">${now} · Auto-saved locally</div>
                    <textarea class="notes-editor" id="sharedNotesEditor" placeholder="Take notes during this call..." style="width:100%;min-height:280px;padding:12px;font-size:14px;border:none;outline:none;resize:vertical;background:transparent;">${savedNotes}</textarea>
                    <div class="notes-toolbar" style="display:flex;gap:8px;padding:8px;border-top:1px solid rgba(255,255,255,.1)">
                        <button class="notes-btn" id="saveNotesBtn" style="flex:1;padding:8px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-save"></i> Save</button>
                        <button class="notes-btn" id="copyNotesBtn" style="padding:8px 12px;background:rgba(255,255,255,.1);color:#fff;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-copy"></i> Copy</button>
                        <button class="notes-btn" id="clearNotesBtn" style="padding:8px 12px;background:rgba(255,0,0,.2);color:#ff6b6b;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;

            document.body.appendChild(panel);

            const editor = panel.querySelector('#sharedNotesEditor');
            const storageKey = 'call_notes_' + (UIState.activeCallId || 'default');

            // Auto-save on every keystroke
            editor.addEventListener('input', () => {
                UIState.callNotes = editor.value;
                localStorage.setItem(storageKey, editor.value);
            });

            panel.querySelector('#saveNotesBtn').addEventListener('click', () => {
                UIState.callNotes = editor.value;
                localStorage.setItem(storageKey, editor.value);
                if (coreInstance && coreInstance.saveNotes) coreInstance.saveNotes(editor.value);
                showNotification('Notes saved', 'success');
            });
            panel.querySelector('#copyNotesBtn').addEventListener('click', () => {
                navigator.clipboard?.writeText(editor.value).then(() => showNotification('Copied to clipboard', 'success'));
            });
            panel.querySelector('#clearNotesBtn').addEventListener('click', () => {
                if (confirm('Clear all notes?')) { editor.value = ''; UIState.callNotes = ''; localStorage.removeItem(storageKey); }
            });
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('notesPanel'); });
            UIState.activePanels.add('notesPanel');
        },

        createPollsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel polls-panel';

            // Real polls state stored in UIState
            if (!UIState.callPolls) UIState.callPolls = [];

            const renderPolls = () => {
                const list = panel.querySelector('#activePolls');
                if (!list) return;
                if (UIState.callPolls.length === 0) {
                    list.innerHTML = '<div style="text-align:center;padding:24px;color:#888"><i class="fas fa-poll" style="font-size:32px;margin-bottom:8px"></i><p>No active polls yet</p></div>';
                    return;
                }
                list.innerHTML = UIState.callPolls.map((poll, pi) => {
                    const totalVotes = poll.options.reduce((s,o) => s + (o.votes||0), 0);
                    return `<div class="poll-item" style="background:rgba(255,255,255,.05);border-radius:12px;padding:12px;margin-bottom:8px">
                        <div style="font-weight:600;margin-bottom:8px">${poll.question}</div>
                        ${poll.options.map((opt, oi) => {
                            const pct = totalVotes > 0 ? Math.round((opt.votes||0)/totalVotes*100) : 0;
                            const voted = poll.myVote === oi;
                            return `<div class="poll-option-row" style="margin-bottom:6px">
                                <button onclick="window.__votePoll(${pi},${oi})" style="width:100%;text-align:left;background:${voted?'rgba(108,92,231,.4)':'rgba(255,255,255,.05)'};border:${voted?'1px solid #6c5ce7':'1px solid transparent'};border-radius:8px;padding:8px 10px;color:#fff;cursor:pointer;position:relative;overflow:hidden">
                                    <div style="position:absolute;top:0;left:0;height:100%;width:${pct}%;background:rgba(108,92,231,.2);transition:width .3s"></div>
                                    <span style="position:relative">${opt.text} ${voted?'✓':''}</span>
                                    <span style="position:relative;float:right;font-size:12px;color:#888">${pct}% (${opt.votes||0})</span>
                                </button>
                            </div>`;
                        }).join('')}
                        <div style="font-size:11px;color:#888;margin-top:4px">${totalVotes} vote${totalVotes!==1?'s':''}</div>
                    </div>`;
                }).join('');
            };

            window.__votePoll = (pollIdx, optionIdx) => {
                const poll = UIState.callPolls[pollIdx];
                if (!poll) return;
                if (poll.myVote !== undefined) { showNotification('You already voted', 'info'); return; }
                if (!poll.options[optionIdx]) return;
                poll.options[optionIdx].votes = (poll.options[optionIdx].votes || 0) + 1;
                poll.myVote = optionIdx;
                // Broadcast via core
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_POLL_VOTE', payload: { pollIdx, optionIdx, callId: UIState.activeCallId }}, '*');
                }
                renderPolls();
            };

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-poll"></i> Polls</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div id="activePolls" style="margin-bottom:16px"></div>
                    <div style="background:rgba(255,255,255,.05);border-radius:12px;padding:12px">
                        <div style="font-weight:600;margin-bottom:8px"><i class="fas fa-plus-circle"></i> Create Poll</div>
                        <input type="text" id="pollQuestion" placeholder="Poll question..." style="width:100%;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;margin-bottom:8px">
                        <div id="pollOptionsContainer">
                            <input type="text" class="poll-opt" placeholder="Option 1" style="width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px">
                            <input type="text" class="poll-opt" placeholder="Option 2" style="width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px">
                        </div>
                        <button id="addPollOptBtn" style="background:none;border:1px dashed rgba(255,255,255,.3);color:#888;padding:4px 10px;border-radius:6px;cursor:pointer;margin-bottom:8px;font-size:12px">+ Add option</button>
                        <button id="createPollBtn" style="width:100%;padding:10px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Create Poll</button>
                    </div>
                </div>`;

            document.body.appendChild(panel);
            renderPolls();

            panel.querySelector('#addPollOptBtn').addEventListener('click', () => {
                const container = panel.querySelector('#pollOptionsContainer');
                const count = container.querySelectorAll('.poll-opt').length + 1;
                const input = document.createElement('input');
                input.type = 'text'; input.className = 'poll-opt'; input.placeholder = 'Option ' + count;
                input.style.cssText = 'width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px';
                container.appendChild(input);
            });

            panel.querySelector('#createPollBtn').addEventListener('click', () => {
                const question = panel.querySelector('#pollQuestion').value.trim();
                const options = Array.from(panel.querySelectorAll('.poll-opt')).map(i => i.value.trim()).filter(Boolean);
                if (!question) { showNotification('Enter a poll question', 'warning'); return; }
                if (options.length < 2) { showNotification('Add at least 2 options', 'warning'); return; }
                const newPoll = { question, options: options.map(t => ({text:t,votes:0})), createdAt: Date.now(), myVote: undefined };
                UIState.callPolls.push(newPoll);
                // Broadcast
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_POLL_CREATED', payload: { poll: newPoll, callId: UIState.activeCallId }}, '*');
                }
                showNotification('Poll created!', 'success');
                renderPolls();
                panel.querySelector('#pollQuestion').value = '';
                panel.querySelectorAll('.poll-opt').forEach((i,idx) => { i.value = ''; if(idx>1) i.remove(); });
            });

            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('pollsPanel'); });
            UIState.activePanels.add('pollsPanel');
        },

        createRelationshipPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel relationship-panel';

            // Gather real stats from call history
            const callHistory = UIState.callHistory || [];
            const currentUserId = window.__CHILD_SESSION__?.userId;
            const contacts = UIState.contacts || window.__cachedCallContacts || [];

            // Compute real stats
            const completedCalls = callHistory.filter(c => c.status === 'completed');
            const totalDuration = completedCalls.reduce((s, c) => s + (c.duration || 0), 0);
            const avgDuration = completedCalls.length > 0 ? Math.round(totalDuration / completedCalls.length) : 0;
            const avgMins = Math.floor(avgDuration / 60), avgSecs = avgDuration % 60;
            const missedCalls = callHistory.filter(c => c.status === 'missed').length;

            // Contact frequency map
            const contactFreq = {};
            callHistory.forEach(call => {
                const otherId = call.callerId === currentUserId ? call.receiverId : call.callerId;
                if (otherId) contactFreq[otherId] = (contactFreq[otherId] || 0) + 1;
            });
            const topContactId = Object.keys(contactFreq).sort((a,b) => contactFreq[b]-contactFreq[a])[0];
            const topContact = contacts.find(c => String(c.id) === String(topContactId));
            const topContactName = topContact ? (topContact.displayName || topContact.username) : (topContactId ? '#'+topContactId : 'N/A');

            // Day frequency
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const dayFreq = [0,0,0,0,0,0,0];
            callHistory.forEach(call => { if (call.startedAt) dayFreq[new Date(call.startedAt).getDay()]++; });
            const maxDay = Math.max(...dayFreq) || 1;
            const busiestDay = dayNames[dayFreq.indexOf(Math.max(...dayFreq))];
            const chartBars = dayFreq.map((count, i) => `<div class="chart-bar" style="height:${Math.round(count/maxDay*80)+10}%;position:relative" title="${count} calls">
                <div style="position:absolute;bottom:100%;width:100%;text-align:center;font-size:9px;color:#888">${count||''}</div>
                ${dayNames[i]}
            </div>`).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-chart-line"></i> Relationship Insights</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="insight-cards">
                        <div class="insight-card">
                            <div class="insight-title">Total Calls</div>
                            <div class="insight-value">${callHistory.length}</div>
                            <div class="insight-description">All time</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Avg Duration</div>
                            <div class="insight-value">${avgMins}m ${avgSecs}s</div>
                            <div class="insight-description">Per completed call</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Missed Calls</div>
                            <div class="insight-value" style="color:${missedCalls>0?'#e74c3c':'#2ecc71'}">${missedCalls}</div>
                            <div class="insight-description">Unanswered</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Top Contact</div>
                            <div class="insight-value" style="font-size:16px">${topContactName}</div>
                            <div class="insight-description">${topContactId ? contactFreq[topContactId]+' calls' : 'No calls yet'}</div>
                        </div>
                    </div>
                    <div class="relationship-chart">
                        <h5>Call Frequency by Day <span style="font-size:11px;color:#888">(busiest: ${busiestDay})</span></h5>
                        <div class="chart-container" style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:0 4px">
                            ${callHistory.length > 0 ? chartBars : '<div style="color:#888;font-size:12px;align-self:center;width:100%;text-align:center">No call history yet</div>'}
                        </div>
                    </div>
                </div>`;

            document.body.appendChild(panel);

            // Load real call history if not already loaded
            if (callHistory.length === 0 && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'REFRESH_CALL_HISTORY', payload: { userId: currentUserId }}, '*');
            }

            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('relationshipPanel'); });
            UIState.activePanels.add('relationshipPanel');
        }
    };  // end UIPanelHandlers


    // ==================== MOBILE BACK BUTTON SETUP ====================
    function setupMobileBackButton() {
        const mobileBackBtn = document.getElementById('mobileBackBtn');
        if (mobileBackBtn) {
            mobileBackBtn.addEventListener('click', function() {
                // Hide call container, show sidebar
                if (elements.callContainer) elements.callContainer.classList.remove('active');
                if (elements.sidebar) elements.sidebar.style.display = 'flex';
                
                // Reset call state
                UIState.currentView = 'sidebar';
                UIState.callActive = false;
                UIState.callState = 'idle';
                
                // Notify parent to show sidebar icons
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'SHOW_SIDEBAR_ICONS', module: 'calls' }, '*');
                }
                
                // If in a call, end it
                if (UIState.activeCallId && coreInstance && coreInstance.endCall) {
                    coreInstance.endCall(UIState.activeCallId);
                }
            });
        }
    }


    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // ==================== NOTIFICATION SYSTEM ====================
    function createNotification({ type = 'info', title, message, duration = 3000 } = {}) {
    try {
        const notification = document.createElement('div');
        notification.className = `call-notification ${type}`;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('data-sanitized', 'true');
        
        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        // Build icon div with innerHTML for static icon (safe)
        const iconDiv = document.createElement('div');
        iconDiv.className = 'call-notification-icon';
        iconDiv.setAttribute('data-sanitized', 'true');
        iconDiv.innerHTML = `<i class="fas ${iconMap[type] || 'fa-bell'}"></i>`;
        
        // Build content div with innerHTML for proper HTML rendering
        const contentDiv = document.createElement('div');
        contentDiv.className = 'call-notification-content';
        contentDiv.innerHTML = `
            <div class="call-notification-title">${escapeHtml(title || type.charAt(0).toUpperCase() + type.slice(1))}</div>
            <div class="call-notification-message">${escapeHtml(message)}</div>
        `;
        
        // Build close button with innerHTML for icon (safe)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'call-notification-close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.setAttribute('data-sanitized', 'true');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        
        closeBtn.addEventListener('click', () => notification.remove());
        
        notification.appendChild(iconDiv);
        notification.appendChild(contentDiv);
        notification.appendChild(closeBtn);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
        
        return notification;
    } catch (error) {
        UILogger.error('createNotification', error);
        return null;
    }
}

    /**
     * _showReceiverCallScreen
     * Shows the active-call container for the RECEIVER after they accept.
     * Without this the receiver has no visible call UI after accepting.
     */
    function _showReceiverCallScreen(callId, callerName, callType) {
    // Delegate to transitionToInCall (same screen as caller)
    console.log('[UI] _showReceiverCallScreen → transitionToInCall', { callId, callerName, callType });
    UIState.callActive    = true;
    UIState.callState     = 'connected';
    UIState.callStartTime = UIState.callStartTime || Date.now();
    UIState.activeCallId  = callId || UIState.activeCallId;
    const name = callerName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || 'User';
    transitionToInCall({ userName: name, callType: callType || UIState.callType || 'voice' });
}

    function showNotification(message, type = 'success') {
        const notificationArea = elements.notificationArea || document.body;
        
        const notification = createNotification({
            type,
            title: type.charAt(0).toUpperCase() + type.slice(1),
            message,
            duration: 3000
        });
        
        if (notification) {
            notificationArea.appendChild(notification);
        }
    }

    function requestMediaPermissionsFn(type) {
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        return navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                UILogger.error('Error getting media permissions', error);
                
                let errorMessage = 'Could not access ';
                if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    errorMessage += 'camera/microphone. Please check your devices.';
                } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    errorMessage += 'camera/microphone. Please allow permissions.';
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    errorMessage += 'camera/microphone. Device may be in use by another application.';
                } else {
                    errorMessage += 'camera/microphone. Unknown error.';
                }
                
                throw new Error(errorMessage);
            });
    }

    const ViewHistory = {
        push: function(view, data = {}) {
            UIState.viewHistory.push({
                view,
                data,
                timestamp: Date.now()
            });
            
            if (UIState.viewHistory.length > 50) {
                UIState.viewHistory.shift();
            }
            
            UIState.currentView = view;
        },
        
        pop: function() {
            UIState.viewHistory.pop();
            const previous = UIState.viewHistory[UIState.viewHistory.length - 1];
            UIState.currentView = previous?.view || 'sidebar';
            return previous;
        },
        
        createRestorePoint: function(key) {
            UIState.restorePoints.set(key, {
                view: UIState.currentView,
                activePanels: Array.from(UIState.activePanels),
                activeModals: Array.from(UIState.activeModals),
                timestamp: Date.now()
            });
            
            if (DEBUG) {
                logOnce('info', `Created restore point: ${key}`);
            }
        },
        
        restore: function(key) {
            const point = UIState.restorePoints.get(key);
            if (!point) return false;
            
            document.querySelectorAll('.feature-panel.active, .modal.active').forEach(el => {
                el.classList.remove('active');
            });
            
            UIState.activePanels.clear();
            UIState.activeModals.clear();
            
            UIState.currentView = point.view;
            
            if (DEBUG) {
                logOnce('info', `Restored from point: ${key}`);
            }
            return true;
        }
    };

    // ==================== FULL INITIALIZATION ====================
    function performFullInitialization() {
        if (DEBUG) {
            logOnce('info', 'Performing full UI initialization with core');
        }
        
        // Use coreInstance from closure
        if (window.callCore) {
            coreInstance = window.callCore;
        } else if (window.CallsCore) {
            coreInstance = window.CallsCore;
        } else if (window.callsCore) {
            coreInstance = window.callsCore;
        }
        
        initializeUISystem().catch(error => {
            if (DEBUG) {
                logOnce('error', 'Full initialization failed', error);
            }
        });
    }
function setupFriendsListListener() {
    window.addEventListener('message', function(event) {
        const data = event.data;
        
        // Handle FRIENDS_LIST_UPDATE from parent
        if (data && data.type === 'FRIENDS_LIST_UPDATE') {
            const friends = data.payload?.friends || [];
            console.log('[Calls UI] Received FRIENDS_LIST_UPDATE:', friends.length, 'friends');
            // Always update if non-empty; preserve cache across refresh
            if (friends.length > 0) {
                const contacts = friends.map(function(friend) { return {
                    id: friend.id,
                    userId: friend.id,
                    name: friend.displayName || friend.username || friend.name || 'User',
                    displayName: friend.displayName || friend.username || friend.name || 'User',
                    username: friend.username || friend.name || 'User',
                    status: friend.status || (friend.isOnline ? 'online' : 'offline'),
                    isOnline: friend.isOnline || friend.status === 'online',
                    avatar: friend.avatar,
                    isPremium: friend.isPremium || false
                }; });
                UIState.contacts = contacts;
                window.__cachedCallContacts = contacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(contacts);
                } else if (window.callsUI && window.callsUI.renderContactsList) {
                    window.callsUI.renderContactsList(contacts);
                }
            }
        }
        
        // Handle CONTACTS_UPDATE
        if (data && data.type === 'CONTACTS_UPDATE') {
            const rawContacts = data.payload?.contacts || [];
            console.log('[Calls UI] Received CONTACTS_UPDATE:', rawContacts.length, 'contacts');
            // Normalize every contact so displayName/username are always present
            const contacts = rawContacts.map(function(c) { return {
                id:          c.id || c.userId,
                userId:      c.id || c.userId,
                name:        c.displayName || c.username || c.name || ('User #' + (c.id || c.userId)),
                displayName: c.displayName || c.username || c.name || ('User #' + (c.id || c.userId)),
                username:    c.username || c.name || c.displayName || '',
                status:      c.status || (c.isOnline ? 'online' : 'offline'),
                isOnline:    c.isOnline || c.status === 'online',
                avatar:      c.avatar || c.photoURL || '',
                isPremium:   c.isPremium || false
            }; });
            if (contacts.length > 0) {
                UIState.contacts = contacts;
                window.__cachedCallContacts = contacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(contacts);
                }
            } else if (window.__cachedCallContacts && window.__cachedCallContacts.length > 0) {
                // Restore from cache so friends don't vanish on refresh
                UIState.contacts = window.__cachedCallContacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(window.__cachedCallContacts);
                }
            }
        }
    });

    // Request friends list explicitly
    setTimeout(() => {
        if (window.parent && window.parent !== window) {
            console.log('[Calls UI] Requesting friends list from parent');
            window.parent.postMessage({
                type: 'GET_FRIENDS_LIST',
                source: 'calls',
                module: 'calls',
                timestamp: Date.now()
            }, '*');
        }
    }, 1000);
}

// Call this in initializeUISystem
setupFriendsListListener();
// ==================== SETTINGS SYNC LISTENER ====================
// Listen for settings changes broadcast by the parent and apply them
// to the local in-page toggles (emotional context, focus mode, etc.)
(function setupCallsSettingsListener() {
    function applyCallUISetting(section, key, value) {
        if (section === 'calls') {
            const map = {
                emotionalContext: 'emotionalContextToggle',
                callIntention: 'callIntentionToggle',
                inCallChat: 'inCallChatToggle',
                whiteboard: 'whiteboardToggle',
                polls: 'pollsToggle',
                sharedNotes: 'notesToggle',
                focusMode: 'focusModeToggle',
                liveReactions: 'liveReactionsToggle',
                emotionalContextEnabled: 'emotionalContextToggle',
                callIntentionEnabled: 'callIntentionToggle',
                inCallChatEnabled: 'inCallChatToggle',
                whiteboardEnabled: 'whiteboardToggle',
                pollsEnabled: 'pollsToggle',
                notesEnabled: 'notesToggle',
                focusModeEnabled: 'focusModeToggle',
                liveReactionsEnabled: 'liveReactionsToggle'
            };
            const elId = map[key];
            if (elId) {
                const el = document.getElementById(elId);
                if (el) el.checked = !!value;
            }
            if (key === 'videoQuality' || key === 'audioQuality' || key === 'voiceQuality') {
                window['__' + key] = value;
            }
        }
        if (section === 'appearance') {
            if (key === 'theme') {
                const t = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
                document.documentElement.setAttribute('data-theme', t);
                document.body.setAttribute('data-theme', t);
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
            if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
            if (key === 'compactMode') {
                document.documentElement.setAttribute('data-compact', value ? 'true' : 'false');
                document.body.classList.toggle('compact-mode', !!value);
            }
            if (key === 'animationsEnabled' || key === 'animations') {
                document.documentElement.setAttribute('data-animations', value ? 'true' : 'false');
                document.body.classList.toggle('no-animations', !value);
            }
        }
        if (section === 'notifications') {
            if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
            if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        }
    }

    window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'SETTING_CHANGED') {
            const { section, key, value } = data.payload || data;
            if (section && key !== undefined) applyCallUISetting(section, key, value);
        }
        if (data.type === 'SETTINGS_UPDATED') {
            const settings = (data.payload || data).settings || {};
            Object.entries(settings).forEach(function([sec, secVal]) {
                if (secVal && typeof secVal === 'object') {
                    Object.entries(secVal).forEach(function([k, v]) {
                        applyCallUISetting(sec, k, v);
                    });
                }
            });
        }
    });

    window.addEventListener('appSettingsReady', function() {
        if (window.AppSettings) {
            window.AppSettings.subscribe(function(settings, path, value) {
                try {
                    if (path && path !== '*') {
                        const parts = path.split('.');
                        const section = parts[0];
                        const key = parts.slice(1).join('.');
                        applyCallUISetting(section, key, value);
                    } else {
                        Object.entries(settings).forEach(function([sec, secVal]) {
                            if (secVal && typeof secVal === 'object') {
                                Object.entries(secVal).forEach(function([k, v]) {
                                    applyCallUISetting(sec, k, v);
                                });
                            }
                        });
                    }
                } catch(err) {
                    console.warn('[CallsUI] Settings subscription error:', err);
                }
            });
        }
    }, { once: true });

    window.addEventListener('settingChanged', function(e) {
        const { section, key, value } = e.detail || {};
        if (section && key !== undefined) applyCallUISetting(section, key, value);
    });
    window.addEventListener('settingsUpdated', function(e) {
        const settings = (e.detail || {}).settings || {};
        Object.entries(settings).forEach(function([sec, secVal]) {
            if (secVal && typeof secVal === 'object') {
                Object.entries(secVal).forEach(function([k, v]) {
                    applyCallUISetting(sec, k, v);
                });
            }
        });
    });
})();

// ==================== INITIALIZE UI SYSTEM ====================
async function initializeUISystem() {
    if (UIState.initialized) {
        if (DEBUG) {
            logOnce('info', 'UI system already initialized');
        }
        return { success: true, stages: UIState.renderStages };
    }
    
    if (DEBUG) {
        logOnce('info', 'Initializing UI system');
    }

    // Inject contact call-button styles
    if (!document.getElementById('kyn-contact-call-btn-styles')) {
        const s = document.createElement('style');
        s.id = 'kyn-contact-call-btn-styles';
        s.textContent = `
            .contact-item { display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; border-radius:10px; transition:background 0.15s; }
            .contact-item:hover { background: rgba(108,92,231,0.08); }
            .contact-call-actions { display:flex; gap:6px; margin-left:auto; flex-shrink:0; }
            .contact-audio-call-btn, .contact-video-call-btn {
                width:34px; height:34px; border-radius:50%; border:none; cursor:pointer;
                display:flex; align-items:center; justify-content:center;
                font-size:13px; transition:all 0.18s;
            }
            .contact-audio-call-btn { background:#10b981; color:#fff; }
            .contact-audio-call-btn:hover { background:#059669; transform:scale(1.1); }
            .contact-video-call-btn { background:#6c5ce7; color:#fff; }
            .contact-video-call-btn:hover { background:#5a4bd1; transform:scale(1.1); }
        `;
        document.head.appendChild(s);
    }
    
    cacheElements();
    await RenderingPipeline.execute();
    
    loadCachedCallHistory();
    
    if (coreInstance && !fallbackModeActive) {
        CoreIntegration.subscribeToCore();
    }
    
    if (window.ResponsiveEngine) {
        ResponsiveEngine.initialize();
    }
    
    UIState.renderStages.initial = true;
    UIState.initialized = true;
    
    setupOpenCallWithUserListener();
    setupMobileBackButton();
    
    window.dispatchEvent(new CustomEvent('calls.ui.ready', {
        detail: { timestamp: Date.now() }
    }));
    
    if (DEBUG) {
        logOnce('info', 'UI initialization complete', {
            renderStages: UIState.renderStages,
            renderCount: UIState.renderCount,
            elementsCached: UIState.cachedElements.size,
            handshake: { parentReady, sessionReady, handshakeComplete, inPassiveMode, coreReady, coreLifecycleState },
            session: { valid: isSessionValid(), invalid: _sessionInvalid },
            coreLifecycle: coreLifecycleState
        });
    }
    
    return {
        success: true,
        stages: UIState.renderStages,
        diagnostics: UIDiagnostics.getReport()
    };
}

// ==================== MESSAGE LISTENER FOR CALL HISTORY ====================
window.addEventListener('message', function(event) {
    const data = event.data;
    if (data && data.type === 'CALL_HISTORY_UPDATE') {
        const calls = data.payload?.calls || [];
        const isLoading = data.payload?.loading;
        const hasError = data.payload?.error;
        
        console.log('[Calls UI] CALL_HISTORY_UPDATE received:', calls.length, 'calls, loading:', isLoading, 'error:', hasError);

        if (calls && calls.length > 0) {
            UIState.callHistory = calls;
            window.__cachedCallHistory = calls;
        }
        
        const allCallsList = document.getElementById('allCallsList');
        if (!allCallsList) return;
        
        if (isLoading) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-spinner fa-spin"></i><p>Loading calls...</p></div>`;
            return;
        }
        
        if (hasError) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-exclamation-triangle"></i><p>Unable to load call history</p><p class="subtext">Please try again later</p></div>`;
            return;
        }
        
        if (!calls || calls.length === 0) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No recent calls</p><p class="subtext">Your call history will appear here</p></div>`;
            return;
        }
        
        allCallsList.innerHTML = '';
        
        calls.forEach(function(call) {
            const otherParticipant = (call.otherParticipants && call.otherParticipants[0]) || call.caller;
            const currentUserId = window.__CHILD_SESSION__?.userId;
            const otherId = call.callerId == currentUserId ? call.receiverId : call.callerId;
            const contactMatch = (UIState.contacts || window.__cachedCallContacts || []).find(c => c.id == otherId || c.userId == otherId);
            const name = (otherParticipant && (otherParticipant.displayName || otherParticipant.username))
                || (contactMatch && (contactMatch.displayName || contactMatch.username || contactMatch.name))
                || (call.callerInfo?.username) || (call.calleeInfo?.username)
                || ('User #' + (otherId || '?'));
            const initials = name.split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().substring(0, 2);
            const isOutgoing = call.callerId == currentUserId;
            // Missed ONLY applies to receiver (incoming side); outgoing unanswered = "No Answer"
            const isMissed = call.status === 'missed' && !isOutgoing;
            const isNoAnswer = call.status === 'missed' && isOutgoing;
            const direction = isOutgoing ? 'outgoing' : (isMissed ? 'missed' : 'incoming');
            const iconClass = call.type === 'video' ? 'fa-video' : 'fa-phone';
            const statusIconClass = isMissed ? 'fa-phone-slash' : isNoAnswer ? 'fa-phone-slash' : (isOutgoing ? 'fa-arrow-up' : 'fa-arrow-down');
            
            const item = document.createElement('div');
            item.className = 'call-history-item ' + direction;
            
            let timeDisplay = '';
            try { timeDisplay = new Date(call.startedAt).toLocaleString(); } catch(e) { timeDisplay = ''; }
            const directionLabel = isMissed ? 'Missed' : isNoAnswer ? 'No Answer' : (isOutgoing ? 'Outgoing' : 'Incoming');
            
            item.innerHTML = `
                <div class="call-avatar" style="background-color: #6c5ce7">
                    <span>${escapeHtmlForCall(initials)}</span>
                </div>
                <div class="call-info">
                    <div class="call-name">
                        ${escapeHtmlForCall(name)}
                        <span class="call-status-icon ${escapeHtmlForCall(direction)}" title="${escapeHtmlForCall(directionLabel)}" style="margin-left:6px;font-size:11px">
                            <i class="fas ${statusIconClass}"></i>
                        </span>
                    </div>
                    <div class="call-details">
                        <i class="fas ${iconClass}"></i>
                        <span>${call.type === 'video' ? 'Video call' : 'Voice call'}</span>
                        <span>•</span>
                        <span>${call.displayDuration || '0:00'}</span>
                    </div>
                    <div class="call-time">${escapeHtmlForCall(timeDisplay)}</div>
                </div>
                <button class="call-action-btn" data-user-id="${escapeHtmlForCall(String(otherParticipant?.id || otherId || ''))}" data-user-name="${escapeHtmlForCall(name)}" data-call-type="${call.type || 'voice'}" title="Call back">
                    <i class="fas fa-phone"></i>
                </button>
            `;
            allCallsList.appendChild(item);
        });
        
        document.querySelectorAll('.call-action-btn').forEach(function(btn) {
            btn.removeEventListener('click', handleCallActionClick);
            btn.addEventListener('click', function(e) {
                window.__pendingCallReturnTo = 'calls';
                window.__pendingCallChatUserId = null;
                handleCallActionClick.call(btn, e);
            });
        });
    }
});

// ==================== HELPER FUNCTIONS ====================
function escapeHtmlForCall(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function handleCallActionClick(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    var btn = this;
    var userId = btn.dataset && btn.dataset.userId;
    var userName = (btn.dataset && btn.dataset.userName) || 'User';
    var callType = (btn.dataset && btn.dataset.callType) || 'voice';

    if (!userId) {
        console.warn('[Calls UI] handleCallActionClick: missing data-user-id on button', btn);
        return;
    }

    console.log('[Calls UI] Call-back triggered:', { userId: userId, userName: userName, callType: callType });

    if (typeof startCallWithUser === 'function') {
        startCallWithUser(userId, userName, callType);
    } else if (window.callCore && typeof window.callCore.startCall === 'function') {
        window.callCore.startCall(userId, callType);
    } else {
        try {
            window.parent.postMessage({
                type: 'INITIATE_CALL',
                payload: { userId: userId, userName: userName, callType: callType },
                source: 'calls-iframe',
                timestamp: Date.now()
            }, '*');
        } catch (err) {
            console.error('[Calls UI] handleCallActionClick: could not initiate call', err);
        }
    }
}

// ==================== EXPORTS ====================
const safeBind = (fn, context) => {
    if (typeof fn === 'function') {
        return fn.bind(context);
    }
    return function() {};
};

const PanelHandlers = UIPanelHandlers;
const openParticipantsPanel = safeBind(UIPanelHandlers.openParticipantsPanel, UIPanelHandlers);
const openChatPanel = safeBind(UIPanelHandlers.openChatPanel, UIPanelHandlers);
const openWhiteboardPanel = safeBind(UIPanelHandlers.openWhiteboardPanel, UIPanelHandlers);
const openNotesPanel = safeBind(UIPanelHandlers.openNotesPanel, UIPanelHandlers);
const openPollsPanel = safeBind(UIPanelHandlers.openPollsPanel, UIPanelHandlers);
const openRelationshipPanel = safeBind(UIPanelHandlers.openRelationshipPanel, UIPanelHandlers);
const createParticipantsPanel = safeBind(UIPanelHandlers.createParticipantsPanel, UIPanelHandlers);
const createChatPanel = safeBind(UIPanelHandlers.createChatPanel, UIPanelHandlers);
const createWhiteboardPanel = safeBind(UIPanelHandlers.createWhiteboardPanel, UIPanelHandlers);
const createNotesPanel = safeBind(UIPanelHandlers.createNotesPanel, UIPanelHandlers);
const createPollsPanel = safeBind(UIPanelHandlers.createPollsPanel, UIPanelHandlers);
const createRelationshipPanel = safeBind(UIPanelHandlers.createRelationshipPanel, UIPanelHandlers);

const EventHandlers = UIEventHandlers;
const toggleMenuDots = safeBind(UIEventHandlers.toggleMenuDots, UIEventHandlers);
const closeMenuDots = safeBind(UIEventHandlers.closeMenuDots, UIEventHandlers);
const openNewCallModal = safeBind(UIEventHandlers.openNewCallModal, UIEventHandlers);
const closeNewCallModal = safeBind(UIEventHandlers.closeNewCallModal, UIEventHandlers);
const searchContacts = safeBind(UIEventHandlers.searchContacts, UIEventHandlers);
const searchGroupContacts = safeBind(UIEventHandlers.searchGroupContacts, UIEventHandlers);
const selectGroupOption = safeBind(UIEventHandlers.selectGroupOption, UIEventHandlers);

const startVoiceCall = () => UIEventHandlers.startCallGeneric('voice');
const startVideoCall = () => UIEventHandlers.startCallGeneric('video');

const startGroupCall = safeBind(UIEventHandlers.startGroupCall, UIEventHandlers);
const generateVoiceCallLink = safeBind(UIEventHandlers.generateVoiceCallLink, UIEventHandlers);
const generateVideoCallLink = safeBind(UIEventHandlers.generateVideoCallLink, UIEventHandlers);
const copyCallLink = safeBind(UIEventHandlers.copyCallLink, UIEventHandlers);
const shareCallLink = safeBind(UIEventHandlers.shareCallLink, UIEventHandlers);
const toggleMute = safeBind(UIEventHandlers.toggleMute, UIEventHandlers);
const toggleVideo = safeBind(UIEventHandlers.toggleVideo, UIEventHandlers);
const toggleScreenShare = safeBind(UIEventHandlers.toggleScreenShare, UIEventHandlers);
const toggleSpeaker = safeBind(UIEventHandlers.toggleSpeaker, UIEventHandlers);
const openMoodSelectionModal = safeBind(UIEventHandlers.openMoodSelectionModal, UIEventHandlers);
const closeMoodSelectionModal = safeBind(UIEventHandlers.closeMoodSelectionModal, UIEventHandlers);
const setMood = safeBind(UIEventHandlers.setMood, UIEventHandlers);
const openIntentionSelectionModal = safeBind(UIEventHandlers.openIntentionSelectionModal, UIEventHandlers);
const closeIntentionSelectionModal = safeBind(UIEventHandlers.closeIntentionSelectionModal, UIEventHandlers);
const setIntention = safeBind(UIEventHandlers.setIntention, UIEventHandlers);
const toggleFocusMode = safeBind(UIEventHandlers.toggleFocusMode, UIEventHandlers);
const enableFocusMode = safeBind(UIEventHandlers.enableFocusMode, UIEventHandlers);
const disableFocusMode = safeBind(UIEventHandlers.disableFocusMode, UIEventHandlers);
const endCall = safeBind(UIEventHandlers.endCall, UIEventHandlers);
const skipPrivateNotes = safeBind(UIEventHandlers.skipPrivateNotes, UIEventHandlers);
const savePrivateNotes = safeBind(UIEventHandlers.savePrivateNotes, UIEventHandlers);
const showCallSummary = safeBind(UIEventHandlers.showCallSummary, UIEventHandlers);
const closeCallSummary = safeBind(UIEventHandlers.closeCallSummary, UIEventHandlers);
const declineIncomingCall = safeBind(UIEventHandlers.declineIncomingCall, UIEventHandlers);
const acceptIncomingCall = safeBind(UIEventHandlers.acceptIncomingCall, UIEventHandlers);
const acceptIncomingCallAsVideo = safeBind(UIEventHandlers.acceptIncomingCallAsVideo, UIEventHandlers);
const switchCallCategory = safeBind(UIEventHandlers.switchCallCategory, UIEventHandlers);
const switchNewCallTab = safeBind(UIEventHandlers.switchNewCallTab, UIEventHandlers);
const toggleSettingsPanel = safeBind(UIEventHandlers.toggleSettingsPanel, UIEventHandlers);
const openPaymentModal = safeBind(UIEventHandlers.openPaymentModal, UIEventHandlers);
const closePaymentModal = safeBind(UIEventHandlers.closePaymentModal, UIEventHandlers);
const selectPaymentOption = safeBind(UIEventHandlers.selectPaymentOption, UIEventHandlers);
const processPayment = safeBind(UIEventHandlers.processPayment, UIEventHandlers);
const closePremiumLimitModal = safeBind(UIEventHandlers.closePremiumLimitModal, UIEventHandlers);
const sendReaction = safeBind(UIEventHandlers.sendReaction, UIEventHandlers);
const handleLogout = safeBind(UIEventHandlers.handleLogout, UIEventHandlers);

const requestMediaPermissionsFnExport = requestMediaPermissionsFn;

const EventSystemExport = EventSystem;
const RenderingPipelineExport = RenderingPipeline;
const CoreIntegrationExport = CoreIntegration;
const ResponsiveEngineExport = ResponsiveEngine;
const SecuritySanitizerExport = SecuritySanitizer;
const ViewHistoryExport = ViewHistory;

const UIStateExport = UIState;
const UIDiagnosticsExport = UIDiagnostics;
const UILoggerExport = UILogger;
const UIErrorBoundaryExport = UIErrorBoundary;

const elementsExport = elements;

const handleContactClick = function(e) {
    if (e.target.closest('.contact-checkbox')) return;
    const checkbox = this.querySelector('.contact-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            this.classList.add('selected');
        } else {
            this.classList.remove('selected');
        }
    }
};

window.callsUI = {
    initializeUISystem,
    cacheElements,
    PanelHandlers,
    openParticipantsPanel,
    openChatPanel,
    openWhiteboardPanel,
    openNotesPanel,
    openPollsPanel,
    openRelationshipPanel,
    createParticipantsPanel,
    createChatPanel,
    createWhiteboardPanel,
    createNotesPanel,
    createPollsPanel,
    createRelationshipPanel,
    EventHandlers,
    toggleMenuDots,
    closeMenuDots,
    openNewCallModal,
    closeNewCallModal,
    searchContacts,
    searchGroupContacts,
    selectGroupOption,
    startVoiceCall,
    startVideoCall,
    startGroupCall,
    generateVoiceCallLink,
    generateVideoCallLink,
    copyCallLink,
    shareCallLink,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleSpeaker,
    openMoodSelectionModal,
    closeMoodSelectionModal,
    setMood,
    openIntentionSelectionModal,
    closeIntentionSelectionModal,
    setIntention,
    toggleFocusMode,
    enableFocusMode,
    disableFocusMode,
    endCall,
    skipPrivateNotes,
    savePrivateNotes,
    showCallSummary,
    closeCallSummary,
    declineIncomingCall,
    acceptIncomingCall,
    acceptIncomingCallAsVideo,
    switchCallCategory,
    switchNewCallTab,
    toggleSettingsPanel,
    openPaymentModal,
    closePaymentModal,
    selectPaymentOption,
    processPayment,
    closePremiumLimitModal,
    sendReaction,
    handleLogout,
    requestMediaPermissionsFn: requestMediaPermissionsFnExport,
    EventSystem: EventSystemExport,
    RenderingPipeline: RenderingPipelineExport,
    CoreIntegration: CoreIntegrationExport,
    ResponsiveEngine: ResponsiveEngineExport,
    SecuritySanitizer: SecuritySanitizerExport,
    ViewHistory: ViewHistoryExport,
    UIState: UIStateExport,
    UIDiagnostics: UIDiagnosticsExport,
    UILogger: UILoggerExport,
    UIErrorBoundary: UIErrorBoundaryExport,
    elements: elementsExport,
    showNotification,
    getSessionCache: () => window.__CHILD_SESSION__,
    getHandshakeStatus: () => ({
        parentReady,
        sessionReady,
        handshakeComplete,
        fallbackModeActive,
        inPassiveMode,
        coreReady,
        coreLifecycleState,
        sessionInvalid: _sessionInvalid
    }),
    isSessionValid,
    assertCoreActive,
    getDiagnostics: () => UIDiagnostics.getReport(),
    getUIState: () => ({ ...UIState }),
    getCoreInstance: () => coreInstance,
    isCoreActive: () => {
        if (coreInstance && coreInstance.getLifecycleState) {
            return coreInstance.getLifecycleState() === 'ACTIVE';
        }
        return coreReady && parentReady;
    },
    getCoreLifecycleState: () => coreLifecycleState,
    isInCall: () => {
        if (coreInstance && coreInstance.isInCall) {
            return coreInstance.isInCall();
        }
        const activeStates = ['connected', 'ongoing', 'active', 'call_ready', 'in_call', 'incoming', 'ringing', 'initiating'];
        return UIState.callActive === true || activeStates.includes(UIState.callState);
    },
    refreshSyncIndicator: () => {
        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
            RenderingPipeline.updateSyncIndicator();
        }
    },
    getPendingCall: () => ({ ...pendingCall }),
    initiateCallWithUser: (userId, userName, callType = 'voice') => {
        console.log('[Calls UI] initiateCallWithUser called:', { userId, userName, callType });
        if (!userId) {
            console.error('[Calls UI] Cannot initiate call: No userId');
            return;
        }
        const eventObj = new CustomEvent('OPEN_CALL_WITH_USER', {
            detail: { userId, userName, callType, source: 'manual' }
        });
        window.dispatchEvent(eventObj);
    }
};

// ==================== BOOTSTRAP ====================
coreInitializationStartTime = Date.now();

setupCoreReadyListener();

if (detectExistingCore()) {
    if (DEBUG) {
        logOnce('success', 'Core already available, initializing UI immediately');
    }
    initializeUISystem().catch(error => {
        if (DEBUG) {
            logOnce('error', 'Auto-initialization failed', error);
        }
        RenderingPipeline.skeleton();
    });
} else {
    if (DEBUG) {
        logOnce('info', 'Core not immediately available, showing skeleton and waiting for events');
    }
    RenderingPipeline.skeleton();
    waitForCoreReady().then((ready) => {
        if (ready) {
            if (DEBUG) {
                logOnce('success', 'Core became ready after ' + (Date.now() - coreInitializationStartTime) + 'ms, initializing full UI');
            }
            performFullInitialization();
        } else {
            logOnce('error', 'Core ready promise resolved false - this should not happen');
            RenderingPipeline.initialRender().catch(() => {});
        }
    });
}
})();
// ══════════════════════════════════════════════════════════════════════════════
// ██  CallOverlayManager — 3-state floating overlay system                   ██
// ██  States: "idle" | "calling" | "in-call"                                 ██
// ██  NEVER hides sidebar. NEVER replaces main content.                      ██
// ██  Always renders as a floating panel on top of existing layout.          ██
// ══════════════════════════════════════════════════════════════════════════════
(function() {
    'use strict';

    // ── Internal state ──────────────────────────────────────────────────────
    let _state     = 'idle';         // "idle" | "calling" | "in-call"
    let _callInfo  = null;           // { userName, userId, callType, status, userAvatar }
    let _minimized = false;
    let _expanded  = false;
    let _durationTimer = null;
    let _durationSecs  = 0;
    let _initialized   = false;

    // ── Overlay element references (resolved lazily) ─────────────────────
    function _el(id) { return document.getElementById(id); }

    // ── Theme detection ───────────────────────────────────────────────────
    function _isDark() {
        return document.documentElement.classList.contains('dark') ||
               document.body.classList.contains('dark-mode') ||
               document.body.classList.contains('theme-dark') ||
               document.documentElement.getAttribute('data-theme') === 'dark' ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // ── Ensure sidebar & main content ALWAYS remain visible ──────────────
    function _enforceLayoutIntegrity() {
        const sidebar = _el('sidebar') || document.querySelector('.sidebar');
        const appContainer = _el('appContainer') || document.querySelector('.app-container');

        if (sidebar) {
            sidebar.style.removeProperty('display');
            sidebar.style.removeProperty('visibility');
            sidebar.style.removeProperty('opacity');
            sidebar.style.display = 'flex';
        }
        if (appContainer) {
            appContainer.style.display      = 'flex';
            appContainer.style.visibility   = 'visible';
            appContainer.style.opacity      = '1';
            appContainer.style.pointerEvents = 'auto';
        }

        // FIX: Only hide callContainer if no call screen is currently active.
        // Previously this always removed .active — fighting showCallingScreen.
        const callContainer = _el('callContainer') || document.querySelector('.call-container');
        if (callContainer) {
            const callingScreen = document.getElementById('callingScreen');
            const inCallScreen  = document.getElementById('inCallScreen');
            const callScreenActive = (callingScreen && callingScreen.classList.contains('active')) ||
                                     (inCallScreen  && inCallScreen.classList.contains('active'));
            if (!callScreenActive) {
                callContainer.classList.remove('active');
                callContainer.style.display = 'none';
            }
        }
    }

    // ── Build minimized bar HTML ─────────────────────────────────────────
    function _buildMinimizedBar(info) {
        const name = _sanitizeText(info.userName || 'User');
        const status = _sanitizeText(info.status || 'Calling...');
        const isInCall = _state === 'in-call';
        return `
            <div id="comMinimizedBar" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:12px 14px; cursor:pointer;
                background:rgba(0,0,0,0.35);
            " title="Click to expand">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="
                        width:36px;height:36px;border-radius:50%;
                        background:linear-gradient(135deg,#1a7fe0,#7b2ff7);
                        display:flex;align-items:center;justify-content:center;
                        font-size:14px;font-weight:700;color:#fff;
                        flex-shrink:0; overflow:hidden;
                    ">${info.userAvatar || _initial(name)}</div>
                    <div>
                        <div style="color:#fff;font-weight:600;font-size:14px;line-height:1.2;">${name}</div>
                        <div style="color:rgba(255,255,255,0.70);font-size:11px;">${isInCall ? '<span id="comMiniDuration">--:--</span>' : status}</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    ${isInCall ? `
                    <button id="comMiniMuteBtn" title="Mute" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:rgba(255,255,255,0.15);color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    "><i class="fas fa-microphone"></i></button>
                    ` : ''}
                    <button id="comExpandBtn" title="Expand" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:rgba(255,255,255,0.15);color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    "><i class="fas fa-expand-alt"></i></button>
                    <button id="comEndBtn" title="End Call" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:#e11d1d;color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                        box-shadow:0 2px 8px rgba(225,29,29,0.5);
                    "><i class="fas fa-phone-slash"></i></button>
                </div>
            </div>`;
    }

    // ── Sanitize user-generated text (no XSS) ────────────────────────────
    function _sanitizeText(str) {
        const d = document.createElement('div');
        d.textContent = String(str || '');
        return d.innerHTML;
    }

    function _initial(name) {
        return _sanitizeText((name || 'U').charAt(0).toUpperCase());
    }

    // ── Format duration MM:SS ─────────────────────────────────────────────
    function _formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    // ── Start duration counter ────────────────────────────────────────────
    function _startDurationTimer() {
        _stopDurationTimer();
        _durationSecs = 0;
        _durationTimer = setInterval(() => {
            _durationSecs++;
            const fmt = _formatDuration(_durationSecs);
            // Update both full panel and mini bar duration
            const full = document.getElementById('comCallDuration');
            const mini = document.getElementById('comMiniDuration');
            if (full) full.textContent = fmt;
            if (mini) mini.textContent = fmt;
        }, 1000);
    }

    function _stopDurationTimer() {
        if (_durationTimer) { clearInterval(_durationTimer); _durationTimer = null; }
        _durationSecs = 0;
    }

    // ── Dismiss animation + hide ─────────────────────────────────────────
    function _dismissOverlay(overlayEl, cb) {
        if (!overlayEl) { if (cb) cb(); return; }
        overlayEl.classList.add('dismissing');
        overlayEl.classList.remove('active');
        setTimeout(() => {
            overlayEl.classList.remove('dismissing');
            overlayEl.style.display = 'none';
            if (cb) cb();
        }, 240);
    }

    // ── Wire up the callingCollapseBtn (minimize) ─────────────────────────
    function _wireNativeCollapseBtn() {
        const btn = _el('callingCollapseBtn');
        if (btn && !btn._comWired) {
            btn._comWired = true;
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                CallOverlayManager.minimize();
            });
        }
    }

    // ── Wire up the cancelCallBtn / declineCallBtn ────────────────────────
    function _wireNativeEndBtns() {
        const cancelBtn  = _el('cancelCallBtn');
        const declineBtn = _el('declineCallBtn');
        const acceptBtn  = _el('acceptCallBtn');
        const acceptVidBtn = _el('acceptVideoCallBtn');

        if (cancelBtn && !cancelBtn._comWired) {
            cancelBtn._comWired = true;
            cancelBtn.addEventListener('click', function() {
                CallOverlayManager.endCall();
            });
        }
        if (declineBtn && !declineBtn._comWired) {
            declineBtn._comWired = true;
            declineBtn.addEventListener('click', function() {
                CallOverlayManager.endCall();
            });
        }
        if (acceptBtn && !acceptBtn._comWired) {
            acceptBtn._comWired = true;
            acceptBtn.addEventListener('click', function() {
                // transition to in-call
                if (_callInfo) {
                    CallOverlayManager.setState('in-call', { ..._callInfo, status: 'Connected' });
                }
                _dismissOverlay(_el('incomingCallModal'));
            });
        }
        if (acceptVidBtn && !acceptVidBtn._comWired) {
            acceptVidBtn._comWired = true;
            acceptVidBtn.addEventListener('click', function() {
                if (_callInfo) {
                    CallOverlayManager.setState('in-call', { ..._callInfo, callType: 'video', status: 'Connected' });
                }
                _dismissOverlay(_el('incomingCallModal'));
            });
        }
    }

    // ── Wire in-call control buttons ─────────────────────────────────────
    function _wireInCallControls() {
        const muteBtn    = _el('callingMuteBtn');
        const speakerBtn = _el('callingSpeakerBtn');
        const videoBtn   = _el('callingVideoToggleBtn');

        if (muteBtn && !muteBtn._comWired) {
            muteBtn._comWired = true;
            muteBtn.addEventListener('click', function() {
                const isMuted = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isMuted ? 'fas fa-microphone' : 'fas fa-microphone-slash';
                if (window.callCore && window.callCore.toggleMute) window.callCore.toggleMute();
            });
        }
        if (speakerBtn && !speakerBtn._comWired) {
            speakerBtn._comWired = true;
            speakerBtn.addEventListener('click', function() {
                const isOn = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isOn ? 'fas fa-volume-mute' : 'fas fa-volume-up';
                if (window.callCore && window.callCore.toggleSpeaker) window.callCore.toggleSpeaker();
            });
        }
        if (videoBtn && !videoBtn._comWired) {
            videoBtn._comWired = true;
            videoBtn.addEventListener('click', function() {
                const isOff = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isOff ? 'fas fa-video-slash' : 'fas fa-video';
                if (window.callCore && window.callCore.toggleVideo) window.callCore.toggleVideo();
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════════
    const CallOverlayManager = {

        // ── Initialize (idempotent) ────────────────────────────────────────
        initialize() {
            if (_initialized) return;
            _initialized = true;
            _enforceLayoutIntegrity();
            _wireNativeCollapseBtn();
            _wireNativeEndBtns();
            _wireInCallControls();
            console.log('[CallOverlayManager] Initialized. State: idle');
        },

        // ── Get current state ──────────────────────────────────────────────
        getState()   { return _state; },
        isCalling()  { return _state === 'calling'; },
        isInCall()   { return _state === 'in-call'; },
        isIdle()     { return _state === 'idle'; },

        // ── Transition to a new state ──────────────────────────────────────
        setState(newState, callInfo) {
            _enforceLayoutIntegrity(); // Always enforce before any state change

            if (newState === 'idle') {
                this.endCall();
                return;
            }

            _state    = newState;
            _callInfo = callInfo || _callInfo || {};
            _minimized = false;
            _expanded  = false;

            const overlay = _el('callingOverlay');
            const incomingModal = _el('incomingCallModal');

            if (newState === 'calling') {
                // Populate callingOverlay with user info
                if (overlay) {
                    // Update name
                    const nameEl = _el('callingName');
                    if (nameEl) nameEl.textContent = _callInfo.userName || 'User';

                    // Update status
                    const statusEl = _el('callingStatus');
                    if (statusEl) statusEl.textContent = _callInfo.status || 'Calling…';

                    // Update type
                    const typeEl = _el('callingType');
                    if (typeEl) typeEl.textContent = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';

                    // Update avatar
                    const avatarEl = _el('callingAvatar');
                    if (avatarEl) {
                        avatarEl.innerHTML = _callInfo.userAvatar ||
                            `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                    }

                    // Remove expanded/minimized classes
                    overlay.classList.remove('call-expanded', 'call-minimized');

                    // Show overlay
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => { overlay.classList.add('active'); });
                }

                // Ensure incoming modal is hidden
                if (incomingModal) {
                    incomingModal.classList.remove('active');
                    incomingModal.style.display = 'none';
                }

                _wireNativeCollapseBtn();
                _wireNativeEndBtns();
                _enforceLayoutIntegrity();

            } else if (newState === 'in-call') {
                // Close calling overlay, show expanded in-call panel
                if (incomingModal) {
                    _dismissOverlay(incomingModal);
                }

                if (overlay) {
                    const nameEl   = _el('callingName');
                    const statusEl = _el('callingStatus');
                    const typeEl   = _el('callingType');
                    const avatarEl = _el('callingAvatar');

                    if (nameEl)   nameEl.textContent   = _callInfo.userName || 'User';
                    if (statusEl) statusEl.textContent  = _callInfo.status   || 'Connected';
                    if (typeEl)   typeEl.textContent    = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
                    if (avatarEl) {
                        avatarEl.innerHTML = _callInfo.userAvatar ||
                            `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                    }

                    overlay.classList.add('call-expanded');
                    overlay.classList.remove('call-minimized');
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => { overlay.classList.add('active'); });
                }

                _startDurationTimer();
                _wireInCallControls();
                _enforceLayoutIntegrity();
            }
        },

        // ── Start a new call (CALLING state) ──────────────────────────────
        startCall(callInfo) {
            this.initialize();
            this.setState('calling', callInfo);
        },

        // ── Answer call (transition to IN-CALL) ───────────────────────────
        answerCall(callInfo) {
            this.initialize();
            this.setState('in-call', callInfo || _callInfo);
        },

        // ── Show incoming call panel ───────────────────────────────────────
        showIncoming(callInfo) {
            this.initialize();
            _callInfo = callInfo || {};
            _state    = 'calling'; // incoming is still "calling" state logically

            const modal = _el('incomingCallModal');
            if (modal) {
                const nameEl   = _el('incomingCallName');
                const avatarEl = _el('incomingCallAvatar');
                const typeEl   = _el('incomingCallType');

                if (nameEl)   nameEl.textContent   = _callInfo.userName || 'Incoming Call';
                if (typeEl)   typeEl.textContent    = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
                if (avatarEl) {
                    avatarEl.innerHTML = _callInfo.userAvatar ||
                        `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                }

                modal.style.display = 'flex';
                requestAnimationFrame(() => { modal.classList.add('active'); });
            }

            _wireNativeEndBtns();
            _enforceLayoutIntegrity();
        },

        // ── Minimize to compact bar ────────────────────────────────────────
        minimize() {
            if (_state === 'idle') return;
            _minimized = true;

            const overlay = _el('callingOverlay');
            if (overlay) {
                overlay.classList.add('call-minimized');
                overlay.classList.remove('call-expanded');

                // Wire the minimized bar click to expand
                setTimeout(() => {
                    const bar = document.getElementById('comMinimizedBar');
                    if (bar && !bar._wired) {
                        bar._wired = true;
                        bar.addEventListener('click', (e) => {
                            if (!e.target.closest('button')) {
                                CallOverlayManager.expand();
                            }
                        });
                    }
                    const expandBtn = document.getElementById('comExpandBtn');
                    if (expandBtn && !expandBtn._wired) {
                        expandBtn._wired = true;
                        expandBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            CallOverlayManager.expand();
                        });
                    }
                    const endBtn = document.getElementById('comEndBtn');
                    if (endBtn && !endBtn._wired) {
                        endBtn._wired = true;
                        endBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            CallOverlayManager.endCall();
                        });
                    }
                }, 50);
            }
        },

        // ── Expand from minimized ─────────────────────────────────────────
        expand() {
            _minimized = false;
            const overlay = _el('callingOverlay');
            if (overlay) {
                overlay.classList.remove('call-minimized');
                if (_state === 'in-call') overlay.classList.add('call-expanded');
            }
        },

        // ── End call — return to IDLE ──────────────────────────────────────
        endCall() {
            _stopDurationTimer();

            const overlay      = _el('callingOverlay');
            const incomingModal = _el('incomingCallModal');

            if (overlay)       _dismissOverlay(overlay);
            if (incomingModal) _dismissOverlay(incomingModal);

            _state     = 'idle';
            _callInfo  = null;
            _minimized = false;
            _expanded  = false;

            _enforceLayoutIntegrity();

            // Notify core
            if (window.callCore && window.callCore.endCall) {
                try { window.callCore.endCall(); } catch(e) {}
            }

            console.log('[CallOverlayManager] Call ended. State: idle');
        },

        // ── Update status text in current state ────────────────────────────
        updateStatus(statusText) {
            if (!_callInfo) return;
            _callInfo.status = statusText;
            const statusEl = _el('callingStatus');
            if (statusEl) statusEl.textContent = statusText;
        }
    };

    // ── Register globally ────────────────────────────────────────────────
    window.CallOverlayManager = CallOverlayManager;

    // ── Auto-initialize on DOM ready ─────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CallOverlayManager.initialize());
    } else {
        CallOverlayManager.initialize();
    }

    // ── Listen for call state events from callCore ───────────────────────
    window.addEventListener('message', function(event) {
        if (!event.data) return;
        const { type, payload } = event.data;

        switch (type) {
            case 'CALL_CONNECTED':
            case 'CALL_ANSWERED':
            case 'call:connected':
                CallOverlayManager.setState('in-call', {
                    ...(_callInfo || {}),
                    ...(payload || {}),
                    status: 'Connected'
                });
                break;

            case 'CALL_ENDED':
            case 'call:ended':
            case 'CALL_REJECTED':
            case 'call:rejected':
                CallOverlayManager.endCall();
                break;

            case 'CALL_RINGING':
            case 'call:ringing':
                CallOverlayManager.updateStatus('Ringing...');
                break;

            case 'CALL_INCOMING':
            case 'call:incoming': {
                const info = payload || {};
                CallOverlayManager.showIncoming({
                    userName:   info.callerName || info.userName || 'Incoming Call',
                    userId:     info.callerId   || info.userId,
                    callType:   info.callType   || info.type || 'voice',
                    status:     'Incoming call'
                });
                break;
            }
        }
    });

    // ── Listen for custom DOM events ─────────────────────────────────────
    window.addEventListener('callCore:stateChange', function(e) {
        const detail = e.detail || {};
        const state  = detail.state || detail.callState || '';
        if (state === 'idle' || state === 'ended') {
            CallOverlayManager.endCall();
        } else if (state === 'connected' || state === 'active' || state === 'in_call') {
            CallOverlayManager.setState('in-call', _callInfo);
        }
    });

    console.log('[CallOverlayManager] Module loaded. Global: window.CallOverlayManager ✓');
})();
// ==================== CALL-CONTAINER GUARD (IDLE-ONLY SUPPRESSION) ====================
// #callContainer holds the call screens (idle/calling/in-call).
// During IDLE: hide it so only the sidebar call-history list shows (original behavior).
// During CALLING/IN-CALL: allow it — but we use the fullscreen #callOverlay instead,
// so #callContainer doesn't actually need to be visible during calls either.
// The key fix: do NOT suppress it with a MutationObserver that blocks the calling screen.
(function installCallContainerGuard() {
    'use strict';

    function suppressCallContainer() {
        var cc = document.getElementById('callContainer');
        if (!cc) return;
        // Only hide if no call is currently active
        if (!window.UIState || !window.UIState.callActive) {
            cc.classList.remove('active');
            cc.style.setProperty('display', 'none', 'important');
        }
    }

    if (document.readyState !== 'loading') {
        suppressCallContainer();
    } else {
        document.addEventListener('DOMContentLoaded', suppressCallContainer);
    }

    // Lightweight observer: only suppress in idle state, allow during active calls
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.type === 'attributes' && m.target.id === 'callContainer') {
                // Allow visibility changes when a call is active
                if (window.UIState && window.UIState.callActive) return;
                if (window.__callActive) return;
                // In idle: keep hidden
                if (m.attributeName === 'class' && m.target.classList.contains('active')) {
                    m.target.classList.remove('active');
                    m.target.style.setProperty('display', 'none', 'important');
                }
                if (m.attributeName === 'style') {
                    var d = m.target.style.display;
                    if (d && d !== 'none') {
                        m.target.style.setProperty('display', 'none', 'important');
                    }
                }
            }
        });
    });

    function startObserver() {
        var cc = document.getElementById('callContainer');
        if (cc) {
            observer.observe(cc, { attributes: true, attributeFilter: ['class', 'style'] });
        } else {
            setTimeout(startObserver, 300);
        }
    }

    if (document.readyState !== 'loading') {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

    console.log('[calls-ui] callContainer dark-screen guard installed.');
})();

// ── CALLS_IFRAME_READY handshake ─────────────────────────────────────────────
// Signal to the parent (chat.html) that this iframe has fully loaded and is
// ready to receive CALL_INCOMING postMessages.  Must fire after all scripts run.
(function signalIframeReady() {
    function _signal() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'CALLS_IFRAME_READY', timestamp: Date.now() }, '*');
            console.log('[calls-ui] ✅ CALLS_IFRAME_READY sent to parent');
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _signal);
    } else {
        _signal();
    }
})();