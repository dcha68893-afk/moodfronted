/**
 * WebRTCSessionOrchestrator.js
 * Phase 3 — WebRTC Session Orchestrator (Frontend)
 *
 * The single coordinator that ties together:
 *   CallStateMachine + PeerConnectionManager + DeviceMediaManager
 *
 * Integrates with existing socket event system:
 *   Listens: kyn:call:incoming, kyn:call:accepted, kyn:call:rejected,
 *            kyn:call:ended, kyn:call:cancelled
 *   Emits:   call:initiate, call:accept, call:reject, call:end
 *            via KynectaRealtime.send() (existing method)
 *
 * @version 3.0.0
 * @phase 3 — WebRTC Engine
 */

(function () {
  'use strict';

  if (window.__WebRTCSessionOrchestrator) return;

  // ─── CallOrchestrator ─────────────────────────────────────────────────────

  class WebRTCSessionOrchestrator {
    constructor() {
      this._state   = null;   // CallStateMachine (set on start)
      this._peers   = null;   // PeerConnectionManager
      this._media   = null;   // DeviceMediaManager
      this._started = false;

      // Duplicate signal guard
      this._recentSignals = new Map();
      this._signalDedupMs = 3000;

      // Ring timeout — auto-cancel unanswered outbound
      this._ringTimer = null;
      this._ringTimeoutMs = 60000;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    start() {
      if (this._started) return;
      this._started = true;

      this._state = window.__CallStateMachine;
      this._peers = window.__PeerConnectionManager;
      this._media = window.__DeviceMediaManager;

      if (!this._state || !this._peers || !this._media) {
        console.error('[CallOrchestrator] Missing dependencies — ensure Phase 3 modules loaded first');
        return;
      }

      // FIX #6 — Pre-warm: create dedicated remote audio element immediately so
      // it is ready before any call arrives (no creation delay on incoming call).
      this._ensureRemoteAudioElement();

      // FIX #6 — Pre-gather ICE candidates on first user gesture
      const prewarm = () => {
        try {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pc.createOffer({ offerToReceiveAudio: true })
            .then(o => pc.setLocalDescription(o))
            .then(() => setTimeout(() => { try { pc.close(); } catch(_){} }, 4000))
            .catch(() => { try { pc.close(); } catch(_){} });
        } catch(_) {}
      };
      ['click','touchstart','keydown'].forEach(e => document.addEventListener(e, function once() {
        prewarm(); document.removeEventListener(e, once);
      }, { once: true, passive: true }));

      this._attachExistingCallListeners();
      console.log('[CallOrchestrator] ✅ Started');
    }

    // FIX #8 — Ensure a dedicated hidden audio element exists for remote audio
    _ensureRemoteAudioElement() {
      if (this._remoteAudioEl) return this._remoteAudioEl;
      let el = document.getElementById('__callorch_remote_audio');
      if (!el) {
        el = document.createElement('audio');
        el.id = '__callorch_remote_audio';
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        el.muted = false;
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      this._remoteAudioEl = el;
      return el;
    }

    // ── OUTBOUND CALL ──────────────────────────────────────────────────────

    /**
     * Initiate a call to a user.
     * Integrates with existing callService / call:initiate event.
     *
     * @param {Object} options - { targetUserId, callType, callId, metadata }
     */
    async initiateCall(options = {}) {
      const {
        targetUserId,
        callType    = window.CALL_TYPE?.AUDIO || 'audio',
        callId      = this._genCallId(),
        metadata    = {},
      } = options;

      if (!targetUserId) throw new Error('targetUserId required');

      // Prevent double-initiation
      const active = this._state?.getActive();
      if (active && active.state !== window.CALL_STATE?.ENDED && active.state !== window.CALL_STATE?.FAILED) {
        console.warn('[CallOrchestrator] Call already active — ignoring initiateCall');
        return null;
      }

      const session = this._state.createSession(callId, callType, targetUserId, true);
      this._state.transition(callId, window.CALL_STATE.INITIATING);

      // Acquire media BEFORE signaling
      const needsVideo = callType === 'video' || callType === 'group';
      let localStream;
      try {
        localStream = await this._media.acquireMedia({
          audio: true,
          video: needsVideo,
          quality: 'medium',
        });
      } catch (err) {
        console.error('[CallOrchestrator] Media acquisition failed:', err.message);
        this._state.transition(callId, window.CALL_STATE.FAILED, { error: err.message });
        return null;
      }

      // Send call initiation via existing KynectaRealtime.send()
      this._sendCallEvent('call:initiate', {
        callId,
        targetUserId,
        callType,
        timestamp: Date.now(),
        ...metadata,
      });

      // Start ring timeout
      this._ringTimer = setTimeout(() => {
        console.log('[CallOrchestrator] Ring timeout — ending call');
        this.endCall(callId, 'no_answer');
      }, this._ringTimeoutMs);

      this._state.transition(callId, window.CALL_STATE.RINGING);

      // Store local stream on session for use when accepted
      session._pendingLocalStream = localStream;
      session._targetUserId = targetUserId;

      console.log(`[CallOrchestrator] Call initiated: ${callId} → user ${targetUserId}`);
      return { callId, session };
    }

    /**
     * Accept an inbound call.
     * Called by calls.html when user taps "Accept".
     *
     * @param {string} callId
     * @param {string} callerId
     * @param {Object} options - { callType, callMetadata }
     */
    async acceptCall(callId, callerId, options = {}) {
      const callType = options.callType || 'audio';
      const needsVideo = callType === 'video' || callType === 'group';

      let session = this._state.getSession(callId);
      if (!session) {
        session = this._state.createSession(callId, callType, callerId, false);
      }

      this._state.transition(callId, window.CALL_STATE.CONNECTING);

      // Acquire media
      let localStream;
      try {
        localStream = await this._media.acquireMedia({
          audio: true,
          video: needsVideo && !options.audioOnly,
          quality: 'medium',
        });
      } catch (err) {
        console.error('[CallOrchestrator] Media failed on accept:', err.message);
        this.rejectCall(callId, callerId, 'media_error');
        return;
      }

      // Create peer session (not initiator — we respond)
      try {
        const peerSession = await this._peers.createSession(callerId, callId, false, localStream);
        this._attachPeerEvents(peerSession, callId, callerId);
      } catch (err) {
        console.error('[CallOrchestrator] Peer session creation failed:', err.message);
        this.endCall(callId, 'peer_error');
        return;
      }

      // Signal acceptance via existing event system
      this._sendCallEvent('call:accept', { callId, callerId, callType, timestamp: Date.now() });
      this._attachLocalPreview(localStream);

      console.log(`[CallOrchestrator] Call accepted: ${callId} ← user ${callerId}`);
    }

    /**
     * Called when remote peer accepted our outbound call.
     */
    async onCallAccepted(callId, accepterId, signal) {
      if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; }

      const session = this._state.getSession(callId);
      if (!session) return;

      this._state.transition(callId, window.CALL_STATE.CONNECTING);

      const localStream = session._pendingLocalStream;

      try {
        const peerSession = await this._peers.createSession(accepterId, callId, true, localStream);
        this._attachPeerEvents(peerSession, callId, accepterId);
        this._attachLocalPreview(localStream);

        // If signal already arrived with an offer embedded, handle it
        if (signal?.sdp || signal?.candidate) {
          await peerSession.handleSignal(signal);
        }
      } catch (err) {
        console.error('[CallOrchestrator] Peer session failed after accept:', err.message);
        this.endCall(callId, 'peer_error');
      }
    }

    /**
     * Reject an inbound call.
     */
    rejectCall(callId, callerId, reason = 'rejected') {
      this._sendCallEvent('call:reject', { callId, callerId, reason, timestamp: Date.now() });
      const session = this._state.getSession(callId);
      if (session) this._state.end(callId, reason);
      this._media.stopAll();
      console.log(`[CallOrchestrator] Call rejected: ${callId}`);
    }

    /**
     * End an active call (any party).
     */
    endCall(callId, reason = 'normal') {
      if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; }

      const session = this._state.getSession(callId);
      if (session) {
        // Destroy all peer sessions for this call
        if (session._targetUserId) this._peers.destroySession(session._targetUserId, callId);
        if (session.peerId) this._peers.destroySession(session.peerId, callId);

        // For group calls, destroy all participant peers
        for (const [uid] of session.groupParticipants) {
          this._peers.destroySession(uid, callId);
        }

        this._state.end(callId, reason);
      }

      // Signal end via existing event system
      this._sendCallEvent('call:end', { callId, reason, timestamp: Date.now() });

      // Stop all media
      this._media.stopAll();

      // Clear any remote video elements
      this._clearRemoteMedia();

      console.log(`[CallOrchestrator] Call ended: ${callId} reason=${reason}`);
    }

    // ── Call Controls ──────────────────────────────────────────────────────

    toggleMute()     { this._media.toggleMute(); }
    toggleVideo()    { this._media.toggleVideo(); }
    toggleSpeaker()  { /* routed via AudioOutputManager */ }

    async switchCamera() {
      const newTrack = await this._media.switchCamera();
      if (!newTrack) return;

      // Replace track on all active peer sessions
      const active = this._state.getActive();
      if (!active) return;
      for (const [key, peer] of window.__PeerConnectionManager._peers) {
        if (key.includes(active.callId)) {
          await peer.replaceTrack('video', newTrack);
        }
      }
    }

    async startScreenShare() {
      const screenStream = await this._media.acquireScreen();
      const active = this._state.getActive();
      if (!active) return;

      for (const [key, peer] of window.__PeerConnectionManager._peers) {
        if (key.includes(active.callId)) {
          await peer.addScreenShare(screenStream);
        }
      }

      this._sendCallEvent('call:media_update', {
        callId:     active.callId,
        screenShare: true,
        timestamp:  Date.now(),
      });
    }

    // ── ICE Recovery ──────────────────────────────────────────────────────

    async restartICE(callId, peerId) {
      const peerSession = this._peers.getSession(peerId, callId);
      if (!peerSession) return;
      this._state.transition(callId, window.CALL_STATE.RECONNECTING);
      await peerSession.iceRestart();
    }

    // ── Private — Event attachment ────────────────────────────────────────

    _attachPeerEvents(peerSession, callId, peerId) {
      peerSession.onEvent(({ event, ...data }) => {
        switch (event) {
          case 'peer:connected':
            this._state.transition(callId, window.CALL_STATE.CONNECTED);
            this._attachRemoteMedia(peerSession, peerId);
            break;

          case 'peer:disconnected':
            if (data.state === 'failed') {
              this._state.transition(callId, window.CALL_STATE.RECONNECTING);
              this.restartICE(callId, peerId);
            }
            break;

          case 'remote:track_added':
            this._attachRemoteMedia(peerSession, peerId);
            break;

          case 'peer:destroyed':
            break;
        }
      });
    }

    _attachLocalPreview(localStream) {
      // Wire to existing local video element in calls.html
      const localVideo = document.getElementById('local-video')
        || document.getElementById('localVideo')
        || document.querySelector('[data-local-video]')
        || document.querySelector('.local-video');

      if (localVideo && localVideo.tagName === 'VIDEO') {
        localVideo.srcObject = localStream;
        localVideo.muted     = true;  // CRITICAL: always muted locally
        localVideo.autoplay  = true;
        localVideo.playsInline = true;
        console.log('[CallOrchestrator] Local preview attached');
      }
    }

    _attachRemoteMedia(peerSession, peerId) {
      const remoteStream = peerSession.getRemoteStream();
      if (!remoteStream || remoteStream.getTracks().length === 0) return;

      // FIX #7 — STRICT STREAM SEPARATION: get local stream to ensure we never bind it as remote
      const localStream = peerSession.getLocalStream();

      // FIX #8 — Wire audio tracks to dedicated hidden audio element (avoids autoplay block on video)
      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioEl = this._ensureRemoteAudioElement();
        if (audioEl.srcObject !== remoteStream) {
          audioEl.srcObject = remoteStream;
          audioEl.muted = false;
        }
        // Autoplay recovery
        audioEl.play().catch(err => {
          if (err.name === 'NotAllowedError') {
            const recover = () => audioEl.play().catch(() => {});
            document.addEventListener('click', recover, { once: true });
            document.addEventListener('touchstart', recover, { once: true, passive: true });
          }
        });
      }

      // Wire to existing remote video element — FIX #7: NEVER bind if element has local stream
      const remoteVideo = document.getElementById('remote-video')
        || document.getElementById('remoteVideo')
        || document.querySelector(`[data-remote-video="${peerId}"]`)
        || document.querySelector('[data-remote-video]')
        || document.querySelector('.remote-video');

      if (remoteVideo && remoteVideo.tagName === 'VIDEO') {
        // Safety check: if this element currently has local stream, do NOT overwrite it
        if (localStream && remoteVideo.srcObject === localStream) {
          console.warn('[CallOrchestrator] FIX#7 — Refused to overwrite local video with remote stream');
        } else {
          remoteVideo.srcObject = remoteStream; // remote stream — NOT local
          remoteVideo.autoplay = true;
          remoteVideo.playsInline = true;
          remoteVideo.muted = false;
          remoteVideo.play().catch(() => {});
          console.log(`[CallOrchestrator] Remote video attached for peer ${peerId}`);
        }
      }

      // Dispatch custom event so calls.html can wire its own UI
      window.dispatchEvent(new CustomEvent('kyn:call:remote_stream', {
        detail: { peerId, stream: remoteStream }
      }));
    }

    _clearRemoteMedia() {
      const remoteVideo = document.getElementById('remote-video')
        || document.getElementById('remoteVideo')
        || document.querySelector('[data-remote-video]');
      if (remoteVideo) { remoteVideo.srcObject = null; }

      const localVideo = document.getElementById('local-video')
        || document.getElementById('localVideo')
        || document.querySelector('[data-local-video]');
      if (localVideo) { localVideo.srcObject = null; }
    }

    // ── Private — Existing event system integration ────────────────────────

    _attachExistingCallListeners() {
      // These are dispatched by app.realtime.socket.js → kyn:call:* CustomEvents

      // FIX-DUPLICATE-ENGINE-3: this orchestrator auto-starts on every page (see
      // tryStart() below) and, like CallManager.js, was independently reacting to
      // the exact same kyn:call:* window events that drive the real call in
      // calls-core.js/calls-ui.js — the only system actually wired to the visible
      // call screens. That meant three things were running per real call at once
      // (calls-core.js, CallManager.js, and this orchestrator), each keeping its
      // own session/state and its own ~30–60s "ring timeout" (see _ringTimeoutMs
      // above), instead of calls-core.js's correct 3-minute
      // CALL_INVITATION_TIMEOUT. Whichever fired first won the shared UI. Worse,
      // the handlers below called this._media.stopAll() and re-emitted a real
      // 'call:end' signal purely in *reaction* to an event that already meant the
      // call had ended/been rejected — redundant at best, and capable of tearing
      // down live media early if _media pointed at tracks still in use. The
      // kyn:webrtc:signal handler also fed the same SDP/ICE signal into a second,
      // separate PeerConnectionManager instance in parallel with calls-core.js's
      // own negotiation, which could corrupt the real connection.
      // Disabling this listener block leaves calls-core.js as the sole driver of
      // real call lifecycle, signaling, and UI. This orchestrator's startCall()/
      // acceptCall() APIs remain available for direct, explicit use elsewhere if
      // ever wired up on purpose.
      //
      // window.addEventListener('kyn:call:incoming', e => {
      //   const data = e.detail || {};
      //   const { callId, callerId, callType } = data;
      //   if (!callId || !callerId) return;
      //
      //   // Deduplicate: ignore if already RINGING for this callId
      //   if (this._lastIncomingCallId === callId) return;
      //   this._lastIncomingCallId = callId;
      //   // Clear dedup after 30s
      //   setTimeout(() => { if (this._lastIncomingCallId === callId) this._lastIncomingCallId = null; }, 30000);
      //
      //   const session = this._state.createSession(callId, callType || 'audio', callerId, false);
      //   this._state.transition(callId, window.CALL_STATE.RINGING);
      //
      //   // Store metadata for accept
      //   session._inboundData = data;
      //
      //   console.log(`[CallOrchestrator] Incoming call: ${callId} from ${callerId}`);
      // });
      //
      // window.addEventListener('kyn:call:accepted', e => {
      //   const data = e.detail || {};
      //   const { callId, accepterId, userId } = data;
      //   const acceptorId = accepterId || userId;
      //   if (!callId || !acceptorId) return;
      //   this.onCallAccepted(callId, acceptorId, data);
      // });
      //
      // window.addEventListener('kyn:call:rejected', e => {
      //   const data   = e.detail || {};
      //   const callId = data.callId;
      //   if (!callId) return;
      //   if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; }
      //   this._state.end(callId, 'rejected');
      //   this._media.stopAll();
      // });
      //
      // window.addEventListener('kyn:call:ended', e => {
      //   const data   = e.detail || {};
      //   const callId = data.callId;
      //   if (!callId) return;
      //   this.endCall(callId, data.reason || 'remote_ended');
      // });
      //
      // window.addEventListener('kyn:call:cancelled', e => {
      //   const data   = e.detail || {};
      //   const callId = data.callId;
      //   if (!callId) return;
      //   if (this._ringTimer) { clearTimeout(this._ringTimer); this._ringTimer = null; }
      //   this._state.end(callId, 'cancelled');
      //   this._media.stopAll();
      // });
      //
      // // Handle webrtc:signal arriving for active call
      // window.addEventListener('kyn:webrtc:signal', e => {
      //   const data     = e.detail || {};
      //   const peerId   = data.senderId || data.from;
      //   const callId   = data.callId;
      //   if (!peerId || !callId) return;
      //
      //   window.__PeerConnectionManager.handleSignal(peerId, callId, data).catch(err => {
      //     console.warn('[CallOrchestrator] Signal error:', err.message);
      //   });
      // });

      // Reconnect recovery
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => {
          const active = this._state?.getActive();
          if (active && active.state === window.CALL_STATE?.RECONNECTING) {
            console.log('[CallOrchestrator] Socket reconnected during call — restoring signaling');
            // Re-announce presence in call room
            this._sendCallEvent('call:reconnect', {
              callId:    active.callId,
              peerId:    active.peerId,
              timestamp: Date.now(),
            });
          }
        });
      }
    }

    _sendCallEvent(eventType, payload) {
      // Use existing KynectaRealtime.send() which routes through existing socket
      const rt = window.KynectaRealtime;
      if (rt && typeof rt.send === 'function') {
        rt.send(eventType, payload);
        return;
      }
      // Fallback: direct socket emit
      const socket = rt?._socket;
      if (socket?.connected) {
        socket.emit(eventType, payload);
      }
    }

    _genCallId() {
      return 'call_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    getDiagnostics() {
      const active = this._state?.getActive();
      return {
        activeCall:  active ? { callId: active.callId, state: active.state, duration: active.duration } : null,
        peers:       this._peers?.getDiagnostics(),
        media:       this._media?.getDiagnostics(),
      };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const orchestrator = new WebRTCSessionOrchestrator();

  // Auto-start when dependencies are ready
  const tryStart = () => {
    if (window.__CallStateMachine && window.__PeerConnectionManager && window.__DeviceMediaManager) {
      orchestrator.start();
    } else {
      setTimeout(tryStart, 300);
    }
  };
  tryStart();

  window.__WebRTCSessionOrchestrator = orchestrator;
  window.CallOrchestrator = orchestrator;

  console.log('[CallOrchestrator] ✅ Ready');
})();