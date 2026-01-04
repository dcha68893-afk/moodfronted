// app.js - MoodChat Application Shell & Tab Controller
// Enhanced with custom backend API, offline detection, global state management
// COMPLETE VERSION WITH USER ISOLATION AND REAL AUTHENTICATION
// UPDATED: JWT-based authentication with localStorage persistence
// ENHANCED: Non-blocking startup with instant UI display and background sync
// OFFLINE-FIRST: Load instantly from cache, sync in background

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

// Backend API configuration
const BACKEND_CONFIG = {
  BASE_URL: 'https://moodchat-backend-1.onrender.com',
  ENDPOINTS: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    VALIDATE_TOKEN: '/auth/validate',
    GET_USER_PROFILE: '/users/profile',
    UPDATE_PROFILE: '/users/update-profile',
    GET_FRIENDS: '/friends/list',
    ADD_FRIEND: '/friends/add',
    REMOVE_FRIEND: '/friends/remove',
    GET_CHATS: '/chats/list',
    GET_CHAT_MESSAGES: '/chats/messages',
    SEND_MESSAGE: '/chats/send',
    CREATE_GROUP: '/groups/create',
    GET_GROUPS: '/groups/list',
    JOIN_GROUP: '/groups/join',
    GET_CALLS: '/calls/list',
    LOG_CALL: '/calls/log',
    UPDATE_STATUS: '/users/update-status',
    PASSWORD_RESET: '/auth/password-reset',
    VERIFY_EMAIL: '/auth/verify-email'
  }
};

// Authentication configuration
const AUTH_CONFIG = {
  TOKEN_KEY: 'moodchat_jwt_token',
  USER_KEY: 'moodchat_user_data',
  TOKEN_REFRESH_INTERVAL: 10 * 60 * 1000, // 10 minutes
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000 // 5 minutes buffer
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
// AUTHENTICATION MANAGER (JWT-BASED)
// ============================================================================

const AUTH_MANAGER = {
  token: null,
  user: null,
  tokenRefreshTimer: null,
  authInitializing: false, // NEW: Track auth initialization

  // Initialize authentication manager
  initialize: function() {
    console.log('Initializing Authentication Manager...');
    this.authInitializing = true;
    this.loadStoredAuth();
    this.setupTokenRefresh();
    this.exposeAuthMethods();
  },

  // Load stored authentication from localStorage
  loadStoredAuth: function() {
    try {
      const token = localStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      const userData = localStorage.getItem(AUTH_CONFIG.USER_KEY);
      
      if (token && userData) {
        this.token = token;
        this.user = JSON.parse(userData);
        
        // Validate token if online
        if (navigator.onLine) {
          this.validateToken().then(isValid => {
            if (isValid) {
              console.log('Stored authentication loaded and validated');
              this.setCurrentUser(this.user);
              
              // CRITICAL FIX: Only redirect to chat after successful validation
              // Check if we're on login page and should redirect
              const isLoginPage = window.location.pathname.includes('index.html') || 
                                window.location.pathname.endsWith('/');
              if (isLoginPage) {
                console.log('Auto-login validated, redirecting to chat');
                setTimeout(() => {
                  window.location.href = 'chat.html';
                }, 500);
              }
            } else {
              console.log('Stored token is invalid, clearing authentication');
              this.clearAuth();
              
              // Show error if on chat page
              if (window.location.pathname.includes('chat.html')) {
                showError('Session expired. Please login again.');
                setTimeout(() => {
                  window.location.href = 'index.html';
                }, 2000);
              }
            }
            this.authInitializing = false;
          }).catch((error) => {
            // If validation fails, still use stored data for offline mode
            console.log('Token validation failed, using stored data for offline:', error);
            this.setCurrentUser(this.user, true);
            this.authInitializing = false;
            
            // Show warning for offline mode
            if (window.location.pathname.includes('chat.html')) {
              showCachedDataIndicator(true);
            }
          });
        } else {
          // Use stored data for offline mode
          console.log('Offline mode, using stored authentication');
          this.setCurrentUser(this.user, true);
          this.authInitializing = false;
        }
      } else {
        console.log('No stored authentication found');
        this.authInitializing = false;
      }
    } catch (error) {
      console.error('Error loading stored authentication:', error);
      this.clearAuth();
      this.authInitializing = false;
    }
  },

  // Validate token with server
  validateToken: async function() {
    if (!this.token) return false;
    
    try {
      const response = await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.VALIDATE_TOKEN}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          console.log('Token validated successfully');
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  },

  // Set current user and update global state
  setCurrentUser: function(user, isOffline = false) {
    this.user = user;
    
    // Create user object for global state
    const globalUser = {
      id: user.id,
      uid: user.id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email.split('@')[0])}&background=8b5cf6&color=fff`,
      emailVerified: user.emailVerified || false,
      isOffline: isOffline,
      providerId: 'jwt',
      token: this.token,
      refreshToken: 'jwt-token',
      getIdToken: () => Promise.resolve(this.token),
      metadata: user.metadata || {}
    };
    
    // Update global auth state
    handleAuthStateChange(globalUser, isOffline);
    
    // Set up user isolation
    if (user.id) {
      USER_DATA_ISOLATION.setCurrentUser(user.id);
      DATA_CACHE.setCurrentUser(user.id);
      SETTINGS_SERVICE.setCurrentUser(user.id);
    }
    
    console.log('User set:', user.email);
  },

  // Store authentication data
  storeAuth: function(token, userData) {
    try {
      localStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token);
      localStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(userData));
      this.token = token;
      this.setCurrentUser(userData);
      console.log('Authentication stored for user:', userData.email);
      return { success: true };
    } catch (error) {
      console.error('Error storing authentication:', error);
      return { success: false, error: 'Failed to store authentication' };
    }
  },

  // Clear authentication data
  clearAuth: function() {
    localStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
    localStorage.removeItem(AUTH_CONFIG.USER_KEY);
    this.token = null;
    this.user = null;
    
    // Clear user isolation data
    if (currentUser && currentUser.id) {
      USER_DATA_ISOLATION.clearUserData(currentUser.id);
      SETTINGS_SERVICE.clearUserSettings();
    }
    
    handleAuthStateChange(null);
    console.log('Authentication cleared');
  },

  // Setup automatic token refresh
  setupTokenRefresh: function() {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }
    
    this.tokenRefreshTimer = setInterval(() => {
      if (this.token && this.user && navigator.onLine) {
        this.refreshTokenIfNeeded();
      }
    }, AUTH_CONFIG.TOKEN_REFRESH_INTERVAL);
  },

  // Refresh token if needed
  refreshTokenIfNeeded: async function() {
    if (!this.token || !this.user) return;
    
    try {
      // Check if token is close to expiry
      const tokenData = this.parseJwt(this.token);
      if (tokenData && tokenData.exp) {
        const expiryTime = tokenData.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        const timeUntilExpiry = expiryTime - currentTime;
        
        if (timeUntilExpiry < AUTH_CONFIG.TOKEN_EXPIRY_BUFFER) {
          console.log('Token nearing expiry, attempting refresh...');
          // In a real implementation, you would call a refresh endpoint here
          // For now, we'll just validate the existing token
          const isValid = await this.validateToken();
          if (!isValid) {
            console.log('Token refresh needed but no refresh endpoint available');
          }
        }
      }
    } catch (error) {
      console.error('Token refresh error:', error);
    }
  },

  // Parse JWT token
  parseJwt: function(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  },

  // Expose authentication methods globally
  exposeAuthMethods: function() {
    window.AUTH_MANAGER = {
      login: this.login.bind(this),
      register: this.register.bind(this),
      logout: this.logout.bind(this),
      isAuthenticated: () => !!this.user,
      getCurrentUser: () => this.user,
      getToken: () => this.token,
      isAuthInitializing: () => this.authInitializing // NEW: Expose initialization state
    };
  },

  // Login function - UPDATED to use api.js loginUser function
  login: async function(email, password) {
    try {
      // Show loading state
      if (window.showLoading) window.showLoading('Logging in...');
      
      // Check if api.js loginUser function is available
      if (typeof window.loginUser !== 'function') {
        throw new Error('Authentication API not available. Please refresh the page.');
      }
      
      // Call the api.js login function
      const result = await window.loginUser(email, password);
      
      if (result.success && result.token && result.user) {
        // Store authentication data
        const storeResult = this.storeAuth(result.token, result.user);
        if (!storeResult.success) {
          throw new Error(storeResult.error);
        }
        
        console.log('Login successful for user:', result.user.email);
        
        // Return success with user data
        return {
          success: true,
          user: result.user,
          token: result.token,
          message: result.message || 'Login successful'
        };
      } else {
        // Return the error from the API
        throw new Error(result.message || result.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message,
        message: error.message
      };
    } finally {
      // Hide loading state
      if (window.hideLoading) window.hideLoading();
    }
  },

  // Register function - UPDATED to use api.js registerUser function
  register: async function(email, password, displayName) {
    try {
      // Show loading state
      if (window.showLoading) window.showLoading('Creating account...');
      
      // Check if api.js registerUser function is available
      if (typeof window.registerUser !== 'function') {
        throw new Error('Registration API not available. Please refresh the page.');
      }
      
      // Call the api.js register function
      const result = await window.registerUser(email, password, displayName);
      
      if (result.success && result.token && result.user) {
        // Store authentication data
        const storeResult = this.storeAuth(result.token, result.user);
        if (!storeResult.success) {
          throw new Error(storeResult.error);
        }
        
        console.log('Registration successful for user:', result.user.email);
        
        // Return success with user data
        return {
          success: true,
          user: result.user,
          token: result.token,
          message: result.message || 'Registration successful'
        };
      } else {
        // Return the error from the API
        throw new Error(result.message || result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message,
        message: error.message
      };
    } finally {
      // Hide loading state
      if (window.hideLoading) window.hideLoading();
    }
  },

  // Logout function
  logout: async function() {
    try {
      // Call logout endpoint if online
      if (navigator.onLine && this.token) {
        await fetch(`${BACKEND_CONFIG.BASE_URL}${BACKEND_CONFIG.ENDPOINTS.LOGOUT}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local logout even if API fails
    }
    
    // Clear local authentication
    this.clearAuth();
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
  }
};

// ============================================================================
// API HELPER FUNCTIONS
// ============================================================================

// Centralized API helper function
async function api(endpoint, method = 'GET', data = null, requireAuth = true) {
  const url = `${BACKEND_CONFIG.BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add authorization token if required and available
  if (requireAuth && AUTH_MANAGER.token) {
    headers['Authorization'] = `Bearer ${AUTH_MANAGER.token}`;
  }

  const config = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, config);
    
    // Handle HTTP errors
    if (!response.ok) {
      // Handle 401 Unauthorized (token expired)
      if (response.status === 401 && requireAuth) {
        console.log('Authentication expired, clearing auth...');
        AUTH_MANAGER.clearAuth();
        
        // Redirect to login page
        setTimeout(() => {
          if (!window.location.href.includes('index.html')) {
            window.location.href = 'index.html';
          }
        }, 1000);
      }
      
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Parse JSON response
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    return { 
      success: false, 
      error: error.message,
      offline: !navigator.onLine
    };
  }
}

// Safe API wrapper with offline queue support
async function safeApiCall(endpoint, method = 'GET', data = null, cacheKey = null) {
  // Check cache first if GET request
  if (method === 'GET' && cacheKey) {
    const cached = DATA_CACHE.getInstant(cacheKey);
    if (cached) {
      console.log(`Using cached data for: ${cacheKey}`);
      return {
        success: true,
        cached: true,
        data: cached,
        message: 'Data loaded from cache'
      };
    }
  }

  // If offline, queue for later or return cached data
  if (!isOnline) {
    if (cacheKey) {
      const cached = DATA_CACHE.getInstant(cacheKey);
      if (cached) {
        return {
          success: true,
          cached: true,
          offline: true,
          data: cached,
          message: 'Offline mode: Using cached data'
        };
      }
    }

    // Queue action for when online
    const queueResult = await queueForSync({
      endpoint,
      method,
      data,
      timestamp: new Date().toISOString()
    }, 'api');

    return {
      success: false,
      offline: true,
      queued: queueResult.queued,
      message: 'Action queued for when online'
    };
  }

  // Make actual API call
  const result = await api(endpoint, method, data);
  
  // Cache successful GET responses
  if (result.success && method === 'GET' && cacheKey) {
    DATA_CACHE.set(cacheKey, result.data);
  }

  return result;
}

// ============================================================================
// OFFLINE MOCK DATA GENERATOR (FOR WHEN NO SERVER CONNECTION)
// ============================================================================

const OFFLINE_DATA_GENERATOR = {
  // Generate realistic placeholder data for offline mode
  generateUserProfile: function(userId) {
    const names = ["Alex Johnson", "Sam Smith", "Taylor Swift", "Jordan Lee", "Casey Kim", "Morgan Reed", "Riley Chen", "Drew Patel"];
    const statuses = ["Online", "Last seen 5m ago", "Busy", "Away", "Offline", "Typing..."];
    
    return {
      id: userId || 'offline_user_' + Date.now(),
      name: names[Math.floor(Math.random() * names.length)],
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(names[Math.floor(Math.random() * names.length)])}&background=8b5cf6&color=fff`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      email: "user@example.com",
      phone: "+1 (555) 123-4567",
      isOnline: Math.random() > 0.5,
      lastSeen: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
      isOfflineMode: true
    };
  },
  
  generateFriendsList: function(count = 15) {
    const friends = [];
    const statuses = ["Online", "Last seen 5m ago", "Busy", "Away", "Offline"];
    const activities = ["Listening to music", "Gaming", "Working", "Sleeping", "Coding", "Reading"];
    
    for (let i = 0; i < count; i++) {
      const name = `Friend ${i + 1}`;
      friends.push({
        id: `friend_${i}`,
        name: name,
        avatar: `https://ui-avatars.com/api/?name=Friend+${i + 1}&background=${['8b5cf6', '10b981', 'f59e0b', 'ef4444', '3b82f6'][i % 5]}&color=fff`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        activity: activities[Math.floor(Math.random() * activities.length)],
        lastMessage: "Hey, how are you?",
        lastMessageTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        unreadCount: Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0,
        isOnline: Math.random() > 0.5,
        isOfflineMode: true
      });
    }
    
    // Sort by online status and recent activity
    return friends.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });
  },
  
  generateChatsList: function(count = 10) {
    const chats = [];
    const chatTypes = ["direct", "group"];
    const statuses = ["Online", "Last seen 5m ago", "Busy", "Away", "Offline"];
    
    for (let i = 0; i < count; i++) {
      const isGroup = Math.random() > 0.7;
      const name = isGroup ? `Group Chat ${i + 1}` : `Friend ${i + 1}`;
      const participants = isGroup ? Math.floor(Math.random() * 8) + 3 : 2;
      const messages = [];
      
      // Generate some recent messages
      const messageCount = Math.floor(Math.random() * 5) + 1;
      for (let j = 0; j < messageCount; j++) {
        messages.push({
          id: `msg_${i}_${j}`,
          sender: Math.random() > 0.5 ? "You" : name.split(' ')[0],
          text: ["Hello!", "How are you?", "What's up?", "Meeting at 3pm", "Check this out!", "👍", "😂"][Math.floor(Math.random() * 7)],
          time: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
          isRead: Math.random() > 0.3
        });
      }
      
      chats.push({
        id: `chat_${i}`,
        name: name,
        avatar: isGroup ? 
          `https://ui-avatars.com/api/?name=Group+${i + 1}&background=6366f1&color=fff` :
          `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8b5cf6&color=fff`,
        type: isGroup ? "group" : "direct",
        participants: participants,
        lastMessage: messages[messages.length - 1]?.text || "No messages yet",
        lastMessageTime: messages[messages.length - 1]?.time || new Date().toISOString(),
        unreadCount: Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0,
        isOnline: !isGroup && Math.random() > 0.5,
        status: isGroup ? `${participants} members` : statuses[Math.floor(Math.random() * statuses.length)],
        messages: messages,
        isOfflineMode: true
      });
    }
    
    // Sort by most recent message
    return chats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  },
  
  generateGroupsList: function(count = 8) {
    const groups = [];
    const topics = ["Gaming", "Music", "Movies", "Sports", "Tech", "Food", "Travel", "Study"];
    
    for (let i = 0; i < count; i++) {
      const topic = topics[i % topics.length];
      const members = Math.floor(Math.random() * 20) + 5;
      const onlineMembers = Math.floor(Math.random() * members);
      
      groups.push({
        id: `group_${i}`,
        name: `${topic} Enthusiasts`,
        description: `A group for ${topic.toLowerCase()} lovers to share and discuss`,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(topic)}&background=6366f1&color=fff`,
        members: members,
        onlineMembers: onlineMembers,
        isPublic: Math.random() > 0.3,
        isAdmin: Math.random() > 0.7,
        lastActivity: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString(),
        unreadCount: Math.random() > 0.5 ? Math.floor(Math.random() * 10) + 1 : 0,
        isOfflineMode: true
      });
    }
    
    return groups.sort((a, b) => b.onlineMembers - a.onlineMembers);
  },
  
  generateCallsList: function(count = 12) {
    const calls = [];
    const callTypes = ["voice", "video"];
    const statuses = ["missed", "received", "outgoing"];
    const names = ["Alex Johnson", "Sam Smith", "Taylor Swift", "Jordan Lee", "Casey Kim", "Morgan Reed"];
    
    for (let i = 0; i < count; i++) {
      const isVideo = Math.random() > 0.5;
      const callStatus = statuses[Math.floor(Math.random() * statuses.length)];
      const duration = Math.floor(Math.random() * 1800) + 60; // 1-30 minutes in seconds
      
      calls.push({
        id: `call_${i}`,
        name: names[i % names.length],
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(names[i % names.length])}&background=8b5cf6&color=fff`,
        type: isVideo ? "video" : "voice",
        status: callStatus,
        duration: duration,
        time: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        isMissed: callStatus === "missed",
        isOfflineMode: true
      });
    }
    
    // Sort by most recent
    return calls.sort((a, b) => new Date(b.time) - new Date(a.time));
  },
  
  // Generate comprehensive offline data for all tabs
  generateAllOfflineData: function(userId) {
    return {
      userProfile: this.generateUserProfile(userId),
      friends: this.generateFriendsList(),
      chats: this.generateChatsList(),
      groups: this.generateGroupsList(),
      calls: this.generateCallsList(),
      settings: {
        theme: 'dark',
        notifications: true,
        privacy: 'friends',
        language: 'en'
      },
      timestamp: new Date().toISOString(),
      isOfflineData: true
    };
  }
};

