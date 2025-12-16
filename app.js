// app.js - Application Shell & Tab Controller for Kynecta
// Manages the single-page application shell and tab visibility
// Enhanced with Firebase auth, offline detection, and global state management

// ============================================================================
// CONFIGURATION
// ============================================================================

// Application configuration
const APP_CONFIG = {
  defaultPage: 'group.html',
  contentArea: '#content-area',
  sidebar: '#sidebar',
  sidebarToggle: '#sidebarToggle'
};

// Map tab names to their container IDs in chat.html
const TAB_CONFIG = {
  chats: {
    container: '#chatsTab',
    icon: '[data-tab="chats"]',
    isExternal: false
  },
  groups: {
    container: '#groupsTab',
    icon: '[data-tab="groups"]',
    isExternal: false
  },
  friends: {
    container: '#friendsTab',
    icon: '[data-tab="friends"]',
    isExternal: false
  },
  calls: {
    container: '#callsTab',
    icon: '[data-tab="calls"]',
    isExternal: false
  },
  tools: {
    container: '#toolsTab',
    icon: '[data-tab="tools"]',
    isExternal: false
  }
};

// External page configurations
const EXTERNAL_TABS = {
  groups: 'group.html'
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentTab = 'groups'; // Default to groups
let isLoading = false;
let isSidebarOpen = true;

// FIREBASE AUTH STATE - SINGLE SOURCE OF TRUTH
let currentUser = null;
let firebaseInitialized = false;
let authStateRestored = false;

// NETWORK CONNECTIVITY STATE
let isOnline = navigator.onLine;
let syncQueue = []; // Queue for messages to sync when online

// ============================================================================
// FIREBASE INITIALIZATION (RUNS ONCE, WORKS OFFLINE)
// ============================================================================

function initializeFirebase() {
  if (firebaseInitialized) {
    console.log('Firebase already initialized');
    return;
  }

  console.log('Initializing Firebase...');
  
  try {
    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.apps) {
      console.error('Firebase SDK not loaded');
      // Set auth as restored even without Firebase for offline mode
      authStateRestored = true;
      broadcastAuthReady();
      return;
    }

    // Initialize Firebase app if not already initialized
    if (firebase.apps.length === 0) {
      // Firebase config should be defined in index.html or loaded elsewhere
      if (window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
        console.log('Firebase app initialized');
      } else {
        console.warn('Firebase config not found. Running in offline mode.');
        // Continue without Firebase for offline functionality
        authStateRestored = true;
        broadcastAuthReady();
        return;
      }
    }

    // Get auth instance
    const auth = firebase.auth();
    
    // CRITICAL: Set persistence to LOCAL for offline login
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(() => {
        console.log('Auth persistence set to LOCAL');
        
        // FIRST: Restore from localStorage (immediate, works offline)
        restoreUserFromLocalStorage();
        
        // SECOND: Set up Firebase auth observer (works when online)
        const unsubscribe = auth.onAuthStateChanged((user) => {
          console.log('Firebase auth state changed:', user ? 'User logged in' : 'No user');
          
          // Only update if different from localStorage user
          const storedUser = getStoredUserFromLocalStorage();
          if (!user && storedUser) {
            // Firebase says no user, but we have one stored - keep stored user
            console.log('Keeping stored user despite Firebase state');
            handleAuthStateChange(storedUser, true); // fromStorage flag
          } else {
            // Use Firebase user or null
            handleAuthStateChange(user, false);
          }
          
          // Mark auth as restored
          if (!authStateRestored) {
            authStateRestored = true;
            broadcastAuthReady();
          }
        }, (error) => {
          console.error('Auth state observer error:', error);
          // Even if Firebase fails, restore from localStorage
          if (!authStateRestored) {
            restoreUserFromLocalStorage();
            authStateRestored = true;
            broadcastAuthReady();
          }
        });
        
        // Store unsubscribe function for cleanup
        window._firebaseAuthUnsubscribe = unsubscribe;
        
        firebaseInitialized = true;
        console.log('Firebase auth initialized successfully');
        
        // If auth state hasn't been restored within 3 seconds, force it
        setTimeout(() => {
          if (!authStateRestored) {
            console.log('Forcing auth state restoration');
            restoreUserFromLocalStorage();
            authStateRestored = true;
            broadcastAuthReady();
          }
        }, 3000);
      })
      .catch((error) => {
        console.error('Error setting auth persistence:', error);
        // Continue with localStorage-based auth
        restoreUserFromLocalStorage();
        firebaseInitialized = true;
        authStateRestored = true;
        broadcastAuthReady();
      });

  } catch (error) {
    console.error('Firebase initialization error:', error);
    // Don't prevent app from loading if Firebase fails
    restoreUserFromLocalStorage();
    firebaseInitialized = true;
    authStateRestored = true;
    broadcastAuthReady();
  }
}

// Get stored user from localStorage
function getStoredUserFromLocalStorage() {
  try {
    const storedAuth = localStorage.getItem('kynecta-auth-state');
    if (storedAuth) {
      const authData = JSON.parse(storedAuth);
      if (authData.user && authData.user.uid) {
        return authData.user;
      }
    }
  } catch (error) {
    console.warn('Could not get stored user:', error);
  }
  return null;
}

// Restore user from localStorage (fastest method, works offline)
function restoreUserFromLocalStorage() {
  const storedUser = getStoredUserFromLocalStorage();
  if (storedUser) {
    console.log('Restoring user from localStorage:', storedUser.uid);
    handleAuthStateChange(storedUser, true);
    
    // Update global state immediately
    updateGlobalAuthState(storedUser);
    
    // Broadcast to other components
    broadcastAuthChange(storedUser);
    
    return true;
  }
  return false;
}

