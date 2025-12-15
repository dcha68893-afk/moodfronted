// Service Worker for Kynecta MoodChat - Firebase Web Application
// Version: 1.2.3 - Enhanced with Offline-First WhatsApp-like PWA features
// Project: kynecta-ee95c
// Firebase: 9.22.1 (Compact)

const APP_VERSION = '1.2.3';
const CACHE_NAME = 'kynecta-moodchat-cache-v1';
const CACHE_NAMES = {
  static: `kynecta-moodchat-static-v${APP_VERSION}`,
  dynamic: `kynecta-moodchat-dynamic-v${APP_VERSION}`,
  firebase: `kynecta-moodchat-firebase-v${APP_VERSION}`,
  app: 'kynecta-moodchat-cache-v1',
  moods: `kynecta-moodchat-moods-v${APP_VERSION}`
};

// CRITICAL FIX: Only cache files that definitely exist
// Use relative paths that match your actual file structure
const CRITICAL_ASSETS = [
  '/',
  '/index.html'
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

// Install Event - Cache ONLY what exists
self.addEventListener('install', (event) => {
  console.log(`[Kynecta MoodChat Service Worker] Installing version ${APP_VERSION} with offline-first features...`);
  
  // Force activation of new service worker immediately
  self.skipWaiting();
  
  event.waitUntil(
    Promise.all([
      // Cache only critical HTML files that we KNOW exist
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[Kynecta MoodChat Service Worker] Caching critical assets for offline-first');
          // Cache root and index.html
          return cache.add('/').catch(err => {
            console.log('Failed to cache /, trying /index.html:', err);
            return cache.add('/index.html');
          });
        }),
      // Cache Firebase SDK separately - these URLs always exist
      caches.open(CACHE_NAMES.firebase)
        .then(cache => {
          console.log('[Kynecta MoodChat Service Worker] Caching Firebase SDK 9.22.1');
          return Promise.all(
            FIREBASE_ASSETS.map(asset => 
              cache.add(asset).catch(err => {
                console.warn(`Failed to cache Firebase asset ${asset}:`, err.message);
                return null;
              })
            )
          );
        })
    ]).then(() => {
      console.log('[Kynecta MoodChat Service Worker] Installation completed with offline-first capabilities');
      
      // Initialize offline storage for mood selections
      return initializeOfflineStorage();
    }).then(() => {
      console.log('[Kynecta MoodChat Service Worker] Service Worker installed successfully - PWA is now offline-ready');
      
      // NEW: Dynamically cache additional assets that exist
      return cacheAdditionalAssets();
    }).catch(error => {
      console.error('[Kynecta MoodChat Service Worker] Installation error:', error);
      // Continue installation even with errors
    })
  );
});

// NEW: Dynamically cache additional assets that actually exist
async function cacheAdditionalAssets() {
  const cache = await caches.open(CACHE_NAME);
  
  // Try to cache common assets that might exist
  const potentialAssets = [
    // HTML pages (might exist as separate files or be handled by your SPA)
    '/chat.html',
    '/friends.html', 
    '/group.html',
    '/status.html',
    '/call.html',
    
    // CSS files (common patterns)
    '/styles.css',
    '/css/styles.css',
    '/css/main.css',
    '/style.css',
    
    // JS files (common patterns)
    '/js/app.js',
    '/js/main.js',
    '/app.js',
    '/main.js',
    '/bundle.js',
    
    // Icons
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/favicon.ico',
    
    // Manifest
    '/manifest.json'
  ];
  
  console.log('[Kynecta MoodChat Service Worker] Attempting to cache additional assets...');
  
  const results = await Promise.allSettled(
    potentialAssets.map(asset => 
      cache.add(asset).catch(err => {
        // Silently fail for non-existent assets
        return null;
      })
    )
  );
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  console.log(`[Kynecta MoodChat Service Worker] Successfully cached ${successful} additional assets`);
}