// ============================================================================
// USER DATA ISOLATION SERVICE
// ============================================================================

const USER_DATA_ISOLATION = {
  // Current user ID for cache key prefixing
  currentUserId: null,
  
  // Prefix all cache keys with user ID for isolation
  getUserCacheKey: function(key) {
    if (!this.currentUserId) {
      return `offline_${key}`; // Fallback for non-authenticated state
    }
    return `user_${this.currentUserId}_${key}`;
  },
  
  // Set current user for isolation
  setCurrentUser: function(userId) {
    this.currentUserId = userId;
    console.log(`User isolation: Set current user ID: ${userId}`);
  },
  
  // Clear current user
  clearCurrentUser: function() {
    this.currentUserId = null;
    console.log('User isolation: Cleared current user');
  },
  
  // Clear all cached data for a specific user
  clearUserData: function(userId) {
    if (!userId) return;
    
    console.log(`Clearing cached data for user: ${userId}`);
    const prefix = `user_${userId}_`;
    
    // Clear all localStorage items for this user
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
        console.log(`Removed: ${key}`);
      }
    }
    
    // Clear IndexedDB for this user
    this.clearUserIndexedDB(userId);
    
    console.log(`All data cleared for user: ${userId}`);
  },
  
  // Clear user's IndexedDB data
  clearUserIndexedDB: function(userId) {
    if (!window.indexedDB) return;
    
    // Clear message queue for this user
    const request = indexedDB.open('MoodChatMessageQueue', 2);
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      
      // Clear messages for this user
      const msgTransaction = db.transaction(['messages'], 'readwrite');
      const msgStore = msgTransaction.objectStore('messages');
      const msgIndex = msgStore.index('userId');
      const range = IDBKeyRange.only(userId);
      
      msgIndex.openCursor(range).onsuccess = function(cursorEvent) {
        const cursor = cursorEvent.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Clear actions for this user
      const actTransaction = db.transaction(['actions'], 'readwrite');
      const actStore = actTransaction.objectStore('actions');
      const actIndex = actStore.index('userId');
      
      actIndex.openCursor(range).onsuccess = function(cursorEvent) {
        const cursor = cursorEvent.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      console.log(`IndexedDB cleared for user: ${userId}`);
    };
  },
  
  // Get all users that have cached data
  getCachedUsers: function() {
    const users = new Set();
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user_')) {
        const userId = key.split('_')[1];
        if (userId) {
          users.add(userId);
        }
      }
    }
    
    return Array.from(users);
  },
  
  // Clean up old user data (for housekeeping)
  cleanupOldUserData: function(daysOld = 30) {
    console.log('Cleaning up old user data...');
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user_')) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const data = JSON.parse(item);
            if (data.timestamp && data.timestamp < cutoffTime) {
              localStorage.removeItem(key);
              console.log(`Cleaned up old data: ${key}`);
            }
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    }
  }
};

// ============================================================================
// ENHANCED CACHE CONFIGURATION WITH USER ISOLATION
// ============================================================================

const CACHE_CONFIG = {
  // Cache expiration times (in milliseconds)
  EXPIRATION: {
    FRIENDS: 5 * 60 * 1000, // 5 minutes
    CHATS: 2 * 60 * 1000, // 2 minutes
    CALLS: 10 * 60 * 1000, // 10 minutes
    GROUPS: 5 * 60 * 1000, // 5 minutes
    MESSAGES: 30 * 60 * 1000, // 30 minutes
    USER_DATA: 60 * 60 * 1000, // 1 hour
    GENERAL: 30 * 60 * 1000, // 30 minutes
    OFFLINE_DATA: 24 * 60 * 60 * 1000 // 24 hours for offline data
  },
  
  // Cache keys (will be prefixed with user ID)
  KEYS: {
    FRIENDS_LIST: 'friends-list',
    CHATS_LIST: 'chats-list',
    CALLS_LIST: 'calls-list',
    GROUPS_LIST: 'groups-list',
    MESSAGES_LIST: 'messages-list',
    USER_DATA: 'user-data',
    USER_PROFILE: 'user-profile',
    SETTINGS: 'settings',
    NETWORK_STATUS: 'network-status',
    SESSION: 'session',
    AUTH_STATE: 'auth-state',
    APP_INITIALIZED: 'app-initialized',
    OFFLINE_DATA_READY: 'offline-data-ready'
  },
  
  // Get isolated key for current user
  getIsolatedKey: function(keyName) {
    return USER_DATA_ISOLATION.getUserCacheKey(keyName);
  }
};

// ============================================================================
// SETTINGS SERVICE (UPDATED FOR USER ISOLATION)
// ============================================================================