// Handle auth state changes
function handleAuthStateChange(user, fromStorage = false) {
  // Only update if user is different
  const userId = user ? user.uid : null;
  const currentUserId = currentUser ? currentUser.uid : null;
  
  if (userId !== currentUserId) {
    currentUser = user;
    
    // Update global auth state
    updateGlobalAuthState(user);
    
    // Broadcast auth change to other components
    broadcastAuthChange(user);
    
    // Store in localStorage for persistence (unless this came from storage)
    if (!fromStorage) {
      storeAuthInLocalStorage(user);
    }
    
    // If user logged in and we're online, try to update user data
    if (user && isOnline && firebaseInitialized && !fromStorage) {
      updateUserProfile(user);
    }
    
    console.log('Auth state updated:', user ? user.uid : 'No user');
  }
}

// Update global auth state
function updateGlobalAuthState(user) {
  window.APP_AUTH = {
    currentUser: user,
    isAuthenticated: !!user,
    userId: user ? user.uid : null,
    userEmail: user ? user.email : null,
    displayName: user ? user.displayName : null,
    photoURL: user ? user.photoURL : null,
    isAuthReady: authStateRestored,
    timestamp: new Date().toISOString()
  };
  
  // Dispatch custom event for other components
  const event = new CustomEvent('auth-state-change', {
    detail: { 
      user: user, 
      isAuthenticated: !!user,
      isAuthReady: authStateRestored,
      fromStorage: false
    }
  });
  window.dispatchEvent(event);
}

// Broadcast auth change to other tabs/pages
function broadcastAuthChange(user) {
  const authData = {
    type: 'auth-state',
    user: user ? {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified || false
    } : null,
    isAuthenticated: !!user,
    timestamp: new Date().toISOString()
  };
  
  try {
    localStorage.setItem('kynecta-auth-state', JSON.stringify(authData));
    
    // Dispatch storage event for other tabs/windows
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'kynecta-auth-state',
      newValue: JSON.stringify(authData)
    }));
  } catch (e) {
    console.warn('Could not broadcast auth state to localStorage:', e);
  }
}