// Initialize IndexedDB for offline storage
async function initializeOfflineStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3); // Version bump for new features
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store for offline mood selections
      if (!db.objectStoreNames.contains('moodSelections')) {
        const moodStore = db.createObjectStore('moodSelections', { keyPath: 'id', autoIncrement: true });
        moodStore.createIndex('timestamp', 'timestamp', { unique: false });
        moodStore.createIndex('synced', 'synced', { unique: false });
        console.log('[Kynecta MoodChat Service Worker] Created moodSelections object store');
      }
      
      // Create object store for offline interest selections
      if (!db.objectStoreNames.contains('interestSelections')) {
        const interestStore = db.createObjectStore('interestSelections', { keyPath: 'id', autoIncrement: true });
        interestStore.createIndex('timestamp', 'timestamp', { unique: false });
        interestStore.createIndex('synced', 'synced', { unique: false });
        console.log('[Kynecta MoodChat Service Worker] Created interestSelections object store');
      }
      
      // NEW: Create object store for offline chat messages
      if (!db.objectStoreNames.contains('offlineMessages')) {
        const messageStore = db.createObjectStore('offlineMessages', { keyPath: 'id', autoIncrement: true });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        messageStore.createIndex('synced', 'synced', { unique: false });
        messageStore.createIndex('chatId', 'chatId', { unique: false });
        console.log('[Kynecta MoodChat Service Worker] Created offlineMessages object store');
      }
      
      // Create object store for offline queue (existing)
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (event) => {
      console.log('[Kynecta MoodChat Service Worker] Offline storage initialized');
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('[Kynecta MoodChat Service Worker] Failed to initialize offline storage:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Kynecta MoodChat Service Worker] Activating new version...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const deletions = cacheNames.map(cacheName => {
        // Delete old caches that don't match current version
        if ((cacheName.startsWith('uniconnect-') || cacheName.startsWith('kynecta-')) && 
            !Object.values(CACHE_NAMES).includes(cacheName) && 
            cacheName !== CACHE_NAME) {
          console.log('[Kynecta MoodChat Service Worker] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        }
      });
      return Promise.all(deletions);
    }).then(() => {
      console.log('[Kynecta MoodChat Service Worker] Activation completed');
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Enhanced Fetch Event - Offline-First strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(request.url);

  // HTML pages - OFFLINE-FIRST: Cache First
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(handleHtmlOfflineFirst(request));
    return;
  }

  // CSS and JS - OFFLINE-FIRST: Cache First
  if (request.destination === 'style' || request.destination === 'script' ||
      url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(handleStaticOfflineFirst(request));
    return;
  }

  // Images and icons - OFFLINE-FIRST: Cache First
  if (request.destination === 'image' || url.pathname.includes('/icons/')) {
    event.respondWith(handleImageOfflineFirst(request));
    return;
  }

  // Manifest file
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(handleManifestOfflineFirst(request));
    return;
  }

  // API and Firebase services - NETWORK FIRST
  if (url.pathname.includes('/api/') ||
      url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.pathname.includes('/__/') ||
      url.pathname.includes('/firestore/') ||
      url.pathname.includes('/identitytoolkit/')) {
    event.respondWith(handleApiNetworkFirst(request));
  }
  // Firebase SDK files - Cache First (versioned URLs)
  else if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith(handleFirebaseSdkCacheFirst(request));
  }
  else {
    // Default strategy - Network First
    event.respondWith(handleDefaultNetworkFirst(request));
  }
});

