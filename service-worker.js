// Service Worker for PWA Chat Application
// Version: 3.1.2 - Enhanced auth and redirect handling
// Cache Strategy: Cache-First for static assets, Network-First for auth/navigation

const CACHE_NAME = 'pwa-chat-v3.1.2';
const API_CACHE_NAME = 'pwa-chat-api-v3.1.2';
const OFFLINE_CACHE_NAME = 'pwa-chat-offline-v3.1.2';

// App shell - all static assets that make up the UI
const APP_SHELL_ASSETS = [
  // Core files (excluding index.html from app shell - will be handled specially)
  '/',
  '/chat.html',
  '/status.html',
  '/friend.html',
  '/group.html',
  '/calls.html',
  '/tools.html',
  '/settings.html',
  
  // CSS files (assuming these exist locally)
  '/css/app.css',
  '/css/chat.css',
  '/css/components.css',
  '/css/theme.css',
  
  // JavaScript files (assuming these exist locally)
  '/js/app.js',
  '/js/chat.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/session.js',
  '/js/notifications.js',
  
  // Manifest and icons
  '/manifest.json',
  '/favicon.ico',
  
  // Fonts (assuming these exist locally)
  '/fonts/roboto.woff2',
  '/fonts/icons.woff2'
];

// Optional assets - try to cache if they exist, but don't fail if they don't
const OPTIONAL_ASSETS = [
  '/moodchat-192x192.png',
  '/moodchat-512x512.png',
  '/apple-touch-icon.png',
  '/images/logo.svg',
  '/images/avatar-placeholder.png',
  '/images/chat-bg.jpg',
  '/icons/send.svg',
  '/icons/menu.svg',
  '/icons/search.svg',
  '/icons/settings.svg'
];

// API endpoints that should use network-first strategy
const API_ENDPOINTS = [
  '/api/messages',
  '/api/conversations',
  '/api/users',
  '/api/profile',
  '/api/friends',
  '/api/groups',
  '/api/status',
  '/api/calls'
];

// Authentication-related endpoints - NEVER cache these
const AUTH_ENDPOINTS = [
  '/api/auth',
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/verify',
  '/api/token',
  '/api/session'
];

// Paths that should NEVER be cached
const NEVER_CACHE_PATHS = [
  '/index.html',
  '/api/auth/'
];

// Install event - cache app shell with error handling
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v3.1.2...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching app shell');
        
        // Cache core assets with error handling for each
        const cachePromises = APP_SHELL_ASSETS.map(async (asset) => {
          try {
            // Skip index.html from app shell caching
            if (asset === '/index.html') {
              console.log('[Service Worker] Skipping index.html from app shell cache');
              return false;
            }
            
            // For root path, DO NOT cache index.html as part of app shell
            const assetUrl = asset === '/' ? '/' : asset;
            const response = await fetch(assetUrl);
            if (response.ok && !shouldNeverCache(response.url)) {
              await cache.put(assetUrl, response);
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
        
        // Try to cache optional assets
        const optionalPromises = OPTIONAL_ASSETS.map(async (asset) => {
          try {
            const response = await fetch(asset);
            if (response.ok && !shouldNeverCache(response.url)) {
              await cache.put(asset, response);
              console.log(`[Service Worker] Cached optional: ${asset}`);
            }
          } catch (error) {
            // Silent fail for optional assets
          }
        });
        
        await Promise.allSettled([...cachePromises, ...optionalPromises]);
        
        console.log('[Service Worker] Installation complete, skipping waiting');
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
  console.log('[Service Worker] Activating v3.1.2...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== API_CACHE_NAME && 
                cacheName !== OFFLINE_CACHE_NAME &&
                cacheName.startsWith('pwa-chat-')) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Claim clients immediately
      self.clients.claim().then(() => {
        console.log('[Service Worker] Clients claimed');
      })
    ]).then(() => {
      // Send message to all clients that SW is ready
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: '3.1.2',
            timestamp: Date.now()
          });
        });
      });
    })
  );
});

// Helper: Check if request is for API
function isApiRequest(request) {
  const url = new URL(request.url);
  return API_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint));
}

// Helper: Check if request is for authentication
function isAuthRequest(request) {
  const url = new URL(request.url);
  return AUTH_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint));
}

// Helper: Check if request should NEVER be cached
function shouldNeverCache(requestUrl) {
  const url = new URL(requestUrl);
  return NEVER_CACHE_PATHS.some(path => 
    url.pathname.includes(path) || 
    (path.endsWith('/') && url.pathname.startsWith(path))
  );
}

