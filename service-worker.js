// Service Worker for UniConnect - Firebase Web Application
// Version: 1.0.0
// Project: uniconnect-ee95c

const CACHE_NAME = 'uniconnect-v1.0.0';
const STATIC_CACHE = 'uniconnect-static-v1';
const DYNAMIC_CACHE = 'uniconnect-dynamic-v1';

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
  '/firebase.js',
  '/main.js',
  '/chat.js',
  '/storage.js',
  '/chat.css',
  'https://cdn.tailwindcss.com',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'
];

// Install Event - Cache static assets
self.addEventListener('install', (event) => {
  console.log('[UniConnect Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[UniConnect Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[UniConnect Service Worker] Install completed');
        return self.skipWaiting();
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[UniConnect Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches that don't match current version
          if (!cacheName.includes('uniconnect')) {
            console.log('[UniConnect Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[UniConnect Service Worker] Activate completed');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if found
        if (response) {
          return response;
        }

        // Make network request
        return fetch(event.request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200) {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();

            // Cache the new response in dynamic cache
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.log('[UniConnect Service Worker] Fetch failed:', error);
            
            // For HTML requests, return custom 404
            if (event.request.destination === 'document') {
              return caches.match('/404.html');
            }
            
            return new Response('UniConnect is offline. Please check your connection.', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Background Sync for UniConnect
self.addEventListener('sync', (event) => {
  console.log('[UniConnect Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'uniconnect-sync') {
    event.waitUntil(syncUniConnectData());
  }
});

async function syncUniConnectData() {
  console.log('[UniConnect Service Worker] Syncing UniConnect data...');
  // Implement your UniConnect-specific sync logic here
}

// Push Notifications for UniConnect
self.addEventListener('push', (event) => {
  console.log('[UniConnect Service Worker] Push received');
  
  const options = {
    body: 'New notification from UniConnect',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎓</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎓</text></svg>',
    vibrate: [200, 100, 200],
    data: {
      url: '/',
      project: 'uniconnect-ee95c'
    }
  };

  event.waitUntil(
    self.registration.showNotification('UniConnect', options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  console.log('[UniConnect Service Worker] Notification click');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('uniconnect') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});