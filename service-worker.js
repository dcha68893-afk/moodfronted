// Service Worker for Kynecta MoodChat - User-Isolated Cache-First Strategy
// Version: 4.1.0 - Device-Based Authentication Integration
// Strategy: Cache-First for static assets, User-Specific for dynamic data
// Enhanced with: Stale-While-Revalidate, Background Sync, API Response Caching

const APP_VERSION = '4.1.0';
const STATIC_CACHE_NAME = `moodchat-static-v${APP_VERSION.replace(/\./g, '-')}`;
const USER_SESSION_KEY = 'moodchat-current-user';
const DEVICE_ID_KEY = 'moodchat-device-id';
const SESSION_EXPIRY_KEY = 'moodchat-session-expiry';
const LOGGED_OUT_FLAG = 'moodchat-logged-out';
const API_CACHE_NAME = 'moodchat-api-cache';
const BACKGROUND_SYNC_TAG = 'moodchat-background-sync';

// COMPLETE ASSET MANIFEST - ALL STATIC FILES
const STATIC_MANIFEST = {
  // HTML Pages (public templates only)
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
    '/Tools.html',
    '/tools/analytics.html',
    '/tools/crm.html',
    '/tools/data-export.html',
    '/tools/image-generator.html',
    '/tools/image-sender.html',
    '/tools/content-generator.html',
  ],
  
  // CSS - All stylesheets
  css: [
    '/styles.css',
    '/css/styles.css',
    '/css/main.css',
    '/css/layout.css',
    '/css/chat.css',
    '/css/forms.css',
    '/css/responsive.css',
    '/style.css',
    '/assets/css/app.css',
    '/assets/css/main.css',
    '/assets/css/theme.css',
    '/layout.css'
  ],
  
  // JavaScript - All scripts (excluding user-specific data)
  js: [
    '/js/app.js',
    '/settingsManager.js',
    '/js/chat.js',
    '/js/main.js',
    '/js/auth.js',
    '/js/ui.js',
    '/js/utils.js',
    '/js/notifications.js',
    '/app.js',
    '/main.js',
    '/bundle.js',
    '/assets/js/app.js',
    '/assets/js/vendor.js',
    '/assets/js/components.js'
  ],
  
  // Images - Static visual assets
  images: [
    '/icons/moodchat-192.png',
    '/icons/moodchat-512.png',
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png',
    '/icons/favicon.ico',
    '/assets/logo.png',
    '/assets/logo.svg',
    '/assets/favicon.ico',
    '/assets/avatar-default.png',
    '/assets/background.jpg',
    '/assets/placeholder.jpg'
  ],
  
  // Fonts
  fonts: [
    '/fonts/roboto.woff2',
    '/fonts/roboto.woff',
    '/fonts/material-icons.woff2',
    '/assets/fonts/Inter.woff2'
  ],
  
  // Configuration (static)
  config: [
    '/manifest.json',
    '/firebase-messaging-sw.js',
    '/firebase-config.json',
    '/app-config.json'
  ],
  
  // Vendor dependencies
  vendor: [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://code.jquery.com/jquery-3.6.0.min.js',
    'https://unpkg.com/axios/dist/axios.min.js'
  ]
};

// NEW: Background update queue for silent refreshes
const updateQueue = new Map();

// NEW: Performance optimization - Cache TTLs
const CACHE_TTL = {
  STATIC: 7 * 24 * 60 * 60 * 1000, // 7 days
  API: 5 * 60 * 1000, // 5 minutes
  USER_DATA: 30 * 60 * 1000, // 30 minutes
  HTML: 24 * 60 * 60 * 1000 // 24 hours
};

// NEW: Network timeout for performance
const NETWORK_TIMEOUT = 3000; // 3 seconds

// NEW: Critical assets that must be cached for offline
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
    '/css/styles.css',
  '/js/app.js',
  '/js/auth.js',
  '/icons/moodchat-192.png',
  '/manifest.json'
];

