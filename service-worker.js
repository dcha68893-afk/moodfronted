// Service Worker for UniConnect - Firebase Web Application
// Version: 1.2.0
// Project: uniconnect-ee95c
// Firebase: 9.22.1 (Compact)

const APP_VERSION = '1.2.0';
const CACHE_NAME = 'kynecta-app-cache-v1';
const CACHE_NAMES = {
  static: `kynecta-static-v${APP_VERSION}`,
  dynamic: `kynecta-dynamic-v${APP_VERSION}`,
  firebase: `kynecta-firebase-v${APP_VERSION}`,
  app: 'kynecta-app-cache-v1'
};

// Core assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/profile.html',
  '/settings.html',
  '/notifications.html',
  '/marketplace.html',
  '/games.html',
  '/payment.html',
  '/chat.html',
  '/404.html',
  '/manifest.json',
  '/firebase-config.js',
  '/app.js',
  '/auth.js',
  '/firestore.js',
  '/storage.js',
  '/chat.js',
  '/main.js',
  '/styles/main.css',
  '/styles/chat.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Add all HTML routes to cache
const ALL_HTML_ROUTES = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/profile.html',
  '/settings.html',
  '/notifications.html',
  '/marketplace.html',
  '/games.html',
  '/payment.html',
  '/chat.html',
  '/404.html'
];

// Add all static assets to cache
const ALL_STATIC_ASSETS = [
  '/manifest.json',
  '/firebase-config.js',
  '/app.js',
  '/auth.js',
  '/firestore.js',
  '/storage.js',
  '/chat.js',
  '/main.js',
  '/styles/main.css',
  '/styles/chat.css',
  '/styles/',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/'
];

// Firebase SDK 9.22.1 - Compact Version (Modular)
const FIREBASE_ASSETS = [
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-performance-compat.js'
];

// External dependencies
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com'
];

// Install Event - Cache static assets
self.addEventListener('install', (event) => {
  console.log(`[kynecta Service Worker] Installing version ${APP_VERSION}...`);
  
  // Force activation of new service worker immediately
  self.skipWaiting();
  
  event.waitUntil(
    Promise.all([
      // Cache ALL HTML routes for offline use
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[kynecta Service Worker] Caching ALL HTML routes for offline');
          return cache.addAll(ALL_HTML_ROUTES);
        }),
      // Cache ALL static assets
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[kynecta Service Worker] Caching ALL static assets');
          return Promise.all(ALL_STATIC_ASSETS.map(asset => {
            return cache.add(asset).catch(err => {
              console.log(`Failed to cache ${asset}:`, err);
            });
          }));
        }),
      // Cache core static assets
      caches.open(CACHE_NAMES.static)
        .then(cache => {
          console.log('[kynecta Service Worker] Caching core static assets');
          return cache.addAll(STATIC_ASSETS);
        }),
      // Cache Firebase SDK separately
      caches.open(CACHE_NAMES.firebase)
        .then(cache => {
          console.log('[kynecta Service Worker] Caching Firebase SDK 9.22.1');
          return cache.addAll(FIREBASE_ASSETS);
        }),
      // Cache external assets
      caches.open(CACHE_NAMES.dynamic)
        .then(cache => {
          console.log('[kynecta Service Worker] Caching external assets');
          return cache.addAll(EXTERNAL_ASSETS);
        })
    ]).then(() => {
      console.log('[kynecta Service Worker] All assets cached successfully');
    }).catch(error => {
      console.error('[kynecta Service Worker] Cache installation failed:', error);
    })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[kynecta Service Worker] Activating new version...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const deletions = cacheNames.map(cacheName => {
        // Delete old caches that don't match current version
        if ((cacheName.startsWith('uniconnect-') || cacheName.startsWith('kynecta-')) && 
            !Object.values(CACHE_NAMES).includes(cacheName) && 
            cacheName !== CACHE_NAME) {
          console.log('[kynecta Service Worker] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        }
      });
      return Promise.all(deletions);
    }).then(() => {
      console.log('[kynecta Service Worker] Activation completed');
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Enhanced Fetch Event - Serve cached files first when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(request.url);

  // HTML pages - Cache First for offline, update when online
  if (request.destination === 'document' || url.pathname.endsWith('.html') || 
      ALL_HTML_ROUTES.includes(url.pathname) || 
      (url.pathname === '/' && request.destination !== 'image')) {
    event.respondWith(handleHtmlWithCacheFirst(request));
    return;
  }

  // CSS and JS - Cache First for offline
  if (request.destination === 'style' || request.destination === 'script' ||
      url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(handleStaticWithCacheFirst(request));
    return;
  }

  // Images and icons - Cache First for offline
  if (request.destination === 'image' || url.pathname.includes('/icons/')) {
    event.respondWith(handleImageWithCacheFirst(request));
    return;
  }

  // Manifest file
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(handleManifestWithCacheFirst(request));
    return;
  }

  // Firebase services - Network First with aggressive caching
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.pathname.includes('/__/') ||
      url.pathname.includes('/firestore/') ||
      url.pathname.includes('/identitytoolkit/')) {
    event.respondWith(handleFirebaseRequest(request));
  }
  // API requests - Network First strategy
  else if (url.pathname.includes('/api/')) {
    event.respondWith(handleApiRequest(request));
  }
  // Firebase SDK files - Cache First (versioned URLs)
  else if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith(handleFirebaseSdkRequest(request));
  }
  else {
    // Default strategy - Cache First for offline
    event.respondWith(handleDefaultWithCacheFirst(request));
  }
});

