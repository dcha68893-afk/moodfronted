/**
 * phase6.bootstrap.js
 * Phase 6 — Full System Integration Bootstrap (Frontend)
 *
 * FINAL bootstrap — loads ALL Phase 1-6 modules.
 * This is the ONLY script tag needed in every HTML page.
 *
 * Usage (in every .html file before </body>):
 *   <script src="/js/core/phase6.bootstrap.js"></script>
 *
 * Path: newrepo/js/core/phase6.bootstrap.js
 *
 * @version 6.0.0 — FINAL PRODUCTION
 */

(function () {
  'use strict';

  if (window.__Phase6Bootstrapped) return;
  window.__Phase6Bootstrapped = true;

  // Auto-detect base path
  const BASE = (function () {
    const s = document.querySelector('script[src*="phase6.bootstrap"]');
    if (s) return s.src.replace('phase6.bootstrap.js', '');
    return '/js/core/';
  })();

  const MODULES = [
    // ── Phase 1: Foundation ──────────────────────────────────────────────
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',
    // ── Phase 2: Hybrid Transport ────────────────────────────────────────
    'network/HybridTransportEngine.js',
    'network/LANCommunicationEngine.js',
    'network/MeshRelayEngine.js',        // lightweight relay engine (always loaded)
    'queue/OfflineMessageQueue.js',
    'realtime/ReliableDeliveryEngine.js',
    'realtime/RealtimeSyncEngine.js',
    'realtime/BackgroundSyncService.js',
    // ── Phase 3: WebRTC Call Engine ──────────────────────────────────────
    'calls/CallStateMachine.js',
    'calls/DeviceMediaManager.js',
    'calls/PeerConnectionManager.js',
    'calls/WebRTCSessionOrchestrator.js',
    'calls/GroupCallEngine.js',
    'calls/AdaptiveBitrateEngine.js',
    'calls/LANCallEngine.js',
    // ── Phase 4: Social Ecosystem ────────────────────────────────────────
    'groups/GroupOrchestrator.js',
    'groups/GroupModerationEngine.js',
    'groups/GroupPresenceCacheEngine.js',
    'groups/SocialNotificationEngine.js',
    'status/StatusStoryEngine.js',
    // ── Phase 5: Production Reliability ─────────────────────────────────
    'security/SecurityLayer.js',
    'recovery/ReconnectOrchestrator.js',
    'recovery/DurableQueueLayer.js',
    'recovery/BackgroundReliabilityService.js',
    'recovery/ProductionMonitoringLayer.js',
    'session/CacheRepairEngine.js',
    // ── Phase 6: Runtime Integration ─────────────────────────────────────
    'recovery/RuntimeIntegrationValidator.js',
    // ── Phase 10: Production Hardening ───────────────────────────────────
    // CacheFoundationLayer already loaded above (contains DeletionRegistry)
    // Transport runtime wires HybridTransportEngine + LAN + Mesh + OfflineQueue
  ];

  // Phase 10 modules loaded from /js/transport/ (outside the core/ base path)
  const PHASE10_MODULES = [
    '/js/transport/HybridTransportRuntime.js',
  ];

  // FIX (Forensic Audit P3): Rich /mesh/ engine — crypto, transport, router, orchestrator.
  // Previously only the lightweight MeshRelayEngine was loaded; the full E2EE mesh stack
  // in /mesh/ was never initialized. Load order matters: crypto → transport → router → engine.
  // mesh-messages-bridge.js is loaded last as it depends on MeshEngine + MeshTransport.
  const MESH_MODULES = [
    '/mesh/mesh-crypto.js',
    '/mesh/mesh-transport.js',
    '/mesh/mesh-router.js',
    '/mesh/mesh-engine.js',
    '/mesh/mesh-messages-bridge.js',
  ];

  // Phase 11: Central Orchestration Runtime — wires all engines together
  const PHASE11_MODULES = [
    'orchestration/CentralOrchestrationRuntime.js',
  ];

  let loaded = 0;
  const startTs = Date.now();

  function loadScript(src) {
    return new Promise(resolve => {
      // FIX: the old check — document.querySelector(`script[src="${src}"]`) —
      // compares against the raw HTML attribute text, but `src` here is always a
      // fully-RESOLVED absolute URL (BASE is derived from script.src, which the
      // DOM always resolves to absolute). A page that wrote its own tag as a
      // relative or root-relative path (e.g. calls.html's
      // <script src="/js/core/calls/CallStateMachine.js">) never matched this
      // selector, so phase6 loaded that file a SECOND time — duplicate classes,
      // duplicate CallManager/WebRTCSessionOrchestrator singletons, duplicate
      // socket + event listeners all firing at once. Comparing against the
      // *live* .src property of every existing <script> (which the DOM always
      // reports as an absolute URL, regardless of how it was authored) fixes
      // the comparison for every page, not just calls.html.
      const already = Array.from(document.scripts).some(s => s.src === src);
      if (already) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload  = () => { loaded++; resolve(); };
      s.onerror = () => { console.warn('[Phase6] Failed:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log(`[Phase6Bootstrap] 🚀 Nexopa loading ${MODULES.length} modules from ${BASE}`);

    for (const m of MODULES) await loadScript(BASE + m);

    // ── Phase 10: load transport runtime + deletion registry ─────────────
    for (const src of PHASE10_MODULES) await loadScript(src);
    console.log('[Phase6Bootstrap] ✅ Phase 10 production hardening modules loaded');

    // ── Mesh Engine (rich /mesh/ stack): crypto → transport → router → engine → bridge ──
    // FIX Bug2: Only load mesh modules if MeshCrypto is not already declared (iframe guard)
    if (!window.MeshCrypto) {
      for (const src of MESH_MODULES) await loadScript(src);
      console.log('[Phase6Bootstrap] ✅ Mesh engine stack loaded (MeshCrypto + MeshTransport + MeshRouter + MeshEngine)');
    } else {
      console.log('[Phase6Bootstrap] ℹ️ MeshCrypto already loaded — skipping MESH_MODULES (iframe guard)');
    }

    // ── Phase 11: load Central Orchestration Runtime ──────────────────────
    for (const m of PHASE11_MODULES) await loadScript(BASE + m);
    console.log('[Phase6Bootstrap] ✅ Phase 11 Central Orchestration Runtime loaded');

    const elapsed = Date.now() - startTs;
    console.log(`[Phase6Bootstrap] ✅ ${loaded}/${MODULES.length} modules in ${elapsed}ms`);

    _wireOfflineQueue();
    _wireTURNConfig();
    _wireGroupEventForwarding();
    _wireCrossModuleListeners();
    _wirePhase10();  // Phase 10: connect all transport/deletion systems

    window.dispatchEvent(new CustomEvent('nexopa:ready', {
      detail: { phase: 10, elapsed, loaded, modules: MODULES.length }
    }));

    const bus = window.KynectaEventBus;
    if (bus) bus.emit('SYNC_STARTED', { reason: 'phase10_boot' }, { async: true });

    console.log('[Phase6Bootstrap] 🎉 Nexopa Phase 10 fully initialized — __NexopaDiag() for diagnostics');
  }

  function _wireOfflineQueue() {
    const q = window.__OfflineMessageQueue;
    if (!q) return;
    // FIX Bug1: Defensive check — some queue implementations (KynectaOfflineQueue alias)
    // don't have setSendHandler. Skip wiring if the method is missing or already set.
    if (typeof q.setSendHandler !== 'function') {
      console.log('[Phase6Bootstrap] ℹ️ _wireOfflineQueue: setSendHandler not available — skipping (KynectaOfflineQueue handles delivery internally)');
      return;
    }
    if (q._sendHandlerWired) {
      console.log('[Phase6Bootstrap] ℹ️ _wireOfflineQueue: send handler already wired — skipping');
      return;
    }
    q._sendHandlerWired = true;
    q.setSendHandler(async msg => {
      // PHASE10: Route through TransportRuntime for proper priority + receipts
      const p10Runtime = window.__Phase10TransportRuntime;
      if (p10Runtime) {
        const event  = msg._event || (msg.groupId ? 'group:message:send' : 'message:send');
        const result = await p10Runtime.deliver(event, msg, { type: 'message', chatId: msg.chatId });
        if (result.ok) {
          console.log(`[OfflineQueue] ✅ Delivered via Phase10 (${result.transport})`);
          // Notify UI of delivery
          try {
            const ChatManager = window.ChatManager || window.KynectaChatManager;
            if (msg.localId && ChatManager?.updateMessageStatus) {
              ChatManager.updateMessageStatus(msg.localId, 'sent', {
                localId: msg.localId, chatId: msg.chatId, optimistic: false, isLocalOnly: false
              });
            }
          } catch(_) {}
          return;
        }
        if (result.queued) {
          // Still offline — stays in queue, no throw needed
          return;
        }
        // result.ok=false and not queued — fall through to REST
      }

      const transport = window.__HybridTransportEngine?.getBestTransport() || 'INTERNET';

      // 1. Try LAN transport first if peers available
      if (transport === 'LAN' && window.__LANCommunicationEngine?.hasPeers?.()) {
        if (window.__LANCommunicationEngine.send(msg)) {
          console.log('[OfflineQueue] ✅ Sent via LAN transport');
          return;
        }
      }

      // 2. Try mesh relay if available
      if (transport === 'MESH' && window.__MeshMessagesTransport?.send) {
        try {
          await window.__MeshMessagesTransport.send(msg);
          console.log('[OfflineQueue] ✅ Sent via Mesh transport');
          return;
        } catch(_) {}
      }

      // 3. Fall back to REST API (same as normal send) — most reliable
      const apiBase = window.__getApiBase?.() || 'https://noxopa.onrender.com/api';
      const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
      const endpoint = msg.groupId ? `${apiBase}/groups/${msg.groupId}/messages` : `${apiBase}/messages`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          chatId:     msg.chatId,
          content:    msg.content,
          type:       msg.type || 'text',
          localId:    msg.localId || msg.id,
          attachment: msg.attachment || null,
          replyToId:  msg.replyToId || null,
          _offlineReplay: true,
        }),
      });

      if (!resp.ok) throw new Error(`Send failed: ${resp.status}`);
      console.log('[OfflineQueue] ✅ Queued message delivered via REST');

      // Notify message iframe that queued message was delivered
      const messagesIframe = document.getElementById('messagesIframe');
      if (messagesIframe?.contentWindow && msg.localId) {
        messagesIframe.contentWindow.postMessage({
          type: 'queue:delivered',
          localId: msg.localId,
          chatId: msg.chatId,
        }, '*');
      }
    });
    console.log('[Phase6Bootstrap] OfflineQueue send handler wired');
  }

  function _wireTURNConfig() {
    const bus = window.KynectaEventBus;
    if (!bus) return;
    bus.on('SOCKET_EVENT', payload => {
      if (payload?.type === 'turn:config' && Array.isArray(payload.servers)) {
        window.__kynTURN = payload.servers;
        console.log('[Phase6Bootstrap] TURN servers received:', payload.servers.length);
      }
    });
  }

  function _wireGroupEventForwarding() {
    // Group/status events are now in app.realtime.socket.js allEvents array (Phase 6 patch)
    // This is a safety net for iframes where the patched socket file may not be active
    const tryWire = () => {
      const rt = window.KynectaRealtime;
      if (!rt?.on) { setTimeout(tryWire, 800); return; }

      const safetyEvents = [
        'group:message', 'group:reaction', 'group:typing', 'group:join', 'group:leave',
        'group:kick', 'group:ban', 'group:unban', 'group:mute', 'group:unmute',
        'group:presence', 'group:update', 'group:updated', 'group:role_update',
        'group:pin', 'group:announcement', 'group:membership_change', 'group:slow_mode',
        'group:read_receipt', 'group:member_joined', 'group:member_left', 'group:rejoin_ack',
        'group:delete', 'group:deleted',
        // FIX-ROOT-CAUSE (duplicate status events / duplicate replies in UI):
        // status:* events removed from this generic safety-net list.
        // StatusStoryEngine.js already owns these — it has its own rt.on()
        // subscription that does the real local work (persist to store,
        // schedule expiry, update sequence) and then re-broadcasts the same
        // 'kyn:'+evt CustomEvent + iframe postMessage itself via
        // _dispatchToAll(). Forwarding them again here meant every status
        // event (replies, reactions, new stories, deletions) was delivered
        // to every consumer twice.
        'device:registered', 'session:restored', 'session:revoked', 'turn:config',
        'reconnect:required',
      ];

      for (const evt of safetyEvents) {
        // Use the existing .on() method which already deduplicates handlers
        rt.on(evt, payload => {
          try { window.dispatchEvent(new CustomEvent('kyn:' + evt, { detail: payload || {} })); } catch (_) {}
          document.querySelectorAll('iframe').forEach(f => {
            try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + evt, payload: payload || {} }, '*'); } catch (_) {}
          });
          window.KynectaEventBus?.emit('REALTIME_' + evt, payload, { async: true });
        });
      }

      console.log(`[Phase6Bootstrap] Safety-wired ${safetyEvents.length} group+status+phase5 events`);
    };
    tryWire();
  }

  function _wireCrossModuleListeners() {
    // Wire DurableQueue failures to ProductionMonitor
    window.__DurableQueueLayer?.onStateChange?.(op => {
      if (op.state === 'FAILED') {
        window.__ProductionMonitoringLayer?.log('queue', 'op_failed', {
          type: op.queueType, attempts: op.attempts,
        });
      }
    });

    // Wire reconnect state changes to monitor
    window.__ReconnectOrchestrator?.onStateChange?.(({ state, prev }) => {
      window.__ProductionMonitoringLayer?.log('recovery', 'state_change', { state, prev });
      if (state === 'RECOVERED') {
        window.__ProductionMonitoringLayer?.recordReconnect(state, 0);
      }
    });

    // Wire call drops to monitor
    window.__CallStateMachine?.watchAll?.(({ callId, state, session }) => {
      if (state === 'FAILED' || (state === 'ENDED' && session?.endReason === 'peer_error')) {
        window.__ProductionMonitoringLayer?.recordCallDrop(
          callId, session?.endReason, session?.duration
        );
      }
    });

    // Broadcast new messages to other tabs via BroadcastChannel
    const bus = window.KynectaEventBus;
    if (bus) {
      bus.on('MESSAGE_RECEIVED', msg => {
        window.__BackgroundReliabilityService?.broadcastMessage?.(msg);
      });
    }

    console.log('[Phase6Bootstrap] Cross-module listeners wired');
  }

  // ── Phase 10: Wire all production systems together ─────────────────────
  function _wirePhase10() {
    // 1. Expose Phase10TransportRuntime globally if not already done
    if (!window.__Phase10TransportRuntime) {
      console.warn('[Phase10] TransportRuntime not loaded — check /js/transport/HybridTransportRuntime.js');
    } else {
      console.log('[Phase10] TransportRuntime active — best:', window.__Phase10TransportRuntime.getBestTransport());
    }

    // 2. Wire OfflineQueue flush through TransportRuntime on reconnect
    const q = window.__OfflineMessageQueue;
    if (q && window.__Phase10TransportRuntime) {
      const origFlush = q.flushAll?.bind(q);
      q.flushAll = async function () {
        // FIX-LOG-NOISE: Only log when there are actually pending messages to flush.
        // Previously it logged "[Phase10] Flushing offline queue via TransportRuntime"
        // on every validator cycle (every 5 min), even when the queue was empty.
        const pending = q.getPending?.() || [];
        if (pending.length > 0) {
          console.log('[Phase10] Flushing offline queue via TransportRuntime — pending:', pending.length);
        }
        for (const entry of pending) {
          try {
            const result = await window.__Phase10TransportRuntime.deliver(
              entry._event || 'message:send',
              entry,
              { type: 'message', chatId: entry.chatId }
            );
            if (result.ok) q.markDelivered?.(entry.id).catch(() => {});
          } catch (_) {}
        }
        if (origFlush) await origFlush().catch(() => {});
      };
    }

    // 3. Start LAN announce cycle now that transport is ready
    const lan = window.__LANCommunicationEngine;
    if (lan?.isEnabled?.()) {
      console.log('[Phase10] LAN engine active — peers:', lan.getPeers?.()?.length || 0);
    }

    // FIX (Forensic Audit P3): Wire rich MeshEngine into HybridTransportEngine's mesh slot.
    // Previously MeshRelayEngine was loaded but never connected to the transport decision layer.
    // Now: if MeshEngine (full E2EE stack) is available, register it as the mesh transport.
    // If only MeshRelayEngine is available (lightweight fallback), use that.
    const richMesh   = window.MeshEngine;    // /mesh/mesh-engine.js
    const relayMesh  = window.__MeshRelayEngine; // /js/core/network/MeshRelayEngine.js
    const transport  = window.__Phase10TransportRuntime || window.__HybridTransportEngine;
    if (richMesh && transport?.registerMeshTransport) {
      transport.registerMeshTransport({
        send:        (payload, targetId) => richMesh.send?.(targetId, JSON.stringify(payload)),
        relay:       (payload, targetId) => richMesh.relay?.(payload, targetId),
        isReachable: (deviceId)          => richMesh.isOnline?.() || false,
        getStats:    ()                  => richMesh.getDiag?.() || {},
      });
      console.log('[Phase10] ✅ Rich MeshEngine (E2EE) registered as mesh transport');
    } else if (relayMesh && transport?.registerMeshTransport) {
      transport.registerMeshTransport({
        send:        (payload, targetId) => relayMesh.relay?.(payload, targetId),
        relay:       (payload, targetId) => relayMesh.relay?.(payload, targetId),
        isReachable: (deviceId)          => relayMesh.isReachable?.(deviceId) || false,
        getStats:    ()                  => relayMesh.getDiagnostics?.() || {},
      });
      console.log('[Phase10] ✅ MeshRelayEngine (lightweight) registered as mesh transport');
    }

    // Also update the offline queue mesh path to prefer rich engine
    if (richMesh) {
      window.__MeshMessagesTransport = {
        send: (payload) => {
          const targetId = payload?.to || payload?.userId || payload?.targetUserId;
          if (!targetId) return false;
          return richMesh.send?.(targetId, typeof payload === 'string' ? payload : JSON.stringify(payload)) ?? false;
        }
      };
    }

    // 4. Emit phase10 ready event for any waiting modules
    window.dispatchEvent(new CustomEvent('phase10:ready', {
      detail: {
        transport   : window.__Phase10TransportRuntime?.getBestTransport() || 'INTERNET',
        lan         : window.__LANCommunicationEngine?.hasPeers?.() || false,
        offlineQueue: window.__OfflineMessageQueue?.size?.() || 0,
      }
    }));

    // 5. Expose diagnostics helper
    window.__Phase10Diag = function () {
      return {
        transport   : window.__Phase10TransportRuntime?.getDiagnostics?.(),
        lan         : window.__LANCommunicationEngine?.getDiagnostics?.(),
        deletion    : { entries: window.__PHASE10_DeletionRegistry?._entries?.size },
        offlineQueue: {
          size    : window.__OfflineMessageQueue?.size?.(),
          pending : window.__OfflineMessageQueue?.getPending?.()?.length,
        },
      };
    };

    console.log('[Phase10] All production hardening systems wired ✅');

    // PHASE11: Verify COR started
    if (window.__COR) {
      console.log('[Phase11] CentralOrchestrationRuntime active ✅');
      window.__Phase11Diag = function() { return window.__COR?.getDiagnostics?.(); };
    } else {
      console.warn('[Phase11] COR not yet started — will retry');
      setTimeout(() => {
        if (window.__COR) console.log('[Phase11] COR activated (delayed) ✅');
      }, 2000);
    }

    // FIX-AUDIT: Cross-flush DurableQueueLayer into OfflineMessageQueue on reconnect
    // They are two separate queues — wire them together so nothing falls through
    const _durableQ = window.__DurableQueueLayer;
    const _offlineQ = window.__OfflineMessageQueue;
    if (_durableQ && _offlineQ) {
      window.addEventListener('kyn:connected', function() {
        setTimeout(function() {
          try {
            const pending = _durableQ.getPending?.() || [];
            pending.forEach(function(op) {
              if (op.type === 'message' && op.payload) {
                _offlineQ.enqueue?.(op.payload).catch?.(() => {});
              }
            });
            if (pending.length > 0) {
              console.log('[Phase11] Cross-flushed', pending.length, 'DurableQueue ops into OfflineQueue');
            }
          } catch(_) {}
        }, 1500);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();