// Get current user session with device validation
async function getCurrentUserSession() {
  try {
    const db = await openUserDB();
    
    // Check all session data
    const sessionData = await db.get('session', USER_SESSION_KEY) || {};
    const deviceId = await db.get('session', DEVICE_ID_KEY) || {};
    const expiryData = await db.get('session', SESSION_EXPIRY_KEY) || {};
    const logoutFlag = await db.get('session', LOGGED_OUT_FLAG) || {};
    
    db.close();
    
    const now = Date.now();
    
    // Check for auto-login conditions
    if (sessionData.userId && 
        deviceId.value && 
        expiryData.timestamp && 
        logoutFlag.value !== true) {
      
      // Check session expiry
      if (now < expiryData.timestamp) {
        // Session is valid, return user info
        return {
          userId: sessionData.userId,
          deviceId: deviceId.value,
          isLoggedIn: true,
          expiry: expiryData.timestamp,
          accountType: sessionData.accountType || 'personal'
        };
      } else {
        // Session expired
        console.log('[Service Worker] Session expired');
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('[Service Worker] Could not get user session:', error);
    return null;
  }
}

// Store user session with device info
async function storeUserSession(userData) {
  try {
    const db = await openUserDB();
    const now = Date.now();
    
    // Calculate expiry (24 hours from now)
    const expiryTime = now + (24 * 60 * 60 * 1000);
    
    // Store all session data
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
    
    // Also store in cache for quick access
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(
      new Request('/__user_session__'),
      new Response(JSON.stringify({ 
        userId: userData.userId,
        deviceId: userData.deviceId,
        expiry: expiryTime,
        timestamp: now 
      }))
    );
    
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
    
    // Set logged out flag but keep data for quick login
    await db.put('session', { 
      key: LOGGED_OUT_FLAG, 
      value: true,
      timestamp: Date.now()
    });
    
    // Clear user-specific cache
    const userCacheName = await getUserCacheName();
    if (userCacheName) {
      await caches.delete(userCacheName);
    }
    
    // NEW: Clear API cache on logout
    await caches.delete(API_CACHE_NAME);
    
    db.close();
    
    return true;
  } catch (error) {
    console.error('[Service Worker] Error clearing session:', error);
    return false;
  }
}

// Get current user ID (compatibility function)
async function getCurrentUserId() {
  const session = await getCurrentUserSession();
  return session ? session.userId : null;
}

// Store current user ID (compatibility function)
async function storeCurrentUserId(userId) {
  const deviceId = await generateDeviceId();
  return storeUserSession({
    userId: userId,
    deviceId: deviceId
  });
}

// Get user-specific cache name
async function getUserCacheName() {
  const session = await getCurrentUserSession();
  if (!session || !session.userId) return null;
  
  // Create cache name with user ID and device ID for isolation
  const userHash = await simpleHash(session.userId);
  const deviceHash = await simpleHash(session.deviceId);
  return `moodchat-user-${userHash}-${deviceHash}`;
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
    
    // Generate new device ID
    const newDeviceId = 'device-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    await db.put('session', { 
      key: DEVICE_ID_KEY, 
      value: newDeviceId,
      timestamp: Date.now()
    });
    
    db.close();
    return newDeviceId;
  } catch (error) {
    // Fallback to localStorage if IndexedDB fails
    return 'device-' + Date.now();
  }
}

// Simple hash function for IDs
async function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

