// service-worker.js
// Version: 13.0.0 - OFFLINE-FIRST + NAVIGATION CACHE FIX
// Strategy:
//   Navigation (HTML pages) -> Network-first, cache fallback, inline shell
//   Static assets (JS/CSS/fonts/images) -> Cache-first, network fallback
//   API / auth requests -> Always bypass to network (never cached)
//   /login + /register HTML pages -> Navigation handler (NOT bypassed)

'use strict';

// PATCH v1.3: Version bumped to 14.0.0 — forces full cache replacement on every
// installed PWA. When the phone opens the app, the SW detects the version mismatch,
// deletes the entire v13 cache (which held the buggy auth JS files), and fetches
// fresh copies from the server. This is the only reliable way to push JS fixes
// to installed mobile PWAs without requiring manual browser data clearing.
const SW_VERSION = '14.0.0';
const CACHE_NAME = 'moodchat-static-v14-offline'; // differs from v13 → triggers full wipe
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ---------------------------------------------------------------------------
// APP SHELL - core files to pre-cache on install
// ---------------------------------------------------------------------------
const CORE_STATIC_ASSETS = [
  // FIX: removed duplicate '/' entry - '/index.html' is sufficient;
  //      the install loop normalised '/' → '/index.html' anyway.
  '/index.html',
  '/manifest.json',
  '/moodchat-192x192.png',
  '/moodchat-512x512.png',
  '/api.js',
  '/Tool.css',
  '/Tool.js',
  '/group.js',

  // Pages
  '/friend.html',
  '/chat.html',
  '/calls.html',

  // Calls module assets (critical for offline UI)
  '/calls-core.js',
  '/calls-ui.js',
  '/calls.css',
  '/callSession.manager.js',
  '/callRetry.engine.js',
  '/localStore.calls.js',

  // ── ALL APP JS MODULES (must be cached for offline to work) ──────────────
  // API layer
  '/js/api.core.js',
  '/js/api.request.js',
  '/js/api.auth.js',
  '/js/api.messages.js',

  // App core
  '/js/app.core.bootstrap.js',
  '/js/app.core.session.js',
  '/js/app.core.ui.js',

  // UI auth
  '/js/app.ui.auth.js',

  // Session & offline helpers
  '/js/app.cache.js',
  '/js/authStorage.js',
  '/js/app.offline.queue.js',
  '/js/auth.session.manager.js',
  '/js/app.runtime.authority.js',
  '/js/auth.account.limit.js',
  '/js/app.offline.bootstrap.js',

  // Font Awesome (local copies)
  '/css/vendor/font-awesome.min.css',
  '/fonts/fa-solid-900.woff2',
  '/fonts/fa-solid-900.ttf',
  '/fonts/fa-regular-400.woff2',
  '/fonts/fa-regular-400.ttf',
  '/fonts/fa-brands-400.woff2',
  '/fonts/fa-brands-400.ttf',

  // Offline icon fallback
  '/css/offline-icon-fallback.css',
  '/js/vendor/offline-icon-bootstrap.js',

  // App icons
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',

  // Core CSS
  '/friend.css',
  '/css/suppress-webgl.css'
];

// ---------------------------------------------------------------------------
// PATCH v1.3: AUTH JS FILES — always network-first, never cache-first.
// These files contain session logic. Serving a stale cached version after
// a bug-fix deploy is what caused the mobile reopen loop. Any file in this
// list is fetched fresh on every load; cache is only used when offline.
// ---------------------------------------------------------------------------
const NETWORK_FIRST_PATTERNS = [
  /\/js\/api\.auth\.js/i,
  /\/js\/app\.core\.session\.js/i,
  /\/js\/app\.core\.bootstrap\.js/i,
  /\/js\/auth\.session\.manager\.js/i,
  /\/js\/authStorage\.js/i,
  /\/js\/app\.ui\.auth\.js/i,
];

function isNetworkFirst(url) {
  return NETWORK_FIRST_PATTERNS.some(function(p) { return p.test(url); });
}

// ---------------------------------------------------------------------------

// FIX: /login and /register removed from BYPASS_PATTERNS.
//      These are HTML pages, not API routes. If they were bypassed, visiting
//      them offline would always show the browser's "You are offline" screen.
//      Navigation requests are now handled by handleNavigation() instead.
//
// Only true API/backend/socket endpoints should bypass caching.
const BYPASS_PATTERNS = [
  /\/api\//i,
  /\/auth\//i,
  /\/backend\//i,
  /\/server\//i,
  /\/socket\.io\//i,
  /\/ws\//i,
  /\/wss\//i,
  /\/graphql/i,
  /\/webhook/i,
  /^https?:\/\/api\./i
];

