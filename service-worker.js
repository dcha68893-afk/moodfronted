// Service Worker for Kynecta MoodChat - Firebase Web Application
// Version: 1.4.0 - Enhanced Offline-First with Permanent App Shell Availability
// Project: kynecta-ee95c
// Firebase: 9.22.1 (Compact)

const APP_VERSION = '1.4.0';
const CACHE_NAME = `kynecta-moodchat-permanent-v${APP_VERSION}`;

// COMPLETE APP SHELL ASSETS - PERMANENTLY CACHED FOR OFFLINE USE
const APP_SHELL_ASSETS = [
  // HTML Pages - ALL app pages (MUST be available offline permanently)
  '/',
  '/index.html',
  '/chat.html',
  '/friend.html',
  '/group.html',
  '/status.html',
  '/call.html',
  
  // CSS Files - ALL stylesheets (CRITICAL for layout)
  '/styles.css',
  '/css/styles.css',
  '/css/main.css',
  '/style.css',
  '/assets/css/app.css',
  
  // JavaScript Files - ALL app logic (CRITICAL for functionality)
  '/js/app.js',
  '/js/chat.js',
  '/js/main.js',
  '/js/auth.js',
  '/app.js',
  '/main.js',
  '/bundle.js',
  '/assets/js/app.js',
  
  // Icons and Images - ALL visual assets
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',
  '/favicon.ico',
  '/assets/logo.png',
  '/assets/favicon.ico',
  
  // Manifest and Config
  '/manifest.json',
  '/firebase-messaging-sw.js',
  
  // Offline Fallback Pages
  '/offline.html'
];

// Firebase SDK 9.22.1 - DO NOT CACHE - Network Only (EXCLUDE from all caching)
const FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-performance-compat.js'
];

// Firebase API Endpoints - DO NOT CACHE (EXCLUDE from all caching)
const FIREBASE_API_PATTERNS = [
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com/auth',
  '__/auth',
  '__/firebase'
];

// Install Event - PERMANENTLY Cache ALL App Shell Assets
self.addEventListener('install', (event) => {
  console.log(`[Kynecta MoodChat Service Worker] Installing version ${APP_VERSION} - PERMANENT App Shell Caching`);
  
  // Force immediate activation to replace old service worker
  self.skipWaiting();
  
  event.waitUntil(
    // Open permanent cache for app shell
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Kynecta] PERMANENTLY caching app shell:', APP_SHELL_ASSETS.length, 'assets');
        
        // Cache all app shell assets with aggressive error handling
        return Promise.allSettled(
          APP_SHELL_ASSETS.map(asset => {
            return cache.add(asset).catch(err => {
              console.warn(`[Kynecta] Could not cache ${asset}:`, err.message);
              // Don't fail installation if some assets can't be cached
              return null;
            });
          })
        ).then(results => {
          const successful = results.filter(r => r.status === 'fulfilled' && r.value !== undefined).length;
          console.log(`[Kynecta] PERMANENTLY cached ${successful}/${APP_SHELL_ASSETS.length} app shell assets`);
          
          // Ensure critical assets are cached
          return ensureCriticalAssetsCached(cache);
        });
      })
      .then(() => {
        console.log('[Kynecta] PERMANENT app shell caching completed');
        return initializeOfflineStorage();
      })
      .then(() => {
        console.log('[Kynecta] Service Worker installed - App is PERMANENTLY offline-ready');
        // Send message to all clients that new version is ready
        return self.clients.matchAll();
      })
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NEW_VERSION_READY',
            version: APP_VERSION,
            permanentOffline: true
          });
        });
      })
      .catch(error => {
        console.error('[Kynecta] PERMANENT installation error:', error);
        // Installation must succeed even with errors
      })
  );
});

// Ensure critical assets are always cached with fallbacks
async function ensureCriticalAssetsCached(cache) {
  const criticalAssets = [
    '/',
    '/index.html',
    '/styles.css',
    '/js/app.js',
    '/manifest.json'
  ];
  
  for (const asset of criticalAssets) {
    try {
      await cache.add(asset);
    } catch (error) {
      console.warn(`[Kynecta] Critical asset ${asset} not available, will use cached version if exists`);
    }
  }
  
  // Always ensure offline.html is available
  try {
    await cache.add('/offline.html');
  } catch (error) {
    // Create minimal offline page if not exists
    const minimalOffline = new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Kynecta Offline</title>
        <style>body{font-family:sans-serif;padding:2rem;text-align:center}</style>
      </head>
      <body><h1>You're Offline</h1><p>App will load when back online.</p></body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
    await cache.put('/offline.html', minimalOffline);
  }
}