// Open user IndexedDB with expanded schema
function openUserDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MoodChatUserDB', 2); // Version 2 for expanded schema
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'key' });
      }
      
      if (!db.objectStoreNames.contains('users')) {
        const usersStore = db.createObjectStore('users', { keyPath: 'userId' });
        usersStore.createIndex('deviceId', 'deviceId', { unique: false });
        usersStore.createIndex('lastLogin', 'lastLogin', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('devices')) {
        db.createObjectStore('devices', { keyPath: 'deviceId' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // Add helper methods
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
      
      db.getAll = (storeName, indexName, key) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const index = store.index(indexName);
          const request = index.getAll(key);
          
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

// Get client user info via message
function getClientUserInfo(client) {
  return new Promise((resolve, reject) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      if (event.data && event.data.type === 'USER_INFO_RESPONSE') {
        resolve(event.data);
      } else {
        resolve(null);
      }
    };
    
    // Set timeout
    setTimeout(() => resolve(null), 100);
    
    client.postMessage({ type: 'GET_USER_INFO' }, [messageChannel.port2]);
  });
}

// Get all static assets as a flat array
function getAllStaticAssets() {
  return [
    ...STATIC_MANIFEST.html,
    ...STATIC_MANIFEST.css,
    ...STATIC_MANIFEST.js,
    ...STATIC_MANIFEST.images,
    ...STATIC_MANIFEST.fonts,
    ...STATIC_MANIFEST.config,
    ...STATIC_MANIFEST.vendor
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

// NEW: Check if asset is critical for offline
function isCriticalAsset(url) {
  return CRITICAL_ASSETS.some(pattern => 
    url.pathname === pattern || url.pathname.endsWith(pattern)
  );
}

// NEW: Cache with metadata for TTL management
async function cacheWithMetadata(request, response, cacheName) {
  if (!response || response.status !== 200) return;
  
  const cache = await caches.open(cacheName);
  const metadata = {
    url: request.url,
    timestamp: Date.now(),
    ttl: getCacheTTL(request.url)
  };
  
  // Create a new response with metadata in headers
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

// NEW: Get cache TTL based on request type
function getCacheTTL(url) {
  const urlObj = new URL(url);
  
  if (isApiRequest(urlObj)) {
    return CACHE_TTL.API;
  }
  
  if (isUserDataRequest(urlObj)) {
    return CACHE_TTL.USER_DATA;
  }
  
  if (urlObj.pathname.endsWith('.html')) {
    return CACHE_TTL.HTML;
  }
  
  return CACHE_TTL.STATIC;
}

// NEW: Check if cached response is stale
function isStale(cachedResponse) {
  if (!cachedResponse) return true;
  
  const timestamp = cachedResponse.headers.get('x-sw-cache-timestamp');
  const ttl = cachedResponse.headers.get('x-sw-cache-ttl');
  
  if (!timestamp || !ttl) return true;
  
  const age = Date.now() - parseInt(timestamp);
  return age > parseInt(ttl);
}

// NEW: Cache-first with background update strategy (OFFLINE-FIRST)
async function cacheFirstWithBackgroundUpdate(request) {
  const url = new URL(request.url);
  
  // Try to get from cache first
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // If we have a cached response, return it immediately
  if (cachedResponse) {
    // Check if stale, if so, update in background
    if (isStale(cachedResponse)) {
      updateInBackground(request);
    }
    return cachedResponse;
  }
  
  // If not in cache, try network (with offline fallback)
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.status === 200) {
      await cacheWithMetadata(request, networkResponse.clone(), STATIC_CACHE_NAME);
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, create offline response
    return createOfflineResponse(request);
  }
}

// NEW: API cache-first with background sync
async function apiCacheFirstWithBackgroundSync(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always return cached API response immediately if available
  if (cachedResponse) {
    // Update from network in background
    updateApiInBackground(request);
    return cachedResponse;
  }
  
  // If not in cache, try network
  try {
    const response = await fetch(request);
    
    // Cache successful API responses
    if (response.status === 200) {
      await cacheWithMetadata(request, response.clone(), API_CACHE_NAME);
    }
    
    return response;
  } catch (error) {
    // Return cached offline response
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return generic offline API response
    return new Response(JSON.stringify({
      offline: true,
      message: 'API data not available offline',
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// NEW: Update API cache in background
async function updateApiInBackground(request) {
  const url = request.url;
  
  // Skip if already in queue
  if (updateQueue.has(url)) return;
  
  updateQueue.set(url, true);
  
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(API_CACHE_NAME);
      await cacheWithMetadata(request, response.clone(), API_CACHE_NAME);
      console.log(`[Service Worker] API cache updated: ${url}`);
      
      // Notify clients about updated API data
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'API_DATA_UPDATED',
          url: url,
          timestamp: Date.now()
        });
      });
    }
  } catch (error) {
    // Silent fail for background updates
    console.log(`[Service Worker] API background update failed for ${url}:`, error);
  } finally {
    updateQueue.delete(url);
  }
}

// NEW: User data cache-first strategy
async function userDataCacheFirst(request) {
  const userCacheName = await getUserCacheName();
  
  if (!userCacheName) {
    // No user logged in, try regular fetch
    try {
      return await fetch(request);
    } catch (error) {
      return createOfflineResponse(request);
    }
  }
  
  const userCache = await caches.open(userCacheName);
  const cachedResponse = await userCache.match(request);
  
  // Return cached user data if available
  if (cachedResponse) {
    // Update in background if stale
    if (isStale(cachedResponse)) {
      updateUserDataInBackground(request, userCacheName);
    }
    return cachedResponse;
  }
  
  // Try network for user data
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cacheWithMetadata(request, response.clone(), userCacheName);
    }
    return response;
  } catch (error) {
    return createOfflineResponse(request);
  }
}

// NEW: Update user data in background
async function updateUserDataInBackground(request, userCacheName) {
  const url = request.url;
  
  // Skip if already in queue
  if (updateQueue.has(url)) return;
  
  updateQueue.set(url, true);
  
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const userCache = await caches.open(userCacheName);
      await cacheWithMetadata(request, response.clone(), userCacheName);
      console.log(`[Service Worker] User data updated: ${url}`);
    }
  } catch (error) {
    // Silent fail for background updates
  } finally {
    updateQueue.delete(url);
  }
}