// Store auth in localStorage
function storeAuthInLocalStorage(user) {
  try {
    localStorage.setItem('kynecta-auth-state', JSON.stringify({
      user: user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified || false
      } : null,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('Could not store auth state in localStorage:', e);
  }
}

// Update user profile (when online)
function updateUserProfile(user) {
  if (!user || !firebaseInitialized) return;
  
  // This can be extended to fetch additional user data from Firestore
  console.log('User profile updated:', user.uid);
  
  // Update localStorage with latest user data
  storeAuthInLocalStorage(user);
}

// Broadcast that auth is ready
function broadcastAuthReady() {
  const event = new CustomEvent('auth-ready', {
    detail: { 
      isReady: true,
      timestamp: new Date().toISOString(),
      user: currentUser
    }
  });
  window.dispatchEvent(event);
  console.log('Auth ready broadcasted, user:', currentUser ? currentUser.uid : 'No user');
}

// ============================================================================
// GLOBAL AUTH ACCESS FOR ALL PAGES
// ============================================================================

function setupGlobalAuthAccess() {
  // Create global access methods for all pages
  window.getCurrentUser = () => currentUser;
  window.getCurrentUserId = () => currentUser ? currentUser.uid : null;
  window.isAuthenticated = () => !!currentUser;
  window.isAuthReady = () => authStateRestored;
  window.waitForAuth = () => {
    return new Promise((resolve) => {
      if (authStateRestored) {
        resolve(currentUser);
      } else {
        const listener = () => {
          window.removeEventListener('auth-ready', listener);
          resolve(currentUser);
        };
        window.addEventListener('auth-ready', listener);
      }
    });
  };
  
  // Expose to window for immediate access
  window.KYNECTA_AUTH = {
    getCurrentUser: () => currentUser,
    getUserId: () => currentUser ? currentUser.uid : null,
    isAuthenticated: () => !!currentUser,
    getUserEmail: () => currentUser ? currentUser.email : null,
    getDisplayName: () => currentUser ? currentUser.displayName : null,
    getPhotoURL: () => currentUser ? currentUser.photoURL : null,
    isAuthReady: () => authStateRestored,
    waitForAuth: window.waitForAuth
  };
}

// ============================================================================
// NETWORK DETECTION & BACKGROUND SYNC
// ============================================================================

function initializeNetworkDetection() {
  console.log('Initializing network detection...');
  
  // Set initial state
  updateNetworkStatus(navigator.onLine);
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initialize IndexedDB for queued messages
  initializeMessageQueue();
  
  // Start periodic sync check
  startSyncMonitor();
}

// Handle online event
function handleOnline() {
  console.log('Network: Online');
  updateNetworkStatus(true);
  
  // Broadcast network change to other files
  broadcastNetworkChange(true);
  
  // BACKGROUND SYNC: Trigger sync when coming online
  triggerBackgroundSync();
  
  // If we have a stored user and Firebase is initialized, verify with Firebase
  if (currentUser && firebaseInitialized) {
    setTimeout(() => {
      const auth = firebase.auth();
      auth.currentUser?.reload().catch(error => {
        console.log('User reload error (might be offline user):', error.message);
      });
    }, 1000);
  }
}

// Handle offline event
function handleOffline() {
  console.log('Network: Offline');
  updateNetworkStatus(false);
  
  // Broadcast network change to other files
  broadcastNetworkChange(false);
}

// Update network status globally
function updateNetworkStatus(online) {
  isOnline = online;
  
  // Expose globally for other modules
  window.APP_CONNECTIVITY = {
    isOnline: isOnline,
    isOffline: !isOnline,
    lastChange: new Date().toISOString(),
    syncQueueSize: syncQueue.length
  };
  
  // Dispatch custom event for other components
  const event = new CustomEvent('network-status-change', {
    detail: { 
      isOnline: isOnline, 
      isOffline: !isOnline 
    }
  });
  window.dispatchEvent(event);
  
  // Update UI based on network status
  updateNetworkUI(online);
}

// Update UI based on network status
function updateNetworkUI(online) {
  // Remove existing network indicators
  const existingIndicator = document.getElementById('network-status-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  if (!online) {
    // Create offline indicator
    const indicator = document.createElement('div');
    indicator.id = 'network-status-indicator';
    indicator.innerHTML = `
      <div class="offline-indicator">
        <span>⚠️ You're offline. Messages will be sent when you reconnect.</span>
      </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .offline-indicator {
        background: #f59e0b;
        color: white;
        padding: 8px 16px;
        text-align: center;
        font-size: 14px;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
      }
      @keyframes slideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.prepend(indicator);
  }
}

// Broadcast network changes
function broadcastNetworkChange(isOnline) {
  const status = {
    type: 'network-status',
    isOnline: isOnline,
    isOffline: !isOnline,
    timestamp: new Date().toISOString()
  };
  
  try {
    localStorage.setItem('kynecta-network-status', JSON.stringify(status));
    
    // Dispatch storage event for other tabs/windows
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'kynecta-network-status',
      newValue: JSON.stringify(status)
    }));
  } catch (e) {
    console.warn('Could not broadcast network status to localStorage:', e);
  }
}

// Start periodic sync monitor
function startSyncMonitor() {
  // Check for queued items every 30 seconds
  setInterval(() => {
    if (isOnline && syncQueue.length > 0) {
      console.log('Periodic sync check - processing queue');
      processQueuedMessages();
    }
  }, 30000);
}

// BACKGROUND SYNC: Process queued messages
function triggerBackgroundSync() {
  console.log('Background sync triggered - app is online');
  
  // Process queued messages
  processQueuedMessages();
  
  // Call global sync function if defined (for other modules)
  if (typeof window.syncOfflineData === 'function') {
    window.syncOfflineData().catch(error => {
      console.warn('Background sync error:', error);
    });
  }
}

// Initialize IndexedDB for message queue
function initializeMessageQueue() {
  if (!window.indexedDB) {
    console.warn('IndexedDB not supported, offline queue disabled');
    return;
  }
  
  const request = indexedDB.open('KynectaMessageQueue', 2);
  
  request.onerror = function(event) {
    console.error('Failed to open IndexedDB:', event.target.error);
  };
  
  request.onupgradeneeded = function(event) {
    const db = event.target.result;
    const oldVersion = event.oldVersion;
    
    // Create object store for queued messages
    if (oldVersion < 1 || !db.objectStoreNames.contains('messages')) {
      const store = db.createObjectStore('messages', {
        keyPath: 'id',
        autoIncrement: true
      });
      
      // Create indexes for efficient querying
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
      store.createIndex('type', 'type', { unique: false });
    }
    
    // Create object store for other actions (status updates, friend requests, etc.)
    if (oldVersion < 2 || !db.objectStoreNames.contains('actions')) {
      const actionStore = db.createObjectStore('actions', {
        keyPath: 'id',
        autoIncrement: true
      });
      
      actionStore.createIndex('status', 'status', { unique: false });
      actionStore.createIndex('type', 'type', { unique: false });
      actionStore.createIndex('timestamp', 'timestamp', { unique: false });
    }
  };
  
  request.onsuccess = function(event) {
    console.log('Message queue database initialized');
    
    // Load existing queue into memory
    loadQueueIntoMemory(event.target.result);
  };
}

// Load existing queue into memory
function loadQueueIntoMemory(db) {
  const transaction = db.transaction(['messages', 'actions'], 'readonly');
  const messageStore = transaction.objectStore('messages');
  const actionStore = transaction.objectStore('actions');
  
  // Load messages
  messageStore.getAll().onsuccess = function(event) {
    const messages = event.target.result;
    messages.forEach(msg => {
      if (msg.status === 'pending') {
        syncQueue.push(msg);
      }
    });
    console.log(`Loaded ${messages.length} messages from queue`);
  };
  
  // Load actions
  actionStore.getAll().onsuccess = function(event) {
    const actions = event.target.result;
    actions.forEach(action => {
      if (action.status === 'pending') {
        syncQueue.push(action);
      }
    });
    console.log(`Loaded ${actions.length} actions from queue`);
  };
}

// Queue any action for offline sync
function queueForSync(data, type = 'message') {
  if (!window.indexedDB) return Promise.resolve({ queued: false, offline: true });
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('KynectaMessageQueue', 2);
    
    request.onerror = function(event) {
      console.error('Failed to open IndexedDB for queuing:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      const storeName = type === 'message' ? 'messages' : 'actions';
      
      if (!db.objectStoreNames.contains(storeName)) {
        reject(new Error(`Store ${storeName} not found`));
        return;
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const item = {
        ...data,
        type: type,
        status: 'pending',
        timestamp: new Date().toISOString(),
        userId: currentUser ? currentUser.uid : 'anonymous',
        attempts: 0
      };
      
      const addRequest = store.add(item);
      
      addRequest.onsuccess = function() {
        console.log(`${type} queued for sync:`, data);
        
        // Add to in-memory queue
        syncQueue.push({
          id: addRequest.result,
          ...item
        });
        
        // Update global connectivity state
        window.APP_CONNECTIVITY.syncQueueSize = syncQueue.length;
        
        resolve({ 
          queued: true, 
          offline: true, 
          id: addRequest.result,
          message: `${type} queued for when online`
        });
      };
      
      addRequest.onerror = function(event) {
        console.error(`Failed to queue ${type}:`, event.target.error);
        reject(event.target.error);
      };
    };
  });
}

// Process queued messages when online
function processQueuedMessages() {
  if (!isOnline || !window.indexedDB || syncQueue.length === 0) return;
  
  console.log(`Processing ${syncQueue.length} queued items...`);
  
  const request = indexedDB.open('KynectaMessageQueue', 2);
  
  request.onerror = function(event) {
    console.error('Failed to open IndexedDB for processing:', event.target.error);
  };
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    
    // Process messages
    processStoreQueue(db, 'messages');
    
    // Process actions
    processStoreQueue(db, 'actions');
  };
}

// Process queue for a specific store
function processStoreQueue(db, storeName) {
  const transaction = db.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);
  const index = store.index('status');
  const range = IDBKeyRange.only('pending');
  
  const getRequest = index.getAll(range);
  
  getRequest.onsuccess = function() {
    const items = getRequest.result;
    
    if (items.length === 0) {
      console.log(`No pending ${storeName} to sync`);
      return;
    }
    
    console.log(`Processing ${items.length} queued ${storeName}`);
    
    // Process each item
    items.forEach(item => {
      sendQueuedItem(item, db, storeName);
    });
  };
}

// Send a queued item
function sendQueuedItem(item, db, storeName) {
  // Determine how to send based on type
  const sendFunction = getSendFunctionForType(item.type || storeName);
  
  if (!sendFunction) {
    console.warn(`No send function for type: ${item.type}`);
    markItemAsFailed(item.id, db, storeName, 'No send function');
    return;
  }
  
  // Increment attempts
  item.attempts = (item.attempts || 0) + 1;
  
  if (item.attempts > 5) {
    // Too many attempts, mark as failed
    markItemAsFailed(item.id, db, storeName, 'Max attempts exceeded');
    return;
  }
  
  // Try to send
  sendFunction(item)
    .then(result => {
      // Success - mark as sent
      markItemAsSent(item.id, db, storeName);
    })
    .catch(error => {
      console.error(`Failed to send ${item.type}:`, error);
      
      // Update attempt count
      updateItemAttempts(item.id, db, storeName, item.attempts);
    });
}

// Get appropriate send function based on type
function getSendFunctionForType(type) {
  // These functions should be defined in respective modules
  switch(type) {
    case 'message':
    case 'messages':
      return window.sendQueuedMessage || defaultSendMessage;
    case 'status':
      return window.sendQueuedStatus || defaultSendStatus;
    case 'friend_request':
      return window.sendQueuedFriendRequest || defaultSendFriendRequest;
    case 'call_log':
      return window.sendQueuedCallLog || defaultSendCallLog;
    default:
      return defaultSendItem;
  }
}

// Default send functions (to be overridden by specific modules)
function defaultSendMessage(message) {
  console.log('Sending queued message:', message);
  // This should be implemented in chat.js
  return Promise.resolve();
}

function defaultSendStatus(status) {
  console.log('Sending queued status:', status);
  // This should be implemented in status.js
  return Promise.resolve();
}

function defaultSendFriendRequest(request) {
  console.log('Sending queued friend request:', request);
  // This should be implemented in friends.js
  return Promise.resolve();
}

function defaultSendCallLog(callLog) {
  console.log('Sending queued call log:', callLog);
  // This should be implemented in calls.js
  return Promise.resolve();
}

function defaultSendItem(item) {
  console.log('Sending queued item:', item);
  return Promise.resolve();
}

// Mark item as sent
function markItemAsSent(itemId, db, storeName) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item) {
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
      
      const updateRequest = store.put(item);
      updateRequest.onsuccess = function() {
        console.log(`${storeName} ${itemId} marked as sent`);
        
        // Remove from in-memory queue
        syncQueue = syncQueue.filter(item => item.id !== itemId);
        window.APP_CONNECTIVITY.syncQueueSize = syncQueue.length;
      };
    }
  };
}

// Mark item as failed
function markItemAsFailed(itemId, db, storeName, reason) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item) {
      item.status = 'failed';
      item.failedAt = new Date().toISOString();
      item.failureReason = reason;
      
      store.put(item);
      
      // Remove from in-memory queue
      syncQueue = syncQueue.filter(item => item.id !== itemId);
      window.APP_CONNECTIVITY.syncQueueSize = syncQueue.length;
    }
  };
}

// Update item attempt count
function updateItemAttempts(itemId, db, storeName, attempts) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item) {
      item.attempts = attempts;
      store.put(item);
    }
  };
}

// Safe API call wrapper with offline queuing
function safeApiCall(apiFunction, data, type = 'action') {
  return new Promise((resolve, reject) => {
    if (!isOnline) {
      console.warn('API call prevented: offline mode');
      
      // Queue the data for later sync
      queueForSync({
        apiFunction: apiFunction.name || 'anonymous',
        data: data,
        originalCall: new Date().toISOString()
      }, type)
      .then(queueResult => {
        resolve({
          success: false,
          offline: true,
          queued: queueResult.queued,
          message: 'Action queued for when online',
          queueId: queueResult.id
        });
      })
      .catch(error => {
        resolve({
          success: false,
          offline: true,
          queued: false,
          message: 'Offline mode: action not queued',
          error: error.message
        });
      });
      return;
    }
    
    // Online - proceed with API call
    try {
      const result = apiFunction(data);
      
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(error => {
          console.error('API call failed:', error);
          
          // If error is network-related, try to queue
          if (!navigator.onLine || error.message.includes('network') || error.message.includes('offline')) {
            queueForSync({
              apiFunction: apiFunction.name || 'anonymous',
              data: data,
              error: error.message,
              originalCall: new Date().toISOString()
            }, type)
            .then(queueResult => {
              resolve({
                success: false,
                offline: true,
                queued: queueResult.queued,
                message: 'Network error - action queued for retry',
                queueId: queueResult.id
              });
            });
          } else {
            reject(error);
          }
        });
      } else {
        resolve(result);
      }
    } catch (error) {
      console.error('API call error:', error);
      reject(error);
    }
  });
}

// ============================================================================
// GLOBAL STATE EXPOSURE TO ALL PAGES
// ============================================================================

function exposeGlobalStateToIframes() {
  // Create global state object if it doesn't exist
  if (!window.KYNECTA_GLOBAL) {
    window.KYNECTA_GLOBAL = {};
  }
  
  // Expose auth state
  window.KYNECTA_GLOBAL.auth = {
    getCurrentUser: () => currentUser,
    getUserId: () => currentUser ? currentUser.uid : null,
    isAuthenticated: () => !!currentUser,
    getUserEmail: () => currentUser ? currentUser.email : null,
    getDisplayName: () => currentUser ? currentUser.displayName : null,
    getPhotoURL: () => currentUser ? currentUser.photoURL : null,
    isAuthReady: () => authStateRestored,
    waitForAuth: () => {
      return new Promise((resolve) => {
        if (authStateRestored) {
          resolve(currentUser);
        } else {
          const listener = () => {
            window.removeEventListener('auth-ready', listener);
            resolve(currentUser);
          };
          window.addEventListener('auth-ready', listener);
        }
      });
    }
  };
  
  // Expose network state
  window.KYNECTA_GLOBAL.network = {
    isOnline: () => isOnline,
    isOffline: () => !isOnline,
    getSyncQueueSize: () => syncQueue.length,
    waitForOnline: () => {
      return new Promise((resolve) => {
        if (isOnline) {
          resolve();
        } else {
          const listener = () => {
            window.removeEventListener('network-status-change', listener);
            resolve();
          };
          window.addEventListener('network-status-change', (e) => {
            if (e.detail.isOnline) {
              listener();
            }
          });
        }
      });
    }
  };
  
  // Expose sync functions
  window.KYNECTA_GLOBAL.sync = {
    queueForSync: queueForSync,
    safeApiCall: safeApiCall,
    processQueuedMessages: processQueuedMessages,
    getQueuedItems: () => [...syncQueue]
  };
}

// ============================================================================
// CROSS-PAGE COMMUNICATION
// ============================================================================

function setupCrossPageCommunication() {
  // Listen for messages from iframes
  window.addEventListener('message', handleIframeMessage);
  
  // Listen for storage events from other tabs
  window.addEventListener('storage', handleStorageEvent);
  
  // Broadcast initial state to all iframes
  setTimeout(broadcastStateToIframes, 1000);
}

function handleIframeMessage(event) {
  // Only accept messages from our own domain
  if (event.origin !== window.location.origin) return;
  
  const { type, data } = event.data || {};
  
  switch(type) {
    case 'get-auth-state':
      // Send auth state back to iframe
      event.source.postMessage({
        type: 'auth-state',
        data: {
          user: currentUser,
          isAuthenticated: !!currentUser,
          isAuthReady: authStateRestored
        }
      }, event.origin);
      break;
      
    case 'get-network-state':
      // Send network state back to iframe
      event.source.postMessage({
        type: 'network-state',
        data: {
          isOnline: isOnline,
          isOffline: !isOnline
        }
      }, event.origin);
      break;
      
    case 'queue-action':
      // Queue action from iframe
      if (data) {
        queueForSync(data, data.type || 'action')
          .then(result => {
            event.source.postMessage({
              type: 'action-queued',
              data: result
            }, event.origin);
          });
      }
      break;
  }
}

function handleStorageEvent(event) {
  // Handle auth state changes from other tabs
  if (event.key === 'kynecta-auth-state' && event.newValue) {
    try {
      const authState = JSON.parse(event.newValue);
      if (authState.type === 'auth-state') {
        // Update local state if different
        if (authState.user && (!currentUser || authState.user.uid !== currentUser.uid)) {
          console.log('Auth state updated from other tab');
          currentUser = authState.user;
          updateGlobalAuthState(currentUser);
        }
      }
    } catch (e) {
      console.warn('Failed to parse auth state from storage:', e);
    }
  }
  
  // Handle network state changes from other tabs
  if (event.key === 'kynecta-network-status' && event.newValue) {
    try {
      const networkState = JSON.parse(event.newValue);
      if (networkState.type === 'network-status') {
        if (isOnline !== networkState.isOnline) {
          console.log('Network state updated from other tab');
          updateNetworkStatus(networkState.isOnline);
        }
      }
    } catch (e) {
      console.warn('Failed to parse network state from storage:', e);
    }
  }
}

function broadcastStateToIframes() {
  // This function would broadcast state to all iframes
  // In a real implementation, you would get all iframes and post messages
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      iframe.contentWindow.postMessage({
        type: 'auth-state-update',
        data: {
          user: currentUser,
          isAuthenticated: !!currentUser,
          isAuthReady: authStateRestored
        }
      }, window.location.origin);
      
      iframe.contentWindow.postMessage({
        type: 'network-state-update',
        data: {
          isOnline: isOnline,
          isOffline: !isOnline
        }
      }, window.location.origin);
    } catch (e) {
      // Silent fail - iframe might not be ready or from different origin
    }
  });
}

// ============================================================================
// APPLICATION SHELL FUNCTIONS (UNCHANGED)
// ============================================================================

window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    isSidebarOpen = sidebar.classList.contains('open');
  }
};

window.loadPage = function(page) {
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (!contentArea) {
    console.error('Content area not found:', APP_CONFIG.contentArea);
    return;
  }

  fetch(page)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load ${page}: ${res.status}`);
      return res.text();
    })
    .then(html => {
      contentArea.innerHTML = html;
      initializeLoadedContent(contentArea);
    })
    .catch(err => console.error("Load error:", err));
};

