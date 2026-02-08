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

(function () {
  // ============================================================================
  // UI STATE MACHINE - Finite State Management
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
      console.log('🔄 UI State Machine initializing...');
      this.currentState = this.STATES.BOOTING;
      this.previousState = null;
      this.transitionHistory = [];
      
      window.addEventListener('online', () => {
        if (this.currentState === this.STATES.OFFLINE) {
          this.transitionTo(this.STATES.READY, 'network_recovered');
        }
      });
      
      window.addEventListener('offline', () => {
        this.transitionTo(this.STATES.OFFLINE, 'network_lost');
      });
      
      console.log('✅ UI State Machine initialized');
    },
    
    transitionTo: function(newState, reason = '') {
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
  // ROUTER ENGINE - Deterministic Page Routing
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
    
    initialize: function() {
      console.log('🧭 Page Router initializing...');
      
      // Setup popstate handler for browser navigation
      window.addEventListener('popstate', (event) => {
        if (event.state && event.state.pageKey) {
          console.log('📜 Browser navigation:', event.state.pageKey);
          this.loadPageByKey(event.state.pageKey, false);
        }
      });
      
      // Setup beforeunload to save state
      window.addEventListener('beforeunload', () => {
        if (this.currentPage) {
          this.saveNavigationState();
        }
      });
      
      // Initialize iframe pool
      this.initializeIframePool();
      
      console.log('✅ Page Router initialized');
    },
    
    // ========================================
    // 1️⃣ ROUTER ENGINE METHODS
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
        // Priority 1: Session storage
        () => {
          try {
            const savedPage = sessionStorage.getItem('moodchat_last_page');
            if (savedPage && this.validatePageExists(savedPage).valid) {
              console.log('✅ Restoring from session storage:', savedPage);
              return savedPage;
            }
          } catch (error) {
            console.warn('⚠️ Failed to read session storage:', error);
            sessionStorage.removeItem('moodchat_last_page');
          }
          return null;
        },
        
        // Priority 2: APP_CONFIG.defaultPageKey
        () => {
          if (APP_CONFIG.defaultPageKey && this.validatePageExists(APP_CONFIG.defaultPageKey).valid) {
            console.log('✅ Using default page key:', APP_CONFIG.defaultPageKey);
            return APP_CONFIG.defaultPageKey;
          }
          return null;
        },
        
        // Priority 3: chat (always available)
        () => {
          if (this.validatePageExists('chat').valid) {
            console.log('✅ Using fallback: chat');
            return 'chat';
          }
          return null;
        },
        
        // Priority 4: First available page
        () => {
          if (APP_CONFIG.pages) {
            const firstPage = Object.keys(APP_CONFIG.pages)[0];
            if (firstPage) {
              console.log('✅ Using first available page:', firstPage);
              return firstPage;
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
    // 3️⃣ IFRAME MANAGEMENT SYSTEM
    // ========================================
    
    // Initialize iframe pool
    initializeIframePool: function() {
      console.log('🖼️ Initializing iframe pool...');
      
      // Create iframe container if not exists
      let container = document.getElementById('iframe-container');
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
        
        const appContainer = document.getElementById('app-container') || document.querySelector('main');
        if (appContainer) {
          appContainer.appendChild(container);
        } else {
          document.body.appendChild(container);
        }
        
        console.log('✅ Created iframe container');
      }
      
      // Setup iframe message listener
      window.addEventListener('message', (event) => {
        this.handleIframeMessage(event);
      });
      
      console.log('✅ Iframe pool initialized');
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
        
        const container = document.getElementById('iframe-container');
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
        
        // Setup load event handlers
        iframe.addEventListener('load', () => {
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
        
        iframe.addEventListener('error', (error) => {
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
      const container = document.getElementById('iframe-container');
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
        
        // Add button handlers
        errorOverlay.querySelector('.retry-iframe').addEventListener('click', () => {
          iframe.src = iframe.src;
          errorOverlay.remove();
        });
        
        errorOverlay.querySelector('.close-iframe').addEventListener('click', () => {
          errorOverlay.remove();
          iframe.style.display = 'none';
          this.loadDefaultPage();
        });
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
    },
    
    // Check if origin is trusted
    isTrustedOrigin: function(origin) {
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
    },
    
    // ========================================
    // 4️⃣ DYNAMIC RESOURCE LOADER
    // ========================================
    
    // Load page scripts
    loadPageScripts: function(pageConfig) {
      return new Promise((resolve, reject) => {
        console.log(`📦 Loading scripts for: ${pageConfig.id}`);
        
        // Get scripts from page config or infer from page type
        const scriptUrls = this.resolvePageScripts(pageConfig);
        
        if (scriptUrls.length === 0) {
          console.log(`ℹ️ No scripts to load for: ${pageConfig.id}`);
          resolve([]);
          return;
        }
        
        const loadPromises = scriptUrls.map(scriptUrl => 
          this.loadScript(scriptUrl, pageConfig.id)
        );
        
        Promise.all(loadPromises)
          .then((loadedScripts) => {
            console.log(`✅ Scripts loaded for: ${pageConfig.id}`, loadedScripts);
            resolve(loadedScripts);
          })
          .catch((error) => {
            console.error(`❌ Script loading failed for: ${pageConfig.id}`, error);
            reject(error);
          });
      });
    },
    
    // Load page styles
    loadPageStyles: function(pageConfig) {
      return new Promise((resolve, reject) => {
        console.log(`🎨 Loading styles for: ${pageConfig.id}`);
        
        // Get styles from page config or infer from page type
        const styleUrls = this.resolvePageStyles(pageConfig);
        
        if (styleUrls.length === 0) {
          console.log(`ℹ️ No styles to load for: ${pageConfig.id}`);
          resolve([]);
          return;
        }
        
        const loadPromises = styleUrls.map(styleUrl => 
          this.loadStyle(styleUrl, pageConfig.id)
        );
        
        Promise.all(loadPromises)
          .then((loadedStyles) => {
            console.log(`✅ Styles loaded for: ${pageConfig.id}`, loadedStyles);
            resolve(loadedStyles);
          })
          .catch((error) => {
            console.error(`❌ Style loading failed for: ${pageConfig.id}`, error);
            reject(error);
          });
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
      scripts.push('js/app.common.js');
      
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
      styles.push('css/app.common.css');
      
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
    
    // ========================================
    // 5️⃣ SIDEBAR + NAVIGATION CONTROLLER
    // ========================================
    
    // Setup sidebar navigation
    setupSidebarNavigation: function() {
      console.log('🧭 Setting up sidebar navigation...');
      
      // Find sidebar
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) {
        console.warn('⚠️ Sidebar not found in DOM');
        return;
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
    },
    
    // Bind nav links
    bindNavLinks: function(container) {
      const navLinks = container.querySelectorAll('[data-page-key], [data-nav], [data-tab]');
      
      navLinks.forEach(link => {
        // Remove existing listeners
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        
        // Get page key from various attributes
        const pageKey = newLink.getAttribute('data-page-key') || 
                       newLink.getAttribute('data-nav') || 
                       newLink.getAttribute('data-tab');
        
        if (!pageKey) return;
        
        // Add click handler
        newLink.addEventListener('click', (event) => {
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
          
          // Load the page
          this.loadPageByKey(pageKey, true);
        });
        
        // Add mouseover for prefetch
        newLink.addEventListener('mouseover', () => {
          if (this.validatePageExists(pageKey).valid) {
            this.preloadPage(pageKey);
          }
        });
        
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
        activeItem = document.querySelector(selector);
        if (activeItem) break;
      }
      
      if (activeItem) {
        activeItem.classList.add('active');
        activeItem.setAttribute('aria-current', 'page');
        
        // Ensure item is visible (scroll into view if needed)
        if (activeItem.offsetParent) {
          activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        
        console.log(`✅ Active tab highlighted: ${pageKey}`);
      } else {
        console.warn(`⚠️ No nav item found for page: ${pageKey}`);
      }
    },
    
    // Sync sidebar state
    syncSidebarState: function() {
      const sidebar = document.querySelector('.sidebar');
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
        
        overlay.addEventListener('click', () => {
          sidebar.classList.add('collapsed');
          overlay.style.display = 'none';
        });
        
        document.body.appendChild(overlay);
        
        // Toggle sidebar on menu button click
        const menuButtons = document.querySelectorAll('.menu-toggle, .sidebar-toggle');
        menuButtons.forEach(button => {
          button.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            overlay.style.display = sidebar.classList.contains('collapsed') ? 'none' : 'block';
          });
        });
        
        // Auto-collapse on navigation
        sidebar.querySelectorAll('[data-page-key]').forEach(link => {
          link.addEventListener('click', () => {
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
      
      sidebar.addEventListener('keydown', (event) => {
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
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
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
      
      // Add button handlers
      errorOverlay.querySelector('.retry-page').addEventListener('click', () => {
        errorOverlay.remove();
        this.retryLoad();
      });
      
      errorOverlay.querySelector('.go-home').addEventListener('click', () => {
        errorOverlay.remove();
        this.fallbackToSafePage();
      });
      
      errorOverlay.querySelector('.report-error').addEventListener('click', () => {
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
      
      // Try chat.html first
      if (this.validatePageExists('chat').valid) {
        console.log('✅ Falling back to chat');
        return this.loadPageByKey('chat', true);
      }
      
      // Try any available page
      if (APP_CONFIG.pages) {
        const availablePages = Object.keys(APP_CONFIG.pages);
        if (availablePages.length > 0) {
          console.log(`✅ Falling back to ${availablePages[0]}`);
          return this.loadPageByKey(availablePages[0], true);
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
      // Prefetch next likely pages
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          const likelyPages = ['group', 'message', 'friend', 'settings'];
          likelyPages.forEach(pageKey => {
            if (this.validatePageExists(pageKey).valid) {
              this.preloadPage(pageKey);
            }
          });
        });
      }
      
      // Prefetch on mouseover
      document.querySelectorAll('[data-page-key]').forEach(link => {
        const pageKey = link.getAttribute('data-page-key');
        if (pageKey && this.validatePageExists(pageKey).valid) {
          link.addEventListener('mouseenter', () => {
            this.preloadPage(pageKey);
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
      
      // Cache warming
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
        this.validatePageExists(pageKey).valid
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
          
          // Reuse iframe pool
          this.reuseIframePool();
          
          // Create or get iframe
          const iframeData = await this.createPageIframe(pageConfig);
          
          // Show the iframe
          iframeData.element.style.display = 'block';
          iframeData.element.style.visibility = 'visible';
          iframeData.element.style.opacity = '1';
          
          // Load page resources
          await this.loadPageResources(pageConfig);
          
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
          
          // Load page resources
          await this.loadPageResources(pageConfig);
          
          // For main pages, we might need to update the DOM
          if (pageConfig.isParent && pageConfig.containerId) {
            const container = document.getElementById(pageConfig.containerId);
            if (container) {
              // Load content via fetch
              const response = await fetch(pageConfig.file);
              const html = await response.text();
              container.innerHTML = html;
              
              // Reinitialize scripts in the new content
              this.reinitializePageScripts(container);
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
    
    // Load page resources
    loadPageResources: function(pageConfig) {
      return Promise.all([
        this.loadPageStyles(pageConfig),
        this.loadPageScripts(pageConfig)
      ]);
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
      window.addEventListener('moodchat-route-error', (event) => {
        console.error('🛑 Route error caught:', event.detail);
        
        // Try to recover
        if (!event.detail.retryAttempted) {
          setTimeout(() => {
            this.retryLoad();
          }, 2000);
        }
      });
      
      // Network error handling
      window.addEventListener('offline', () => {
        UI_STATE.transitionTo(UI_STATE.STATES.OFFLINE, 'network_offline');
        this.showPageError('You are offline', 'Please check your internet connection');
      });
      
      window.addEventListener('online', () => {
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
        // User logged out, redirect to chat
        PAGE_ROUTER.loadPageByKey('chat', true);
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
      MoodChatUI: window.MoodChatUI
    };
  }
  
  console.log('📦 app.core.ui.js loaded successfully');
})();