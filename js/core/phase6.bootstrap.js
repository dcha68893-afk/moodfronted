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
    'network/MeshRelayEngine.js',
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
  ];

  let loaded = 0;
  const startTs = Date.now();

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload  = () => { loaded++; resolve(); };
      s.onerror = () => { console.warn('[Phase6] Failed:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log(`[Phase6Bootstrap] 🚀 MoodChat loading ${MODULES.length} modules from ${BASE}`);

    for (const m of MODULES) await loadScript(BASE + m);

    const elapsed = Date.now() - startTs;
    console.log(`[Phase6Bootstrap] ✅ ${loaded}/${MODULES.length} modules in ${elapsed}ms`);

    _wireOfflineQueue();
    _wireTURNConfig();
    _wireGroupEventForwarding();
    _wireCrossModuleListeners();

    window.dispatchEvent(new CustomEvent('moodchat:ready', {
      detail: { phase: 6, elapsed, loaded, modules: MODULES.length }
    }));

    const bus = window.KynectaEventBus;
    if (bus) bus.emit('SYNC_STARTED', { reason: 'phase6_boot' }, { async: true });

    console.log('[Phase6Bootstrap] 🎉 MoodChat fully initialized — __MoodChatDiag() for diagnostics');
  }

  function _wireOfflineQueue() {
    const q = window.__OfflineMessageQueue;
    if (!q) return;
    q.setSendHandler(async msg => {
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
      const apiBase = window.__getApiBase?.() || 'https://moodchat-fy56.onrender.com/api';
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
        'status:new', 'status:created', 'status:viewed', 'status:view',
        'status:reaction', 'status:reply', 'status:deleted', 'status:expired',
        'status:privacy_updated',
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();