// Service Worker for Kynecta MoodChat - Complete Invisible Offline
// Version: 9.0.1 - Enhanced with WhatsApp-style offline behavior
// Features:
// 1. Complete WhatsApp-style API patterns
// 2. Page snapshots for instant loading
// 3. UI state preservation
// 4. Message queuing with auto-retry
// 5. Push notifications with actions
// 6. Real-time network monitoring
// 7. Background sync
// 8. Database for all data types
// 9. COMPLETELY HIDDEN OFFLINE STATUS
// 10. Enhanced: Cache-first for UI, Stale-while-revalidate for API
// 11. Enhanced: IndexedDB for chats, contacts, groups, messages
// 12. Enhanced: Offline message queue with auto-sync

const APP_VERSION = '9.0.1';
const CACHE_NAMES = {
  STATIC: `moodchat-static-v9`,
  PAGES: `moodchat-pages-v9`,
  SNAPSHOTS: `moodchat-snapshots-v9`,
  API: 'moodchat-api-cache-v2',
  DYNAMIC: 'moodchat-dynamic-cache',
  REAL_DATA: 'moodchat-real-data'
};

// WhatsApp-style API patterns
const WHATSAPP_API_PATTERNS = {
  CHAT_LIST: /\/api\/chats\/list/,
  CHAT_MESSAGES: /\/api\/chats\/([^\/]+)\/messages/,
  CHAT_INFO: /\/api\/chats\/([^\/]+)\/info/,
  CONTACTS_LIST: /\/api\/contacts\/list/,
  CONTACT_INFO: /\/api\/contacts\/([^\/]+)/,
  STATUS_LIST: /\/api\/status\/list/,
  STATUS_UPDATES: /\/api\/status\/updates/,
  CALLS_LIST: /\/api\/calls\/list/,
  CALL_HISTORY: /\/api\/calls\/history/,
  GROUPS_LIST: /\/api\/groups\/list/,
  GROUP_INFO: /\/api\/groups\/([^\/]+)/,
  PROFILE_INFO: /\/api\/profile\/info/,
  PROFILE_STATUS: /\/api\/profile\/status/,
  SEND_MESSAGE: /\/api\/messages\/send/,
  MARK_READ: /\/api\/messages\/mark-read/,
  DELETE_MESSAGE: /\/api\/messages\/delete/
};

// Internal network state (NEVER shown to users)
let networkState = {
  isOnline: navigator.onLine,
  lastChange: Date.now(),
  pendingSync: false,
  retryCount: 0
};

// Database for all WhatsApp-style data
const DB_NAME = 'MoodChatCompleteDB';
const DB_VERSION = 4; // Updated version for new schema
let db = null;

