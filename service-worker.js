// Service Worker for PWA Chat Application
// Version: 8.0.0 - Enhanced Dynamic Handling
// Cache Strategy: Cache-First for static assets, Network-First for HTML/API
// Design: Self-learning, future-proof, automatic endpoint discovery

const CACHE_NAME = 'moodchat-static-v8';
const OFFLINE_CACHE_NAME = 'moodchat-offline-v8';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Core static assets - only truly static files that never change
const CORE_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/moodchat-192x192.png',
  '/moodchat-512x512.png'
];

// Dynamic cache registry for discovered assets
let dynamicAssetRegistry = new Set(CORE_STATIC_ASSETS);

// NEVER cache these patterns - always go to network
const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\/login/,
  /\/register/,
  /\/logout/,
  /\/backend\//,
  /\/server\//,
  /\/socket\.io\//,
  /\/ws\//,
  /\/wss\//,
  /\/graphql/,
  /\/webhook/,
  /^https?:\/\/api\./,
  /^https?:\/\/[^\/]*:[0-9]+\//, // Any port-based URLs
  /localhost/,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/
];

// Patterns that indicate static assets
const STATIC_ASSET_PATTERNS = [
  /\.(css|js|json|png|jpg|jpeg|svg|ico|woff2|woff|ttf|webp|gif|map)$/,
  /\/icons\//,
  /\/images\//,
  /\/fonts\//,
  /\/static\//
];

// Patterns that indicate HTML content
const HTML_PATTERNS = [
  /\.html$/,
  /^\/[^\.]*$/, // Root paths without extensions
  /text\/html/
];

// Token cache and request queue for offline
let authToken = null;
const pendingRequests = [];

// Install event - cache only core static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v8.0.0 - Dynamic Handling Edition');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching core static assets...');
        
        const results = await Promise.allSettled(
          CORE_STATIC_ASSETS.map(async (asset) => {
            try {
              if (shouldNeverCache(asset)) {
                return { asset, status: 'skipped', reason: 'never-cache' };
              }
              
              const assetUrl = asset === '/' ? '/index.html' : asset;
              
              // Only fetch and cache if it's a local asset
              if (isLocalAsset(assetUrl)) {
                const response = await fetch(assetUrl, {
                  credentials: 'same-origin',
                  cache: 'no-store'
                }).catch(() => null);
                
                if (response && response.ok) {
                  await cache.put(assetUrl, response.clone());
                  dynamicAssetRegistry.add(assetUrl);
                  return { asset: assetUrl, status: 'cached' };
                }
              }
              return { asset: assetUrl, status: 'failed', reason: 'fetch-failed' };
            } catch (error) {
              return { asset, status: 'error', reason: error.message };
            }
          })
        );
        
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'cached').length;
        console.log(`[Service Worker] Installation complete. Cached ${successCount}/${CORE_STATIC_ASSETS.length} core assets`);
        
        // Skip waiting to activate immediately
        return self.skipWaiting();
      } catch (error) {
        console.warn('[Service Worker] Install error (non-blocking):', error.message);
        return self.skipWaiting();
      }
    })()
  );
});

// Activate event - clean up and claim clients
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating v8.0.0...');
  
  event.waitUntil(
    (async () => {
      try {
        // Clean up old caches
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        // Load previously discovered assets from cache
        await loadDynamicRegistry();
        
        // Claim clients immediately
        await self.clients.claim();
        console.log('[Service Worker] Clients claimed');
        console.log('[Service Worker] Dynamic registry contains', dynamicAssetRegistry.size, 'assets');
        
        // Notify clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: '8.0.0',
            timestamp: Date.now()
          });
        });
        
      } catch (error) {
        console.error('[Service Worker] Activation failed:', error);
      }
    })()
  );
});

// Load previously discovered assets from cache
async function loadDynamicRegistry() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    requests.forEach(request => {
      const url = new URL(request.url);
      if (isLocalAsset(url.pathname) && !shouldNeverCache(url.pathname)) {
        dynamicAssetRegistry.add(url.pathname);
      }
    });
    
    console.log('[Service Worker] Loaded', dynamicAssetRegistry.size, 'assets into dynamic registry');
  } catch (error) {
    console.warn('[Service Worker] Failed to load dynamic registry:', error);
  }
}