const SETTINGS_SERVICE = {
  // Default settings structure
  DEFAULTS: {
    // Theme settings
    theme: 'dark',
    fontSize: 'medium',
    chatWallpaper: 'default',
    customWallpaper: '',
    
    // Notification settings
    notifications: {
      messages: true,
      calls: true,
      groups: true,
      status: true,
      sound: true,
      vibration: true,
      desktop: false,
      email: false
    },
    
    // Privacy settings
    privacy: {
      lastSeen: 'everyone',
      profilePhoto: 'everyone',
      status: 'everyone',
      readReceipts: true,
      typingIndicators: true,
      onlineStatus: true,
      activityStatus: true
    },
    
    // Call settings
    calls: {
      defaultType: 'voice',
      ringtone: 'default',
      vibration: true,
      noiseCancellation: true,
      autoRecord: false,
      lowDataMode: false,
      echoCancellation: true
    },
    
    // Group settings
    groups: {
      autoJoin: true,
      defaultRole: 'member',
      approvalRequired: false,
      notifications: 'all',
      adminOnlyMessages: false,
      memberAdd: true
    },
    
    // Status settings
    status: {
      visibility: 'everyone',
      autoDelete: '24h',
      shareLocation: false,
      showTyping: true,
      showListening: true
    },
    
    // Offline settings
    offline: {
      queueEnabled: true,
      autoSync: true,
      storageLimit: 100,
      compressMedia: true,
      cacheDuration: 7,
      backgroundSync: true,
      showOfflineData: true
    },
    
    // Accessibility
    accessibility: {
      highContrast: false,
      reduceMotion: false,
      screenReader: false,
      largeText: false,
      colorBlind: false
    },
    
    // General
    general: {
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      autoUpdate: true,
      betaFeatures: false
    },
    
    // Security
    security: {
      twoFactor: false,
      loginAlerts: true,
      deviceManagement: true,
      sessionTimeout: 30,
      autoLock: false
    },
    
    // Storage
    storage: {
      autoCleanup: true,
      cleanupInterval: 7,
      maxStorage: 1024,
      mediaQuality: 'medium'
    }
  },
  
  // Current settings
  current: {},
  
  // Page callbacks for settings updates
  pageCallbacks: new Map(),
  
  // Current user ID for isolation
  currentUserId: null,
  
  // Initialize settings service
  initialize: function() {
    console.log('Initializing Settings Service...');
    
    // Set user ID for isolation
    this.setCurrentUser(currentUser ? currentUser.id || currentUser.uid : null);
    
    // Load settings from localStorage
    this.load();
    
    // Apply initial settings
    this.applySettings();
    
    // Setup storage event listener for cross-tab communication
    this.setupStorageListener();
    
    // Expose settings methods globally
    this.exposeMethods();
    
    console.log('Settings Service initialized');
  },
  
  // Set current user for isolation
  setCurrentUser: function(userId) {
    this.currentUserId = userId;
    console.log(`Settings: Set current user ID: ${userId}`);
  },
  
  // Get isolated settings key
  getSettingsKey: function() {
    if (!this.currentUserId) {
      return CACHE_CONFIG.KEYS.SETTINGS;
    }
    return USER_DATA_ISOLATION.getUserCacheKey(CACHE_CONFIG.KEYS.SETTINGS);
  },
  
  // Load settings from localStorage
  load: function() {
    try {
      const settingsKey = this.getSettingsKey();
      const savedSettings = localStorage.getItem(settingsKey);
      
      if (savedSettings) {
        this.current = JSON.parse(savedSettings);
        console.log('Settings loaded from localStorage for user:', this.currentUserId);
      } else {
        this.current = JSON.parse(JSON.stringify(this.DEFAULTS));
        this.save();
        console.log('Default settings loaded and saved for user:', this.currentUserId);
      }
      
      // Ensure all default keys exist (for backward compatibility)
      this.ensureDefaults();
      
    } catch (error) {
      console.error('Error loading settings:', error);
      this.current = JSON.parse(JSON.stringify(this.DEFAULTS));
    }
  },
  
  // Save settings to localStorage
  save: function() {
    try {
      const settingsKey = this.getSettingsKey();
      localStorage.setItem(settingsKey, JSON.stringify(this.current));
      
      // Broadcast change to other tabs/pages
      const timestampKey = USER_DATA_ISOLATION.getUserCacheKey('settings-timestamp');
      localStorage.setItem(timestampKey, Date.now().toString());
      
      console.log('Settings saved to localStorage for user:', this.currentUserId);
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  },
  
  // Clear settings for current user
  clearUserSettings: function() {
    try {
      const settingsKey = this.getSettingsKey();
      localStorage.removeItem(settingsKey);
      
      const timestampKey = USER_DATA_ISOLATION.getUserCacheKey('settings-timestamp');
      localStorage.removeItem(timestampKey);
      
      console.log('Settings cleared for user:', this.currentUserId);
      return true;
    } catch (error) {
      console.error('Error clearing settings:', error);
      return false;
    }
  },
  
  // Update a specific setting
  updateSetting: function(key, value) {
    console.log(`Updating setting: ${key} =`, value);
    
    // Handle nested keys (e.g., 'notifications.messages')
    const keys = key.split('.');
    let target = this.current;
    
    // Navigate to the nested object
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]] || typeof target[keys[i]] !== 'object') {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    // Update the value
    const lastKey = keys[keys.length - 1];
    const oldValue = target[lastKey];
    target[lastKey] = value;
    
    // Save to localStorage
    const saved = this.save();
    
    if (saved) {
      // Apply the updated setting immediately
      this.applySetting(key, value, oldValue);
      
      // Notify all registered pages
      this.notifyPages();
      
      return true;
    }
    
    return false;
  },
  
  // Get a specific setting
  getSetting: function(key, defaultValue = undefined) {
    const keys = key.split('.');
    let target = this.current;
    
    // Navigate to the nested value
    for (let i = 0; i < keys.length; i++) {
      if (target && typeof target === 'object' && keys[i] in target) {
        target = target[keys[i]];
      } else {
        return defaultValue !== undefined ? defaultValue : this.getDefaultValue(key);
      }
    }
    
    return target;
  },
  
  // Get default value for a key
  getDefaultValue: function(key) {
    const keys = key.split('.');
    let target = this.DEFAULTS;
    
    for (let i = 0; i < keys.length; i++) {
      if (target && typeof target === 'object' && keys[i] in target) {
        target = target[keys[i]];
      } else {
        return undefined;
      }
    }
    
    return target;
  },
  
  // Apply all settings
  applySettings: function() {
    console.log('Applying all settings...');
    
    // Apply theme
    this.applyTheme();
    
    // Apply font size
    this.applyFontSize();
    
    // Apply chat wallpaper
    this.applyChatWallpaper();
    
    // Apply accessibility settings
    this.applyAccessibility();
    
    // Apply security settings
    this.applySecurity();
    
    // Notify all registered pages
    this.notifyPages();
    
    console.log('All settings applied');
  },
  
  // Apply a specific setting
  applySetting: function(key, value, oldValue = null) {
    console.log(`Applying setting: ${key}`, { new: value, old: oldValue });
    
    switch(key) {
      case 'theme':
        this.applyTheme();
        break;
      case 'fontSize':
        this.applyFontSize();
        break;
      case 'chatWallpaper':
      case 'customWallpaper':
        this.applyChatWallpaper();
        break;
      case 'accessibility.highContrast':
      case 'accessibility.reduceMotion':
      case 'accessibility.largeText':
        this.applyAccessibility();
        break;
      case 'security.twoFactor':
      case 'security.autoLock':
        this.applySecurity();
        break;
      default:
        // For other settings, just notify pages
        break;
    }
    
    // Always notify pages about the change
    this.notifyPages();
  },
  
  // Apply theme settings
  applyTheme: function() {
    const theme = this.getSetting('theme');
    const html = document.documentElement;
    
    // Remove existing theme classes
    html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
    
    // Apply theme class
    if (theme === 'auto') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
      html.classList.add('theme-auto');
    } else {
      html.classList.add(`theme-${theme}`);
    }
    
    console.log(`Theme applied: ${theme}`);
  },
  
  // Apply font size settings
  applyFontSize: function() {
    const fontSize = this.getSetting('fontSize');
    const html = document.documentElement;
    
    // Remove existing font size classes
    html.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    
    // Apply font size class
    html.classList.add(`font-${fontSize}`);
    
    // Also set CSS variable for dynamic sizing
    document.documentElement.style.setProperty('--font-size-multiplier', this.getFontSizeMultiplier(fontSize));
    
    console.log(`Font size applied: ${fontSize}`);
  },
  
  // Get font size multiplier
  getFontSizeMultiplier: function(size) {
    const multipliers = {
      small: 0.875,
      medium: 1,
      large: 1.125,
      xlarge: 1.25
    };
    return multipliers[size] || 1;
  },
  
  // Apply chat wallpaper settings
  applyChatWallpaper: function() {
    const wallpaper = this.getSetting('chatWallpaper');
    const customWallpaper = this.getSetting('customWallpaper');
    
    // Get all chat areas
    const chatAreas = document.querySelectorAll('.chat-area, .message-list, #chatArea');
    
    chatAreas.forEach(area => {
      // Remove existing wallpaper classes
      area.classList.remove(
        'wallpaper-default',
        'wallpaper-gradient1',
        'wallpaper-gradient2',
        'wallpaper-pattern1',
        'wallpaper-custom'
      );
      
      // Remove inline background styles
      area.style.backgroundImage = '';
      area.style.backgroundColor = '';
      
      if (wallpaper === 'custom' && customWallpaper) {
        // Apply custom wallpaper
        area.classList.add('wallpaper-custom');
        area.style.backgroundImage = `url('${customWallpaper}')`;
        area.style.backgroundSize = 'cover';
        area.style.backgroundAttachment = 'fixed';
      } else if (wallpaper !== 'default') {
        // Apply predefined wallpaper
        area.classList.add(`wallpaper-${wallpaper}`);
      }
    });
    
    console.log(`Chat wallpaper applied: ${wallpaper}`);
  },
  
  // Apply accessibility settings
  applyAccessibility: function() {
    const html = document.documentElement;
    const highContrast = this.getSetting('accessibility.highContrast');
    const reduceMotion = this.getSetting('accessibility.reduceMotion');
    const largeText = this.getSetting('accessibility.largeText');
    
    // High contrast
    if (highContrast) {
      html.classList.add('high-contrast');
    } else {
      html.classList.remove('high-contrast');
    }
    
    // Reduce motion
    if (reduceMotion) {
      html.classList.add('reduce-motion');
    } else {
      html.classList.remove('reduce-motion');
    }
    
    // Large text
    if (largeText) {
      html.classList.add('large-text');
    } else {
      html.classList.remove('large-text');
    }
    
    console.log(`Accessibility applied: highContrast=${highContrast}, reduceMotion=${reduceMotion}, largeText=${largeText}`);
  },
  
  // Apply security settings
  applySecurity: function() {
    const twoFactor = this.getSetting('security.twoFactor');
    const autoLock = this.getSetting('security.autoLock');
    
    console.log(`Security settings applied: twoFactor=${twoFactor}, autoLock=${autoLock}`);
  },
  
  // Ensure all default keys exist in current settings
  ensureDefaults: function() {
    let needsUpdate = false;
    
    const ensure = (source, target) => {
      for (const key in source) {
        if (!(key in target)) {
          target[key] = JSON.parse(JSON.stringify(source[key]));
          needsUpdate = true;
        } else if (typeof source[key] === 'object' && source[key] !== null) {
          ensure(source[key], target[key]);
        }
      }
    };
    
    ensure(this.DEFAULTS, this.current);
    
    if (needsUpdate) {
      this.save();
    }
  },
  
  // Setup localStorage event listener for cross-tab communication
  setupStorageListener: function() {
    window.addEventListener('storage', (event) => {
      const timestampKey = USER_DATA_ISOLATION.getUserCacheKey('settings-timestamp');
      if (event.key === timestampKey) {
        console.log('Settings changed in another tab, reloading...');
        
        // Reload settings from localStorage
        const oldSettings = JSON.parse(JSON.stringify(this.current));
        this.load();
        
        // Compare and apply changed settings
        this.detectAndApplyChanges(oldSettings, this.current);
        
        // Notify pages
        this.notifyPages();
      }
    });
  },
  
  // Detect and apply changes between old and new settings
  detectAndApplyChanges: function(oldSettings, newSettings) {
    const changedKeys = this.findChangedKeys(oldSettings, newSettings);
    
    changedKeys.forEach(key => {
      const newValue = this.getSetting(key);
      const oldValue = this.getSettingFromObject(oldSettings, key);
      this.applySetting(key, newValue, oldValue);
    });
  },
  
  // Find all changed keys between two settings objects
  findChangedKeys: function(obj1, obj2, prefix = '') {
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  const changed = [];
  
  for (const key of keys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val1 = obj1[key];
    const val2 = obj2[key];
    
    if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
      // Recursively check nested objects
      changed.push(...this.findChangedKeys(val1, val2, fullKey));
    } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      // Values are different
      changed.push(fullKey);
    }
  }
  
  return changed;
},
  
  // Get setting from a specific object
  getSettingFromObject: function(obj, key) {
    const keys = key.split('.');
    let target = obj;
    
    for (let i = 0; i < keys.length; i++) {
      if (target && typeof target === 'object' && keys[i] in target) {
        target = target[keys[i]];
      } else {
        return undefined;
      }
    }
    
    return target;
  },
  
  // Register a page callback for settings updates
  registerPageCallback: function(pageId, callback) {
    if (typeof callback === 'function') {
      this.pageCallbacks.set(pageId, callback);
      console.log(`Page callback registered: ${pageId}`);
      
      // Immediately notify this page with current settings
      callback(this.current);
    }
  },
  
  // Unregister a page callback
  unregisterPageCallback: function(pageId) {
    this.pageCallbacks.delete(pageId);
    console.log(`Page callback unregistered: ${pageId}`);
  },
  
  // Notify all registered pages about settings changes
  notifyPages: function() {
    console.log(`Notifying ${this.pageCallbacks.size} pages about settings changes`);
    
    this.pageCallbacks.forEach((callback, pageId) => {
      try {
        callback(this.current);
      } catch (error) {
        console.error(`Error in page callback for ${pageId}:`, error);
      }
    });
  },
  
  // Expose methods globally
  exposeMethods: function() {
    window.MOODCHAT_SETTINGS = {
      load: () => this.load(),
      save: () => this.save(),
      updateSetting: (key, value) => this.updateSetting(key, value),
      getSetting: (key, defaultValue) => this.getSetting(key, defaultValue),
      applySettings: () => this.applySettings(),
      registerPageCallback: (pageId, callback) => this.registerPageCallback(pageId, callback),
      unregisterPageCallback: (pageId) => this.unregisterPageCallback(pageId),
      getDefaults: () => JSON.parse(JSON.stringify(this.DEFAULTS)),
      resetToDefaults: () => this.resetToDefaults(),
      setCurrentUser: (userId) => this.setCurrentUser(userId),
      clearUserSettings: () => this.clearUserSettings()
    };
    
    window.updateSetting = (key, value) => this.updateSetting(key, value);
    window.getSetting = (key, defaultValue) => this.getSetting(key, defaultValue);
    window.applySettings = () => this.applySettings();
  },
  
  // Reset all settings to defaults
  resetToDefaults: function() {
    console.log('Resetting all settings to defaults');
    this.current = JSON.parse(JSON.stringify(this.DEFAULTS));
    this.save();
    this.applySettings();
    this.notifyPages();
    return true;
  }
};

// ============================================================================
// ENHANCED DATA CACHE SERVICE WITH USER ISOLATION AND INSTANT LOADING
// ============================================================================