// ============================================
// ENHANCED DATABASE SETUP WITH WHATSAPP DATA
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
      const oldVersion = event.oldVersion || 0;
      
      // WhatsApp data structure
      if (oldVersion < 1 || !database.objectStoreNames.contains('messages')) {
        const store = database.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('localId', 'localId', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('contacts')) {
        const store = database.createObjectStore('contacts', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('lastSeen', 'lastSeen', { unique: false });
        store.createIndex('isFavorite', 'isFavorite', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('chats')) {
        const store = database.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('lastMessageTime', 'lastMessageTime', { unique: false });
        store.createIndex('unreadCount', 'unreadCount', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      
      if (oldVersion < 2 || !database.objectStoreNames.contains('messageQueue')) {
        const store = database.createObjectStore('messageQueue', { keyPath: 'localId' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('chatId', 'chatId', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('media')) {
        const store = database.createObjectStore('media', { keyPath: 'id' });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('ui_state')) {
        const store = database.createObjectStore('ui_state', { keyPath: 'page' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('snapshots')) {
        const store = database.createObjectStore('snapshots', { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('calls')) {
        const store = database.createObjectStore('calls', { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('status_updates')) {
        const store = database.createObjectStore('status_updates', { keyPath: 'id' });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (oldVersion < 3 || !database.objectStoreNames.contains('groups')) {
        const store = database.createObjectStore('groups', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('lastActivity', 'lastActivity', { unique: false });
        store.createIndex('members', 'members', { unique: false, multiEntry: true });
      }
      
      if (oldVersion < 1 || !database.objectStoreNames.contains('profile')) {
        const store = database.createObjectStore('profile', { keyPath: 'userId' });
        store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
      
      // NEW: Offline message queue for pending messages
      if (oldVersion < 4 || !database.objectStoreNames.contains('offline_messages')) {
        const store = database.createObjectStore('offline_messages', { keyPath: 'localId' });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

// Enhanced DB operations with WhatsApp data storage
const CompleteDB = {
  // Messages with offline support
  async addMessage(message) {
    // If message has localId, it's an offline message
    if (message.localId && message.status === 'pending') {
      // Also store in offline messages for queuing
      await this._dbOperation('offline_messages', 'put', {
        ...message,
        localId: message.localId,
        chatId: message.chatId,
        timestamp: message.timestamp || Date.now(),
        status: 'pending',
        retryCount: 0,
        lastRetry: null,
        _savedAt: Date.now()
      });
    }
    
    return this._dbOperation('messages', 'put', {
      ...message,
      _savedAt: Date.now(),
      _syncStatus: networkState.isOnline ? 'synced' : 'pending'
    });
  },
  
  async getMessages(chatId, limit = 100) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('chatId');
      const range = IDBKeyRange.only(chatId);
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        const messages = request.result
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Message Queue for offline operations
  async addToQueue(messageData) {
    const localId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const queuedItem = {
      ...messageData,
      localId,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      _userNotified: false
    };
    
    await this._dbOperation('messageQueue', 'add', queuedItem);
    
    // Also store as offline message for UI display
    if (messageData.type === 'message' && messageData.chatId) {
      await this._dbOperation('offline_messages', 'put', {
        ...messageData,
        localId,
        status: 'pending',
        timestamp: Date.now(),
        _isOffline: true
      });
    }
    
    // Update chat timestamp
    if (messageData.chatId) {
      await this.updateChatLastMessage(messageData.chatId, Date.now());
    }
    
    return queuedItem;
  },
  
  async getQueuedMessages() {
    return this._dbOperation('messageQueue', 'getAll');
  },
  
  async removeFromQueue(localId) {
    await this._dbOperation('offline_messages', 'delete', localId);
    return this._dbOperation('messageQueue', 'delete', localId);
  },
  
  async getPendingMessages(chatId = null) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_messages'], 'readonly');
      const store = transaction.objectStore('offline_messages');
      const index = store.index('status');
      const range = IDBKeyRange.only('pending');
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        let messages = request.result;
        if (chatId) {
          messages = messages.filter(m => m.chatId === chatId);
        }
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Contacts with local storage
  async saveContacts(contacts) {
    if (!Array.isArray(contacts)) contacts = [contacts];
    
    for (const contact of contacts) {
      await this._dbOperation('contacts', 'put', {
        ...contact,
        lastUpdated: Date.now(),
        _cachedAt: Date.now()
      });
    }
  },
  
  async getContacts() {
    const contacts = await this._dbOperation('contacts', 'getAll');
    return contacts.sort((a, b) => {
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
  },
  
  // Chats with local storage
  async saveChats(chats) {
    if (!Array.isArray(chats)) chats = [chats];
    
    for (const chat of chats) {
      await this._dbOperation('chats', 'put', {
        ...chat,
        lastUpdated: Date.now(),
        _cachedAt: Date.now(),
        _hasPending: !networkState.isOnline
      });
    }
  },
  
  async updateChatLastMessage(chatId, timestamp) {
    const chat = await this._dbOperation('chats', 'get', chatId) || { id: chatId };
    chat.lastMessageTime = timestamp;
    chat.lastUpdated = Date.now();
    return this._dbOperation('chats', 'put', chat);
  },
  
  async getChats() {
    const chats = await this._dbOperation('chats', 'getAll');
    return chats.sort((a, b) => 
      (b.lastMessageTime || 0) - (a.lastMessageTime || 0)
    );
  },
  
  // Groups with local storage
  async saveGroups(groups) {
    if (!Array.isArray(groups)) groups = [groups];
    
    for (const group of groups) {
      await this._dbOperation('groups', 'put', {
        ...group,
        lastUpdated: Date.now(),
        _cachedAt: Date.now(),
        _synced: networkState.isOnline
      });
    }
  },
  
  async getGroups() {
    const groups = await this._dbOperation('groups', 'getAll');
    return groups.sort((a, b) => 
      (b.lastActivity || 0) - (a.lastActivity || 0)
    );
  },
  
  // Save all structured data from API
  async saveStructuredData(data) {
    if (data.chats && Array.isArray(data.chats)) {
      await this.saveChats(data.chats);
    }
    if (data.contacts && Array.isArray(data.contacts)) {
      await this.saveContacts(data.contacts);
    }
    if (data.messages && Array.isArray(data.messages)) {
      for (const message of data.messages) {
        await this.addMessage(message);
      }
    }
    if (data.calls && Array.isArray(data.calls)) {
      for (const call of data.calls) {
        await this._dbOperation('calls', 'put', call);
      }
    }
    if (data.statusUpdates && Array.isArray(data.statusUpdates)) {
      for (const status of data.statusUpdates) {
        await this._dbOperation('status_updates', 'put', status);
      }
    }
    if (data.groups && Array.isArray(data.groups)) {
      await this.saveGroups(data.groups);
    }
    if (data.profile) {
      await this._dbOperation('profile', 'put', {
        ...data.profile,
        userId: 'current',
        lastUpdated: Date.now()
      });
    }
  },
  
  // ... (rest of your existing DB methods remain the same)

  async _dbOperation(storeName, operation, data) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 
        ['put', 'add', 'delete'].includes(operation) ? 'readwrite' : 'readonly'
      );
      const store = transaction.objectStore(storeName);
      
      let request;
      switch (operation) {
        case 'put':
          request = store.put(data);
          break;
        case 'add':
          request = store.add(data);
          break;
        case 'get':
          request = store.get(data);
          break;
        case 'getAll':
          request = store.getAll();
          break;
        case 'delete':
          request = store.delete(data);
          break;
      }
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Generate seamless offline responses
  async generateSeamlessResponse(url) {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Match WhatsApp patterns
    for (const [key, pattern] of Object.entries(WHATSAPP_API_PATTERNS)) {
      const match = path.match(pattern);
      if (match) {
        return this._generateResponseForPattern(key, match);
      }
    }
    
    // Default seamless response
    return {
      success: true,
      timestamp: Date.now(),
      _dataSource: 'local'
    };
  },
  
  async _generateResponseForPattern(patternKey, match) {
    const baseResponse = {
      success: true,
      timestamp: Date.now(),
      serverTime: Date.now(),
      _dataSource: 'local'
    };
    
    switch (patternKey) {
      case 'CHAT_LIST':
        const chats = await this.getChats();
        return {
          ...baseResponse,
          chats,
          total: chats.length,
          unreadCount: chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0)
        };
        
      case 'CHAT_MESSAGES':
        const chatId = match[1];
        const messages = await this.getMessages(chatId, 50);
        const pendingMessages = await this.getPendingMessages(chatId);
        
        // Combine server messages with pending offline messages
        const allMessages = [...messages];
        for (const pending of pendingMessages) {
          allMessages.push({
            ...pending,
            id: pending.localId,
            status: 'pending',
            isOffline: true
          });
        }
        
        allMessages.sort((a, b) => b.timestamp - a.timestamp);
        
        return {
          ...baseResponse,
          chatId,
          messages: allMessages.slice(0, 50),
          hasMore: allMessages.length >= 50
        };
        
      case 'CONTACTS_LIST':
        const contacts = await this.getContacts();
        return {
          ...baseResponse,
          contacts,
          total: contacts.length
        };
        
      case 'STATUS_LIST':
        const statuses = await this._dbOperation('status_updates', 'getAll');
        const now = Date.now();
        const validStatuses = statuses.filter(s => !s.expiresAt || s.expiresAt > now);
        return {
          ...baseResponse,
          statusUpdates: validStatuses,
          myStatus: await this._dbOperation('profile', 'get', 'current')
        };
        
      case 'CALLS_LIST':
        const calls = await this._dbOperation('calls', 'getAll');
        return {
          ...baseResponse,
          calls: calls.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50),
          recentCount: calls.filter(c => c.timestamp > Date.now() - 86400000).length
        };
        
      case 'GROUPS_LIST':
        const groups = await this.getGroups();
        return {
          ...baseResponse,
          groups,
          total: groups.length
        };
        
      default:
        return baseResponse;
    }
  }
};

// Core assets for cache-first strategy
const CORE_ASSETS = [
  // HTML Pages
  '/',
  '/index.html',
  '/chat.html',
  '/messages.html',
  '/calls.html',
  '/status.html',
  '/groups.html',
  '/friends.html',
  '/profile.html',
  '/settings.html',
  '/tools.html',
  '/call.html',
  '/group.html',
  '/friend.html',
  
  // CSS
  '/styles.css',
  '/css/styles.css',
  '/css/main.css',
  '/css/layout.css',
  '/css/chat.css',
  '/css/ui.css',
  
  // JavaScript
  '/js/app.js',
  '/js/main.js',
  '/js/chat.js',
  '/js/calls.js',
  '/js/status.js',
  '/js/groups.js',
  '/js/friends.js',
  '/js/profile.js',
  '/js/settings.js',
  '/js/auth.js',
  '/js/ui.js',
  
  // Icons & Images
  '/icons/moodchat-192.png',
  '/icons/moodchat-512.png',
  '/icons/icon-72x72.png',
  '/icons/icon-128x128.png',
  '/icons/icon-512x512.png',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  
  // Manifest & Service Worker
  '/manifest.json',
  '/service-worker.js'
];

// All app pages
const ALL_APP_PAGES = {
  '/': 'chat',
  '/index.html': 'chat',
  '/chat.html': 'chat',
  '/chats.html': 'chat',
  '/messages.html': 'chat',
  '/calls.html': 'calls',
  '/call.html': 'call',
  '/status.html': 'status',
  '/groups.html': 'groups',
  '/group.html': 'group',
  '/friends.html': 'friends',
  '/friend.html': 'friend',
  '/profile.html': 'profile',
  '/settings.html': 'settings',
  '/tools.html': 'tools',
  '/Tools.html': 'tools',
  '/chat/': 'chat',
  '/calls/': 'calls',
  '/status/': 'status',
  '/groups/': 'groups',
  '/friends/': 'friends',
  '/profile/': 'profile',
  '/settings/': 'settings'
};

// ============================================
// INSTALLATION - ENHANCED CACHING
// ============================================

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Enhanced Offline v' + APP_VERSION);
  
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      await initDatabase();
      
      // Cache all core assets (CACHE-FIRST STRATEGY)
      const cache = await caches.open(CACHE_NAMES.STATIC);
      await cache.addAll(CORE_ASSETS);
      
      console.log('[Service Worker] Core assets cached - Cache-first strategy ready');
    })()
  );
});

// ============================================
// ACTIVATION
// ============================================

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Enhanced Offline v' + APP_VERSION);
  
  event.waitUntil(
    (async () => {
      // Clean old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
      
      await self.clients.claim();
      
      // Start background processes
      startInvisibleNetworkMonitoring();
      startBackgroundSync();
      startCleanupTasks();
      
      // Initial sync if online
      if (networkState.isOnline) {
        setTimeout(performBackgroundSync, 2000);
        setTimeout(syncOfflineMessages, 3000);
      }
      
      console.log('[Service Worker] Enhanced offline features active');
    })()
  );
});

// ============================================
// FETCH HANDLER - ENHANCED STRATEGIES
// ============================================

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests for API handling
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(handleApiRequestSeamlessly(request, event));
      return;
    }
    return;
  }
  
  // CACHE-FIRST for UI files (HTML, CSS, JS, Images)
  if (isUIRequest(request, url)) {
    event.respondWith(handleCacheFirst(request));
    return;
  }
  
  // STALE-WHILE-REVALIDATE for API requests
  if (isApiRequest(url)) {
    event.respondWith(handleStaleWhileRevalidate(request));
    return;
  }
  
  // Default: try cache first, then network
  event.respondWith(handleDefault(request));
});

function isUIRequest(request, url) {
  const acceptHeader = request.headers.get('Accept') || '';
  const isNavigate = request.mode === 'navigate';
  const isHtmlPage = ALL_APP_PAGES.hasOwnProperty(url.pathname) || 
                     url.pathname.endsWith('.html') || 
                     url.pathname === '/';
  const isStaticAsset = url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
  
  return isNavigate || isHtmlPage || acceptHeader.includes('text/html') || isStaticAsset;
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// CACHE-FIRST strategy for UI files
async function handleCacheFirst(request) {
  const url = new URL(request.url);
  
  // Always try cache first
  const cached = await caches.match(request);
  if (cached) {
    // Update in background if online
    if (networkState.isOnline && !url.pathname.match(/\.(css|js)$/)) {
      setTimeout(async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAMES.STATIC);
            await cache.put(request, response);
          }
        } catch (error) {
          // Silent background update failure
        }
      }, 0);
    }
    return cached;
  }
  
  // If not in cache, try network
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache for future use
      const cache = await caches.open(CACHE_NAMES.STATIC);
      await cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    // Network failed - return appropriate fallback
  }
  
  // Return fallback based on file type
  return createSeamlessFallback(request);
}

// STALE-WHILE-REVALIDATE for API requests
async function handleStaleWhileRevalidate(request) {
  const url = request.url;
  
  // Try cache first (stale)
  const cached = await caches.match(request);
  
  // Always try to update in background if online
  if (networkState.isOnline) {
    setTimeout(async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          // Cache the fresh response
          const cache = await caches.open(CACHE_NAMES.API);
          await cache.put(request, response.clone());
          
          // Store structured data in IndexedDB
          const data = await response.json();
          await CompleteDB.saveStructuredData(data);
          
          // Notify clients of new data (invisibly)
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: '_API_DATA_UPDATED',
                url: url,
                _timestamp: Date.now(),
                _invisible: true
              });
            });
          });
        }
      } catch (error) {
        // Background update failed silently
      }
    }, 0);
  }
  
  // Return cached response if available
  if (cached) {
    const cachedData = await cached.clone().json().catch(() => null);
    if (cachedData) {
      return cached;
    }
  }
  
  // If no cache or cache invalid, try IndexedDB
  const dbResponse = await CompleteDB.generateSeamlessResponse(url);
  if (dbResponse && Object.keys(dbResponse).length > 1) {
    return new Response(JSON.stringify(dbResponse), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Last resort: try network (blocking)
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.API);
      await cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    // Network failed
  }
  
  // Return empty success response
  return new Response(JSON.stringify({
    success: true,
    timestamp: Date.now(),
    _dataSource: 'offline'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Default strategy
async function handleDefault(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.DYNAMIC);
      await cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    // Network failed
  }
  
  return createSeamlessFallback(request);
}

// Handle API mutations (POST, PUT, DELETE)
async function handleApiRequestSeamlessly(request, event) {
  const url = request.url;
  
  // Handle POST/PUT/DELETE requests
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    return handleApiMutationSeamlessly(request, event);
  }
  
  // Handle GET requests with stale-while-revalidate
  return handleStaleWhileRevalidate(request);
}