// Enhanced pattern matching
function shouldNeverCache(url) {
  if (!url || typeof url !== 'string') return false;
  
  return NEVER_CACHE_PATTERNS.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    return url.includes(pattern);
  });
}

function isStaticAsset(url) {
  if (!url || typeof url !== 'string') return false;
  
  return STATIC_ASSET_PATTERNS.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    return url.includes(pattern);
  });
}

function isHtmlRequest(url, acceptHeader) {
  if (!url || typeof url !== 'string') return false;
  
  const isHtmlPath = HTML_PATTERNS.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    return url.includes(pattern);
  });
  
  const acceptsHtml = acceptHeader && acceptHeader.includes('text/html');
  
  return isHtmlPath || acceptsHtml;
}

function isLocalAsset(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

// Dynamic request classification
function classifyRequest(request) {
  const url = request.url;
  const acceptHeader = request.headers.get('Accept');
  
  // Never cache patterns take highest priority
  if (shouldNeverCache(url)) {
    return 'NEVER_CACHE';
  }
  
  // HTML requests
  if (request.method === 'GET' && isHtmlRequest(url, acceptHeader)) {
    return 'HTML';
  }
  
  // Static assets
  if (request.method === 'GET' && isStaticAsset(url)) {
    return 'STATIC';
  }
  
  // API-like patterns
  if (url.includes('/api/') || url.includes('/auth/') || url.includes('/graphql')) {
    return 'API';
  }
  
  // Default to network-only for unknown types
  return 'NETWORK_ONLY';
}

// Enhanced fetch handler with automatic learning
async function handleFetch(event) {
  const request = event.request;
  const classification = classifyRequest(request);
  const url = request.url;
  
  console.log(`[Service Worker] ${classification}: ${url}`);
  
  switch (classification) {
    case 'NEVER_CACHE':
      return handleNeverCache(request);
      
    case 'HTML':
      return handleHtmlWithLearning(request);
      
    case 'STATIC':
      return handleStaticWithLearning(request);
      
    case 'API':
      return handleApiRequest(request);
      
    default:
      return fetch(request);
  }
}

// Handle never-cache requests
async function handleNeverCache(request) {
  console.log('[Service Worker] Network-only (never-cache):', request.url);
  return fetch(request);
}

// Handle HTML with learning capability
async function handleHtmlWithLearning(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request).catch(() => null);
    
    if (networkResponse && networkResponse.ok) {
      // Learn about this HTML page
      dynamicAssetRegistry.add(new URL(request.url).pathname);
      
      // Cache for offline use
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      
      console.log('[Service Worker] HTML cached (network-first):', request.url);
      return networkResponse;
    }
    
    // Network failed - try cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[Service Worker] HTML served from cache (offline):', request.url);
      return cachedResponse;
    }
    
    // No cache - offline fallback
    return getOfflinePage();
    
  } catch (error) {
    console.warn('[Service Worker] HTML handling error:', error.message);
    return getOfflinePage();
  }
}

// Handle static assets with learning capability
async function handleStaticWithLearning(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Check if cache is stale
    const isStale = await isCacheStale(cachedResponse);
    if (!isStale) {
      console.log('[Service Worker] Static asset from cache:', request.url);
      return cachedResponse;
    }
  }
  
  // Cache miss or stale - try network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Learn about this static asset
      dynamicAssetRegistry.add(new URL(request.url).pathname);
      
      // Update cache with fresh response
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
      
      console.log('[Service Worker] Static asset cached:', request.url);
      return networkResponse;
    }
    
    // Network failed but we have stale cache
    if (cachedResponse) {
      console.log('[Service Worker] Using stale cache (network failed):', request.url);
      return cachedResponse;
    }
    
    throw new Error('Network failed and no cache available');
    
  } catch (error) {
    // Network failed, no cache - try to serve similar asset
    return handleAssetFallback(request);
  }
}

