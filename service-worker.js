// Service Worker for PWA Chat Application
// Version: 9.0.0 - PERMANENTLY SAFE EDITION
// Cache Strategy: Cache-First ONLY for static assets
// Design: Zero API interference, future-proof, authentication-safe

const CACHE_NAME = 'moodchat-static-v9';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const CORE_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/moodchat-192x192.png',
  '/moodchat-512x512.png',
  '/api.js',
  '/Tool.css',
  '/Tool.js',
  '/group.js'
];

const STATIC_ASSET_PATTERNS = [
  /\.(css|js|json|png|jpg|jpeg|svg|ico|woff2|woff|ttf|webp|gif|map)$/i,
  /\/icons\//i,
  /\/images\//i,
  /\/fonts\//i,
  /\/static\//i
];

const BYPASS_PATTERNS = [
  /\/api\//i,
  /\/auth\//i,
  /\/login/i,
  /\/register/i,
  /\/logout/i,
  /\/backend\//i,
  /\/server\//i,
  /\/socket\.io\//i,
  /\/ws\//i,
  /\/wss\//i,
  /\/graphql/i,
  /\/webhook/i,
  /^https?:\/\/api\./i
];

const HTML_NAVIGATION_PATTERNS = [
  /\.html$/i,
  /^\/[^\.]*$/i,
  /\/login$/i,
  /\/register$/i,
  /\/logout$/i
];

// Track logged bypass requests to avoid repeated logs
const loggedBypasses = new Set();
const loggedCacheHits = new Set();

// ========== CRITICAL SAFETY GUARDS ==========

function mustBypassCompletely(request) {
  const url = request.url;
  const requestKey = `${request.method}:${url}`;
  
  // 🚫 NEVER intercept navigation requests
  if (request.mode === 'navigate') {
    if (!loggedBypasses.has(requestKey)) {
      console.log('[Service Worker] Bypassing (navigation request):', url);
      loggedBypasses.add(requestKey);
    }
    return true;
  }
  
  // 🚫 NEVER intercept HTML documents
  if (request.destination === 'document') {
    if (!loggedBypasses.has(requestKey)) {
      console.log('[Service Worker] Bypassing (document request):', url);
      loggedBypasses.add(requestKey);
    }
    return true;
  }
  
  // 🚫 NEVER intercept HTML files or iframe pages
  if (HTML_NAVIGATION_PATTERNS.some(pattern => pattern.test(url))) {
    if (!loggedBypasses.has(requestKey)) {
      console.log('[Service Worker] Bypassing (HTML/route):', url);
      loggedBypasses.add(requestKey);
    }
    return true;
  }
  
  // 🚫 NEVER cache non-GET requests
  if (request.method !== 'GET') {
    if (!loggedBypasses.has(requestKey)) {
      console.log('[Service Worker] Bypassing (non-GET):', url);
      loggedBypasses.add(requestKey);
    }
    return true;
  }
  
  // 🚫 NEVER cache API/auth requests
  if (BYPASS_PATTERNS.some(pattern => pattern.test(url))) {
    if (!loggedBypasses.has(requestKey)) {
      console.log('[Service Worker] Bypassing (API/auth):', url);
      loggedBypasses.add(requestKey);
    }
    return true;
  }
  
  return false;
}

function isStaticAsset(url) {
  if (!url || typeof url !== 'string') return false;
  
  return STATIC_ASSET_PATTERNS.some(pattern => pattern.test(url));
}