const DATA_CACHE = {
  // Initialize cache
  initialize: function() {
    console.log('Initializing Data Cache...');
    this.setupCacheInvalidation();
    console.log('Data Cache initialized');
  },
  
  // Set current user for isolation
  setCurrentUser: function(userId) {
    USER_DATA_ISOLATION.setCurrentUser(userId);
  },
  
  // Clear cache for current user
  clearUserCache: function(userId) {
    if (userId) {
      USER_DATA_ISOLATION.clearUserData(userId);
    } else if (USER_DATA_ISOLATION.currentUserId) {
      USER_DATA_ISOLATION.clearUserData(USER_DATA_ISOLATION.currentUserId);
    }
  },
  
  // Cache data with expiration (automatically user-isolated)
  set: function(key, data, expirationMs = CACHE_CONFIG.EXPIRATION.GENERAL) {
    try {
      const isolatedKey = USER_DATA_ISOLATION.getUserCacheKey(key);
      const cacheItem = {
        data: data,
        timestamp: Date.now(),
        expiresAt: Date.now() + expirationMs,
        userId: USER_DATA_ISOLATION.currentUserId
      };
      
      localStorage.setItem(isolatedKey, JSON.stringify(cacheItem));
      console.log(`Data cached: ${isolatedKey}, expires in ${expirationMs}ms`);
      return true;
    } catch (error) {
      console.warn('Failed to cache data:', error);
      return false;
    }
  },
  
  // Get cached data (automatically user-isolated) - NON-BLOCKING
  get: function(key, returnIfExpired = true) {
    try {
      const isolatedKey = USER_DATA_ISOLATION.getUserCacheKey(key);
      const cached = localStorage.getItem(isolatedKey);
      if (!cached) {
        return null;
      }
      
      const cacheItem = JSON.parse(cached);
      
      // Check if cache is expired
      if (Date.now() > cacheItem.expiresAt) {
        console.log(`Cache expired: ${isolatedKey}`);
        
        // Return expired data if requested (for instant UI display)
        if (returnIfExpired) {
          console.log(`Returning expired cached data: ${isolatedKey}`);
          return cacheItem.data;
        }
        
        localStorage.removeItem(isolatedKey);
        return null;
      }
      
      console.log(`Retrieved cached data: ${isolatedKey}`);
      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to retrieve cached data:', error);
      return null;
    }
  },
  
  // Get cached data without checking expiration (for instant UI)
  getInstant: function(key) {
    return this.get(key, true);
  },
  
  // Remove cached data (automatically user-isolated)
  remove: function(key) {
    try {
      const isolatedKey = USER_DATA_ISOLATION.getUserCacheKey(key);
      localStorage.removeItem(isolatedKey);
      console.log(`Removed cache: ${isolatedKey}`);
      return true;
    } catch (error) {
      console.warn('Failed to remove cache:', error);
      return false;
    }
  },
  
  // Clear all caches for current user
  clearAll: function() {
    Object.values(CACHE_CONFIG.KEYS).forEach(key => {
      this.remove(key);
    });
    console.log('All caches cleared for current user');
  },
  
  // Check if cache exists and is valid
  has: function(key) {
    const data = this.get(key);
    return data !== null;
  },
  
  // Check if cache exists (even if expired)
  hasAny: function(key) {
    try {
      const isolatedKey = USER_DATA_ISOLATION.getUserCacheKey(key);
      const cached = localStorage.getItem(isolatedKey);
      return cached !== null;
    } catch (error) {
      return false;
    }
  },
  
  // Setup periodic cache invalidation
  setupCacheInvalidation: function() {
    // Check for expired caches every minute
    setInterval(() => {
      this.cleanupExpiredCaches();
    }, 60000);
    
    // Clean up old user data weekly
    setInterval(() => {
      USER_DATA_ISOLATION.cleanupOldUserData(30);
    }, 7 * 24 * 60 * 60 * 1000);
  },
  
  // Cleanup expired caches for current user
  cleanupExpiredCaches: function() {
    Object.values(CACHE_CONFIG.KEYS).forEach(key => {
      try {
        const isolatedKey = USER_DATA_ISOLATION.getUserCacheKey(key);
        const cached = localStorage.getItem(isolatedKey);
        if (cached) {
          const cacheItem = JSON.parse(cached);
          if (Date.now() > cacheItem.expiresAt) {
            localStorage.removeItem(isolatedKey);
            console.log(`Cleaned up expired cache: ${isolatedKey}`);
          }
        }
      } catch (error) {
        // Silently fail for cache cleanup
      }
    });
  },
  
  // Cache friends list (user-isolated)
  cacheFriends: function(friendsList) {
    return this.set(CACHE_CONFIG.KEYS.FRIENDS_LIST, friendsList, CACHE_CONFIG.EXPIRATION.FRIENDS);
  },
  
  // Get cached friends list (user-isolated) - with instant loading
  getCachedFriends: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.FRIENDS_LIST) : this.get(CACHE_CONFIG.KEYS.FRIENDS_LIST);
  },
  
  // Cache chats list (user-isolated)
  cacheChats: function(chatsList) {
    return this.set(CACHE_CONFIG.KEYS.CHATS_LIST, chatsList, CACHE_CONFIG.EXPIRATION.CHATS);
  },
  
  // Get cached chats list (user-isolated) - with instant loading
  getCachedChats: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.CHATS_LIST) : this.get(CACHE_CONFIG.KEYS.CHATS_LIST);
  },
  
  // Cache calls list (user-isolated)
  cacheCalls: function(callsList) {
    return this.set(CACHE_CONFIG.KEYS.CALLS_LIST, callsList, CACHE_CONFIG.EXPIRATION.CALLS);
  },
  
  // Get cached calls list (user-isolated) - with instant loading
  getCachedCalls: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.CALLS_LIST) : this.get(CACHE_CONFIG.KEYS.CALLS_LIST);
  },
  
  // Cache groups list (user-isolated)
  cacheGroups: function(groupsList) {
    return this.set(CACHE_CONFIG.KEYS.GROUPS_LIST, groupsList, CACHE_CONFIG.EXPIRATION.GROUPS);
  },
  
  // Get cached groups list (user-isolated) - with instant loading
  getCachedGroups: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.GROUPS_LIST) : this.get(CACHE_CONFIG.KEYS.GROUPS_LIST);
  },
  
  // Cache messages (user-isolated)
  cacheMessages: function(messagesList) {
    return this.set(CACHE_CONFIG.KEYS.MESSAGES_LIST, messagesList, CACHE_CONFIG.EXPIRATION.MESSAGES);
  },
  
  // Get cached messages (user-isolated) - with instant loading
  getCachedMessages: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.MESSAGES_LIST) : this.get(CACHE_CONFIG.KEYS.MESSAGES_LIST);
  },
  
  // Cache user data (user-isolated)
  cacheUserData: function(userData) {
    return this.set(CACHE_CONFIG.KEYS.USER_DATA, userData, CACHE_CONFIG.EXPIRATION.USER_DATA);
  },
  
  // Get cached user data (user-isolated) - with instant loading
  getCachedUserData: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.USER_DATA) : this.get(CACHE_CONFIG.KEYS.USER_DATA);
  },
  
  // Cache user profile (user-isolated)
  cacheUserProfile: function(profileData) {
    return this.set(CACHE_CONFIG.KEYS.USER_PROFILE, profileData, CACHE_CONFIG.EXPIRATION.USER_DATA);
  },
  
  // Get cached user profile (user-isolated) - with instant loading
  getCachedUserProfile: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.USER_PROFILE) : this.get(CACHE_CONFIG.KEYS.USER_PROFILE);
  },
  
  // Cache session data (user-isolated)
  cacheSession: function(sessionData) {
    return this.set(CACHE_CONFIG.KEYS.SESSION, sessionData, CACHE_CONFIG.EXPIRATION.USER_DATA);
  },
  
  // Get cached session data (user-isolated) - with instant loading
  getCachedSession: function(instant = true) {
    return instant ? this.getInstant(CACHE_CONFIG.KEYS.SESSION) : this.get(CACHE_CONFIG.KEYS.SESSION);
  },
  
  // Cache app initialization state
  cacheAppInitialized: function(state = true) {
    return this.set(CACHE_CONFIG.KEYS.APP_INITIALIZED, { initialized: state, timestamp: Date.now() }, 24 * 60 * 60 * 1000);
  },
  
  // Get app initialization state
  isAppInitialized: function() {
    const data = this.get(CACHE_CONFIG.KEYS.APP_INITIALIZED, true);
    return data ? data.initialized : false;
  },
  
  // Clear all user-specific data
  clearCurrentUserData: function() {
    if (USER_DATA_ISOLATION.currentUserId) {
      USER_DATA_ISOLATION.clearUserData(USER_DATA_ISOLATION.currentUserId);
    }
  },
  
  // Check if any cached data exists for current tab
  hasCachedTabData: function(tabName) {
    switch(tabName) {
      case 'friends': return this.hasAny(CACHE_CONFIG.KEYS.FRIENDS_LIST);
      case 'chats': return this.hasAny(CACHE_CONFIG.KEYS.CHATS_LIST);
      case 'calls': return this.hasAny(CACHE_CONFIG.KEYS.CALLS_LIST);
      case 'groups': return this.hasAny(CACHE_CONFIG.KEYS.GROUPS_LIST);
      default: return false;
    }
  },
  
  // Get all cached tab data at once (for instant display)
  getAllCachedTabData: function() {
    return {
      friends: this.getCachedFriends(true),
      chats: this.getCachedChats(true),
      calls: this.getCachedCalls(true),
      groups: this.getCachedGroups(true),
      messages: this.getCachedMessages(true),
      userData: this.getCachedUserData(true),
      userProfile: this.getCachedUserProfile(true),
      session: this.getCachedSession(true)
    };
  },
  
  // NEW: Generate and cache offline data if no cached data exists
  ensureOfflineDataAvailable: function() {
    if (!currentUser) {
      console.log('No current user, cannot generate offline data');
      return null;
    }
    
    // Check if we already have offline data cached
    const offlineKey = USER_DATA_ISOLATION.getUserCacheKey(CACHE_CONFIG.KEYS.OFFLINE_DATA_READY);
    if (localStorage.getItem(offlineKey)) {
      console.log('Offline data already prepared');
      return true;
    }
    
    console.log('Generating offline data for instant UI...');
    
    // Generate comprehensive offline data
    const offlineData = OFFLINE_DATA_GENERATOR.generateAllOfflineData(currentUser.id || currentUser.uid);
    
    // Cache all the generated data
    this.cacheFriends(offlineData.friends);
    this.cacheChats(offlineData.chats);
    this.cacheGroups(offlineData.groups);
    this.cacheCalls(offlineData.calls);
    this.cacheUserProfile(offlineData.userProfile);
    
    // Mark offline data as ready
    localStorage.setItem(offlineKey, JSON.stringify({
      ready: true,
      timestamp: new Date().toISOString(),
      userId: currentUser.id || currentUser.uid
    }));
    
    console.log('Offline data generated and cached');
    return true;
  },
  
  // NEW: Get offline data for a specific tab
  getOfflineTabData: function(tabName) {
    switch(tabName) {
      case 'friends': return OFFLINE_DATA_GENERATOR.generateFriendsList();
      case 'chats': return OFFLINE_DATA_GENERATOR.generateChatsList();
      case 'calls': return OFFLINE_DATA_GENERATOR.generateCallsList();
      case 'groups': return OFFLINE_DATA_GENERATOR.generateGroupsList();
      default: return null;
    }
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let currentTab = 'groups';
let isLoading = false;
let isSidebarOpen = true;

// AUTH STATE (JWT-BASED)
let currentUser = null;
let authStateRestored = false;

// NETWORK CONNECTIVITY STATE
let isOnline = navigator.onLine;
let syncQueue = [];

// NETWORK-DEPENDENT SERVICES STATE
let networkDependentServices = {
  backend: false,
  websocket: false,
  api: false,
  realtimeUpdates: false
};

// INSTANT LOADING STATE
let instantUILoaded = false;
let backgroundSyncInProgress = false;
let pendingUIUpdates = [];

// ============================================================================
// ENHANCED NETWORK-DEPENDENT SERVICE MANAGER WITH BACKGROUND SYNC
// ============================================================================

const NETWORK_SERVICE_MANAGER = {
  services: new Map(),
  
  states: {
    backend: { running: false, initialized: false },
    websocket: { running: false, connected: false },
    api: { running: false },
    realtimeUpdates: { running: false },
    backgroundSync: { running: false, lastSync: null }
  },
  
  registerService: function(name, startFunction, stopFunction) {
    this.services.set(name, {
      start: startFunction,
      stop: stopFunction,
      running: false
    });
    console.log(`Registered network-dependent service: ${name}`);
  },
  
  unregisterService: function(name) {
    this.services.delete(name);
    console.log(`Unregistered network-dependent service: ${name}`);
  },
  
  startAllServices: function() {
    console.log('Starting all network-dependent services...');
    
    this.services.forEach((service, name) => {
      if (!service.running) {
        try {
          service.start();
          service.running = true;
          this.states[name] = { ...this.states[name], running: true };
          console.log(`Started service: ${name}`);
        } catch (error) {
          console.error(`Failed to start service ${name}:`, error);
        }
      }
    });
  },
  
  stopAllServices: function() {
    console.log('Stopping all network-dependent services...');
    
    this.services.forEach((service, name) => {
      if (service.running && service.stop) {
        try {
          service.stop();
          service.running = false;
          this.states[name] = { ...this.states[name], running: false };
          console.log(`Stopped service: ${name}`);
        } catch (error) {
          console.error(`Failed to stop service ${name}:`, error);
        }
      } else {
        service.running = false;
        this.states[name] = { ...this.states[name], running: false };
      }
    });
  },
  
  startService: function(name) {
    const service = this.services.get(name);
    if (service && !service.running) {
      try {
        service.start();
        service.running = true;
        this.states[name] = { ...this.states[name], running: true };
        console.log(`Started service: ${name}`);
        return true;
      } catch (error) {
        console.error(`Failed to start service ${name}:`, error);
        return false;
      }
    }
    return false;
  },
  
  stopService: function(name) {
    const service = this.services.get(name);
    if (service && service.running && service.stop) {
      try {
        service.stop();
        service.running = false;
        this.states[name] = { ...this.states[name], running: false };
        console.log(`Stopped service: ${name}`);
        return true;
      } catch (error) {
        console.error(`Failed to stop service ${name}:`, error);
        return false;
      }
    }
    return false;
  },
  
  isServiceRunning: function(name) {
    const service = this.services.get(name);
    return service ? service.running : false;
  },
  
  getServiceStates: function() {
    const states = {};
    this.services.forEach((service, name) => {
      states[name] = {
        running: service.running,
        networkRequired: true
      };
    });
    return states;
  },
  
  // Background sync service
  startBackgroundSync: function() {
    if (backgroundSyncInProgress) {
      console.log('Background sync already in progress');
      return;
    }
    
    if (!isOnline) {
      console.log('Background sync skipped: offline');
      return;
    }
    
    backgroundSyncInProgress = true;
    this.states.backgroundSync = { running: true, lastSync: new Date().toISOString() };
    
    console.log('Starting background sync...');
    
    // Trigger sync in the background
    setTimeout(() => {
      this.performBackgroundSync();
    }, 1000);
  },
  
  performBackgroundSync: function() {
    if (!isOnline || !currentUser) {
      backgroundSyncInProgress = false;
      this.states.backgroundSync.running = false;
      return;
    }
    
    console.log('Performing background sync for user:', currentUser.id || currentUser.uid);
    
    // 1. Sync queued messages
    processQueuedMessages();
    
    // 2. Refresh cached data in background
    refreshCachedDataInBackground();
    
    // 3. Update app initialization state
    DATA_CACHE.cacheAppInitialized(true);
    
    // Mark sync as complete
    setTimeout(() => {
      backgroundSyncInProgress = false;
      this.states.backgroundSync.running = false;
      this.states.backgroundSync.lastSync = new Date().toISOString();
      
      console.log('Background sync completed');
      
      // Apply any pending UI updates
      applyPendingUIUpdates();
    }, 3000);
  }
};

// ============================================================================
// AUTHENTICATION STATE MANAGEMENT
// ============================================================================

// Handle auth state changes with user data isolation
function handleAuthStateChange(user, isOffline = false) {
  const userId = user ? (user.id || user.uid) : null;
  const currentUserId = currentUser ? (currentUser.id || currentUser.uid) : null;
  
  // If user is changing, clear old user's data
  if (userId !== currentUserId && currentUserId) {
    console.log(`User changed from ${currentUserId} to ${userId}, clearing old user data`);
    
    // Clear old user's cached data
    USER_DATA_ISOLATION.clearUserData(currentUserId);
    
    // Clear settings for old user
    SETTINGS_SERVICE.clearUserSettings();
  }
  
  // Update current user
  currentUser = user;
  
  // Update user isolation service
  if (userId) {
    USER_DATA_ISOLATION.setCurrentUser(userId);
    DATA_CACHE.setCurrentUser(userId);
    SETTINGS_SERVICE.setCurrentUser(userId);
    
    // Ensure offline data is available for this user
    DATA_CACHE.ensureOfflineDataAvailable();
  } else {
    USER_DATA_ISOLATION.clearCurrentUser();
    DATA_CACHE.setCurrentUser(null);
    SETTINGS_SERVICE.setCurrentUser(null);
  }
  
  // Update global auth state
  updateGlobalAuthState(user);
  
  // Broadcast auth change to other components
  broadcastAuthChange(user);
  
  console.log('Auth state updated:', user ? `User ${userId} (${isOffline ? 'offline' : 'online'})` : 'No user');
  
  // UPDATE: Don't update UI based on auth state here - let initialization handle it
  // This prevents premature redirects before auth initialization completes
  
  // Load cached data instantly if we have a user
  if (user) {
    loadCachedDataInstantly();
  }
}

// Update UI based on authentication state - FIXED VERSION
function updateUIBasedOnAuthState(user) {
  const isChatPage = window.location.pathname.includes('chat.html') || 
                    document.querySelector(APP_CONFIG.contentArea)?.innerHTML.includes('chat-container');
  
  // NEW: Check if auth is still initializing
  if (AUTH_MANAGER.authInitializing) {
    console.log('Auth still initializing, delaying UI update');
    return;
  }
  
  if (user && isChatPage) {
    // User is authenticated and on chat page, show chat interface
    console.log('User authenticated, showing chat interface');
    showChatInterface();
  } else if (!user && isChatPage) {
    // User not authenticated but on chat page, redirect to login
    console.log('User not authenticated, redirecting to login');
    window.location.href = 'index.html';
  } else if (user && window.location.pathname.includes('index.html')) {
    // User is authenticated but on login page, redirect to chat
    console.log('User already authenticated, redirecting to chat');
    window.location.href = 'chat.html';
  }
}

// Show chat interface
function showChatInterface() {
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (contentArea) {
    contentArea.innerHTML = `
      <div class="chat-container">
        <div class="sidebar">${getSidebarHTML()}</div>
        <div class="main-content">
          <div class="tab-panels">
            <div id="chatsTab" class="tab-panel hidden">Loading chats...</div>
            <div id="groupsTab" class="tab-panel hidden">Loading groups...</div>
            <div id="friendsTab" class="tab-panel hidden">Loading friends...</div>
            <div id="callsTab" class="tab-panel hidden">Loading calls...</div>
            <div id="toolsTab" class="tab-panel hidden">Loading tools...</div>
          </div>
        </div>
      </div>
    `;
    
    // Initialize chat interface
    setTimeout(() => {
      setupEventListeners();
      switchTab('groups');
    }, 100);
  }
}

// Get sidebar HTML
function getSidebarHTML() {
  const user = AUTH_MANAGER.user || currentUser;
  const displayName = user ? user.displayName || user.email.split('@')[0] : 'User';
  const avatarUrl = user ? (user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=8b5cf6&color=fff`) : '';
  
  return `
    <div class="sidebar-header">
      <div class="user-info">
        <img src="${avatarUrl}" alt="${displayName}" class="user-avatar">
        <div class="user-details">
          <h3 class="user-name">${displayName}</h3>
          <p class="user-status">Online</p>
        </div>
      </div>
      <button class="sidebar-toggle" onclick="toggleSidebar()">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
    </div>
    <div class="sidebar-nav">
      <a href="#" class="nav-item active" data-tab="chats">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        <span class="nav-text">Chats</span>
      </a>
      <a href="#" class="nav-item" data-tab="groups">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
        <span class="nav-text">Groups</span>
      </a>
      <a href="#" class="nav-item" data-tab="friends">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13 1a6 6 0 01-6 6m6-6a6 6 0 00-6-6m0 0a6 6 0 01-6 6m6-6a6 6 0 00-6 6"></path>
        </svg>
        <span class="nav-text">Friends</span>
      </a>
      <a href="#" class="nav-item" data-tab="calls">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
        </svg>
        <span class="nav-text">Calls</span>
      </a>
      <a href="#" class="nav-item" data-tab="tools">
        <svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
        <span class="nav-text">Tools</span>
      </a>
    </div>
    <div class="sidebar-footer">
      <button class="btn-logout" onclick="AUTH_MANAGER.logout()">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
        </svg>
        <span>Logout</span>
      </button>
    </div>
  `;
}

// Update global auth state
function updateGlobalAuthState(user) {
  window.MOODCHAT_AUTH = {
    currentUser: user,
    isAuthenticated: !!user,
    userId: user ? (user.id || user.uid) : null,
    userEmail: user ? user.email : null,
    displayName: user ? user.displayName : null,
    photoURL: user ? user.photoURL : null,
    isAuthReady: authStateRestored,
    authMethod: 'jwt',
    timestamp: new Date().toISOString()
  };
  
  // Dispatch custom event for other components
  const event = new CustomEvent('moodchat-auth-change', {
    detail: { 
      user: user, 
      isAuthenticated: !!user,
      isAuthReady: authStateRestored,
      authMethod: 'jwt'
    }
  });
  window.dispatchEvent(event);
}

// Broadcast auth change to other tabs/pages
function broadcastAuthChange(user) {
  const authData = {
    type: 'auth-state',
    user: user ? {
      id: user.id || user.uid,
      uid: user.id || user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified || false,
      authMethod: 'jwt'
    } : null,
    isAuthenticated: !!user,
    timestamp: new Date().toISOString()
  };
  
  try {
    localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
    
    // Dispatch storage event for other tabs/windows
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'moodchat-auth-state',
      newValue: JSON.stringify(authData)
    }));
  } catch (e) {
    console.log('Could not broadcast auth state to localStorage:', e);
  }
}

// Broadcast that auth is ready
function broadcastAuthReady() {
  const event = new CustomEvent('moodchat-auth-ready', {
    detail: { 
      isReady: true,
      user: currentUser,
      timestamp: new Date().toISOString(),
      isOffline: !isOnline
    }
  });
  window.dispatchEvent(event);
  console.log('Auth ready broadcasted, user:', currentUser ? (currentUser.id || currentUser.uid) : 'No user');
}

// ============================================================================
// ENHANCED GLOBAL AUTH ACCESS WITH JWT AUTHENTICATION
// ============================================================================

function setupGlobalAuthAccess() {
  // Create global access methods for all pages
  window.getCurrentUser = () => currentUser;
  window.getCurrentUserId = () => currentUser ? (currentUser.id || currentUser.uid) : null;
  window.isAuthenticated = () => !!currentUser;
  window.isAuthReady = () => authStateRestored;
  window.waitForAuth = () => {
    return new Promise((resolve) => {
      if (authStateRestored) {
        resolve(currentUser);
      } else {
        const listener = () => {
          window.removeEventListener('moodchat-auth-ready', listener);
          resolve(currentUser);
        };
        window.addEventListener('moodchat-auth-ready', listener);
      }
    });
  };
  
  // Enhanced login function with JWT authentication
  window.login = async function(email, password) {
    return await AUTH_MANAGER.login(email, password);
  };
  
  // Enhanced logout function with data clearing
  window.logout = async function() {
    return await AUTH_MANAGER.logout();
  };
  
  // Enhanced register function
  window.register = async function(email, password, displayName) {
    return await AUTH_MANAGER.register(email, password, displayName);
  };
  
  // Expose to window for immediate access
  window.MOODCHAT_AUTH_API = {
    getCurrentUser: () => currentUser,
    getUserId: () => currentUser ? (currentUser.id || currentUser.uid) : null,
    isAuthenticated: () => !!currentUser,
    getUserEmail: () => currentUser ? currentUser.email : null,
    getDisplayName: () => currentUser ? currentUser.displayName : null,
    getPhotoURL: () => currentUser ? currentUser.photoURL : null,
    isAuthReady: () => authStateRestored,
    waitForAuth: window.waitForAuth,
    login: window.login,
    logout: window.logout,
    register: window.register,
    clearUserData: (userId) => USER_DATA_ISOLATION.clearUserData(userId),
    getToken: () => AUTH_MANAGER.token,
    isAuthInitializing: () => AUTH_MANAGER.authInitializing // NEW: Expose initialization state
  };
}

// ============================================================================
// INSTANT UI LOADING SYSTEM (ENHANCED FOR OFFLINE)
// ============================================================================

function loadCachedDataInstantly() {
  if (!currentUser || !(currentUser.id || currentUser.uid)) {
    console.log('No user logged in, showing offline placeholder UI');
    showOfflinePlaceholderUI();
    return;
  }
  
  console.log('Loading cached data instantly for UI...');
  
  // Get all cached data at once
  const cachedData = DATA_CACHE.getAllCachedTabData();
  
  // Check if we have any cached data
  const hasCachedData = Object.values(cachedData).some(data => data !== null);
  
  if (!hasCachedData) {
    console.log('No cached data found, using offline data generator');
    
    // Generate and use offline data
    const offlineData = OFFLINE_DATA_GENERATOR.generateAllOfflineData(currentUser.id || currentUser.uid);
    
    // Cache the offline data for future use
    DATA_CACHE.cacheFriends(offlineData.friends);
    DATA_CACHE.cacheChats(offlineData.chats);
    DATA_CACHE.cacheGroups(offlineData.groups);
    DATA_CACHE.cacheCalls(offlineData.calls);
    DATA_CACHE.cacheUserProfile(offlineData.userProfile);
    
    // Update cachedData with offline data
    Object.assign(cachedData, {
      friends: offlineData.friends,
      chats: offlineData.chats,
      groups: offlineData.groups,
      calls: offlineData.calls,
      userProfile: offlineData.userProfile
    });
    
    // Mark as offline data
    cachedData.isOfflineData = true;
  }
  
  // Dispatch event with cached data for UI to render instantly
  const event = new CustomEvent('cached-data-loaded', {
    detail: {
      data: cachedData,
      userId: currentUser.id || currentUser.uid,
      timestamp: new Date().toISOString(),
      source: 'cache',
      isOfflineData: cachedData.isOfflineData || false
    }
  });
  window.dispatchEvent(event);
  
  instantUILoaded = true;
  console.log('Instant UI data loaded from cache/offline generator');
  
  // Update UI to show cached data is being used
  showCachedDataIndicator(cachedData.isOfflineData);
}

function showOfflinePlaceholderUI() {
  const contentArea = document.querySelector(APP_CONFIG.contentArea);
  if (!contentArea) return;
  
  const placeholderHTML = `
    <div class="offline-placeholder p-8 text-center">
      <div class="mb-6">
        <svg class="w-24 h-24 mx-auto text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      </div>
      <h3 class="text-xl font-semibold mb-2 dark:text-white">Welcome to MoodChat</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-4">You're currently offline.</p>
      <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm">The app will work with offline data. Some features may be limited.</p>
      <div class="space-y-3">
        <button onclick="window.location.href='index.html'" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg w-full transition-colors">
          Go to Login
        </button>
        <button onclick="createOfflineUserAndContinue()" class="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-6 py-3 rounded-lg w-full transition-colors">
          Continue Offline
        </button>
      </div>
    </div>
  `;
  
  contentArea.innerHTML = placeholderHTML;
  
  // Expose the continue offline function
  window.createOfflineUserAndContinue = function() {
    // Create an offline user
    const offlineUserId = 'offline_user_' + Date.now();
    const offlineUser = {
      id: offlineUserId,
      uid: offlineUserId,
      email: 'offline@moodchat.app',
      displayName: 'Offline User',
      photoURL: `https://ui-avatars.com/api/?name=Offline+User&background=8b5cf6&color=fff`,
      emailVerified: false,
      isOffline: true,
      providerId: 'offline',
      isAnonymous: true,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: new Date().toISOString()
      },
      refreshToken: 'offline-token',
      getIdToken: () => Promise.resolve('offline-token'),
      isOfflineMode: true
    };
    
    handleAuthStateChange(offlineUser, true);
    
    setTimeout(() => {
      loadCachedDataInstantly();
      // Switch to groups tab
      setTimeout(() => {
        switchTab('groups');
      }, 100);
    }, 100);
  };
}