// NEW: Main offline-first fetch strategy
async function offlineFirstStrategy(request) {
  const url = new URL(request.url);
  
  // API requests: Cache-first with background update
  if (isApiRequest(url)) {
    return apiCacheFirstWithBackgroundSync(request);
  }
  
  // User data requests: User-specific cache-first
  if (isUserDataRequest(url)) {
    return userDataCacheFirst(request);
  }
  
  // Static assets: Cache-first with background update
  return cacheFirstWithBackgroundUpdate(request);
}

// OLD FUNCTION: Network-first with cache fallback (for API calls) - KEPT FOR COMPATIBILITY
async function networkFirstWithCache(request) {
  try {
    // Try network first with timeout
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT)
    );
    
    const response = await Promise.race([networkPromise, timeoutPromise]);
    
    // Cache the successful response for future offline use
    if (response && response.status === 200) {
      await cacheWithMetadata(request, response.clone(), API_CACHE_NAME);
    }
    
    return response;
  } catch (error) {
    console.log(`[Service Worker] Network failed for ${request.url}, trying cache...`);
    
    // Try to serve from cache
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log(`[Service Worker] Serving cached API response for ${request.url}`);
      return cachedResponse;
    }
    
    // Return a friendly offline response
    return new Response(JSON.stringify({
      offline: true,
      message: 'Please check your internet connection',
      cached: false,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// OLD FUNCTION: Stale-while-revalidate strategy for static assets - KEPT FOR COMPATIBILITY
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always return cached response immediately if available
  if (cachedResponse) {
    // Check if stale and update in background
    if (isStale(cachedResponse)) {
      updateInBackground(request);
    }
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cacheWithMetadata(request, response.clone(), STATIC_CACHE_NAME);
    }
    return response;
  } catch (error) {
    return createOfflineResponse(request);
  }
}

// NEW: Update cache in background without blocking
async function updateInBackground(request) {
  const url = request.url;
  
  // Skip if already in queue
  if (updateQueue.has(url)) return;
  
  updateQueue.set(url, true);
  
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      await cacheWithMetadata(request, response.clone(), STATIC_CACHE_NAME);
      console.log(`[Service Worker] Background updated: ${url}`);
      
      // Notify clients about updated content
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'ASSET_UPDATED',
          url: url,
          timestamp: Date.now()
        });
      });
    }
  } catch (error) {
    console.log(`[Service Worker] Background update failed for ${url}:`, error);
  } finally {
    updateQueue.delete(url);
  }
}

