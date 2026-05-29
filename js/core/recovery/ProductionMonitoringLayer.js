/**
 * ProductionMonitoringLayer.js
 * Phase 5 — Monitoring + Diagnostics Layer (Frontend)
 *
 * Full production observability for MoodChat:
 *  - Structured telemetry (timestamp, deviceId, transport, latency, etc.)
 *  - Reconnect failure tracking
 *  - Call drop tracking
 *  - Queue health metrics
 *  - Message latency histograms
 *  - Memory pressure alerts
 *  - Internal diagnostics panel (NOT user-facing)
 *  - BroadcastChannel health summary to leader tab
 *
 * Extends Phase 1 MonitoringFoundation — adds Phase 5 metrics.
 * Private logs only — never exposes message content.
 *
 * @version 5.0.0
 * @phase 5 — Monitoring
 */

(function () {
  'use strict';

  if (window.__ProductionMonitoringLayer) return;

  // ─── StructuredLogger ─────────────────────────────────────────────────────

  class StructuredLogger {
    constructor(maxEntries = 2000) {
      this._entries = [];
      this._max     = maxEntries;
    }

    log(category, event, meta = {}) {
      const entry = {
        ts:          Date.now(),
        category,
        event,
        deviceId:    window.__SecurityLayer?.getMyDevice()?.deviceId || null,
        transport:   window.__HybridTransportEngine?.getCurrentTransport() || null,
        recovery:    window.__ReconnectOrchestrator?.getState() || null,
        ...this._sanitize(meta),
      };
      this._entries.push(entry);
      if (this._entries.length > this._max) this._entries.shift();
      return entry;
    }

    query(category, limit = 100) {
      return this._entries
        .filter(e => !category || e.category === category)
        .slice(-limit);
    }

    getAll(limit = 200) { return this._entries.slice(-limit); }
    size()              { return this._entries.length; }

    /** Strip sensitive content — NEVER log message text or media URLs */
    _sanitize(meta) {
      const safe = { ...meta };
      delete safe.content;
      delete safe.text;
      delete safe.body;
      delete safe.message;
      delete safe.password;
      delete safe.token;
      delete safe.key;
      delete safe.mediaUrl;
      delete safe.thumbnailUrl;
      return safe;
    }
  }

  // ─── LatencyHistogram ────────────────────────────────────────────────────

  class LatencyHistogram {
    constructor(buckets = [50, 100, 250, 500, 1000, 3000]) {
      this._buckets = buckets;
      this._counts  = new Array(buckets.length + 1).fill(0);
      this._total   = 0;
      this._sum     = 0;
    }

    record(ms) {
      this._total++;
      this._sum += ms;
      for (let i = 0; i < this._buckets.length; i++) {
        if (ms <= this._buckets[i]) { this._counts[i]++; return; }
      }
      this._counts[this._counts.length - 1]++;
    }

    p50()  { return this._percentile(0.50); }
    p95()  { return this._percentile(0.95); }
    p99()  { return this._percentile(0.99); }
    avg()  { return this._total ? Math.round(this._sum / this._total) : 0; }
    count(){ return this._total; }

    _percentile(p) {
      const target = Math.ceil(this._total * p);
      let cumulative = 0;
      for (let i = 0; i < this._buckets.length; i++) {
        cumulative += this._counts[i];
        if (cumulative >= target) return this._buckets[i];
      }
      return this._buckets[this._buckets.length - 1];
    }

    snapshot() {
      return {
        p50: this.p50(), p95: this.p95(), p99: this.p99(),
        avg: this.avg(), count: this.count(),
      };
    }
  }

  // ─── MetricCounters ──────────────────────────────────────────────────────

  class MetricCounters {
    constructor() { this._c = {}; }
    inc(key, by = 1)  { this._c[key] = (this._c[key] || 0) + by; }
    set(key, val)     { this._c[key] = val; }
    get(key)          { return this._c[key] || 0; }
    all()             { return { ...this._c }; }
  }

  // ─── ReliabilityTracker ──────────────────────────────────────────────────

  class ReliabilityTracker {
    constructor() {
      this._reconnects   = [];
      this._callDrops    = [];
      this._queueFails   = [];
      this._syncConflicts = [];
    }

    recordReconnect(state, durationMs) {
      this._reconnects.push({ ts: Date.now(), state, durationMs });
      if (this._reconnects.length > 100) this._reconnects.shift();
    }

    recordCallDrop(callId, reason, duration) {
      this._callDrops.push({ ts: Date.now(), callId, reason, duration });
      if (this._callDrops.length > 50) this._callDrops.shift();
    }

    recordQueueFail(opId, type, reason) {
      this._queueFails.push({ ts: Date.now(), opId, type, reason });
      if (this._queueFails.length > 50) this._queueFails.shift();
    }

    recordSyncConflict(entityType, id) {
      this._syncConflicts.push({ ts: Date.now(), entityType, id });
      if (this._syncConflicts.length > 50) this._syncConflicts.shift();
    }

    getSummary() {
      const now = Date.now();
      const hour = 60 * 60 * 1000;
      return {
        reconnectsLastHour:    this._reconnects.filter(r => now - r.ts < hour).length,
        callDropsLastHour:     this._callDrops.filter(r => now - r.ts < hour).length,
        queueFailsLastHour:    this._queueFails.filter(r => now - r.ts < hour).length,
        syncConflictsLastHour: this._syncConflicts.filter(r => now - r.ts < hour).length,
        totalReconnects:       this._reconnects.length,
        recentCallDrops:       this._callDrops.slice(-5),
      };
    }
  }

  // ─── ProductionMonitoringLayer (main) ─────────────────────────────────────

  class ProductionMonitoringLayer {
    constructor() {
      this._logger      = new StructuredLogger();
      this._latency     = new LatencyHistogram();
      this._counters    = new MetricCounters();
      this._reliability = new ReliabilityTracker();
      this._started     = false;
    }

    start() {
      if (this._started) return;
      this._started = true;

      this._attachEventListeners();
      this._startPeriodicCollection();
      this._extendPhase1Monitoring();

      // Expose global debug command
      window.__MoodChatDiag = () => this.printDiagnostics();
      window.__MoodChatExport = () => this.exportJSON();

      console.log('[ProductionMonitor] ✅ Started — run __MoodChatDiag() for full snapshot');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    log(category, event, meta)   { return this._logger.log(category, event, meta); }
    inc(key, by = 1)             { this._counters.inc(key, by); }
    recordLatency(ms)            { this._latency.record(ms); }
    recordReconnect(state, dur)  { this._reliability.recordReconnect(state, dur); }
    recordCallDrop(id, reason, dur) { this._reliability.recordCallDrop(id, reason, dur); }

    getSnapshot() {
      return {
        ts:          new Date().toISOString(),
        deviceId:    window.__SecurityLayer?.getMyDevice()?.deviceId,
        recovery:    window.__ReconnectOrchestrator?.getDiagnostics(),
        security:    window.__SecurityLayer?.getDiagnostics(),
        queue:       window.__DurableQueueLayer?.getDiagnostics(),
        bgReliability: window.__BGReliabilityService?.getDiagnostics?.() ||
                       window.__BackgroundReliabilityService?.getDiagnostics(),
        network:     window.__networkState,
        transport:   window.__HybridTransportEngine?.getDiagnostics(),
        realtime:    window.__RealtimeStabilizationLayer?.getDiagnostics(),
        calls:       window.__WebRTCSessionOrchestrator?.getDiagnostics(),
        groups:      window.__GroupOrchestrator?.getDiagnostics(),
        stories:     window.__StatusStoryEngine?.getDiagnostics(),
        notifications: window.__SocialNotificationEngine?.getDiagnostics(),
        latency:     this._latency.snapshot(),
        counters:    this._counters.all(),
        reliability: this._reliability.getSummary(),
        recentLogs:  this._logger.getAll(50),
        // Phase 1 monitoring
        phase1:      window.__MonitoringFoundation?.getMetrics?.(),
        // Phase 8/9 transport diagnostics
        lan:         window.__LANCommunicationEngine?.getDiagnostics?.() || { enabled: false },
        mesh:        window.__MeshMessagesTransport?.getDiagnostics?.() || { enabled: false },
        offlineQueue: window.__OfflineMessageQueue?.getDiagnostics?.() || { total: 0, queued: 0 },
        tombstones:  (() => { try { const t = JSON.parse(localStorage.getItem('kynecta_tombstones_v1') || '{}'); return { count: Object.keys(t).length, ids: Object.keys(t) }; } catch(_) { return { count: 0 }; } })(),
        activeTransport: window.__HybridTransportEngine?.getBestTransport?.() || 'INTERNET',
        lanPeers:    window.__lanPeerList?.length || 0,
        socketState: window.KynectaRealtime?._socket?.connected ? 'CONNECTED' : 'DISCONNECTED',
      };
    }

    printDiagnostics() {
      const snap = this.getSnapshot();
      console.group('🔍 MoodChat Diagnostics — ' + snap.ts);
      console.log('📡 Network:', snap.network);
      console.log('🔄 Recovery:', snap.recovery);
      console.log('🔐 Security:', snap.security);
      console.log('📦 Queue:', snap.queue);
      console.log('📞 Calls:', snap.calls);
      console.log('👥 Groups:', snap.groups);
      console.log('📖 Stories:', snap.stories);
      console.log('🔔 Notifications:', snap.notifications);
      console.log('⏱ Latency:', snap.latency);
      console.log('📊 Counters:', snap.counters);
      console.log('📈 Reliability:', snap.reliability);
      console.log('🌐 Active Transport:', snap.activeTransport);
      console.log('🏠 LAN:', snap.lan, '| Peers:', snap.lanPeers);
      console.log('🕸 Mesh:', snap.mesh);
      console.log('📤 Offline Queue:', snap.offlineQueue);
      console.log('🪦 Tombstones:', snap.tombstones);
      console.log('🔌 Socket:', snap.socketState);
      console.groupEnd();
      return snap;
    }

    exportJSON() {
      return JSON.stringify(this.getSnapshot(), null, 2);
    }

    getDiagnostics() { return this.getSnapshot(); }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachEventListeners() {
      const bus = window.KynectaEventBus;
      if (!bus) { setTimeout(() => this._attachEventListeners(), 1000); return; }

      bus.on('SOCKET_CONNECTED', () => {
        this._counters.inc('socket.connects');
        this._logger.log('socket', 'connected');
        this._reliability.recordReconnect('CONNECTED', 0);
      });

      bus.on('SOCKET_DISCONNECTED', ({ reason } = {}) => {
        this._counters.inc('socket.disconnects');
        this._logger.log('socket', 'disconnected', { reason });
      });

      bus.on('SYSTEM_NETWORK_CHANGED', state => {
        this._counters.set('network.quality', state.internetQuality || 'UNKNOWN');
        this._counters.set('network.latency', state.estimatedLatency || 0);
        if (!state.internetAvailable) this._counters.inc('network.offline_events');
      });

      bus.on('SYNC_STARTED', ({ reason } = {}) => {
        this._counters.inc('sync.requests');
        this._logger.log('sync', 'started', { reason });
      });

      bus.on('QUEUE_STATE_CHANGED', ({ state, type } = {}) => {
        if (state === 'FAILED') {
          this._counters.inc(`queue.fails.${type || 'unknown'}`);
        }
        if (state === 'DELIVERED') {
          this._counters.inc(`queue.delivered.${type || 'unknown'}`);
        }
      });
    }

    _startPeriodicCollection() {
      setInterval(() => {
        // Memory metrics
        if (performance.memory) {
          const mb = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
          this._counters.set('memory.heap_mb', mb);
          if (mb > 300) {
            this._logger.log('memory', 'high_pressure', { mb });
            this._counters.inc('memory.pressure_events');
          }
        }

        // Active connections
        const socket = window.KynectaRealtime?._socket;
        this._counters.set('socket.connected', socket?.connected ? 1 : 0);

        // Queue depth
        const qDepth = window.__DurableQueueLayer?.size?.() || 0;
        this._counters.set('queue.depth', qDepth);

        // Online users in presence engine
        const onlineCount = window.__PresenceEngineFoundation?.getOnlineUsers?.()?.length || 0;
        this._counters.set('presence.online_count', onlineCount);

      }, 15000);
    }

    _extendPhase1Monitoring() {
      // Extend the existing MonitoringFoundation snapshot (Phase 1)
      const p1 = window.__MonitoringFoundation;
      if (!p1) {
        setTimeout(() => this._extendPhase1Monitoring(), 2000);
        return;
      }

      const origSnapshot = p1.snapshot.bind(p1);
      p1.snapshot = () => {
        const snap = origSnapshot();
        snap.phase5 = {
          latency:     this._latency.snapshot(),
          counters:    this._counters.all(),
          reliability: this._reliability.getSummary(),
          logSize:     this._logger.size(),
        };
        return snap;
      };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const monitor = new ProductionMonitoringLayer();

  const tryStart = () => {
    if (window.KynectaEventBus) {
      monitor.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__ProductionMonitoringLayer = monitor;
  window.ProdMonitor                 = monitor;

  console.log('[ProductionMonitor] ✅ Ready — __MoodChatDiag() for full snapshot');
})();