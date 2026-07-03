/**
 * CallManager.js
 * Central Call Manager — Single Source of Truth
 *
 * Manages the complete lifecycle of every call:
 *   - Call State (via CallStateMachine)
 *   - Call Session (identity, participants, timer)
 *   - Socket Events (signaling)
 *   - WebRTC Integration (PeerConnectionManager)
 *   - Media Devices (microphone, camera, speaker)
 *   - Audio Routing (Bluetooth, speaker, earpiece)
 *   - Network State (online/offline, ICE restart)
 *   - Background/Foreground lifecycle
 *   - UI Routing (screen transitions based on state)
 *   - Navigation (hide/show bottom nav)
 *   - Resource Cleanup (guaranteed on every termination path)
 *
 * No screen or module should independently manage call state.
 * Every consumer observes this manager via watch() or events.
 *
 * @version 1.0.0
 */

(function () {
  'use strict';

  if (window.__CallManager) return;

  // ─── Constants ──────────────────────────────────────────────────────────────

  const CALL_TIMEOUT_MS      = 30_000;  // No-answer timeout
  const RECONNECT_TIMEOUT_MS = 45_000;  // Max reconnect window
  const TERMINAL_DISPLAY_MS  = 2_000;   // Show terminal state before nav restore
  const DEBOUNCE_NETWORK_MS  = 1_500;   // Network-change ICE restart debounce

  // ─── Internal helpers ───────────────────────────────────────────────────────

  function _log(msg, ...args) { console.log(`[CallManager] ${msg}`, ...args); }
  function _warn(msg, ...args) { console.warn(`[CallManager] ⚠️ ${msg}`, ...args); }

  function _dispatch(eventName, detail) {
    try { window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} })); }
    catch (_) {}
  }

  function _postToParent(type, payload) {
    try {
      const target = window.parent !== window ? window.parent : null;
      if (target) target.postMessage({ type, payload: payload || {} }, '*');
    } catch (_) {}
  }

  // ─── CallManager ────────────────────────────────────────────────────────────

  class CallManager {
    constructor() {
      // Core dependencies (lazily resolved)
      this._sm          = null;  // CallStateMachine singleton
      this._pcm         = null;  // PeerConnectionManager singleton
      this._dmm         = null;  // DeviceMediaManager singleton
      this._orch        = null;  // WebRTCSessionOrchestrator singleton

      // Active call state
      this._callId      = null;
      this._session     = null;
      this._localStream = null;
      this._peerStream  = null;

      // Timers
      this._callTimer        = null;  // In-call duration ticker
      this._timeoutTimer     = null;  // No-answer timeout
      this._reconnectTimer   = null;  // Reconnect window
      this._networkDebounce  = null;  // ICE restart debounce

      // Listeners to remove on cleanup
      this._socketListeners  = [];
      this._windowListeners  = [];
      this._stateUnwatch     = null;

      // Navigation stack (restore after call)
      this._prevNavState     = null;

      // Initialization
      this._ready = false;
      this._init();
    }

    // ── Initialization ────────────────────────────────────────────────────────

    _init() {
      // Resolve singletons — retry until available
      const _resolve = () => {
        this._sm   = window.__CallStateMachine || window.CallStateMachine;
        this._pcm  = window.__PeerConnectionManager;
        this._dmm  = window.__DeviceMediaManager;
        this._orch = window.__WebRTCSessionOrchestrator;
        if (!this._sm) { setTimeout(_resolve, 100); return; }
        this._ready = true;
        this._attachNetworkListeners();
        this._attachVisibilityListeners();
        this._attachSocketListeners();
        _log('✅ Ready');
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _resolve);
      } else {
        _resolve();
      }
    }

    // ── Public API — Call Lifecycle ───────────────────────────────────────────

    /**
     * Start an outgoing call.
     * @param {string} callId
     * @param {string} callType  'audio' | 'video'
     * @param {string} targetUserId
     * @param {object} peerInfo  { name, avatar }
     */
    async startOutgoingCall(callId, callType, targetUserId, peerInfo = {}) {
      if (!this._ready) { _warn('Not ready'); return; }
      if (this._callId) { _warn('Call already active:', this._callId); return; }

      _log(`Starting outgoing ${callType} call → ${targetUserId} (${callId})`);

      this._callId  = callId;
      this._session = this._sm.createSession(callId, callType, targetUserId, true);
      if (peerInfo.name)   this._session.peerName   = peerInfo.name;
      if (peerInfo.avatar) this._session.peerAvatar = peerInfo.avatar;

      // Transition → OUTGOING
      this._sm.transition(callId, window.CALL_STATE.OUTGOING);
      this._watchState(callId);
      this._routeUI(window.CALL_STATE.OUTGOING);
      this._hideBottomNav();
      this._playOutgoingRingtone();

      // Start no-answer timeout
      this._startCallTimeout();

      // Acquire media early (improves connection time)
      try {
        this._localStream = await this._acquireMedia(callType);
      } catch (e) {
        _warn('Media acquisition failed:', e.message);
        this.failCall(callId, 'media_error');
        return;
      }

      _dispatch('kyn:call:outgoing_started', { callId, callType, targetUserId });
    }

    /**
     * Handle an incoming call notification from the server.
     * @param {object} data  { callId, callerId, callType, callerName, callerAvatar }
     */
    handleIncomingCall(data) {
      if (!this._ready) return;
      const { callId, callerId, callType, callerName, callerAvatar } = data || {};
      if (!callId || !callerId) return;

      // If already in a call, emit call:waiting instead
      if (this._callId && this._callId !== callId) {
        _log('Busy — sending call:waiting for', callId);
        _dispatch('kyn:call:waiting', data);
        return;
      }

      _log(`Incoming ${callType} call from ${callerName} (${callId})`);

      this._callId  = callId;
      this._session = this._sm.createSession(callId, callType, callerId, false);
      this._session.peerName   = callerName  || `User ${callerId}`;
      this._session.peerAvatar = callerAvatar || null;

      this._sm.transition(callId, window.CALL_STATE.INCOMING);
      this._watchState(callId);
      this._routeUI(window.CALL_STATE.INCOMING);
      this._hideBottomNav();
      this._playIncomingRingtone();

      // Auto-dismiss on timeout (MISSED)
      this._startCallTimeout(() => {
        this.missCall(callId);
      });

      _dispatch('kyn:call:incoming_shown', { callId, callerName, callType });
    }

    /**
     * Accept an incoming call (receiver).
     */
    async acceptCall(callId) {
      const session = this._sm.getSession(callId || this._callId);
      if (!session) return;
      callId = session.callId;

      _log('Accepting call:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();

      // INCOMING → CONNECTING
      this._sm.transition(callId, window.CALL_STATE.CONNECTING);
      this._routeUI(window.CALL_STATE.CONNECTING);

      // Acquire media
      try {
        this._localStream = await this._acquireMedia(session.callType);
      } catch (e) {
        _warn('Media error on accept:', e.message);
        this.failCall(callId, 'media_error');
        return;
      }

      // Emit accept event to socket layer
      _dispatch('kyn:call:accept_action', { callId });
      _postToParent('CALL_ACCEPTED', { callId });

      _log('Call accepted — media ready, awaiting WebRTC negotiation');
    }

    /**
     * Reject an incoming call (receiver).
     */
    rejectCall(callId, reason = 'declined') {
      callId = callId || this._callId;
      if (!callId) return;
      _log('Rejecting call:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();
      this._sm.transition(callId, window.CALL_STATE.REJECTED, { endReason: reason });
      _dispatch('kyn:call:reject_action', { callId, reason });
      _postToParent('CALL_REJECTED', { callId, reason });
      // UI restoration handled by state watcher → _routeUI(REJECTED)
    }

    /**
     * Cancel an outgoing call before it is answered (caller).
     */
    cancelCall(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      _log('Cancelling outgoing call:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();
      this._sm.transition(callId, window.CALL_STATE.ENDED, { endReason: 'cancelled' });
      _dispatch('kyn:call:cancel_action', { callId });
      _postToParent('CALL_CANCELLED', { callId });
    }

    /**
     * End an active call (either party).
     */
    endCall(callId, reason = 'normal') {
      callId = callId || this._callId;
      if (!callId) return;
      const session = this._sm.getSession(callId);
      if (!session || session.isTerminal()) return;
      _log(`Ending call: ${callId} (reason: ${reason})`);
      this._sm.end(callId, reason);
      _dispatch('kyn:call:end_action', { callId, reason, duration: session?.duration });
      _postToParent('CALL_ENDED', { callId, reason, duration: session?.duration });
    }

    /**
     * Handle remote party ending the call.
     */
    onRemoteEnded(callId, data = {}) {
      callId = callId || this._callId;
      if (!callId) return;
      const session = this._sm.getSession(callId);
      if (!session || session.isTerminal()) return;
      _log('Remote ended call:', callId);
      this._sm.transition(callId, window.CALL_STATE.REMOTE_ENDED, data);
    }

    /**
     * Mark call as missed (no answer from callee).
     */
    missCall(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      const session = this._sm.getSession(callId);
      if (!session || session.isTerminal()) return;
      _log('Call missed:', callId);
      this._stopRingtone();
      this._sm.transition(callId, window.CALL_STATE.MISSED);
      _dispatch('kyn:call:missed', { callId });
    }

    /**
     * Handle callee-busy signal from server.
     */
    onBusy(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      _log('Callee busy:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();
      this._sm.transition(callId, window.CALL_STATE.BUSY);
    }

    /**
     * Mark call as failed with reason.
     */
    failCall(callId, reason = 'error') {
      callId = callId || this._callId;
      if (!callId) return;
      _log(`Call failed: ${callId} (${reason})`);
      this._stopRingtone();
      this._cancelCallTimeout();
      this._sm.fail(callId, reason);
    }

    // ── WebRTC Transitions ────────────────────────────────────────────────────

    onNegotiating(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      this._sm.transition(callId, window.CALL_STATE.NEGOTIATING);
      this._routeUI(window.CALL_STATE.NEGOTIATING);
    }

    onConnected(callId, hasVideo = false) {
      callId = callId || this._callId;
      if (!callId) return;
      const targetState = hasVideo
        ? window.CALL_STATE.CONNECTED_VIDEO
        : window.CALL_STATE.CONNECTED_AUDIO;
      const session = this._sm.getSession(callId);
      if (!session) return;
      // Allow upgrade CONNECTED_AUDIO → CONNECTED_VIDEO
      if (session.state !== targetState) {
        this._sm.transition(callId, targetState);
      }
      this._startCallTimer(callId);
      this._routeUI(targetState);
      _log(`Call connected (${targetState}):`, callId);
    }

    onReconnecting(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      this._sm.transition(callId, window.CALL_STATE.RECONNECTING);
      this._routeUI(window.CALL_STATE.RECONNECTING);
      this._startReconnectTimeout(callId);
    }

    onReconnected(callId) {
      callId = callId || this._callId;
      if (!callId) return;
      this._cancelReconnectTimeout();
      const session = this._sm.getSession(callId);
      const hasVideo = session?.isVideoEnabled;
      this.onConnected(callId, hasVideo);
    }

    // ── Media Control ─────────────────────────────────────────────────────────

    toggleMute() {
      if (!this._localStream) return false;
      const audioTracks = this._localStream.getAudioTracks();
      if (!audioTracks.length) return false;
      const muted = audioTracks[0].enabled;
      audioTracks.forEach(t => { t.enabled = !muted; });
      if (this._session) this._session.isMuted = muted;
      _dispatch('kyn:call:mute_changed', { muted, callId: this._callId });
      _log(muted ? 'Microphone muted' : 'Microphone unmuted');
      return muted; // returns new muted state
    }

    toggleVideo() {
      if (!this._localStream) return false;
      const videoTracks = this._localStream.getVideoTracks();
      if (!videoTracks.length) return false;
      const enabled = !videoTracks[0].enabled;
      videoTracks.forEach(t => { t.enabled = enabled; });
      if (this._session) this._session.isVideoEnabled = enabled;
      _dispatch('kyn:call:video_changed', { enabled, callId: this._callId });
      _log(enabled ? 'Video enabled' : 'Video disabled');
      return enabled;
    }

    async switchCamera() {
      try {
        const dmm = this._dmm || window.__DeviceMediaManager;
        if (dmm && typeof dmm.switchCamera === 'function') {
          await dmm.switchCamera();
        } else {
          // Fallback: re-acquire with toggled facing mode
          if (!this._localStream) return;
          const vt = this._localStream.getVideoTracks()[0];
          const settings = vt?.getSettings?.() || {};
          const facingMode = settings.facingMode === 'user' ? 'environment' : 'user';
          const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
          const newTrack  = newStream.getVideoTracks()[0];
          // Replace track on all peer connections
          const pcm = this._pcm || window.__PeerConnectionManager;
          if (pcm) {
            for (const [peerId] of (pcm._peers || new Map())) {
              const sess = pcm._peers.get(peerId);
              if (sess && typeof sess.replaceTrack === 'function') {
                await sess.replaceTrack('video', newTrack).catch(() => {});
              }
            }
          }
          // Swap in local stream
          this._localStream.getVideoTracks().forEach(t => { t.stop(); this._localStream.removeTrack(t); });
          this._localStream.addTrack(newTrack);
        }
        _dispatch('kyn:call:camera_switched', { callId: this._callId });
        _log('Camera switched');
      } catch (e) {
        _warn('Camera switch failed:', e.message);
      }
    }

    setSpeaker(on) {
      if (this._session) this._session.isSpeakerOn = on;
      _dispatch('kyn:call:speaker_changed', { on, callId: this._callId });
    }

    async startScreenShare() {
      if (!this._callId) return;
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screen.getVideoTracks()[0];
        // Replace video track on all peer connections
        const pcm = this._pcm || window.__PeerConnectionManager;
        if (pcm) {
          for (const [, sess] of (pcm._peers || new Map())) {
            if (typeof sess?.replaceTrack === 'function') {
              await sess.replaceTrack('video', screenTrack).catch(() => {});
            }
          }
        }
        screenTrack.onended = () => this.stopScreenShare();
        if (this._session) this._session.isScreenSharing = true;
        this._sm.transition(this._callId, window.CALL_STATE.SCREEN_SHARING);
        this._routeUI(window.CALL_STATE.SCREEN_SHARING);
        _dispatch('kyn:call:screen_share_started', { callId: this._callId });
        _log('Screen sharing started');
      } catch (e) {
        _warn('Screen share failed:', e.message);
      }
    }

    async stopScreenShare() {
      if (!this._callId) return;
      const session = this._sm.getSession(this._callId);
      if (!session) return;
      if (this._session) this._session.isScreenSharing = false;
      const hasVideo = session.isVideoEnabled;
      // Restore camera track
      try {
        if (this._localStream) {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const camTrack  = camStream.getVideoTracks()[0];
          const pcm = this._pcm || window.__PeerConnectionManager;
          if (pcm) {
            for (const [, sess] of (pcm._peers || new Map())) {
              if (typeof sess?.replaceTrack === 'function') {
                await sess.replaceTrack('video', camTrack).catch(() => {});
              }
            }
          }
        }
      } catch (_) {}
      const nextState = hasVideo
        ? window.CALL_STATE.CONNECTED_VIDEO
        : window.CALL_STATE.CONNECTED_AUDIO;
      if (session.canTransition(nextState)) {
        this._sm.transition(this._callId, nextState);
        this._routeUI(nextState);
      }
      _dispatch('kyn:call:screen_share_stopped', { callId: this._callId });
      _log('Screen sharing stopped');
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    getSession()     { return this._session; }
    getCallId()      { return this._callId; }
    getLocalStream() { return this._localStream; }
    getPeerStream()  { return this._peerStream; }
    isInCall()       { return !!this._callId && !!this._session && !this._session.isTerminal(); }

    setPeerStream(stream) {
      this._peerStream = stream;
      _dispatch('kyn:call:peer_stream', { stream, callId: this._callId });
    }

    // ── State Watcher ─────────────────────────────────────────────────────────

    _watchState(callId) {
      if (this._stateUnwatch) this._stateUnwatch();
      this._stateUnwatch = this._sm.watchAll(({ callId: id, state, prev }) => {
        if (id !== callId) return;
        this._routeUI(state, prev);
        // Auto-cleanup on terminal states
        if (this._isTerminal(state)) {
          setTimeout(() => this._cleanup(callId, state), TERMINAL_DISPLAY_MS);
        }
      });
    }

    _isTerminal(state) {
      const terminals = [
        window.CALL_STATE.FAILED, window.CALL_STATE.BUSY, window.CALL_STATE.REJECTED,
        window.CALL_STATE.MISSED, window.CALL_STATE.ENDED, window.CALL_STATE.REMOTE_ENDED,
        window.CALL_STATE.TIMEOUT, window.CALL_STATE.ERROR,
      ];
      return terminals.includes(state);
    }

    // ── UI Routing ────────────────────────────────────────────────────────────

    _routeUI(state, prevState) {
      _log(`UI route: ${prevState ? prevState + ' → ' : ''}${state}`);

      const CS = window.CALL_STATE;

      // Dispatch to both calls.html iframe (via postMessage) and local listeners
      _postToParent('CALL_STATE_ROUTE', { state, prevState });
      _dispatch('kyn:call:ui_route', { state, prevState, session: this._session });

      switch (state) {
        case CS.IDLE:
          this._showBottomNav();
          this._showScreen('idle');
          break;

        case CS.OUTGOING:
          this._hideBottomNav();
          this._showScreen('calling');
          break;

        case CS.INCOMING:
          this._hideBottomNav();
          this._showScreen('incoming');
          break;

        case CS.CONNECTING:
        case CS.NEGOTIATING:
          this._showScreen('connecting');
          break;

        case CS.CONNECTED_AUDIO:
          this._showScreen('in-call');
          this._applyCallControls({ video: false, screen: false });
          break;

        case CS.CONNECTED_VIDEO:
          this._showScreen('in-call');
          this._applyCallControls({ video: true, screen: false });
          break;

        case CS.SCREEN_SHARING:
          this._showScreen('in-call');
          this._applyCallControls({ video: false, screen: true });
          break;

        case CS.RECONNECTING:
          this._showReconnectingIndicator(true);
          break;

        case CS.HOLD:
          this._showHoldIndicator(true);
          break;

        case CS.BUSY:
          this._showTerminalMessage('User is busy', 'busy');
          break;

        case CS.REJECTED:
          this._showTerminalMessage('Call declined', 'rejected');
          break;

        case CS.MISSED:
          this._showTerminalMessage('Missed call', 'missed');
          break;

        case CS.ENDED:
        case CS.REMOTE_ENDED:
          const dur = this._session?.durationFormatted || '';
          this._showTerminalMessage(
            state === CS.REMOTE_ENDED ? `Call ended${dur ? ' · ' + dur : ''}` : `Call ended${dur ? ' · ' + dur : ''}`,
            'ended'
          );
          break;

        case CS.FAILED:
        case CS.ERROR:
          this._showTerminalMessage('Call failed', 'failed');
          break;

        case CS.TIMEOUT:
          this._showTerminalMessage('No answer', 'timeout');
          break;
      }
    }

    _showScreen(name) {
      // Primary: delegate to calls.html's showScreen() if we're inside it
      if (typeof window.showScreen === 'function') {
        window.showScreen(name);
        return;
      }
      // Secondary: postMessage to iframe
      const iframe = document.getElementById('callsIframe') || document.querySelector('iframe[src*="calls"]');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'SHOW_SCREEN', screen: name }, '*');
      }
    }

    _showTerminalMessage(msg, type) {
      _dispatch('kyn:call:terminal_message', { message: msg, type });
      // Update any visible status elements
      const statusEls = document.querySelectorAll('.call-status-text, #callStatusText, [data-call-status]');
      statusEls.forEach(el => { el.textContent = msg; });
    }

    _showReconnectingIndicator(visible) {
      _dispatch('kyn:call:reconnecting', { visible });
      const els = document.querySelectorAll('.reconnecting-indicator, [data-reconnecting]');
      els.forEach(el => { el.style.display = visible ? '' : 'none'; });
    }

    _showHoldIndicator(visible) {
      _dispatch('kyn:call:hold_changed', { onHold: visible });
    }

    _applyCallControls(flags) {
      _dispatch('kyn:call:controls_update', { ...flags, callId: this._callId });
      // Toggle video UI elements
      const videoEls = document.querySelectorAll('[data-call-video-toggle], .video-toggle-btn');
      videoEls.forEach(el => { el.style.display = flags.video !== undefined ? '' : 'none'; });
      const screenEls = document.querySelectorAll('[data-call-screen-share], .screen-share-btn');
      screenEls.forEach(el => {
        if (el.classList) {
          el.classList.toggle('active', !!flags.screen);
        }
      });
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    _hideBottomNav() {
      // Save current state
      const nav = document.getElementById('bottomNav') ||
                  document.querySelector('.bottom-nav, nav.main-nav, [data-bottom-nav]');
      if (nav) {
        this._prevNavState = nav.style.display;
        nav.style.setProperty('display', 'none', 'important');
      }
      document.body.classList.add('call-active');
      _postToParent('HIDE_BOTTOM_NAV', {});
      _dispatch('kyn:nav:hide', {});
    }

    _showBottomNav() {
      const nav = document.getElementById('bottomNav') ||
                  document.querySelector('.bottom-nav, nav.main-nav, [data-bottom-nav]');
      if (nav) {
        nav.style.display = this._prevNavState !== null ? this._prevNavState : '';
        nav.style.removeProperty('display');
        this._prevNavState = null;
      }
      document.body.classList.remove('call-active');
      _postToParent('SHOW_BOTTOM_NAV', {});
      _dispatch('kyn:nav:show', {});
    }

    // ── Ringtone ──────────────────────────────────────────────────────────────

    _playOutgoingRingtone() {
      try {
        if (window._playOutgoingRingtone) { window._playOutgoingRingtone(); return; }
        this._stopRingtone();
        this._ringtone = new Audio('/sounds/outgoing.mp3');
        this._ringtone.loop = true;
        this._ringtone.play().catch(() => {});
      } catch (_) {}
    }

    _playIncomingRingtone() {
      try {
        if (window._playIncomingRingtone) { window._playIncomingRingtone(); return; }
        this._stopRingtone();
        this._ringtone = new Audio('/sounds/incoming.mp3');
        this._ringtone.loop = true;
        this._ringtone.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate([500, 300, 500]);
      } catch (_) {}
    }

    _stopRingtone() {
      try {
        if (window._stopRingtones) { window._stopRingtones(); }
        if (this._ringtone) { this._ringtone.pause(); this._ringtone.currentTime = 0; this._ringtone = null; }
        if (navigator.vibrate) navigator.vibrate(0);
      } catch (_) {}
    }

    // ── Media Acquisition ─────────────────────────────────────────────────────

    async _acquireMedia(callType) {
      // Delegate to DeviceMediaManager if available
      const dmm = this._dmm || window.__DeviceMediaManager;
      if (dmm && typeof dmm.getLocalStream === 'function') {
        const existing = dmm.getLocalStream();
        if (existing) return existing;
      }
      const constraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        if (e.name === 'NotAllowedError') throw Object.assign(e, { code: 'PERMISSION_DENIED' });
        if (e.name === 'NotFoundError')   throw Object.assign(e, { code: 'DEVICE_NOT_FOUND' });
        throw e;
      }
      // Register with DeviceMediaManager if available
      if (dmm && typeof dmm.setLocalStream === 'function') dmm.setLocalStream(stream);
      return stream;
    }

    // ── Call Timer ────────────────────────────────────────────────────────────

    _startCallTimer(callId) {
      this._stopCallTimer();
      let _heartbeatCount = 0;
      this._callTimer = setInterval(() => {
        const session = this._sm?.getSession(callId);
        if (!session || session.isTerminal()) { this._stopCallTimer(); return; }
        const dur = session.durationFormatted;
        _dispatch('kyn:call:tick', { duration: dur, seconds: session.duration, callId });
        // Update timer displays
        const timerEls = document.querySelectorAll('.call-timer, #callTimer, [data-call-timer]');
        timerEls.forEach(el => { el.textContent = dur; });
        // Emit heartbeat every 30 seconds
        _heartbeatCount++;
        if (_heartbeatCount % 30 === 0) {
          _dispatch('kyn:call:emit_heartbeat', { callId });
          _postToParent('CALL_HEARTBEAT', { callId, ts: Date.now() });
        }
      }, 1000);
    }

    _stopCallTimer() {
      if (this._callTimer) { clearInterval(this._callTimer); this._callTimer = null; }
    }

    // ── Timeout Management ────────────────────────────────────────────────────

    _startCallTimeout(onTimeout) {
      this._cancelCallTimeout();
      this._timeoutTimer = setTimeout(() => {
        if (onTimeout) onTimeout();
        else {
          // Caller side — no answer
          const session = this._sm?.getSession(this._callId);
          if (session && !session.isTerminal()) {
            this._sm.transition(this._callId, window.CALL_STATE.TIMEOUT);
          }
        }
      }, CALL_TIMEOUT_MS);
    }

    _cancelCallTimeout() {
      if (this._timeoutTimer) { clearTimeout(this._timeoutTimer); this._timeoutTimer = null; }
    }

    // ── Reconnect Timeout ─────────────────────────────────────────────────────

    _startReconnectTimeout(callId) {
      this._cancelReconnectTimeout();
      this._reconnectTimer = setTimeout(() => {
        const session = this._sm?.getSession(callId);
        if (session && session.state === window.CALL_STATE.RECONNECTING) {
          _warn('Reconnect timeout — ending call');
          this.failCall(callId, 'reconnect_timeout');
        }
      }, RECONNECT_TIMEOUT_MS);
    }

    _cancelReconnectTimeout() {
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    }

    // ── Socket Listener Registration ──────────────────────────────────────────

    _attachSocketListeners() {
      // Wait for socket to be available
      const _tryHook = () => {
        const socket = window.KynectaRealtime?._socket || window._kynSocket;
        if (!socket) { setTimeout(_tryHook, 1000); return; }
        this._hookSocket(socket);
      };
      _tryHook();

      // Also hook kyn: CustomEvents for iframe-bridge consumers
      const _on = (event, fn) => {
        window.addEventListener(event, fn);
        this._windowListeners.push({ event, fn });
      };

      _on('kyn:call:incoming',          e => this.handleIncomingCall(e.detail || {}));
      _on('kyn:call_incoming',          e => this.handleIncomingCall(e.detail || {}));
      _on('kyn:call:accepted',          e => this._onRemoteAccepted(e.detail || {}));
      _on('kyn:call_accepted',          e => this._onRemoteAccepted(e.detail || {}));
      _on('kyn:call:rejected',          e => this._onRemoteRejected(e.detail || {}));
      _on('kyn:call_rejected',          e => this._onRemoteRejected(e.detail || {}));
      _on('kyn:call:ended',             e => this.onRemoteEnded((e.detail||{}).callId || this._callId));
      _on('kyn:call_ended',             e => this.onRemoteEnded((e.detail||{}).callId || this._callId));
      _on('kyn:call:busy',              e => this.onBusy((e.detail||{}).callId));
      _on('kyn:call_busy',              e => this.onBusy((e.detail||{}).callId));
      _on('kyn:call:dedup_rejected',    e => this._onDedupRejected(e.detail || {}));
      _on('kyn:call:accepted_elsewhere',e => this._onAcceptedElsewhere(e.detail || {}));
      _on('kyn:call:webrtc_connected',  e => this.onConnected((e.detail||{}).callId, (e.detail||{}).hasVideo));
      _on('kyn:call:webrtc_reconnecting',e => this.onReconnecting((e.detail||{}).callId));
      _on('kyn:call:webrtc_reconnected', e => this.onReconnected((e.detail||{}).callId));
      _on('kyn:endCall',                e => this.endCall((e.detail||{}).callId));
      _on('kyn:acceptCall',             e => this.acceptCall((e.detail||{}).callId));
      _on('kyn:rejectCall',             e => this.rejectCall((e.detail||{}).callId));
      _on('kyn:cancelCall',             e => this.cancelCall((e.detail||{}).callId));
    }

    _hookSocket(socket) {
      _log('Hooking socket events');
      const _onSocket = (event, fn) => {
        socket.on(event, fn);
        this._socketListeners.push({ socket, event, fn });
      };

      _onSocket('call:incoming',          d => this.handleIncomingCall(d));
      _onSocket('call_incoming',          d => this.handleIncomingCall(d));
      _onSocket('call:accepted',          d => this._onRemoteAccepted(d));
      _onSocket('call_accepted',          d => this._onRemoteAccepted(d));
      _onSocket('call:rejected',          d => this._onRemoteRejected(d));
      _onSocket('call_rejected',          d => this._onRemoteRejected(d));
      _onSocket('call:ended',             d => this.onRemoteEnded((d||{}).callId));
      _onSocket('call_ended',             d => this.onRemoteEnded((d||{}).callId));
      _onSocket('call:busy',              d => this.onBusy((d||{}).callId));
      _onSocket('call_busy',              d => this.onBusy((d||{}).callId));
      _onSocket('call:dedup_rejected',    d => this._onDedupRejected(d));
      _onSocket('call:accepted_elsewhere',d => this._onAcceptedElsewhere(d));
    }

    _onRemoteAccepted(data) {
      const callId = data.callId || this._callId;
      if (!callId) return;
      const session = this._sm?.getSession(callId);
      if (!session || session.isTerminal()) return;
      _log('Remote accepted:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();
      if (session.state === window.CALL_STATE.OUTGOING || session.state === window.CALL_STATE.RINGING) {
        this._sm.transition(callId, window.CALL_STATE.CONNECTING);
        this._routeUI(window.CALL_STATE.CONNECTING);
      }
    }

    _onRemoteRejected(data) {
      const callId = data.callId || this._callId;
      if (!callId) return;
      const session = this._sm?.getSession(callId);
      if (!session || session.isTerminal()) return;
      _log('Remote rejected:', callId);
      this._stopRingtone();
      this._cancelCallTimeout();
      // Map reason to correct terminal state
      const reason = data.reason || 'rejected';
      if (reason === 'accepted_elsewhere') {
        this._sm.transition(callId, window.CALL_STATE.ENDED, { endReason: reason });
      } else {
        this._sm.transition(callId, window.CALL_STATE.REJECTED, { endReason: reason });
      }
    }

    _onDedupRejected(data) {
      _log('Call rate-limited by server');
      this._stopRingtone();
      this._cancelCallTimeout();
      const callId = data.callId || this._callId;
      if (callId) {
        const session = this._sm?.getSession(callId);
        if (session && !session.isTerminal()) {
          this._sm.transition(callId, window.CALL_STATE.REJECTED, { endReason: 'rate_limited' });
        }
      }
    }

    _onAcceptedElsewhere(data) {
      _log('Call accepted on another device');
      this._stopRingtone();
      const callId = data.callId || this._callId;
      if (callId) {
        const session = this._sm?.getSession(callId);
        if (session && !session.isTerminal()) {
          this._sm.transition(callId, window.CALL_STATE.ENDED, { endReason: 'accepted_elsewhere' });
        }
      }
    }

    // ── Network Listeners ─────────────────────────────────────────────────────

    _attachNetworkListeners() {
      const _onOnline = () => {
        if (!this._callId) return;
        const session = this._sm?.getSession(this._callId);
        if (session?.state === window.CALL_STATE.RECONNECTING) {
          _log('Network restored — triggering ICE restart');
          _dispatch('kyn:call:network_restored', { callId: this._callId });
        }
      };

      const _onConnectionChange = () => {
        if (!this._callId) return;
        const session = this._sm?.getSession(this._callId);
        if (!session || !session.isConnected()) return;
        // Debounce — WiFi→mobile switches fire multiple times
        clearTimeout(this._networkDebounce);
        this._networkDebounce = setTimeout(() => {
          _log('Network type changed — requesting ICE restart');
          _dispatch('kyn:call:network_changed', { callId: this._callId });
        }, DEBOUNCE_NETWORK_MS);
      };

      window.addEventListener('online', _onOnline);
      this._windowListeners.push({ event: 'online', fn: _onOnline });

      if (navigator.connection) {
        navigator.connection.addEventListener('change', _onConnectionChange);
        this._windowListeners.push({ event: '_connection_change', fn: _onConnectionChange, target: navigator.connection });
      }
    }

    // ── Visibility Listeners ──────────────────────────────────────────────────

    _attachVisibilityListeners() {
      let _hiddenAt = null;
      const _onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          _hiddenAt = Date.now();
        } else {
          if (_hiddenAt && this._callId) {
            const bgMs = Date.now() - _hiddenAt;
            if (bgMs > 30_000) {
              _log(`Foreground after ${Math.round(bgMs/1000)}s — checking connection`);
              _dispatch('kyn:call:foregrounded', { callId: this._callId, bgMs });
            }
          }
          _hiddenAt = null;
        }
      };
      document.addEventListener('visibilitychange', _onVisibility);
      this._windowListeners.push({ event: 'visibilitychange', fn: _onVisibility, target: document });
    }

    // ── Cleanup — guaranteed resource release ─────────────────────────────────

    _cleanup(callId, terminalState) {
      if (callId !== this._callId) return;
      _log(`Cleanup for call ${callId} (${terminalState})`);

      // 1. Stop all timers
      this._stopCallTimer();
      this._cancelCallTimeout();
      this._cancelReconnectTimeout();
      clearTimeout(this._networkDebounce);

      // 2. Stop ringtone
      this._stopRingtone();

      // 3. Close WebRTC sessions
      try {
        const pcm = this._pcm || window.__PeerConnectionManager;
        if (pcm) {
          if (typeof pcm.closeSession === 'function') {
            // Close the session for this call's peer
            if (this._session?.peerId) {
              pcm.closeSession(this._session.peerId, callId);
            }
          }
          if (typeof pcm.closeAll === 'function') pcm.closeAll();
        }
      } catch (e) { _warn('WebRTC close error:', e.message); }

      // 4. Release media tracks
      this._releaseMedia();

      // 5. Remove socket listeners for this call
      this._socketListeners.forEach(({ socket, event, fn }) => {
        try { socket.off(event, fn); } catch (_) {}
      });
      this._socketListeners = [];

      // 6. Remove window listeners
      this._windowListeners.forEach(({ event, fn, target }) => {
        try { (target || window).removeEventListener(event, fn); } catch (_) {}
      });
      this._windowListeners = [];

      // 7. Unwatch state
      if (this._stateUnwatch) { this._stateUnwatch(); this._stateUnwatch = null; }

      // 8. Reset Call Manager state
      this._callId      = null;
      this._session     = null;
      this._localStream = null;
      this._peerStream  = null;

      // Re-attach network/visibility listeners (they need to stay active for next call)
      this._attachNetworkListeners();
      this._attachVisibilityListeners();

      // 9. Restore UI — hide call screen, show bottom nav
      setTimeout(() => {
        this._showScreen('idle');
        this._showBottomNav();
        this._showReconnectingIndicator(false);
        this._showHoldIndicator(false);
      }, TERMINAL_DISPLAY_MS);

      _dispatch('kyn:call:cleanup_complete', { callId, terminalState });
      _log('Cleanup complete — ready for next call');
    }

    _releaseMedia() {
      // Stop local stream tracks
      if (this._localStream) {
        this._localStream.getTracks().forEach(t => {
          try { t.stop(); } catch (_) {}
        });
        this._localStream = null;
      }
      // Stop peer stream tracks
      if (this._peerStream) {
        this._peerStream.getTracks().forEach(t => {
          try { t.stop(); } catch (_) {}
        });
        this._peerStream = null;
      }
      // Clear any video elements
      const videos = document.querySelectorAll('video[data-call-video], #remoteVideo, #localVideo, #callVideo');
      videos.forEach(v => {
        try { v.srcObject = null; v.load(); } catch (_) {}
      });
      // Notify DeviceMediaManager
      try {
        const dmm = this._dmm || window.__DeviceMediaManager;
        if (dmm && typeof dmm.releaseAll === 'function') dmm.releaseAll();
      } catch (_) {}
      _log('Media released — microphone and camera off');
    }

    // ── Public watch API ──────────────────────────────────────────────────────

    watch(fn) {
      if (!this._sm) return () => {};
      return this._sm.watchAll(fn);
    }
  }

  // ─── Singleton ──────────────────────────────────────────────────────────────

  window.__CallManager = new CallManager();
  window.CallManager   = window.__CallManager;

  console.log('[CallManager] ✅ Central Call Manager ready');
})();
