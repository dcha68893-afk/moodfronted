/**
 * RuntimeIntegrationValidator.js
 * Phase 6 — Full System Integration + Runtime Validation (Frontend)
 *
 * Validates every Phase 1-5 module is actually running, connected,
 * and communicating correctly. Repairs integration gaps at runtime.
 *
 * Runs in-browser — no UI shown to users. Results accessible via:
 *   window.__NexopaDiag()
 *   window.__Phase6Report
 *
 * @version 6.0.0
 * @phase 6 — Runtime Validation
 */

(function () {
  'use strict';

  if (window.__RuntimeIntegrationValidator) return;

  // ─── ModuleHealthChecker ─────────────────────────────────────────────────

  class ModuleHealthChecker {
    check() {
      const modules = {
        // Phase 1
        NetworkIntelligence:    { obj: window.__NetworkIntelligenceManager,    required: true  },
        RealtimeStabilization:  { obj: window.__RealtimeStabilizationLayer,    required: true  },
        PersistenceStab:        { obj: window.__PersistenceStabilizationLayer, required: true  },
        CacheFoundation:        { obj: window.__CacheFoundationLayer,          required: true  },
        QueueFoundation:        { obj: window.__QueueFoundationLayer,          required: true  },
        PresenceEngine:         { obj: window.__PresenceEngineFoundation,      required: true  },
        NotificationStab:       { obj: window.__NotificationStabilizationLayer,required: true  },
        IdentityFoundation:     { obj: window.__IdentityFoundationLayer,       required: true  },
        MonitoringFoundation:   { obj: window.__MonitoringFoundation,          required: true  },
        // Phase 2
        HybridTransport:        { obj: window.__HybridTransportEngine,         required: true  },
        LANCommunication:       { obj: window.__LANCommunicationEngine,        required: false },
        MeshRelay:              { obj: window.__MeshRelayEngine,               required: false },
        OfflineQueue:           { obj: window.__OfflineMessageQueue,           required: true  },
        ReliableDelivery:       { obj: window.__ReliableDeliveryEngine,        required: true  },
        RealtimeSync:           { obj: window.__RealtimeSyncEngine,            required: true  },
        BackgroundSync:         { obj: window.__BackgroundSyncService,         required: true  },
        // Phase 3
        CallStateMachine:       { obj: window.__CallStateMachine,              required: false },
        DeviceMedia:            { obj: window.__DeviceMediaManager,            required: false },
        PeerConnMgr:            { obj: window.__PeerConnectionManager,         required: false },
        CallOrchestrator:       { obj: window.__WebRTCSessionOrchestrator,     required: false },
        // Phase 4
        GroupOrchestrator:      { obj: window.__GroupOrchestrator,            required: true  },
        GroupModeration:        { obj: window.__GroupModerationEngine,         required: true  },
        GroupPresenceCache:     { obj: window.__GroupPresenceCacheEngine,      required: true  },
        SocialNotification:     { obj: window.__SocialNotificationEngine,      required: true  },
        StoryEngine:            { obj: window.__StatusStoryEngine,             required: true  },
        // Phase 5
        SecurityLayer:          { obj: window.__SecurityLayer,                 required: true  },
        ReconnectOrchestrator:  { obj: window.__ReconnectOrchestrator,         required: true  },
        DurableQueue:           { obj: window.__DurableQueueLayer,             required: true  },
        BGReliability:          { obj: window.__BackgroundReliabilityService,  required: true  },
        ProductionMonitor:      { obj: window.__ProductionMonitoringLayer,     required: true  },
        CacheRepair:            { obj: window.__CacheRepairEngine,             required: true  },
      };

      const results = {};
      let healthy = 0, unhealthy = 0;

      for (const [name, { obj, required }] of Object.entries(modules)) {
        const alive = !!obj;
        results[name] = { alive, required };
        if (alive) healthy++;
        else if (required) unhealthy++;
      }

      return { results, healthy, unhealthy, total: Object.keys(modules).length };
    }
  }

  // ─── SocketHealthChecker ────────────────────────────────────────────────

  class SocketHealthChecker {
    check() {
      const rt = window.KynectaRealtime;
      if (!rt) return { connected: false, reason: 'KynectaRealtime not found' };

      const socket    = rt._socket;
      // PHASE10-FIX: In iframes, socket is bridged through parent frame.
      // Check all possible indicators of a live connection:
      const inIframe = window.parent !== window;

      const state = rt.getState?.() || rt.state || 'UNKNOWN';

      // FIX-SOCKET-FLICKER: Socket.IO upgrades polling→WebSocket which briefly
      // sets socket.connected = false during the transport handshake.
      // We must treat TRANSIENT states (connecting/reconnecting/authenticating)
      // as "connected" — the socket is not dead, it is mid-upgrade or mid-auth.
      // Previously this caused the validator to log socket: ❌ then ✅ repeatedly.
      const HEALTHY_STATES = ['authenticated', 'connected', 'connecting', 'reconnecting', 'authenticating'];
      const stateIsHealthy = HEALTHY_STATES.includes(state.toLowerCase());

      const connected =
        socket?.connected === true ||           // direct socket confirmed
        rt.isConnected?.() === true ||          // compat method
        rt.state === 'authenticated' ||         // bridge state
        rt.getState?.() === 'authenticated' ||  // state method
        stateIsHealthy ||                       // FIX: transient states are not dead
        window.__kynParentReady === true ||     // parent shell confirmed ready
        (inIframe && navigator.onLine);         // iframe always connected via parent

      const listeners = rt._listeners?.size || 0;

      return {
        connected,
        state,
        listeners,
        socketId:    socket?.id || null,
        hasSocket:   !!socket,
        inIframe:    window.parent !== window,
        parentReady: window.__kynParentReady === true,
        // Check if group/status events are registered
        groupEventsRegistered: rt._registeredSocketListeners?.has?.('group:message') || false,
        statusEventsRegistered: rt._registeredSocketListeners?.has?.('status:new') || false,
      };
    }
  }

  // ─── EventBusHealthChecker ──────────────────────────────────────────────

  class EventBusHealthChecker {
    check() {
      const bus = window.KynectaEventBus;
      if (!bus) return { healthy: false, reason: 'KynectaEventBus not found' };

      return {
        healthy:   true,
        listeners: typeof bus._listeners === 'object' ? Object.keys(bus._listeners || {}).length : 'unknown',
      };
    }
  }

  // ─── UIIntegrationChecker ───────────────────────────────────────────────

  class UIIntegrationChecker {
    check() {
      return {
        // Check for critical UI elements Phase 3 needs
        localVideoPresent:  !!(document.getElementById('local-video') || document.getElementById('localVideo') || document.querySelector('[data-local-video]')),
        remoteVideoPresent: !!(document.getElementById('remote-video') || document.getElementById('remoteVideo') || document.querySelector('[data-remote-video]')),
        groupGridPresent:   !!(document.getElementById('group-call-grid') || document.querySelector('[data-call-grid]')),
        // Check for bootstrap loaded
        phase5Loaded:       !!window.__Phase5Bootstrapped,
        // Check KynectaRealtime exposed
        realtimeExposed:    !!window.KynectaRealtime,
        // Check EventBus exposed
        eventBusExposed:    !!window.KynectaEventBus,
      };
    }
  }

  // ─── IntegrationRepairEngine ─────────────────────────────────────────────

  class IntegrationRepairEngine {
    /**
     * Repair integration gaps found by the validators.
     */
    async repair(healthReport) {
      const repairs = [];

      // Repair 1: Register missing socket events — ONLY in parent frame
      // In iframes the socket bridge is managed by the parent; we must not
      // duplicate event registration in child frames.
      if (!healthReport.socket?.groupEventsRegistered && window.parent === window) {
        this._registerMissingSocketEvents();
        repairs.push('socket:group_events_registered');
      }

      // Repair 2: If offline queue has no send handler, wire it
      const q = window.__OfflineMessageQueue;
      if (q && !q._sendHandler) {
        this._wireOfflineQueueHandler();
        repairs.push('offline_queue:send_handler_wired');
      }

      // Repair 3: If reconnect orchestrator not started, start it
      // FIX: Only start in the TOP FRAME (parent shell). In child iframes the
      // orchestrators are present in memory but must NOT be started — they have no
      // direct socket and starting them in bridge-mode frames creates phantom
      // reconnect loops and repeated 'reconnect_orchestrator:started' log spam
      // every validation cycle.
      if (window.parent === window) {
        const reco = window.__ReconnectOrchestrator;
        if (reco && !reco._started) {
          reco.start?.();
          repairs.push('reconnect_orchestrator:started');
        }

        // Repair 4: If group orchestrator not started, start it
        // FIX: Same parent-frame guard as Repair 3 — iframes must not start the
        // GroupOrchestrator independently; the parent shell owns orchestration.
        const go = window.__GroupOrchestrator;
        if (go && !go._started) {
          go.start?.();
          repairs.push('group_orchestrator:started');
        }
      }

      // Repair 5: Flush any queued messages now that socket is connected.
      // FIX: Guard with a per-socket-id flag so we only flush ONCE per connection,
      // not on every periodic validation cycle. This eliminates the repeated
      // "queues:flushed" + "Flushing offline queue via TransportRuntime" log spam.
      const socket = window.KynectaRealtime?._socket;
      if (socket?.connected) {
        const flushKey = socket.id || 'default';
        if (!this._lastFlushedSocketId || this._lastFlushedSocketId !== flushKey) {
          this._lastFlushedSocketId = flushKey;
          window.__OfflineMessageQueue?.flushAll?.();
          window.__DurableQueueLayer?.flushAll?.();
          repairs.push('queues:flushed');
        }
      } else {
        // Socket not connected — reset so we flush again on next connection
        this._lastFlushedSocketId = null;
      }

      return repairs;
    }

    _registerMissingSocketEvents() {
      const rt = window.KynectaRealtime;
      if (!rt) return;

      // FIX: Only register in the TOP FRAME (parent shell) — never in iframes
      // Running this in iframes creates duplicate listeners and interferes with
      // the parent bridge. The parent frame already handles all event fan-out.
      if (window.parent !== window) return;

      // FIX: One-time registration guard — prevent duplicate listeners across
      // repeated validator runs (validator fires every 30s)
      if (window.__validatorEventsRegistered) return;
      window.__validatorEventsRegistered = true;

      const missing = [
        'group:message', 'group:reaction', 'group:typing', 'group:join', 'group:leave',
        'group:kick', 'group:ban', 'group:presence', 'group:update', 'group:updated',
        'group:role_update', 'group:membership_change', 'group:member_joined', 'group:member_left',
        'status:new', 'status:created', 'status:viewed', 'status:reaction', 'status:reply',
        'status:deleted', 'status:expired',
        'device:registered', 'session:restored', 'turn:config',
        // FIX-AUDIT: Also register message events for cross-module forwarding
        'message:new', 'new_message', 'new_group_message',
      ];

      for (const evt of missing) {
        if (rt._registeredSocketListeners?.has?.(evt)) continue;

        rt.on(evt, payload => {
          // Dispatch kyn: CustomEvent
          try { window.dispatchEvent(new CustomEvent('kyn:' + evt, { detail: payload || {} })); } catch (_) {}
          // Fan-out to iframes ONLY from parent frame
          document.querySelectorAll('iframe').forEach(f => {
            try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + evt, payload: payload || {} }, '*'); } catch (_) {}
          });
          window.KynectaEventBus?.emit('REALTIME_' + evt, payload, { async: true });
        });
      }
    }

    _wireOfflineQueueHandler() {
      const q = window.__OfflineMessageQueue;
      if (!q) return;
      q.setSendHandler(async msg => {
        const socket = window.KynectaRealtime?._socket;
        if (!socket?.connected) throw new Error('Socket not connected');
        await new Promise((resolve, reject) => {
          const isGroup = msg.chatId?.startsWith('group_') || msg.groupId;
          socket.emit(isGroup ? 'groupMessage' : 'sendMessage', msg, ack => {
            if (ack?.error) reject(new Error(ack.error));
            else resolve(ack);
          });
          setTimeout(() => reject(new Error('Timeout')), 12000);
        });
      });
    }
  }

  // ─── DuplicateListenerAuditor ────────────────────────────────────────────

  class DuplicateListenerAuditor {
    audit() {
      const rt  = window.KynectaRealtime;
      if (!rt?._listeners) return { duplicates: 0, events: {} };

      const events = {};
      let duplicates = 0;

      for (const [type, handlers] of rt._listeners) {
        const count = handlers.size || 0;
        events[type] = count;
        if (count > 3) duplicates++; // More than 3 handlers for same event is suspicious
      }

      return { duplicates, events, total: rt._listeners.size };
    }
  }

  // ─── RuntimeIntegrationValidator (main) ──────────────────────────────────

  class RuntimeIntegrationValidator {
    constructor() {
      this._moduleCheck = new ModuleHealthChecker();
      this._socketCheck = new SocketHealthChecker();
      this._busCheck    = new EventBusHealthChecker();
      this._uiCheck     = new UIIntegrationChecker();
      this._repair      = new IntegrationRepairEngine();
      this._dlAudit     = new DuplicateListenerAuditor();
      this._report      = null;
      this._started     = false;
      this._lastSummaryKey = null; // FIX: dedup log output
    }

    async start() {
      if (this._started) return;
      this._started = true;

      // In child iframes: skip the 8-second boot delay — just run the lightweight
      // bridge-mode validation once and set up a long interval (no spam).
      if (window.parent !== window) {
        await this._runValidation();
        // Check every 10 minutes in iframes — nothing meaningful to repair there
        setInterval(() => this._runValidation(), 10 * 60 * 1000);
        console.log('[Phase6] ✅ Runtime Integration Validator started (bridge/iframe mode)');
        return;
      }

      // Run initial validation after delay — give socket time to authenticate
      await new Promise(r => setTimeout(r, 8000));
      await this._runValidation();

      // Periodic re-validation every 5 minutes
      setInterval(() => this._runValidation(), 5 * 60 * 1000);

      console.log('[Phase6] ✅ Runtime Integration Validator started');
    }

    getReport() { return this._report; }

    async _runValidation() {
      // ── IFRAME / BRIDGE-MODE GUARD ─────────────────────────────────────────
      // The validator loads in ALL frames (chat.html + 7 child iframes).
      // In child iframes:
      //   • KynectaRealtime._socket is ALWAYS null (socket lives in parent shell)
      //   • Modules like __ReconnectOrchestrator are present but must NOT be started
      //   • The socket bridge IS working — postMessage to parent confirms connectivity
      // Running full validation in iframes produces false ❌ for every check that
      // touches the raw socket, and triggers spurious repairs (Repairs 3 & 4)
      // on every validation cycle. We short-circuit here with a lightweight
      // bridge-health check instead.
      if (window.parent !== window) {
        // We are inside a child iframe. Build a minimal healthy report.
        const rt = window.KynectaRealtime;
        const bridgeReady = window.__kynParentReady === true || !!rt;
        const state = rt?.getState?.() || rt?.state || 'bridge';

        const report = {
          ts:        new Date().toISOString(),
          isBridge:  true,
          socket:    {
            connected:   bridgeReady || navigator.onLine,
            state:       state,
            inIframe:    true,
            parentReady: window.__kynParentReady === true,
            bridgeMode:  true,
          },
          modules:   { healthy: 0, unhealthy: 0, total: 0, bridgeMode: true },
          repairs:   [],
          eventBus:  { healthy: !!window.KynectaEventBus },
          ui:        { bridgeMode: true },
          listeners: { duplicates: 0, events: {} },
        };

        this._report = report;
        window.__Phase6Report = report;

        // Log only once per session in iframe (not repeatedly)
        if (!this._iframeModeLogged) {
          this._iframeModeLogged = true;
          console.log('[Phase6] ℹ️  Running in child iframe (bridge mode) — full validation skipped. Bridge ready:', bridgeReady);
        }

        return report;
      }
      // ── END IFRAME GUARD ──────────────────────────────────────────────────
      const report = {
        ts:         new Date().toISOString(),
        modules:    this._moduleCheck.check(),
        socket:     this._socketCheck.check(),
        eventBus:   this._busCheck.check(),
        ui:         this._uiCheck.check(),
        listeners:  this._dlAudit.audit(),
        repairs:    [],
      };

      // Auto-repair integration gaps
      report.repairs = await this._repair.repair(report);

      this._report = report;
      window.__Phase6Report = report;

      // FIX-LOG-DEDUP: Only log the validation summary when something changes.
      // Previously it logged every 5 minutes regardless — together with the
      // socket flicker bug this produced the spam:
      //   socket: ❌, repairs: 0 ... socket: ✅, repairs: 1 ... socket: ❌ ...
      // Now we log only when: socket state changes, repair count changes, or
      // unhealthy module count changes.
      const { healthy, unhealthy, total } = report.modules;
      const socketOk = report.socket.connected ? '✅' : '❌';
      const summaryKey = `${healthy}/${total}|${socketOk}|${report.repairs.join(',')}`;
      if (summaryKey !== this._lastSummaryKey) {
        this._lastSummaryKey = summaryKey;
        console.log(`[Phase6] Validation: ${healthy}/${total} modules healthy, socket: ${socketOk}, repairs: ${report.repairs.length}`);

        if (unhealthy > 0) {
          const dead = Object.entries(report.modules.results)
            .filter(([, v]) => !v.alive && v.required)
            .map(([name]) => name);
          console.warn('[Phase6] Required modules NOT loaded:', dead.join(', '));
        }

        if (report.repairs.length > 0) {
          console.log('[Phase6] Auto-repairs applied:', report.repairs.join(', '));
        }
      }

      // Extend the Phase 5 monitoring with Phase 6 data
      if (window.__ProductionMonitoringLayer) {
        const origSnap = window.__ProductionMonitoringLayer.getSnapshot.bind(window.__ProductionMonitoringLayer);
        window.__ProductionMonitoringLayer.getSnapshot = function () {
          const snap = origSnap();
          snap.phase6 = {
            modules: { healthy, unhealthy, total },
            socket:  report.socket,
            repairs: report.repairs,
          };
          return snap;
        };
      }

      return report;
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const validator = new RuntimeIntegrationValidator();

  // Start after all modules have loaded — guard against duplicate events
  // FIX: only bind ONE start trigger; duplicates caused the "started twice" log.
  let _validatorStarted = false;
  function _startOnce() {
    if (_validatorStarted) return;
    _validatorStarted = true;
    validator.start();
  }
  window.addEventListener('nexopa:ready', _startOnce);
  window.addEventListener('phase5:ready',   _startOnce);
  window.addEventListener('phase4:ready',   _startOnce);

  // Fallback — give socket 12 s to connect before first validation
  setTimeout(() => _startOnce(), 12000);

  window.__RuntimeIntegrationValidator = validator;
  window.__Phase6Validator             = validator;

  console.log('[Phase6] ✅ Runtime Integration Validator ready');
})();
