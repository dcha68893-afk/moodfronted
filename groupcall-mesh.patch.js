/**
 * groupcall-mesh.patch.js — True multi-peer group calls for MoodChat
 *
 * The existing calls-core.js creates exactly ONE RTCPeerConnection regardless
 * of participant count, so group calls only worked between 2 people even when
 * more were signalled.
 *
 * This patch:
 *  1. Maintains a Map of RTCPeerConnections, one per remote participant.
 *  2. Intercepts WebSocket 'webrtc:offer', 'webrtc:answer', 'webrtc:ice'
 *     events and routes them to the correct peer connection by userId.
 *  3. On new participant joining, creates a new peer connection and offer.
 *  4. Renders each participant's stream into the existing #videoGrid layout
 *     (calls-ui.js already adjusts grid columns by count — we just feed it).
 *  5. Cleans up on participant leave / call end.
 *
 * Drop this file into the moodfronted repo root and add:
 *   <script src="groupcall-mesh.patch.js" defer></script>
 * AFTER calls-core.js and calls-ui.js in calls.html and any page that hosts calls.
 */

(function (global) {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  const _peers = new Map();          // userId → RTCPeerConnection
  const _streams = new Map();        // userId → MediaStream (remote)
  let   _localStream = null;
  let   _isGroupCall = false;
  let   _currentCallId = null;
  let   _iceConfig = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _log(msg, ...args) { console.log(`[GroupCallMesh] ${msg}`, ...args); }
  function _warn(msg, ...args) { console.warn(`[GroupCallMesh] ${msg}`, ...args); }

  function _authHeaders() {
    const t = global.authToken
      || sessionStorage.getItem('kynecta_auth_token')
      || localStorage.getItem('authToken') || '';
    return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' }
             : { 'Content-Type': 'application/json' };
  }

  function _sendSignal(type, targetUserId, payload) {
    // Use existing KynectaRealtime / socket if available
    const rt = global.KynectaRealtime || global._kynectaRealtime;
    if (rt && typeof rt.emit === 'function') {
      rt.emit(type, { ...payload, targetUserId, callId: _currentCallId });
      return;
    }
    // Fallback: HTTP signalling
    const base = global.API_BASE_URL || '';
    fetch(`${base}/api/calls/signal`, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ type, targetUserId, callId: _currentCallId, payload })
    }).catch(e => _warn('Signal send failed:', e.message));
  }

  // ── Create peer connection for one participant ────────────────────────────
  function _createPeer(userId, isInitiator) {
    if (_peers.has(userId)) return _peers.get(userId);

    const config = _iceConfig || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(config);
    _peers.set(userId, pc);

    // Add local tracks
    if (_localStream) {
      _localStream.getTracks().forEach(t => pc.addTrack(t, _localStream));
    }

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) _sendSignal('webrtc:ice', userId, { candidate });
    };

    // Remote stream → render
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      _streams.set(userId, stream);
      _renderParticipant(userId, stream);
    };

    pc.onconnectionstatechange = () => {
      _log(`Peer ${userId} state: ${pc.connectionState}`);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        _removePeer(userId);
      }
    };

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => _sendSignal('webrtc:offer', userId, { sdp: pc.localDescription }))
        .catch(e => _warn('Create offer failed for', userId, e.message));
    }

    _log(`Peer connection created for user ${userId} (initiator=${isInitiator})`);
    return pc;
  }

  // ── Render a participant tile into #videoGrid ─────────────────────────────
  function _renderParticipant(userId, stream) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;

    // Remove old tile if exists
    const old = document.getElementById(`participant-tile-${userId}`);
    if (old) old.remove();

    const tile = document.createElement('div');
    tile.id = `participant-tile-${userId}`;
    tile.className = 'video-container remote-video-container';
    tile.style.cssText = 'position:relative;border-radius:12px;overflow:hidden;background:#1a1a2e;';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;';

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:8px;left:8px;color:#fff;font-size:12px;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:10px;';
    label.textContent = `User ${userId}`;

    tile.appendChild(video);
    tile.appendChild(label);
    grid.appendChild(tile);

    // Update grid layout
    const count = grid.children.length;
    grid.style.gridTemplateColumns = count <= 1 ? '1fr'
      : count <= 2 ? 'repeat(2,1fr)'
      : count <= 4 ? 'repeat(2,1fr)'
      : 'repeat(3,1fr)';

    _log(`Rendered tile for user ${userId} (${count} total tiles)`);
  }

  // ── Remove a peer when they leave ────────────────────────────────────────
  function _removePeer(userId) {
    const pc = _peers.get(userId);
    if (pc) { try { pc.close(); } catch (_) {} _peers.delete(userId); }
    _streams.delete(userId);
    const tile = document.getElementById(`participant-tile-${userId}`);
    if (tile) tile.remove();
    _log(`Peer ${userId} removed`);
  }

  // ── Cleanup all peers (call ended) ───────────────────────────────────────
  function _cleanup() {
    _peers.forEach((pc, uid) => { try { pc.close(); } catch (_) {} });
    _peers.clear();
    _streams.clear();
    _localStream = null;
    _isGroupCall = false;
    _currentCallId = null;
    document.querySelectorAll('[id^="participant-tile-"]').forEach(el => el.remove());
    _log('All peers cleaned up');
  }

  // ── WebSocket signal routing ──────────────────────────────────────────────
  async function _handleOffer(fromUserId, sdp) {
    if (!_isGroupCall) return;
    const pc = _createPeer(fromUserId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    _sendSignal('webrtc:answer', fromUserId, { sdp: pc.localDescription });
  }

  async function _handleAnswer(fromUserId, sdp) {
    if (!_isGroupCall) return;
    const pc = _peers.get(fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async function _handleIce(fromUserId, candidate) {
    if (!_isGroupCall) return;
    const pc = _peers.get(fromUserId);
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
  }

  // ── Intercept existing socket events ─────────────────────────────────────
  // We listen on document-level custom events that calls-core already fires,
  // and also directly on the KynectaRealtime socket if accessible.
  function _hookSocket() {
    const rt = global.KynectaRealtime || global._kynectaRealtime;
    if (!rt || typeof rt.on !== 'function') {
      // Retry in 2s — socket might not be connected yet
      setTimeout(_hookSocket, 2000);
      return;
    }

    rt.on('webrtc:offer', async (data) => {
      if (!_isGroupCall) return;
      const { fromUserId, sdp } = data;
      await _handleOffer(fromUserId, sdp).catch(e => _warn('Offer handler failed:', e.message));
    });

    rt.on('webrtc:answer', async (data) => {
      if (!_isGroupCall) return;
      const { fromUserId, sdp } = data;
      await _handleAnswer(fromUserId, sdp).catch(e => _warn('Answer handler failed:', e.message));
    });

    rt.on('webrtc:ice', async (data) => {
      if (!_isGroupCall) return;
      const { fromUserId, candidate } = data;
      await _handleIce(fromUserId, candidate).catch(() => {});
    });

    rt.on('call:participant:joined', (data) => {
      if (!_isGroupCall) return;
      const { userId, callId } = data;
      if (callId !== _currentCallId) return;
      _log(`Participant joined: ${userId}`);
      _createPeer(userId, true); // we are initiator when someone new joins
    });

    rt.on('call:participant:left', (data) => {
      const { userId } = data;
      _removePeer(userId);
    });

    rt.on('call:ended', _cleanup);

    _log('Socket hooks installed');
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // Called by calls-core when a group call starts (we monkey-patch the event)
  async function startMesh(callId, participants, localStream, iceConfig) {
    _currentCallId = callId;
    _isGroupCall   = true;
    _localStream   = localStream;
    _iceConfig     = iceConfig || null;

    _log(`Starting mesh for call ${callId} with ${participants.length} participants`);

    // Create a peer for each existing participant (we are initiator)
    for (const p of participants) {
      const uid = typeof p === 'object' ? (p.id || p.userId) : p;
      if (uid) _createPeer(String(uid), true);
    }
  }

  function stopMesh() { _cleanup(); }

  global.KynectaGroupCallMesh = { startMesh, stopMesh };

  // ── Auto-wire to calls-core events ───────────────────────────────────────
  document.addEventListener('calls:groupCallStarted', async (e) => {
    const { callId, participants, localStream, iceServers } = e.detail || {};
    if (!callId || !participants) return;
    await startMesh(callId, participants, localStream, iceServers ? { iceServers } : null);
  });

  document.addEventListener('calls:callEnded', _cleanup);
  document.addEventListener('calls:reset',     _cleanup);

  // Hook socket when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _hookSocket);
  } else {
    _hookSocket();
  }

  _log('✅ Loaded');

})(window);
