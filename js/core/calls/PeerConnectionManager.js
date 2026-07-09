/**
 * PeerConnectionManager.js
 * Phase 3 — Peer Connection Manager (Frontend)
 *
 * Production-grade WebRTC peer lifecycle:
 *  - Integrates with existing wsService.sendSignal() / webrtc:signal pipeline
 *  - Proper ICE candidate buffering and trickle ICE
 *  - Renegotiation storm prevention
 *  - Full cleanup: tracks, senders, transceivers, listeners, ICE state
 *  - Reconnect via ICE restart — NOT peer recreation (avoids black screens)
 *  - Remote stream isolation from local stream
 *
 * Signals flow through existing webSocketService.sendSignal(userId, payload)
 * which emits 'webrtc:signal' to the target user.
 *
 * @version 3.0.0
 * @phase 3 — WebRTC Engine
 */

(function () {
  'use strict';

  if (window.__PeerConnectionManager) return;

  // ─── VP9 Codec Preference Helper ─────────────────────────────────────────
  // Rewrites SDP to move VP9 to the front of the video codec preference list.
  // VP9 offers ~30% better compression than VP8 at same quality, reducing
  // bandwidth usage especially on mobile. Falls back gracefully if VP9 absent.
  function _preferVP9Codec(sdp) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    try {
      const lines = sdp.split('\r\n');
      let inVideoSection = false;
      let mLineIdx = -1;
      const codecPayloads = {}; // name → payload type

      // First pass: collect payload numbers for video codecs
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=video')) {
          inVideoSection = true;
          mLineIdx = i;
        } else if (lines[i].startsWith('m=') && !lines[i].startsWith('m=video')) {
          inVideoSection = false;
        }
        if (inVideoSection && lines[i].startsWith('a=rtpmap:')) {
          const match = lines[i].match(/^a=rtpmap:(\d+)\s+([^/]+)/);
          if (match) {
            codecPayloads[match[2].toUpperCase()] = match[1];
          }
        }
      }

      const vp9Pt = codecPayloads['VP9'];
      if (!vp9Pt || mLineIdx < 0) return sdp; // VP9 not available — return unchanged

      // Reorder the m=video line to put VP9 first
      const mLineParts = lines[mLineIdx].split(' ');
      const header = mLineParts.slice(0, 3); // m=video port RTP/SAVPF
      const payloads = mLineParts.slice(3);
      const reordered = [vp9Pt, ...payloads.filter(pt => pt !== vp9Pt)];
      lines[mLineIdx] = [...header, ...reordered].join(' ');

      return lines.join('\r\n');
    } catch (_) {
      return sdp; // Never fail on SDP manipulation
    }
  }

  // ─── Simulcast helper ─────────────────────────────────────────────────────
  // Adds 3-layer simulcast (high/medium/low) encoding parameters to video sender.
  // This allows the remote peer (or SFU) to subscribe to the appropriate layer
  // based on their bandwidth. No SFU required for hint delivery — it improves
  // adaptive quality even in P2P by letting the browser choose layers.
  async function _applySimulcastEncoding(pc) {
    try {
      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!videoSender) return;
      const params = videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [
          { rid: 'h', active: true, maxBitrate: 1200000, scaleResolutionDownBy: 1.0 },
          { rid: 'm', active: true, maxBitrate: 500000,  scaleResolutionDownBy: 2.0 },
          { rid: 'l', active: true, maxBitrate: 150000,  scaleResolutionDownBy: 4.0 },
        ];
      } else {
        // Already has encodings — ensure bandwidth caps
        if (params.encodings[0] && !params.encodings[0].maxBitrate) params.encodings[0].maxBitrate = 1200000;
      }
      await videoSender.setParameters(params);
    } catch (_) {} // Non-fatal — simulcast is a quality improvement, not required
  }




  const DEFAULT_ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };

  // ── IP Protection Mode (mDNS ICE candidate anonymization) ──────────────────
  // When enabled, replaces local IP addresses in ICE candidates with opaque
  // mDNS hostnames (e.g. "abc123.local"), preventing local IP leakage to peers.
  // Supported natively in Chrome 75+, Firefox 91+ via browser mDNS policy.
  var _ipProtectionEnabled = (function() {
    try { return localStorage.getItem('kyn_ip_protection') === '1'; } catch(_) { return false; }
  })();

  function setIPProtectionMode(enabled) {
    _ipProtectionEnabled = !!enabled;
    try { localStorage.setItem('kyn_ip_protection', enabled ? '1' : '0'); } catch(_) {}
    if (window._kynAnnounce) window._kynAnnounce(enabled ? 'IP protection on.' : 'IP protection off.');
    console.log('[PCM] IP protection mode:', enabled ? 'ON' : 'OFF');
  }

  window.KynIPProtection = {
    enable:    function() { setIPProtectionMode(true); },
    disable:   function() { setIPProtectionMode(false); },
    toggle:    function() { setIPProtectionMode(!_ipProtectionEnabled); },
    isEnabled: function() { return _ipProtectionEnabled; },
  };

  // TURN servers from environment (injected by server at page load)
  function getICEConfig() {
    const config = { ...DEFAULT_ICE_CONFIG };
    const turnServers = window.__kynTURN || window.__turnServers || [];
    if (turnServers.length) {
      config.iceServers = [...config.iceServers, ...turnServers];
    }
    // IP protection: restrict to relay-only when enabled, preventing host IP exposure
    if (_ipProtectionEnabled) {
      config.iceTransportPolicy = 'relay'; // Only relay (TURN) candidates — no host/srflx IP leakage
    }
    return config;
  }

  // ─── ICECandidateManager ─────────────────────────────────────────────────

  class ICECandidateManager {
    constructor() {
      this._buffer    = [];   // candidates buffered before remoteDesc set
      this._added     = new Set(); // dedup by candidate string
      this._hasRemote = false;
    }

    buffer(candidate) {
      this._buffer.push(candidate);
    }

    setRemoteReady() { this._hasRemote = true; }
    isRemoteReady()  { return this._hasRemote; }

    async drainTo(pc) {
      const pending = [...this._buffer];
      this._buffer  = [];
      for (const c of pending) {
        await this._addSafe(pc, c);
      }
    }

    async addTo(pc, candidate) {
      if (!this._hasRemote) {
        this.buffer(candidate);
        return;
      }
      await this._addSafe(pc, candidate);
    }

    reset() {
      this._buffer    = [];
      this._added     = new Set();
      this._hasRemote = false;
    }

    async _addSafe(pc, candidate) {
      if (!candidate || !candidate.candidate) return;
      const key = candidate.candidate;
      if (this._added.has(key)) return;
      this._added.add(key);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Ignore benign "cannot add candidate" errors after connection established
        if (!err.message?.includes('Wrong state')) {
          console.warn('[PeerConn] addIceCandidate error:', err.message);
        }
      }
    }
  }

  // ─── RenegotiationController ─────────────────────────────────────────────

  class RenegotiationController {
    constructor() {
      this._pending  = false;
      this._inFlight = false;
      this._queue    = [];
    }

    async withLock(fn) {
      if (this._inFlight) {
        return new Promise((resolve, reject) => {
          this._queue.push({ fn, resolve, reject });
        });
      }
      this._inFlight = true;
      try {
        const result = await fn();
        return result;
      } finally {
        this._inFlight = false;
        this._drainQueue();
      }
    }

    _drainQueue() {
      const next = this._queue.shift();
      if (!next) return;
      this.withLock(next.fn).then(next.resolve).catch(next.reject);
    }
  }

  // ─── PeerSession ─────────────────────────────────────────────────────────

  class PeerSession {
    constructor(peerId, callId, isInitiator, signalFn) {
      this.peerId      = peerId;
      this.callId      = callId;
      this.isInitiator = isInitiator;
      this._signal     = signalFn;  // fn(payload) — wraps sendSignal()

      this._pc          = null;
      this._localStream = null;
      this._remoteStream = new MediaStream(); // isolated remote stream
      this._iceMgr      = new ICECandidateManager();
      this._renego      = new RenegotiationController();
      this._senders     = new Map(); // kind → RTCSender
      this._listeners   = [];
      this._destroyed   = false;
      this._iceCandidateHandler = null;
    }

    // ── Setup ──────────────────────────────────────────────────────────────

    async init(localStream, iceConfig = null) {
      if (this._destroyed) throw new Error('Session destroyed');

      this._localStream = localStream;
      this._pc = new RTCPeerConnection(iceConfig || getICEConfig());

      this._attachPCListeners();

      // Add local tracks
      if (localStream) {
        for (const track of localStream.getTracks()) {
          const sender = this._pc.addTrack(track, localStream);
          this._senders.set(track.kind, sender);
        }
      }

      if (this.isInitiator) {
        await this._createAndSendOffer();
      }

      return this;
    }

    // ── Signal handling ────────────────────────────────────────────────────

    async handleSignal(signal) {
      if (this._destroyed) return;
      const { type, sdp, candidate, lamport } = signal;

      if (type === 'offer') {
        await this._renego.withLock(async () => {
          await this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
          this._iceMgr.setRemoteReady();
          await this._iceMgr.drainTo(this._pc);
          const answer = await this._pc.createAnswer();
          const sdpWithVP9 = _preferVP9Codec(answer.sdp);
          await this._pc.setLocalDescription({ type: answer.type, sdp: sdpWithVP9 });
          this._signal({ type: 'answer', sdp: sdpWithVP9, callId: this.callId });
        });
      } else if (type === 'answer') {
        await this._renego.withLock(async () => {
          await this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
          this._iceMgr.setRemoteReady();
          await this._iceMgr.drainTo(this._pc);
        });
      } else if (type === 'candidate') {
        await this._iceMgr.addTo(this._pc, candidate);
      } else if (type === 'ice_restart') {
        await this._iceRestart();
      }
    }

    // ── Track management ───────────────────────────────────────────────────

    async replaceTrack(kind, newTrack) {
      const sender = this._senders.get(kind);
      if (!sender) return;
      await this._renego.withLock(async () => {
        await sender.replaceTrack(newTrack);
        this._notify('track:replaced', { kind, track: newTrack });
      });
    }

    async addScreenShare(screenStream) {
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) return;
      await this._renego.withLock(async () => {
        const sender = this._pc.addTrack(videoTrack, screenStream);
        this._senders.set('screen', sender);
        await this._createAndSendOffer();
      });
    }

    // ── ICE Restart (reconnect without peer recreation) ───────────────────

    async iceRestart() {
      if (this._destroyed) return;
      console.log(`[PeerConn] ICE restart for peer ${this.peerId}`);
      await this._iceRestart();
    }

    async _iceRestart() {
      await this._renego.withLock(async () => {
        const offer = await this._pc.createOffer({ iceRestart: true });
        const sdpWithVP9 = _preferVP9Codec(offer.sdp);
        await this._pc.setLocalDescription({ type: offer.type, sdp: sdpWithVP9 });
        this._iceMgr.reset();
        this._signal({ type: 'offer', sdp: sdpWithVP9, callId: this.callId, iceRestart: true });
      });
    }

    // ── Remote stream ──────────────────────────────────────────────────────

    /**
     * Returns the isolated remote MediaStream.
     * NEVER returns local stream — guaranteed by design.
     */
    getRemoteStream() { return this._remoteStream; }
    getLocalStream()  { return this._localStream; }

    // ── Stats ──────────────────────────────────────────────────────────────

    async getStats() {
      if (!this._pc) return null;
      try {
        const stats = await this._pc.getStats();
        const result = { bytesReceived: 0, bytesSent: 0, packetsLost: 0, roundTripTime: 0 };
        stats.forEach(report => {
          if (report.type === 'inbound-rtp')  { result.bytesReceived += report.bytesReceived || 0; result.packetsLost += report.packetsLost || 0; }
          if (report.type === 'outbound-rtp') { result.bytesSent += report.bytesSent || 0; }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            result.roundTripTime = report.currentRoundTripTime || 0;
          }
        });
        return result;
      } catch (_) { return null; }
    }

    getConnectionState() { return this._pc?.connectionState || 'closed'; }
    getICEState()        { return this._pc?.iceConnectionState || 'closed'; }

    // ── Cleanup ────────────────────────────────────────────────────────────

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;

      console.log(`[PeerConn] Destroying peer session: ${this.peerId}`);

      // Remove all senders and stop their tracks
      for (const sender of this._senders.values()) {
        try { sender.track?.stop(); this._pc?.removeTrack(sender); } catch (_) {}
      }
      this._senders.clear();

      // Close all transceivers
      try {
        this._pc?.getTransceivers().forEach(t => { try { t.stop(); } catch (_) {} });
      } catch (_) {}

      // Remove PC listeners and close
      if (this._pc) {
        this._pc.ontrack           = null;
        this._pc.onicecandidate    = null;
        this._pc.onconnectionstatechange = null;
        this._pc.onsignalingstatechange  = null;
        this._pc.onnegotiationneeded     = null;
        this._pc.oniceconnectionstatechange = null;
        try { this._pc.close(); } catch (_) {}
        this._pc = null;
      }

      // Stop remote stream tracks
      this._remoteStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });

      this._iceMgr.reset();
      this._listeners = [];
      this._notify('peer:destroyed', { peerId: this.peerId });
    }

    onEvent(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachPCListeners() {
      const pc = this._pc;

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        this._signal({ type: 'candidate', candidate: candidate.toJSON(), callId: this.callId });
      };

      pc.ontrack = ({ track, streams }) => {
        // FIX #7 — CRITICAL: Add to isolated remote stream ONLY.
        // Remove any stale track of same kind first to prevent accumulation.
        this._remoteStream.getTracks()
          .filter(t => t.kind === track.kind && t.id !== track.id)
          .forEach(t => {
            this._remoteStream.removeTrack(t);
            try { t.stop(); } catch (_) {}
          });

        this._remoteStream.addTrack(track);

        track.onended = () => {
          this._remoteStream.removeTrack(track);
          this._notify('remote:track_ended', { kind: track.kind });
        };

        // FIX #7 — Verify we never accidentally have local tracks in remote stream
        if (this._localStream) {
          const localTrackIds = new Set(this._localStream.getTracks().map(t => t.id));
          this._remoteStream.getTracks().forEach(rt => {
            if (localTrackIds.has(rt.id)) {
              this._remoteStream.removeTrack(rt);
              console.warn('[PeerConn] FIX#7 — Removed local track accidentally added to remote stream');
            }
          });
        }

        this._notify('remote:track_added', { track, stream: this._remoteStream });
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        this._notify('peer:connection_state', { state, peerId: this.peerId });

        if (state === 'connected') {
          this._notify('peer:connected', { peerId: this.peerId });
        } else if (state === 'disconnected' || state === 'failed') {
          this._notify('peer:disconnected', { peerId: this.peerId, state });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'failed') {
          console.warn(`[PeerConn] ICE failed for ${this.peerId} — attempting restart`);
          this._iceRestart().catch(e => console.warn('[PeerConn] ICE restart failed:', e.message));
        }
        this._notify('peer:ice_state', { state, peerId: this.peerId });
      };

      pc.onsignalingstatechange = () => {
        this._notify('peer:signaling_state', { state: pc.signalingState });
      };

      pc.onnegotiationneeded = async () => {
        if (!this.isInitiator) return;
        try {
          await this._createAndSendOffer();
        } catch (err) {
          console.warn('[PeerConn] onnegotiationneeded offer failed:', err.message);
        }
      };
    }

    async _createAndSendOffer() {
      await this._renego.withLock(async () => {
        // Apply simulcast encoding hints before creating offer
        await _applySimulcastEncoding(this._pc);
        const offer = await this._pc.createOffer();
        const sdpWithVP9 = _preferVP9Codec(offer.sdp);
        await this._pc.setLocalDescription({ type: offer.type, sdp: sdpWithVP9 });
        this._signal({ type: 'offer', sdp: sdpWithVP9, callId: this.callId });
      });
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
    }
  }

  // ─── PeerConnectionManager (main) ─────────────────────────────────────────

  class PeerConnectionManager {
    constructor() {
      this._peers     = new Map();   // peerId:callId → PeerSession
      this._started   = false;
      // FIX-DUP-SIGNAL: incoming signals can reach handleSignal() via more
      // than one path (window 'kyn:webrtc:signal' CustomEvent AND the
      // KynectaEventBus 'SOCKET_EVENT' relay both fire for the same socket
      // message in some iframe/postMessage routing configurations). A
      // duplicate offer/answer applied twice throws InvalidStateError on
      // the RTCPeerConnection and a duplicate ICE candidate can confuse the
      // ICE agent. This map records a short-lived fingerprint of each
      // signal so duplicates are dropped before they reach the session.
      this._recentSignals = new Map(); // fingerprint → timestamp
    }

    _isDuplicateSignal(peerId, callId, signal) {
      const now = Date.now();
      for (const [fp, ts] of this._recentSignals) {
        if (now - ts > 4000) this._recentSignals.delete(fp);
      }
      const body = signal.type === 'candidate'
        ? JSON.stringify(signal.candidate || '')
        : (signal.sdp || '');
      const fingerprint = `${peerId}:${callId}:${signal.type}:${body}`;
      if (this._recentSignals.has(fingerprint)) return true;
      this._recentSignals.set(fingerprint, now);
      return false;
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._attachSignalListener();
      console.log('[PeerConn] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    async createSession(peerId, callId, isInitiator, localStream) {
      const key = `${peerId}:${callId}`;

      // Destroy any existing session for same peer (stale peer prevention)
      if (this._peers.has(key)) {
        this._peers.get(key).destroy();
        this._peers.delete(key);
      }

      const signalFn = payload => this._sendSignal(peerId, payload);
      const session  = new PeerSession(peerId, callId, isInitiator, signalFn);

      this._peers.set(key, session);
      await session.init(localStream);

      console.log(`[PeerConn] Session created: peer=${peerId} call=${callId} initiator=${isInitiator}`);
      return session;
    }

    getSession(peerId, callId) {
      const owned = this._peers.get(`${peerId}:${callId}`);
      if (owned) return owned;
      // FIX: this engine never actually owns the real peer connection in this app —
      // calls-core.js does. Return a read-only stats proxy over the real connection
      // so consumers like PeerHealthMonitor can still poll quality, without this
      // manager creating/negotiating a second, competing RTCPeerConnection.
      const realPc = window.__callsPeerConnection;
      if (!realPc) return null;
      return {
        // NOTE: intentionally no `_pc` here. AdaptiveBitrateEngine._onQualityChange()
        // uses session._pc to call applyProfile() (sender.setParameters for bitrate/
        // resolution caps) — js/adaptive-bitrate.js already does that exact job against
        // this same real connection on its own poll loop. Exposing _pc here would give
        // it a second, independent bitrate controller fighting over the same senders.
        // getStats() below is all PeerHealthMonitor actually needs for quality scoring.
        getStats: async () => {
          const report = await realPc.getStats();
          let rtt = 0, packetsLost = 0, bytesReceived = 0, jitter = 0;
          report.forEach(stat => {
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.currentRoundTripTime != null) {
              rtt = stat.currentRoundTripTime;
            }
            if (stat.type === 'inbound-rtp' && !stat.isRemote) {
              packetsLost   += stat.packetsLost || 0;
              bytesReceived += stat.bytesReceived || 0;
              jitter          = stat.jitter || jitter;
            }
          });
          return { roundTripTime: rtt, packetsLost, bytesReceived, jitter };
        },
      };
    }

    async handleSignal(peerId, callId, signal) {
      const session = this.getSession(peerId, callId);
      if (!session) {
        console.warn(`[PeerConn] No session for signal: peer=${peerId} call=${callId}`);
        return;
      }
      if (this._isDuplicateSignal(peerId, callId, signal)) {
        console.warn(`[PeerConn] Dropped duplicate ${signal.type} signal: peer=${peerId} call=${callId}`);
        return;
      }
      await session.handleSignal(signal);
    }

    destroySession(peerId, callId) {
      const key     = `${peerId}:${callId}`;
      const session = this._peers.get(key);
      if (session) {
        session.destroy();
        this._peers.delete(key);
      }
    }

    destroyAll() {
      for (const session of this._peers.values()) session.destroy();
      this._peers.clear();
    }

    getDiagnostics() {
      const sessions = [];
      for (const [key, session] of this._peers) {
        sessions.push({
          key,
          connectionState: session.getConnectionState(),
          iceState:        session.getICEState(),
        });
      }
      return { activeSessions: sessions.length, sessions };
    }

    // ── Private — Signal routing ─────────────────────────────────────────────

    _sendSignal(peerId, payload) {
      // Use existing wsService.sendSignal / KynectaRealtime.sendSignal
      const rt = window.KynectaRealtime;
      if (rt && typeof rt.sendSignal === 'function') {
        rt.sendSignal('webrtc:signal', { ...payload, targetUserId: peerId });
        return;
      }
      // Fallback: direct socket emit
      const socket = window.KynectaRealtime?._socket;
      if (socket?.connected) {
        socket.emit('webrtc:signal', { ...payload, targetUserId: peerId });
      }
    }

    _attachSignalListener() {
      // Listen for incoming webrtc:signal events from the existing event system
      // The existing socket layer dispatches these as kyn:webrtc:signal CustomEvents
      window.addEventListener('kyn:webrtc:signal', e => {
        const payload = e.detail || {};
        const { senderId, callId, type, sdp, candidate } = payload;
        if (!senderId || !callId) return;

        this.handleSignal(senderId, callId, payload).catch(err => {
          console.warn('[PeerConn] Signal handling error:', err.message);
        });
      });

      // Also listen on KynectaEventBus
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_EVENT', payload => {
          if (payload?.type === 'webrtc:signal' || payload?.type === 'webrtc_signal') {
            const { senderId, callId } = payload;
            if (senderId && callId) {
              this.handleSignal(senderId, callId, payload).catch(() => {});
            }
          }
        });
      }
    }

    // ── restartICEForAll ─────────────────────────────────────────────────────
    // Called after network reconnection to recover all active peer connections.
    async restartICEForAll() {
      const keys = Array.from(this._peers.keys());
      if (!keys.length) return;
      console.log(`[PeerConn] restartICEForAll — restarting ${keys.length} session(s)`);
      for (const key of keys) {
        const session = this._peers.get(key);
        if (session && typeof session.iceRestart === 'function') {
          try {
            await session.iceRestart();
          } catch (e) {
            console.warn(`[PeerConn] ICE restart failed for ${key}:`, e.message);
          }
        }
      }
    }

    // ── getActivePeerCount ───────────────────────────────────────────────────
    getActivePeerCount() { return this._peers.size; }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const mgr = new PeerConnectionManager();
  mgr.start();

  window.__PeerConnectionManager = mgr;
  window.PeerConnMgr = mgr;

  console.log('[PeerConn] ✅ Ready');
})();