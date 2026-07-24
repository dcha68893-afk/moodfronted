/**
 * calls-core.part3.js — PART 3/8 — CORE STATE & LOGGING
 * Global call state structure (callsState), clean logging system, the calls state machine, and message type constants shared by every other file.
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

    // ==================== GLOBAL CALL STATE STRUCTURE ====================



    // CRITICAL: Call state is in-memory ONLY - no storage dependency



    window.__CallsCoreShared.callsState = {



        moduleName: window.__CallsCoreShared.MODULE_NAME,



        lifecycleState: window.__CallsCoreShared.LifecycleState.INITIALIZING,



        registered: false,



        parentReady: false,



        parentOrigin: null,



        parentOriginLocked: false,



        initialized: false,



        session: null,



        sessionStatus: 'pending',



        token: null,



        verified: false,



        verificationLock: false,



        heartbeatEnabled: false,



        webrtcInitialized: false,



        recoveryMode: false,



        sessionReceived: false,



        



        // ==================== CALL STATE (IN-MEMORY ONLY) ====================



        // CRITICAL: No storage for call state - single active call enforcement



        activeCall: null,           // { callId, type, participants, startTime, state }



        activeCallId: null,



        callActive: false,



        callState: 'idle',          // idle, initiating, ringing, connecting, connected, ended, failed, incoming



        callParticipants: [],



        callStartTime: null,



        callDuration: 0,



        callType: null,



        callInvitationTimer: null,



        callInvitationTimeout: 30000,



        callData: null,             // Store incoming call data



        



        // WebRTC state (in-memory only)



        peerConnection: null,



        iceCandidates: [],



        iceRestartCount: 0,



        maxIceRestarts: 3,



        pendingSignals: [],



        signalingState: 'new',



        connectionState: 'new',



        



        localStream: null,



        remoteStream: null,



        remoteStreams: new Map(),



        micEnabled: true,



        cameraEnabled: false,



        cameraFacingMode: 'user',



        screenSharing: false,



        mediaDevices: {



            audioInput: [],



            videoInput: [],



            audioOutput: []



        },



        



        // UI state (in-memory only)



        currentMood: 'neutral',



        currentIntention: 'quick',



        currentFocusMode: false,



        currentPanel: 'participants',



        



        isPremium: false,



        premiumFeatures: {



            // FIX (Forensic Audit P1): groupCalls was hard-blocked (false) with no activation
            // path, making group calls unavailable to all users. Enabled by default.
            // Premium gate retained only for advanced features (whiteboard, polls).
            groupCalls: true,



            screenSharing: false,



            whiteboard: false,



            polls: false,



            relationshipInsights: false,



            callLinks: false



        },



        



        childReadySent: false,



        registrationSent: false,



        



        processedMessageIds: new Set(),



        lastMessageCleanup: Date.now(),



        degraded: false,



        



        // Session deduplication



        lastSessionId: null



    };

    // FIX: expose the real callsState so code outside this closure (e.g. the
    // global updateCallUI() function below, and defensive `window.callsState &&`
    // reads elsewhere in this file) can actually see live call state instead
    // of always reading undefined. The most severe consequence of this being
    // missing: updateCallUI() always fell through to its "idle" branch and
    // force-navigated the user OFF their active call screen on every
    // participant presence update received during a live call.
    window.callsState = window.__CallsCoreShared.callsState;

    // ══════════════════════════════════════════════════════════════════════════
    // CALLMANAGER BRIDGE — Single Source of Truth Integration
    //
    // Intercepts every write to callsState.callState / callsState.callActive
    // and syncs them to the central CallManager / CallStateMachine so both
    // systems stay consistent without a full rewrite of this file.
    //
    // Legacy state → CALL_STATE mapping:
    //   idle / ended / failed / rejected / missed / busy / timeout → terminal
    //   initiating / initiated → OUTGOING
    //   incoming → INCOMING   |  ringing → RINGING
    //   connecting / starting → CONNECTING
    //   connected / in-call → CONNECTED_AUDIO (CallManager upgrades to VIDEO)
    //   reconnecting → RECONNECTING
    // ══════════════════════════════════════════════════════════════════════════
    (function _installCallManagerBridge() {
        var _legacyToCS = {
            idle: 'IDLE', initiating: 'OUTGOING', initiated: 'OUTGOING',
            incoming: 'INCOMING', ringing: 'RINGING',
            connecting: 'CONNECTING', starting: 'CONNECTING', negotiating: 'NEGOTIATING',
            connected: 'CONNECTED_AUDIO', 'in-call': 'CONNECTED_AUDIO',
            reconnecting: 'RECONNECTING', failed: 'FAILED', ended: 'ENDED',
            rejected: 'REJECTED', missed: 'MISSED', busy: 'BUSY', timeout: 'TIMEOUT',
        };

        var _rawCallState  = window.__CallsCoreShared.callsState.callState;
        var _rawCallActive = window.__CallsCoreShared.callsState.callActive;

        Object.defineProperty(window.__CallsCoreShared.callsState, 'callState', {
            get: function() { return _rawCallState; },
            set: function(v) {
                if (_rawCallState === v) return;
                _rawCallState = v;
                try {
                    var sm = window.__CallStateMachine;
                    var CS = window.CALL_STATE;
                    if (!sm || !CS) return;
                    var target = CS[_legacyToCS[v] || ''];
                    if (!target) return;
                    var callId = window.__CallsCoreShared.callsState.activeCallId || window.__CallsCoreShared.callsState.serverCallId || window.__CallsCoreShared.callsState.localCallId;
                    if (!callId) return;
                    var session = sm.getSession(callId);
                    if (!session || session.isTerminal() || session.state === target) return;
                    sm.transition(callId, target);
                } catch (_) {}
            },
            enumerable: true, configurable: true
        });

        Object.defineProperty(window.__CallsCoreShared.callsState, 'callActive', {
            get: function() { return _rawCallActive; },
            set: function(v) {
                _rawCallActive = v;
                if (!v) {
                    try {
                        var cm = window.__CallManager;
                        if (cm && typeof cm._stopCallTimer === 'function') cm._stopCallTimer();
                    } catch (_) {}
                }
            },
            enumerable: true, configurable: true
        });
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // OUTGOING CALL BRIDGE — ensure CallManager session created on initiate
    // ══════════════════════════════════════════════════════════════════════════
    window.__CallsCoreShared._cmTimerDelegated = false;

    // ==================== CLEAN LOGGING SYSTEM ====================



    const _infoLogs = new Map();



    const _warnLogs = new Map();



    const _errorLogs = new Map();



    const _successLogs = new Map();



    const _sendingLogs = new Map();



    const _readyLogs = new Map();



    const _stateLogs = new Map();



    const _sessionLogs = new Map();



    const _heartbeatLogs = new Map();



    const _callLogs = new Map();



    



    window.__CallsCoreShared.logInfo = function logInfo(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_infoLogs.has(key)) {



            const lastTime = _infoLogs.get(key);



            if (Date.now() - lastTime < 5000) return;



        }



        _infoLogs.set(key, Date.now());



        setTimeout(() => _infoLogs.delete(key), 5000);



        console.log(`[${module}] ℹ️ ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    // FIX-STRUCTURED-LOGGING (Phase 13): every log line now also carries a
    // structured record with timestamp, callId, userId, socketId, event, and
    // state -- the fields explicitly required -- alongside the existing
    // human-readable emoji line (kept as-is so nothing that scans console
    // output for the old format breaks). Dedup-by-time-window logic in each
    // of the four functions below is unchanged.
    window.__CallsCoreShared._buildStructuredLog = function _buildStructuredLog(module, message, extra) {
        var callId = null;
        try {
            callId = (extra && (extra.callId || extra.id))
                || (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.activeCallId)
                || null;
        } catch (_) {}

        var userId = null;
        try {
            userId = (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.callsState.session.userId)
                || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId)
                || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user && window.__CHILD_SESSION__.user.id)
                || null;
        } catch (_) {}

        var socketId = null;
        try {
            var _sock = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            socketId = (_sock && _sock.id) || null;
        } catch (_) {}

        var state = null;
        try {
            state = (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.callState) || null;
        } catch (_) {}

        return {
            timestamp: new Date().toISOString(),
            module:    module,
            event:     message,
            callId:    callId,
            userId:    userId,
            socketId:  socketId,
            state:     state,
        };
    };

    window.__CallsCoreShared.logWarn = function logWarn(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_warnLogs.has(key)) {



            const lastTime = _warnLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _warnLogs.set(key, Date.now());



        setTimeout(() => _warnLogs.delete(key), 10000);



        console.warn(`[${module}] ⚠️ ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logError = function logError(module, message, error = null, data = null) {



        const key = `${module}:${message}`;



        if (_errorLogs.has(key)) {



            const lastTime = _errorLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _errorLogs.set(key, Date.now());



        setTimeout(() => _errorLogs.delete(key), 30000);



        console.error(`[${module}] 🔴 ${message}`, error ? error : '', data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logSuccess = function logSuccess(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_successLogs.has(key)) {



            const lastTime = _successLogs.get(key);



            if (Date.now() - lastTime < 5000) return;



        }



        _successLogs.set(key, Date.now());



        setTimeout(() => _successLogs.delete(key), 5000);



        console.log(`[${module}] ✅ ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logSending = function logSending(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_sendingLogs.has(key)) {



            const lastTime = _sendingLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _sendingLogs.set(key, Date.now());



        setTimeout(() => _sendingLogs.delete(key), 2000);



        console.log(`[${module}] 📤 ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logReady = function logReady(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_readyLogs.has(key)) {



            const lastTime = _readyLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _readyLogs.set(key, Date.now());



        setTimeout(() => _readyLogs.delete(key), 30000);



        console.log(`[${module}] 🔵 ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logState = function logState(module, fromState, toState, reason = '') {



        const key = `${module}:${fromState}→${toState}`;



        if (_stateLogs.has(key)) {



            const lastTime = _stateLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _stateLogs.set(key, Date.now());



        setTimeout(() => _stateLogs.delete(key), 1000);



        console.log(`[${module}] 📊 ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`, window.__CallsCoreShared._buildStructuredLog(module, `${fromState}->${toState}`, { reason }));



    };



    



    window.__CallsCoreShared.logSession = function logSession(module, message, data = null) {



        const key = `${module}:session:${message}`;



        if (_sessionLogs.has(key)) {



            const lastTime = _sessionLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _sessionLogs.set(key, Date.now());



        setTimeout(() => _sessionLogs.delete(key), 10000);



        console.log(`[${module}] 🎫 ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logHeartbeat = function logHeartbeat(module, message, data = null) {



        const key = `${module}:heartbeat:${message}`;



        if (_heartbeatLogs.has(key)) {



            const lastTime = _heartbeatLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _heartbeatLogs.set(key, Date.now());



        setTimeout(() => _heartbeatLogs.delete(key), 2000);



        console.log(`[${module}] 💓 ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.logCall = function logCall(module, message, data = null) {



        const key = `${module}:call:${message}`;



        if (_callLogs.has(key)) {



            const lastTime = _callLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _callLogs.set(key, Date.now());



        setTimeout(() => _callLogs.delete(key), 1000);



        console.log(`[${module}] 📞 ${message}`, data ? data : '', window.__CallsCoreShared._buildStructuredLog(module, message, data));



    };



    



    window.__CallsCoreShared.MODULE = 'CallsCore';



    



    // ==================== CALLS STATE MACHINE ====================



    window.__CallsCoreShared.CALLS_STATE = {



        INIT: 'INIT',



        REGISTERING: 'REGISTERING',



        REGISTERED: 'REGISTERED',



        SESSION_PENDING: 'SESSION_PENDING',



        SESSION_RECEIVED: 'SESSION_RECEIVED',



        ACTIVE: 'ACTIVE',



        CALL_READY: 'CALL_READY',



        IN_CALL: 'IN_CALL',



        TERMINATED: 'TERMINATED'



    };



    



    // V5 state mapping for backward compatibility



    window.__CallsCoreShared.V5_STATE = {



        BOOTING: 'BOOTING',



        REGISTERING: 'REGISTERING',



        WAITING_SESSION: 'WAITING_SESSION',



        WAITING_PARENT_READY: 'WAITING_PARENT_READY',



        ACTIVE: 'ACTIVE',



        DEGRADED: 'DEGRADED',



        RECOVERY: 'RECOVERY',



        STANDALONE: 'STANDALONE',



        OFFLINE: 'OFFLINE'



    };



    



    window.__CallsCoreShared.STATE = {



        UNINITIALIZED: 'UNINITIALIZED',



        BOOTSTRAPPING: 'BOOTSTRAPPING',



        REGISTERING: 'REGISTERING',



        REGISTERED: 'REGISTERED',



        SESSION_PENDING: 'SESSION_PENDING',



        SESSION_ACTIVE: 'SESSION_ACTIVE',



        SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',



        ACTIVE: 'ACTIVE',



        ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',



        ERROR_FATAL: 'ERROR_FATAL',



        RECOVERING: 'RECOVERING',



        INIT: 'INIT',



        PREFLIGHT: 'PREFLIGHT',



        DEPENDENCY: 'DEPENDENCY',



        PARENT_DETECT: 'PARENT_DETECT',



        SYNC: 'SYNC',



        PERMISSIONS: 'PERMISSIONS',



        READY: 'READY',



        SUSPENDED: 'SUSPENDED',



        DEGRADED: 'DEGRADED',



        DESTROYED: 'DESTROYED',



        HANDSHAKE_IDLE: 'HANDSHAKE_IDLE',



        HANDSHAKE_WAITING: 'HANDSHAKE_WAITING',



        HANDSHAKE_IN_PROGRESS: 'HANDSHAKE_IN_PROGRESS',



        HANDSHAKE_FAILED: 'HANDSHAKE_FAILED',



        SESSION_IDLE: 'SESSION_IDLE',



        SESSION_WAITING: 'SESSION_WAITING',



        SESSION_VALID: 'SESSION_VALID',



        SESSION_EXPIRED: 'SESSION_EXPIRED',



        SESSION_ERROR: 'SESSION_ERROR'



    };



    



    const CallCoreState = {



        IDLE: 'IDLE',



        WAITING_PARENT: 'WAITING_PARENT',



        WAITING_SESSION: 'WAITING_SESSION',



        SYNCED: 'SYNCED',



        ACTIVE: 'ACTIVE',



        ERROR: 'ERROR',



        RECOVERING: 'RECOVERING'



    };



    



    // ==================== MESSAGE TYPES ====================



    window.__CallsCoreShared.MESSAGE_TYPES = {



        CHILD_READY: 'CHILD_READY',



        PARENT_READY: 'PARENT_READY',



        REGISTER_MODULE: 'REGISTER_MODULE',



        MODULE_REGISTERED: 'MODULE_REGISTERED',



        MODULE_READY: 'MODULE_READY',



        MODULE_INIT_DATA: 'MODULE_INIT_DATA',



        



        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',



        HANDSHAKE_ACK: 'HANDSHAKE_ACK',



        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',



        HANDSHAKE_RETRY: 'HANDSHAKE_RETRY',



        



        REQUEST_SESSION: 'REQUEST_SESSION',



        SESSION_ACTIVE: 'SESSION_ACTIVE',



        SESSION_NULL: 'SESSION_NULL',



        SESSION_RESPONSE: 'SESSION_RESPONSE',



        SESSION_DATA: 'SESSION_DATA',



        SESSION_UPDATE: 'SESSION_UPDATE',



        SESSION_SYNC: 'SESSION_SYNC',



        SESSION_ACK: 'SESSION_ACK',



        VERIFY_SESSION: 'VERIFY_SESSION',



        SESSION_VERIFIED: 'SESSION_VERIFIED',



        SESSION_REFRESHED: 'SESSION_REFRESHED',



        SESSION_INVALIDATED: 'SESSION_INVALIDATED',



        SESSION_RECOVERY: 'SESSION_RECOVERY',



        



        HEARTBEAT: 'HEARTBEAT',



        HEARTBEAT_ACK: 'HEARTBEAT_ACK',



        



        ACK: 'ACK',



        



        API_REQUEST: 'API_REQUEST',



        API_RESPONSE: 'API_RESPONSE',



        



        PAGE_ACTIVATED: 'PAGE_ACTIVATED',



        NAVIGATE: 'NAVIGATE',



        



        PARENT_RECOVERY: 'PARENT_RECOVERY',



        REQUEST_RESYNC: 'REQUEST_RESYNC',



        PARENT_CRASH_RECOVERY: 'PARENT_CRASH_RECOVERY',



        RECOVERY_REQUEST: 'RECOVERY_REQUEST',



        



        AUTH_ERROR: 'AUTH_ERROR',



        SESSION_ERROR: 'SESSION_ERROR',



        



        ACTION: 'ACTION',



        



        // ==================== CALL SIGNALING (REAL BACKEND) ====================



        CALL_INITIATE: 'call:initiate',

        CALL_INITIATED_ACK: 'call:initiated_ack',

        CALL_INCOMING: 'call:incoming',



        CALL_ACCEPT: 'call:accept',



        CALL_REJECT: 'call:reject',



        CALL_INITIATED: 'call:initiated',



        CALL_CONNECTING: 'call:connecting',



        CALL_STARTED: 'call:started',



        CALL_CONNECTED: 'call:connected',



        CALL_ENDED: 'CALL_ENDED',



        CALL_REJECTED: 'CALL_REJECTED',



        CALL_FAILED: 'CALL_FAILED',



        CALL_TIMEOUT: 'CALL_TIMEOUT',



        CALL_BUSY: 'CALL_BUSY',



        CALL_FORCE_ENDED: 'CALL_FORCE_ENDED',



        



        // WebRTC Signaling (must go through parent → backend)



        SIGNALING_MESSAGE: 'SIGNALING_MESSAGE',



        SIGNAL_OFFER: 'SIGNAL_OFFER',



        SIGNAL_ANSWER: 'SIGNAL_ANSWER',



        ICE_CANDIDATE: 'ICE_CANDIDATE',



        



        REMOTE_STREAM_ADDED: 'REMOTE_STREAM_ADDED',



        REMOTE_STREAM_REMOVED: 'REMOTE_STREAM_REMOVED',



        



        AUDIO_MUTED: 'AUDIO_MUTED',



        VIDEO_MUTED: 'VIDEO_MUTED',



        MIC_TOGGLED: 'MIC_TOGGLED',



        CAMERA_TOGGLED: 'CAMERA_TOGGLED',



        CAMERA_SWITCHED: 'CAMERA_SWITCHED',



        SCREEN_SHARE_STARTED: 'SCREEN_SHARE_STARTED',



        SCREEN_SHARE_ENDED: 'SCREEN_SHARE_ENDED',



        



        MOOD_UPDATE: 'MOOD_UPDATE',



        INTENTION_UPDATE: 'INTENTION_UPDATE',



        REACTION: 'REACTION',



        



        DATA_SYNC_COMPLETE: 'DATA_SYNC_COMPLETE',



        CONTACTS_UPDATE: 'CONTACTS_UPDATE',



        CALL_HISTORY_UPDATE: 'CALL_HISTORY_UPDATE',



        



        REQUEST_TOKEN: 'REQUEST_TOKEN',



        TOKEN_RESPONSE: 'TOKEN_RESPONSE',



        TOKEN_UPDATE: 'TOKEN_UPDATE',



        



        IFRAME_READY: 'IFRAME_READY',



        IFRAME_STATE_CHANGE: 'IFRAME_STATE_CHANGE',



        IFRAME_SUSPENDED: 'IFRAME_SUSPENDED',



        IFRAME_ACTIVE: 'IFRAME_ACTIVE',



        IFRAME_DESTROYED: 'IFRAME_DESTROYED',



        



        NETWORK_RESTORED: 'NETWORK_RESTORED',



        NETWORK_LOST: 'NETWORK_LOST',



        



        USER_LOGGED_OUT: 'USER_LOGGED_OUT',



        USER_LOGGED_IN: 'USER_LOGGED_IN',



        



        NEW_MESSAGE: 'NEW_MESSAGE',



        FRIEND_UPDATE: 'FRIEND_UPDATE',



        GROUP_UPDATE: 'GROUP_UPDATE',



        STATUS_UPDATE: 'STATUS_UPDATE',



        SETTINGS_UPDATED: 'SETTINGS_UPDATED',



        



        STORAGE_GET: 'STORAGE_GET',



        STORAGE_SET: 'STORAGE_SET',



        STORAGE_REMOVE: 'STORAGE_REMOVE',



        STORAGE_CLEAR: 'STORAGE_CLEAR',



        STORAGE_RESULT: 'STORAGE_RESULT'



    };



    



    // ═══ Multi-Tab Call Conflict Prevention ═════════════════════════════════
    // Uses BroadcastChannel so only ONE tab handles calls at a time.
    // When another tab becomes the active call handler (leader), this tab
    // suppresses incoming call UI and defers all call operations.
    // ─────────────────────────────────────────────────────────────────────────
    window.__CallsCoreShared._tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var _isCallLeader = false;
    window.__CallsCoreShared._callBroadcast = null;
    var _callLeaderHeartbeatTimer = null;
    var _leaderTimestamp = 0;

    (function _initTabLeader() {
        try {
            if (typeof BroadcastChannel === 'undefined') {
                _isCallLeader = true; // Fallback: no BroadcastChannel, act as leader
                return;
            }
            window.__CallsCoreShared._callBroadcast;

            window.__CallsCoreShared._callBroadcast.onmessage = function(e) {
                var msg = e.data;
                if (!msg || !msg.type) return;
                if (msg.type === 'CALL_LEADER_CLAIM' && msg.tabId !== window.__CallsCoreShared._tabId) {
                    // Another tab claimed leadership — yield
                    _isCallLeader = false;
                    clearInterval(_callLeaderHeartbeatTimer);
                } else if (msg.type === 'CALL_LEADER_HEARTBEAT' && msg.tabId !== window.__CallsCoreShared._tabId) {
                    _leaderTimestamp = Date.now();
                    _isCallLeader = false;
                } else if (msg.type === 'CALL_LEADER_RELEASE' && msg.tabId !== window.__CallsCoreShared._tabId) {
                    // Previous leader released — race to claim
                    _tryClaimLeader();
                } else if (msg.type === 'CALL_LEADER_QUERY') {
                    if (_isCallLeader) {
                        window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_LEADER_HEARTBEAT', tabId: window.__CallsCoreShared._tabId, ts: Date.now() });
                    }
                }
            };

            function _tryClaimLeader() {
                setTimeout(function() {
                    var now = Date.now();
                    if (now - _leaderTimestamp > 3000) { // No heartbeat for 3s → claim
                        _isCallLeader = true;
                        window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_LEADER_CLAIM', tabId: window.__CallsCoreShared._tabId, ts: now });
                        clearInterval(_callLeaderHeartbeatTimer);
                        _callLeaderHeartbeatTimer = setInterval(function() {
                            if (_isCallLeader && window.__CallsCoreShared._callBroadcast) {
                                window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_LEADER_HEARTBEAT', tabId: window.__CallsCoreShared._tabId, ts: Date.now() });
                            }
                        }, 1500);
                    }
                }, Math.random() * 200); // Random jitter to avoid simultaneous claims
            }

            // Query for existing leader first
            window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_LEADER_QUERY', tabId: window.__CallsCoreShared._tabId });
            setTimeout(function() {
                if (!_isCallLeader && (Date.now() - _leaderTimestamp > 2000)) {
                    _tryClaimLeader();
                }
            }, 500);

            // Release leader on tab close
            window.addEventListener('beforeunload', function() {
                if (_isCallLeader && window.__CallsCoreShared._callBroadcast) {
                    window.__CallsCoreShared._callBroadcast.postMessage({ type: 'CALL_LEADER_RELEASE', tabId: window.__CallsCoreShared._tabId });
                }
                if (window.__CallsCoreShared._callBroadcast) { try { window.__CallsCoreShared._callBroadcast.close(); } catch(_) {} }
            });

        } catch(err) {
            _isCallLeader = true; // Fail-open: always be leader if BroadcastChannel errors
        }
    })();

    // Helper: should this tab handle a call event?
    window.__CallsCoreShared._isActiveCallTab = function _isActiveCallTab() { return _isCallLeader; };

})();
