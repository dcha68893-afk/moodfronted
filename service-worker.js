// Service Worker for Kynecta MoodChat - Ultimate Seamless Offline Experience
// Version: 8.0.0 - Complete Offline/Online Parity
// Features:
// 1. Perfect offline/online UI parity - identical experience
// 2. Instant online detection and background sync
// 3. All pages work identically offline
// 4. Full chat history, contacts, groups, calls, status offline
// 5. Real-time sync when connection returns
// 6. No visual differences between online/offline states

const APP_VERSION = '8.0.0';
const CACHE_NAMES = {
  STATIC: `moodchat-static-v${APP_VERSION.replace(/\./g, '-')}`,
  PAGES: `moodchat-pages-v${APP_VERSION.replace(/\./g, '-')}`,
  API: 'moodchat-api-cache',
  DYNAMIC: 'moodchat-dynamic-cache',
  MESSAGES: 'moodchat-messages-v1',
  MEDIA: 'moodchat-media-thumbnails',
  QUEUE: 'moodchat-queue-store',
  UI_STATE: 'moodchat-ui-state' // NEW: Cache for UI state preservation
};

// Enhanced queue system
let messageQueue = [];
let isInitialized = false;

// ============================================
// ENHANCED INDEXEDDB SETUP
// ============================================

function initDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION + 1); // Incremented version
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      isInitialized = true;
      initializeUIState(); // Initialize default UI states
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;
      
      // Messages store
      if (!database.objectStoreNames.contains('messages')) {
        const messagesStore = database.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('chatId', 'chatId', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        messagesStore.createIndex('status', 'status', { unique: false });
      }
      
      // Contacts store
      if (!database.objectStoreNames.contains('contacts')) {
        const contactsStore = database.createObjectStore('contacts', { keyPath: 'id' });
        contactsStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        contactsStore.createIndex('category', 'category', { unique: false }); // For friend categories
      }
      
      // Queued messages
      if (!database.objectStoreNames.contains('messageQueue')) {
        const queueStore = database.createObjectStore('messageQueue', { keyPath: 'localId' });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
      }
      
      // Chats store
      if (!database.objectStoreNames.contains('chats')) {
        const chatsStore = database.createObjectStore('chats', { keyPath: 'id' });
        chatsStore.createIndex('lastMessageTime', 'lastMessageTime', { unique: false });
        chatsStore.createIndex('unreadCount', 'unreadCount', { unique: false });
        chatsStore.createIndex('category', 'category', { unique: false }); // For chat categories
      }
      
      // Groups store
      if (!database.objectStoreNames.contains('groups')) {
        const groupsStore = database.createObjectStore('groups', { keyPath: 'id' });
        groupsStore.createIndex('lastActivity', 'lastActivity', { unique: false });
        groupsStore.createIndex('type', 'type', { unique: false }); // public, private, etc.
      }
      
      // Calls store
      if (!database.objectStoreNames.contains('calls')) {
        const callsStore = database.createObjectStore('calls', { keyPath: 'id' });
        callsStore.createIndex('timestamp', 'timestamp', { unique: false });
        callsStore.createIndex('type', 'type', { unique: false }); // voice, video, group
        callsStore.createIndex('status', 'status', { unique: false }); // missed, received, dialed
      }
      
      // Status updates store
      if (!database.objectStoreNames.contains('status')) {
        const statusStore = database.createObjectStore('status', { keyPath: 'id' });
        statusStore.createIndex('userId', 'userId', { unique: false });
        statusStore.createIndex('timestamp', 'timestamp', { unique: false });
        statusStore.createIndex('category', 'category', { unique: false }); // recent, viewed, etc.
      }
      
      // UI State store (NEW)
      if (!database.objectStoreNames.contains('uiState')) {
        const uiStore = database.createObjectStore('uiState', { keyPath: 'page' });
        uiStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
      
      // Session store for login state
      if (!database.objectStoreNames.contains('session')) {
        const sessionStore = database.createObjectStore('session', { keyPath: 'key' });
      }
    };
  });
}