function initializeLoadedContent(container) {
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => {
    if (script.src) {
      const newScript = document.createElement('script');
      newScript.src = script.src;
      newScript.async = false;
      document.head.appendChild(newScript);
    } else if (script.textContent.trim()) {
      try {
        const executeScript = new Function(script.textContent);
        executeScript();
      } catch (error) {
        console.error('Error executing inline script:', error);
      }
    }
  });
}

// ============================================================================
// TAB MANAGEMENT (UNCHANGED)
// ============================================================================

function switchTab(tabName) {
  if (currentTab === tabName || isLoading) return;
  
  const config = TAB_CONFIG[tabName];
  if (!config) {
    console.error(`Tab "${tabName}" not found in config`);
    return;
  }
  
  if (config.isExternal && EXTERNAL_TABS[tabName]) {
    loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    return;
  }
  
  showTab(tabName);
}

function showTab(tabName) {
  const config = TAB_CONFIG[tabName];
  if (!config) {
    console.error(`Config not found for tab: ${tabName}`);
    return;
  }
  
  hideAllTabs();
  
  const tabContainer = document.querySelector(config.container);
  if (tabContainer) {
    tabContainer.classList.remove('hidden');
    tabContainer.classList.add('active');
    
    currentTab = tabName;
    
    updateActiveTabUI(tabName);
    updateChatAreaVisibility(tabName);
    
    console.log(`Switched to tab: ${tabName}`);
  } else {
    console.error(`Tab container not found: ${config.container} for tab: ${tabName}`);
    if (EXTERNAL_TABS[tabName]) {
      loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    }
  }
}

