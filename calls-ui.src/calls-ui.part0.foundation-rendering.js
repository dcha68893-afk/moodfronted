/**
 * PART 1/3 — FOUNDATION & RENDERING
 * UIEventHandlers forward-reference guard, early OPEN_CALL_WITH_USER listener, UI state definition, call history updates/loading, module initialization + event-driven core readiness, DOM elements cache, UI logger/error boundary/diagnostics, security sanitizer, and the rendering pipeline.
 *
 * SOURCE FRAGMENT of calls-ui.js (shares one scope with the other 2 parts).
 * Concatenate in numeric order (part0, part1, part2) via build.js before serving.
 * Do NOT <script src> this file on its own.
 */
// calls-ui.js
// ==================== RESILIENT UI CONTROLLER - DETERMINISTIC LIFECYCLE ====================
// Version: 5.2.1 - FIXED: createNotification HTML sanitizer, call history refresh
// Dependencies: calls-core.js v9.0.1
// =======================================================================================

// ── UIEventHandlers forward-reference guard ──────────────────────────────────
// UIEventHandlers is defined later in this file (line ~6774) but referenced
// earlier (line ~889). This proxy ensures early usages never throw ReferenceError.
// Once the real UIEventHandlers is defined it takes over via window assignment.
if (typeof UIEventHandlers === 'undefined') {
    var UIEventHandlers = new Proxy({}, {
        get: function(target, prop) {
            // Return a no-op function for any method not yet defined
            if (typeof target[prop] !== 'undefined') return target[prop];
            return function() {
                // Once the real object is ready, delegate to it
                var real = window.__UIEventHandlersReal;
                if (real && typeof real[prop] === 'function') {
                    return real[prop].apply(real, arguments);
                }
            };
        },
        set: function(target, prop, value) {
            target[prop] = value;
            return true;
        }
    });
}

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

function normalizeParticipantId(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value);
}

function normalizeParticipantEntry(participant) {
    if (participant === undefined || participant === null) return null;

    if (typeof participant === 'string' || typeof participant === 'number') {
        const id = normalizeParticipantId(participant);
        return {
            id,
            userId: id,
            name: id ? `User ${id}` : 'User',
            avatar: null,
            isOnline: true,
            isMuted: false,
            isSpeaking: false
        };
    }

    const id = normalizeParticipantId(participant.id || participant.userId || participant.participantId);
    const name = participant.name
        || participant.userName
        || participant.username
        || participant.displayName
        || (id ? `User ${id}` : 'User');

    return {
        ...participant,
        id,
        userId: id,
        name,
        avatar: participant.avatar || participant.photo || participant.userAvatar || null,
        isOnline: participant.isOnline !== false,
        isMuted: !!participant.isMuted,
        isSpeaking: !!participant.isSpeaking
    };
}

function syncParticipantBadge() {
    const badge = document.getElementById('participantBadge');
    if (badge) badge.textContent = String((UIState.callParticipants || []).length);
}

function setCallParticipants(participants = [], { merge = false } = {}) {
    const next = merge ? [...(UIState.callParticipants || [])] : [];
    const byKey = new Map();

    next.forEach((participant, index) => {
        const normalized = normalizeParticipantEntry(participant);
        if (!normalized) return;
        const key = normalized.id || `name:${normalized.name || index}`;
        byKey.set(key, normalized);
    });

    (Array.isArray(participants) ? participants : [participants]).forEach((participant, index) => {
        const normalized = normalizeParticipantEntry(participant);
        if (!normalized) return;
        const key = normalized.id || `name:${normalized.name || index}`;
        byKey.set(key, { ...(byKey.get(key) || {}), ...normalized });
    });

    UIState.callParticipants = Array.from(byKey.values());
    syncParticipantBadge();
    return UIState.callParticipants;
}

function upsertCallParticipant(participant) {
    return setCallParticipants([participant], { merge: true });
}

function removeCallParticipant(userId) {
    const normalizedId = normalizeParticipantId(userId);
    UIState.callParticipants = (UIState.callParticipants || []).filter(participant => {
        const participantId = normalizeParticipantId(participant && (participant.id || participant.userId));
        return participantId !== normalizedId;
    });
    syncParticipantBadge();
}