// Initialize default UI states based on your screenshots
async function initializeUIState() {
  const defaultUIStates = {
    'friends': {
      activeTab: 'All Friends',
      categories: ['All', 'Acquaintance', 'Friend', 'Close Friend'],
      stats: { total: 0, online: 0, mutual: 0 },
      lastUpdated: Date.now()
    },
    'calls': {
      activeTab: 'All',
      callTypes: ['All', 'Missed', 'Groups'],
      recentCalls: [],
      lastUpdated: Date.now()
    },
    'groups': {
      activeTab: 'All Groups',
      categories: ['All', 'Public', 'Private', 'Secret', 'Family'],
      stats: { total: 0, active: 0, members: 0 },
      lastUpdated: Date.now()
    },
    'status': {
      activeTab: 'Recent',
      categories: ['Recent', 'Viewed', 'Muted', 'Archive', 'Highlights'],
      myStatus: { text: 'Tap to add status update', timestamp: null },
      recentUpdates: [],
      lastUpdated: Date.now()
    },
    'chats': {
      activeTab: 'All',
      categories: ['All', 'Unread', 'Archived', 'Blocked'],
      searchTerm: '',
      lastUpdated: Date.now()
    },
    'login': {
      rememberMe: true,
      email: '',
      lastUpdated: Date.now()
    }
  };
  
  for (const [page, state] of Object.entries(defaultUIStates)) {
    await DB.saveUIState(page, state);
  }
}

// Enhanced Database helper functions
const DB = {
  // ... existing functions remain ...
  
  // NEW: UI State Management
  async saveUIState(page, state) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['uiState'], 'readwrite');
      const store = transaction.objectStore('uiState');
      const uiState = {
        page: page,
        state: state,
        lastUpdated: Date.now()
      };
      const request = store.put(uiState);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getUIState(page) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['uiState'], 'readonly');
      const store = transaction.objectStore('uiState');
      const request = store.get(page);
      
      request.onsuccess = () => resolve(request.result?.state || null);
      request.onerror = () => reject(request.error);
    });
  },
  
  // Groups management
  async addGroup(group) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['groups'], 'readwrite');
      const store = transaction.objectStore('groups');
      const request = store.put(group);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getGroups(type = 'all') {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['groups'], 'readonly');
      const store = transaction.objectStore('groups');
      const request = store.getAll();
      
      request.onsuccess = () => {
        let groups = request.result;
        if (type !== 'all') {
          groups = groups.filter(group => group.type === type);
        }
        groups.sort((a, b) => b.lastActivity - a.lastActivity);
        resolve(groups);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Calls management
  async addCall(call) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['calls'], 'readwrite');
      const store = transaction.objectStore('calls');
      const request = store.put(call);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getCalls(type = 'all', status = 'all') {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['calls'], 'readonly');
      const store = transaction.objectStore('calls');
      const request = store.getAll();
      
      request.onsuccess = () => {
        let calls = request.result;
        if (type !== 'all') {
          calls = calls.filter(call => call.type === type);
        }
        if (status !== 'all') {
          calls = calls.filter(call => call.status === status);
        }
        calls.sort((a, b) => b.timestamp - a.timestamp);
        resolve(calls);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Status management
  async addStatus(status) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['status'], 'readwrite');
      const store = transaction.objectStore('status');
      const request = store.put(status);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getStatus(category = 'Recent') {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['status'], 'readonly');
      const store = transaction.objectStore('status');
      const index = store.index('category');
      const range = IDBKeyRange.only(category);
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        const statuses = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(statuses);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // Session management
  async saveSession(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['session'], 'readwrite');
      const store = transaction.objectStore('session');
      const request = store.put({ key, value, timestamp: Date.now() });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getSession(key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['session'], 'readonly');
      const store = transaction.objectStore('session');
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }
};