// Enhanced API mutation handler with offline queue
async function handleApiMutationSeamlessly(request, event) {
  const url = request.url;
  const isSendMessage = url.includes('/api/messages/send');
  
  // If online, try to send immediately
  if (networkState.isOnline) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const data = await response.clone().json();
        
        // If this is a message send, update local storage
        if (isSendMessage) {
          const requestClone = request.clone();
          const body = await requestClone.json();
          if (body.chatId && body.content) {
            const messageId = data.messageId || Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            await CompleteDB.addMessage({
              id: messageId,
              chatId: body.chatId,
              content: body.content,
              sender: body.sender || 'me',
              timestamp: Date.now(),
              status: 'sent',
              type: body.type || 'text'
            });
          }
        }
        
        return response;
      }
    } catch (error) {
      // Continue to offline handling
    }
  }
  
  // OFFLINE: Queue the request
  try {
    const requestClone = request.clone();
    const body = await requestClone.json();
    
    // Generate local ID for offline tracking
    const localId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Special handling for messages
    if (isSendMessage && body.chatId && body.content) {
      // Add to offline messages for immediate UI display
      const offlineMessage = {
        localId,
        id: localId, // Use localId as temporary ID
        chatId: body.chatId,
        content: body.content,
        sender: body.sender || 'me',
        timestamp: Date.now(),
        status: 'pending',
        type: body.type || 'text',
        isOffline: true,
        _queuedAt: Date.now()
      };
      
      await CompleteDB.addMessage(offlineMessage);
      
      // Notify client that message was saved locally
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'MESSAGE_SAVED_LOCALLY',
            localId,
            chatId: body.chatId,
            message: offlineMessage,
            _timestamp: Date.now()
          });
        });
      });
    }
    
    // Add to queue for background sync
    await CompleteDB.addToQueue({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      localId,
      timestamp: Date.now(),
      type: isSendMessage ? 'message' : 'api'
    });
    
    // Return immediate success (user never knows it's queued)
    return new Response(JSON.stringify({
      success: true,
      timestamp: Date.now(),
      // Include localId for client to track pending messages
      ...(isSendMessage && { localId }),
      _operationId: localId
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
    
  } catch (error) {
    // Return success anyway
    return new Response(JSON.stringify({
      success: true,
      timestamp: Date.now(),
      _internalNote: 'Operation will complete when possible'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }
}

// ============================================
// OFFLINE MESSAGE QUEUE SYNC
// ============================================

async function syncOfflineMessages() {
  if (!networkState.isOnline || !db) return;
  
  try {
    const pendingMessages = await CompleteDB.getPendingMessages();
    
    for (const message of pendingMessages) {
      if (message.status === 'pending' && (message.retryCount || 0) < 5) {
        try {
          const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...message.headers
            },
            body: JSON.stringify({
              chatId: message.chatId,
              content: message.content,
              type: message.type,
              sender: message.sender
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Update message status
            await CompleteDB.removeFromQueue(message.localId);
            
            // Update the message in storage with real ID
            if (data.messageId) {
              await CompleteDB.addMessage({
                ...message,
                id: data.messageId,
                status: 'sent',
                isOffline: false,
                _syncedAt: Date.now()
              });
            }
            
            // Notify clients
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'OFFLINE_MESSAGE_SENT',
                  localId: message.localId,
                  messageId: data.messageId,
                  chatId: message.chatId,
                  _timestamp: Date.now()
                });
              });
            });
          } else {
            // Increment retry count
            message.retryCount = (message.retryCount || 0) + 1;
            message.lastRetry = Date.now();
            await CompleteDB._dbOperation('offline_messages', 'put', message);
          }
        } catch (error) {
          // Network error - increment retry count
          message.retryCount = (message.retryCount || 0) + 1;
          message.lastRetry = Date.now();
          await CompleteDB._dbOperation('offline_messages', 'put', message);
        }
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// ============================================
// BACKGROUND SYNC - ENHANCED
// ============================================

function startBackgroundSync() {
  // Sync every 2 minutes when online
  setInterval(() => {
    if (networkState.isOnline) {
      performBackgroundSync();
      syncOfflineMessages();
    }
  }, 120000);
  
  // Sync immediately when coming online
  self.addEventListener('online', () => {
    setTimeout(() => {
      performBackgroundSync();
      syncOfflineMessages();
    }, 1000);
  });
}

async function performBackgroundSync() {
  if (!networkState.isOnline || !db) return;
  
  console.log('[Background Sync] Starting enhanced sync');
  
  try {
    // Process queued operations
    await processQueuedOperations();
    
    // Sync all data types from server
    await Promise.allSettled([
      syncDataFromServer('/api/chats/list', 'chats'),
      syncDataFromServer('/api/contacts/list', 'contacts'),
      syncDataFromServer('/api/groups/list', 'groups'),
      syncDataFromServer('/api/calls/list', 'calls'),
      syncDataFromServer('/api/status/list', 'statusUpdates'),
      syncDataFromServer('/api/profile/info', 'profile')
    ]);
    
    console.log('[Background Sync] Enhanced sync done');
    
  } catch (error) {
    // Silent fail
  }
}

async function syncDataFromServer(url, dataType) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      
      // Cache API response
      const cache = await caches.open(CACHE_NAMES.API);
      await cache.put(url, response.clone());
      
      // Store in IndexedDB
      if (data[dataType] || dataType === 'profile') {
        const structuredData = {};
        if (dataType === 'profile') {
          structuredData.profile = data;
        } else {
          structuredData[dataType] = data[dataType];
        }
        await CompleteDB.saveStructuredData(structuredData);
      }
    }
  } catch (error) {
    // Silent fail
  }
}

