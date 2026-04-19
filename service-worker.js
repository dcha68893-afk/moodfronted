// service-worker.js
// Version: 13.0.0 - FULL AUDIT FIX
// Corrected paths, added all JS modules from index.html, true offline-first boot.

'use strict';

const CACHE_NAME = 'moodchat-static-v13-offline';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// APP SHELL - ALL paths verified against index.html <script> and <link> tags
// ---------------------------------------------------------------------------
const CORE_STATIC_ASSETS = [
  // Entry points
  '/index.html',
  '/',
  '/manifest.json',
  '/favicon.ico',

  // Icons (from <link> tags in index.html)
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',

  // Font Awesome (served locally)
  '/css/vendor/font-awesome.min.css',
  '/fonts/fa-solid-900.woff2',
  '/fonts/fa-solid-900.ttf',
  '/fonts/fa-regular-400.woff2',
  '/fonts/fa-regular-400.ttf',
  '/fonts/fa-brands-400.woff2',
  '/fonts/fa-brands-400.ttf',
  '/css/offline-icon-fallback.css',
  '/css/suppress-webgl.css',
  '/js/vendor/offline-icon-bootstrap.js',

  // ── JS modules (from index.html <script> tags) ────────────────────────────
  // MODULE scripts (type="module")
  '/js/api.core.js',
  '/js/api.request.js',
  '/js/api.auth.js',
  '/js/api.messages.js',
  '/js/app.core.bootstrap.js',
  '/js/app.core.session.js',
  '/js/app.core.ui.js',
  '/js/app.ui.auth.js',
  '/js/auth.account.limit.js',

  // Classic scripts (no type="module")
  '/js/app.cache.js',
  '/js/authStorage.js',
  '/js/app.offline.queue.js',
  '/js/auth.session.manager.js',
  '/js/app.runtime.authority.js',

  // Additional pages referenced in service-worker v12
  '/friend.html',
  '/chat.html',
  '/friend.css',

  // Legacy assets from previous SW (keep for compatibility)
  '/api.js',
  '/Tool.css',
  '/Tool.js',
  '/group.js',
];

// ---------------------------------------------------------------------------
// BYPASS PATTERNS - API / WebSocket always go straight to network
// ---------------------------------------------------------------------------
const BYPASS_PATTERNS = [
  /\/api\//i,
  /\/auth\//i,
  /\/socket\.io\//i,
  /\/ws\//i,
  /\/wss\//i,
  /\/graphql/i,
  /\/webhook/i,
  /^https?:\/\/api\./i,
];

// ---------------------------------------------------------------------------
// STATIC ASSET PATTERNS
// ---------------------------------------------------------------------------
const STATIC_ASSET_PATTERNS = [
  /\.(css|js|json|png|jpg|jpeg|svg|ico|woff2|woff|ttf|webp|gif|map)$/i,
  /\/icons\//i,
  /\/images\//i,
  /\/fonts\//i,
  /\/static\//i,
  /\/webfonts\//i,
  /\/css\/vendor\//i,
  /\/js\/vendor\//i,
  /offline-icon-fallback/i,
  /offline-icon-bootstrap/i,
];

// ---------------------------------------------------------------------------
// LOG DE-DUP
// ---------------------------------------------------------------------------
const loggedBypasses = new Set();
const loggedCacheHits = new Set();

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function isApiRequest(url) {
  return BYPASS_PATTERNS.some(p => p.test(url));
}

function isStaticAsset(url) {
  if (!url || typeof url !== 'string') return false;
  return STATIC_ASSET_PATTERNS.some(p => p.test(url));
}