async function loadExternalTab(tabName, htmlFile) {
  if (isLoading) return;
  isLoading = true;
  
  try {
    showLoadingIndicator(`Loading ${tabName}...`);
    
    const response = await fetch(htmlFile);
    if (!response.ok) throw new Error(`Failed to load ${htmlFile}: ${response.status}`);
    
    const html = await response.text();
    
    let container = document.getElementById('externalTabContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'externalTabContainer';
      container.className = 'tab-panel';
      
      const tabPanels = document.querySelector('.tab-panels') || document.querySelector('#content-area');
      if (tabPanels) {
        tabPanels.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }
    
    hideAllTabs();
    
    container.innerHTML = extractBodyContent(html);
    container.classList.remove('hidden');
    container.classList.add('active');
    
    updateActiveTabUI(tabName);
    updateChatAreaVisibility(tabName);
    
    initializeExternalContent(container);
    
    currentTab = tabName;
    
    console.log(`Loaded external tab: ${tabName} from ${htmlFile}`);
    
  } catch (error) {
    console.error(`Error loading ${tabName}:`, error);
    showError(`Failed to load ${tabName}. Please try again.`);
    
    if (TAB_CONFIG[tabName] && !TAB_CONFIG[tabName].isExternal) {
      showTab(tabName);
    }
  } finally {
    isLoading = false;
    hideLoadingIndicator();
  }
}

function hideAllTabs() {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
    panel.classList.remove('active');
  });
  
  const externalContainer = document.getElementById('externalTabContainer');
  if (externalContainer) {
    externalContainer.classList.add('hidden');
    externalContainer.classList.remove('active');
  }
  
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (contentArea) {
    const nonTabChildren = Array.from(contentArea.children).filter(child => 
      !child.classList.contains('tab-panel') && child.id !== 'externalTabContainer'
    );
    nonTabChildren.forEach(child => {
      child.classList.add('hidden');
    });
  }
}