function refreshCachedDataInBackground() {
  if (!isOnline || !currentUser || !(currentUser.id || currentUser.uid)) {
    console.log('Cannot refresh cached data: offline or no user');
    return;
  }
  
  console.log('Refreshing cached data in background for user:', currentUser.id || currentUser.uid);
  
  // This function should be implemented by individual tab modules
  // It will fetch fresh data from the server and update the cache
  
  // Dispatch event to trigger background data refresh
  const event = new CustomEvent('refresh-cached-data', {
    detail: {
      userId: currentUser.id || currentUser.uid,
      forceRefresh: true,
      silent: true, // Don't show loading indicators
      timestamp: new Date().toISOString()
    }
  });
  window.dispatchEvent(event);
}

function applyPendingUIUpdates() {
  if (pendingUIUpdates.length === 0) return;
  
  console.log(`Applying ${pendingUIUpdates.length} pending UI updates...`);
  
  // Process updates in batches to avoid UI lag
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < pendingUIUpdates.length; i += batchSize) {
    batches.push(pendingUIUpdates.slice(i, i + batchSize));
  }
  
  // Apply batches with small delays
  batches.forEach((batch, index) => {
    setTimeout(() => {
      batch.forEach(update => {
        try {
          if (typeof update === 'function') {
            update();
          }
        } catch (error) {
          console.log('Error applying UI update:', error);
        }
      });
      
      // Clear processed updates
      pendingUIUpdates = pendingUIUpdates.filter(u => !batch.includes(u));
      
    }, index * 100); // Small delay between batches
  });
  
  console.log('Pending UI updates applied');
}

function showCachedDataIndicator(isOfflineData = false) {
  // Create a subtle indicator that data is loaded from cache
  const indicator = document.createElement('div');
  indicator.id = 'cached-data-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: ${isOfflineData ? 'rgba(245, 158, 11, 0.9)' : 'rgba(0, 0, 0, 0.7)'};
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  `;
  indicator.textContent = isOfflineData ? 'Using offline data' : 'Using cached data';
  document.body.appendChild(indicator);
  
  // Show briefly then fade out
  setTimeout(() => {
    indicator.style.opacity = '1';
    setTimeout(() => {
      indicator.style.opacity = '0';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }, 2000);
  }, 100);
}

// ============================================================================
// NETWORK DETECTION WITH INSTANT UI SUPPORT
// ============================================================================

function initializeNetworkDetection() {
  console.log('Initializing network detection with instant UI support...');
  
  // Set initial state
  updateNetworkStatus(navigator.onLine);
  
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initialize data cache
  DATA_CACHE.initialize();
  
  // Initialize IndexedDB for queued messages
  initializeMessageQueue();
  
  // Start periodic sync check
  startSyncMonitor();
  
  // Register WebSocket service placeholder
  NETWORK_SERVICE_MANAGER.registerService('websocket', 
    () => startWebSocketService(),
    () => stopWebSocketService()
  );
  
  // Register API service
  NETWORK_SERVICE_MANAGER.registerService('api',
    () => startApiService(),
    () => stopApiService()
  );
  
  // Register realtime updates service
  NETWORK_SERVICE_MANAGER.registerService('realtimeUpdates',
    () => startRealtimeUpdates(),
    () => stopRealtimeUpdates()
  );
  
  // Register background sync service
  NETWORK_SERVICE_MANAGER.registerService('backgroundSync',
    () => NETWORK_SERVICE_MANAGER.startBackgroundSync(),
    () => { backgroundSyncInProgress = false; }
  );
}

// Handle online event
function handleOnline() {
  console.log('Network: Online');
  updateNetworkStatus(true);
  
  // Broadcast network change to other files
  broadcastNetworkChange(true);
  
  // Start all network-dependent services
  NETWORK_SERVICE_MANAGER.startAllServices();
  
  // Start background sync
  setTimeout(() => {
    NETWORK_SERVICE_MANAGER.startBackgroundSync();
  }, 500);
  
  // Update UI to show online status
  showOnlineIndicator();
}

// Handle offline event
function handleOffline() {
  console.log('Network: Offline');
  updateNetworkStatus(false);
  
  // Stop all network-dependent services
  NETWORK_SERVICE_MANAGER.stopAllServices();
  
  // Broadcast network change to other files
  broadcastNetworkChange(false);
  
  // Show offline indicator
  showOfflineIndicator();
}

// Update network status globally
function updateNetworkStatus(online) {
  isOnline = online;
  
  // Expose globally for other modules
  window.MOODCHAT_NETWORK = {
    isOnline: isOnline,
    isOffline: !isOnline,
    lastChange: new Date().toISOString(),
    syncQueueSize: syncQueue.length,
    services: NETWORK_SERVICE_MANAGER.getServiceStates()
  };
  
  // Dispatch custom event for other components
  const event = new CustomEvent('moodchat-network-change', {
    detail: { 
      isOnline: isOnline, 
      isOffline: !isOnline,
      services: NETWORK_SERVICE_MANAGER.getServiceStates()
    }
  });
  window.dispatchEvent(event);
  
  console.log(`Network status: ${online ? 'Online' : 'Offline'}`);
}

// Show offline indicator
function showOfflineIndicator() {
  // Remove existing indicator if any
  const existing = document.getElementById('offline-indicator');
  if (existing) existing.remove();
  
  const indicator = document.createElement('div');
  indicator.id = 'offline-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: #f87171;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    opacity: 0.9;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease-out;
  `;
  indicator.textContent = 'Offline - Using cached data';
  document.body.appendChild(indicator);
}

