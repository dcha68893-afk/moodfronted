// Service Worker for PWA Chat Application
// Version: 7.0.1 - Static Assets Only, No API Interference
// Cache Strategy: Cache-First for static assets ONLY, Network-Only for all API/backend

const CACHE_NAME = 'moodchat-static-v7';
const OFFLINE_CACHE_NAME = 'moodchat-offline-v7';

// Static assets only - local files that should be cached
const STATIC_ASSETS = [
  // Core HTML files
  '/',
  '/index.html',
  '/chat.html',
  '/status.html',
  '/friend.html',
  '/group.html',
  '/calls.html',
  '/Tools.html',
  '/settings.html',
  
  // CSS files (local only)
  '/layout.css',
  '/chat.css',
  '/group.css',
  
  // JavaScript files (local app files only)
  '/js/app.js',
  '/chat.js',
  
  // Manifest and icons (local only)
  '/manifest.json',
  '/moodchat-192x192.png',
  '/moodchat-512x512.png',
  
  // Optional static assets
  '/apple-touch-icon.png',
  '/images/logo.svg',
  '/images/avatar-placeholder.png',
  '/images/chat-bg.jpg',
  '/icons/send.svg',
  '/icons/menu.svg',
  '/icons/search.svg',
  '/icons/settings.svg'
];

// NEVER cache these - ALWAYS go directly to network
const NEVER_CACHE_PATTERNS = [
  '/api/',
  '/auth/',
  '/login',
  '/register',
  '/logout',
  '/backend/',
  '/server/',
  '/socket.io/',
  '/ws/',
  '/wss/',
  'https://api.',
  'http://api.',
  ':3000',
  ':5000',
  ':8000',
  ':8080',
  'localhost',
  '127.0.0.1',
  '0.0.0.0'
];

// Install event - cache static assets only
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v7.0.1 - Static Assets Only');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching static assets only...');
        
        const cachePromises = STATIC_ASSETS.map(async (asset) => {
          try {
            // Skip if asset contains never-cache patterns
            if (containsNeverCachePattern(asset)) {
              console.log('[Service Worker] Skipping never-cache asset:', asset);
              return { asset, success: false, reason: 'never-cache-pattern' };
            }
            
            // Handle root path
            const assetUrl = asset === '/' ? '/index.html' : asset;
            
            // Skip invalid URLs
            if (!isValidLocalUrl(assetUrl)) {
              console.log('[Service Worker] Skipping invalid URL:', assetUrl);
              return { asset: assetUrl, success: false, reason: 'invalid-url' };
            }
            
            // Skip HTML files from initial cache - they'll use network-first strategy
            if (assetUrl.endsWith('.html') || asset === '/') {
              console.log('[Service Worker] Skipping HTML from initial cache (network-first):', assetUrl);
              return { asset: assetUrl, success: false, reason: 'html-network-first' };
            }
            
            // Fetch the asset
            const response = await fetch(assetUrl, {
              credentials: 'same-origin',
              // Non-blocking: don't fail entire installation if one asset fails
              mode: 'no-cors'
            }).catch(error => {
              console.warn(`[Service Worker] Fetch failed for ${assetUrl}:`, error.message);
              return null;
            });
            
            // Only cache if response is OK and not an API endpoint
            if (response && response.ok && response.status === 200) {
              await cache.put(asset === '/' ? '/' : assetUrl, response);
              console.log(`[Service Worker] Cached: ${assetUrl}`);
              return { asset: assetUrl, success: true };
            } else {
              const status = response ? response.status : 'no-response';
              console.warn(`[Service Worker] Failed to cache ${assetUrl}: Status ${status}`);
              return { asset: assetUrl, success: false, reason: `status-${status}` };
            }
          } catch (error) {
            // NON-BLOCKING: Log error but don't throw
            console.warn(`[Service Worker] Failed to cache ${asset}:`, error.message);
            return { asset, success: false, reason: error.message };
          }
        });
        
        const results = await Promise.allSettled(cachePromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success === true).length;
        const failedAssets = results
          .filter(r => r.status === 'fulfilled' && r.value.success === false)
          .map(r => r.value);
        
        console.log(`[Service Worker] Installation complete. Cached ${successCount}/${STATIC_ASSETS.length} assets`);
        
        if (failedAssets.length > 0) {
          console.log('[Service Worker] Failed assets:', failedAssets.map(f => `${f.asset} (${f.reason})`).join(', '));
        }
        
        return self.skipWaiting();
      } catch (error) {
        // NON-BLOCKING: Log error but don't fail installation
        console.error('[Service Worker] Install failed:', error);
        return self.skipWaiting();
      }
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating v7.0.1...');
  
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
        
        // Claim clients immediately
        await self.clients.claim();
        console.log('[Service Worker] Clients claimed');
        
        // Notify clients that service worker is ready
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: '7.0.1',
            timestamp: Date.now()
          });
        });
        
      } catch (error) {
        console.error('[Service Worker] Activation failed:', error);
      }
    })()
  );
});

