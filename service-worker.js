// service-worker.js
// Version: 18.0.0 - INSTANT PWA UPDATE + OFFLINE-FIRST PRESERVED
// Strategy:
//   Navigation (HTML pages) -> Network-first, cache fallback, inline shell
//   Static assets (JS/CSS/fonts/images) -> Cache-first, network fallback
//   API / auth requests -> Always bypass to network (never cached)
//   /login + /register HTML pages -> Navigation handler (NOT bypassed)
//   FIX v18: skipWaiting() fires immediately; clients notified to reload on controllerchange

'use strict';

// FIX v19.1.0: Bumped — index.html now has a landing screen (opt-in
// Login/Register/Google/Install navigation before the auth form),
// settings.html + settings-ui.js had two dead-page redirects fixed
// (/auth.html and /login.html both didn't exist as real files).
// Navigation requests are network-first already, so online users pick
// this up automatically either way — but bumping still matches this
// file's own established practice of forcing immediate cache eviction
// for already-installed PWA users on a meaningful deploy, rather than
// waiting on their periodic update check.
//
// FIX v19.2.0 (theme-flash bug, round 2): theme.colors.css — the file
// that defines the actual dark-mode palette every module CSS keys off —
// was cache-first with only a 7-day staleness check, and NOT in
// NETWORK_FIRST_PATTERNS below. So every prior theme-flash fix touching
// that file could sit in an already-installed user's cache for up to a
// week before it was ever re-fetched, which is almost certainly why the
// flash kept reappearing after being "fixed" — the fix was shipped, but
// the browser kept serving the old cached CSS. theme.colors.css and
// pwa-manager.js (actively patched, see its own fix history) are now both
// network-first. Bumping the cache name here also forces an immediate,
// one-time clean slate for every static asset already cached from
// previous versions.
// FIX v19.3.0 (theme-sparking bug, round 7): the round-6 fix touched 6 files
// (status-core-runtime.js, messages-core.ui-bridge.js, group-core-bridge.js,
// friend-core.ui-bridge.js, Tool-core.part3.js, Tool-ui.js) to stop them
// replaying a stale settings cache's theme on cold boot. None of those 6
// files were in NETWORK_FIRST_PATTERNS below, and 3 of them
// (messages-core.ui-bridge.js, group-core-bridge.js, friend-core.ui-bridge.js)
// weren't even covered by the messages-core.js/messages-ui.js entries already
// there (different filenames) — so for any already-installed user, the
// service worker kept serving the pre-fix, still-buggy versions of these
// exact files from cache, cache-first, for up to 7 days after every deploy.
// This is the identical failure mode already diagnosed for theme.colors.css
// in v19.2.0 below — it just hadn't been extended to these 6 files, which is
// almost certainly why the fix "didn't work": it was shipped, but the
// browser never fetched it. All 6 are now network-first, and the cache name
// is bumped again for an immediate one-time clean slate.
// FIX v19.4.0 (SW-STALE-MESSAGES-CORE): messages-core.bootstrap.js and
// messages-core.operations.js — the files that hold ChatManager,
// sendMessageToBackend, and the pending-conversation-to-real-chatId
// reconciliation logic — were never added to NETWORK_FIRST_PATTERNS, so
// they sat cache-first with up to 7-day staleness like any other static
// asset. This is the identical failure mode already diagnosed and fixed
// for messages-core.ui-bridge.js, group-core-bridge.js, and
// friend-core.ui-bridge.js in v19.3.0 — those three were fixed, but these
// two sibling files in the same module were missed. Practically, this
// meant that after any deploy touching send/receive message logic, some
// devices kept silently running the old cached version of these two files
// for up to a week (or until a hard refresh), which produces exactly the
// kind of "works for one user, not the other" asymmetry this causes.
// Both files are now network-first, and the cache name is bumped for an
// immediate one-time clean slate so this deploy reaches everyone right away
// instead of waiting on staleness expiry.
const SW_VERSION = '19.4.0';
const CACHE_NAME = 'nexopa-static-v25'; // Bumped — messages-core.bootstrap.js + messages-core.operations.js now network-first
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ---------------------------------------------------------------------------
// APP SHELL - core files to pre-cache on install
// ---------------------------------------------------------------------------
const CORE_STATIC_ASSETS = [
  // FIX: removed duplicate '/' entry - '/index.html' is sufficient;
  //      the install loop normalised '/' → '/index.html' anyway.
  '/index.html',
  '/manifest.json',
  // FIX F-02: Corrected icon paths — old paths did not exist and caused SW install failure
  '/icons/nexopa-192.png',
  '/icons/nexopa-512.png',
  // FIX F-02: Removed /api.js (doesn't exist), /Tool.js (is Tool-ui.js), /group.js (is group-ui.js)
  '/Tool.css',
  '/Tool-ui.js',
  '/Tool-core.part1.js',
  '/Tool-core.part2.js',
  '/Tool-core.part3.js',
  '/group-ui.js',
  '/group-core-bootstrap.js',
  '/group-core-operations.js',
  '/group-core-bridge.js',

  // Pages
  '/friend.html',
  '/chat.html',
  '/calls.html',

  // Calls module assets (critical for offline UI)
  '/calls-core.part1.js',
  '/calls-core.part2.js',
  '/calls-core.part3.js',
  '/calls-core.part4.js',
  '/calls-core.part5.js',
  '/calls-core.part6.js',
  '/calls-core.part7.js',
  '/calls-core.part8.js',
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

  // FIX F-02: Removed /css/offline-icon-fallback.css and /js/vendor/offline-icon-bootstrap.js
  // — these files do not exist and caused SW install to fail in strict Chrome environments

  // Core CSS
  '/friend.css',
  '/css/suppress-webgl.css'
];

