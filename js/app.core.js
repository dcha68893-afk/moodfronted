// app.core.js - Nexopa Core Services & Bootstrapping - ENHANCED VERSION
// UPDATED: Enhanced application bootstrap with proper coordination
// UPDATED: Improved session state coordination with event-driven architecture
// UPDATED: Robust UI orchestration with failure recovery
// UPDATED: Advanced iframe/page coordination with bidirectional communication
// UPDATED: Comprehensive error handling with graceful degradation
// UPDATED: Maintains backward compatibility with all existing features
// UPDATED: Modular API integration (api.auth.js, api.core.js, api.request.js)
// FIXED: Console error interception now safely prevents infinite recursion
// UPDATED: Global namespace governance with deterministic registration
// UPDATED: Core module registration with single-instantiation guarantee
// UPDATED: Dependency resolution integrity preservation
// UPDATED: API layer coordination with readiness synchronization
// UPDATED: Application lifecycle control with explicit phase management
// UPDATED: State management authority with canonical state preservation
// UPDATED: Event bus stewardship with subscription discipline
// UPDATED: Failure containment with subsystem isolation
// UPDATED: Performance governance with benchmark preservation
// UPDATED: Backward compatibility assurance with no breaking changes

(function () {
  // ============================================================================
  // GLOBAL NAMESPACE GOVERNANCE - PHASE 1: DEFENSIVE NAMESPACE ESTABLISHMENT
  // ============================================================================
  
  // Create safe shims for undefined variables
  function ensureGlobalDependencies() {
    console.log('🔍 Ensuring global dependencies...');
    
    // GLOBAL NAMESPACE GOVERNANCE: Ensure window.app exists and is properly structured
    // This must happen BEFORE any other dependency checks to establish namespace authority
    if (typeof window.app === 'undefined') {
      console.log('⚠️ window.app not defined, creating defensive namespace container');
      window.app = {
        // Core application state - to be populated by app.core registration
        _namespaceInitialized: false,
        _coreRegistered: false,
        _pendingRegistrations: [],
        _dependencyGraph: {},
        
        // Namespace protection utilities
        _protectNamespace: function(namespace, defaultValue) {
          const parts = namespace.split('.');
          let current = window;
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
              // Final property - set if undefined
              if (typeof current[part] === 'undefined') {
                current[part] = defaultValue || {};
              }
            } else {
              // Intermediate property - create if undefined
              if (typeof current[part] === 'undefined') {
                current[part] = {};
              }
              current = current[part];
            }
          }
        },
        
        // Deferred registration queue
        _deferRegistration: function(namespace, factory) {
          this._pendingRegistrations.push({ namespace: namespace, factory: factory });
        },
        
        // Process deferred registrations
        _processPendingRegistrations: function() {
          console.log(`📝 Processing ${this._pendingRegistrations.length} pending namespace registrations`);
          this._pendingRegistrations.forEach(registration => {
            try {
              this._protectNamespace(registration.namespace, registration.factory());
              console.log(`✅ Deferred registration completed: ${registration.namespace}`);
            } catch (error) {
              console.error(`❌ Deferred registration failed for ${registration.namespace}:`, error);
            }
          });
          this._pendingRegistrations = [];
        },
        
        // Namespace initialization marker
        _markNamespaceInitialized: function() {
          this._namespaceInitialized = true;
          this._processPendingRegistrations();
        }
      };
      
      console.log('✅ Defensive namespace container created');
    } else {
      // Ensure existing app structure has required properties
      if (typeof window.app._namespaceInitialized === 'undefined') {
        window.app._namespaceInitialized = false;
      }
      if (typeof window.app._coreRegistered === 'undefined') {
        window.app._coreRegistered = false;
      }
      if (typeof window.app._pendingRegistrations === 'undefined') {
        window.app._pendingRegistrations = [];
      }
      if (typeof window.app._dependencyGraph === 'undefined') {
        window.app._dependencyGraph = {};
      }
      
      console.log('✅ Existing namespace container validated');
    }
    
    // AUTH_STATE shim if not defined
    if (typeof AUTH_STATE === 'undefined') {
      console.log('⚠️ AUTH_STATE not defined, creating safe shim');
      window.AUTH_STATE = {
        hasToken: function() {
          const token = localStorage.getItem('accessToken') || localStorage.getItem('nexopa_jwt_token');
          return !!token;
        },
        getToken: function() {
          return localStorage.getItem('accessToken') || localStorage.getItem('nexopa_jwt_token');
        },
        getUser: function() {
          try {
            const userStr = localStorage.getItem('nexopa_user') || sessionStorage.getItem('nexopa_user');
            return userStr ? JSON.parse(userStr) : null;
          } catch (e) {
            return null;
          }
        },
        isAuthenticated: function() {
          const token = this.getToken();
          if (!token) return false;
          
          // Simple token validation
          try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp && payload.exp < Date.now() / 1000) {
              return false;
            }
            return true;
          } catch (e) {
            return false;
          }
        },
        setAuthState: function(user, token) {
          if (token) {
            localStorage.setItem('accessToken', token);
            localStorage.setItem('nexopa_jwt_token', token);
          }
          if (user) {
            localStorage.setItem('nexopa_user', JSON.stringify(user));
          }
        },
        clearAuthState: function() {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('nexopa_jwt_token');
          localStorage.removeItem('nexopa_user');
          localStorage.removeItem('tokenExpiresAt');
          localStorage.removeItem('nexopa-auth-state');
          sessionStorage.removeItem('nexopa_user');
        },
        _tokenExpiry: null
      };
    }
    
    // API_COORDINATION shim if not defined
    if (typeof API_COORDINATION === 'undefined') {
      console.log('⚠️ API_COORDINATION not defined, creating safe shim');
      window.API_COORDINATION = {
        isApiAvailable: function() {
          // Check for modular API
          return typeof window.api !== 'undefined' || 
                 (window.api && window.api.core && window.api.auth && window.api.request) ||
                 window.__NEXOPA_API_READY === true;
        },
        waitForApi: function() {
          return new Promise((resolve) => {
            if (this.isApiAvailable()) {
              resolve(true);
              return;
            }
            
            // Poll for modular API
            const checkInterval = setInterval(() => {
              if (this.isApiAvailable()) {
                clearInterval(checkInterval);
                resolve(true);
              }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve(false);
            }, 10000);
          });
        },
        getNetworkStatus: function() {
          return navigator.onLine ? 'online' : 'offline';
        },
        safeApiCall: function(endpoint, options) {
          return new Promise(async (resolve) => {
            if (!navigator.onLine) {
              resolve({ success: false, message: 'Network offline' });
              return;
            }
            
            // Use modular API if available
            if (window.api && window.api.request && window.api.request.secureFetch) {
              try {
                const response = await window.api.request.secureFetch(endpoint, options);
                resolve({ success: true, data: response });
              } catch (error) {
                resolve({ success: false, message: error.message });
              }
            } else if (window.api && window.api.request && window.api.request.fetch) {
              // Fallback to regular fetch
              try {
                const response = await window.api.request.fetch(endpoint, options);
                resolve({ success: true, data: response });
              } catch (error) {
                resolve({ success: false, message: error.message });
              }
            } else {
              // Fallback to direct fetch — build absolute URL so it hits the backend, not the static frontend
              const _apiBase = (typeof window.__getApiBase === 'function' ? window.__getApiBase() : null)
                || (typeof window.__getApiOrigin === 'function' ? window.__getApiOrigin() + '/api' : null)
                || 'https://nexora-3bla.onrender.com/api';
              const _absEndpoint = endpoint.startsWith('http') ? endpoint : _apiBase + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
              fetch(_absEndpoint, options)
                .then(response => response.json())
                .then(data => resolve({ success: true, data }))
                .catch(error => resolve({ success: false, message: error.message }));
            }
          });
        },
        checkAuthMe: function() {
          return new Promise(async (resolve) => {
            // Use modular API if available
            if (window.api && window.api.auth && window.api.auth.getUser) {
              try {
                const user = await window.api.auth.getUser();
                if (user) {
                  resolve({ 
                    valid: true, 
                    user: user,
                    validated: true 
                  });
                } else {
                  resolve({ 
                    valid: false, 
                    reason: 'No user found' 
                  });
                }
              } catch (error) {
                resolve({ 
                  valid: false, 
                  reason: error.message || 'Auth check failed' 
                });
              }
            } else {
              // Fallback to token validation
              const token = AUTH_STATE.getToken();
              if (!token) {
                resolve({ valid: false, reason: 'No token found' });
                return;
              }
              
              this.safeApiCall('/auth/me', {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              }).then(response => {
                if (response.success && response.data) {
                  resolve({ 
                    valid: true, 
                    user: response.data,
                    validated: true 
                  });
                } else {
                  resolve({ 
                    valid: false, 
                    reason: response.message || 'Auth check failed' 
                  });
                }
              }).catch(() => {
                resolve({ valid: false, reason: 'Auth check request failed' });
              });
            }
          });
        }
      };
    }
    
    // TOKEN_VALIDATION shim if not defined
    if (typeof TOKEN_VALIDATION === 'undefined') {
      console.log('⚠️ TOKEN_VALIDATION not defined, creating safe shim');
      window.TOKEN_VALIDATION = {
        validateWithBackend: function() {
          return new Promise((resolve) => {
            const token = AUTH_STATE.getToken();
            if (!token) {
              resolve({ valid: false, reason: 'No token found' });
              return;
            }
            
            API_COORDINATION.safeApiCall('/auth/validate', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }).then(response => {
              if (response.success && response.data && response.data.valid) {
                resolve({ 
                  valid: true, 
                  user: response.data.user 
                });
              } else {
                resolve({ 
                  valid: false, 
                  reason: response.message || 'Validation failed' 
                });
              }
            }).catch(() => {
              // Fallback to client-side validation
              try {
                const parts = token.split('.');
                if (parts.length !== 3) {
                  resolve({ valid: false, reason: 'Invalid token format' });
                  return;
                }
                
                const payload = JSON.parse(atob(parts[1]));
                if (payload.exp && payload.exp < Date.now() / 1000) {
                  resolve({ valid: false, reason: 'Token expired' });
                  return;
                }
                
                resolve({
                  valid: true,
                  user: {
                    id: payload.sub || payload.userId || 'unknown',
                    email: payload.email || 'user@example.com',
                    name: payload.name || 'User'
                  }
                });
              } catch (e) {
                resolve({ valid: false, reason: 'Token validation error' });
              }
            });
          });
        },
        refreshToken: function() {
          return new Promise((resolve) => {
            const token = AUTH_STATE.getToken();
            if (!token) {
              resolve({ success: false, reason: 'No token to refresh' });
              return;
            }
            
            API_COORDINATION.safeApiCall('/auth/refresh', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }).then(response => {
              if (response.success && response.data && response.data.token) {
                // Update token
                AUTH_STATE.setAuthState(null, response.data.token);
                resolve({ success: true, token: response.data.token });
              } else {
                resolve({ success: false, reason: response.message || 'Refresh failed' });
              }
            }).catch(() => {
              resolve({ success: false, reason: 'Refresh request failed' });
            });
          });
        }
      };
    }
    
    // DATA_CACHE shim if not defined
    if (typeof DATA_CACHE === 'undefined') {
      console.log('⚠️ DATA_CACHE not defined, creating safe shim');
      window.DATA_CACHE = {
        getInstant: function(key) {
          try {
            const data = localStorage.getItem(`nexopa_cache_${key}`);
            return data ? JSON.parse(data) : null;
          } catch (e) {
            return null;
          }
        },
        setInstant: function(key, data) {
          try {
            localStorage.setItem(`nexopa_cache_${key}`, JSON.stringify(data));
          } catch (e) {
            console.log('Failed to cache data:', e);
          }
        },
        remove: function(key) {
          localStorage.removeItem(`nexopa_cache_${key}`);
        },
        clearAll: function() {
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('nexopa_cache_')) {
              localStorage.removeItem(key);
            }
          });
        },
        getAllCachedTabData: function() {
          const cachedData = {};
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('nexopa_cache_')) {
              try {
                cachedData[key.replace('nexopa_cache_', '')] = JSON.parse(localStorage.getItem(key));
              } catch (e) {
                // Skip invalid data
              }
            }
          });
          return cachedData;
        },
        getOfflineTabData: function(tab) {
          return this.getInstant(tab) || {};
        }
      };
    }
    
    // SETTINGS_SERVICE shim if not defined
    if (typeof SETTINGS_SERVICE === 'undefined') {
      console.log('⚠️ SETTINGS_SERVICE not defined, creating safe shim');
      window.SETTINGS_SERVICE = {
        current: {},
        applyTheme: function() {
          // FIX (theme flash / competing-theme audit): this used to read a
          // completely separate 'nexopa_theme' key (not the shared
          // 'app_theme' key every other module uses), default new users to
          // DARK when unset, and only ever toggle theme-dark/theme-light
          // classes — never the `data-theme` attribute that almost every
          // stylesheet actually keys off. That's a 7th disconnected theme
          // system that could silently fight the real one. Now reads the
          // shared key, defaults to light, and keeps data-theme in sync.
          const savedTheme = (localStorage.getItem('app_theme') || localStorage.getItem('nexopa_theme')) === 'dark' ? 'dark' : 'light';
          const html = document.documentElement;
          html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
          html.classList.add(`theme-${savedTheme}`);
          html.classList.toggle('dark-theme', savedTheme === 'dark');
          html.setAttribute('data-theme', savedTheme);
          try { (window.ThemeManager ? window.ThemeManager.setTheme(savedTheme) : localStorage.setItem('app_theme', savedTheme)); } catch (_) {}
        },
        getSetting: function(key) {
          try {
            const settings = JSON.parse(localStorage.getItem('nexopa_settings') || '{}');
            return settings[key];
          } catch (e) {
            return null;
          }
        },
        clearUserSettings: function() {
          localStorage.removeItem('nexopa_settings');
        },
        registerPageCallback: function(name, callback) {
          // Simple callback registration
          if (!window._settingsCallbacks) {
            window._settingsCallbacks = {};
          }
          window._settingsCallbacks[name] = callback;
        }
      };
    }
    
    // USER_DATA_ISOLATION shim if not defined
    if (typeof USER_DATA_ISOLATION === 'undefined') {
      console.log('⚠️ USER_DATA_ISOLATION not defined, creating safe shim');
      window.USER_DATA_ISOLATION = {
        clearUserData: function(userId) {
          // Clear user-specific data
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith(`user_${userId}_`) || key.includes('_user_data')) {
              localStorage.removeItem(key);
            }
          });
        }
      };
    }
    
    // NETWORK_SERVICE_MANAGER shim if not defined
    if (typeof NETWORK_SERVICE_MANAGER === 'undefined') {
      console.log('⚠️ NETWORK_SERVICE_MANAGER not defined, creating safe shim');
      window.NETWORK_SERVICE_MANAGER = {
        getStatus: function() {
          return navigator.onLine ? 'online' : 'offline';
        }
      };
    }
    
    // SECURE_API shim if not defined
    if (typeof SECURE_API === 'undefined') {
      console.log('⚠️ SECURE_API not defined, creating safe shim');
      window.SECURE_API = {
        call: function(endpoint, options, callback) {
          if (window.api && window.api.request && window.api.request.secureFetch) {
            window.api.request.secureFetch(endpoint, options)
              .then(data => callback && callback({ success: true, data }))
              .catch(error => callback && callback({ success: false, message: error.message }));
          } else if (window.api && window.api.request && window.api.request.fetch) {
            window.api.request.fetch(endpoint, options)
              .then(data => callback && callback({ success: true, data }))
              .catch(error => callback && callback({ success: false, message: error.message }));
          } else {
            // Fallback to fetch
            fetch(endpoint, options)
              .then(response => response.json())
              .then(data => callback && callback({ success: true, data }))
              .catch(error => callback && callback({ success: false, message: error.message }));
          }
        }
      };
    }
    
    // APP_CONFIG default if not defined
// ============================================================================
// APP CONFIGURATION WITH CENTRALIZED PAGE REGISTRY
// ============================================================================

if (typeof APP_CONFIG === 'undefined') {
  console.log('🔧 APP_CONFIG not defined, creating comprehensive configuration');
  window.APP_CONFIG = {
    // Parent shell configuration - chat.html is the main container
    parentShell: {
      file: 'chat.html',
      isParent: true,
      containerId: 'app-container',
      navigationId: 'navigation-container'
    },
    
    // Navigation configuration
    navigation: {
      container: '#nav-container, .navigation-container, nav',
      persistState: true,
      storageKey: 'nexopa_nav_state',
      validateBeforeLoad: true,
      sessionFirst: true  // Navigation loads after session is ready
    },
    
    // Centralized page registry with unique IDs and metadata
    pages: {
      chat: {
        id: 'chat-page',
        file: 'chat.html',
        requiresAuth: true,
        isIframe: false,
        isParent: true,
        icon: '💬',
        title: 'Chat',
        default: true,
        loadOrder: 1
      },
      group: {
        id: 'group-page', 
        file: 'group.html',
        requiresAuth: true,
        isIframe: true,
        icon: '👥',
        title: 'Groups',
        loadOrder: 2,
        container: '#iframe-container, .page-container'
      },
      message: {
        id: 'message-page',
        file: 'message.html',
        requiresAuth: true,
        isIframe: true,
        icon: '✉️',
        title: 'Messages',
        loadOrder: 3,
        container: '#iframe-container, .page-container'
      },
      friend: {
        id: 'friend-page',
        file: 'friend.html',
        requiresAuth: true,
        isIframe: true,
        icon: '👤',
        title: 'Friends',
        loadOrder: 4,
        container: '#iframe-container, .page-container'
      },
      calls: {
        id: 'calls-page',
        file: 'calls.html',
        requiresAuth: true,
        isIframe: true,
        icon: '📞',
        title: 'Calls',
        loadOrder: 5,
        container: '#iframe-container, .page-container'
      },
      settings: {
        id: 'settings-page',
        file: 'settings.html',
        requiresAuth: true,
        isIframe: true,
        icon: '⚙️',
        title: 'Settings',
        loadOrder: 6,
        container: '#iframe-container, .page-container'
      },
      status: {
        id: 'status-page',
        file: 'status.html',
        requiresAuth: true,
        isIframe: true,
        icon: '🟢',
        title: 'Status',
        loadOrder: 7,
        container: '#iframe-container, .page-container'
      },
      tool: {
        id: 'tool-page',
        file: 'Tool.html',
        requiresAuth: true,
        isIframe: true,
        icon: '🛠️',
        title: 'Tools',
        loadOrder: 8,
        container: '#iframe-container, .page-container'
      }
    },
    
    // Session synchronization settings
    sessionSync: {
      enabled: true,
      timeout: 20000, // FIX: was 5000 — too short for 1KB/s links / cold starts
      retryAttempts: 5,
      broadcastToIframes: true,
      validateBeforePropagation: true
    },
    
    // Page loading configuration
    loading: {
      sequence: ['session', 'navigation', 'default-page', 'other-pages'],
      delayBetweenPages: 100,
      maxParallelLoads: 2
    },
    
    // Legacy compatibility
    defaultPage: 'chat.html', // Kept for backward compatibility
    defaultPageKey: 'chat'    // Kept for backward compatibility
  };
  
  console.log('✅ Created comprehensive APP_CONFIG with centralized page registry');
} else {
  // ENHANCE EXISTING APP_CONFIG FOR BACKWARD COMPATIBILITY
  console.log('🔧 Enhancing existing APP_CONFIG for session-first architecture');
  
  // Ensure parent shell configuration exists
  if (typeof APP_CONFIG.parentShell === 'undefined') {
    APP_CONFIG.parentShell = {
      file: 'chat.html',
      isParent: true,
      containerId: 'app-container'
    };
    console.log('✅ Added parentShell configuration');
  }
  
  // Ensure navigation configuration exists
  if (typeof APP_CONFIG.navigation === 'undefined') {
    APP_CONFIG.navigation = {
      container: '#nav-container, .navigation-container, nav',
      persistState: true,
      sessionFirst: true
    };
    console.log('✅ Added navigation configuration');
  }
  
  // Ensure session sync configuration exists
  if (typeof APP_CONFIG.sessionSync === 'undefined') {
    APP_CONFIG.sessionSync = {
      enabled: true,
      timeout: 5000
    };
    console.log('✅ Added session synchronization configuration');
  }
  
  // Convert simple page strings to structured objects if needed
  if (APP_CONFIG.pages && typeof APP_CONFIG.pages === 'object') {
    let needsConversion = false;
    
    // Check if any page is still a string (old format)
    Object.keys(APP_CONFIG.pages).forEach(key => {
      if (typeof APP_CONFIG.pages[key] === 'string') {
        needsConversion = true;
      }
    });
    
    if (needsConversion) {
      console.log('🔄 Converting legacy page format to structured format');
      
      const pageTemplates = {
        'chat.html': { id: 'chat-page', isIframe: false, isParent: true, icon: '💬', default: true },
        'group.html': { id: 'group-page', isIframe: true, icon: '👥', container: '#iframe-container' },
        'message.html': { id: 'message-page', isIframe: true, icon: '✉️', container: '#iframe-container' },
        'friend.html': { id: 'friend-page', isIframe: true, icon: '👤', container: '#iframe-container' },
        'calls.html': { id: 'calls-page', isIframe: true, icon: '📞', container: '#iframe-container' },
        'settings.html': { id: 'settings-page', isIframe: true, icon: '⚙️', container: '#iframe-container' },
        'status.html': { id: 'status-page', isIframe: true, icon: '🟢', container: '#iframe-container' },
        'Tool.html': { id: 'tool-page', isIframe: true, icon: '🛠️', container: '#iframe-container' }
      };
      
      Object.keys(APP_CONFIG.pages).forEach(key => {
        const pageValue = APP_CONFIG.pages[key];
        
        if (typeof pageValue === 'string') {
          const file = pageValue;
          const template = pageTemplates[file] || { id: `${key}-page`, isIframe: true };
          
          APP_CONFIG.pages[key] = {
            id: template.id,
            file: file,
            requiresAuth: true,
            isIframe: key === 'chat' ? false : template.isIframe,
            isParent: key === 'chat',
            icon: template.icon || '📄',
            title: key.charAt(0).toUpperCase() + key.slice(1),
            default: key === 'chat',
            container: template.container,
            ...template
          };
          
          console.log(`✅ Converted page "${key}" to structured format`);
        } else if (typeof pageValue === 'object' && !pageValue.id) {
          // Ensure existing objects have required properties
          APP_CONFIG.pages[key].id = pageValue.id || `${key}-page`;
          APP_CONFIG.pages[key].requiresAuth = pageValue.requiresAuth !== false;
          APP_CONFIG.pages[key].isIframe = key === 'chat' ? false : (pageValue.isIframe !== false);
          APP_CONFIG.pages[key].isParent = key === 'chat';
          console.log(`✅ Enhanced existing page object for "${key}"`);
        }
      });
    }
  }
  
  // Ensure defaultPage and defaultPageKey for backward compatibility
  if (typeof APP_CONFIG.defaultPage === 'undefined') {
    APP_CONFIG.defaultPage = 'chat.html';
    console.log('✅ Added defaultPage: chat.html (backward compatibility)');
  }
  
  if (typeof APP_CONFIG.defaultPageKey === 'undefined') {
    APP_CONFIG.defaultPageKey = 'chat';
    console.log('✅ Added defaultPageKey: chat (backward compatibility)');
  }
  
  console.log('✅ APP_CONFIG enhancement complete with session-first architecture');
}

