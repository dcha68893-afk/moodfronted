// Service Worker for Kynecta MoodChat - App Shell Cache-First Edition
// Version: 4.3.0 - App Shell Strategy
// Strategy: Cache-First for App Shell, Stale-While-Revalidate for APIs
// Enhanced: No offline screens - UI always loads from cache

const APP_VERSION = '4.3.0';
const STATIC_CACHE_NAME = `moodchat-app-shell-v${APP_VERSION.replace(/\./g, '-')}`;
const USER_SESSION_KEY = 'moodchat-current-user';
const DEVICE_ID_KEY = 'moodchat-device-id';
const SESSION_EXPIRY_KEY = 'moodchat-session-expiry';
const LOGGED_OUT_FLAG = 'moodchat-logged-out';
const API_CACHE_NAME = 'moodchat-api-cache';
const BACKGROUND_SYNC_TAG = 'moodchat-background-sync';

// APP SHELL MANIFEST - Essential UI assets only
const APP_SHELL_MANIFEST = {
  // Core HTML pages (app shell)
  html: [
    '/',
    '/index.html',
    '/chat.html',
    '/message.html',
    '/messages.html',
    '/calls.html',
    '/settings.html',
    '/group.html',
    '/tools.html',
    '/friend.html',
    '/status.html',
    '/call.html',
    '/Tools.html'
  ],
  
  // Core CSS
  css: [
    '/styles.css',
    '/css/styles.css',
    '/css/main.css',
    '/css/layout.css',
    '/css/chat.css'
  ],
  
  // Core JavaScript (app shell functionality)
  js: [
    '/js/app.js',
    '/settingsManager.js',
    '/js/chat.js',
    '/js/main.js',
    '/js/auth.js',
    '/js/ui.js',
    '/js/utils.js'
  ],
  
  // Core Images
  images: [
    '/icons/moodchat-192.png',
    '/icons/moodchat-512.png',
    '/icons/icon-72x72.png',
    '/icons/icon-128x128.png',
    '/icons/icon-512x512.png',
    '/icons/favicon.ico'
  ],
  
  // Core Configuration
  config: [
    '/manifest.json'
  ]
};

// Background update queue for silent refreshes
const updateQueue = new Map();

// Cache TTLs
const CACHE_TTL = {
  APP_SHELL: 30 * 24 * 60 * 60 * 1000, // 30 days
  API: 5 * 60 * 1000, // 5 minutes
  USER_DATA: 30 * 60 * 1000 // 30 minutes
};

// Network timeout for performance
const NETWORK_TIMEOUT = 3000; // 3 seconds

// Get all app shell assets as a flat array
function getAllAppShellAssets() {
  return [
    ...APP_SHELL_MANIFEST.html,
    ...APP_SHELL_MANIFEST.css,
    ...APP_SHELL_MANIFEST.js,
    ...APP_SHELL_MANIFEST.images,
    ...APP_SHELL_MANIFEST.config
  ];
}

// Check if request is for API
function isApiRequest(url) {
  const apiPatterns = [
    '/api/',
    '/auth/',
    '/graphql',
    '.googleapis.com',
    'firebaseio.com'
  ];
  
  return apiPatterns.some(pattern => 
    url.pathname.includes(pattern) || url.hostname.includes(pattern)
  );
}

// Check if request contains user data
function isUserDataRequest(url) {
  const userDataPatterns = [
    '/user/',
    '/profile/',
    '/messages/',
    '/chats/',
    '/conversations/',
    '/settings/',
    '/contacts/',
    '/friends/'
  ];
  
  return userDataPatterns.some(pattern => url.pathname.includes(pattern));
}

// Check if asset is part of app shell
function isAppShellAsset(url) {
  const allAssets = getAllAppShellAssets();
  return allAssets.some(asset => 
    url.pathname === asset || 
    url.pathname.endsWith(asset) ||
    asset.includes(url.pathname)
  );
}

// Check if request is for an HTML page
function isHtmlRequest(request) {
  return request.headers.get('Accept')?.includes('text/html') || 
         request.url.endsWith('.html') ||
         request.url === '/' ||
         request.url.includes('.html?') ||
         request.mode === 'navigate';
}

