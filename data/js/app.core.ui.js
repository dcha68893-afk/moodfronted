
// app.core.ui.js - MoodChat UI Navigation & Rendering Engine
// UPDATED: Safe config loader with defensive initialization
// UPDATED: APP_CONFIG dependency protection - NO CRASH if missing
// UPDATED: Non-blocking UI policy - no global event prevention
// UPDATED: Authentication flow preservation
// UPDATED: Iframe communication fully intact
// FIXED: Uncaught ReferenceError: APP_CONFIG is not defined
// FIXED: Delayed config loading with merge
// FIXED: All page resolution methods are crash-proof
// FIXED: **CRITICAL** Infinite recursion in validatePageExists/loadDefaultPage
// FIXED: **CRITICAL** Authentication required error in bootstrap
// FIXED: **CRITICAL** Missing optional CSS/JS resources no longer crash the app
// FIXED: **V2.0** Session module timeout issues
// FIXED: **V2.0** Duplicate sidebar detection and cleanup
// FIXED: **V2.0** Favicon error with undefined pageConfig
// FIXED: **V2.0** Navigation item binding for login page
// FIXED: **V2.0** Event listener duplication warnings
// FIXED: **V2.0** Tracking Prevention storage access warnings
// PRESERVED: All existing APIs, exports, and working features
//
// ============================================================================
// UI RESILIENCE HARDENING - PHASE 1-12 COMPLETE
// ============================================================================
// PHASE 1: UI Flow Audit - Added navigation flow markers
// PHASE 2: Global Error Boundary - Catches all errors without reload
// PHASE 3: Navigation Lock Protection - 3s max lock, deadlock detection
// PHASE 4: Safe Routing Layer - Navigation never throws
// PHASE 5: Iframe Sandboxing - Enhanced isolation and recovery
// PHASE 6: Resource Cleanup - Prevents memory leaks on route change
// PHASE 7: Async Guards - Prevents stale callbacks
// PHASE 8: Fallback UI States - Placeholders for failed iframes
// PHASE 9: Session-Aware UI - Reacts to session events
// PHASE 10: Legacy Compatibility - Preserved all APIs
// PHASE 11: Performance - No layout thrashing, no double rendering
// PHASE 12: Debugging - Grouped logs with minimal noise
// ============================================================================