// PATCH v1.4: NETWORK_FIRST_PATTERNS expanded to cover all critical runtime files.
// Any file in this list is fetched fresh on every load; cache is only used when offline.
// This is the primary mechanism ensuring deployed fixes reach users immediately.
const NETWORK_FIRST_PATTERNS = [
  // Auth / session — existing
  /\/js\/api\.auth\.js/i,
  /\/js\/app\.core\.session\.js/i,
  /\/js\/app\.core\.bootstrap\.js/i,
  /\/js\/auth\.session\.manager\.js/i,
  /\/js\/authStorage\.js/i,
  /\/js\/app\.ui\.auth\.js/i,

  // ✅ NEW: Realtime socket — was served stale from cache, causing WebSocket failures
  /\/js\/app\.realtime\.socket\.js/i,
  /\/app\.realtime\.socket\.js/i,

  // ✅ NEW: Runtime authority — was catching raw Event object from stale socket file
  /\/js\/app\.runtime\.authority\.js/i,
  /\/app\.runtime\.authority\.js/i,

  // ✅ NEW: Core app JS files that are actively patched
  /\/js\/api\.core\.js/i,
  /\/api_core\.js/i,
  /\/api\.core\.js/i,

  // ✅ NEW: Calls module — stale version caused connection timeout + call UI blank
  /\/calls-core\.part[1-8]\.js/i,
  /\/calls-ui\.js/i,
  /\/callSession\.manager\.js/i,
  /\/callRetry\.engine\.js/i,

  // ✅ NEW: Messages module
  /\/messages-core\.js/i,
  /\/messages-ui\.js/i,

  // FIX (SW-STALE-MESSAGES-CORE): messages-core.bootstrap.js and
  // messages-core.operations.js were the only two files in the messages
  // module NOT covered by any pattern above — the /messages-core\.js/
  // pattern only matches a literal "messages-core.js", never
  // "messages-core.bootstrap.js" or "messages-core.operations.js" (the
  // ".bootstrap"/".operations" segment breaks the substring match). These
  // two files hold ChatManager, sendMessageToBackend, and the
  // pending-conversation-to-real-chatId reconciliation logic — exactly the
  // kind of actively-patched, correctness-critical code this list exists
  // to protect. Without this, they fell through to the generic cache-first
  // static-asset rule (up to 7-day staleness), so after any deploy some
  // devices kept silently running the old versions of this code — the same
  // failure mode already diagnosed and fixed for messages-core.ui-bridge.js,
  // group-core-bridge.js, and friend-core.ui-bridge.js in v19.3.0 above,
  // just missed for these two.
  /\/messages-core\.bootstrap\.js/i,
  /\/messages-core\.operations\.js/i,

  // ✅ NEW (theme-sparking bug, round 7): the actual files patched for the
  // theme cold-boot stale-cache-replay bug. See v19.3.0 note above for why
  // these specifically must never sit cache-first.
  /\/status-core-runtime\.js/i,
  /\/messages-core\.ui-bridge\.js/i,
  /\/group-core-bridge\.js/i,
  /\/friend-core\.ui-bridge\.js/i,
  /\/Tool-core\.part3\.js/i,
  /\/Tool-ui\.js/i,

  // ✅ NEW: Safety layer (handles localStorage, used by token reading)
  /\/kynecta\.safety\.layer\.js/i,

  // ✅ NEW (theme-flash bug, round 2): theme.colors.css defines the actual
  // dark-mode palette every module's CSS keys off. It was falling under the
  // generic cache-first static-asset rule below with only a 7-day staleness
  // check, so theme fixes could take up to a week to reach an already-
  // installed PWA — the most likely reason the "sparking" flash kept coming
  // back after being fixed. pwa-manager.js is included for the same reason:
  // it's the file that governs install-state detection and is actively
  // patched.
  /\/theme\.colors\.css/i,
  /\/pwa-manager\.js/i,
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
  /^https?:\/\/api\./i,
  // FIX (WiFi→Offline): Backend health probe URLs must bypass cache.
  // Without this, the SW returned a 503 from its catch() for the health probe,
  // causing NetworkIntelligenceManager to mark internet OFFLINE even on WiFi.
  /nexora-3bla\.onrender\.com/i,
  /onrender\.com\/health/i,
  /\.onrender\.com\/api/i,
  /www\.google\.com\/generate_204/i,
  /cloudflare\.com\/cdn-cgi/i,
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
  /\/js\/vendor\//i
  // FIX F-02: Removed /offline-icon-fallback/ and /offline-icon-bootstrap/ — files don't exist
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
    /\/webfonts\/|\/fonts\/|font-awesome|\.woff2?$|\.ttf$|\.eot$/i.test(url)
    // FIX F-02: Removed offline-icon-fallback/offline-icon-bootstrap — files don't exist
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
  '<title>Nexopa - Offline</title>',
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
  '<h1>Nexopa</h1>',
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
  console.log('[SW] Installing v' + SW_VERSION + ' (network-first for all critical JS)');

  // PHASE15 FIX-PHASE-H: Do NOT call skipWaiting() unconditionally on install.
  // The previous pattern (skipWaiting immediately in install) caused a reload
  // loop because:
  //   1. New SW installs → skipWaiting fires → controllerchange fires on all tabs
  //   2. pwa-manager.js catches controllerchange and calls window.location.reload()
  //   3. Reload triggers a fresh SW check → new SW installs again → loop
  // Fix: only skip waiting when the pwa-manager explicitly sends SKIP_WAITING,
  // which only happens AFTER the user taps the "Refresh" button in the banner.
  // This matches Chrome/Firefox best practices for user-initiated updates.
  // skipWaiting() is now handled below in the 'message' event handler.

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
// ACTIVATE - remove old caches and claim clients (SAFE VERSION - NO RELOADS)
// FIXED: Removed all client reload logic that caused infinite loops
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
        loggedCacheHits.clear();
        // ✅ FIX: Notify all windows so the app can show an "Update available" prompt
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(function(allClients) {
        allClients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
        });
        console.log('[SW] v' + SW_VERSION + ' activated — ' + allClients.length + ' client(s) notified');
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

    case 'CLEAR_TOKEN_CACHE':
      // Clear any cached responses that might contain tokens
      event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
          return cache.keys().then(function(keys) {
            var tokenRelatedKeys = keys.filter(function(request) {
              var url = request.url;
              // Clear auth-related cached responses
              return /\/auth\//i.test(url) || 
                     /\/api\/.*auth/i.test(url) ||
                     /\/login/i.test(url) ||
                     /\/register/i.test(url) ||
                     /\/token/i.test(url);
            });
            
            return Promise.all(tokenRelatedKeys.map(function(request) {
              console.log('[SW] Clearing token-related cache: ' + request.url);
              return cache.delete(request);
            }));
          });
        }).then(function() {
          // Notify all clients that token cache was cleared
          return self.clients.matchAll();
        }).then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({ 
              type: 'TOKEN_CACHE_CLEARED', 
              timestamp: Date.now() 
            });
          });
          console.log('[SW] Token cache cleared');
        })
      );
      break;

    case 'FORCE_REFRESH':
      // Force refresh of critical auth files
      event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
          var authFiles = [
            '/js/api.core.js',
            '/js/api.auth.js',
            '/js/auth.session.manager.js',
            '/js/authStorage.js',
            '/js/app.core.session.js'
          ];
          
          return Promise.all(authFiles.map(function(file) {
            var request = new Request(file, { cache: 'no-store' });
            return fetch(request).then(function(response) {
              if (response.ok) {
                console.log('[SW] Force refreshed: ' + file);
                return cache.put(request, response);
              }
            }).catch(function(err) {
              console.warn('[SW] Failed to force refresh: ' + file, err);
            });
          }));
        }).then(function() {
          // Notify clients
          return self.clients.matchAll();
        }).then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({ 
              type: 'FORCE_REFRESH_COMPLETE', 
              timestamp: Date.now() 
            });
          });
        })
      );
      break;

    // ✅ SAFE: Update notification only - no forced reloads
    case 'UPDATE_AVAILABLE':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: 'UPDATE_AVAILABLE_SAFE',
          version: SW_VERSION,
          timestamp: Date.now(),
          message: 'Update available - will apply on next navigation'
        });
      }
      break;

    // ✅ NEW: Invalidate specific URLs so they are re-fetched on next request
    case 'INVALIDATE_URLS':
      if (Array.isArray(data.urls)) {
        event.waitUntil(
          caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(data.urls.map(function(u) {
              return cache.delete(u).then(function(deleted) {
                if (deleted) console.log('[SW] Invalidated: ' + u);
              });
            }));
          })
        );
      }
      break;
  }
});

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