// Helper: Check if request is for static asset
function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').pop().toLowerCase();
  const staticExtensions = ['css', 'js', 'json', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff2', 'woff', 'ttf', 'webp', 'gif'];
  
  return staticExtensions.includes(extension);
}

// Helper: Check if request is HTML page
function isHtmlRequest(request) {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').pop().toLowerCase();
  return extension === 'html' || request.headers.get('Accept')?.includes('text/html');
}

// Helper: Check if request is authentication-sensitive HTML page
function isAuthSensitivePage(request) {
  const url = new URL(request.url);
  const authSensitivePages = ['/chat.html', '/status.html', '/friend.html', '/group.html', '/calls.html', '/tools.html', '/settings.html'];
  return authSensitivePages.some(page => url.pathname.endsWith(page));
}

// Helper: Check if request is index.html or root
function isIndexPage(request) {
  const url = new URL(request.url);
  return url.pathname === '/' || url.pathname.endsWith('/index.html');
}

// Helper: Check if request should be cached
function shouldCache(request) {
  const url = new URL(request.url);
  
  // Don't cache non-GET requests
  if (request.method !== 'GET') return false;
  
  // Don't cache external resources unless they're from our domain
  if (url.origin !== self.location.origin) return false;
  
  // Never cache authentication requests
  if (isAuthRequest(request)) return false;
  
  // Never cache paths in NEVER_CACHE_PATHS
  if (shouldNeverCache(request.url)) return false;
  
  return true;
}

// Smart Network-First strategy for HTML pages
async function smartNetworkFirstForHtml(request) {
  const url = new URL(request.url);
  
  // NEVER cache index.html
  if (isIndexPage(request)) {
    console.log('[Service Worker] Index page request - never cache:', url.pathname);
    try {
      return await fetch(request);
    } catch (error) {
      console.log('[Service Worker] Offline and requesting index - serving offline UI');
      // For index page when offline, serve a basic offline page
      const cache = await caches.open(CACHE_NAME);
      return new Response(
        '<html><body><h1>Offline</h1><p>Please check your internet connection</p></body></html>',
        { 
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
  }
  
  try {
    console.log('[Service Worker] Smart network-first for HTML:', url.pathname);
    
    // Always try network first for HTML to get fresh authentication state
    const networkResponse = await fetch(request);
    
    // Check if this is a redirect
    if (networkResponse.status >= 300 && networkResponse.status < 400) {
      console.log('[Service Worker] Redirect detected, not caching:', url.pathname);
      
      // NEVER cache redirect responses
      // DO NOT replay cached redirects
      return networkResponse;
    }
    
    // Only cache successful non-redirect responses that are allowed
    if (networkResponse.ok && 
        networkResponse.status === 200 && 
        networkResponse.type !== 'opaqueredirect' &&
        !shouldNeverCache(request.url)) {
      
      // For auth-sensitive pages, be conservative with caching
      if (isAuthSensitivePage(request)) {
        console.log('[Service Worker] Auth-sensitive page - limited caching:', url.pathname);
        // Still cache, but the app logic will handle auth redirects
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      } else {
        // Regular HTML page - cache it
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed for HTML, smart cache fallback:', error.message);
    
    // When offline, handle different page types differently
    if (isAuthSensitivePage(request)) {
      console.log('[Service Worker] Offline and auth-sensitive - DO NOT redirect, serve cached or offline');
      
      // Try to get cached version
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        // We have a cached version, but add header to indicate it's cached
        const response = new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: new Headers(cachedResponse.headers)
        });
        response.headers.set('X-SW-Offline', 'true');
        return response;
      }
      
      // No cached version - show offline message
      return new Response(
        '<html><body><h1>Offline</h1><p>This page requires authentication and you are offline.</p></body></html>',
        { 
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    // For non-auth pages, try cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Ultimate fallback: basic offline page
    return new Response(
      '<html><body><h1>Offline</h1><p>Please check your internet connection</p></body></html>',
      { 
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

// Network-First for API requests
async function networkFirstForApi(request) {
  // NEVER cache auth API requests
  if (isAuthRequest(request)) {
    console.log('[Service Worker] Auth API request - never cache:', request.url);
    return fetch(request);
  }
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses (except auth)
    if (networkResponse.ok && !isAuthRequest(request)) {
      const cache = await caches.open(API_CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] API network failed, trying cache:', error);
    
    // Fall back to cache (except for auth)
    if (!isAuthRequest(request)) {
      const cache = await caches.open(API_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        // Add cache indicator header
        const response = new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: new Headers(cachedResponse.headers)
        });
        
        // Add custom header to indicate this is cached data
        response.headers.set('X-Cache', 'HIT');
        response.headers.set('X-SW-Cached', 'true');
        
        return response;
      }
    }
    
    // Return offline response
    return new Response(JSON.stringify({
      status: 'offline',
      message: 'You are offline and no cached data is available',
      data: [],
      cached: true
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'X-SW-Offline': 'true'
      }
    });
  }
}

// Cache-First strategy for static assets
async function cacheFirstForAssets(request) {
  // NEVER cache certain paths
  if (shouldNeverCache(request.url)) {
    console.log('[Service Worker] Never-cache path for asset:', request.url);
    return fetch(request);
  }
  
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request)
      .then(async networkResponse => {
        if (networkResponse.ok && !shouldNeverCache(request.url)) {
          await cache.put(request, networkResponse.clone());
        }
      })
      .catch(() => {
        // Silent fail - we have cached version
      });
    
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  return fetch(request);
}

// Handle authentication requests - never cache
async function handleAuthRequest(request) {
  console.log('[Service Worker] Handling auth request, no caching:', request.url);
  // Always go directly to network, no caching
  return fetch(request);
}

// Fetch event - main request handler
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  
  // Handle authentication requests - NEVER cache these
  if (isAuthRequest(request) || shouldNeverCache(request.url)) {
    console.log('[Service Worker] Never-cache request:', url.pathname);
    event.respondWith(fetch(request));
    return;
  }
  
  // Handle HTML page requests (navigation)
  if (request.mode === 'navigate' || isHtmlRequest(request)) {
    console.log('[Service Worker] HTML navigation request:', url.pathname);
    event.respondWith(smartNetworkFirstForHtml(request));
    return;
  }
  
  // Handle API requests
  if (isApiRequest(request)) {
    console.log('[Service Worker] API request:', url.pathname);
    event.respondWith(networkFirstForApi(request));
    return;
  }
  
  // Handle static assets
  if (isStaticAssetRequest(request)) {
    console.log('[Service Worker] Static asset request:', url.pathname);
    event.respondWith(cacheFirstForAssets(request));
    return;
  }
  
  // Default: try network, fall back to cache
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      return cachedResponse || new Response('Resource not found', { status: 404 });
    })
  );
});

// Background Sync for failed API requests
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    console.log('[Service Worker] Background sync: sync-messages');
    event.waitUntil(syncPendingMessages());
  }
  
  if (event.tag === 'sync-api-requests') {
    console.log('[Service Worker] Background sync: sync-api-requests');
    event.waitUntil(syncPendingApiRequests());
  }
});

