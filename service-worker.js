// Service Worker for PWA Chat Application
// Version: 5.0.0 - Enhanced API bypass with strict no-caching for backend files
// Cache Strategy: Cache-First for static assets, NETWORK-ONLY for all API/backend requests
// CRITICAL: NO API endpoints cached, NO backend URLs persisted

const CACHE_NAME = 'moodchat-v11'; // Incremented version
const API_CACHE_NAME = 'moodchat-api-v11';
const OFFLINE_CACHE_NAME = 'moodchat-offline-v11';

// App shell - all static assets that make up the UI
const APP_SHELL_ASSETS = [
  // Core HTML files (INCLUDING index.html for offline use)
  '/',
  '/index.html',
  '/chat.html',
  '/status.html',
  '/friend.html',
  '/group.html',
  '/calls.html',
  '/Tools.html',
  '/settings.html',
  
  // CSS files (assuming these exist locally)
  '/layout.css',
  '/chat.css',
  '/group.css',
  
  // JavaScript files (assuming these exist locally)
  '/js/app.js',
  '/chat.js',
  
  // Manifest and icons
  '/manifest.json',
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

// CRITICAL: API BYPASS LIST - ALL /api/* requests MUST bypass cache
const API_BYPASS_PATHS = [
  // ANYTHING under /api/ - MUST bypass cache completely
  '/api/'
];

// Authentication and sensitive endpoints - NEVER cache these
const NEVER_CACHE_ENDPOINTS = [
  // Auth API endpoints - CRITICAL: Never cache auth
  '/api/auth',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/validate',
  '/api/auth/refresh',
  '/api/auth/me',
  '/api/auth/health',
  '/api/login',
  '/api/register',
  '/api/validate',
  '/api/logout',
  '/api/verify',
  '/api/token',
  '/api/session',
  '/api/auth/'
];

// Authentication HTML pages - NEVER cache these (to prevent auth loops)
const NEVER_CACHE_HTML = [
  '/login.html',
  '/register.html',
  '/auth.html',
  '/validate.html',
  '/auth/'
];

// CRITICAL: Add ALL backend-related JS files to never cache/intercept list
const NEVER_CACHE_JS = [
  '/api.js',
  '/js/api.js',
  '/assets/api.js',
  // Add any other backend-related JS files here
  '/backend.js',
  '/config.js',
  '/auth.js',
  '/services/api.js',
  '/services/auth.js',
  '/utils/api.js'
];

// CRITICAL: Backend URL patterns that should NEVER be cached or referenced
const BACKEND_URL_PATTERNS = [
  'https://api.',
  'http://api.',
  'localhost:3000',
  'localhost:5000',
  '127.0.0.1',
  ':3000',
  ':5000',
  ':8000',
  '/api/v1/',
  '/api/v2/',
  'backend',
  'server',
  'api/'
];

// CRITICAL: NEVER cache any of these patterns
const SHOULD_NEVER_CACHE = [
  '/api',
  '/auth',
  '/dynamic',
  '/backend',
  '/server',
  '/login',
  '/register',
  '/logout'
];

// Install event - cache app shell with error handling
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v5.0.0 - STRICT API BYPASS ENABLED...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[Service Worker] Caching app shell - NO BACKEND FILES');
        
        // Cache core assets with error handling for each
        const cachePromises = APP_SHELL_ASSETS.map(async (asset) => {
          try {
            // Skip if asset is a never-cache HTML page
            if (isNeverCacheHtml(asset)) {
              console.log('[Service Worker] Skipping never-cache HTML:', asset);
              return false;
            }
            
            // Skip if asset starts with auth path
            if (asset.startsWith('/auth/')) {
              console.log('[Service Worker] Skipping auth path:', asset);
              return false;
            }
            
            // CRITICAL: Skip backend-related JS files
            if (isNeverCacheJs(asset)) {
              console.log('[Service Worker] Skipping never-cache JS:', asset);
              return false;
            }
            
            // CRITICAL: Skip if asset should never be cached
            if (shouldNeverCache(asset)) {
              console.log('[Service Worker] Skipping never-cache path:', asset);
              return false;
            }
            
            // CRITICAL: Skip if asset contains backend URL patterns
            if (containsBackendUrlPattern(asset)) {
              console.log('[Service Worker] Skipping asset with backend URL pattern:', asset);
              return false;
            }
            
            const assetUrl = asset === '/' ? '/index.html' : asset;
            
            // Skip invalid URLs
            if (!isValidUrl(assetUrl)) {
              console.log('[Service Worker] Skipping invalid URL:', assetUrl);
              return false;
            }
            
            const response = await fetch(assetUrl);
            
            // CRITICAL: Check response content for backend URLs before caching
            if (response.ok && !shouldNeverCache(response.url) && !containsBackendUrlPattern(response.url)) {
              // Additional check: Read response text to ensure it doesn't contain backend URLs
              const responseClone = response.clone();
              const text = await responseClone.text();
              
              if (containsBackendUrlPattern(text)) {
                console.log('[Service Worker] Skipping asset containing backend URL in content:', assetUrl);
                return false;
              }
              
              await cache.put(assetUrl === '/index.html' ? '/' : assetUrl, response);
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
        
        // Try to cache optional assets (skip never-cache assets)
        const optionalPromises = OPTIONAL_ASSETS.map(async (asset) => {
          if (shouldNeverCache(asset) || asset.startsWith('/auth/')) {
            return; // Skip never-cache assets
          }
          
          // CRITICAL: Skip backend-related JS files
          if (isNeverCacheJs(asset)) {
            return;
          }
          
          // CRITICAL: Skip if contains backend URL patterns
          if (containsBackendUrlPattern(asset)) {
            return;
          }
          
          // Skip invalid URLs
          if (!isValidUrl(asset)) {
            return;
          }
          
          try {
            const response = await fetch(asset);
            if (response.ok && !shouldNeverCache(response.url) && !containsBackendUrlPattern(response.url)) {
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
  console.log('[Service Worker] Activating v5.0.0 - STRICT API BYPASS ENABLED...');
  
  event.waitUntil(
    Promise.all([
      // Clean up ALL old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== API_CACHE_NAME && 
                cacheName !== OFFLINE_CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // CRITICAL: Clear IndexedDB data that might contain old backend URLs
      clearIndexedDBData(),
      
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
            version: '5.0.0',
            timestamp: Date.now(),
            apiBypass: true,
            authNeverCached: true,
            strictNoBackendCaching: true
          });
        });
      });
    })
  );
});

// CRITICAL: Clear IndexedDB data that might contain old backend URLs
async function clearIndexedDBData() {
  try {
    const dbNames = await indexedDB.databases();
    for (const dbInfo of dbNames) {
      if (dbInfo.name && dbInfo.name.includes('chat') || dbInfo.name.includes('moodchat')) {
        indexedDB.deleteDatabase(dbInfo.name);
        console.log('[Service Worker] Cleared IndexedDB:', dbInfo.name);
      }
    }
  } catch (error) {
    console.log('[Service Worker] Error clearing IndexedDB:', error);
  }
}

// CRITICAL: Check if text contains backend URL patterns
function containsBackendUrlPattern(text) {
  if (!text || typeof text !== 'string') return false;
  
  return BACKEND_URL_PATTERNS.some(pattern => {
    return text.includes(pattern);
  });
}

// Check if asset should never be cached
function shouldNeverCache(url) {
  if (!url) return false;
  
  const urlString = typeof url === 'string' ? url : url.toString();
  
  // Check if URL matches any of the never-cache patterns
  return SHOULD_NEVER_CACHE.some(pattern => {
    return urlString.includes(pattern);
  });
}

// CRITICAL API BYPASS FUNCTION: Check if request should bypass cache completely
function shouldBypassCache(requestUrl) {
  const url = new URL(requestUrl, self.location.origin);
  
  // CRITICAL: ANY /api/* request MUST bypass cache completely
  if (url.pathname.startsWith('/api/')) {
    console.log('[Service Worker] API BYPASS: /api/* request detected:', url.pathname);
    return true;
  }
  
  // Never cache POST, PUT, DELETE requests
  if (typeof requestUrl === 'object' && ['POST', 'PUT', 'DELETE'].includes(requestUrl.method)) {
    return true;
  }
  
  // Skip auth paths entirely
  if (url.pathname.startsWith('/auth/')) {
    return true;
  }
  
  // Check shouldNeverCache patterns
  if (shouldNeverCache(url.pathname)) {
    return true;
  }
  
  // CRITICAL: Check for never-cache JS files (api.js and backend-related)
  if (isNeverCacheJs(url.pathname)) {
    return true;
  }
  
  // Check for never-cache API endpoints
  const isNeverCacheEndpoint = NEVER_CACHE_ENDPOINTS.some(endpoint => {
    // Exact match
    if (endpoint === url.pathname) {
      return true;
    }
    
    // Pattern match (ends with / means startsWith)
    if (endpoint.endsWith('/') && url.pathname.startsWith(endpoint)) {
      return true;
    }
    
    // Starts with match
    if (url.pathname.startsWith(endpoint)) {
      return true;
    }
    
    return false;
  });
  
  if (isNeverCacheEndpoint) {
    console.log('[Service Worker] Auth endpoint detected, bypassing cache:', url.pathname);
    return true;
  }
  
  // Check for never-cache HTML pages
  if (isNeverCacheHtml(url.pathname)) {
    return true;
  }
  
  // CRITICAL: Check if URL contains backend patterns
  if (containsBackendUrlPattern(url.toString())) {
    console.log('[Service Worker] Backend URL pattern detected, bypassing cache:', url.pathname);
    return true;
  }
  
  return false;
}

// Helper: Check if path is a never-cache HTML page
function isNeverCacheHtml(path) {
  return NEVER_CACHE_HTML.some(page => {
    // Exact match
    if (path === page) {
      return true;
    }
    
    // Ends with match for specific pages
    if (page.endsWith('.html') && path.endsWith(page)) {
      return true;
    }
    
    // Starts with match for paths
    if (page.endsWith('/') && path.startsWith(page)) {
      return true;
    }
    
    return false;
  });
}

// CRITICAL: Helper to check if JS file should never be cached
function isNeverCacheJs(path) {
  return NEVER_CACHE_JS.some(jsFile => {
    // Exact match
    if (path === jsFile) {
      return true;
    }
    
    // Ends with match
    if (path.endsWith(jsFile)) {
      return true;
    }
    
    // Contains match
    if (path.includes(jsFile)) {
      return true;
    }
    
    return false;
  });
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

// Helper: Check if URL is valid for caching
function isValidUrl(url) {
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

// CRITICAL: Handle HTML page requests with network-first strategy
async function handleHtmlRequest(request) {
  const url = new URL(request.url);
  
  // NEVER cache authentication HTML pages or auth paths
  if (isNeverCacheHtml(url.pathname) || url.pathname.startsWith('/auth/') || shouldNeverCache(url.pathname)) {
    console.log('[Service Worker] Never-cache HTML - fetch only:', url.pathname);
    try {
      return await fetch(request);
    } catch (error) {
      // When offline, show offline page for auth pages
      return getOfflineHtmlResponse('Authentication pages require network connection');
    }
  }
  
  try {
    // Network first for HTML to get fresh authentication state
    const networkResponse = await fetch(request);
    
    // Don't cache redirect responses
    if (networkResponse.status >= 300 && networkResponse.status < 400) {
      return networkResponse;
    }
    
    // Don't cache authentication errors
    if (networkResponse.status === 401 || networkResponse.status === 403) {
      return networkResponse;
    }
    
    // CRITICAL: Check if response contains backend URLs before caching
    const responseClone = networkResponse.clone();
    const text = await responseClone.text();
    
    if (containsBackendUrlPattern(text)) {
      console.log('[Service Worker] Skipping cache for HTML containing backend URLs:', url.pathname);
      return networkResponse;
    }
    
    // Only cache successful responses that aren't auth-related and don't contain backend URLs
    if (networkResponse.ok && 
        !url.pathname.startsWith('/auth/') && 
        !isNeverCacheHtml(url.pathname) && 
        !shouldNeverCache(url.pathname) &&
        !containsBackendUrlPattern(text)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed for HTML, cache fallback:', error.message);
    
    // When offline, serve cached version if available
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request) || await cache.match('/');
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Ultimate fallback
    return getOfflineHtmlResponse('Please check your internet connection');
  }
}

// CRITICAL API BYPASS: Handle API requests - NO CACHING, NO FALLBACK
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  console.log('[Service Worker] API BYPASS: Direct fetch for', url.pathname);
  
  // CRITICAL: Check if this is an auth endpoint - NEVER CACHE
  const isAuthEndpoint = NEVER_CACHE_ENDPOINTS.some(endpoint => 
    url.pathname.includes(endpoint) || 
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.includes('/auth/')
  );
  
  if (isAuthEndpoint) {
    console.log('[Service Worker] CRITICAL: Auth endpoint detected, bypassing ALL caching:', url.pathname);
    try {
      // Direct fetch - no caching, no interception
      const response = await fetch(request);
      console.log(`[Service Worker] Auth endpoint ${url.pathname} -> ${response.status}`);
      return response;
    } catch (error) {
      console.log('[Service Worker] Auth endpoint network failed:', url.pathname);
      // Return proper error - auth requires network
      return new Response(JSON.stringify({
        error: 'network_failed',
        message: 'Authentication requires network connection',
        requiresNetwork: true,
        path: url.pathname,
        timestamp: Date.now()
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Worker': 'auth-bypass',
          'X-Offline': 'true',
          'X-Auth-Requires-Network': 'true'
        }
      });
    }
  }
  
  // Regular API bypass for non-auth endpoints
  try {
    // Direct fetch - no caching, no interception
    const response = await fetch(request);
    
    // CRITICAL: Never cache any API response
    console.log(`[Service Worker] API BYPASS: ${url.pathname} -> ${response.status}`);
    return response;
  } catch (error) {
    console.log('[Service Worker] API BYPASS: Network failed for', url.pathname);
    
    // Return a proper network error - don't return cached data
    return new Response(JSON.stringify({
      error: 'network_failed',
      message: 'Network request failed',
      online: navigator.onLine,
      requiresNetwork: true,
      path: url.pathname,
      timestamp: Date.now()
    }), {
      status: 503, // Service Unavailable
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Worker': 'api-bypass',
        'X-Offline': 'true',
        'X-API-Bypass': 'true'
      }
    });
  }
}

// Cache-First strategy for static assets
async function handleStaticAsset(request) {
  const url = new URL(request.url);
  
  // CRITICAL: Check if contains backend URL patterns
  if (containsBackendUrlPattern(request.url)) {
    console.log('[Service Worker] Backend URL pattern detected, bypassing:', request.url);
    return fetch(request);
  }
  
  // Check shouldNeverCache first
  if (shouldNeverCache(request.url)) {
    console.log('[Service Worker] Never-cache static asset:', request.url);
    return fetch(request);
  }
  
  // NEVER cache assets from never-cache paths
  if (shouldBypassCache(request.url)) {
    console.log('[Service Worker] Never-cache static asset:', request.url);
    return fetch(request);
  }
  
  if (url.pathname.startsWith('/auth/')) {
    console.log('[Service Worker] Never-cache auth asset:', request.url);
    return fetch(request);
  }
  
  // CRITICAL: Never cache or intercept api.js and backend-related JS
  if (isNeverCacheJs(url.pathname)) {
    console.log('[Service Worker] Never-cache JS (backend-related):', request.url);
    return fetch(request);
  }
  
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Return cached response immediately for better performance
    // Background update only for non-critical assets
    if (shouldUpdateInBackground(request)) {
      updateCacheInBackground(request, cache);
    }
    
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    
    // CRITICAL: Check if response contains backend URLs before caching
    const responseClone = networkResponse.clone();
    const text = await responseClone.text();
    
    if (containsBackendUrlPattern(text)) {
      console.log('[Service Worker] Skipping cache for static asset containing backend URLs:', request.url);
      return networkResponse;
    }
    
    // Cache successful responses that don't contain backend URLs
    if (networkResponse.ok && 
        !shouldBypassCache(request.url) && 
        !url.pathname.startsWith('/auth/') && 
        !isNeverCacheJs(url.pathname) && 
        !shouldNeverCache(request.url) &&
        !containsBackendUrlPattern(text)) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If fetch fails and it's a critical asset, return a fallback
    if (isCriticalAsset(request)) {
      return getAssetFallback(request);
    }
    
    throw error;
  }
}