// Check for public pages
window.isPublicPage = function() {
  const publicPages = ['/', '/index.html', '/index.html', '/signup.html', '/auth.html', '/register.html'];
  const currentPath = window.location.pathname.toLowerCase();
  
  // Also check if we have a page parameter that indicates public access
  const urlParams = new URLSearchParams(window.location.search);
  const pageParam = urlParams.get('page');
  
  // If we're trying to access a page that requires auth but no session exists,
  // treat as public to trigger redirect to login
  if (pageParam && APP_CONFIG.pages && APP_CONFIG.pages[pageParam]) {
    const pageConfig = APP_CONFIG.pages[pageParam];
    if (pageConfig.requiresAuth && !window.currentUser) {
      console.log(`⚠️ Page ${pageParam} requires auth but no session, treating as public`);
      return true;
    }
  }
  
  return publicPages.some(page => currentPath.endsWith(page));
};
    
    // GLOBAL NAMESPACE GOVERNANCE: Mark namespace as initialized
    if (window.app && window.app._markNamespaceInitialized) {
      window.app._markNamespaceInitialized();
    }
    
    console.log('✅ Global dependencies ensured with namespace governance');
  }
  
  // Run dependency checker immediately
  ensureGlobalDependencies();

  // ============================================================================
  // CORE MODULE REGISTRATION - PHASE 2: SINGLE-INSTANTIATION GUARANTEE
  // ============================================================================
  
  const BOOTSTRAP_STATE = {
    PHASES: {
      NOT_STARTED: 'not_started',
      INITIALIZING: 'initializing',
      API_WAITING: 'api_waiting',
      AUTH_CHECKING: 'auth_checking',
      UI_LOADING: 'ui_loading',
      READY: 'ready',
      FAILED: 'failed'
    },
    
    currentPhase: 'not_started',
    startTime: null,
    dependencies: {
      apiJs: false,
      domReady: false,
      authReady: false
    },
    
    initialize: function() {
      this.startTime = Date.now();
      this.currentPhase = this.PHASES.INITIALIZING;
      console.log(`🚀 Application bootstrap started at ${new Date().toISOString()}`);
      
      // Track bootstrap progress
      this.trackProgress('bootstrap_started');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record dependency graph
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.bootstrapState = {
          initialized: true,
          startTime: this.startTime,
          dependencies: { ...this.dependencies }
        };
      }
      
      return this;
    },
    
    markDependencyReady: function(dependency) {
      if (dependency in this.dependencies) {
        this.dependencies[dependency] = true;
        console.log(`✅ Dependency ready: ${dependency}`);
        this.trackProgress(`${dependency}_ready`);
        
        // DEPENDENCY RESOLUTION INTEGRITY: Update dependency graph
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.dependencies[dependency] = true;
        }
      }
      
      this.checkAllDependencies();
    },
    
    checkAllDependencies: function() {
      const allReady = Object.values(this.dependencies).every(ready => ready);
      if (allReady && this.currentPhase === this.PHASES.INITIALIZING) {
        this.currentPhase = this.PHASES.API_WAITING;
        console.log('✅ All bootstrap dependencies ready');
        this.trackProgress('all_dependencies_ready');
        
        // DEPENDENCY RESOLUTION INTEGRITY: Mark dependencies complete
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.allDependenciesReady = true;
          window.app._dependencyGraph.bootstrapState.allDependenciesReadyAt = new Date().toISOString();
        }
      }
    },
    
    setPhase: function(phase) {
      if (Object.values(this.PHASES).includes(phase)) {
        const previousPhase = this.currentPhase;
        this.currentPhase = phase;
        console.log(`🔄 Bootstrap phase: ${previousPhase} → ${phase}`);
        this.trackProgress(`phase_${phase}`);
        
        // APPLICATION LIFECYCLE CONTROL: Record phase transition
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.phase = phase;
          window.app._dependencyGraph.bootstrapState.phaseTransitions = 
            window.app._dependencyGraph.bootstrapState.phaseTransitions || [];
          window.app._dependencyGraph.bootstrapState.phaseTransitions.push({
            from: previousPhase,
            to: phase,
            timestamp: new Date().toISOString()
          });
        }
        
        // Broadcast phase change
        this.broadcastPhaseChange(phase, previousPhase);
      }
    },
    
    getPhase: function() {
      return this.currentPhase;
    },
    
    isPhase: function(phase) {
      return this.currentPhase === phase;
    },
    
    trackProgress: function(event) {
      const progressEvent = new CustomEvent('nexopa-bootstrap-progress', {
        detail: {
          event: event,
          phase: this.currentPhase,
          timestamp: new Date().toISOString(),
          dependencies: { ...this.dependencies },
          elapsedMs: Date.now() - this.startTime
        }
      });
      window.dispatchEvent(progressEvent);
    },
    
    broadcastPhaseChange: function(newPhase, oldPhase) {
      const phaseChangeEvent = new CustomEvent('nexopa-bootstrap-phase-change', {
        detail: {
          newPhase: newPhase,
          oldPhase: oldPhase,
          timestamp: new Date().toISOString(),
          dependencies: { ...this.dependencies },
          elapsedMs: Date.now() - this.startTime
        }
      });
      window.dispatchEvent(phaseChangeEvent);
    },
    
    complete: function(success = true, message = '') {
      const finalPhase = success ? this.PHASES.READY : this.PHASES.FAILED;
      this.setPhase(finalPhase);
      
      const completionEvent = new CustomEvent('nexopa-bootstrap-complete', {
        detail: {
          success: success,
          message: message,
          phase: finalPhase,
          timestamp: new Date().toISOString(),
          elapsedMs: Date.now() - this.startTime,
          dependencies: { ...this.dependencies }
        }
      });
      window.dispatchEvent(completionEvent);
      
      // APPLICATION LIFECYCLE CONTROL: Record completion state
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.bootstrapState.completed = true;
        window.app._dependencyGraph.bootstrapState.completionSuccess = success;
        window.app._dependencyGraph.bootstrapState.completionMessage = message;
        window.app._dependencyGraph.bootstrapState.completionTime = new Date().toISOString();
        window.app._dependencyGraph.bootstrapState.completionElapsedMs = Date.now() - this.startTime;
      }
      
      console.log(`🏁 Application bootstrap ${success ? 'completed successfully' : 'failed'}: ${message}`);
      console.log(`⏱️ Total bootstrap time: ${Date.now() - this.startTime}ms`);
    },
    
    getStatusReport: function() {
      return {
        phase: this.currentPhase,
        dependencies: { ...this.dependencies },
        elapsedMs: Date.now() - this.startTime,
        startTime: new Date(this.startTime).toISOString(),
        currentTime: new Date().toISOString()
      };
    }
  };
  
  // Initialize bootstrap tracker immediately
  BOOTSTRAP_STATE.initialize();

  // ============================================================================
  // DEPENDENCY RESOLUTION INTEGRITY - PHASE 3: MODULE REGISTRATION CONTROLLER
  // ============================================================================
  
  const APP_BOOTSTRAP = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    currentRetry: 0,
    isBootstrapping: false,
    bootstrapPromise: null,
    registeredCallbacks: [],
    pendingOperations: [],
    
    // Main bootstrap function
    bootstrap: async function() {
      if (this.isBootstrapping) {
        console.log('⚠️ Bootstrap already in progress, returning existing promise');
        return this.bootstrapPromise;
      }
      
      this.isBootstrapping = true;
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.INITIALIZING);
      
      // CORE MODULE REGISTRATION: Record bootstrap start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.appBootstrap = {
          started: true,
          startTime: new Date().toISOString(),
          retryCount: this.currentRetry,
          maxRetries: this.MAX_RETRIES
        };
      }
      
      this.bootstrapPromise = new Promise(async (resolve, reject) => {
        try {
          console.log('🚀 Starting enhanced application bootstrap...');
          
          // STEP 1: Wait for DOM to be ready
          await this.waitForDOMReady();
          BOOTSTRAP_STATE.markDependencyReady('domReady');
          
          // STEP 2: Wait for modular API initialization
          await this.waitForModularApi();
          BOOTSTRAP_STATE.markDependencyReady('apiJs');
          
          // STEP 3: Wait for auth readiness
          await this.waitForAuthReady();
          BOOTSTRAP_STATE.markDependencyReady('authReady');
          
          // STEP 4: Check authentication state
          const authState = await this.checkAuthenticationState();
          
          // STEP 5: Based on auth state, decide UI flow
          await this.determineUIFlow(authState);
          
          // STEP 6: Initialize global UI components
          await this.initializeGlobalUI();
          
          // STEP 7: Setup event listeners and coordination
          await this.setupCoordinationSystems();
          
          // STEP 8: CORE MODULE REGISTRATION - Register app.core exactly once
          await this.registerCoreModule();
          
          // STEP 9: Complete bootstrap
          BOOTSTRAP_STATE.complete(true, 'Application bootstrap completed successfully');
          
          // CORE MODULE REGISTRATION: Mark registration complete
          if (window.app && window.app._coreRegistered !== undefined) {
            window.app._coreRegistered = true;
          }
          
          // Execute registered callbacks
          this.executeRegisteredCallbacks();
          
          // Execute pending operations
          this.executePendingOperations();
          
          console.log('✅ Enhanced application bootstrap completed');
          resolve(true);
          
        } catch (error) {
          console.error('❌ Application bootstrap failed:', error);
          BOOTSTRAP_STATE.complete(false, error.message);
          
          // CORE MODULE REGISTRATION: Record bootstrap failure
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.appBootstrap.failed = true;
            window.app._dependencyGraph.appBootstrap.failureReason = error.message;
            window.app._dependencyGraph.appBootstrap.failureTime = new Date().toISOString();
          }
          
          // Attempt graceful recovery
          await this.attemptRecovery(error);
          reject(error);
        } finally {
          this.isBootstrapping = false;
          
          // CORE MODULE REGISTRATION: Record bootstrap completion
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.appBootstrap.completed = true;
            window.app._dependencyGraph.appBootstrap.completionTime = new Date().toISOString();
          }
        }
      });
      
      return this.bootstrapPromise;
    },
    
    // Wait for DOM to be ready
    waitForDOMReady: function() {
      return new Promise((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ DOM is ready');
            resolve();
          });
          
          // Safety timeout
          setTimeout(() => {
            console.log('⚠️ DOM ready timeout, continuing anyway');
            resolve();
          }, 5000);
        } else {
          console.log('✅ DOM already ready');
          resolve();
        }
      });
    },
    
    // Wait for modular API initialization
    waitForModularApi: function() {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.API_WAITING);
      
      return new Promise(async (resolve) => {
        console.log('🔍 Waiting for modular API initialization...');
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record API wait start
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.apiWait = {
            started: true,
            startTime: new Date().toISOString(),
            methodsAttempted: []
          };
        }
        
        // Use existing API_COORDINATION if available
        if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION.waitForApi) {
          try {
            const apiAvailable = await API_COORDINATION.waitForApi();
            if (apiAvailable) {
              console.log('✅ Modular API initialized via API_COORDINATION');
              
              // DEPENDENCY RESOLUTION INTEGRITY: Record successful method
              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.apiWait.methodsAttempted.push({
                  method: 'API_COORDINATION.waitForApi',
                  success: true,
                  timestamp: new Date().toISOString()
                });
                window.app._dependencyGraph.apiWait.completed = true;
                window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                window.app._dependencyGraph.apiWait.success = true;
              }
              
              resolve();
              return;
            }
          } catch (error) {
            console.log('⚠️ API_COORDINATION wait failed, trying alternative methods:', error);
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record failed method
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: 'API_COORDINATION.waitForApi',
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
        
        // Alternative detection methods for modular API
        const detectionMethods = [
          () => window.api && window.api.core && window.api.core.initialize,
          () => window.api && window.api.auth && window.api.auth.getUser,
          () => window.api && window.api.request && window.api.request.secureFetch,
          () => window.__NEXOPA_API_READY === true,
          () => window.NexopaConfig && window.NexopaConfig.api,
          () => window.__NEXOPA_API_EVENTS && window.__NEXOPA_API_EVENTS.includes('ready')
        ];
        
        // Try immediate detection
        for (const method of detectionMethods) {
          if (method()) {
            console.log('✅ Modular API detected via alternative method');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record successful detection
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: 'immediate_detection',
                success: true,
                detectedBy: method.toString().substring(0, 100),
                timestamp: new Date().toISOString()
              });
            }
            
            // Initialize API core if available
            if (window.api && window.api.core && window.api.core.initialize) {
              try {
                await window.api.core.initialize();
                console.log('✅ API core initialized');
                
                // DEPENDENCY RESOLUTION INTEGRITY: Record API core initialization
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                }
              } catch (error) {
                console.log('⚠️ API core initialization failed:', error);
                // Continue anyway
                
                // DEPENDENCY RESOLUTION INTEGRITY: Record API core failure
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitializationFailed = true;
                  window.app._dependencyGraph.apiWait.apiCoreInitializationError = error.message;
                }
              }
            }
            
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.completed = true;
              window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.apiWait.success = true;
            }
            
            resolve();
            return;
          }
        }
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record detection attempt
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.apiWait.immediateDetectionFailed = true;
        }
        
        // Listen for modular API ready events
        const eventTypes = ['api-ready', 'apiready', 'apiReady', 'nexopa-api-ready', 'api.core-ready'];
        let eventReceived = false;
        
        const eventHandler = () => {
          if (!eventReceived) {
            eventReceived = true;
            console.log('✅ Modular API ready via event');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record event reception
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: 'event_listener',
                success: true,
                eventType: 'various',
                timestamp: new Date().toISOString()
              });
            }
            
            // Clean up other listeners
            eventTypes.forEach(type => {
              window.removeEventListener(type, eventHandler);
            });
            
            clearTimeout(timeoutId);
            
            // Initialize API core if available
            if (window.api && window.api.core && window.api.core.initialize) {
              window.api.core.initialize().then(() => {
                console.log('✅ API core initialized via event');
                
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                  window.app._dependencyGraph.apiWait.completed = true;
                  window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                  window.app._dependencyGraph.apiWait.success = true;
                }
                
                resolve();
              }).catch(() => {
                console.log('⚠️ API core initialization failed, continuing');
                
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitializationFailed = true;
                  window.app._dependencyGraph.apiWait.completed = true;
                  window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                  window.app._dependencyGraph.apiWait.success = true;
                }
                
                resolve();
              });
            } else {
              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.apiWait.completed = true;
                window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                window.app._dependencyGraph.apiWait.success = true;
              }
              resolve();
            }
          }
        };
        
        // Add event listeners
        eventTypes.forEach(eventType => {
          window.addEventListener(eventType, eventHandler, { once: true });
        });
        
        // Polling as fallback
        let pollCount = 0;
        const maxPolls = 50; // 5 seconds
        const pollInterval = setInterval(() => {
          pollCount++;
          
          for (const method of detectionMethods) {
            if (method()) {
              clearInterval(pollInterval);
              clearTimeout(timeoutId);
              eventTypes.forEach(type => {
                window.removeEventListener(type, eventHandler);
              });
              
              console.log(`✅ Modular API detected after ${pollCount} polls`);
              
              // DEPENDENCY RESOLUTION INTEGRITY: Record polling success
              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.apiWait.methodsAttempted.push({
                  method: 'polling',
                  success: true,
                  pollCount: pollCount,
                  timestamp: new Date().toISOString()
                });
              }
              
              // Initialize API core if available
              if (window.api && window.api.core && window.api.core.initialize) {
                window.api.core.initialize().then(() => {
                  console.log('✅ API core initialized via polling');
                  
                  if (window.app && window.app._dependencyGraph) {
                    window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                    window.app._dependencyGraph.apiWait.completed = true;
                    window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                    window.app._dependencyGraph.apiWait.success = true;
                  }
                  
                  resolve();
                }).catch(() => {
                  console.log('⚠️ API core initialization failed, continuing');
                  
                  if (window.app && window.app._dependencyGraph) {
                    window.app._dependencyGraph.apiWait.apiCoreInitializationFailed = true;
                    window.app._dependencyGraph.apiWait.completed = true;
                    window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                    window.app._dependencyGraph.apiWait.success = true;
                  }
                  
                  resolve();
                });
              } else {
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.completed = true;
                  window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                  window.app._dependencyGraph.apiWait.success = true;
                }
                resolve();
              }
              
              return;
            }
          }
          
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log('⚠️ Modular API not detected after polling, continuing without it');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record polling failure
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: 'polling',
                success: false,
                pollCount: pollCount,
                maxPolls: maxPolls,
                timestamp: new Date().toISOString()
              });
              window.app._dependencyGraph.apiWait.pollingExhausted = true;
              window.app._dependencyGraph.apiWait.completed = true;
              window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.apiWait.success = false;
            }
            
            resolve(); // Continue anyway for graceful degradation
          }
        }, 100);
        
        // Overall timeout
        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval);
          eventTypes.forEach(type => {
            window.removeEventListener(type, eventHandler);
          });
          console.log('⚠️ Modular API wait timeout, continuing');
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record timeout
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.apiWait.timedOut = true;
            window.app._dependencyGraph.apiWait.completed = true;
            window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.apiWait.success = false;
          }
          
          resolve(); // Continue anyway
        }, 10000);
      });
    },
    
    // Wait for auth readiness
    waitForAuthReady: function() {
      return new Promise((resolve) => {
        console.log('🔐 Waiting for auth module readiness...');
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record auth wait start
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.authWait = {
            started: true,
            startTime: new Date().toISOString(),
            methodsAttempted: []
          };
        }
        
        // Check if auth module is already ready
        if (window.api && window.api.auth && window.api.auth.isReady && window.api.auth.isReady()) {
          console.log('✅ Auth module already ready');
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record immediate readiness
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authWait.methodsAttempted.push({
              method: 'immediate_check',
              success: true,
              timestamp: new Date().toISOString()
            });
            window.app._dependencyGraph.authWait.completed = true;
            window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authWait.success = true;
          }
          
          resolve();
          return;
        }
        
        // Listen for auth ready events
        const eventTypes = ['auth-ready', 'authReady', 'nexopa-auth-ready'];
        let eventReceived = false;
        
        const eventHandler = () => {
          if (!eventReceived) {
            eventReceived = true;
            console.log('✅ Auth module ready via event');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record event reception
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: 'event_listener',
                success: true,
                eventType: 'various',
                timestamp: new Date().toISOString()
              });
            }
            
            // Clean up other listeners
            eventTypes.forEach(type => {
              window.removeEventListener(type, eventHandler);
            });
            
            clearTimeout(timeoutId);
            
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = true;
            }
            
            resolve();
          }
        };
        
        // Add event listeners
        eventTypes.forEach(eventType => {
          window.addEventListener(eventType, eventHandler, { once: true });
        });
        
        // Polling as fallback
        let pollCount = 0;
        const maxPolls = 30; // 3 seconds
        const pollInterval = setInterval(() => {
          pollCount++;
          
          if (window.api && window.api.auth && window.api.auth.isReady && window.api.auth.isReady()) {
            clearInterval(pollInterval);
            clearTimeout(timeoutId);
            eventTypes.forEach(type => {
              window.removeEventListener(type, eventHandler);
            });
            
            console.log(`✅ Auth module ready after ${pollCount} polls`);
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record polling success
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: 'polling',
                success: true,
                pollCount: pollCount,
                timestamp: new Date().toISOString()
              });
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = true;
            }
            
            resolve();
            return;
          }
          
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log('⚠️ Auth module not ready after polling, continuing');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record polling failure
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: 'polling',
                success: false,
                pollCount: pollCount,
                maxPolls: maxPolls,
                timestamp: new Date().toISOString()
              });
              window.app._dependencyGraph.authWait.pollingExhausted = true;
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = false;
            }
            
            resolve(); // Continue anyway
          }
        }, 100);
        
        // Overall timeout
        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval);
          eventTypes.forEach(type => {
            window.removeEventListener(type, eventHandler);
          });
          console.log('⚠️ Auth module wait timeout, continuing');
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record timeout
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authWait.timedOut = true;
            window.app._dependencyGraph.authWait.completed = true;
            window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authWait.success = false;
          }
          
          resolve(); // Continue anyway
        }, 5000);
      });
    },
    
    // Check authentication state
    checkAuthenticationState: async function() {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.AUTH_CHECKING);
      console.log('🔐 Checking authentication state...');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record auth check start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.authCheck = {
          started: true,
          startTime: new Date().toISOString(),
          methodsAttempted: []
        };
      }
      
      const authState = {
        hasToken: false,
        tokenValid: false,
        user: null,
        requiresAuth: true,
        isPublicPage: false
      };
      
      // Check if we're on a public page
      authState.isPublicPage = isPublicPage();
      
      if (authState.isPublicPage) {
        console.log('📄 Public page detected, auth not required');
        authState.requiresAuth = false;
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record public page detection
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.authCheck.methodsAttempted.push({
            method: 'public_page_detection',
            success: true,
            isPublicPage: true,
            timestamp: new Date().toISOString()
          });
          window.app._dependencyGraph.authCheck.completed = true;
          window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
          window.app._dependencyGraph.authCheck.success = true;
          window.app._dependencyGraph.authCheck.result = authState;
        }
        
        return authState;
      }
      
      // Use modular auth API if available
      if (window.api && window.api.auth && window.api.auth.getUser) {
        try {
          const user = await window.api.auth.getUser();
          authState.user = user;
          authState.hasToken = !!user;
          authState.tokenValid = !!user;
          
          console.log('✅ Auth state checked via modular API');
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record modular API success
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: 'modular_api',
              success: true,
              timestamp: new Date().toISOString()
            });
            window.app._dependencyGraph.authCheck.completed = true;
            window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authCheck.success = true;
            window.app._dependencyGraph.authCheck.result = authState;
          }
          
          return authState;
        } catch (error) {
          console.log('⚠️ Modular auth API failed:', error);
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record modular API failure
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: 'modular_api',
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          // Fall through to other methods
        }
      }
      
      // Use centralized auth state if available
      if (typeof AUTH_STATE !== 'undefined') {
        authState.hasToken = AUTH_STATE.hasToken();
        
        if (authState.hasToken) {
          authState.user = AUTH_STATE.getUser();
          
          // Check if token is already validated
          if (AUTH_STATE.isAuthenticated()) {
            authState.tokenValid = true;
            console.log('✅ Token already validated in auth state');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record auth state success
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authCheck.methodsAttempted.push({
                method: 'auth_state',
                success: true,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            console.log('🔐 Token exists but needs validation');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record auth state partial
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authCheck.methodsAttempted.push({
                method: 'auth_state',
                success: true,
                tokenValid: false,
                timestamp: new Date().toISOString()
              });
            }
          }
        } else {
          // DEPENDENCY RESOLUTION INTEGRITY: Record no token
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: 'auth_state',
              success: true,
              hasToken: false,
              timestamp: new Date().toISOString()
            });
          }
        }
      } else {
        // Fallback to localStorage check
        const token = localStorage.getItem('accessToken') || localStorage.getItem('nexopa_jwt_token');
        authState.hasToken = !!token;
        
        if (authState.hasToken) {
          console.log('🔐 Token found in localStorage');
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record localStorage check
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: 'local_storage',
              success: true,
              hasToken: true,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // DEPENDENCY RESOLUTION INTEGRITY: Record no token in localStorage
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: 'local_storage',
              success: true,
              hasToken: false,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      console.log('📋 Auth state check complete:', {
        hasToken: authState.hasToken,
        tokenValid: authState.tokenValid,
        requiresAuth: authState.requiresAuth,
        isPublicPage: authState.isPublicPage
      });
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record final auth check result
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.authCheck.completed = true;
        window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
        window.app._dependencyGraph.authCheck.success = true;
        window.app._dependencyGraph.authCheck.result = authState;
      }
      
      return authState;
    },
    
    // Determine UI flow based on auth state
    determineUIFlow: async function(authState) {
      console.log('🔄 Determining UI flow based on auth state...');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record UI flow determination
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiFlow = {
          started: true,
          startTime: new Date().toISOString(),
          authState: authState
        };
      }
      
      if (authState.isPublicPage) {
        console.log('📄 Public page flow: Show auth UI');
        
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = 'public_page';
          window.app._dependencyGraph.uiFlow.action = 'show_auth_ui';
        }
        
        this.showAuthUI();
        return;
      }
      
      if (!authState.hasToken) {
        console.log('🔐 No token found: Redirecting to auth');
        
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = 'no_token';
          window.app._dependencyGraph.uiFlow.action = 'redirect_to_auth';
        }
        
        this.redirectToAuth('No authentication token found');
        return;
      }
      
      if (!authState.tokenValid) {
        console.log('🔐 Token needs validation');
        
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = 'token_needs_validation';
          window.app._dependencyGraph.uiFlow.action = 'validate_token';
        }
        
        // Try to validate token using modular API
        const validationResult = await this.validateToken();
        
        if (validationResult.valid) {
          console.log('✅ Token validated successfully');
          
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.uiFlow.tokenValidation = 'success';
            window.app._dependencyGraph.uiFlow.action = 'show_dashboard_ui';
          }
          
          this.showDashboardUI();
        } else {
          console.log('❌ Token validation failed:', validationResult.reason);
          
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.uiFlow.tokenValidation = 'failed';
            window.app._dependencyGraph.uiFlow.tokenValidationReason = validationResult.reason;
            window.app._dependencyGraph.uiFlow.action = 'redirect_to_auth';
          }
          
          this.redirectToAuth(`Token validation failed: ${validationResult.reason}`);
        }
      } else {
        console.log('✅ Token already valid: Showing dashboard');
        
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = 'token_already_valid';
          window.app._dependencyGraph.uiFlow.action = 'show_dashboard_ui';
        }
        
        this.showDashboardUI();
      }
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record UI flow completion
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiFlow.completed = true;
        window.app._dependencyGraph.uiFlow.completionTime = new Date().toISOString();
      }
    },
    
    // Validate token using available methods
    validateToken: async function() {
      console.log('🔐 Validating authentication token...');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record token validation start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.tokenValidation = {
          started: true,
          startTime: new Date().toISOString(),
          methodsAttempted: []
        };
      }
      
      // Try modular API first
      if (window.api && window.api.auth && window.api.auth.validateToken) {
        try {
          const result = await window.api.auth.validateToken();
          if (result.valid !== undefined) {
            console.log('✅ Token validated via modular API');
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record modular API success
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
                method: 'modular_api',
                success: true,
                timestamp: new Date().toISOString()
              });
              window.app._dependencyGraph.tokenValidation.completed = true;
              window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
              window.app._dependencyGraph.tokenValidation.success = true;
              window.app._dependencyGraph.tokenValidation.result = result;
            }
            
            return result;
          }
        } catch (error) {
          console.log('⚠️ Modular API validation failed:', error.message);
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record modular API failure
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
              method: 'modular_api',
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      // Try multiple validation methods in order
      const validationMethods = [
        this.validateWithAuthState.bind(this),
        this.validateWithApiJs.bind(this),
        this.validateWithDirectCall.bind(this)
      ];
      
      for (const method of validationMethods) {
        const methodName = method.name || method.toString().substring(0, 50);
        try {
          const result = await method();
          if (result.valid !== undefined) {
            console.log(`✅ Token validated via ${methodName}`);
            
            // DEPENDENCY RESOLUTION INTEGRITY: Record method success
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
                method: methodName,
                success: true,
                timestamp: new Date().toISOString()
              });
              window.app._dependencyGraph.tokenValidation.completed = true;
              window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
              window.app._dependencyGraph.tokenValidation.success = true;
              window.app._dependencyGraph.tokenValidation.result = result;
            }
            
            return result;
          }
        } catch (error) {
          console.log(`⚠️ Validation method ${methodName} failed:`, error.message);
          
          // DEPENDENCY RESOLUTION INTEGRITY: Record method failure
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
              method: methodName,
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          // Continue to next method
        }
      }
      
      // All methods failed
      const finalResult = {
        valid: false,
        reason: 'All validation methods failed',
        error: 'Unable to validate token'
      };
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record all methods failure
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.tokenValidation.completed = true;
        window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
        window.app._dependencyGraph.tokenValidation.success = false;
        window.app._dependencyGraph.tokenValidation.result = finalResult;
      }
      
      return finalResult;
    },
    
    // Validate using AUTH_STATE
    validateWithAuthState: async function() {
      if (typeof AUTH_STATE === 'undefined' || typeof TOKEN_VALIDATION === 'undefined') {
        throw new Error('AUTH_STATE or TOKEN_VALIDATION not available');
      }
      
      return await TOKEN_VALIDATION.validateWithBackend();
    },
    
    // Validate using modular API
    validateWithApiJs: async function() {
      if (typeof API_COORDINATION === 'undefined' || !API_COORDINATION.isApiAvailable()) {
        throw new Error('API_COORDINATION not available');
      }
      
      return await API_COORDINATION.checkAuthMe();
    },
    
    // Direct validation call (fallback)
    validateWithDirectCall: async function() {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('nexopa_jwt_token');
      if (!token) {
        return { valid: false, reason: 'No token found' };
      }
      
      // This is a minimal fallback - in production, modular API should handle this
      try {
        // Simple token format check (basic JWT validation)
        const parts = token.split('.');
        if (parts.length !== 3) {
          return { valid: false, reason: 'Invalid token format' };
        }
        
        // Check expiration from payload
        try {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.exp && payload.exp < Date.now() / 1000) {
            return { valid: false, reason: 'Token expired' };
          }
          
          return {
            valid: true,
            user: {
              id: payload.sub || payload.userId || 'unknown',
              email: payload.email || 'user@example.com',
              name: payload.name || 'User'
            }
          };
        } catch (e) {
          return { valid: false, reason: 'Invalid token payload' };
        }
      } catch (error) {
        return { valid: false, reason: 'Token validation error', error: error.message };
      }
    },
    
    // CORE MODULE REGISTRATION: Register app.core exactly once
    registerCoreModule: async function() {
      console.log('📝 Registering core module...');
      
      // Check if already registered
      if (window.app && window.app._coreRegistered) {
        console.log('⚠️ Core module already registered, skipping');
        return;
      }
      
      // Check if namespace is ready
      if (!window.app || !window.app._namespaceInitialized) {
        console.log('⚠️ Namespace not initialized, deferring core registration');
        
        // Defer registration until namespace is ready
        if (window.app && window.app._deferRegistration) {
          window.app._deferRegistration('app.core', () => {
            console.log('✅ Deferred core module registration executing');
            return this.createCoreModule();
          });
        }
        return;
      }
      
      try {
        // Create and register core module
        const coreModule = this.createCoreModule();
        
        // Ensure window.app.core exists with defensive assignment
        if (!window.app.core) {
          window.app.core = coreModule;
        } else {
          // Merge with existing properties without overwriting
          Object.keys(coreModule).forEach(key => {
            if (typeof window.app.core[key] === 'undefined') {
              window.app.core[key] = coreModule[key];
            }
          });
        }
        
        // Mark as registered
        if (window.app._coreRegistered !== undefined) {
          window.app._coreRegistered = true;
        }
        
        // Record registration
        if (window.app._dependencyGraph) {
          window.app._dependencyGraph.coreRegistration = {
            registered: true,
            registrationTime: new Date().toISOString(),
            moduleProperties: Object.keys(coreModule)
          };
        }
        
        console.log('✅ Core module registered successfully');
      } catch (error) {
        console.error('❌ Core module registration failed:', error);
        
        // Record failure
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coreRegistration = {
            registered: false,
            registrationTime: new Date().toISOString(),
            error: error.message
          };
        }
        
        // Re-throw to maintain failure propagation
        throw error;
      }
    },
    
    // Create the core module object
    createCoreModule: function() {
      return {
        // API LAYER COORDINATION: Core API coordination methods
        api: {
          // API readiness check
          isReady: function() {
            return window.api && window.api.core && window.api.core.initialize;
          },
          
          // Wait for API readiness
          waitForReady: function(timeout = 10000) {
            return new Promise((resolve, reject) => {
              if (this.isReady()) {
                resolve(true);
                return;
              }
              
              const checkInterval = setInterval(() => {
                if (this.isReady()) {
                  clearInterval(checkInterval);
                  clearTimeout(timeoutId);
                  resolve(true);
                }
              }, 100);
              
              const timeoutId = setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('API readiness timeout'));
              }, timeout);
            });
          },
          
          // Initialize API with coordination
          initializeWithCoordination: async function() {
            try {
              if (this.isReady()) {
                await window.api.core.initialize();
                return true;
              }
              return false;
            } catch (error) {
              console.error('API initialization failed:', error);
              return false;
            }
          }
        },
        
        // APPLICATION LIFECYCLE CONTROL: Lifecycle management
        lifecycle: {
          // Get current bootstrap phase
          getPhase: function() {
            return BOOTSTRAP_STATE.getPhase();
          },
          
          // Check if bootstrap is complete
          isBootstrapped: function() {
            return BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.READY);
          },
          
          // Wait for bootstrap completion
          waitForBootstrap: function() {
            return APP_BOOTSTRAP.waitForBootstrap();
          },
          
          // Get bootstrap status
          getStatus: function() {
            return APP_BOOTSTRAP.getStatus();
          },
          
          // Register callback for bootstrap completion
          onBootstrapComplete: function(callback) {
            APP_BOOTSTRAP.registerCallback(callback);
          },
          
          // Queue operation for after bootstrap
          queueOperation: function(operation) {
            APP_BOOTSTRAP.queueOperation(operation);
          }
        },
        
        // STATE MANAGEMENT AUTHORITY: State management
        state: {
          // Get authentication state
          getAuthState: function() {
            return {
              isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
              user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
              hasToken: !!(AUTH_STATE && AUTH_STATE.hasToken()),
              tokenValid: !!(AUTH_STATE && AUTH_STATE.isAuthenticated())
            };
          },
          
          // Get UI state
          getUIState: function() {
            if (typeof UI_ORCHESTRATOR !== 'undefined') {
              return UI_ORCHESTRATOR.getState();
            }
            return null;
          },
          
          // Get network state
          getNetworkState: function() {
            return {
              status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
              isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
            };
          },
          
          // Get session state
          getSessionState: function() {
            if (typeof SESSION_COORDINATOR !== 'undefined') {
              return SESSION_COORDINATOR.getStatus();
            }
            return null;
          }
        },
        
        // EVENT BUS STEWARDSHIP: Event management
        events: {
          // Listen for event
          on: function(eventName, callback) {
            if (typeof NexopaEvents !== 'undefined') {
              NexopaEvents.on(eventName, callback);
            } else {
              window.addEventListener(eventName, (event) => {
                callback(event.detail);
              });
            }
          },
          
          // Remove event listener
          off: function(eventName, callback) {
            if (typeof NexopaEvents !== 'undefined') {
              NexopaEvents.off(eventName, callback);
            } else {
              window.removeEventListener(eventName, callback);
            }
          },
          
          // Emit event
          emit: function(eventName, data) {
            if (typeof NexopaEvents !== 'undefined') {
              NexopaEvents.emit(eventName, data);
            } else {
              const event = new CustomEvent(eventName, {
                detail: data,
                bubbles: true,
                cancelable: true
              });
              window.dispatchEvent(event);
            }
          },
          
          // Listen for event once
          once: function(eventName, callback) {
            if (typeof NexopaEvents !== 'undefined') {
              NexopaEvents.once(eventName, callback);
            } else {
              const onceCallback = (event) => {
                callback(event.detail);
                window.removeEventListener(eventName, onceCallback);
              };
              window.addEventListener(eventName, onceCallback);
            }
          }
        },
        
        // FAILURE CONTAINMENT STRATEGY: Error handling
        errors: {
          // Get error stats
          getStats: function() {
            if (typeof ERROR_HANDLER !== 'undefined') {
              return ERROR_HANDLER.getStats();
            }
            return null;
          },
          
          // Register error handler
          onError: function(callback) {
            if (typeof ERROR_HANDLER !== 'undefined') {
              ERROR_HANDLER.onError(callback);
            }
          },
          
          // Show error to user
          showError: function(message, type = 'error') {
            if (typeof ERROR_HANDLER !== 'undefined') {
              ERROR_HANDLER.showErrorToUser(message, type);
            }
          }
        },
        
        // PERFORMANCE GOVERNANCE: Performance monitoring
        performance: {
          // Get bootstrap performance metrics
          getBootstrapMetrics: function() {
            if (BOOTSTRAP_STATE.startTime) {
              return {
                elapsedMs: Date.now() - BOOTSTRAP_STATE.startTime,
                startTime: new Date(BOOTSTRAP_STATE.startTime).toISOString(),
                currentPhase: BOOTSTRAP_STATE.getPhase()
              };
            }
            return null;
          },
          
          // Get dependency resolution metrics
          getDependencyMetrics: function() {
            if (window.app && window.app._dependencyGraph) {
              return {
                apiWait: window.app._dependencyGraph.apiWait,
                authWait: window.app._dependencyGraph.authWait,
                authCheck: window.app._dependencyGraph.authCheck,
                tokenValidation: window.app._dependencyGraph.tokenValidation,
                uiFlow: window.app._dependencyGraph.uiFlow
              };
            }
            return null;
          }
        },
        
        // BACKWARD COMPATIBILITY ASSURANCE: Compatibility layer
        compatibility: {
          // Check if legacy functions exist
          hasLegacyFunctions: function() {
            return {
              switchTab: typeof window.switchTab === 'function',
              toggleSidebar: typeof window.toggleSidebar === 'function',
              showNotification: typeof window.showNotification === 'function',
              loadExternalTab: typeof window.loadExternalTab === 'function'
            };
          },
          
          // Get NexopaCore status
          getNexopaCoreStatus: function() {
            return {
              exists: typeof window.NexopaCore !== 'undefined',
              components: window.NexopaCore ? Object.keys(window.NexopaCore) : []
            };
          }
        },
        
        // SYSTEM INTEGRATION: System status
        system: {
          // Get overall system status
          getStatus: function() {
            return {
              namespace: {
                initialized: window.app ? window.app._namespaceInitialized : false,
                coreRegistered: window.app ? window.app._coreRegistered : false
              },
              bootstrap: BOOTSTRAP_STATE.getStatusReport(),
              dependencies: {
                apiJs: BOOTSTRAP_STATE.dependencies.apiJs,
                domReady: BOOTSTRAP_STATE.dependencies.domReady,
                authReady: BOOTSTRAP_STATE.dependencies.authReady
              },
              timestamp: new Date().toISOString()
            };
          },
          
          // Get dependency graph
          getDependencyGraph: function() {
            return window.app ? window.app._dependencyGraph : null;
          },
          
          // Check system health
          getHealth: function() {
            const status = this.getStatus();
            return {
              healthy: status.bootstrap.phase === BOOTSTRAP_STATE.PHASES.READY,
              phase: status.bootstrap.phase,
              dependenciesReady: Object.values(status.dependencies).every(v => v),
              namespaceReady: status.namespace.initialized,
              coreRegistered: status.namespace.coreRegistered
            };
          }
        },
        
        // UTILITIES: Helper functions
        utils: {
          // Safe async operation
          safeAsync: async function(operation, errorHandler) {
            try {
              return await operation();
            } catch (error) {
              if (typeof errorHandler === 'function') {
                errorHandler(error);
              } else {
                console.error('Operation failed:', error);
              }
              throw error;
            }
          },
          
          // Debounce function
          debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
              const later = () => {
                clearTimeout(timeout);
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          },
          
          // Throttle function
          throttle: function(func, limit) {
            let inThrottle;
            return function(...args) {
              if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
              }
            };
          }
        }
      };
    },
    
    // Show auth UI
    showAuthUI: function() {
      console.log('👤 Showing authentication UI');
      
      // Hide loading screen if present
      this.hideLoadingScreen();
      
      // Ensure auth container is visible
      const authContainer = document.getElementById('authContainer') || 
                           document.querySelector('.auth-container') ||
                           document.querySelector('main');
      
      if (authContainer) {
        authContainer.classList.remove('hidden');
      }
      
      // Dispatch event for UI components
      const event = new CustomEvent('nexopa-auth-ui-required', {
        detail: {
          timestamp: new Date().toISOString(),
          reason: 'Public page or no valid session'
        }
      });
      window.dispatchEvent(event);
    },
    
    // Show dashboard UI
    showDashboardUI: function() {
      console.log('🏠 Showing dashboard UI');
      
      // Hide loading screen if present
      this.hideLoadingScreen();
      
      // Show main app container
      const appContainer = document.getElementById('appContainer') || 
                          document.querySelector('.app-container') ||
                          document.querySelector('main');
      
      if (appContainer) {
        appContainer.classList.remove('hidden');
      }
      
      // Dispatch event for UI components
      const event = new CustomEvent('nexopa-dashboard-ui-required', {
        detail: {
          timestamp: new Date().toISOString(),
          user: window.currentUser || AUTH_STATE?.getUser()
        }
      });
      window.dispatchEvent(event);
      
      // Start loading app content
      this.loadAppContent();
    },
    
    // Redirect to auth page
    redirectToAuth: function(reason = 'Authentication required') {
      console.log(`🔐 Redirecting to auth: ${reason}`);
      
      // Only redirect if not already on auth page
      const currentPath = window.location.pathname;
      const authPages = ['/', '/index.html', '/index.html', '/signup.html'];
      const isAuthPage = authPages.some(page => currentPath.endsWith(page));
      
      if (!isAuthPage) {
        // Store redirect path for after login
        const returnPath = currentPath + window.location.search;
        sessionStorage.setItem('nexopa_return_path', returnPath);
        
        // Small delay to allow event processing
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 100);
      } else {
        console.log('Already on auth page, not redirecting');
        this.showAuthUI();
      }
    },
    
    // Initialize global UI components
    initializeGlobalUI: async function() {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.UI_LOADING);
      console.log('🎨 Initializing global UI components...');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record UI initialization start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiInitialization = {
          started: true,
          startTime: new Date().toISOString(),
          components: []
        };
      }
      
      try {
        // 1. Initialize sidebar if present
        await this.initializeSidebar();
        
        // 2. Initialize navigation
        await this.initializeNavigation();
        
        // 3. Initialize theme
        await this.initializeTheme();
        
        // 4. Initialize notification system
        await this.initializeNotifications();
        
        // 5. Initialize responsive behaviors
        await this.initializeResponsiveBehaviors();
        
        console.log('✅ Global UI components initialized');
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record UI initialization success
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiInitialization.completed = true;
          window.app._dependencyGraph.uiInitialization.completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.success = true;
        }
        
      } catch (error) {
        console.error('⚠️ Global UI initialization failed:', error);
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record UI initialization failure
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiInitialization.completed = true;
          window.app._dependencyGraph.uiInitialization.completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.success = false;
          window.app._dependencyGraph.uiInitialization.error = error.message;
        }
        
        // Continue anyway - UI should degrade gracefully
      }
    },
    
    // Initialize sidebar
    initializeSidebar: function() {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return Promise.resolve();
      
      return new Promise((resolve) => {
        console.log('📐 Initializing sidebar...');
        
        // Record sidebar initialization
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          window.app._dependencyGraph.uiInitialization.components.push({
            name: 'sidebar',
            startTime: new Date().toISOString()
          });
        }
        
        // Remove hidden class if present
        sidebar.classList.remove('hidden');
        
        // Set initial state based on screen size
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          sidebar.classList.add('mobile-collapsed');
        } else {
          sidebar.classList.remove('mobile-collapsed');
        }
        
        // Setup toggle button if present
        const toggleButton = document.querySelector('.sidebar-toggle, #sidebarToggle');
        if (toggleButton) {
          toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.toggle('collapsed');
            
            // Dispatch event for other components
            const event = new CustomEvent('nexopa-sidebar-toggle', {
              detail: {
                collapsed: sidebar.classList.contains('collapsed'),
                timestamp: new Date().toISOString()
              }
            });
            window.dispatchEvent(event);
          });
        }
        
        console.log('✅ Sidebar initialized');
        
        // Record sidebar completion
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const sidebarIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'sidebar');
          if (sidebarIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].success = true;
          }
        }
        
        resolve();
      });
    },
    
    // Initialize navigation
    initializeNavigation: function() {
      console.log('🧭 Initializing navigation...');
      
      // Record navigation initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: 'navigation',
          startTime: new Date().toISOString()
        });
      }
      
      // Delegate to existing navigation system if available
      if (typeof window.switchTab === 'function') {
        console.log('✅ Using existing navigation system');
        
        // Record navigation completion
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const navIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'navigation');
          if (navIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[navIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[navIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[navIndex].success = true;
            window.app._dependencyGraph.uiInitialization.components[navIndex].method = 'existing_system';
          }
        }
        
        return Promise.resolve();
      }
      
      // Setup basic navigation listeners
      document.querySelectorAll('[data-nav]').forEach(element => {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          const target = element.getAttribute('data-nav');
          this.navigateTo(target);
        });
      });
      
      // Handle browser back/forward
      window.addEventListener('popstate', (event) => {
        if (event.state && event.state.page) {
          this.navigateTo(event.state.page, false);
        }
      });
      
      console.log('✅ Navigation initialized');
      
      // Record navigation completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const navIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'navigation');
        if (navIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[navIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[navIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[navIndex].success = true;
          window.app._dependencyGraph.uiInitialization.components[navIndex].method = 'basic_implementation';
        }
      }
      
      return Promise.resolve();
    },
    
    // Navigate to page
    navigateTo: function(page, pushState = true) {
      console.log(`🧭 Navigating to: ${page}`);
      
      // Update URL if needed
      if (pushState) {
        window.history.pushState({ page: page }, '', page);
      }
      
      // Dispatch navigation event
      const event = new CustomEvent('nexopa-navigation', {
        detail: {
          page: page,
          timestamp: new Date().toISOString(),
          pushState: pushState
        }
      });
      window.dispatchEvent(event);
    },
    
    // Initialize theme
    initializeTheme: function() {
      console.log('🎨 Initializing theme...');
      
      // Record theme initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: 'theme',
          startTime: new Date().toISOString()
        });
      }
      
      // Use settings service if available
      if (typeof SETTINGS_SERVICE !== 'undefined') {
        SETTINGS_SERVICE.applyTheme();
        console.log('✅ Theme initialized via settings service');
        
        // Record theme completion
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const themeIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'theme');
          if (themeIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[themeIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[themeIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[themeIndex].success = true;
            window.app._dependencyGraph.uiInitialization.components[themeIndex].method = 'settings_service';
          }
        }
        
        return Promise.resolve();
      }
      
      // Fallback theme initialization
      const html = document.documentElement;
      // FIX: see applyTheme() above — same 7th-theme-system issue existed
      // here too (separate key, dark-by-default, classes only, and a
      // matchMedia 'auto' listener with nothing left to drive since 'auto'
      // no longer exists).
      const savedTheme = (localStorage.getItem('app_theme') || localStorage.getItem('nexopa_theme')) === 'dark' ? 'dark' : 'light';

      // Remove all theme classes
      html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
      html.classList.add(`theme-${savedTheme}`);
      html.classList.toggle('dark-theme', savedTheme === 'dark');
      html.setAttribute('data-theme', savedTheme);
      try { (window.ThemeManager ? window.ThemeManager.setTheme(savedTheme) : localStorage.setItem('app_theme', savedTheme)); } catch (_) {}
      
      console.log(`✅ Theme initialized: ${savedTheme}`);
      
      // Record theme completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const themeIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'theme');
        if (themeIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[themeIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[themeIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[themeIndex].success = true;
          window.app._dependencyGraph.uiInitialization.components[themeIndex].method = 'fallback';
          window.app._dependencyGraph.uiInitialization.components[themeIndex].theme = savedTheme;
        }
      }
      
      return Promise.resolve();
    },
    
    // Initialize notifications
    initializeNotifications: function() {
      console.log('🔔 Initializing notification system...');
      
      // Record notification initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: 'notifications',
          startTime: new Date().toISOString()
        });
      }
      
      // Create notification container if not exists
      let container = document.getElementById('notification-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        `;
        document.body.appendChild(container);
      }
      
      // Expose notification method
      window.showNotification = function(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
          background: ${type === 'error' ? '#f87171' : 
                      type === 'success' ? '#10b981' : 
                      type === 'warning' ? '#f59e0b' : 
                      '#3b82f6'};
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          animation: slideInRight 0.3s ease-out;
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 400px;
        `;
        
        notification.innerHTML = `
          <span>${message}</span>
          <button class="notification-close" style="
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            margin-left: 10px;
            font-size: 18px;
          ">&times;</button>
        `;
        
        container.appendChild(notification);
        
        // Close button handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
          notification.style.animation = 'slideOutRight 0.3s ease-in';
          setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-remove after duration
        if (duration > 0) {
          setTimeout(() => {
            if (notification.parentNode) {
              notification.style.animation = 'slideOutRight 0.3s ease-in';
              setTimeout(() => notification.remove(), 300);
            }
          }, duration);
        }
        
        // Add CSS animation if not already added
        if (!document.getElementById('notification-animations')) {
          const style = document.createElement('style');
          style.id = 'notification-animations';
          style.textContent = `
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
              from { transform: translateX(0); opacity: 1; }
              to { transform: translateX(100%); opacity: 0; }
            }
          `;
          document.head.appendChild(style);
        }
        
        return notification;
      };
      
      console.log('✅ Notification system initialized');
      
      // Record notification completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const notifIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'notifications');
        if (notifIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[notifIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[notifIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[notifIndex].success = true;
        }
      }
      
      return Promise.resolve();
    },
    
    // Initialize responsive behaviors
    initializeResponsiveBehaviors: function() {
      console.log('📱 Initializing responsive behaviors...');
      
      // Record responsive initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: 'responsive',
          startTime: new Date().toISOString()
        });
      }
      
      // Handle window resize
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.handleResponsiveChange();
        }, 250);
      });
      
      // Initial responsive setup
      this.handleResponsiveChange();
      
      console.log('✅ Responsive behaviors initialized');
      
      // Record responsive completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const respIndex = window.app._dependencyGraph.uiInitialization.components.findIndex(c => c.name === 'responsive');
        if (respIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[respIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[respIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[respIndex].success = true;
        }
      }
      
      return Promise.resolve();
    },
    
    // Handle responsive changes
    handleResponsiveChange: function() {
      const isMobile = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const isDesktop = window.innerWidth >= 1024;
      
      // Update body classes
      document.body.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
      document.body.classList.add(
        isMobile ? 'mobile-view' :
        isTablet ? 'tablet-view' :
        'desktop-view'
      );
      
      // Handle sidebar state
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        if (isMobile) {
          sidebar.classList.add('mobile-collapsed');
        } else {
          sidebar.classList.remove('mobile-collapsed');
        }
      }
      
      // Dispatch responsive change event
      const event = new CustomEvent('nexopa-responsive-change', {
        detail: {
          isMobile: isMobile,
          isTablet: isTablet,
          isDesktop: isDesktop,
          width: window.innerWidth,
          height: window.innerHeight,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Load app content
// ============================================================================
// SESSION-AWARE APP CONTENT LOADER
// ============================================================================

loadAppContent: function() {
  console.log('📦 Loading app content with session-aware sequencing...');
  
  // Validate session is ready before proceeding
  const validateSession = () => {
    if (window.currentUser) return true;
    if (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser()) {
      window.currentUser = AUTH_STATE.getUser();
      return true;
    }
    return false;
  };
  
  // Step 1: Dispatch content loading event with session info
  const user = window.currentUser || (AUTH_STATE && AUTH_STATE.getUser());
  const event = new CustomEvent('nexopa-content-loading', {
    detail: {
      timestamp: new Date().toISOString(),
      user: user,
      sessionReady: !!user
    }
  });
  window.dispatchEvent(event);
  
  // Step 2: Validate session first (CRITICAL FIX)
  if (!validateSession()) {
    console.warn('⚠️ Session not ready, delaying content load...');
    
    // Wait for session to be ready
    const waitForSession = () => {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (validateSession()) {
            clearInterval(checkInterval);
            console.log('✅ Session ready, proceeding with content load');
            resolve(true);
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          console.log('⚠️ Session wait timeout, proceeding anyway');
          resolve(false);
        }, 5000);
      });
    };
    
    waitForSession().then((sessionReady) => {
      if (!sessionReady) {
        console.error('❌ Session never became ready, showing auth UI');
        APP_BOOTSTRAP.showAuthUI();
        return;
      }
      this.loadAppContentInternal();
    });
    
    return;
  }
  
  // Session is ready, proceed with internal loading
  this.loadAppContentInternal();
},

// Internal content loading with proper sequencing
loadAppContentInternal: function() {
  console.log('🔄 Executing session-aware content loading sequence');
  
  // Step 1: Initialize navigation first (before any pages load)
  this.initializeNavigationContainer().then(() => {
    
    // Step 2: Determine which page to load
    const pageToLoad = this.determinePageToLoad();
    
    // Step 3: Load the parent shell (chat.html) if not already loaded
    this.ensureParentShellLoaded().then(() => {
      
      // Step 4: Load the determined page
      this.loadPageSafely(pageToLoad);
      
      // Step 5: Initialize iframe coordination for future page loads
      this.initializeIframeCoordination();
      
    }).catch((error) => {
      console.error('❌ Failed to ensure parent shell:', error);
      this.showFatalError(new Error('Parent shell failed to load'));
    });
    
  }).catch((error) => {
    console.error('❌ Navigation initialization failed:', error);
    // Continue without navigation (graceful degradation)
    const pageToLoad = this.determinePageToLoad();
    this.loadPageSafely(pageToLoad);
  });
},

// Initialize navigation container before loading any pages
initializeNavigationContainer: function() {
  return new Promise((resolve) => {
    console.log('🧭 Initializing navigation container...');
    
    // Find navigation container using APP_CONFIG
    const navSelectors = APP_CONFIG.navigation?.container || 
                        '#nav-container, .navigation-container, nav';
    const navContainer = document.querySelector(navSelectors);
    
    if (!navContainer) {
      console.log('⚠️ Navigation container not found, creating one');
      
      // Create navigation container if it doesn't exist
      const newNav = document.createElement('nav');
      newNav.id = 'navigation-container';
      newNav.className = 'navigation-container';
      newNav.style.cssText = `
        position: relative;
        z-index: 1000;
        background: var(--kyn-bg-panel);
        padding: 10px;
        display: flex;
        gap: 10px;
        border-bottom: 1px solid var(--border-color);
      `;
      
      // Add navigation items based on APP_CONFIG.pages
      if (APP_CONFIG.pages) {
        Object.keys(APP_CONFIG.pages).forEach(pageKey => {
          const page = APP_CONFIG.pages[pageKey];
          if (page.requiresAuth !== false) {
            const navItem = document.createElement('button');
            navItem.className = 'nav-item';
            navItem.dataset.page = pageKey;
            navItem.innerHTML = `${page.icon || '📄'} ${page.title || pageKey}`;
            navItem.style.cssText = `
              padding: 8px 12px;
              border: none;
              background: transparent;
              color: var(--text-primary);
              cursor: pointer;
              border-radius: 4px;
              display: flex;
              align-items: center;
              gap: 6px;
            `;
            
            navItem.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.loadPageSafely(pageKey);
            });
            
            newNav.appendChild(navItem);
          }
        });
      }
      
      // Add to body
      const appContainer = document.querySelector(APP_CONFIG.parentShell?.containerId || '#app-container');
      if (appContainer) {
        appContainer.prepend(newNav);
      } else {
        document.body.prepend(newNav);
      }
      
      console.log('✅ Created navigation container');
    } else {
      console.log('✅ Navigation container found');
      
      // Setup existing navigation items
      navContainer.querySelectorAll('[data-page], [data-tab]').forEach(item => {
        const pageKey = item.getAttribute('data-page') || item.getAttribute('data-tab');
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.loadPageSafely(pageKey);
        });
      });
    }
    
    // Mark navigation as ready
    window.dispatchEvent(new CustomEvent('nexopa-navigation-ready', {
      detail: { timestamp: new Date().toISOString() }
    }));
    
    resolve();
  });
},

// Determine which page to load with safe session storage handling
determinePageToLoad: function() {
  console.log('🔍 Determining page to load...');
  
  // Priority 1: Check for valid session storage value
  let savedPageKey = null;
  try {
    const savedValue = sessionStorage.getItem('nexopa_last_page');
    
    if (savedValue) {
      // Validate it's not [object Object] or malformed
      if (savedValue.startsWith('[object') || 
          savedValue.includes('Object]') || 
          savedValue.trim() === '') {
        console.warn('⚠️ Invalid session storage value detected, removing:', savedValue);
        sessionStorage.removeItem('nexopa_last_page');
        savedPageKey = null;
      } else if (APP_CONFIG.pages && APP_CONFIG.pages[savedValue]) {
        // Valid page key
        savedPageKey = savedValue;
        console.log('✅ Restoring page from session storage:', savedPageKey);
      } else if (savedValue.endsWith('.html')) {
        // Direct HTML file - find matching page key
        if (APP_CONFIG.pages) {
          const matchingKey = Object.keys(APP_CONFIG.pages).find(
            key => APP_CONFIG.pages[key].file === savedValue
          );
          if (matchingKey) {
            savedPageKey = matchingKey;
            console.log('✅ Mapped HTML file to page key:', savedValue, '->', savedPageKey);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error reading session storage:', error);
    sessionStorage.removeItem('nexopa_last_page');
  }
  
  // Priority 2: Use default page from APP_CONFIG
  if (!savedPageKey && APP_CONFIG.defaultPageKey && APP_CONFIG.pages) {
    if (APP_CONFIG.pages[APP_CONFIG.defaultPageKey]) {
      savedPageKey = APP_CONFIG.defaultPageKey;
      console.log('✅ Using default page key:', savedPageKey);
    }
  }
  
  // Priority 3: Fallback to 'chat'
  if (!savedPageKey) {
    savedPageKey = 'chat';
    console.log('⚠️ Using fallback page key: chat');
  }
  
  // Validate the page exists
  if (!APP_CONFIG.pages || !APP_CONFIG.pages[savedPageKey]) {
    console.error('❌ Page not found in config:', savedPageKey);
    savedPageKey = 'chat';
  }
  
  console.log('🎯 Determined page to load:', {
    pageKey: savedPageKey,
    pageConfig: APP_CONFIG.pages[savedPageKey]
  });
  
  return savedPageKey;
},

// Ensure parent shell (chat.html) is loaded
ensureParentShellLoaded: function() {
  return new Promise((resolve) => {
    // Check if we're already in the parent shell
    const currentPath = window.location.pathname;
    const parentShellFile = APP_CONFIG.parentShell?.file || 'chat.html';
    
    if (currentPath.endsWith(parentShellFile) || currentPath.endsWith('/')) {
      console.log('✅ Already in parent shell');
      resolve();
      return;
    }
    
    // If not in parent shell, check if parent container exists
    const parentContainerId = APP_CONFIG.parentShell?.containerId || 'app-container';
    const parentContainer = document.getElementById(parentContainerId);
    
    if (parentContainer) {
      console.log('✅ Parent container exists');
      resolve();
      return;
    }
    
    console.log('⚠️ Parent shell not detected, but continuing...');
    resolve(); // Continue anyway for graceful degradation
  });
},

// Safely load a page with error handling and session propagation
loadPageSafely: function(pageKey) {
  console.log(`🚀 Loading page: ${pageKey}`);
  
  // Validate page exists
  if (!APP_CONFIG.pages || !APP_CONFIG.pages[pageKey]) {
    console.error(`❌ Page "${pageKey}" not found in config`);
    pageKey = 'chat'; // Fallback to chat
  }
  
  const pageConfig = APP_CONFIG.pages[pageKey];
  
  // Save to session storage safely
  try {
    // Store only the page key, not the object
    sessionStorage.setItem('nexopa_last_page', pageKey);
    console.log('💾 Saved page key to session storage:', pageKey);
  } catch (error) {
    console.error('❌ Failed to save to session storage:', error);
  }
  
  // Update active navigation
  this.updateActiveNavigation(pageKey);
  
  // Load the page based on its type
  if (pageConfig.isIframe && !pageConfig.isParent) {
    // Load as iframe within parent shell
    this.loadIframePage(pageConfig);
  } else {
    // Load as main page (chat.html is already loaded)
    this.loadMainPage(pageConfig);
  }
},

// Load iframe page with session propagation
loadIframePage: function(pageConfig) {
  console.log(`🖼️ Loading iframe page: ${pageConfig.title || pageConfig.file}`);
  
  // Find iframe container
  const containerSelector = pageConfig.container || 
                          APP_CONFIG.parentShell?.iframeContainer || 
                          '#iframe-container, .page-container';
  const container = document.querySelector(containerSelector);
  
  if (!container) {
    console.error(`❌ Iframe container not found: ${containerSelector}`);
    
    // Try to create container
    const newContainer = document.createElement('div');
    newContainer.id = 'iframe-container';
    newContainer.className = 'page-container';
    newContainer.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
    `;
    
    const appContainer = document.querySelector(APP_CONFIG.parentShell?.containerId || '#app-container');
    if (appContainer) {
      // Insert after navigation
      const nav = appContainer.querySelector('#navigation-container, nav');
      if (nav && nav.nextSibling) {
        appContainer.insertBefore(newContainer, nav.nextSibling);
      } else {
        appContainer.appendChild(newContainer);
      }
    } else {
      document.body.appendChild(newContainer);
    }
    
    console.log('✅ Created iframe container');
    this.loadIframePage(pageConfig); // Retry
    return;
  }
  
  // Clear existing iframes
  container.innerHTML = '';
  
  // Create new iframe
  const iframe = document.createElement('iframe');
  iframe.id = pageConfig.id;
  iframe.className = 'page-iframe';
  iframe.src = pageConfig.file;
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  `;
  iframe.setAttribute('data-page-key', Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id));
  iframe.setAttribute('loading', 'eager');
  
  // Add loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'iframe-loading';
  loadingDiv.innerHTML = `Loading ${pageConfig.title || 'page'}...`;
  loadingDiv.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--text-secondary);
  `;
  
  container.appendChild(loadingDiv);
  container.appendChild(iframe);
  
  // Set up iframe load event
  iframe.addEventListener('load', () => {
    console.log(`✅ Iframe loaded: ${pageConfig.id}`);
    
    // Remove loading indicator
    if (loadingDiv.parentNode) {
      loadingDiv.remove();
    }
    
    // Propagate session to iframe
    this.propagateSessionToIframe(iframe, pageConfig);
    
    // Dispatch page loaded event
    window.dispatchEvent(new CustomEvent('nexopa-page-loaded', {
      detail: {
        pageId: pageConfig.id,
        pageKey: Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id),
        isIframe: true,
        timestamp: new Date().toISOString()
      }
    }));
  });
  
  iframe.addEventListener('error', (error) => {
    console.error(`❌ Iframe failed to load: ${pageConfig.file}`, error);
    
    // Show error message
    loadingDiv.innerHTML = `Failed to load ${pageConfig.title || 'page'}.<br>Please try again.`;
    loadingDiv.style.color = 'var(--error-color, #f87171)';
    
    // Retry after 3 seconds
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.src = iframe.src; // Reload
      }
    }, 3000);
  });
},