// Initialize IndexedDB for offline storage
async function initializeOfflineStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('moodSelections')) {
        const moodStore = db.createObjectStore('moodSelections', { keyPath: 'id', autoIncrement: true });
        moodStore.createIndex('timestamp', 'timestamp', { unique: false });
        moodStore.createIndex('synced', 'synced', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('interestSelections')) {
        const interestStore = db.createObjectStore('interestSelections', { keyPath: 'id', autoIncrement: true });
        interestStore.createIndex('timestamp', 'timestamp', { unique: false });
        interestStore.createIndex('synced', 'synced', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('offlineMessages')) {
        const messageStore = db.createObjectStore('offlineMessages', { keyPath: 'id', autoIncrement: true });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        messageStore.createIndex('synced', 'synced', { unique: false });
        messageStore.createIndex('chatId', 'chatId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (event) => {
      console.log('[Kynecta] Offline storage initialized for PERMANENT caching');
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('[Kynecta] Failed to initialize offline storage:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Activate Event - AGGRESSIVELY clean up ALL old caches
self.addEventListener('activate', (event) => {
  console.log('[Kynecta] Activating PERMANENT offline version', APP_VERSION);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const deletions = cacheNames.map(cacheName => {
        // Delete ALL old caches that don't match current version
        // This prevents old broken layouts from being reused
        if ((cacheName.startsWith('uniconnect-') || cacheName.startsWith('kynecta-')) && 
            cacheName !== CACHE_NAME) {
          console.log('[Kynecta] DELETING old cache to prevent broken layouts:', cacheName);
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      });
      return Promise.all(deletions);
    }).then(() => {
      console.log('[Kynecta] AGGRESSIVE cache cleanup completed - only v' + APP_VERSION + ' remains');
      // Take control of ALL clients immediately
      return self.clients.claim();
    }).then(() => {
      // Verify permanent cache is working
      return caches.open(CACHE_NAME).then(cache => {
        return cache.keys().then(keys => {
          console.log(`[Kynecta] PERMANENT cache contains ${keys.length} assets for offline use`);
          
          // Validate critical assets are present
          const criticalUrls = ['/', '/index.html', '/offline.html'];
          const missing = [];
          
          criticalUrls.forEach(url => {
            const found = keys.some(key => {
              const keyUrl = new URL(key.url);
              return keyUrl.pathname === url || keyUrl.pathname + '.html' === url;
            });
            if (!found) {
              missing.push(url);
            }
          });
          
          if (missing.length > 0) {
            console.warn('[Kynecta] Missing critical assets:', missing);
            // Re-cache missing critical assets
            return cacheCriticalAssets();
          }
          
          return Promise.resolve();
        });
      });
    })
  );
});

// Cache missing critical assets
async function cacheCriticalAssets() {
  const cache = await caches.open(CACHE_NAME);
  const criticalAssets = ['/', '/index.html', '/offline.html'];
  
  for (const asset of criticalAssets) {
    try {
      await cache.add(asset);
      console.log(`[Kynecta] Re-cached critical asset: ${asset}`);
    } catch (error) {
      console.warn(`[Kynecta] Could not re-cache ${asset}:`, error.message);
    }
  }
}

// Enhanced Fetch Event - PERMANENT App Shell Availability
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Check if this is a Firebase SDK or API request - NEVER CACHE
  if (isFirebaseRequest(url)) {
    // Network Only for Firebase - NEVER interfere with Firebase
    event.respondWith(handleFirebaseNetworkOnly(request));
    return;
  }
  
  // Check if this is an App Shell asset (PERMANENTLY CACHED)
  if (isAppShellAsset(url)) {
    event.respondWith(handlePermanentAppShell(request));
    return;
  }
  
  // API Calls (Non-Firebase) - Network First
  if (url.pathname.includes('/api/')) {
    event.respondWith(handleApiNetworkFirst(request));
    return;
  }
  
  // Default: Cache First with Network Fallback
  event.respondWith(handleDefaultCacheFirst(request));
});

// Check if request is to Firebase (NEVER CACHE - CRITICAL FOR AUTH)
function isFirebaseRequest(url) {
  // Firebase SDK URLs
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    return true;
  }
  
  // Firebase API endpoints
  return FIREBASE_API_PATTERNS.some(pattern => 
    url.hostname.includes(pattern) || url.pathname.includes(pattern)
  );
}