// NEW: Cache API responses intelligently
async function cacheApiResponse(request, response) {
  const url = new URL(request.url);
  
  // Only cache successful GET requests
  if (request.method !== 'GET' || response.status !== 200) {
    return response;
  }
  
  // Check if this API response should be cached
  const cacheableEndpoints = [
    '/api/user/profile',
    '/api/settings',
    '/api/contacts',
    '/api/conversations',
    '/api/messages/recent'
  ];
  
  const shouldCache = cacheableEndpoints.some(endpoint => 
    url.pathname.includes(endpoint)
  );
  
  if (shouldCache) {
    const cache = await caches.open(API_CACHE_NAME);
    await cacheWithMetadata(request, response.clone(), API_CACHE_NAME);
  }
  
  return response;
}

// OLD FUNCTION: Fetch and cache with user isolation - KEPT FOR COMPATIBILITY
async function fetchAndCache(request) {
  const url = new URL(request.url);
  const isUserData = isUserDataRequest(url);
  
  try {
    const response = await fetch(request);
    
    // Only cache successful responses
    if (response && response.status === 200) {
      const responseClone = response.clone();
      
      if (isUserData) {
        // Cache in user-specific cache if user is logged in
        const userCacheName = await getUserCacheName();
        if (userCacheName) {
          const userCache = await caches.open(userCacheName);
          await cacheWithMetadata(request, responseClone, userCacheName);
        }
      } else {
        // Cache in static cache
        const cache = await caches.open(STATIC_CACHE_NAME);
        await cacheWithMetadata(request, responseClone, STATIC_CACHE_NAME);
      }
    }
    
    return response;
  } catch (error) {
    console.warn(`[Service Worker] Failed to fetch: ${request.url}`, error);
    throw error;
  }
}

// OLD FUNCTION: Serve from cache with user isolation - KEPT FOR COMPATIBILITY
async function serveWithUserIsolation(request) {
  const url = new URL(request.url);
  
  // API requests: Network first with cache fallback
  if (isApiRequest(url)) {
    return networkFirstWithCache(request);
  }
  
  // User data requests: Check user-specific cache first
  if (isUserDataRequest(url)) {
    const userCacheName = await getUserCacheName();
    if (userCacheName) {
      const userCache = await caches.open(userCacheName);
      const cachedResponse = await userCache.match(request);
      
      if (cachedResponse) {
        // Check if stale and update in background
        if (isStale(cachedResponse)) {
          updateInBackground(request);
        }
        return cachedResponse;
      }
    }
    
    // If not in user cache, try network
    try {
      const response = await fetch(request);
      if (response.status === 200 && userCacheName) {
        const userCache = await caches.open(userCacheName);
        await cacheWithMetadata(request, response.clone(), userCacheName);
      }
      return response;
    } catch (error) {
      // Return generic offline response for user data
      return createOfflineResponse(request);
    }
  }
  
  // Static assets: Use stale-while-revalidate for performance
  return staleWhileRevalidate(request);
}

