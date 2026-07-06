/**
 * BackgroundSyncService.js
 * Phase 2 — Background Recovery Services (Frontend)
 *
 * Ensures messaging survives:
 *  - App minimized / hidden tab
 *  - OS suspension
 *  - Screen lock
 *  - Network reconnect
 *
 * Implements:
 *  - visibilitychange recovery
 *  - Service Worker sync registration
 *  - Heartbeat resume
 *  - Network restoration handler
 *  - Background retry orchestration
 *
 * @version 2.0.0
 * @phase 2 — Background Services
 */

(function () {
  'use strict';

  if (window.__BackgroundSyncService) return;

  const SW_SYNC_TAG        = 'kyn-message-sync';
  const HIDDEN_THRESHOLD_S = 30;    // Trigger re-sync if hidden > 30s
  const HEARTBEAT_MS       = 25000;

  // ─── ServiceWorkerSync ───────────────────────────────────────────────────

  class ServiceWorkerSync {
    async register() {
      if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
        console.debug('[BGSync] Service Worker Sync API not available');
        return false;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register(SW_SYNC_TAG);
        console.log('[BGSync] Service Worker sync registered:', SW_SYNC_TAG);
        return true;
      } catch (err) {
        console.debug('[BGSync] SW sync registration failed:', err.message);
        return false;
      }
    }

    async isRegistered() {
      if (!('serviceWorker' in navigator)) return false;
      try {
        const reg  = await navigator.serviceWorker.ready;
        const tags = await reg.sync.getTags();
        return tags.includes(SW_SYNC_TAG);
      } catch (_) { return false; }
    }
  }

  // ─── HeartbeatResumeManager ──────────────────────────────────────────────

  class HeartbeatResumeManager {
    constructor() {
      this._timer    = null;
      this._running  = false;
      this._missedTs = null;
    }

    start() {
      if (this._running) return;
      this._running = true;
      this._tick();
    }

    stop() {
      if (this._timer) clearInterval(this._timer);
      this._running = false;
    }

    _tick() {
      this._timer = setInterval(() => {
        if (document.visibilityState === 'hidden') {
          this._missedTs = this._missedTs || Date.now();
          return;
        }

        // Tab came back — send heartbeat
        const socket = window.KynectaRealtime?._socket;
        if (socket?.connected) {
          socket.emit('heartbeat', { ts: Date.now() });
        }

        // Check if we missed beats — if so, trigger recovery
        if (this._missedTs) {
          const missedS = (Date.now() - this._missedTs) / 1000;
          if (missedS > HIDDEN_THRESHOLD_S) {
            this._triggerRecovery(missedS);
          }
          this._missedTs = null;
        }
      }, HEARTBEAT_MS);
    }

    _triggerRecovery(hiddenSeconds) {
      console.log(`[BGSync] Hidden for ${Math.round(hiddenSeconds)}s — triggering recovery`);
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SYNC_STARTED', { reason: 'hidden_tab_recovery', hiddenSeconds }, { async: true });

      // Flush offline queue
      window.__OfflineMessageQueue?.flushAll();

      // Request delta sync for active chats
      const sync = window.__RealtimeSyncEngine;
      if (sync) {
        // The app will handle the SYNC_STARTED event to re-fetch
      }
    }
  }

  // ─── NetworkRestorationHandler ───────────────────────────────────────────

  class NetworkRestorationHandler {
    constructor() {
      this._offlineAt = null;
      this._wasOffline = false;
    }

    attach() {
      window.addEventListener('online', () => {
        const offlineDuration = this._offlineAt ? Date.now() - this._offlineAt : 0;
        this._offlineAt = null;
        this._wasOffline = false;
        this._onRestored(offlineDuration);
      });

      window.addEventListener('offline', () => {
        this._offlineAt = Date.now();
        this._wasOffline = true;
      });

      // FIX-NETRESTORE-SPAM: this used to call _onRestored(0) on every single
      // tab-focus event, regardless of whether the connection was ever
      // actually lost — firing SYSTEM_NETWORK_ONLINE/SYNC_STARTED and an
      // offline-queue flush on every tab switch, and flooding the console
      // with duplicate "Network restored (was offline 0s)" lines. Now it
      // only re-checks after a *genuine* offline period (the 'offline' event
      // fired first but the 'online' event was missed, e.g. because the tab
      // was backgrounded when connectivity returned).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine && this._wasOffline) {
          const offlineDuration = this._offlineAt ? Date.now() - this._offlineAt : 0;
          this._offlineAt = null;
          this._wasOffline = false;
          this._onRestored(offlineDuration);
        }
      });
    }

    _onRestored(offlineDurationMs) {
      console.log(`[BGSync] Network restored (was offline ${Math.round(offlineDurationMs / 1000)}s)`);

      const bus = window.KynectaEventBus;
      if (bus) {
        bus.emit('SYSTEM_NETWORK_ONLINE', {
          restoredAt: Date.now(),
          offlineDurationMs,
        }, { async: true });
        bus.emit('SYNC_STARTED', { reason: 'network_restored', offlineDurationMs }, { async: true });
      }

      // Flush offline queue after brief delay (socket reconnects first)
      setTimeout(() => window.__OfflineMessageQueue?.flushAll(), 2000);
    }
  }

  // ─── BackgroundSyncService (main) ────────────────────────────────────────

  class BackgroundSyncService {
    constructor() {
      this._swSync     = new ServiceWorkerSync();
      this._heartbeat  = new HeartbeatResumeManager();
      this._netRestore = new NetworkRestorationHandler();
      this._started    = false;
    }

    async start() {
      if (this._started) return;
      this._started = true;

      // Register SW background sync
      await this._swSync.register();

      // Start heartbeat manager
      this._heartbeat.start();

      // Attach network restoration handler
      this._netRestore.attach();

      // Register Page Visibility API handler
      this._attachVisibilityRecovery();

      console.log('[BGSync] ✅ Started');
    }

    stop() {
      this._heartbeat.stop();
    }

    getDiagnostics() {
      return {
        started:   this._started,
        swSupport: 'serviceWorker' in navigator && 'SyncManager' in window,
        online:    navigator.onLine,
      };
    }

    _attachVisibilityRecovery() {
      let hiddenAt = null;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now();
          // Register background sync when going hidden
          this._swSync.register();
        } else {
          if (!hiddenAt) return;
          const hiddenS = (Date.now() - hiddenAt) / 1000;
          hiddenAt = null;

          if (hiddenS > HIDDEN_THRESHOLD_S) {
            // Long absence — full recovery
            console.log(`[BGSync] Returning after ${Math.round(hiddenS)}s — full recovery`);
            window.__OfflineMessageQueue?.flushAll();
            const bus = window.KynectaEventBus;
            if (bus) bus.emit('SYNC_STARTED', { reason: 'visibility_recovery', hiddenS }, { async: true });
          }
        }
      });
    }
  }

  // ─── Service Worker registration (if sw.js exists) ───────────────────────

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('[BGSync] SW registered:', reg.scope);
      }).catch(() => {
        // SW not found — that's OK, we degrade gracefully
      });
    });
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const service = new BackgroundSyncService();
  service.start();

  window.__BackgroundSyncService = service;
  window.BackgroundSync = service;

  console.log('[BGSync] ✅ Ready');
})();