function isLocalAsset(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

// Check if response is already cached
function isAlreadyCached(request, cache) {
  return cache.match(request).then(response => !!response);
}

// ========== SAFE REQUEST HANDLER ==========

async function handleApiRequest(request) {
  // 🛡️ Clone request body ONLY ONCE
  let requestToFetch = request;
  if (request.body) {
    requestToFetch = request.clone();
  }
  
  try {
    const response = await fetch(requestToFetch);
    
    // 🛡️ NEVER treat auth errors as offline
    if (response.status === 401 || response.status === 403) {
      return response;
    }
    
    // 🛡️ Preserve authorization headers
    if (request.headers.has('Authorization')) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Authorization', request.headers.get('Authorization'));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
    
    return response;
  } catch (error) {
    // 🛡️ Return clean error for API failures
    return new Response(JSON.stringify({
      error: 'Network request failed',
      online: navigator.onLine
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const requestKey = request.url;
  
  // Check if already cached to avoid double caching
  const alreadyCached = await isAlreadyCached(request, cache);
  
  if (alreadyCached) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      const isStale = isCacheStale(cachedResponse);
      if (!isStale) {
        if (!loggedCacheHits.has(requestKey)) {
          console.log('[Service Worker] Static asset from cache:', request.url);
          loggedCacheHits.add(requestKey);
        }
        return cachedResponse;
      }
    }
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Only cache if not already cached to avoid repeated fetches
      if (!alreadyCached) {
        await cache.put(request, networkResponse.clone());
        console.log('[Service Worker] Static asset cached:', request.url);
      }
      return networkResponse;
    }
    
    // If network fails but we have cache, use it
    if (alreadyCached) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log('[Service Worker] Using stale cache (network failed):', request.url);
        return cachedResponse;
      }
    }
    
    throw new Error('Network failed and no cache available');
    
  } catch (error) {
    // 🛡️ Return minimal error response for static assets only
    return new Response('Resource not available', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

function isCacheStale(cachedResponse) {
  try {
    const dateHeader = cachedResponse.headers.get('date');
    if (!dateHeader) return false;
    
    const cacheTime = new Date(dateHeader).getTime();
    const age = Date.now() - cacheTime;
    
    return age > CACHE_MAX_AGE;
  } catch (error) {
    return false;
  }
}

// ========== SERVICE WORKER EVENTS ==========

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v9.0.0 - PERMANENTLY SAFE EDITION');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching core static assets...');
        
        const cachePromises = CORE_STATIC_ASSETS.map(async (asset) => {
          try {
            const assetUrl = asset === '/' ? '/index.html' : asset;
            
            if (isLocalAsset(assetUrl)) {
              // 🛡️ Skip caching if it's HTML navigation or iframe page
              if (HTML_NAVIGATION_PATTERNS.some(pattern => pattern.test(assetUrl))) {
                return { asset: assetUrl, status: 'skipped', reason: 'html-navigation' };
              }
              
              // Check if already cached to avoid double caching
              const alreadyCached = await isAlreadyCached(assetUrl, cache);
              if (alreadyCached) {
                return { asset: assetUrl, status: 'already-cached' };
              }
              
              const response = await fetch(assetUrl, {
                credentials: 'same-origin',
                cache: 'no-store'
              }).catch(() => null);
              
              if (response && response.ok) {
                await cache.put(assetUrl, response.clone());
                return { asset: assetUrl, status: 'cached' };
              }
            }
            return { asset: assetUrl, status: 'failed', reason: 'fetch-failed' };
          } catch (error) {
            return { asset, status: 'error', reason: error.message };
          }
        });
        
        const results = await Promise.allSettled(cachePromises);
        const successCount = results.filter(r => 
          r.status === 'fulfilled' && r.value && 
          (r.value.status === 'cached' || r.value.status === 'already-cached')
        ).length;
        
        console.log(`[Service Worker] Installation complete. ${successCount}/${CORE_STATIC_ASSETS.length} core assets available in cache`);
        
        return self.skipWaiting();
      } catch (error) {
        console.warn('[Service Worker] Install error (non-blocking):', error.message);
        return self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating v9.0.0 - PERMANENTLY SAFE EDITION');
  
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        await self.clients.claim();
        console.log('[Service Worker] Clients claimed');
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: '9.0.0',
            safeMode: true,
            timestamp: Date.now()
          });
        });
        
      } catch (error) {
        console.error('[Service Worker] Activation failed:', error);
      }
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;
  
  // Clear old logs periodically to prevent memory buildup
  if (loggedBypasses.size > 1000) loggedBypasses.clear();
  if (loggedCacheHits.size > 1000) loggedCacheHits.clear();
  
  // 🛡️ CRITICAL: Apply all bypass guards first
  if (mustBypassCompletely(request)) {
    // For API endpoints with authorization, preserve headers
    if (BYPASS_PATTERNS.some(pattern => pattern.test(url))) {
      event.respondWith(handleApiRequest(request));
    } else {
      event.respondWith(fetch(request));
    }
    return;
  }
  
  // 🛡️ ONLY handle local static assets
  if (!isLocalAsset(url) || !isStaticAsset(url)) {
    event.respondWith(fetch(request));
    return;
  }
  
  // 🛡️ Handle static assets only
  event.respondWith(handleStaticAsset(request));
});

// ========== MESSAGE HANDLING ==========

self.addEventListener('message', event => {
  const data = event.data;
  
  if (!data?.type) return;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        (async () => {
          try {
            await caches.delete(CACHE_NAME);
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'CACHE_CLEARED',
                timestamp: Date.now()
              });
            });
            console.log('[Service Worker] Cache cleared');
          } catch (error) {
            console.error('[Service Worker] Failed to clear cache:', error);
          }
        })()
      );
      break;
      
    case 'GET_CACHE_INFO':
      event.waitUntil(
        (async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();
            
            event.ports?.[0]?.postMessage({
              type: 'CACHE_INFO',
              count: keys.length,
              version: '9.0.0',
              timestamp: Date.now(),
              safeMode: true
            });
          } catch (error) {
            event.ports?.[0]?.postMessage({
              type: 'CACHE_INFO',
              error: error.message
            });
          }
        })()
      );
      break;
      
    case 'CHECK_HEALTH':
      event.ports?.[0]?.postMessage({
        type: 'HEALTH_RESPONSE',
        status: 'healthy',
        version: '9.0.0',
        safeMode: true,
        timestamp: Date.now()
      });
      break;
      
    case 'CLEAR_LOGS':
      loggedBypasses.clear();
      loggedCacheHits.clear();
      console.log('[Service Worker] Logs cleared');
      break;
  }
});

// ========== MAINTENANCE ==========

async function cleanupOldCacheEntries() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const oneWeekAgo = Date.now() - CACHE_MAX_AGE;
    let cleanedCount = 0;
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          if (cachedDate < oneWeekAgo) {
            await cache.delete(request);
            cleanedCount++;
          }
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[Service Worker] Cleaned ${cleanedCount} old cache entries`);
    }
  } catch (error) {
    console.log('[Service Worker] Cleanup error:', error);
  }
}

setInterval(cleanupOldCacheEntries, CACHE_MAX_AGE);

self.addEventListener('error', event => {
  console.warn('[Service Worker] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.warn('[Service Worker] Unhandled rejection:', event.reason);
  event.preventDefault();
});

console.log('[Service Worker] v9.0.0 loaded - PERMANENTLY SAFE MODE ACTIVE');