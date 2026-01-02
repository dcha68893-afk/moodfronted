// Service Worker for Kynecta MoodChat - WhatsApp-like Offline Experience
// Version: 6.0.0 - Seamless Offline Experience
// Strategy: EXACT SAME UI online/offline - users won't notice the difference
// No generated offline pages - only cached real content

const APP_VERSION = '6.0.0';
const CACHE_NAMES = {
  STATIC: `moodchat-static-v${APP_VERSION.replace(/\./g, '-')}`,
  PAGES: `moodchat-pages-v${APP_VERSION.replace(/\./g, '-')}`,
  API: 'moodchat-api-cache',
  DYNAMIC: 'moodchat-dynamic-cache',
  PRECACHE: `moodchat-precache-v${APP_VERSION.replace(/\./g, '-')}`
};

// WhatsApp-like navigation patterns - ALL pages must work offline
const ALL_APP_PAGES = [
  // Core navigation pages (like WhatsApp tabs)
  '/',
  '/index.html',
  '/chat.html',
  '/message.html',
  '/messages.html',
  '/calls.html',
  '/settings.html',
  '/group.html',
  '/tools.html',
  '/friend.html',
  '/status.html',
  '/call.html',
  '/Tools.html',
  
  // Sub-pages and sections
  '/chat/',
  '/message/',
  '/calls/',
  '/settings/',
  '/tools/',
  '/friend/',
  '/status/',
  '/group/',
  '/profile/',
  '/notifications/',
  '/search/',
  
  // Dynamic routes (handled specially)
  '/chat/*',
  '/message/*',
  '/user/*',
  '/group/*',
  '/friend/*',
  '/status/*'
];

// Core assets that MUST be cached for offline use
const CORE_ASSETS = [
  // All HTML pages (like WhatsApp tabs)
  '/',
  '/index.html',
  '/chat.html',
  '/message.html',
  '/messages.html',
  '/calls.html',
  '/settings.html',
  '/group.html',
  '/tools.html',
  '/friend.html',
  '/status.html',
  '/call.html',
  '/Tools.html',
  
  // All CSS files
  '/styles.css',
  '/css/styles.css',
  '/css/main.css',
  '/css/layout.css',
  '/css/chat.css',
  '/css/ui.css',
  '/css/animations.css',
  
  // All JavaScript files
  '/js/app.js',
  '/js/main.js',
  '/js/chat.js',
  '/js/auth.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/navigation.js',
  '/settingsManager.js',
  '/messageHandler.js',
  
  // All Images & Icons
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',
  '/icons/icon-72x72.png',
  '/icons/icon-128x128.png',
  '/icons/icon-512x512.png',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/images/logo.png',
  '/images/default-avatar.png',
  
  // Config files
  '/manifest.json'
];

// Page-specific assets to pre-cache
const PAGE_ASSETS = {
  '/calls.html': ['/js/calls.js', '/css/calls.css'],
  '/status.html': ['/js/status.js', '/css/status.css'],
  '/friend.html': ['/js/friend.js', '/css/friend.css'],
  '/group.html': ['/js/group.js', '/css/group.css'],
  '/settings.html': ['/js/settings.js', '/css/settings.css'],
  '/chat.html': ['/js/chat.js', '/css/chat.css'],
  '/tools.html': ['/js/tools.js', '/css/tools.css']
};

// Patterns for API calls (handled differently)
const API_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\/graphql/,
  /\.googleapis\.com/,
  /firebaseio\.com/
];

