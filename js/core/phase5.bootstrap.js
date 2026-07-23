/**
 * phase5.bootstrap.js
 * Phase 5 — Complete Production Bootstrap (Frontend)
 *
 * Loads ALL Phase 1 → 5 modules in dependency order.
 * This is the FINAL bootstrap — replaces all previous phase boots.
 *
 * HTML pages: add ONE script tag before </body> in EVERY .html file:
 *   <script src="/js/core/phase5.bootstrap.js"></script>
 *
 * NOTE: Path is /js/core/ NOT /data/js/core/
 * The actual js folder in newrepo is newrepo/js/ (not newrepo/data/js/)
 * The files in newrepo/data/js/ are duplicates — use newrepo/js/
 *
 * @version 5.0.0 — FINAL
 */

(function () {
  'use strict';

  if (window.__Phase5Bootstrapped) return;
  window.__Phase5Bootstrapped = true;

  // Auto-detect base path from script src
  const BASE = (function () {
    const s = document.querySelector('script[src*="phase5.bootstrap"]');
    if (s) return s.src.replace('phase5.bootstrap.js', '');
    // Fallback — try /js/core/ first, then /data/js/core/
    return '/js/core/';
  })();

  const MODULES = [
    // ── Phase 1: Foundation ──────────────────────────────────────────────────
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',

    // ── Phase 2: Hybrid Transport ────────────────────────────────────────────
    'network/HybridTransportEngine.js',
    'network/LANCommunicationEngine.js',
    'network/MeshRelayEngine.js',
    'queue/OfflineMessageQueue.js',
    'realtime/ReliableDeliveryEngine.js',
    'realtime/RealtimeSyncEngine.js',
    'realtime/BackgroundSyncService.js',

    // ── Phase 3: WebRTC Call Engine ──────────────────────────────────────────
    'calls/CallStateMachine.js',
    'calls/DeviceMediaManager.js',
    'calls/PeerConnectionManager.js',
    'calls/WebRTCSessionOrchestrator.js',
    'calls/GroupCallEngine.js',
    'calls/AdaptiveBitrateEngine.js',
    'calls/LANCallEngine.js',

    // ── Phase 4: Social Ecosystem ────────────────────────────────────────────
    'groups/GroupOrchestrator.js',
    'groups/GroupModerationEngine.js',
    'groups/GroupPresenceCacheEngine.js',
    'groups/SocialNotificationEngine.js',
    'status/StatusStoryEngine.js',

    // ── Phase 5: Production Reliability ──────────────────────────────────────
    'security/SecurityLayer.js',
    'recovery/ReconnectOrchestrator.js',
    'recovery/DurableQueueLayer.js',
    'recovery/BackgroundReliabilityService.js',
    'recovery/ProductionMonitoringLayer.js',
    'session/CacheRepairEngine.js',
  ];

  let loaded = 0;
  const startTs = Date.now();

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s   = document.createElement('script');
      s.src     = src;
      s.async   = false;
      s.onload  = () => { loaded++; resolve(); };
      s.onerror = () => { console.warn('[Phase5] Failed to load:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log(`[Phase5Bootstrap] 🚀 MoodChat Phase 1-5 loading from: ${BASE}`);

    for (const m of MODULES) await loadScript(BASE + m);

    const elapsed = Date.now() - startTs;
    console.log(`[Phase5Bootstrap] ✅ ${loaded}/${MODULES.length} modules loaded in ${elapsed}ms`);

    _wireOfflineQueue();
    _wireTURNConfig();
    _wireGroupEventForwarding();
    _wireCrossModuleListeners();

    window.dispatchEvent(new CustomEvent('moodchat:ready', {
      detail: { phase: 5, elapsed, loaded, modules: MODULES.length }
    }));

    const bus = window.KynectaEventBus;
    if (bus) {
      bus.emit('SYNC_STARTED', { reason: 'phase5_boot' }, { async: true });
    }

    console.log('[Phase5Bootstrap] 🎉 MoodChat fully initialized — __MoodChatDiag() for diagnostics');
  }

  function _wireOfflineQueue() {
    const q = window.__OfflineMessageQueue;
    if (!q) return;
    q.setSendHandler(async msg => {
      const transport = window.__HybridTransportEngine?.getBestTransport() || 'INTERNET';
      if (transport === 'LAN' && window.__LANCommunicationEngine?.hasPeers()) {
        if (window.__LANCommunicationEngine.send(msg)) return;
      }
      const socket = window.KynectaRealtime?._socket;
      if (!socket?.connected) throw new Error('Socket not connected');
      await new Promise((resolve, reject) => {
        const isGroup = msg.chatId?.startsWith('group_') || msg.groupId;
        const ev      = isGroup ? 'groupMessage' : 'sendMessage';
        socket.emit(ev, msg, ack => {
          if (ack?.error) reject(new Error(ack.error));
          else resolve(ack);
        });
        setTimeout(() => reject(new Error('Send timeout')), 12000);
      });
    });
  }

  function _wireTURNConfig() {
    const bus = window.KynectaEventBus;
    if (!bus) return;
    bus.on('SOCKET_EVENT', payload => {
      if (payload?.type === 'turn:config' && Array.isArray(payload.servers)) {
        window.__kynTURN = payload.servers;
      }
    });
  }

  function _wireGroupEventForwarding() {
    const tryWire = () => {
      const rt = window.KynectaRealtime;
      if (!rt?.on) { setTimeout(tryWire, 800); return; }

      const allNewEvents = [
        // Group events
        'group:message', 'group:reaction', 'group:reply', 'group:edit',
        'group:delete', 'group:deleted', 'group:typing', 'group:join',
        'group:leave', 'group:kick', 'group:ban', 'group:unban',
        'group:mute', 'group:unmute', 'group:presence', 'group:update',
        'group:updated', 'group:role_update', 'group:pin', 'group:announcement',
        'group:membership_change', 'group:slow_mode', 'group:read_receipt',
        'group:member_joined', 'group:member_left', 'group:rejoin_ack',
        // Status/story events
        'status:new', 'status:created', 'status:viewed', 'status:view',
        'status:reaction', 'status:reply', 'status:deleted', 'status:privacy_updated',
        // Phase 5 events
        'device:trust_updated', 'session:revoked', 'reconnect:required',
      ];

      for (const evt of allNewEvents) {
        rt.on(evt, payload => {
          try { window.dispatchEvent(new CustomEvent('kyn:' + evt, { detail: payload || {} })); } catch (_) {}
          document.querySelectorAll('iframe').forEach(f => {
            try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + evt, payload: payload || {} }, '*'); } catch (_) {}
          });
          window.KynectaEventBus?.emit('REALTIME_' + evt, payload, { async: true });
        });
      }

      console.log(`[Phase5Bootstrap] Wired ${allNewEvents.length} socket events`);
    };
    tryWire();
  }

  function _wireCrossModuleListeners() {
    // When DurableQueue has new failures, log to ProductionMonitor
    window.__DurableQueueLayer?.onStateChange?.(op => {
      if (op.state === 'FAILED') {
        window.__ProductionMonitoringLayer?.log('queue', 'op_failed', {
          type: op.queueType, attempts: op.attempts,
        });
      }
    });

    // When reconnect state changes, log it
    window.__ReconnectOrchestrator?.onStateChange?.(({ state, prev }) => {
      window.__ProductionMonitoringLayer?.log('recovery', 'state_change', { state, prev });
      if (state === 'RECOVERED') {
        window.__ProductionMonitoringLayer?.recordReconnect(state, 0);
      }
    });

    // When call drops
    window.__CallStateMachine?.watchAll?.(({ callId, state, session }) => {
      if (state === 'FAILED' || (state === 'ENDED' && session?.endReason === 'peer_error')) {
        window.__ProductionMonitoringLayer?.recordCallDrop(callId, session?.endReason, session?.duration);
      }
    });

    // Broadcast new messages to other tabs
    const bus = window.KynectaEventBus;
    if (bus) {
      bus.on('MESSAGE_RECEIVED', msg => {
        window.__BackgroundReliabilityService?.broadcastMessage?.(msg);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
