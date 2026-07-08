/**
 * GroupCallEngine.js
 * Phase 3 — Group Call Engine (Frontend)
 *
 * Multi-participant call orchestration:
 *  - Per-participant PeerSession management
 *  - Dynamic grid layout updates
 *  - Active speaker detection
 *  - Participant mute/camera sync
 *  - Host controls (mute/remove)
 *  - Screen share broadcasting
 *  - Reconnect recovery per participant
 *
 * Integrates with existing group socket events:
 *   group:call:join, group:call:leave, group:call:participant_update
 *
 * @version 3.0.0
 * @phase 3 — Group Call
 */

(function () {
  'use strict';

  if (window.__GroupCallEngine) return;

  // ─── ParticipantState ─────────────────────────────────────────────────────

  const PARTICIPANT_STATE = Object.freeze({
    JOINING:      'JOINING',
    CONNECTED:    'CONNECTED',
    RECONNECTING: 'RECONNECTING',
    MUTED:        'MUTED',
    VIDEO_OFF:    'VIDEO_OFF',
    SCREEN_SHARE: 'SCREEN_SHARE',
    LEFT:         'LEFT',
  });

  class Participant {
    constructor(userId, displayName, isLocal = false) {
      this.userId      = String(userId);
      this.displayName = displayName || `User ${userId}`;
      this.isLocal     = isLocal;
      this.state       = PARTICIPANT_STATE.JOINING;
      this.muted       = false;
      this.videoOff    = false;
      this.screenShare = false;
      this.speaking    = false;
      this.stream      = null;
      this.audioLevel  = 0;
      this.joinedAt    = Date.now();
      this.quality     = 'GOOD'; // GOOD | FAIR | POOR
    }
  }

  // ─── ActiveSpeakerDetector ────────────────────────────────────────────────

  class ActiveSpeakerDetector {
    constructor(onSpeakerChange) {
      this._analyzerCtx    = null;
      this._analyzers      = new Map(); // userId → { analyser, source }
      this._onSpeakerChange = onSpeakerChange;
      this._current        = null;
      this._timer          = null;
    }

    addStream(userId, stream) {
      if (!stream || !stream.getAudioTracks().length) return;
      try {
        if (!this._analyzerCtx) {
          this._analyzerCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const source   = this._analyzerCtx.createMediaStreamSource(stream);
        const analyser = this._analyzerCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        this._analyzers.set(userId, { analyser, source, data: new Uint8Array(analyser.frequencyBinCount) });

        if (!this._timer) this._startPolling();
      } catch (_) {} // AudioContext not available in all environments
    }

    removeStream(userId) {
      const entry = this._analyzers.get(userId);
      if (entry) {
        try { entry.source.disconnect(); } catch (_) {}
        this._analyzers.delete(userId);
      }
      if (!this._analyzers.size && this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }

    _startPolling() {
      this._timer = setInterval(() => {
        let loudest = null;
        let maxLevel = 0;
        for (const [uid, entry] of this._analyzers) {
          entry.analyser.getByteFrequencyData(entry.data);
          const level = entry.data.reduce((s, v) => s + v, 0) / entry.data.length;
          if (level > maxLevel) { maxLevel = level; loudest = uid; }
        }
        if (maxLevel > 10 && loudest !== this._current) {
          this._current = loudest;
          this._onSpeakerChange(loudest, maxLevel);
        }
      }, 200);
    }

    stop() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      for (const entry of this._analyzers.values()) {
        try { entry.source.disconnect(); } catch (_) {}
      }
      this._analyzers.clear();
      try { this._analyzerCtx?.close(); } catch (_) {}
    }
  }

  // ─── GroupCallLayout ──────────────────────────────────────────────────────

  class GroupCallLayout {
    constructor(container) {
      this._container = container;
      this._tiles     = new Map(); // userId → tile element
      this._pinned    = null;
    }

    addTile(userId, stream, displayName, isLocal) {
      if (this._tiles.has(userId)) {
        this._updateStream(userId, stream);
        return;
      }

      const tile    = document.createElement('div');
      tile.className = `call-tile ${isLocal ? 'local-tile' : 'remote-tile'}`;
      tile.dataset.userId = userId;
      tile.innerHTML = `
        <video autoplay playsinline ${isLocal ? 'muted' : ''}></video>
        <div class="tile-label">${displayName}${isLocal ? ' (You)' : ''}</div>
        <div class="tile-indicators">
          <span class="mic-icon" data-muted="false">🎙</span>
          <span class="cam-icon" data-off="false">📷</span>
          <span class="signal-icon">📶</span>
        </div>
      `;

      const video   = tile.querySelector('video');
      video.srcObject = stream;
      video.muted   = !!isLocal;

      this._container?.appendChild(tile);
      this._tiles.set(userId, tile);
      this._reflow();
    }

    removeTile(userId) {
      const tile = this._tiles.get(userId);
      if (tile) {
        const video = tile.querySelector('video');
        if (video) { video.srcObject = null; }
        tile.remove();
        this._tiles.delete(userId);
      }
      if (this._pinned === userId) this._pinned = null;
      this._reflow();
    }

    updateIndicators(userId, { muted, videoOff, speaking, quality }) {
      const tile = this._tiles.get(userId);
      if (!tile) return;

      if (muted !== undefined) {
        const mic = tile.querySelector('.mic-icon');
        if (mic) { mic.dataset.muted = muted; mic.textContent = muted ? '🔇' : '🎙'; }
      }
      if (videoOff !== undefined) {
        const cam = tile.querySelector('.cam-icon');
        if (cam) { cam.dataset.off = videoOff; cam.textContent = videoOff ? '📷' : '🎥'; }
        const video = tile.querySelector('video');
        if (video) video.style.visibility = videoOff ? 'hidden' : 'visible';
      }
      if (speaking !== undefined) {
        tile.classList.toggle('speaking', !!speaking);
      }
      if (quality) {
        const sig = tile.querySelector('.signal-icon');
        const icons = { GOOD: '📶', FAIR: '📶', POOR: '📉' };
        if (sig) sig.textContent = icons[quality] || '📶';
      }
    }

    pinTile(userId) {
      this._pinned = userId;
      this._reflow();
    }

    _updateStream(userId, stream) {
      const tile = this._tiles.get(userId);
      if (!tile || !stream) return;
      const video = tile.querySelector('video');
      if (video) video.srcObject = stream;
    }

    _reflow() {
      if (!this._container) return;
      const count = this._tiles.size;
      const cols  = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
      this._container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

      if (this._pinned) {
        for (const [uid, tile] of this._tiles) {
          tile.classList.toggle('pinned', uid === this._pinned);
          tile.classList.toggle('thumbnail', uid !== this._pinned);
        }
      }
    }

    getTileCount() { return this._tiles.size; }
  }

  // ─── GroupCallEngine (main) ───────────────────────────────────────────────

  class GroupCallEngine {
    constructor() {
      this._participants  = new Map(); // userId → Participant
      this._callId        = null;
      this._groupId       = null;
      this._localUserId   = null;
      this._isHost        = false;
      this._layout        = null;
      this._speakerDetect = null;
      this._listeners     = [];
      this._started       = false;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    async joinGroupCall(groupId, callId, localUserId, options = {}) {
      this._callId      = callId;
      this._groupId     = groupId;
      this._localUserId = String(localUserId);
      this._isHost      = options.isHost || false;

      // Init layout
      const container = document.getElementById('group-call-grid')
        || document.getElementById('participants-grid')
        || document.querySelector('[data-call-grid]');
      this._layout = new GroupCallLayout(container);

      // Init speaker detection
      this._speakerDetect = new ActiveSpeakerDetector((speakerId, level) => {
        this._onActiveSpeaker(speakerId, level);
      });

      // Acquire local media
      const localStream = await window.__DeviceMediaManager.acquireMedia({
        audio: true,
        video: options.video !== false,
        quality: 'medium',
      });

      // Add local participant
      const localParticipant = new Participant(localUserId, options.displayName || 'You', true);
      localParticipant.state  = PARTICIPANT_STATE.CONNECTED;
      localParticipant.stream = localStream;
      this._participants.set(this._localUserId, localParticipant);
      this._layout.addTile(this._localUserId, localStream, 'You', true);

      // Announce join to server
      this._sendGroupEvent('group:call:join', {
        groupId, callId, userId: localUserId,
        audio: true, video: options.video !== false,
        timestamp: Date.now(),
      });

      this._attachGroupSocketListeners();
      this._startHealthMonitor();

      console.log(`[GroupCall] Joined: group=${groupId} call=${callId}`);
    }

    leaveGroupCall(reason = 'normal') {
      if (!this._callId) return;

      // Destroy all peer sessions
      for (const [uid] of this._participants) {
        if (uid !== this._localUserId) {
          window.__PeerConnectionManager.destroySession(uid, this._callId);
        }
      }

      this._sendGroupEvent('group:call:leave', {
        groupId: this._groupId,
        callId:  this._callId,
        userId:  this._localUserId,
        reason,
        timestamp: Date.now(),
      });

      this._speakerDetect?.stop();
      window.__DeviceMediaManager.stopAll();

      this._participants.clear();
      this._callId  = null;
      this._groupId = null;

      console.log('[GroupCall] Left call');
    }

    // FIX-HOST-ONLY-END: in a group call, tapping "End" should only ever
    // terminate the call for the person who tapped it (leaveGroupCall above
    // already does that correctly). Ending the call for *everyone* must be
    // restricted to the host — otherwise any single participant could hang
    // up the whole meeting for the rest of the group. The server authorizes
    // this the same way it already does for mute/remove (isHost(callId,
    // userId)) and broadcasts 'group:call:ended_by_host' to the room so
    // every other participant's client tears down on its own.
    endGroupCallForAll(reason = 'host_ended') {
      if (!this._callId) return;
      if (!this._isHost) {
        console.warn('[GroupCall] endGroupCallForAll() ignored — local user is not the host');
        return;
      }

      this._sendGroupEvent('group:call:end', {
        groupId: this._groupId,
        callId:  this._callId,
        reason,
        timestamp: Date.now(),
      });

      // Tear down locally too — the host doesn't get their own broadcast back.
      this.leaveGroupCall(reason);
    }

    isHost() { return !!this._isHost; }

    // ── Host controls ────────────────────────────────────────────────────────

    muteParticipant(userId) {
      if (!this._isHost) return;
      this._sendGroupEvent('group:call:mute_participant', {
        groupId: this._groupId, callId: this._callId, targetUserId: userId,
      });
    }

    removeParticipant(userId) {
      if (!this._isHost) return;
      this._sendGroupEvent('group:call:remove_participant', {
        groupId: this._groupId, callId: this._callId, targetUserId: userId,
      });
    }

    // ── Raise Hand ────────────────────────────────────────────────────────────
    raiseHand() {
      this._handRaised = true;
      this._sendGroupEvent('group:call:hand_raised', {
        groupId: this._groupId, callId: this._callId,
        userId: this._localUserId, timestamp: Date.now(),
      });
      this._notify('hand_raised', { userId: this._localUserId, raised: true });
      // Update local participant tile
      const local = this._participants.get(this._localUserId);
      if (local) { local.handRaised = true; this._layout?.updateIndicators(this._localUserId, { handRaised: true }); }
    }

    lowerHand() {
      this._handRaised = false;
      this._sendGroupEvent('group:call:hand_lowered', {
        groupId: this._groupId, callId: this._callId,
        userId: this._localUserId, timestamp: Date.now(),
      });
      this._notify('hand_lowered', { userId: this._localUserId, raised: false });
      const local = this._participants.get(this._localUserId);
      if (local) { local.handRaised = false; this._layout?.updateIndicators(this._localUserId, { handRaised: false }); }
    }

    toggleHand() {
      this._handRaised ? this.lowerHand() : this.raiseHand();
    }

    isHandRaised(userId) {
      if (!userId || userId === this._localUserId) return this._handRaised || false;
      const p = this._participants.get(String(userId));
      return !!(p && p.handRaised);
    }

    // Host: lower a participant's hand
    lowerParticipantHand(userId) {
      if (!this._isHost) return;
      this._sendGroupEvent('group:call:lower_hand', {
        groupId: this._groupId, callId: this._callId, targetUserId: userId,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    pinParticipant(userId) { this._layout?.pinTile(userId); }

    getParticipants() { return Array.from(this._participants.values()); }
    getParticipantCount() { return this._participants.size; }

    getDiagnostics() {
      return {
        callId:       this._callId,
        groupId:      this._groupId,
        participants: this._participants.size,
        isHost:       this._isHost,
      };
    }

    // ── Private — Participant management ─────────────────────────────────────

    async _onParticipantJoined(data) {
      const userId      = String(data.userId);
      const displayName = data.displayName || `User ${userId}`;
      if (userId === this._localUserId) return;

      const participant = new Participant(userId, displayName, false);
      this._participants.set(userId, participant);

      await this._connectToParticipant(userId, displayName, /* isInitiator */ true);
      this._notify('participant:joined', { userId, displayName });
      console.log(`[GroupCall] Participant joined: ${userId}`);
    }

    // FIX-MISSING-HANDLER (CRITICAL): the server sends
    // 'group:call:current_participants' to a NEW joiner immediately after
    // they join, listing everyone already in the call. There was no
    // listener for this event at all, so a new joiner never created a
    // PeerConnection session for any existing participant.
    //
    // Concretely, this meant group calls did not work for ANY call with 2+
    // people: when participant B joins after A, the server tells A about B
    // ('participant_joined') and A creates an initiator session and sends
    // B an SDP offer. But B never created a (non-initiator) session for A
    // — because nothing handled 'current_participants' — so
    // PeerConnectionManager.handleSignal() found no session for A's offer
    // and silently dropped it ("No session for signal" warning). A's
    // RTCPeerConnection stayed stuck in 'have-local-offer' forever and no
    // media ever connected. The bug was invisible in the UI because the
    // call screen itself rendered fine — only the underlying WebRTC
    // connection was dead.
    //
    // Fix: handle the event by creating a non-initiator session for each
    // existing participant (isInitiator=false — we wait for their offer,
    // matching the initiator side they already create via
    // _onParticipantJoined). This mirrors the connection symmetrically so
    // both directions of the mesh are actually wired up.
    async _onCurrentParticipants(data) {
      const list = Array.isArray(data?.participants) ? data.participants : [];
      for (const p of list) {
        const userId = String(p.userId);
        if (userId === this._localUserId || this._participants.has(userId)) continue;

        const displayName = p.displayName || `User ${userId}`;
        const participant = new Participant(userId, displayName, false);
        this._participants.set(userId, participant);

        await this._connectToParticipant(userId, displayName, /* isInitiator */ false);
        this._notify('participant:joined', { userId, displayName });
        console.log(`[GroupCall] Connected to existing participant: ${userId}`);
      }
    }

    async _connectToParticipant(userId, displayName, isInitiator) {
      const participant = this._participants.get(userId);
      try {
        const localStream = window.__DeviceMediaManager.getLocalStream();
        const peerSession = await window.__PeerConnectionManager.createSession(
          userId, this._callId, isInitiator, localStream
        );

        peerSession.onEvent(({ event, ...evData }) => {
          if (event === 'peer:connected') {
            participant.state = PARTICIPANT_STATE.CONNECTED;
          }
          if (event === 'remote:track_added') {
            participant.stream = evData.stream;
            this._layout.addTile(userId, evData.stream, displayName, false);
            this._speakerDetect?.addStream(userId, evData.stream);
            this._notify('participant:stream', { userId, stream: evData.stream });
          }
          if (event === 'peer:disconnected') {
            participant.state = PARTICIPANT_STATE.RECONNECTING;
            this._layout.updateIndicators(userId, { quality: 'POOR' });
          }
        });
      } catch (err) {
        console.warn(`[GroupCall] Failed to connect to ${userId}:`, err.message);
      }
    }

    _onParticipantLeft(data) {
      const userId = String(data.userId);
      if (userId === this._localUserId) return;

      window.__PeerConnectionManager.destroySession(userId, this._callId);
      this._speakerDetect?.removeStream(userId);
      this._layout.removeTile(userId);
      this._participants.delete(userId);
      this._notify('participant:left', { userId });
      console.log(`[GroupCall] Participant left: ${userId}`);
    }

    _onParticipantUpdate(data) {
      const userId      = String(data.userId);
      const participant = this._participants.get(userId);
      if (!participant) return;

      if (data.muted !== undefined)    participant.muted    = data.muted;
      if (data.videoOff !== undefined) participant.videoOff = data.videoOff;

      this._layout.updateIndicators(userId, {
        muted:    participant.muted,
        videoOff: participant.videoOff,
      });

      this._notify('participant:updated', { userId, ...data });
    }

    _onActiveSpeaker(speakerId, level) {
      for (const [uid, p] of this._participants) {
        p.speaking = uid === speakerId;
        this._layout.updateIndicators(uid, { speaking: p.speaking });
      }
      this._notify('speaker:changed', { speakerId, level });
    }

    // ── Private — Socket listeners ─────────────────────────────────────────

    _attachGroupSocketListeners() {
      window.addEventListener('kyn:group:call:participant_joined', e => {
        this._onParticipantJoined(e.detail || {});
      });
      window.addEventListener('kyn:group:call:participant_left', e => {
        this._onParticipantLeft(e.detail || {});
      });
      window.addEventListener('kyn:group:call:participant_update', e => {
        this._onParticipantUpdate(e.detail || {});
      });

      // FIX-MISSING-HANDLER (CRITICAL): see _onCurrentParticipants() above —
      // without this, new joiners never connected to anyone already in the
      // call. The server emits this once, right after 'group:call:join' is
      // acknowledged.
      window.addEventListener('kyn:group:call:current_participants', e => {
        this._onCurrentParticipants(e.detail || {});
      });

      // Host commands directed at us
      window.addEventListener('kyn:group:call:muted_by_host', e => {
        const data = e.detail || {};
        if (String(data.targetUserId) === this._localUserId) {
          window.__DeviceMediaManager.muteAudio(true);
          this._notify('muted_by_host', {});
        }
      });

      // ── Raise Hand events ────────────────────────────────────────────────
      window.addEventListener('kyn:group:call:hand_raised', e => {
        const data = e.detail || {};
        const uid = String(data.userId || '');
        if (!uid) return;
        const p = this._participants.get(uid);
        if (p) {
          p.handRaised = true;
          this._layout?.updateIndicators(uid, { handRaised: true });
        }
        this._notify('hand_raised', { userId: uid, raised: true });
      });

      window.addEventListener('kyn:group:call:hand_lowered', e => {
        const data = e.detail || {};
        const uid = String(data.userId || '');
        if (!uid) return;
        const p = this._participants.get(uid);
        if (p) {
          p.handRaised = false;
          this._layout?.updateIndicators(uid, { handRaised: false });
        }
        this._notify('hand_lowered', { userId: uid, raised: false });
      });

      window.addEventListener('kyn:group:call:lower_hand', e => {
        const data = e.detail || {};
        if (String(data.targetUserId) === this._localUserId) {
          this.lowerHand();
        }
      });

      // FIX-HOST-ONLY-END: server broadcasts this to every other participant
      // in the call room when the host ends the call for everyone. Each
      // participant tears down their own side the same way leaveGroupCall()
      // normally would — no signal back to the server needed, they're already
      // being removed from the room server-side.
      window.addEventListener('kyn:group:call:ended_by_host', e => {
        const data = e.detail || {};
        if (!this._callId || (data.callId && String(data.callId) !== String(this._callId))) return;
        console.log('[GroupCall] Host ended the call for everyone');
        this._notify('ended_by_host', { by: data.by });
        this.leaveGroupCall('host_ended');
      });
    }

    _startHealthMonitor() {
      setInterval(async () => {
        for (const [uid] of this._participants) {
          if (uid === this._localUserId) continue;
          const peerSession = window.__PeerConnectionManager.getSession(uid, this._callId);
          if (!peerSession) continue;

          const stats = await peerSession.getStats();
          if (!stats) continue;

          const quality = stats.packetsLost > 50 ? 'POOR'
                        : stats.packetsLost > 10 ? 'FAIR' : 'GOOD';

          const participant = this._participants.get(uid);
          if (participant && participant.quality !== quality) {
            participant.quality = quality;
            this._layout.updateIndicators(uid, { quality });
          }
        }
      }, 5000);
    }

    _sendGroupEvent(eventType, payload) {
      const rt = window.KynectaRealtime;
      if (rt && typeof rt.send === 'function') {
        rt.send(eventType, payload);
        return;
      }
      const socket = rt?._socket;
      if (socket?.connected) socket.emit(eventType, payload);
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
      try {
        window.dispatchEvent(new CustomEvent(`kyn:group:call:${event}`, { detail: data }));
      } catch (_) {}
    }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  window.__GroupCallEngine = new GroupCallEngine();
  window.GroupCall         = window.__GroupCallEngine;
  window.PARTICIPANT_STATE = PARTICIPANT_STATE;

  console.log('[GroupCall] ✅ Ready');
})();
