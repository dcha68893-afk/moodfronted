/**
 * MonitoringFoundation.js
 * Phase 1 — Admin + Monitoring Foundation
 *
 * Provides:
 *  - RealtimeDiagnostics
 *  - NetworkMetricsCollector
 *  - ReconnectTracker
 *  - SyncFailureDetector
 *  - SocketMetricsMonitor
 *  - HydrationMetricsCollector
 *  - Internal debug panel (NOT user-facing)
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__MonitoringFoundation) {
    console.log('[Monitoring] Already initialized — skipping.');
    return;
  }

  // ─── MetricsStore ────────────────────────────────────────────────────────────

  class MetricsStore {
    constructor(maxEntries = 200) {
      this._entries = [];
      this._maxEntries = maxEntries;
      this._counters = {};
      this._gauges = {};
    }

    record(category, label, value = 1, meta = {}) {
      const entry = { category, label, value, meta, ts: Date.now() };
      this._entries.push(entry);
      if (this._entries.length > this._maxEntries) this._entries.shift();
      return entry;
    }

    increment(key, amount = 1) {
      this._counters[key] = (this._counters[key] || 0) + amount;
    }

    gauge(key, value) {
      this._gauges[key] = { value, ts: Date.now() };
    }

    query(category, limit = 50) {
      return this._entries
        .filter((e) => !category || e.category === category)
        .slice(-limit);
    }

    counters() { return { ...this._counters }; }
    gauges() { return { ...this._gauges }; }

    getAll() {
      return {
        entries: this._entries.slice(-100),
        counters: this.counters(),
        gauges: this.gauges(),
      };
    }
  }

  // ─── NetworkMetricsCollector ─────────────────────────────────────────────────

  class NetworkMetricsCollector {
    constructor(store) {
      this._store = store;
    }

    attach() {
      const intel = window.__NetworkIntelligenceManager;
      if (!intel) {
        // Retry after intel initializes
        setTimeout(() => this.attach(), 2000);
        return;
      }

      intel.onChange((state) => {
        this._store.gauge('network.quality', state.internetQuality);
        this._store.gauge('network.latency', state.estimatedLatency);
        this._store.gauge('network.bandwidth', state.estimatedBandwidth);
        this._store.gauge('network.packetLoss', state.packetLoss);
        this._store.gauge('network.jitter', state.jitter);

        if (!state.internetAvailable) {
          this._store.increment('network.offline_events');
          this._store.record('network', 'offline', 1, { quality: state.internetQuality });
        }
        if (state.captivePortal) {
          this._store.increment('network.captive_portal_detections');
        }
      });

      console.log('[Monitoring] NetworkMetricsCollector attached');
    }
  }

  // ─── ReconnectTracker ────────────────────────────────────────────────────────

  class ReconnectTracker {
    constructor(store) {
      this._store = store;
      this._reconnects = [];
    }

    attach() {
      const bus = window.KynectaEventBus || window.appEvents;
      if (!bus) {
        setTimeout(() => this.attach(), 2000);
        return;
      }

      bus.on('SOCKET_EVENT', (payload) => {
        const type = payload?.type;

        if (type === 'socket:reconnected' || type === 'socket:connected') {
          const entry = { ts: Date.now(), socketId: payload?.socketId || null };
          this._reconnects.push(entry);
          this._store.increment('reconnect.total');
          this._store.record('reconnect', 'success', 1, entry);
        }

        if (type === 'socket:disconnected') {
          this._store.increment('reconnect.disconnections');
          this._store.record('reconnect', 'disconnected', 1, { reason: payload?.reason });
        }

        if (type === 'socket:reconnect_failed') {
          this._store.increment('reconnect.failures');
          this._store.record('reconnect', 'failed', 1);
        }
      });

      console.log('[Monitoring] ReconnectTracker attached');
    }

    getReconnects() { return [...this._reconnects]; }
    getCount() { return this._reconnects.length; }
  }

  // ─── SyncFailureDetector ────────────────────────────────────────────────────

  class SyncFailureDetector {
    constructor(store) {
      this._store = store;
    }

    attach() {
      window.addEventListener('unhandledrejection', (e) => {
        const msg = e.reason?.message || String(e.reason);
        if (msg.includes('sync') || msg.includes('fetch') || msg.includes('socket') || msg.includes('WebSocket')) {
          this._store.increment('sync.unhandled_failures');
          this._store.record('sync', 'failure', 1, { message: msg.slice(0, 100) });
        }
      });

      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SYNC_FAILED', (payload) => {
          this._store.increment('sync.failures');
          this._store.record('sync', 'failed', 1, payload || {});
        });
      }

      console.log('[Monitoring] SyncFailureDetector attached');
    }
  }

  // ─── SocketMetricsMonitor ───────────────────────────────────────────────────

  class SocketMetricsMonitor {
    constructor(store) {
      this._store = store;
      this._eventCount = 0;
      this._duplicateCount = 0;
    }

    attach() {
      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SOCKET_EVENT', (payload) => {
          this._eventCount++;
          this._store.increment('socket.events_total');
          this._store.gauge('socket.events_per_session', this._eventCount);
        });

        bus.on('SOCKET_CONNECTED', () => {
          this._store.record('socket', 'connected', 1);
          this._store.gauge('socket.state', 'connected');
        });
        bus.on('SOCKET_DISCONNECTED', () => {
          this._store.record('socket', 'disconnected', 1);
          this._store.gauge('socket.state', 'disconnected');
        });
      }

      // Track duplicate events from validator
      setInterval(() => {
        const stab = window.__RealtimeStabilizationLayer;
        if (!stab) return;
        const diag = stab.getDiagnostics();
        this._store.gauge('socket.duplicate_events', diag.validator?.duplicateEvents || 0);
        this._store.gauge('socket.duplicate_listeners', diag.duplicates || 0);
      }, 10000);

      console.log('[Monitoring] SocketMetricsMonitor attached');
    }
  }

  // ─── HydrationMetricsCollector ──────────────────────────────────────────────

  class HydrationMetricsCollector {
    constructor(store) {
      this._store = store;
    }

    attach() {
      setInterval(() => {
        const persistence = window.__PersistenceStabilizationLayer;
        if (!persistence) return;
        const diag = persistence.getDiagnostics();
        this._store.gauge('hydration.deleted_entities', diag.deletedEntities);
        this._store.gauge('hydration.failures', diag.hydrationFailures);
        this._store.gauge('hydration.consistency_issues', diag.consistencyIssues);
      }, 15000);

      console.log('[Monitoring] HydrationMetricsCollector attached');
    }
  }

  // ─── RealtimeDiagnostics ────────────────────────────────────────────────────

  class RealtimeDiagnostics {
    constructor(store) {
      this._store = store;
    }

    snapshot() {
      return {
        timestamp: new Date().toISOString(),
        network: window.__networkState || null,
        realtime: window.__RealtimeStabilizationLayer?.getDiagnostics() || null,
        persistence: window.__PersistenceStabilizationLayer?.getDiagnostics() || null,
        queue: window.__QueueFoundationLayer?.getDiagnostics() || null,
        presence: window.__PresenceEngineFoundation?.getDiagnostics() || null,
        cache: window.__CacheFoundationLayer?.getDiagnostics() || null,
        identity: window.__IdentityFoundationLayer?.getDiagnostics() || null,
        metrics: this._store.getAll(),
      };
    }
  }

  // ─── Debug Console ───────────────────────────────────────────────────────────
  // Internal-only, accessible via window.__KynDiag (not rendered in UI)

  class DebugConsole {
    constructor(diagnostics) {
      this._diag = diagnostics;
    }

    print() {
      const snap = this._diag.snapshot();
      console.group('[KynDiag] Phase 1 Diagnostics', new Date().toISOString());
      console.log('Network:', snap.network);
      console.log('Realtime:', snap.realtime);
      console.log('Persistence:', snap.persistence);
      console.log('Queue:', snap.queue);
      console.log('Presence:', snap.presence);
      console.log('Cache:', snap.cache);
      console.log('Identity:', snap.identity);
      console.log('Metrics counters:', snap.metrics?.counters);
      console.groupEnd();
    }

    exportJSON() {
      return JSON.stringify(this._diag.snapshot(), null, 2);
    }
  }

  // ─── MonitoringFoundation (main) ────────────────────────────────────────────

  class MonitoringFoundation {
    constructor() {
      this._store = new MetricsStore(500);
      this._network = new NetworkMetricsCollector(this._store);
      this._reconnect = new ReconnectTracker(this._store);
      this._syncFailure = new SyncFailureDetector(this._store);
      this._socket = new SocketMetricsMonitor(this._store);
      this._hydration = new HydrationMetricsCollector(this._store);
      this._diagnostics = new RealtimeDiagnostics(this._store);
      this._console = new DebugConsole(this._diagnostics);
    }

    init() {
      // Attach all collectors — with small stagger to let other modules init
      setTimeout(() => this._network.attach(), 500);
      setTimeout(() => this._reconnect.attach(), 600);
      setTimeout(() => this._syncFailure.attach(), 700);
      setTimeout(() => this._socket.attach(), 800);
      setTimeout(() => this._hydration.attach(), 900);

      // Periodic diagnostic log (debug mode only)
      if (localStorage.getItem('__kyn_debug') === '1') {
        setInterval(() => this._console.print(), 60000);
      }

      console.log('[Monitoring] ✅ Initialized');
    }

    snapshot() { return this._diagnostics.snapshot(); }
    print() { this._console.print(); }
    exportJSON() { return this._console.exportJSON(); }
    getMetrics() { return this._store.getAll(); }
    recordMetric(category, label, value, meta) {
      this._store.record(category, label, value, meta);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const monitoring = new MonitoringFoundation();
  monitoring.init();

  window.__MonitoringFoundation = monitoring;
  window.KynMonitoring = monitoring;

  // Debug shortcut: window.__KynDiag() prints full diagnostic snapshot
  window.__KynDiag = () => monitoring.print();

  console.log('[Monitoring] ✅ Ready — run __KynDiag() to print diagnostics');
})();