// Enhanced HTML handler - Cache First with network update
async function handleHtmlWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response for future offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails and not in cache, return 404 page
    const offlineResponse = await caches.match('/404.html');
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Fallback to index.html
    const indexResponse = await caches.match('/index.html');
    if (indexResponse) {
      return indexResponse;
    }
    
    return new Response('Offline - No cached page available', {
      status: 408,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// Enhanced Static assets handler - Cache First with network update
async function handleStaticWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response for future offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    return new Response('// Offline - Static resource not available', {
      status: 408,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}

// Enhanced Image handler - Cache First with network update
async function handleImageWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response for future offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 408 });
  }
}

// Manifest handler - Cache First with network update
async function handleManifestWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response for future offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return basic manifest from cache
    const basicManifest = {
      "name": "kynecta",
      "short_name": "kynecta",
      "start_url": "/",
      "display": "standalone",
      "background_color": "#ffffff",
      "theme_color": "#000000",
      "icons": [
        {
          "src": "/icons/icon-192x192.png",
          "sizes": "192x192",
          "type": "image/png"
        },
        {
          "src": "/icons/icon-512x512.png",
          "sizes": "512x512",
          "type": "image/png"
        }
      ]
    };
    
    return new Response(JSON.stringify(basicManifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Default handler - Cache First with network update
async function handleDefaultWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    return await fetch(request);
  } catch (error) {
    return new Response('Offline', { status: 408 });
  }
}

// Helper function to update cache in background
async function updateCacheInBackground(request) {
  // Only update if we're online
  if (navigator.onLine === false) return;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    // Silently fail - we already served from cache
  }
}

// Strategy for Firebase services - Network First with offline queue
async function handleFirebaseRequest(request) {
  const cache = await caches.open(CACHE_NAMES.firebase);
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful Firebase responses (except real-time streams)
    if (networkResponse.ok && !request.url.includes('/channels/')) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[kynecta Service Worker] Firebase request offline:', request.url);
    
    // Try to return cached version
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For Firestore, return offline structure
    if (request.url.includes('firestore.googleapis.com')) {
      return new Response(
        JSON.stringify({ 
          error: 'offline', 
          message: 'Firestore is offline',
          timestamp: Date.now()
        }),
        { 
          status: 408, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    return new Response('{ "status": "offline" }', {
      status: 408,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Strategy for Firebase SDK - Cache First (versioned, so safe to cache)
async function handleFirebaseSdkRequest(request) {
  const cache = await caches.open(CACHE_NAMES.firebase);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 408 });
  }
}

// Strategy: Network First for API calls
async function handleApiRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response(
      JSON.stringify({ error: 'You are offline', offline: true }),
      { 
        status: 408, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Strategy: Network First for HTML pages (legacy)
async function handleHtmlRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (request.destination === 'document') {
      const indexResponse = await caches.match('/index.html');
      if (indexResponse) return indexResponse;
    }
    
    return caches.match('/404.html');
  }
}

// Strategy: Cache First for images (legacy)
async function handleImageRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 408 });
  }
}

// Strategy: Cache First for static assets (legacy)
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('kynecta is offline', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Default strategy (legacy)
async function handleDefaultRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 408 });
  }
}

// Background Sync for kynecta with Firebase offline support
self.addEventListener('sync', (event) => {
  console.log('[kynecta Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'firebase-auth-sync') {
    event.waitUntil(syncFirebaseAuth());
  } else if (event.tag === 'firestore-sync') {
    event.waitUntil(syncFirestoreData());
  } else if (event.tag === 'kynecta-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncFirebaseAuth() {
  console.log('[kynecta Service Worker] Syncing Firebase Auth state...');
  // Sync authentication state when back online
  try {
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'FIREBASE_AUTH_SYNC',
          timestamp: Date.now()
        });
      });
    });
  } catch (error) {
    console.error('[kynecta Service Worker] Auth sync failed:', error);
  }
}