function showCallingScreenViaPatch(callInfo) {
    console.log('[UI] showCallingScreenViaPatch → caller outgoing screen', callInfo);

    // ── Set call-active FIRST so the guard allows callContainer to show ──
    UIState.callActive      = true;
    UIState.callState       = 'calling';
    UIState.pendingCallUser = callInfo;
    window.__callActive     = true;
    document.body.classList.add('call-active');

    // Fix 4 + FIX 8: Persist peer info durably — both window globals AND sessionStorage
    // so the name survives any race-condition CALL_FORCE_ENDED wipe before CALL_ACCEPTED fires
    window.__activePeerName   = callInfo.userName   || null;
    window.__activePeerType   = callInfo.callType   || 'voice';
    window.__activePeerAvatar = callInfo.userAvatar || null;
    // FIX 8: sessionStorage backup — survives window global wipes
    if (callInfo.userName) { try { sessionStorage.setItem('_kyn_peer_name', callInfo.userName); } catch(_) {} }
    if (callInfo.callType) { try { sessionStorage.setItem('_kyn_peer_type', callInfo.callType); } catch(_) {} }
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
                showIdleScreen(true);
            } else if (typeof window.showIdleScreen === 'function') {
                window.showIdleScreen(true);
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
// This ensures the calling screen appears and STAYS visible for 3 minutes
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

    // FIX (group-call-wrong-recipients): startCallWithUser previously always
    // called callCore.initiateCall(callType, [parseInt(userId)]) — a single-
    // element array. For a group call, the caller (chat.html/group-core.js)
    // dispatches with `userId` set to the GROUP's id (see
    // __dispatchCallToIframe(currentChatGroup.id, ...)), so this was sending
    // the group's own id as if it were one member's user id, and never
    // setting isGroupCall. The backend then created a call whose only
    // "participant" was the group id itself — real members never got a
    // correct invite, and non-members could be notified if the group id
    // happened to collide with a real user id. `groupContext`, when passed,
    // carries the real participantIds (already fetched fresh from
    // /groups/:id/members by group-core.js) plus groupId/groupName, and is
    // threaded through to initiateCall() below instead.
    async function startCallWithUser(userId, userName, callType, groupContext = null) {
    console.log('[Calls UI] startCallWithUser userId:', userId, '| type:', callType, '| groupContext:', groupContext);
    
    if (!userId) {
        console.error('[Calls UI] Cannot start call: No userId');
        showNotificationInCalls('Cannot start call: Missing user information', 'error');
        return;
    }

    // FIX: Set __callActive BEFORE forceResetCallState
    window.__callActive = true;
    if (window.UIState) { window.UIState.callActive = true; window.UIState.callState = 'calling'; }

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
            showIdleScreen(true);
            return;
        }
        console.log('[Calls UI] Permissions granted');
    } catch (permError) {
        console.error('[Calls UI] Permission error:', permError);
        showNotificationInCalls('Cannot access microphone. Please check permissions.', 'error');
        showIdleScreen(true);
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
    let timeLeft = 180; // 3 minutes
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
                    console.log('[Calls UI] Call timed out after 3 minutes');
                    if (window.callCore && window.callCore.endCall) {
                        window.callCore.endCall();
                    }
                    showIdleScreen(true);
                    showNotificationInCalls('Call ended - no answer after 3 minutes', 'info');
                }
            }
        }, 1000);
    };
    
    startRingTimer();
    
    // Store timer for cleanup
    window._currentCallTimer = ringTimer;
    
    // ========== STEP 5: Initiate the actual call ==========
    // FIX (group-call-wrong-recipients): callCore.startCall(targetUserId, ...)
    // always builds `participants = [targetUserId]` internally — it cannot
    // send more than one id regardless of what's in `options`. For a group
    // call, go straight to initiateCall() with the real member list instead.
    const _isGroupCallReq = !!(groupContext && Array.isArray(groupContext.participantIds) && groupContext.participantIds.length > 0);
    try {
        let result = null;
        
        if (_isGroupCallReq && window.callCore && window.callCore.initiateCall) {
            console.log('[Calls UI] Using callCore.initiateCall for GROUP call', groupContext);
            result = await window.callCore.initiateCall(callType, groupContext.participantIds.map(id => parseInt(id)), {
                isGroupCall: true,
                groupId: groupContext.groupId,
                groupName: groupContext.groupName
            });
        } else if (window.callCore && window.callCore.startCall) {
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
            if (_isGroupCallReq && window.callCore && window.callCore.initiateCall) {
                result = await window.callCore.initiateCall(callType, groupContext.participantIds.map(id => parseInt(id)), {
                    isGroupCall: true,
                    groupId: groupContext.groupId,
                    groupName: groupContext.groupName
                });
            } else if (window.callCore && window.callCore.startCall) {
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
            showNotificationInCalls(`${userName} is offline. Call will ring for 3 minutes.`, 'info');
        } else {
            throw new Error(result?.error || result?.reason || 'Failed to start call');
        }
        
        // Store call info
        // FIX (callId-clobber): don't blindly overwrite — a call_started/call_ringing
        // socket event may have already set the real server callId while we were
        // awaiting startCall()/initiateCall() above. Only fall back to a synthetic
        // local id if nothing has been set at all yet.
        UIState.activeCallId = result?.callId || UIState.activeCallId || `call_${Date.now()}`;
        UIState.callType = callType;
        UIState.callActive = true;
        UIState.callState = 'calling';
        
    } catch (error) {
        console.error('[Calls UI] Call initiation error:', error);
        showNotificationInCalls(`Call failed: ${error.message}`, 'error');
        
        // Wait a moment then go back to idle
        setTimeout(() => {
            if (ringTimer) clearInterval(ringTimer);
            showIdleScreen(true);
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

    // ✅ FIX: Set global call flags IMMEDIATELY so _onIframeVisible won't reset to idle
    window.__callActive = true;
    window.__lastCallEndedAt = 0; // clear end timestamp
    if (window.UIState) window.UIState.callActive = true;

    // Stamp NOW — before any network activity — so stale CALL_ENDED/CALL_FORCE_ENDED
    // echoes from the server (from the previous call) are suppressed for 8 seconds.
    window.__callInitiatedAt    = Date.now();
    window.__callEndedHandledAt = 0;  // reset debounce so next real end is not skipped
    
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
                const cid = UIState.activeCallId;
                // 1. Tell core to close WebRTC + signal backend
                const core = window.callCore || (window.coreInstance && window.coreInstance.endCall ? window.coreInstance : null);
                if (core && core.endCall) { try { core.endCall(cid); } catch(e) {} }
                // 2. Tell parent so it can broadcast to other iframes and restore
                //    the sidebar/bottom-nav icons — this was the missing piece:
                //    cancelling before answer never told the parent anything, so
                //    nav icons stayed hidden and the remote side never reset.
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'CALL_CANCELLED',
                        payload: { callId: cid, reason: 'cancelled', status: 'cancelled' },
                        source: 'end-btn'
                    }, '*');
                }
                showNotificationInCalls('Call cancelled', 'info');
                // 3. Run the same full local cleanup every other termination path
                //    uses (media, timers, UIState, nav-restore, navigate back).
                if (typeof UIEventHandlers !== 'undefined' && UIEventHandlers.handleCallEnded) {
                    UIEventHandlers.handleCallEnded({ callId: cid, reason: 'cancelled', status: 'cancelled' });
                } else {
                    showIdleScreen(true);
                }
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
    // Fix 4 + FIX 8: Persist peer info durably
    window.__activePeerName   = callInfo.userName   || window.__activePeerName   || null;
    window.__activePeerType   = callInfo.callType   || window.__activePeerType   || 'voice';
    window.__activePeerAvatar = callInfo.userAvatar || window.__activePeerAvatar || null;
    // FIX 8: sessionStorage backup
    if (window.__activePeerName) { try { sessionStorage.setItem('_kyn_peer_name', window.__activePeerName); } catch(_) {} }
    if (window.__activePeerType) { try { sessionStorage.setItem('_kyn_peer_type', window.__activePeerType); } catch(_) {} }
    window.__callAcceptedHandled = 0; // reset dedup for this new call

    console.log('[Calls UI] Calling screen setup complete');
}

