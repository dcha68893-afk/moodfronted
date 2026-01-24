// Service Worker for PWA Chat Application
// Version: 6.0.0 - Simplified API bypass with robust caching for static assets only
// Cache Strategy: Cache-First for static assets only, NETWORK-ONLY for all API/backend requests

const CACHE_NAME = 'moodchat-v12';
const OFFLINE_CACHE_NAME = 'moodchat-offline-v12';

// Static assets only - these are local files that should be cached
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
  
  // Optional static assets (will try to cache if exist)
  '/apple-touch-icon.png',
  '/images/logo.svg',
  '/images/avatar-placeholder.png',
  '/images/chat-bg.jpg',
  '/icons/send.svg',
  '/icons/menu.svg',
  '/icons/search.svg',
  '/icons/settings.svg'
];

// NEVER cache these - they go directly to network
const NEVER_CACHE_PATTERNS = [
  '/api/',
  '/auth/',
  '/login',
  '/register',
  '/logout',
  '/backend/',
  '/server/',
  'https://api.',
  'http://api.',
  ':3000',
  ':5000',
  ':8000',
  'localhost',
  '127.0.0.1'
];

// Install event - cache static assets only
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v6.0.0 - Simple and reliable...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching static assets only...');
        
        // Cache each static asset with error handling
        const cachePromises = STATIC_ASSETS.map(async (asset) => {
          try {
            // Skip if asset contains never-cache patterns
            if (containsNeverCachePattern(asset)) {
              console.log('[Service Worker] Skipping never-cache asset:', asset);
              return false;
            }
            
            // Handle root path
            const assetUrl = asset === '/' ? '/index.html' : asset;
            
            // Skip invalid URLs
            if (!isValidLocalUrl(assetUrl)) {
              console.log('[Service Worker] Skipping invalid URL:', assetUrl);
              return false;
            }
            
            // Fetch the asset
            const response = await fetch(assetUrl);
            
            // Only cache if response is OK and not an error page
            if (response.ok && response.status === 200 && !response.url.includes('/api/')) {
              await cache.put(asset === '/' ? '/' : assetUrl, response);
              console.log(`[Service Worker] Cached: ${assetUrl}`);
              return true;
            } else {
              console.warn(`[Service Worker] Failed to cache ${assetUrl}: ${response.status}`);
              return false;
            }
          } catch (error) {
            console.warn(`[Service Worker] Failed to cache ${asset}:`, error.message);
            return false;
          }
        });
        
        // Wait for all caching attempts to complete
        const results = await Promise.allSettled(cachePromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        
        console.log(`[Service Worker] Installation complete. Successfully cached ${successCount}/${STATIC_ASSETS.length} assets`);
        return self.skipWaiting();
      } catch (error) {
        console.error('[Service Worker] Install failed:', error);
        return self.skipWaiting();
      }
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating v6.0.0...');
  
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
            version: '6.0.0',
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
  const staticExtensions = ['css', 'js', 'json', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff2', 'woff', 'ttf', 'webp', 'gif', 'html'];
  
  return staticExtensions.includes(extension);
}

// Handle static asset requests with cache-first strategy
async function handleStaticAsset(request) {
  try {
    // First, try to get from cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Return cached response immediately
      console.log('[Service Worker] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // If not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Only cache if successful and not an API/backend response
    if (networkResponse.ok && 
        networkResponse.status === 200 && 
        !containsNeverCachePattern(request.url) &&
        !networkResponse.url.includes('/api/') &&
        !networkResponse.url.includes('/auth/')) {
      
      // Clone the response before caching
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
      console.log('[Service Worker] Cached new asset:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[Service Worker] Failed to handle static asset:', request.url, error);
    
    // For HTML requests, return offline page
    if (request.headers.get('Accept')?.includes('text/html')) {
      return getOfflinePage();
    }
    
    // For other assets, re-throw the error
    throw error;
  }
}

// Get offline page for HTML requests
function getOfflinePage() {
  return new Response(
    `<!DOCTYPE html>
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
    </html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'X-Service-Worker': 'offline'
      }
    }
  );
}

// Main fetch event handler - SIMPLE and RELIABLE
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // CRITICAL: Skip all API and backend requests completely
  if (containsNeverCachePattern(request.url) || 
      url.pathname.startsWith('/api/') || 
      url.pathname.includes('/auth/') ||
      url.pathname.includes('/backend/') ||
      url.pathname.includes('/login') ||
      url.pathname.includes('/register') ||
      url.pathname.includes('/logout') ||
      request.method !== 'GET') {
    
    console.log('[Service Worker] Bypassing cache for:', request.url);
    // Let the request go directly to network
    return;
  }
  
  // Handle static asset requests (CSS, JS, images, icons, HTML)
  if (isStaticAssetRequest(request) && url.origin === self.location.origin) {
    console.log('[Service Worker] Handling static asset:', request.url);
    event.respondWith(handleStaticAsset(request));
    return;
  }
  
  // For all other requests, let them go to network
  // (This includes navigation requests that we want fresh)
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
              version: '6.0.0'
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
        version: '6.0.0',
        timestamp: Date.now()
      });
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
    // This would sync any pending messages or data
    // For now, just log it
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

// Error handling
self.addEventListener('error', event => {
  console.error('[Service Worker] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[Service Worker] Unhandled rejection:', event.reason);
});