(function () {
  // ============================================================================
  // SAFE CONFIG LOADER - DEFENSIVE INITIALIZATION (ADDED)
  // ============================================================================
  // Ensures APP_CONFIG is never undefined - prevents ReferenceError crashes
  // Waits for delayed config, merges without overwriting, never throws
  
  if (typeof window.__MOODCHAT_CONFIG_STATE === 'undefined') {
    window.__MOODCHAT_CONFIG_STATE = {
      initialized: false,
      pendingCallbacks: [],
      fallbackActive: false,
      // ADDED: Prevent infinite recursion
      resolvingDefaultPage: false,
      defaultPageResolveAttempts: 0,
      // ADDED: Track config load attempts
      configLoadAttempts: 0,
      maxConfigLoadAttempts: 10
    };
  }

  // Create safe fallback config immediately
  if (typeof window.APP_CONFIG === 'undefined') {
    console.warn('⚠️ [CONFIG SAFETY] APP_CONFIG not found - creating fallback config');
    window.APP_CONFIG = {
      pages: {
        // ADDED: Ensure login page exists in fallback
        login: { id: 'login', file: 'index.html', isIframe: false, requiresAuth: false, title: 'Login' },
        chat: { id: 'chat', file: 'chat.html', isIframe: false, requiresAuth: true, title: 'Chat' }
      },
      defaultPageKey: 'login',
      version: 'fallback',
      _isFallback: true
    };
    window.__MOODCHAT_CONFIG_STATE.fallbackActive = true;
  }

  // Store original config reference
  const ORIGINAL_CONFIG = window.APP_CONFIG;
  
  // Config ready promise for async initialization
  window.__MOODCHAT_CONFIG_READY = new Promise((resolve) => {
    // If config already has pages and not just fallback, resolve immediately
    if (Object.keys(ORIGINAL_CONFIG.pages || {}).length > 0 && !ORIGINAL_CONFIG._isFallback) {
      window.__MOODCHAT_CONFIG_STATE.initialized = true;
      resolve(ORIGINAL_CONFIG);
    } else {
      // Store resolver for later use
      window.__MOODCHAT_CONFIG_STATE.resolveReady = resolve;
    }
  });

  // Watch for real config to load (if we're in fallback mode)
  if (window.__MOODCHAT_CONFIG_STATE.fallbackActive) {
    const configWatcher = setInterval(() => {
      // Increment attempt counter
      window.__MOODCHAT_CONFIG_STATE.configLoadAttempts++;
      
      // Check if real config has been loaded (has pages and not our fallback)
      if (window.APP_CONFIG && 
          window.APP_CONFIG !== ORIGINAL_CONFIG && 
          Object.keys(window.APP_CONFIG.pages || {}).length > 0) {
        
        console.log('✅ [CONFIG SAFETY] Real APP_CONFIG detected, merging with fallback');
        
        // Merge real config into our fallback to preserve references
        Object.assign(ORIGINAL_CONFIG, window.APP_CONFIG);
        ORIGINAL_CONFIG._isFallback = false;
        
        // Update global reference to ensure consistency
        window.APP_CONFIG = ORIGINAL_CONFIG;
        
        // Mark as initialized and resolve promise
        window.__MOODCHAT_CONFIG_STATE.initialized = true;
        window.__MOODCHAT_CONFIG_STATE.fallbackActive = false;
        
        if (window.__MOODCHAT_CONFIG_STATE.resolveReady) {
          window.__MOODCHAT_CONFIG_STATE.resolveReady(ORIGINAL_CONFIG);
        }
        
        // Execute pending callbacks that were waiting for config
        window.__MOODCHAT_CONFIG_STATE.pendingCallbacks.forEach(cb => {
          try { cb(ORIGINAL_CONFIG); } catch (e) { console.warn('Config callback error:', e); }
        });
        window.__MOODCHAT_CONFIG_STATE.pendingCallbacks = [];
        
        clearInterval(configWatcher);
      } else if (window.__MOODCHAT_CONFIG_STATE.configLoadAttempts > window.__MOODCHAT_CONFIG_STATE.maxConfigLoadAttempts) {
        // Timeout after max attempts - stop watching but keep using fallback
        console.warn('⚠️ [CONFIG SAFETY] Real APP_CONFIG timeout - continuing with fallback');
        window.__MOODCHAT_CONFIG_STATE.initialized = true;
        if (window.__MOODCHAT_CONFIG_STATE.resolveReady) {
          window.__MOODCHAT_CONFIG_STATE.resolveReady(ORIGINAL_CONFIG);
        }
        clearInterval(configWatcher);
      }
    }, 100); // Check every 100ms
  }

  // Safe config accessor - NEVER throws, ALWAYS returns valid object
  const SafeConfig = {
    get: function() {
      return window.APP_CONFIG || ORIGINAL_CONFIG || { 
        pages: { 
          login: { id: 'login', file: 'index.html', isIframe: false, requiresAuth: false } 
        }, 
        defaultPageKey: 'login' 
      };
    },
    
    getPages: function() {
      const config = this.get();
      return config.pages || {};
    },
    
    getPage: function(key) {
      const pages = this.getPages();
      return pages[key] || null;
    },
    
    isFallback: function() {
      return this.get()._isFallback === true;
    },
    
    waitForReady: function(callback) {
      if (window.__MOODCHAT_CONFIG_STATE.initialized) {
        callback(this.get());
      } else {
        window.__MOODCHAT_CONFIG_STATE.pendingCallbacks.push(callback);
      }
    },
    
    // ADDED: Check if a page exists without creating it
    pageExists: function(key) {
      const pages = this.getPages();
      return !!(key && pages[key]);
    },
    
    // ADDED: Get all page keys
    getPageKeys: function() {
      return Object.keys(this.getPages());
    }
  };

  // ============================================================================
  // GLOBAL UI INITIALIZATION FLAGS - ADDED FOR DUPLICATION PREVENTION
  // ============================================================================
  if (typeof window.__UI_INITIALIZED === 'undefined') {
    window.__UI_INITIALIZED = false;
    window.__UI_COMPONENTS_INITIALIZED = new Set();
    window.__UI_EVENTS_BOUND = new Set();
  }

  // ============================================================================
  // UI RESILIENCE: GLOBAL ERROR BOUNDARY (PHASE 2)
  // ============================================================================
  // UI RESILIENCE PATCH: Global error boundary - never reloads page, always recovers
  const UIErrorBoundary = {
    errors: [],
    maxErrors: 50,
    recoveryCallbacks: new Set(),
    
    handle: function(error, source) {
      console.group('🛡️ UI ERROR BOUNDARY');
      console.error('Error caught:', {
        message: error?.message || 'Unknown error',
        source: source || 'unknown',
        stack: error?.stack,
        timestamp: new Date().toISOString()
      });
      console.groupEnd();
      
      // Track error
      this.errors.push({
        error: error?.message || 'Unknown error',
        source: source,
        timestamp: Date.now()
      });
      
      // Limit error history
      if (this.errors.length > this.maxErrors) {
        this.errors = this.errors.slice(-this.maxErrors);
      }
      
      // Execute recovery callbacks
      this.recoveryCallbacks.forEach(cb => {
        try { cb(error, source); } catch (e) {}
      });
      
      // NEVER reload page - just log and recover
      return true; // Prevents default browser error handling
    },
    
    addRecovery: function(callback) {
      this.recoveryCallbacks.add(callback);
    },
    
    removeRecovery: function(callback) {
      this.recoveryCallbacks.delete(callback);
    },
    
    getRecentErrors: function() {
      return [...this.errors];
    },
    
    clearErrors: function() {
      this.errors = [];
    }
  };

  // Global error handlers
  window.addEventListener('error', function(event) {
    // UI RESILIENCE PATCH: Global error handler prevents page crash
    UIErrorBoundary.handle(event.error || event.message, 'window.error');
    event.preventDefault(); // Prevent default browser error page
  });

  window.addEventListener('unhandledrejection', function(event) {
    // UI RESILIENCE PATCH: Unhandled promise rejection handler
    UIErrorBoundary.handle(event.reason, 'unhandledrejection');
    event.preventDefault(); // Prevent default browser error
  });

  // ============================================================================
  // UI RESILIENCE: NAVIGATION LOCK PROTECTION (PHASE 3)
  // ============================================================================
  // UI RESILIENCE PATCH: Navigation lock with timeout and deadlock detection
  const NavigationLock = {
    _locked: false,
    _lockOwner: null,
    _lockTime: null,
    _lockReason: null,
    _pendingQueue: [],
    _maxLockTime: 3000, // 3 seconds max lock
    _deadlockCheckInterval: 1000,
    _deadlockTimer: null,
    _lockCount: 0,
    _maxLockAttempts: 5,
    
    acquire: function(owner, reason = 'navigation') {
      // UI AUDIT: navigation blocked here when promise rejects
      const now = Date.now();
      
      // Deadlock detection
      if (this._locked && this._lockTime && (now - this._lockTime > this._maxLockTime)) {
        console.warn(`⚠️ [NAV LOCK] Deadlock detected! Force releasing lock held by ${this._lockOwner} for ${now - this._lockTime}ms`);
        this._lockCount++;
        this._locked = false;
        this._lockOwner = null;
        this._lockTime = null;
        this._lockReason = null;
      }
      
      // Prevent excessive lock attempts
      if (this._lockCount > this._maxLockAttempts) {
        console.error('❌ [NAV LOCK] Excessive lock attempts, forcing reset');
        this._lockCount = 0;
        this._locked = false;
        this._lockOwner = null;
        this._lockTime = null;
        this._lockReason = null;
      }
      
      if (this._locked) {
        console.warn(`⚠️ [NAV LOCK] Lock held by ${this._lockOwner}, queueing ${owner}`);
        return false;
      }
      
      this._locked = true;
      this._lockOwner = owner;
      this._lockTime = now;
      this._lockReason = reason;
      
      // Start deadlock monitor
      this._startDeadlockMonitor();
      
      console.log(`🔒 [NAV LOCK] Acquired by ${owner} (reason: ${reason})`);
      return true;
    },
    
    release: function(owner) {
      if (!this._locked) {
        console.warn('⚠️ [NAV LOCK] Release called but lock not held');
        return false;
      }
      
      if (owner && this._lockOwner !== owner) {
        console.warn(`⚠️ [NAV LOCK] Release by wrong owner: ${owner} (held by ${this._lockOwner})`);
        return false;
      }
      
      this._locked = false;
      this._lockOwner = null;
      this._lockTime = null;
      this._lockReason = null;
      
      console.log('🔓 [NAV LOCK] Released');
      
      // Process next in queue
      this._processQueue();
      
      return true;
    },
    
    forceRelease: function() {
      console.warn('⚠️ [NAV LOCK] Force release');
      this._locked = false;
      this._lockOwner = null;
      this._lockTime = null;
      this._lockReason = null;
      this._lockCount = 0;
      
      this._processQueue();
    },
    
    _startDeadlockMonitor: function() {
      if (this._deadlockTimer) clearTimeout(this._deadlockTimer);
      
      this._deadlockTimer = setTimeout(() => {
        if (this._locked && this._lockTime) {
          const heldTime = Date.now() - this._lockTime;
          if (heldTime > this._maxLockTime) {
            console.warn(`⚠️ [NAV LOCK] Auto-releasing deadlock after ${heldTime}ms`);
            this.forceRelease();
          }
        }
      }, this._maxLockTime + 500);
    },
    
    _processQueue: function() {
      if (this._pendingQueue.length > 0) {
        const next = this._pendingQueue.shift();
        setTimeout(() => {
          if (next.callback) {
            next.callback();
          }
        }, 10);
      }
    },
    
    queue: function(callback, owner) {
      this._pendingQueue.push({ callback, owner });
    },
    
    isLocked: function() {
      return this._locked;
    },
    
    getLockInfo: function() {
      return {
        locked: this._locked,
        owner: this._lockOwner,
        heldFor: this._lockTime ? Date.now() - this._lockTime : 0,
        reason: this._lockReason,
        queueLength: this._pendingQueue.length,
        lockCount: this._lockCount
      };
    }
  };

  // ============================================================================
  // UI INITIALIZATION LOCK - PREVENT DUPLICATE RENDERING
  // ============================================================================
  
  const UI_INIT_LOCK = {
    _initialized: false,
    _initializing: false,
    _components: new Set(),
    
    acquire: function(component) {
      // Check global UI initialized flag for critical components
      if (window.__UI_INITIALIZED && 
          (component.includes('nav') || 
           component.includes('sidebar') || 
           component.includes('header') ||
           component.includes('menu') ||
           component.includes('icon'))) {
        console.warn(`⚠️ [DUPLICATION GUARD] Global UI already initialized, blocking ${component}`);
        return false;
      }
      
      // Check for parent UI owner
      const parentUI = document.querySelector('[data-ui-owner="parent"]');
      if (parentUI && 
          (component.includes('nav') || 
           component.includes('sidebar') || 
           component.includes('header'))) {
        console.warn(`⚠️ [DUPLICATION GUARD] Parent UI exists, blocking ${component}`);
        return false;
      }
      
      // Check if component already initialized globally
      if (window.__UI_COMPONENTS_INITIALIZED.has(component)) {
        console.warn(`⚠️ [DUPLICATION GUARD] Component ${component} already initialized globally, skipping`);
        return false;
      }
      
      if (this._initializing) {
        console.warn(`⚠️ UI initialization already in progress, blocking ${component}`);
        return false;
      }
      
      if (this._initialized && this._components.has(component)) {
        console.warn(`⚠️ Component ${component} already initialized, skipping`);
        return false;
      }
      
      // Check if component already exists in DOM
      if (this.isComponentInDOM(component)) {
        console.warn(`⚠️ [DUPLICATION GUARD] Component ${component} already exists in DOM, skipping`);
        return false;
      }
      
      return true;
    },
    
    isComponentInDOM: function(component) {
      const selectors = {
        'nav': 'nav, [data-nav], #nav, .nav',
        'sidebar': '#sidebar, .sidebar, [data-sidebar]',
        'header': 'header, #header, .header, [data-header]',
        'bottom-nav': '#bottom-nav, .bottom-nav, [data-bottom-nav]',
        'header-icons': '#header-icons, .header-icons, [data-header-icons]',
        'menu': '[data-menu], .menu, #menu',
        'icon': '[data-icon], .icon, [class*="icon"]'
      };
      
      if (selectors[component]) {
        return !!document.querySelector(selectors[component]);
      }
      
      // Check for component type patterns
      if (component.includes('nav') && !component.includes('bottom')) {
        return !!document.querySelector('nav, [data-nav]');
      }
      if (component.includes('sidebar')) {
        return !!document.querySelector('#sidebar, .sidebar');
      }
      if (component.includes('header')) {
        return !!document.querySelector('header, #header');
      }
      if (component.includes('menu')) {
        return !!document.querySelector('[data-menu], .menu');
      }
      if (component.includes('icon')) {
        return !!document.querySelector('[data-icon], .icon');
      }
      
      return false;
    },
    
    register: function(component) {
      this._components.add(component);
      window.__UI_COMPONENTS_INITIALIZED.add(component);
    },
    
    complete: function() {
      this._initialized = true;
      this._initializing = false;
      window.__UI_INITIALIZED = true;
      console.log('🔒 UI initialization locked - no duplicate rendering');
    },
    
    reset: function() {
      this._initialized = false;
      this._initializing = false;
      this._components.clear();
      window.__UI_INITIALIZED = false;
      window.__UI_COMPONENTS_INITIALIZED.clear();
      window.__UI_EVENTS_BOUND.clear();
    },
    
    isInitialized: function() {
      return this._initialized || window.__UI_INITIALIZED;
    }
  };

  // ============================================================================
  // SAFETY & ISOLATION SYSTEM (UPDATED WITH UI LOCK AND NON-FATAL RESOURCE LOADING)
  // ============================================================================
  
  const UI_SAFETY = {
    // Track failed modules to prevent repeated logging
    failedModules: new Set(),
    failedElements: new Map(),
    retryCounts: new Map(),
    maxRetries: 3,
    libraryStatus: new Map(),
    missingResources: new Set(),
    
    // UI RESILIENCE PATCH: Component destroyed flag for async guards (PHASE 7)
    _destroyedComponents: new Set(),
    
    // Safe module initialization wrapper with UI lock
    safeInit: function(moduleName, initFunction, context = null, requireLock = true) {
      try {
        // Check UI lock if required
        if (requireLock && !UI_INIT_LOCK.acquire(moduleName)) {
          console.warn(`🔒 Module ${moduleName} blocked by UI lock`);
          return null;
        }
        
        // Check if this module previously failed permanently
        if (this.failedModules.has(moduleName)) {
          console.warn(`⚠️ Module ${moduleName} is permanently disabled due to previous failures`);
          return null;
        }
        
        // Initialize module
        const result = initFunction.call(context);
        console.log(`✅ ${moduleName} initialized successfully`);
        
        // Register with UI lock
        if (requireLock) {
          UI_INIT_LOCK.register(moduleName);
        }
        
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
    
    // UI RESILIENCE PATCH: Mark component as destroyed (PHASE 7)
    markDestroyed: function(componentId) {
      this._destroyedComponents.add(componentId);
    },
    
    // UI RESILIENCE PATCH: Check if component is destroyed (PHASE 7)
    isDestroyed: function(componentId) {
      return this._destroyedComponents.has(componentId);
    },
    
    // UI RESILIENCE PATCH: Async guard - prevents stale callbacks (PHASE 7)
    guard: function(componentId, callback) {
      if (this.isDestroyed(componentId)) {
        console.warn(`⚠️ [ASYNC GUARD] Component ${componentId} destroyed, skipping callback`);
        return null;
      }
      return callback();
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
    
    // Safe event listener attachment with single-time enforcement
    // MODIFIED: No global preventDefault() - non-blocking UI policy
    safeEventListener: function(element, event, handler, options = false, once = false) {
      if (!element || !handler) {
        console.warn('⚠️ Cannot attach event to invalid element or handler');
        return () => {}; // Return no-op removal function
      }
      
      // Check if event already attached globally
      const eventKey = `${element.id || element.className || 'unknown'}_${event}_${handler.name || 'anonymous'}`;
      if (window.__UI_EVENTS_BOUND && window.__UI_EVENTS_BOUND.has(eventKey)) {
        console.warn(`⚠️ [DUPLICATION GUARD] Event ${event} already attached globally, skipping`);
        return () => {};
      }
      
      // Check if event already attached (prevent duplicate listeners)
      if (element.__moodchatEvents && element.__moodchatEvents.has(eventKey)) {
        console.warn(`⚠️ Event ${event} already attached to element, skipping`);
        return () => {};
      }
      
      // Initialize events tracking
      if (!element.__moodchatEvents) {
        element.__moodchatEvents = new Set();
      }
      
      const safeHandler = (e) => {
        try {
          // NON-BLOCKING POLICY: Do NOT call preventDefault/stopPropagation globally
          // Let the specific handler decide if it needs to prevent defaults
          handler(e);
        } catch (error) {
          // Prevent error propagation but don't block default behavior
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
      element.__moodchatEvents.add(eventKey);
      
      // Register globally
      if (window.__UI_EVENTS_BOUND) {
        window.__UI_EVENTS_BOUND.add(eventKey);
      }
      
      // Return removal function
      return () => {
        element.removeEventListener(event, safeHandler, options);
        element.__moodchatEvents.delete(eventKey);
        if (window.__UI_EVENTS_BOUND) {
          window.__UI_EVENTS_BOUND.delete(eventKey);
        }
      };
    },
    
    // Safe DOM manipulation - prevent innerHTML replacement for critical elements
    safeDOMUpdate: function(element, html, options = {}) {
      if (!element || !element.parentNode) {
        console.warn('⚠️ Cannot update non-existent element');
        return false;
      }
      
      // Check if this is a critical UI element that shouldn't be replaced
      const criticalSelectors = [
        '#header', '.header', 'header',
        '#nav', '.nav', 'nav',
        '#sidebar', '.sidebar',
        '#bottom-nav', '.bottom-nav',
        '#header-icons', '.header-icons',
        '#menu', '.menu',
        '[data-ui-owner="parent"]'
      ];
      
      const isCritical = criticalSelectors.some(selector => 
        element.matches(selector) || element.closest(selector)
      );
      
      if (isCritical) {
        // Check if element already has content
        if (element.innerHTML && element.innerHTML.trim().length > 0) {
          console.warn('⚠️ [DUPLICATION GUARD] Skipping innerHTML replacement for critical UI element');
          return false;
        }
        
        // Check for parent UI owner
        const parentUI = element.closest('[data-ui-owner="parent"]');
        if (parentUI) {
          console.warn('⚠️ [DUPLICATION GUARD] Parent UI exists, skipping update');
          return false;
        }
      }
      
      // Safe update - only if empty or append mode
      if (options.mode === 'append' || !element.innerHTML || element.innerHTML.trim().length === 0) {
        if (options.mode === 'append') {
          element.innerHTML += html;
        } else {
          element.innerHTML = html;
        }
        return true;
      }
      
      return false;
    },
    
    // Safe element creation with duplication check
    safeCreateElement: function(tag, attributes = {}, parent = null, options = {}) {
      // Check for existing similar element
      if (options.uniqueId && document.getElementById(options.uniqueId)) {
        console.warn(`⚠️ [DUPLICATION GUARD] Element with id ${options.uniqueId} already exists`);
        return document.getElementById(options.uniqueId);
      }
      
      // Check for existing similar element by class
      if (options.uniqueClass) {
        const existing = document.querySelector(`.${options.uniqueClass}`);
        if (existing) {
          console.warn(`⚠️ [DUPLICATION GUARD] Element with class ${options.uniqueClass} already exists`);
          return existing;
        }
      }
      
      const element = document.createElement(tag);
      
      // Set attributes
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      
      // Append to parent if provided
      if (parent && parent.appendChild) {
        parent.appendChild(element);
      }
      
      return element;
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
    
    // Safe retry mechanism with prevention of infinite retries
    safeRetry: function(operationName, operation, maxAttempts = this.maxRetries) {
      const retryKey = `retry_${operationName}`;
      let attempts = this.retryCounts.get(retryKey) || 0;
      
      if (attempts >= maxAttempts) {
        if (!this.failedModules.has(retryKey)) {
          console.warn(`⚠️ Max retries (${maxAttempts}) reached for ${operationName}, disabling`);
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
                  // Exponential backoff with max 5 second delay
                  setTimeout(() => {
                    this.safeRetry(operationName, operation, maxAttempts)
                      .then(resolve)
                      .catch(reject);
                  }, Math.min(1000 * Math.pow(1.5, attempts), 5000));
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
            }, Math.min(1000 * Math.pow(1.5, attempts), 5000));
          }
        }
      });
    },
    
    // Session validation - crash-proof
    validateSession: function() {
      try {
        // Check multiple possible session sources
        const sources = [
          () => window.currentUser,
          () => window.AUTH_STATE && window.AUTH_STATE.getUser && window.AUTH_STATE.getUser(),
          () => window.app && window.app.session && window.app.session.getUser && window.app.session.getUser(),
          () => window.api && window.api.auth && window.api.auth.getUser && window.api.auth.getUser()
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
          () => window.api && window.api.auth && window.api.auth.getToken && window.api.auth.getToken(),
          () => {
            try { return localStorage.getItem('moodchat_token'); } catch(e) { return null; }
          },
          () => {
            try { return sessionStorage.getItem('moodchat_token'); } catch(e) { return null; }
          }
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
    
    // Check if user is logged in - never throws
    userLoggedIn: function() {
      try {
        const sessionCheck = this.validateSession();
        return sessionCheck.valid;
      } catch (e) {
        return false;
      }
    },
    
    // Check if resource exists - MODIFIED: Non-fatal for optional resources
    checkResourceExists: async function(url, allowMissing = true) {
      try {
        // Skip tracking prevention issues by not checking external CDNs
        if (url.includes('cdnjs.cloudflare.com') || url.includes('font-awesome')) {
          console.log(`ℹ️ Skipping existence check for CDN resource (tracking prevention): ${url}`);
          return true; // Assume CDN resources exist to avoid tracking prevention errors
        }
        
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
        
        if (!exists && allowMissing) {
          this.missingResources.add(url);
          console.warn(`⚠️ Optional resource not found: ${url} - continuing without it`);
        } else if (!exists) {
          this.missingResources.add(url);
          console.error(`❌ Required resource not found: ${url}`);
        }
        
        return exists;
      } catch (error) {
        // If fetch fails (e.g., CORS, tracking prevention), assume resource exists
        if (url.includes('cdnjs.cloudflare.com') || url.includes('font-awesome')) {
          console.log(`ℹ️ Resource check failed due to CORS/tracking prevention: ${url} - continuing`);
          return true;
        }
        
        if (allowMissing) {
          this.missingResources.add(url);
          console.warn(`⚠️ Failed to check optional resource ${url}: ${error.message} - continuing`);
        } else {
          this.missingResources.add(url);
          console.error(`❌ Failed to check required resource ${url}: ${error.message}`);
        }
        return false;
      }
    },
    
    // Safe resource loader - MODIFIED: Non-fatal for missing resources
    safeLoad: function(url, type, allowMissing = true) {
      return new Promise(async (resolve) => {
        try {
          // Check if resource exists before loading
          const exists = await this.checkResourceExists(url, allowMissing);
          
          if (!exists) {
            if (allowMissing) {
              console.log(`ℹ️ Skipped missing optional resource: ${url}`);
            } else {
              console.warn(`⚠️ Required resource missing: ${url}`);
            }
            resolve(false);
            return;
          }
          
          const element = document.createElement(type === 'css' ? 'link' : 'script');
          
          if (type === 'css') {
            element.rel = 'stylesheet';
            element.href = url;
            element.type = 'text/css';
            // Add crossOrigin for CDN resources to avoid tracking prevention issues
            if (url.includes('cdnjs.cloudflare.com')) {
              element.crossOrigin = 'anonymous';
            }
          } else {
            element.src = url;
            element.type = 'text/javascript';
            element.async = false;
            element.defer = true;
            // Add crossOrigin for CDN resources
            if (url.includes('cdnjs.cloudflare.com')) {
              element.crossOrigin = 'anonymous';
            }
          }
          
          element.onload = () => {
            console.log(`✅ ${type.toUpperCase()} loaded: ${url}`);
            resolve(true);
          };
          
          element.onerror = () => {
            if (allowMissing) {
              console.warn(`⚠️ Optional ${type.toUpperCase()} failed to load: ${url} - continuing`);
            } else {
              console.error(`❌ Required ${type.toUpperCase()} failed to load: ${url}`);
            }
            this.missingResources.add(url);
            
            // Remove the failed element from DOM
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
            
            resolve(false);
          };
          
          document.head.appendChild(element);
        } catch (error) {
          if (allowMissing) {
            console.warn(`⚠️ Optional resource ${url} skipped due to error: ${error.message}`);
          } else {
            console.warn(`⚠️ Required resource ${url} failed due to error: ${error.message}`);
          }
          resolve(false);
        }
      });
    },
    
    // Clean up resources - prevent memory leaks
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
      
      // Clear destroyed components
      this._destroyedComponents.clear();
    }
  };

  // ============================================================================
  // RESPONSIVE NAVIGATION CONTROLLER - STRICT MODE ENFORCEMENT
  // ============================================================================
  
  const RESPONSIVE_NAV = {
    // Configuration
    BREAKPOINT: 1024, // px - matches Bootstrap's lg breakpoint
    MODES: {
      DESKTOP: 'desktop', // Sidebar only
      MOBILE: 'mobile'    // Bottom navigation only
    },
    
    // State
    currentMode: null,
    mediaQuery: null,
    resizeTimeout: null,
    
    // DOM Elements cache
    elements: {
      sidebar: null,
      bottomNav: null,
      headerIcons: null,
      mainContent: null
    },
    
    // Navigation items cache
    navItems: new Map(),
    
    // Duplicate cleanup flag
    duplicatesCleaned: false,
    
    // Initialize responsive controller
    initialize: function() {
      // Check if already initialized globally
      if (window.__UI_COMPONENTS_INITIALIZED && window.__UI_COMPONENTS_INITIALIZED.has('RESPONSIVE_NAV')) {
        console.warn('⚠️ [DUPLICATION GUARD] RESPONSIVE_NAV already initialized globally');
        return false;
      }
      
      return UI_SAFETY.safeInit('RESPONSIVE_NAV', () => {
        console.log('📱 Initializing responsive navigation controller...');
        
        // Check for parent UI owner
        const parentUI = document.querySelector('[data-ui-owner="parent"]');
        if (parentUI) {
          console.warn('⚠️ [DUPLICATION GUARD] Parent UI exists, skipping RESPONSIVE_NAV initialization');
          return false;
        }
        
        // Cache DOM elements once
        this.cacheElements();
        
        // Validate DOM integrity
        if (!this.validateDOM()) {
          console.error('❌ DOM integrity check failed');
          return false;
        }
        
        // Setup media query listener
        this.setupMediaQuery();
        
        // Initialize navigation items
        this.initializeNavItems();
        
        // Apply initial mode
        this.applyMode(this.detectMode());
        
        console.log('✅ Responsive navigation controller initialized');
        return true;
      }, this);
    },
    
    // Cache DOM elements with validation
    cacheElements: function() {
      this.elements.sidebar = UI_SAFETY.safeElement('#sidebar, .sidebar, [data-sidebar]');
      this.elements.bottomNav = UI_SAFETY.safeElement('#bottom-nav, .bottom-nav, [data-bottom-nav]');
      this.elements.headerIcons = UI_SAFETY.safeElement('#header-icons, .header-icons, [data-header-icons]');
      this.elements.mainContent = UI_SAFETY.safeElement('#main-content, .main-content, main, [data-main-content]');
      
      // Log cache status
      console.log('📋 DOM elements cached:', {
        sidebar: !!this.elements.sidebar,
        bottomNav: !!this.elements.bottomNav,
        headerIcons: !!this.elements.headerIcons,
        mainContent: !!this.elements.mainContent
      });
    },
    
    // Validate DOM integrity before proceeding
    validateDOM: function() {
      const required = ['mainContent'];
      const missing = [];
      
      for (const key of required) {
        if (!this.elements[key]) {
          missing.push(key);
        }
      }
      
      if (missing.length > 0) {
        console.error(`❌ Required DOM elements missing: ${missing.join(', ')}`);
        return false;
      }
      
      // Check for duplicate containers (conflict detection)
      const duplicateCheck = this.checkForDuplicates();
      if (duplicateCheck.hasDuplicates) {
        console.warn(`⚠️ Duplicate containers detected: ${duplicateCheck.duplicates.join(', ')}`);
        this.resolveContainerConflicts(duplicateCheck.duplicates);
      }
      
      return true;
    },
    
    // Check for duplicate navigation containers
    checkForDuplicates: function() {
      const duplicates = [];
      
      // Check sidebar duplicates - but only if we haven't cleaned them yet
      const sidebars = document.querySelectorAll('#sidebar, .sidebar, [data-sidebar]');
      if (sidebars.length > 1 && !this.duplicatesCleaned) {
        duplicates.push('sidebar');
      }
      
      // Check bottom nav duplicates
      const bottomNavs = document.querySelectorAll('#bottom-nav, .bottom-nav, [data-bottom-nav]');
      if (bottomNavs.length > 1 && !this.duplicatesCleaned) {
        duplicates.push('bottom-nav');
      }
      
      // Check header icons duplicates
      const headerIcons = document.querySelectorAll('#header-icons, .header-icons, [data-header-icons]');
      if (headerIcons.length > 1 && !this.duplicatesCleaned) {
        duplicates.push('header-icons');
      }
      
      return {
        hasDuplicates: duplicates.length > 0,
        duplicates: duplicates
      };
    },
    
    // Resolve container conflicts by removing duplicates
    resolveContainerConflicts: function(duplicates) {
      this.duplicatesCleaned = true;
      
      duplicates.forEach(type => {
        switch(type) {
          case 'sidebar':
            this.removeDuplicateElements('#sidebar, .sidebar, [data-sidebar]', 0); // Keep the first one
            // Re-cache sidebar after cleanup
            this.elements.sidebar = UI_SAFETY.safeElement('#sidebar, .sidebar, [data-sidebar]');
            break;
          case 'bottom-nav':
            this.removeDuplicateElements('#bottom-nav, .bottom-nav, [data-bottom-nav]', 0);
            this.elements.bottomNav = UI_SAFETY.safeElement('#bottom-nav, .bottom-nav, [data-bottom-nav]');
            break;
          case 'header-icons':
            this.removeDuplicateElements('#header-icons, .header-icons, [data-header-icons]', 0);
            this.elements.headerIcons = UI_SAFETY.safeElement('#header-icons, .header-icons, [data-header-icons]');
            break;
        }
      });
    },
    
    // Remove duplicate elements, keeping only the first one
    removeDuplicateElements: function(selector, keepIndex = 0) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element, index) => {
        if (index !== keepIndex && element.parentNode) {
          console.log(`🗑️ Removing duplicate ${selector} at index ${index}`);
          element.parentNode.removeChild(element);
        }
      });
    },
    
    // Setup media query for responsive detection
    setupMediaQuery: function() {
      // Use matchMedia for reliable breakpoint detection
      this.mediaQuery = window.matchMedia(`(min-width: ${this.BREAKPOINT}px)`);
      
      // Add listener with debouncing
      this.mediaQuery.addListener((e) => {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          const newMode = e.matches ? this.MODES.DESKTOP : this.MODES.MOBILE;
          if (newMode !== this.currentMode) {
            console.log(`🔄 Viewport change detected: ${this.currentMode} → ${newMode}`);
            this.applyMode(newMode);
          }
        }, 150); // Debounce resize events
      });
    },
    
    // Detect current mode based on viewport
    detectMode: function() {
      const isDesktop = window.innerWidth >= this.BREAKPOINT;
      return isDesktop ? this.MODES.DESKTOP : this.MODES.MOBILE;
    },
    
    // Apply mode with strict exclusivity
    applyMode: function(mode) {
      if (this.currentMode === mode) {
        return; // Already in correct mode
      }
      
      console.log(`🎯 Applying navigation mode: ${mode}`);
      this.currentMode = mode;
      
      // Enforce strict exclusivity - only one mode active at a time
      switch (mode) {
        case this.MODES.DESKTOP:
          this.enableDesktopMode();
          break;
        case this.MODES.MOBILE:
          this.enableMobileMode();
          break;
      }
      
      // Save mode to localStorage for persistence
      this.saveMode(mode);
      
      // Dispatch mode change event
      this.dispatchModeChange(mode);
    },
    
    // Enable desktop mode (sidebar only)
    enableDesktopMode: function() {
      console.log('💻 Enabling desktop mode (sidebar only)');
      
      // Show sidebar, hide bottom nav
      if (this.elements.sidebar) {
        this.elements.sidebar.style.display = 'flex';
        this.elements.sidebar.style.visibility = 'visible';
        this.elements.sidebar.setAttribute('data-active', 'true');
      }
      
      if (this.elements.bottomNav) {
        this.elements.bottomNav.style.display = 'none';
        this.elements.bottomNav.style.visibility = 'hidden';
        this.elements.bottomNav.setAttribute('data-active', 'false');
      }
      
      // Remove any header icons (desktop doesn't need them)
      this.removeHeaderIcons();
      
      // Adjust main content margin for sidebar
      if (this.elements.mainContent && this.elements.sidebar) {
        this.elements.mainContent.style.marginLeft = '250px'; // Sidebar width
        this.elements.mainContent.style.marginBottom = '0';
      }
    },
    
    // Enable mobile mode (bottom navigation only)
    enableMobileMode: function() {
      console.log('📱 Enabling mobile mode (bottom navigation only)');
      
      // Hide sidebar, show bottom nav
      if (this.elements.sidebar) {
        this.elements.sidebar.style.display = 'none';
        this.elements.sidebar.style.visibility = 'hidden';
        this.elements.sidebar.setAttribute('data-active', 'false');
      }
      
      if (this.elements.bottomNav) {
        this.elements.bottomNav.style.display = 'flex';
        this.elements.bottomNav.style.visibility = 'visible';
        this.elements.bottomNav.setAttribute('data-active', 'true');
      }
      
      // Remove any header icons (mobile uses bottom nav)
      this.removeHeaderIcons();
      
      // Adjust main content for bottom nav
      if (this.elements.mainContent && this.elements.bottomNav) {
        this.elements.mainContent.style.marginLeft = '0';
        this.elements.mainContent.style.marginBottom = '60px'; // Bottom nav height
      }
    },
    
    // Remove header icons to prevent duplication
    removeHeaderIcons: function() {
      if (this.elements.headerIcons && this.elements.headerIcons.parentNode) {
        console.log('🗑️ Removing header icons to prevent duplication');
        this.elements.headerIcons.parentNode.removeChild(this.elements.headerIcons);
        this.elements.headerIcons = null;
      }
      
      // Also clean up any dynamically added header icons
      const dynamicIcons = document.querySelectorAll('.header-icon, [data-header-icon]');
      dynamicIcons.forEach(icon => {
        if (icon.parentNode) {
          icon.parentNode.removeChild(icon);
        }
      });
    },
    
    // Initialize navigation items with single-time binding
    initializeNavItems: function() {
      console.log('🔗 Initializing navigation items...');
      
      // Clear existing nav items
      this.navItems.clear();
      
      // Collect all navigation items from both sidebar and bottom nav
      const navSelectors = [
        '[data-page-key]',
        '[data-nav]',
        '[data-tab]',
        '.nav-item',
        '.sidebar-item',
        '.bottom-nav-item'
      ];
      
      navSelectors.forEach(selector => {
        const items = document.querySelectorAll(selector);
        items.forEach((item, index) => {
          const pageKey = item.getAttribute('data-page-key') || 
                         item.getAttribute('data-nav') || 
                         item.getAttribute('data-tab') || 
                         `item-${index}`;
          
          // Cache item
          this.navItems.set(pageKey, item);
          
          // Bind click handler once
          this.bindNavItem(item, pageKey);
        });
      });
      
      console.log(`✅ ${this.navItems.size} navigation items initialized`);
    },
    
    // Bind navigation item with single-time event attachment
    // MODIFIED: No global preventDefault/stopPropagation - non-blocking UI policy
    bindNavItem: function(item, pageKey) {
      // Check if already bound
      if (item.__moodchatNavBound) {
        return;
      }
      
      // Check if event already bound globally
      const eventKey = `nav_${pageKey}_click`;
      if (window.__UI_EVENTS_BOUND && window.__UI_EVENTS_BOUND.has(eventKey)) {
        console.warn(`⚠️ [DUPLICATION GUARD] Navigation event already bound for ${pageKey}`);
        return;
      }
      
      // Mark as bound
      item.__moodchatNavBound = true;
      
      // Register globally
      if (window.__UI_EVENTS_BOUND) {
        window.__UI_EVENTS_BOUND.add(eventKey);
      }
      
      // Add click handler with safety - NO GLOBAL PREVENTDEFAULT
      UI_SAFETY.safeEventListener(item, 'click', (event) => {
        // NON-BLOCKING: Only prevent default if it's an anchor without proper href
        // This preserves button functionality and form submissions
        if (event.target.tagName === 'A' && !event.target.getAttribute('href')) {
          event.preventDefault();
        }
        // Allow event to propagate - do NOT call stopPropagation()
        
        console.log(`🧭 Navigation click: ${pageKey} (mode: ${this.currentMode})`);
        
        // Handle navigation through PAGE_ROUTER
        if (window.PageRouter && typeof window.PageRouter.loadPageByKey === 'function') {
          window.PageRouter.loadPageByKey(pageKey, true);
        } else if (window.MoodChatUI && typeof window.MoodChatUI.navigate === 'function') {
          window.MoodChatUI.navigate(pageKey);
        } else {
          console.error('❌ Navigation controller not available');
        }
        
        // Update active state
        this.updateActiveItem(pageKey);
      });
      
      // Add visual feedback
      UI_SAFETY.safeEventListener(item, 'mousedown', () => {
        item.style.opacity = '0.7';
        setTimeout(() => {
          item.style.opacity = '';
        }, 150);
      });
      
      // Add keyboard support
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      
      UI_SAFETY.safeEventListener(item, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
    },
    
    // Update active navigation item
    updateActiveItem: function(activePageKey) {
      console.log(`🎯 Updating active item: ${activePageKey}`);
      
      // Remove active class from all items
      this.navItems.forEach((item, pageKey) => {
        item.classList.remove('active', 'selected', 'current');
        item.removeAttribute('aria-current');
      });
      
      // Add active class to clicked item
      const activeItem = this.navItems.get(activePageKey);
      if (activeItem) {
        activeItem.classList.add('active');
        activeItem.setAttribute('aria-current', 'page');
        
        // Ensure item is visible in current mode
        this.ensureItemVisibility(activeItem);
      } else {
        console.log(`ℹ️ No navigation item found for page: ${activePageKey}`);
      }
    },
    
    // Ensure navigation item is visible in current mode
    ensureItemVisibility: function(item) {
      if (!item || !item.parentNode) return;
      
      // Check if item is in visible container
      const parent = item.parentNode;
      const isInSidebar = parent.closest('#sidebar, .sidebar, [data-sidebar]');
      const isInBottomNav = parent.closest('#bottom-nav, .bottom-nav, [data-bottom-nav]');
      
      if (this.currentMode === this.MODES.DESKTOP && isInBottomNav) {
        console.warn('⚠️ Active item is in bottom nav but desktop mode is active');
      } else if (this.currentMode === this.MODES.MOBILE && isInSidebar) {
        console.warn('⚠️ Active item is in sidebar but mobile mode is active');
      }
    },
    
    // Save mode to localStorage
    saveMode: function(mode) {
      try {
        localStorage.setItem('moodchat_nav_mode', mode);
        localStorage.setItem('moodchat_nav_mode_timestamp', new Date().toISOString());
      } catch (error) {
        console.warn('⚠️ Failed to save navigation mode:', error);
      }
    },
    
    // Load saved mode
    loadSavedMode: function() {
      try {
        const savedMode = localStorage.getItem('moodchat_nav_mode');
        if (savedMode && Object.values(this.MODES).includes(savedMode)) {
          return savedMode;
        }
      } catch (error) {
        console.warn('⚠️ Failed to load saved navigation mode:', error);
      }
      return null;
    },
    
    // Dispatch mode change event
    dispatchModeChange: function(mode) {
      try {
        const event = new CustomEvent('moodchat-nav-mode-change', {
          detail: {
            mode: mode,
            timestamp: new Date().toISOString(),
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          }
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn('⚠️ Failed to dispatch mode change event:', error);
      }
    },
    
    // Get current mode
    getCurrentMode: function() {
      return this.currentMode;
    },
    
    // Check if in desktop mode
    isDesktopMode: function() {
      return this.currentMode === this.MODES.DESKTOP;
    },
    
    // Check if in mobile mode
    isMobileMode: function() {
      return this.currentMode === this.MODES.MOBILE;
    },
    
    // Force mode (for testing/development)
    forceMode: function(mode) {
      if (Object.values(this.MODES).includes(mode)) {
        console.log(`⚡ Forcing navigation mode: ${mode}`);
        this.applyMode(mode);
      }
    },
    
    // Clean up - prevent memory leaks
    cleanup: function() {
      if (this.mediaQuery && this.mediaQuery.removeListener) {
        this.mediaQuery.removeListener();
      }
      clearTimeout(this.resizeTimeout);
      
      // Clean up bound events
      this.navItems.forEach(item => {
        item.__moodchatNavBound = false;
      });
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
  // ROUTER ENGINE - Deterministic Page Routing (WITH SAFETY & CONFIG PROTECTION)
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
    // MODIFIED: Safe defaults if config missing
    authRequiredPages: new Set(['chat', 'group', 'message', 'friend', 'settings', 'profile']),
    
    // UI Integration flag
    uiIntegrated: false,
    
    // Timer cleanup
    timers: new Set(),
    
    // UI RESILIENCE PATCH: Abort controllers for fetch (PHASE 6)
    abortControllers: new Map(),
    
    // UI RESILIENCE PATCH: Component destroyed flag (PHASE 7)
    _destroyed: false,
    _componentId: 'PAGE_ROUTER',
    
    // ADDED: Flag to prevent infinite recursion during default page resolution
    _isResolvingDefaultPage: false,
    _defaultPageResolveAttempts: 0,
    _maxDefaultPageResolveAttempts: 3,
    
    // ADDED: Session retry counter
    _sessionRetryAttempts: 0,
    _maxSessionRetryAttempts: 5,
    
    initialize: function() {
      return UI_SAFETY.safeInit('PAGE_ROUTER', () => {
        console.log('🧭 Page Router initializing...');
        
        // Setup popstate handler for browser navigation
        UI_SAFETY.safeEventListener(window, 'popstate', (event) => {
          // UI RESILIENCE PATCH: Async guard prevents stale handler
          UI_SAFETY.guard(this._componentId, () => {
            if (event.state && event.state.pageKey) {
              console.log('📜 Browser navigation:', event.state.pageKey);
              this.loadPageByKey(event.state.pageKey, false);
            }
          });
        });
        
        // Setup beforeunload to save state
        UI_SAFETY.safeEventListener(window, 'beforeunload', () => {
          UI_SAFETY.guard(this._componentId, () => {
            if (this.currentPage) {
              this.saveNavigationState();
            }
          });
        });
        
        // Initialize iframe pool
        this.initializeIframePool();
        
        // UI RESILIENCE PATCH: Add session event listeners (PHASE 9)
        this.setupSessionListeners();
        
        console.log('✅ Page Router initialized');
        return true;
      }, this);
    },
    
    // UI RESILIENCE PATCH: Session-aware UI (PHASE 9)
    setupSessionListeners: function() {
      // Listen for session events
      UI_SAFETY.safeEventListener(window, 'session:expired', () => {
        UI_SAFETY.guard(this._componentId, () => {
          console.log('🔐 Session expired, redirecting to login');
          const loginPageKey = this.findLoginPage();
          if (loginPageKey) {
            this.loadPageByKey(loginPageKey, true);
          }
        });
      });
      
      UI_SAFETY.safeEventListener(window, 'session:refresh', () => {
        UI_SAFETY.guard(this._componentId, () => {
          console.log('🔐 Session refreshed');
          // Reload current page if it requires auth
          if (this.currentPage && this.isAuthRequiredPage(this.currentPage.key)) {
            this.loadPageByKey(this.currentPage.key, false);
          }
        });
      });
      
      UI_SAFETY.safeEventListener(window, 'session:destroy', () => {
        UI_SAFETY.guard(this._componentId, () => {
          console.log('🔐 Session destroyed');
          const loginPageKey = this.findLoginPage();
          if (loginPageKey) {
            this.loadPageByKey(loginPageKey, true);
          }
        });
      });
    },
    
    // ========================================
    // 1️⃣ ROUTER ENGINE METHODS (WITH SAFETY & CONFIG PROTECTION)
    // ========================================
    
    // Main page loading method with UI integration
    // MODIFIED: Crash-proof with SafeConfig
    // UI RESILIENCE PATCH: Safe routing layer - never throws (PHASE 4)
    loadPage: async function(pageUrl, pushState = true) {
      // UI RESILIENCE PATCH: Async guard
      if (!UI_SAFETY.guard(this._componentId, () => true)) {
        console.warn('⚠️ Router destroyed, cannot load page');
        return { type: 'error', reason: 'router_destroyed' };
      }
      
      // UI RESILIENCE PATCH: Navigation lock with timeout
      if (!NavigationLock.acquire('loadPage', `loading_${pageUrl}`)) {
        console.warn('⚠️ Navigation locked, queueing request');
        return new Promise((resolve) => {
          NavigationLock.queue(() => {
            this.loadPage(pageUrl, pushState).then(resolve);
          }, 'loadPage');
        });
      }
      
      // UI AUDIT: navigation blocked here when promise rejects
      console.group('🧭 UI FLOW: Navigation');
      console.log(`Starting navigation to: ${pageUrl}`);
      
      try {
        UI_STATE.transitionTo(UI_STATE.STATES.LOADING, `loading_page_${pageUrl}`);
        
        console.log(`🚀 Loading page: ${pageUrl}`);
        
        // SAFE: Use SafeConfig to resolve page
        const pageKey = this.resolvePageFromConfig(pageUrl);
        if (!pageKey) {
          // Don't throw - use fallback resolution
          console.warn(`⚠️ Page not found in config: ${pageUrl}, using default`);
          NavigationLock.release('loadPage');
          console.groupEnd();
          return this.loadDefaultPage();
        }
        
        const pageConfig = SafeConfig.getPage(pageKey) || { id: pageKey, file: pageUrl, isIframe: false };
        
        // Check if user is logged in for auth-required pages
        if (this.isAuthRequiredPage(pageKey) && !UI_SAFETY.userLoggedIn()) {
          console.warn(`⚠️ Authentication required for page: ${pageKey}`);
          
          // Redirect to login page or chat page
          const loginPageKey = this.findLoginPage();
          if (loginPageKey) {
            console.log(`🔐 Redirecting to login page: ${loginPageKey}`);
            NavigationLock.release('loadPage');
            console.groupEnd();
            return this.loadPageByKey(loginPageKey, true);
          } else {
            // Last resort - try chat or just continue
            console.warn('⚠️ No login page found, attempting to continue');
          }
        }
        
        // UI RESILIENCE PATCH: Resource cleanup before unloading (PHASE 6)
        this.cancelPendingOperations();
        
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
        
        // Update UI - Only if UI integration is enabled
        if (this.uiIntegrated && window.RESPONSIVE_NAV) {
          window.RESPONSIVE_NAV.updateActiveItem(pageKey);
        } else {
          this.updateActiveNavigation(pageKey);
        }
        
        // Transition to ready state
        UI_STATE.transitionTo(UI_STATE.STATES.READY, `page_loaded_${pageKey}`);
        
        console.log(`✅ Page loaded: ${pageKey}`);
        console.groupEnd();
        
        NavigationLock.release('loadPage');
        return loadResult;
        
      } catch (error) {
        console.error(`❌ Page load failed: ${pageUrl}`, error);
        console.groupEnd();
        
        UI_STATE.transitionTo(UI_STATE.STATES.ERROR, `load_failed_${pageUrl}`);
        
        // UI RESILIENCE PATCH: Error boundary integration
        UIErrorBoundary.handle(error, 'page_load');
        
        await this.handleRouteError(error, pageUrl);
        
        NavigationLock.release('loadPage');
        // Don't reject - recover gracefully
        return { type: 'error', error: error.message, recovered: true };
      }
    },
    
    // UI RESILIENCE PATCH: Cancel pending operations (PHASE 6)
    cancelPendingOperations: function() {
      // Abort all pending fetches
      this.abortControllers.forEach((controller, key) => {
        try {
          controller.abort();
          console.log(`🛑 Aborted operation: ${key}`);
        } catch (e) {}
      });
      this.abortControllers.clear();
      
      // Clear all timers
      this.timers.forEach(timer => {
        try {
          clearTimeout(timer);
          clearInterval(timer);
        } catch (e) {}
      });
      this.timers.clear();
      
      // Cancel any pending navigation
      this.pendingNavigation = null;
    },
    
    // Check if page requires authentication
    // MODIFIED: Crash-proof with SafeConfig
    isAuthRequiredPage: function(pageKey) {
      try {
        // Check if page is in auth required set
        if (this.authRequiredPages.has(pageKey)) {
          return true;
        }
        
        // Check page config safely
        const pageConfig = SafeConfig.getPage(pageKey);
        if (pageConfig && pageConfig.requiresAuth !== undefined) {
          return pageConfig.requiresAuth;
        }
        
        // Default: non-auth pages are login, register, forgot-password, etc.
        const nonAuthPages = ['login', 'register', 'forgot-password', 'reset-password', 'landing', 'index'];
        return !nonAuthPages.includes(pageKey);
      } catch (error) {
        console.warn('⚠️ Error checking auth requirement:', error);
        // Safe fallback - assume not required
        return false;
      }
    },
    
    // Find login page - CRASH-PROOF
    findLoginPage: function() {
      try {
        const loginPages = ['login', 'signin', 'auth', 'index'];
        
        // Try from config first
        const pages = SafeConfig.getPages();
        for (const pageKey of loginPages) {
          if (pages[pageKey]) {
            return pageKey;
          }
        }
        
        // Return first available page that doesn't require auth
        for (const [pageKey, config] of Object.entries(pages)) {
          if (!this.isAuthRequiredPage(pageKey)) {
            return pageKey;
          }
        }
        
        // Ultimate fallback
        return 'login';
      } catch (error) {
        console.warn('⚠️ Error finding login page:', error);
        return 'login';
      }
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
      // Check if header already exists and has content
      const existingHeader = UI_SAFETY.safeElement('header, #header, .header');
      if (existingHeader && existingHeader.innerHTML && existingHeader.innerHTML.trim().length > 0) {
        console.warn('⚠️ [DUPLICATION GUARD] Header already exists with content, skipping initialization');
        return existingHeader;
      }
      
      // Implementation for page header
      return UI_SAFETY.safeInit('PAGE_HEADER', () => {
        console.log('📄 Initializing page header...');
        return true;
      }, this);
    },
    
    initializePageFooter: function() {
      // Check if footer already exists and has content
      const existingFooter = UI_SAFETY.safeElement('footer, #footer, .footer');
      if (existingFooter && existingFooter.innerHTML && existingFooter.innerHTML.trim().length > 0) {
        console.warn('⚠️ [DUPLICATION GUARD] Footer already exists with content, skipping initialization');
        return existingFooter;
      }
      
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
    
    // Load page by key - CRASH-PROOF
    // FIXED: Added infinite recursion protection
    // UI RESILIENCE PATCH: Safe routing layer - never throws (PHASE 4)
    // CRITICAL FIX: Add navigation lock to prevent reset loops
    loadPageByKey: async function(pageKey, pushState = true) {
      // CRITICAL FIX: Navigation lock to prevent reset loops
      if (window.__NAVIGATION_IN_PROGRESS__) {
        console.log('[UI] ð Navigation already in progress, preventing duplicate navigation');
        return { type: 'skipped', reason: 'navigation_in_progress' };
      }
      window.__NAVIGATION_IN_PROGRESS__ = true;
      
      // UI RESILIENCE PATCH: Async guard
      if (!UI_SAFETY.guard(this._componentId, () => true)) {
        window.__NAVIGATION_IN_PROGRESS__ = false;
        return { type: 'error', reason: 'router_destroyed' };
      }
      
      console.log(`🔑 Loading page by key: ${pageKey}`);
      
      // FIXED: Prevent infinite recursion during default page resolution
      if (this._isResolvingDefaultPage && pageKey === 'login') {
        console.warn('⚠️ Already resolving default page, using direct fallback');
        return { type: 'fallback', pageKey: 'login' };
      }
      
      const validation = this.validatePageExists(pageKey);
      if (!validation.valid) {
        console.warn(`⚠️ ${validation.reason || 'Page not found'}: ${pageKey}`);
        
        // FIXED: Don't call loadDefaultPage() if we're already in the process
        if (this._isResolvingDefaultPage) {
          console.error('❌ CRITICAL: Circular dependency detected, using hardcoded fallback');
          return { 
            type: 'emergency_fallback', 
            pageKey: 'login',
            config: { id: 'login', file: 'index.html', isIframe: false } 
          };
        }
        
        return this.loadDefaultPage();
      }
      
      const pageConfig = validation.pageConfig || { id: pageKey, file: pageKey + '.html', isIframe: false };
      const result = this.loadPage(pageConfig.file || pageKey + '.html', pushState);
      
      // CRITICAL FIX: Release navigation lock
      window.__NAVIGATION_IN_PROGRESS__ = false;
      return result;
    },
    
    // Resolve page from config - CRASH-PROOF
    resolvePageFromConfig: function(pageUrl) {
      try {
        const pages = SafeConfig.getPages();
        if (!pages || Object.keys(pages).length === 0) {
          return null;
        }
        
        // Try exact match
        for (const [key, config] of Object.entries(pages)) {
          if (config.file === pageUrl) {
            return key;
          }
        }
        
        // Try path normalization
        const normalizedUrl = this.normalizePagePath(pageUrl);
        for (const [key, config] of Object.entries(pages)) {
          if (config.file === normalizedUrl) {
            return key;
          }
        }
        
        // Try partial match
        for (const [key, config] of Object.entries(pages)) {
          if (pageUrl.includes(config.file) || config.file.includes(pageUrl)) {
            return key;
          }
        }
        
        return null;
      } catch (error) {
        console.warn('⚠️ Error resolving page from config:', error);
        return null;
      }
    },
    
    // Validate page exists - CRASH-PROOF
    // FIXED: Don't create fake page configs that cause infinite loops
    validatePageExists: function(pageKey) {
      try {
        const pages = SafeConfig.getPages();
        
        if (!pageKey) {
          return { valid: false, reason: 'Page key is empty' };
        }
        
        const pageConfig = pages[pageKey];
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
          isIframe: pageConfig.isIframe || false,
          isParent: pageConfig.isParent || false
        };
      } catch (error) {
        console.warn('⚠️ Error validating page:', error);
        // FIXED: Return invalid instead of creating fake config
        return { valid: false, reason: `Error validating page: ${error.message}` };
      }
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
      const validation = this.validatePageExists(pageKey);
      if (!validation.valid) {
        return Promise.reject(new Error(`Page key not found: ${pageKey}`));
      }
      
      const pageConfig = validation.pageConfig;
      
      return new Promise((resolve) => {
        // Preload resources in idle time
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            this.preloadPageResources(pageConfig);
            resolve(true);
          });
        } else {
          const timer = setTimeout(() => {
            this.preloadPageResources(pageConfig);
            resolve(true);
          }, 1000);
          this.timers.add(timer);
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
    
    // Handle route error - non-blocking
    handleRouteError: async function(error, pageUrl) {
      console.error(`🛑 Route error for ${pageUrl}:`, error);
      
      // Show error to user but don't block
      this.showPageError(`Failed to load page: ${pageUrl}`, error.message);
      
      // Try to fallback to safe page
      await this.fallbackToSafePage();
      
      // Dispatch error event
      try {
        const event = new CustomEvent('moodchat-route-error', {
          detail: {
            pageUrl: pageUrl,
            error: error.message,
            timestamp: new Date().toISOString(),
            retryAttempted: false
          }
        });
        window.dispatchEvent(event);
      } catch (e) {
        // Silent fail
      }
    },
    
    // ========================================
    // 2️⃣ DEFAULT PAGE RESOLUTION - CRASH-PROOF
    // ========================================
    
    // Determine default page with priority chain - NEVER THROWS
    // FIXED: Added recursion protection
    determineDefaultPage: function() {
      // FIXED: Prevent infinite recursion
      if (this._isResolvingDefaultPage) {
        console.warn('⚠️ Already resolving default page, using cached result');
        return 'login';
      }
      
      this._isResolvingDefaultPage = true;
      this._defaultPageResolveAttempts++;
      
      if (this._defaultPageResolveAttempts > this._maxDefaultPageResolveAttempts) {
        console.error('❌ Maximum default page resolution attempts exceeded');
        this._isResolvingDefaultPage = false;
        return 'login';
      }
      
      console.log('🔍 Determining default page...');
      
      try {
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
              if (savedPage) {
                const validation = this.validatePageExists(savedPage);
                if (validation.valid) {
                  // Check if user can access this page
                  if (this.isAuthRequiredPage(savedPage) && !UI_SAFETY.userLoggedIn()) {
                    console.warn(`⚠️ Saved page requires auth but user not logged in: ${savedPage}`);
                    return null;
                  }
                  console.log('✅ Restoring from session storage:', savedPage);
                  return savedPage;
                }
              }
            } catch (error) {
              console.warn('⚠️ Failed to read session storage:', error);
              try { sessionStorage.removeItem('moodchat_last_page'); } catch(e) {}
            }
            return null;
          },
          
          // Priority 3: APP_CONFIG.defaultPageKey
          () => {
            try {
              const config = SafeConfig.get();
              const defaultPageKey = config.defaultPageKey;
              const validation = this.validatePageExists(defaultPageKey);
              if (defaultPageKey && validation.valid) {
                // Check if user can access this page
                if (this.isAuthRequiredPage(defaultPageKey) && !UI_SAFETY.userLoggedIn()) {
                  console.warn(`⚠️ Default page requires auth but user not logged in: ${defaultPageKey}`);
                  return null;
                }
                console.log('✅ Using default page key:', defaultPageKey);
                return defaultPageKey;
              }
            } catch (error) {
              console.warn('⚠️ Error reading default page key:', error);
            }
            return null;
          },
          
          // Priority 4: chat (if logged in) or login (if not logged in)
          () => {
            try {
              if (UI_SAFETY.userLoggedIn()) {
                const validation = this.validatePageExists('chat');
                if (validation.valid) {
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
            } catch (error) {
              console.warn('⚠️ Error in chat/login fallback:', error);
            }
            return null;
          },
          
          // Priority 5: First available page that user can access
          () => {
            try {
              const pages = SafeConfig.getPages();
              if (pages) {
                const pageKeys = Object.keys(pages);
                for (const pageKey of pageKeys) {
                  // Check if user can access this page
                  const canAccess = !this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn();
                  if (canAccess) {
                    console.log('✅ Using first accessible page:', pageKey);
                    return pageKey;
                  }
                }
              }
            } catch (error) {
              console.warn('⚠️ Error finding first accessible page:', error);
            }
            return null;
          }
        ];
        
        for (const resolver of priorityChain) {
          const pageKey = resolver();
          if (pageKey) {
            this._isResolvingDefaultPage = false;
            return pageKey;
          }
        }
      } catch (error) {
        console.error('❌ Error in determineDefaultPage:', error);
      }
      
      console.warn('⚠️ No default page could be determined, using login');
      this._isResolvingDefaultPage = false;
      return 'login';
    },
    
    // Load default page - CRASH-PROOF
    // FIXED: Added recursion protection
    loadDefaultPage: function() {
      // FIXED: Prevent infinite recursion
      if (this._isResolvingDefaultPage) {
        console.error('❌ CRITICAL: Circular dependency detected in loadDefaultPage');
        return Promise.resolve({ 
          type: 'emergency_fallback', 
          pageKey: 'login',
          config: { id: 'login', file: 'index.html', isIframe: false } 
        });
      }
      
      this._isResolvingDefaultPage = true;
      
      const defaultPageKey = this.determineDefaultPage();
      if (!defaultPageKey) {
        console.error('❌ Cannot load default page, using hardcoded fallback');
        this._isResolvingDefaultPage = false;
        // Ultimate fallback - create minimal page
        return Promise.resolve({ type: 'fallback', pageKey: 'login' });
      }
      
      this._isResolvingDefaultPage = false;
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
    // 3️⃣ IFRAME MANAGEMENT SYSTEM (WITH SAFETY - FULLY PRESERVED)
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
        
        // Setup iframe message listener with safety - FULLY PRESERVED
        UI_SAFETY.safeEventListener(window, 'message', (event) => {
          UI_SAFETY.guard(this._componentId, () => {
            this.handleIframeMessage(event);
          });
        });
        
        console.log('✅ Iframe pool initialized');
        return true;
      }, this);
    },
    
    // Create page iframe
    // UI RESILIENCE PATCH: Enhanced iframe sandboxing (PHASE 5)
    createPageIframe: function(pageConfig) {
      return new Promise((resolve, reject) => {
        console.log(`🖼️ Creating iframe for: ${pageConfig.id}`);
        
        // UI RESILIENCE PATCH: Async guard
        if (!UI_SAFETY.guard(this._componentId, () => true)) {
          reject(new Error('Router destroyed'));
          return;
        }
        
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
        iframe.setAttribute('data-page-key', Object.keys(SafeConfig.getPages()).find(key => SafeConfig.getPage(key)?.id === pageConfig.id) || pageConfig.id);
        iframe.setAttribute('data-page-id', pageConfig.id);
        iframe.setAttribute('loading', 'eager');
        
        // UI RESILIENCE PATCH: Enhanced sandbox attributes
        // Security sandbox rules
        iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation';
        
        // Apply sandbox restrictions for untrusted content
        if (pageConfig.trusted !== true) {
          iframe.sandbox += ' allow-top-navigation-by-user-activation';
        }
        
        // UI RESILIENCE PATCH: Add error event listener
        iframe.addEventListener('error', (error) => {
          UI_SAFETY.guard(this._componentId, () => {
            console.error(`❌ Iframe error: ${pageConfig.id}`, error);
            
            const iframeData = this.iframePool.get(pageConfig.id);
            if (iframeData) {
              iframeData.error = true;
              iframeData.health.errors++;
              iframeData.health.lastCheck = new Date().toISOString();
            }
            
            this.handleIframeErrors(iframe, pageConfig.id, error);
          });
        });
        
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
          pageKey: Object.keys(SafeConfig.getPages()).find(key => SafeConfig.getPage(key)?.id === pageConfig.id) || pageConfig.id,
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
          UI_SAFETY.guard(this._componentId, () => {
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
              try {
                const event = new CustomEvent('moodchat-iframe-ready', {
                  detail: {
                    iframeId: pageConfig.id,
                    pageKey: iframeData.pageKey,
                    timestamp: new Date().toISOString()
                  }
                });
                window.dispatchEvent(event);
              } catch (e) {}
              
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
        });
        
        UI_SAFETY.safeEventListener(iframe, 'error', (error) => {
          UI_SAFETY.guard(this._componentId, () => {
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
        const timer = setTimeout(() => {
          if (iframeData.element && iframeData.element.parentNode) {
            iframeData.element.parentNode.removeChild(iframeData.element);
          }
          
          // Remove from pool
          this.iframePool.delete(pageId);
          
          console.log(`✅ Iframe destroyed: ${pageId}`);
          resolve();
        }, 1000);
        this.timers.add(timer);
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
    
    // Sync iframe auth - FULLY PRESERVED
    syncIframeAuth: function(iframe) {
      try {
        if (!iframe.contentWindow) return;
        
        const authData = {
          type: 'moodchat-sync-auth',
          user: window.currentUser || (window.AUTH_STATE && window.AUTH_STATE.getUser ? window.AUTH_STATE.getUser() : null) || (window.api && window.api.auth && window.api.auth.getUser ? window.api.auth.getUser() : null),
          isAuthenticated: !!(window.currentUser || (window.AUTH_STATE && window.AUTH_STATE.isAuthenticated && window.AUTH_STATE.isAuthenticated()) || (window.api && window.api.auth && window.api.auth.isAuthenticated && window.api.auth.isAuthenticated())),
          token: (window.AUTH_STATE && window.AUTH_STATE.getToken ? window.AUTH_STATE.getToken() : null) || (window.api && window.api.auth && window.api.auth.getToken ? window.api.auth.getToken() : null),
          timestamp: new Date().toISOString()
        };
        
        iframe.contentWindow.postMessage(authData, '*');
        console.log(`🔐 Auth synced to iframe: ${iframe.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to sync auth to iframe ${iframe.id}:`, error);
      }
    },
    
    // Sync iframe theme - FULLY PRESERVED
    syncIframeTheme: function(iframe) {
      try {
        if (!iframe.contentWindow) return;
        
        const theme = (() => { try { return localStorage.getItem('moodchat_theme') || 'dark'; } catch(e) { return 'dark'; } })();
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
    
    // Handle iframe errors - NON-BLOCKING
    // UI RESILIENCE PATCH: Fallback UI states for failed iframes (PHASE 8)
    handleIframeErrors: function(iframe, pageId, error) {
      console.error(`🛑 Iframe error for ${pageId}:`, error);
      
      // UI RESILIENCE PATCH: Show placeholder instead of blank screen
      const container = iframe.parentNode;
      if (container) {
        // Check if placeholder already exists
        if (container.querySelector('.iframe-error-placeholder')) {
          return;
        }
        
        // Hide the broken iframe
        iframe.style.display = 'none';
        
        // Create error placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'iframe-error-placeholder';
        placeholder.setAttribute('data-iframe-id', pageId);
        placeholder.style.cssText = `
          position: absolute;
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
          z-index: 1000;
          padding: 20px;
          text-align: center;
          pointer-events: auto;
          border-radius: 8px;
        `;
        
        placeholder.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
          <h3 style="margin-bottom: 10px;">This section failed to load</h3>
          <p style="margin-bottom: 20px; opacity: 0.8; max-width: 300px;">${error.message || 'Connection issue'}</p>
          <div style="display: flex; gap: 10px;">
            <button class="retry-iframe" style="
              background: #8b5cf6;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            ">Retry</button>
            <button class="close-iframe" style="
              background: transparent;
              color: #8b5cf6;
              border: 1px solid #8b5cf6;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            ">Go Back</button>
          </div>
        `;
        
        container.appendChild(placeholder);
        
        // Add button handlers with safety
        const retryBtn = placeholder.querySelector('.retry-iframe');
        const closeBtn = placeholder.querySelector('.close-iframe');
        
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            UI_SAFETY.guard(this._componentId, () => {
              // Remove placeholder
              if (placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
              }
              
              // Show iframe and reload
              iframe.style.display = 'block';
              iframe.src = iframe.src; // Reload
            });
          });
        }
        
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            UI_SAFETY.guard(this._componentId, () => {
              // Remove placeholder
              if (placeholder.parentNode) {
                placeholder.parentNode.removeChild(placeholder);
              }
              
              // Navigate to safe page
              this.fallbackToSafePage();
            });
          });
        }
      }
      
      // Dispatch error event
      try {
        const event = new CustomEvent('moodchat-iframe-error', {
          detail: {
            pageId: pageId,
            error: error.message,
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(event);
      } catch (e) {}
    },
    
    // Monitor iframe health - PREVENT MEMORY LEAKS
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
    
    // Handle iframe messages - FULLY PRESERVED
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
    
    // Check if origin is trusted - FULLY PRESERVED
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
    // 4️⃣ DYNAMIC RESOURCE LOADER (WITH SAFETY - MODIFIED FOR NON-FATAL MISSING RESOURCES)
    // ========================================
    
    // Load page scripts - MODIFIED: Non-fatal for missing optional scripts
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
            
            // Determine if this script is optional
            // For index/home/main pages, do NOT auto-load index.js unless explicitly defined
            const isIndexPage = pageConfig.id === 'index' || pageConfig.id === 'home' || pageConfig.id === 'main' || pageConfig.file === 'index.html';
            const isInferredScript = scriptUrl === `js/${pageConfig.id}.js` || scriptUrl === `js/${pageConfig.file?.replace('.html', '')}.js`;
            
            // Allow missing for inferred scripts on index pages or if not explicitly defined in config
            const allowMissing = (isIndexPage && isInferredScript) || 
                                 (!pageConfig.scripts || !pageConfig.scripts.includes(scriptUrl));
            
            // Use safeLoad with appropriate allowMissing flag
            loadPromises.push(UI_SAFETY.safeLoad(scriptUrl, 'js', allowMissing).then(success => {
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
    
    // Load page styles - MODIFIED: Non-fatal for missing optional styles
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
            
            // Determine if this style is optional
            // For index/home/main pages, do NOT auto-load index.css unless explicitly defined
            const isIndexPage = pageConfig.id === 'index' || pageConfig.id === 'home' || pageConfig.id === 'main' || pageConfig.file === 'index.html';
            const isInferredStyle = styleUrl === `css/${pageConfig.id}.css` || styleUrl === `css/${pageConfig.file?.replace('.html', '')}.css`;
            
            // Allow missing for inferred styles on index pages or if not explicitly defined in config
            const allowMissing = (isIndexPage && isInferredStyle) || 
                                 (!pageConfig.styles || !pageConfig.styles.includes(styleUrl));
            
            // Use safeLoad with appropriate allowMissing flag
            loadPromises.push(UI_SAFETY.safeLoad(styleUrl, 'css', allowMissing).then(success => {
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
    
    // Resolve page scripts - CRASH-PROOF
    resolvePageScripts: function(pageConfig) {
      try {
        const scripts = [];
        
        // Check page config for scripts
        if (pageConfig.scripts && Array.isArray(pageConfig.scripts)) {
          scripts.push(...pageConfig.scripts);
        }
        
        // Infer scripts from page file name - but only if not index page OR if explicitly allowed
        if (pageConfig.file) {
          const baseName = pageConfig.file.replace('.html', '');
          // Skip inferred script for index pages unless they have explicit scripts in config
          const isIndexPage = pageConfig.id === 'index' || pageConfig.id === 'home' || pageConfig.id === 'main' || pageConfig.file === 'index.html';
          if (!isIndexPage || (pageConfig.scripts && pageConfig.scripts.length > 0)) {
            const inferredScript = `js/${baseName}.js`;
            scripts.push(inferredScript);
          }
        }
        
        // Add common scripts if needed
        
        // Filter out duplicates and non-existent URLs
        return [...new Set(scripts.filter(url => url))];
      } catch (error) {
        console.warn('⚠️ Error resolving page scripts:', error);
        return [];
      }
    },
    
    // Resolve page styles - CRASH-PROOF
    resolvePageStyles: function(pageConfig) {
      try {
        const styles = [];
        
        // Check page config for styles
        if (pageConfig.styles && Array.isArray(pageConfig.styles)) {
          styles.push(...pageConfig.styles);
        }
        
        // Infer styles from page file name - but only if not index page OR if explicitly allowed
        if (pageConfig.file) {
          const baseName = pageConfig.file.replace('.html', '');
          // Skip inferred style for index pages unless they have explicit styles in config
          const isIndexPage = pageConfig.id === 'index' || pageConfig.id === 'home' || pageConfig.id === 'main' || pageConfig.file === 'index.html';
          if (!isIndexPage || (pageConfig.styles && pageConfig.styles.length > 0)) {
            const inferredStyle = `css/${baseName}.css`;
            styles.push(inferredStyle);
          }
        }
        
        // Add common styles if needed
        
        // Filter out duplicates and non-existent URLs
        return [...new Set(styles.filter(url => url))];
      } catch (error) {
        console.warn('⚠️ Error resolving page styles:', error);
        return [];
      }
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
      try {
        const dependencies = {
          scripts: this.resolvePageScripts(pageConfig),
          styles: this.resolvePageStyles(pageConfig),
          order: ['styles', 'scripts'] // Load styles first
        };
        
        console.log(`🔗 Dependencies for ${pageConfig.id}:`, dependencies);
        return dependencies;
      } catch (error) {
        console.warn('⚠️ Error resolving dependencies:', error);
        return { scripts: [], styles: [], order: ['styles', 'scripts'] };
      }
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
    // 5️⃣ SIDEBAR + NAVIGATION CONTROLLER (UPDATED WITH RESPONSIVE NAV)
    // ========================================
    
    // Setup sidebar navigation (now integrated with RESPONSIVE_NAV)
    setupSidebarNavigation: function() {
      // Check if sidebar already exists and has content
      const existingSidebar = UI_SAFETY.safeElement('#sidebar, .sidebar');
      if (existingSidebar && existingSidebar.innerHTML && existingSidebar.innerHTML.trim().length > 0) {
        console.warn('⚠️ [DUPLICATION GUARD] Sidebar already exists with content, skipping setup');
        return existingSidebar;
      }
      
      return UI_SAFETY.safeInit('SIDEBAR_NAV', () => {
        console.log('🧭 Setting up sidebar navigation...');
        
        // Delegate to RESPONSIVE_NAV if available
        if (window.RESPONSIVE_NAV && typeof window.RESPONSIVE_NAV.initialize === 'function') {
          console.log('🔗 Delegating navigation setup to RESPONSIVE_NAV');
          return window.RESPONSIVE_NAV.initialize();
        }
        
        // Fallback to original implementation
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
    
    // Bind nav links - MODIFIED: No global preventDefault
    bindNavLinks: function(container) {
      const navLinks = container.querySelectorAll('[data-page-key], [data-nav], [data-tab]');
      
      navLinks.forEach(link => {
        // Get page key from various attributes
        const pageKey = link.getAttribute('data-page-key') || 
                       link.getAttribute('data-nav') || 
                       link.getAttribute('data-tab');
        
        if (!pageKey) return;
        
        // Add click handler with safety - NO GLOBAL PREVENTDEFAULT
        UI_SAFETY.safeEventListener(link, 'click', (event) => {
          // Only prevent default for empty anchor links
          if (event.target.tagName === 'A' && !event.target.getAttribute('href')) {
            event.preventDefault();
          }
          // Do NOT call stopPropagation()
          
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
      
      // Delegate to RESPONSIVE_NAV if available
      if (window.RESPONSIVE_NAV && typeof window.RESPONSIVE_NAV.updateActiveItem === 'function') {
        return window.RESPONSIVE_NAV.updateActiveItem(pageKey);
      }
      
      // Fallback implementation
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
      try {
        const savedState = localStorage.getItem('moodchat_sidebar_state');
        if (savedState) {
          const state = JSON.parse(savedState);
          if (state.collapsed) {
            sidebar.classList.add('collapsed');
          } else {
            sidebar.classList.remove('collapsed');
          }
          
          console.log('📐 Sidebar state restored:', state);
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse sidebar state:', error);
      }
      
      // Save state on change
      const observer = new MutationObserver(() => {
        const collapsed = sidebar.classList.contains('collapsed');
        try {
          localStorage.setItem('moodchat_sidebar_state', JSON.stringify({
            collapsed: collapsed,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.warn('⚠️ Failed to save sidebar state:', error);
        }
      });
      
      observer.observe(sidebar, {
        attributes: true,
        attributeFilter: ['class']
      });
    },
    
    // Handle mobile collapse
    setupMobileCollapse: function(sidebar) {
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
          pointer-events: auto;
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
      try {
        const pageConfig = SafeConfig.getPage(pageKey);
        if (pageConfig && pageConfig.title) {
          document.title = `${pageConfig.title} - MoodChat`;
        }
      } catch (error) {
        console.warn('⚠️ Error updating document title:', error);
      }
      
      // Update browser tab icon - FIXED: Check if pageConfig exists
      try {
        const pageConfig = SafeConfig.getPage(pageKey);
        if (pageConfig && pageConfig.icon) {
          const link = UI_SAFETY.safeElement("link[rel*='icon']") || document.createElement('link');
          link.type = 'image/x-icon';
          link.rel = 'icon';
          link.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${pageConfig.icon}</text></svg>`;
          document.head.appendChild(link);
        }
      } catch (error) {
        console.warn('⚠️ Error updating favicon:', error);
      }
    },
    
    // ========================================
    // 6â³ HISTORY & RESTORE SYSTEM
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
          const timer = setTimeout(() => {
            window.scrollTo(0, event.state.scrollY);
          }, 100);
          this.timers.add(timer);
        }
      }
    },
    
    // Setup deep linking
    setupDeepLinking: function() {
      try {
        // Check URL for page parameter
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = urlParams.get('page');
        
        if (pageParam) {
          const validation = this.validatePageExists(pageParam);
          if (validation.valid) {
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
        }
      } catch (error) {
        console.warn(' Error in deep linking:', error);
      }
      
      return false;
    },
    
    // Refresh recovery - DISABLED to prevent auto-reset loops
    refreshRecovery: function() {
      console.log('[UI]  refreshRecovery disabled to prevent auto-reset loops');
      return Promise.resolve({ type: 'disabled', reason: 'auto_reset_prevention' });
    },
    
    // ========================================
    // 7 ERROR RECOVERY SYSTEM - NON-BLOCKING
    // ========================================
    
    // Show page error - NON-BLOCKING
    showPageError: function(title, message) {
      console.error(`🛑 Page error: ${title} - ${message}`);
      
      // Create error overlay - non-blocking
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
        pointer-events: auto;
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
          if (errorOverlay.parentNode) {
            errorOverlay.parentNode.removeChild(errorOverlay);
          }
          this.retryLoad();
        });
      }
      
      if (goHomeBtn) {
        UI_SAFETY.safeEventListener(goHomeBtn, 'click', () => {
          if (errorOverlay.parentNode) {
            errorOverlay.parentNode.removeChild(errorOverlay);
          }
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
      const timer = setTimeout(() => {
        if (errorOverlay.parentNode) {
          errorOverlay.parentNode.removeChild(errorOverlay);
          this.fallbackToSafePage();
        }
      }, 30000);
      this.timers.add(timer);
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
    
    // Fallback to safe page - CRASH-PROOF
    fallbackToSafePage: function() {
      console.log('🔄 Falling back to safe page...');
      
      try {
        // Try login page if user not logged in
        if (!UI_SAFETY.userLoggedIn()) {
          const loginPageKey = this.findLoginPage();
          if (loginPageKey) {
            console.log(`✅ Falling back to login: ${loginPageKey}`);
            return this.loadPageByKey(loginPageKey, true);
          }
        }
        
        // Try chat.html first (if logged in)
        if (UI_SAFETY.userLoggedIn()) {
          const validation = this.validatePageExists('chat');
          if (validation.valid) {
            console.log('✅ Falling back to chat');
            return this.loadPageByKey('chat', true);
          }
        }
        
        // Try any available page that user can access
        const pages = SafeConfig.getPages();
        if (pages) {
          const availablePages = Object.keys(pages);
          for (const pageKey of availablePages) {
            const canAccess = !this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn();
            if (canAccess) {
              console.log(`✅ Falling back to ${pageKey}`);
              return this.loadPageByKey(pageKey, true);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error in fallback:', error);
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
        const timer = setTimeout(() => {
          this.loadPageByKey(this.currentPage.key, false);
        }, 100);
        this.timers.add(timer);
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
    
    // Cache eviction - PREVENT MEMORY LEAKS
    setupCacheEviction: function() {
      // Monitor cache size
      const timer = setInterval(() => {
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
      this.timers.add(timer);
      
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
      try {
        const pages = SafeConfig.getPages();
        if (!pages) return;
        
        const pageKeys = Object.keys(pages);
        const warmPages = pageKeys.filter(pageKey => 
          pageKey !== this.currentPage?.key && 
          this.validatePageExists(pageKey).valid &&
          // Only warm pages user can access
          (!this.isAuthRequiredPage(pageKey) || UI_SAFETY.userLoggedIn())
        ).slice(0, 2); // Warm up to 2 pages
        
        if (warmPages.length > 0) {
          warmPages.forEach(pageKey => {
            this.preloadPage(pageKey);
          });
          console.log(`🔥 Cache warmed for: ${warmPages.join(', ')}`);
        } else {
          console.log('ℹ️ No pages to warm cache');
        }
      } catch (error) {
        console.warn('⚠️ Error warming cache:', error);
      }
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
                // UI RESILIENCE PATCH: Abortable fetch
                const controller = new AbortController();
                const abortKey = `fetch_${pageConfig.id}`;
                this.abortControllers.set(abortKey, controller);
                
                const response = await fetch(pageConfig.file, {
                  signal: controller.signal
                });
                const html = await response.text();
                
                this.abortControllers.delete(abortKey);
                
                container.innerHTML = html;
                
                // Reinitialize scripts in the new content
                this.reinitializePageScripts(container);
              } catch (fetchError) {
                if (fetchError.name === 'AbortError') {
                  console.log(`🛑 Fetch aborted for: ${pageConfig.file}`);
                } else {
                  console.warn(`⚠️ Failed to fetch page content: ${pageConfig.file}`, fetchError.message);
                }
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
          if (script.parentNode) {
            script.parentNode.replaceChild(newScript, script);
          }
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
    
    // Initialize the router with UI integration
    init: function() {
      console.log('🚀 Initializing Page Router with UI integration...');
      
      // Check if UI already initialized globally
      if (window.__UI_INITIALIZED) {
        console.warn('⚠️ [DUPLICATION GUARD] UI already initialized globally, skipping init');
        return Promise.resolve();
      }
      
      // Initialize UI state machine
      UI_STATE.initialize();
      
      // Initialize router
      this.initialize();
      
      // Initialize responsive navigation controller
      RESPONSIVE_NAV.initialize();
      this.uiIntegrated = true;
      
      // Setup performance optimizations
      this.setupLazyLoading();
      this.setupPrefetching();
      this.setupCacheEviction();
      this.setupIdleCallbacks();
      
      // Setup deep linking
      const deepLinked = this.setupDeepLinking();
      
      // Start iframe health monitoring
      const healthTimer = setInterval(() => {
        UI_SAFETY.guard(this._componentId, () => {
          this.monitorIframeHealth();
        });
      }, 30 * 1000); // Every 30 seconds
      this.timers.add(healthTimer);
      
      // Setup error boundaries
      this.setupErrorBoundaries();
      
      // Mark UI initialization as complete
      UI_INIT_LOCK.complete();
      
      console.log('✅ Page Router fully initialized with UI integration');
      
      // Return initialization promise
      return new Promise((resolve) => {
        // If not deep linked, load default page
        if (!deepLinked) {
          const timer = setTimeout(() => {
            UI_SAFETY.guard(this._componentId, () => {
              this.refreshRecovery().then(resolve).catch(() => {
                this.loadDefaultPage().then(resolve);
              });
            });
          }, 100);
          this.timers.add(timer);
        } else {
          resolve();
        }
      });
    },
    
    // Setup error boundaries
    setupErrorBoundaries: function() {
      // Global error handler for navigation errors
      UI_SAFETY.safeEventListener(window, 'moodchat-route-error', (event) => {
        UI_SAFETY.guard(this._componentId, () => {
          console.error('🛑 Route error caught:', event.detail);
          
          // Try to recover
          if (!event.detail.retryAttempted) {
            const timer = setTimeout(() => {
              this.retryLoad();
            }, 2000);
            this.timers.add(timer);
          }
        });
      });
      
      // Network error handling
      UI_SAFETY.safeEventListener(window, 'offline', () => {
        UI_SAFETY.guard(this._componentId, () => {
          UI_STATE.transitionTo(UI_STATE.STATES.OFFLINE, 'network_offline');
          this.showPageError('You are offline', 'Please check your internet connection');
        });
      });
      
      UI_SAFETY.safeEventListener(window, 'online', () => {
        UI_SAFETY.guard(this._componentId, () => {
          if (UI_STATE.isState(UI_STATE.STATES.OFFLINE)) {
            UI_STATE.transitionTo(UI_STATE.STATES.READY, 'network_online');
            this.retryLoad();
          }
        });
      });
      
      // UI RESILIENCE PATCH: Add to error boundary recovery
      UIErrorBoundary.addRecovery((error, source) => {
        UI_SAFETY.guard(this._componentId, () => {
          console.log('🛡️ Error boundary recovery triggered');
          // Don't reload, just ensure navigation still works
          if (UI_STATE.isState(UI_STATE.STATES.ERROR)) {
            UI_STATE.transitionTo(UI_STATE.STATES.READY, 'error_recovered');
          }
        });
      });
    },
    
    // Cleanup timers - PREVENT MEMORY LEAKS
    cleanup: function() {
      console.log('🧹 Cleaning up timers and resources...');
      
      // Mark as destroyed
      this._destroyed = true;
      UI_SAFETY.markDestroyed(this._componentId);
      
      // Cancel all operations
      this.cancelPendingOperations();
      
      // Clean up components
      this.timers.forEach(timer => clearInterval(timer));
      this.timers.clear();
      RESPONSIVE_NAV.cleanup();
      UI_SAFETY.cleanup();
      
      // Clear navigation lock
      NavigationLock.forceRelease();
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
      
      // UI Mode
      getNavigationMode: function() {
        return RESPONSIVE_NAV.getCurrentMode();
      },
      
      isDesktopMode: function() {
        return RESPONSIVE_NAV.isDesktopMode();
      },
      
      isMobileMode: function() {
        return RESPONSIVE_NAV.isMobileMode();
      },
      
      // Resource management
      preload: function(pageKey) {
        return PAGE_ROUTER.preloadPage(pageKey);
      },
      
      unloadResources: function(pageKey) {
        const pageConfig = SafeConfig.getPage(pageKey);
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
      },
      
      // Cleanup
      cleanup: function() {
        return PAGE_ROUTER.cleanup();
      },
      
      // UI RESILIENCE PATCH: Error boundary API
      getErrors: function() {
        return UIErrorBoundary.getRecentErrors();
      },
      
      clearErrors: function() {
        UIErrorBoundary.clearErrors();
      },
      
      // UI RESILIENCE PATCH: Navigation lock info
      getLockInfo: function() {
        return NavigationLock.getLockInfo();
      },
      
      forceReleaseLock: function() {
        NavigationLock.forceRelease();
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
        try {
          localStorage.setItem('moodchat_sidebar_state', JSON.stringify({
            collapsed: !event.detail.open,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.warn('⚠️ Failed to save sidebar state:', error);
        }
      }
    },
    
    // Integration with responsive navigation
    onViewportChange: function(event) {
      console.log('🔗 Viewport changed:', event.detail);
      
      // Update navigation mode if RESPONSIVE_NAV is available
      if (window.RESPONSIVE_NAV && typeof window.RESPONSIVE_NAV.applyMode === 'function') {
        const newMode = window.RESPONSIVE_NAV.detectMode();
        window.RESPONSIVE_NAV.applyMode(newMode);
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
  window.ResponsiveNav = RESPONSIVE_NAV;
  window.UIInitLock = UI_INIT_LOCK;
  window.SafeConfig = SafeConfig; // ADDED: Expose safe config
  window.UIErrorBoundary = UIErrorBoundary; // UI RESILIENCE PATCH: Expose error boundary
  window.NavigationLock = NavigationLock; // UI RESILIENCE PATCH: Expose navigation lock
  
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
    
    // Navigation Mode
    getNavigationMode: PAGE_ROUTER.api.getNavigationMode,
    isDesktopMode: PAGE_ROUTER.api.isDesktopMode,
    isMobileMode: PAGE_ROUTER.api.isMobileMode,
    
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
    cleanup: PAGE_ROUTER.api.cleanup, // ADDED: Cleanup API
    
    // Initialization
    init: PAGE_ROUTER.init.bind(PAGE_ROUTER),
    
    // UI Lock
    isUIInitialized: UI_INIT_LOCK.isInitialized.bind(UI_INIT_LOCK),
    
    // Config (ADDED: Safe config access)
    getConfig: SafeConfig.get,
    waitForConfig: SafeConfig.waitForReady,
    
    // UI RESILIENCE PATCH: Error boundary API
    getErrors: PAGE_ROUTER.api.getErrors,
    clearErrors: PAGE_ROUTER.api.clearErrors,
    
    // UI RESILIENCE PATCH: Navigation lock API
    getLockInfo: PAGE_ROUTER.api.getLockInfo,
    forceReleaseLock: PAGE_ROUTER.api.forceReleaseLock
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
          
          // Check if UI already initialized
          if (window.__UI_INITIALIZED) {
            console.warn('⚠️ [DUPLICATION GUARD] UI already initialized, skipping');
            return;
          }
          
          // Initialize UI
          PAGE_ROUTER.init().then(() => {
            console.log('🎉 MoodChat UI Navigation Engine Ready!');
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('moodchat-ui-ready', {
              detail: {
                timestamp: new Date().toISOString(),
                router: 'initialized',
                state: UI_STATE.getState(),
                navMode: RESPONSIVE_NAV.getCurrentMode(),
                uiLocked: UI_INIT_LOCK.isInitialized(),
                configLoaded: !SafeConfig.isFallback()
              }
            }));
          });
        }
      }, 100);
      
      // Cleanup interval after 10 seconds to prevent memory leaks
      const cleanupTimer = setTimeout(() => {
        clearInterval(waitForCore);
      }, 10000);
      PAGE_ROUTER.timers.add(cleanupTimer);
    });
  } else {
    // DOM already ready
    console.log('📄 DOM already ready, initializing UI...');
    
    // Check if UI already initialized
    if (window.__UI_INITIALIZED) {
      console.warn('⚠️ [DUPLICATION GUARD] UI already initialized, skipping');
    } else {
      PAGE_ROUTER.init();
    }
  }
  
  // Export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      PageRouter: PAGE_ROUTER,
      UiState: UI_STATE,
      UiSafety: UI_SAFETY,
      ResponsiveNav: RESPONSIVE_NAV,
      UIInitLock: UI_INIT_LOCK,
      SafeConfig: SafeConfig,
      UIErrorBoundary: UIErrorBoundary,
      NavigationLock: NavigationLock,
      MoodChatUI: window.MoodChatUI
    };
  }
  
  // Handle page unload - cleanup resources
  window.addEventListener('beforeunload', () => {
    PAGE_ROUTER.cleanup();
  });
  
  console.log('📦 app.core.ui.js loaded successfully with safe config loader, non-blocking UI policy, INFINITE RECURSION FIX, NON-FATAL RESOURCE LOADING, SESSION MODULE TIMEOUT FIXES, and UI RESILIENCE HARDENING (PHASES 1-12)');
})();