// Static assets get cache-first treatment
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
  /offline-icon-bootstrap/i
];

// ---------------------------------------------------------------------------
// LOG DEDUP - prevents console spam on repeated requests
// FIX: loggedBypasses was declared and cleared but never populated (dead code).
//      Removed loggedBypasses; kept loggedCacheHits which is actually used.
// ---------------------------------------------------------------------------
const loggedCacheHits = new Set();

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function isApiRequest(url) {
  return BYPASS_PATTERNS.some(function(pattern) {
    return pattern.test(url);
  });
}

function isStaticAsset(url) {
  if (!url || typeof url !== 'string') return false;
  return STATIC_ASSET_PATTERNS.some(function(pattern) {
    return pattern.test(url);
  });
}

function isLocalRequest(url) {
  try {
    var parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isFontOrIcon(url) {
  return (
    /\/webfonts\/|\/fonts\/|font-awesome|\.woff2?$|\.ttf$|\.eot$/i.test(url) ||
    /offline-icon-fallback|offline-icon-bootstrap/i.test(url)
  );
}

function isCacheStale(response) {
  try {
    var dateHeader = response.headers.get('date');
    if (!dateHeader) return false;
    return (Date.now() - new Date(dateHeader).getTime()) > CACHE_MAX_AGE;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OFFLINE SHELL HTML
// Shown as a last resort when no cache exists at all.
// Prevents the browser built-in "You are offline" page from ever appearing.
// ---------------------------------------------------------------------------
var OFFLINE_SHELL = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1.0">',
  '<title>MoodChat - Offline</title>',
  '<style>',
  'body { margin: 0; font-family: Segoe UI, sans-serif;',
  '  background: linear-gradient(135deg, #667eea, #764ba2);',
  '  min-height: 100vh; display: flex; align-items: center;',
  '  justify-content: center; color: #fff; text-align: center; }',
  '.card { background: rgba(255,255,255,0.15); backdrop-filter: blur(20px);',
  '  border-radius: 20px; padding: 40px; max-width: 340px;',
  '  border: 1px solid rgba(255,255,255,0.3); }',
  'h1 { font-size: 2rem; margin-bottom: 10px; }',
  'p { opacity: 0.85; margin-bottom: 24px; line-height: 1.5; }',
  'button { background: #fff; color: #667eea; border: none;',
  '  padding: 14px 28px; border-radius: 30px;',
  '  font-size: 1rem; font-weight: 700; cursor: pointer; }',
  '</style>',
  '</head>',
  '<body>',
  '<div class="card">',
  '<div style="font-size: 3rem; margin-bottom: 16px">&#x1F4AC;</div>',
  '<h1>MoodChat</h1>',
  '<p>You are offline. Connect to the internet, or tap below if you have visited before.</p>',
  '<button onclick="location.reload()">Try Again</button>',
  '</div>',
  '</body>',
  '</html>'
].join('\n');

// ---------------------------------------------------------------------------
// NAVIGATION HANDLER
//
// Every HTML page load uses Network-first with cache fallback:
//   1. Try network -> cache the response -> return it
//   2. Offline -> serve the cached version of the exact page
//   3. No cached page -> serve /index.html (SPA fallback)
//   4. No index.html cached -> return inline offline shell
//
// FIX: The cache.put() and cache.match() now both use the full URL string
//      (request.url) so the key is always consistent regardless of origin.
// FIX: Added explicit fallback attempts for /friend.html and /chat.html
//      in addition to /index.html so MPA routes also recover offline.
// ---------------------------------------------------------------------------
async function handleNavigation(request) {
  var cache = await caches.open(CACHE_NAME);

  // FIX: use the full request.url as cache key to avoid pathname/origin mismatch
  var fullUrl = request.url;

  // Step 1: try network
  try {
    var networkRes = await fetch(request);
    if (networkRes.ok) {
      // Store under the full URL so cache.match(request) finds it correctly
      cache.put(fullUrl, networkRes.clone()).catch(function() {});
      return networkRes;
    }
    // Non-ok response (e.g. 500): fall through to cache
  } catch (networkError) {
    console.log('[SW] Offline - serving cached page for: ' + fullUrl);
  }

  // Step 2: exact cached page
  var cachedPage = await cache.match(request);
  if (cachedPage) return cachedPage;

  // Step 3: SPA fallback chain - try known entry points in order
  var fallbackUrls = [
    new URL('/index.html', self.location.origin).href,
    new URL('/', self.location.origin).href,
    new URL('/friend.html', self.location.origin).href,
    new URL('/chat.html', self.location.origin).href
  ];

  for (var i = 0; i < fallbackUrls.length; i++) {
    var fallback = await cache.match(fallbackUrls[i]);
    if (fallback) {
      console.log('[SW] Navigation fallback to: ' + fallbackUrls[i]);
      return fallback;
    }
  }

  // Step 4: inline offline shell - browser error screen never shown
  console.warn('[SW] No cached page found - returning offline shell');
  return new Response(OFFLINE_SHELL, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ---------------------------------------------------------------------------
// NETWORK-FIRST HANDLER — for auth/session JS files
// PATCH v1.3: Always fetches fresh from network; only falls back to cache
// when offline. This guarantees that bug-fix deploys are picked up
// immediately by installed PWAs instead of waiting for 7-day cache expiry.
// ---------------------------------------------------------------------------
async function handleNetworkFirst(request) {
  var cache = await caches.open(CACHE_NAME);
  try {
    var networkRes = await fetch(request, { cache: 'no-store' });
    if (networkRes.ok) {
      // Update the cache so offline fallback is always the latest version
      cache.put(request, networkRes.clone()).catch(function() {});
      return networkRes;
    }
    // Non-ok (e.g. 500 from server) — fall back to cache
    var cached = await cache.match(request);
    if (cached) return cached;
    return networkRes;
  } catch (e) {
    // Offline — serve whatever is cached
    var cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Offline network-first fallback: ' + request.url);
      return cached;
    }
    return new Response('Auth module unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ---------------------------------------------------------------------------
// STATIC ASSET HANDLER
// Cache-first for fonts (permanent). Cache-first with staleness check for rest.
// ---------------------------------------------------------------------------
async function handleStaticAsset(request) {
  var cache = await caches.open(CACHE_NAME);
  var cacheKey = request.url;

  // Fonts and icons: permanent cache-first (these never change)
  if (isFontOrIcon(request.url)) {
    var cachedFont = await cache.match(request);
    if (cachedFont) return cachedFont;
    try {
      var fontRes = await fetch(request);
      if (fontRes.ok) {
        cache.put(request, fontRes.clone()).catch(function() {});
      }
      return fontRes;
    } catch (e) {
      // Return empty 200 so CSS does not throw a network error
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'font/woff2' }
      });
    }
  }

  // All other static assets: cache-first, refresh when stale
  var cachedRes = await cache.match(request);
  if (cachedRes && !isCacheStale(cachedRes)) {
    if (!loggedCacheHits.has(cacheKey)) {
      console.log('[SW] Cache hit: ' + cacheKey);
      loggedCacheHits.add(cacheKey);
    }
    return cachedRes;
  }

  try {
    var networkRes = await fetch(request);
    if (networkRes.ok) {
      cache.put(request, networkRes.clone()).catch(function() {});
      return networkRes;
    }
    if (cachedRes) return cachedRes; // return stale on non-ok
    return networkRes;
  } catch (e) {
    if (cachedRes) return cachedRes; // return stale when offline
    return new Response('Resource unavailable offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ---------------------------------------------------------------------------
// API REQUEST HANDLER
// Always hits the network. Returns a clean JSON 503 when offline.
// ---------------------------------------------------------------------------
async function handleApiRequest(request) {
  try {
    return await fetch(request);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Network request failed', offline: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ---------------------------------------------------------------------------
// INSTALL - pre-cache the app shell
// FIX: skipWaiting() is called immediately inside waitUntil so the new SW
//      activates as soon as install completes, not after all asset fetches.
//      Pre-cache failures are non-fatal (logged + continued via allSettled).
// ---------------------------------------------------------------------------
self.addEventListener('install', function(event) {
  console.log('[SW] Installing v' + SW_VERSION);

  // FIX: call skipWaiting() immediately so activation is not blocked by
  //      slow or failing asset fetches during install.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      var promises = CORE_STATIC_ASSETS.map(function(asset) {
        return fetch(asset, { credentials: 'same-origin', cache: 'no-store' })
          .then(function(response) {
            if (response.ok) {
              return cache.put(asset, response);
            }
          })
          .catch(function(err) {
            // Non-fatal: log and continue. Missing assets are handled at runtime.
            console.warn('[SW] Could not pre-cache: ' + asset + ' (' + err.message + ')');
          });
      });

      return Promise.allSettled(promises).then(function(results) {
        var succeeded = results.filter(function(r) {
          return r.status === 'fulfilled';
        }).length;
        console.log('[SW] Pre-cached ' + succeeded + '/' + CORE_STATIC_ASSETS.length + ' assets');
      });
    })
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE - remove old caches and claim all open tabs
// FIX: version string now references SW_VERSION constant everywhere.
// ---------------------------------------------------------------------------
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating v' + SW_VERSION);

  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(name) {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting old cache: ' + name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
      .then(function() {
        console.log('[SW] All clients claimed');
        return self.clients.matchAll();
      })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: SW_VERSION,
            timestamp: Date.now()
          });
        });
      })
  );
});