// NEW: HTML handler - OFFLINE-FIRST strategy
async function handleHtmlOfflineFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    console.log('[Kynecta Offline-First] Serving HTML from cache:', request.url);
    
    // Update cache in background if online
    if (navigator.onLine) {
      updateCacheInBackground(request);
    }
    
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache the response for future offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      console.log('[Kynecta Offline-First] Cached HTML for offline:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Kynecta Offline-First] Network failed, serving index.html');
    
    // Serve index.html as fallback (SPA behavior)
    const indexResponse = await caches.match('/index.html') || 
                          await caches.match('/');
    if (indexResponse) {
      return indexResponse;
    }
    
    // Ultimate fallback
    return new Response('Kynecta MoodChat - Offline', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

// NEW: Static assets handler - OFFLINE-FIRST strategy
async function handleStaticOfflineFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    if (navigator.onLine) {
      updateCacheInBackground(request);
    }
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
    // Return appropriate offline response
    if (request.url.endsWith('.css')) {
      return new Response('/* Offline CSS - Kynecta MoodChat */', {
        status: 200,
        headers: { 'Content-Type': 'text/css' }
      });
    }
    
    if (request.url.endsWith('.js')) {
      return new Response('// Offline JavaScript - Kynecta MoodChat', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    
    return new Response('', { status: 200 });
  }
}

// NEW: Image handler - OFFLINE-FIRST strategy
async function handleImageOfflineFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    if (navigator.onLine) {
      updateCacheInBackground(request);
    }
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
    // Return placeholder image
    return new Response(
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjMWE3M2U4Ii8+PHRleHQgeD0iNTAiIHk9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZmlsbD0id2hpdGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCI+S0M8L3RleHQ+PC9zdmc+',
      {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' }
      }
    );
  }
}

// NEW: Manifest handler - Cache First
async function handleManifestOfflineFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    // Return basic manifest
    const basicManifest = {
      "name": "Kynecta MoodChat",
      "short_name": "MoodChat",
      "start_url": "/",
      "display": "standalone",
      "background_color": "#ffffff",
      "theme_color": "#1a73e8",
      "offline_enabled": true
    };
    
    return new Response(JSON.stringify(basicManifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// NEW: API handler - NETWORK FIRST strategy
async function handleApiNetworkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache GET responses for offline reading
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Kynecta Network-First] API/Firebase offline');
    
    // Try to return cached version
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For Firestore, return offline structure
    if (request.url.includes('firestore.googleapis.com')) {
      return new Response(
        JSON.stringify({ 
          status: "offline",
          message: "Firestore is offline. Changes will sync when back online.",
          offlineData: await getOfflineData(),
          timestamp: Date.now()
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Generic API offline response
    return new Response(
      JSON.stringify({
        status: "offline",
        message: "You are offline. Data will sync when connection is restored.",
        timestamp: Date.now()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// NEW: Firebase SDK handler - Cache First
async function handleFirebaseSdkCacheFirst(request) {
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
    return new Response('', { status: 200 });
  }
}

// Default handler - Network First with cache fallback
async function handleDefaultNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('', { status: 200 });
  }
}

// Helper function to update cache in background
async function updateCacheInBackground(request) {
  if (navigator.onLine === false) return;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    // Silently fail
  }
}

// NEW: Get offline data from IndexedDB
async function getOfflineData() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Get messages
      const messageTx = db.transaction(['offlineMessages'], 'readonly');
      const messageStore = messageTx.objectStore('offlineMessages');
      const messageGet = messageStore.getAll();
      
      messageGet.onsuccess = () => {
        const messages = messageGet.result || [];
        
        // Get mood selections
        const moodTx = db.transaction(['moodSelections'], 'readonly');
        const moodStore = moodTx.objectStore('moodSelections');
        const moodGet = moodStore.getAll();
        
        moodGet.onsuccess = () => {
          const moods = moodGet.result || [];
          
          resolve({
            messages: messages.slice(-50),
            moods: moods,
            lastUpdated: Date.now()
          });
        };
      };
    };
    
    request.onerror = () => resolve({ messages: [], moods: [], lastUpdated: Date.now() });
  });
}

// Background Sync for Kynecta MoodChat with enhanced offline features
self.addEventListener('sync', (event) => {
  console.log('[Kynecta MoodChat Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'firebase-auth-sync') {
    event.waitUntil(syncFirebaseAuth());
  } else if (event.tag === 'firestore-sync') {
    event.waitUntil(syncFirestoreData());
  } else if (event.tag === 'kynecta-messages') {
    event.waitUntil(syncPendingMessages());
  } else if (event.tag === 'sync-mood-selections') {
    event.waitUntil(syncOfflineMoodSelections());
  } else if (event.tag === 'sync-interest-selections') {
    event.waitUntil(syncOfflineInterestSelections());
  }
  // NEW: Offline messages sync
  else if (event.tag === 'sync-offline-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

// NEW: Sync offline messages
async function syncOfflineMessages() {
  console.log('[Kynecta MoodChat Service Worker] Syncing offline messages...');
  
  try {
    const unsyncedMessages = await getUnsyncedMessages();
    
    if (unsyncedMessages.length === 0) {
      console.log('[Kynecta MoodChat Service Worker] No unsynced messages');
      return;
    }
    
    console.log(`[Kynecta MoodChat Service Worker] Found ${unsyncedMessages.length} unsynced messages`);
    
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_OFFLINE_MESSAGES',
          messages: unsyncedMessages,
          timestamp: Date.now()
        });
      });
    });
    
    await markMessagesAsSynced(unsyncedMessages);
    
  } catch (error) {
    console.error('[Kynecta MoodChat Service Worker] Message sync failed:', error);
  }
}

