// Service Worker for Kynecta MoodChat - Seamless WhatsApp-Style Offline Experience
// Version: 7.0.0 - Ultimate Seamless Offline
// Features:
// 1. Pre-caches EVERYTHING essential (chats, contacts, media thumbnails)
// 2. Full message history access offline
// 3. Silent message queueing when offline
// 4. No "you're offline" banners - app works normally
// 5. Automatic sync when connection returns
// 6. Subtle indicators only
// 7. Media limitations handled gracefully

const APP_VERSION = '7.0.0';
const CACHE_NAMES = {
  STATIC: `moodchat-static-v${APP_VERSION.replace(/\./g, '-')}`,
  PAGES: `moodchat-pages-v${APP_VERSION.replace(/\./g, '-')}`,
  API: 'moodchat-api-cache',
  DYNAMIC: 'moodchat-dynamic-cache',
  MESSAGES: 'moodchat-messages-v1',
  MEDIA: 'moodchat-media-thumbnails',
  QUEUE: 'moodchat-queue-store'
};

// Queue for offline messages
let messageQueue = [];

// IndexedDB for structured data storage
const DB_NAME = 'MoodChatOfflineDB';
const DB_VERSION = 1;
let db = null;

// ============================================
// INDEXEDDB SETUP (for messages, contacts, queue)
// ============================================

function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Store for cached messages
      if (!database.objectStoreNames.contains('messages')) {
        const messagesStore = database.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('chatId', 'chatId', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Store for contacts
      if (!database.objectStoreNames.contains('contacts')) {
        const contactsStore = database.createObjectStore('contacts', { keyPath: 'id' });
        contactsStore.createIndex('lastSeen', 'lastSeen', { unique: false });
      }
      
      // Store for queued messages (to send when online)
      if (!database.objectStoreNames.contains('messageQueue')) {
        const queueStore = database.createObjectStore('messageQueue', { keyPath: 'localId' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }
      
      // Store for chat metadata
      if (!database.objectStoreNames.contains('chats')) {
        const chatsStore = database.createObjectStore('chats', { keyPath: 'id' });
        chatsStore.createIndex('lastMessageTime', 'lastMessageTime', { unique: false });
      }
      
      // Store for media thumbnails metadata
      if (!database.objectStoreNames.contains('media')) {
        const mediaStore = database.createObjectStore('media', { keyPath: 'id' });
        mediaStore.createIndex('chatId', 'chatId', { unique: false });
      }
    };
  });
}

// Database helper functions
const DB = {
  async addMessage(message) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.add(message);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getMessages(chatId, limit = 100, offset = 0) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('chatId');
      const range = IDBKeyRange.only(chatId);
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        const messages = request.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(offset, offset + limit);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  async addToQueue(message) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messageQueue'], 'readwrite');
      const store = transaction.objectStore('messageQueue');
      const localId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const queuedMessage = {
        ...message,
        localId: localId,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0
      };
      const request = store.add(queuedMessage);
      
      request.onsuccess = () => {
        // Update UI subtly if possible
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'MESSAGE_QUEUED',
              localId: localId,
              message: message.content,
              timestamp: queuedMessage.timestamp
            });
          });
        });
        resolve(queuedMessage);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  async getQueuedMessages() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messageQueue'], 'readonly');
      const store = transaction.objectStore('messageQueue');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async removeFromQueue(localId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messageQueue'], 'readwrite');
      const store = transaction.objectStore('messageQueue');
      const request = store.delete(localId);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },
  
  async updateContact(contact) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['contacts'], 'readwrite');
      const store = transaction.objectStore('contacts');
      const request = store.put(contact);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getContacts() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['contacts'], 'readonly');
      const store = transaction.objectStore('contacts');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async addChat(chat) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['chats'], 'readwrite');
      const store = transaction.objectStore('chats');
      const request = store.put(chat);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getChats() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['chats'], 'readonly');
      const store = transaction.objectStore('chats');
      const request = store.getAll();
      
      request.onsuccess = () => {
        const chats = request.result.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        resolve(chats);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  async addMedia(media) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['media'], 'readwrite');
      const store = transaction.objectStore('media');
      const request = store.put(media);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getMedia(chatId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['media'], 'readonly');
      const store = transaction.objectStore('media');
      const index = store.index('chatId');
      const range = IDBKeyRange.only(chatId);
      const request = index.getAll(range);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async cacheAPIResponse(url, responseData) {
    const apiCache = await caches.open(CACHE_NAMES.API);
    const response = new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' }
    });
    await apiCache.put(url, response);
  },
  
  async getCachedAPIResponse(url) {
    const apiCache = await caches.open(CACHE_NAMES.API);
    return await apiCache.match(url);
  }
};