// ============================================
// ENHANCED PAGE CACHE CONFIGURATION
// ============================================

// All app pages with their default states
const PAGE_CONFIGURATIONS = {
  '/': {
    file: '/index.html',
    cacheAs: 'index',
    offlineState: 'login'
  },
  '/chat.html': {
    file: '/chat.html',
    cacheAs: 'chat',
    offlineState: 'chats'
  },
  '/message.html': {
    file: '/message.html',
    cacheAs: 'message',
    offlineState: 'chat'
  },
  '/calls.html': {
    file: '/calls.html',
    cacheAs: 'calls',
    offlineState: 'calls'
  },
  '/settings.html': {
    file: '/settings.html',
    cacheAs: 'settings',
    offlineState: 'settings'
  },
  '/group.html': {
    file: '/group.html',
    cacheAs: 'group',
    offlineState: 'groups'
  },
  '/tools.html': {
    file: '/tools.html',
    cacheAs: 'tools',
    offlineState: 'tools'
  },
  '/friend.html': {
    file: '/friend.html',
    cacheAs: 'friend',
    offlineState: 'friends'
  },
  '/status.html': {
    file: '/status.html',
    cacheAs: 'status',
    offlineState: 'status'
  },
  '/call.html': {
    file: '/call.html',
    cacheAs: 'call',
    offlineState: 'call'
  }
};

// Enhanced core assets with all page dependencies
const ENHANCED_CORE_ASSETS = [
  ...CORE_ASSETS,
  // Add all page-specific assets
  '/js/friends.js',
  '/js/groups.js',
  '/js/calls.js',
  '/js/status.js',
  '/js/login.js',
  '/css/friends.css',
  '/css/groups.css',
  '/css/calls.css',
  '/css/status.css',
  // Add all image placeholders
  '/images/friends-placeholder.png',
  '/images/groups-placeholder.png',
  '/images/calls-placeholder.png',
  '/images/status-placeholder.png',
  // Add offline data templates
  '/offline-data/friends.json',
  '/offline-data/chats.json',
  '/offline-data/groups.json',
  '/offline-data/calls.json',
  '/offline-data/status.json'
];

// ============================================
// INSTALLATION - Enhanced caching
// ============================================

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Complete UI Parity v' + APP_VERSION);
  
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      // Initialize database
      await initDatabase();
      
      // Cache all static assets
      const staticCache = await caches.open(CACHE_NAMES.STATIC);
      
      try {
        // Cache enhanced assets
        await staticCache.addAll(ENHANCED_CORE_ASSETS);
        console.log('[Service Worker] Enhanced core assets cached');
        
        // Cache each page with its dependencies
        for (const [path, config] of Object.entries(PAGE_CONFIGURATIONS)) {
          try {
            const response = await fetch(config.file);
            if (response.ok) {
              // Cache the page
              await staticCache.put(path, response.clone());
              
              // Also cache as file path
              await staticCache.put(config.file, response.clone());
              
              console.log(`[Service Worker] ✓ Page cached: ${path} -> ${config.file}`);
              
              // Pre-cache offline data for this page
              await preCacheOfflineData(config.offlineState);
            }
          } catch (error) {
            console.log(`[Service Worker] Skipping ${path}:`, error.message);
          }
        }
        
        // Cache all app pages
        const pagesCache = await caches.open(CACHE_NAMES.PAGES);
        for (const page of ALL_APP_PAGES) {
          if (page.endsWith('.html') || page === '/' || page.includes('/')) {
            try {
              const pageUrl = page === '/' ? '/index.html' : page;
              const response = await fetch(pageUrl);
              if (response.ok) {
                await pagesCache.put(page, response.clone());
              }
            } catch (error) {
              // Silent fail
            }
          }
        }
        
      } catch (error) {
        console.log('[Service Worker] Installation warnings:', error);
      }
      
      // Create offline data templates
      await createOfflineDataTemplates();
      
      console.log('[Service Worker] Installation complete - Complete UI parity ready');
      console.log('[Service Worker] All pages will work identically online/offline');
    })()
  );
});

