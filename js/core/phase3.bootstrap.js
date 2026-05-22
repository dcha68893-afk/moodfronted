/**
 * phase3.bootstrap.js
 * Phase 3 — WebRTC Call Engine Bootstrap (Frontend)
 *
 * Loads ALL Phase 1 + Phase 2 + Phase 3 modules in correct order.
 * Replaces phase2.bootstrap.js — use this script tag in ALL HTML pages.
 *
 * @version 3.0.0
 */

(function () {
  'use strict';

  if (window.__Phase3Bootstrapped) return;
  window.__Phase3Bootstrapped = true;

  const BASE = (function () {
    const s = document.querySelector('script[src*="phase3.bootstrap"]');
    if (s) return s.src.replace('phase3.bootstrap.js', '');
    return '/data/js/core/';
  })();

  const MODULES = [
    // ── Phase 1 Foundation ──────────────────────────────────────────
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',

    // ── Phase 2 Hybrid Transport ────────────────────────────────────
    'network/HybridTransportEngine.js',
    'network/LANCommunicationEngine.js',
    'network/MeshRelayEngine.js',
    'queue/OfflineMessageQueue.js',
    'realtime/ReliableDeliveryEngine.js',
    'realtime/RealtimeSyncEngine.js',
    'realtime/BackgroundSyncService.js',

    // ── Phase 3 WebRTC Call Engine ──────────────────────────────────
    'calls/CallStateMachine.js',
    'calls/DeviceMediaManager.js',
    'calls/PeerConnectionManager.js',
    'calls/WebRTCSessionOrchestrator.js',
    'calls/GroupCallEngine.js',
    'calls/AdaptiveBitrateEngine.js',
    'calls/LANCallEngine.js',
  ];

  let loaded = 0;
  const start = Date.now();

  function loadScript(src) {
    return new Promise(resolve => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src   = src;
      s.async = false;
      s.onload  = () => { loaded++; resolve(); };
      s.onerror = () => { console.warn('[Phase3Bootstrap] Failed:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  async function bootstrap() {
    console.log('[Phase3Bootstrap] 🚀 Loading Phase 1 + 2 + 3…');

    for (const m of MODULES) await loadScript(BASE + m);

    const elapsed = Date.now() - start;
    console.log(`[Phase3Bootstrap] ✅ ${loaded}/${MODULES.length} modules in ${elapsed}ms`);

    // Wire Phase 2 offline queue send handler
    _wireOfflineQueue();

    // Wire Phase 3 TURN config injection (server pushes via socket)
    _wireTURNConfig();

    window.dispatchEvent(new CustomEvent('phase3:ready', { detail: { elapsed, loaded } }));
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
        const ev = msg.chatId?.startsWith('group_') ? 'groupMessage' : 'sendMessage';
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
        console.log('[Phase3Bootstrap] TURN servers received:', payload.servers.length);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