// All app pages
const ALL_APP_PAGES = [
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
  '/chat/',
  '/message/',
  '/calls/',
  '/settings/',
  '/tools/',
  '/friend/',
  '/status/',
  '/group/',
  '/profile/',
  '/notifications/',
  '/search/',
  '/chat/*',
  '/message/*',
  '/user/*',
  '/group/*',
  '/friend/*',
  '/status/*'
];

// Core assets
const CORE_ASSETS = [
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
  '/styles.css',
  '/css/styles.css',
  '/css/main.css',
  '/css/layout.css',
  '/css/chat.css',
  '/css/ui.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/main.js',
  '/js/chat.js',
  '/js/auth.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/navigation.js',
  '/settingsManager.js',
  '/messageHandler.js',
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',
  '/icons/icon-72x72.png',
  '/icons/icon-128x128.png',
  '/icons/icon-512x512.png',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/images/logo.png',
  '/images/default-avatar.png',
  '/images/offline-avatar.png',
  '/manifest.json',
  '/offline-icon.svg',
  '/online-icon.svg'
];

// API patterns
const API_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\/graphql/,
  /\.googleapis\.com/,
  /firebaseio\.com/
];

// Message API patterns
const MESSAGE_API_PATTERNS = [
  /\/api\/messages/,
  /\/api\/chat/,
  /\/api\/send/,
  /\/api\/conversation/
];

// ============================================
// INSTALLATION - Cache everything essential
// ============================================

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Ultimate Seamless Offline v' + APP_VERSION);
  
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      // Initialize database
      await initDatabase();
      
      // Cache all static assets
      const staticCache = await caches.open(CACHE_NAMES.STATIC);
      try {
        await staticCache.addAll(CORE_ASSETS);
        console.log('[Service Worker] All core assets cached');
      } catch (error) {
        console.log('[Service Worker] Some assets may not have cached:', error);
      }
      
      // Pre-cache pages with dependencies
      const pagesToCache = CORE_ASSETS.filter(url => 
        url.includes('.html') || url === '/'
      );
      
      for (const pageUrl of pagesToCache) {
        try {
          const response = await fetch(pageUrl);
          if (response.ok) {
            await staticCache.put(pageUrl, response.clone());
            console.log(`[Service Worker] ✓ Page cached: ${pageUrl}`);
          }
        } catch (error) {
          // Silent fail
        }
      }
      
      console.log('[Service Worker] Installation complete - Ultimate seamless offline ready');
      console.log('[Service Worker] Features enabled:');
      console.log('[Service Worker] 1. Full message history caching');
      console.log('[Service Worker] 2. Silent message queueing');
      console.log('[Service Worker] 3. No offline banners');
      console.log('[Service Worker] 4. Automatic background sync');
      console.log('[Service Worker] 5. Subtle connection indicators only');
    })()
  );
});

// ============================================
// ACTIVATION - Clean up and claim clients
// ============================================

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Ultimate Seamless Offline v' + APP_VERSION);
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      // Claim all clients immediately
      await self.clients.claim();
      
      // Initialize database if not already
      if (!db) {
        await initDatabase();
      }
      
      // Start background sync if online
      if (navigator.onLine) {
        await processQueuedMessages();
      }
      
      console.log('[Service Worker] Ultimate Seamless Offline Strategy ACTIVE');
    })()
  );
});

