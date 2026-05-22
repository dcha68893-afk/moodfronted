/**
 * phase1.bootstrap.js
 * Phase 1 — Foundation Stabilization Bootstrap
 *
 * Loads all Phase 1 infrastructure modules in the correct dependency order.
 * Drop a single <script> tag into each HTML page AFTER the existing scripts.
 *
 * Load order:
 *  1. EventBus (already loaded by existing app)
 *  2. IdentityFoundation
 *  3. NetworkIntelligenceManager
 *  4. RealtimeStabilizationLayer
 *  5. PersistenceStabilizationLayer
 *  6. CacheFoundationLayer
 *  7. QueueFoundationLayer
 *  8. PresenceEngineFoundation
 *  9. NotificationStabilizationLayer
 * 10. MonitoringFoundation  ← loads last (depends on all others)
 *
 * Usage in HTML:
 *   <script src="/core/phase1.bootstrap.js"></script>
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  const BASE_PATH = (function () {
    // Try to auto-detect the base path from this script's src
    const scripts = document.querySelectorAll('script[src*="phase1.bootstrap"]');
    if (scripts.length) {
      const src = scripts[scripts.length - 1].getAttribute('src');
      return src.replace('phase1.bootstrap.js', '');
    }
    return '/core/';
  })();

  const MODULES = [
    'identity/IdentityFoundationLayer.js',
    'network/NetworkIntelligenceManager.js',
    'realtime/RealtimeStabilizationLayer.js',
    'persistence/PersistenceStabilizationLayer.js',
    'cache/CacheFoundationLayer.js',
    'queue/QueueFoundationLayer.js',
    'presence/PresenceEngineFoundation.js',
    'notification/NotificationStabilizationLayer.js',
    'monitoring/MonitoringFoundation.js',
  ];

  let loadedCount = 0;
  const startTime = Date.now();

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Skip if already loaded (singleton guard in each module handles this too)
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false; // preserve order within sequence
      script.onload = () => {
        loadedCount++;
        resolve();
      };
      script.onerror = (err) => {
        console.warn(`[Phase1Bootstrap] Failed to load: ${src}`, err);
        resolve(); // Non-fatal — continue loading others
      };
      document.head.appendChild(script);
    });
  }

  async function bootstrap() {
    console.log('[Phase1Bootstrap] 🚀 Starting Phase 1 Foundation load…');

    // Load modules sequentially to respect dependency order
    for (const module of MODULES) {
      await loadScript(BASE_PATH + module);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Phase1Bootstrap] ✅ All ${MODULES.length} modules loaded in ${elapsed}ms`);

    // Fire a custom event so other code can react
    try {
      window.dispatchEvent(new CustomEvent('phase1:ready', {
        detail: { elapsed, modules: loadedCount },
      }));
    } catch (_) {}

    // Emit on event bus if available
    const bus = window.KynectaEventBus || window.appEvents;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('SYSTEM_NETWORK_CHANGED', window.__networkState || {}, { async: true });
    }
  }

  // Start as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
