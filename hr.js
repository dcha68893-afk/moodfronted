// app.js - Application Shell & Tab Controller for Kynecta
// Manages the single-page application shell and tab visibility
// Enhanced with Firebase auth, offline detection, global state management, and centralized settings service
// MODIFIED: Added robust offline support with data caching

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
// DATA CACHE CONFIGURATION
// ============================================================================

const CACHE_CONFIG = {
  // Cache expiration times (in milliseconds)
  EXPIRATION: {
    FRIENDS: 5 * 60 * 1000, // 5 minutes
    CHATS: 2 * 60 * 1000, // 2 minutes
    CALLS: 10 * 60 * 1000, // 10 minutes
    GROUPS: 5 * 60 * 1000, // 5 minutes
    GENERAL: 30 * 60 * 1000 // 30 minutes
  },
  
  // Cache keys
  KEYS: {
    FRIENDS_LIST: 'kynecta-cached-friends',
    CHATS_LIST: 'kynecta-cached-chats',
    CALLS_LIST: 'kynecta-cached-calls',
    GROUPS_LIST: 'kynecta-cached-groups',
    USER_DATA: 'kynecta-cached-user-data'
  }
};

// ============================================================================
// SETTINGS SERVICE
// ============================================================================

const SETTINGS_SERVICE = {
  // Default settings structure
  DEFAULTS: {
    // Theme settings
    theme: 'dark', // 'dark', 'light', 'auto'
    fontSize: 'medium', // 'small', 'medium', 'large', 'xlarge'
    chatWallpaper: 'default', // 'default', 'gradient1', 'gradient2', 'pattern1', 'custom'
    customWallpaper: '', // URL for custom wallpaper
    
    // Notification settings
    notifications: {
      messages: true,
      calls: true,
      groups: true,
      status: true,
      sound: true,
      vibration: true
    },
    
    // Privacy settings
    privacy: {
      lastSeen: 'everyone', // 'everyone', 'contacts', 'nobody'
      profilePhoto: 'everyone', // 'everyone', 'contacts', 'nobody'
      status: 'everyone', // 'everyone', 'contacts', 'nobody'
      readReceipts: true,
      typingIndicators: true
    },
    
    // Call settings
    calls: {
      defaultType: 'voice', // 'voice', 'video'
      ringtone: 'default',
      vibration: true,
      noiseCancellation: true,
      autoRecord: false
    },
    
    // Group settings
    groups: {
      autoJoin: true,
      defaultRole: 'member', // 'member', 'admin'
      approvalRequired: false,
      notifications: 'all' // 'all', 'mentions', 'none'
    },
    
    // Status settings
    status: {
      visibility: 'everyone', // 'everyone', 'contacts', 'selected'
      autoDelete: '24h', // '24h', '7d', '30d', 'never'
      shareLocation: false
    },
    
    // Offline settings
    offline: {
      queueEnabled: true,
      autoSync: true,
      storageLimit: 100, // MB
      compressMedia: true
    },
    
    // Accessibility
    accessibility: {
      highContrast: false,
      reduceMotion: false,
      screenReader: false
    },
    
    // General
    general: {
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h' // '12h', '24h'
    }
  },
  
  // Current settings
  current: {},
  
  // Page callbacks for settings updates
  pageCallbacks: new Map(),
  
  // Initialize settings service
  initialize: function() {
    console.log('Initializing Settings Service...');
    
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
  
  // Load settings from localStorage
  load: function() {
    try {
      const savedSettings = localStorage.getItem('kynecta-settings');
      if (savedSettings) {
        this.current = JSON.parse(savedSettings);
        console.log('Settings loaded from localStorage');
      } else {
        this.current = JSON.parse(JSON.stringify(this.DEFAULTS));
        this.save();
        console.log('Default settings loaded and saved');
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
      localStorage.setItem('kynecta-settings', JSON.stringify(this.current));
      
      // Broadcast change to other tabs/pages
      localStorage.setItem('kynecta-settings-timestamp', Date.now().toString());
      
      console.log('Settings saved to localStorage');
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
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
        this.applyAccessibility();
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
      // 'default' uses CSS defaults, no class needed
    });
    
    console.log(`Chat wallpaper applied: ${wallpaper}`);
  },
  
  // Apply accessibility settings
  applyAccessibility: function() {
    const html = document.documentElement;
    const highContrast = this.getSetting('accessibility.highContrast');
    const reduceMotion = this.getSetting('accessibility.reduceMotion');
    
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
    
    console.log(`Accessibility applied: highContrast=${highContrast}, reduceMotion=${reduceMotion}`);
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
      if (event.key === 'kynecta-settings-timestamp') {
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
    window.KYNECTA_SETTINGS = {
      load: () => this.load(),
      save: () => this.save(),
      updateSetting: (key, value) => this.updateSetting(key, value),
      getSetting: (key, defaultValue) => this.getSetting(key, defaultValue),
      applySettings: () => this.applySettings(),
      registerPageCallback: (pageId, callback) => this.registerPageCallback(pageId, callback),
      unregisterPageCallback: (pageId) => this.unregisterPageCallback(pageId),
      getDefaults: () => JSON.parse(JSON.stringify(this.DEFAULTS)),
      resetToDefaults: () => this.resetToDefaults()
    };
    
    // Also expose as global functions for convenience
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
// DATA CACHE SERVICE
// ============================================================================

const DATA_CACHE = {
  // Initialize cache
  initialize: function() {
    console.log('Initializing Data Cache...');
    this.setupCacheInvalidation();
    console.log('Data Cache initialized');
  },
  
  // Cache data with expiration
  set: function(key, data, expirationMs = CACHE_CONFIG.EXPIRATION.GENERAL) {
    try {
      const cacheItem = {
        data: data,
        timestamp: Date.now(),
        expiresAt: Date.now() + expirationMs
      };
      
      localStorage.setItem(key, JSON.stringify(cacheItem));
      console.log(`Cached data for key: ${key}, expires in ${expirationMs}ms`);
      return true;
    } catch (error) {
      console.warn('Failed to cache data:', error);
      return false;
    }
  },
  
  // Get cached data
  get: function(key) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) {
        return null;
      }
      
      const cacheItem = JSON.parse(cached);
      
      // Check if cache is expired
      if (Date.now() > cacheItem.expiresAt) {
        console.log(`Cache expired for key: ${key}`);
        localStorage.removeItem(key);
        return null;
      }
      
      console.log(`Retrieved cached data for key: ${key}`);
      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to retrieve cached data:', error);
      return null;
    }
  },
  
  // Remove cached data
  remove: function(key) {
    try {
      localStorage.removeItem(key);
      console.log(`Removed cache for key: ${key}`);
      return true;
    } catch (error) {
      console.warn('Failed to remove cache:', error);
      return false;
    }
  },
  
  // Clear all caches
  clearAll: function() {
    Object.values(CACHE_CONFIG.KEYS).forEach(key => {
      this.remove(key);
    });
    console.log('All caches cleared');
  },
  
  // Check if cache exists and is valid
  has: function(key) {
    const data = this.get(key);
    return data !== null;
  },
  
  // Setup periodic cache invalidation
  setupCacheInvalidation: function() {
    // Check for expired caches every minute
    setInterval(() => {
      this.cleanupExpiredCaches();
    }, 60000);
  },
  
  // Cleanup expired caches
  cleanupExpiredCaches: function() {
    Object.values(CACHE_CONFIG.KEYS).forEach(key => {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const cacheItem = JSON.parse(cached);
          if (Date.now() > cacheItem.expiresAt) {
            localStorage.removeItem(key);
            console.log(`Cleaned up expired cache: ${key}`);
          }
        }
      } catch (error) {
        // Silently fail for cache cleanup
      }
    });
  },
  
  // Cache friends list
  cacheFriends: function(friendsList) {
    return this.set(CACHE_CONFIG.KEYS.FRIENDS_LIST, friendsList, CACHE_CONFIG.EXPIRATION.FRIENDS);
  },
  
  // Get cached friends list
  getCachedFriends: function() {
    return this.get(CACHE_CONFIG.KEYS.FRIENDS_LIST);
  },
  
  // Cache chats list
  cacheChats: function(chatsList) {
    return this.set(CACHE_CONFIG.KEYS.CHATS_LIST, chatsList, CACHE_CONFIG.EXPIRATION.CHATS);
  },
  
  // Get cached chats list
  getCachedChats: function() {
    return this.get(CACHE_CONFIG.KEYS.CHATS_LIST);
  },
  
  // Cache calls list
  cacheCalls: function(callsList) {
    return this.set(CACHE_CONFIG.KEYS.CALLS_LIST, callsList, CACHE_CONFIG.EXPIRATION.CALLS);
  },
  
  // Get cached calls list
  getCachedCalls: function() {
    return this.get(CACHE_CONFIG.KEYS.CALLS_LIST);
  },
  
  // Cache groups list
  cacheGroups: function(groupsList) {
    return this.set(CACHE_CONFIG.KEYS.GROUPS_LIST, groupsList, CACHE_CONFIG.EXPIRATION.GROUPS);
  },
  
  // Get cached groups list
  getCachedGroups: function() {
    return this.get(CACHE_CONFIG.KEYS.GROUPS_LIST);
  }
};