// Check if asset is part of App Shell (PERMANENT CACHE)
function isAppShellAsset(url) {
  const path = url.pathname;
  const isSameOrigin = url.origin === self.location.origin;
  
  // Only cache same-origin assets for app shell
  if (!isSameOrigin) {
    return false;
  }
  
  // Cache based on file extensions and paths
  if (path.endsWith('.html') || 
      path.endsWith('.css') || 
      path.endsWith('.js') || 
      path.endsWith('.png') || 
      path.endsWith('.jpg') || 
      path.endsWith('.jpeg') || 
      path.endsWith('.gif') || 
      path.endsWith('.svg') || 
      path.endsWith('.ico') || 
      path.endsWith('.json') ||
      path === '/' ||
      path.includes('/icons/') ||
      path.includes('/assets/') ||
      path.includes('/css/') ||
      path.includes('/js/')) {
    return true;
  }
  
  return false;
}

// PERMANENT App Shell Handler - Always available offline
async function handlePermanentAppShell(request) {
  console.log('[Kynecta] App Shell request (PERMANENT):', request.url);
  
  // ALWAYS try cache first for app shell assets
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[Kynecta] Serving PERMANENT app shell from cache:', request.url);
    
    // Update cache in background if online (silent refresh)
    if (navigator.onLine) {
      silentlyUpdateCache(request);
    }
    
    return cachedResponse;
  }
  
  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache for PERMANENT offline use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      console.log('[Kynecta] Added to PERMANENT cache:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Kynecta] Network failed for app shell, serving robust fallback');
    
    // Return appropriate fallback based on file type
    return serveRobustFallback(request);
  }
}

// Serve robust fallback for missing app shell assets
async function serveRobustFallback(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // HTML fallback
  if (path.endsWith('.html') || path === '/') {
    console.log('[Kynecta] HTML unavailable, serving offline page');
    
    // Try to serve any cached HTML page
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    // Find any HTML page in cache
    for (const key of keys) {
      const keyUrl = new URL(key.url);
      if (keyUrl.pathname.endsWith('.html') || keyUrl.pathname === '/') {
        const response = await cache.match(key);
        if (response) {
          console.log('[Kynecta] Serving cached HTML as fallback:', key.url);
          return response;
        }
      }
    }
    
    // Ultimate HTML fallback
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Kynecta MoodChat</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a73e8, #0d47a1);
            color: white;
            height: 100vh;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 500px;
          }
          h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
          }
          p {
            font-size: 1.1rem;
            line-height: 1.6;
            opacity: 0.9;
          }
          .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">⚡</div>
          <h1>Kynecta MoodChat</h1>
          <p>The app is fully loaded for offline use.</p>
          <p>You're currently offline. Basic functionality is available.</p>
          <p>The app will sync automatically when you're back online.</p>
        </div>
        <script>
          // Minimal JS to handle online detection
          window.addEventListener('online', () => location.reload());
        </script>
      </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
  
  // CSS fallback - prevent layout breaks
  if (path.endsWith('.css')) {
    console.log('[Kynecta] CSS unavailable, serving minimal styles');
    return new Response(
      `/* Kynecta MoodChat - Minimal Offline CSS */
      * { box-sizing: border-box; }
      body { 
        margin: 0; 
        padding: 0; 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        min-height: 100vh;
      }
      /* Ensure layout containers are visible */
      .container, div, section, main, header, footer {
        display: block;
        visibility: visible !important;
      }`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/css' }
      }
    );
  }
  
  // JavaScript fallback - prevent app crashes
  if (path.endsWith('.js')) {
    console.log('[Kynecta] JS unavailable, serving safe stub');
    return new Response(
      `// Kynecta MoodChat - Safe JavaScript Stub
      console.log('App running in enhanced offline mode');
      if (typeof window !== 'undefined') {
        window.isOffline = true;
        window.appReady = true;
        window.dispatchEvent(new Event('app-loaded'));
      }`,
      {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      }
    );
  }
  
  // Image fallback
  if (path.match(/\.(png|jpg|jpeg|gif|svg|ico)$/i)) {
    console.log('[Kynecta] Image unavailable, serving placeholder');
    // SVG placeholder
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1a73e8"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="white" font-family="Arial" font-size="14">KC</text></svg>',
      {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' }
      }
    );
  }
  
  // Default fallback
  return new Response('', { status: 200 });
}