// Get current user session
async function getCurrentUserSession() {
  try {
    const db = await openUserDB();
    
    const sessionData = await db.get('session', USER_SESSION_KEY) || {};
    const deviceId = await db.get('session', DEVICE_ID_KEY) || {};
    const expiryData = await db.get('session', SESSION_EXPIRY_KEY) || {};
    const logoutFlag = await db.get('session', LOGGED_OUT_FLAG) || {};
    
    db.close();
    
    const now = Date.now();
    
    if (sessionData.userId && 
        deviceId.value && 
        expiryData.timestamp && 
        logoutFlag.value !== true &&
        now < expiryData.timestamp) {
      
      return {
        userId: sessionData.userId,
        deviceId: deviceId.value,
        isLoggedIn: true,
        expiry: expiryData.timestamp,
        accountType: sessionData.accountType || 'personal'
      };
    }
    
    return null;
  } catch (error) {
    console.warn('[Service Worker] Could not get user session:', error);
    return null;
  }
}

// Store user session
async function storeUserSession(userData) {
  try {
    const db = await openUserDB();
    const now = Date.now();
    const expiryTime = now + (24 * 60 * 60 * 1000);
    
    await Promise.all([
      db.put('session', { 
        key: USER_SESSION_KEY, 
        userId: userData.userId,
        accountType: userData.accountType || 'personal',
        timestamp: now
      }),
      db.put('session', { 
        key: DEVICE_ID_KEY, 
        value: userData.deviceId,
        timestamp: now
      }),
      db.put('session', { 
        key: SESSION_EXPIRY_KEY, 
        timestamp: expiryTime
      }),
      db.put('session', { 
        key: LOGGED_OUT_FLAG, 
        value: false,
        timestamp: now
      })
    ]);
    
    db.close();
    return true;
  } catch (error) {
    console.error('[Service Worker] Failed to store user session:', error);
    return false;
  }
}

// Clear user session (logout)
async function clearUserSession() {
  try {
    const db = await openUserDB();
    
    await db.put('session', { 
      key: LOGGED_OUT_FLAG, 
      value: true,
      timestamp: Date.now()
    });
    
    // Clear API cache on logout
    await caches.delete(API_CACHE_NAME);
    
    db.close();
    return true;
  } catch (error) {
    console.error('[Service Worker] Error clearing session:', error);
    return false;
  }
}

// Generate or retrieve device ID
async function generateDeviceId() {
  try {
    const db = await openUserDB();
    const deviceData = await db.get('session', DEVICE_ID_KEY);
    
    if (deviceData && deviceData.value) {
      db.close();
      return deviceData.value;
    }
    
    const newDeviceId = 'device-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    await db.put('session', { 
      key: DEVICE_ID_KEY, 
      value: newDeviceId,
      timestamp: Date.now()
    });
    
    db.close();
    return newDeviceId;
  } catch (error) {
    return 'device-' + Date.now();
  }
}

// Open user IndexedDB
function openUserDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MoodChatUserDB', 2);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'key' });
      }
      
      if (!db.objectStoreNames.contains('users')) {
        const usersStore = db.createObjectStore('users', { keyPath: 'userId' });
        usersStore.createIndex('deviceId', 'deviceId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('devices')) {
        db.createObjectStore('devices', { keyPath: 'deviceId' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      db.get = (storeName, key) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.get(key);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      };
      
      db.put = (storeName, data) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const request = store.put(data);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      };
      
      resolve(db);
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// Cache with metadata for TTL management
async function cacheWithMetadata(request, response, cacheName) {
  if (!response || response.status !== 200) return;
  
  const cache = await caches.open(cacheName);
  const metadata = {
    url: request.url,
    timestamp: Date.now(),
    ttl: getCacheTTL(request.url)
  };
  
  const headers = new Headers(response.headers);
  headers.set('x-sw-cache-timestamp', metadata.timestamp.toString());
  headers.set('x-sw-cache-ttl', metadata.ttl.toString());
  
  const cachedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
  
  await cache.put(request, cachedResponse);
  return metadata;
}

// Get cache TTL based on request type
function getCacheTTL(url) {
  const urlObj = new URL(url);
  
  if (isApiRequest(urlObj)) {
    return CACHE_TTL.API;
  }
  
  if (isUserDataRequest(urlObj)) {
    return CACHE_TTL.USER_DATA;
  }
  
  return CACHE_TTL.APP_SHELL;
}

// Check if cached response is stale
function isStale(cachedResponse) {
  if (!cachedResponse) return true;
  
  const timestamp = cachedResponse.headers.get('x-sw-cache-timestamp');
  const ttl = cachedResponse.headers.get('x-sw-cache-ttl');
  
  if (!timestamp || !ttl) return true;
  
  const age = Date.now() - parseInt(timestamp);
  return age > parseInt(ttl);
}

// APP SHELL STRATEGY: Cache-First for UI assets
async function appShellCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always return cached app shell immediately
  if (cachedResponse) {
    // Update in background if stale (silent refresh)
    if (isStale(cachedResponse)) {
      updateAppShellInBackground(request);
    }
    return cachedResponse;
  }
  
  // If not in cache, try network
  try {
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT)
    );
    
    const response = await Promise.race([networkPromise, timeoutPromise]);
    
    if (response && response.status === 200) {
      await cacheWithMetadata(request, response.clone(), STATIC_CACHE_NAME);
    }
    
    return response;
  } catch (error) {
    // Network failed - return any cached version
    const fallbackResponse = await cache.match(request);
    if (fallbackResponse) {
      return fallbackResponse;
    }
    
    // FIXED: Return minimal response instead of index.html for non-HTML assets
    if (isHtmlRequest(request)) {
      // For HTML pages, try to return the requested page, not index.html
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // For non-HTML assets, return empty
    return new Response('', { status: 200 });
  }
}

