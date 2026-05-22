/**
 * phase4.bootstrap.js
 * Phase 4 — Social Ecosystem Bootstrap (Frontend)
 *
 * Loads ALL Phase 1 + Phase 2 + Phase 3 + Phase 4 modules in correct order.
 *
 * REPLACES phase3.bootstrap.js — update EVERY HTML page's script tag to:
 *   <script src="/data/js/core/phase4.bootstrap.js"></script>
 *
 * File lives at: newrepo/data/js/core/phase4.bootstrap.js
 *
 * @version 4.0.0
 */

(function () {
  'use strict';

  if (window.__Phase4Bootstrapped) return;
  window.__Phase4Bootstrapped = true;

  const BASE = (function () {
    const s = document.querySelector('script[src*="phase4.bootstrap"]');
    if (s) return s.src.replace('phase4.bootstrap.js', '');
    return '/data/js/core/';
  })();

  const MODULES = [
    // ── Phase 1 Foundation ──────────────────────────────────────────────────
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',

    // ── Phase 2 Hybrid Transport ────────────────────────────────────────────
    'network/HybridTransportEngine.js',
    'network/LANCommunicationEngine.js',
    'network/MeshRelayEngine.js',
    'queue/OfflineMessageQueue.js',
    'realtime/ReliableDeliveryEngine.js',
    'realtime/RealtimeSyncEngine.js',
    'realtime/BackgroundSyncService.js',

    // ── Phase 3 WebRTC Call Engine ──────────────────────────────────────────
    'calls/CallStateMachine.js',
    'calls/DeviceMediaManager.js',
    'calls/PeerConnectionManager.js',
    'calls/WebRTCSessionOrchestrator.js',
    'calls/GroupCallEngine.js',
    'calls/AdaptiveBitrateEngine.js',
    'calls/LANCallEngine.js',

    // ── Phase 4 Social Ecosystem ────────────────────────────────────────────
    'groups/GroupOrchestrator.js',
    'groups/GroupModerationEngine.js',
    'groups/GroupPresenceCacheEngine.js',
    'groups/SocialNotificationEngine.js',
    'status/StatusStoryEngine.js',
  ];

  let loaded = 0;
  const start = Date.now();

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s   = document.createElement('script');
      s.src     = src;
      s.async   = false;
      s.onload  = () => { loaded++; resolve(); };
      s.onerror = () => { console.warn('[Phase4Bootstrap] Failed:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log('[Phase4Bootstrap] 🚀 Loading Phase 1+2+3+4…');
    for (const m of MODULES) await loadScript(BASE + m);

    const elapsed = Date.now() - start;
    console.log(`[Phase4Bootstrap] ✅ ${loaded}/${MODULES.length} modules in ${elapsed}ms`);

    _wireOfflineQueue();
    _wireTURNConfig();
    _wireGroupEventForwarding();

    window.dispatchEvent(new CustomEvent('phase4:ready', { detail: { elapsed, loaded } }));

    const bus = window.KynectaEventBus;
    if (bus) bus.emit('SYNC_STARTED', { reason: 'phase4_boot' }, { async: true });
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
        setTimeout(() => reject(new Error('Timeout')), 10000);
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

  /**
   * Register group + status socket events that are missing from the existing
   * allEvents array in app.realtime.socket.js.
   * This patches via KynectaRealtime.on() without touching existing files.
   */
  function _wireGroupEventForwarding() {
    const tryWire = () => {
      const rt = window.KynectaRealtime;
      if (!rt || !rt.on) { setTimeout(tryWire, 800); return; }

      const groupEvents = [
        'group:message', 'group:reaction', 'group:reply', 'group:edit',
        'group:delete', 'group:deleted', 'group:typing', 'group:join',
        'group:leave', 'group:kick', 'group:ban', 'group:unban',
        'group:mute', 'group:unmute', 'group:presence',
        'group:update', 'group:updated', 'group:role_update',
        'group:pin', 'group:announcement', 'group:media',
        'group:membership_change', 'group:slow_mode',
        'group:read_receipt', 'group:member_joined', 'group:member_left',
        'group:rejoin_ack',
      ];

      const statusEvents = [
        'status:new', 'status:created', 'status:viewed', 'status:view',
        'status:reaction', 'status:reply', 'status:deleted',
        'status:privacy_updated', 'status:highlight_added',
        // 'status:expired' is already handled by server.js cron via user: rooms
      ];

      const allNew = [...groupEvents, ...statusEvents];

      for (const evt of allNew) {
        rt.on(evt, payload => {
          // Dispatch kyn: CustomEvent
          try { window.dispatchEvent(new CustomEvent('kyn:' + evt, { detail: payload || {} })); } catch (_) {}
          // Fan-out to iframes
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(f => {
            try {
              f.contentWindow.postMessage({
                type:    'REALTIME_EVENT:' + evt,
                payload: payload || {},
              }, '*');
            } catch (_) {}
          });
          // KynectaEventBus
          const bus = window.KynectaEventBus;
          if (bus) bus.emit('REALTIME_' + evt, payload, { async: true });
        });
      }

      console.log(`[Phase4Bootstrap] Wired ${allNew.length} group+status socket events`);
    };
    tryWire();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