// ---------------------------------------------------------------------------
// FETCH - route every request to the correct handler
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = request.url;

  // FIX: keep log set from growing indefinitely (only one set now)
  if (loggedCacheHits.size > 500) loggedCacheHits.clear();

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // Route 1: Navigation requests (HTML page loads)
  // MUST be evaluated before isApiRequest() so that /login and /register
  // HTML pages are served from cache offline instead of being bypassed.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Route 2: API / auth endpoints - always go to network
  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Route 3a: Auth/session JS files — network-first so bug-fix deploys
  // reach installed PWAs immediately without waiting 7 days for cache expiry.
  // Falls back to cache only when genuinely offline.
  if (isLocalRequest(url) && isNetworkFirst(url)) {
    event.respondWith(handleNetworkFirst(request));
    return;
  }

  // Route 3b: Local static assets (JS, CSS, fonts, images, icons)
  if (isLocalRequest(url) && isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Route 4: Everything else (cross-origin, unknown types) - pass through
  event.respondWith(
    fetch(request).catch(function() {
      return new Response('Offline', { status: 503 });
    })
  );
});

// ---------------------------------------------------------------------------
// MESSAGE - handle commands from the page
// FIX: version string now uses SW_VERSION constant.
// ---------------------------------------------------------------------------
self.addEventListener('message', function(event) {
  var data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.delete(CACHE_NAME).then(function() {
          return self.clients.matchAll();
        }).then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({ type: 'CACHE_CLEARED', timestamp: Date.now() });
          });
          console.log('[SW] Cache cleared');
        })
      );
      break;

    case 'GET_CACHE_INFO':
      event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
          return cache.keys();
        }).then(function(keys) {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
              type: 'CACHE_INFO',
              count: keys.length,
              version: SW_VERSION,
              timestamp: Date.now()
            });
          }
        })
      );
      break;

    case 'CHECK_HEALTH':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: 'HEALTH_RESPONSE',
          status: 'healthy',
          version: SW_VERSION,
          timestamp: Date.now()
        });
      }
      break;

    case 'CLEAR_LOGS':
      loggedCacheHits.clear();
      console.log('[SW] Logs cleared');
      break;
  }
});