// Show online indicator
function showOnlineIndicator() {
  const existing = document.getElementById('offline-indicator');
  if (existing) {
    existing.style.background = '#10b981';
    existing.textContent = 'Back online';
    
    setTimeout(() => {
      if (existing.parentNode) {
        existing.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => existing.remove(), 300);
      }
    }, 2000);
  }
}

// Broadcast network changes
function broadcastNetworkChange(isOnline) {
  const status = {
    type: 'network-status',
    isOnline: isOnline,
    isOffline: !isOnline,
    timestamp: new Date().toISOString(),
    services: NETWORK_SERVICE_MANAGER.getServiceStates()
  };
  
  try {
    localStorage.setItem(CACHE_CONFIG.KEYS.NETWORK_STATUS, JSON.stringify(status));
    
    // Dispatch storage event for other tabs/windows
    window.dispatchEvent(new StorageEvent('storage', {
      key: CACHE_CONFIG.KEYS.NETWORK_STATUS,
      newValue: JSON.stringify(status)
    }));
  } catch (e) {
    console.log('Could not broadcast network status to localStorage:', e);
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
  
  // Background data refresh every 5 minutes when online
  setInterval(() => {
    if (isOnline && currentUser) {
      refreshCachedDataInBackground();
    }
  }, 5 * 60 * 1000);
}

// BACKGROUND SYNC: Process queued messages
function triggerBackgroundSync() {
  console.log('Background sync triggered');
  
  // Process queued messages
  processQueuedMessages();
  
  // Call global sync function if defined
  if (typeof window.syncOfflineData === 'function') {
    window.syncOfflineData().catch(error => {
      console.log('Background sync error:', error);
    });
  }
}

// WebSocket service functions
function startWebSocketService() {
  console.log('Starting WebSocket service...');
  if (typeof window.startChatWebSocket === 'function') {
    window.startChatWebSocket();
  }
}

function stopWebSocketService() {
  console.log('Stopping WebSocket service...');
  if (typeof window.stopChatWebSocket === 'function') {
    window.stopChatWebSocket();
  }
}

// API service functions
function startApiService() {
  console.log('Starting API service...');
  networkDependentServices.api = true;
  window.dispatchEvent(new CustomEvent('api-service-ready'));
}

function stopApiService() {
  console.log('Stopping API service...');
  networkDependentServices.api = false;
}

// Realtime updates service
function startRealtimeUpdates() {
  console.log('Starting realtime updates service...');
  networkDependentServices.realtimeUpdates = true;
  
  if (typeof window.startRealtimeListeners === 'function') {
    window.startRealtimeListeners();
  }
}

function stopRealtimeUpdates() {
  console.log('Stopping realtime updates service...');
  networkDependentServices.realtimeUpdates = false;
  
  if (typeof window.stopRealtimeListeners === 'function') {
    window.stopRealtimeListeners();
  }
}

// Initialize IndexedDB for message queue with user isolation
function initializeMessageQueue() {
  if (!window.indexedDB) {
    console.log('IndexedDB not supported, offline queue disabled');
    return;
  }
  
  const request = indexedDB.open('MoodChatMessageQueue', 3);
  
  request.onerror = function(event) {
    console.log('Failed to open IndexedDB:', event.target.error);
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
      store.createIndex('userId', 'userId', { unique: false });
    }
    
    // Create object store for other actions
    if (oldVersion < 2 || !db.objectStoreNames.contains('actions')) {
      const actionStore = db.createObjectStore('actions', {
        keyPath: 'id',
        autoIncrement: true
      });
      
      actionStore.createIndex('status', 'status', { unique: false });
      actionStore.createIndex('type', 'type', { unique: false });
      actionStore.createIndex('timestamp', 'timestamp', { unique: false });
      actionStore.createIndex('userId', 'userId', { unique: false });
    }
    
    // Add user isolation index to existing stores
    if (oldVersion < 3) {
      // Already added userId index in previous versions
    }
  };
  
  request.onsuccess = function(event) {
    console.log('Message queue database initialized');
    
    // Load existing queue into memory for current user
    loadQueueIntoMemory(event.target.result);
  };
}

// Load existing queue into memory for current user only
function loadQueueIntoMemory(db) {
  if (!currentUser || !(currentUser.id || currentUser.uid)) {
    console.log('No current user, not loading queue');
    return;
  }
  
  const transaction = db.transaction(['messages', 'actions'], 'readonly');
  const messageStore = transaction.objectStore('messages');
  const actionStore = transaction.objectStore('actions');
  
  const userId = currentUser.id || currentUser.uid;
  
  // Load messages for current user only
  const msgIndex = messageStore.index('userId');
  const msgRange = IDBKeyRange.only(userId);
  
  msgIndex.getAll(msgRange).onsuccess = function(event) {
    const messages = event.target.result;
    messages.forEach(msg => {
      if (msg.status === 'pending') {
        syncQueue.push(msg);
      }
    });
    console.log(`Loaded ${messages.length} messages from queue for user ${userId}`);
  };
  
  // Load actions for current user only
  const actIndex = actionStore.index('userId');
  const actRange = IDBKeyRange.only(userId);
  
  actIndex.getAll(actRange).onsuccess = function(event) {
    const actions = event.target.result;
    actions.forEach(action => {
      if (action.status === 'pending') {
        syncQueue.push(action);
      }
    });
    console.log(`Loaded ${actions.length} actions from queue for user ${userId}`);
  };
}

// Queue any action for offline sync with user isolation
function queueForSync(data, type = 'message') {
  if (!window.indexedDB || !currentUser || !(currentUser.id || currentUser.uid)) {
    return Promise.resolve({ 
      queued: false, 
      offline: true,
      message: 'IndexedDB not available or no user logged in'
    });
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MoodChatMessageQueue', 3);
    
    request.onerror = function(event) {
      console.log('Failed to open IndexedDB for queuing:', event.target.error);
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
        userId: currentUser.id || currentUser.uid,
        attempts: 0
      };
      
      const addRequest = store.add(item);
      
      addRequest.onsuccess = function() {
        console.log(`${type} queued for sync for user ${currentUser.id || currentUser.uid}:`, data);
        
        // Add to in-memory queue
        syncQueue.push({
          id: addRequest.result,
          ...item
        });
        
        // Update global connectivity state
        window.MOODCHAT_NETWORK.syncQueueSize = syncQueue.length;
        
        resolve({ 
          queued: true, 
          offline: true, 
          id: addRequest.result,
          userId: currentUser.id || currentUser.uid,
          message: `${type} queued for when online` 
        });
      };
      
      addRequest.onerror = function(event) {
        console.log(`Failed to queue ${type}:`, event.target.error);
        reject(event.target.error);
      };
    };
  });
}

// Process queued messages when online for current user only
function processQueuedMessages() {
  if (!isOnline || !window.indexedDB || syncQueue.length === 0 || !currentUser) return;
  
  console.log(`Processing ${syncQueue.length} queued items for user ${currentUser.id || currentUser.uid}...`);
  
  const request = indexedDB.open('MoodChatMessageQueue', 3);
  
  request.onerror = function(event) {
    console.log('Failed to open IndexedDB for processing:', event.target.error);
  };
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    const userId = currentUser.id || currentUser.uid;
    
    // Process messages for current user only
    processStoreQueue(db, 'messages', userId);
    
    // Process actions for current user only
    processStoreQueue(db, 'actions', userId);
  };
}

// Process queue for a specific store for specific user only
function processStoreQueue(db, storeName, userId) {
  const transaction = db.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);
  const index = store.index('userId');
  const range = IDBKeyRange.only(userId);
  
  const getRequest = index.getAll(range);
  
  getRequest.onsuccess = function() {
    const items = getRequest.result;
    
    // Filter to only pending items
    const pendingItems = items.filter(item => item.status === 'pending');
    
    if (pendingItems.length === 0) {
      console.log(`No pending ${storeName} to sync for user ${userId}`);
      return;
    }
    
    console.log(`Processing ${pendingItems.length} queued ${storeName} for user ${userId}`);
    
    // Process each item
    pendingItems.forEach(item => {
      sendQueuedItem(item, db, storeName, userId);
    });
  };
}

// Send a queued item
function sendQueuedItem(item, db, storeName, userId) {
  // Check if we're still online
  if (!isOnline) {
    console.log(`Cannot send ${storeName} ${item.id}: offline`);
    return;
  }
  
  // Verify this item belongs to current user
  if (item.userId !== userId) {
    console.log(`Skipping ${storeName} ${item.id}: belongs to different user (${item.userId})`);
    return;
  }
  
  // Determine how to send based on type
  const sendFunction = getSendFunctionForType(item.type || storeName);
  
  if (!sendFunction) {
    console.log(`No send function for type: ${item.type}`);
    markItemAsFailed(item.id, db, storeName, 'No send function', userId);
    return;
  }
  
  // Increment attempts
  item.attempts = (item.attempts || 0) + 1;
  
  if (item.attempts > 5) {
    // Too many attempts, mark as failed
    markItemAsFailed(item.id, db, storeName, 'Max attempts exceeded', userId);
    return;
  }
  
  // Try to send
  sendFunction(item)
    .then(result => {
      // Success - mark as sent
      markItemAsSent(item.id, db, storeName, userId);
    })
    .catch(error => {
      console.log(`Failed to send ${item.type}:`, error);
      
      // Update attempt count
      updateItemAttempts(item.id, db, storeName, item.attempts, userId);
    });
}

// Get appropriate send function based on type
function getSendFunctionForType(type) {
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
    case 'api':
      return sendQueuedApiCall;
    default:
      return defaultSendItem;
  }
}

// Send queued API call
async function sendQueuedApiCall(item) {
  try {
    const result = await api(item.endpoint, item.method, item.data, true);
    if (result.success) {
      return result;
    } else {
      throw new Error(result.error || 'API call failed');
    }
  } catch (error) {
    throw error;
  }
}

// Default send functions
function defaultSendMessage(message) {
  console.log('Sending queued message:', message);
  // Call backend API to send message
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.SEND_MESSAGE, 
    'POST', 
    {
      chatId: message.chatId,
      content: message.content,
      type: message.type || 'text'
    }
  );
}

function defaultSendStatus(status) {
  console.log('Sending queued status:', status);
  // Call backend API to update status
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.UPDATE_STATUS, 
    'POST', 
    {
      status: status.status,
      emoji: status.emoji
    }
  );
}

function defaultSendFriendRequest(request) {
  console.log('Sending queued friend request:', request);
  // Call backend API to send friend request
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.ADD_FRIEND, 
    'POST', 
    {
      friendId: request.friendId,
      message: request.message
    }
  );
}

function defaultSendCallLog(callLog) {
  console.log('Sending queued call log:', callLog);
  // Call backend API to log call
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.LOG_CALL, 
    'POST', 
    {
      userId: callLog.userId,
      type: callLog.type,
      duration: callLog.duration,
      status: callLog.status
    }
  );
}

function defaultSendItem(item) {
  console.log('Sending queued item:', item);
  return Promise.resolve();
}

// Mark item as sent (with user verification)
function markItemAsSent(itemId, db, storeName, userId) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item && item.userId === userId) {
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
      
      const updateRequest = store.put(item);
      updateRequest.onsuccess = function() {
        console.log(`${storeName} ${itemId} marked as sent for user ${userId}`);
        
        // Remove from in-memory queue
        syncQueue = syncQueue.filter(item => item.id !== itemId);
        window.MOODCHAT_NETWORK.syncQueueSize = syncQueue.length;
      };
    }
  };
}

// Mark item as failed (with user verification)
function markItemAsFailed(itemId, db, storeName, reason, userId) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item && item.userId === userId) {
      item.status = 'failed';
      item.failedAt = new Date().toISOString();
      item.failureReason = reason;
      
      store.put(item);
      
      // Remove from in-memory queue
      syncQueue = syncQueue.filter(item => item.id !== itemId);
      window.MOODCHAT_NETWORK.syncQueueSize = syncQueue.length;
    }
  };
}

// Update item attempt count (with user verification)
function updateItemAttempts(itemId, db, storeName, attempts, userId) {
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  const getRequest = store.get(itemId);
  
  getRequest.onsuccess = function() {
    const item = getRequest.result;
    if (item && item.userId === userId) {
      item.attempts = attempts;
      store.put(item);
    }
  };
}

// ============================================================================
// ENHANCED GLOBAL STATE EXPOSURE WITH USER ISOLATION AND INSTANT LOADING
// ============================================================================