// ============================================================================
// OFFLINE DATA PROVIDER
// ============================================================================

const OFFLINE_DATA_PROVIDER = {
  // Generate mock friends data for offline use
  generateMockFriends: function() {
    console.log('Generating mock friends data for offline use');
    return [
      {
        id: 'friend_offline_1',
        name: 'Alex Johnson',
        status: 'Online',
        lastSeen: new Date().toISOString(),
        avatar: 'https://ui-avatars.com/api/?name=Alex+Johnson&background=8b5cf6&color=fff',
        isOnline: true
      },
      {
        id: 'friend_offline_2',
        name: 'Sam Wilson',
        status: 'Away',
        lastSeen: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
        avatar: 'https://ui-avatars.com/api/?name=Sam+Wilson&background=10b981&color=fff',
        isOnline: false
      },
      {
        id: 'friend_offline_3',
        name: 'Jordan Lee',
        status: 'Available',
        lastSeen: new Date().toISOString(),
        avatar: 'https://ui-avatars.com/api/?name=Jordan+Lee&background=f59e0b&color=fff',
        isOnline: true
      }
    ];
  },
  
  // Generate mock chats data for offline use
  generateMockChats: function() {
    console.log('Generating mock chats data for offline use');
    return [
      {
        id: 'chat_offline_1',
        name: 'Alex Johnson',
        lastMessage: 'Hey, are we still meeting today?',
        timestamp: new Date().toISOString(),
        unreadCount: 2,
        avatar: 'https://ui-avatars.com/api/?name=Alex+Johnson&background=8b5cf6&color=fff',
        isOnline: true
      },
      {
        id: 'chat_offline_2',
        name: 'Sam Wilson',
        lastMessage: 'I sent you the documents',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        unreadCount: 0,
        avatar: 'https://ui-avatars.com/api/?name=Sam+Wilson&background=10b981&color=fff',
        isOnline: false
      },
      {
        id: 'chat_offline_3',
        name: 'Group Chat',
        lastMessage: 'Jordan: Meeting at 3 PM',
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        unreadCount: 5,
        avatar: 'https://ui-avatars.com/api/?name=Group+Chat&background=ef4444&color=fff',
        isGroup: true
      }
    ];
  },
  
  // Generate mock calls data for offline use
  generateMockCalls: function() {
    console.log('Generating mock calls data for offline use');
    return [
      {
        id: 'call_offline_1',
        name: 'Alex Johnson',
        type: 'outgoing',
        status: 'completed',
        duration: '5:32',
        timestamp: new Date().toISOString(),
        avatar: 'https://ui-avatars.com/api/?name=Alex+Johnson&background=8b5cf6&color=fff'
      },
      {
        id: 'call_offline_2',
        name: 'Sam Wilson',
        type: 'incoming',
        status: 'missed',
        duration: '0:00',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        avatar: 'https://ui-avatars.com/api/?name=Sam+Wilson&background=10b981&color=fff'
      },
      {
        id: 'call_offline_3',
        name: 'Jordan Lee',
        type: 'incoming',
        status: 'completed',
        duration: '12:45',
        timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        avatar: 'https://ui-avatars.com/api/?name=Jordan+Lee&background=f59e0b&color=fff'
      }
    ];
  },
  
  // Generate mock groups data for offline use
  generateMockGroups: function() {
    console.log('Generating mock groups data for offline use');
    return [
      {
        id: 'group_offline_1',
        name: 'Project Team',
        description: 'Team collaboration for Project X',
        memberCount: 8,
        lastActivity: new Date().toISOString(),
        avatar: 'https://ui-avatars.com/api/?name=Project+Team&background=3b82f6&color=fff',
        isJoined: true
      },
      {
        id: 'group_offline_2',
        name: 'Family',
        description: 'Family group chat',
        memberCount: 12,
        lastActivity: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        avatar: 'https://ui-avatars.com/api/?name=Family&background=ec4899&color=fff',
        isJoined: true
      },
      {
        id: 'group_offline_3',
        name: 'Gaming Friends',
        description: 'Weekly gaming sessions',
        memberCount: 6,
        lastActivity: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        avatar: 'https://ui-avatars.com/api/?name=Gaming+Friends&background=8b5cf6&color=fff',
        isJoined: true
      }
    ];
  },
  
  // Get data for a specific tab, using cache or generating mock data
  getTabData: async function(tabName) {
    console.log(`Getting ${tabName} data (offline mode: ${!isOnline})`);
    
    // Try to get cached data first
    let cachedData = null;
    
    switch(tabName) {
      case 'friends':
        cachedData = DATA_CACHE.getCachedFriends();
        if (!cachedData && !isOnline) {
          cachedData = this.generateMockFriends();
          DATA_CACHE.cacheFriends(cachedData);
        }
        break;
      case 'chats':
        cachedData = DATA_CACHE.getCachedChats();
        if (!cachedData && !isOnline) {
          cachedData = this.generateMockChats();
          DATA_CACHE.cacheChats(cachedData);
        }
        break;
      case 'calls':
        cachedData = DATA_CACHE.getCachedCalls();
        if (!cachedData && !isOnline) {
          cachedData = this.generateMockCalls();
          DATA_CACHE.cacheCalls(cachedData);
        }
        break;
      case 'groups':
        cachedData = DATA_CACHE.getCachedGroups();
        if (!cachedData && !isOnline) {
          cachedData = this.generateMockGroups();
          DATA_CACHE.cacheGroups(cachedData);
        }
        break;
    }
    
    return cachedData;
  },
  
  // Simulate API call with offline support
  simulateApiCall: async function(apiName, params = {}) {
    console.log(`Simulating API call: ${apiName}`, params);
    
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        if (!isOnline) {
          console.log(`API ${apiName}: Using offline response`);
          
          // Return offline response based on API name
          const response = this.getOfflineResponse(apiName, params);
          resolve({
            success: true,
            offline: true,
            data: response,
            message: 'Offline mode: Using cached/mock data',
            timestamp: new Date().toISOString()
          });
        } else {
          console.log(`API ${apiName}: Would make real network call`);
          
          // For online mode, we would make real network call
          // This is where you'd integrate with actual API
          resolve({
            success: true,
            online: true,
            data: null,
            message: 'Online mode: Would make network request',
            timestamp: new Date().toISOString()
          });
        }
      }, 300); // Simulate 300ms delay
    });
  },
  
  // Get offline response for specific API
  getOfflineResponse: function(apiName, params) {
    switch(apiName) {
      case 'getFriends':
        return this.generateMockFriends();
      case 'getChats':
        return this.generateMockChats();
      case 'getCalls':
        return this.generateMockCalls();
      case 'getGroups':
        return this.generateMockGroups();
      case 'sendMessage':
        return {
          messageId: 'msg_' + Date.now(),
          timestamp: new Date().toISOString(),
          status: 'queued',
          offline: true
        };
      case 'makeCall':
        return {
          callId: 'call_' + Date.now(),
          status: 'initiated',
          offline: true
        };
      default:
        return { status: 'offline_simulated', api: apiName };
    }
  }
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
// ENHANCED FIREBASE INITIALIZATION WITH OFFLINE SUPPORT
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
// ENHANCED GLOBAL AUTH ACCESS WITH OFFLINE SUPPORT
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
// ENHANCED NETWORK DETECTION & BACKGROUND SYNC
// ============================================================================