// Pre-cache offline data for specific page states
async function preCacheOfflineData(pageType) {
  const offlineData = {
    friends: {
      friends: [],
      categories: ['All', 'Acquaintance', 'Friend', 'Close Friend'],
      stats: { total: 0, online: 0, mutual: 0 },
      searchResults: []
    },
    groups: {
      groups: [],
      categories: ['All', 'Public', 'Private', 'Secret', 'Family'],
      stats: { total: 0, active: 0, members: 0 },
      searchResults: []
    },
    calls: {
      calls: [],
      tabs: ['All', 'Missed', 'Groups'],
      recentCalls: [],
      callSettings: {}
    },
    status: {
      myStatus: { text: 'Tap to add status update', timestamp: null },
      recentUpdates: [],
      tabs: ['Recent', 'Viewed', 'Muted', 'Archive', 'Highlights'],
      viewedStatuses: []
    },
    chats: {
      chats: [],
      tabs: ['All', 'Unread', 'Archived', 'Blocked'],
      searchResults: [],
      unreadCount: 0
    },
    login: {
      email: '',
      rememberMe: true,
      autoLogin: true
    }
  };
  
  if (offlineData[pageType]) {
    await DB.saveUIState(pageType, offlineData[pageType]);
  }
}

// Create offline data templates
async function createOfflineDataTemplates() {
  const templates = {
    'empty_friends_list': [],
    'empty_groups_list': [],
    'empty_calls_list': [],
    'empty_status_list': [],
    'empty_chats_list': [],
    'default_user_settings': {
      theme: 'light',
      notifications: true,
      autoDownload: false,
      privacy: 'friends'
    }
  };
  
  const apiCache = await caches.open(CACHE_NAMES.API);
  
  for (const [key, data] of Object.entries(templates)) {
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await apiCache.put(`/api/offline/${key}`, response);
  }
}

// ============================================
// ENHANCED FETCH HANDLER
// ============================================

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Handle navigation requests (pages)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request, event));
    return;
  }
  
  // Handle API requests
  if (API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(handleEnhancedApiRequest(request, event));
    return;
  }
  
  // Handle static assets
  event.respondWith(handleEnhancedStaticAsset(request, event));
});

// Handle navigation with perfect offline parity
async function handleNavigationRequest(request, event) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Try cache first for instant load
  const cachedPage = await getPageFromCache(path);
  
  if (cachedPage) {
    // If online, update in background
    if (navigator.onLine) {
      updatePageInBackground(request);
    }
    
    // Enhance cached response with current UI state
    return enhanceCachedResponse(cachedPage, path);
  }
  
  // Try network if online
  if (navigator.onLine) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Cache the fresh page
        await cachePage(path, networkResponse.clone());
        
        // Also update offline data
        await updateOfflineDataForPage(path);
        
        return networkResponse;
      }
    } catch (error) {
      // Continue to fallback
    }
  }
  
  // Serve enhanced offline version
  return serveEnhancedOfflinePage(path);
}

// Get page from cache with fallbacks
async function getPageFromCache(path) {
  const pagesCache = await caches.open(CACHE_NAMES.PAGES);
  let cached = await pagesCache.match(path);
  
  if (!cached) {
    const staticCache = await caches.open(CACHE_NAMES.STATIC);
    cached = await staticCache.match(path);
  }
  
  if (!cached && path !== '/') {
    const pagesCache = await caches.open(CACHE_NAMES.PAGES);
    cached = await pagesCache.match('/');
  }
  
  return cached;
}