function updateActiveTabUI(tabName) {
  document.querySelectorAll('.nav-icon[data-tab]').forEach(icon => {
    icon.classList.remove('text-white', 'bg-purple-700', 'active');
    icon.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-gray-800');
  });
  
  const activeIcon = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeIcon) {
    activeIcon.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-gray-800');
    activeIcon.classList.add('text-white', 'bg-purple-700', 'active');
  }
}

function updateChatAreaVisibility(tabName) {
  const chatArea = document.getElementById('chatArea');
  const chatListContainer = document.getElementById('chatListContainer');
  const inputArea = document.getElementById('inputArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (!chatArea || !chatListContainer) return;
  
  const isMobile = window.innerWidth < 768;
  
  if (tabName === 'chats' || tabName === 'groups') {
    const hasActiveChat = chatHeader && !chatHeader.classList.contains('hidden');
    
    if (hasActiveChat) {
      if (isMobile) {
        chatArea.classList.remove('hidden');
        chatListContainer.classList.add('hidden');
      }
      
      if (inputArea) {
        inputArea.classList.remove('hidden');
      }
    } else {
      chatArea.classList.add('hidden');
      chatListContainer.classList.remove('hidden');
      
      if (inputArea) {
        inputArea.classList.add('hidden');
      }
      if (chatHeader) {
        chatHeader.classList.add('hidden');
      }
    }
  } else {
    chatArea.classList.add('hidden');
    chatListContainer.classList.remove('hidden');
    
    if (inputArea) inputArea.classList.add('hidden');
    if (chatHeader) chatHeader.classList.add('hidden');
  }
  
  if (tabName === 'groups') {
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle) chatTitle.textContent = 'Group Chat';
  }
}

// ============================================================================
// UTILITY FUNCTIONS (UNCHANGED)
// ============================================================================

function extractBodyContent(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1];
  }
  
  const mainMatch = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (mainMatch && mainMatch[1]) {
    return mainMatch[1];
  }
  
  return html;
}

function initializeExternalContent(container) {
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => {
    if (script.src) {
      const newScript = document.createElement('script');
      newScript.src = script.src;
      newScript.async = false;
      document.head.appendChild(newScript);
    } else if (script.textContent.trim()) {
      try {
        const executeScript = new Function(script.textContent);
        executeScript();
      } catch (error) {
        console.error('Error executing inline script in external content:', error);
      }
    }
  });
  
  setTimeout(() => {
    attachEventListenersToNewContent(container);
  }, 100);
}