// Expose on window so other IIFEs / global functions can reach it
window.showCallingScreen = showCallingScreen;
window.startCallWithUser = startCallWithUser;

function showIdleScreen(force) {
    // FIX-STUCK-IDLE: when a call ends/is cancelled, callingScreen/inCallScreen
    // still carry the 'active' class at the moment this function is first
    // invoked (they're cleared further down in THIS function), so the old
    // guard below always matched and suppressed itself on every legitimate
    // call-end, leaving the UI stuck on the calling/in-call screen.
    // `force` lets call-end paths bypass the guard explicitly; the guard is
    // still used to protect against unrelated/incoming-call races.
    if (!force && (window.__callActive ||
        window.__callEndedNavigating ||
        (window.UIState && (window.UIState.callActive || window.UIState.callState === 'calling' || window.UIState.callState === 'ringing' || window.UIState.callState === 'connecting' || window.UIState.callState === 'connected')) ||
        (document.getElementById('incomingCallModal') && document.getElementById('incomingCallModal').classList.contains('active')))) {
        console.log('[UI] showIdleScreen suppressed -- call active');
        return;
    }
    console.log('[UI] showIdleScreen');
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
    // ✅ FIX v3: ALWAYS show callContainer so repeat calls work.
    // The parent controls iframe visibility; we just reset internal screens.
    if (callContainer) {
        callContainer.classList.add('active');
        callContainer.classList.add('idle-active');
        callContainer.style.removeProperty('display');
    }
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

    // ── CRITICAL: ensure callContainer (parent of all screens) is visible ──
    const _callContainer = document.getElementById('callContainer');
    if (_callContainer) {
        _callContainer.classList.add('active');
        _callContainer.style.removeProperty('display');
        _callContainer.style.setProperty('display', 'flex', 'important');
    }
    // Also ensure idleScreen is hidden
    const _idleScreen = document.getElementById('idleScreen');
    if (_idleScreen) {
        _idleScreen.classList.remove('active');
        _idleScreen.style.setProperty('display', 'none', 'important');
    }

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

    // ── Resolve peer name (caller uses __activePeerName, receiver uses stored callerName) ──
    const name = callInfo.userName
        || window.__activePeerName
        || window.__incomingCallerName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || (UIState.pendingCallUser && UIState.pendingCallUser.userName)
        || (UIState.callData && (UIState.callData.callerName || UIState.callData.fromUserName))
        || 'User';
    const callType = callInfo.callType || UIState.callType || 'voice';
    UIState.callType = callType;
    if (!UIState.callParticipants || UIState.callParticipants.length === 0) {
        setCallParticipants([{
            id: callInfo.userId || null,
            userId: callInfo.userId || null,
            name,
            avatar: callInfo.userAvatar || null,
            isOnline: true
        }], { merge: false });
    } else {
        syncParticipantBadge();
    }

    // ── Populate name + timer fields ──────────────────────────────────────
    const callWithName = document.getElementById('callWithName');
    const callDuration = document.getElementById('callDuration');
    if (callWithName) callWithName.textContent = name;
    if (callDuration) callDuration.textContent = '00:00';

    // ── Avatar (initial letter or photo) ─────────────────────────────────
    const incallAvatar = document.getElementById('incallAvatar') || document.getElementById('callAvatar');
    if (incallAvatar) {
        const participant = (UIState.callParticipants && UIState.callParticipants[0]) || {};
        const photo = callInfo.userAvatar || participant.avatar || participant.photo;
        const _safePhoto = photo && window.SecuritySanitizer ? SecuritySanitizer.sanitizeURL(photo) : photo;
        if (_safePhoto && _safePhoto !== '#') {
            incallAvatar.textContent = '';
            const img = document.createElement('img');
            img.src = _safePhoto;
            img.alt = name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
            img.onerror = function() { incallAvatar.textContent = name.charAt(0).toUpperCase(); };
            incallAvatar.appendChild(img);
        } else {
            incallAvatar.textContent = name.charAt(0).toUpperCase();
        }
    }

    // ── Timer: always start fresh from 0:00 when transitioning to in-call ─
    UIState.callStartTime = Date.now();
    if (window._currentCallTimer) clearInterval(window._currentCallTimer);
    window._currentCallTimer = setInterval(() => {
        if (!UIState.callActive) { clearInterval(window._currentCallTimer); return; }
        const elapsed = Math.floor((Date.now() - UIState.callStartTime) / 1000);
        const m = Math.floor(elapsed / 60), s = elapsed % 60;
        if (callDuration) callDuration.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);

    // ── End-call button: terminates call on BOTH sides ────────────────────
    const endCallBtn = document.getElementById('endCallBtn');
    const callHeaderEndBtn = document.getElementById('callHeaderEndBtn');
    const endHandler = function () {
        if (this._ending) return;
        this._ending = true;
        // FIX: this guard is only meant to block a double-click on the SAME
        // call — it was never cleared, so End Call silently did nothing on
        // every call after the first one on a given page load. Clear it once
        // this click's teardown has had time to run.
        setTimeout(() => { this._ending = false; }, 1500);
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

    // ── Collapse/minimise button: hides in-call screen, shows mini bar in parent ─
    const incallCollapseBtn = document.getElementById('incallCollapseBtn');
    if (incallCollapseBtn && !incallCollapseBtn._wired) {
        incallCollapseBtn._wired = true;
        incallCollapseBtn.onclick = function() {
            const inCallScreen = document.getElementById('inCallScreen');
            if (inCallScreen) { inCallScreen.classList.remove('active'); inCallScreen.style.setProperty('display','none','important'); }
            const callWithName = document.getElementById('callWithName');
            const peerName = (callWithName && callWithName.textContent) || window.__activePeerName || window.__incomingCallerName || 'User';
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'CALL_MINIMISED', payload: { peer: peerName } }, '*');
            }
        };
    }

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

    // ── Volume slider: inject once into incall controls ───────────────────
    if (!document.getElementById('remoteVolumeSlider')) {
        const incallControls = document.querySelector('.incall-controls')
            || document.querySelector('.call-controls-row')
            || document.querySelector('#inCallScreen .controls');
        if (incallControls) {
            const volWrap = document.createElement('div');
            volWrap.id = 'volumeControlWrap';
            volWrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 8px;';
            volWrap.innerHTML =
                '<i class="fas fa-volume-down" style="color:#fff;font-size:14px;" title="Volume"></i>' +
                '<input type="range" id="remoteVolumeSlider" min="0" max="100" value="100" ' +
                'style="width:80px;accent-color:#0084ff;cursor:pointer;vertical-align:middle;" ' +
                'title="Remote volume">' +
                '<i class="fas fa-volume-up" style="color:#fff;font-size:14px;"></i>';
            incallControls.appendChild(volWrap);
            document.getElementById('remoteVolumeSlider').addEventListener('input', function() {
                const vol = parseInt(this.value, 10) / 100;
                window.__remoteVolume = vol;
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) remoteAudio.volume = vol;
            });
        }
    }

    console.log('[UI] ✅ In-call screen VISIBLE for both sides');
}

