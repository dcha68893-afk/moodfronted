/**
 * sw.js — Kynecta Service Worker
 *
 * Handles:
 *  Phase 8:  Push notifications (receive + display + action handling)
 *  Phase 10: Offline caching (Cache-first for assets, Network-first for API)
 *  Phase 12: Background sync (queue failed requests, retry when online)
 */

'use strict';

// FIX (STALE-DEPLOY / FIXES-NOT-APPEARING-LIVE): CACHE_NAME was a hardcoded
// string that never got bumped across many deploys. Every JS/CSS/HTML file
// was served pure cache-first below with no revalidation, so once a browser
// installed this worker it kept serving whatever it first cached — forever —
// even after Render shipped fixes for the exact same files. Bumping the
// version here forces every existing install to drop the old cache on its
// next activate (see the 'activate' handler below, which already deletes any
// cache whose name != CACHE_NAME) and rebuild from the live deploy.
const CACHE_NAME    = 'kynecta-v6';
const API_CACHE     = 'kynecta-api-v1';
const STATIC_ASSETS = [
  '/',
  '/chat.html',
  '/message.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-72.png',
];

// ── Install: precache static assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can, ignore failures (some assets may not exist)
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache strategy ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls: Network-first with API cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request.clone())
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(API_CACHE).then(c => c.put(event.request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  // FIX (STALE-DEPLOY / FIXES-NOT-APPEARING-LIVE): the old cache-first
  // strategy served the cached copy and NEVER checked the network again for
  // that URL, so a fix pushed to Render could sit live for weeks without any
  // already-installed browser ever seeing it. This still returns the cached
  // copy immediately (same instant load), but always fires a background
  // fetch to refresh the cache — so the NEXT load already has the update,
  // instead of requiring the developer to remember to bump CACHE_NAME again
  // and every user to happen to get a fresh SW install.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// ── Push: receive and display notification ────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'Kynecta', body: event.data.text(), data: { url: '/chat.html' } };
  }

  const options = {
    body:             payload.body    || '',
    icon:             payload.icon    || '/icons/icon-192.png',
    badge:            payload.badge   || '/icons/badge-72.png',
    tag:              payload.tag     || 'kynecta-default',
    renotify:         payload.renotify ?? true,
    requireInteraction: payload.requireInteraction ?? false,
    data:             payload.data    || {},
    actions:          payload.actions || [],
    // FIX (Notifications audit): pushNotificationService.js on the backend
    // already computes these correctly from the recipient's
    // notificationSound/notificationVibration settings (see
    // _getRecipientNotificationPrefs there) and sends them in the payload —
    // but this handler was hardcoding vibrate on and never reading
    // payload.silent at all, so both settings had zero effect on real
    // background push notifications regardless of what the backend sent.
    vibrate:          Array.isArray(payload.vibrate) ? payload.vibrate : [200, 100, 200],
    silent:           payload.silent === true,
    timestamp:        Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Kynecta', options)
  );
});

// ── Notification click: navigate to chat ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data   = event.notification.data || {};
  const action = event.action;
  const url    = data.url || '/chat.html';

  if (action === 'mark-read' && data.chatId && data.messageId) {
    // Background mark-read — fire and forget
    event.waitUntil(
      fetch(`/api/messages/mark-read/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: [data.messageId], chatId: data.chatId }),
        credentials: 'include',
      }).catch(() => {})
    );
    return;
  }

  if (action === 'reply') {
    // Open chat focused on reply input
    event.waitUntil(openOrFocusWindow(url + '&reply=1'));
    return;
  }

  event.waitUntil(openOrFocusWindow(url));
});

async function openOrFocusWindow(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // Focus existing tab if already open
  for (const client of clients) {
    if (client.url.includes('chat.html') && 'focus' in client) {
      client.postMessage({ type: 'NAVIGATE', url });
      return client.focus();
    }
  }
  // Open new window
  if (self.clients.openWindow) return self.clients.openWindow(url);
}

// ── Background sync: retry queued offline requests ────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'kyn-message-queue') {
    event.waitUntil(_processOfflineMessageQueue());
  }
});

async function _processOfflineMessageQueue() {
  // The offline queue in app.offline.queue.js uses localStorage IDB.
  // Notify open clients to flush their queues.
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }));
}

// ── Message from client: update badge count ───────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {});
    }
  }
  if (event.data?.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