function attachEventListenersToNewContent(container) {
  container.querySelectorAll('[data-modal]').forEach(element => {
    element.addEventListener('click', function(e) {
      e.preventDefault();
      const modalId = this.getAttribute('data-modal');
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  });
  
  container.querySelectorAll('[data-close-modal]').forEach(element => {
    element.addEventListener('click', function(e) {
      e.preventDefault();
      const modalId = this.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });
  
  container.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      if (form.dataset.api) {
        const apiFunction = window[form.dataset.api];
        if (typeof apiFunction === 'function') {
          safeApiCall(apiFunction, new FormData(form))
            .then(result => {
              if (result.offline) {
                console.log('Form data queued for when online');
              }
            })
            .catch(error => {
              console.error('Form submission error:', error);
            });
        }
      } else {
        console.log('Form submitted:', this.id || this.className);
      }
    });
  });
}

function showLoadingIndicator(message = 'Loading...') {
  let loader = document.getElementById('tab-loading');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'tab-loading';
    loader.className = 'tab-loading-indicator';
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    `;
    document.body.appendChild(loader);
  }
  loader.style.display = 'flex';
}

function hideLoadingIndicator() {
  const loader = document.getElementById('tab-loading');
  if (loader) {
    loader.style.display = 'none';
  }
}

function showError(message) {
  document.querySelectorAll('.error-message').forEach(el => el.remove());
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #f87171;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 5000);
}

// ============================================================================
// EVENT HANDLERS (UPDATED)
// ============================================================================

function setupEventListeners() {
  // Tab click handlers
  document.querySelectorAll('.nav-icon[data-tab]').forEach(icon => {
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
    
    const tabName = newIcon.getAttribute('data-tab');
    
    newIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      switchTab(tabName);
    });
  });
  
  // Sidebar toggle
  const sidebarToggle = document.querySelector(APP_CONFIG.sidebarToggle);
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  }
  
  // Mobile back button
  const backToChats = document.getElementById('backToChats');
  if (backToChats) {
    backToChats.addEventListener('click', () => {
      const chatListContainer = document.getElementById('chatListContainer');
      const chatArea = document.getElementById('chatArea');
      if (chatListContainer && chatArea) {
        chatListContainer.classList.remove('hidden');
        chatArea.classList.add('hidden');
        updateChatAreaVisibility(currentTab);
      }
    });
  }
  
  // Mobile chat item clicks - using event delegation
  document.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.chat-item');
    if (chatItem) {
      const chatListContainer = document.getElementById('chatListContainer');
      const chatArea = document.getElementById('chatArea');
      const chatHeader = document.getElementById('chatHeader');
      
      if (chatListContainer && chatArea) {
        chatListContainer.classList.add('hidden');
        chatArea.classList.remove('hidden');
        
        if (chatHeader) {
          chatHeader.classList.remove('hidden');
        }
        
        const chatName = chatItem.querySelector('.chat-name');
        if (chatName) {
          const chatTitle = document.getElementById('chatTitle');
          if (chatTitle) {
            chatTitle.textContent = chatName.textContent;
          }
        }
        
        updateChatAreaVisibility(currentTab);
      }
    }
  });
  
  // Window resize handling
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateChatAreaVisibility(currentTab);
      
      const sidebar = document.querySelector(APP_CONFIG.sidebar);
      if (sidebar) {
        if (window.innerWidth >= 768) {
          sidebar.classList.remove('hidden', 'translate-x-full');
          sidebar.classList.add('translate-x-0');
          isSidebarOpen = true;
        } else {
          sidebar.classList.remove('translate-x-0');
          sidebar.classList.add('translate-x-full');
          isSidebarOpen = false;
        }
      }
    }, 250);
  });
  
  // Handle browser back/forward
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.tab) {
      switchTab(event.state.tab);
    }
  });
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 768 && isSidebarOpen) {
      const sidebar = document.querySelector(APP_CONFIG.sidebar);
      const toggleBtn = document.querySelector(APP_CONFIG.sidebarToggle);
      
      if (sidebar && 
          !sidebar.contains(e.target) && 
          toggleBtn && 
          !toggleBtn.contains(e.target) &&
          !e.target.closest('.nav-icon[data-tab]')) {
        toggleSidebar();
      }
    }
  });
  
  // Handle Escape key to close modals and sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
        if (!modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
        }
      });
      
      if (window.innerWidth < 768 && isSidebarOpen) {
        toggleSidebar();
      }
    }
  });
}

// ============================================================================
// OVERLAY MANAGEMENT (for compatibility)
// ============================================================================

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
};

window.showSettingsSection = function(sectionName) {
  document.querySelectorAll('.settings-section').forEach(section => {
    section.classList.add('hidden');
  });
  
  const sectionElement = document.getElementById(sectionName + 'Settings');
  if (sectionElement) {
    sectionElement.classList.remove('hidden');
  }
};

window.openSettingsModal = function() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.classList.remove('hidden');
    showSettingsSection('account');
  }
};

window.triggerFileInput = function(inputId) {
  const fileInput = document.getElementById(inputId);
  if (fileInput) {
    fileInput.click();
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeApp() {
  console.log('Initializing Kynecta Application Shell...');
  
  if (document.readyState !== 'loading') {
    runInitialization();
  } else {
    document.addEventListener('DOMContentLoaded', runInitialization);
  }
}

function runInitialization() {
  try {
    // STEP 1: Setup global auth access FIRST (before anything else)
    setupGlobalAuthAccess();
    
    // STEP 2: Initialize Firebase ONCE (works offline/online)
    initializeFirebase();
    
    // STEP 3: Expose global state to all pages
    exposeGlobalStateToIframes();
    
    // STEP 4: Setup cross-page communication
    setupCrossPageCommunication();
    
    // STEP 5: Setup event listeners
    setupEventListeners();
    
    // STEP 6: Initialize network detection (separate from auth)
    initializeNetworkDetection();
    
    // Ensure sidebar is properly initialized
    const sidebar = document.querySelector(APP_CONFIG.sidebar);
    if (sidebar) {
      sidebar.classList.remove('hidden');
      
      if (window.innerWidth >= 768) {
        sidebar.classList.remove('translate-x-full');
        sidebar.classList.add('translate-x-0');
        isSidebarOpen = true;
      } else {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('translate-x-full');
        isSidebarOpen = false;
      }
    }
    
    // Ensure content area exists
    let contentArea = document.querySelector(APP_CONFIG.contentArea);
    if (!contentArea) {
      contentArea = document.createElement('main');
      contentArea.id = 'content-area';
      document.body.appendChild(contentArea);
    }
    
    // Load default page
    loadPage(APP_CONFIG.defaultPage);
    
    // Set default tab to groups
    setTimeout(() => {
      try {
        const groupsTab = document.querySelector(TAB_CONFIG.groups.container);
        if (groupsTab) {
          showTab('groups');
        } else {
          console.log('Groups tab not found in DOM, loading as external...');
          loadExternalTab('groups', EXTERNAL_TABS.groups);
        }
      } catch (error) {
        console.error('Error setting default tab:', error);
        if (TAB_CONFIG.chats.container && document.querySelector(TAB_CONFIG.chats.container)) {
          showTab('chats');
        }
      }
    }, 300);
    
    // Hide loading screen if it exists
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
          if (loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
        }, 500);
      }, 500);
    }
    
    // Inject CSS styles
    injectStyles();
    
    console.log('Kynecta Application Shell initialized successfully');
    console.log('Auth state:', currentUser ? `User ${currentUser.uid}` : 'No user');
    console.log('Network:', isOnline ? 'Online' : 'Offline');
    
  } catch (error) {
    console.error('Error during app initialization:', error);
    showError('Application initialization failed. Please refresh the page.');
  }
}

function injectStyles() {
  if (document.getElementById('app-styles')) return;
  
  const styles = `
    .tab-loading-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      font-size: 16px;
      backdrop-filter: blur(4px);
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #8b5cf6;
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 15px;
    }
    
    .loading-text {
      margin-top: 10px;
      font-size: 14px;
      opacity: 0.9;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    #sidebar {
      transition: transform 0.3s ease-in-out;
    }
    
    #content-area {
      flex: 1;
      overflow: auto;
      min-height: 100vh;
    }
    
    .tab-panel {
      display: none;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    .hidden {
      display: none !important;
    }
    
    @media (max-width: 767px) {
      #sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 50;
        transform: translateX(-100%);
      }
      
      #sidebar.open {
        transform: translateX(0);
      }
      
      #sidebar-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 49;
        display: none;
      }
      
      #sidebar.open + #sidebar-overlay {
        display: block;
      }
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'app-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