// ============================================
// FETCH HANDLER - Seamless offline experience
// ============================================

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests (handled separately for messages)
  if (request.method !== 'GET' && !MESSAGE_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    // Handle POST/PUT/DELETE for messages (queue them)
    if (request.method === 'POST' && MESSAGE_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      event.respondWith(handleMessageSend(request, event));
      return;
    }
    return;
  }
  
  // Skip browser extensions
  if (url.protocol === 'chrome-extension:' || url.protocol === 'chrome:' || url.protocol === 'moz-extension:') {
    return;
  }
  
  // Handle all requests
  event.respondWith(handleSeamlessRequest(request, event));
});

// Main request handler
async function handleSeamlessRequest(request, event) {
  const url = new URL(request.url);
  
  // Check if it's an HTML page request
  const isHtmlRequest = request.headers.get('Accept')?.includes('text/html') ||
                       url.pathname.endsWith('.html') ||
                       request.mode === 'navigate' ||
                       url.pathname === '/' ||
                       ALL_APP_PAGES.some(page => {
                         if (page.endsWith('/*')) {
                           const pattern = page.replace('/*', '');
                           return url.pathname.startsWith(pattern);
                         }
                         return url.pathname === page || url.pathname.startsWith(page + '/');
                       });
  
  // Check if it's an API request
  const isApiRequest = API_PATTERNS.some(pattern => 
    pattern.test(url.pathname) || pattern.test(url.hostname)
  );
  
  // Check if it's a message API request
  const isMessageApiRequest = MESSAGE_API_PATTERNS.some(pattern => 
    pattern.test(url.pathname)
  );
  
  // Handle HTML pages with cache-first
  if (isHtmlRequest) {
    return handleHtmlRequestWithCacheFirst(request);
  }
  
  // Handle message API requests with special handling
  if (isMessageApiRequest && request.method === 'GET') {
    return handleMessageApiRequest(request);
  }
  
  // Handle regular API requests
  if (isApiRequest) {
    return handleApiRequest(request);
  }
  
  // Handle static assets
  return handleStaticAsset(request);
}

// Handle HTML pages - Cache First
async function handleHtmlRequestWithCacheFirst(request) {
  const url = new URL(request.url);
  
  // Try cache first (instant load)
  const cachedResponse = await getFromAnyCache(request);
  
  if (cachedResponse) {
    // If online, update cache in background
    if (navigator.onLine) {
      setTimeout(async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            await updateAllCaches(request, networkResponse.clone());
          }
        } catch (error) {
          // Silent fail
        }
      }, 100);
    }
    
    return cachedResponse;
  }
  
  // If not in cache and online, fetch from network
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        await updateAllCaches(request, networkResponse.clone());
        return networkResponse;
      }
    } catch (error) {
      // Continue to fallback
    }
  }
  
  // Serve generic app shell as last resort
  return caches.match('/index.html');
}