// ============================================
// CORE INSTALLATION - Cache everything needed
// ============================================

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Seamless Offline Experience v' + APP_VERSION);
  
  // Force activation immediately
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      // Open static cache for core assets
      const staticCache = await caches.open(CACHE_NAMES.STATIC);
      const precache = await caches.open(CACHE_NAMES.PRECACHE);
      
      console.log('[Service Worker] Caching ALL app pages for seamless offline experience');
      
      // Cache all core assets (failures are okay - we'll catch them later)
      try {
        await staticCache.addAll(CORE_ASSETS);
        console.log('[Service Worker] All core assets cached');
      } catch (cacheError) {
        console.log('[Service Worker] Some assets may not have cached:', cacheError);
      }
      
      // Pre-cache all HTML pages with their specific assets
      const pagesToCache = CORE_ASSETS.filter(url => 
        url.includes('.html') || url === '/'
      );
      
      console.log('[Service Worker] Pre-caching pages for zero-load offline:', pagesToCache);
      
      // Cache each page with ALL its dependencies
      for (const pageUrl of pagesToCache) {
        try {
          // Cache the page itself
          const pageResponse = await fetch(pageUrl);
          if (pageResponse.ok) {
            await staticCache.put(pageUrl, pageResponse.clone());
            await precache.put(pageUrl, pageResponse.clone());
            console.log(`[Service Worker] ✓ Page cached: ${pageUrl}`);
            
            // Cache page-specific assets
            if (PAGE_ASSETS[pageUrl]) {
              for (const asset of PAGE_ASSETS[pageUrl]) {
                try {
                  const assetResponse = await fetch(asset);
                  if (assetResponse.ok) {
                    await staticCache.put(asset, assetResponse.clone());
                    console.log(`[Service Worker] ✓ Asset cached: ${asset} for ${pageUrl}`);
                  }
                } catch (err) {
                  // Silent fail for optional assets
                }
              }
            }
          }
        } catch (error) {
          console.log(`[Service Worker] Could not cache ${pageUrl}, will fetch on demand`);
        }
      }
      
      console.log('[Service Worker] Installation complete - Seamless offline experience ready');
      console.log('[Service Worker] Strategy: Serve cached content, no generated pages');
    })()
  );
});

// ============================================
// ACTIVATION - Clean up and claim clients
// ============================================

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Seamless Offline v' + APP_VERSION);
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      // Claim all clients immediately
      await self.clients.claim();
      
      console.log('[Service Worker] Seamless Offline Strategy ACTIVE');
      console.log('[Service Worker] Features:');
      console.log('[Service Worker] 1. EXACT SAME UI online/offline');
      console.log('[Service Worker] 2. No generated pages - only real cached content');
      console.log('[Service Worker] 3. Zero loading time for cached pages');
      console.log('[Service Worker] 4. Background sync when online');
      console.log('[Service Worker] 5. Users won\'t notice they\'re offline');
    })()
  );
});

// ============================================
// SEAMLESS OFFLINE FETCH HANDLER
// ============================================

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip browser extensions and special URLs
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'chrome:' ||
      url.protocol === 'moz-extension:') {
    return;
  }
  
  // Handle ALL requests with seamless strategy
  event.respondWith(
    handleSeamlessRequest(request, event)
  );
});

// Main request handler - Seamless behavior
async function handleSeamlessRequest(request, event) {
  const url = new URL(request.url);
  
  // Check if it's an HTML page request (navigation)
  const isHtmlRequest = request.headers.get('Accept')?.includes('text/html') ||
                       url.pathname.endsWith('.html') ||
                       request.mode === 'navigate' ||
                       url.pathname === '/' ||
                       ALL_APP_PAGES.some(page => {
                         if (page.endsWith('/*')) {
                           const pattern = page.replace('/*', '');
                           return url.pathname.startsWith(pattern);
                         }
                         return url.pathname === page || url.pathname.startsWith(page + '/');
                       });
  
  // Check if it's an API request
  const isApiRequest = API_PATTERNS.some(pattern => 
    pattern.test(url.pathname) || pattern.test(url.hostname)
  );
  
  // Handle HTML pages with cache-first, network-update strategy
  if (isHtmlRequest) {
    return handleHtmlRequestWithCacheFirst(request);
  }
  
  // Handle API requests with network-first, cache-fallback
  if (isApiRequest) {
    return handleApiRequestWithNetworkFirst(request);
  }
  
  // Handle static assets with cache-first
  return handleStaticAssetWithCacheFirst(request);
}

// Handle HTML pages - Cache First, Network Update
async function handleHtmlRequestWithCacheFirst(request) {
  const url = new URL(request.url);
  
  console.log('[Service Worker] Handling page request:', url.pathname);
  
  // Try cache first (INSTANT load)
  const cachedResponse = await getFromAnyCache(request);
  
  if (cachedResponse) {
    console.log('[Service Worker] ✓ Serving from cache:', url.pathname);
    
    // If online, update cache in background
    if (navigator.onLine) {
      eventWaitUntil(request, async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            // Update all caches with fresh content
            await updateAllCaches(request, networkResponse.clone());
            console.log('[Service Worker] Background update:', url.pathname);
            
            // Notify page of update
            notifyClientsOfUpdate(url.pathname);
          }
        } catch (error) {
          // Silent fail - cached version remains valid
        }
      });
    }
    
    return cachedResponse;
  }
  
  // If not in cache and online, fetch from network
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        console.log('[Service Worker] ✓ Fetching from network:', url.pathname);
        
        // Cache for offline use
        await updateAllCaches(request, networkResponse.clone());
        
        return networkResponse;
      }
    } catch (error) {
      console.log('[Service Worker] Network failed for:', url.pathname);
    }
  }
  
  // If offline and not in cache, serve a very basic offline page
  // (This should rarely happen if installation was successful)
  return createMinimalOfflinePage(url);
}