function isLocalRequest(url) {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isFontOrIcon(url) {
  return /\/webfonts\/|\/fonts\/|font-awesome|\.woff2?$|\.ttf$|\.eot$/i.test(url) ||
    /offline-icon-fallback|offline-icon-bootstrap/i.test(url);
}

function isCacheStale(response) {
  try {
    const dateHeader = response.headers.get('date');
    if (!dateHeader) return false;
    return (Date.now() - new Date(dateHeader).getTime()) > CACHE_MAX_AGE;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OFFLINE SHELL - shown only when no cached index.html exists at all.
// Prevents the browser "You are offline" screen from ever appearing.
// ---------------------------------------------------------------------------
const OFFLINE_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MoodChat - Offline</title>
<style>
body{margin:0;font-family:Segoe UI,sans-serif;
  background:linear-gradient(135deg,#667eea,#764ba2);
  min-height:100vh;display:flex;align-items:center;
  justify-content:center;color:#fff;text-align:center}
.card{background:rgba(255,255,255,.15);backdrop-filter:blur(20px);
  border-radius:20px;padding:40px;max-width:340px;
  border:1px solid rgba(255,255,255,.3)}
h1{font-size:2rem;margin-bottom:10px}
p{opacity:.85;margin-bottom:24px;line-height:1.5}
button{background:#fff;color:#667eea;border:none;
  padding:14px 28px;border-radius:30px;
  font-size:1rem;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="card">
  <div style="font-size:3rem;margin-bottom:16px">💬</div>
  <h1>MoodChat</h1>
  <p>You're offline. Tap below once connected.</p>
  <button onclick="location.reload()">Try Again</button>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// NAVIGATION HANDLER - Network-first, cache fallback, shell last resort
// ---------------------------------------------------------------------------
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  const pathname = new URL(request.url).pathname;
  const htmlKey = (pathname === '/' || pathname === '') ? '/index.html' : pathname;

  // 1 – Try network (and re-cache the fresh response)
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      cache.put(htmlKey, networkRes.clone()).catch(() => {});
      // Also keep /index.html as SPA fallback
      if (htmlKey !== '/index.html') {
        cache.put('/index.html', networkRes.clone()).catch(() => {});
      }
      return networkRes;
    }
  } catch (_) {
    console.log('[SW] Offline – serving cache for: ' + htmlKey);
  }

  // 2 – Exact cached page
  const cachedPage = await cache.match(htmlKey);
  if (cachedPage) return cachedPage;

  // 3 – SPA fallback to /index.html
  const cachedIndex = await cache.match('/index.html') || await cache.match('/');
  if (cachedIndex) {
    console.log('[SW] Navigation fallback → /index.html');
    return cachedIndex;
  }

  // 4 – Inline shell (browser error screen never shown)
  console.warn('[SW] No cached page – returning offline shell');
  return new Response(OFFLINE_SHELL, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------------------------------------------------------------------------
// STATIC ASSET HANDLER - Cache-first; network fallback on miss/stale
// ---------------------------------------------------------------------------
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  if (isFontOrIcon(request.url)) {
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'font/woff2' } });
    }
  }

  const cached = await cache.match(request);
  if (cached && !isCacheStale(cached)) {
    if (!loggedCacheHits.has(request.url)) {
      console.log('[SW] Cache hit: ' + request.url);
      loggedCacheHits.add(request.url);
    }
    return cached;
  }

  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    if (!res.ok && cached) return cached;
    return res;
  } catch (_) {
    if (cached) return cached;
    return new Response('Resource unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// ---------------------------------------------------------------------------
// API HANDLER - Always network; clean 503 when offline
// ---------------------------------------------------------------------------
async function handleApiRequest(request) {
  try {
    return await fetch(request);
  } catch (_) {
    return new Response(
      JSON.stringify({ error: 'Network request failed', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ---------------------------------------------------------------------------
// INSTALL - pre-cache app shell (failures are non-fatal)
// ---------------------------------------------------------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installing v13.0.0');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const promises = CORE_STATIC_ASSETS.map(asset => {
        const url = asset === '/' ? '/index.html' : asset;
        return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
          .then(res => { if (res.ok) return cache.put(url, res); })
          .catch(err => console.warn('[SW] Pre-cache skip: ' + url + ' – ' + err.message));
      });

      return Promise.allSettled(promises).then(results => {
        const ok = results.filter(r => r.status === 'fulfilled').length;
        console.log('[SW] Pre-cached ' + ok + '/' + CORE_STATIC_ASSETS.length + ' assets');
        return self.skipWaiting();
      });
    })
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE - purge old caches, claim all tabs
// ---------------------------------------------------------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activating v13.0.0');
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.map(n => n !== CACHE_NAME ? caches.delete(n) : null)
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: '13.0.0', timestamp: Date.now() }));
        console.log('[SW] All clients claimed');
      })
  );
});

// ---------------------------------------------------------------------------
// FETCH - route every GET request to the right handler
// ---------------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  if (loggedBypasses.size > 500) loggedBypasses.clear();
  if (loggedCacheHits.size > 500) loggedCacheHits.clear();

  // Only intercept GETs
  if (request.method !== 'GET') return;

  // Route 1: HTML page navigation (the critical offline fix)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Route 2: API / auth – always network, never cache
  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Route 3: Local static assets – cache-first
  if (isLocalRequest(url) && isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Route 4: Everything else – pass-through with offline fallback
  event.respondWith(
    fetch(request).catch(() => new Response('Offline', { status: 503 }))
  );
});

// ---------------------------------------------------------------------------
// MESSAGE HANDLER
// ---------------------------------------------------------------------------
self.addEventListener('message', event => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.delete(CACHE_NAME).then(() => self.clients.matchAll()).then(clients => {
          clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED', timestamp: Date.now() }));
          console.log('[SW] Cache cleared');
        })
      );
      break;

    case 'GET_CACHE_INFO':
      event.waitUntil(
        caches.open(CACHE_NAME).then(c => c.keys()).then(keys => {
          if (event.ports?.[0]) {
            event.ports[0].postMessage({ type: 'CACHE_INFO', count: keys.length, version: '13.0.0', timestamp: Date.now() });
          }
        })
      );
      break;

    case 'CHECK_HEALTH':
      if (event.ports?.[0]) {
        event.ports[0].postMessage({ type: 'HEALTH_RESPONSE', status: 'healthy', version: '13.0.0', timestamp: Date.now() });
      }
      break;

    case 'CLEAR_LOGS':
      loggedBypasses.clear();
      loggedCacheHits.clear();
      console.log('[SW] Logs cleared');
      break;
  }
});

// ---------------------------------------------------------------------------
// PERIODIC CACHE CLEANUP
// ---------------------------------------------------------------------------
async function cleanupOldEntries() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let cleaned = 0;
    const cutoff = Date.now() - CACHE_MAX_AGE;
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) {
        const d = res.headers.get('date');
        if (d && new Date(d).getTime() < cutoff) {
          await cache.delete(req);
          cleaned++;
        }
      }
    }
    if (cleaned > 0) console.log('[SW] Cleaned ' + cleaned + ' stale entries');
  } catch (e) {
    console.warn('[SW] Cleanup error:', e);
  }
}

setInterval(cleanupOldEntries, CACHE_MAX_AGE);

// ---------------------------------------------------------------------------
// ERROR GUARDS
// ---------------------------------------------------------------------------
self.addEventListener('error', e => console.warn('[SW] Error:', e.error));
self.addEventListener('unhandledrejection', e => { console.warn('[SW] Rejection:', e.reason); e.preventDefault(); });

console.log('[SW] v13.0.0 loaded – offline-first navigation active');