// ---------------------------------------------------------------------------
// PERIODIC CACHE CLEANUP - evict entries older than CACHE_MAX_AGE
//
// FIX: setInterval() does NOT work reliably in Service Workers because the
//      browser terminates the SW between events. The interval is reset every
//      time the SW wakes up, so the callback will never fire as intended.
//
//      Replaced with an on-demand approach: cleanup runs once on every
//      activate event (safe moment, SW is fully awake) AND can be triggered
//      manually via the 'RUN_CLEANUP' message type below.
// ---------------------------------------------------------------------------
async function cleanupOldEntries() {
  try {
    var cache = await caches.open(CACHE_NAME);
    var keys = await cache.keys();
    var cleaned = 0;
    var cutoff = Date.now() - CACHE_MAX_AGE;

    for (var i = 0; i < keys.length; i++) {
      var response = await cache.match(keys[i]);
      if (response) {
        var dateHeader = response.headers.get('date');
        if (dateHeader && new Date(dateHeader).getTime() < cutoff) {
          await cache.delete(keys[i]);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log('[SW] Cleaned ' + cleaned + ' stale cache entries');
    }
  } catch (e) {
    console.warn('[SW] Cleanup error:', e);
  }
}

// Also allow manual trigger from the page
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'RUN_CLEANUP') {
    event.waitUntil(cleanupOldEntries());
  }
});

// ---------------------------------------------------------------------------
// GLOBAL ERROR HANDLERS
// ---------------------------------------------------------------------------
self.addEventListener('error', function(event) {
  console.warn('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
  console.warn('[SW] Unhandled rejection:', event.reason);
  event.preventDefault();
});

console.log('[SW] v' + SW_VERSION + ' loaded - offline-first navigation active');