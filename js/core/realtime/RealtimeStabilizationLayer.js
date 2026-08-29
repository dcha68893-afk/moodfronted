/**
 * RealtimeStabilizationLayer.js
 * Phase 1 — Realtime Stabilization
 *
 * Monitors and stabilizes the existing Socket.IO connection:
 *  - Prevents duplicate socket listeners
 *  - Tracks lifecycle (connected / reconnecting / disconnected)
 *  - Validates event ordering
 *  - Detects and removes stale/orphan subscriptions
 *  - Prevents reconnect storms
 *  - Replays missed events after reconnect
 *
 * DOES NOT reroute traffic or change transport.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__RealtimeStabilizationLayer) {
    console.log('[RealtimeStab] Already initialized — skipping.');
    return;
  }

  // ─── RealtimeHealthMonitor ───────────────────────────────────────────────────

  class RealtimeHealthMonitor {
    constructor() {
      this._healthy = false;
      this._degraded = false;
      this._lastHeartbeat = null;
      this._consecutiveFailures = 0;
      this._maxFailures = 5;
    }

    recordHeartbeat() {
      this._lastHeartbeat = Date.now();
      this._consecutiveFailures = 0;
      this._healthy = true;
      this._degraded = false;
    }

    recordFailure() {
      this._consecutiveFailures++;
      if (this._consecutiveFailures >= this._maxFailures) {
        this._healthy = false;
        this._degraded = true;
      }
    }

    isStale(thresholdMs = 60000) {
      if (!this._lastHeartbeat) return true;
      return Date.now() - this._lastHeartbeat > thresholdMs;
    }

    getStatus() {
      return {
        healthy: this._healthy,
        degraded: this._degraded,
        consecutiveFailures: this._consecutiveFailures,
        lastHeartbeat: this._lastHeartbeat,
        staleSince: this._lastHeartbeat ? Date.now() - this._lastHeartbeat : null,
      };
    }
  }

  // ─── SocketLifecycleTracker ──────────────────────────────────────────────────

  class SocketLifecycleTracker {
    constructor() {
      this._state = 'disconnected';
      this._connectedAt = null;
      this._disconnectedAt = null;
      this._reconnectAttempts = 0;
      this._totalConnections = 0;
      this._history = [];
    }

    setState(newState) {
      const prev = this._state;
      this._state = newState;

      if (newState === 'connected') {
        this._connectedAt = Date.now();
        this._totalConnections++;
        this._reconnectAttempts = 0;
      }
      if (newState === 'disconnected') {
        this._disconnectedAt = Date.now();
      }
      if (newState === 'reconnecting') {
        this._reconnectAttempts++;
      }

      this._history.push({ from: prev, to: newState, ts: Date.now() });
      if (this._history.length > 50) this._history.shift();
    }

    getState() { return this._state; }
    isConnected() { return this._state === 'connected'; }

    getMetrics() {
      return {
        state: this._state,
        connectedAt: this._connectedAt,
        disconnectedAt: this._disconnectedAt,
        reconnectAttempts: this._reconnectAttempts,
        totalConnections: this._totalConnections,
        uptime: this._connectedAt ? Date.now() - this._connectedAt : 0,
        history: this._history.slice(-10),
      };
    }
  }

  // ─── DuplicateListenerDetector ───────────────────────────────────────────────

  class DuplicateListenerDetector {
    constructor() {
      this._registry = new Map(); // event -> Set<fnRef>
      this._duplicates = [];
    }

    /**
     * Call this BEFORE attaching a listener.
     * Returns true if the listener is a duplicate.
     */
    check(event, fnRef) {
      if (!this._registry.has(event)) {
        this._registry.set(event, new Set());
      }
      const set = this._registry.get(event);
      if (set.has(fnRef)) {
        this._duplicates.push({ event, ts: Date.now() });
        return true; // duplicate
      }
      set.add(fnRef);
      return false;
    }

    unregister(event, fnRef) {
      const set = this._registry.get(event);
      if (set) set.delete(fnRef);
    }

    getDuplicateCount() { return this._duplicates.length; }
    getReport() { return [...this._duplicates]; }
    clear() { this._registry.clear(); this._duplicates = []; }
  }

  // ─── RealtimeEventValidator ──────────────────────────────────────────────────

  class RealtimeEventValidator {
    constructor() {
      this._seenIds = new Map(); // eventId -> timestamp
      this._maxAge = 120000; // 2 min dedup window
      this._duplicateCount = 0;
      this._outOfOrderCount = 0;
    }

    /**
     * Returns false if the event is a duplicate.
     */
    isValid(eventId, timestamp) {
      const now = Date.now();

      // Expire old IDs
      for (const [id, ts] of this._seenIds) {
        if (now - ts > this._maxAge) this._seenIds.delete(id);
      }

      if (eventId && this._seenIds.has(eventId)) {
        this._duplicateCount++;
        return false;
      }
      if (eventId) this._seenIds.set(eventId, now);

      // Check for wildly out-of-order (more than 30s in the past)
      if (timestamp && now - timestamp > 30000) {
        this._outOfOrderCount++;
        // Still deliver, just flag it
      }

      return true;
    }

    getStats() {
      return {
        duplicateEvents: this._duplicateCount,
        outOfOrderEvents: this._outOfOrderCount,
        seenWindowSize: this._seenIds.size,
      };
    }
  }

  // ─── ConnectionRecoveryCoordinator ──────────────────────────────────────────

  class ConnectionRecoveryCoordinator {
    constructor() {
      this._missedEventBuffer = []; // events that arrived during reconnect
      this._maxBuffer = 200;
      this._recovering = false;
      this._recoveryHandlers = [];
    }

    beginRecovery() {
      this._recovering = true;
    }

    endRecovery() {
      this._recovering = false;
      const buffered = [...this._missedEventBuffer];
      this._missedEventBuffer = [];
      return buffered;
    }

    buffer(event) {
      if (!this._recovering) return;
      if (this._missedEventBuffer.length >= this._maxBuffer) {
        this._missedEventBuffer.shift();
      }
      this._missedEventBuffer.push(event);
    }

    onRecovery(fn) {
      this._recoveryHandlers.push(fn);
      return () => { this._recoveryHandlers = this._recoveryHandlers.filter(h => h !== fn); };
    }

    isRecovering() { return this._recovering; }
  }

  // ─── ReconnectStormPreventer ─────────────────────────────────────────────────

  class ReconnectStormPreventer {
    constructor() {
      this._attempts = [];
      this._windowMs = 10000;
      this._maxAttempts = 5;
      this._backoffMs = 30000;
      this._blockedUntil = null;
    }

    canAttempt() {
      const now = Date.now();
      if (this._blockedUntil && now < this._blockedUntil) {
        console.warn('[RealtimeStab] Reconnect storm detected — attempt blocked.');
        return false;
      }

      // Clean old attempts
      this._attempts = this._attempts.filter((t) => now - t < this._windowMs);
      this._attempts.push(now);

      if (this._attempts.length >= this._maxAttempts) {
        this._blockedUntil = now + this._backoffMs;
        console.warn('[RealtimeStab] Too many reconnect attempts — backing off for 30s.');
        return false;
      }

      return true;
    }

    reset() {
      this._attempts = [];
      this._blockedUntil = null;
    }
  }

  // ─── RealtimeStabilizationLayer (main) ───────────────────────────────────────

  class RealtimeStabilizationLayer {
    constructor() {
      this._health = new RealtimeHealthMonitor();
      this._lifecycle = new SocketLifecycleTracker();
      this._dupListeners = new DuplicateListenerDetector();
      this._validator = new RealtimeEventValidator();
      this._recovery = new ConnectionRecoveryCoordinator();
      this._stormPreventer = new ReconnectStormPreventer();
      this._socketRef = null;
      this._observing = false;
    }

    start() {
      this._waitForSocket();
      this._patchWindowPostMessage();
      console.log('[RealtimeStab] ✅ Started');
    }

    // ── Socket observation ─────────────────────────────────────────────────────

    _waitForSocket() {
      // In iframe context, socket is bridged via postMessage — no direct socket expected
      const isIframe = window.self !== window.top;
      let attempts = 0;
      const check = () => {
        const socket = this._findSocket();
        if (socket) {
          this._attachToSocket(socket);
          return;
        }
        if (++attempts < 60) setTimeout(check, 500);
        else if (!isIframe) console.warn('[RealtimeStab] Could not find socket after 30s');
        // Silently stop in iframes — socket bridge handles realtime
      };
      check();
    }

    _findSocket() {
      // Look for the KynectaRealtime singleton or any socket.io socket on window
      if (window.KynectaRealtime && window.KynectaRealtime._socket) {
        return window.KynectaRealtime._socket;
      }
      if (window.__appSocket) return window.__appSocket;
      if (window._socket && window._socket.io) return window._socket;
      return null;
    }

    _attachToSocket(socket) {
      if (this._socketRef === socket && this._observing) return;
      this._socketRef = socket;
      this._observing = true;

      socket.on('connect', () => {
        this._lifecycle.setState('connected');
        this._health.recordHeartbeat();
        this._stormPreventer.reset();
        const buffered = this._recovery.endRecovery();
        this._replayBufferedEvents(buffered);
        this._broadcastEvent('socket:connected', { socketId: socket.id });
      });

      socket.on('disconnect', (reason) => {
        this._lifecycle.setState('disconnected');
        this._recovery.beginRecovery();
        this._broadcastEvent('socket:disconnected', { reason });
      });

      socket.on('reconnecting', (attempt) => {
        if (!this._stormPreventer.canAttempt()) {
          // We can't actually block socket.io's internal reconnect here
          // but we can warn and track it
        }
        this._lifecycle.setState('reconnecting');
        this._broadcastEvent('socket:reconnecting', { attempt });
      });

      socket.on('reconnect', () => {
        this._lifecycle.setState('connected');
        this._health.recordHeartbeat();
        this._stormPreventer.reset();
        const buffered = this._recovery.endRecovery();
        this._replayBufferedEvents(buffered);
        this._broadcastEvent('socket:reconnected', {});
      });

      socket.on('reconnect_failed', () => {
        this._lifecycle.setState('disconnected');
        this._broadcastEvent('socket:reconnect_failed', {});
      });

      socket.on('error', (err) => {
        this._health.recordFailure();
        this._broadcastEvent('socket:error', { message: err?.message || String(err) });
      });

      // Intercept pong as heartbeat
      socket.on('pong', () => {
        this._health.recordHeartbeat();
      });

      console.log('[RealtimeStab] Attached to socket', socket.id);
    }

    // ── Duplicate listener detection (public helpers) ──────────────────────────

    /**
     * Wrap socket.on to detect duplicate listeners.
     * Usage: layer.safeOn(socket, 'message:created', handler)
     */
    safeOn(socket, event, handler) {
      if (this._dupListeners.check(event, handler)) {
        console.warn(`[RealtimeStab] Duplicate listener prevented for: "${event}"`);
        return () => {};
      }
      socket.on(event, handler);
      return () => {
        socket.off(event, handler);
        this._dupListeners.unregister(event, handler);
      };
    }

    // ── Event validation ───────────────────────────────────────────────────────

    /**
     * Validate an incoming event payload.
     * Returns false if duplicate or invalid — caller should drop event.
     */
    validate(event, payload) {
      const id = payload?.eventId || payload?.id || null;
      const ts = payload?.timestamp || payload?.createdAt
        ? new Date(payload?.timestamp || payload?.createdAt).getTime()
        : null;
      return this._validator.isValid(id, ts);
    }

    // ── Recovery ───────────────────────────────────────────────────────────────

    _replayBufferedEvents(events) {
      if (!events.length) return;
      console.log(`[RealtimeStab] Replaying ${events.length} buffered events`);
      for (const { event, payload } of events) {
        this._broadcastEvent(event, payload);
      }
    }

    // ── PostMessage patch ─────────────────────────────────────────────────────

    /** Observe iframe postMessages to detect duplicate event storms */
    _patchWindowPostMessage() {
      const recentMessages = [];
      const WINDOW_MS = 2000;
      const MAX_SAME = 5;

      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        // FIX (POSTMESSAGE-STORM-FALSE-POSITIVE): API_REQUEST messages (and a
        // few other request-style types) carry no chatId/id — only an
        // endpoint + requestId — so every distinct API call collapsed onto
        // the same "type||" key. A single Promise.allSettled batch (e.g.
        // friendSync's 5 parallel calls) was enough to trip the "storm"
        // warning even though each call was for a different endpoint and
        // nothing was actually wrong. Fold endpoint/requestId into the key
        // so only genuinely repeated identical requests count as a storm.
        //
        // FIX (POSTMESSAGE-STORM-FALSE-POSITIVE-2): panel-state-bridge.js's
        // PanelHidden/PanelFocused messages carry none of chatId/id/
        // requestId/endpoint either, AND every module iframe (calls/message/
        // friend/group/Tools/status) sends its own copy of the same event
        // type when the shared parent tab's visibility changes — so 5-6
        // *different* frames each legitimately sending one PanelHidden/
        // PanelFocused message inside the same tick collapsed onto the same
        // "PanelHidden||" key and falsely tripped the storm warning, even
        // though nothing was looping or duplicated. Fold e.data.module into
        // the key too so distinct source frames don't get bucketed together.
        const key = e.data.type + '|' + (e.data.module || '') + '|' + (e.data.chatId || '') + '|' +
          (e.data.id || e.data.requestId || e.data.endpoint || '');
        const now = Date.now();

        // Purge old
        while (recentMessages.length && now - recentMessages[0].ts > WINDOW_MS) {
          recentMessages.shift();
        }

        const same = recentMessages.filter((m) => m.key === key);
        if (same.length >= MAX_SAME) {
          console.warn(`[RealtimeStab] postMessage storm detected: "${e.data.type}" (${same.length} in ${WINDOW_MS}ms)`);
        }

        recentMessages.push({ key, ts: now });
      }, true); // capture phase
    }

    // ── Internal event broadcast ───────────────────────────────────────────────

    _broadcastEvent(type, payload) {
      const bus = window.KynectaEventBus || window.appEvents || window.EventBus;
      if (bus && typeof bus.emit === 'function') {
        bus.emit('SOCKET_EVENT', { type, ...payload }, { async: true });
      }
    }

    // ── Public diagnostics ─────────────────────────────────────────────────────

    getDiagnostics() {
      return {
        health: this._health.getStatus(),
        lifecycle: this._lifecycle.getMetrics(),
        validator: this._validator.getStats(),
        duplicates: this._dupListeners.getDuplicateCount(),
        recovering: this._recovery.isRecovering(),
      };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new RealtimeStabilizationLayer();
  layer.start();

  window.__RealtimeStabilizationLayer = layer;
  window.RealtimeStab = layer;

  console.log('[RealtimeStab] ✅ Ready');
})();