// Propagate session to iframe
propagateSessionToIframe: function(iframe, pageConfig) {
  try {
    // Wait for iframe to be ready
    const sendSession = () => {
      if (iframe.contentWindow) {
        const sessionData = {
          type: 'nexopa-session-data',
          user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
          token: AUTH_STATE ? AUTH_STATE.getToken() : null,
          timestamp: new Date().toISOString(),
          pageConfig: pageConfig
        };
        
        iframe.contentWindow.postMessage(sessionData, '*');
        console.log(`📤 Session propagated to iframe: ${pageConfig.id}`);
      } else {
        setTimeout(sendSession, 100);
      }
    };
    
    sendSession();
  } catch (error) {
    console.error(`❌ Failed to propagate session to iframe ${pageConfig.id}:`, error);
  }
},

// Load main page (non-iframe)
loadMainPage: function(pageConfig) {
  console.log(`🏠 Loading main page: ${pageConfig.title || pageConfig.file}`);
  
  // For chat.html (parent shell), we're already there
  if (pageConfig.isParent) {
    console.log('✅ Already on parent shell page');
    
    // Make sure navigation is active for this page
    this.updateActiveNavigation(Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id));
    
    // Dispatch page loaded event
    window.dispatchEvent(new CustomEvent('nexopa-page-loaded', {
      detail: {
        pageId: pageConfig.id,
        pageKey: Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id),
        isIframe: false,
        timestamp: new Date().toISOString()
      }
    }));
    
    return;
  }
  
  // For other non-iframe pages, use appropriate loading method
  if (typeof window.loadPage === 'function') {
    window.loadPage(pageConfig.file);
  } else if (typeof window.loadExternalTab === 'function') {
    const pageKey = Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id);
    window.loadExternalTab(pageKey, pageConfig.file);
  } else {
    // Fallback navigation
    window.location.href = pageConfig.file;
  }
},