async function syncFirestoreData() {
  console.log('[kynecta Service Worker] Syncing Firestore data...');
  // Trigger Firestore offline data sync
  try {
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'FIRESTORE_SYNC',
          action: 'syncPendingWrites'
        });
      });
    });
  } catch (error) {
    console.error('[kynecta Service Worker] Firestore sync failed:', error);
  }
}

async function syncPendingMessages() {
  console.log('[kynecta Service Worker] Syncing pending messages...');
  // Sync unsent chat messages when back online
  try {
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'MESSAGE_SYNC',
          timestamp: Date.now()
        });
      });
    });
  } catch (error) {
    console.error('[kynecta Service Worker] Message sync failed:', error);
  }
}

// Push Notifications for kynecta with Firebase Cloud Messaging
self.addEventListener('push', (event) => {
  console.log('[kynecta Service Worker] Push received from FCM');

  let notificationData = {
    title: 'kynecta',
    body: 'New notification',
    icon: '/icons/icon-192x192.png',
    image: '/icons/icon-512x512.png',
    badge: '/icons/icon-192x192.png'
  };
  
  if (event.data) {
    try {
      const fcmData = event.data.json();
      const data = fcmData.data || fcmData;
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.log('[kynecta Service Worker] FCM data parsing error:', error);
    }
  }
  
  const options = {
    body: notificationData.body || 'New update from UniConnect',
    icon: notificationData.icon,
    badge: notificationData.badge,
    image: notificationData.image,
    vibrate: [100, 50, 100],
    data: {
      click_url: notificationData.url || '/',
      firebase_project: 'kynecta-ee95c',
      message_id: notificationData.messageId || Date.now(),
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    tag: 'kynecta-fcm',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .catch(error => {
        console.error('[kynecta Service Worker] Notification failed:', error);
      })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  console.log('[kynecta Service Worker] FCM notification click');
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.click_url || '/';
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(clientList => {
      // Focus existing UniConnect window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          // Navigate to specific page if needed
          if (urlToOpen !== '/') {
            client.postMessage({
              type: 'NAVIGATE_TO',
              url: urlToOpen,
              source: 'fcm_notification'
            });
          }
          return;
        }
      }
      
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Message event for communication with Firebase app
self.addEventListener('message', (event) => {
  console.log('[kynecta Service Worker] Message received:', event.data);
  
  const { data } = event;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ 
        version: APP_VERSION,
        firebase: '9.22.1-compat',
        cache: CACHE_NAME
      });
      break;
      
    case 'FIREBASE_OFFLINE_QUEUE':
      // Handle Firebase offline queue messages
      handleFirebaseOfflineQueue(data.payload);
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.startsWith('uniconnect-') || cacheName.startsWith('kynecta-')) {
            caches.delete(cacheName);
          }
        });
      });
      break;
      
    case 'CHECK_OFFLINE_CACHE':
      caches.open(CACHE_NAME).then(cache => {
        cache.keys().then(keys => {
          event.ports[0]?.postMessage({
            cachedItems: keys.length,
            cacheName: CACHE_NAME,
            offlineReady: keys.length > 0
          });
        });
      });
      break;
  }
});

// Handle Firebase offline operations
async function handleFirebaseOfflineQueue(payload) {
  const { operation, collection, data } = payload;
  
  // Store offline operations in IndexedDB or cache for later sync
  const offlineQueue = await getOfflineQueue();
  offlineQueue.push({
    operation,
    collection,
    data,
    timestamp: Date.now(),
    id: Math.random().toString(36).substr(2, 9)
  });
  
  await saveOfflineQueue(offlineQueue);
}

// IndexedDB for offline queue (simplified)
async function getOfflineQueue() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaOffline', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['queue'], 'readonly');
      const store = transaction.objectStore('queue');
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result || []);
    };
    request.onerror = () => resolve([]);
  });
}

async function saveOfflineQueue(queue) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaOffline', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['queue'], 'readwrite');
      const store = transaction.objectStore('queue');
      queue.forEach(item => store.put(item));
      transaction.oncomplete = () => resolve();
    };
  });
}

// Firebase performance monitoring (if using performance compat)
self.addEventListener('fetch', (event) => {
  // Measure Firebase SDK load times
  if (event.request.url.includes('firebasejs')) {
    const startTime = Date.now();
    
    event.respondWith(
      fetch(event.request).then(response => {
        const loadTime = Date.now() - startTime;
        console.log(`[kynecta Performance] Firebase SDK loaded in ${loadTime}ms`);
        return response;
      })
    );
  }
});