// NEW: Get unsynced messages
async function getUnsyncedMessages() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['offlineMessages'], 'readonly');
      const store = transaction.objectStore('offlineMessages');
      const index = store.index('synced');
      const range = IDBKeyRange.only(false);
      const getAll = index.getAll(range);
      
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
    
    request.onerror = () => resolve([]);
  });
}

// NEW: Mark messages as synced
async function markMessagesAsSynced(messages) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['offlineMessages'], 'readwrite');
      const store = transaction.objectStore('offlineMessages');
      
      messages.forEach(message => {
        message.synced = true;
        store.put(message);
      });
      
      transaction.oncomplete = () => {
        console.log(`[Kynecta MoodChat Service Worker] Marked ${messages.length} messages as synced`);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

// Existing sync functions (unchanged)
async function syncOfflineMoodSelections() {
  console.log('[Kynecta MoodChat Service Worker] Syncing offline mood selections...');
  
  try {
    const unsyncedMoods = await getUnsyncedMoodSelections();
    
    if (unsyncedMoods.length === 0) {
      console.log('[Kynecta MoodChat Service Worker] No unsynced mood selections');
      return;
    }
    
    console.log(`[Kynecta MoodChat Service Worker] Found ${unsyncedMoods.length} unsynced mood selections`);
    
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_MOOD_SELECTIONS',
          moods: unsyncedMoods,
          timestamp: Date.now()
        });
      });
    });
    
    await markMoodSelectionsAsSynced(unsyncedMoods);
    
  } catch (error) {
    console.error('[Kynecta MoodChat Service Worker] Mood selection sync failed:', error);
  }
}

async function syncOfflineInterestSelections() {
  console.log('[Kynecta MoodChat Service Worker] Syncing offline interest selections...');
  
  try {
    const unsyncedInterests = await getUnsyncedInterestSelections();
    
    if (unsyncedInterests.length === 0) {
      console.log('[Kynecta MoodChat Service Worker] No unsynced interest selections');
      return;
    }
    
    console.log(`[Kynecta MoodChat Service Worker] Found ${unsyncedInterests.length} unsynced interest selections`);
    
    await self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_INTEREST_SELECTIONS',
          interests: unsyncedInterests,
          timestamp: Date.now()
        });
      });
    });
    
    await markInterestSelectionsAsSynced(unsyncedInterests);
    
  } catch (error) {
    console.error('[Kynecta MoodChat Service Worker] Interest selection sync failed:', error);
  }
}

// Rest of the existing functions remain exactly the same...

async function getUnsyncedMoodSelections() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['moodSelections'], 'readonly');
      const store = transaction.objectStore('moodSelections');
      const index = store.index('synced');
      const range = IDBKeyRange.only(false);
      const getAll = index.getAll(range);
      
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
    
    request.onerror = () => resolve([]);
  });
}

async function getUnsyncedInterestSelections() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['interestSelections'], 'readonly');
      const store = transaction.objectStore('interestSelections');
      const index = store.index('synced');
      const range = IDBKeyRange.only(false);
      const getAll = index.getAll(range);
      
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
    
    request.onerror = () => resolve([]);
  });
}