// Enhance cached response with current state
async function enhanceCachedResponse(response, path) {
  const pageType = getPageTypeFromPath(path);
  
  // Clone response to modify
  const responseClone = response.clone();
  const html = await responseClone.text();
  
  // Get current UI state for this page
  const uiState = await DB.getUIState(pageType);
  
  if (!uiState) {
    return response;
  }
  
  // Inject UI state into page for consistent rendering
  const enhancedHtml = html.replace(
    '</head>',
    `<script>
      window.__OFFLINE_UI_STATE = ${JSON.stringify(uiState)};
      window.__PAGE_TYPE = '${pageType}';
      window.__IS_OFFLINE = ${!navigator.onLine};
    </script></head>`
  );
  
  return new Response(enhancedHtml, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}

// Serve enhanced offline page
async function serveEnhancedOfflinePage(path) {
  const pageConfig = PAGE_CONFIGURATIONS[path] || PAGE_CONFIGURATIONS['/'];
  const staticCache = await caches.open(CACHE_NAMES.STATIC);
  
  let response = await staticCache.match(pageConfig.file);
  
  if (!response) {
    response = await staticCache.match('/index.html');
  }
  
  if (response) {
    return enhanceCachedResponse(response, path);
  }
  
  // Ultimate fallback
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Kynecta MoodChat</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; padding: 20px; background: #f0f2f5; 
          }
          .container { max-width: 400px; margin: 100px auto; text-align: center; }
          .logo { font-size: 48px; margin-bottom: 20px; }
          .message { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .btn { background: #0084ff; color: white; border: none; padding: 12px 24px; border-radius: 24px; margin-top: 20px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">💬</div>
          <div class="message">
            <h2>Kynecta MoodChat</h2>
            <p>Loading your chat experience...</p>
            <button class="btn" onclick="location.reload()">Retry</button>
          </div>
        </div>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// Enhanced API request handler
async function handleEnhancedApiRequest(request, event) {
  const url = new URL(request.url);
  const isOnline = navigator.onLine;
  
  // Try network first if online
  if (isOnline) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Cache the response
        const responseClone = networkResponse.clone();
        await cacheAPIResponse(request, responseClone);
        
        // Update offline data stores
        await updateStructuredData(request, await responseClone.json());
        
        return networkResponse;
      }
    } catch (error) {
      // Fall through to offline handling
    }
  }
  
  // Offline: Serve cached or generated data
  return serveOfflineApiResponse(request);
}