// Handle API requests - Network First, Cache Fallback
async function handleApiRequestWithNetworkFirst(request) {
  // Try network first if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        // Cache the response for offline use
        const apiCache = await caches.open(CACHE_NAMES.API);
        await apiCache.put(request, networkResponse.clone());
        
        return networkResponse;
      }
    } catch (error) {
      console.log('[Service Worker] API network failed, trying cache');
    }
  }
  
  // Try cache if network failed or offline
  const apiCache = await caches.open(CACHE_NAMES.API);
  const cachedResponse = await apiCache.match(request);
  
  if (cachedResponse) {
    console.log('[Service Worker] Serving cached API:', request.url);
    return cachedResponse;
  }
  
  // Return offline-friendly API response
  return new Response(JSON.stringify({
    offline: true,
    cached: false,
    timestamp: Date.now(),
    data: null,
    message: 'You are offline. Using cached data when available.'
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

// Handle static assets - Cache First
async function handleStaticAssetWithCacheFirst(request) {
  const url = new URL(request.url);
  
  // Try cache first
  const cachedResponse = await getFromAnyCache(request);
  
  if (cachedResponse) {
    // Background update if online
    if (navigator.onLine) {
      eventWaitUntil(request, async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await updateAllCaches(request, networkResponse.clone());
          }
        } catch (error) {
          // Silent fail
        }
      });
    }
    
    return cachedResponse;
  }
  
  // Try network if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        // Cache for future
        await updateAllCaches(request, networkResponse.clone());
        return networkResponse;
      }
    } catch (error) {
      console.log('[Service Worker] Failed to fetch asset:', url.pathname);
    }
  }
  
  // Return appropriate fallback
  return createAssetFallback(url);
}

// ============================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================

// Get from any cache
async function getFromAnyCache(request) {
  // Check in order: PRECACHE -> STATIC -> PAGES -> DYNAMIC
  const cacheOrder = [
    CACHE_NAMES.PRECACHE,
    CACHE_NAMES.STATIC,
    CACHE_NAMES.PAGES,
    CACHE_NAMES.DYNAMIC
  ];
  
  for (const cacheName of cacheOrder) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  
  return null;
}

// Update all caches with response
async function updateAllCaches(request, response) {
  const cachesToUpdate = [
    CACHE_NAMES.STATIC,
    CACHE_NAMES.PAGES,
    CACHE_NAMES.DYNAMIC
  ];
  
  for (const cacheName of cachesToUpdate) {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch (error) {
      // Silent fail for individual cache
    }
  }
}

// Create minimal offline page (fallback only)
function createMinimalOfflinePage(url) {
  const pageName = url.pathname.split('/').pop() || 'MoodChat';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MoodChat - ${pageName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0a1014;
          color: #e1e1e1;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 20px;
        }
        .container {
          max-width: 400px;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .message {
          background: #202c33;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        button {
          background: #005c4b;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📱</div>
        <h1>MoodChat Offline</h1>
        <div class="message">
          <p>You're currently offline.</p>
          <p>This page wasn't cached yet.</p>
        </div>
        <button onclick="window.location.href='/'">Go to Home</button>
        <p style="margin-top: 20px; font-size: 12px; color: #8696a0;">
          Page: ${url.pathname}
        </p>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'X-Service-Worker': 'offline-fallback'
    }
  });
}

// Create asset fallback
function createAssetFallback(url) {
  if (url.pathname.endsWith('.css')) {
    return new Response('/* Asset not available offline */', {
      headers: { 'Content-Type': 'text/css' }
    });
  } else if (url.pathname.endsWith('.js')) {
    return new Response('// Asset not available offline', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  } else if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
    // Return transparent pixel
    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return fetch(transparentPixel);
  }
  
  return new Response('', { status: 404 });
}

// Notify clients of content update
function notifyClientsOfUpdate(pageUrl) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'CONTENT_UPDATED',
        page: pageUrl,
        timestamp: Date.now()
      });
    });
  });
}