// Check if cached response is stale
async function isCacheStale(cachedResponse) {
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

// Handle API requests with auth headers
async function handleApiRequest(request) {
  try {
    // Get auth token if available
    const token = await getAuthTokenFromClient();
    
    // Clone request and add auth header if needed
    const headers = new Headers(request.headers);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    const apiRequest = new Request(request.url, {
      method: request.method,
      headers: headers,
      mode: request.mode,
      credentials: request.credentials
    });
    
    // Copy body for non-GET requests
    if (!['GET', 'HEAD'].includes(request.method)) {
      const body = await request.arrayBuffer();
      apiRequest = new Request(request.url, {
        method: request.method,
        headers: headers,
        body: body,
        mode: request.mode,
        credentials: request.credentials
      });
    }
    
    const response = await fetch(apiRequest);
    
    // Log API call for debugging
    console.log(`[Service Worker] API: ${request.method} ${request.url} -> ${response.status}`);
    
    return response;
    
  } catch (error) {
    console.error('[Service Worker] API request failed:', error.message);
    
    // For POST/PUT/PATCH, queue for retry when online
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      await queueRequestForRetry(request.clone());
    }
    
    return new Response(JSON.stringify({
      error: 'Network error',
      offline: true,
      queued: ['POST', 'PUT', 'PATCH'].includes(request.method)
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get auth token from clients
async function getAuthTokenFromClient() {
  if (authToken) return authToken;
  
  try {
    const clients = await self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    });
    
    if (clients.length > 0) {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(null), 1000);
        
        messageChannel.port1.onmessage = (event) => {
          clearTimeout(timeoutId);
          if (event.data?.type === 'TOKEN_RESPONSE') {
            authToken = event.data.token;
            resolve(event.data.token);
          } else {
            resolve(null);
          }
        };
        
        clients[0].postMessage(
          { type: 'REQUEST_TOKEN' },
          [messageChannel.port2]
        );
      });
    }
  } catch (error) {
    console.warn('[Service Worker] Failed to get auth token:', error.message);
  }
  
  return null;
}

// Queue failed requests for retry
async function queueRequestForRetry(request) {
  try {
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now()
    };
    
    if (!['GET', 'HEAD'].includes(request.method)) {
      requestData.body = await request.text();
    }
    
    pendingRequests.push(requestData);
    
    // Store in IndexedDB for persistence
    await storePendingRequest(requestData);
    
    console.log('[Service Worker] Request queued for retry:', request.url);
    
    // Trigger sync if available
    if ('sync' in self.registration) {
      await self.registration.sync.register('retry-requests');
    }
    
  } catch (error) {
    console.warn('[Service Worker] Failed to queue request:', error);
  }
}

