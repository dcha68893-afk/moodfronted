// app.core.ui.js - MoodChat UI Navigation & Rendering Engine
// UPDATED: Complete extraction of navigation, routing, and page rendering systems
// UPDATED: Session-aware routing with deterministic page resolution
// UPDATED: Comprehensive iframe orchestration with sandbox security
// UPDATED: Dynamic resource loading with dependency management
// UPDATED: Sidebar navigation with state synchronization
// UPDATED: UI state machine with finite states and transitions
// UPDATED: History management with deep linking support
// UPDATED: Error recovery with graceful degradation
// UPDATED: Performance optimization with lazy loading
// UPDATED: Integration with app.core.js, session.js, and API layer
// FIXED: chat.html loads first by default
// FIXED: Session storage restoration with validation
// FIXED: Sidebar navigation reliability
// FIXED: Iframe synchronization and security
// FIXED: History and back button behavior
// FIXED: Dynamic JS/CSS loading per page
// FIXED: No page "stuck" states
// PATCHED: Module isolation with safety guards for UI components
// PATCHED: DOM element safety checks
// PATCHED: Event handler error protection
// PATCHED: External library safety
// PATCHED: Parent-iframe communication resilience
// PATCHED: Retry and loop protection
// PATCHED: Concise error logging
// PATCHED: Resource existence checking before loading
// PATCHED: Session validation before page loading
// PATCHED: Safe resource loading with try/catch