// Helper: Determine if asset should be updated in background
function shouldUpdateInBackground(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Don't background update very frequently
  const infrequentUpdates = [
    '.js',
    '.css',
    '.woff2',
    '.woff',
    '.ttf'
  ];
  
  return infrequentUpdates.some(ext => path.endsWith(ext));
}

// Helper: Update cache in background
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);
    
    // CRITICAL: Check for backend URLs before caching
    const responseClone = networkResponse.clone();
    const text = await responseClone.text();
    
    if (networkResponse.ok && 
        !shouldBypassCache(request.url) && 
        !shouldNeverCache(request.url) &&
        !containsBackendUrlPattern(text)) {
      await cache.put(request, networkResponse.clone());
      console.log('[Service Worker] Background cache updated:', request.url);
    }
  } catch (error) {
    // Silent fail - we already have cached version
  }
}

// Helper: Check if asset is critical for UI
function isCriticalAsset(request) {
  const url = new URL(request.url);
  const criticalAssets = [
    '/js/app.js',
    '/css/app.css',
    '/css/theme.css'
  ];
  
  return criticalAssets.includes(url.pathname);
}

// Helper: Get fallback for critical assets
function getAssetFallback(request) {
  const url = new URL(request.url);
  
  if (url.pathname.endsWith('.js')) {
    return new Response('console.log("Asset loaded from fallback");', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  
  if (url.pathname.endsWith('.css')) {
    return new Response('/* Fallback CSS */', {
      status: 200,
      headers: { 'Content-Type': 'text/css' }
    });
  }
  
  // Default fallback
  return new Response('', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Helper: Get offline HTML response
function getOfflineHtmlResponse(message) {
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - MoodChat</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #666; }
          p { color: #999; }
          .retry-button { 
            background: #4CAF50; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            margin: 10px; 
            cursor: pointer;
            border-radius: 5px;
          }
        </style>
      </head>
      <body>
        <h1>Offline</h1>
        <p>${message}</p>
        <button class="retry-button" onclick="window.location.reload()">Retry</button>
        <button class="retry-button" onclick="window.history.back()">Go Back</button>
      </body>
    </html>`,
    { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }
  );
}

// CRITICAL: MAIN FETCH HANDLER - API BYPASS LOGIC
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // CRITICAL: Check if URL contains backend patterns
  if (containsBackendUrlPattern(request.url)) {
    console.log('[Service Worker] Backend URL pattern detected, letting request pass:', url.pathname);
    return;
  }
  
  // CRITICAL API BYPASS: Skip ALL /api/* requests from Service Worker interception
  if (url.pathname.startsWith('/api/')) {
    console.log('[Service Worker] API BYPASS: Letting request pass through for', url.pathname);
    // DO NOT call event.respondWith() - let the request go directly to network
    return;
  }
  
  // CRITICAL: Skip auth-related requests completely
  if (url.pathname.startsWith('/auth/') || 
      url.pathname.includes('/login') || 
      url.pathname.includes('/register') ||
      url.pathname.includes('/logout')) {
    console.log('[Service Worker] Auth request bypass:', url.pathname);
    return;
  }
  
  // CRITICAL: Skip backend-related JS files completely
  if (isNeverCacheJs(url.pathname)) {
    console.log('[Service Worker] Backend JS request bypass:', url.pathname);
    return;
  }
  
  // Skip requests that match shouldNeverCache patterns
  if (shouldNeverCache(request.url)) {
    console.log('[Service Worker] Skipping never-cache request:', url.pathname);
    return;
  }
  
  // CRITICAL: Skip non-GET requests completely (POST, PUT, DELETE)
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    console.log('[Service Worker] Skipping non-GET request:', request.method, url.pathname);
    return;
  }
  
  // Handle never-cache requests immediately
  if (shouldBypassCache(request.url) || isNeverCacheJs(url.pathname)) {
    console.log('[Service Worker] Never-cache request:', request.method, url.pathname);
    event.respondWith(fetch(request));
    return;
  }
  
  // Never intercept /auth/ paths
  if (url.pathname.startsWith('/auth/')) {
    console.log('[Service Worker] Auth path - fetch only:', url.pathname);
    event.respondWith(fetch(request));
    return;
  }
  
  // Handle HTML page requests (navigation)
  if (request.mode === 'navigate' || isHtmlRequest(request)) {
    console.log('[Service Worker] HTML request:', url.pathname);
    event.respondWith(handleHtmlRequest(request));
    return;
  }
  
  // Handle static assets
  if (isStaticAssetRequest(request)) {
    console.log('[Service Worker] Static asset:', url.pathname);
    event.respondWith(handleStaticAsset(request));
    return;
  }
  
  // Default: try network, fall back to cache (for non-API, non-auth, non-backend requests)
  event.respondWith(
    fetch(request).catch(async () => {
      // Only fall back to cache if not a never-cache asset and doesn't contain backend patterns
      if (!shouldNeverCache(request.url) && !containsBackendUrlPattern(request.url)) {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
      }
      return new Response('Resource not found', { status: 404 });
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
        // CRITICAL: Do NOT cache API calls - direct fetch only
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
      // CRITICAL: Skip any requests that contain backend URLs
      if (containsBackendUrlPattern(request.url)) {
        await cache.delete(request);
        continue;
      }
      
      try {
        const response = await fetch(request);
        if (response.ok) {
          if (!shouldBypassCache(request.url) && !shouldNeverCache(request.url)) {
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
    const request = indexedDB.open('chat-messages', 3); // Incremented version
    
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
      
      if (oldVersion < 3) {
        // Version 3: Clear all data to remove old backend URLs
        db.deleteObjectStore('pending_messages');
        db.deleteObjectStore('offline_queue');
        db.deleteObjectStore('user_session');
        
        // Recreate with fresh structure
        const pendingStore = db.createObjectStore('pending_messages', { keyPath: 'id' });
        pendingStore.createIndex('timestamp', 'timestamp');
        pendingStore.createIndex('status', 'status');
        
        db.createObjectStore('user_session', { keyPath: 'key' });
        
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
      event.waitUntil(storeAuthState(data.authenticated, data.token));
      break;
      
    case 'GET_CACHE_INFO':
      event.waitUntil(getCacheInfo(event));
      break;
      
    case 'CHECK_HEALTH':
      event.ports[0].postMessage({
        type: 'HEALTH_RESPONSE',
        status: 'healthy',
        version: '5.0.0',
        apiBypass: true,
        authNeverCached: true,
        strictNoBackendCaching: true,
        timestamp: Date.now()
      });
      break;
      
    case 'FORCE_REFRESH_BACKEND_FILES':
      console.log('[Service Worker] Force refreshing backend files');
      event.waitUntil(forceRefreshBackendFiles());
      break;
  }
});

// Force refresh backend-related files
async function forceRefreshBackendFiles() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    let clearedCount = 0;
    for (const request of keys) {
      if (isNeverCacheJs(request.url) || containsBackendUrlPattern(request.url)) {
        await cache.delete(request);
        clearedCount++;
      }
    }
    
    console.log(`[Service Worker] Force refreshed ${clearedCount} backend files`);
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKEND_FILES_REFRESHED',
        timestamp: Date.now(),
        clearedCount
      });
    });
  } catch (error) {
    console.error('[Service Worker] Error force refreshing:', error);
  }
}

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
    // CRITICAL: Don't cache auth-related data or /api/* data or backend URLs
    if (shouldBypassCache(url) || 
        url.startsWith('/auth/') || 
        url.startsWith('/api/') || 
        shouldNeverCache(url) ||
        containsBackendUrlPattern(url)) {
      console.log('[Service Worker] Skipping cache for bypassed data:', url);
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
      timestamp: Date.now(),
      apiBypassEnabled: true,
      authNeverCached: true,
      strictNoBackendCaching: true,
      version: '5.0.0'
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
      // CRITICAL: Skip /api/*, never-cache endpoints, and backend URL patterns
      if (shouldBypassCache(request.url) || 
          request.url.includes('/auth/') || 
          request.url.includes('/api/') || 
          shouldNeverCache(request.url) ||
          containsBackendUrlPattern(request.url)) {
        await cache.delete(request);
        cleanedCount++;
        continue;
      }
      
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          const age = now - cachedDate;
          
          // Remove API cache entries older than 1 hour
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

// CRITICAL NOTE FOR DEVELOPERS:
// DO NOT add backend URLs to any cache lists or assets arrays.
// All API calls and backend-related files are automatically bypassed.
// The service worker will NOT cache any files containing backend URL patterns.
// This ensures login/register always use the current backend URL dynamically.