async function markMoodSelectionsAsSynced(selections) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['moodSelections'], 'readwrite');
      const store = transaction.objectStore('moodSelections');
      
      selections.forEach(selection => {
        selection.synced = true;
        store.put(selection);
      });
      
      transaction.oncomplete = () => {
        console.log(`[Kynecta MoodChat Service Worker] Marked ${selections.length} mood selections as synced`);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

async function markInterestSelectionsAsSynced(selections) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['interestSelections'], 'readwrite');
      const store = transaction.objectStore('interestSelections');
      
      selections.forEach(selection => {
        selection.synced = true;
        store.put(selection);
      });
      
      transaction.oncomplete = () => {
        console.log(`[Kynecta MoodChat Service Worker] Marked ${selections.length} interest selections as synced`);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

async function syncFirebaseAuth() {
  console.log('[Kynecta MoodChat Service Worker] Syncing Firebase Auth state...');
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
    console.error('[Kynecta MoodChat Service Worker] Auth sync failed:', error);
  }
}

async function syncFirestoreData() {
  console.log('[Kynecta MoodChat Service Worker] Syncing Firestore data...');
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
    console.error('[Kynecta MoodChat Service Worker] Firestore sync failed:', error);
  }
}

async function syncPendingMessages() {
  console.log('[Kynecta MoodChat Service Worker] Syncing pending messages...');
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
    console.error('[Kynecta MoodChat Service Worker] Message sync failed:', error);
  }
}

// Push Notifications for Kynecta MoodChat with Firebase Cloud Messaging
self.addEventListener('push', (event) => {
  console.log('[Kynecta MoodChat Service Worker] Push received from FCM');

  let notificationData = {
    title: 'Kynecta MoodChat',
    body: 'New notification',
    icon: '/icons/moodchat-192.png',
    image: '/icons/moodchat-512.png',
    badge: '/icons/moodchat-192.png'
  };
  
  if (event.data) {
    try {
      const fcmData = event.data.json();
      const data = fcmData.data || fcmData;
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.log('[Kynecta MoodChat Service Worker] FCM data parsing error:', error);
    }
  }
  
  const options = {
    body: notificationData.body || 'New update from Kynecta MoodChat',
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
    tag: 'kynecta-moodchat-fcm',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .catch(error => {
        console.error('[Kynecta MoodChat Service Worker] Notification failed:', error);
      })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  console.log('[Kynecta MoodChat Service Worker] FCM notification click');
  
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
      // Focus existing Kynecta MoodChat window
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
  console.log('[Kynecta MoodChat Service Worker] Message received:', event.data);
  
  const { data } = event;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ 
        version: APP_VERSION,
        firebase: '9.22.1-compat',
        cache: CACHE_NAME,
        offlineCapable: true
      });
      break;
      
    case 'FIREBASE_OFFLINE_QUEUE':
      handleFirebaseOfflineQueue(data.payload);
      break;
      
    case 'SAVE_MOOD_OFFLINE':
      saveMoodSelectionOffline(data.payload);
      event.ports[0]?.postMessage({ success: true });
      break;
      
    case 'SAVE_INTEREST_OFFLINE':
      saveInterestSelectionOffline(data.payload);
      event.ports[0]?.postMessage({ success: true });
      break;
      
    // NEW: Message handling for WhatsApp-like features
    case 'SAVE_MESSAGE_OFFLINE':
      saveMessageOffline(data.payload);
      event.ports[0]?.postMessage({ success: true });
      break;
      
    case 'GET_OFFLINE_DATA':
      getOfflineData().then(data => {
        event.ports[0]?.postMessage({ data });
      });
      break;
      
    case 'REGISTER_MESSAGE_SYNC':
      self.registration.sync.register('sync-offline-messages').then(() => {
        console.log('[Kynecta MoodChat Service Worker] Message sync registered');
        event.ports[0]?.postMessage({ registered: true });
      }).catch(err => {
        console.error('[Kynecta MoodChat Service Worker] Message sync registration failed:', err);
        event.ports[0]?.postMessage({ registered: false, error: err.message });
      });
      break;
      
    case 'GET_OFFLINE_MOODS':
      getOfflineMoodSelections().then(moods => {
        event.ports[0]?.postMessage({ moods });
      });
      break;
      
    case 'GET_OFFLINE_INTERESTS':
      getOfflineInterestSelections().then(interests => {
        event.ports[0]?.postMessage({ interests });
      });
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
      
    case 'REGISTER_MOOD_SYNC':
      self.registration.sync.register('sync-mood-selections').then(() => {
        console.log('[Kynecta MoodChat Service Worker] Mood sync registered');
        event.ports[0]?.postMessage({ registered: true });
      }).catch(err => {
        console.error('[Kynecta MoodChat Service Worker] Mood sync registration failed:', err);
        event.ports[0]?.postMessage({ registered: false, error: err.message });
      });
      break;
      
    case 'REGISTER_INTEREST_SYNC':
      self.registration.sync.register('sync-interest-selections').then(() => {
        console.log('[Kynecta MoodChat Service Worker] Interest sync registered');
        event.ports[0]?.postMessage({ registered: true });
      }).catch(err => {
        console.error('[Kynecta MoodChat Service Worker] Interest sync registration failed:', err);
        event.ports[0]?.postMessage({ registered: false, error: err.message });
      });
      break;
      
    // NEW: Check offline status
    case 'CHECK_OFFLINE_STATUS':
      event.ports[0]?.postMessage({
        offline: !navigator.onLine,
        hasCache: true,
        version: APP_VERSION
      });
      break;
  }
});