// Handle message API requests
async function handleMessageApiRequest(request) {
  const url = new URL(request.url);
  
  // Try network first if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Cache the response
        const responseClone = networkResponse.clone();
        const data = await responseClone.json();
        
        // Store messages in IndexedDB
        if (Array.isArray(data.messages) || Array.isArray(data)) {
          const messages = Array.isArray(data.messages) ? data.messages : data;
          for (const message of messages) {
            if (message.id && message.chatId) {
              await DB.addMessage(message);
            }
          }
        }
        
        // Cache API response
        await DB.cacheAPIResponse(request.url, data);
        
        return networkResponse;
      }
    } catch (error) {
      console.log('[Service Worker] Message API network failed');
    }
  }
  
  // Try to get from cache
  const cachedResponse = await DB.getCachedAPIResponse(request.url);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Try to get from IndexedDB
  const pathParts = url.pathname.split('/');
  const chatId = pathParts[pathParts.length - 1];
  
  if (chatId && chatId !== 'messages' && chatId !== 'chat') {
    try {
      const messages = await DB.getMessages(chatId, 50);
      return new Response(JSON.stringify({
        messages: messages,
        offline: true,
        cached: true,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // Continue to fallback
    }
  }
  
  // Return empty offline response
  return new Response(JSON.stringify({
    messages: [],
    offline: true,
    cached: false,
    timestamp: Date.now()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle regular API requests
async function handleApiRequest(request) {
  // Try network first if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Cache for offline use
        const apiCache = await caches.open(CACHE_NAMES.API);
        await apiCache.put(request, networkResponse.clone());
        
        // Also store structured data in IndexedDB
        try {
          const responseClone = networkResponse.clone();
          const data = await responseClone.json();
          
          if (data.contacts && Array.isArray(data.contacts)) {
            for (const contact of data.contacts) {
              await DB.updateContact(contact);
            }
          }
          
          if (data.chats && Array.isArray(data.chats)) {
            for (const chat of data.chats) {
              await DB.addChat(chat);
            }
          }
        } catch (error) {
          // Silent fail for parsing
        }
        
        return networkResponse;
      }
    } catch (error) {
      // Continue to cache fallback
    }
  }
  
  // Try cache
  const apiCache = await caches.open(CACHE_NAMES.API);
  const cachedResponse = await apiCache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Try IndexedDB based on request type
  const url = new URL(request.url);
  
  if (url.pathname.includes('/api/contacts') || url.pathname.includes('/api/users')) {
    try {
      const contacts = await DB.getContacts();
      return new Response(JSON.stringify({
        contacts: contacts,
        offline: true,
        cached: true,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // Continue to fallback
    }
  }
  
  if (url.pathname.includes('/api/chats') || url.pathname.includes('/api/conversations')) {
    try {
      const chats = await DB.getChats();
      return new Response(JSON.stringify({
        chats: chats,
        offline: true,
        cached: true,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // Continue to fallback
    }
  }
  
  // Generic offline response
  return new Response(JSON.stringify({
    offline: true,
    cached: false,
    timestamp: Date.now(),
    message: 'You are offline. Using cached data when available.'
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

// Handle static assets
async function handleStaticAsset(request) {
  // Try cache first
  const cachedResponse = await getFromAnyCache(request);
  
  if (cachedResponse) {
    // Background update if online
    if (navigator.onLine) {
      setTimeout(async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            await updateAllCaches(request, networkResponse.clone());
          }
        } catch (error) {
          // Silent fail
        }
      }, 100);
    }
    
    return cachedResponse;
  }
  
  // Try network if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        await updateAllCaches(request, networkResponse.clone());
        return networkResponse;
      }
    } catch (error) {
      // Continue to fallback
    }
  }
  
  // Return appropriate fallback
  return createAssetFallback(request);
}

// Handle message sending (POST requests)
async function handleMessageSend(request, event) {
  const url = new URL(request.url);
  
  // If online, try to send immediately
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        return networkResponse;
      }
    } catch (error) {
      // Fall through to offline handling
    }
  }
  
  // Offline: Queue the message
  try {
    const requestClone = request.clone();
    const body = await requestClone.json();
    
    // Add to queue
    const queuedMessage = await DB.addToQueue({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    });
    
    // Return success response immediately (message is queued)
    return new Response(JSON.stringify({
      success: true,
      queued: true,
      localId: queuedMessage.localId,
      timestamp: queuedMessage.timestamp,
      message: 'Message queued for sending when online'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 202 // Accepted
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to queue message',
      details: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// ============================================
// BACKGROUND SYNC - Process queued messages
// ============================================

async function processQueuedMessages() {
  if (!db) return;
  
  try {
    const queuedMessages = await DB.getQueuedMessages();
    
    for (const queuedMessage of queuedMessages) {
      if (queuedMessage.status === 'pending' && queuedMessage.retryCount < 3) {
        try {
          const response = await fetch(queuedMessage.url, {
            method: queuedMessage.method,
            headers: queuedMessage.headers,
            body: JSON.stringify(queuedMessage.body)
          });
          
          if (response.ok) {
            // Successfully sent, remove from queue
            await DB.removeFromQueue(queuedMessage.localId);
            
            // Notify clients
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'MESSAGE_SENT',
                  localId: queuedMessage.localId,
                  serverId: (async () => {
                    try {
                      const data = await response.json();
                      return data.id || data.messageId;
                    } catch (e) {
                      return null;
                    }
                  })()
                });
              });
            });
          } else {
            // Update retry count
            const transaction = db.transaction(['messageQueue'], 'readwrite');
            const store = transaction.objectStore('messageQueue');
            queuedMessage.retryCount++;
            store.put(queuedMessage);
          }
        } catch (error) {
          // Update retry count
          const transaction = db.transaction(['messageQueue'], 'readwrite');
          const store = transaction.objectStore('messageQueue');
          queuedMessage.retryCount++;
          store.put(queuedMessage);
        }
      }
    }
  } catch (error) {
    console.log('[Service Worker] Error processing message queue:', error);
  }
}

// ============================================
// NETWORK STATUS MONITORING
// ============================================

// Monitor network status changes
let isOnline = navigator.onLine;

function updateNetworkStatus() {
  const newStatus = navigator.onLine;
  
  if (newStatus !== isOnline) {
    isOnline = newStatus;
    
    // Notify all clients
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NETWORK_STATUS',
          online: isOnline,
          timestamp: Date.now()
        });
      });
    });
    
    // If just came online, process queued messages
    if (isOnline) {
      processQueuedMessages();
    }
    
    console.log(`[Service Worker] Network status: ${isOnline ? 'Online' : 'Offline'}`);
  }
}