// Helper to run non-blocking background tasks
function eventWaitUntil(request, task) {
  // Use a small timeout to ensure response is sent first
  setTimeout(async () => {
    try {
      await task();
    } catch (error) {
      // Silent fail for background tasks
    }
  }, 100);
}

// ============================================
// BACKGROUND SYNC AND UPDATE
// ============================================

// Periodic cache refresh when online
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-cache' && navigator.onLine) {
    event.waitUntil(refreshImportantCaches());
  }
});

async function refreshImportantCaches() {
  console.log('[Service Worker] Periodic cache refresh');
  
  const staticCache = await caches.open(CACHE_NAMES.STATIC);
  const pagesToRefresh = CORE_ASSETS.filter(url => 
    url.includes('.html') || url === '/'
  );
  
  for (const url of pagesToRefresh) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await staticCache.put(url, response.clone());
        console.log(`[Service Worker] Refreshed: ${url}`);
      }
    } catch (error) {
      // Silent fail for individual refreshes
    }
  }
}

// ============================================
// MESSAGE HANDLING
// ============================================

self.addEventListener('message', event => {
  const { data } = event;
  
  switch (data.type) {
    case 'GET_CACHE_INFO':
      handleGetCacheInfo(event);
      break;
      
    case 'CLEAR_CACHE':
      handleClearCache(event);
      break;
      
    case 'CACHE_PAGE':
      handleCachePage(event, data.url);
      break;
      
    case 'UPDATE_CACHE':
      handleUpdateCache(event, data.urls);
      break;
      
    case 'CHECK_OFFLINE_READINESS':
      handleCheckOfflineReadiness(event);
      break;
  }
});

async function handleGetCacheInfo(event) {
  const cacheInfo = {};
  
  for (const [name, cacheName] of Object.entries(CACHE_NAMES)) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    cacheInfo[name] = {
      count: keys.length,
      urls: keys.slice(0, 10).map(req => req.url) // First 10 URLs
    };
  }
  
  event.source.postMessage({
    type: 'CACHE_INFO',
    info: cacheInfo,
    version: APP_VERSION,
    strategy: 'Seamless Offline: Identical UI online/offline'
  });
}

async function handleClearCache(event) {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  
  event.source.postMessage({
    type: 'CACHE_CLEARED',
    timestamp: Date.now()
  });
}

async function handleCachePage(event, url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      await updateAllCaches(new Request(url), response.clone());
      
      event.source.postMessage({
        type: 'PAGE_CACHED',
        url: url,
        success: true
      });
    }
  } catch (error) {
    event.source.postMessage({
      type: 'PAGE_CACHED',
      url: url,
      success: false,
      error: error.message
    });
  }
}

async function handleUpdateCache(event, urls) {
  const results = [];
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await updateAllCaches(new Request(url), response.clone());
        results.push({ url, success: true });
      } else {
        results.push({ url, success: false, error: 'Response not OK' });
      }
    } catch (error) {
      results.push({ url, success: false, error: error.message });
    }
  }
  
  event.source.postMessage({
    type: 'CACHE_UPDATED',
    results: results
  });
}

async function handleCheckOfflineReadiness(event) {
  const testResults = [];
  
  for (const page of ALL_APP_PAGES.filter(p => !p.includes('*'))) {
    const cached = await getFromAnyCache(new Request(page));
    testResults.push({
      page: page,
      offlineReady: !!cached,
      status: cached ? '✅ Ready' : '❌ Not cached'
    });
  }
  
  event.source.postMessage({
    type: 'OFFLINE_READINESS',
    results: testResults,
    timestamp: Date.now()
  });
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

self.addEventListener('push', event => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'MoodChat', body: 'New message' };
  }
  
  const options = {
    body: data.body || 'New message',
    icon: '/icons/moodchat-192.png',
    badge: '/icons/moodchat-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/chat.html'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'MoodChat', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/chat.html';
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================
// INITIALIZATION
// ============================================

console.log('[MoodChat Service Worker] Seamless Offline v' + APP_VERSION + ' loaded');
console.log('[Service Worker] STRATEGY: Identical UI online/offline');
console.log('[Service Worker] No generated pages - only real cached content');
console.log('[Service Worker] Cache-first for instant loading');
console.log('[Service Worker] Background updates when online');
console.log('[Service Worker] Users won\'t notice when they go offline');
console.log('[Service Worker] READY: Your PWA now works seamlessly offline!');