// ============================================================================
// PUBLIC API
// ============================================================================

// Expose application functions
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.loadPage = loadPage;
window.closeModal = closeModal;
window.openSettingsModal = openSettingsModal;

// AUTH STATE MANAGEMENT
window.APP_AUTH = {
  currentUser: null,
  isAuthenticated: false,
  userId: null,
  isAuthReady: false
};

// NETWORK CONNECTIVITY
window.APP_CONNECTIVITY = {
  isOnline: isOnline,
  isOffline: !isOnline,
  lastChange: null,
  syncQueueSize: 0
};

// API and sync functions
window.safeApiCall = safeApiCall;
window.queueForSync = queueForSync;
window.clearMessageQueue = function() {
  // Clear both stores
  const request = indexedDB.open('KynectaMessageQueue', 2);
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    
    // Clear messages
    const msgTransaction = db.transaction(['messages'], 'readwrite');
    msgTransaction.objectStore('messages').clear();
    
    // Clear actions
    const actTransaction = db.transaction(['actions'], 'readwrite');
    actTransaction.objectStore('actions').clear();
    
    syncQueue = [];
    window.APP_CONNECTIVITY.syncQueueSize = 0;
    
    console.log('Message queue cleared');
  };
};

window.processQueuedMessages = processQueuedMessages;

// AUTH HELPER FUNCTIONS (already set in setupGlobalAuthAccess)

window.showChatArea = function() {
  const chatListContainer = document.getElementById('chatListContainer');
  const chatArea = document.getElementById('chatArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (chatListContainer && chatArea) {
    chatListContainer.classList.add('hidden');
    chatArea.classList.remove('hidden');
    
    if (chatHeader) {
      chatHeader.classList.remove('hidden');
    }
    
    updateChatAreaVisibility(currentTab);
  }
};

window.showChatList = function() {
  const chatListContainer = document.getElementById('chatListContainer');
  const chatArea = document.getElementById('chatArea');
  const chatHeader = document.getElementById('chatHeader');
  
  if (chatListContainer && chatArea) {
    chatListContainer.classList.remove('hidden');
    chatArea.classList.add('hidden');
    
    if (chatHeader) {
      chatHeader.classList.add('hidden');
    }
    
    updateChatAreaVisibility(currentTab);
  }
};

// NETWORK FUNCTIONS
window.isOnline = function() {
  return isOnline;
};

window.isOffline = function() {
  return !isOnline;
};

// ============================================================================
// STARTUP
// ============================================================================

// Initialize app when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  setTimeout(initializeApp, 0);
}

console.log('Kynecta app.js loaded - Application shell ready with enhanced auth and offline support');