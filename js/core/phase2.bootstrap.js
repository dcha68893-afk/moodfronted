/**
 * phase2.bootstrap.js
 * Phase 2 — Hybrid Transport Engine Bootstrap (Frontend)
 *
 * Loads ALL Phase 1 + Phase 2 modules in correct dependency order.
 * Drop ONE script tag at the bottom of each HTML page.
 *
 * REPLACES phase1.bootstrap.js — this file loads Phase 1 then Phase 2.
 *
 * @version 2.0.0
 * @phase 2
 */

(function () {
  'use strict';

  if (window.__Phase2Bootstrapped) return;
  window.__Phase2Bootstrapped = true;

  const BASE = (function () {
    const s = document.querySelector('script[src*="phase2.bootstrap"]');
    if (s) return s.src.replace('phase2.bootstrap.js', '');
    return '/data/js/core/';
  })();

  // Load order: Phase 1 first, then Phase 2 additions
  const MODULES = [
    // ── Phase 1 Foundation ─────────────────────────────────
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',

    // ── Phase 2 Hybrid Engine ──────────────────────────────
    'network/HybridTransportEngine.js',
    'network/LANCommunicationEngine.js',
    'network/MeshRelayEngine.js',
    'queue/OfflineMessageQueue.js',
    'realtime/ReliableDeliveryEngine.js',
    'realtime/RealtimeSyncEngine.js',
    'realtime/BackgroundSyncService.js',
  ];

  let loaded = 0;
  const start = Date.now();

  function loadScript(src) {
    return new Promise((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s    = document.createElement('script');
      s.src      = src;
      s.async    = false;
      s.onload   = () => { loaded++; resolve(); };
      s.onerror  = () => { console.warn('[Phase2Bootstrap] Failed:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log('[Phase2Bootstrap] 🚀 Loading Phase 1 + Phase 2…');
    for (const m of MODULES) await loadScript(BASE + m);

    const elapsed = Date.now() - start;
    console.log(`[Phase2Bootstrap] ✅ ${loaded}/${MODULES.length} modules loaded in ${elapsed}ms`);

    // Wire offline queue to existing socket send
    _wireOfflineQueue();

    window.dispatchEvent(new CustomEvent('phase2:ready', { detail: { elapsed, loaded } }));

    const bus = window.KynectaEventBus;
    if (bus) bus.emit('SYNC_STARTED', { reason: 'phase2_boot' }, { async: true });
  }

  function _wireOfflineQueue() {
    const q = window.__OfflineMessageQueue;
    if (!q) return;

    // Send handler: use existing KynectaRealtime socket
    q.setSendHandler(async (msg) => {
      const transport = window.__HybridTransportEngine?.getBestTransport() || 'INTERNET';

      // Try LAN first if available
      if (transport === 'LAN' && window.__LANCommunicationEngine?.hasPeers()) {
        const ok = window.__LANCommunicationEngine.send(msg);
        if (ok) return;
      }

      // Try mesh if LAN unavailable
      if (transport === 'MESH' && msg.targetDeviceId) {
        const ok = window.__MeshRelayEngine?.relay(msg, msg.targetDeviceId);
        if (ok) return;
      }

      // Fall back to Internet socket
      const socket = window.KynectaRealtime?._socket;
      if (!socket?.connected) throw new Error('Socket not connected');

      await new Promise((resolve, reject) => {
        const eventName = msg.chatId?.startsWith('group_') ? 'groupMessage' : 'sendMessage';
        socket.emit(eventName, msg, (ack) => {
          if (ack?.error) reject(new Error(ack.error));
          else resolve(ack);
        });
        setTimeout(() => reject(new Error('Socket emit timeout')), 10000);
      });
    });

    console.log('[Phase2Bootstrap] Offline queue wired to socket send handler');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