// Check if URL contains never-cache patterns
function containsNeverCachePattern(url) {
  if (!url || typeof url !== 'string') return false;
  
  return NEVER_CACHE_PATTERNS.some(pattern => {
    return url.includes(pattern);
  });
}

// Check if URL is a valid local URL
function isValidLocalUrl(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

// Check if request is for static asset
function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return false;
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return false;
  
  // Check if URL contains never-cache patterns
  if (containsNeverCachePattern(request.url)) return false;
  
  // Check file extension
  const extension = url.pathname.split('.').pop().toLowerCase();
  const staticExtensions = ['css', 'js', 'json', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff2', 'woff', 'ttf', 'webp', 'gif'];
  
  return staticExtensions.includes(extension);
}

// Check if request is for HTML file
function isHtmlRequest(request) {
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return false;
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return false;
  
  // Check if URL contains never-cache patterns
  if (containsNeverCachePattern(request.url)) return false;
  
  // Check file extension
  const extension = url.pathname.split('.').pop().toLowerCase();
  const isHtml = extension === 'html' || request.headers.get('Accept')?.includes('text/html');
  
  return isHtml;
}

// Handle static asset requests with cache-first strategy
async function handleStaticAsset(request) {
  try {
    // First, try to get from cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[Service Worker] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // If not in cache, fetch from network
    const networkResponse = await fetch(request).catch(error => {
      console.warn('[Service Worker] Network fetch failed for:', request.url, error.message);
      return null;
    });
    
    // If network fetch succeeded and should be cached
    if (networkResponse && 
        networkResponse.ok && 
        networkResponse.status === 200 && 
        !containsNeverCachePattern(request.url)) {
      
      // Clone the response before caching
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
      console.log('[Service Worker] Cached new asset:', request.url);
      return networkResponse;
    }
    
    // If network fetch failed or shouldn't be cached, return network response if available
    if (networkResponse) {
      console.log('[Service Worker] Returning network response (not cached):', request.url);
      return networkResponse;
    }
    
    // If network failed and no cache, handle gracefully
    console.warn('[Service Worker] Cache miss and network failed for:', request.url);
    
    // For other assets, return a minimal error response without throwing
    return new Response('Resource not available', {
      status: 404,
      statusText: 'Not Found',
      headers: { 
        'Content-Type': 'text/plain',
        'X-Cache-Status': 'miss'
      }
    });
    
  } catch (error) {
    // NON-BLOCKING: Log error but don't throw
    console.warn('[Service Worker] Failed to handle static asset:', request.url, error.message);
    
    // For other assets, return a minimal error response
    return new Response('', {
      status: 500,
      headers: { 
        'Content-Type': 'text/plain',
        'X-Error': 'Service worker error'
      }
    });
  }
}

// Handle HTML requests with network-first strategy
async function handleHtmlRequest(request) {
  console.log('[Service Worker] Network-first for HTML:', request.url);
  
  try {
    // FIRST: Try to fetch from network
    const networkResponse = await fetch(request).catch(error => {
      console.warn('[Service Worker] Network fetch failed for HTML:', request.url, error.message);
      return null;
    });
    
    // If network fetch succeeded
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      
      // Clone the response before caching
      const responseToCache = networkResponse.clone();
      
      // Cache the fresh HTML for offline use
      await cache.put(request, responseToCache);
      console.log('[Service Worker] Updated HTML in cache:', request.url);
      
      return networkResponse;
    }
    
    // Network failed or returned error - try cache
    console.log('[Service Worker] Network failed, trying cache for:', request.url);
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[Service Worker] Serving HTML from cache (offline):', request.url);
      return cachedResponse;
    }
    
    // No cache available - return offline page
    console.log('[Service Worker] No cached HTML, showing offline page:', request.url);
    return getOfflinePage();
    
  } catch (error) {
    // NON-BLOCKING: Log error and return offline page
    console.warn('[Service Worker] Error handling HTML request:', request.url, error.message);
    return getOfflinePage();
  }
}

// Get offline page for HTML requests
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
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
          h1 {
            margin: 0 0 20px 0;
            font-size: 2.5em;
          }
          p {
            margin: 0 0 30px 0;
            opacity: 0.9;
            font-size: 1.1em;
            line-height: 1.6;
          }
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
          button:active {
            transform: translateY(0);
          }
          .icon {
            font-size: 4em;
            margin-bottom: 20px;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">📶</div>
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
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Service-Worker': 'offline'
    }
  });
}

