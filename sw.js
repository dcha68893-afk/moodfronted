/**
 * sw.js — DEPRECATED / retired duplicate service worker.
 *
 * FIX-DUAL-SW-CONFLICT: this file used to be a full, independently
 * maintained service worker (caching, push, background sync) that
 * registered at the SAME scope ('/') as the real, actively-maintained
 * '/service-worker.js'. Two service workers competing for one scope meant
 * whichever one most recently (re)registered controlled the page — so
 * behavior (including whether push notifications leaked raw E2E ciphertext
 * instead of a safe placeholder, and which cached JS got served) depended
 * on load order/timing rather than being consistent across entry points.
 *
 * js/core/realtime/BackgroundSyncService.js no longer registers this file —
 * it registers '/service-worker.js' and actively unregisters any stray
 * '/sw.js' registration it finds. This stub remains only so that any
 * browser/device that still has the OLD '/sw.js' installed (from before
 * that fix shipped) gets cleanly retired: it takes control, drops its old
 * caches, and unregisters itself so '/service-worker.js' can take over on
 * the next load.
 */
'use strict';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache this worker ever created.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (_) {}

      // Take control of any open clients, then immediately step aside so
      // '/service-worker.js' becomes controller on their next navigation/load.
      try { await self.clients.claim(); } catch (_) {}
      try { await self.registration.unregister(); } catch (_) {}

      // Nudge open tabs to reload so they pick up the real service worker
      // instead of continuing to run under this retired one.
      try {
        const clientList = await self.clients.matchAll({ type: 'window' });
        clientList.forEach(client => client.navigate(client.url));
      } catch (_) {}
    })()
  );
});