// API STRATEGY: Stale-While-Revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always initiate network request for fresh data
  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200) {
        await cacheWithMetadata(request, response.clone(), API_CACHE_NAME);
        
        // Notify clients about updated data
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'API_DATA_UPDATED',
            url: request.url,
            timestamp: Date.now()
          });
        });
      }
      return response;
    })
    .catch(() => {
      // Network failed - silently continue with cached data
      return null;
    });
  
  // Return cached response immediately if available
  if (cachedResponse) {
    // Start network request in background
    networkFetch.catch(() => {}); // Ignore errors
    return cachedResponse;
  }
  
  // Wait for network if no cache
  try {
    const response = await networkFetch;
    if (response) {
      return response;
    }
    
    // If network failed and no cache, return empty response
    return new Response(JSON.stringify({ 
      offline: true,
      timestamp: Date.now() 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      offline: true,
      timestamp: Date.now() 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// Update app shell in background
async function updateAppShellInBackground(request) {
  const url = request.url;
  
  if (updateQueue.has(url)) return;
  
  updateQueue.set(url, true);
  
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      await cacheWithMetadata(request, response.clone(), STATIC_CACHE_NAME);
    }
  } catch (error) {
    // Silent fail - app shell remains functional
  } finally {
    updateQueue.delete(url);
  }
}

// Clean up expired cache entries
async function cleanupExpiredCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response && isStale(response)) {
        await cache.delete(request);
      }
    }
  } catch (error) {
    console.warn(`[Service Worker] Error cleaning expired cache ${cacheName}:`, error);
  }
}

// Clean up old caches
async function cleanupOldCaches() {
  try {
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
      if (cacheName.startsWith('moodchat-') && 
          cacheName !== STATIC_CACHE_NAME && 
          cacheName !== API_CACHE_NAME) {
        await caches.delete(cacheName);
      }
    }
    
    // Clean expired entries
    await cleanupExpiredCache(STATIC_CACHE_NAME);
    await cleanupExpiredCache(API_CACHE_NAME);
    
  } catch (error) {
    console.warn('[Service Worker] Error cleaning old caches:', error);
  }
}

// HTML PAGE HANDLER: Each HTML page loads its own UI
async function htmlPageHandler(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always return cached HTML page if available
  if (cachedResponse) {
    // Update in background if stale
    if (isStale(cachedResponse)) {
      updateAppShellInBackground(request);
    }
    return cachedResponse;
  }
  
  // If not in cache, try network
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      // Cache the HTML page for offline use
      await cacheWithMetadata(request, response.clone(), STATIC_CACHE_NAME);
      return response;
    }
  } catch (error) {
    // Network failed - the HTML page is not cached
    console.warn(`[Service Worker] HTML page not cached: ${request.url}`);
  }
  
  // IMPORTANT: Return empty HTML instead of redirecting to index.html
  // This allows the page's JavaScript to load and show its own UI
  return new Response('', {
    status: 200,
    headers: { 
      'Content-Type': 'text/html',
      'x-sw-offline': 'true'
    }
  });
}