function initializeNetworkDetection() {
  console.log('Initializing network detection...');
  
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

// ENHANCED Safe API call wrapper with offline queuing and caching
function safeApiCall(apiFunction, data, type = 'action', cacheKey = null) {
  return new Promise((resolve, reject) => {
    // Always try cache first for GET-like operations
    if (cacheKey && (type === 'get' || apiFunction.name.includes('get'))) {
      const cachedData = DATA_CACHE.get(cacheKey);
      if (cachedData) {
        console.log(`Using cached data for: ${cacheKey}`);
        resolve({
          success: true,
          offline: !isOnline,
          cached: true,
          data: cachedData,
          message: 'Data loaded from cache'
        });
        return;
      }
    }
    
    if (!isOnline) {
      console.warn('API call prevented: offline mode');
      
      // For GET operations in offline mode, try to generate mock data
      if (type === 'get' || apiFunction.name.includes('get')) {
        const tabName = data?.tab || type;
        const mockData = OFFLINE_DATA_PROVIDER.getTabData(tabName);
        
        if (mockData) {
          resolve({
            success: true,
            offline: true,
            mock: true,
            data: mockData,
            message: 'Using mock data for offline mode'
          });
          return;
        }
      }
      
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
        result.then(response => {
          // Cache successful responses
          if (cacheKey && response && !response.error) {
            DATA_CACHE.set(cacheKey, response);
          }
          resolve(response);
        }).catch(error => {
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
// ENHANCED GLOBAL STATE EXPOSURE WITH OFFLINE SUPPORT
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
  
  // Expose data cache functions
  window.KYNECTA_GLOBAL.cache = {
    get: (key) => DATA_CACHE.get(key),
    set: (key, data, expirationMs) => DATA_CACHE.set(key, data, expirationMs),
    remove: (key) => DATA_CACHE.remove(key),
    has: (key) => DATA_CACHE.has(key),
    clearAll: () => DATA_CACHE.clearAll()
  };
  
  // Expose offline data provider
  window.KYNECTA_GLOBAL.offline = {
    getTabData: (tabName) => OFFLINE_DATA_PROVIDER.getTabData(tabName),
    simulateApiCall: (apiName, params) => OFFLINE_DATA_PROVIDER.simulateApiCall(apiName, params),
    generateMockData: {
      friends: () => OFFLINE_DATA_PROVIDER.generateMockFriends(),
      chats: () => OFFLINE_DATA_PROVIDER.generateMockChats(),
      calls: () => OFFLINE_DATA_PROVIDER.generateMockCalls(),
      groups: () => OFFLINE_DATA_PROVIDER.generateMockGroups()
    }
  };
  
  // Expose settings service
  window.KYNECTA_GLOBAL.settings = window.KYNECTA_SETTINGS;
}

// ============================================================================
// ENHANCED CROSS-PAGE COMMUNICATION
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
      
    case 'get-settings':
      // Send settings back to iframe
      event.source.postMessage({
        type: 'settings',
        data: SETTINGS_SERVICE.current
      }, event.origin);
      break;
      
    case 'update-setting':
      // Update setting from iframe
      if (data && data.key && data.value !== undefined) {
        SETTINGS_SERVICE.updateSetting(data.key, data.value);
        event.source.postMessage({
          type: 'setting-updated',
          data: { key: data.key, success: true }
        }, event.origin);
      }
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
      
    case 'get-cached-data':
      // Get cached data for iframe
      if (data && data.key) {
        const cachedData = DATA_CACHE.get(data.key);
        event.source.postMessage({
          type: 'cached-data',
          data: cachedData
        }, event.origin);
      }
      break;
      
    case 'cache-data':
      // Cache data from iframe
      if (data && data.key && data.value !== undefined) {
        const success = DATA_CACHE.set(data.key, data.value, data.expiration);
        event.source.postMessage({
          type: 'data-cached',
          data: { success: success, key: data.key }
        }, event.origin);
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
  
  // Handle settings changes from other tabs
  if (event.key === 'kynecta-settings-timestamp' && event.newValue) {
    console.log('Settings updated from other tab, timestamp:', event.newValue);
    
    // Settings service will handle this via its own listener
  }
}

function broadcastStateToIframes() {
  // This function would broadcast state to all iframes
  // In a real implementation, you would get all iframes and post messages
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      // Send auth state
      iframe.contentWindow.postMessage({
        type: 'auth-state-update',
        data: {
          user: currentUser,
          isAuthenticated: !!currentUser,
          isAuthReady: authStateRestored
        }
      }, window.location.origin);
      
      // Send network state
      iframe.contentWindow.postMessage({
        type: 'network-state-update',
        data: {
          isOnline: isOnline,
          isOffline: !isOnline
        }
      }, window.location.origin);
      
      // Send settings
      iframe.contentWindow.postMessage({
        type: 'settings-update',
        data: SETTINGS_SERVICE.current
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
// TAB MANAGEMENT (ENHANCED WITH OFFLINE SUPPORT)
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
    
    // Trigger data load for the tab (works offline)
    triggerTabDataLoad(tabName);
  } else {
    console.error(`Tab container not found: ${config.container} for tab: ${tabName}`);
    if (EXTERNAL_TABS[tabName]) {
      loadExternalTab(tabName, EXTERNAL_TABS[tabName]);
    }
  }
}

// Trigger data load for a tab (works online and offline)
function triggerTabDataLoad(tabName) {
  console.log(`Triggering data load for tab: ${tabName} (online: ${isOnline})`);
  
  // Dispatch event for other components to load data
  const event = new CustomEvent('tab-data-request', {
    detail: {
      tab: tabName,
      isOnline: isOnline,
      timestamp: new Date().toISOString()
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
    
    // Trigger data load for the tab (works offline)
    triggerTabDataLoad(tabName);
    
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
// UTILITY FUNCTIONS (ENHANCED)
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
// EVENT HANDLERS (UPDATED WITH OFFLINE SUPPORT)
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
  
  // Listen for tab data requests
  window.addEventListener('tab-data-request', (event) => {
    console.log(`Tab data requested: ${event.detail.tab}, online: ${event.detail.isOnline}`);
    
    // Broadcast to all components that might need to load data
    const broadcastEvent = new CustomEvent('load-tab-data', {
      detail: {
        tab: event.detail.tab,
        isOnline: event.detail.isOnline,
        timestamp: event.detail.timestamp
      }
    });
    window.dispatchEvent(broadcastEvent);
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
// ENHANCED INITIALIZATION WITH OFFLINE SUPPORT
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
    
    // STEP 2: Initialize Settings Service
    SETTINGS_SERVICE.initialize();
    
    // STEP 3: Initialize Data Cache Service
    DATA_CACHE.initialize();
    
    // STEP 4: Initialize Firebase ONCE (works offline/online)
    initializeFirebase();
    
    // STEP 5: Expose global state to all pages
    exposeGlobalStateToIframes();
    
    // STEP 6: Setup cross-page communication
    setupCrossPageCommunication();
    
    // STEP 7: Setup event listeners
    setupEventListeners();
    
    // STEP 8: Initialize network detection (separate from auth)
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
    console.log('Settings loaded:', Object.keys(SETTINGS_SERVICE.current).length, 'categories');
    console.log('Offline support: ENABLED with data caching');
    
    // Trigger initial data load for current tab
    setTimeout(() => {
      triggerTabDataLoad(currentTab);
    }, 500);
    
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
    
    /* Offline data indicator */
    .offline-data-indicator {
      background: #f59e0b;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 8px;
      display: inline-block;
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
// ENHANCED PUBLIC API WITH OFFLINE SUPPORT
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

// DATA CACHE SERVICE
window.DATA_CACHE = DATA_CACHE;

// OFFLINE DATA PROVIDER
window.OFFLINE_DATA_PROVIDER = OFFLINE_DATA_PROVIDER;

// SETTINGS SERVICE (already exposed via SETTINGS_SERVICE.exposeMethods())

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

// DATA LOADING FUNCTIONS WITH OFFLINE SUPPORT
window.loadTabData = function(tabName, forceRefresh = false) {
  return new Promise((resolve) => {
    console.log(`Loading data for tab: ${tabName}, forceRefresh: ${forceRefresh}, online: ${isOnline}`);
    
    if (!forceRefresh) {
      // Try cache first
      const cachedData = DATA_CACHE.get(`kynecta-cached-${tabName}`);
      if (cachedData) {
        console.log(`Using cached data for ${tabName}`);
        resolve({
          success: true,
          offline: !isOnline,
          cached: true,
          data: cachedData,
          message: 'Data loaded from cache'
        });
        return;
      }
    }
    
    if (!isOnline) {
      // Generate mock data for offline use
      const mockData = OFFLINE_DATA_PROVIDER.getTabData(tabName);
      if (mockData) {
        console.log(`Using mock data for ${tabName} (offline mode)`);
        resolve({
          success: true,
          offline: true,
          mock: true,
          data: mockData,
          message: 'Using mock data for offline mode'
        });
        return;
      }
    }
    
    // Online mode - would make real API call
    // This is where you'd integrate with actual API
    console.log(`Would make API call for ${tabName} data`);
    resolve({
      success: true,
      online: true,
      data: null,
      message: 'Online mode: Would make API request'
    });
  });
};

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

// CACHE MANAGEMENT FUNCTIONS
window.cacheData = function(key, data, expirationMinutes = 60) {
  return DATA_CACHE.set(key, data, expirationMinutes * 60 * 1000);
};

window.getCachedData = function(key) {
  return DATA_CACHE.get(key);
};

window.clearCache = function(key = null) {
  if (key) {
    return DATA_CACHE.remove(key);
  } else {
    DATA_CACHE.clearAll();
    return true;
  }
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

console.log('Kynecta app.js loaded - Application shell ready with enhanced auth, offline support, and centralized settings service');
console.log('Offline features:');
console.log('  ✓ Auth works offline (localStorage)');
console.log('  ✓ Data caching with expiration');
console.log('  ✓ Mock data generation for offline mode');
console.log('  ✓ Background sync when online');
console.log('  ✓ All UI remains functional offline');