// CRITICAL: Main fetch event handler - API requests bypass cache completely
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;
  
  // CRITICAL REQUIREMENT: NEVER cache API requests - always fetch from network
  // This ensures auth and API requests are NEVER interfered with
  if (url.includes('/api/') || containsNeverCachePattern(url)) {
    console.log('[Service Worker] Bypassing cache for API/Auth:', url);
    event.respondWith(fetch(request));
    return;
  }
  
  // CRITICAL: Skip all non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    console.log('[Service Worker] Bypassing cache for non-GET:', request.method, url);
    event.respondWith(fetch(request));
    return;
  }
  
  // CRITICAL: Skip all auth-related requests
  if (url.includes('/auth/') || 
      url.includes('/login') || 
      url.includes('/register') || 
      url.includes('/logout')) {
    console.log('[Service Worker] Bypassing cache for auth:', url);
    event.respondWith(fetch(request));
    return;
  }
  
  // CRITICAL: Skip backend, server, and socket requests
  if (url.includes('/backend/') || 
      url.includes('/server/') || 
      url.includes('/socket.io/') || 
      url.includes('/ws/') || 
      url.includes('/wss/')) {
    console.log('[Service Worker] Bypassing cache for backend:', url);
    event.respondWith(fetch(request));
    return;
  }
  
  // Handle HTML requests with NETWORK-FIRST strategy
  if (isHtmlRequest(request)) {
    console.log('[Service Worker] Handling HTML (network-first):', url);
    event.respondWith(handleHtmlRequest(request));
    return;
  }
  
  // Handle static asset requests with CACHE-FIRST strategy
  if (isStaticAssetRequest(request)) {
    console.log('[Service Worker] Handling static asset (cache-first):', url);
    event.respondWith(handleStaticAsset(request));
    return;
  }
  
  // For all other requests, let them go to network (no caching)
  console.log('[Service Worker] Passing through to network:', url);
});

// Handle push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New message',
      icon: '/moodchat-192x192.png',
      badge: '/moodchat-192x192.png',
      tag: data.tag || 'chat-message',
      data: data.data || { url: '/chat.html' },
      requireInteraction: data.important || false
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'MoodChat', options)
    );
  } catch (error) {
    console.log('[Service Worker] Push notification error:', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  const urlToOpen = notificationData.url || '/chat.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Look for existing chat window
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle messages from main app
self.addEventListener('message', event => {
  const data = event.data;
  
  if (!data || !data.type) return;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      console.log('[Service Worker] Skipping waiting...');
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      console.log('[Service Worker] Clearing cache...');
      event.waitUntil(
        (async () => {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          
          // Notify clients
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'CACHE_CLEARED',
              timestamp: Date.now()
            });
          });
        })()
      );
      break;
      
    case 'GET_CACHE_INFO':
      event.waitUntil(
        (async () => {
          try {
            const cacheNames = await caches.keys();
            const cacheInfo = {};
            
            for (const cacheName of cacheNames) {
              const cache = await caches.open(cacheName);
              const keys = await cache.keys();
              cacheInfo[cacheName] = {
                count: keys.length,
                urls: keys.map(req => req.url)
              };
            }
            
            event.ports[0].postMessage({
              type: 'CACHE_INFO',
              caches: cacheInfo,
              timestamp: Date.now(),
              version: '7.0.1'
            });
          } catch (error) {
            event.ports[0].postMessage({
              type: 'CACHE_INFO',
              error: error.message,
              timestamp: Date.now()
            });
          }
        })()
      );
      break;
      
    case 'CHECK_HEALTH':
      event.ports[0].postMessage({
        type: 'HEALTH_RESPONSE',
        status: 'healthy',
        version: '7.0.1',
        timestamp: Date.now()
      });
      break;
      
    case 'CHECK_ONLINE_STATUS':
      event.ports[0].postMessage({
        type: 'ONLINE_STATUS',
        online: navigator.onLine,
        timestamp: Date.now()
      });
      break;
      
    case 'REFRESH_HTML':
      console.log('[Service Worker] Refreshing HTML cache...');
      event.waitUntil(
        (async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();
            
            // Clear HTML files from cache
            for (const request of keys) {
              if (request.url.endsWith('.html') || new URL(request.url).pathname === '/') {
                await cache.delete(request);
                console.log('[Service Worker] Removed from cache:', request.url);
              }
            }
            
            event.ports[0].postMessage({
              type: 'HTML_CACHE_CLEARED',
              timestamp: Date.now()
            });
          } catch (error) {
            console.warn('[Service Worker] Failed to refresh HTML cache:', error);
          }
        })()
      );
      break;
  }
});

// Background sync for failed requests
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    console.log('[Service Worker] Background sync triggered');
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  try {
    console.log('[Service Worker] Syncing pending data...');
    // Implementation for syncing pending messages
  } catch (error) {
    console.log('[Service Worker] Sync failed:', error);
  }
}

// Clean up old cache entries periodically
async function cleanupOldCacheEntries() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
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

// Run cleanup once a day
setInterval(cleanupOldCacheEntries, 24 * 60 * 60 * 1000);

// Error handling - log but don't throw
self.addEventListener('error', event => {
  console.warn('[Service Worker] Error:', event.error);
  // NON-BLOCKING: Don't re-throw
});

self.addEventListener('unhandledrejection', event => {
  console.warn('[Service Worker] Unhandled rejection:', event.reason);
  // NON-BLOCKING: Don't re-throw
  event.preventDefault();
});

// Initial cleanup
cleanupOldCacheEntries();