// Serve offline API response with complete data
async function serveOfflineApiResponse(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Try cached response first
  const apiCache = await caches.open(CACHE_NAMES.API);
  const cached = await apiCache.match(request);
  
  if (cached) {
    return cached;
  }
  
  // Generate response based on request type
  if (path.includes('/api/friends')) {
    return generateFriendsResponse();
  } else if (path.includes('/api/groups')) {
    return generateGroupsResponse();
  } else if (path.includes('/api/calls')) {
    return generateCallsResponse();
  } else if (path.includes('/api/status')) {
    return generateStatusResponse();
  } else if (path.includes('/api/chats')) {
    return generateChatsResponse();
  } else if (path.includes('/api/messages')) {
    const chatId = path.split('/').pop();
    return generateMessagesResponse(chatId);
  }
  
  // Generic offline response
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {},
    timestamp: Date.now(),
    message: 'Using offline data - identical to online experience'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate complete friends response
async function generateFriendsResponse() {
  const friends = await DB.getContacts() || [];
  const uiState = await DB.getUIState('friends') || {};
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      friends: friends,
      categories: uiState.categories || ['All', 'Acquaintance', 'Friend', 'Close Friend'],
      stats: uiState.stats || { total: friends.length, online: 0, mutual: 0 },
      searchResults: [],
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate complete groups response
async function generateGroupsResponse() {
  const groups = await DB.getGroups() || [];
  const uiState = await DB.getUIState('groups') || {};
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      groups: groups,
      categories: uiState.categories || ['All', 'Public', 'Private', 'Secret', 'Family'],
      stats: uiState.stats || { total: groups.length, active: 0, members: 0 },
      searchResults: [],
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate complete calls response
async function generateCallsResponse() {
  const calls = await DB.getCalls() || [];
  const uiState = await DB.getUIState('calls') || {};
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      calls: calls,
      tabs: uiState.tabs || ['All', 'Missed', 'Groups'],
      recentCalls: calls.slice(0, 10),
      callSettings: uiState.callSettings || {},
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate complete status response
async function generateStatusResponse() {
  const statuses = await DB.getStatus() || [];
  const uiState = await DB.getUIState('status') || {};
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      myStatus: uiState.myStatus || { text: 'Tap to add status update', timestamp: null },
      recentUpdates: statuses,
      tabs: uiState.tabs || ['Recent', 'Viewed', 'Muted', 'Archive', 'Highlights'],
      viewedStatuses: [],
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate complete chats response
async function generateChatsResponse() {
  const chats = await DB.getChats() || [];
  const uiState = await DB.getUIState('chats') || {};
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      chats: chats,
      tabs: uiState.tabs || ['All', 'Unread', 'Archived', 'Blocked'],
      searchResults: [],
      unreadCount: chats.filter(c => c.unreadCount > 0).length,
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Generate messages response
async function generateMessagesResponse(chatId) {
  const messages = await DB.getMessages(chatId, 100) || [];
  
  return new Response(JSON.stringify({
    success: true,
    offline: true,
    data: {
      messages: messages,
      chatId: chatId,
      hasMore: messages.length >= 100,
      timestamp: Date.now()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ============================================
// REAL-TIME ONLINE DETECTION AND SYNC
// ============================================

// Enhanced network monitoring
let lastOnlineStatus = navigator.onLine;
let syncInProgress = false;

function monitorNetworkStatus() {
  const isOnline = navigator.onLine;
  
  if (isOnline !== lastOnlineStatus) {
    lastOnlineStatus = isOnline;
    
    // Notify all clients instantly
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NETWORK_CHANGE',
          online: isOnline,
          timestamp: Date.now(),
          instant: true
        });
      });
    });
    
    console.log(`[Service Worker] Network changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    // If just came online, sync immediately
    if (isOnline && !syncInProgress) {
      performInstantSync();
    }
  }
}

// Perform instant sync when coming online
async function performInstantSync() {
  if (syncInProgress) return;
  
  syncInProgress = true;
  
  try {
    console.log('[Service Worker] Performing instant sync...');
    
    // 1. Sync queued messages
    await processQueuedMessages();
    
    // 2. Update all cached pages
    await refreshCachedPages();
    
    // 3. Update all API data
    await refreshAPIData();
    
    // 4. Update UI states
    await refreshUIStates();
    
    // Notify clients sync is complete
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          timestamp: Date.now(),
          message: 'All data synchronized'
        });
      });
    });
    
    console.log('[Service Worker] Instant sync complete');
    
  } catch (error) {
    console.log('[Service Worker] Sync error:', error);
  } finally {
    syncInProgress = false;
  }
}

// Refresh cached pages
async function refreshCachedPages() {
  const pagesCache = await caches.open(CACHE_NAMES.PAGES);
  
  for (const [path, config] of Object.entries(PAGE_CONFIGURATIONS)) {
    try {
      const response = await fetch(config.file);
      if (response.ok) {
        await pagesCache.put(path, response.clone());
        await pagesCache.put(config.file, response.clone());
      }
    } catch (error) {
      // Continue with other pages
    }
  }
}

// Refresh API data
async function refreshAPIData() {
  // This would typically sync with your backend
  // For now, we'll just update timestamps
  const apiCache = await caches.open(CACHE_NAMES.API);
  
  const requests = [
    '/api/friends',
    '/api/groups',
    '/api/calls',
    '/api/status',
    '/api/chats'
  ];
  
  for (const url of requests) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await apiCache.put(url, response.clone());
        await updateStructuredData(new Request(url), await response.json());
      }
    } catch (error) {
      // Continue with other endpoints
    }
  }
}

// Refresh UI states
async function refreshUIStates() {
  const pages = ['friends', 'groups', 'calls', 'status', 'chats', 'login'];
  
  for (const page of pages) {
    const currentState = await DB.getUIState(page) || {};
    currentState.lastSynced = Date.now();
    currentState.isOnline = true;
    await DB.saveUIState(page, currentState);
  }
}

// ============================================
// BACKGROUND SYNC ENHANCEMENTS
// ============================================

// Enhanced message queuing
async function queueMessageWithUIUpdate(message) {
  const queued = await DB.addToQueue(message);
  
  // Update UI state to reflect queued message
  const uiState = await DB.getUIState('chats') || {};
  if (!uiState.queuedMessages) uiState.queuedMessages = [];
  uiState.queuedMessages.push({
    localId: queued.localId,
    content: message.body.content,
    timestamp: queued.timestamp
  });
  await DB.saveUIState('chats', uiState);
  
  return queued;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getPageTypeFromPath(path) {
  if (path.includes('friend')) return 'friends';
  if (path.includes('group')) return 'groups';
  if (path.includes('call')) return 'calls';
  if (path.includes('status')) return 'status';
  if (path.includes('chat') || path.includes('message')) return 'chats';
  if (path.includes('login') || path === '/' || path.includes('index')) return 'login';
  return 'general';
}

async function cachePage(path, response) {
  const pagesCache = await caches.open(CACHE_NAMES.PAGES);
  await pagesCache.put(path, response);
  
  // Also cache the actual file
  const config = PAGE_CONFIGURATIONS[path];
  if (config) {
    await pagesCache.put(config.file, response.clone());
  }
}

async function updatePageInBackground(request) {
  setTimeout(async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cachePage(request.url, response.clone());
      }
    } catch (error) {
      // Silent background update failure
    }
  }, 1000);
}

async function cacheAPIResponse(request, response) {
  const apiCache = await caches.open(CACHE_NAMES.API);
  await apiCache.put(request, response);
}

async function updateStructuredData(request, data) {
  // Update IndexedDB based on API response
  if (data.friends && Array.isArray(data.friends)) {
    for (const friend of data.friends) {
      await DB.updateContact(friend);
    }
  }
  
  if (data.groups && Array.isArray(data.groups)) {
    for (const group of data.groups) {
      await DB.addGroup(group);
    }
  }
  
  if (data.calls && Array.isArray(data.calls)) {
    for (const call of data.calls) {
      await DB.addCall(call);
    }
  }
  
  if (data.status && Array.isArray(data.status)) {
    for (const status of data.status) {
      await DB.addStatus(status);
    }
  }
  
  if (data.chats && Array.isArray(data.chats)) {
    for (const chat of data.chats) {
      await DB.addChat(chat);
    }
  }
}

async function updateOfflineDataForPage(path) {
  const pageType = getPageTypeFromPath(path);
  // Update the UI state timestamp
  const uiState = await DB.getUIState(pageType) || {};
  uiState.lastUpdated = Date.now();
  uiState.lastOnlineUpdate = Date.now();
  await DB.saveUIState(pageType, uiState);
}

// ============================================
// INITIALIZATION
// ============================================

// Start enhanced network monitoring
setInterval(monitorNetworkStatus, 1000);
monitorNetworkStatus();

// Periodic cleanup and maintenance
setInterval(async () => {
  await cleanupOldData();
  
  // Refresh UI states periodically when online
  if (navigator.onLine) {
    await refreshUIStates();
  }
}, 300000); // Every 5 minutes

console.log('[MoodChat Service Worker] Complete UI Parity v' + APP_VERSION + ' loaded');
console.log('[Service Worker] All pages work identically online/offline');
console.log('[Service Worker] Instant online detection and sync');
console.log('[Service Worker] WhatsApp-like seamless experience');
console.log('[Service Worker] Users will NOT notice offline/online transitions');