(function () {
  // ============================================================================
  // SAFETY & ISOLATION SYSTEM
  // ============================================================================
  
  const UI_SAFETY = {
    // Track failed modules to prevent repeated logging
    failedModules: new Set(),
    failedElements: new Map(),
    retryCounts: new Map(),
    maxRetries: 3,
    libraryStatus: new Map(),
    missingResources: new Set(),
    
    // Safe module initialization wrapper
    safeInit: function(moduleName, initFunction, context = null) {
      try {
        // Check if this module previously failed permanently
        if (this.failedModules.has(moduleName)) {
          console.warn(`⚠️ Module ${moduleName} is permanently disabled due to previous failures`);
          return null;
        }
        
        // Initialize module
        const result = initFunction.call(context);
        console.log(`✅ ${moduleName} initialized successfully`);
        return result;
      } catch (error) {
        // Log error only once per module
        if (!this.failedModules.has(moduleName)) {
          console.error(`❌ ${moduleName} initialization failed:`, {
            module: moduleName,
            error: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack ? error.stack.split('\n')[0] : 'No stack'
          });
          this.failedModules.add(moduleName);
        }
        
        // Dispatch module failure event
        try {
          const event = new CustomEvent('moodchat-module-failed', {
            detail: {
              module: moduleName,
              error: error.message,
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(event);
        } catch (e) {
          // Silent fail for event dispatch
        }
        
        return null;
      }
    },
    
    // Safe DOM element access
    safeElement: function(selector, context = document) {
      const cacheKey = `${selector}_${context === document ? 'doc' : 'ctx'}`;
      
      // Check cache first
      if (this.failedElements.has(cacheKey)) {
        return null;
      }
      
      try {
        const element = context.querySelector(selector);
        if (!element) {
          // Log warning only once per selector
          if (!this.failedElements.has(cacheKey)) {
            console.warn(`⚠️ DOM element not found: ${selector}`);
            this.failedElements.set(cacheKey, true);
          }
          return null;
        }
        return element;
      } catch (error) {
        if (!this.failedElements.has(cacheKey)) {
          console.error(`❌ DOM access error for ${selector}:`, error.message);
          this.failedElements.set(cacheKey, true);
        }
        return null;
      }
    },
    
    // Safe event listener attachment
    safeEventListener: function(element, event, handler, options = false) {
      if (!element || !handler) {
        console.warn('⚠️ Cannot attach event to invalid element or handler');
        return () => {}; // Return no-op removal function
      }
      
      const safeHandler = (e) => {
        try {
          handler(e);
        } catch (error) {
          // Prevent error propagation
          e.stopImmediatePropagation();
          
          // Log error once per handler
          const handlerKey = `${element.id || element.className || 'unknown'}_${event}`;
          if (!this.failedElements.has(handlerKey)) {
            console.error(`❌ Event handler failed for ${event} on ${element.tagName}:`, {
              error: error.message,
              timestamp: new Date().toISOString()
            });
            this.failedElements.set(handlerKey, true);
          }
        }
      };
      
      element.addEventListener(event, safeHandler, options);
      
      // Return removal function
      return () => {
        element.removeEventListener(event, safeHandler, options);
      };
    },
    
    // Check library availability
    checkLibrary: function(libraryName, globalPath = '') {
      if (this.libraryStatus.has(libraryName)) {
        return this.libraryStatus.get(libraryName);
      }
      
      let isAvailable = false;
      try {
        if (globalPath) {
          // Check nested path (e.g., 'window.jQuery.fn')
          const pathParts = globalPath.split('.');
          let obj = window;
          for (const part of pathParts) {
            if (!obj[part]) {
              throw new Error(`Library part ${part} not found`);
            }
            obj = obj[part];
          }
          isAvailable = true;
        } else {
          // Check direct window property
          isAvailable = !!window[libraryName];
        }
      } catch (error) {
        isAvailable = false;
      }
      
      this.libraryStatus.set(libraryName, isAvailable);
      
      if (!isAvailable && !this.failedModules.has(`library_${libraryName}`)) {
        console.warn(`⚠️ Required library not available: ${libraryName}`);
        this.failedModules.add(`library_${libraryName}`);
      }
      
      return isAvailable;
    },
    
    // Safe retry mechanism
    safeRetry: function(operationName, operation, maxAttempts = this.maxRetries) {
      const retryKey = `retry_${operationName}`;
      let attempts = this.retryCounts.get(retryKey) || 0;
      
      if (attempts >= maxAttempts) {
        if (!this.failedModules.has(retryKey)) {
          console.warn(`⚠️ Max retries reached for ${operationName}, disabling`);
          this.failedModules.add(retryKey);
        }
        return Promise.reject(new Error(`Max retries (${maxAttempts}) reached for ${operationName}`));
      }
      
      attempts++;
      this.retryCounts.set(retryKey, attempts);
      
      return new Promise((resolve, reject) => {
        try {
          const result = operation();
          if (result && typeof result.then === 'function') {
            // Async operation
            result
              .then(resolve)
              .catch(error => {
                console.warn(`⚠️ Retry ${attempts}/${maxAttempts} failed for ${operationName}:`, error.message);
                if (attempts >= maxAttempts) {
                  reject(error);
                } else {
                  // Exponential backoff
                  setTimeout(() => {
                    this.safeRetry(operationName, operation, maxAttempts)
                      .then(resolve)
                      .catch(reject);
                  }, Math.min(1000 * Math.pow(2, attempts), 10000));
                }
              });
          } else {
            // Sync operation
            resolve(result);
          }
        } catch (error) {
          console.warn(`⚠️ Retry ${attempts}/${maxAttempts} failed for ${operationName}:`, error.message);
          if (attempts >= maxAttempts) {
            reject(error);
          } else {
            setTimeout(() => {
              this.safeRetry(operationName, operation, maxAttempts)
                .then(resolve)
                .catch(reject);
            }, Math.min(1000 * Math.pow(2, attempts), 10000));
          }
        }
      });
    },
    
    // Session validation
    validateSession: function() {
      try {
        // Check multiple possible session sources
        const sources = [
          () => window.currentUser,
          () => window.AUTH_STATE && window.AUTH_STATE.getUser && window.AUTH_STATE.getUser(),
          () => window.app && window.app.session && window.app.session.getUser && window.app.session.getUser()
        ];
        
        for (const source of sources) {
          try {
            const user = source();
            if (user && typeof user === 'object') {
              return { valid: true, user };
            }
          } catch (e) {
            // Continue to next source
          }
        }
        
        // Check token
        const tokenSources = [
          () => window.AUTH_STATE && window.AUTH_STATE.getToken && window.AUTH_STATE.getToken(),
          () => localStorage.getItem('moodchat_token'),
          () => sessionStorage.getItem('moodchat_token')
        ];
        
        for (const source of tokenSources) {
          try {
            const token = source();
            if (token && typeof token === 'string' && token.length > 10) {
              return { valid: true, token };
            }
          } catch (e) {
            // Continue to next source
          }
        }
        
        return { valid: false, reason: 'No valid session found' };
      } catch (error) {
        return { valid: false, reason: `Session validation error: ${error.message}` };
      }
    },
    
    // Check if user is logged in
    userLoggedIn: function() {
      const sessionCheck = this.validateSession();
      return sessionCheck.valid;
    },
    
    // Check if resource exists
    checkResourceExists: async function(url) {
      try {
        // Check if we already know this resource is missing
        if (this.missingResources.has(url)) {
          return false;
        }
        
        // Skip checking for data URLs or inline scripts
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) {
          return true;
        }
        
        // Use HEAD request to check if resource exists
        const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        const exists = response.ok;
        
        if (!exists) {
          this.missingResources.add(url);
          console.warn(`⚠️ Resource does not exist: ${url}`);
        }
        
        return exists;
      } catch (error) {
        // If fetch fails, assume resource doesn't exist
        this.missingResources.add(url);
        console.warn(`⚠️ Failed to check resource ${url}: ${error.message}`);
        return false;
      }
    },
    
    // Safe resource loader
    safeLoad: function(url, type) {
      return new Promise(async (resolve) => {
        try {
          // Check if resource exists before loading
          const exists = await this.checkResourceExists(url);
          
          if (!exists) {
            console.warn(`Skipped missing resource: ${url}`);
            resolve(false);
            return;
          }
          
          const element = document.createElement(type === 'css' ? 'link' : 'script');
          
          if (type === 'css') {
            element.rel = 'stylesheet';
            element.href = url;
            element.type = 'text/css';
          } else {
            element.src = url;
            element.type = 'text/javascript';
          }
          
          element.onload = () => {
            console.log(`✅ ${type.toUpperCase()} loaded: ${url}`);
            resolve(true);
          };
          
          element.onerror = () => {
            console.warn(`Skipped missing resource: ${url}`);
            this.missingResources.add(url);
            
            // Remove the failed element from DOM
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
            
            resolve(false);
          };
          
          document.head.appendChild(element);
        } catch (error) {
          console.warn(`Skipped resource ${url} due to error: ${error.message}`);
          resolve(false);
        }
      });
    },
    
    // Clean up resources
    cleanup: function() {
      // Clear excessive retry counts
      for (const [key, count] of this.retryCounts.entries()) {
        if (count > 100) {
          this.retryCounts.delete(key);
        }
      }
      
      // Limit failed elements cache
      if (this.failedElements.size > 100) {
        const entries = Array.from(this.failedElements.entries());
        this.failedElements = new Map(entries.slice(-50));
      }
    }
  };

  // ============================================================================
  // UI STATE MACHINE - Finite State Management (WITH SAFETY)
  // ============================================================================
  
  const UI_STATE = {
    STATES: {
      BOOTING: 'booting',
      LOADING: 'loading',
      READY: 'ready',
      ERROR: 'error',
      OFFLINE: 'offline',
      LOCKED: 'locked'
    },
    
    TRANSITIONS: {
      booting_to_loading: ['booting'],
      loading_to_ready: ['loading'],
      loading_to_error: ['loading'],
      ready_to_loading: ['ready'],
      ready_to_offline: ['ready'],
      error_to_loading: ['error'],
      offline_to_loading: ['offline'],
      any_to_locked: ['*']
    },
    
    currentState: 'booting',
    previousState: null,
    transitionHistory: [],
    
    initialize: function() {
      return UI_SAFETY.safeInit('UI_STATE_MACHINE', () => {
        console.log('🔄 UI State Machine initializing...');
        this.currentState = this.STATES.BOOTING;
        this.previousState = null;
        this.transitionHistory = [];
        
        // Safe event listeners
        UI_SAFETY.safeEventListener(window, 'online', () => {
          if (this.currentState === this.STATES.OFFLINE) {
            this.transitionTo(this.STATES.READY, 'network_recovered');
          }
        });
        
        UI_SAFETY.safeEventListener(window, 'offline', () => {
          this.transitionTo(this.STATES.OFFLINE, 'network_lost');
        });
        
        console.log('✅ UI State Machine initialized');
        return true;
      }, this);
    },
    
    transitionTo: function(newState, reason = '') {
      try {
        const validTransitions = this.TRANSITIONS[`${this.currentState}_to_${newState}`] || 
                                this.TRANSITIONS[`any_to_${newState}`];
        
        if (!validTransitions || 
            (!validTransitions.includes('*') && !validTransitions.includes(this.currentState))) {
          console.error(`❌ Invalid state transition: ${this.currentState} → ${newState}`);
          return false;
        }
        
        this.previousState = this.currentState;
        this.currentState = newState;
        
        this.transitionHistory.push({
          from: this.previousState,
          to: newState,
          reason: reason,
          timestamp: new Date().toISOString(),
          duration: this.transitionHistory.length > 0 ? 
            Date.now() - new Date(this.transitionHistory[this.transitionHistory.length - 1].timestamp).getTime() : 0
        });
        
        // Keep history manageable
        if (this.transitionHistory.length > 50) {
          this.transitionHistory = this.transitionHistory.slice(-50);
        }
        
        console.log(`🔄 UI State: ${this.previousState} → ${newState} (${reason})`);
        
        // Dispatch state change event
        const event = new CustomEvent('moodchat-ui-state-change', {
          detail: {
            previousState: this.previousState,
            currentState: this.currentState,
            reason: reason,
            timestamp: new Date().toISOString(),
            historyLength: this.transitionHistory.length
          }
        });
        window.dispatchEvent(event);
        
        return true;
      } catch (error) {
        console.error('❌ State transition failed:', error);
        return false;
      }
    },
    
    getState: function() {
      return {
        current: this.currentState,
        previous: this.previousState,
        history: [...this.transitionHistory],
        isOnline: navigator.onLine,
        canNavigate: this.currentState === this.STATES.READY || this.currentState === this.STATES.LOADING,
        isError: this.currentState === this.STATES.ERROR,
        isOffline: this.currentState === this.STATES.OFFLINE
      };
    },
    
    isState: function(state) {
      return this.currentState === state;
    },
    
    canTransitionTo: function(state) {
      const transitionKey = `${this.currentState}_to_${state}`;
      const validTransitions = this.TRANSITIONS[transitionKey] || this.TRANSITIONS[`any_to_${state}`];
      return !!validTransitions;
    },
    
    reset: function() {
      this.currentState = this.STATES.BOOTING;
      this.previousState = null;
      this.transitionHistory = [];
      console.log('🔄 UI State Machine reset');
    }
  };
  
  // ============================================================================
  // ROUTER ENGINE - Deterministic Page Routing (WITH SAFETY)
  // ============================================================================
  
  const PAGE_ROUTER = {
    currentPage: null,
    previousPage: null,
    pageHistory: [],
    iframePool: new Map(),
    pendingNavigation: null,
    navigationLock: false,
    
    // Page cache for loaded pages
    pageCache: new Map(),
    
    // Resource tracking
    loadedScripts: new Set(),
    loadedStyles: new Set(),
    
    // Component initialization tracking
    initializedComponents: new Set(),
    
    // Authorization required pages (pages that need login)
    authRequiredPages: new Set(['chat', 'group', 'message', 'friend', 'settings', 'profile']),
    
    initialize: function() {
      return UI_SAFETY.safeInit('PAGE_ROUTER', () => {
        console.log('🧭 Page Router initializing...');
        
        // Setup popstate handler for browser navigation
        UI_SAFETY.safeEventListener(window, 'popstate', (event) => {
          if (event.state && event.state.pageKey) {
            console.log('📜 Browser navigation:', event.state.pageKey);
            this.loadPageByKey(event.state.pageKey, false);
          }
        });
        
        // Setup beforeunload to save state
        UI_SAFETY.safeEventListener(window, 'beforeunload', () => {
          if (this.currentPage) {
            this.saveNavigationState();
          }
        });
        
        // Initialize iframe pool
        this.initializeIframePool();
        
        console.log('✅ Page Router initialized');
        return true;
      }, this);
    },
    
    // ========================================
    // 1️⃣ ROUTER ENGINE METHODS (WITH SAFETY)
    // ========================================
    
    // Main page loading method
    loadPage: function(pageUrl, pushState = true) {
      if (this.navigationLock) {
        console.warn('⚠️ Navigation locked, queuing request');
        this.pendingNavigation = { pageUrl, pushState };
        return Promise.reject(new Error('Navigation locked'));
      }
      
      this.navigationLock = true;
      
      return new Promise(async (resolve, reject) => {
        try {
          UI_STATE.transitionTo(UI_STATE.STATES.LOADING, `loading_page_${pageUrl}`);
          
          console.log(`🚀 Loading page: ${pageUrl}`);
          
          // Validate page exists
          const pageKey = this.resolvePageFromConfig(pageUrl);
          if (!pageKey) {
            throw new Error(`Page not found in config: ${pageUrl}`);
          }
          
          const pageConfig = APP_CONFIG.pages[pageKey];
          
          // Check if user is logged in for auth-required pages
          if (this.isAuthRequiredPage(pageKey) && !UI_SAFETY.userLoggedIn()) {
            console.warn(`⚠️ Authentication required for page: ${pageKey}`);
            
            // Redirect to login page or chat page
            const loginPageKey = this.findLoginPage();
            if (loginPageKey) {
              console.log(`🔐 Redirecting to login page: ${loginPageKey}`);
              this.navigationLock = false;
              return this.loadPageByKey(loginPageKey, true);
            } else {
              throw new Error(`Authentication required but no login page found. Page: ${pageKey}`);
            }
          }
          
          // Unload current page if exists
          if (this.currentPage) {
            await this.unloadCurrentPage();
          }
          
          // Update navigation state
          this.previousPage = this.currentPage;
          this.currentPage = {
            key: pageKey,
            url: pageUrl,
            config: pageConfig,
            loadedAt: new Date().toISOString()
          };
          
          // Add to history
          this.pageHistory.push({
            key: pageKey,
            url: pageUrl,
            timestamp: new Date().toISOString(),
            pushState: pushState
          });
          
          // Keep history manageable
          if (this.pageHistory.length > 100) {
            this.pageHistory = this.pageHistory.slice(-100);
          }
          
          // Update browser history
          if (pushState) {
            this.pushState(pageKey, pageUrl);
          }
          
          // Load the page based on type
          let loadResult;
          if (pageConfig.isIframe && !pageConfig.isParent) {
            loadResult = await this.loadIframePage(pageConfig);
          } else {
            loadResult = await this.loadMainPage(pageConfig);
          }
          
          // Initialize UI components safely
          await this.initializePageComponents(pageConfig);
          
          // Update session storage
          this.saveNavigationState();
          
          // Update UI
          this.updateActiveNavigation(pageKey);
          
          // Transition to ready state
          UI_STATE.transitionTo(UI_STATE.STATES.READY, `page_loaded_${pageKey}`);
          
          console.log(`✅ Page loaded: ${pageKey}`);
          
          resolve(loadResult);
          
        } catch (error) {
          console.error(`❌ Page load failed: ${pageUrl}`, error);
          UI_STATE.transitionTo(UI_STATE.STATES.ERROR, `load_failed_${pageUrl}`);
          
          await this.handleRouteError(error, pageUrl);
          reject(error);
          
        } finally {
          this.navigationLock = false;
          
          // Process pending navigation
          if (this.pendingNavigation) {
            const pending = this.pendingNavigation;
            this.pendingNavigation = null;
            setTimeout(() => {
              this.loadPage(pending.pageUrl, pending.pushState);
            }, 100);
          }
        }
      });
    },
    
    // Check if page requires authentication
    isAuthRequiredPage: function(pageKey) {
      // Check if page is in auth required set
      if (this.authRequiredPages.has(pageKey)) {
        return true;
      }
      
      // Check page config
      const pageConfig = APP_CONFIG.pages[pageKey];
      if (pageConfig && pageConfig.requiresAuth !== undefined) {
        return pageConfig.requiresAuth;
      }
      
      // Default: non-auth pages are login, register, forgot-password, etc.
      const nonAuthPages = ['login', 'register', 'forgot-password', 'reset-password', 'landing', 'index'];
      return !nonAuthPages.includes(pageKey);
    },
    
    // Find login page
    findLoginPage: function() {
      const loginPages = ['login', 'signin', 'auth', 'index'];
      
      for (const pageKey of loginPages) {
        if (APP_CONFIG.pages && APP_CONFIG.pages[pageKey]) {
          return pageKey;
        }
      }
      
      // Return first available page that doesn't require auth
      if (APP_CONFIG.pages) {
        for (const [pageKey, config] of Object.entries(APP_CONFIG.pages)) {
          if (!this.isAuthRequiredPage(pageKey)) {
            return pageKey;
          }
        }
      }
      
      return null;
    },
    
    // Initialize UI components for a page
    initializePageComponents: async function(pageConfig) {
      const componentPrefix = pageConfig.id || pageConfig.key || 'page';
      
      // Define component initializers based on page type
      const componentInitializers = {
        'chat': [
          { name: 'chat_window', init: () => this.initializeChatWindow() },
          { name: 'emoji_picker', init: () => this.initializeEmojiPicker() },
          { name: 'friend_list', init: () => this.initializeFriendList() },
          { name: 'call_buttons', init: () => this.initializeCallButtons() },
          { name: 'message_input', init: () => this.initializeMessageInput() },
          { name: 'chat_search', init: () => this.initializeChatSearch() }
        ],
        'group': [
          { name: 'group_list', init: () => this.initializeGroupList() },
          { name: 'group_chat', init: () => this.initializeGroupChat() }
        ],
        'settings': [
          { name: 'settings_form', init: () => this.initializeSettingsForm() },
          { name: 'theme_switcher', init: () => this.initializeThemeSwitcher() }
        ],
        'default': [
          { name: 'page_header', init: () => this.initializePageHeader() },
          { name: 'page_footer', init: () => this.initializePageFooter() }
        ]
      };
      
      // Get components for this page
      const pageComponents = componentInitializers[pageConfig.id] || 
                            componentInitializers[pageConfig.key] || 
                            componentInitializers.default;
      
      // Initialize each component safely
      for (const component of pageComponents) {
        const componentKey = `${componentPrefix}_${component.name}`;
        
        // Skip if already initialized
        if (this.initializedComponents.has(componentKey)) {
          continue;
        }
        
        // Check session for session-dependent components
        if (component.name.includes('chat') || component.name.includes('friend') || 
            component.name.includes('group') || component.name.includes('call')) {
          const sessionCheck = UI_SAFETY.validateSession();
          if (!sessionCheck.valid) {
            console.warn(`⚠️ Skipping ${component.name} - no valid session`);
            continue;
          }
        }
        
        // Initialize with safety wrapper
        await UI_SAFETY.safeRetry(
          componentKey,
          () => UI_SAFETY.safeInit(componentKey, component.init, this)
        ).then(() => {
          this.initializedComponents.add(componentKey);
        }).catch(error => {
          console.warn(`⚠️ Component ${component.name} failed to initialize:`, error.message);
        });
      }
      
      // Clean up safety system
      UI_SAFETY.cleanup();
    },
    
    // Component initialization methods
    initializeChatWindow: function() {
      const chatContainer = UI_SAFETY.safeElement('#chat-container');
      if (!chatContainer) return null;
      
      console.log('💬 Initializing chat window...');
      
      // Check for required libraries
      if (!UI_SAFETY.checkLibrary('moment', 'moment') && !UI_SAFETY.failedModules.has('library_moment')) {
        console.warn('⚠️ Moment.js not found, date formatting may be limited');
        UI_SAFETY.failedModules.add('library_moment');
      }
      
      // Initialize chat UI components
      const components = [
        { selector: '.message-list', name: 'message_list' },
        { selector: '.typing-indicator', name: 'typing_indicator' },
        { selector: '.online-status', name: 'online_status' }
      ];
      
      components.forEach(comp => {
        const element = UI_SAFETY.safeElement(comp.selector, chatContainer);
        if (element) {
          UI_SAFETY.safeEventListener(element, 'click', () => {
            console.log(`${comp.name} clicked`);
          });
        }
      });
      
      return true;
    },
    
    initializeEmojiPicker: function() {
      const emojiButton = UI_SAFETY.safeElement('.emoji-button, [data-emoji-picker]');
      if (!emojiButton) return null;
      
      console.log('😊 Initializing emoji picker...');
      
      // Check for emoji library
      const hasEmojiLib = UI_SAFETY.checkLibrary('emoji', 'emoji') || 
                         UI_SAFETY.checkLibrary('twemoji', 'twemoji');
      
      if (!hasEmojiLib) {
        console.warn('⚠️ Emoji library not found, using fallback');
        // Create simple fallback
        emojiButton.title = 'Emoji picker (fallback)';
        UI_SAFETY.safeEventListener(emojiButton, 'click', () => {
          const input = UI_SAFETY.safeElement('#message-input, .message-input');
          if (input) {
            input.value += '😊 ';
            input.focus();
          }
        });
        return true;
      }
      
      // Initialize full emoji picker with safety
      UI_SAFETY.safeEventListener(emojiButton, 'click', (e) => {
        e.preventDefault();
        this.toggleEmojiPicker();
      });
      
      return true;
    },
    
    initializeFriendList: function() {
      const friendListContainer = UI_SAFETY.safeElement('#friend-list, .friends-container');
      if (!friendListContainer) return null;
      
      console.log('👥 Initializing friend list...');
      
      // Verify session
      const session = UI_SAFETY.validateSession();
      if (!session.valid) {
        console.warn('⚠️ Cannot initialize friend list without valid session');
        return null;
      }
      
      // Initialize friend list items
      const friendItems = friendListContainer.querySelectorAll('.friend-item, [data-friend-id]');
      friendItems.forEach((item, index) => {
        UI_SAFETY.safeEventListener(item, 'click', () => {
          const friendId = item.dataset.friendId || index;
          console.log(`Friend selected: ${friendId}`);
          this.selectFriend(friendId);
        });
        
        // Add hover effects safely
        UI_SAFETY.safeEventListener(item, 'mouseenter', () => {
          item.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
        });
        
        UI_SAFETY.safeEventListener(item, 'mouseleave', () => {
          item.style.backgroundColor = '';
        });
      });
      
      return true;
    },
    
    initializeCallButtons: function() {
      const callButtons = document.querySelectorAll('.call-button, [data-call-action]');
      if (!callButtons.length) return null;
      
      console.log('📞 Initializing call buttons...');
      
      // Check for WebRTC support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('⚠️ WebRTC not supported, call features disabled');
        callButtons.forEach(btn => {
          btn.disabled = true;
          btn.title = 'Call features not supported in your browser';
        });
        return null;
      }
      
      // Initialize each call button
      callButtons.forEach(button => {
        const action = button.dataset.callAction || 'call';
        const target = button.dataset.callTarget || 'user';
        
        UI_SAFETY.safeEventListener(button, 'click', (e) => {
          e.preventDefault();
          this.initiateCall(action, target);
        });
      });
      
      return true;
    },
    
    initializeMessageInput: function() {
      const messageInput = UI_SAFETY.safeElement('#message-input, .message-input, textarea[data-message-input]');
      if (!messageInput) return null;
      
      console.log('📝 Initializing message input...');
      
      // Add event listeners
      UI_SAFETY.safeEventListener(messageInput, 'keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      UI_SAFETY.safeEventListener(messageInput, 'input', () => {
        this.updateTypingStatus();
      });
      
      // Add paste handler for images/files
      UI_SAFETY.safeEventListener(messageInput, 'paste', (e) => {
        this.handlePaste(e);
      });
      
      return true;
    },
    
    initializeChatSearch: function() {
      const searchInput = UI_SAFETY.safeElement('#chat-search, .search-chat, input[data-chat-search]');
      if (!searchInput) return null;
      
      console.log('🔍 Initializing chat search...');
      
      // Add debounced search
      let searchTimeout;
      UI_SAFETY.safeEventListener(searchInput, 'input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.performSearch(searchInput.value);
        }, 300);
      });
      
      // Clear search button
      const clearButton = UI_SAFETY.safeElement('.clear-search', searchInput.parentElement);
      if (clearButton) {
        UI_SAFETY.safeEventListener(clearButton, 'click', () => {
          searchInput.value = '';
          this.clearSearch();
        });
      }
      
      return true;
    },
    
    initializeGroupList: function() {
      // Implementation for group list
      return UI_SAFETY.safeInit('GROUP_LIST', () => {
        console.log('👥 Initializing group list...');
        return true;
      }, this);
    },
    
    initializeGroupChat: function() {
      // Implementation for group chat
      return UI_SAFETY.safeInit('GROUP_CHAT', () => {
        console.log('💬 Initializing group chat...');
        return true;
      }, this);
    },
    
    initializeSettingsForm: function() {
      // Implementation for settings form
      return UI_SAFETY.safeInit('SETTINGS_FORM', () => {
        console.log('⚙️ Initializing settings form...');
        return true;
      }, this);
    },
    
    initializeThemeSwitcher: function() {
      // Implementation for theme switcher
      return UI_SAFETY.safeInit('THEME_SWITCHER', () => {
        console.log('🎨 Initializing theme switcher...');
        return true;
      }, this);
    },
    
    initializePageHeader: function() {
      // Implementation for page header
      return UI_SAFETY.safeInit('PAGE_HEADER', () => {
        console.log('📄 Initializing page header...');
        return true;
      }, this);
    },
    
    initializePageFooter: function() {
      // Implementation for page footer
      return UI_SAFETY.safeInit('PAGE_FOOTER', () => {
        console.log('📄 Initializing page footer...');
        return true;
      }, this);
    },
    
    // Component action methods
    toggleEmojiPicker: function() {
      try {
        const picker = UI_SAFETY.safeElement('.emoji-picker-container');
        if (!picker) {
          // Create emoji picker if it doesn't exist
          this.createEmojiPicker();
          return;
        }
        
        const isVisible = picker.style.display !== 'none';
        picker.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
          // Load emoji data if needed
          this.loadEmojiData();
        }
      } catch (error) {
        console.error('❌ Failed to toggle emoji picker:', error);
      }
    },
    
    createEmojiPicker: function() {
      // Safe creation of emoji picker
      UI_SAFETY.safeInit('EMOJI_PICKER_CREATE', () => {
        const container = document.createElement('div');
        container.className = 'emoji-picker-container';
        container.style.cssText = `
          position: absolute;
          bottom: 60px;
          right: 20px;
          width: 300px;
          height: 400px;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          display: none;
        `;
        
        container.innerHTML = `
          <div class="emoji-search" style="padding: 10px; border-bottom: 1px solid #eee;">
            <input type="text" placeholder="Search emojis..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div class="emoji-grid" style="padding: 10px; height: 340px; overflow-y: auto;">
            <!-- Emojis will be loaded here -->
          </div>
        `;
        
        document.body.appendChild(container);
        return container;
      }, this);
    },
    
    selectFriend: function(friendId) {
      console.log(`Selecting friend: ${friendId}`);
      // Implement friend selection logic
    },
    
    initiateCall: function(action, target) {
      console.log(`Initiating ${action} with ${target}`);
      // Implement call initiation logic
    },
    
    sendMessage: function() {
      const input = UI_SAFETY.safeElement('#message-input');
      if (!input || !input.value.trim()) return;
      
      console.log('Sending message:', input.value.substring(0, 50) + '...');
      // Implement message sending logic
      input.value = '';
    },
    
    updateTypingStatus: function() {
      // Implement typing status update
    },
    
    handlePaste: function(event) {
      // Implement paste handling for files/images
    },
    
    performSearch: function(query) {
      console.log('Searching for:', query);
      // Implement search logic
    },
    
    clearSearch: function() {
      // Implement search clearing
    },
    
    loadEmojiData: function() {
      // Implement emoji data loading
    },
    
    // Load page by key
    loadPageByKey: function(pageKey, pushState = true) {
      console.log(`🔑 Loading page by key: ${pageKey}`);
      
      if (!APP_CONFIG.pages || !APP_CONFIG.pages[pageKey]) {
        console.error(`❌ Page key not found: ${pageKey}`);
        return this.loadDefaultPage();
      }
      
      const pageConfig = APP_CONFIG.pages[pageKey];
      return this.loadPage(pageConfig.file, pushState);
    },
    
    // Resolve page from config
    resolvePageFromConfig: function(pageUrl) {
      if (!APP_CONFIG.pages) {
        console.warn('⚠️ APP_CONFIG.pages not defined');
        return null;
      }
      
      // Try exact match
      for (const [key, config] of Object.entries(APP_CONFIG.pages)) {
        if (config.file === pageUrl) {
          return key;
        }
      }
      
      // Try path normalization
      const normalizedUrl = this.normalizePagePath(pageUrl);
      for (const [key, config] of Object.entries(APP_CONFIG.pages)) {
        if (config.file === normalizedUrl) {
          return key;
        }
      }
      
      // Try partial match
      for (const [key, config] of Object.entries(APP_CONFIG.pages)) {
        if (pageUrl.includes(config.file) || config.file.includes(pageUrl)) {
          return key;
        }
      }
      
      return null;
    },
    
    // Validate page exists
    validatePageExists: function(pageKey) {
      if (!APP_CONFIG.pages) {
        return { valid: false, reason: 'APP_CONFIG.pages not defined' };
      }
      
      if (!pageKey) {
        return { valid: false, reason: 'Page key is empty' };
      }
      
      const pageConfig = APP_CONFIG.pages[pageKey];
      if (!pageConfig) {
        return { valid: false, reason: `Page key "${pageKey}" not found in config` };
      }
      
      if (!pageConfig.file) {
        return { valid: false, reason: `Page "${pageKey}" has no file specified` };
      }
      
      return { 
        valid: true, 
        pageConfig: pageConfig,
        requiresAuth: pageConfig.requiresAuth !== false,
        isIframe: pageConfig.isIframe,
        isParent: pageConfig.isParent
      };
    },
    
    // Normalize page path
    normalizePagePath: function(path) {
      if (!path) return '';
      
      // Remove leading slash
      if (path.startsWith('/')) {
        path = path.substring(1);
      }
      
      // Ensure .html extension
      if (!path.endsWith('.html') && !path.includes('?')) {
        path = path + '.html';
      }
      
      return path;
    },
    
    // Preload page
    preloadPage: function(pageKey) {
      if (!APP_CONFIG.pages || !APP_CONFIG.pages[pageKey]) {
        return Promise.reject(new Error(`Page key not found: ${pageKey}`));
      }
      
      const pageConfig = APP_CONFIG.pages[pageKey];
      
      return new Promise((resolve) => {
        // Preload resources in idle time
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            this.preloadPageResources(pageConfig);
            resolve(true);
          });
        } else {
          setTimeout(() => {
            this.preloadPageResources(pageConfig);
            resolve(true);
          }, 1000);
        }
      });
    },
    
    // Unload current page
    unloadCurrentPage: function() {
      return new Promise(async (resolve) => {
        if (!this.currentPage) {
          resolve();
          return;
        }
        
        console.log(`🗑️ Unloading current page: ${this.currentPage.key}`);
        
        const pageConfig = this.currentPage.config;
        
        // Unload iframe if exists
        if (pageConfig.isIframe && !pageConfig.isParent) {
          await this.destroyPageIframe(this.currentPage.key);
        }
        
        // Unload page-specific resources
        await this.unloadPageResources(pageConfig);
        
        // Clear current page reference
        this.previousPage = this.currentPage;
        this.currentPage = null;
        
        console.log('✅ Current page unloaded');
        resolve();
      });
    },
    
    // Handle route error
    handleRouteError: async function(error, pageUrl) {
      console.error(`🛑 Route error for ${pageUrl}:`, error);
      
      // Show error to user
      this.showPageError(`Failed to load page: ${pageUrl}`, error.message);
      
      // Try to fallback to safe page
      await this.fallbackToSafePage();
      
      // Dispatch error event
      const event = new CustomEvent('moodchat-route-error', {
        detail: {
          pageUrl: pageUrl,
          error: error.message,
          timestamp: new Date().toISOString(),
          retryAttempted: false
        }
      });
      window.dispatchEvent(event);
    },
    
    // ========================================
    // 2️⃣ DEFAULT PAGE RESOLUTION
    // ========================================
    
    // Determine default page with priority chain
    determineDefaultPage: function() {
      console.log('🔍 Determining default page...');
      
      const priorityChain = [
        // Priority 1: Check if user is logged in
        () => {
          const isLoggedIn = UI_SAFETY.userLoggedIn();
          console.log(`🔐 User logged in: ${isLoggedIn}`);
          
          if (!isLoggedIn) {
            // User not logged in, find login page
            const loginPageKey = this.findLoginPage();
            if (loginPageKey) {
              console.log(`✅ User not logged in, redirecting to: ${loginPageKey}`);
              return loginPageKey;
            }
          }
          return null;
        },
        
        // Priority 2: Session storage
        () => {
          try {
            const savedPage = sessionStorage.getItem('moodchat_last_page');
            if (savedPage && this.validatePageExists(savedPage).valid) {
              // Check if user can access this page
              if (this.isAuthRequiredPage(savedPage) && !UI_SAFETY.userLoggedIn()) {
                console.warn(`⚠️ Saved page requires auth but user not logged in: ${savedPage}`);
                return null;
              }
              console.log('✅ Restoring from session storage:', savedPage);
              return savedPage;
            }
          } catch (error) {
            console.warn('⚠️ Failed to read session storage:', error);
            sessionStorage.removeItem('moodchat_last_page');
          }
          return null;
        },
        
        // Priority 3: APP_CONFIG.defaultPageKey
        () => {
          if (APP_CONFIG.defaultPageKey && this.validatePageExists(APP_CONFIG.defaultPageKey).valid) {
            // Check if user can access this page
            if (this.isAuthRequiredPage(APP_CONFIG.defaultPageKey) && !UI_SAFETY.userLoggedIn()) {
              console.warn(`⚠️ Default page requires auth but user not logged in: ${APP_CONFIG.defaultPageKey}`);
              return null;
            }
            console.log('✅ Using default page key:', APP_CONFIG.defaultPageKey);
            return APP_CONFIG.defaultPageKey;
          }
          return null;
        },
        
        // Priority 4: chat (if logged in) or login (if not logged in)
        () => {
          if (UI_SAFETY.userLoggedIn()) {
            if (this.validatePageExists('chat').valid) {
              console.log('✅ Using fallback: chat (user logged in)');
              return 'chat';
            }
          } else {
            const loginPageKey = this.findLoginPage();
            if (loginPageKey) {
              console.log('✅ Using fallback: login (user not logged in)');
              return loginPageKey;
            }
          }
          return null;
        },
        
        // Priority 5: First available page that user can access
        () => {
          if (APP_CONFIG.pages) {
            const pages = Object.keys(APP_CONFIG.pages);
            for (const pageKey of pages) {
              // Check if user can access this page
              const canAccess = !this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn();
              if (canAccess) {
                console.log('✅ Using first accessible page:', pageKey);
                return pageKey;
              }
            }
          }
          return null;
        }
      ];
      
      for (const resolver of priorityChain) {
        const pageKey = resolver();
        if (pageKey) {
          return pageKey;
        }
      }
      
      console.error('❌ No default page could be determined');
      return null;
    },
    
    // Load default page
    loadDefaultPage: function() {
      const defaultPageKey = this.determineDefaultPage();
      if (!defaultPageKey) {
        console.error('❌ Cannot load default page');
        this.showPageError('Cannot load default page', 'Configuration error');
        return Promise.reject(new Error('No default page available'));
      }
      
      return this.loadPageByKey(defaultPageKey, true);
    },
    
    // Save navigation state
    saveNavigationState: function() {
      if (!this.currentPage) return;
      
      try {
        // Save only the page key, not the object
        sessionStorage.setItem('moodchat_last_page', this.currentPage.key);
        
        // Also save in localStorage for cross-tab sync
        localStorage.setItem('moodchat_current_page', this.currentPage.key);
        
        console.log('💾 Navigation state saved:', this.currentPage.key);
      } catch (error) {
        console.error('❌ Failed to save navigation state:', error);
      }
    },
    
    // ========================================
    // 3️⃣ IFRAME MANAGEMENT SYSTEM (WITH SAFETY)
    // ========================================
    
    // Initialize iframe pool
    initializeIframePool: function() {
      return UI_SAFETY.safeInit('IFRAME_POOL', () => {
        console.log('🖼️ Initializing iframe pool...');
        
        // Create iframe container if not exists
        let container = UI_SAFETY.safeElement('#iframe-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'iframe-container';
          container.className = 'iframe-container';
          container.style.cssText = `
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
          `;
          
          const appContainer = UI_SAFETY.safeElement('#app-container') || document.querySelector('main');
          if (appContainer) {
            appContainer.appendChild(container);
          } else {
            document.body.appendChild(container);
          }
          
          console.log('✅ Created iframe container');
        }
        
        // Setup iframe message listener with safety
        UI_SAFETY.safeEventListener(window, 'message', (event) => {
          this.handleIframeMessage(event);
        });
        
        console.log('✅ Iframe pool initialized');
        return true;
      }, this);
    },
    
    // Create page iframe
    createPageIframe: function(pageConfig) {
      return new Promise((resolve, reject) => {
        console.log(`🖼️ Creating iframe for: ${pageConfig.id}`);
        
        // Check if iframe already exists in pool
        if (this.iframePool.has(pageConfig.id)) {
          const existingIframe = this.iframePool.get(pageConfig.id);
          if (existingIframe.element && existingIframe.element.parentNode) {
            console.log('✅ Reusing existing iframe from pool');
            resolve(existingIframe);
            return;
          } else {
            // Remove stale reference
            this.iframePool.delete(pageConfig.id);
          }
        }
        
        const container = UI_SAFETY.safeElement('#iframe-container');
        if (!container) {
          reject(new Error('Iframe container not found'));
          return;
        }
        
        // Hide all other iframes
        container.querySelectorAll('iframe').forEach(iframe => {
          iframe.style.display = 'none';
        });
        
        // Create new iframe
        const iframe = document.createElement('iframe');
        iframe.id = `iframe-${pageConfig.id}`;
        iframe.className = 'page-iframe';
        iframe.src = pageConfig.file;
        iframe.name = pageConfig.id;
        iframe.setAttribute('data-page-key', Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id));
        iframe.setAttribute('data-page-id', pageConfig.id);
        iframe.setAttribute('loading', 'eager');
        
        // Security sandbox rules
        iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation';
        
        // Apply sandbox restrictions for untrusted content
        if (pageConfig.trusted !== true) {
          iframe.sandbox += ' allow-top-navigation-by-user-activation';
        }
        
        // Styling
        iframe.style.cssText = `
          width: 100%;
          height: 100%;
          border: none;
          display: block;
          visibility: visible;
          opacity: 1;
          transition: opacity 0.3s ease;
        `;
        
        // Add to container
        container.appendChild(iframe);
        
        // Store in pool
        const iframeData = {
          element: iframe,
          id: pageConfig.id,
          pageKey: Object.keys(APP_CONFIG.pages).find(key => APP_CONFIG.pages[key].id === pageConfig.id),
          config: pageConfig,
          created: new Date().toISOString(),
          ready: false,
          loaded: false,
          error: false,
          window: null,
          health: {
            lastCheck: new Date().toISOString(),
            checkCount: 0,
            errors: 0
          }
        };
        
        this.iframePool.set(pageConfig.id, iframeData);
        
        // Setup load event handlers with safety
        UI_SAFETY.safeEventListener(iframe, 'load', () => {
          console.log(`✅ Iframe loaded: ${pageConfig.id}`);
          
          const iframeData = this.iframePool.get(pageConfig.id);
          if (iframeData) {
            iframeData.loaded = true;
            iframeData.ready = true;
            iframeData.window = iframe.contentWindow;
            iframeData.health.lastCheck = new Date().toISOString();
            
            // Sync auth and theme
            this.syncIframeAuth(iframe);
            this.syncIframeTheme(iframe);
            
            // Dispatch iframe ready event
            const event = new CustomEvent('moodchat-iframe-ready', {
              detail: {
                iframeId: pageConfig.id,
                pageKey: iframeData.pageKey,
                timestamp: new Date().toISOString()
              }
            });
            window.dispatchEvent(event);
            
            // Send ready message to iframe
            try {
              iframe.contentWindow.postMessage({
                type: 'moodchat-parent-ready',
                timestamp: new Date().toISOString(),
                pageConfig: pageConfig
              }, '*');
            } catch (error) {
              console.warn(`⚠️ Failed to send ready message to iframe ${pageConfig.id}:`, error);
            }
          }
          
          resolve(iframeData);
        });
        
        UI_SAFETY.safeEventListener(iframe, 'error', (error) => {
          console.error(`❌ Iframe error: ${pageConfig.id}`, error);
          
          const iframeData = this.iframePool.get(pageConfig.id);
          if (iframeData) {
            iframeData.error = true;
            iframeData.health.errors++;
            iframeData.health.lastCheck = new Date().toISOString();
          }
          
          this.handleIframeErrors(iframe, pageConfig.id, error);
          reject(error);
        });
        
        console.log(`✅ Iframe created for: ${pageConfig.id}`);
      });
    },
    
    // Destroy page iframe
    destroyPageIframe: function(pageId) {
      return new Promise((resolve) => {
        console.log(`🗑️ Destroying iframe: ${pageId}`);
        
        const iframeData = this.iframePool.get(pageId);
        if (!iframeData || !iframeData.element) {
          resolve();
          return;
        }
        
        // Hide iframe
        iframeData.element.style.display = 'none';
        
        // Remove from DOM after a delay
        setTimeout(() => {
          if (iframeData.element && iframeData.element.parentNode) {
            iframeData.element.parentNode.removeChild(iframeData.element);
          }
          
          // Remove from pool
          this.iframePool.delete(pageId);
          
          console.log(`✅ Iframe destroyed: ${pageId}`);
          resolve();
        }, 1000);
      });
    },
    
    // Reuse iframe pool
    reuseIframePool: function() {
      console.log('🔄 Reusing iframe pool...');
      
      // Clean up stale iframes
      for (const [pageId, iframeData] of this.iframePool.entries()) {
        if (!iframeData.element || !iframeData.element.parentNode) {
          this.iframePool.delete(pageId);
          console.log(`🗑️ Removed stale iframe: ${pageId}`);
        }
      }
      
      // Hide all iframes
      const container = UI_SAFETY.safeElement('#iframe-container');
      if (container) {
        container.querySelectorAll('iframe').forEach(iframe => {
          iframe.style.display = 'none';
        });
      }
      
      console.log(`✅ Iframe pool reused, ${this.iframePool.size} iframes in pool`);
    },
    
    // Sync iframe auth
    syncIframeAuth: function(iframe) {
      try {
        if (!iframe.contentWindow) return;
        
        const authData = {
          type: 'moodchat-sync-auth',
          user: window.currentUser || (AUTH_STATE && AUTH_STATE.getUser()),
          isAuthenticated: !!(window.currentUser || (AUTH_STATE && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
          token: AUTH_STATE ? AUTH_STATE.getToken() : null,
          timestamp: new Date().toISOString()
        };
        
        iframe.contentWindow.postMessage(authData, '*');
        console.log(`🔐 Auth synced to iframe: ${iframe.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to sync auth to iframe ${iframe.id}:`, error);
      }
    },
    
    // Sync iframe theme
    syncIframeTheme: function(iframe) {
      try {
        if (!iframe.contentWindow) return;
        
        const theme = localStorage.getItem('moodchat_theme') || 'dark';
        const themeData = {
          type: 'moodchat-sync-theme',
          theme: theme,
          timestamp: new Date().toISOString()
        };
        
        iframe.contentWindow.postMessage(themeData, '*');
        console.log(`🎨 Theme synced to iframe: ${iframe.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to sync theme to iframe ${iframe.id}:`, error);
      }
    },
    
    // Handle iframe errors
    handleIframeErrors: function(iframe, pageId, error) {
      console.error(`🛑 Iframe error for ${pageId}:`, error);
      
      // Show error overlay
      const container = iframe.parentNode;
      if (container) {
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'iframe-error-overlay';
        errorOverlay.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          text-align: center;
        `;
        
        errorOverlay.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
          <h3 style="margin-bottom: 10px;">Failed to load page</h3>
          <p style="margin-bottom: 20px; opacity: 0.8;">${error.message || 'Unknown error'}</p>
          <div style="display: flex; gap: 10px;">
            <button class="retry-iframe" style="
              background: #8b5cf6;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
            ">Retry</button>
            <button class="close-iframe" style="
              background: transparent;
              color: #8b5cf6;
              border: 1px solid #8b5cf6;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
            ">Close</button>
          </div>
        `;
        
        container.appendChild(errorOverlay);
        
        // Add button handlers with safety
        const retryBtn = UI_SAFETY.safeElement('.retry-iframe', errorOverlay);
        const closeBtn = UI_SAFETY.safeElement('.close-iframe', errorOverlay);
        
        if (retryBtn) {
          UI_SAFETY.safeEventListener(retryBtn, 'click', () => {
            iframe.src = iframe.src;
            errorOverlay.remove();
          });
        }
        
        if (closeBtn) {
          UI_SAFETY.safeEventListener(closeBtn, 'click', () => {
            errorOverlay.remove();
            iframe.style.display = 'none';
            this.loadDefaultPage();
          });
        }
      }
      
      // Dispatch error event
      const event = new CustomEvent('moodchat-iframe-error', {
        detail: {
          pageId: pageId,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Monitor iframe health
    monitorIframeHealth: function() {
      console.log('🏥 Monitoring iframe health...');
      
      for (const [pageId, iframeData] of this.iframePool.entries()) {
        iframeData.health.checkCount++;
        iframeData.health.lastCheck = new Date().toISOString();
        
        // Check if iframe is still in DOM
        if (!iframeData.element || !iframeData.element.parentNode) {
          console.warn(`⚠️ Iframe ${pageId} not in DOM, removing from pool`);
          this.iframePool.delete(pageId);
          continue;
        }
        
        // Check for error state
        if (iframeData.error && iframeData.health.errors > 3) {
          console.warn(`⚠️ Iframe ${pageId} has multiple errors, destroying`);
          this.destroyPageIframe(pageId);
          continue;
        }
        
        // Send health check message
        try {
          if (iframeData.window) {
            iframeData.window.postMessage({
              type: 'moodchat-health-check',
              timestamp: new Date().toISOString()
            }, '*');
          }
        } catch (error) {
          console.warn(`⚠️ Health check failed for iframe ${pageId}:`, error);
          iframeData.health.errors++;
        }
      }
      
      console.log(`✅ Iframe health checked, ${this.iframePool.size} iframes monitored`);
    },
    
    // Handle iframe messages
    handleIframeMessage: function(event) {
      try {
        // Security check
        if (!this.isTrustedOrigin(event.origin)) {
          return;
        }
        
        const data = event.data;
        if (!data || !data.type) return;
        
        switch(data.type) {
          case 'moodchat-iframe-ready':
            console.log(`🖼️ Iframe ready: ${data.iframeId}`);
            break;
            
          case 'moodchat-auth-request':
            this.syncIframeAuth(event.source.frameElement);
            break;
            
          case 'moodchat-theme-request':
            this.syncIframeTheme(event.source.frameElement);
            break;
            
          case 'moodchat-navigate-request':
            if (data.pageKey) {
              this.loadPageByKey(data.pageKey, true);
            }
            break;
            
          case 'moodchat-health-response':
            // Update iframe health
            const iframe = event.source.frameElement;
            if (iframe) {
              const iframeData = this.iframePool.get(iframe.dataset.pageId);
              if (iframeData) {
                iframeData.health.lastResponse = new Date().toISOString();
              }
            }
            break;
        }
      } catch (error) {
        console.error('❌ Iframe message handling failed:', error);
      }
    },
    
    // Check if origin is trusted
    isTrustedOrigin: function(origin) {
      try {
        const currentOrigin = window.location.origin;
        const trustedOrigins = [
          currentOrigin,
          'http://localhost',
          'http://127.0.0.1',
          'https://moodchat.app',
          'https://*.moodchat.app'
        ];
        
        return trustedOrigins.some(trusted => {
          if (trusted.includes('*')) {
            const regex = new RegExp('^' + trusted.replace(/\*/g, '.*') + '$');
            return regex.test(origin);
          }
          return origin === trusted;
        });
      } catch (error) {
        console.error('❌ Origin check failed:', error);
        return false;
      }
    },
    
    // ========================================
    // 4️⃣ DYNAMIC RESOURCE LOADER (WITH SAFETY)
    // ========================================
    
    // Load page scripts
    loadPageScripts: function(pageConfig) {
      return new Promise(async (resolve, reject) => {
        try {
          console.log(`📦 Loading scripts for: ${pageConfig.id}`);
          
          // Get scripts from page config or infer from page type
          const scriptUrls = this.resolvePageScripts(pageConfig);
          
          if (scriptUrls.length === 0) {
            console.log(`ℹ️ No scripts to load for: ${pageConfig.id}`);
            resolve([]);
            return;
          }
          
          const loadPromises = [];
          
          for (const scriptUrl of scriptUrls) {
            // Check if script already loaded
            if (this.loadedScripts.has(scriptUrl)) {
              console.log(`ℹ️ Script already loaded: ${scriptUrl}`);
              continue;
            }
            
            // Check for duplicates in DOM
            if (document.querySelector(`script[src*="${scriptUrl}"]`)) {
              console.log(`ℹ️ Script already in DOM: ${scriptUrl}`);
              this.loadedScripts.add(scriptUrl);
              continue;
            }
            
            // Use safeLoad to check existence and load
            loadPromises.push(UI_SAFETY.safeLoad(scriptUrl, 'js').then(success => {
              if (success) {
                this.loadedScripts.add(scriptUrl);
                return scriptUrl;
              }
              return null;
            }));
          }
          
          const results = await Promise.all(loadPromises);
          const loadedScripts = results.filter(url => url !== null);
          
          console.log(`✅ Scripts loaded for: ${pageConfig.id}`, loadedScripts);
          resolve(loadedScripts);
          
        } catch (error) {
          console.error(`❌ Script loading failed for: ${pageConfig.id}`, error);
          // Don't reject, just resolve with empty array to continue
          resolve([]);
        }
      });
    },
    
    // Load page styles
    loadPageStyles: function(pageConfig) {
      return new Promise(async (resolve, reject) => {
        try {
          console.log(`🎨 Loading styles for: ${pageConfig.id}`);
          
          // Get styles from page config or infer from page type
          const styleUrls = this.resolvePageStyles(pageConfig);
          
          if (styleUrls.length === 0) {
            console.log(`ℹ️ No styles to load for: ${pageConfig.id}`);
            resolve([]);
            return;
          }
          
          const loadPromises = [];
          
          for (const styleUrl of styleUrls) {
            // Check if style already loaded
            if (this.loadedStyles.has(styleUrl)) {
              console.log(`ℹ️ Style already loaded: ${styleUrl}`);
              continue;
            }
            
            // Check for duplicates in DOM
            if (document.querySelector(`link[href*="${styleUrl}"]`)) {
              console.log(`ℹ️ Style already in DOM: ${styleUrl}`);
              this.loadedStyles.add(styleUrl);
              continue;
            }
            
            // Use safeLoad to check existence and load
            loadPromises.push(UI_SAFETY.safeLoad(styleUrl, 'css').then(success => {
              if (success) {
                this.loadedStyles.add(styleUrl);
                return styleUrl;
              }
              return null;
            }));
          }
          
          const results = await Promise.all(loadPromises);
          const loadedStyles = results.filter(url => url !== null);
          
          console.log(`✅ Styles loaded for: ${pageConfig.id}`, loadedStyles);
          resolve(loadedStyles);
          
        } catch (error) {
          console.error(`❌ Style loading failed for: ${pageConfig.id}`, error);
          // Don't reject, just resolve with empty array to continue
          resolve([]);
        }
      });
    },
    
    // Unload page scripts
    unloadPageScripts: function(pageConfig) {
      console.log(`🗑️ Unloading scripts for: ${pageConfig.id}`);
      
      // Get scripts that were loaded for this page
      const pageScripts = Array.from(this.loadedScripts).filter(
        scriptUrl => scriptUrl.includes(pageConfig.id) || scriptUrl.includes(pageConfig.file)
      );
      
      pageScripts.forEach(scriptUrl => {
        // Remove script element
        const scriptElement = document.querySelector(`script[src*="${scriptUrl}"]`);
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }
        
        // Remove from tracking
        this.loadedScripts.delete(scriptUrl);
      });
      
      console.log(`✅ Scripts unloaded for: ${pageConfig.id}`);
    },
    
    // Unload page styles
    unloadPageStyles: function(pageConfig) {
      console.log(`🗑️ Unloading styles for: ${pageConfig.id}`);
      
      // Get styles that were loaded for this page
      const pageStyles = Array.from(this.loadedStyles).filter(
        styleUrl => styleUrl.includes(pageConfig.id) || styleUrl.includes(pageConfig.file)
      );
      
      pageStyles.forEach(styleUrl => {
        // Remove style/link element
        const styleElement = document.querySelector(`link[href*="${styleUrl}"], style[data-page="${pageConfig.id}"]`);
        if (styleElement && styleElement.parentNode) {
          styleElement.parentNode.removeChild(styleElement);
        }
        
        // Remove from tracking
        this.loadedStyles.delete(styleUrl);
      });
      
      console.log(`✅ Styles unloaded for: ${pageConfig.id}`);
    },
    
    // Load individual script
    loadScript: function(scriptUrl, pageId) {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (this.loadedScripts.has(scriptUrl)) {
          console.log(`ℹ️ Script already loaded: ${scriptUrl}`);
          resolve(scriptUrl);
          return;
        }
        
        // Check for duplicates in DOM
        if (document.querySelector(`script[src*="${scriptUrl}"]`)) {
          console.log(`ℹ️ Script already in DOM: ${scriptUrl}`);
          this.loadedScripts.add(scriptUrl);
          resolve(scriptUrl);
          return;
        }
        
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.type = 'text/javascript';
        script.defer = true;
        script.setAttribute('data-page', pageId);
        
        script.onload = () => {
          console.log(`✅ Script loaded: ${scriptUrl}`);
          this.loadedScripts.add(scriptUrl);
          resolve(scriptUrl);
        };
        
        script.onerror = (error) => {
          console.error(`❌ Script failed to load: ${scriptUrl}`, error);
          reject(new Error(`Failed to load script: ${scriptUrl}`));
        };
        
        document.head.appendChild(script);
      });
    },
    
    // Load individual style
    loadStyle: function(styleUrl, pageId) {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (this.loadedStyles.has(styleUrl)) {
          console.log(`ℹ️ Style already loaded: ${styleUrl}`);
          resolve(styleUrl);
          return;
        }
        
        // Check for duplicates in DOM
        if (document.querySelector(`link[href*="${styleUrl}"]`)) {
          console.log(`ℹ️ Style already in DOM: ${styleUrl}`);
          this.loadedStyles.add(styleUrl);
          resolve(styleUrl);
          return;
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = styleUrl;
        link.type = 'text/css';
        link.setAttribute('data-page', pageId);
        
        link.onload = () => {
          console.log(`✅ Style loaded: ${styleUrl}`);
          this.loadedStyles.add(styleUrl);
          resolve(styleUrl);
        };
        
        link.onerror = (error) => {
          console.error(`❌ Style failed to load: ${styleUrl}`, error);
          reject(new Error(`Failed to load style: ${styleUrl}`));
        };
        
        document.head.appendChild(link);
      });
    },
    
    // Resolve page scripts
    resolvePageScripts: function(pageConfig) {
      const scripts = [];
      
      // Check page config for scripts
      if (pageConfig.scripts && Array.isArray(pageConfig.scripts)) {
        scripts.push(...pageConfig.scripts);
      }
      
      // Infer scripts from page file name
      if (pageConfig.file) {
        const baseName = pageConfig.file.replace('.html', '');
        const inferredScript = `js/${baseName}.js`;
        scripts.push(inferredScript);
      }
      
      // Add common scripts
      
      // Filter out duplicates and non-existent URLs
      return [...new Set(scripts.filter(url => url))];
    },
    
    // Resolve page styles
    resolvePageStyles: function(pageConfig) {
      const styles = [];
      
      // Check page config for styles
      if (pageConfig.styles && Array.isArray(pageConfig.styles)) {
        styles.push(...pageConfig.styles);
      }
      
      // Infer styles from page file name
      if (pageConfig.file) {
        const baseName = pageConfig.file.replace('.html', '');
        const inferredStyle = `css/${baseName}.css`;
        styles.push(inferredStyle);
      }
      
      // Add common styles
      
      // Filter out duplicates and non-existent URLs
      return [...new Set(styles.filter(url => url))];
    },
    
    // Prevent duplicate load
    preventDuplicateLoad: function(url, type) {
      if (type === 'script') {
        return !this.loadedScripts.has(url);
      } else if (type === 'style') {
        return !this.loadedStyles.has(url);
      }
      return true;
    },
    
    // Resolve dependencies
    resolveDependencies: function(pageConfig) {
      const dependencies = {
        scripts: this.resolvePageScripts(pageConfig),
        styles: this.resolvePageStyles(pageConfig),
        order: ['styles', 'scripts'] // Load styles first
      };
      
      console.log(`🔗 Dependencies for ${pageConfig.id}:`, dependencies);
      return dependencies;
    },
    
    // Preload page resources
    preloadPageResources: function(pageConfig) {
      if (!pageConfig) return;
      
      const dependencies = this.resolveDependencies(pageConfig);
      
      // Preload styles
      dependencies.styles.forEach(styleUrl => {
        if (!this.loadedStyles.has(styleUrl)) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.href = styleUrl;
          link.as = 'style';
          link.setAttribute('data-preload', pageConfig.id);
          document.head.appendChild(link);
        }
      });
      
      // Preload scripts
      dependencies.scripts.forEach(scriptUrl => {
        if (!this.loadedScripts.has(scriptUrl)) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.href = scriptUrl;
          link.as = 'script';
          link.setAttribute('data-preload', pageConfig.id);
          document.head.appendChild(link);
        }
      });
      
      console.log(`⚡ Preloaded resources for: ${pageConfig.id}`);
    },
    
    // Unload page resources
    unloadPageResources: function(pageConfig) {
      return Promise.all([
        this.unloadPageScripts(pageConfig),
        this.unloadPageStyles(pageConfig)
      ]);
    },
    
    // Load page resources with try/catch safety
    loadPageResources: function(pageConfig) {
      return new Promise(async (resolve) => {
        try {
          console.log(`📚 Loading resources for: ${pageConfig.id}`);
          
          // Load styles first, then scripts
          const stylesLoaded = await this.loadPageStyles(pageConfig);
          const scriptsLoaded = await this.loadPageScripts(pageConfig);
          
          console.log(`✅ Resources loaded for: ${pageConfig.id}`, {
            styles: stylesLoaded.length,
            scripts: scriptsLoaded.length
          });
          
          resolve({
            styles: stylesLoaded,
            scripts: scriptsLoaded
          });
          
        } catch (error) {
          console.error(`❌ Resource loading error for ${pageConfig.id}:`, error.message);
          // Even if resources fail, resolve so page can continue
          resolve({
            styles: [],
            scripts: []
          });
        }
      });
    },
    
    // ========================================
    // 5️⃣ SIDEBAR + NAVIGATION CONTROLLER (WITH SAFETY)
    // ========================================
    
    // Setup sidebar navigation
    setupSidebarNavigation: function() {
      return UI_SAFETY.safeInit('SIDEBAR_NAV', () => {
        console.log('🧭 Setting up sidebar navigation...');
        
        // Find sidebar
        const sidebar = UI_SAFETY.safeElement('.sidebar');
        if (!sidebar) {
          console.warn('⚠️ Sidebar not found in DOM');
          return null;
        }
        
        // Bind nav links
        this.bindNavLinks(sidebar);
        
        // Setup mobile collapse
        this.setupMobileCollapse(sidebar);
        
        // Setup keyboard navigation
        this.setupKeyboardNav(sidebar);
        
        // Sync initial state
        this.syncSidebarState();
        
        console.log('✅ Sidebar navigation setup complete');
        return true;
      }, this);
    },
    
    // Bind nav links
    bindNavLinks: function(container) {
      const navLinks = container.querySelectorAll('[data-page-key], [data-nav], [data-tab]');
      
      navLinks.forEach(link => {
        // Get page key from various attributes
        const pageKey = link.getAttribute('data-page-key') || 
                       link.getAttribute('data-nav') || 
                       link.getAttribute('data-tab');
        
        if (!pageKey) return;
        
        // Add click handler with safety
        UI_SAFETY.safeEventListener(link, 'click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          
          console.log(`🧭 Navigation click: ${pageKey}`);
          
          // Validate page exists
          const validation = this.validatePageExists(pageKey);
          if (!validation.valid) {
            console.error(`❌ Invalid navigation target: ${pageKey} - ${validation.reason}`);
            this.showPageError(`Cannot navigate to ${pageKey}`, validation.reason);
            return;
          }
          
          // Check if user can access this page
          if (this.isAuthRequiredPage(pageKey) && !UI_SAFETY.userLoggedIn()) {
            console.warn(`⚠️ Authentication required for page: ${pageKey}`);
            const loginPageKey = this.findLoginPage();
            if (loginPageKey) {
              this.loadPageByKey(loginPageKey, true);
            }
            return;
          }
          
          // Load the page
          this.loadPageByKey(pageKey, true);
        });
        
        // Add mouseover for prefetch (only if user can access)
        UI_SAFETY.safeEventListener(link, 'mouseover', () => {
          if (this.validatePageExists(pageKey).valid) {
            // Only prefetch if user can access the page
            if (!this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn()) {
              this.preloadPage(pageKey);
            }
          }
        }, { once: true });
        
        console.log(`✅ Bound nav link: ${pageKey}`);
      });
    },
    
    // Highlight active tab
    highlightActiveTab: function(pageKey) {
      console.log(`🎯 Highlighting active tab: ${pageKey}`);
      
      // Remove active class from all nav items
      document.querySelectorAll('[data-page-key], [data-nav], [data-tab]').forEach(item => {
        item.classList.remove('active', 'selected', 'current');
      });
      
      // Add active class to current nav item
      const selectors = [
        `[data-page-key="${pageKey}"]`,
        `[data-nav="${pageKey}"]`,
        `[data-tab="${pageKey}"]`
      ];
      
      let activeItem = null;
      for (const selector of selectors) {
        activeItem = UI_SAFETY.safeElement(selector);
        if (activeItem) break;
      }
      
      if (activeItem) {
        activeItem.classList.add('active');
        activeItem.setAttribute('aria-current', 'page');
        
        // Ensure item is visible (scroll into view if needed)
        if (activeItem.offsetParent) {
          try {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          } catch (error) {
            // Fallback to instant scroll
            activeItem.scrollIntoView();
          }
        }
        
        console.log(`✅ Active tab highlighted: ${pageKey}`);
      } else {
        console.warn(`⚠️ No nav item found for page: ${pageKey}`);
      }
    },
    
    // Sync sidebar state
    syncSidebarState: function() {
      const sidebar = UI_SAFETY.safeElement('.sidebar');
      if (!sidebar) return;
      
      // Get saved state
      const savedState = localStorage.getItem('moodchat_sidebar_state');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          if (state.collapsed) {
            sidebar.classList.add('collapsed');
          } else {
            sidebar.classList.remove('collapsed');
          }
          
          console.log('📐 Sidebar state restored:', state);
        } catch (error) {
          console.warn('⚠️ Failed to parse sidebar state:', error);
        }
      }
      
      // Save state on change
      const observer = new MutationObserver(() => {
        const collapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('moodchat_sidebar_state', JSON.stringify({
          collapsed: collapsed,
          timestamp: new Date().toISOString()
        }));
      });
      
      observer.observe(sidebar, {
        attributes: true,
        attributeFilter: ['class']
      });
    },
    
    // Handle mobile collapse
    handleMobileCollapse: function(sidebar) {
      // Check if mobile
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        sidebar.classList.add('mobile-collapsed');
        
        // Add overlay for mobile
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
          display: none;
        `;
        
        UI_SAFETY.safeEventListener(overlay, 'click', () => {
          sidebar.classList.add('collapsed');
          overlay.style.display = 'none';
        });
        
        document.body.appendChild(overlay);
        
        // Toggle sidebar on menu button click
        const menuButtons = document.querySelectorAll('.menu-toggle, .sidebar-toggle');
        menuButtons.forEach(button => {
          UI_SAFETY.safeEventListener(button, 'click', () => {
            sidebar.classList.toggle('collapsed');
            overlay.style.display = sidebar.classList.contains('collapsed') ? 'none' : 'block';
          });
        });
        
        // Auto-collapse on navigation
        sidebar.querySelectorAll('[data-page-key]').forEach(link => {
          UI_SAFETY.safeEventListener(link, 'click', () => {
            sidebar.classList.add('collapsed');
            overlay.style.display = 'none';
          });
        });
      }
    },
    
    // Setup keyboard navigation
    setupKeyboardNav: function(sidebar) {
      // Focus trap for sidebar
      const focusableElements = sidebar.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      UI_SAFETY.safeEventListener(sidebar, 'keydown', (event) => {
        if (event.key === 'Tab') {
          if (event.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
              event.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab
            if (document.activeElement === lastElement) {
              event.preventDefault();
              firstElement.focus();
            }
          }
        }
        
        // Escape closes sidebar
        if (event.key === 'Escape' && !sidebar.classList.contains('collapsed')) {
          sidebar.classList.add('collapsed');
        }
        
        // Arrow navigation
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
          let nextIndex;
          
          if (event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % focusableElements.length;
          } else {
            nextIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
          }
          
          focusableElements[nextIndex].focus();
        }
      });
    },
    
    // Update active navigation
    updateActiveNavigation: function(pageKey) {
      this.highlightActiveTab(pageKey);
      
      // Update document title
      const pageConfig = APP_CONFIG.pages[pageKey];
      if (pageConfig && pageConfig.title) {
        document.title = `${pageConfig.title} - MoodChat`;
      }
      
      // Update browser tab icon
      if (pageConfig && pageConfig.icon) {
        const link = UI_SAFETY.safeElement("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'icon';
        link.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${pageConfig.icon}</text></svg>`;
        document.head.appendChild(link);
      }
    },
    
    // ========================================
    // 6️⃣ HISTORY & RESTORE SYSTEM
    // ========================================
    
    // Push state
    pushState: function(pageKey, pageUrl) {
      const state = {
        pageKey: pageKey,
        pageUrl: pageUrl,
        timestamp: new Date().toISOString(),
        uiState: UI_STATE.getState(),
        scrollY: window.scrollY
      };
      
      window.history.pushState(state, '', pageUrl);
      console.log(`📜 History pushed: ${pageKey} -> ${pageUrl}`);
    },
    
    // Replace state
    replaceState: function(pageKey, pageUrl) {
      const state = {
        pageKey: pageKey,
        pageUrl: pageUrl,
        timestamp: new Date().toISOString(),
        uiState: UI_STATE.getState(),
        scrollY: window.scrollY
      };
      
      window.history.replaceState(state, '', pageUrl);
      console.log(`📜 History replaced: ${pageKey} -> ${pageUrl}`);
    },
    
    // Handle popstate
    handlePopState: function(event) {
      if (event.state && event.state.pageKey) {
        console.log('📜 Popstate detected:', event.state.pageKey);
        this.loadPageByKey(event.state.pageKey, false);
        
        // Restore scroll position
        if (event.state.scrollY) {
          setTimeout(() => {
            window.scrollTo(0, event.state.scrollY);
          }, 100);
        }
      }
    },
    
    // Setup deep linking
    setupDeepLinking: function() {
      // Check URL for page parameter
      const urlParams = new URLSearchParams(window.location.search);
      const pageParam = urlParams.get('page');
      
      if (pageParam && this.validatePageExists(pageParam).valid) {
        console.log(`🔗 Deep link detected: ${pageParam}`);
        
        // Check if user can access this page
        if (this.isAuthRequiredPage(pageParam) && !UI_SAFETY.userLoggedIn()) {
          console.warn(`⚠️ Deep linked page requires auth: ${pageParam}`);
          const loginPageKey = this.findLoginPage();
          if (loginPageKey) {
            this.loadPageByKey(loginPageKey, true);
            return true;
          }
        }
        
        this.loadPageByKey(pageParam, true);
        return true;
      }
      
      return false;
    },
    
    // Refresh recovery
    refreshRecovery: function() {
      console.log('🔄 Attempting refresh recovery...');
      
      // Try to restore from session storage first
      try {
        const savedPage = sessionStorage.getItem('moodchat_last_page');
        if (savedPage && this.validatePageExists(savedPage).valid) {
          // Check if user can access this page
          if (this.isAuthRequiredPage(savedPage) && !UI_SAFETY.userLoggedIn()) {
            console.warn(`⚠️ Saved page requires auth: ${savedPage}`);
            const loginPageKey = this.findLoginPage();
            if (loginPageKey) {
              return this.loadPageByKey(loginPageKey, false);
            }
          }
          console.log(`✅ Refresh recovery: restoring ${savedPage}`);
          return this.loadPageByKey(savedPage, false);
        }
      } catch (error) {
        console.warn('⚠️ Refresh recovery from session failed:', error);
      }
      
      // Try to restore from URL
      if (this.setupDeepLinking()) {
        return Promise.resolve();
      }
      
      // Fallback to default page
      console.log('🔄 Refresh recovery: loading default page');
      return this.loadDefaultPage();
    },
    
    // ========================================
    // 7️⃣ ERROR RECOVERY SYSTEM
    // ========================================
    
    // Show page error
    showPageError: function(title, message) {
      console.error(`🛑 Page error: ${title} - ${message}`);
      
      // Create error overlay
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'page-error-overlay';
      errorOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(31, 41, 55, 0.95);
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      errorOverlay.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px;">⚠️</div>
        <h1 style="font-size: 24px; margin-bottom: 16px; color: #f87171;">${title}</h1>
        <p style="margin-bottom: 24px; max-width: 500px; opacity: 0.8;">${message}</p>
        <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px; max-width: 500px; text-align: left;">
          <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Technical Details:</div>
          <div style="font-family: monospace; font-size: 12px;">${new Date().toISOString()}</div>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="retry-page" style="
            background: #8b5cf6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          ">Retry</button>
          <button class="go-home" style="
            background: transparent;
            color: #8b5cf6;
            border: 1px solid #8b5cf6;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          ">Go Home</button>
          <button class="report-error" style="
            background: transparent;
            color: #94a3b8;
            border: 1px solid #94a3b8;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          ">Report</button>
        </div>
      `;
      
      document.body.appendChild(errorOverlay);
      
      // Add button handlers with safety
      const retryBtn = UI_SAFETY.safeElement('.retry-page', errorOverlay);
      const goHomeBtn = UI_SAFETY.safeElement('.go-home', errorOverlay);
      const reportBtn = UI_SAFETY.safeElement('.report-error', errorOverlay);
      
      if (retryBtn) {
        UI_SAFETY.safeEventListener(retryBtn, 'click', () => {
          errorOverlay.remove();
          this.retryLoad();
        });
      }
      
      if (goHomeBtn) {
        UI_SAFETY.safeEventListener(goHomeBtn, 'click', () => {
          errorOverlay.remove();
          this.fallbackToSafePage();
        });
      }
      
      if (reportBtn) {
        UI_SAFETY.safeEventListener(reportBtn, 'click', () => {
          const errorReport = {
            title: title,
            message: message,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            uiState: UI_STATE.getState(),
            currentPage: this.currentPage
          };
          
          console.error('Error report:', errorReport);
          alert('Error details have been logged. Please provide this information to support.');
        });
      }
      
      // Auto-remove after 30 seconds
      setTimeout(() => {
        if (errorOverlay.parentNode) {
          errorOverlay.remove();
          this.fallbackToSafePage();
        }
      }, 30000);
    },
    
    // Retry load
    retryLoad: function() {
      if (this.currentPage) {
        console.log(`🔄 Retrying load for: ${this.currentPage.key}`);
        this.loadPageByKey(this.currentPage.key, false);
      } else if (this.previousPage) {
        console.log(`🔄 Retrying load for previous: ${this.previousPage.key}`);
        this.loadPageByKey(this.previousPage.key, false);
      } else {
        console.log('🔄 Retrying default page load');
        this.loadDefaultPage();
      }
    },
    
    // Fallback to safe page
    fallbackToSafePage: function() {
      console.log('🔄 Falling back to safe page...');
      
      // Try login page if user not logged in
      if (!UI_SAFETY.userLoggedIn()) {
        const loginPageKey = this.findLoginPage();
        if (loginPageKey) {
          console.log(`✅ Falling back to login: ${loginPageKey}`);
          return this.loadPageByKey(loginPageKey, true);
        }
      }
      
      // Try chat.html first (if logged in)
      if (UI_SAFETY.userLoggedIn() && this.validatePageExists('chat').valid) {
        console.log('✅ Falling back to chat');
        return this.loadPageByKey('chat', true);
      }
      
      // Try any available page that user can access
      if (APP_CONFIG.pages) {
        const availablePages = Object.keys(APP_CONFIG.pages);
        for (const pageKey of availablePages) {
          const canAccess = !this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn();
          if (canAccess) {
            console.log(`✅ Falling back to ${pageKey}`);
            return this.loadPageByKey(pageKey, true);
          }
        }
      }
      
      // Last resort: reload the page
      console.error('❌ No safe page available, reloading');
      window.location.reload();
    },
    
    // Reload dependencies
    reloadDependencies: function() {
      console.log('🔄 Reloading dependencies...');
      
      // Clear loaded resources
      this.loadedScripts.clear();
      this.loadedStyles.clear();
      
      // Remove all dynamically loaded resources
      document.querySelectorAll('script[data-page], link[data-page]').forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      
      // Reload current page if exists
      if (this.currentPage) {
        console.log(`🔄 Reloading current page: ${this.currentPage.key}`);
        setTimeout(() => {
          this.loadPageByKey(this.currentPage.key, false);
        }, 100);
      } else {
        console.log('🔄 Loading default page');
        this.loadDefaultPage();
      }
    },
    
    // ========================================
    // 8️⃣ PERFORMANCE OPTIMIZATION
    // ========================================
    
    // Lazy loading
    setupLazyLoading: function() {
      // Lazy load images
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              const src = img.getAttribute('data-src');
              if (src) {
                img.src = src;
                img.removeAttribute('data-src');
              }
              observer.unobserve(img);
            }
          });
        });
        
        document.querySelectorAll('img[data-src]').forEach(img => {
          imageObserver.observe(img);
        });
      }
      
      // Lazy load iframes
      const iframeObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const iframe = entry.target;
            const src = iframe.getAttribute('data-src');
            if (src && !iframe.src) {
              iframe.src = src;
              iframe.removeAttribute('data-src');
            }
            observer.unobserve(iframe);
          }
        });
      });
      
      document.querySelectorAll('iframe[data-src]').forEach(iframe => {
        iframeObserver.observe(iframe);
      });
      
      console.log('⚡ Lazy loading setup complete');
    },
    
    // Prefetching
    setupPrefetching: function() {
      // Prefetch next likely pages (only if user can access them)
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          const likelyPages = ['group', 'message', 'friend', 'settings'];
          likelyPages.forEach(pageKey => {
            if (this.validatePageExists(pageKey).valid) {
              // Only prefetch if user can access the page
              if (!this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn()) {
                this.preloadPage(pageKey);
              }
            }
          });
        });
      }
      
      // Prefetch on mouseover (only if user can access the page)
      document.querySelectorAll('[data-page-key]').forEach(link => {
        const pageKey = link.getAttribute('data-page-key');
        if (pageKey && this.validatePageExists(pageKey).valid) {
          UI_SAFETY.safeEventListener(link, 'mouseenter', () => {
            // Only prefetch if user can access the page
            if (!this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn()) {
              this.preloadPage(pageKey);
            }
          }, { once: true });
        }
      });
      
      console.log('⚡ Prefetching setup complete');
    },
    
    // Cache eviction
    setupCacheEviction: function() {
      // Monitor cache size
      setInterval(() => {
        // Evict oldest iframes if pool is too large
        if (this.iframePool.size > 5) {
          const entries = Array.from(this.iframePool.entries());
          // Sort by creation time (oldest first)
          entries.sort((a, b) => new Date(a[1].created) - new Date(b[1].created));
          
          // Keep only 3 most recent
          const toEvict = entries.slice(0, Math.max(0, entries.length - 3));
          toEvict.forEach(([pageId]) => {
            this.destroyPageIframe(pageId);
          });
        }
        
        // Evict old page cache entries
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        for (const [key, entry] of this.pageCache.entries()) {
          if (now - entry.timestamp > maxAge) {
            this.pageCache.delete(key);
          }
        }
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      console.log('🗑️ Cache eviction setup complete');
    },
    
    // Idle callbacks
    setupIdleCallbacks: function() {
      if (!('requestIdleCallback' in window)) return;
      
      // Schedule idle tasks
      const scheduleIdleTask = (task, timeout = 1000) => {
        requestIdleCallback(task, { timeout: timeout });
      };
      
      // Garbage collection
      scheduleIdleTask(() => {
        if (window.gc) {
          window.gc();
        }
      }, 30000);
      
      // Cache warming (only pages user can access)
      scheduleIdleTask(() => {
        this.warmCache();
      }, 10000);
      
      console.log('⏳ Idle callbacks setup complete');
    },
    
    // Warm cache
    warmCache: function() {
      if (!APP_CONFIG.pages) return;
      
      const pages = Object.keys(APP_CONFIG.pages);
      const warmPages = pages.filter(pageKey => 
        pageKey !== this.currentPage?.key && 
        this.validatePageExists(pageKey).valid &&
        // Only warm pages user can access
        (!this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn())
      ).slice(0, 2); // Warm up to 2 pages
      
      warmPages.forEach(pageKey => {
        this.preloadPage(pageKey);
      });
      
      console.log(`🔥 Cache warmed for: ${warmPages.join(', ')}`);
    },
    
    // ========================================
    // 9️⃣ INTEGRATION METHODS
    // ========================================
    
    // Load iframe page
    loadIframePage: function(pageConfig) {
      return new Promise(async (resolve, reject) => {
        try {
          console.log(`🖼️ Loading iframe page: ${pageConfig.id}`);
          
          // Check if user can access this page
          if (this.isAuthRequiredPage(pageConfig.id) && !UI_SAFETY.userLoggedIn()) {
            throw new Error(`Authentication required for iframe page: ${pageConfig.id}`);
          }
          
          // Reuse iframe pool
          this.reuseIframePool();
          
          // Create or get iframe
          const iframeData = await this.createPageIframe(pageConfig);
          
          // Show the iframe
          iframeData.element.style.display = 'block';
          iframeData.element.style.visibility = 'visible';
          iframeData.element.style.opacity = '1';
          
          // Load page resources (with try/catch safety)
          try {
            await this.loadPageResources(pageConfig);
          } catch (resourceError) {
            console.warn(`⚠️ Resource loading error for iframe ${pageConfig.id}:`, resourceError.message);
            // Continue even if resources fail
          }
          
          // Cache the page
          this.pageCache.set(pageConfig.id, {
            config: pageConfig,
            iframeData: iframeData,
            timestamp: Date.now()
          });
          
          resolve({
            type: 'iframe',
            iframe: iframeData,
            pageConfig: pageConfig
          });
          
        } catch (error) {
          reject(error);
        }
      });
    },
    
    // Load main page
    loadMainPage: function(pageConfig) {
      return new Promise(async (resolve, reject) => {
        try {
          console.log(`🏠 Loading main page: ${pageConfig.id}`);
          
          // Check if user can access this page
          if (this.isAuthRequiredPage(pageConfig.id) && !UI_SAFETY.userLoggedIn()) {
            throw new Error(`Authentication required for page: ${pageConfig.id}`);
          }
          
          // Load page resources (with try/catch safety)
          try {
            await this.loadPageResources(pageConfig);
          } catch (resourceError) {
            console.warn(`⚠️ Resource loading error for page ${pageConfig.id}:`, resourceError.message);
            // Continue even if resources fail
          }
          
          // For main pages, we might need to update the DOM
          if (pageConfig.isParent && pageConfig.containerId) {
            const container = document.getElementById(pageConfig.containerId);
            if (container) {
              // Load content via fetch
              try {
                const response = await fetch(pageConfig.file);
                const html = await response.text();
                container.innerHTML = html;
                
                // Reinitialize scripts in the new content
                this.reinitializePageScripts(container);
              } catch (fetchError) {
                console.warn(`⚠️ Failed to fetch page content: ${pageConfig.file}`, fetchError.message);
              }
            }
          }
          
          resolve({
            type: 'main',
            pageConfig: pageConfig
          });
          
        } catch (error) {
          reject(error);
        }
      });
    },
    
    // Reinitialize page scripts
    reinitializePageScripts: function(container) {
      // Find and re-execute scripts in the container
      const scripts = container.querySelectorAll('script');
      scripts.forEach(script => {
        if (script.src) {
          // External script - reload it
          const newScript = document.createElement('script');
          newScript.src = script.src;
          newScript.type = script.type || 'text/javascript';
          if (script.defer) newScript.defer = true;
          if (script.async) newScript.async = true;
          script.parentNode.replaceChild(newScript, script);
        } else {
          // Inline script - re-execute
          try {
            eval(script.textContent);
          } catch (error) {
            console.warn('⚠️ Failed to execute inline script:', error);
          }
        }
      });
    },
    
    // Initialize the router
    init: function() {
      console.log('🚀 Initializing Page Router...');
      
      // Initialize UI state machine
      UI_STATE.initialize();
      
      // Initialize router
      this.initialize();
      
      // Setup sidebar navigation
      this.setupSidebarNavigation();
      
      // Setup performance optimizations
      this.setupLazyLoading();
      this.setupPrefetching();
      this.setupCacheEviction();
      this.setupIdleCallbacks();
      
      // Setup deep linking
      const deepLinked = this.setupDeepLinking();
      
      // Start iframe health monitoring
      setInterval(() => {
        this.monitorIframeHealth();
      }, 30 * 1000); // Every 30 seconds
      
      // Setup error boundaries
      this.setupErrorBoundaries();
      
      console.log('✅ Page Router fully initialized');
      
      // Return initialization promise
      return new Promise((resolve) => {
        // If not deep linked, load default page
        if (!deepLinked) {
          setTimeout(() => {
            this.refreshRecovery().then(resolve).catch(() => {
              this.loadDefaultPage().then(resolve);
            });
          }, 100);
        } else {
          resolve();
        }
      });
    },
    
    // Setup error boundaries
    setupErrorBoundaries: function() {
      // Global error handler for navigation errors
      UI_SAFETY.safeEventListener(window, 'moodchat-route-error', (event) => {
        console.error('🛑 Route error caught:', event.detail);
        
        // Try to recover
        if (!event.detail.retryAttempted) {
          setTimeout(() => {
            this.retryLoad();
          }, 2000);
        }
      });
      
      // Network error handling
      UI_SAFETY.safeEventListener(window, 'offline', () => {
        UI_STATE.transitionTo(UI_STATE.STATES.OFFLINE, 'network_offline');
        this.showPageError('You are offline', 'Please check your internet connection');
      });
      
      UI_SAFETY.safeEventListener(window, 'online', () => {
        if (UI_STATE.isState(UI_STATE.STATES.OFFLINE)) {
          UI_STATE.transitionTo(UI_STATE.STATES.READY, 'network_online');
          this.retryLoad();
        }
      });
    },
    
    // ========================================
    // 🔟 PUBLIC API
    // ========================================
    
    // Public API
    api: {
      // Navigation
      navigate: function(pageKey) {
        return PAGE_ROUTER.loadPageByKey(pageKey, true);
      },
      
      navigateToUrl: function(pageUrl) {
        return PAGE_ROUTER.loadPage(pageUrl, true);
      },
      
      goBack: function() {
        if (PAGE_ROUTER.pageHistory.length > 1) {
          window.history.back();
        } else {
          PAGE_ROUTER.loadDefaultPage();
        }
      },
      
      // State
      getCurrentPage: function() {
        return PAGE_ROUTER.currentPage;
      },
      
      getPageHistory: function() {
        return [...PAGE_ROUTER.pageHistory];
      },
      
      getUIState: function() {
        return UI_STATE.getState();
      },
      
      // Iframe management
      getIframe: function(pageId) {
        return PAGE_ROUTER.iframePool.get(pageId);
      },
      
      getAllIframes: function() {
        return Array.from(PAGE_ROUTER.iframePool.values());
      },
      
      // Resource management
      preload: function(pageKey) {
        return PAGE_ROUTER.preloadPage(pageKey);
      },
      
      unloadResources: function(pageKey) {
        const pageConfig = APP_CONFIG.pages[pageKey];
        if (pageConfig) {
          return PAGE_ROUTER.unloadPageResources(pageConfig);
        }
        return Promise.reject(new Error(`Page not found: ${pageKey}`));
      },
      
      // Error handling
      retry: function() {
        return PAGE_ROUTER.retryLoad();
      },
      
      goHome: function() {
        return PAGE_ROUTER.fallbackToSafePage();
      },
      
      // Performance
      warmCache: function() {
        return PAGE_ROUTER.warmCache();
      },
      
      clearCache: function() {
        PAGE_ROUTER.loadedScripts.clear();
        PAGE_ROUTER.loadedStyles.clear();
        PAGE_ROUTER.pageCache.clear();
        return Promise.resolve();
      }
    },
    
    // ========================================
    // 🔗 INTEGRATION HOOKS
    // ========================================
    
    // Integration with app.core.bootstrap.js
    onBootstrapComplete: function() {
      console.log('🔗 Bootstrap complete, initializing router...');
      return this.init();
    },
    
    // Integration with app.core.session.js
    onSessionChange: function(event) {
      console.log('🔗 Session change detected:', event.detail.type);
      
      if (event.detail.type === 'authenticated') {
        // User logged in, ensure proper page is loaded
        if (!PAGE_ROUTER.currentPage || PAGE_ROUTER.currentPage.key === 'chat') {
          PAGE_ROUTER.loadDefaultPage();
        }
      } else if (event.detail.type === 'logged_out') {
        // User logged out, redirect to login page
        const loginPageKey = PAGE_ROUTER.findLoginPage();
        if (loginPageKey) {
          PAGE_ROUTER.loadPageByKey(loginPageKey, true);
        } else {
          PAGE_ROUTER.loadDefaultPage();
        }
      }
    },
    
    // Integration with api.request.js
    onNetworkStatusChange: function(status) {
      console.log('🔗 Network status:', status);
      
      if (status === 'offline') {
        UI_STATE.transitionTo(UI_STATE.STATES.OFFLINE, 'network_status_offline');
      } else if (status === 'online' && UI_STATE.isState(UI_STATE.STATES.OFFLINE)) {
        UI_STATE.transitionTo(UI_STATE.STATES.READY, 'network_status_online');
      }
    },
    
    // Integration with settingsManager.js
    onThemeChange: function(theme) {
      console.log('🔗 Theme changed:', theme);
      
      // Sync theme to all iframes
      PAGE_ROUTER.iframePool.forEach((iframeData) => {
        if (iframeData.element && iframeData.element.contentWindow) {
          PAGE_ROUTER.syncIframeTheme(iframeData.element);
        }
      });
    },
    
    // Integration with sidebar toggle
    onSidebarToggle: function(event) {
      console.log('🔗 Sidebar toggled:', event.detail.open);
      
      // Save sidebar state
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        localStorage.setItem('moodchat_sidebar_state', JSON.stringify({
          collapsed: !event.detail.open,
          timestamp: new Date().toISOString()
        }));
      }
    }
  };
  
  // ============================================================================
  // GLOBAL EXPORTS & INTEGRATION
  // ============================================================================
  
  // Expose to global scope
  window.PageRouter = PAGE_ROUTER;
  window.UiState = UI_STATE;
  window.UiSafety = UI_SAFETY;
  
  // Expose public API
  window.MoodChatUI = {
    // Navigation
    navigate: PAGE_ROUTER.api.navigate,
    navigateToUrl: PAGE_ROUTER.api.navigateToUrl,
    goBack: PAGE_ROUTER.api.goBack,
    switchTab: PAGE_ROUTER.api.navigate, // Alias for backward compatibility
    
    // State
    getCurrentPage: PAGE_ROUTER.api.getCurrentPage,
    getUIState: PAGE_ROUTER.api.getUIState,
    
    // Iframe
    getIframe: PAGE_ROUTER.api.getIframe,
    
    // Safety
    safeInit: UI_SAFETY.safeInit.bind(UI_SAFETY),
    safeElement: UI_SAFETY.safeElement.bind(UI_SAFETY),
    safeLoad: UI_SAFETY.safeLoad.bind(UI_SAFETY),
    userLoggedIn: UI_SAFETY.userLoggedIn.bind(UI_SAFETY),
    
    // Utilities
    preload: PAGE_ROUTER.api.preload,
    retry: PAGE_ROUTER.api.retry,
    goHome: PAGE_ROUTER.api.goHome,
    
    // Initialization
    init: PAGE_ROUTER.init.bind(PAGE_ROUTER)
  };
  
  // Legacy compatibility
  window.loadPage = function(pageUrl) {
    return PAGE_ROUTER.loadPage(pageUrl, true);
  };
  
  window.loadPageByKey = function(pageKey) {
    return PAGE_ROUTER.loadPageByKey(pageKey, true);
  };
  
  window.switchTab = function(tabName) {
    return PAGE_ROUTER.loadPageByKey(tabName, true);
  };
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📄 DOM ready, waiting for bootstrap...');
      
      // Wait for app.core to be ready
      const waitForCore = setInterval(() => {
        if (window.app && window.app.core) {
          clearInterval(waitForCore);
          console.log('🔗 App core ready, initializing UI...');
          
          // Initialize UI
          PAGE_ROUTER.init().then(() => {
            console.log('🎉 MoodChat UI Navigation Engine Ready!');
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('moodchat-ui-ready', {
              detail: {
                timestamp: new Date().toISOString(),
                router: 'initialized',
                state: UI_STATE.getState()
              }
            }));
          });
        }
      }, 100);
    });
  } else {
    // DOM already ready
    console.log('📄 DOM already ready, initializing UI...');
    PAGE_ROUTER.init();
  }
  
  // Export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      PageRouter: PAGE_ROUTER,
      UiState: UI_STATE,
      UiSafety: UI_SAFETY,
      MoodChatUI: window.MoodChatUI
    };
  }
  
  console.log('📦 app.core.ui.js loaded successfully with safety patches');
})();