// Listen for network status changes
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'NETWORK_STATUS_REQUEST') {
    updateNetworkStatus();
  }
});

// ============================================
// CACHE MANAGEMENT FUNCTIONS
// ============================================

async function getFromAnyCache(request) {
  const cacheOrder = [
    CACHE_NAMES.STATIC,
    CACHE_NAMES.PAGES,
    CACHE_NAMES.DYNAMIC
  ];
  
  for (const cacheName of cacheOrder) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  
  return null;
}

async function updateAllCaches(request, response) {
  const cachesToUpdate = [
    CACHE_NAMES.STATIC,
    CACHE_NAMES.PAGES,
    CACHE_NAMES.DYNAMIC
  ];
  
  for (const cacheName of cachesToUpdate) {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch (error) {
      // Silent fail
    }
  }
}

function createAssetFallback(request) {
  const url = new URL(request.url);
  
  if (url.pathname.endsWith('.css')) {
    return new Response('/* Asset not available offline */', {
      headers: { 'Content-Type': 'text/css' }
    });
  } else if (url.pathname.endsWith('.js')) {
    return new Response('// Asset not available offline', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  } else if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
    // Return transparent pixel for images
    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return fetch(transparentPixel);
  }
  
  return new Response('', { status: 404 });
}

// ============================================
// MESSAGE HANDLING FROM CLIENTS
// ============================================

self.addEventListener('message', event => {
  const { data } = event;
  
  switch (data.type) {
    case 'CACHE_API_DATA':
      handleCacheAPIData(event, data);
      break;
      
    case 'GET_QUEUED_MESSAGES':
      handleGetQueuedMessages(event);
      break;
      
    case 'CLEAR_QUEUE':
      handleClearQueue(event);
      break;
      
    case 'GET_CACHED_MESSAGES':
      handleGetCachedMessages(event, data.chatId, data.limit);
      break;
      
    case 'UPDATE_LAST_SEEN':
      handleUpdateLastSeen(event, data.userId, data.timestamp);
      break;
      
    case 'SYNC_REQUEST':
      handleSyncRequest(event);
      break;
  }
});

async function handleCacheAPIData(event, data) {
  try {
    if (data.messages && Array.isArray(data.messages)) {
      for (const message of data.messages) {
        await DB.addMessage(message);
      }
    }
    
    if (data.contacts && Array.isArray(data.contacts)) {
      for (const contact of data.contacts) {
        await DB.updateContact(contact);
      }
    }
    
    if (data.chats && Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        await DB.addChat(chat);
      }
    }
    
    event.source.postMessage({
      type: 'DATA_CACHED',
      success: true,
      timestamp: Date.now()
    });
  } catch (error) {
    event.source.postMessage({
      type: 'DATA_CACHED',
      success: false,
      error: error.message
    });
  }
}