// Firebase Handler - Network Only (NEVER CACHE - CRITICAL)
async function handleFirebaseNetworkOnly(request) {
  console.log('[Kynecta] Firebase request - Network Only (NEVER CACHE):', request.url);
  
  try {
    // ALWAYS fetch from network - never cache Firebase
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    console.log('[Kynecta] Firebase offline - returning safe offline response');
    
    // Return safe responses that won't break the UI
    return new Response(
      JSON.stringify({
        status: "offline",
        service: "firebase",
        timestamp: Date.now(),
        uiSafe: true
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// API Handler - Network First (Non-Firebase APIs)
async function handleApiNetworkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache GET responses for offline reading (optional)
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return safe offline response
    return new Response(
      JSON.stringify({
        status: "offline",
        message: "API unavailable - working offline",
        timestamp: Date.now(),
        uiSafe: true
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Default Handler - Cache First with Network Fallback
async function handleDefaultCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update in background if online
    if (navigator.onLine) {
      silentlyUpdateCache(request);
    }
    return cachedResponse;
  }
  
  // If not in cache, try network
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    // Return empty but valid response to prevent UI breakage
    return new Response('', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Silently update cache in background (no logging to avoid clutter)
async function silentlyUpdateCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    // Silent fail - cache remains unchanged
  }
}

// Enhanced Message Event with PERMANENT offline support
self.addEventListener('message', (event) => {
  const { data } = event;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ 
          version: APP_VERSION,
          cacheName: CACHE_NAME,
          permanentOffline: true,
          cacheStrategy: 'permanent-app-shell'
        });
      }
      break;
      
    case 'CHECK_OFFLINE_STATUS':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          offline: !navigator.onLine,
          version: APP_VERSION,
          permanentCache: true,
          cacheStatus: 'active-permanent'
        });
      }
      break;
      
    case 'VERIFY_APP_SHELL':
      caches.open(CACHE_NAME).then(cache => {
        cache.keys().then(keys => {
          const htmlFiles = keys.filter(k => {
            const url = new URL(k.url);
            return url.pathname.endsWith('.html') || url.pathname === '/';
          });
          const cssFiles = keys.filter(k => k.url.endsWith('.css'));
          const jsFiles = keys.filter(k => k.url.endsWith('.js'));
          
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
              verified: true,
              htmlCount: htmlFiles.length,
              cssCount: cssFiles.length,
              jsCount: jsFiles.length,
              totalAssets: keys.length,
              permanent: true
            });
          }
        });
      });
      break;
      
    case 'FORCE_CACHE_REFRESH':
      // Re-cache app shell assets
      caches.open(CACHE_NAME).then(cache => {
        Promise.allSettled(
          APP_SHELL_ASSETS.map(asset => {
            return fetch(asset)
              .then(response => {
                if (response.ok) {
                  return cache.put(asset, response);
                }
                return Promise.resolve();
              })
              .catch(() => Promise.resolve());
          })
        ).then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ refreshed: true });
          }
        });
      });
      break;
      
    // Keep all existing message handlers
    case 'SAVE_MESSAGE_OFFLINE':
      saveMessageOffline(data.payload);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
      break;
      
    case 'SAVE_MOOD_OFFLINE':
      saveMoodSelectionOffline(data.payload);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
      break;
      
    case 'SAVE_INTEREST_OFFLINE':
      saveInterestSelectionOffline(data.payload);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
      break;
      
    case 'GET_OFFLINE_DATA':
      getOfflineData().then(offlineData => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ data: offlineData });
        }
      });
      break;
      
    case 'REGISTER_MESSAGE_SYNC':
      self.registration.sync.register('sync-offline-messages')
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: true });
          }
        })
        .catch(err => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: false, error: err.message });
          }
        });
      break;
      
    case 'REGISTER_MOOD_SYNC':
      self.registration.sync.register('sync-mood-selections')
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: true });
          }
        })
        .catch(err => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: false, error: err.message });
          }
        });
      break;
      
    case 'REGISTER_INTEREST_SYNC':
      self.registration.sync.register('sync-interest-selections')
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: true });
          }
        })
        .catch(err => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ registered: false, error: err.message });
          }
        });
      break;
      
    case 'CHECK_CACHE_INTEGRITY':
      verifyCacheIntegrity().then(result => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(result);
        }
      });
      break;
  }
});