// Handle asset fallback
async function handleAssetFallback(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Try to find similar asset in cache
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  // Look for assets in same directory
  const similarAssets = keys.filter(key => {
    const keyUrl = new URL(key.url);
    return keyUrl.pathname.startsWith(pathname.substring(0, pathname.lastIndexOf('/')));
  });
  
  if (similarAssets.length > 0) {
    // Return first similar asset
    const fallback = await cache.match(similarAssets[0]);
    console.log('[Service Worker] Using fallback asset:', similarAssets[0].url);
    return fallback;
  }
  
  // No fallback available
  return new Response('Resource not available', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Offline page
function getOfflinePage() {
  const offlineHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - MoodChat</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
          }
          .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          }
          h1 { margin: 0 0 20px 0; font-size: 2.5em; }
          p { margin: 0 0 30px 0; opacity: 0.9; font-size: 1.1em; line-height: 1.6; }
          .buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
          }
          button {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 120px;
          }
          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div style="font-size: 4em; margin-bottom: 20px;">📶</div>
          <h1>You're Offline</h1>
          <p>Please check your internet connection and try again.</p>
          <div class="buttons">
            <button onclick="window.location.reload()">Retry</button>
            <button onclick="window.history.back()">Go Back</button>
          </div>
        </div>
      </body>
    </html>`;
  
  return new Response(offlineHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Service-Worker': 'offline'
    }
  });
}

// Main fetch event
self.addEventListener('fetch', event => {
  // Skip non-GET requests for cache handling
  if (event.request.method !== 'GET') {
    // For API-like non-GET requests, handle with auth
    if (shouldNeverCache(event.request.url) || event.request.url.includes('/api/')) {
      event.respondWith(handleApiRequest(event.request));
    } else {
      event.respondWith(fetch(event.request));
    }
    return;
  }
  
  event.respondWith(handleFetch(event));
});

// Store pending request in IndexedDB
async function storePendingRequest(requestData) {
  // Implementation for IndexedDB storage
  // This would be implemented based on your app's needs
}

// Message handling
self.addEventListener('message', event => {
  const data = event.data;
  
  if (!data?.type) return;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      break;
      
    case 'GET_CACHE_INFO':
      event.waitUntil(sendCacheInfo(event));
      break;
      
    case 'TOKEN_UPDATE':
      authToken = data.token;
      break;
      
    case 'REFRESH_HTML':
      event.waitUntil(refreshHtmlCache());
      break;
      
    case 'CHECK_HEALTH':
      event.ports?.[0]?.postMessage({
        type: 'HEALTH_RESPONSE',
        status: 'healthy',
        version: '8.0.0',
        registrySize: dynamicAssetRegistry.size,
        timestamp: Date.now()
      });
      break;
  }
});

// Clear all caches
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    
    dynamicAssetRegistry = new Set(CORE_STATIC_ASSETS);
    authToken = null;
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CACHE_CLEARED',
        timestamp: Date.now()
      });
    });
    
    console.log('[Service Worker] All caches cleared');
  } catch (error) {
    console.error('[Service Worker] Failed to clear caches:', error);
  }
}

// Send cache info to client
async function sendCacheInfo(event) {
  try {
    const cacheNames = await caches.keys();
    const cacheInfo = {};
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      cacheInfo[cacheName] = {
        count: keys.length,
        urls: keys.map(req => req.url).slice(0, 20) // Limit to 20 URLs
      };
    }
    
    event.ports[0].postMessage({
      type: 'CACHE_INFO',
      caches: cacheInfo,
      registrySize: dynamicAssetRegistry.size,
      timestamp: Date.now(),
      version: '8.0.0'
    });
  } catch (error) {
    event.ports[0].postMessage({
      type: 'CACHE_INFO',
      error: error.message
    });
  }
}

// Refresh HTML cache
async function refreshHtmlCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    for (const request of keys) {
      const url = new URL(request.url);
      if (isHtmlRequest(url.pathname, null)) {
        await cache.delete(request);
        console.log('[Service Worker] Removed HTML from cache:', request.url);
      }
    }
    
    console.log('[Service Worker] HTML cache refreshed');
  } catch (error) {
    console.warn('[Service Worker] Failed to refresh HTML cache:', error);
  }
}

// Background sync for retrying failed requests
self.addEventListener('sync', event => {
  if (event.tag === 'retry-requests') {
    console.log('[Service Worker] Retrying queued requests...');
    event.waitUntil(retryPendingRequests());
  }
});

// Retry pending requests
async function retryPendingRequests() {
  // Implementation for retrying queued requests
}

// Periodic cache cleanup
async function cleanupOldCacheEntries() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const oneWeekAgo = Date.now() - CACHE_MAX_AGE;
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          if (cachedDate < oneWeekAgo) {
            await cache.delete(request);
            const url = new URL(request.url);
            dynamicAssetRegistry.delete(url.pathname);
          }
        }
      }
    }
  } catch (error) {
    console.log('[Service Worker] Cleanup error:', error);
  }
}

// Run cleanup weekly
setInterval(cleanupOldCacheEntries, CACHE_MAX_AGE);

// Error handling
self.addEventListener('error', event => {
  console.warn('[Service Worker] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.warn('[Service Worker] Unhandled rejection:', event.reason);
  event.preventDefault();
});