// Create offline response for failed requests
function createOfflineResponse(request) {
  const url = new URL(request.url);
  
  if (url.pathname.endsWith('.html')) {
    return new Response(
      '<html><head><title>Offline</title><style>body{font-family:Arial,sans-serif;padding:20px;text-align:center}</style></head><body><h1>App Offline</h1><p>Please check your internet connection.</p><button onclick="location.reload()">Retry</button></body></html>',
      {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      }
    );
  }
  
  if (url.pathname.endsWith('.css')) {
    return new Response('/* CSS not available offline */', {
      headers: { 'Content-Type': 'text/css' }
    });
  }
  
  if (url.pathname.endsWith('.js')) {
    return new Response('// JavaScript not available offline', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  
  if (url.pathname.includes('/api/') || url.pathname.includes('/user/')) {
    return new Response(JSON.stringify({ 
      offline: true,
      message: 'Data not available offline',
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Default empty response
  return new Response('', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// NEW: Clean up expired cache entries
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

// Clean up old user caches
async function cleanupUserCaches() {
  try {
    const cacheNames = await caches.keys();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const cacheName of cacheNames) {
      if (cacheName.startsWith('moodchat-user-')) {
        // Check if cache is old
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        if (keys.length === 0) {
          // Empty cache, delete it
          await caches.delete(cacheName);
        } else {
          // Clean expired entries
          await cleanupExpiredCache(cacheName);
        }
      } else if (cacheName === API_CACHE_NAME) {
        // Clean expired API cache entries
        await cleanupExpiredCache(cacheName);
      }
    }
  } catch (error) {
    console.warn('[Service Worker] Error cleaning user caches:', error);
  }
}

// NEW: Periodic background sync for updates
async function periodicBackgroundSync() {
  try {
    // Update critical assets in background
    const cache = await caches.open(STATIC_CACHE_NAME);
    const requests = await cache.keys();
    
    let updatedCount = 0;
    for (const request of requests.slice(0, 10)) { // Update 10 assets at a time
      if (isStale(await cache.match(request))) {
        await updateInBackground(request);
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[Service Worker] Background sync updated ${updatedCount} assets`);
    }
  } catch (error) {
    console.warn('[Service Worker] Background sync failed:', error);
  }
}

// INSTALLATION - Pre-cache static assets only
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing v${APP_VERSION}`);
  
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME);
      const assets = getAllStaticAssets();
      
      console.log(`[Service Worker] Precaching ${assets.length} static assets...`);
      
      // Cache critical assets first
      const criticalAssets = assets.filter(asset => 
        isCriticalAsset(new URL(asset, self.location.origin))
      );
      
      await cache.addAll(criticalAssets);
      console.log(`[Service Worker] Cached ${criticalAssets.length} critical assets`);
      
      // Cache remaining assets
      await cache.addAll(assets.filter(asset => 
        !criticalAssets.includes(asset)
      ));
      
      console.log('[Service Worker] Static precaching complete!');
    })()
  );
});

// ACTIVATION - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating v' + APP_VERSION);
  
  event.waitUntil(
    (async () => {
      // Clean up old static caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('moodchat-') && 
              cacheName !== STATIC_CACHE_NAME && 
              cacheName !== API_CACHE_NAME &&
              !cacheName.startsWith('moodchat-user-')) {
            console.log('[Service Worker] Deleting old static cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      // Clean up old user caches
      await cleanupUserCaches();
      
      // Generate device ID if not exists
      await generateDeviceId();
      
      // Claim all clients immediately
      await self.clients.claim();
      
      // NEW: Start periodic background sync
      if ('periodicSync' in self.registration) {
        try {
          await self.registration.periodicSync.register('moodchat-updates', {
            minInterval: 24 * 60 * 60 * 1000 // 24 hours
          });
        } catch (error) {
          console.log('[Service Worker] Periodic sync not supported:', error);
        }
      }
      
      console.log('[Service Worker] Now controlling all clients with device-based auth');
      console.log('[Service Worker] OFFLINE-FIRST MODE ENABLED: Cache-first strategy active');
    })()
  );
});

// NEW: Periodic sync event
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'moodchat-updates') {
    event.waitUntil(periodicBackgroundSync());
  }
});

