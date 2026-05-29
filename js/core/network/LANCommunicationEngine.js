/**
 * LANCommunicationEngine.js
 * Phase 2 — LAN Communication Engine (Frontend)
 *
 * Enables messaging on the same WiFi/campus network WITHOUT internet:
 *  - Discovers LAN peers via server-assisted mDNS/subnet detection
 *  - Establishes direct WebSocket connections to local relay nodes
 *  - Falls back to hybrid internet routing when LAN unavailable
 *  - Transparent to the user — messages just work
 *
 * @version 2.0.0
 * @phase 2 — LAN Engine
 */

(function () {
  'use strict';

  if (window.__LANCommunicationEngine) return;

  const LAN_PROBE_INTERVAL_MS = 30000;
  const LAN_CONNECT_TIMEOUT   = 5000;
  const MAX_LAN_PEERS         = 8;

  // ─── SubnetDetector ──────────────────────────────────────────────────────

  class SubnetDetector {
    detect() {
      const h = window.location.hostname;
      return {
        isLAN:       this._isPrivateHost(h),
        isSameSubnet: this._isPrivateHost(h),
        hostname:    h,
        protocol:    window.location.protocol,
      };
    }

    _isPrivateHost(h) {
      return h === 'localhost' || h === '127.0.0.1' ||
        /^10\./.test(h) || /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h);
    }

    /** Use WebRTC ICE gathering to detect LAN IP */
    async detectLocalIP() {
      return new Promise(resolve => {
        try {
          const pc = new RTCPeerConnection({ iceServers: [] });
          pc.createDataChannel('');
          pc.createOffer().then(offer => pc.setLocalDescription(offer));
          pc.onicecandidate = e => {
            if (!e.candidate) return;
            const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (match && match[1] !== '0.0.0.0') {
              pc.close();
              resolve(match[1]);
            }
          };
          setTimeout(() => { pc.close(); resolve(null); }, 3000);
        } catch (_) { resolve(null); }
      });
    }
  }

  // ─── LANPeer ─────────────────────────────────────────────────────────────

  class LANPeer {
    constructor(peerId, wsUrl) {
      this.peerId    = peerId;
      this.wsUrl     = wsUrl;
      this.ws        = null;
      this.connected = false;
      this.latency   = 0;
      this._pingTs   = null;
    }

    async connect() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.ws?.close();
          reject(new Error(`LAN peer ${this.peerId} timeout`));
        }, LAN_CONNECT_TIMEOUT);

        try {
          this.ws = new WebSocket(this.wsUrl);

          this.ws.onopen = () => {
            clearTimeout(timer);
            this.connected = true;
            this._ping();
            resolve(this);
          };

          this.ws.onmessage = e => this._onMessage(e.data);

          this.ws.onclose = () => {
            this.connected = false;
          };

          this.ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`LAN peer ${this.peerId} connection error`));
          };
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      });
    }

    send(payload) {
      if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return false;
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch (_) { return false; }
    }

    close() {
      this.connected = false;
      this.ws?.close();
    }

    _ping() {
      if (!this.connected) return;
      this._pingTs = Date.now();
      this.send({ type: '__ping', ts: this._pingTs });
      setTimeout(() => this._ping(), 20000);
    }

    _onMessage(raw) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === '__pong' && this._pingTs) {
          this.latency = Date.now() - this._pingTs;
        }
      } catch (_) {}
    }
  }

  // ─── LANPeerDiscovery ───────────────────────────────────────────────────

  class LANPeerDiscovery {
    constructor() {
      this._peers     = new Map(); // peerId -> LANPeer
      this._localIP   = null;
      this._listeners = [];
    }

    async discover(registeredPeers = []) {
      const newPeers = [];
      for (const peerInfo of registeredPeers) {
        if (this._peers.has(peerInfo.id)) continue;
        if (this._peers.size >= MAX_LAN_PEERS) break;

        const peer = new LANPeer(peerInfo.id, peerInfo.wsUrl);
        try {
          await peer.connect();
          this._peers.set(peerInfo.id, peer);
          newPeers.push(peer);
          console.log(`[LAN] Connected to peer: ${peerInfo.id} @ ${peerInfo.wsUrl}`);
          this._notify(peer, 'connected');
        } catch (err) {
          console.debug(`[LAN] Peer ${peerInfo.id} unreachable: ${err.message}`);
        }
      }
      return newPeers;
    }

    getConnected() {
      return Array.from(this._peers.values()).filter(p => p.connected);
    }

    getBestPeer() {
      const connected = this.getConnected();
      if (!connected.length) return null;
      return connected.sort((a, b) => a.latency - b.latency)[0];
    }

    onPeerEvent(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _notify(peer, event) {
      this._listeners.forEach(fn => { try { fn({ event, peer }); } catch (_) {} });
    }

    removeStalePeers() {
      for (const [id, peer] of this._peers) {
        if (!peer.connected) {
          this._peers.delete(id);
          this._notify(peer, 'disconnected');
        }
      }
    }
  }

  // ─── LANCommunicationEngine (main) ──────────────────────────────────────

  class LANCommunicationEngine {
    constructor() {
      this._subnet    = new SubnetDetector();
      this._discovery = new LANPeerDiscovery();
      this._enabled   = false;
      this._probeTimer = null;
      this._localIP   = null;
    }

    async start() {
      const caps = this._subnet.detect();

      // Detect local IP for LAN announcement
      this._localIP = await this._subnet.detectLocalIP();
      if (this._localIP) {
        console.log(`[LAN] Local IP: ${this._localIP}`);
      }

      // Announce to server that we're LAN-capable
      this._announceToServer();

      // Start peer probing
      this._probePeers();
      this._probeTimer = setInterval(() => this._probePeers(), LAN_PROBE_INTERVAL_MS);

      // Listen for server-pushed peer lists
      this._attachServerListener();

      this._enabled = true;
      console.log('[LAN] ✅ Started — LAN:', caps.isLAN);
    }

    stop() {
      if (this._probeTimer) clearInterval(this._probeTimer);
      this._discovery.getConnected().forEach(p => p.close());
      this._enabled = false;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    isEnabled()       { return this._enabled; }
    hasPeers()        { return this._discovery.getConnected().length > 0; }
    getBestPeer()     { return this._discovery.getBestPeer(); }
    getPeers()        { return this._discovery.getConnected(); }

    getDiagnostics() {
      const peers = this._discovery.getConnected();
      return {
        enabled:    this._enabled,
        peerCount:  peers.length,
        peers:      peers.map(p => ({ id: p.id, latency: p.latency, connected: p.connected })),
        subnetKey:  this._subnetKey,
      };
    }

    /**
     * Send a message via LAN.
     * Tries direct WebSocket first; falls back to server relay for AP-isolated peers.
     * Returns false if no LAN peers available.
     */
    send(payload) {
      const peer = this._discovery.getBestPeer();
      if (!peer) return false;
      // Try direct WS
      const sent = peer.send({ type: 'relay:message', payload });
      if (sent) return true;
      // Fallback: relay via server for AP-isolated networks
      const socket = window.KynectaRealtime?._socket;
      if (socket?.connected && peer.socketId) {
        socket.emit('lan:relay_message', { targetSocketId: peer.socketId, payload });
        return true;
      }
      return false;
    }

    onPeerChange(fn) { return this._discovery.onPeerEvent(fn); }

    getDiagnostics() {
      return {
        enabled:    this._enabled,
        localIP:    this._localIP,
        peers:      this._discovery.getConnected().length,
        bestLatency: this._discovery.getBestPeer()?.latency || null,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    async _probePeers() {
      this._discovery.removeStalePeers();
      const peers = this._fetchRegisteredPeers();
      if (peers.length) await this._discovery.discover(peers);
    }

    _fetchRegisteredPeers() {
      // Peer list is pushed from server via socket event (see backend LANDiscoveryService)
      return window.__lanPeerList || [];
    }

    _announceToServer() {
      const socket = window.KynectaRealtime?._socket;
      if (!socket || !socket.connected) return;

      const identity = window.__IdentityFoundationLayer?.getIdentity();
      const userId = localStorage.getItem('currentUserId') ||
                     window._currentUserId ||
                     identity?.userId || null;
      socket.emit('lan:announce', {
        deviceId:  identity?.deviceId || null,
        userId:    userId,
        localIP:   this._localIP,
        subnetKey: this._subnetKey,
        socketId:  socket.id,
        wsPort:    null, // future: local WS server port
        timestamp: Date.now(),
      });
    }

    _attachServerListener() {
      const bus = window.KynectaEventBus;
      if (!bus) return;

      bus.on('SOCKET_EVENT', payload => {
        if (payload?.type === 'lan:peer_list') {
          window.__lanPeerList = payload.peers || [];
          this._probePeers();
        }
        if (payload?.type === 'socket:reconnected' || payload?.type === 'socket:connected') {
          setTimeout(() => this._announceToServer(), 1000);
        }
      });
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new LANCommunicationEngine();
  engine.start().catch(e => console.warn('[LAN] Start error:', e.message));

  window.__LANCommunicationEngine = engine;
  window.LANEngine = engine;

  console.log('[LAN] ✅ Ready');
})();