async function processQueuedOperations() {
  try {
    const queuedItems = await CompleteDB.getQueuedMessages();
    
    for (const item of queuedItems) {
      if (item.status === 'pending' && item.retryCount < 5) {
        try {
          const response = await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: JSON.stringify(item.body)
          });
          
          if (response.ok) {
            // Success - remove from queue
            await CompleteDB.removeFromQueue(item.localId);
            
            // Update UI invisibly
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: '_OPERATION_SYNCED',
                  localId: item.localId,
                  _timestamp: Date.now(),
                  _invisible: true
                });
              });
            });
          } else {
            // Increment retry count
            item.retryCount = (item.retryCount || 0) + 1;
            item.lastRetry = Date.now();
            await CompleteDB._dbOperation('messageQueue', 'put', item);
          }
        } catch (error) {
          // Increment retry count
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastRetry = Date.now();
          await CompleteDB._dbOperation('messageQueue', 'put', item);
        }
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createSeamlessFallback(request) {
  const url = new URL(request.url);
  
  if (url.pathname.endsWith('.css')) {
    return new Response('/* Fallback styles */', {
      headers: { 'Content-Type': 'text/css' }
    });
  }
  
  if (url.pathname.endsWith('.js')) {
    return new Response('// Fallback script', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
    // Return transparent pixel for missing images
    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return fetch(transparentPixel);
  }
  
  // For HTML pages, return the index.html from cache
  if (url.pathname.match(/\.html$/) || url.pathname === '/') {
    return caches.match('/index.html').then(response => {
      return response || new Response('App loading...', { status: 200 });
    });
  }
  
  return new Response('', { status: 404 });
}

// ============================================
// NETWORK MONITORING
// ============================================

function startInvisibleNetworkMonitoring() {
  setInterval(() => {
    const wasOnline = networkState.isOnline;
    const isNowOnline = navigator.onLine;
    
    if (isNowOnline !== wasOnline) {
      networkState.isOnline = isNowOnline;
      networkState.lastChange = Date.now();
      
      // If just came online, sync everything
      if (isNowOnline && !wasOnline) {
        networkState.pendingSync = true;
        setTimeout(() => {
          performBackgroundSync();
          syncOfflineMessages();
        }, 1000);
      }
    }
  }, 1000);
}

// ============================================
// MESSAGE HANDLING - ENHANCED
// ============================================

self.addEventListener('message', event => {
  const { data } = event;
  
  switch (data.type) {
    case 'SAVE_UI_STATE':
      CompleteDB.saveUIState(data.page, data.state);
      break;
      
    case 'GET_UI_STATE':
      CompleteDB.getUIState(data.page).then(state => {
        event.source.postMessage({
          type: 'UI_STATE_RETRIEVED',
          page: data.page,
          state
        });
      });
      break;
      
    case 'SEND_MESSAGE_OFFLINE':
      // Client wants to send a message while offline
      handleClientMessageSend(event, data);
      break;
      
    case 'GET_CHATS_OFFLINE':
      CompleteDB.getChats().then(chats => {
        event.source.postMessage({
          type: 'CHATS_RETRIEVED',
          chats,
          source: 'offline'
        });
      });
      break;
      
    case 'GET_CONTACTS_OFFLINE':
      CompleteDB.getContacts().then(contacts => {
        event.source.postMessage({
          type: 'CONTACTS_RETRIEVED',
          contacts,
          source: 'offline'
        });
      });
      break;
      
    case 'GET_GROUPS_OFFLINE':
      CompleteDB.getGroups().then(groups => {
        event.source.postMessage({
          type: 'GROUPS_RETRIEVED',
          groups,
          source: 'offline'
        });
      });
      break;
      
    case 'GET_PENDING_MESSAGES':
      CompleteDB.getPendingMessages(data.chatId).then(messages => {
        event.source.postMessage({
          type: 'PENDING_MESSAGES_RETRIEVED',
          chatId: data.chatId,
          messages
        });
      });
      break;
      
    case 'SYNC_NOW':
      if (networkState.isOnline) {
        performBackgroundSync();
        syncOfflineMessages();
        event.source.postMessage({
          type: 'SYNC_STARTED',
          manual: true
        });
      }
      break;
      
    // ... (rest of your existing message handlers)
  }
});

async function handleClientMessageSend(event, data) {
  const { chatId, content, sender, type = 'text' } = data;
  const localId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  // Save message locally immediately
  const offlineMessage = {
    localId,
    id: localId,
    chatId,
    content,
    sender: sender || 'me',
    timestamp: Date.now(),
    status: 'pending',
    type,
    isOffline: true,
    _queuedAt: Date.now()
  };
  
  await CompleteDB.addMessage(offlineMessage);
  
  // Add to queue for background sync
  await CompleteDB.addToQueue({
    url: '/api/messages/send',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { chatId, content, sender, type },
    localId,
    timestamp: Date.now(),
    type: 'message'
  });
  
  // Return success to client
  event.source.postMessage({
    type: 'MESSAGE_SENT_LOCALLY',
    localId,
    chatId,
    message: offlineMessage,
    success: true
  });
}

// ============================================
// INITIALIZATION
// ============================================

console.log('[MoodChat Service Worker] Enhanced Offline v' + APP_VERSION + ' loaded');
console.log('[STRATEGIES]');
console.log('  • Cache-first for UI files');
console.log('  • Stale-while-revalidate for API');
console.log('  • IndexedDB for chats, contacts, groups');
console.log('  • Offline message queue with auto-sync');
console.log('[RESULT] WhatsApp-style offline experience');
console.log('  • No "You\'re offline" screens');
console.log('  • Instant UI loading from cache');
console.log('  • Local data storage');
console.log('  • Message queuing when offline');
console.log('  • Auto-sync when back online');

// Initial cleanup
setTimeout(() => {
  if (db) cleanupOldData();
}, 10000);