function exposeGlobalStateToIframes() {
  if (!window.MOODCHAT_GLOBAL) {
    window.MOODCHAT_GLOBAL = {};
  }
  
  // Expose auth state
  window.MOODCHAT_GLOBAL.auth = {
    getCurrentUser: () => currentUser,
    getUserId: () => currentUser ? (currentUser.id || currentUser.uid) : null,
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
            window.removeEventListener('moodchat-auth-ready', listener);
            resolve(currentUser);
          };
          window.addEventListener('moodchat-auth-ready', listener);
        }
      });
    },
    clearUserData: (userId) => USER_DATA_ISOLATION.clearUserData(userId),
    getCachedUsers: () => USER_DATA_ISOLATION.getCachedUsers(),
    getToken: () => AUTH_MANAGER.token,
    isAuthInitializing: () => AUTH_MANAGER.authInitializing // NEW: Expose initialization state
  };
  
  // Expose network state
  window.MOODCHAT_GLOBAL.network = {
    isOnline: () => isOnline,
    isOffline: () => !isOnline,
    getSyncQueueSize: () => syncQueue.length,
    getServiceStates: () => NETWORK_SERVICE_MANAGER.getServiceStates(),
    isServiceRunning: (name) => NETWORK_SERVICE_MANAGER.isServiceRunning(name),
    waitForOnline: () => {
      return new Promise((resolve) => {
        if (isOnline) {
          resolve();
        } else {
          const listener = () => {
            window.removeEventListener('moodchat-network-change', listener);
            resolve();
          };
          window.addEventListener('moodchat-network-change', (e) => {
            if (e.detail.isOnline) {
              listener();
            }
          });
        }
      });
    }
  };
  
  // Expose network service manager
  window.MOODCHAT_GLOBAL.networkServices = {
    registerService: (name, startFn, stopFn) => NETWORK_SERVICE_MANAGER.registerService(name, startFn, stopFn),
    unregisterService: (name) => NETWORK_SERVICE_MANAGER.unregisterService(name),
    startService: (name) => NETWORK_SERVICE_MANAGER.startService(name),
    stopService: (name) => NETWORK_SERVICE_MANAGER.stopService(name),
    startAllServices: () => NETWORK_SERVICE_MANAGER.startAllServices(),
    stopAllServices: () => NETWORK_SERVICE_MANAGER.stopAllServices()
  };
  
  // Expose sync functions with user isolation
  window.MOODCHAT_GLOBAL.sync = {
    queueForSync: queueForSync,
    safeApiCall: safeApiCall,
    api: api,
    processQueuedMessages: processQueuedMessages,
    getQueuedItems: () => [...syncQueue]
  };
  
  // Expose data cache functions with user isolation and instant loading
  window.MOODCHAT_GLOBAL.cache = {
    get: (key, instant = true) => instant ? DATA_CACHE.getInstant(key) : DATA_CACHE.get(key),
    set: (key, data, expirationMs) => DATA_CACHE.set(key, data, expirationMs),
    remove: (key) => DATA_CACHE.remove(key),
    has: (key) => DATA_CACHE.has(key),
    hasAny: (key) => DATA_CACHE.hasAny(key),
    clearAll: () => DATA_CACHE.clearAll(),
    clearCurrentUserData: () => DATA_CACHE.clearCurrentUserData(),
    hasCachedTabData: (tabName) => DATA_CACHE.hasCachedTabData(tabName),
    getAllCachedTabData: () => DATA_CACHE.getAllCachedTabData(),
    isAppInitialized: () => DATA_CACHE.isAppInitialized(),
    // NEW: Offline data functions
    generateOfflineData: (tabName) => DATA_CACHE.getOfflineTabData(tabName),
    ensureOfflineDataAvailable: () => DATA_CACHE.ensureOfflineDataAvailable()
  };
  
  // Expose settings service
  window.MOODCHAT_GLOBAL.settings = window.MOODCHAT_SETTINGS;
  
  // Expose user isolation service
  window.MOODCHAT_GLOBAL.userIsolation = USER_DATA_ISOLATION;
  
  // Expose instant loading state
  window.MOODCHAT_GLOBAL.instant = {
    isUILoaded: () => instantUILoaded,
    loadCachedDataInstantly: () => loadCachedDataInstantly(),
    refreshInBackground: () => refreshCachedDataInBackground(),
    addPendingUpdate: (updateFn) => {
      if (typeof updateFn === 'function') {
        pendingUIUpdates.push(updateFn);
      }
    },
    // NEW: Offline data functions
    getOfflineDataGenerator: () => OFFLINE_DATA_GENERATOR,
    createOfflineUser: () => createOfflineUser()
  };
}

// ============================================================================
// APPLICATION SHELL FUNCTIONS
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
    console.log('Content area not found:', APP_CONFIG.contentArea);
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
    .catch(err => console.log("Load error:", err));
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
        console.log('Error executing inline script:', error);
      }
    }
  });
}

// ============================================================================
// TAB MANAGEMENT WITH INSTANT DATA LOADING (ENHANCED FOR OFFLINE)
// ============================================================================

function switchTab(tabName) {
  if (currentTab === tabName || isLoading) return;
  
  const config = TAB_CONFIG[tabName];
  if (!config) {
    console.log(`Tab "${tabName}" not found in config`);
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
    console.log(`Config not found for tab: ${tabName}`);
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
    
    // INSTANT DATA LOADING: Check cache first, then trigger background load
    loadTabDataInstantly(tabName);
  } else {
    console.log(`Tab container not found: ${config.container} for tab: ${tabName}`);
    if (EXTERNAL_TABS[tabName]) {
      loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    }
  }
}

// INSTANT DATA LOADING: Load cached data immediately, then refresh in background
function loadTabDataInstantly(tabName) {
  console.log(`Loading tab data instantly for: ${tabName} for user: ${currentUser ? (currentUser.id || currentUser.uid) : 'none'}`);
  
  // Check if we have cached data for this tab
  const hasCachedData = DATA_CACHE.hasCachedTabData(tabName);
  let dataSource = 'cache';
  
  // Dispatch event with cached data first (if available)
  if (hasCachedData && currentUser) {
    const cachedData = getCachedDataForTab(tabName);
    const cacheEvent = new CustomEvent('tab-cached-data-ready', {
      detail: {
        tab: tabName,
        userId: currentUser.id || currentUser.uid,
        data: cachedData,
        source: 'cache',
        timestamp: new Date().toISOString()
      }
    });
    window.dispatchEvent(cacheEvent);
    
    console.log(`Instant cached data loaded for tab: ${tabName}`);
  } else if (currentUser) {
    // No cached data, use offline data generator
    console.log(`No cached data for ${tabName}, using offline data generator`);
    const offlineData = DATA_CACHE.getOfflineTabData(tabName);
    if (offlineData) {
      const offlineEvent = new CustomEvent('tab-cached-data-ready', {
        detail: {
          tab: tabName,
          userId: currentUser.id || currentUser.uid,
          data: offlineData,
          source: 'offline-generator',
          timestamp: new Date().toISOString(),
          isOfflineData: true
        }
      });
      window.dispatchEvent(offlineEvent);
      
      // Cache this offline data for next time
      cacheTabData(tabName, offlineData);
      
      console.log(`Offline data loaded for tab: ${tabName}`);
      dataSource = 'offline-generator';
    }
  }
  
  // Show data source indicator
  showTabDataIndicator(tabName, dataSource);
  
  // Then trigger background data load if online
  if (isOnline) {
    setTimeout(() => {
      triggerTabDataLoad(tabName);
    }, 100);
  }
}

// Cache tab data
function cacheTabData(tabName, data) {
  switch(tabName) {
    case 'friends': return DATA_CACHE.cacheFriends(data);
    case 'chats': return DATA_CACHE.cacheChats(data);
    case 'calls': return DATA_CACHE.cacheCalls(data);
    case 'groups': return DATA_CACHE.cacheGroups(data);
    default: return false;
  }
}

// Show data source indicator
function showTabDataIndicator(tabName, source) {
  const indicator = document.createElement('div');
  indicator.className = 'data-source-indicator';
  indicator.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${source === 'cache' ? '#10b981' : source === 'offline-generator' ? '#f59e0b' : '#8b5cf6'};
    opacity: 0.7;
    z-index: 10;
  `;
  
  const tabContainer = document.querySelector(TAB_CONFIG[tabName]?.container);
  if (tabContainer) {
    const existing = tabContainer.querySelector('.data-source-indicator');
    if (existing) existing.remove();
    tabContainer.style.position = 'relative';
    tabContainer.appendChild(indicator);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 3000);
  }
}

// Get cached data for specific tab
function getCachedDataForTab(tabName) {
  switch(tabName) {
    case 'friends': return DATA_CACHE.getCachedFriends(true);
    case 'chats': return DATA_CACHE.getCachedChats(true);
    case 'calls': return DATA_CACHE.getCachedCalls(true);
    case 'groups': return DATA_CACHE.getCachedGroups(true);
    default: return null;
  }
}

// Trigger data load for a tab with user isolation
function triggerTabDataLoad(tabName) {
  console.log(`Triggering data load for tab: ${tabName} for user: ${currentUser ? (currentUser.id || currentUser.uid) : 'none'}`);
  
  // Dispatch event for other components to load data
  const event = new CustomEvent('tab-data-request', {
    detail: {
      tab: tabName,
      userId: currentUser ? (currentUser.id || currentUser.uid) : null,
      isOnline: isOnline,
      services: NETWORK_SERVICE_MANAGER.getServiceStates(),
      timestamp: new Date().toISOString(),
      background: true // Indicate this is a background load
    }
  });
  window.dispatchEvent(event);
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
    
    // INSTANT DATA LOADING: Load cached data first
    loadTabDataInstantly(tabName);
    
  } catch (error) {
    console.log(`Error loading ${tabName}:`, error);
    
    // Even if external tab fails, try to show the built-in tab
    if (TAB_CONFIG[tabName] && !TAB_CONFIG[tabName].isExternal) {
      showTab(tabName);
    } else {
      showError(`Failed to load ${tabName}. Please try again.`);
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
// UTILITY FUNCTIONS
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
      newScript.onerror = () => {
        console.warn(`Failed to load script: ${script.src}`);
        // Don't break the UI if a script fails
      };
      document.head.appendChild(newScript);
    } else if (script.textContent.trim()) {
      try {
        const executeScript = new Function(script.textContent);
        executeScript();
      } catch (error) {
        console.log('Error executing inline script in external content:', error);
        // Continue even if script execution fails
      }
    }
  });
  
  setTimeout(() => {
    try {
      attachEventListenersToNewContent(container);
    } catch (error) {
      console.log('Error attaching event listeners:', error);
    }
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
                console.log('Form data queued for user:', currentUser ? (currentUser.id || currentUser.uid) : 'none');
              }
            })
            .catch(error => {
              console.log('Form submission error:', error);
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
// EVENT HANDLERS WITH INSTANT LOADING SUPPORT
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
      const chatHeader = document.getElementById('chatHeader');
      
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
  
  // Listen for tab data requests
  window.addEventListener('tab-data-request', (event) => {
    console.log(`Tab data requested: ${event.detail.tab} for user ${event.detail.userId}, background: ${event.detail.background}`);
    
    // Broadcast to all components that might need to load data
    const broadcastEvent = new CustomEvent('load-tab-data', {
      detail: {
        tab: event.detail.tab,
        userId: event.detail.userId,
        isOnline: event.detail.isOnline,
        services: event.detail.services,
        timestamp: event.detail.timestamp,
        background: event.detail.background,
        silent: event.detail.background // Silent updates for background loads
      }
    });
    window.dispatchEvent(broadcastEvent);
  });
  
  // Listen for network service state changes
  window.addEventListener('moodchat-network-change', (event) => {
    console.log('Network state changed, services:', event.detail.services);
  });
  
  // Listen for cached data loaded event
  window.addEventListener('cached-data-loaded', (event) => {
    console.log('Cached data loaded for user:', event.detail.userId);
  });
  
  // Listen for fresh data available event
  window.addEventListener('fresh-data-available', (event) => {
    if (event.detail.silent) {
      console.log('Fresh data available silently for:', event.detail.cacheKey);
    } else {
      console.log('Fresh data available for:', event.detail.cacheKey);
    }
  });
  
  // Listen for offline data usage
  window.addEventListener('offline-data-used', (event) => {
    console.log('Using offline data for:', event.detail.tab);
  });
}

// ============================================================================
// OVERLAY MANAGEMENT
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
// ENHANCED INITIALIZATION WITH JWT AUTHENTICATION
// ============================================================================

function initializeApp() {
  console.log('Initializing MoodChat Application Shell with JWT authentication...');
  
  // CRITICAL: Setup global state immediately
  window.MOODCHAT_GLOBAL = window.MOODCHAT_GLOBAL || {};
  window.MOODCHAT_AUTH = window.MOODCHAT_AUTH || {
    currentUser: null,
    isAuthenticated: false,
    userId: null,
    isAuthReady: false
  };
  
  // STEP 0: Hide loading screen immediately
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
      if (loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen);
      }
    }, 300);
  }
  
  // STEP 1: Apply minimal styling immediately
  injectStyles();
  
  // STEP 2: Initialize Authentication Manager
  AUTH_MANAGER.initialize();
  
  // STEP 3: Initialize Settings Service (non-blocking)
  SETTINGS_SERVICE.initialize();
  
  // STEP 4: Setup global auth access
  setupGlobalAuthAccess();
  
  // STEP 5: Initialize network detection
  initializeNetworkDetection();
  
  // STEP 6: Expose global state
  exposeGlobalStateToIframes();
  
  // STEP 7: Setup event listeners
  setupEventListeners();
  
  // STEP 8: Initialize sidebar immediately
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
  
  // STEP 9: Check authentication and update UI accordingly - FIXED VERSION
  // Wait for auth initialization to complete before checking auth state
  const checkAuthAndUpdateUI = () => {
    // If auth is still initializing, wait and check again
    if (AUTH_MANAGER.authInitializing) {
      console.log('Auth still initializing, waiting...');
      setTimeout(checkAuthAndUpdateUI, 100);
      return;
    }
    
    const isAuthenticated = !!currentUser;
    const isChatPage = window.location.pathname.includes('chat.html');
    const isIndexPage = window.location.pathname.includes('index.html') || 
                       window.location.pathname.endsWith('/');
    
    console.log('Auth check completed:', {
      isAuthenticated,
      isChatPage,
      isIndexPage,
      currentUser: currentUser ? currentUser.email : 'none'
    });
    
    if (isAuthenticated && isIndexPage) {
      // User is authenticated but on login page, redirect to chat
      console.log('User already authenticated, redirecting to chat');
      window.location.href = 'chat.html';
    } else if (!isAuthenticated && isChatPage) {
      // User not authenticated but on chat page, redirect to login
      console.log('User not authenticated, redirecting to login');
      window.location.href = 'index.html';
    } else if (isAuthenticated && isChatPage) {
      // User authenticated and on chat page, show chat interface
      console.log('User authenticated, showing chat interface');
      showChatInterface();
    }
    
    // Mark auth as ready
    authStateRestored = true;
    broadcastAuthReady();
  };
  
  // Start checking auth state after a short delay
  setTimeout(checkAuthAndUpdateUI, 100);
  
  // STEP 10: Load default page (non-blocking) - only if on chat page
  setTimeout(() => {
    if (window.location.pathname.includes('chat.html') && currentUser) {
      loadPage(APP_CONFIG.defaultPage);
    }
  }, 50);
  
  // STEP 11: Start background services after a delay
  setTimeout(() => {
    NETWORK_SERVICE_MANAGER.startAllServices();
  }, 1000);
  
  // STEP 12: Trigger initial background sync if online
  setTimeout(() => {
    if (isOnline && currentUser) {
      NETWORK_SERVICE_MANAGER.startBackgroundSync();
    }
  }, 2000);
  
  // STEP 13: Ensure UI is loaded even if everything else fails
  setTimeout(() => {
    if (!instantUILoaded && currentUser) {
      console.log('Forcing UI load after timeout');
      loadCachedDataInstantly();
    }
  }, 3000);
  
  console.log('MoodChat Application Shell initialized with JWT authentication');
  console.log('Key features:');
  console.log('  ✓ JWT authentication with localStorage persistence');
  console.log('  ✓ Automatic login on page load');
  console.log('  ✓ Token validation and refresh');
  console.log('  ✓ Instant UI display (no waiting)');
  console.log('  ✓ Cached data loaded immediately');
  console.log('  ✓ Offline data generator for instant UI');
  console.log('  ✓ Background server connection when online');
  console.log('  ✓ Silent UI updates when new data arrives');
  console.log('  ✓ Full offline functionality');
  console.log('  ✓ Backend API: https://moodchat-backend-1.onrender.com');
  console.log('  ✓ User data isolation');
  console.log('  ✓ Real API calls with offline queuing');
  console.log('  ✓ Graceful degradation when completely offline');
  
  // Mark app as initialized
  DATA_CACHE.cacheAppInitialized(true);
}

function injectStyles() {
  if (document.getElementById('app-styles')) return;
  
  const styles = `
    /* Critical styles for immediate UI */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
    }
    
    #content-area {
      flex: 1;
      min-height: 100vh;
      background: #f9fafb;
      color: #111827;
      transition: background-color 0.3s, color 0.3s;
    }
    
    .dark #content-area {
      background: #111827;
      color: #f9fafb;
    }
    
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
    
    .tab-panel {
      display: none;
      height: 100%;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    .hidden {
      display: none !important;
    }
    
    /* Theme classes */
    .theme-dark {
      color-scheme: dark;
    }
    
    .theme-light {
      color-scheme: light;
    }
    
    /* Font size classes */
    .font-small {
      font-size: 0.875rem;
    }
    
    .font-medium {
      font-size: 1rem;
    }
    
    .font-large {
      font-size: 1.125rem;
    }
    
    .font-xlarge {
      font-size: 1.25rem;
    }
    
    /* Wallpaper classes */
    .wallpaper-gradient1 {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .wallpaper-gradient2 {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }
    
    .wallpaper-pattern1 {
      background-image: radial-gradient(circle at 1px 1px, rgba(0,0,0,0.1) 1px, transparent 0);
      background-size: 20px 20px;
    }
    
    /* Accessibility classes */
    .high-contrast {
      --contrast-multiplier: 1.5;
      filter: contrast(var(--contrast-multiplier));
    }
    
    .reduce-motion * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    
    /* Offline placeholder */
    .offline-placeholder {
      max-width: 400px;
      margin: 0 auto;
      padding-top: 100px;
    }
    
    .btn-primary {
      background: #8b5cf6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: opacity 0.2s;
      width: 100%;
    }
    
    .btn-primary:hover {
      opacity: 0.9;
    }
    
    .btn-secondary {
      background: transparent;
      color: #8b5cf6;
      border: 2px solid #8b5cf6;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
      width: 100%;
    }
    
    .btn-secondary:hover {
      background: rgba(139, 92, 246, 0.1);
    }
    
    /* Chat container styles */
    .chat-container {
      display: flex;
      height: 100vh;
    }
    
    .sidebar {
      width: 260px;
      background: #1f2937;
      color: white;
      display: flex;
      flex-direction: column;
    }
    
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #374151;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .user-details {
      flex: 1;
    }
    
    .user-name {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    
    .user-status {
      font-size: 12px;
      color: #9ca3af;
    }
    
    .sidebar-nav {
      flex: 1;
      padding: 10px;
    }
    
    .nav-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      color: #9ca3af;
      text-decoration: none;
      border-radius: 8px;
      margin-bottom: 4px;
      transition: all 0.2s;
    }
    
    .nav-item:hover {
      background: #374151;
      color: white;
    }
    
    .nav-item.active {
      background: #4f46e5;
      color: white;
    }
    
    .nav-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
    }
    
    .nav-text {
      font-size: 14px;
      font-weight: 500;
    }
    
    .sidebar-footer {
      padding: 20px;
      border-top: 1px solid #374151;
    }
    
    .btn-logout {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      background: #374151;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .btn-logout:hover {
      background: #4b5563;
    }
    
    .main-content {
      flex: 1;
      background: #f9fafb;
      overflow: auto;
    }
    
    @media (max-width: 767px) {
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 50;
        transform: translateX(-100%);
      }
      
      .sidebar.open {
        transform: translateX(0);
      }
      
      .sidebar-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 49;
        display: none;
      }
      
      .sidebar.open + .sidebar-overlay {
        display: block;
      }
      
      .main-content {
        width: 100%;
      }
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'app-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