// FETCH HANDLER - OFFLINE-FIRST CACHE-FIRST STRATEGY
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip browser extensions
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'chrome:' ||
      url.protocol === 'moz-extension:') {
    return;
  }
  
  // Skip background sync requests
  if (url.pathname.includes('__bgSync')) {
    return;
  }
  
  // Use offline-first caching strategy
  event.respondWith(offlineFirstStrategy(request));
});

// MESSAGE HANDLING - Enhanced for device-based auth
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
          
          event.source.postMessage({
            type: 'CACHE_INFO',
            staticCacheSize: keys.length,
            apiCacheSize: apiKeys.length,
            userId: session ? session.userId : null,
            deviceId: deviceId,
            isLoggedIn: session ? session.isLoggedIn : false,
            version: APP_VERSION,
            strategy: 'OFFLINE-FIRST: Cache-First + Background Updates'
          });
        })()
      );
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        (async () => {
          // Clear static cache
          await caches.delete(STATIC_CACHE_NAME);
          
          // Clear API cache
          await caches.delete(API_CACHE_NAME);
          
          // Clear user cache if exists
          const userCacheName = await getUserCacheName();
          if (userCacheName) {
            await caches.delete(userCacheName);
          }
          
          // Clear session data
          await clearUserSession();
          
          event.source.postMessage({
            type: 'CACHE_CLEARED',
            timestamp: Date.now(),
            message: 'All caches cleared including user data'
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
              console.log(`[Service Worker] User ${data.userId} logged in on device ${data.deviceId}`);
              
              // Clear any previous user's cache
              const oldUserCacheName = await getUserCacheName();
              if (oldUserCacheName && oldUserCacheName.includes('moodchat-user-')) {
                await caches.delete(oldUserCacheName);
              }
              
              // NEW: Pre-warm API cache for logged-in user
              if (data.preloadApis) {
                setTimeout(() => preloadUserAPIs(data.userId), 1000);
              }
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
          
          console.log('[Service Worker] User logged out, cache cleared');
          
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
      
    case 'CHECK_AUTO_LOGIN':
      event.waitUntil(
        (async () => {
          const session = await getCurrentUserSession();
          const deviceId = await generateDeviceId();
          
          event.source.postMessage({
            type: 'AUTO_LOGIN_STATUS',
            canAutoLogin: session ? session.isLoggedIn : false,
            userId: session ? session.userId : null,
            deviceId: deviceId,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    case 'UPDATE_ASSETS':
      event.waitUntil(
        (async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const assets = getAllStaticAssets();
          
          let updatedCount = 0;
          for (const asset of assets) {
            try {
              const response = await fetch(asset);
              if (response.status === 200) {
                await cacheWithMetadata(new Request(asset), response.clone(), STATIC_CACHE_NAME);
                updatedCount++;
              }
            } catch (error) {
              console.warn(`Failed to update asset: ${asset}`, error);
            }
          }
          
          event.source.postMessage({
            type: 'ASSETS_UPDATED',
            count: updatedCount,
            staticOnly: true
          });
        })()
      );
      break;
      
    case 'REGISTER_DEVICE':
      event.waitUntil(
        (async () => {
          const deviceId = data.deviceId || await generateDeviceId();
          
          // Store device registration
          try {
            const db = await openUserDB();
            await db.put('devices', {
              deviceId: deviceId,
              userId: data.userId,
              timestamp: Date.now(),
              userAgent: navigator.userAgent
            });
            db.close();
          } catch (error) {
            console.error('Error registering device:', error);
          }
          
          event.source.postMessage({
            type: 'DEVICE_REGISTERED',
            deviceId: deviceId,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    // NEW: Force update specific asset
    case 'UPDATE_ASSET':
      event.waitUntil(
        (async () => {
          try {
            const response = await fetch(data.url);
            if (response.status === 200) {
              const cache = await caches.open(STATIC_CACHE_NAME);
              await cacheWithMetadata(new Request(data.url), response.clone(), STATIC_CACHE_NAME);
              
              event.source.postMessage({
                type: 'ASSET_UPDATED',
                url: data.url,
                success: true,
                timestamp: Date.now()
              });
            }
          } catch (error) {
            event.source.postMessage({
              type: 'ASSET_UPDATE_FAILED',
              url: data.url,
              error: error.message
            });
          }
        })()
      );
      break;
      
    // NEW: Get offline status
    case 'GET_OFFLINE_STATUS':
      event.waitUntil(
        (async () => {
          const isOnline = navigator.onLine;
          const cache = await caches.open(STATIC_CACHE_NAME);
          const criticalCached = await Promise.all(
            CRITICAL_ASSETS.map(async asset => {
              const cached = await cache.match(asset);
              return { asset, cached: !!cached };
            })
          );
          
          event.source.postMessage({
            type: 'OFFLINE_STATUS',
            isOnline: isOnline,
            criticalAssets: criticalCached.filter(item => item.cached).length,
            totalCriticalAssets: CRITICAL_ASSETS.length,
            timestamp: Date.now()
          });
        })()
      );
      break;
      
    // NEW: Test offline-first mode
    case 'TEST_OFFLINE_MODE':
      event.waitUntil(
        (async () => {
          const testUrls = [
            '/',
            '/styles.css',
            '/js/app.js',
            '/api/user/test'
          ];
          
          const results = await Promise.all(
            testUrls.map(async (url) => {
              const cache = await caches.open(STATIC_CACHE_NAME);
              const cached = await cache.match(url);
              return {
                url,
                cached: !!cached,
                strategy: 'cache-first'
              };
            })
          );
          
          event.source.postMessage({
            type: 'OFFLINE_TEST_RESULTS',
            results: results,
            mode: 'offline-first',
            timestamp: Date.now()
          });
        })()
      );
      break;
  }
});

// NEW: Preload user-specific APIs after login
async function preloadUserAPIs(userId) {
  const userApis = [
    `/api/user/${userId}/profile`,
    `/api/user/${userId}/settings`,
    `/api/user/${userId}/contacts`,
    `/api/conversations?userId=${userId}`
  ];
  
  for (const api of userApis) {
    try {
      const response = await fetch(api);
      if (response.status === 200) {
        const cache = await caches.open(API_CACHE_NAME);
        await cacheWithMetadata(new Request(api), response.clone(), API_CACHE_NAME);
      }
    } catch (error) {
      // Silent fail for background preloading
    }
  }
}

// PUSH NOTIFICATIONS (with user context)
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
      url: data.url || '/chat.html',
      userId: data.userId,
      deviceId: data.deviceId
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

// NEW: Background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(syncFailedRequests());
  }
});

// NEW: Sync failed requests when back online
async function syncFailedRequests() {
  // This would sync failed POST/PUT requests
  // Implementation depends on your app's specific needs
  console.log('[Service Worker] Background sync triggered');
}

// INITIALIZATION LOG
console.log(`[Kynecta MoodChat Service Worker] v${APP_VERSION} loaded`);
console.log('[Service Worker] Strategy: OFFLINE-FIRST CACHE-FIRST WITH BACKGROUND UPDATES');
console.log('[Service Worker] Static assets cached, user data isolated by device');
console.log('[Service Worker] Auto-login detection with device ID validation');
console.log('[Service Worker] Supports both online and offline authentication');
console.log('[Service Worker] Enhanced: Background updates, API caching, 3s network timeout');
console.log('[Service Worker] Critical assets prioritized for offline access');
console.log('[Service Worker] OFFLINE-FIRST MODE: All requests try cache first, network updates in background');