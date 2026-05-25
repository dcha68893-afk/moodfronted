/**
 * ReconnectOrchestrator.js
 * Phase 5 — Recovery Layer: Reconnect Orchestrator
 *
 * Integrates with the EXISTING MoodChat architecture:
 *  - Monitors Socket.IO connection (KynectaRealtime._socket)
 *  - Uses exponential backoff with jitter (prevents reconnect storms)
 *  - Restores: rooms, subscriptions, group memberships, queue flush
 *  - State machine: DISCONNECTED→RECONNECTING→RESYNCING→RECOVERED
 *  - Hooks into existing KynectaEventBus events
 *  - Works alongside existing app.realtime.socket.js reconnect logic
 *    WITHOUT duplicating or replacing it
 *
 * Storage keys use `moodchat_` prefix (matches app convention).
 *
 * @version 5.0.0
 * @phase 5 — Recovery Layer
 */

(function () {
  'use strict';

  if (window.__ReconnectOrchestrator) return;

  // ─── Recovery States ──────────────────────────────────────────────────────

  const RECOVERY_STATE = Object.freeze({
    CONNECTED:     'CONNECTED',
    DISCONNECTED:  'DISCONNECTED',
    RECONNECTING:  'RECONNECTING',
    RESYNCING:     'RESYNCING',
    RECOVERED:     'RECOVERED',
    FAILED:        'FAILED',
    DEGRADED:      'DEGRADED',
    OFFLINE_MODE:  'OFFLINE_MODE',
  });

  // ─── BackoffTimer ─────────────────────────────────────────────────────────

  class BackoffTimer {
    constructor(baseMs = 1000, maxMs = 60000, jitterFactor = 0.3) {
      this._base    = baseMs;
      this._max     = maxMs;
      this._jitter  = jitterFactor;
      this._attempt = 0;
    }

    next() {
      const exp     = Math.min(this._base * Math.pow(2, this._attempt), this._max);
      const jitter  = exp * this._jitter * Math.random();
      this._attempt++;
      return Math.round(exp + jitter);
    }

    reset() { this._attempt = 0; }
    get attempts() { return this._attempt; }
    get maxed() { return this._attempt >= 8; } // After 8 attempts, stop auto-retry
  }

  // ─── ConnectionSupervisor ────────────────────────────────────────────────

  class ConnectionSupervisor {
    constructor() {
      this._checks = new Map(); // name → { fn, intervalId, lastCheck, lastOk }
    }

    monitor(name, checkFn, intervalMs = 15000) {
      if (this._checks.has(name)) this.stop(name);
      const id = setInterval(async () => {
        try {
          const ok = await checkFn();
          const entry = this._checks.get(name);
          if (entry) { entry.lastCheck = Date.now(); entry.lastOk = ok; }
        } catch (_) {}
      }, intervalMs);
      this._checks.set(name, { fn: checkFn, intervalId: id, lastCheck: null, lastOk: null });
    }

    stop(name) {
      const entry = this._checks.get(name);
      if (entry) { clearInterval(entry.intervalId); this._checks.delete(name); }
    }

    stopAll() {
      for (const { intervalId } of this._checks.values()) clearInterval(intervalId);
      this._checks.clear();
    }

    getStatus() {
      const out = {};
      for (const [name, entry] of this._checks) {
        out[name] = { lastCheck: entry.lastCheck, lastOk: entry.lastOk };
      }
      return out;
    }
  }

  // ─── SessionRestoration ──────────────────────────────────────────────────

  class SessionRestoration {
    async restore() {
      const tasks = [
        this._restoreGroupMemberships(),
        this._restoreChatSubscriptions(),
        this._flushOfflineQueue(),
        this._resyncPresence(),
        this._resetUnreadFromServer(),
      ];
      const results = await Promise.allSettled(tasks);
      const failed  = results.filter(r => r.status === 'rejected').length;
      console.log(`[Reconnect] Session restore: ${tasks.length - failed}/${tasks.length} tasks succeeded`);
      return failed === 0;
    }

    async _restoreGroupMemberships() {
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;
      // Re-announce group rejoins for all known groups
      const orch = window.__GroupOrchestrator;
      if (!orch) return;
      for (const g of orch._registry?.all?.() || []) {
        if (g.joinedRoom) {
          rt._socket.emit('group:rejoin', { groupId: g.id });
        }
      }
    }

    async _restoreChatSubscriptions() {
      // The existing webSocketService._joinUserChatRooms handles this server-side
      // Client just needs to re-emit join_user_room
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;
      const myId = this._getMyUserId();
      if (myId) rt._socket.emit('join_user_room', { userId: myId });
    }

    async _flushOfflineQueue() {
      await window.__OfflineMessageQueue?.flushAll();
    }

    async _resyncPresence() {
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;
      rt._socket.emit('heartbeat', { ts: Date.now() });
      rt._socket.emit('presence:active', {});
    }

    async _resetUnreadFromServer() {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SYNC_STARTED', { reason: 'reconnect_restore' }, { async: true });
    }

    _getMyUserId() {
      try {
        const raw = localStorage.getItem('moodchat_user') ||
                    localStorage.getItem('kynecta_auth');
        return raw ? (JSON.parse(raw)?.id || JSON.parse(raw)?.user?.id) : null;
      } catch (_) { return null; }
    }
  }

  // ─── ReconnectOrchestrator (main) ─────────────────────────────────────────

  class ReconnectOrchestrator {
    constructor() {
      this._state      = RECOVERY_STATE.DISCONNECTED;
      this._backoff    = new BackoffTimer(1000, 45000);
      this._supervisor = new ConnectionSupervisor();
      this._restore    = new SessionRestoration();
      this._timer      = null;
      this._listeners  = [];
      this._reconnectCount  = 0;
      this._lastConnectedAt = null;
      this._started    = false;
    }

    start() {
      if (this._started) return;
      this._started = true;

      this._attachSocketListeners();
      this._startSupervisor();

      // Also listen to browser online/offline events
      window.addEventListener('online',  () => this._onBrowserOnline());
      window.addEventListener('offline', () => this._onBrowserOffline());

      // Visibility recovery
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this._onTabVisible();
        }
      });

      console.log('[Reconnect] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    getState()        { return this._state; }
    isConnected()     { return this._state === RECOVERY_STATE.CONNECTED || this._state === RECOVERY_STATE.RECOVERED; }
    isReconnecting()  { return this._state === RECOVERY_STATE.RECONNECTING; }
    getReconnectCount() { return this._reconnectCount; }

    onStateChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      return {
        state:           this._state,
        reconnectCount:  this._reconnectCount,
        backoffAttempts: this._backoff.attempts,
        lastConnectedAt: this._lastConnectedAt,
        supervisor:      this._supervisor.getStatus(),
      };
    }

    // ── Private — State transitions ──────────────────────────────────────────

    _setState(newState) {
      if (newState === this._state) return;
      const prev    = this._state;
      this._state   = newState;

      console.log(`[Reconnect] State: ${prev} → ${newState}`);
      this._listeners.forEach(fn => { try { fn({ state: newState, prev }); } catch (_) {} });

      // Broadcast state to all iframes
      try { window.dispatchEvent(new CustomEvent('kyn:recovery:state', { detail: { state: newState, prev } })); } catch (_) {}

      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SYSTEM_NETWORK_CHANGED', { recoveryState: newState }, { async: true });
    }

    async _onConnected() {
      this._lastConnectedAt = Date.now();
      this._reconnectCount++;
      this._backoff.reset();
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }

      this._setState(RECOVERY_STATE.RESYNCING);

      try {
        await this._restore.restore();

        // FIX #17 — After room rejoin, fetch missed events from server
        const socket = window.KynectaRealtime?._socket;
        if (socket?.connected) {
          const myId = this._restore._getMyUserId();
          // Request any events we missed while disconnected
          socket.emit('sync:missed_events', {
            since: this._lastDisconnectedAt || (Date.now() - 5 * 60 * 1000),
            userId: myId
          });
          // Trigger full message sync
          if (window.KynectaSyncEngine?.scheduleSyncAll) {
            window.KynectaSyncEngine.scheduleSyncAll(800);
          }
        }

        this._setState(RECOVERY_STATE.RECOVERED);

        setTimeout(() => {
          if (this._state === RECOVERY_STATE.RECOVERED) {
            this._setState(RECOVERY_STATE.CONNECTED);
          }
        }, 2000);
      } catch (_) {
        this._setState(RECOVERY_STATE.DEGRADED);
      }
    }

    _onDisconnected(reason) {
      this._lastDisconnectedAt = Date.now(); // FIX #17 — track disconnect time for missed-event window
      this._setState(RECOVERY_STATE.DISCONNECTED);

      if (reason === 'io server disconnect' || reason === 'transport close') {
        // Server explicitly disconnected — wait before reconnecting
        this._scheduleReconnect();
      }
      // If transport error, socket.io will handle its own retry
    }

    _scheduleReconnect() {
      if (this._backoff.maxed) {
        this._setState(RECOVERY_STATE.FAILED);
        console.warn('[Reconnect] Max retries reached — entering FAILED state');
        return;
      }

      if (!navigator.onLine) {
        this._setState(RECOVERY_STATE.OFFLINE_MODE);
        return;
      }

      const delay = this._backoff.next();
      this._setState(RECOVERY_STATE.RECONNECTING);
      console.log(`[Reconnect] Retry in ${delay}ms (attempt ${this._backoff.attempts})`);

      this._timer = setTimeout(() => {
        const socket = window.KynectaRealtime?._socket;
        if (socket && !socket.connected) {
          socket.connect();
        }
      }, delay);
    }

    _onBrowserOnline() {
      if (this._state === RECOVERY_STATE.OFFLINE_MODE || this._state === RECOVERY_STATE.FAILED) {
        this._backoff.reset();
        this._scheduleReconnect();
      }
    }

    _onBrowserOffline() {
      this._setState(RECOVERY_STATE.OFFLINE_MODE);
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }

    _onTabVisible() {
      const socket = window.KynectaRealtime?._socket;
      if (socket?.connected) {
        // Just re-sync, don't reconnect
        this._restore.restore().catch(() => {});
      } else if (!this.isReconnecting()) {
        this._backoff.reset();
        this._scheduleReconnect();
      }
    }

    // ── Private — Listeners ──────────────────────────────────────────────────

    _attachSocketListeners() {
      const tryAttach = () => {
        const rt = window.KynectaRealtime;
        if (!rt) { setTimeout(tryAttach, 500); return; }

        // Use EventBus (fired by existing app.realtime.socket.js)
        const bus = window.KynectaEventBus;
        if (bus) {
          bus.on('SOCKET_CONNECTED', () => this._onConnected());
          bus.on('SOCKET_DISCONNECTED', ({ reason } = {}) => this._onDisconnected(reason));
          bus.on('SOCKET_EVENT', payload => {
            if (payload?.type === 'socket:reconnected') this._onConnected();
            if (payload?.type === 'socket:disconnected') this._onDisconnected(payload.reason);
          });
        }

        // Also directly watch the socket
        const socket = rt._socket;
        if (socket) {
          socket.on('connect',    () => this._onConnected());
          socket.on('disconnect', (reason) => this._onDisconnected(reason));
        } else {
          // Wait for socket to be created
          setTimeout(tryAttach, 1000);
        }
      };
      tryAttach();
    }

    _startSupervisor() {
      this._supervisor.monitor('socket', () => {
        const socket = window.KynectaRealtime?._socket;
        const ok     = socket?.connected || false;
        if (!ok && this._state === RECOVERY_STATE.CONNECTED) {
          console.warn('[Reconnect] Supervisor: socket disconnected unexpectedly');
          this._onDisconnected('supervisor_detected');
        }
        return ok;
      }, 20000);

      this._supervisor.monitor('heartbeat', () => {
        const socket = window.KynectaRealtime?._socket;
        if (socket?.connected) {
          socket.emit('heartbeat', { ts: Date.now() });
          return true;
        }
        return false;
      }, 25000);
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const orchestrator = new ReconnectOrchestrator();

  const tryStart = () => {
    if (window.KynectaEventBus || window.KynectaRealtime) {
      orchestrator.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__ReconnectOrchestrator = orchestrator;
  window.ReconnectOrchestrator   = orchestrator;
  window.RECOVERY_STATE          = RECOVERY_STATE;

  console.log('[Reconnect] ✅ Ready');
})();