// Main fetch strategy
async function appShellStrategy(request) {
  const url = new URL(request.url);
  
  // API requests: Stale-While-Revalidate
  if (isApiRequest(url) || isUserDataRequest(url)) {
    return staleWhileRevalidate(request);
  }
  
  // HTML page requests: Special handler to show each page's own UI
  if (isHtmlRequest(request)) {
    return htmlPageHandler(request);
  }
  
  // App shell assets: Cache-First
  if (isAppShellAsset(url)) {
    return appShellCacheFirst(request);
  }
  
  // Other static assets: Try cache, then network
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const response = await fetch(request);
    if (response.status === 200) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Return empty response for non-critical assets
    return new Response('', { status: 200 });
  }
}

// INSTALLATION - Pre-cache app shell
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing App Shell v${APP_VERSION}`);
  
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME);
      const assets = getAllAppShellAssets();
      
      console.log(`[Service Worker] Precaching ${assets.length} app shell assets...`);
      
      // Debug: Log all HTML files being cached
      const htmlFiles = APP_SHELL_MANIFEST.html;
      console.log('[Service Worker] Caching HTML pages:', htmlFiles);
      
      try {
        await cache.addAll(assets);
        console.log('[Service Worker] App shell precached successfully');
        
        // Verify HTML files are cached
        for (const htmlFile of htmlFiles) {
          const cached = await cache.match(htmlFile);
          console.log(`[Service Worker] ✓ ${htmlFile}: ${cached ? 'CACHED' : 'MISSING'}`);
        }
      } catch (error) {
        console.warn('[Service Worker] Some assets failed to cache:', error);
      }
    })()
  );
});

// ACTIVATION - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating App Shell v' + APP_VERSION);
  
  event.waitUntil(
    (async () => {
      await cleanupOldCaches();
      await generateDeviceId();
      await self.clients.claim();
      
      console.log('[Service Worker] APP SHELL STRATEGY ACTIVE');
      console.log('[Service Worker] 1. UI loads instantly from cache');
      console.log('[Service Worker] 2. No offline screens or banners');
      console.log('[Service Worker] 3. Each HTML page shows its own UI offline');
      console.log('[Service Worker] 4. APIs use stale-while-revalidate');
      console.log('[Service Worker] 5. Silent background updates');
    })()
  );
});

// FETCH HANDLER - App Shell Strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip browser extensions and special URLs
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'chrome:' ||
      url.protocol === 'moz-extension:' ||
      url.pathname.includes('__bgSync')) {
    return;
  }
  
  // Use app shell strategy for ALL requests
  event.respondWith(appShellStrategy(request));
});

// MESSAGE HANDLING
self.addEventListener('message', (event) => {
  const { data } = event;
  
  switch (data.type) {
    case 'GET_CACHE_INFO':
      event.waitUntil(
        (async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const apiCache = await caches.open(API_CACHE_NAME);
          const keys = await cache.keys();
          const apiKeys = await apiCache.keys();
          const session = await getCurrentUserSession();
          const deviceId = await generateDeviceId();
          
          // Check which HTML pages are cached
          const htmlPages = APP_SHELL_MANIFEST.html;
          const cachedHtml = [];
          
          for (const page of htmlPages) {
            const cached = await cache.match(page);
            if (cached) cachedHtml.push(page);
          }
          
          event.source.postMessage({
            type: 'CACHE_INFO',
            appShellCacheSize: keys.length,
            apiCacheSize: apiKeys.length,
            cachedHtmlPages: cachedHtml,
            totalHtmlPages: htmlPages.length,
            userId: session ? session.userId : null,
            deviceId: deviceId,
            isLoggedIn: session ? session.isLoggedIn : false,
            version: APP_VERSION,
            strategy: 'Each HTML page shows its own UI offline'
          });
        })()
      );
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        (async () => {
          await caches.delete(STATIC_CACHE_NAME);
          await caches.delete(API_CACHE_NAME);
          await clearUserSession();
          
          event.source.postMessage({
            type: 'CACHE_CLEARED',
            timestamp: Date.now(),
            message: 'All caches cleared'
          });
        })()
      );
      break;
      
    case 'USER_LOGIN':
      event.waitUntil(
        (async () => {
          if (data.userId && data.deviceId) {
            const success = await storeUserSession({
              userId: data.userId,
              deviceId: data.deviceId,
              accountType: data.accountType
            });
            
            if (success) {
              console.log(`[Service Worker] User ${data.userId} logged in`);
            }
          }
          
          event.source.postMessage({
            type: 'USER_SESSION_UPDATED',
            timestamp: Date.now(),
            success: !!data.userId
          });
        })()
      );
      break;
      
    case 'USER_LOGOUT':
      event.waitUntil(
        (async () => {
          const success = await clearUserSession();
          event.source.postMessage({
            type: 'USER_LOGGED_OUT',
            timestamp: Date.now(),
            success: success
          });
        })()
      );
      break;
      
    case 'GET_USER_INFO':
      event.waitUntil(
        (async () => {
          const session = await getCurrentUserSession();
          const deviceId = await generateDeviceId();
          
          event.source.postMessage({
            type: 'USER_INFO_RESPONSE',
            userId: session ? session.userId : null,
            deviceId: deviceId,
            isLoggedIn: session ? session.isLoggedIn : false,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    case 'UPDATE_APP_SHELL':
      event.waitUntil(
        (async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const assets = getAllAppShellAssets();
          
          let updatedCount = 0;
          for (const asset of assets) {
            try {
              const response = await fetch(asset);
              if (response.status === 200) {
                await cacheWithMetadata(new Request(asset), response.clone(), STATIC_CACHE_NAME);
                updatedCount++;
              }
            } catch (error) {
              console.warn(`Failed to update app shell asset: ${asset}`, error);
            }
          }
          
          event.source.postMessage({
            type: 'APP_SHELL_UPDATED',
            count: updatedCount,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    case 'TEST_STRATEGY':
      event.waitUntil(
        (async () => {
          const testUrls = [
            '/',
            '/index.html',
            '/chat.html',
            '/status.html',
            '/settings.html',
            '/style.css',
            '/app.js',
            '/api/user/test'
          ];
          
          const results = await Promise.all(
            testUrls.map(async (url) => {
              const cache = await caches.open(STATIC_CACHE_NAME);
              const apiCache = await caches.open(API_CACHE_NAME);
              const cached = url.includes('/api/') 
                ? await apiCache.match(url)
                : await cache.match(url);
              
              return {
                url,
                cached: !!cached,
                strategy: url.includes('/api/') ? 'stale-while-revalidate' : 
                         url.endsWith('.html') || url === '/' ? 'html-page-handler' : 'cache-first'
              };
            })
          );
          
          event.source.postMessage({
            type: 'STRATEGY_TEST_RESULTS',
            results: results,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    case 'VERIFY_HTML_CACHE':
      event.waitUntil(
        (async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const htmlPages = APP_SHELL_MANIFEST.html;
          const cacheStatus = [];
          
          for (const page of htmlPages) {
            const cached = await cache.match(page);
            cacheStatus.push({
              page: page,
              cached: !!cached
            });
          }
          
          event.source.postMessage({
            type: 'HTML_CACHE_STATUS',
            pages: cacheStatus,
            timestamp: Date.now()
          });
        })()
      );
      break;
  }
});

// PUSH NOTIFICATIONS
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Kynecta MoodChat', body: 'New message' };
  }
  
  const options = {
    body: data.body || 'New message',
    icon: '/icons/moodchat-192.png',
    badge: '/icons/moodchat-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/chat.html'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kynecta MoodChat', options)
  );
});

// NOTIFICATION CLICK
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/chat.html';
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// INITIALIZATION LOG
console.log(`[Kynecta MoodChat Service Worker] App Shell Strategy v${APP_VERSION} loaded`);
console.log('[Service Worker] STRATEGY: EACH HTML PAGE SHOWS ITS OWN UI OFFLINE');
console.log('[Service Worker] 1. Each HTML page loads its own UI from cache');
console.log('[Service Worker] 2. No redirects to index.html - stay on same page');
console.log('[Service Worker] 3. No offline screens, banners, or messages');
console.log('[Service Worker] 4. APIs refresh silently in background');
console.log('[Service Worker] 5. Works with sleeping server (Render cold start)');
console.log('[Service Worker] READY: Each page shows its own UI offline');