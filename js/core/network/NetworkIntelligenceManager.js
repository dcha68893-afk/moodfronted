/**
 * NetworkIntelligenceManager.js
 * Phase 1 — Network Intelligence Layer (READ-ONLY observer)
 *
 * Classifies, monitors, and emits network state.
 * NEVER reroutes messages, NEVER changes transport, NEVER modifies APIs.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__NetworkIntelligenceManager) {
    console.log('[NetworkIntel] Already initialized — skipping.');
    return;
  }

  // ─── Constants ──────────────────────────────────────────────────────────────

  const QUALITY = {
    GOOD: 'GOOD',
    FAIR: 'FAIR',
    POOR: 'POOR',
    OFFLINE: 'OFFLINE',
  };

  // FIX: Multi-URL probe with fallbacks. Render free-tier HEAD requests return 405/503.
  // WiFi-connected users were falsely marked OFFLINE because the single probe failed.
  const _backendBase = (() => {
    if (window.__kynAPI && window.__kynAPI.baseUrl) {
      return window.__kynAPI.baseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
    }
    return 'https://nexora-3bla.onrender.com';
  })();

  const PROBE_URLS = [
    _backendBase + '/health',            // backend health (GET)
    'https://www.google.com/generate_204', // always-up fallback
  ];

  const PROBE_URL = PROBE_URLS[0]; // kept for backward compat references

  const DEFAULTS = {
    probeIntervalMs: 20000,       // FIX: was 15s — increased to reduce false offline on slow WiFi
    probeFastIntervalMs: 5000,
    probeTimeoutMs: 8000,         // FIX: was 5s — Render cold-starts take up to 7s
    bandwidthSampleSize: 5,
    latencyHistorySize: 20,
    jitterWindowSize: 10,
    captivePortalCheckUrl: 'https://www.google.com/generate_204',
    captivePortalExpectedStatus: 204,
    failuresBeforeOffline: 2,     // FIX: require 2 consecutive failures before OFFLINE
  };

  // ─── NetworkStateClassifier ──────────────────────────────────────────────────

  class NetworkStateClassifier {
    classify(metrics) {
      if (!metrics.browserOnline) return QUALITY.OFFLINE;
      if (!metrics.probeReachable) return QUALITY.OFFLINE;
      const { latency, packetLoss, jitter } = metrics;
      if (latency < 150 && packetLoss < 0.05 && jitter < 40) return QUALITY.GOOD;
      if (latency < 600 && packetLoss < 0.2 && jitter < 150) return QUALITY.FAIR;
      return QUALITY.POOR;
    }

    isUnstable(history) {
      if (history.length < 4) return false;
      const recent = history.slice(-4);
      const failures = recent.filter((r) => !r.success).length;
      return failures >= 2;
    }

    detectCaptivePortal(probeStatus) {
      // If we get a non-204 redirect response, we may be behind a captive portal
      return probeStatus !== null && probeStatus !== 204 && probeStatus >= 200 && probeStatus < 400;
    }
  }

  // ─── ConnectivityObserver ────────────────────────────────────────────────────

  class ConnectivityObserver {
    constructor(onOnline, onOffline) {
      this._onOnline = onOnline;
      this._onOffline = onOffline;
      this._bound = false;
    }

    attach() {
      if (this._bound) return;
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
      this._bound = true;
    }

    detach() {
      window.removeEventListener('online', this._onOnline);
      window.removeEventListener('offline', this._onOffline);
      this._bound = false;
    }
  }

  // ─── LatencyMonitor ──────────────────────────────────────────────────────────

  class LatencyMonitor {
    constructor(historySize = DEFAULTS.latencyHistorySize) {
      this._history = [];
      this._historySize = historySize;
    }

    record(latencyMs) {
      this._history.push(latencyMs);
      if (this._history.length > this._historySize) this._history.shift();
    }

    average() {
      if (!this._history.length) return 0;
      return Math.round(this._history.reduce((a, b) => a + b, 0) / this._history.length);
    }

    recent() {
      return this._history.slice(-5);
    }
  }

  // ─── JitterMonitor ───────────────────────────────────────────────────────────

  class JitterMonitor {
    constructor(windowSize = DEFAULTS.jitterWindowSize) {
      this._samples = [];
      this._windowSize = windowSize;
    }

    record(latencyMs) {
      this._samples.push(latencyMs);
      if (this._samples.length > this._windowSize) this._samples.shift();
    }

    compute() {
      if (this._samples.length < 2) return 0;
      let total = 0;
      for (let i = 1; i < this._samples.length; i++) {
        total += Math.abs(this._samples[i] - this._samples[i - 1]);
      }
      return Math.round(total / (this._samples.length - 1));
    }
  }

  // ─── PacketLossMonitor ───────────────────────────────────────────────────────

  class PacketLossMonitor {
    constructor(windowSize = 20) {
      this._results = [];
      this._windowSize = windowSize;
    }

    record(success) {
      this._results.push(success ? 1 : 0);
      if (this._results.length > this._windowSize) this._results.shift();
    }

    rate() {
      if (!this._results.length) return 0;
      const losses = this._results.filter((r) => r === 0).length;
      return parseFloat((losses / this._results.length).toFixed(3));
    }
  }

  // ─── BandwidthEstimator ──────────────────────────────────────────────────────

  class BandwidthEstimator {
    constructor(sampleSize = DEFAULTS.bandwidthSampleSize) {
      this._samples = [];
      this._sampleSize = sampleSize;
    }

    record(bytes, durationMs) {
      if (durationMs <= 0) return;
      const kbps = Math.round((bytes * 8) / durationMs); // kbps
      this._samples.push(kbps);
      if (this._samples.length > this._sampleSize) this._samples.shift();
    }

    estimate() {
      if (!this._samples.length) return 0;
      return Math.round(this._samples.reduce((a, b) => a + b, 0) / this._samples.length);
    }

    // Use Navigator API as a primary hint when available
    fromNavigator() {
      if (!navigator.connection) return null;
      const conn = navigator.connection;
      const typeMap = {
        'slow-2g': 50,
        '2g': 250,
        '3g': 1500,
        '4g': 10000,
        '5g': 50000,
      };
      return conn.downlink
        ? Math.round(conn.downlink * 1000) // Mbps -> kbps
        : (typeMap[conn.effectiveType] || null);
    }
  }

  // ─── ConnectionLifecycleManager ──────────────────────────────────────────────

  class ConnectionLifecycleManager {
    constructor() {
      this._lastStableAt = Date.now();
      this._lastOfflineAt = null;
      this._reconnectCount = 0;
    }

    markStable() {
      this._lastStableAt = Date.now();
    }

    markOffline() {
      this._lastOfflineAt = Date.now();
    }

    markReconnect() {
      this._reconnectCount++;
    }

    getState() {
      return {
        lastStableConnectionAt: this._lastStableAt,
        lastOfflineAt: this._lastOfflineAt,
        totalReconnects: this._reconnectCount,
      };
    }
  }

  // ─── NetworkIntelligenceManager (main) ──────────────────────────────────────

  class NetworkIntelligenceManager {
    constructor() {
      this._state = this._buildInitialState();
      this._probeHistory = [];
      this._probeTimer = null;
      this._visibilityBound = false;

      this._classifier = new NetworkStateClassifier();
      this._connectivity = new ConnectivityObserver(
        () => this._onBrowserOnline(),
        () => this._onBrowserOffline()
      );
      this._latency = new LatencyMonitor();
      this._jitter = new JitterMonitor();
      this._packetLoss = new PacketLossMonitor();
      this._bandwidth = new BandwidthEstimator();
      this._lifecycle = new ConnectionLifecycleManager();

      this._listeners = [];
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    start() {
      this._connectivity.attach();
      this._attachVisibility();
      this._attachNavigatorConnection();
      this._scheduleProbe(0);
      console.log('[NetworkIntel] ✅ Started');
    }

    stop() {
      this._connectivity.detach();
      if (this._probeTimer) clearTimeout(this._probeTimer);
      this._probeTimer = null;
    }

    getState() {
      return Object.freeze({ ...this._state });
    }

    /** Subscribe to state changes. Returns unsubscribe fn. */
    onChange(fn) {
      this._listeners.push(fn);
      return () => {
        this._listeners = this._listeners.filter((l) => l !== fn);
      };
    }

    // ── Private — Probing ──────────────────────────────────────────────────────

    _scheduleProbe(delay) {
      if (this._probeTimer) clearTimeout(this._probeTimer);
      const interval = this._state.reconnecting
        ? DEFAULTS.probeFastIntervalMs
        : DEFAULTS.probeIntervalMs;
      this._probeTimer = setTimeout(() => this._runProbe(), delay ?? interval);
    }

    async _runProbe() {
      const start = performance.now();
      let success = false;
      let status = null;

      // FIX: Try each probe URL until one succeeds.
      // Use GET (not HEAD) — Render free-tier health routes don't respond to HEAD.
      // This is the root cause of WiFi users seeing "offline" — the HEAD probe to
      // the backend failed (405 or cold-start 503), marking internet unavailable.
      for (const url of PROBE_URLS) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), DEFAULTS.probeTimeoutMs);

          const res = await fetch(url, {
            method: 'GET',       // FIX: was HEAD — backend health only handles GET
            cache: 'no-store',
            signal: controller.signal,
            mode: 'no-cors',     // FIX: allows cross-origin probes without CORS preflight failure
          });

          clearTimeout(tid);
          // With no-cors, res.type === 'opaque' and res.status === 0 — treat as success
          success = res.ok || res.status === 0 || res.status < 500;
          status = res.status;

          const durationMs = Math.round(performance.now() - start);
          this._latency.record(durationMs);
          this._jitter.record(durationMs);
          this._packetLoss.record(true);

          const cl = res.headers.get('content-length');
          if (cl) this._bandwidth.record(parseInt(cl, 10), durationMs);

          if (success) break; // First successful probe wins — no need to try more
        } catch (_) {
          // This URL failed — try next
        }
      }

      if (!success) {
        this._packetLoss.record(false);
      }

      this._probeHistory.push({ ts: Date.now(), success, status });
      if (this._probeHistory.length > 20) this._probeHistory.shift();

      this._updateState(success, status);
      this._scheduleProbe();
    }

    // ── Private — State Updates ────────────────────────────────────────────────

    _updateState(probeSuccess, probeStatus) {
      const browserOnline = navigator.onLine !== false;
      const navBw = this._bandwidth.fromNavigator();

      // FIX: Do NOT declare OFFLINE on a single probe failure.
      // WiFi users on slow connections or when the Render backend cold-starts
      // would get false OFFLINE state from one missed probe.
      // Require (failuresBeforeOffline) consecutive failures OR browser offline.
      const recentProbes = this._probeHistory.slice(-DEFAULTS.failuresBeforeOffline);
      const allRecentFailed = recentProbes.length >= DEFAULTS.failuresBeforeOffline &&
                              recentProbes.every(p => !p.success);
      const probeReachable = probeSuccess || (!allRecentFailed && browserOnline);

      const metrics = {
        browserOnline,
        probeReachable,
        latency: this._latency.average(),
        packetLoss: this._packetLoss.rate(),
        jitter: this._jitter.compute(),
      };

      const quality = this._classifier.classify(metrics);
      const unstable = this._classifier.isUnstable(this._probeHistory);
      const captivePortal = this._classifier.detectCaptivePortal(probeStatus);

      const wasOffline = this._state.internetQuality === QUALITY.OFFLINE;
      const nowOnline = quality !== QUALITY.OFFLINE;

      if (wasOffline && nowOnline) {
        this._lifecycle.markStable();
        this._lifecycle.markReconnect();
      }
      if (!wasOffline && quality === QUALITY.OFFLINE) {
        this._lifecycle.markOffline();
      }
      if (quality === QUALITY.GOOD) {
        this._lifecycle.markStable();
      }

      const lifecycle = this._lifecycle.getState();

      const lanAvailable = this._detectLAN();
      const localDiscoveryPossible = lanAvailable && !captivePortal;

      const newState = {
        internetAvailable: quality !== QUALITY.OFFLINE,
        internetQuality: quality,
        unstable,
        captivePortal,
        reconnecting: unstable && quality !== QUALITY.OFFLINE,
        lanAvailable,
        localDiscoveryPossible,
        estimatedLatency: metrics.latency,
        estimatedBandwidth: navBw ?? this._bandwidth.estimate(),
        packetLoss: metrics.packetLoss,
        jitter: metrics.jitter,
        lastStableConnectionAt: lifecycle.lastStableConnectionAt,
        lastOfflineAt: lifecycle.lastOfflineAt,
        totalReconnects: lifecycle.totalReconnects,
        deviceBackgrounded: this._deviceBackgrounded,
        lowBattery: this._lowBattery,
        batteryCharging: this._batteryCharging,
        updatedAt: Date.now(),
      };

      const changed = JSON.stringify(newState) !== JSON.stringify(this._state);
      this._state = newState;

      if (changed) {
        this._emit(newState);
        this._broadcastToEventBus(newState);
      }
    }

    _buildInitialState() {
      return {
        internetAvailable: navigator.onLine !== false,
        internetQuality: QUALITY.GOOD,
        unstable: false,
        captivePortal: false,
        reconnecting: false,
        lanAvailable: false,
        localDiscoveryPossible: false,
        estimatedLatency: 0,
        estimatedBandwidth: 0,
        packetLoss: 0,
        jitter: 0,
        lastStableConnectionAt: Date.now(),
        lastOfflineAt: null,
        totalReconnects: 0,
        deviceBackgrounded: false,
        lowBattery: false,
        batteryCharging: true,
        updatedAt: Date.now(),
      };
    }

    // ── Private — Browser Events ───────────────────────────────────────────────

    _onBrowserOnline() {
      this._scheduleProbe(500); // quick probe after coming back
    }

    _onBrowserOffline() {
      const updated = {
        ...this._state,
        internetAvailable: false,
        internetQuality: QUALITY.OFFLINE,
        updatedAt: Date.now(),
      };
      this._lifecycle.markOffline();
      this._state = updated;
      this._emit(updated);
      this._broadcastToEventBus(updated);
    }

    _attachVisibility() {
      if (this._visibilityBound) return;
      document.addEventListener('visibilitychange', () => {
        this._deviceBackgrounded = document.visibilityState === 'hidden';
        if (!this._deviceBackgrounded) {
          // Re-probe immediately when tab comes back
          this._scheduleProbe(200);
        }
      });
      this._visibilityBound = true;
    }

    _attachNavigatorConnection() {
      if (!navigator.connection) return;
      navigator.connection.addEventListener('change', () => {
        this._scheduleProbe(300);
      });

      // Battery API
      if (navigator.getBattery) {
        navigator.getBattery().then((battery) => {
          this._lowBattery = battery.level < 0.2;
          this._batteryCharging = battery.charging;
          battery.addEventListener('levelchange', () => {
            this._lowBattery = battery.level < 0.2;
          });
          battery.addEventListener('chargingchange', () => {
            this._batteryCharging = battery.charging;
          });
        }).catch(() => {});
      }
    }

    _detectLAN() {
      // Heuristic: if hostname looks like a private IP, we're on LAN
      const h = window.location.hostname;
      return (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h)
      );
    }

    // ── Private — Event Emission ───────────────────────────────────────────────

    _emit(state) {
      for (const fn of this._listeners) {
        try { fn(state); } catch (e) { console.warn('[NetworkIntel] listener error', e); }
      }
    }

    _broadcastToEventBus(state) {
      const bus = window.KynectaEventBus || window.appEvents || window.EventBus;
      if (!bus || typeof bus.emit !== 'function') return;
      bus.emit('SYSTEM_NETWORK_CHANGED', state, { async: true });

      if (!state.internetAvailable) {
        bus.emit('SYSTEM_NETWORK_OFFLINE', state, { async: true });
      } else {
        bus.emit('SYSTEM_NETWORK_ONLINE', state, { async: true });
      }
    }
  }

  // ─── Singleton init ──────────────────────────────────────────────────────────

  const manager = new NetworkIntelligenceManager();
  manager.start();

  window.__NetworkIntelligenceManager = manager;
  window.NetworkIntel = manager;

  // Expose state snapshot globally for other modules
  Object.defineProperty(window, '__networkState', {
    get: () => manager.getState(),
    configurable: true,
  });

  console.log('[NetworkIntel] ✅ Ready');
})();