function showInCallScreen(callInfo) {
    // Delegate to transitionToInCall so both caller and receiver get identical screen
    console.log('[UI] showInCallScreen → transitionToInCall', callInfo);
    transitionToInCall(callInfo || {});
}

// Export so calls.html _handleCoreEvent can call transitionToInCall with the peer name
window.transitionToInCall = transitionToInCall;
window.showInCallScreen   = showInCallScreen;

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
            startCallWithUser(callData.userId, callData.userName, callData.callType, callData.groupContext || null);
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
            // FIX: use the SAME dedup lock as guardedHandleOpenCallWithUser
            // (setupOpenCallWithUserListener, further below) instead of the
            // separate __earlyCallLock — see rationale above this block.
            if (!window.__uiCallDispatchLock) window.__uiCallDispatchLock = { ts: 0, userId: null };
            const lock = window.__uiCallDispatchLock;
            if (lock.userId === String(userId) && (Date.now() - lock.ts) < 2000) {
                console.log('[Calls UI][Early] ⏭ Duplicate suppressed for userId', userId);
                return;
            }
            window.__uiCallDispatchLock = { ts: Date.now(), userId: String(userId) };
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

        // FIX (group-call-wrong-recipients): data.isGroupCall / data.participantIds /
        // data.groupId / data.groupName arrive here (sent by group-core.js's
        // startCall() via __dispatchCallToIframe's extraCtx) but were never
        // read — only userId/userName/callType survived into pendingOpenCall.
        // For a group call `userId` here is actually the group's id (see
        // __dispatchCallToIframe(currentChatGroup.id, ...)), not a real
        // member id, so it must never be used on its own as the sole
        // recipient.
        const groupContext = (data.isGroupCall && Array.isArray(data.participantIds) && data.participantIds.length > 0)
            ? { participantIds: data.participantIds, groupId: data.groupId || userId, groupName: data.groupName || userName }
            : null;
        
        console.log('[Calls UI][Early] Received OPEN_CALL_WITH_USER:', { userId, userName, callType, returnTo, chatUserId, groupContext });
        
        if (!userId) return;
        
        window.__pendingCallReturnTo = returnTo;
        window.__pendingCallChatUserId = chatUserId || userId;
        window.__callOriginReturnTo = returnTo;
        window.__callOriginChatUserId = chatUserId || userId;
        window.__callOriginChatUserName = userName || null;
        
        pendingOpenCall = { userId, userName, callType, groupContext };
        
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
        // FIX-GROUP-CALL-NOTICE: groupId/isGroupCall were previously dropped here,
        // so a call started from a group chat was indistinguishable from a 1:1
        // call and the backend never got the group context it needs to notify
        // every member / broadcast group:call-started.
        groupId: null,
        isGroupCall: false,
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
        
        // All in-call control actions bypass assertActive when a call is active
        const inCallActions = ['toggleMute', 'toggleVideo', 'toggleScreenShare', 'toggleSpeaker', 'endCall', 'toggleRecording'];
        // ✅ FIX: answerCall must also bypass the guard when there is an active incoming call.
        // If coreReady is false (race condition during init) the accept button would silently
        // do nothing, leaving the receiver stuck on the incoming screen forever.
        const hasActiveincoming = !!(window._currentIncomingCallId || UIState.activeCallId);
        if (actionName === 'answerCall' && hasActiveincoming) {
            return true;
        }
        if (inCallActions.includes(actionName)) {
            const activeStates = ['connected', 'ongoing', 'active', 'call_ready', 'in_call', 'in-call', 'ACTIVE', 'initiating', 'calling'];
            if (activeStates.includes(UIState.callState) || UIState.callActive === true || !!UIState.activeCallId || window.__callActive) {
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
        pendingCall.groupId = data.groupId || data.group_id || null;
        pendingCall.isGroupCall = !!(data.isGroupCall || data.isGroup || pendingCall.groupId);
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
        const isExternalSource = (callSource === 'messages-module' || callSource === 'friends-module' || callSource === 'group-module'
                                || returnTo === 'messages' || returnTo === 'friends' || returnTo === 'group');

        // If the "New Call" contacts picker is open from a previous action, close it —
        // external calls skip that screen entirely and go straight to dialling.
        if (isExternalSource && elements.newCallModal && elements.newCallModal.classList.contains('active')) {
            elements.newCallModal.classList.remove('active');
            UIState.activeModals && UIState.activeModals.delete('newCallModal');
        }

        if (!isExternalSource) {
            prefillCallModal(userId, userName, callType);
        }

        // FIX-DUPLICATE-CALL-PIPELINE: this used to call openCallModalForUser()
        // and attemptPendingCall() unconditionally here, regardless of
        // isExternalSource — even though the comment above already documented
        // the intent that this modal-confirmation pipeline should be skipped
        // for calls started from messages/friends. In practice that meant TWO
        // separate call pipelines (this one, and the earlier
        // processPendingCall -> startCallWithUser listener above) both reacted
        // to the same OPEN_CALL_WITH_USER event for every chat/friends-
        // initiated call — this one opening/touching call-modal state for a
        // confirmation nobody would ever give, while the other pipeline was
        // the one actually expected to dial. Now this pipeline genuinely
        // no-ops for external sources and leaves the dial entirely to the
        // other listener, instead of running both at once.
        if (isExternalSource) {
            return;
        }

        // Open call modal — only reached for calls started from within the calls module itself
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
            const callState = coreInstance.getCallState ? coreInstance.getCallState() : null;
            const callAge = callState && callState.callStartTime ? Date.now() - callState.callStartTime : Infinity;
            // ✅ FIX: Treat ANY call older than 5s since last end as stale (not 90s)
            const msSinceEnd = window.__lastCallEndedAt ? Date.now() - window.__lastCallEndedAt : Infinity;
            const isStale = callAge > 90000 || msSinceEnd < 8000 || callAge === Infinity;
            if (isStale) {
                console.warn('[Calls UI] Stale isInCall detected, auto-resetting for new call');
                if (coreInstance.forceResetCallState) coreInstance.forceResetCallState();
                if (window.callsState) { window.callsState.callActive = false; window.callsState.activeCallId = null; }
                await new Promise(resolve => setTimeout(resolve, 150));
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
    
    const { userId, userName, callType, groupId, isGroupCall } = pendingCall;
    const _callOptions = { groupId, isGroupCall };
    
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
            const result = await coreInstance.startCall(parseInt(userId), callType, _callOptions);
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
                try {
                    sessionStorage.setItem('pending_call', JSON.stringify({ userName, userId, callType }));
                } catch (_) {}
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
                const retryResult = await coreInstance.startCall(parseInt(userId), callType, _callOptions);
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
                moreBtn: '#moreBtn',
                menuDotsDropdown: '#menuDotsDropdown',
                
                menuRecord: '#menuRecord',
                menuRecordLabel: '#menuRecordLabel',
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
                cancelCallBtn: '#callingCancelBtn',   // FIX: actual DOM id is callingCancelBtn, not cancelCallBtn
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

