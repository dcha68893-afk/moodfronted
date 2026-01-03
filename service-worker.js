// Service Worker for PWA Chat Application
// Version: 3.0.0
// Cache Strategy: Cache-First for static assets, Stale-While-Revalidate for API

const CACHE_NAME = 'pwa-chat-v3.0.0';
const API_CACHE_NAME = 'pwa-chat-api-v3.0.0';
const OFFLINE_CACHE_NAME = 'pwa-chat-offline-v3.0.0';

// App shell - all static assets that make up the UI
const APP_SHELL_ASSETS = [
  // Core files
  '/',
  '/index.html',
  '/chat.html',
  '/status.html',
  '/friend.html',
  '/group.html',
  '/calls.html',
  '/tools.html',
  '/settings.html',
  
  // CSS files
  '/css/app.css',
  '/css/chat.css',
  '/css/components.css',
  '/css/theme.css',
  
  // JavaScript files
  '/js/app.js',
  '/js/chat.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/session.js',
  '/js/notifications.js',
  
  // Manifest and icons
  '/manifest.json',
  '/favicon.ico',
  '/moodchat-192x192.png',
  '/moodchat-512x512.png',
  '/apple-touch-icon.png',
  
  // Fonts
  '/fonts/roboto.woff2',
  '/fonts/icons.woff2',
  
  // Images
  '/images/logo.svg',
  '/images/avatar-placeholder.png',
  '/images/chat-bg.jpg',
  '/icons/send.svg',
  '/icons/menu.svg',
  '/icons/search.svg',
  '/icons/settings.svg'
];

// API endpoints that should use stale-while-revalidate strategy
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

// Install event - cache app shell
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting on install');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
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
      self.clients.claim()
    ])
  );
});

// Helper: Check if request is for API
function isApiRequest(request) {
  const url = new URL(request.url);
  return API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint));
}

// Helper: Check if request is for static asset
function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').pop().toLowerCase();
  const staticExtensions = ['html', 'css', 'js', 'json', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff2', 'woff', 'ttf'];
  
  return staticExtensions.includes(extension) || 
         APP_SHELL_ASSETS.some(asset => url.pathname === asset || url.pathname === asset + '.html');
}

// Helper: Check if request should be cached
function shouldCache(request) {
  const url = new URL(request.url);
  
  // Don't cache non-GET requests
  if (request.method !== 'GET') return false;
  
  // Don't cache external resources unless they're from our domain
  if (url.origin !== self.location.origin) return false;
  
  return true;
}

// Stale-While-Revalidate strategy for API requests
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Return cached response immediately
  const fetchPromise = fetch(request)
    .then(async networkResponse => {
      // Update cache with fresh response
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(error => {
      console.log('[Service Worker] Network fetch failed:', error);
      // If fetch fails, we already have the cached response
    });
  
  // Don't wait for fetch to complete
  self.waitUntil(fetchPromise);
  
  // Return cached response or fetch if not cached
  return cachedResponse || fetch(request);
}

// Cache-First strategy for static assets
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request)
      .then(async networkResponse => {
        if (networkResponse.ok) {
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

// Network-First with Offline Fallback for API
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful API responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, serving from cache:', error);
    
    // Try to serve from API cache
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cached API response, serve app shell for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    
    // Return empty response for other failed API requests
    return new Response(JSON.stringify({ 
      status: 'offline', 
      data: [],
      cached: true 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle navigation requests - always serve from cache
async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If specific page not cached, serve index.html
  return cache.match('/index.html');
}

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
    // Get pending messages from IndexedDB
    const db = await openMessageDatabase();
    const pendingMessages = await getAllPendingMessages(db);
    
    for (const message of pendingMessages) {
      try {
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
        
        if (response.ok) {
          // Mark as sent in IndexedDB
          await markMessageAsSent(db, message.id);
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
          // Update main cache and delete from offline queue
          if (isApiRequest(request)) {
            const apiCache = await caches.open(API_CACHE_NAME);
            await apiCache.put(request, response.clone());
          }
          await cache.delete(request);
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
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New message',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag || 'chat-message',
    data: data.data || {},
    silent: data.silent || false
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Chat App', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing chat window or open new one
        for (const client of clientList) {
          if (client.url.includes('/chat.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/chat.html');
        }
      })
  );
});

// IndexedDB helper functions
function openMessageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chat-messages', 1);
    
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pending_messages')) {
        const store = db.createObjectStore('pending_messages', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('user_session')) {
        db.createObjectStore('user_session', { keyPath: 'key' });
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
    const request = store.getAll();
    
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

// Fetch event - main request handler
self.addEventListener('fetch', event => {
  const request = event.request;
  
  // Only handle GET requests and same-origin requests
  if (!shouldCache(request)) return;
  
  const url = new URL(request.url);
  
  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    console.log('[Service Worker] Navigation request:', url.pathname);
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  
  // Handle API requests
  if (isApiRequest(request)) {
    console.log('[Service Worker] API request:', url.pathname);
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }
  
  // Handle static assets
  if (isStaticAssetRequest(request)) {
    console.log('[Service Worker] Static asset request:', url.pathname);
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Default: network first with cache fallback
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
      .catch(() => {
        // Ultimate fallback for navigation
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 404 });
      })
  );
});

// Periodic cache cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cleanup-caches') {
    console.log('[Service Worker] Periodic sync: cleaning up old cache entries');
    event.waitUntil(cleanupOldCacheEntries());
  }
});

// Clean up old cache entries based on TTL
async function cleanupOldCacheEntries() {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const keys = await cache.keys();
    const now = Date.now();
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          const age = now - cachedDate;
          
          // Remove entries older than 24 hours
          if (age > 24 * 60 * 60 * 1000) {
            await cache.delete(request);
          }
        }
      }
    }
  } catch (error) {
    console.log('[Service Worker] Error cleaning cache:', error);
  }
}

// Message event handler for communication with main app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_API_DATA') {
    const { url, data } = event.data;
    event.waitUntil(cacheApiData(url, data));
  }
});

// Cache API data from main thread
async function cacheApiData(url, data) {
  const cache = await caches.open(API_CACHE_NAME);
  const response = new Response(JSON.stringify(data), {
    headers: { 
      'Content-Type': 'application/json',
      'Date': new Date().toUTCString()
    }
  });
  
  await cache.put(new Request(url), response);
}