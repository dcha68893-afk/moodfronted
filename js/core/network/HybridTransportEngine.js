/**
 * HybridTransportEngine.js
 * Phase 2 — Hybrid Transport Engine (Frontend)
 *
 * Manages transport selection and automatic failover:
 *   Priority 1 → Internet (Socket.IO)
 *   Priority 2 → LAN WebSocket
 *   Priority 3 → Mesh relay
 *   Priority 4 → Offline queue
 *
 * NEVER breaks existing Socket.IO — wraps and extends it.
 *
 * @version 2.0.0
 * @phase 2 — Hybrid Transport
 */

(function () {
  'use strict';

  if (window.__HybridTransportEngine) return;

  const TRANSPORT = Object.freeze({
    INTERNET: 'INTERNET',
    LAN:      'LAN',
    MESH:     'MESH',
    OFFLINE:  'OFFLINE',
  });

  const TRANSPORT_PRIORITY = [
    TRANSPORT.INTERNET,
    TRANSPORT.LAN,
    TRANSPORT.MESH,
    TRANSPORT.OFFLINE,
  ];

  // ─── TransportHealthMonitor ──────────────────────────────────────────────

  class TransportHealthMonitor {
    constructor() {
      this._health = {
        [TRANSPORT.INTERNET]: { available: true,  latency: 0, failures: 0 },
        [TRANSPORT.LAN]:      { available: false, latency: 0, failures: 0 },
        [TRANSPORT.MESH]:     { available: false, latency: 0, failures: 0 },
        [TRANSPORT.OFFLINE]:  { available: true,  latency: 0, failures: 0 },
      };
    }

    record(transport, success, latencyMs = 0) {
      const h = this._health[transport];
      if (!h) return;
      if (success) {
        h.available = true;
        h.latency   = latencyMs;
        h.failures  = 0;
      } else {
        h.failures++;
        if (h.failures >= 3) h.available = false;
      }
    }

    isAvailable(transport) {
      return this._health[transport]?.available ?? false;
    }

    getLatency(transport) {
      return this._health[transport]?.latency ?? Infinity;
    }

    setAvailable(transport, val) {
      if (this._health[transport]) this._health[transport].available = val;
    }

    snapshot() { return JSON.parse(JSON.stringify(this._health)); }
  }

  // ─── NetworkCapabilityDetector ───────────────────────────────────────────

  class NetworkCapabilityDetector {
    detect() {
      return {
        internetAvailable: navigator.onLine !== false,
        lanAvailable:      this._detectLAN(),
        webRTCAvailable:   typeof RTCPeerConnection !== 'undefined',
        serviceWorker:     'serviceWorker' in navigator,
        indexedDB:         typeof indexedDB !== 'undefined',
        networkType:       navigator.connection?.effectiveType || 'unknown',
        downlink:          navigator.connection?.downlink || 0,
      };
    }

    _detectLAN() {
      const h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1' ||
        /^10\./.test(h) || /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h);
    }
  }

  // ─── TransportPriorityEngine ─────────────────────────────────────────────

  class TransportPriorityEngine {
    constructor(healthMonitor) {
      this._health = healthMonitor;
    }

    selectBest(preferredTransport = null) {
      if (preferredTransport && this._health.isAvailable(preferredTransport)) {
        return preferredTransport;
      }
      for (const t of TRANSPORT_PRIORITY) {
        if (this._health.isAvailable(t)) return t;
      }
      return TRANSPORT.OFFLINE;
    }

    rank() {
      return TRANSPORT_PRIORITY.filter(t => this._health.isAvailable(t));
    }

    // PHASE10: expose getAvailable so getAvailableTransports() works
    getAvailable() {
      return this.rank();
    }
  }

  // ─── TransportSwitchOrchestrator ─────────────────────────────────────────

  class TransportSwitchOrchestrator {
    constructor() {
      this._current   = TRANSPORT.INTERNET;
      this._previous  = null;
      this._switching = false;
      this._listeners = [];
      this._switchLog = [];
    }

    async switchTo(transport, reason = '') {
      if (transport === this._current || this._switching) return false;
      this._switching = true;
      this._previous  = this._current;
      this._current   = transport;

      const entry = { from: this._previous, to: transport, reason, ts: Date.now() };
      this._switchLog.push(entry);
      if (this._switchLog.length > 50) this._switchLog.shift();

      console.log(`[HybridTransport] Switching ${this._previous} → ${transport} (${reason})`);
      this._notify(entry);

      this._switching = false;
      return true;
    }

    getCurrent() { return this._current; }
    getPrevious() { return this._previous; }
    getLog()      { return [...this._switchLog]; }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _notify(entry) {
      for (const fn of this._listeners) {
        try { fn(entry); } catch (_) {}
      }
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SOCKET_EVENT', { type: 'transport:switched', ...entry }, { async: true });
    }
  }

  // ─── HybridTransportEngine (main) ────────────────────────────────────────

  class HybridTransportEngine {
    constructor() {
      this._health     = new TransportHealthMonitor();
      this._detector   = new NetworkCapabilityDetector();
      this._priority   = new TransportPriorityEngine(this._health);
      this._orchestrator = new TransportSwitchOrchestrator();
      this._caps       = {};
      this._running    = false;
    }

    start() {
      if (this._running) return;
      this._running = true;
      this._caps    = this._detector.detect();
      this._attachNetworkListeners();
      this._syncWithPhase1();
      this._startHealthPolling();
      console.log('[HybridTransport] ✅ Started — caps:', this._caps);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    getBestTransport()       { return this._priority.selectBest(); }
    getCurrentTransport()    { return this._orchestrator.getCurrent(); }
    isAvailable(t)           { return this._health.isAvailable(t); }
    getCapabilities()        { return { ...this._caps }; }
    getAvailableTransports() { return this._priority.getAvailable?.() || [this._priority.selectBest()]; }

    onTransportSwitch(fn) { return this._orchestrator.onChange(fn); }

    recordSuccess(transport, latencyMs) {
      this._health.record(transport, true, latencyMs);
    }

    recordFailure(transport) {
      this._health.record(transport, false);
      const best = this._priority.selectBest();
      if (best !== this._orchestrator.getCurrent()) {
        this._orchestrator.switchTo(best, `${transport}_failed`);
      }
    }

    getDiagnostics() {
      return {
        current:      this._orchestrator.getCurrent(),
        best:         this.getBestTransport(),
        capabilities: this._caps,
        health:       this._health.snapshot(),
        switchLog:    this._orchestrator.getLog().slice(-5),
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachNetworkListeners() {
      window.addEventListener('online',  () => {
        this._health.setAvailable(TRANSPORT.INTERNET, true);
        const best = this._priority.selectBest();
        this._orchestrator.switchTo(best, 'browser_online');
      });
      window.addEventListener('offline', () => {
        this._health.setAvailable(TRANSPORT.INTERNET, false);
        this._orchestrator.switchTo(this._priority.selectBest(), 'browser_offline');
      });
    }

    _syncWithPhase1() {
      const intel = window.__NetworkIntelligenceManager;
      if (!intel) return;
      // FIX-AUDIT-6: Debounce transport switches to prevent flapping on weak networks
      let _qualityDebounce = null;
      intel.onChange(state => {
        const inIframe = window.parent !== window;
        const available = inIframe
          ? navigator.onLine
          : (state.internetAvailable && state.internetQuality !== 'OFFLINE');
        this._health.setAvailable(TRANSPORT.INTERNET, available);
        this._health.record(TRANSPORT.INTERNET, available, state.estimatedLatency || 0);
        this._health.setAvailable(TRANSPORT.LAN, state.lanAvailable || false);

        // Debounce switch: only act if quality is consistently bad for 3s
        if (_qualityDebounce) clearTimeout(_qualityDebounce);
        _qualityDebounce = setTimeout(() => {
          _qualityDebounce = null;
          const best = this._priority.selectBest();
          if (best !== this._orchestrator.getCurrent()) {
            this._orchestrator.switchTo(best, 'network_quality_change');
          }
        }, 3000);
      });
    }

    _startHealthPolling() {
      setInterval(() => {
        // PHASE10: Poll actual connectivity state of all transports
        // Internet — check socket OR iframe bridge (child iframes use bridged socket)
        const socket = window.KynectaRealtime?._socket;
        const inIframe = window.parent !== window;
        const bridgeReady = window.__kynParentReady === true ||
                            window.KynectaRealtime?.state === 'authenticated' ||
                            window.KynectaRealtime?.isConnected?.() === true;

        // In iframes: trust the bridge state, not raw socket.connected
        const internetConnected = inIframe
          ? (navigator.onLine && (bridgeReady || true))  // iframe always has internet via parent
          : (socket ? socket.connected : navigator.onLine);

        this._health.record(TRANSPORT.INTERNET, internetConnected, 0);
        if (!internetConnected && this._orchestrator.getCurrent() === TRANSPORT.INTERNET) {
          this._orchestrator.switchTo(this._priority.selectBest(), 'socket_disconnected');
        }

        // LAN — check actual peers
        const lan = window.__LANCommunicationEngine;
        const hasLAN = lan?.hasPeers?.() === true;
        this._health.setAvailable(TRANSPORT.LAN, hasLAN);

        // Mesh — check relay connection
        const mesh = window.__MeshMessagesTransport || window.__MeshEngine;
        const hasMesh = !!(mesh?.isConnected?.() || (mesh?.peers?.size > 0));
        this._health.setAvailable(TRANSPORT.MESH, hasMesh);

        // Offline queue always available
        this._health.setAvailable(TRANSPORT.OFFLINE, true);

        // Switch if better transport available
        const best = this._priority.selectBest();
        if (best !== this._orchestrator.getCurrent()) {
          this._orchestrator.switchTo(best, 'health_poll');
        }
      }, 10000);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new HybridTransportEngine();
  engine.start();

  // ── Wire LAN peer availability into transport health ──────────────────
  // When LAN engine reports peers, mark LAN as available in health monitor
  const _watchLANPeers = () => {
    const lan = window.__LANCommunicationEngine;
    if (lan) {
      const hasPeers = lan.hasPeers?.() || false;
      engine._health.setAvailable(TRANSPORT.LAN, hasPeers);
    }
    // Check mesh relay health
    const mesh = window.__MeshMessagesTransport || window.__MeshEngine;
    if (mesh) {
      const meshReady = mesh.isConnected?.() || mesh.peers?.size > 0 || false;
      engine._health.setAvailable(TRANSPORT.MESH, meshReady);
    }
  };
  setInterval(_watchLANPeers, 5000);
  window.addEventListener('lan:peer_joined',  () => engine._health.setAvailable(TRANSPORT.LAN, true));
  window.addEventListener('lan:peer_left',    () => _watchLANPeers());
  window.addEventListener('lan:peer_list',    () => _watchLANPeers());

  // ── Expose recordSuccess / recordFailure for messages-core ────────────
  // PHASE10-FIX: _health uses record(t, success, latency) not recordSuccess/Failure
  engine.recordSuccess = function(transport, latencyMs) {
    try {
      if (this._health.record) this._health.record(transport, true, latencyMs || 0);
      else if (this._health.recordSuccess) this._health.recordSuccess(transport, latencyMs);
    } catch(_) {}
  };
  engine.recordFailure = function(transport) {
    try {
      if (this._health.record) this._health.record(transport, false);
      else if (this._health.recordFailure) this._health.recordFailure(transport);
    } catch(_) {}
  };

  // ── Expose getDiagnostics for ProductionMonitoringLayer ───────────────
  engine.getDiagnostics = function() {
    return {
      best:       this.getBestTransport(),
      current:    this.getCurrentTransport(),
      available:  this.getAvailableTransports(),
      lanPeers:   window.__LANCommunicationEngine?.getPeers?.()?.length || 0,
      meshPeers:  window.__MeshMessagesTransport?.peers?.size || 0,
      online:     navigator.onLine,
    };
  };

  window.__HybridTransportEngine = engine;
  window.HybridTransport = engine;
  window.TRANSPORT = TRANSPORT;

  console.log('[HybridTransport] ✅ Ready');
})();