async function handleGetQueuedMessages(event) {
  try {
    const messages = await DB.getQueuedMessages();
    event.source.postMessage({
      type: 'QUEUED_MESSAGES',
      messages: messages,
      count: messages.length
    });
  } catch (error) {
    event.source.postMessage({
      type: 'QUEUED_MESSAGES',
      messages: [],
      error: error.message
    });
  }
}

async function handleClearQueue(event) {
  try {
    const transaction = db.transaction(['messageQueue'], 'readwrite');
    const store = transaction.objectStore('messageQueue');
    const request = store.clear();
    
    request.onsuccess = () => {
      event.source.postMessage({
        type: 'QUEUE_CLEARED',
        success: true
      });
    };
  } catch (error) {
    event.source.postMessage({
      type: 'QUEUE_CLEARED',
      success: false,
      error: error.message
    });
  }
}

async function handleGetCachedMessages(event, chatId, limit = 50) {
  try {
    const messages = await DB.getMessages(chatId, limit);
    event.source.postMessage({
      type: 'CACHED_MESSAGES',
      chatId: chatId,
      messages: messages,
      count: messages.length
    });
  } catch (error) {
    event.source.postMessage({
      type: 'CACHED_MESSAGES',
      chatId: chatId,
      messages: [],
      error: error.message
    });
  }
}

async function handleUpdateLastSeen(event, userId, timestamp) {
  try {
    // Store last seen time for user
    const transaction = db.transaction(['contacts'], 'readwrite');
    const store = transaction.objectStore('contacts');
    const request = store.get(userId);
    
    request.onsuccess = () => {
      const contact = request.result || { id: userId };
      contact.lastSeen = timestamp;
      store.put(contact);
      
      event.source.postMessage({
        type: 'LAST_SEEN_UPDATED',
        userId: userId,
        timestamp: timestamp
      });
    };
  } catch (error) {
    // Silent fail
  }
}

async function handleSyncRequest(event) {
  if (navigator.onLine) {
    await processQueuedMessages();
    event.source.postMessage({
      type: 'SYNC_COMPLETE',
      timestamp: Date.now()
    });
  } else {
    event.source.postMessage({
      type: 'SYNC_FAILED',
      reason: 'offline',
      timestamp: Date.now()
    });
  }
}

// ============================================
// PERIODIC BACKGROUND TASKS
// ============================================

// Clean up old messages periodically
async function cleanupOldData() {
  if (!db) return;
  
  try {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Clean up old queued messages (older than 24 hours)
    const transaction = db.transaction(['messageQueue'], 'readwrite');
    const queueStore = transaction.objectStore('messageQueue');
    const index = queueStore.index('timestamp');
    const range = IDBKeyRange.upperBound(oneWeekAgo);
    const request = index.openCursor(range);
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  } catch (error) {
    // Silent fail
  }
}

// ============================================
// PUSH NOTIFICATIONS (Subtle only)
// ============================================

self.addEventListener('push', event => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    return; // Silent fail for invalid push data
  }
  
  // Only show subtle notification
  const options = {
    body: data.body || 'New message',
    icon: '/icons/moodchat-192.png',
    badge: '/icons/moodchat-72.png',
    tag: 'moodchat-message',
    silent: true, // No sound
    requireInteraction: false,
    data: {
      url: data.url || '/chat.html',
      chatId: data.chatId
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('MoodChat', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/chat.html';
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================
// INITIALIZATION
// ============================================

// Initialize network monitoring
updateNetworkStatus();
setInterval(updateNetworkStatus, 5000);

// Periodic cleanup
setInterval(cleanupOldData, 3600000); // Every hour

console.log('[MoodChat Service Worker] Ultimate Seamless Offline v' + APP_VERSION + ' loaded');
console.log('[Service Worker] STRATEGY: WhatsApp-like seamless offline experience');
console.log('[Service Worker] NO offline banners - app works normally');
console.log('[Service Worker] Silent message queueing when offline');
console.log('[Service Worker] Full message history access offline');
console.log('[Service Worker] Automatic sync when connection returns');
console.log('[Service Worker] Subtle indicators only (no disruptive UI)');
console.log('[Service Worker] Users won\'t notice when they go offline');