// Sync pending messages when back online
async function syncPendingMessages() {
  try {
    const db = await openMessageDatabase();
    const pendingMessages = await getAllPendingMessages(db);
    
    for (const message of pendingMessages) {
      try {
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify(message)
        });
        
        if (response.ok) {
          await markMessageAsSent(db, message.id);
          console.log('[Service Worker] Synced message:', message.id);
        }
      } catch (error) {
        console.log('[Service Worker] Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.log('[Service Worker] Error in sync:', error);
  }
}

// Sync pending API requests
async function syncPendingApiRequests() {
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const keys = await cache.keys();
    
    for (const request of keys) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          if (isApiRequest(request) && !isAuthRequest(request)) {
            const apiCache = await caches.open(API_CACHE_NAME);
            await apiCache.put(request, response.clone());
          }
          await cache.delete(request);
          console.log('[Service Worker] Synced API request:', request.url);
        }
      } catch (error) {
        console.log('[Service Worker] Failed to sync request:', error);
      }
    }
  } catch (error) {
    console.log('[Service Worker] Error syncing requests:', error);
  }
}

// Handle push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New message',
      icon: data.icon || '/moodchat-192x192.png',
      badge: '/moodchat-192x192.png',
      tag: data.tag || 'chat-message',
      data: data.data || { url: '/chat.html' },
      requireInteraction: data.important || false,
      actions: data.actions || []
    };
    
    if (data.image) options.image = data.image;
    if (data.vibrate) options.vibrate = data.vibrate;
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'MoodChat', options)
    );
  } catch (error) {
    console.error('[Service Worker] Push notification error:', error);
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

// IndexedDB helper functions
function openMessageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chat-messages', 2);
    
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      
      if (oldVersion < 1) {
        // Initial version
        const pendingStore = db.createObjectStore('pending_messages', { keyPath: 'id' });
        pendingStore.createIndex('timestamp', 'timestamp');
        pendingStore.createIndex('status', 'status');
        
        db.createObjectStore('user_session', { keyPath: 'key' });
      }
      
      if (oldVersion < 2) {
        // Version 2: Add offline_queue store
        const offlineQueue = db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
        offlineQueue.createIndex('type', 'type');
        offlineQueue.createIndex('timestamp', 'timestamp');
      }
    };
    
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
    
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

function getAllPendingMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_messages'], 'readonly');
    const store = transaction.objectStore('pending_messages');
    const index = store.index('status');
    const request = index.getAll('pending');
    
    request.onsuccess = function(event) {
      resolve(event.target.result || []);
    };
    
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

function markMessageAsSent(db, messageId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending_messages'], 'readwrite');
    const store = transaction.objectStore('pending_messages');
    const request = store.delete(messageId);
    
    request.onsuccess = function() {
      resolve();
    };
    
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

// Message event handler for communication with main app
self.addEventListener('message', event => {
  const data = event.data;
  
  if (!data || !data.type) return;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      console.log('[Service Worker] Received SKIP_WAITING message');
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      console.log('[Service Worker] Received CLEAR_CACHE message');
      event.waitUntil(clearAllCaches());
      break;
      
    case 'CACHE_API_DATA':
      console.log('[Service Worker] Received CACHE_API_DATA message');
      event.waitUntil(cacheApiData(data.url, data.data));
      break;
      
    case 'UPDATE_AUTH_STATE':
      console.log('[Service Worker] Received auth state update:', data.authenticated);
      // Store auth state for future requests
      event.waitUntil(storeAuthState(data.authenticated, data.token));
      break;
      
    case 'GET_CACHE_INFO':
      event.waitUntil(getCacheInfo(event));
      break;
      
    case 'CHECK_HEALTH':
      event.ports[0].postMessage({
        type: 'HEALTH_RESPONSE',
        status: 'healthy',
        version: '3.1.2',
        timestamp: Date.now()
      });
      break;
  }
});

// Store authentication state
async function storeAuthState(isAuthenticated, token) {
  try {
    const db = await openMessageDatabase();
    const transaction = db.transaction(['user_session'], 'readwrite');
    const store = transaction.objectStore('user_session');
    
    await store.put({ key: 'auth_state', isAuthenticated, token, timestamp: Date.now() });
    console.log('[Service Worker] Auth state updated');
  } catch (error) {
    console.error('[Service Worker] Failed to store auth state:', error);
  }
}

// Cache API data from main thread
async function cacheApiData(url, data) {
  try {
    // Don't cache auth-related data
    if (isAuthRequest(new Request(url)) || shouldNeverCache(url)) {
      console.log('[Service Worker] Skipping cache for auth/never-cache data:', url);
      return;
    }
    
    const cache = await caches.open(API_CACHE_NAME);
    const response = new Response(JSON.stringify(data), {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
        'Date': new Date().toUTCString(),
        'Cache-Control': 'max-age=300',
        'X-Cached-By': 'Service-Worker'
      }
    });
    
    await cache.put(new Request(url), response);
    console.log('[Service Worker] Cached API data for:', url);
  } catch (error) {
    console.error('[Service Worker] Failed to cache API data:', error);
  }
}

// Clear all caches
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    console.log('[Service Worker] All caches cleared');
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CACHE_CLEARED',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('[Service Worker] Failed to clear caches:', error);
  }
}

// Get cache information
async function getCacheInfo(event) {
  try {
    const cacheNames = await caches.keys();
    const cacheInfo = {};
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      cacheInfo[cacheName] = keys.length;
    }
    
    event.ports[0].postMessage({
      type: 'CACHE_INFO',
      caches: cacheInfo,
      timestamp: Date.now()
    });
  } catch (error) {
    event.ports[0].postMessage({
      type: 'CACHE_INFO',
      error: error.message,
      timestamp: Date.now()
    });
  }
}

// Periodic sync for cache cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cleanup-caches') {
    console.log('[Service Worker] Periodic sync: cleaning up old cache entries');
    event.waitUntil(cleanupOldCacheEntries());
  }
});

// Clean up old cache entries
async function cleanupOldCacheEntries() {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const keys = await cache.keys();
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          const age = now - cachedDate;
          
          // Remove entries older than 1 hour for API cache
          if (age > 60 * 60 * 1000) {
            await cache.delete(request);
            cleanedCount++;
          }
        }
      }
    }
    
    console.log(`[Service Worker] Cleaned ${cleanedCount} old cache entries`);
  } catch (error) {
    console.log('[Service Worker] Error cleaning cache:', error);
  }
}

// Error handling
self.addEventListener('error', event => {
  console.error('[Service Worker] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[Service Worker] Unhandled rejection:', event.reason);
});