// NEW: Save message offline
async function saveMessageOffline(payload) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['offlineMessages'], 'readwrite');
      const store = transaction.objectStore('offlineMessages');
      
      const message = {
        ...payload,
        timestamp: Date.now(),
        synced: false
      };
      
      const addRequest = store.add(message);
      
      addRequest.onsuccess = () => {
        console.log('[Kynecta MoodChat Service Worker] Message saved offline:', message);
        resolve();
      };
      
      addRequest.onerror = (error) => {
        console.error('[Kynecta MoodChat Service Worker] Failed to save message:', error);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

// Existing functions remain the same...

async function saveMoodSelectionOffline(payload) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['moodSelections'], 'readwrite');
      const store = transaction.objectStore('moodSelections');
      
      const moodSelection = {
        ...payload,
        timestamp: Date.now(),
        synced: false
      };
      
      const addRequest = store.add(moodSelection);
      
      addRequest.onsuccess = () => {
        console.log('[Kynecta MoodChat Service Worker] Mood selection saved offline:', moodSelection);
        resolve();
      };
      
      addRequest.onerror = (error) => {
        console.error('[Kynecta MoodChat Service Worker] Failed to save mood selection:', error);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

async function saveInterestSelectionOffline(payload) {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['interestSelections'], 'readwrite');
      const store = transaction.objectStore('interestSelections');
      
      const interestSelection = {
        ...payload,
        timestamp: Date.now(),
        synced: false
      };
      
      const addRequest = store.add(interestSelection);
      
      addRequest.onsuccess = () => {
        console.log('[Kynecta MoodChat Service Worker] Interest selection saved offline:', interestSelection);
        resolve();
      };
      
      addRequest.onerror = (error) => {
        console.error('[Kynecta MoodChat Service Worker] Failed to save interest selection:', error);
        resolve();
      };
    };
    
    request.onerror = () => resolve();
  });
}

async function getOfflineMoodSelections() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['moodSelections'], 'readonly');
      const store = transaction.objectStore('moodSelections');
      const getAll = store.getAll();
      
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
    
    request.onerror = () => resolve([]);
  });
}

async function getOfflineInterestSelections() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['interestSelections'], 'readonly');
      const store = transaction.objectStore('interestSelections');
      const getAll = store.getAll();
      
      getAll.onsuccess = () => resolve(getAll.result || []);
      getAll.onerror = () => resolve([]);
    };
    
    request.onerror = () => resolve([]);
  });
}

async function handleFirebaseOfflineQueue(payload) {
  const { operation, collection, data } = payload;
  
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

// Firebase performance monitoring
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('firebasejs')) {
    const startTime = Date.now();
    
    event.respondWith(
      fetch(event.request).then(response => {
        const loadTime = Date.now() - startTime;
        console.log(`[Kynecta Performance] Firebase SDK loaded in ${loadTime}ms`);
        return response;
      })
    );
  }
});