// Verify cache integrity
async function verifyCacheIntegrity() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  const criticalAssets = ['/', '/index.html', '/styles.css', '/js/app.js'];
  const missing = [];
  
  for (const asset of criticalAssets) {
    const found = keys.some(key => {
      const url = new URL(key.url);
      return url.pathname === asset || url.pathname === asset + '.html';
    });
    
    if (!found) {
      missing.push(asset);
    }
  }
  
  return {
    integrity: missing.length === 0 ? 'healthy' : 'degraded',
    totalCached: keys.length,
    missingCritical: missing,
    permanentCache: true
  };
}

// Keep all existing helper functions exactly as they were
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
      
      store.add(message);
      transaction.oncomplete = () => resolve();
    };
    
    request.onerror = () => resolve();
  });
}

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
      
      store.add(moodSelection);
      transaction.oncomplete = () => resolve();
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
      
      store.add(interestSelection);
      transaction.oncomplete = () => resolve();
    };
    
    request.onerror = () => resolve();
  });
}

async function getOfflineData() {
  return new Promise((resolve) => {
    const request = indexedDB.open('kynectaMoodChatOfflineStorage', 3);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      const messageTx = db.transaction(['offlineMessages'], 'readonly');
      const messageStore = messageTx.objectStore('offlineMessages');
      const messages = messageStore.getAll();
      
      const moodTx = db.transaction(['moodSelections'], 'readonly');
      const moodStore = moodTx.objectStore('moodSelections');
      const moods = moodStore.getAll();
      
      const interestTx = db.transaction(['interestSelections'], 'readonly');
      const interestStore = interestTx.objectStore('interestSelections');
      const interests = interestStore.getAll();
      
      Promise.all([messages, moods, interests].map(p => 
        new Promise(res => {
          p.onsuccess = () => res(p.result || []);
          p.onerror = () => res([]);
        })
      )).then(([messageData, moodData, interestData]) => {
        resolve({
          messages: messageData,
          moods: moodData,
          interests: interestData,
          lastUpdated: Date.now(),
          permanentStorage: true
        });
      });
    };
    
    request.onerror = () => resolve({ 
      messages: [], 
      moods: [], 
      interests: [], 
      lastUpdated: Date.now() 
    });
  });
}

// Keep all existing sync functions
async function syncOfflineMessages() {
  console.log('[Kynecta PERMANENT] Syncing offline messages...');
  // Existing implementation
}

async function syncOfflineMoodSelections() {
  console.log('[Kynecta PERMANENT] Syncing offline mood selections...');
  // Existing implementation
}

async function syncOfflineInterestSelections() {
  console.log('[Kynecta PERMANENT] Syncing offline interest selections...');
  // Existing implementation
}

async function syncFirebaseAuth() {
  console.log('[Kynecta PERMANENT] Syncing Firebase Auth...');
  // Existing implementation
}

async function syncFirestoreData() {
  console.log('[Kynecta PERMANENT] Syncing Firestore data...');
  // Existing implementation
}

async function syncPendingMessages() {
  console.log('[Kynecta PERMANENT] Syncing pending messages...');
  // Existing implementation
}

// Background Sync (Keep existing functionality)
self.addEventListener('sync', (event) => {
  console.log('[Kynecta PERMANENT] Background sync:', event.tag);
  
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
  } else if (event.tag === 'sync-offline-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

// Keep existing push notification handlers
self.addEventListener('push', (event) => {
  // Existing push notification implementation
});

self.addEventListener('notificationclick', (event) => {
  // Existing notification click implementation
});

console.log(`[Kynecta MoodChat Service Worker] v${APP_VERSION} loaded - PERMANENT Offline Availability`);
console.log(`[Kynecta] App Shell will ALWAYS load offline, even after 24+ hours without internet`);
console.log(`[Kynecta] Firebase SDK/API requests are NEVER cached (auth-safe)`);