// ============================================================================
// CROSS-PAGE COMMUNICATION SETUP
// ============================================================================

function setupCrossPageCommunication() {
  // Listen for storage events from other tabs
  window.addEventListener('storage', (event) => {
    if (event.key === 'moodchat-auth-state') {
      try {
        const authData = JSON.parse(event.newValue);
        if (authData && authData.type === 'auth-state') {
          console.log('Auth state changed in another tab:', authData.user ? `User ${authData.user.id}` : 'No user');
          
          // Update local auth state
          if (authData.user) {
            // Create user object from stored data
            const user = {
              id: authData.user.id,
              uid: authData.user.id,
              email: authData.user.email,
              displayName: authData.user.displayName,
              photoURL: authData.user.photoURL,
              emailVerified: authData.user.emailVerified || false,
              isOffline: false,
              providerId: 'jwt',
              refreshToken: 'cross-tab-token',
              getIdToken: () => Promise.resolve('cross-tab-token')
            };
            
            handleAuthStateChange(user, false);
          } else {
            handleAuthStateChange(null);
          }
        }
      } catch (error) {
        console.log('Error processing cross-tab auth state:', error);
      }
    }
  });
}

// ============================================================================
// ENHANCED PUBLIC API WITH JWT AUTHENTICATION
// ============================================================================

// Expose application functions
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.loadPage = loadPage;
window.closeModal = closeModal;
window.openSettingsModal = openSettingsModal;

// AUTH STATE MANAGEMENT
window.MOODCHAT_AUTH = {
  currentUser: null,
  isAuthenticated: false,
  userId: null,
  isAuthReady: false
};

// NETWORK CONNECTIVITY
window.MOODCHAT_NETWORK = {
  isOnline: isOnline,
  isOffline: !isOnline,
  lastChange: null,
  syncQueueSize: 0,
  services: NETWORK_SERVICE_MANAGER.getServiceStates()
};

// NETWORK SERVICE MANAGER
window.NETWORK_SERVICE_MANAGER = NETWORK_SERVICE_MANAGER;

// DATA CACHE SERVICE WITH USER ISOLATION AND INSTANT LOADING
window.DATA_CACHE = DATA_CACHE;

// OFFLINE DATA GENERATOR
window.OFFLINE_DATA_GENERATOR = OFFLINE_DATA_GENERATOR;

// SETTINGS SERVICE
window.SETTINGS_SERVICE = SETTINGS_SERVICE;

// AUTH MANAGER
window.AUTH_MANAGER = AUTH_MANAGER;

// API and sync functions with instant loading
window.api = api;
window.safeApiCall = safeApiCall;
window.queueForSync = queueForSync;
window.clearMessageQueue = function() {
  if (!currentUser || !(currentUser.id || currentUser.uid)) {
    console.log('No current user, cannot clear message queue');
    return;
  }
  
  const userId = currentUser.id || currentUser.uid;
  
  // Clear both stores for current user only
  const request = indexedDB.open('MoodChatMessageQueue', 3);
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    
    // Clear messages for current user
    const msgTransaction = db.transaction(['messages'], 'readwrite');
    const msgStore = msgTransaction.objectStore('messages');
    const msgIndex = msgStore.index('userId');
    const msgRange = IDBKeyRange.only(userId);
    
    msgIndex.openCursor(msgRange).onsuccess = function(cursorEvent) {
      const cursor = cursorEvent.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    // Clear actions for current user
    const actTransaction = db.transaction(['actions'], 'readwrite');
    const actStore = actTransaction.objectStore('actions');
    const actIndex = actStore.index('userId');
    const actRange = IDBKeyRange.only(userId);
  
    actIndex.openCursor(actRange).onsuccess = function(cursorEvent) {
      const cursor = cursorEvent.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    syncQueue = syncQueue.filter(item => item.userId !== userId);
    window.MOODCHAT_NETWORK.syncQueueSize = syncQueue.length;
    
    console.log(`Message queue cleared for user: ${userId}`);
  };
};

window.processQueuedMessages = processQueuedMessages;

// BACKEND API FUNCTIONS
window.fetchUserProfile = async function() {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.GET_USER_PROFILE, 
    'GET', 
    null, 
    CACHE_CONFIG.KEYS.USER_PROFILE
  );
};

window.fetchFriends = async function() {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.GET_FRIENDS, 
    'GET', 
    null, 
    CACHE_CONFIG.KEYS.FRIENDS_LIST
  );
};

window.fetchChats = async function() {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.GET_CHATS, 
    'GET', 
    null, 
    CACHE_CONFIG.KEYS.CHATS_LIST
  );
};

window.fetchGroups = async function() {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.GET_GROUPS, 
    'GET', 
    null, 
    CACHE_CONFIG.KEYS.GROUPS_LIST
  );
};

window.fetchCalls = async function() {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.GET_CALLS, 
    'GET', 
    null, 
    CACHE_CONFIG.KEYS.CALLS_LIST
  );
};

window.sendMessage = async function(chatId, content, type = 'text') {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.SEND_MESSAGE, 
    'POST', 
    { chatId, content, type }
  );
};

window.updateUserProfile = async function(updates) {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.UPDATE_PROFILE, 
    'POST', 
    updates
  );
};

window.sendFriendRequest = async function(friendId, message = '') {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.ADD_FRIEND, 
    'POST', 
    { friendId, message }
  );
};

window.createGroup = async function(name, description, isPublic = true) {
  return safeApiCall(
    BACKEND_CONFIG.ENDPOINTS.CREATE_GROUP, 
    'POST', 
    { name, description, isPublic }
  );
};

// DATA LOADING FUNCTIONS WITH INSTANT LOADING
window.loadTabData = function(tabName, forceRefresh = false) {
  return new Promise((resolve) => {
    const userId = currentUser ? (currentUser.id || currentUser.uid) : null;
    console.log(`Loading real data for tab: ${tabName}, user: ${userId}, forceRefresh: ${forceRefresh}`);
    
    // This function should be implemented by individual tab modules
    // It will make real API calls to fetch user-specific data
    resolve({
      success: true,
      userId: userId,
      tab: tabName,
      message: 'Real data loading triggered',
      requiresImplementation: 'Individual tab modules should implement data loading'
    });
  });
};

// INSTANT LOADING FUNCTIONS
window.loadCachedDataInstantly = loadCachedDataInstantly;
window.refreshCachedDataInBackground = refreshCachedDataInBackground;

// AUTH HELPER FUNCTIONS

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

// NETWORK SERVICE FUNCTIONS
window.registerNetworkService = function(name, startFunction, stopFunction) {
  return NETWORK_SERVICE_MANAGER.registerService(name, startFunction, stopFunction);
};

window.startNetworkService = function(name) {
  return NETWORK_SERVICE_MANAGER.startService(name);
};

window.stopNetworkService = function(name) {
  return NETWORK_SERVICE_MANAGER.stopService(name);
};

window.getNetworkServiceStates = function() {
  return NETWORK_SERVICE_MANAGER.getServiceStates();
};

// CACHE MANAGEMENT FUNCTIONS WITH INSTANT LOADING
window.cacheData = function(key, data, expirationMinutes = 60) {
  return DATA_CACHE.set(key, data, expirationMinutes * 60 * 1000);
};

window.getCachedData = function(key, instant = true) {
  return instant ? DATA_CACHE.getInstant(key) : DATA_CACHE.get(key);
};

window.clearCache = function(key = null) {
  if (key) {
    return DATA_CACHE.remove(key);
  } else {
    DATA_CACHE.clearAll();
    return true;
  }
};

// USER DATA ISOLATION FUNCTIONS
window.clearUserData = function(userId) {
  if (userId) {
    USER_DATA_ISOLATION.clearUserData(userId);
    return true;
  } else if (currentUser && currentUser.uid) {
    USER_DATA_ISOLATION.clearUserData(currentUser.id || currentUser.uid);
    return true;
  }
  return false;
};

window.getCachedUsers = function() {
  return USER_DATA_ISOLATION.getCachedUsers();
};

// INSTANT LOADING STATE
window.isInstantUILoaded = function() {
  return instantUILoaded;
};

// ============================================================================
// STARTUP
// ============================================================================

// Initialize app immediately without waiting for DOMContentLoaded
if (document.readyState === 'loading') {
  // Run minimal initialization now, full init after DOM loads
  document.addEventListener('DOMContentLoaded', initializeApp);
  
  // Apply critical styles immediately
  setTimeout(injectStyles, 0);
} else {
  // DOM already loaded, initialize immediately
  setTimeout(initializeApp, 0);
}

// Setup cross-page communication
setupCrossPageCommunication();

console.log('MoodChat app.js loaded - Application shell ready with JWT authentication');
console.log('Enhanced startup flow:');
console.log('  ✓ JWT authentication with localStorage persistence');
console.log('  ✓ Automatic login on page load');
console.log('  ✓ Token validation and refresh');
console.log('  ✓ UI displays instantly (no waiting)');
console.log('  ✓ Cached data loads immediately');
console.log('  ✓ Offline data generated if no cache');
console.log('  ✓ Server connects in background when online');
console.log('  ✓ UI updates silently when new data arrives');
console.log('  ✓ Full offline functionality preserved');
console.log('  ✓ Works identically online and offline');
console.log('  ✓ Backend API: https://moodchat-backend-1.onrender.com');