// FIX (Forensic Audit P3): Background Sync for offline queue replay.
// Previously the service worker had no sync event handler, so queued messages
// were only replayed when the user actively reopened the app. With background
// sync, the browser wakes the SW when connectivity returns (even if the tab
// is closed) and triggers a flush of the pending message queue.
self.addEventListener('sync', function(event) {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'offline-message-queue') {
    event.waitUntil(
      // Notify the main window to replay offline queue.
      // If no window is available (tab closed), the sync is retried by the browser.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clients) {
          if (clients.length === 0) {
            // No window open — re-queue for next wake-up
            console.log('[SW] No clients open for sync — will retry');
            return;
          }
          // Signal first available client to flush its queue
          var target = clients.find(function(c) { return c.focused; }) || clients[0];
          target.postMessage({ type: 'FLUSH_OFFLINE_QUEUE', source: 'background-sync' });
          console.log('[SW] Sent FLUSH_OFFLINE_QUEUE to client:', target.url);
        })
        .catch(function(err) {
          console.warn('[SW] Background sync error:', err);
        })
    );
  }

  if (event.tag === 'offline-status-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(c) {
          c.postMessage({ type: 'SYNC_STATUS_UPDATES', source: 'background-sync' });
        });
      })
    );
  }
});

// Also allow manual trigger from the page
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'RUN_CLEANUP') {
    event.waitUntil(cleanupOldEntries());
  }

  // FIX (Forensic Audit P3): Allow app to register background sync from within the SW context
  if (event.data && event.data.type === 'REGISTER_BACKGROUND_SYNC') {
    const tag = event.data.tag || 'offline-message-queue';
    self.registration.sync.register(tag).then(function() {
      console.log('[SW] Background sync registered:', tag);
    }).catch(function(err) {
      console.warn('[SW] Background sync registration failed:', tag, err);
    });
  }
  // FIX (push-notification-while-open): remember which chat (if any) is
  // currently open in a client tab, so the push handler can skip showing a
  // redundant OS notification for a message that's already rendering live
  // on screen. Keyed per client id since more than one tab/window can be
  // controlled at once; a client reports null when its chat panel closes.
  if (event.data && event.data.type === 'ACTIVE_CHAT_CHANGED') {
    if (!self.__kynActiveChatByClient) self.__kynActiveChatByClient = new Map();
    const _cid = event.source && event.source.id;
    if (_cid) {
      if (event.data.chatId) self.__kynActiveChatByClient.set(_cid, String(event.data.chatId));
      else self.__kynActiveChatByClient.delete(_cid);
    }
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

if (self.__SW_DEBUG__) {
  console.log('[SW] v' + SW_VERSION + ' loaded - offline-first navigation active');
}

// ── PHASE14 FIX: Push notification handlers ──────────────────────────────────
// Without these, web push notifications are silently swallowed — the browser
// receives the push message from the server but no notification is displayed.

self.addEventListener('push', function(event) {
    if (!event.data) return;

    let data = {};
    try { data = event.data.json(); } catch(_) {
        try { data = { title: 'Nexopa', body: event.data.text() }; } catch(__) { return; }
    }

    // FIX (ciphertext-in-notification): the server can't decrypt end-to-end
    // encrypted message content, so for E2E chats data.body IS the raw
    // encrypted envelope (e.g. {"v":2,"eph":"...","ct":"..."}) — that JSON
    // blob was being shown verbatim as the notification preview instead of
    // any human-readable text. The service worker has no access to the
    // page's decryption keys/session, so it can't decrypt it either; the
    // correct fix is to never surface the raw envelope and fall back to a
    // generic "You have a new message" whenever the body looks like one.
    const _looksEncrypted = function(s) {
        if (typeof s !== 'string' || !s) return false;
        const t = s.trim();
        return t.charAt(0) === '{' && (t.indexOf('"v"') !== -1 || t.indexOf('"eph"') !== -1 || t.indexOf('"ct"') !== -1);
    };
    const _rawBody = data.body || data.message || '';
    const _safeBody = _looksEncrypted(_rawBody) ? 'You have a new message' : (_rawBody || 'You have a new notification');

    const title   = data.title   || 'Nexopa';
    const options = {
        body:    _safeBody,
        icon:    data.icon    || '/icons/nexopa-192.png',
        badge:   data.badge   || '/icons/nexopa-192.png',
        tag:     data.tag     || 'nexopa-notification',
        data:    data.data    || { url: data.url || '/chat.html' },
        // FIX: vibrate was hardcoded to always fire regardless of the
        // Notifications > Vibration setting, and there was no way to
        // suppress sound for the Notifications > Sound setting either.
        // The backend (pushNotificationService.js) now includes the
        // recipient's actual preference in the payload — use it instead
        // of a fixed value.
        vibrate: Array.isArray(data.vibrate) ? data.vibrate : (data.vibrate === false ? [] : [200, 100, 200]),
        silent:  data.silent === true,
        requireInteraction: data.requireInteraction || false
    };

    // For message notifications: include sender info
    if (data.type === 'message' || data.type === 'new_message') {
        options.tag  = 'msg-' + (data.chatId || 'chat');
        options.body = data.senderName ? `${data.senderName}: ${options.body}` : options.body;
    }

    // Game daily-reward / streak reminders
    if (data.type === 'daily_reward') {
        options.tag  = 'game-daily-reward';
        options.icon = data.icon || '/icons/nexopa-192.png';
        options.data = { url: '/game.html' };
        options.requireInteraction = false;
    }
    if (data.type === 'game_challenge') {
        options.tag  = 'game-challenge-' + (data.challengeId || '');
        options.data = { url: '/game.html' };
    }

    // FIX (redundant notification while chat is open): a message notification
    // used to fire unconditionally even when the recipient already has that
    // exact conversation open and focused in a foreground tab — the message
    // renders live in the chat panel via the socket AND a duplicate OS banner
    // pops up on top of it. Skip showNotification in that one case; every
    // other state (app backgrounded, a different chat open, app closed)
    // still notifies normally.
    event.waitUntil(
        (async function() {
            if (data.type === 'message' || data.type === 'new_message') {
                try {
                    const _chatId = String(data.chatId || (data.data && data.data.chatId) || '');
                    const _map = self.__kynActiveChatByClient;
                    const _viewingThisChat = _chatId && _map && Array.from(_map.values()).some(function(v) { return v === _chatId; });
                    if (_viewingThisChat) {
                        // Confirm the client reporting it is still focused right now —
                        // the map can lag a closed/backgrounded tab by a few seconds.
                        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                        const _stillFocused = allClients.some(function(c) { return c.focused && _map.get(c.id) === _chatId; });
                        if (_stillFocused) return;
                    }
                } catch (_) { /* best-effort — fall through and notify */ }
            }
            return self.registration.showNotification(title, options);
        })()
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url)
        ? event.notification.data.url
        : '/chat.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Focus existing open tab if found
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

self.addEventListener('notificationclose', function(event) {
    // Optional: track dismissed notifications
});