// Update active navigation state
updateActiveNavigation: function(pageKey) {
  console.log(`🧭 Updating active navigation for: ${pageKey}`);
  
  // Remove active class from all nav items
  document.querySelectorAll('.nav-item.active, [data-page].active, [data-tab].active').forEach(item => {
    item.classList.remove('active');
  });
  
  // Add active class to current nav item
  const selectors = [
    `.nav-item[data-page="${pageKey}"]`,
    `[data-page="${pageKey}"]`,
    `[data-tab="${pageKey}"]`,
    `[data-nav="${pageKey}"]`
  ];
  
  let activeItem = null;
  for (const selector of selectors) {
    activeItem = document.querySelector(selector);
    if (activeItem) break;
  }
  
  if (activeItem) {
    activeItem.classList.add('active');
    console.log('✅ Navigation updated');
  } else {
    console.log('⚠️ Navigation item not found for:', pageKey);
  }
},

// Initialize iframe coordination system
initializeIframeCoordination: function() {
  console.log('🔗 Initializing iframe coordination system...');
  
  // This will be handled by the existing IFRAME_COORDINATOR
  // We just need to ensure it's started after session is ready
  
  if (typeof IFRAME_COORDINATOR !== 'undefined' && IFRAME_COORDINATOR.initialize) {
    setTimeout(() => {
      IFRAME_COORDINATOR.initialize();
    }, 1000); // Delay to ensure session is fully propagated
  }
},

    // Setup coordination systems
    setupCoordinationSystems: async function() {
      console.log('🔗 Setting up coordination systems...');
      
      // DEPENDENCY RESOLUTION INTEGRITY: Record coordination setup start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.coordinationSetup = {
          started: true,
          startTime: new Date().toISOString(),
          systems: []
        };
      }
      
      try {
        // 1. Setup event coordination
        this.setupEventCoordination();
        
        // 2. Setup iframe coordination
        this.setupIframeCoordination();
        
        // 3. Setup error handling
        this.setupErrorHandling();
        
        // 4. Setup session monitoring
        this.setupSessionMonitoring();
        
        // 5. Setup performance monitoring
        this.setupPerformanceMonitoring();
        
        // 6. Trigger background sync if available
        this.triggerBackgroundSync();
        
        console.log('✅ Coordination systems setup complete');
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record coordination setup success
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coordinationSetup.completed = true;
          window.app._dependencyGraph.coordinationSetup.completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.success = true;
        }
        
      } catch (error) {
        console.error('⚠️ Coordination setup failed:', error);
        
        // DEPENDENCY RESOLUTION INTEGRITY: Record coordination setup failure
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coordinationSetup.completed = true;
          window.app._dependencyGraph.coordinationSetup.completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.success = false;
          window.app._dependencyGraph.coordinationSetup.error = error.message;
        }
        
        // Continue anyway
      }
    },
    
    // Setup event coordination
    setupEventCoordination: function() {
      console.log('📡 Setting up event coordination...');
      
      // Record event coordination setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'event_coordination',
          startTime: new Date().toISOString()
        });
      }
      
      // Create event bridge for cross-component communication
      window.NexopaEvents = {
        listeners: new Map(),
        
        on: function(eventName, callback) {
          if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
          }
          this.listeners.get(eventName).push(callback);
          
          // Also add to window event listener for backward compatibility
          window.addEventListener(eventName, callback);
        },
        
        off: function(eventName, callback) {
          if (this.listeners.has(eventName)) {
            const callbacks = this.listeners.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
              callbacks.splice(index, 1);
            }
          }
          
          window.removeEventListener(eventName, callback);
        },
        
        emit: function(eventName, data) {
          const event = new CustomEvent(eventName, {
            detail: data,
            bubbles: true,
            cancelable: true
          });
          window.dispatchEvent(event);
        },
        
        once: function(eventName, callback) {
          const onceCallback = (event) => {
            callback(event.detail);
            this.off(eventName, onceCallback);
          };
          this.on(eventName, onceCallback);
        }
      };
      
      // Setup global event logger (development only)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const originalDispatch = window.dispatchEvent;
        window.dispatchEvent = function(event) {
          if (event.type.startsWith('nexopa-')) {
            console.log(`📡 Event: ${event.type}`, event.detail || '');
          }
          return originalDispatch.call(this, event);
        };
      }
      
      console.log('✅ Event coordination setup complete');
      
      // Record event coordination completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const eventIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(s => s.name === 'event_coordination');
        if (eventIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].success = true;
        }
      }
    },
    
    // Setup iframe coordination
    setupIframeCoordination: function() {
      console.log('🖼️ Setting up iframe coordination...');
      
      // Record iframe coordination setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'iframe_coordination',
          startTime: new Date().toISOString()
        });
      }
      
      // Store iframe references
      window.NexopaIframes = new Map();
      
      // Listen for iframe messages
      window.addEventListener('message', (event) => {
        // Security check
        if (event.origin !== window.location.origin && 
            !event.origin.includes('localhost') && 
            !event.origin.includes('127.0.0.1')) {
          return;
        }
        
        const data = event.data;
        
        // Handle different message types
        switch(data?.type) {
          case 'nexopa-iframe-ready':
            this.handleIframeReady(event.source, data);
            break;
            
          case 'nexopa-iframe-auth-request':
            this.handleIframeAuthRequest(event.source, data);
            break;
            
          case 'nexopa-iframe-data-request':
            this.handleIframeDataRequest(event.source, data);
            break;
            
          case 'nexopa-iframe-action':
            this.handleIframeAction(event.source, data);
            break;
            
          case 'nexopa-iframe-navigate':
            this.handleIframeNavigate(data);
            break;
        }
      });
      
      // Provide API for iframes to communicate
      window.NexopaIframeAPI = {
        sendToParent: function(type, data) {
          window.parent.postMessage({
            type: type,
            data: data,
            source: 'nexopa-iframe',
            timestamp: new Date().toISOString()
          }, '*');
        },
        
        requestAuthState: function() {
          return new Promise((resolve) => {
            const listener = (event) => {
              if (event.data?.type === 'nexopa-auth-state-response') {
                window.removeEventListener('message', listener);
                resolve(event.data.data);
              }
            };
            window.addEventListener('message', listener);
            
            this.sendToParent('nexopa-iframe-auth-request');
          });
        },
        
        requestData: function(key) {
          return new Promise((resolve) => {
            const listener = (event) => {
              if (event.data?.type === 'nexopa-data-response' && event.data.key === key) {
                window.removeEventListener('message', listener);
                resolve(event.data.data);
              }
            };
            window.addEventListener('message', listener);
            
            this.sendToParent('nexopa-iframe-data-request', { key: key });
          });
        }
      };
      
      console.log('✅ Iframe coordination setup complete');
      
      // Record iframe coordination completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const iframeIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(s => s.name === 'iframe_coordination');
        if (iframeIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].success = true;
        }
      }
    },
    
    // Handle iframe ready
    handleIframeReady: function(iframeWindow, data) {
      console.log('🖼️ Iframe ready:', data.iframeId);
      
      // Store iframe reference
      window.NexopaIframes.set(data.iframeId, {
        window: iframeWindow,
        id: data.iframeId,
        ready: true,
        lastActive: Date.now()
      });
      
      // Send initial state to iframe
      this.sendInitialStateToIframe(iframeWindow);
    },
    
    // Handle iframe auth request
    handleIframeAuthRequest: function(iframeWindow, data) {
      console.log('🔐 Iframe auth request');
      
      // Send auth state to iframe
      iframeWindow.postMessage({
        type: 'nexopa-auth-state-response',
        data: {
          user: window.currentUser || AUTH_STATE?.getUser(),
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
          validated: window.currentUser?.validated || false,
          timestamp: new Date().toISOString()
        }
      }, '*');
    },
    
    // Handle iframe data request
    handleIframeDataRequest: function(iframeWindow, data) {
      console.log('📊 Iframe data request:', data.key);
      
      let responseData = null;
      
      // Get requested data
      switch(data.key) {
        case 'userProfile':
          responseData = window.currentUser || AUTH_STATE?.getUser();
          break;
        case 'settings':
          responseData = SETTINGS_SERVICE?.current || {};
          break;
        case 'networkStatus':
          responseData = {
            status: API_COORDINATION?.getNetworkStatus() || 'unknown',
            backendReachable: window.NexopaConfig?.backendReachable,
            isOnline: API_COORDINATION?.getNetworkStatus() === 'online'
          };
          break;
        default:
          // Try to get from cache
          if (typeof DATA_CACHE !== 'undefined') {
            responseData = DATA_CACHE.getInstant(data.key);
          }
      }
      
      // Send response
      iframeWindow.postMessage({
        type: 'nexopa-data-response',
        key: data.key,
        data: responseData,
        timestamp: new Date().toISOString()
      }, '*');
    },
    
    // Handle iframe action
    handleIframeAction: function(iframeWindow, data) {
      console.log('⚡ Iframe action:', data.action);
      
      // Handle different actions
      switch(data.action) {
        case 'logout':
          if (typeof window.logout === 'function') {
            window.logout();
          }
          break;
          
        case 'refresh':
          if (typeof window.location !== 'undefined') {
            window.location.reload();
          }
          break;
          
        case 'navigate':
          if (data.target) {
            this.navigateTo(data.target);
          }
          break;
          
        case 'showNotification':
          if (typeof window.showNotification === 'function' && data.message) {
            window.showNotification(data.message, data.type || 'info', data.duration);
          }
          break;
      }
    },
    
    // Handle iframe navigation
    handleIframeNavigate: function(data) {
      console.log('🧭 Iframe navigation request:', data.target);
      
      if (data.target) {
        this.navigateTo(data.target);
      }
    },
    
    // Send initial state to iframe
    sendInitialStateToIframe: function(iframeWindow) {
      const initialState = {
        type: 'nexopa-initial-state',
        auth: {
          user: window.currentUser || AUTH_STATE?.getUser(),
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
          validated: window.currentUser?.validated || false
        },
        network: {
          status: API_COORDINATION?.getNetworkStatus() || 'unknown',
          backendReachable: window.NexopaConfig?.backendReachable,
          isOnline: API_COORDINATION?.getNetworkStatus() === 'online'
        },
        settings: SETTINGS_SERVICE?.current || {},
        bootstrap: BOOTSTRAP_STATE.getStatusReport(),
        timestamp: new Date().toISOString()
      };
      
      iframeWindow.postMessage(initialState, '*');
    },
    
    // Trigger background sync
    triggerBackgroundSync: function() {
      console.log('🔄 Triggering background sync if available...');
      
      // Check for modular API background sync
      if (window.api && window.api.core && window.api.core.syncBackgroundTasks) {
        try {
          window.api.core.syncBackgroundTasks();
          console.log('✅ Background sync triggered');
        } catch (error) {
          console.log('⚠️ Background sync failed:', error);
        }
      }
      
      // Check for request queue processing
      if (window.api && window.api.request && window.api.request.processQueue) {
        try {
          window.api.request.processQueue();
          console.log('✅ Request queue processing triggered');
        } catch (error) {
          console.log('⚠️ Request queue processing failed:', error);
        }
      }
      
      // Check for caching features
      if (window.api && window.api.request && window.api.request.prefetchCriticalResources) {
        try {
          window.api.request.prefetchCriticalResources();
          console.log('✅ Resource prefetch triggered');
        } catch (error) {
          console.log('⚠️ Resource prefetch failed:', error);
        }
      }
    },
    
    // Setup error handling
    setupErrorHandling: function() {
      console.log('🛡️ Setting up error handling...');
      
      // Record error handling setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'error_handling',
          startTime: new Date().toISOString()
        });
      }
      
      // Global error handler
      window.addEventListener('error', (event) => {
        console.error('🚨 Global error caught:', event.error);
        
        // Don't show error for missing resources
        if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT')) {
          return;
        }
        
        // Show user-friendly error
        this.showErrorToUser('An unexpected error occurred. The app will continue to work in limited mode.');
        
        // Dispatch error event for other components
        const errorEvent = new CustomEvent('nexopa-global-error', {
          detail: {
            error: event.error,
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(errorEvent);
      });
      
      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        console.error('🚨 Unhandled promise rejection:', event.reason);
        
        // Show user-friendly error
        this.showErrorToUser('An operation failed. Please try again.');
        
        // Dispatch error event
        const errorEvent = new CustomEvent('nexopa-unhandled-rejection', {
          detail: {
            reason: event.reason,
            promise: event.promise,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(errorEvent);
      });
      
      // Network error handler
      window.addEventListener('offline', () => {
        this.showErrorToUser('You are offline. Some features may be limited.', 'warning');
      });
      
      console.log('✅ Error handling setup complete');
      
      // Record error handling completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const errorIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(s => s.name === 'error_handling');
        if (errorIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].success = true;
        }
      }
    },
    
    // Show error to user
    showErrorToUser: function(message, type = 'error') {
      if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, 10000);
      } else {
        // Fallback error display
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${type === 'error' ? '#f87171' : '#f59e0b'};
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          z-index: 9999;
          max-width: 300px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          animation: slideInRight 0.3s ease-out;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
          if (errorDiv.parentNode) {
            errorDiv.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => errorDiv.remove(), 300);
          }
        }, 10000);
      }
    },
    
    // Setup session monitoring
    setupSessionMonitoring: function() {
      console.log('⏰ Setting up session monitoring...');
      
      // Record session monitoring setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'session_monitoring',
          startTime: new Date().toISOString()
        });
      }
      
      // Check session validity periodically
      setInterval(() => {
        this.checkSessionValidity();
      }, 5 * 60 * 1000); // Every 5 minutes
      
      // Monitor user activity
      let activityTimeout;
      const resetActivityTimeout = () => {
        clearTimeout(activityTimeout);
        // Set timeout for 30 minutes of inactivity
        activityTimeout = setTimeout(() => {
          this.handleUserInactivity();
        }, 30 * 60 * 1000);
      };
      
      // Reset on user activity
      ['mousedown', 'keydown', 'touchstart', 'mousemove'].forEach(event => {
        window.addEventListener(event, resetActivityTimeout, { passive: true });
      });
      
      resetActivityTimeout(); // Start monitoring
      
      console.log('✅ Session monitoring setup complete');
      
      // Record session monitoring completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const sessionIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(s => s.name === 'session_monitoring');
        if (sessionIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].success = true;
        }
      }
    },
    
    // Check session validity
    checkSessionValidity: function() {
      if (typeof AUTH_STATE === 'undefined' || !AUTH_STATE.hasToken()) {
        return;
      }
      
      // Check if token is expired
      if (AUTH_STATE._tokenExpiry) {
        const expiryDate = new Date(AUTH_STATE._tokenExpiry);
        const now = new Date();
        const timeUntilExpiry = expiryDate - now;
        
        // If token expires in less than 5 minutes, try to refresh
        if (timeUntilExpiry < (5 * 60 * 1000)) {
          console.log('🔐 Token expires soon, attempting refresh...');
          
          if (typeof TOKEN_VALIDATION !== 'undefined' && TOKEN_VALIDATION.refreshToken) {
            TOKEN_VALIDATION.refreshToken().then(result => {
              if (!result.success) {
                console.log('⚠️ Token refresh failed, user will need to re-authenticate soon');
              }
            });
          }
        }
      }
    },
    
    // Handle user inactivity
    handleUserInactivity: function() {
      console.log('⏰ User inactive for 30 minutes');
      
      // Show inactivity warning
      if (typeof window.showNotification === 'function') {
        window.showNotification('You have been inactive for 30 minutes. Session will expire soon.', 'warning', 10000);
      }
      
      // Dispatch inactivity event
      const event = new CustomEvent('nexopa-user-inactivity', {
        detail: {
          duration: '30m',
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Setup performance monitoring
    setupPerformanceMonitoring: function() {
      console.log('📊 Setting up performance monitoring...');
      
      // Record performance monitoring setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'performance_monitoring',
          startTime: new Date().toISOString()
        });
      }
      
      // Only in development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Monitor load times
        window.addEventListener('load', () => {
          const timing = performance.timing;
          const loadTime = timing.loadEventEnd - timing.navigationStart;
          const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;
          
          console.log(`📊 Performance metrics:
            - Load time: ${loadTime}ms
            - DOM ready: ${domReadyTime}ms
            - Redirects: ${timing.redirectEnd - timing.redirectStart}ms
            - DNS: ${timing.domainLookupEnd - timing.domainLookupStart}ms
            - TCP: ${timing.connectEnd - timing.connectStart}ms
            - Request: ${timing.responseStart - timing.requestStart}ms
            - Response: ${timing.responseEnd - timing.responseStart}ms
          `);
        });
        
        // Monitor memory usage (if supported)
        if (performance.memory) {
          setInterval(() => {
            const memory = performance.memory;
            console.log(`📊 Memory usage:
              - Used JS heap: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB
              - Total JS heap: ${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB
              - Heap limit: ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB
            `);
          }, 30000);
        }
      }
      
      console.log('✅ Performance monitoring setup complete');
      
      // Record performance monitoring completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const perfIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(s => s.name === 'performance_monitoring');
        if (perfIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[perfIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[perfIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[perfIndex].success = true;
        }
      }
    },
    
    // Attempt recovery from bootstrap failure
    attemptRecovery: async function(error) {
      console.log('🔄 Attempting recovery from bootstrap failure...');
      
      this.currentRetry++;
      
      // Record recovery attempt
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.recoveryAttempts = window.app._dependencyGraph.recoveryAttempts || [];
        window.app._dependencyGraph.recoveryAttempts.push({
          attempt: this.currentRetry,
          maxRetries: this.MAX_RETRIES,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      if (this.currentRetry <= this.MAX_RETRIES) {
        console.log(`🔄 Retry attempt ${this.currentRetry}/${this.MAX_RETRIES} in ${this.RETRY_DELAY}ms`);
        
        // Show retry message to user
        this.showErrorToUser(`Application startup failed. Retrying... (${this.currentRetry}/${this.MAX_RETRIES})`, 'warning');
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        
        // Retry bootstrap
        return this.bootstrap();
      } else {
        console.error('❌ Maximum retries exceeded, showing fatal error');
        
        // Record max retries exceeded
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.maxRetriesExceeded = true;
          window.app._dependencyGraph.maxRetriesExceededAt = new Date().toISOString();
        }
        
        this.showFatalError(error);
        throw error;
      }
    },
    
    // Show fatal error
    showFatalError: function(error) {
      // Hide everything
      document.body.innerHTML = '';
      
      // Show error screen
      const errorScreen = document.createElement('div');
      errorScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #1f2937;
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      errorScreen.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
        <h1 style="font-size: 24px; margin-bottom: 16px;">Application Failed to Start</h1>
        <p style="margin-bottom: 24px; max-width: 500px; opacity: 0.8;">
          The application encountered a critical error and cannot continue.
          Please try refreshing the page or contact support if the problem persists.
        </p>
        <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px; max-width: 500px; text-align: left;">
          <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Error Details:</div>
          <div style="font-family: monospace; font-size: 12px;">${error.message}</div>
        </div>
        <div style="display: flex; gap: 12px;">
          <button id="retryButton" style="
            background: #8b5cf6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          ">Try Again</button>
          <button id="reportButton" style="
            background: transparent;
            color: #8b5cf6;
            border: 1px solid #8b5cf6;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          ">Report Issue</button>
        </div>
      `;
      
      document.body.appendChild(errorScreen);
      
      // Add button handlers
      document.getElementById('retryButton').addEventListener('click', () => {
        window.location.reload();
      });
      
      document.getElementById('reportButton').addEventListener('click', () => {
        const errorReport = {
          error: error.toString(),
          message: error.message,
          stack: error.stack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          bootstrap: BOOTSTRAP_STATE.getStatusReport()
        };
        
        console.error('Error report:', errorReport);
        alert('Error details have been logged to the console. Please provide this information to support.');
      });
    },
    
    // Hide loading screen
    hideLoadingScreen: function() {
      const loadingScreen = document.getElementById('loadingScreen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
          if (loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
        }, 300);
      }
    },
    
    // Register callback for bootstrap completion
    registerCallback: function(callback) {
      if (typeof callback === 'function') {
        this.registeredCallbacks.push(callback);
        console.log('✅ Callback registered for bootstrap completion');
      }
    },
    
    // Execute registered callbacks
    executeRegisteredCallbacks: function() {
      console.log(`🔄 Executing ${this.registeredCallbacks.length} registered callbacks...`);
      
      // Record callback execution start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.callbackExecution = {
          started: true,
          startTime: new Date().toISOString(),
          totalCallbacks: this.registeredCallbacks.length,
          executedCallbacks: 0,
          failedCallbacks: 0
        };
      }
      
      this.registeredCallbacks.forEach((callback, index) => {
        try {
          callback();
          
          // Record successful callback
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
            window.app._dependencyGraph.callbackExecution.executedCallbacks++;
          }
        } catch (error) {
          console.error(`❌ Callback ${index} failed:`, error);
          
          // Record failed callback
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
            window.app._dependencyGraph.callbackExecution.failedCallbacks++;
            window.app._dependencyGraph.callbackExecution.callbackErrors = 
              window.app._dependencyGraph.callbackExecution.callbackErrors || [];
            window.app._dependencyGraph.callbackExecution.callbackErrors.push({
              index: index,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      });
      
      // Record callback execution completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
        window.app._dependencyGraph.callbackExecution.completed = true;
        window.app._dependencyGraph.callbackExecution.completionTime = new Date().toISOString();
        window.app._dependencyGraph.callbackExecution.success = 
          window.app._dependencyGraph.callbackExecution.failedCallbacks === 0;
      }
      
      this.registeredCallbacks = [];
    },
    
    // Queue operation for after bootstrap
    queueOperation: function(operation) {
      if (typeof operation === 'function') {
        this.pendingOperations.push(operation);
        console.log('✅ Operation queued for after bootstrap');
      }
    },
    
    // Execute pending operations
    executePendingOperations: function() {
      console.log(`🔄 Executing ${this.pendingOperations.length} pending operations...`);
      
      // Record operation execution start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.operationExecution = {
          started: true,
          startTime: new Date().toISOString(),
          totalOperations: this.pendingOperations.length,
          executedOperations: 0,
          failedOperations: 0
        };
      }
      
      this.pendingOperations.forEach((operation, index) => {
        try {
          operation();
          
          // Record successful operation
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
            window.app._dependencyGraph.operationExecution.executedOperations++;
          }
        } catch (error) {
          console.error(`❌ Operation ${index} failed:`, error);
          
          // Record failed operation
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
            window.app._dependencyGraph.operationExecution.failedOperations++;
            window.app._dependencyGraph.operationExecution.operationErrors = 
              window.app._dependencyGraph.operationExecution.operationErrors || [];
            window.app._dependencyGraph.operationExecution.operationErrors.push({
              index: index,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      });
      
      // Record operation execution completion
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
        window.app._dependencyGraph.operationExecution.completed = true;
        window.app._dependencyGraph.operationExecution.completionTime = new Date().toISOString();
        window.app._dependencyGraph.operationExecution.success = 
          window.app._dependencyGraph.operationExecution.failedOperations === 0;
      }
      
      this.pendingOperations = [];
    },
    
    // Wait for bootstrap to complete
    waitForBootstrap: function() {
      if (BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.READY)) {
        return Promise.resolve();
      }
      
      if (BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.FAILED)) {
        return Promise.reject(new Error('Bootstrap failed'));
      }
      
      return new Promise((resolve, reject) => {
        const successHandler = () => {
          window.removeEventListener('nexopa-bootstrap-complete', successHandler);
          window.removeEventListener('nexopa-bootstrap-complete', errorHandler);
          resolve();
        };
        
        const errorHandler = (event) => {
          if (!event.detail.success) {
            window.removeEventListener('nexopa-bootstrap-complete', successHandler);
            window.removeEventListener('nexopa-bootstrap-complete', errorHandler);
            reject(new Error(event.detail.message));
          }
        };
        
        window.addEventListener('nexopa-bootstrap-complete', successHandler);
        window.addEventListener('nexopa-bootstrap-complete', errorHandler);
      });
    },
    
    // Get bootstrap status
    getStatus: function() {
      return {
        isBootstrapping: this.isBootstrapping,
        phase: BOOTSTRAP_STATE.getPhase(),
        retryCount: this.currentRetry,
        dependencies: BOOTSTRAP_STATE.dependencies,
        registeredCallbacks: this.registeredCallbacks.length,
        pendingOperations: this.pendingOperations.length,
        namespaceStatus: window.app ? {
          initialized: window.app._namespaceInitialized,
          coreRegistered: window.app._coreRegistered,
          pendingRegistrations: window.app._pendingRegistrations.length
        } : null
      };
    }
  };
  
  // ============================================================================
  // API LAYER COORDINATION - PHASE 4: SYNCHRONIZED API INTEGRATION
  // ============================================================================
  
  const SESSION_COORDINATOR = {
    listeners: new Map(),
    monitoringInterval: null,
    
    // Initialize session coordination
    initialize: function() {
      console.log('🔐 Initializing session coordinator...');
      
      // Record session coordinator initialization
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.sessionCoordinator = {
          initialized: true,
          initializationTime: new Date().toISOString()
        };
      }
      
      // Setup event listeners for session changes
      this.setupEventListeners();
      
      // Start session monitoring
      this.startSessionMonitoring();
      
      // Setup cross-tab session sync
      this.setupCrossTabSync();
      
      console.log('✅ Session coordinator initialized');
    },
    
    // Enhanced iframe ready handler with session propagation
handleIframeReady: function(iframeWindow, data) {
  const iframeId = data.iframeId || data.sourceId;
  const pageKey = data.pageKey;
  const iframe = this.iframes.get(iframeId);
  
  if (iframe) {
    iframe.ready = true;
    iframe.window = iframeWindow;
    iframe.lastCommunication = new Date().toISOString();
    iframe.pageKey = pageKey;
    
    console.log(`✅ Iframe ready: ${iframeId} (${pageKey || 'unknown page'})`);
    
    // CRITICAL: Send session data immediately
    this.sendSessionDataToIframe(iframeWindow, iframeId, pageKey);
    
    // Process any queued messages
    this.processQueuedMessages(iframeId);
  } else {
    console.log(`⚠️ Iframe ready from unknown iframe: ${iframeId}`);
    
    // Create new iframe entry
    this.iframes.set(iframeId, {
      id: iframeId,
      element: null,
      ready: true,
      window: iframeWindow,
      pageKey: pageKey,
      lastCommunication: new Date().toISOString()
    });
    
    // Send session data
    this.sendSessionDataToIframe(iframeWindow, iframeId, pageKey);
  }
},

// Send comprehensive session data to iframe
sendSessionDataToIframe: function(iframeWindow, iframeId, pageKey) {
  // Prepare session data
  const sessionData = {
    type: 'nexopa-complete-session-data',
    auth: {
      isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
      user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
      validated: window.currentUser?.validated || false,
      token: AUTH_STATE ? AUTH_STATE.getToken() : null
    },
    network: {
      status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
      backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
      isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
    },
    ui: UI_ORCHESTRATOR ? UI_ORCHESTRATOR.getState() : null,
    bootstrap: BOOTSTRAP_STATE.getStatusReport(),
    pageInfo: pageKey && APP_CONFIG.pages && APP_CONFIG.pages[pageKey] ? 
      APP_CONFIG.pages[pageKey] : { id: iframeId },
    timestamp: new Date().toISOString()
  };
  
  // Send to iframe
  try {
    iframeWindow.postMessage(sessionData, '*');
    console.log(`📤 Session data sent to iframe: ${iframeId}`);
    
    // Record successful session propagation
    if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
      window.app._dependencyGraph.iframeCoordinator.sessionPropagations = 
        window.app._dependencyGraph.iframeCoordinator.sessionPropagations || [];
      window.app._dependencyGraph.iframeCoordinator.sessionPropagations.push({
        iframeId: iframeId,
        pageKey: pageKey,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`❌ Failed to send session data to iframe ${iframeId}:`, error);
  }
},
    // Setup event listeners
    setupEventListeners: function() {
      // Listen for login events
      window.addEventListener('nexopa-login-success', (event) => {
        this.handleLoginSuccess(event.detail);
      });
      
      window.addEventListener('nexopa-login-failed', (event) => {
        this.handleLoginFailed(event.detail);
      });
      
      // Listen for logout events
      window.addEventListener('nexopa-logout', (event) => {
        this.handleLogout(event.detail);
      });
      
      // Listen for token expiration
      window.addEventListener('nexopa-token-expired', (event) => {
        this.handleTokenExpired(event.detail);
      });
      
      // Listen for session invalidation
      window.addEventListener('nexopa-session-invalid', (event) => {
        this.handleSessionInvalid(event.detail);
      });
      
      // Listen for session refresh
      window.addEventListener('nexopa-session-refreshed', (event) => {
        this.handleSessionRefreshed(event.detail);
      });
    },
    
    // Handle login success
    handleLoginSuccess: function(detail) {
      console.log('🔐 Login success:', detail.user?.uid);
      
      // Update UI state
      this.updateUIForAuthenticatedState(detail.user);
      
      // Clear any existing timeouts or warnings
      this.clearSessionWarnings();
      
      // Start session monitoring
      this.startSessionMonitoring();
      
      // Notify other components
      this.broadcastSessionChange('authenticated', detail.user);
      
      // Load dashboard content
      APP_BOOTSTRAP.loadAppContent();
    },
    
    // Handle login failed
    handleLoginFailed: function(detail) {
      console.log('❌ Login failed:', detail.reason);
      
      // Show error to user
      if (typeof window.showNotification === 'function') {
        window.showNotification(detail.message || 'Login failed. Please try again.', 'error');
      }
      
      // Ensure auth UI is visible
      APP_BOOTSTRAP.showAuthUI();
    },
    
    // Handle logout
    handleLogout: function(detail) {
      console.log('👋 Logout:', detail.reason || 'User initiated');
      
      // Clear UI state
      this.updateUIForUnauthenticatedState();
      
      // Stop session monitoring
      this.stopSessionMonitoring();
      
      // Clear any cached data
      if (typeof DATA_CACHE !== 'undefined') {
        DATA_CACHE.clearAll();
      }
      
      // Clear user settings
      if (typeof SETTINGS_SERVICE !== 'undefined' && window.currentUser) {
        SETTINGS_SERVICE.clearUserSettings();
      }
      
      // Clear user isolation
      if (typeof USER_DATA_ISOLATION !== 'undefined' && window.currentUser) {
        USER_DATA_ISOLATION.clearUserData(window.currentUser.uid);
      }
      
      // Show auth UI
      APP_BOOTSTRAP.showAuthUI();
      
      // Notify other components
      this.broadcastSessionChange('logged_out', null);
      
      // Show logout confirmation
      if (typeof window.showNotification === 'function') {
        window.showNotification('Logged out successfully', 'success');
      }
    },
    
    // Handle token expired
    handleTokenExpired: function(detail) {
      console.log('⏰ Token expired:', detail.reason);
      
      // Try to refresh token using modular API
      this.attemptTokenRefresh().then(refreshResult => {
        if (refreshResult.success) {
          console.log('✅ Token refreshed successfully');
          
          // Notify components
          window.dispatchEvent(new CustomEvent('nexopa-session-refreshed', {
            detail: { 
              token: refreshResult.token,
              timestamp: new Date().toISOString()
            }
          }));
          
          // Show success notification
          if (typeof window.showNotification === 'function') {
            window.showNotification('Session refreshed', 'success', 3000);
          }
        } else {
          console.log('❌ Token refresh failed:', refreshResult.reason);
          
          // Show re-authentication warning
          this.showReauthenticationWarning();
          
          // Notify components
          window.dispatchEvent(new CustomEvent('nexopa-reauthentication-required', {
            detail: {
              reason: 'Token refresh failed',
              timestamp: new Date().toISOString()
            }
          }));
        }
      });
    },
    
    // Handle session invalid
    handleSessionInvalid: function(detail) {
      console.log('❌ Session invalid:', detail.reason);
      
      // Clear authentication state
      if (typeof AUTH_STATE !== 'undefined') {
        AUTH_STATE.clearAuthState();
      }
      
      // Clear local storage tokens
      localStorage.removeItem('accessToken');
      localStorage.removeItem('nexopa_jwt_token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenExpiresAt');
      localStorage.removeItem('nexopa-auth-state');
      
      // Update UI
      this.updateUIForUnauthenticatedState();
      
      // Redirect to auth
      APP_BOOTSTRAP.redirectToAuth(detail.reason);
      
      // Show notification
      if (typeof window.showNotification === 'function') {
        window.showNotification('Your session has expired. Please log in again.', 'error', 10000);
      }
    },
    
    // Handle session refreshed
    handleSessionRefreshed: function(detail) {
      console.log('🔄 Session refreshed with new token');
      
      // Clear any session warnings
      this.clearSessionWarnings();
      
      // Update token in auth state if available
      if (typeof AUTH_STATE !== 'undefined' && detail.token) {
        const user = AUTH_STATE.getUser();
        if (user) {
          AUTH_STATE.setAuthState(user, detail.token);
        }
      }
      
      // Notify components
      this.broadcastSessionChange('refreshed', window.currentUser);
    },
    
    // Attempt token refresh
    attemptTokenRefresh: function() {
      return new Promise(async (resolve) => {
        console.log('🔄 Attempting token refresh...');
        
        // Try modular API first
        if (window.api && window.api.auth && window.api.auth.refreshToken) {
          try {
            const newToken = await window.api.auth.refreshToken();
            if (newToken) {
              resolve({
                success: true,
                token: newToken
              });
              return;
            }
          } catch (error) {
            console.log('⚠️ Modular API token refresh failed:', error);
          }
        }
        
        // Try multiple refresh methods in order
        const refreshMethods = [
          this.refreshViaTokenValidation.bind(this),
          this.refreshViaApiCall.bind(this),
          this.refreshViaAuthState.bind(this)
        ];
        
        for (const method of refreshMethods) {
          try {
            const result = await method();
            if (result.success) {
              resolve(result);
              return;
            }
          } catch (error) {
            console.log(`⚠️ Refresh method failed: ${error.message}`);
          }
        }
        
        // All methods failed
        resolve({
          success: false,
          reason: 'All refresh methods failed'
        });
      });
    },
    
    // Refresh via TOKEN_VALIDATION
    refreshViaTokenValidation: async function() {
      if (typeof TOKEN_VALIDATION === 'undefined' || !TOKEN_VALIDATION.refreshToken) {
        throw new Error('TOKEN_VALIDATION not available');
      }
      
      return await TOKEN_VALIDATION.refreshToken();
    },
    
    // Refresh via API call
    refreshViaApiCall: async function() {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('nexopa_jwt_token');
      if (!token) {
        throw new Error('No token to refresh');
      }
      
      if (!API_COORDINATION || !API_COORDINATION.isApiAvailable()) {
        throw new Error('API not available');
      }
      
      const response = await API_COORDINATION.safeApiCall('/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response && response.success && response.data && response.data.token) {
        return {
          success: true,
          token: response.data.token
        };
      } else {
        throw new Error(response?.message || 'Refresh failed');
      }
    },
    
    // Refresh via AUTH_STATE
    refreshViaAuthState: async function() {
      if (typeof AUTH_STATE === 'undefined' || !AUTH_STATE.getToken()) {
        throw new Error('AUTH_STATE not available or no token');
      }
      
      // This is a fallback - just return the existing token
      return {
        success: true,
        token: AUTH_STATE.getToken()
      };
    },
    
    // Show re-authentication warning
    showReauthenticationWarning: function() {
      const warningId = 'reauth-warning';
      
      // Remove existing warning
      const existing = document.getElementById(warningId);
      if (existing) existing.remove();
      
      // Create warning
      const warning = document.createElement('div');
      warning.id = warningId;
      warning.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #f59e0b;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 9998;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: slideInUp 0.3s ease-out;
        max-width: 300px;
      `;
      
      warning.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">Session Expiring Soon</div>
        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">
          Your session will expire soon. Please save your work.
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button id="reauth-now" style="
            flex: 1;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
          ">Re-authenticate</button>
          <button id="reauth-dismiss" style="
            background: transparent;
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
          ">Dismiss</button>
        </div>
      `;
      
      document.body.appendChild(warning);
      
      // Add button handlers
      document.getElementById('reauth-now').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('nexopa-reauthentication-required', {
          detail: { reason: 'User requested re-authentication' }
        }));
        warning.remove();
      });
      
      document.getElementById('reauth-dismiss').addEventListener('click', () => {
        warning.style.animation = 'slideOutDown 0.3s ease-in';
        setTimeout(() => warning.remove(), 300);
      });
      
      // Auto-remove after 30 seconds
      setTimeout(() => {
        if (warning.parentNode) {
          warning.style.animation = 'slideOutDown 0.3s ease-in';
          setTimeout(() => warning.remove(), 300);
        }
      }, 30000);
    },
    
    // Clear session warnings
    clearSessionWarnings: function() {
      const warnings = document.querySelectorAll('#reauth-warning, #session-warning');
      warnings.forEach(warning => {
        if (warning.parentNode) {
          warning.parentNode.removeChild(warning);
        }
      });
    },
    
    // Update UI for authenticated state
    updateUIForAuthenticatedState: function(user) {
      // Update current user reference
      window.currentUser = user;
      
      // Update global auth state
      if (typeof updateGlobalAuthState === 'function') {
        updateGlobalAuthState(user);
      }
      
      // Show dashboard container
      const dashboard = document.getElementById('dashboardContainer') || 
                       document.querySelector('.dashboard-container');
      if (dashboard) {
        dashboard.classList.remove('hidden');
      }
      
      // Hide auth container
      const auth = document.getElementById('authContainer') || 
                   document.querySelector('.auth-container');
      if (auth) {
        auth.classList.add('hidden');
      }
      
      // Update user display elements
      this.updateUserDisplayElements(user);
    },
    
    // Update UI for unauthenticated state
    updateUIForUnauthenticatedState: function() {
      // Clear current user
      window.currentUser = null;
      
      // Update global auth state
      if (typeof updateGlobalAuthState === 'function') {
        updateGlobalAuthState(null);
      }
      
      // Show auth container
      const auth = document.getElementById('authContainer') || 
                   document.querySelector('.auth-container');
      if (auth) {
        auth.classList.remove('hidden');
      }
      
      // Hide dashboard container
      const dashboard = document.getElementById('dashboardContainer') || 
                       document.querySelector('.dashboard-container');
      if (dashboard) {
        dashboard.classList.add('hidden');
      }
      
      // Clear user display elements
      this.clearUserDisplayElements();
    },
    
    // Update user display elements
    updateUserDisplayElements: function(user) {
      // Update user avatar
      const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
      avatars.forEach(avatar => {
        if (user.photoURL) {
          avatar.src = user.photoURL;
          avatar.alt = user.displayName || 'User';
        }
      });
      
      // Update user name
      const names = document.querySelectorAll('.user-name, .display-name');
      names.forEach(name => {
        name.textContent = user.displayName || 'User';
      });
      
      // Update user email
      const emails = document.querySelectorAll('.user-email');
      emails.forEach(email => {
        email.textContent = user.email || '';
      });
    },
    
    // Clear user display elements
    clearUserDisplayElements: function() {
      // Reset avatars
      const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
      avatars.forEach(avatar => {
        avatar.src = '';
        avatar.alt = 'User';
      });
      
      // Reset names
      const names = document.querySelectorAll('.user-name, .display-name');
      names.forEach(name => {
        name.textContent = 'User';
      });
      
      // Reset emails
      const emails = document.querySelectorAll('.user-email');
      emails.forEach(email => {
        email.textContent = '';
      });
    },
    
    // Start session monitoring
    startSessionMonitoring: function() {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
      
      // Check session every minute
      this.monitoringInterval = setInterval(() => {
        this.checkSession();
      }, 60 * 1000);
      
      console.log('✅ Session monitoring started');
    },
    
    // Stop session monitoring
    stopSessionMonitoring: function() {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      console.log('⏹️ Session monitoring stopped');
    },
    
    // Check session validity
    checkSession: function() {
      if (typeof AUTH_STATE === 'undefined' || !AUTH_STATE.hasToken()) {
        return;
      }
      
      // Check token expiration
      if (AUTH_STATE._tokenExpiry) {
        const expiryDate = new Date(AUTH_STATE._tokenExpiry);
        const now = new Date();
        const timeUntilExpiry = expiryDate - now;
        
        // If expired, trigger token expired event
        if (timeUntilExpiry <= 0) {
          window.dispatchEvent(new CustomEvent('nexopa-token-expired', {
            detail: {
              reason: 'Token has expired',
              expiredAt: AUTH_STATE._tokenExpiry,
              timestamp: new Date().toISOString()
            }
          }));
        }
        // If expiring soon (less than 10 minutes), show warning
        else if (timeUntilExpiry < (10 * 60 * 1000)) {
          this.showSessionExpiryWarning(timeUntilExpiry);
        }
      }
    },
    
    // Show session expiry warning
    showSessionExpiryWarning: function(timeUntilExpiry) {
      const minutes = Math.ceil(timeUntilExpiry / (60 * 1000));
      
      // Only show warning every 5 minutes to avoid spamming
      const lastWarning = localStorage.getItem('last_session_warning');
      const now = Date.now();
      
      if (lastWarning && (now - parseInt(lastWarning)) < (5 * 60 * 1000)) {
        return;
      }
      
      localStorage.setItem('last_session_warning', now.toString());
      
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          `Your session will expire in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
          'warning',
          10000
        );
      }
    },
    
    // Setup cross-tab session sync
    setupCrossTabSync: function() {
      window.addEventListener('storage', (event) => {
        // Sync auth state across tabs
        if (event.key === 'nexopa-auth-state') {
          try {
            const authData = JSON.parse(event.newValue);
            
            if (authData && authData.isAuthenticated && authData.user) {
              // Update local auth state if different
              if (!window.currentUser || window.currentUser.uid !== authData.user.uid) {
                console.log('🔄 Auth state synced from another tab');
                this.handleLoginSuccess({ user: authData.user });
              }
            } else if (authData && !authData.isAuthenticated) {
              // Logout sync
              if (window.currentUser) {
                console.log('🔄 Logout synced from another tab');
                this.handleLogout({ reason: 'Logged out from another tab' });
              }
            }
          } catch (error) {
            console.log('⚠️ Failed to parse auth state from storage:', error);
          }
        }
      });
    },
    
    // Broadcast session change
    broadcastSessionChange: function(type, user) {
      const event = new CustomEvent('nexopa-session-change', {
        detail: {
          type: type,
          user: user,
          timestamp: new Date().toISOString(),
          isAuthenticated: !!user
        }
      });
      window.dispatchEvent(event);
      
      // Also broadcast to iframes
      this.broadcastToIframes('session-change', {
        type: type,
        user: user,
        isAuthenticated: !!user
      });
    },
    
    // Broadcast to iframes
    broadcastToIframes: function(type, data) {
      if (!window.NexopaIframes) return;
      
      window.NexopaIframes.forEach((iframe, id) => {
        try {
          iframe.window.postMessage({
            type: `nexopa-${type}`,
            data: data,
            timestamp: new Date().toISOString()
          }, '*');
        } catch (error) {
          console.log(`⚠️ Failed to broadcast to iframe ${id}:`, error);
        }
      });
    },
    
    // Register session event listener
    on: function(eventType, callback) {
      if (!this.listeners.has(eventType)) {
        this.listeners.set(eventType, []);
      }
      this.listeners.get(eventType).push(callback);
      
      window.addEventListener(`nexopa-${eventType}`, (event) => {
        callback(event.detail);
      });
    },
    
    // Get session status
    getStatus: function() {
      return {
        isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
        user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
        hasToken: !!(AUTH_STATE && AUTH_STATE.hasToken()),
        tokenExpiry: AUTH_STATE ? AUTH_STATE._tokenExpiry : null,
        monitoringActive: !!this.monitoringInterval
      };
    }
  };
  
  // ============================================================================
  // STATE MANAGEMENT AUTHORITY - PHASE 5: CANONICAL STATE PRESERVATION
  // ============================================================================
  
  const UI_ORCHESTRATOR = {
    components: new Map(),
    uiState: {
      sidebarOpen: true,
      currentView: null,
      modalStack: [],
      notificationCount: 0,
      loading: false
    },
    
    // Initialize UI orchestrator
    initialize: function() {
      console.log('🎨 Initializing UI orchestrator...');
      
      // Record UI orchestrator initialization
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiOrchestrator = {
          initialized: true,
          initializationTime: new Date().toISOString()
        };
      }
      
      // Register core UI components
      this.registerCoreComponents();
      
      // Setup UI event listeners
      this.setupUIEventListeners();
      
      // Setup responsive behaviors
      this.setupResponsiveBehaviors();
      
      // Setup theme management
      this.setupThemeManagement();
      
      // Setup accessibility features
      this.setupAccessibility();
      
      console.log('✅ UI orchestrator initialized');
    },
    
    // Register core UI components
    registerCoreComponents: function() {
      // Sidebar component
      this.registerComponent('sidebar', {
        selector: '.sidebar',
        initialState: { open: true, collapsed: false },
        actions: {
          toggle: () => this.toggleSidebar(),
          open: () => this.openSidebar(),
          close: () => this.closeSidebar(),
          setState: (state) => this.setSidebarState(state)
        }
      });
      
      // Navigation component
      this.registerComponent('navigation', {
        selector: 'nav, .navigation',
        initialState: { currentTab: 'groups' },
        actions: {
          switchTab: (tab) => this.switchTab(tab),
          getCurrentTab: () => this.getCurrentTab(),
          navigateTo: (page) => this.navigateTo(page)
        }
      });
      
      // Modal component
      this.registerComponent('modal', {
        selector: '.modal',
        initialState: { activeModal: null, stack: [] },
        actions: {
          open: (id) => this.openModal(id),
          close: (id) => this.closeModal(id),
          closeAll: () => this.closeAllModals(),
          getActive: () => this.getActiveModal()
        }
      });
      
      // Notification component
      this.registerComponent('notification', {
        selector: '#notification-container',
        initialState: { count: 0 },
        actions: {
          show: (message, type, duration) => this.showNotification(message, type, duration),
          clear: () => this.clearNotifications(),
          getCount: () => this.getNotificationCount()
        }
      });
      
      // Loading component
      this.registerComponent('loading', {
        selector: '#loadingScreen, .loading-indicator',
        initialState: { active: false, message: '' },
        actions: {
          show: (message) => this.showLoading(message),
          hide: () => this.hideLoading(),
          setMessage: (message) => this.setLoadingMessage(message)
        }
      });
    },
    
    // Register a UI component
    registerComponent: function(name, config) {
      this.components.set(name, {
        config: config,
        element: document.querySelector(config.selector),
        state: { ...config.initialState },
        callbacks: new Map()
      });
      
      console.log(`✅ UI component registered: ${name}`);
      
      // Record component registration
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiOrchestrator) {
        window.app._dependencyGraph.uiOrchestrator.components = 
          window.app._dependencyGraph.uiOrchestrator.components || [];
        window.app._dependencyGraph.uiOrchestrator.components.push({
          name: name,
          selector: config.selector,
          registeredAt: new Date().toISOString()
        });
      }
      
      // Initialize component if element exists
      const component = this.components.get(name);
      if (component.element) {
        this.initializeComponent(name);
      }
    },
    
    // Initialize a component
    initializeComponent: function(name) {
      const component = this.components.get(name);
      if (!component) return;
      
      switch(name) {
        case 'sidebar':
          this.initializeSidebarComponent();
          break;
        case 'modal':
          this.initializeModalComponent();
          break;
        case 'navigation':
          this.initializeNavigationComponent();
          break;
      }
      
      console.log(`✅ UI component initialized: ${name}`);
      
      // Record component initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiOrchestrator) {
        const componentIndex = window.app._dependencyGraph.uiOrchestrator.components?.findIndex(c => c.name === name);
        if (componentIndex !== -1) {
          window.app._dependencyGraph.uiOrchestrator.components[componentIndex].initialized = true;
          window.app._dependencyGraph.uiOrchestrator.components[componentIndex].initializedAt = new Date().toISOString();
        }
      }
    },
    
    // Initialize sidebar component
    initializeSidebarComponent: function() {
      const component = this.components.get('sidebar');
      if (!component || !component.element) return;
      
      // Set initial state based on screen size
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        component.state.open = false;
        component.element.classList.add('collapsed');
      }
      
      // Add toggle button if not present
      if (!document.querySelector('.sidebar-toggle')) {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'sidebar-toggle';
        toggleButton.innerHTML = '☰';
        toggleButton.style.cssText = `
          position: fixed;
          top: 10px;
          left: 10px;
          z-index: 1000;
          background: #8b5cf6;
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        
        toggleButton.addEventListener('click', () => {
          this.toggleSidebar();
        });
        
        document.body.appendChild(toggleButton);
      }
      
      // Update UI state
      this.uiState.sidebarOpen = component.state.open;
    },
    
    // Initialize modal component
    initializeModalComponent: function() {
      // Setup modal close handlers
      document.querySelectorAll('[data-close-modal]').forEach(element => {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          const modalId = element.getAttribute('data-close-modal');
          this.closeModal(modalId);
        });
      });
      
      // Close modal on overlay click
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            const modal = overlay.closest('.modal');
            if (modal && modal.id) {
              this.closeModal(modal.id);
            }
          }
        });
      });
      
      // Close modal on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.uiState.modalStack.length > 0) {
          const activeModal = this.uiState.modalStack[this.uiState.modalStack.length - 1];
          this.closeModal(activeModal);
        }
      });
    },
    
    // Initialize navigation component
    initializeNavigationComponent: function() {
      // Delegate to existing navigation system
      if (typeof window.switchTab === 'function') {
        // Use existing system
        return;
      }
      
      // Setup tab switching
      document.querySelectorAll('[data-tab]').forEach(element => {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          const tabName = element.getAttribute('data-tab');
          this.switchTab(tabName);
        });
      });
    },
    
    // Setup UI event listeners
    setupUIEventListeners: function() {
      // Listen for responsive changes
      window.addEventListener('nexopa-responsive-change', (event) => {
        this.handleResponsiveChange(event.detail);
      });
      
      // Listen for theme changes
      window.addEventListener('nexopa-theme-change', (event) => {
        this.handleThemeChange(event.detail);
      });
      
      // Listen for session changes
      window.addEventListener('nexopa-session-change', (event) => {
        this.handleSessionChange(event.detail);
      });
      
      // Listen for navigation events
      window.addEventListener('nexopa-navigation', (event) => {
        this.handleNavigation(event.detail);
      });
    },
    
    // Setup responsive behaviors
    setupResponsiveBehaviors: function() {
      let resizeTimeout;
      
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.updateResponsiveState();
        }, 250);
      });
      
      // Initial update
      this.updateResponsiveState();
    },
    
    // Update responsive state
    updateResponsiveState: function() {
      const isMobile = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const isDesktop = window.innerWidth >= 1024;
      
      // Update body classes
      document.body.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
      document.body.classList.add(
        isMobile ? 'mobile-view' :
        isTablet ? 'tablet-view' :
        'desktop-view'
      );
      
      // Update sidebar state on mobile
      const sidebarComponent = this.components.get('sidebar');
      if (sidebarComponent && sidebarComponent.element) {
        if (isMobile) {
          sidebarComponent.state.open = false;
          sidebarComponent.element.classList.add('collapsed');
          this.uiState.sidebarOpen = false;
        } else {
          sidebarComponent.state.open = true;
          sidebarComponent.element.classList.remove('collapsed');
          this.uiState.sidebarOpen = true;
        }
      }
      
      // Update UI state
      this.uiState.isMobile = isMobile;
      this.uiState.isTablet = isTablet;
      this.uiState.isDesktop = isDesktop;
      
      // Dispatch responsive change event
      const event = new CustomEvent('nexopa-ui-responsive-change', {
        detail: {
          isMobile: isMobile,
          isTablet: isTablet,
          isDesktop: isDesktop,
          width: window.innerWidth,
          height: window.innerHeight,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Setup theme management
    setupThemeManagement: function() {
      // Use settings service if available
      if (typeof SETTINGS_SERVICE !== 'undefined') {
        // Listen for theme changes from settings
        SETTINGS_SERVICE.registerPageCallback('ui-orchestrator', (settings) => {
          if (settings.theme) {
            this.applyTheme(settings.theme);
          }
        });
        
        // Apply initial theme
        const theme = SETTINGS_SERVICE.getSetting('theme');
        if (theme) {
          this.applyTheme(theme);
        }
      } else {
        // Fallback theme management
        const savedTheme = (localStorage.getItem('app_theme') || localStorage.getItem('nexopa_theme')) === 'dark' ? 'dark' : 'light';
        this.applyTheme(savedTheme);
        
        // Theme toggle button
        const themeToggle = document.createElement('button');
        themeToggle.id = 'theme-toggle';
        themeToggle.innerHTML = '🌓';
        themeToggle.title = 'Toggle theme';
        themeToggle.style.cssText = `
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 1000;
          background: #8b5cf6;
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        
        themeToggle.addEventListener('click', () => {
          const currentTheme = document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          this.applyTheme(newTheme);
          try { (window.ThemeManager ? window.ThemeManager.setTheme(newTheme) : localStorage.setItem('app_theme', newTheme)); } catch (_) {}
          localStorage.setItem('nexopa_theme', newTheme);
        });
        
        document.body.appendChild(themeToggle);
      }
    },
    
    // Apply theme
    applyTheme: function(theme) {
      const html = document.documentElement;
      const resolved = theme === 'dark' ? 'dark' : 'light';

      // Remove all theme classes
      html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
      html.classList.add(`theme-${resolved}`);
      html.classList.toggle('dark-theme', resolved === 'dark');
      html.setAttribute('data-theme', resolved);
      try { (window.ThemeManager ? window.ThemeManager.setTheme(resolved) : localStorage.setItem('app_theme', resolved)); } catch (_) {}
      
      // Dispatch theme change event
      const event = new CustomEvent('nexopa-theme-change', {
        detail: {
          theme: theme,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log(`✅ Theme applied: ${theme}`);
    },
    
    // Setup accessibility
    setupAccessibility: function() {
      // Skip if settings service handles this
      if (typeof SETTINGS_SERVICE !== 'undefined') return;
      
      // Add accessibility styles
      const style = document.createElement('style');
      style.id = 'accessibility-styles';
      style.textContent = `
        .high-contrast {
          --text-primary: #000000 !important;
          --text-secondary: #333333 !important;
          --background-primary: #ffffff !important;
          --background-secondary: #f0f0f0 !important;
          --border-color: #000000 !important;
        }
        
        .reduce-motion * {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
        
        .large-text {
          font-size: 125% !important;
        }
        
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `;
      document.head.appendChild(style);
      
      // Listen for prefers-reduced-motion
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      motionQuery.addEventListener('change', (e) => {
        if (e.matches) {
          document.documentElement.classList.add('reduce-motion');
        } else {
          document.documentElement.classList.remove('reduce-motion');
        }
      });
      
      // Initial check
      if (motionQuery.matches) {
        document.documentElement.classList.add('reduce-motion');
      }
    },
    
    // Handle responsive change
    handleResponsiveChange: function(detail) {
      // Update sidebar state
      const sidebarComponent = this.components.get('sidebar');
      if (sidebarComponent && sidebarComponent.element) {
        if (detail.isMobile) {
          sidebarComponent.state.open = false;
          sidebarComponent.element.classList.add('collapsed');
        } else {
          sidebarComponent.state.open = true;
          sidebarComponent.element.classList.remove('collapsed');
        }
        this.uiState.sidebarOpen = sidebarComponent.state.open;
      }
      
      // Update UI state
      this.uiState.isMobile = detail.isMobile;
      this.uiState.isTablet = detail.isTablet;
      this.uiState.isDesktop = detail.isDesktop;
    },
    
    // Handle theme change
    handleThemeChange: function(detail) {
      console.log(`🎨 Theme changed to: ${detail.theme}`);
      // Additional theme-specific UI updates can go here
    },
    
    // Handle session change
    handleSessionChange: function(detail) {
      if (detail.type === 'authenticated') {
        // Show user-specific UI elements
        this.showAuthenticatedUI();
      } else if (detail.type === 'logged_out') {
        // Hide user-specific UI elements
        this.hideAuthenticatedUI();
      }
    },
    
    // Handle navigation
    handleNavigation: function(detail) {
      console.log(`🧭 Navigation to: ${detail.page}`);
      this.uiState.currentView = detail.page;
      
      // Update active navigation item
      this.updateActiveNavigation(detail.page);
    },
    
    // Show authenticated UI
    showAuthenticatedUI: function() {
      // Show user menu if exists
      const userMenu = document.querySelector('.user-menu, .profile-menu');
      if (userMenu) {
        userMenu.classList.remove('hidden');
      }
      
      // Show logout button if exists
      const logoutButton = document.querySelector('.logout-button, [data-action="logout"]');
      if (logoutButton) {
        logoutButton.classList.remove('hidden');
      }
      
      // Update user info in UI
      this.updateUserInfoUI();
    },
    
    // Hide authenticated UI
    hideAuthenticatedUI: function() {
      // Hide user menu
      const userMenu = document.querySelector('.user-menu, .profile-menu');
      if (userMenu) {
        userMenu.classList.add('hidden');
      }
      
      // Hide logout button
      const logoutButton = document.querySelector('.logout-button, [data-action="logout"]');
      if (logoutButton) {
        logoutButton.classList.add('hidden');
      }
      
      // Clear user info
      this.clearUserInfoUI();
    },
    
    // Update user info in UI
    updateUserInfoUI: function() {
      const user = window.currentUser || (AUTH_STATE && AUTH_STATE.getUser());
      if (!user) return;
      
      // Update avatar
      const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
      avatars.forEach(avatar => {
        if (user.photoURL) {
          avatar.src = user.photoURL;
          avatar.alt = user.displayName || 'User';
        }
      });
      
      // Update name
      const names = document.querySelectorAll('.user-name, .display-name');
      names.forEach(name => {
        name.textContent = user.displayName || 'User';
      });
      
      // Update email
      const emails = document.querySelectorAll('.user-email');
      emails.forEach(email => {
        email.textContent = user.email || '';
      });
    },
    
    // Clear user info UI
    clearUserInfoUI: function() {
      // Reset avatars
      const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
      avatars.forEach(avatar => {
        avatar.src = '';
        avatar.alt = 'User';
      });
      
      // Reset names
      const names = document.querySelectorAll('.user-name, .display-name');
      names.forEach(name => {
        name.textContent = 'User';
      });
      
      // Reset emails
      const emails = document.querySelectorAll('.user-email');
      emails.forEach(email => {
        email.textContent = '';
      });
    },
    
    // Update active navigation
    updateActiveNavigation: function(page) {
      // Remove active class from all nav items
      document.querySelectorAll('[data-nav], [data-tab]').forEach(item => {
        item.classList.remove('active');
      });
      
      // Add active class to current nav item
      const currentItem = document.querySelector(`[data-nav="${page}"], [data-tab="${page}"]`);
      if (currentItem) {
        currentItem.classList.add('active');
      }
    },
    
    // Toggle sidebar
    toggleSidebar: function() {
      const component = this.components.get('sidebar');
      if (!component || !component.element) return;
      
      component.state.open = !component.state.open;
      component.element.classList.toggle('collapsed');
      this.uiState.sidebarOpen = component.state.open;
      
      // Dispatch event
      const event = new CustomEvent('nexopa-sidebar-toggle', {
        detail: {
          open: component.state.open,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log(`📐 Sidebar ${component.state.open ? 'opened' : 'closed'}`);
    },
    
    // Open sidebar
    openSidebar: function() {
      const component = this.components.get('sidebar');
      if (!component || !component.element) return;
      
      component.state.open = true;
      component.element.classList.remove('collapsed');
      this.uiState.sidebarOpen = true;
      
      const event = new CustomEvent('nexopa-sidebar-toggle', {
        detail: {
          open: true,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Close sidebar
    closeSidebar: function() {
      const component = this.components.get('sidebar');
      if (!component || !component.element) return;
      
      component.state.open = false;
      component.element.classList.add('collapsed');
      this.uiState.sidebarOpen = false;
      
      const event = new CustomEvent('nexopa-sidebar-toggle', {
        detail: {
          open: false,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Set sidebar state
    setSidebarState: function(state) {
      const component = this.components.get('sidebar');
      if (!component || !component.element) return;
      
      component.state.open = state.open !== undefined ? state.open : component.state.open;
      component.state.collapsed = state.collapsed !== undefined ? state.collapsed : component.state.collapsed;
      
      if (state.open !== undefined) {
        if (state.open) {
          component.element.classList.remove('collapsed');
        } else {
          component.element.classList.add('collapsed');
        }
      }
      
      if (state.collapsed !== undefined) {
        if (state.collapsed) {
          component.element.classList.add('collapsed');
        } else {
          component.element.classList.remove('collapsed');
        }
      }
      
      this.uiState.sidebarOpen = component.state.open;
    },
    
    // Switch tab
    switchTab: function(tabName) {
      // Delegate to existing function if available
      if (typeof window.switchTab === 'function') {
        window.switchTab(tabName);
        return;
      }
      
      // Update navigation component state
      const component = this.components.get('navigation');
      if (component) {
        component.state.currentTab = tabName;
      }
      
      // Update UI state
      this.uiState.currentView = tabName;
      
      // Update active navigation
      this.updateActiveNavigation(tabName);
      
      // Dispatch event
      const event = new CustomEvent('nexopa-tab-switch', {
        detail: {
          tab: tabName,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log(`🧭 Switched to tab: ${tabName}`);
    },
    
    // Get current tab
    getCurrentTab: function() {
      const component = this.components.get('navigation');
      return component ? component.state.currentTab : this.uiState.currentView;
    },
    
    // Navigate to page
    navigateTo: function(page) {
      this.uiState.currentView = page;
      
      // Update active navigation
      this.updateActiveNavigation(page);
      
      // Dispatch event
      const event = new CustomEvent('nexopa-navigation', {
        detail: {
          page: page,
          timestamp: new Date().toISOString(),
          pushState: true
        }
      });
      window.dispatchEvent(event);
    },
    
    // Open modal
    openModal: function(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) {
        console.log(`⚠️ Modal not found: ${modalId}`);
        return;
      }
      
      // Add to modal stack
      this.uiState.modalStack.push(modalId);
      
      // Show modal
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      
      // Dispatch event
      const event = new CustomEvent('nexopa-modal-open', {
        detail: {
          modalId: modalId,
          stackSize: this.uiState.modalStack.length,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log(`📦 Modal opened: ${modalId}`);
    },
    
    // Close modal
    closeModal: function(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      
      // Remove from modal stack
      const index = this.uiState.modalStack.indexOf(modalId);
      if (index > -1) {
        this.uiState.modalStack.splice(index, 1);
      }
      
      // Hide modal
      modal.classList.add('hidden');
      modal.style.display = 'none';
      
      // Dispatch event
      const event = new CustomEvent('nexopa-modal-close', {
        detail: {
          modalId: modalId,
          stackSize: this.uiState.modalStack.length,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log(`📦 Modal closed: ${modalId}`);
    },
    
    // Close all modals
    closeAllModals: function() {
      this.uiState.modalStack.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.classList.add('hidden');
          modal.style.display = 'none';
        }
      });
      
      this.uiState.modalStack = [];
      
      // Dispatch event
      const event = new CustomEvent('nexopa-modal-close-all', {
        detail: {
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
      
      console.log('📦 All modals closed');
    },
    
    // Get active modal
    getActiveModal: function() {
      if (this.uiState.modalStack.length === 0) return null;
      return this.uiState.modalStack[this.uiState.modalStack.length - 1];
    },
    
    // Show notification
    showNotification: function(message, type = 'info', duration = 5000) {
      // Delegate to existing function if available
      if (typeof window.showNotification === 'function') {
        return window.showNotification(message, type, duration);
      }
      
      // Create notification container if not exists
      let container = document.getElementById('notification-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        `;
        document.body.appendChild(container);
      }
      
      // Create notification
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.style.cssText = `
        background: ${type === 'error' ? '#f87171' : 
                    type === 'success' ? '#10b981' : 
                    type === 'warning' ? '#f59e0b' : 
                    '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: slideInRight 0.3s ease-out;
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 400px;
      `;
      
      notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" style="
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          margin-left: 10px;
          font-size: 18px;
        ">&times;</button>
      `;
      
      container.appendChild(notification);
      
      // Update notification count
      this.uiState.notificationCount++;
      
      // Close button handler
      notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
            this.uiState.notificationCount--;
          }
        }, 300);
      });
      
      // Auto-remove after duration
      if (duration > 0) {
        setTimeout(() => {
          if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
              if (notification.parentNode) {
                notification.remove();
                this.uiState.notificationCount--;
              }
            }, 300);
          }
        }, duration);
      }
      
      // Add CSS animations if not already added
      if (!document.getElementById('notification-animations')) {
        const style = document.createElement('style');
        style.id = 'notification-animations';
        style.textContent = `
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      
      return notification;
    },
    
    // Clear notifications
    clearNotifications: function() {
      const container = document.getElementById('notification-container');
      if (container) {
        container.innerHTML = '';
        this.uiState.notificationCount = 0;
      }
    },
    
    // Get notification count
    getNotificationCount: function() {
      return this.uiState.notificationCount;
    },
    
    // Show loading
    showLoading: function(message = 'Loading...') {
      let loader = document.getElementById('loadingScreen');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loadingScreen';
        loader.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          color: white;
        `;
        
        loader.innerHTML = `
          <div class="loading-spinner" style="
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          "></div>
          <div class="loading-text">${message}</div>
        `;
        
        document.body.appendChild(loader);
        
        // Add animation styles if not present
        if (!document.getElementById('loading-animations')) {
          const style = document.createElement('style');
          style.id = 'loading-animations';
          style.textContent = `
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `;
          document.head.appendChild(style);
        }
      }
      
      loader.style.display = 'flex';
      this.uiState.loading = true;
      
      console.log(`⏳ Loading: ${message}`);
    },
    
    // Hide loading
    hideLoading: function() {
      const loader = document.getElementById('loadingScreen');
      if (loader) {
        loader.style.display = 'none';
      }
      this.uiState.loading = false;
    },
    
    // Set loading message
    setLoadingMessage: function(message) {
      const loader = document.getElementById('loadingScreen');
      if (loader) {
        const textElement = loader.querySelector('.loading-text');
        if (textElement) {
          textElement.textContent = message;
        }
      }
    },
    
    // Register UI event listener
    on: function(eventType, callback) {
      window.addEventListener(`nexopa-${eventType}`, (event) => {
        callback(event.detail);
      });
    },
    
    // Get UI state
    getState: function() {
      return {
        ...this.uiState,
        components: Array.from(this.components.keys()).map(name => ({
          name: name,
          exists: !!this.components.get(name).element,
          state: this.components.get(name).state
        }))
      };
    }
  };
  
  // ============================================================================
  // EVENT BUS STEWARDSHIP - PHASE 6: SUBSCRIPTION DISCIPLINE
  // ============================================================================
  
  const IFRAME_COORDINATOR = {
    iframes: new Map(),
    pageStates: new Map(),
    messageQueue: new Map(),
    
    // Initialize iframe coordinator
    initialize: function() {
      console.log('🖼️ Initializing iframe coordinator...');
      
      // Record iframe coordinator initialization
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.iframeCoordinator = {
          initialized: true,
          initializationTime: new Date().toISOString()
        };
      }
      
      // Setup message listener
      this.setupMessageListener();
      
      // Setup iframe detection
      this.setupIframeDetection();
      
      // Setup page state management
      this.setupPageStateManagement();
      
      // Expose coordination API
      this.exposeCoordinationAPI();
      
      console.log('✅ Iframe coordinator initialized');
    },
    
    // Setup message listener
    setupMessageListener: function() {
      window.addEventListener('message', (event) => {
        // Security check
        if (!this.isTrustedOrigin(event.origin)) {
          return;
        }
        
        const data = event.data;
        if (!data || !data.type) return;
        
        // Handle different message types
        switch(data.type) {
          case 'nexopa-iframe-ready':
            this.handleIframeReady(event.source, data);
            break;
            
          case 'nexopa-page-ready':
            this.handlePageReady(event.source, data);
            break;
            
          case 'nexopa-state-request':
            this.handleStateRequest(event.source, data);
            break;
            
          case 'nexopa-state-update':
            this.handleStateUpdate(event.source, data);
            break;
            
          case 'nexopa-action-request':
            this.handleActionRequest(event.source, data);
            break;
            
          case 'nexopa-data-request':
            this.handleDataRequest(event.source, data);
            break;
            
          case 'nexopa-cached-data-request':
            this.handleCachedDataRequest(event.source, data);
            break;
            
          case 'nexopa-broadcast':
            this.handleBroadcast(event.source, data);
            break;
        }
      });
    },
    
    // Check if origin is trusted
    isTrustedOrigin: function(origin) {
      const currentOrigin = window.location.origin;
      const trustedOrigins = [
        currentOrigin,
        'http://localhost',
        'http://127.0.0.1',
        'https://nexopa.app',
        'https://*.nexopa.app'
      ];
      
      return trustedOrigins.some(trusted => {
        if (trusted.includes('*')) {
          const regex = new RegExp('^' + trusted.replace(/\*/g, '.*') + '$');
          return regex.test(origin);
        }
        return origin === trusted;
      });
    },
    
    // Setup iframe detection
    setupIframeDetection: function() {
      // Detect existing iframes
      const detectIframes = () => {
        document.querySelectorAll('iframe').forEach((iframe, index) => {
          const iframeId = iframe.id || `iframe-${index}-${Date.now()}`;
          
          if (!this.iframes.has(iframeId)) {
            this.iframes.set(iframeId, {
              element: iframe,
              id: iframeId,
              ready: false,
              window: null,
              lastCommunication: null
            });
            
            console.log(`🖼️ Iframe detected: ${iframeId}`);
            
            // Record iframe detection
            if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
              window.app._dependencyGraph.iframeCoordinator.detectedIframes = 
                window.app._dependencyGraph.iframeCoordinator.detectedIframes || [];
              window.app._dependencyGraph.iframeCoordinator.detectedIframes.push({
                id: iframeId,
                detectedAt: new Date().toISOString()
              });
            }
          }
        });
      };
      
      // Initial detection
      detectIframes();
      
      // Observe DOM for new iframes
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
              detectIframes();
            }
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      
      // Periodically check for iframe readiness
      setInterval(() => {
        this.checkIframeReadiness();
      }, 1000);
    },
    
    // Setup page state management
    setupPageStateManagement: function() {
      // Initial page state
      this.pageStates.set('main', {
        id: 'main',
        ready: false,
        authState: null,
        networkState: null,
        uiState: null,
        cachedData: {},
        lastUpdate: null
      });
      
      // Record main page state creation
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.mainPageState = {
          created: true,
          createdAt: new Date().toISOString()
        };
      }
      
      // Update main page state when ready
      window.addEventListener('nexopa-bootstrap-complete', () => {
        this.updatePageState('main', {
          ready: true,
          authState: {
            isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
            user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser())
          },
          networkState: {
            status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
            backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null
          },
          uiState: UI_ORCHESTRATOR.getState(),
          lastUpdate: new Date().toISOString()
        });
      });
      
      // Update state on changes
      window.addEventListener('nexopa-session-change', () => {
        this.updatePageState('main', {
          authState: {
            isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
            user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser())
          },
          lastUpdate: new Date().toISOString()
        });
      });
      
      window.addEventListener('nexopa-network-change', (event) => {
        this.updatePageState('main', {
          networkState: {
            status: event.detail.status,
            backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null
          },
          lastUpdate: new Date().toISOString()
        });
      });
    },
    
    // Handle iframe ready
    handleIframeReady: function(iframeWindow, data) {
      const iframeId = data.iframeId || data.sourceId;
      const iframe = this.iframes.get(iframeId);
      
      if (iframe) {
        iframe.ready = true;
        iframe.window = iframeWindow;
        iframe.lastCommunication = new Date().toISOString();
        
        console.log(`✅ Iframe ready: ${iframeId}`);
        
        // Record iframe readiness
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
          window.app._dependencyGraph.iframeCoordinator.readyIframes = 
            window.app._dependencyGraph.iframeCoordinator.readyIframes || [];
          window.app._dependencyGraph.iframeCoordinator.readyIframes.push({
            id: iframeId,
            readyAt: new Date().toISOString()
          });
        }
        
        // Send initial state to iframe
        this.sendInitialStateToIframe(iframeWindow, iframeId);
        
        // Process any queued messages
        this.processQueuedMessages(iframeId);
      } else {
        console.log(`⚠️ Iframe ready from unknown iframe: ${iframeId}`);
        
        // Create new iframe entry
        this.iframes.set(iframeId, {
          id: iframeId,
          element: null,
          ready: true,
          window: iframeWindow,
          lastCommunication: new Date().toISOString()
        });
        
        // Record unknown iframe
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
          window.app._dependencyGraph.iframeCoordinator.unknownIframes = 
            window.app._dependencyGraph.iframeCoordinator.unknownIframes || [];
          window.app._dependencyGraph.iframeCoordinator.unknownIframes.push({
            id: iframeId,
            readyAt: new Date().toISOString(),
            source: 'unknown'
          });
        }
        
        this.sendInitialStateToIframe(iframeWindow, iframeId);
      }
    },
    
    // Handle page ready
    handlePageReady: function(pageWindow, data) {
      const pageId = data.pageId || 'unknown';
      
      // Create or update page state
      if (!this.pageStates.has(pageId)) {
        this.pageStates.set(pageId, {
          id: pageId,
          ready: true,
          window: pageWindow,
          authState: null,
          networkState: null,
          uiState: null,
          cachedData: {},
          lastUpdate: new Date().toISOString()
        });
      } else {
        this.updatePageState(pageId, {
          ready: true,
          window: pageWindow,
          lastUpdate: new Date().toISOString()
        });
      }
      
      console.log(`✅ Page ready: ${pageId}`);
      
      // Record page readiness
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.readyPages = 
          window.app._dependencyGraph.iframeCoordinator.readyPages || [];
        window.app._dependencyGraph.iframeCoordinator.readyPages.push({
          id: pageId,
          readyAt: new Date().toISOString()
        });
      }
      
      // Send initial state to page
      this.sendInitialStateToPage(pageWindow, pageId);
    },
    
    // Handle state request
    handleStateRequest: function(sourceWindow, data) {
      const requestedState = data.state || 'all';
      const requestId = data.requestId;
      const sourceId = data.sourceId;
      
      let stateData = {};
      
      // Prepare requested state data
      if (requestedState === 'all' || requestedState === 'auth') {
        stateData.auth = {
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
          user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
          validated: window.currentUser?.validated || false
        };
      }
      
      if (requestedState === 'all' || requestedState === 'network') {
        stateData.network = {
          status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
          backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
          isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
        };
      }
      
      if (requestedState === 'all' || requestedState === 'ui') {
        stateData.ui = UI_ORCHESTRATOR.getState();
      }
      
      if (requestedState === 'all' || requestedState === 'settings') {
        stateData.settings = SETTINGS_SERVICE ? SETTINGS_SERVICE.current : {};
      }
      
      if (requestedState === 'all' || requestedState === 'bootstrap') {
        stateData.bootstrap = BOOTSTRAP_STATE.getStatusReport();
      }
      
      // Send response
      sourceWindow.postMessage({
        type: 'nexopa-state-response',
        requestId: requestId,
        state: requestedState,
        data: stateData,
        timestamp: new Date().toISOString()
      }, '*');
      
      console.log(`📤 State sent to ${sourceId}: ${requestedState}`);
    },
    
    // Handle state update
    handleStateUpdate: function(sourceWindow, data) {
      const sourceId = data.sourceId;
      const stateType = data.stateType;
      const stateData = data.state;
      
      // Update page state
      if (this.pageStates.has(sourceId)) {
        const pageState = this.pageStates.get(sourceId);
        
        switch(stateType) {
          case 'auth':
            pageState.authState = stateData;
            break;
          case 'network':
            pageState.networkState = stateData;
            break;
          case 'ui':
            pageState.uiState = stateData;
            break;
          case 'cachedData':
            pageState.cachedData = { ...pageState.cachedData, ...stateData };
            break;
        }
        
        pageState.lastUpdate = new Date().toISOString();
        
        console.log(`📥 State update from ${sourceId}: ${stateType}`);
        
        // Record state update
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
          window.app._dependencyGraph.iframeCoordinator.stateUpdates = 
            window.app._dependencyGraph.iframeCoordinator.stateUpdates || [];
          window.app._dependencyGraph.iframeCoordinator.stateUpdates.push({
            sourceId: sourceId,
            stateType: stateType,
            timestamp: new Date().toISOString()
          });
        }
        
        // Broadcast to other pages/iframes if needed
        if (stateType === 'auth' || stateType === 'network') {
          this.broadcastStateUpdate(stateType, stateData, sourceId);
        }
      }
    },
    
    // Handle action request
    handleActionRequest: function(sourceWindow, data) {
      const action = data.action;
      const params = data.params || {};
      const requestId = data.requestId;
      const sourceId = data.sourceId;
      
      let result = null;
      let error = null;
      
      // Handle different actions
      try {
        switch(action) {
          case 'navigate':
            if (params.target) {
              if (typeof window.switchTab === 'function') {
                window.switchTab(params.target);
              } else if (typeof window.loadPage === 'function') {
                window.loadPage(params.target);
              }
              result = { success: true, target: params.target };
            }
            break;
            
          case 'showNotification':
            if (params.message) {
              if (typeof window.showNotification === 'function') {
                window.showNotification(params.message, params.type, params.duration);
              }
              result = { success: true };
            }
            break;
            
          case 'openModal':
            if (params.modalId) {
              UI_ORCHESTRATOR.openModal(params.modalId);
              result = { success: true, modalId: params.modalId };
            }
            break;
            
          case 'closeModal':
            if (params.modalId) {
              UI_ORCHESTRATOR.closeModal(params.modalId);
              result = { success: true, modalId: params.modalId };
            }
            break;
            
          case 'toggleSidebar':
            UI_ORCHESTRATOR.toggleSidebar();
            result = { success: true, state: UI_ORCHESTRATOR.uiState.sidebarOpen };
            break;
            
          case 'refreshData':
            if (params.cacheKey && typeof DATA_CACHE !== 'undefined') {
              DATA_CACHE.remove(params.cacheKey);
              result = { success: true, cacheKey: params.cacheKey };
            }
            break;
            
          case 'logout':
            if (typeof window.logout === 'function') {
              window.logout();
              result = { success: true };
            }
            break;
          
          case 'checkAuthMe':
            // Use modular API if available
            if (window.api && window.api.auth && window.api.auth.getUser) {
              return window.api.auth.getUser().then(user => {
                sourceWindow.postMessage({
                  type: 'nexopa-action-response',
                  requestId: requestId,
                  action: action,
                  result: { valid: !!user, user: user, validated: true },
                  error: null,
                  timestamp: new Date().toISOString()
                }, '*');
              }).catch(err => {
                sourceWindow.postMessage({
                  type: 'nexopa-action-response',
                  requestId: requestId,
                  action: action,
                  result: null,
                  error: err.message,
                  timestamp: new Date().toISOString()
                }, '*');
              });
            } else if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION.checkAuthMe) {
              return API_COORDINATION.checkAuthMe().then(authResult => {
                sourceWindow.postMessage({
                  type: 'nexopa-action-response',
                  requestId: requestId,
                  action: action,
                  result: authResult,
                  error: null,
                  timestamp: new Date().toISOString()
                }, '*');
              }).catch(err => {
                sourceWindow.postMessage({
                  type: 'nexopa-action-response',
                  requestId: requestId,
                  action: action,
                  result: null,
                  error: err.message,
                  timestamp: new Date().toISOString()
                }, '*');
              });
            }
            break;
            
          default:
            error = `Unknown action: ${action}`;
        }
      } catch (err) {
        error = err.message;
      }
      
      // Send response (if not already sent for async actions)
      if (action !== 'checkAuthMe') {
        sourceWindow.postMessage({
          type: 'nexopa-action-response',
          requestId: requestId,
          action: action,
          result: result,
          error: error,
          timestamp: new Date().toISOString()
        }, '*');
      }
      
      console.log(`⚡ Action executed for ${sourceId}: ${action}`);
      
      // Record action execution
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.actionExecutions = 
          window.app._dependencyGraph.iframeCoordinator.actionExecutions || [];
        window.app._dependencyGraph.iframeCoordinator.actionExecutions.push({
          sourceId: sourceId,
          action: action,
          success: !error,
          timestamp: new Date().toISOString()
        });
      }
    },
    
    // Handle data request
    handleDataRequest: async function(sourceWindow, data) {
      const dataType = data.dataType;
      const params = data.params || {};
      const requestId = data.requestId;
      const sourceId = data.sourceId;
      
      let responseData = null;
      let error = null;
      
      try {
        // Handle different data types
        switch(dataType) {
          case 'userProfile':
            // Use modular API if available
            if (window.api && window.api.auth && window.api.auth.getUser) {
              responseData = await window.api.auth.getUser();
            } else {
              responseData = window.currentUser || (AUTH_STATE && AUTH_STATE.getUser());
            }
            break;
            
          case 'settings':
            responseData = SETTINGS_SERVICE ? SETTINGS_SERVICE.current : {};
            break;
            
          case 'networkStatus':
            responseData = {
              status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
              backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
              isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
            };
            break;
            
          case 'cachedData':
            if (typeof DATA_CACHE !== 'undefined') {
              if (params.key) {
                responseData = DATA_CACHE.getInstant(params.key);
              } else if (params.tab) {
                responseData = DATA_CACHE.getOfflineTabData(params.tab);
              }
            }
            break;
            
          case 'uiState':
            responseData = UI_ORCHESTRATOR.getState();
            break;
            
          case 'bootstrapStatus':
            responseData = BOOTSTRAP_STATE.getStatusReport();
            break;
            
          default:
            error = `Unknown data type: ${dataType}`;
        }
      } catch (err) {
        error = err.message;
      }
      
      // Send response
      sourceWindow.postMessage({
        type: 'nexopa-data-response',
        requestId: requestId,
        dataType: dataType,
        data: responseData,
        error: error,
        timestamp: new Date().toISOString()
      }, '*');
      
      console.log(`📊 Data sent to ${sourceId}: ${dataType}`);
      
      // Record data request
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.dataRequests = 
          window.app._dependencyGraph.iframeCoordinator.dataRequests || [];
        window.app._dependencyGraph.iframeCoordinator.dataRequests.push({
          sourceId: sourceId,
          dataType: dataType,
          success: !error,
          timestamp: new Date().toISOString()
        });
      }
    },
    
    // Handle cached data request
    handleCachedDataRequest: function(sourceWindow, data) {
      const requestId = data.requestId;
      const sourceId = data.sourceId;
      const instant = data.instant !== false; // Default to true
      
      let cachedData = {};
      let error = null;
      
      try {
        if (typeof DATA_CACHE !== 'undefined') {
          cachedData = DATA_CACHE.getAllCachedTabData();
        }
      } catch (err) {
        error = err.message;
      }
      
      // Send response
      sourceWindow.postMessage({
        type: 'nexopa-cached-data-response',
        requestId: requestId,
        data: cachedData,
        instant: instant,
        error: error,
        timestamp: new Date().toISOString()
      }, '*');
      
      console.log(`💾 Cached data sent to ${sourceId} (instant: ${instant})`);
    },
    
    // Handle broadcast
    handleBroadcast: function(sourceWindow, data) {
      const eventType = data.eventType;
      const eventData = data.eventData;
      const sourceId = data.sourceId;
      
      // Broadcast to other iframes/pages (excluding source)
      this.broadcastToOthers(sourceId, {
        type: 'nexopa-broadcast-received',
        eventType: eventType,
        eventData: eventData,
        sourceId: sourceId,
        timestamp: new Date().toISOString()
      });
      
      // Also dispatch on main window for local components
      window.dispatchEvent(new CustomEvent(`nexopa-${eventType}`, {
        detail: eventData
      }));
      
      console.log(`📡 Broadcast from ${sourceId}: ${eventType}`);
      
      // Record broadcast
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.broadcasts = 
          window.app._dependencyGraph.iframeCoordinator.broadcasts || [];
        window.app._dependencyGraph.iframeCoordinator.broadcasts.push({
          sourceId: sourceId,
          eventType: eventType,
          timestamp: new Date().toISOString()
        });
      }
    },
    
    // Check iframe readiness
    checkIframeReadiness: function() {
      this.iframes.forEach((iframe, id) => {
        if (!iframe.ready && iframe.element) {
          try {
            // Try to send readiness check
            iframe.element.contentWindow.postMessage({
              type: 'nexopa-readiness-check',
              timestamp: new Date().toISOString()
            }, '*');
          } catch (error) {
            // Iframe may not be ready or cross-origin
          }
        }
      });
    },
    
    // Send initial state to iframe
    sendInitialStateToIframe: function(iframeWindow, iframeId) {
      const initialState = {
        type: 'nexopa-initial-state',
        iframeId: iframeId,
        auth: {
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
          user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
          validated: window.currentUser?.validated || false
        },
        network: {
          status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
          backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
          isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
        },
        ui: UI_ORCHESTRATOR.getState(),
        settings: SETTINGS_SERVICE ? SETTINGS_SERVICE.current : {},
        bootstrap: BOOTSTRAP_STATE.getStatusReport(),
        timestamp: new Date().toISOString()
      };
      
      iframeWindow.postMessage(initialState, '*');
      
      console.log(`📤 Initial state sent to iframe: ${iframeId}`);
    },
    
    // Send initial state to page
    sendInitialStateToPage: function(pageWindow, pageId) {
      const initialState = {
        type: 'nexopa-initial-state',
        pageId: pageId,
        auth: {
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated())),
          user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
          validated: window.currentUser?.validated || false
        },
        network: {
          status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
          backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
          isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
        },
        ui: UI_ORCHESTRATOR.getState(),
        settings: SETTINGS_SERVICE ? SETTINGS_SERVICE.current : {},
        bootstrap: BOOTSTRAP_STATE.getStatusReport(),
        timestamp: new Date().toISOString()
      };
      
      pageWindow.postMessage(initialState, '*');
      
      console.log(`📤 Initial state sent to page: ${pageId}`);
    },
    
    // Update page state
    updatePageState: function(pageId, updates) {
      if (!this.pageStates.has(pageId)) {
        this.pageStates.set(pageId, {
          id: pageId,
          ready: false,
          authState: null,
          networkState: null,
          uiState: null,
          cachedData: {},
          lastUpdate: null
        });
      }
      
      const pageState = this.pageStates.get(pageId);
      Object.assign(pageState, updates);
      
      console.log(`📝 Page state updated: ${pageId}`);
    },
    
    // Broadcast state update
    broadcastStateUpdate: function(stateType, stateData, excludeSourceId = null) {
      // Broadcast to iframes
      this.iframes.forEach((iframe, id) => {
        if (iframe.ready && iframe.window && id !== excludeSourceId) {
          try {
            iframe.window.postMessage({
              type: 'nexopa-state-update-broadcast',
              stateType: stateType,
              state: stateData,
              timestamp: new Date().toISOString()
            }, '*');
          } catch (error) {
            console.log(`⚠️ Failed to broadcast to iframe ${id}:`, error);
          }
        }
      });
      
      // Broadcast to pages
      this.pageStates.forEach((page, id) => {
        if (page.ready && page.window && id !== excludeSourceId) {
          try {
            page.window.postMessage({
              type: 'nexopa-state-update-broadcast',
              stateType: stateType,
              state: stateData,
              timestamp: new Date().toISOString()
            }, '*');
          } catch (error) {
            console.log(`⚠️ Failed to broadcast to page ${id}:`, error);
          }
        }
      });
      
      console.log(`📡 State update broadcasted: ${stateType}`);
    },
    
    // Broadcast to others (excluding source)
    broadcastToOthers: function(excludeId, message) {
      // Broadcast to iframes
      this.iframes.forEach((iframe, id) => {
        if (iframe.ready && iframe.window && id !== excludeId) {
          try {
            iframe.window.postMessage(message, '*');
          } catch (error) {
            console.log(`⚠️ Failed to broadcast to iframe ${id}:`, error);
          }
        }
      });
      
      // Broadcast to pages
      this.pageStates.forEach((page, id) => {
        if (page.ready && page.window && id !== excludeId) {
          try {
            page.window.postMessage(message, '*');
          } catch (error) {
            console.log(`⚠️ Failed to broadcast to page ${id}:`, error);
          }
        }
      });
    },
    
    // Process queued messages for iframe
    processQueuedMessages: function(iframeId) {
      if (this.messageQueue.has(iframeId)) {
        const messages = this.messageQueue.get(iframeId);
        const iframe = this.iframes.get(iframeId);
        
        if (iframe && iframe.window) {
          messages.forEach(message => {
            try {
              iframe.window.postMessage(message, '*');
            } catch (error) {
              console.log(`⚠️ Failed to send queued message to iframe ${iframeId}:`, error);
            }
          });
          
          this.messageQueue.delete(iframeId);
          console.log(`📤 ${messages.length} queued messages sent to iframe: ${iframeId}`);
          
          // Record queued message processing
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
            window.app._dependencyGraph.iframeCoordinator.queuedMessagesProcessed = 
              window.app._dependencyGraph.iframeCoordinator.queuedMessagesProcessed || [];
            window.app._dependencyGraph.iframeCoordinator.queuedMessagesProcessed.push({
              iframeId: iframeId,
              messageCount: messages.length,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    },
    
    // Queue message for iframe
    queueMessageForIframe: function(iframeId, message) {
      if (!this.messageQueue.has(iframeId)) {
        this.messageQueue.set(iframeId, []);
      }
      
      this.messageQueue.get(iframeId).push(message);
      console.log(`📥 Message queued for iframe: ${iframeId}`);
      
      // Record queued message
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.iframeCoordinator) {
        window.app._dependencyGraph.iframeCoordinator.queuedMessages = 
          window.app._dependencyGraph.iframeCoordinator.queuedMessages || [];
        window.app._dependencyGraph.iframeCoordinator.queuedMessages.push({
          iframeId: iframeId,
          timestamp: new Date().toISOString()
        });
      }
    },
    
    // Expose coordination API
    exposeCoordinationAPI: function() {
      window.NexopaCoordination = {
        // Iframe management
        getIframes: () => Array.from(this.iframes.values()),
        getIframe: (id) => this.iframes.get(id),
        sendToIframe: (iframeId, message) => {
          const iframe = this.iframes.get(iframeId);
          if (iframe && iframe.window) {
            iframe.window.postMessage(message, '*');
            return true;
          }
          return false;
        },
        
        // Page management
        getPages: () => Array.from(this.pageStates.values()),
        getPage: (id) => this.pageStates.get(id),
        sendToPage: (pageId, message) => {
          const page = this.pageStates.get(pageId);
          if (page && page.window) {
            page.window.postMessage(message, '*');
            return true;
          }
          return false;
        },
        
        // State management
        getState: () => ({
          iframes: Array.from(this.iframes.values()).map(iframe => ({
            id: iframe.id,
            ready: iframe.ready,
            lastCommunication: iframe.lastCommunication
          })),
          pages: Array.from(this.pageStates.values()).map(page => ({
            id: page.id,
            ready: page.ready,
            lastUpdate: page.lastUpdate
          })),
          mainPage: this.pageStates.get('main')
        }),
        
        // Broadcast
        broadcast: (message, excludeId = null) => {
          this.broadcastToOthers(excludeId, message);
        },
        
        // Request state from all
        requestStateFromAll: (stateType) => {
          const requestId = `request-${Date.now()}`;
          
          // Request from iframes
          this.iframes.forEach((iframe, id) => {
            if (iframe.ready && iframe.window) {
              iframe.window.postMessage({
                type: 'nexopa-state-request',
                state: stateType,
                requestId: `${requestId}-${id}`,
                timestamp: new Date().toISOString()
              }, '*');
            }
          });
          
          // Request from pages
          this.pageStates.forEach((page, id) => {
            if (page.ready && page.window && id !== 'main') {
              page.window.postMessage({
                type: 'nexopa-state-request',
                state: stateType,
                requestId: `${requestId}-${id}`,
                timestamp: new Date().toISOString()
              }, '*');
            }
          });
          
          return requestId;
        }
      };
    },
    
    // Get coordinator status
    getStatus: function() {
      return {
        iframes: {
          total: this.iframes.size,
          ready: Array.from(this.iframes.values()).filter(iframe => iframe.ready).length
        },
        pages: {
          total: this.pageStates.size,
          ready: Array.from(this.pageStates.values()).filter(page => page.ready).length
        },
        messageQueue: {
          total: Array.from(this.messageQueue.values()).reduce((sum, messages) => sum + messages.length, 0),
          iframes: this.messageQueue.size
        }
      };
    }
  };
  
  // ============================================================================
  // FAILURE CONTAINMENT STRATEGY - PHASE 7: SUBSYSTEM ISOLATION
  // ============================================================================
  
  const ERROR_HANDLER = {
    errorCount: 0,
    lastError: null,
    errorThreshold: 10,
    errorWindow: 60000, // 1 minute
    errorTimestamps: [],
    
    // Store native console methods before overriding
    nativeConsole: {
      error: null,
      warn: null,
      log: null,
      info: null,
      debug: null
    },
    
    // Flag to prevent recursion
    inErrorHandler: false,
    
    // Initialize error handler
    initialize: function() {
      console.log('🛡️ Initializing enhanced error handler...');
      
      // Record error handler initialization
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.errorHandler = {
          initialized: true,
          initializationTime: new Date().toISOString()
        };
      }
      
      // Store native console methods
      this.storeNativeConsoleMethods();
      
      // Setup global error handlers
      this.setupGlobalErrorHandlers();
      
      // Setup unhandled rejection handler
      this.setupUnhandledRejectionHandler();
      
      // Setup network error handler
      this.setupNetworkErrorHandler();
      
      // Setup UI error handler
      this.setupUIErrorHandler();
      
      // Setup error recovery system
      this.setupErrorRecovery();
      
      // Setup error reporting
      this.setupErrorReporting();
      
      console.log('✅ Enhanced error handler initialized');
    },
    
    // Store native console methods
    storeNativeConsoleMethods: function() {
      this.nativeConsole.error = console.error.bind(console);
      this.nativeConsole.warn = console.warn.bind(console);
      this.nativeConsole.log = console.log.bind(console);
      this.nativeConsole.info = console.info.bind(console);
      this.nativeConsole.debug = console.debug.bind(console);
      
      console.log('📝 Native console methods stored for safe error handling');
      
      // Record console method storage
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.consoleMethodsStored = true;
        window.app._dependencyGraph.errorHandler.consoleMethodsStoredAt = new Date().toISOString();
      }
    },
    
    // Setup global error handlers
    setupGlobalErrorHandlers: function() {
      // Window error handler
      window.addEventListener('error', (event) => {
        this.handleGlobalError(event);
      });
      
      // Console error interceptor (development only)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        this.setupConsoleInterception();
      }
    },
    
    // Setup console interception safely
    setupConsoleInterception: function() {
      // Only intercept in development mode
      console.log('🔧 Setting up safe console interception for development');
      
      // Record console interception setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.consoleInterception = {
          setup: true,
          developmentOnly: true,
          setupAt: new Date().toISOString()
        };
      }
      
      // Override console.error with recursion protection
      const self = this;
      console.error = function(...args) {
        // Call the native console.error first
        self.nativeConsole.error.apply(console, args);
        
        // Then handle the error through our system (if not already in handler)
        if (!self.inErrorHandler) {
          self.inErrorHandler = true;
          try {
            self.handleConsoleError(args);
          } catch (err) {
            // If our handler fails, log it natively and continue
            self.nativeConsole.error.call(console, 'Error handler failed:', err);
          } finally {
            self.inErrorHandler = false;
          }
        }
      };
      
      // Override console.warn with recursion protection
      console.warn = function(...args) {
        self.nativeConsole.warn.apply(console, args);
        
        if (!self.inErrorHandler) {
          self.inErrorHandler = true;
          try {
            self.handleConsoleWarn(args);
          } catch (err) {
            self.nativeConsole.error.call(console, 'Warn handler failed:', err);
          } finally {
            self.inErrorHandler = false;
          }
        }
      };
      
      console.log('✅ Safe console interception configured');
    },
    
    // Setup unhandled rejection handler
    setupUnhandledRejectionHandler: function() {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleUnhandledRejection(event);
      });
    },
    
    // Setup network error handler
    setupNetworkErrorHandler: function() {
      // Online/offline events
      window.addEventListener('offline', () => {
        this.handleNetworkOffline();
      });
      
      window.addEventListener('online', () => {
        this.handleNetworkOnline();
      });
      
      // Fetch error interceptor
      const originalFetch = window.fetch;
      if (originalFetch) {
        window.fetch = (...args) => {
          return originalFetch.apply(window, args)
            .catch(error => {
              this.handleFetchError(error, args);
              throw error;
            });
        };
      }
    },
    
    // Setup UI error handler
    setupUIErrorHandler: function() {
      // Mutation observer for DOM errors
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            // Check for broken images
            if (mutation.addedNodes.length) {
              mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'IMG') {
                  node.addEventListener('error', () => {
                    this.handleImageError(node);
                  });
                }
              });
            }
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      
      // Click error boundary
      document.addEventListener('click', (e) => {
        // Check if click caused an error (indirectly)
        setTimeout(() => {
          // This is a placeholder for actual click error tracking
        }, 0);
      }, true);
    },
    
    // Setup error recovery system
    setupErrorRecovery: function() {
      // Periodic error cleanup
      setInterval(() => {
        this.cleanupOldErrors();
      }, 30000);
      
      // Error count reset
      setInterval(() => {
        this.resetErrorCountIfSafe();
      }, 5 * 60 * 1000); // 5 minutes
    },
    
    // Setup error reporting
    setupErrorReporting: function() {
      // Only in production
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        // Setup error reporting to backend if available
        window.addEventListener('nexopa-error-reported', (event) => {
          this.reportErrorToBackend(event.detail);
        });
      }
    },
    
    // Handle global error
    handleGlobalError: function(event) {
      // Prevent recursion by checking flag
      if (this.inErrorHandler) {
        this.nativeConsole.error.call(console, 'Recursion detected in error handler, skipping:', event.message);
        
        // Record recursion detection
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.recursionDetections = 
            window.app._dependencyGraph.errorHandler.recursionDetections || [];
          window.app._dependencyGraph.errorHandler.recursionDetections.push({
            type: 'global_error',
            timestamp: new Date().toISOString()
          });
        }
        
        return;
      }
      
      this.inErrorHandler = true;
      try {
        this.errorCount++;
        this.errorTimestamps.push(Date.now());
        
        const errorDetails = {
          type: 'global_error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack
          } : null,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent
        };
        
        this.lastError = errorDetails;
        
        // Log error using native console (not intercepted version)
        this.nativeConsole.error.call(console, '🚨 Global error caught:', errorDetails);
        
        // Record error in dependency graph
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.globalErrors = 
            window.app._dependencyGraph.errorHandler.globalErrors || [];
          window.app._dependencyGraph.errorHandler.globalErrors.push({
            ...errorDetails,
            handledAt: new Date().toISOString()
          });
          window.app._dependencyGraph.errorHandler.totalErrorCount = this.errorCount;
        }
        
        // Don't show error for missing resources
        if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')) {
          return;
        }
        
        // Check error threshold
        if (this.isErrorThresholdExceeded()) {
          this.handleErrorThresholdExceeded();
          return;
        }
        
        // Show user-friendly error
        this.showErrorToUser('An unexpected error occurred. The app will continue to work in limited mode.');
        
        // Dispatch error event (safely)
        this.dispatchErrorEvent('global-error', errorDetails);
        
        // Attempt automatic recovery
        this.attemptAutomaticRecovery(errorDetails);
        
      } catch (handlerError) {
        // If our own handler fails, log it natively
        this.nativeConsole.error.call(console, 'Error handler failed:', handlerError);
        
        // Record handler failure
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.handlerFailures = 
            window.app._dependencyGraph.errorHandler.handlerFailures || [];
          window.app._dependencyGraph.errorHandler.handlerFailures.push({
            error: handlerError.message,
            timestamp: new Date().toISOString()
          });
        }
      } finally {
        this.inErrorHandler = false;
      }
    },
    
    // Handle console error
    handleConsoleError: function(args) {
      // Track console errors in development
      const errorDetails = {
        type: 'console_error',
        args: args.map(arg => {
          if (arg instanceof Error) {
            return {
              name: arg.name,
              message: arg.message,
              stack: arg.stack
            };
          }
          return arg;
        }),
        timestamp: new Date().toISOString()
      };
      
      // Record console error
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.consoleErrors = 
          window.app._dependencyGraph.errorHandler.consoleErrors || [];
        window.app._dependencyGraph.errorHandler.consoleErrors.push({
          ...errorDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      // Dispatch event safely (don't trigger console.error again)
      this.dispatchErrorEvent('console-error', errorDetails);
    },
    
    // Handle console warn
    handleConsoleWarn: function(args) {
      const warnDetails = {
        type: 'console_warn',
        args: args,
        timestamp: new Date().toISOString()
      };
      
      // Record console warning
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.consoleWarnings = 
          window.app._dependencyGraph.errorHandler.consoleWarnings || [];
        window.app._dependencyGraph.errorHandler.consoleWarnings.push({
          ...warnDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      this.dispatchErrorEvent('console-warn', warnDetails);
    },
    
    // Handle unhandled rejection
    handleUnhandledRejection: function(event) {
      // Prevent recursion
      if (this.inErrorHandler) {
        this.nativeConsole.error.call(console, 'Recursion detected in rejection handler, skipping');
        
        // Record recursion detection
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.recursionDetections = 
            window.app._dependencyGraph.errorHandler.recursionDetections || [];
          window.app._dependencyGraph.errorHandler.recursionDetections.push({
            type: 'unhandled_rejection',
            timestamp: new Date().toISOString()
          });
        }
        
        return;
      }
      
      this.inErrorHandler = true;
      try {
        this.errorCount++;
        this.errorTimestamps.push(Date.now());
        
        const errorDetails = {
          type: 'unhandled_rejection',
          reason: event.reason ? {
            name: event.reason.name,
            message: event.reason.message,
            stack: event.reason.stack
          } : event.reason,
          promise: event.promise,
          timestamp: new Date().toISOString(),
          url: window.location.href
        };
        
        this.lastError = errorDetails;
        
        // Log error using native console
        this.nativeConsole.error.call(console, '🚨 Unhandled promise rejection:', errorDetails);
        
        // Record rejection in dependency graph
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.unhandledRejections = 
            window.app._dependencyGraph.errorHandler.unhandledRejections || [];
          window.app._dependencyGraph.errorHandler.unhandledRejections.push({
            ...errorDetails,
            handledAt: new Date().toISOString()
          });
          window.app._dependencyGraph.errorHandler.totalErrorCount = this.errorCount;
        }
        
        // Check error threshold
        if (this.isErrorThresholdExceeded()) {
          this.handleErrorThresholdExceeded();
          return;
        }
        
        // Show user-friendly error
        this.showErrorToUser('An operation failed. Please try again.');
        
        // Dispatch error event safely
        this.dispatchErrorEvent('unhandled-rejection', errorDetails);
        
      } catch (handlerError) {
        this.nativeConsole.error.call(console, 'Rejection handler failed:', handlerError);
        
        // Record handler failure
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.handlerFailures = 
            window.app._dependencyGraph.errorHandler.handlerFailures || [];
          window.app._dependencyGraph.errorHandler.handlerFailures.push({
            error: handlerError.message,
            timestamp: new Date().toISOString()
          });
        }
      } finally {
        this.inErrorHandler = false;
      }
    },
    
    // Handle network offline
    handleNetworkOffline: function() {
      const errorDetails = {
        type: 'network_offline',
        timestamp: new Date().toISOString(),
        message: 'Network connection lost'
      };
      
      // Record network offline event
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.networkEvents = 
          window.app._dependencyGraph.errorHandler.networkEvents || [];
        window.app._dependencyGraph.errorHandler.networkEvents.push({
          ...errorDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      // Show warning (use native console to avoid recursion)
      this.nativeConsole.warn.call(console, 'Network offline');
      this.showErrorToUser('You are offline. Some features may be limited.', 'warning');
      
      // Dispatch event safely
      this.dispatchErrorEvent('network-offline', errorDetails);
    },
    
    // Handle network online
    handleNetworkOnline: function() {
      const errorDetails = {
        type: 'network_online',
        timestamp: new Date().toISOString(),
        message: 'Network connection restored'
      };
      
      // Record network online event
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.networkEvents = 
          window.app._dependencyGraph.errorHandler.networkEvents || [];
        window.app._dependencyGraph.errorHandler.networkEvents.push({
          ...errorDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      // Show success
      this.nativeConsole.log.call(console, 'Network online');
      this.showErrorToUser('Back online', 'success');
      
      // Dispatch event safely
      this.dispatchErrorEvent('network-online', errorDetails);
    },
    
    // Handle fetch error
    handleFetchError: function(error, args) {
      const errorDetails = {
        type: 'fetch_error',
        error: {
          name: error.name,
          message: error.message
        },
        args: args,
        timestamp: new Date().toISOString()
      };
      
      // Record fetch error
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.fetchErrors = 
          window.app._dependencyGraph.errorHandler.fetchErrors || [];
        window.app._dependencyGraph.errorHandler.fetchErrors.push({
          ...errorDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      // Don't log fetch errors for missing resources
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        // These are network errors, already handled by network offline event
        return;
      }
      
      // Dispatch event safely
      this.dispatchErrorEvent('fetch-error', errorDetails);
    },
    
    // Handle image error
    handleImageError: function(imgElement) {
      const errorDetails = {
        type: 'image_error',
        src: imgElement.src,
        alt: imgElement.alt,
        timestamp: new Date().toISOString()
      };
      
      // Record image error
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.imageErrors = 
          window.app._dependencyGraph.errorHandler.imageErrors || [];
        window.app._dependencyGraph.errorHandler.imageErrors.push({
          ...errorDetails,
          handledAt: new Date().toISOString()
        });
      }
      
      // Set placeholder image
      imgElement.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRkZGIi8+CjxwYXRoIGQ9Ik0zMCAzMEg3MFY3MEgzMFYzMFoiIGZpbGw9IiNFMkUyRTIiLz4KPHBhdGggZD0iTTQ1IDQ1TDU1IDU1TTU1IDQ1TDQ1IDU1IiBzdHJva2U9IiM5OTk5OTkiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4K';
      imgElement.alt = 'Image failed to load';
      
      // Dispatch event safely
      this.dispatchErrorEvent('image-error', errorDetails);
    },
    
    // Show error to user
    showErrorToUser: function(message, type = 'error') {
      // Record error display
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.userErrors = 
          window.app._dependencyGraph.errorHandler.userErrors || [];
        window.app._dependencyGraph.errorHandler.userErrors.push({
          message: message,
          type: type,
          timestamp: new Date().toISOString()
        });
      }
      
      // Use UI orchestrator if available
      if (typeof UI_ORCHESTRATOR !== 'undefined' && UI_ORCHESTRATOR.showNotification) {
        try {
          UI_ORCHESTRATOR.showNotification(message, type, type === 'error' ? 10000 : 5000);
        } catch (err) {
          // If UI orchestrator fails, fall back to native console
          this.nativeConsole.error.call(console, 'Failed to show notification:', err);
        }
        return;
      }
      
      // Fallback error display
      try {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${type === 'error' ? '#f87171' : 
                      type === 'warning' ? '#f59e0b' : 
                      type === 'success' ? '#10b981' : 
                      '#3b82f6'};
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          z-index: 9999;
          max-width: 300px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          animation: slideInRight 0.3s ease-out;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
          if (errorDiv.parentNode) {
            errorDiv.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => errorDiv.remove(), 300);
          }
        }, type === 'error' ? 10000 : 5000);
      } catch (err) {
        this.nativeConsole.error.call(console, 'Failed to create error display:', err);
      }
    },
    
    // Dispatch error event safely (without triggering console interception)
    dispatchErrorEvent: function(errorType, details) {
      try {
        const event = new CustomEvent('nexopa-error', {
          detail: {
            type: errorType,
            details: details,
            errorCount: this.errorCount,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(event);
        
        // Also dispatch specific event
        const specificEvent = new CustomEvent(`nexopa-${errorType}`, {
          detail: details
        });
        window.dispatchEvent(specificEvent);
        
        // Record event dispatch
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.dispatchedEvents = 
            window.app._dependencyGraph.errorHandler.dispatchedEvents || [];
          window.app._dependencyGraph.errorHandler.dispatchedEvents.push({
            eventType: errorType,
            timestamp: new Date().toISOString()
          });
        }
      } catch (eventError) {
        // If dispatching fails, log it natively
        this.nativeConsole.error.call(console, 'Failed to dispatch error event:', eventError);
        
        // Record dispatch failure
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.dispatchFailures = 
            window.app._dependencyGraph.errorHandler.dispatchFailures || [];
          window.app._dependencyGraph.errorHandler.dispatchFailures.push({
            error: eventError.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    },
    
    // Check if error threshold exceeded
    isErrorThresholdExceeded: function() {
      // Clean up old timestamps
      const now = Date.now();
      this.errorTimestamps = this.errorTimestamps.filter(timestamp => 
        now - timestamp < this.errorWindow
      );
      
      // Check threshold
      return this.errorTimestamps.length >= this.errorThreshold;
    },
    
    // Handle error threshold exceeded
    handleErrorThresholdExceeded: function() {
      this.nativeConsole.error.call(console, '🚨 Error threshold exceeded! Too many errors in a short time.');
      
      // Record threshold exceeded
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.thresholdExceeded = {
          exceeded: true,
          errorCount: this.errorTimestamps.length,
          threshold: this.errorThreshold,
          timestamp: new Date().toISOString()
        };
      }
      
      // Show critical error
      this.showErrorToUser('Too many errors occurred. The app may become unstable.', 'error');
      
      // Dispatch critical error event safely
      try {
        const event = new CustomEvent('nexopa-error-threshold-exceeded', {
          detail: {
            errorCount: this.errorCount,
            threshold: this.errorThreshold,
            window: this.errorWindow,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(event);
      } catch (err) {
        this.nativeConsole.error.call(console, 'Failed to dispatch threshold event:', err);
      }
      
      // Reset error count to prevent continuous alerts
      this.errorCount = 0;
      this.errorTimestamps = [];
    },
    
    // Cleanup old errors
    cleanupOldErrors: function() {
      const now = Date.now();
      const cutoff = now - (5 * 60 * 1000); // 5 minutes
      
      this.errorTimestamps = this.errorTimestamps.filter(timestamp => timestamp > cutoff);
      
      // Record cleanup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.cleanups = 
          window.app._dependencyGraph.errorHandler.cleanups || [];
        window.app._dependencyGraph.errorHandler.cleanups.push({
          timestamp: new Date().toISOString(),
          remainingErrors: this.errorTimestamps.length
        });
      }
    },
    
    // Reset error count if safe
    resetErrorCountIfSafe: function() {
      const now = Date.now();
      const recentErrors = this.errorTimestamps.filter(timestamp => 
        now - timestamp < 60000 // 1 minute
      );
      
      if (recentErrors.length === 0) {
        this.errorCount = 0;
        this.errorTimestamps = [];
        this.nativeConsole.log.call(console, '🔄 Error count reset (no recent errors)');
        
        // Record reset
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.resets = 
            window.app._dependencyGraph.errorHandler.resets || [];
          window.app._dependencyGraph.errorHandler.resets.push({
            timestamp: new Date().toISOString(),
            reason: 'no_recent_errors'
          });
        }
      }
    },
    
    // Attempt automatic recovery
    attemptAutomaticRecovery: function(errorDetails) {
      // Record recovery attempt
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.recoveryAttempts = 
          window.app._dependencyGraph.errorHandler.recoveryAttempts || [];
        window.app._dependencyGraph.errorHandler.recoveryAttempts.push({
          errorType: errorDetails.type,
          timestamp: new Date().toISOString()
        });
      }
      
      // Simple recovery strategies based on error type
      switch(errorDetails.type) {
        case 'global_error':
          // For script errors, try to reload the page after a delay
          if (errorDetails.filename && errorDetails.filename.includes('.js')) {
            setTimeout(() => {
              this.nativeConsole.log.call(console, '🔄 Attempting to recover from script error...');
              // Could implement module reloading here
            }, 5000);
          }
          break;
          
        case 'unhandled_rejection':
          // FIX-CACHE-WIPE: previously called DATA_CACHE.clearAll() here whenever an
          // unrelated unhandled rejection's message merely contained "API" or "fetch" —
          // matching nearly any transient network hiccup (aborted request, timed-out
          // background poll, "Failed to fetch", etc.) and silently wiping all cached
          // chat/message data 3s later. That doesn't fix a failed request; it only
          // destroys legitimate local history. Just log it — no destructive "recovery".
          if (errorDetails.reason && errorDetails.reason.message &&
              (errorDetails.reason.message.includes('API') ||
               errorDetails.reason.message.includes('fetch'))) {
            this.nativeConsole.log.call(console, '[Recovery] Ignoring transient API/fetch rejection (cache left intact):', errorDetails.reason.message);
          }
          break;
      }
    },
    
    // Report error to backend
    reportErrorToBackend: function(errorDetails) {
      // This would send error details to your backend
      // For now, just log it using native console
      this.nativeConsole.log.call(console, '📤 Error report prepared:', errorDetails);
      
      // Record error report
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.errorReports = 
          window.app._dependencyGraph.errorHandler.errorReports || [];
        window.app._dependencyGraph.errorHandler.errorReports.push({
          errorType: errorDetails.type,
          timestamp: new Date().toISOString()
        });
      }
      
      // Example of sending to backend (commented out for safety)
      /*
      if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION.isApiAvailable()) {
        API_COORDINATION.safeApiCall('/errors/report', {
          method: 'POST',
          body: JSON.stringify(errorDetails)
        }).catch(() => {
          // Silently fail error reporting
        });
      }
      */
    },
    
    // Register error handler
    onError: function(callback) {
      window.addEventListener('nexopa-error', (event) => {
        try {
          callback(event.detail);
        } catch (err) {
          this.nativeConsole.error.call(console, 'Error handler callback failed:', err);
        }
      });
    },
    
    // Get error stats
    getStats: function() {
      return {
        totalErrors: this.errorCount,
        recentErrors: this.errorTimestamps.length,
        lastError: this.lastError,
        threshold: this.errorThreshold,
        window: this.errorWindow
      };
    },
    
    // Test error handling (development only)
    testErrorHandling: function() {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        this.nativeConsole.log.call(console, '🧪 Testing error handling...');
        
        // Record test start
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
          window.app._dependencyGraph.errorHandler.tests = 
            window.app._dependencyGraph.errorHandler.tests || [];
          window.app._dependencyGraph.errorHandler.tests.push({
            type: 'error_handling_test',
            startedAt: new Date().toISOString()
          });
        }
        
        // Test global error
        setTimeout(() => {
          try {
            throw new Error('Test error for error handling system');
          } catch (error) {
            this.handleGlobalError({
              message: error.message,
              error: error,
              filename: 'test.js',
              lineno: 1,
              colno: 1
            });
          }
        }, 1000);
        
        // Test unhandled rejection
        setTimeout(() => {
          Promise.reject(new Error('Test unhandled rejection'));
        }, 2000);
      }
    },
    
    // Restore native console methods (for debugging)
    restoreNativeConsole: function() {
      console.error = this.nativeConsole.error;
      console.warn = this.nativeConsole.warn;
      console.log = this.nativeConsole.log;
      console.info = this.nativeConsole.info;
      console.debug = this.nativeConsole.debug;
      this.nativeConsole.log.call(console, '✅ Native console methods restored');
      
      // Record console restoration
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.errorHandler) {
        window.app._dependencyGraph.errorHandler.consoleRestored = true;
        window.app._dependencyGraph.errorHandler.consoleRestoredAt = new Date().toISOString();
      }
    }
  };
  
  // ============================================================================
  // PERFORMANCE GOVERNANCE - PHASE 8: BENCHMARK PRESERVATION
  // ============================================================================
  
  const COORDINATION_SYSTEM = {
    // Initialize all coordination systems
    initialize: async function() {
      console.log('🔗 Initializing enhanced coordination system...');
      
      // Record coordination system initialization start
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.coordinationSystem = {
          initializationStarted: true,
          startTime: new Date().toISOString(),
          components: []
        };
      }
      
      try {
        // 1. Initialize session coordinator
        SESSION_COORDINATOR.initialize();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.components.push({
            name: 'session_coordinator',
            initialized: true,
            initializedAt: new Date().toISOString()
          });
        }
        
        // 2. Initialize UI orchestrator
        UI_ORCHESTRATOR.initialize();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.components.push({
            name: 'ui_orchestrator',
            initialized: true,
            initializedAt: new Date().toISOString()
          });
        }
        
        // 3. Initialize iframe coordinator
        IFRAME_COORDINATOR.initialize();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.components.push({
            name: 'iframe_coordinator',
            initialized: true,
            initializedAt: new Date().toISOString()
          });
        }
        
        // 4. Initialize error handler
        ERROR_HANDLER.initialize();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.components.push({
            name: 'error_handler',
            initialized: true,
            initializedAt: new Date().toISOString()
          });
        }
        
        // 5. Setup cross-system communication
        this.setupCrossSystemCommunication();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemCommunication = {
            setup: true,
            setupAt: new Date().toISOString()
          };
        }
        
        // 6. Expose coordination API
        this.exposeCoordinationAPI();
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.apiExposed = true;
          window.app._dependencyGraph.coordinationSystem.apiExposedAt = new Date().toISOString();
        }
        
        console.log('✅ Enhanced coordination system initialized');
        
        // Record successful initialization
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.initialized = true;
          window.app._dependencyGraph.coordinationSystem.initializationTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSystem.success = true;
        }
        
      } catch (error) {
        console.error('❌ Coordination system initialization failed:', error);
        
        // Record initialization failure
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.initialized = false;
          window.app._dependencyGraph.coordinationSystem.initializationTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSystem.success = false;
          window.app._dependencyGraph.coordinationSystem.error = error.message;
        }
        
        // Continue anyway - systems should work independently
      }
    },
    
    // Setup cross-system communication
    setupCrossSystemCommunication: function() {
      console.log('📡 Setting up cross-system communication...');
      
      // Record cross-system communication setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
        window.app._dependencyGraph.coordinationSystem.crossSystemEvents = [];
      }
      
      // Session changes → UI updates
      window.addEventListener('nexopa-session-change', (event) => {
        UI_ORCHESTRATOR.handleSessionChange(event.detail);
        IFRAME_COORDINATOR.broadcastStateUpdate('auth', event.detail);
        
        // Record cross-system event
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemEvents.push({
            type: 'session_change',
            timestamp: new Date().toISOString(),
            detail: event.detail
          });
        }
      });
      
      // Network changes → UI updates
      window.addEventListener('nexopa-network-change', (event) => {
        UI_ORCHESTRATOR.handleResponsiveChange(event.detail);
        IFRAME_COORDINATOR.broadcastStateUpdate('network', event.detail);
        
        // Record cross-system event
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemEvents.push({
            type: 'network_change',
            timestamp: new Date().toISOString(),
            detail: event.detail
          });
        }
      });
      
      // UI changes → Session updates
      window.addEventListener('nexopa-sidebar-toggle', (event) => {
        // Update UI state in session coordinator if needed
        // Record cross-system event
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemEvents.push({
            type: 'sidebar_toggle',
            timestamp: new Date().toISOString(),
            detail: event.detail
          });
        }
      });
      
      // Errors → All systems
      window.addEventListener('nexopa-error', (event) => {
        // Log error in all systems
        console.error('🚨 Coordination system error:', event.detail);
        
        // Record cross-system event
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemEvents.push({
            type: 'error',
            timestamp: new Date().toISOString(),
            detail: event.detail
          });
        }
      });
      
      // Bootstrap progress → All systems
      window.addEventListener('nexopa-bootstrap-progress', (event) => {
        // Update all systems with bootstrap progress
        IFRAME_COORDINATOR.broadcastToOthers(null, {
          type: 'nexopa-bootstrap-progress',
          data: event.detail,
          timestamp: new Date().toISOString()
        });
        
        // Record cross-system event
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSystem) {
          window.app._dependencyGraph.coordinationSystem.crossSystemEvents.push({
            type: 'bootstrap_progress',
            timestamp: new Date().toISOString(),
            detail: event.detail
          });
        }
      });
      
      console.log('✅ Cross-system communication setup complete');
    },
    
    // Expose coordination API
    exposeCoordinationAPI: function() {
      window.NexopaCoordination = {
        // Bootstrap
        bootstrap: APP_BOOTSTRAP,
        
        // Session
        session: SESSION_COORDINATOR,
        
        // UI
        ui: UI_ORCHESTRATOR,
        
        // Iframes & Pages
        iframes: IFRAME_COORDINATOR,
        
        // Errors
        errors: ERROR_HANDLER,
        
        // Utilities
        utils: {
          waitFor: async (condition, timeout = 10000) => {
            return new Promise((resolve, reject) => {
              const startTime = Date.now();
              
              const check = () => {
                if (condition()) {
                  resolve();
                } else if (Date.now() - startTime > timeout) {
                  reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
                } else {
                  setTimeout(check, 100);
                }
              };
              
              check();
            });
          },
          
          debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
              const later = () => {
                clearTimeout(timeout);
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          },
          
          throttle: (func, limit) => {
            let inThrottle;
            return function(...args) {
              if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
              }
            };
          }
        },
        // Validate session before iframe loading
validateSessionBeforeIframeLoad: function(iframeElement, pageConfig) {
  return new Promise((resolve) => {
    console.log(`🔐 Validating session for iframe: ${pageConfig.id}`);
    
    // Check if session exists
    if (!window.currentUser && AUTH_STATE) {
      const user = AUTH_STATE.getUser();
      if (user) {
        window.currentUser = user;
        console.log('✅ Session validated from AUTH_STATE');
        resolve(true);
        return;
      }
    }
    
    if (window.currentUser) {
      console.log('✅ Session exists');
      resolve(true);
      return;
    }
    
    // No session found
    console.warn('⚠️ No session found for iframe load');
    
    // Show auth UI instead of loading iframe
    this.showAuthUI();
    
    // Prevent iframe from loading
    if (iframeElement && iframeElement.parentNode) {
      iframeElement.remove();
    }
    
    resolve(false);
  });
},
        
        // Get system status
        getStatus: () => ({
          bootstrap: APP_BOOTSTRAP.getStatus(),
          session: SESSION_COORDINATOR.getStatus(),
          ui: UI_ORCHESTRATOR.getState(),
          iframes: IFRAME_COORDINATOR.getStatus(),
          errors: ERROR_HANDLER.getStats(),
          timestamp: new Date().toISOString()
        }),
        
        // Restart coordination
        restart: () => {
          console.log('🔄 Restarting coordination system...');
          return this.initialize();
        }
      };
    },
    
    // Get coordination status
    getStatus: function() {
      return {
        initialized: true,
        components: {
          session: typeof SESSION_COORDINATOR !== 'undefined',
          ui: typeof UI_ORCHESTRATOR !== 'undefined',
          iframes: typeof IFRAME_COORDINATOR !== 'undefined',
          errors: typeof ERROR_HANDLER !== 'undefined'
        },
        timestamp: new Date().toISOString()
      };
    }
  };
  
  // ============================================================================
  // BACKWARD COMPATIBILITY ASSURANCE - PHASE 9: NO BREAKING CHANGES
  // ============================================================================
  
  // Enhanced initialization function
  async function enhancedInitializeApp() {
    console.log('🚀 Starting enhanced Nexopa initialization...');
    
    // Record enhanced initialization start
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.enhancedInitialization = {
        started: true,
        startTime: new Date().toISOString()
      };
    }
    
    try {
      // Mark DOM as ready
      BOOTSTRAP_STATE.markDependencyReady('domReady');
      
      // Start enhanced bootstrap
      await APP_BOOTSTRAP.bootstrap();
      
      // Initialize coordination system
      await COORDINATION_SYSTEM.initialize();
      
      // Setup enhanced event listeners
      setupEnhancedEventListeners();
      
      // Setup enhanced error boundaries
      setupEnhancedErrorBoundaries();
      
      console.log('✅ Enhanced Nexopa initialization completed');
      
      // Record successful initialization
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
        window.app._dependencyGraph.enhancedInitialization.completed = true;
        window.app._dependencyGraph.enhancedInitialization.completionTime = new Date().toISOString();
        window.app._dependencyGraph.enhancedInitialization.success = true;
      }
      
      // Dispatch final ready event
      window.dispatchEvent(new CustomEvent('nexopa-enhanced-ready', {
        detail: {
          timestamp: new Date().toISOString(),
          bootstrap: APP_BOOTSTRAP.getStatus(),
          coordination: COORDINATION_SYSTEM.getStatus()
        }
      }));
      
    } catch (error) {
      console.error('❌ Enhanced initialization failed:', error);
      
      // Record initialization failure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
        window.app._dependencyGraph.enhancedInitialization.completed = true;
        window.app._dependencyGraph.enhancedInitialization.completionTime = new Date().toISOString();
        window.app._dependencyGraph.enhancedInitialization.success = false;
        window.app._dependencyGraph.enhancedInitialization.error = error.message;
      }
      
      // Attempt fallback to original initialization
      try {
        console.log('🔄 Falling back to original initialization...');
        
        // Record fallback attempt
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
          window.app._dependencyGraph.enhancedInitialization.fallbackAttempted = true;
          window.app._dependencyGraph.enhancedInitialization.fallbackAttemptedAt = new Date().toISOString();
        }
        
        if (typeof initializeApp === 'function') {
          await initializeApp();
          
          // Record fallback success
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
            window.app._dependencyGraph.enhancedInitialization.fallbackSuccessful = true;
            window.app._dependencyGraph.enhancedInitialization.fallbackCompletedAt = new Date().toISOString();
          }
        } else {
          // Minimal initialization
          console.log('⚠️ Original initializeApp not found, performing minimal initialization');
          APP_BOOTSTRAP.showAuthUI();
          
          // Record minimal initialization
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
            window.app._dependencyGraph.enhancedInitialization.minimalInitialization = true;
            window.app._dependencyGraph.enhancedInitialization.minimalInitializationAt = new Date().toISOString();
          }
        }
      } catch (fallbackError) {
        console.error('❌ Fallback initialization also failed:', fallbackError);
        
        // Record fallback failure
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedInitialization) {
          window.app._dependencyGraph.enhancedInitialization.fallbackFailed = true;
          window.app._dependencyGraph.enhancedInitialization.fallbackError = fallbackError.message;
          window.app._dependencyGraph.enhancedInitialization.fallbackFailedAt = new Date().toISOString();
        }
        
        APP_BOOTSTRAP.showFatalError(fallbackError);
      }
    }
  }
  
  // Setup enhanced event listeners
  function setupEnhancedEventListeners() {
    console.log('🎧 Setting up enhanced event listeners...');
    
    // Record event listener setup
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.enhancedEventListeners = {
        setup: true,
        setupTime: new Date().toISOString(),
        listeners: []
      };
    }
    
    // Enhanced tab switching
    document.querySelectorAll('.nav-icon[data-tab]').forEach(icon => {
      const tabName = icon.getAttribute('data-tab');
      
      icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Record tab switch attempt
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedEventListeners) {
          window.app._dependencyGraph.enhancedEventListeners.listeners.push({
            type: 'tab_switch',
            tabName: tabName,
            timestamp: new Date().toISOString()
          });
        }
        
        // Use UI orchestrator if available
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          UI_ORCHESTRATOR.switchTab(tabName);
        } else if (typeof window.switchTab === 'function') {
          window.switchTab(tabName);
        }
      });
    });
    
    // Enhanced sidebar toggle
    const sidebarToggle = document.querySelector(APP_CONFIG?.sidebarToggle);
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Record sidebar toggle attempt
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedEventListeners) {
          window.app._dependencyGraph.enhancedEventListeners.listeners.push({
            type: 'sidebar_toggle',
            timestamp: new Date().toISOString()
          });
        }
        
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          UI_ORCHESTRATOR.toggleSidebar();
        } else if (typeof window.toggleSidebar === 'function') {
          window.toggleSidebar();
        }
      });
    }
    
    // Enhanced modal handling
    document.addEventListener('click', (e) => {
      // Close modals on overlay click
      if (e.target.classList.contains('modal-overlay')) {
        const modal = e.target.closest('.modal');
        if (modal && modal.id) {
          // Record modal close attempt
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedEventListeners) {
            window.app._dependencyGraph.enhancedEventListeners.listeners.push({
              type: 'modal_close',
              modalId: modal.id,
              method: 'overlay_click',
              timestamp: new Date().toISOString()
            });
          }
          
          if (typeof UI_ORCHESTRATOR !== 'undefined') {
            UI_ORCHESTRATOR.closeModal(modal.id);
          } else {
            modal.classList.add('hidden');
          }
        }
      }
    });
    
    // Enhanced escape key handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Record escape key press
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedEventListeners) {
          window.app._dependencyGraph.enhancedEventListeners.listeners.push({
            type: 'escape_key',
            timestamp: new Date().toISOString()
          });
        }
        
        // Close active modal
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          const activeModal = UI_ORCHESTRATOR.getActiveModal();
          if (activeModal) {
            UI_ORCHESTRATOR.closeModal(activeModal);
          }
        }
        
        // Close sidebar on mobile
        if (window.innerWidth < 768) {
          if (typeof UI_ORCHESTRATOR !== 'undefined') {
            UI_ORCHESTRATOR.closeSidebar();
          }
        }
      }
    });
    
    console.log('✅ Enhanced event listeners setup complete');
  }
  
  // Setup enhanced error boundaries
  function setupEnhancedErrorBoundaries() {
    console.log('🛡️ Setting up enhanced error boundaries...');
    
    // Record error boundaries setup
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.enhancedErrorBoundaries = {
        setup: true,
        setupTime: new Date().toISOString(),
        boundaries: []
      };
    }
    
    // Error boundary for async operations
    window.safeAsync = async function(operation, errorHandler) {
      try {
        return await operation();
      } catch (error) {
        // Record async error
        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedErrorBoundaries) {
          window.app._dependencyGraph.enhancedErrorBoundaries.boundaries.push({
            type: 'async_error',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
        
        if (typeof errorHandler === 'function') {
          errorHandler(error);
        } else {
          // Use the ERROR_HANDLER's native console to avoid recursion
          if (typeof ERROR_HANDLER !== 'undefined' && ERROR_HANDLER.nativeConsole) {
            ERROR_HANDLER.nativeConsole.error.call(console, `Operation failed: ${error.message}`);
          } else {
            console.error(`Operation failed: ${error.message}`);
          }
        }
        throw error;
      }
    };
    
    // Error boundary for event handlers
    window.safeEvent = function(handler) {
      return function(...args) {
        try {
          return handler(...args);
        } catch (error) {
          // Record event handler error
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedErrorBoundaries) {
            window.app._dependencyGraph.enhancedErrorBoundaries.boundaries.push({
              type: 'event_handler_error',
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          // Use native console
          if (typeof ERROR_HANDLER !== 'undefined' && ERROR_HANDLER.nativeConsole) {
            ERROR_HANDLER.nativeConsole.error.call(console, `Event handler failed: ${error.message}`);
          } else {
            console.error(`Event handler failed: ${error.message}`);
          }
        }
      };
    };
    
    // Safe DOM manipulation
    window.safeDOM = {
      setInnerHTML: function(element, html) {
        try {
          element.innerHTML = html;
        } catch (error) {
          // Record DOM error
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedErrorBoundaries) {
            window.app._dependencyGraph.enhancedErrorBoundaries.boundaries.push({
              type: 'dom_innerhtml_error',
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          // Use native console
          if (typeof ERROR_HANDLER !== 'undefined' && ERROR_HANDLER.nativeConsole) {
            ERROR_HANDLER.nativeConsole.error.call(console, 'Failed to set innerHTML:', error);
          } else {
            console.error('Failed to set innerHTML:', error);
          }
          element.textContent = 'Content failed to load';
        }
      },
      
      setAttribute: function(element, attr, value) {
        try {
          element.setAttribute(attr, value);
        } catch (error) {
          // Record attribute error
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedErrorBoundaries) {
            window.app._dependencyGraph.enhancedErrorBoundaries.boundaries.push({
              type: 'dom_attribute_error',
              attribute: attr,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          // Use native console
          if (typeof ERROR_HANDLER !== 'undefined' && ERROR_HANDLER.nativeConsole) {
            ERROR_HANDLER.nativeConsole.error.call(console, `Failed to set attribute ${attr}:`, error);
          } else {
            console.error(`Failed to set attribute ${attr}:`, error);
          }
        }
      },
      
      addEventListener: function(element, event, handler) {
        try {
          element.addEventListener(event, window.safeEvent(handler));
        } catch (error) {
          // Record event listener error
          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.enhancedErrorBoundaries) {
            window.app._dependencyGraph.enhancedErrorBoundaries.boundaries.push({
              type: 'event_listener_error',
              event: event,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
          
          // Use native console
          if (typeof ERROR_HANDLER !== 'undefined' && ERROR_HANDLER.nativeConsole) {
            ERROR_HANDLER.nativeConsole.error.call(console, `Failed to add event listener for ${event}:`, error);
          } else {
            console.error(`Failed to add event listener for ${event}:`, error);
          }
        }
      }
    };
    
    console.log('✅ Enhanced error boundaries setup complete');
  }
  
  // ============================================================================
  // BACKWARD COMPATIBILITY ASSURANCE - PHASE 10: LEGACY SUPPORT
  // ============================================================================
  
  // Ensure backward compatibility with existing code
  function ensureBackwardCompatibility() {
    console.log('🔄 Ensuring backward compatibility...');
    
    // Record backward compatibility setup
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.backwardCompatibility = {
        ensured: true,
        ensuredAt: new Date().toISOString(),
        legacyFunctions: {}
      };
    }
    
    // Expose existing functions if not already exposed
    if (typeof window.toggleSidebar === 'undefined') {
      window.toggleSidebar = function() {
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          UI_ORCHESTRATOR.toggleSidebar();
        }
      };
      
      // Record legacy function exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.legacyFunctions.toggleSidebar = true;
      }
    }
    
    if (typeof window.switchTab === 'undefined') {
      window.switchTab = function(tabName) {
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          UI_ORCHESTRATOR.switchTab(tabName);
        }
      };
      
      // Record legacy function exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.legacyFunctions.switchTab = true;
      }
    }
    
    if (typeof window.showTab === 'undefined') {
      window.showTab = function(tabName) {
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          UI_ORCHESTRATOR.switchTab(tabName);
        }
      };
      
      // Record legacy function exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.legacyFunctions.showTab = true;
      }
    }
    
    if (typeof window.loadExternalTab === 'undefined') {
      window.loadExternalTab = function(tabName, htmlFile) {
        console.log(`Loading external tab: ${tabName} from ${htmlFile}`);
        // Simplified implementation
        window.location.href = htmlFile;
      };
      
      // Record legacy function exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.legacyFunctions.loadExternalTab = true;
      }
    }
    
    if (typeof window.showNotification === 'undefined') {
      window.showNotification = function(message, type = 'info', duration = 5000) {
        if (typeof UI_ORCHESTRATOR !== 'undefined') {
          return UI_ORCHESTRATOR.showNotification(message, type, duration);
        }
        
        // Fallback implementation
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${type === 'error' ? '#f87171' : 
                      type === 'success' ? '#10b981' : 
                      type === 'warning' ? '#f59e0b' : 
                      '#3b82f6'};
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          z-index: 9999;
          max-width: 300px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, duration);
        
        return notification;
      };
      
      // Record legacy function exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.legacyFunctions.showNotification = true;
      }
    }
    
    // Expose coordination system
    if (typeof window.NexopaCore === 'undefined') {
      window.NexopaCore = {
        auth: AUTH_STATE,
        api: SECURE_API,
        token: TOKEN_VALIDATION,
        network: NETWORK_SERVICE_MANAGER,
        cache: DATA_CACHE,
        settings: SETTINGS_SERVICE,
        userIsolation: USER_DATA_ISOLATION,
        coordination: COORDINATION_SYSTEM
      };
      
      // Record NexopaCore exposure
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.backwardCompatibility) {
        window.app._dependencyGraph.backwardCompatibility.nexopaChatCoreExposed = true;
        window.app._dependencyGraph.backwardCompatibility.nexopaChatCoreComponents = Object.keys(window.NexopaCore);
      }
    }
    
    console.log('✅ Backward compatibility ensured');
  }
  
  // ============================================================================
  // MAIN ENTRY POINT - FINAL INTEGRATION
  // ============================================================================
  
  // Start enhanced initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Record DOM content loaded
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.domEvents = {
          DOMContentLoaded: true,
          timestamp: new Date().toISOString()
        };
      }
      
      // Ensure backward compatibility first
      ensureBackwardCompatibility();
      
      // Record backward compatibility completion
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.domEvents.backwardCompatibilityCompleted = true;
        window.app._dependencyGraph.domEvents.backwardCompatibilityCompletedAt = new Date().toISOString();
      }
      
      // Start enhanced initialization
      enhancedInitializeApp().catch(error => {
        console.error('Failed to start enhanced initialization:', error);
        
        // Record enhanced initialization failure
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.domEvents.enhancedInitializationFailed = true;
          window.app._dependencyGraph.domEvents.enhancedInitializationError = error.message;
          window.app._dependencyGraph.domEvents.enhancedInitializationFailedAt = new Date().toISOString();
        }
        
        // Fallback to original initialization
        if (typeof initializeApp === 'function') {
          initializeApp();
          
          // Record original initialization fallback
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.domEvents.originalInitializationFallback = true;
            window.app._dependencyGraph.domEvents.originalInitializationFallbackAt = new Date().toISOString();
          }
        } else {
          // Minimal fallback
          console.log('⚠️ Original initializeApp not found, showing auth UI');
          
          // Record minimal fallback
          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.domEvents.minimalFallback = true;
            window.app._dependencyGraph.domEvents.minimalFallbackAt = new Date().toISOString();
          }
          
          APP_BOOTSTRAP.showAuthUI();
        }
      });
    });
  } else {
    // DOM already ready
    // Record DOM already ready
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.domEvents = {
        DOMAlreadyReady: true,
        readyState: document.readyState,
        timestamp: new Date().toISOString()
      };
    }
    
    ensureBackwardCompatibility();
    
    // Record backward compatibility completion
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.domEvents.backwardCompatibilityCompleted = true;
      window.app._dependencyGraph.domEvents.backwardCompatibilityCompletedAt = new Date().toISOString();
    }
    
    enhancedInitializeApp().catch(error => {
      console.error('Failed to start enhanced initialization:', error);
      
      // Record enhanced initialization failure
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.domEvents.enhancedInitializationFailed = true;
        window.app._dependencyGraph.domEvents.enhancedInitializationError = error.message;
        window.app._dependencyGraph.domEvents.enhancedInitializationFailedAt = new Date().toISOString();
      }
      
      if (typeof initializeApp === 'function') {
        initializeApp();
        
        // Record original initialization fallback
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.domEvents.originalInitializationFallback = true;
          window.app._dependencyGraph.domEvents.originalInitializationFallbackAt = new Date().toISOString();
        }
      } else {
        APP_BOOTSTRAP.showAuthUI();
        
        // Record minimal fallback
        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.domEvents.minimalFallback = true;
          window.app._dependencyGraph.domEvents.minimalFallbackAt = new Date().toISOString();
        }
      }
    });
  }
  
  // Expose initialization function
  window.initializeEnhancedApp = enhancedInitializeApp;
  
  // Record function exposure
  if (window.app && window.app._dependencyGraph) {
    window.app._dependencyGraph.exposedFunctions = {
      initializeEnhancedApp: true,
      exposedAt: new Date().toISOString()
    };
  }
  
  // Add method to check auth me (for API_COORDINATION compatibility)
  if (typeof API_COORDINATION !== 'undefined' && !API_COORDINATION.checkAuthMe) {
    API_COORDINATION.checkAuthMe = function() {
      return new Promise(async (resolve) => {
        // Use modular API if available
        if (window.api && window.api.auth && window.api.auth.getUser) {
          try {
            const user = await window.api.auth.getUser();
            if (user) {
              resolve({ 
                valid: true, 
                user: user,
                validated: true 
              });
            } else {
              resolve({ 
                valid: false, 
                reason: 'No user found' 
              });
            }
          } catch (error) {
            resolve({ 
              valid: false, 
              reason: error.message || 'Auth check failed' 
            });
          }
        } else {
          // Fallback to token validation
          const token = AUTH_STATE.getToken();
          if (!token) {
            resolve({ valid: false, reason: 'No token found' });
            return;
          }
          
          this.safeApiCall('/auth/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }).then(response => {
            if (response.success && response.data) {
              resolve({ 
                valid: true, 
                user: response.data,
                validated: true 
              });
            } else {
              resolve({ 
                valid: false, 
                reason: response.message || 'Auth check failed' 
              });
            }
          }).catch(() => {
            resolve({ valid: false, reason: 'Auth check request failed' });
          });
        }
      });
    };
    
    // Record API_COORDINATION enhancement
    if (window.app && window.app._dependencyGraph) {
      window.app._dependencyGraph.apiCoordinationEnhanced = {
        checkAuthMe: true,
        enhancedAt: new Date().toISOString()
      };
    }
  }
  
  console.log('✅ Nexopa Enhanced Core Services loaded with comprehensive coordination and modular API integration');
})();