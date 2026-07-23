/**
 * CentralOrchestrationRuntime.js — Phase 11
 *
 * THE master governor of ALL runtime systems.
 *
 * Does NOT replace any existing engine.
 * WIRES all existing engines together into one governed runtime.
 *
 * Governs:
 *   - Transport selection & failover (HTEngine + LAN + Mesh + OfflineQueue)
 *   - Delivery guarantee pipeline (ReliableDeliveryEngine + OfflineMessageQueue)
 *   - State authority hierarchy (server → realtime → cache → optimistic)
 *   - Event bus normalization (single canonical format)
 *   - Session lifecycle (hidden tab, reconnect, background)
 *   - Cache reconciliation (DeletionRegistry + HydrationEngine)
 *   - Runtime health monitoring (MonitoringFoundation)
 *
 * Singleton — window.__COR (Central Orchestration Runtime)
 */

(function () {
  'use strict';

  if (window.__COR) return;

  // ── Constants ──────────────────────────────────────────────────────────────
  const VERSION = '11.0.0';

  const TRANSPORT = Object.freeze({
    INTERNET : 'INTERNET',
    LAN      : 'LAN',
    MESH     : 'MESH',
    PEER     : 'PEER',
    OFFLINE  : 'OFFLINE',
  });

  const DELIVERY = Object.freeze({
    QUEUED     : 'QUEUED',
    ROUTING    : 'ROUTING',
    SENT       : 'SENT',
    ACKED      : 'ACKED',
    PERSISTED  : 'PERSISTED',
    SYNCED     : 'SYNCED',
    DISPLAYED  : 'DISPLAYED',
    READ       : 'READ',
    FAILED     : 'FAILED',
  });

  // ── Engine accessors (always read live — engines may init after us) ────────
  const eng = {
    get hybrid()    { return window.__HybridTransportEngine; },
    get lan()       { return window.__LANCommunicationEngine; },
    get mesh()      { return window.__MeshRelayEngine; },
    get queue()     { return window.__OfflineMessageQueue; },
    get delivery()  { return window.__ReliableDeliveryEngine; },
    get sync()      { return window.__RealtimeSyncEngine; },
    get presence()  { return window.__PresenceEngineFoundation; },
    get monitor()   { return window.__MonitoringFoundation; },
    get reconnect() { return window.__ReconnectOrchestrator; },
    get durable()   { return window.__DurableQueueLayer; },
    get cache()     { return window.__CacheFoundationLayer; },
    get deletion()  { return window.__PHASE10_DeletionRegistry; },
    get p10rt()     { return window.__Phase10TransportRuntime; },
    get realtime()  { return window.KynectaRealtime; },
    get bus()       { return window.KynectaEventBus; },
    get netIntel()  { return window.__NetworkIntelligenceManager; },
    get lanCall()   { return window.__LANCallEngine; },
    get groupOrch() { return window.__GroupOrchestrator; },
  };

  // ── 1. Transport Orchestrator ──────────────────────────────────────────────
  class TransportOrchestrator {
    constructor() {
      this._current  = TRANSPORT.INTERNET;
      this._history  = [];
      this._locks    = new Set(); // prevent race conditions
    }

    // THE canonical send path — all modules call this
    async send(event, payload, options = {}) {
      const transport = options.transport || this._selectBest();
      const msgId = payload.localId || payload.id || `cor_${Date.now()}`;

      // Record in delivery pipeline
      eng.delivery?.trackSend?.({ id: msgId, event, payload });
      eng.delivery?.markSending?.(msgId, transport);

      let result = { ok: false, transport };

      switch (transport) {
        case TRANSPORT.INTERNET:
          result = await this._sendInternet(event, payload);
          break;
        case TRANSPORT.LAN:
          result = await this._sendLAN(event, payload);
          break;
        case TRANSPORT.MESH:
          result = await this._sendMesh(event, payload);
          break;
        case TRANSPORT.OFFLINE:
        default:
          result = await this._enqueueOffline(event, payload, options);
      }

      if (result.ok) {
        eng.hybrid?.recordSuccess?.(transport, 0);
        eng.delivery?.onAck?.(msgId);
      } else {
        eng.hybrid?.recordFailure?.(transport);
        // Failover
        result = await this._failover(transport, event, payload, options);
      }

      return result;
    }

    _selectBest() {
      // In iframe context — always prefer internet (parent has socket)
      const inIframe = window.parent !== window;
      if (inIframe && navigator.onLine) return TRANSPORT.INTERNET;

      return eng.hybrid?.getBestTransport?.() || TRANSPORT.INTERNET;
    }

    async _sendInternet(event, payload) {
      try {
        const rt = eng.realtime;
        if (!rt) return { ok: false };

        // Try socket bridge (works in both parent and iframe)
        if (rt.send) { rt.send(event, payload); return { ok: true, transport: TRANSPORT.INTERNET }; }
        const s = rt._socket;
        if (s?.connected) { s.emit(event, payload); return { ok: true, transport: TRANSPORT.INTERNET }; }

        // iframe bridge via postMessage to parent
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'SOCKET_EMIT', event, payload, source: 'cor' }, '*');
          return { ok: true, transport: TRANSPORT.INTERNET };
        }
        return { ok: false };
      } catch (_) { return { ok: false }; }
    }

    async _sendLAN(event, payload) {
      try {
        const lan = eng.lan;
        if (!lan?.hasPeers?.()) return { ok: false };
        const sent = lan.send({ event, payload });
        return { ok: !!sent, transport: TRANSPORT.LAN };
      } catch (_) { return { ok: false }; }
    }

    async _sendMesh(event, payload) {
      try {
        const mesh = eng.mesh || window.__MeshMessagesTransport;
        if (!mesh) return { ok: false };
        mesh.send?.({ event, payload });
        return { ok: true, transport: TRANSPORT.MESH };
      } catch (_) { return { ok: false }; }
    }

    async _enqueueOffline(event, payload, options) {
      try {
        const q = eng.queue;
        if (!q?.enqueue) return { ok: false };
        await q.enqueue({ ...payload, _event: event, type: options.type || 'message' });
        return { ok: true, queued: true, transport: TRANSPORT.OFFLINE };
      } catch (_) { return { ok: false }; }
    }

    async _failover(failedTransport, event, payload, options) {
      const order = [TRANSPORT.INTERNET, TRANSPORT.LAN, TRANSPORT.MESH, TRANSPORT.OFFLINE];
      for (const t of order) {
        if (t === failedTransport) continue;
        let result;
        switch (t) {
          case TRANSPORT.INTERNET: result = await this._sendInternet(event, payload); break;
          case TRANSPORT.LAN:      result = await this._sendLAN(event, payload); break;
          case TRANSPORT.MESH:     result = await this._sendMesh(event, payload); break;
          case TRANSPORT.OFFLINE:  result = await this._enqueueOffline(event, payload, options); break;
        }
        if (result?.ok) return result;
      }
      return { ok: false };
    }

    getCurrentTransport() { return this._current; }
  }

  // ── 2. Authoritative State Governor ───────────────────────────────────────
  class StateGovernor {
    constructor() {
      // Authority levels: higher = more authoritative
      this._levels = { SERVER: 6, REALTIME: 5, CONFLICT: 4, CACHE: 3, OPTIMISTIC: 2, MEMORY: 1 };
    }

    // Resolve two versions of an entity — return the authoritative one
    resolve(local, remote, level = 'CACHE') {
      if (!remote) return local;
      if (!local)  return remote;

      // Server/realtime is always authoritative
      if (level === 'SERVER' || level === 'REALTIME') return remote;

      // Use RealtimeSyncEngine conflict resolver if available
      if (eng.sync?.resolve) return eng.sync.resolve(local, remote);

      // Fallback: last-write-wins by timestamp
      const localTs  = local.updatedAt  || local.timestamp  || local.createdAt  || 0;
      const remoteTs = remote.updatedAt || remote.timestamp || remote.createdAt || 0;
      return new Date(remoteTs) >= new Date(localTs) ? remote : local;
    }

    // Validate a hydration payload against deletion registry
    validateHydration(type, entities) {
      if (!Array.isArray(entities)) return entities;
      const reg = eng.deletion;
      if (!reg) return entities;
      return entities.filter(e => {
        const id = String(e?.id || e?.messageId || '');
        return !id || !reg.isDeleted(type, id);
      });
    }

    // Check if entity should be rejected as stale
    isStale(type, id) {
      return eng.deletion?.isDeleted?.(type, String(id)) === true;
    }
  }

  // ── 3. Event Bus Normalizer ────────────────────────────────────────────────
  class EventBusNormalizer {
    constructor() {
      // Canonical event map: raw alias → normalized name
      this._map = new Map([
        // Messages
        ['new_message',        'message:chat:created'],
        ['MESSAGE_RECEIVED',   'message:chat:created'],
        ['chat:message',       'message:chat:created'],
        ['message:new',        'message:chat:created'],
        ['message_created',    'message:chat:created'],
        ['message:deleted',    'message:chat:deleted'],
        ['message_deleted',    'message:chat:deleted'],
        ['MESSAGE_DELETED',    'message:chat:deleted'],
        ['message:edited',     'message:chat:updated'],
        ['message:reaction',   'message:chat:reacted'],
        ['message:delivered',  'message:delivery:delivered'],
        ['message:read',       'message:delivery:read'],
        ['message:seen',       'message:delivery:seen'],
        // Groups
        ['group:message',      'message:group:created'],
        ['new_group_message',  'message:group:created'],
        ['GROUP_MESSAGE',      'message:group:created'],
        ['group:join',         'group:member:joined'],
        ['group:leave',        'group:member:left'],
        ['group:membership_change', 'group:member:changed'],
        ['group:updated',      'group:info:updated'],
        ['group:message:deleted', 'message:group:deleted'],
        // Calls
        ['call:incoming',      'call:session:incoming'],
        ['incoming_call',      'call:session:incoming'],
        ['call_incoming',      'call:session:incoming'],
        ['call:accepted',      'call:session:accepted'],
        ['call:rejected',      'call:session:rejected'],
        ['call:ended',         'call:session:ended'],
        ['call:ice_candidate', 'call:webrtc:ice'],
        ['call:offer',         'call:webrtc:offer'],
        ['call:answer',        'call:webrtc:answer'],
        // Status
        ['status:new',         'status:post:created'],
        ['status:deleted',     'status:post:deleted'],
        ['status:expired',     'status:post:expired'],
        ['status:reaction',    'status:post:reacted'],
        ['status:view',        'status:view:registered'],
        // Presence
        ['user:online',        'presence:user:online'],
        ['user:offline',       'presence:user:offline'],
        ['user:typing',        'presence:user:typing'],
        ['presence:update',    'presence:user:updated'],
        // Entity
        ['entity:deleted',     'entity:any:deleted'],
        ['message:patch',      'entity:message:patched'],
        ['lan:message',        'message:lan:received'],
      ]);
    }

    normalize(rawEvent) {
      return this._map.get(rawEvent) || rawEvent;
    }

    // Check if this event has a canonical name (not already normalized)
    isAlias(event) {
      return this._map.has(event);
    }
  }

  // ── 4. Delivery Guarantee Pipeline ────────────────────────────────────────
  class DeliveryPipeline {
    constructor() {
      this._pending = new Map(); // localId → state
      // FIX-AUDIT: Prune entries older than 1h to prevent memory leak
      setInterval(() => {
        const cutoff = Date.now() - 3_600_000;
        for (const [id, entry] of this._pending) {
          if (entry.ts < cutoff) this._pending.delete(id);
        }
      }, 300_000); // every 5 minutes
    }

    transition(localId, state, meta = {}) {
      this._pending.set(localId, { state, ...meta, ts: Date.now() });
      // Forward to ReliableDeliveryEngine if available
      if (state === DELIVERY.SENT)     eng.delivery?.markSending?.(localId, meta.transport);
      if (state === DELIVERY.ACKED)    eng.delivery?.onAck?.(localId);
      if (state === DELIVERY.FAILED)   eng.delivery?.markFailed?.(localId, meta.error);
      if (state === DELIVERY.READ)     eng.delivery?.markSeen?.(localId);
    }

    get(localId) { return this._pending.get(localId) || null; }
    getState(localId) { return this._pending.get(localId)?.state || null; }
  }

  // ── 5. Session Lifecycle Governor ─────────────────────────────────────────
  class SessionLifecycleGovernor {
    constructor() {
      this._hiddenAt    = null;
      this._lastReconn  = null;
      this._recovering  = false;
    }

    start() {
      document.addEventListener('visibilitychange', () => this._onVisibility());
      window.addEventListener('online',             () => this._onOnline());
      window.addEventListener('offline',            () => this._onOffline());
      window.addEventListener('kyn:connected',      () => this._onReconnect());
      window.addEventListener('kyn:authenticated',  () => this._onAuthenticated());
    }

    _onVisibility() {
      if (document.visibilityState === 'hidden') {
        this._hiddenAt = Date.now();
        // Tell presence engine we went background
        eng.presence?._onBackground?.();
      } else {
        const hiddenMs = this._hiddenAt ? Date.now() - this._hiddenAt : 0;
        this._hiddenAt = null;
        this._recoverFromHidden(hiddenMs);
      }
    }

    _onOnline() {
      this._flushQueues();
      eng.deletion?.syncFromServer?.(Date.now() - 24 * 60 * 60 * 1000);
    }

    _onOffline() {
      eng.hybrid?.recordFailure?.(TRANSPORT.INTERNET);
    }

    _onReconnect() {
      if (this._recovering) return;
      this._recovering = true;
      this._lastReconn = Date.now();
      setTimeout(() => {
        this._flushQueues();
        this._syncDeletions();
        this._recovering = false;
      }, 1000);
    }

    _onAuthenticated() {
      this._flushQueues();
    }

    _recoverFromHidden(hiddenMs) {
      if (hiddenMs < 5000) { this._flushQueues(); return; }
      // Long background — verify socket alive
      const rt = eng.realtime;
      if (!rt) { this._flushQueues(); return; }
      const socket = rt._socket;
      if (socket?.connected) {
        // Ping to verify
        let pongOk = false;
        const timer = setTimeout(() => {
          if (!pongOk) eng.reconnect?.forceReconnect?.();
        }, 5000);
        try {
          socket.once?.('pong', () => { pongOk = true; clearTimeout(timer); this._flushQueues(); });
          socket.emit?.('ping');
        } catch (_) { clearTimeout(timer); }
      } else {
        eng.reconnect?.forceReconnect?.();
      }
    }

    _flushQueues() {
      try { eng.queue?.flushAll?.(); } catch (_) {}
      try { eng.durable?.flush?.(); } catch (_) {}
    }

    _syncDeletions() {
      eng.deletion?.syncFromServer?.(Date.now() - 24 * 60 * 60 * 1000);
    }
  }

  // ── 6. Runtime Health Monitor ──────────────────────────────────────────────
  class RuntimeHealthMonitor {
    constructor() {
      this._metrics = {
        transport        : { switches: 0, failures: {}, current: TRANSPORT.INTERNET },
        delivery         : { sent: 0, acked: 0, failed: 0, queued: 0 },
        socket           : { connects: 0, disconnects: 0, reconnects: 0 },
        listeners        : { count: 0, duplicates: 0 },
        cache            : { staleHydrations: 0, tombstoneHits: 0 },
        routing          : { lan: 0, mesh: 0, internet: 0, offline: 0 },
      };
    }

    record(category, key, value = 1) {
      try {
        if (this._metrics[category]) {
          const m = this._metrics[category];
          if (typeof m[key] === 'number') m[key] += value;
          else m[key] = value;
        }
        eng.monitor?._store?.increment?.(`cor.${category}.${key}`, value);
      } catch (_) {}
    }

    snapshot() {
      return {
        version    : VERSION,
        timestamp  : Date.now(),
        metrics    : JSON.parse(JSON.stringify(this._metrics)),
        engines    : {
          hybrid    : !!eng.hybrid,
          lan       : !!eng.lan,
          mesh      : !!eng.mesh,
          queue     : !!eng.queue,
          delivery  : !!eng.delivery,
          sync      : !!eng.sync,
          presence  : !!eng.presence,
          reconnect : !!eng.reconnect,
        },
        transport  : eng.hybrid?.getBestTransport?.() || 'UNKNOWN',
        lanPeers   : eng.lan?.getPeers?.()?.length || 0,
        queueDepth : eng.queue?.size?.() || 0,
        socket     : {
          connected : eng.realtime?._socket?.connected ||
                      eng.realtime?.state === 'authenticated' ||
                      window.__kynParentReady === true,
          state     : eng.realtime?.getState?.() || eng.realtime?.state || 'unknown',
        },
      };
    }
  }

  // ── 7. LAN Activation Engine ───────────────────────────────────────────────
  class LANActivationEngine {
    constructor() {
      this._active = false;
    }

    activate() {
      if (this._active) return;
      this._active = true;

      // Wire LANCommunicationEngine to receive messages and route them
      this._attachLANReceiver();
      // Wire LANCallEngine to use LANCommunicationEngine for signaling
      this._wireLANCallSignaling();
      // Announce our presence to LAN
      this._announcePresence();

      console.log('[COR] ✅ LAN Activation Engine active');
    }

    _attachLANReceiver() {
      // When we receive a LAN message, route it into the normal message pipeline
      window.addEventListener('kyn:lan:message', (e) => {
        try {
          const msg = e.detail;
          if (!msg) return;
          // Treat as normal incoming message
          window.dispatchEvent(new CustomEvent('kyn:new_message', {
            detail: { ...msg, _transport: 'LAN' }
          }));
        } catch (_) {}
      });

      // Socket event: lan:message → local dispatch
      const bus = eng.bus;
      if (bus) {
        bus.on('SOCKET_EVENT', (payload) => {
          if (payload?.type === 'lan:message' || payload?.type === 'lan_message') {
            const msg = payload?.payload?.message || payload?.payload || payload;
            window.dispatchEvent(new CustomEvent('kyn:lan:message', { detail: msg }));
          }
        });
      }
    }

    _wireLANCallSignaling() {
      // When LANCallEngine needs to signal but no internet — route via LANCommunication
      window.addEventListener('kyn:lan:call_signal', (e) => {
        try {
          const signal = e.detail;
          if (!signal) return;
          eng.lan?.send?.({ type: 'call:signal', ...signal });
        } catch (_) {}
      });
    }

    _announcePresence() {
      // Announce via socket so server registers us in LAN registry
      const socket = eng.realtime?._socket;
      if (socket?.connected) {
        const identity = window.__IdentityFoundationLayer?.getIdentity?.();
        socket.emit('lan:announce', {
          userId    : window.__kynUserId,
          deviceId  : identity?.deviceId || window.__kynDeviceId,
          timestamp : Date.now(),
        });
      }
    }
  }

  // ── 8. Canonical Event Wiring ──────────────────────────────────────────────
  class CanonicalEventWiring {
    constructor(normalizer) {
      this._norm     = normalizer;
      this._handlers = new Map(); // canonical event → Set<handler>
      this._wired    = false;
    }

    wire() {
      if (this._wired) return;
      this._wired = true;

      const bus = eng.bus;
      if (!bus) { setTimeout(() => this.wire(), 500); return; }

      // Intercept all SOCKET_EVENT and normalize them
      bus.on('SOCKET_EVENT', (payload) => {
        const raw = payload?.type;
        if (!raw) return;

        const canonical = this._norm.normalize(raw);

        // Dispatch as canonical CustomEvent
        try {
          window.dispatchEvent(new CustomEvent(`kyn:${canonical}`, {
            detail: payload?.payload || payload
          }));
        } catch (_) {}

        // Run registered handlers
        const handlers = this._handlers.get(canonical);
        if (handlers) handlers.forEach(h => { try { h(payload?.payload || payload); } catch(_) {} });
      });

      console.log('[COR] ✅ Canonical event wiring active');
    }

    on(canonicalEvent, handler) {
      if (!this._handlers.has(canonicalEvent)) this._handlers.set(canonicalEvent, new Set());
      this._handlers.get(canonicalEvent).add(handler);
    }

    off(canonicalEvent, handler) {
      this._handlers.get(canonicalEvent)?.delete(handler);
    }
  }

  // ── Central Orchestration Runtime ─────────────────────────────────────────
  class CentralOrchestrationRuntime {
    constructor() {
      this._transport  = new TransportOrchestrator();
      this._state      = new StateGovernor();
      this._normalizer = new EventBusNormalizer();
      this._delivery   = new DeliveryPipeline();
      this._session    = new SessionLifecycleGovernor();
      this._health     = new RuntimeHealthMonitor();
      this._lanEngine  = new LANActivationEngine();
      this._events     = new CanonicalEventWiring(this._normalizer);
      this._started    = false;
    }

    start() {
      if (this._started) return;
      this._started = true;

      // Start all sub-systems
      this._session.start();
      this._events.wire();
      this._lanEngine.activate();

      // Wire existing engines together
      this._wireTransportToDelivery();
      this._wireReconnectToQueues();
      this._wirePresenceToSocket();

      // Expose diagnostic endpoint
      this._registerDiagnostics();

      console.log(`[COR] ✅ Central Orchestration Runtime v${VERSION} active`);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** THE canonical send — all modules should prefer this */
    send(event, payload, options = {}) {
      return this._transport.send(event, payload, options);
    }

    /** Normalize a raw socket event name to canonical form */
    normalize(rawEvent) {
      return this._normalizer.normalize(rawEvent);
    }

    /** Validate hydration payload against deletion registry */
    validateHydration(type, entities) {
      return this._state.validateHydration(type, entities);
    }

    /** Check if entity is deleted/tombstoned */
    isStale(type, id) {
      return this._state.isStale(type, id);
    }

    /** Register a handler for a canonical event */
    on(canonicalEvent, handler) {
      this._events.on(canonicalEvent, handler);
    }

    /** Transition message delivery state */
    delivery(localId, state, meta = {}) {
      this._delivery.transition(localId, state, meta);
    }

    /** Full runtime diagnostics */
    getDiagnostics() {
      return this._health.snapshot();
    }

    // ── Private wiring ────────────────────────────────────────────────────────

    _wireTransportToDelivery() {
      // When transport sends a message, record delivery state
      const bus = eng.bus;
      if (!bus) { setTimeout(() => this._wireTransportToDelivery(), 1000); return; }

      bus.on('SOCKET_EVENT', (payload) => {
        const type = payload?.type;
        if (!type) return;
        const norm = this._normalizer.normalize(type);

        // Track ACKs
        if (norm === 'message:delivery:delivered') {
          const id = payload?.messageId || payload?.localId;
          if (id) this._delivery.transition(id, DELIVERY.ACKED, { transport: TRANSPORT.INTERNET });
        }
        if (norm === 'message:delivery:read') {
          const id = payload?.messageId || payload?.localId;
          if (id) this._delivery.transition(id, DELIVERY.READ);
        }

        // Track transport health
        if (type === 'socket:connected' || type === 'socket:reconnected') {
          this._health.record('socket', 'connects');
          eng.hybrid?.recordSuccess?.(TRANSPORT.INTERNET, 0);
        }
        if (type === 'socket:disconnected') {
          this._health.record('socket', 'disconnects');
          eng.hybrid?.recordFailure?.(TRANSPORT.INTERNET);
        }
      });
    }

    _wireReconnectToQueues() {
      // On reconnect: flush offline queue + sync deletions
      window.addEventListener('kyn:connected', () => {
        setTimeout(() => {
          try { eng.queue?.flushAll?.(); } catch(_) {}
          try { eng.deletion?.syncFromServer?.(Date.now() - 24*60*60*1000); } catch(_) {}
          try {
            const identity = window.__IdentityFoundationLayer?.getIdentity?.();
            eng.realtime?._socket?.emit?.('lan:announce', {
              userId: window.__kynUserId,
              deviceId: identity?.deviceId,
              timestamp: Date.now(),
            });
          } catch(_) {}
          console.log('[COR] Reconnect recovery: queues flushed, deletions synced, LAN announced');
        }, 1000);
      });

      // On authenticated: flush + presence
      window.addEventListener('kyn:authenticated', () => {
        setTimeout(() => {
          try { eng.queue?.flushAll?.(); } catch(_) {}
        }, 500);
      });
    }

    _wirePresenceToSocket() {
      // Wire PresenceEngine heartbeats through the transport
      const presence = eng.presence;
      if (!presence) return;

      // If presence engine emits heartbeats via a custom mechanism, wire it
      window.addEventListener('kyn:presence:heartbeat', (e) => {
        const detail = e.detail;
        if (!detail) return;
        // Route through canonical send
        this.send('presence:heartbeat', detail, { transport: TRANSPORT.INTERNET });
      });
    }

    _registerDiagnostics() {
      // Dashboard endpoint
      window.__CORDiag = () => {
        const d = this.getDiagnostics();
        console.table(d.metrics);
        console.log('[COR] Engines:', d.engines);
        console.log('[COR] Transport:', d.transport, '| LAN peers:', d.lanPeers);
        console.log('[COR] Queue depth:', d.queueDepth);
        console.log('[COR] Socket:', d.socket);
        return d;
      };

      // Mount on MonitoringFoundation if available
      const monitor = eng.monitor;
      if (monitor) {
        monitor._cor = this;
        if (monitor._store) {
          monitor._store.set?.('cor.version', VERSION);
          monitor._store.set?.('cor.started', Date.now());
        }
      }
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  const cor = new CentralOrchestrationRuntime();

  // Start after DOM is ready and other engines have had time to init
  function boot() {
    // Wait for at least the event bus to exist
    if (!window.KynectaEventBus) {
      setTimeout(boot, 200);
      return;
    }
    cor.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }

  // Expose globally
  window.__COR = cor;
  window.__COR_TRANSPORT = TRANSPORT;
  window.__COR_DELIVERY  = DELIVERY;

})();
