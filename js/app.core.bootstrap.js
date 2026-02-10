// app.core.bootstrap.js - MoodChat Bootstrap & Core Initialization Layer
// EXTRACTED FROM: app.core.js (Bootstrap & Core Initialization Layer)
// UPDATED: Modularized bootstrap system preserving all functionality
// UPDATED: Maintains backward compatibility with all existing features
// UPDATED: Preserves execution order and timing
// UPDATED: Includes all recovery and resilience mechanisms
// UPDATED: Added comprehensive error safety and failure isolation

// Import API modules (used for authentication and requests)
import './api.core.js';
import './api.request.js';
import './api.auth.js';

// Import split core modules
import './app.core.session.js';
import './app.core.ui.js';

(function () {
  // ============================================================================
  // GLOBAL ERROR SAFETY LAYER - ADDED FOR FAILURE ISOLATION
  // ============================================================================
  
  // Global error tracking to prevent duplicate logging
  const ERROR_TRACKER = {
    loggedErrors: new Set(),
    loggedPromises: new Set(),
    maxAttempts: 3,
    
    shouldLog: function(errorKey, context = '') {
      const key = `${errorKey}:${context}`;
      if (this.loggedErrors.has(key)) {
        return false;
      }
      this.loggedErrors.add(key);
      return true;
    },
    
    clear: function() {
      this.loggedErrors.clear();
      this.loggedPromises.clear();
    }
  };
  
  // Global error handler for uncaught exceptions
  const originalOnerror = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    const errorKey = `window-error:${source}:${lineno}`;
    if (ERROR_TRACKER.shouldLog(errorKey, message)) {
      console.error(`🚨 [Global Error] ${message} at ${source}:${lineno}:${colno}`, error || '');
    }
    
    // Call original handler if it exists
    if (typeof originalOnerror === 'function') {
      return originalOnerror(message, source, lineno, colno, error);
    }
    
    return true; // Prevent default browser error handling
  };
  
  // Global promise rejection handler
  const originalOnunhandledrejection = window.onunhandledrejection;
  window.onunhandledrejection = function(event) {
    const error = event.reason;
    const errorKey = `promise-rejection:${error?.message || 'unknown'}`;
    if (ERROR_TRACKER.shouldLog(errorKey, 'unhandledrejection')) {
      console.error('🚨 [Unhandled Promise Rejection]', error);
    }
    
    // Call original handler if it exists
    if (typeof originalOnunhandledrejection === 'function') {
      return originalOnunhandledrejection(event);
    }
    
    event.preventDefault(); // Prevent browser console warning
    return false;
  };
  
  // Safe wrapper for any function execution
  function safeExecute(fn, context = 'anonymous', maxRetries = 1) {
    let attempts = 0;
    
    function execute() {
      try {
        return fn();
      } catch (error) {
        attempts++;
        const errorKey = `safe-execute:${context}:${attempts}`;
        if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
          console.error(`⚠️ [${context}] Execution attempt ${attempts} failed:`, error.message);
        }
        
        if (attempts < maxRetries) {
          return execute(); // Retry
        }
        
        // Return null to prevent crashes
        console.warn(`⚠️ [${context}] All attempts failed, returning null`);
        return null;
      }
    }
    
    return execute();
  }
  
  // Safe async wrapper
  async function safeExecuteAsync(fn, context = 'anonymous', maxRetries = 1) {
    let attempts = 0;
    
    async function execute() {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        const errorKey = `safe-execute-async:${context}:${attempts}`;
        if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
          console.error(`⚠️ [${context}] Async execution attempt ${attempts} failed:`, error.message);
        }
        
        if (attempts < maxRetries) {
          return await execute(); // Retry
        }
        
        // Return null to prevent crashes
        console.warn(`⚠️ [${context}] All async attempts failed, returning null`);
        return null;
      }
    }
    
    return await execute();
  }
  
  // Safe module initialization wrapper
  function safeModuleInit(moduleName, initFunction) {
    try {
      console.log(`🔧 Initializing module: ${moduleName}`);
      const result = initFunction();
      console.log(`✅ Module initialized: ${moduleName}`);
      return result;
    } catch (error) {
      const errorKey = `module-init:${moduleName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.error(`❌ Module ${moduleName} initialization failed:`, error.message);
      }
      // Return a stub module to prevent crashes
      return {
        _moduleFailed: true,
        _moduleName: moduleName,
        _error: error.message,
        // Safe stub methods
        isAvailable: () => false,
        safeCall: (methodName, ...args) => {
          console.warn(`⚠️ Module ${moduleName}.${methodName} called but module failed`);
          return null;
        }
      };
    }
  }
  
  // Safe import wrapper for dynamic imports (if needed elsewhere)
  async function safeImport(modulePath, moduleName) {
    try {
      console.log(`📦 Loading module: ${moduleName || modulePath}`);
      await import(modulePath);
      console.log(`✅ Module loaded: ${moduleName || modulePath}`);
      return true;
    } catch (error) {
      const errorKey = `import-failed:${modulePath}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.error(`❌ Failed to load module ${moduleName || modulePath}:`, error.message);
      }
      return false;
    }
  }
  
  // ============================================================================
  // PRE-LOGIN CHECK - PHASE 0: VERIFY USER AUTHENTICATION BEFORE ANY LOADING
  // ============================================================================
  
  // Function to check if user is logged in
  function userLoggedIn() {
    try {
      // Check multiple authentication sources
      if (window.currentUser) return true;
      
      if (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated()) {
        return true;
      }
      
      if (window.api && window.api.auth && window.api.auth.getUser) {
        const user = window.api.auth.getUser();
        if (user) return true;
      }
      
      // Check localStorage for token
      const token = localStorage.getItem('accessToken') || localStorage.getItem('moodchat_jwt_token');
      return !!token;
    } catch (error) {
      console.warn('⚠️ userLoggedIn check failed:', error);
      return false;
    }
  }
  
  // Safe page resource loader with try/catch
  function safeLoadPageResources(pageName) {
    try {
      // Check if loadPageResources function exists
      if (typeof window.loadPageResources === 'function') {
        console.log(`📦 Loading resources for page: ${pageName}`);
        window.loadPageResources(pageName);
      }
      
      // Check if preloadPageResources function exists
      if (typeof window.preloadPageResources === 'function') {
        console.log(`📦 Preloading resources for page: ${pageName}`);
        window.preloadPageResources(pageName);
      }
      
      return true;
    } catch (error) {
      const errorKey = `page-resources:${pageName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.warn(`⚠️ Failed to load resources for page ${pageName}:`, error.message);
      }
      return false;
    }
  }
  
  // Function to redirect to login if not authenticated
  function ensureUserLoggedIn() {
    const isLoggedIn = userLoggedIn();
    const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;
    
    console.log(`🔐 Auth check: loggedIn=${isLoggedIn}, publicPage=${isPublicPage}`);
    
    // If not logged in and not on a public page, redirect to login
    if (!isLoggedIn && !isPublicPage) {
      console.log('🔐 User not logged in, redirecting to login');
      
      // Store current path for return after login
      const returnPath = window.location.pathname + window.location.search;
      try {
        sessionStorage.setItem('moodchat_return_path', returnPath);
      } catch (error) {
        console.warn('⚠️ Failed to store return path:', error);
      }
      
      // Redirect to login page
      if (!window.location.pathname.includes('login.html') && 
          !window.location.pathname.includes('index.html') &&
          !window.location.pathname.includes('/')) {
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 100);
      }
      
      return false;
    }
    
    return isLoggedIn || isPublicPage;
  }
  
  // ============================================================================
  // GLOBAL NAMESPACE GOVERNANCE - PHASE 1: DEFENSIVE NAMESPACE ESTABLISHMENT
  // ============================================================================
  
  // Create safe shims for undefined variables
  function ensureGlobalDependencies() {
    console.log('🔍 Ensuring global dependencies...');
    
    // Check user authentication BEFORE any other initialization
    const authCheckPassed = ensureUserLoggedIn();
    if (!authCheckPassed) {
      console.log('⏳ Authentication check failed, pausing further initialization');
      return false;
    }
    
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
          storageKey: 'moodchat_nav_state',
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
          timeout: 5000,
          retryAttempts: 3,
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
      const publicPages = ['/', '/index.html', '/login.html', '/signup.html', '/auth.html', '/register.html'];
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
    return true;
  }
  
  // Run dependency checker immediately
  safeExecute(ensureGlobalDependencies, 'ensureGlobalDependencies');

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
      // Check authentication before starting bootstrap
      const isLoggedIn = userLoggedIn();
      const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;
      
      if (!isLoggedIn && !isPublicPage) {
        console.log('⏳ Authentication required, pausing bootstrap');
        return this;
      }
      
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
      const progressEvent = new CustomEvent('moodchat-bootstrap-progress', {
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
      const phaseChangeEvent = new CustomEvent('moodchat-bootstrap-phase-change', {
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
      
      const completionEvent = new CustomEvent('moodchat-bootstrap-complete', {
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
  safeExecute(() => BOOTSTRAP_STATE.initialize(), 'BOOTSTRAP_STATE.initialize');

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
    moduleFailures: new Set(),
    
    // Main bootstrap function
    bootstrap: async function() {
      // Check authentication before starting bootstrap
      const isLoggedIn = userLoggedIn();
      const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;
      
      if (!isLoggedIn && !isPublicPage) {
        console.log('⏳ Authentication required, pausing bootstrap until login');
        return Promise.reject(new Error('Authentication required'));
      }
      
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
          
          // Log module failures summary
          if (this.moduleFailures.size > 0) {
            console.warn(`⚠️ Bootstrap completed with ${this.moduleFailures.size} module failures:`, 
              Array.from(this.moduleFailures));
          }
          
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
          () => window.__MOODCHAT_API_READY === true,
          () => window.MoodChatConfig && window.MoodChatConfig.api,
          () => window.__MOODCHAT_API_EVENTS && window.__MOODCHAT_API_EVENTS.includes('ready')
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
        const eventTypes = ['api-ready', 'apiready', 'apiReady', 'moodchat-api-ready', 'api.core-ready'];
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
        const eventTypes = ['auth-ready', 'authReady', 'moodchat-auth-ready'];
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
        try {
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
        } catch (error) {
          console.log('⚠️ AUTH_STATE check failed:', error);
          this.moduleFailures.add('AUTH_STATE');
        }
      } else {
        // Fallback to localStorage check
        try {
          const token = localStorage.getItem('accessToken') || localStorage.getItem('moodchat_jwt_token');
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
        } catch (error) {
          console.log('⚠️ localStorage access failed:', error);
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
      const token = localStorage.getItem('accessToken') || localStorage.getItem('moodchat_jwt_token');
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
        
        // Don't re-throw - core module failure shouldn't stop bootstrap
        this.moduleFailures.add('app.core');
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
            try {
              return {
                isAuthenticated: !!(window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
                user: window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
                hasToken: !!(typeof AUTH_STATE !== 'undefined' && AUTH_STATE.hasToken && AUTH_STATE.hasToken()),
                tokenValid: !!(typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())
              };
            } catch (error) {
              console.warn('⚠️ Failed to get auth state:', error);
              return { isAuthenticated: false, user: null, hasToken: false, tokenValid: false };
            }
          },
          
          // Get UI state
          getUIState: function() {
            try {
              if (typeof UI_ORCHESTRATOR !== 'undefined') {
                return UI_ORCHESTRATOR.getState();
              }
            } catch (error) {
              console.warn('⚠️ Failed to get UI state:', error);
            }
            return null;
          },
          
          // Get network state
          getNetworkState: function() {
            try {
              return {
                status: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                        API_COORDINATION.getNetworkStatus() : 'unknown',
                isOnline: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                         API_COORDINATION.getNetworkStatus() === 'online' : false
              };
            } catch (error) {
              console.warn('⚠️ Failed to get network state:', error);
              return { status: 'unknown', isOnline: false };
            }
          },
          
          // Get session state
          getSessionState: function() {
            try {
              if (typeof SESSION_COORDINATOR !== 'undefined') {
                return SESSION_COORDINATOR.getStatus();
              }
            } catch (error) {
              console.warn('⚠️ Failed to get session state:', error);
            }
            return null;
          }
        },
        
        // EVENT BUS STEWARDSHIP: Event management
        events: {
          // Listen for event
          on: function(eventName, callback) {
            try {
              if (typeof MoodChatEvents !== 'undefined') {
                MoodChatEvents.on(eventName, callback);
              } else {
                window.addEventListener(eventName, (event) => {
                  callback(event.detail);
                });
              }
            } catch (error) {
              console.error(`⚠️ Failed to add event listener for ${eventName}:`, error);
            }
          },
          
          // Remove event listener
          off: function(eventName, callback) {
            try {
              if (typeof MoodChatEvents !== 'undefined') {
                MoodChatEvents.off(eventName, callback);
              } else {
                window.removeEventListener(eventName, callback);
              }
            } catch (error) {
              console.error(`⚠️ Failed to remove event listener for ${eventName}:`, error);
            }
          },
          
          // Emit event
          emit: function(eventName, data) {
            try {
              if (typeof MoodChatEvents !== 'undefined') {
                MoodChatEvents.emit(eventName, data);
              } else {
                const event = new CustomEvent(eventName, {
                  detail: data,
                  bubbles: true,
                  cancelable: true
                });
                window.dispatchEvent(event);
              }
            } catch (error) {
              console.error(`⚠️ Failed to emit event ${eventName}:`, error);
            }
          },
          
          // Listen for event once
          once: function(eventName, callback) {
            try {
              if (typeof MoodChatEvents !== 'undefined') {
                MoodChatEvents.once(eventName, callback);
              } else {
                const onceCallback = (event) => {
                  callback(event.detail);
                  window.removeEventListener(eventName, onceCallback);
                };
                window.addEventListener(eventName, onceCallback);
              }
            } catch (error) {
              console.error(`⚠️ Failed to add once listener for ${eventName}:`, error);
            }
          }
        },
        
        // FAILURE CONTAINMENT STRATEGY: Error handling
        errors: {
          // Get error stats
          getStats: function() {
            try {
              if (typeof ERROR_HANDLER !== 'undefined') {
                return ERROR_HANDLER.getStats();
              }
            } catch (error) {
              console.warn('⚠️ Failed to get error stats:', error);
            }
            return null;
          },
          
          // Register error handler
          onError: function(callback) {
            try {
              if (typeof ERROR_HANDLER !== 'undefined') {
                ERROR_HANDLER.onError(callback);
              }
            } catch (error) {
              console.warn('⚠️ Failed to register error handler:', error);
            }
          },
          
          // Show error to user
          showError: function(message, type = 'error') {
            try {
              if (typeof ERROR_HANDLER !== 'undefined') {
                ERROR_HANDLER.showErrorToUser(message, type);
              } else {
                // Fallback
                console.error(`[${type.toUpperCase()}] ${message}`);
              }
            } catch (error) {
              console.warn('⚠️ Failed to show error:', error);
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
          
          // Get MoodChatCore status
          getMoodChatCoreStatus: function() {
            return {
              exists: typeof window.MoodChatCore !== 'undefined',
              components: window.MoodChatCore ? Object.keys(window.MoodChatCore) : []
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
      const event = new CustomEvent('moodchat-auth-ui-required', {
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
      
      // Check authentication before showing dashboard
      if (!userLoggedIn()) {
        console.log('🔐 User not logged in, redirecting to login instead of showing dashboard');
        this.redirectToAuth('User not logged in');
        return;
      }
      
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
      const event = new CustomEvent('moodchat-dashboard-ui-required', {
        detail: {
          timestamp: new Date().toISOString(),
          user: window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null)
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
      const authPages = ['/', '/index.html', '/login.html', '/signup.html'];
      const isAuthPage = authPages.some(page => currentPath.endsWith(page));
      
      if (!isAuthPage) {
        // Store redirect path for after login
        const returnPath = currentPath + window.location.search;
        try {
          sessionStorage.setItem('moodchat_return_path', returnPath);
        } catch (error) {
          console.warn('⚠️ Failed to store return path:', error);
        }
        
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
        await safeExecuteAsync(() => this.initializeSidebar(), 'initializeSidebar', 1);
        
        // 2. Initialize navigation
        await safeExecuteAsync(() => this.initializeNavigation(), 'initializeNavigation', 1);
        
        // 3. Initialize theme
        await safeExecuteAsync(() => this.initializeTheme(), 'initializeTheme', 1);
        
        // 4. Initialize notification system
        await safeExecuteAsync(() => this.initializeNotifications(), 'initializeNotifications', 1);
        
        // 5. Initialize responsive behaviors
        await safeExecuteAsync(() => this.initializeResponsiveBehaviors(), 'initializeResponsiveBehaviors', 1);
        
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
            const event = new CustomEvent('moodchat-sidebar-toggle', {
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
      
      // Check authentication before navigating to any page
      if (!userLoggedIn() && page !== 'login' && page !== 'index') {
        console.log('🔐 Authentication required, redirecting to login');
        this.redirectToAuth('Authentication required for page navigation');
        return;
      }
      
      // Update URL if needed
      if (pushState) {
        window.history.pushState({ page: page }, '', page);
      }
      
      // Dispatch navigation event
      const event = new CustomEvent('moodchat-navigation', {
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
        try {
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
        } catch (error) {
          console.warn('⚠️ Settings service theme application failed:', error);
          this.moduleFailures.add('SETTINGS_SERVICE.applyTheme');
        }
      }
      
      // Fallback theme initialization
      try {
        const html = document.documentElement;
        const savedTheme = localStorage.getItem('moodchat_theme') || 'dark';
        
        // Remove all theme classes
        html.classList.remove('theme-dark', 'theme-light', 'theme-auto');
        
        // Apply saved theme
        if (savedTheme === 'auto') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          html.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
          html.classList.add('theme-auto');
        } else {
          html.classList.add(`theme-${savedTheme}`);
        }
        
        // Listen for theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (savedTheme === 'auto') {
            html.classList.remove('theme-dark', 'theme-light');
            html.classList.add(e.matches ? 'theme-dark' : 'theme-light');
          }
        });
        
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
      } catch (error) {
        console.warn('⚠️ Fallback theme initialization failed:', error);
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
        try {
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
        } catch (error) {
          console.error('⚠️ Failed to create notification:', error);
          return null;
        }
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
      try {
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
        const event = new CustomEvent('moodchat-responsive-change', {
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
      } catch (error) {
        console.warn('⚠️ Responsive change handler failed:', error);
      }
    },
    
    // Load app content
    // ============================================================================
    // SESSION-AWARE APP CONTENT LOADER
    // ============================================================================

    loadAppContent: function() {
      console.log('📦 Loading app content with session-aware sequencing...');
      
      // Check authentication before loading any content
      if (!userLoggedIn()) {
        console.log('🔐 User not logged in, redirecting to login instead of loading content');
        this.redirectToAuth('User not logged in');
        return;
      }
      
      // Validate session is ready before proceeding
      const validateSession = () => {
        if (window.currentUser) return true;
        if (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser) {
          try {
            const user = AUTH_STATE.getUser();
            if (user) {
              window.currentUser = user;
              return true;
            }
          } catch (error) {
            console.warn('⚠️ Failed to get user from AUTH_STATE:', error);
          }
        }
        return false;
      };
      
      // Step 1: Dispatch content loading event with session info
      try {
        const user = window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null);
        const event = new CustomEvent('moodchat-content-loading', {
          detail: {
            timestamp: new Date().toISOString(),
            user: user,
            sessionReady: !!user
          }
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn('⚠️ Failed to dispatch content loading event:', error);
      }
      
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
      safeExecuteAsync(() => this.initializeNavigationContainer(), 'initializeNavigationContainer', 1).then(() => {
        
        // Step 2: Determine which page to load
        const pageToLoad = this.determinePageToLoad();
        
        // Step 3: Load the parent shell (chat.html) if not already loaded
        safeExecuteAsync(() => this.ensureParentShellLoaded(), 'ensureParentShellLoaded', 1).then(() => {
          
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
            background: var(--bg-secondary);
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
        window.dispatchEvent(new CustomEvent('moodchat-navigation-ready', {
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
        const savedValue = sessionStorage.getItem('moodchat_last_page');
        
        if (savedValue) {
          // Validate it's not [object Object] or malformed
          if (savedValue.startsWith('[object') || 
              savedValue.includes('Object]') || 
              savedValue.trim() === '') {
            console.warn('⚠️ Invalid session storage value detected, removing:', savedValue);
            sessionStorage.removeItem('moodchat_last_page');
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
        sessionStorage.removeItem('moodchat_last_page');
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
      
      // Check authentication before loading any page
      if (!userLoggedIn() && pageKey !== 'login' && pageKey !== 'index') {
        console.log(`🔐 Authentication required for page ${pageKey}, redirecting to login`);
        this.redirectToAuth(`Authentication required for page ${pageKey}`);
        return;
      }
      
      // Validate page exists
      if (!APP_CONFIG.pages || !APP_CONFIG.pages[pageKey]) {
        console.error(`❌ Page "${pageKey}" not found in config`);
        pageKey = 'chat'; // Fallback to chat
      }
      
      const pageConfig = APP_CONFIG.pages[pageKey];
      
      // Safe load page resources with try/catch
      safeLoadPageResources(pageKey);
      
      // Save to session storage safely
      try {
        // Store only the page key, not the object
        sessionStorage.setItem('moodchat_last_page', pageKey);
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
        window.dispatchEvent(new CustomEvent('moodchat-page-loaded', {
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
              type: 'moodchat-session-data',
              user: window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
              isAuthenticated: !!(window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
              token: typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null,
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
        window.dispatchEvent(new CustomEvent('moodchat-page-loaded', {
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
          try {
            IFRAME_COORDINATOR.initialize();
          } catch (error) {
            console.warn('⚠️ IFRAME_COORDINATOR initialization failed:', error);
          }
        }, 1000); // Delay to ensure session is fully propagated
      }
    },

    // ============================================================================
    // SAFE PARENT ↔ IFRAME COMMUNICATION WITH MAX RETRIES
    // ============================================================================
    
    // Setup coordination systems with safe error handling
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
        // 1. Setup event coordination with safety wrapper
        await safeExecuteAsync(() => this.setupEventCoordination(), 'setupEventCoordination', 1);
        
        // 2. Setup iframe coordination with max retries
        await this.setupIframeCoordinationWithRetry();
        
        // 3. Setup error handling
        await safeExecuteAsync(() => this.setupErrorHandling(), 'setupErrorHandling', 1);
        
        // 4. Setup session monitoring
        await safeExecuteAsync(() => this.setupSessionMonitoring(), 'setupSessionMonitoring', 1);
        
        // 5. Setup performance monitoring
        await safeExecuteAsync(() => this.setupPerformanceMonitoring(), 'setupPerformanceMonitoring', 1);
        
        // 6. Trigger background sync if available
        await safeExecuteAsync(() => this.triggerBackgroundSync(), 'triggerBackgroundSync', 1);
        
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
        
        // Continue anyway - coordination is important but not critical
      }
    },
    
    // Setup iframe coordination with retry logic
    setupIframeCoordinationWithRetry: async function() {
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`🖼️ Setting up iframe coordination (attempt ${attempts}/${maxAttempts})...`);
          await this.setupIframeCoordinationInternal();
          console.log('✅ Iframe coordination setup successful');
          return;
        } catch (error) {
          console.error(`⚠️ Iframe coordination attempt ${attempts} failed:`, error.message);
          
          if (attempts >= maxAttempts) {
            console.warn('⚠️ Max iframe coordination attempts reached, continuing without full iframe support');
            // Create a minimal iframe API stub to prevent crashes
            this.createMinimalIframeAPI();
            break;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    },
    
    // Internal iframe coordination setup
    setupIframeCoordinationInternal: async function() {
      console.log('🖼️ Setting up iframe coordination...');
      
      // Record iframe coordination setup
      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: 'iframe_coordination',
          startTime: new Date().toISOString()
        });
      }
      
      // Store iframe references
      window.MoodChatIframes = new Map();
      
      // SAFE SESSION & TOKEN VALIDATION BEFORE MESSAGING
      const safeGetAuthData = () => {
        try {
          return {
            user: window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
            isAuthenticated: !!(window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
            token: typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null
          };
        } catch (error) {
          console.warn('⚠️ Failed to get auth data for iframe:', error.message);
          return { user: null, isAuthenticated: false, token: null };
        }
      };
      
      // Listen for iframe messages with safety wrapper
      const messageHandler = (event) => {
        try {
          // Security check
          if (event.origin !== window.location.origin && 
              !event.origin.includes('localhost') && 
              !event.origin.includes('127.0.0.1')) {
            return;
          }
          
          const data = event.data;
          if (!data || typeof data !== 'object') return;
          
          // Handle different message types
          switch(data?.type) {
            case 'moodchat-iframe-ready':
              this.handleIframeReady(event.source, data);
              break;
              
            case 'moodchat-iframe-auth-request':
              this.handleIframeAuthRequest(event.source, data);
              break;
              
            case 'moodchat-iframe-data-request':
              this.handleIframeDataRequest(event.source, data);
              break;
              
            case 'moodchat-iframe-action':
              this.handleIframeAction(event.source, data);
              break;
              
            case 'moodchat-iframe-navigate':
              this.handleIframeNavigate(data);
              break;
          }
        } catch (error) {
          console.error('⚠️ Error in iframe message handler:', error);
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Provide API for iframes to communicate
      window.MoodChatIframeAPI = {
        sendToParent: function(type, data) {
          try {
            window.parent.postMessage({
              type: type,
              data: data,
              source: 'moodchat-iframe',
              timestamp: new Date().toISOString()
            }, '*');
          } catch (error) {
            console.error('⚠️ Failed to send message to parent:', error);
          }
        },
        
        requestAuthState: function() {
          return new Promise((resolve) => {
            const listener = (event) => {
              try {
                if (event.data?.type === 'moodchat-auth-state-response') {
                  window.removeEventListener('message', listener);
                  resolve(event.data.data);
                }
              } catch (error) {
                console.error('⚠️ Error in auth state response:', error);
                resolve({ user: null, isAuthenticated: false });
              }
            };
            window.addEventListener('message', listener);
            
            this.sendToParent('moodchat-iframe-auth-request');
            
            // Timeout after 5 seconds
            setTimeout(() => {
              window.removeEventListener('message', listener);
              console.warn('⚠️ Auth state request timeout');
              resolve({ user: null, isAuthenticated: false });
            }, 5000);
          });
        },
        
        requestData: function(key) {
          return new Promise((resolve) => {
            const listener = (event) => {
              try {
                if (event.data?.type === 'moodchat-data-response' && event.data.key === key) {
                  window.removeEventListener('message', listener);
                  resolve(event.data.data);
                }
              } catch (error) {
                console.error('⚠️ Error in data response:', error);
                resolve(null);
              }
            };
            window.addEventListener('message', listener);
            
            this.sendToParent('moodchat-iframe-data-request', { key: key });
            
            // Timeout after 5 seconds
            setTimeout(() => {
              window.removeEventListener('message', listener);
              console.warn(`⚠️ Data request timeout for key: ${key}`);
              resolve(null);
            }, 5000);
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
    
    // Create minimal iframe API when full setup fails
    createMinimalIframeAPI: function() {
      console.log('🛠️ Creating minimal iframe API stub...');
      
      window.MoodChatIframes = new Map();
      window.MoodChatIframeAPI = {
        sendToParent: function() {
          console.warn('⚠️ Iframe API limited - sendToParent not available');
        },
        requestAuthState: function() {
          return Promise.resolve({ user: null, isAuthenticated: false });
        },
        requestData: function() {
          return Promise.resolve(null);
        }
      };
    },
    
    // Handle iframe ready
    handleIframeReady: function(iframeWindow, data) {
      try {
        console.log('🖼️ Iframe ready:', data.iframeId);
        
        // Store iframe reference
        window.MoodChatIframes.set(data.iframeId, {
          window: iframeWindow,
          id: data.iframeId,
          ready: true,
          lastActive: Date.now()
        });
        
        // Send initial state to iframe
        this.sendInitialStateToIframe(iframeWindow);
      } catch (error) {
        console.error('⚠️ Error handling iframe ready:', error);
      }
    },
    
    // Handle iframe auth request
    handleIframeAuthRequest: function(iframeWindow, data) {
      try {
        console.log('🔐 Iframe auth request');
        
        const authData = this.safeGetAuthData();
        
        // Send auth state to iframe
        iframeWindow.postMessage({
          type: 'moodchat-auth-state-response',
          data: {
            user: authData.user,
            isAuthenticated: authData.isAuthenticated,
            validated: authData.user?.validated || false,
            timestamp: new Date().toISOString()
          }
        }, '*');
      } catch (error) {
        console.error('⚠️ Error handling iframe auth request:', error);
      }
    },
    
    // Handle iframe data request
    handleIframeDataRequest: function(iframeWindow, data) {
      try {
        console.log('📊 Iframe data request:', data.key);
        
        let responseData = null;
        
        // Get requested data with safety checks
        switch(data.key) {
          case 'userProfile':
            responseData = window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null);
            break;
          case 'settings':
            responseData = typeof SETTINGS_SERVICE !== 'undefined' && SETTINGS_SERVICE.current ? SETTINGS_SERVICE.current : {};
            break;
          case 'networkStatus':
            responseData = {
              status: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                      API_COORDINATION.getNetworkStatus() : 'unknown',
              backendReachable: window.MoodChatConfig?.backendReachable,
              isOnline: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                       API_COORDINATION.getNetworkStatus() === 'online' : false
            };
            break;
          default:
            // Try to get from cache
            if (typeof DATA_CACHE !== 'undefined' && DATA_CACHE.getInstant) {
              responseData = DATA_CACHE.getInstant(data.key);
            }
        }
        
        // Send response
        iframeWindow.postMessage({
          type: 'moodchat-data-response',
          key: data.key,
          data: responseData,
          timestamp: new Date().toISOString()
        }, '*');
      } catch (error) {
        console.error('⚠️ Error handling iframe data request:', error);
      }
    },
    
    // Handle iframe action
    handleIframeAction: function(iframeWindow, data) {
      try {
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
      } catch (error) {
        console.error('⚠️ Error handling iframe action:', error);
      }
    },
    
    // Handle iframe navigation
    handleIframeNavigate: function(data) {
      try {
        console.log('🧭 Iframe navigation request:', data.target);
        
        if (data.target) {
          this.navigateTo(data.target);
        }
      } catch (error) {
        console.error('⚠️ Error handling iframe navigation:', error);
      }
    },
    
    // Send initial state to iframe
    sendInitialStateToIframe: function(iframeWindow) {
      try {
        const authData = this.safeGetAuthData();
        
        const initialState = {
          type: 'moodchat-initial-state',
          auth: {
            user: authData.user,
            isAuthenticated: authData.isAuthenticated,
            validated: authData.user?.validated || false
          },
          network: {
            status: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                    API_COORDINATION.getNetworkStatus() : 'unknown',
            backendReachable: window.MoodChatConfig?.backendReachable,
            isOnline: typeof API_COORDINATION !== 'undefined' && API_COORDINATION.getNetworkStatus ? 
                     API_COORDINATION.getNetworkStatus() === 'online' : false
          },
          settings: typeof SETTINGS_SERVICE !== 'undefined' && SETTINGS_SERVICE.current ? 
                   SETTINGS_SERVICE.current : {},
          bootstrap: BOOTSTRAP_STATE.getStatusReport(),
          timestamp: new Date().toISOString()
        };
        
        iframeWindow.postMessage(initialState, '*');
      } catch (error) {
        console.error('⚠️ Error sending initial state to iframe:', error);
      }
    },
    
    // Safe get auth data method
    safeGetAuthData: function() {
      try {
        return {
          user: window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
          isAuthenticated: !!(window.currentUser || (typeof AUTH_STATE !== 'undefined' && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())),
          token: typeof AUTH_STATE !== 'undefined' && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null
        };
      } catch (error) {
        console.warn('⚠️ Failed to get auth data:', error.message);
        return { user: null, isAuthenticated: false, token: null };
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
      window.MoodChatEvents = {
        listeners: new Map(),
        
        on: function(eventName, callback) {
          try {
            if (!this.listeners.has(eventName)) {
              this.listeners.set(eventName, []);
            }
            this.listeners.get(eventName).push(callback);
            
            // Also add to window event listener for backward compatibility
            window.addEventListener(eventName, callback);
          } catch (error) {
            console.error(`⚠️ Failed to add event listener for ${eventName}:`, error);
          }
        },
        
        off: function(eventName, callback) {
          try {
            if (this.listeners.has(eventName)) {
              const callbacks = this.listeners.get(eventName);
              const index = callbacks.indexOf(callback);
              if (index > -1) {
                callbacks.splice(index, 1);
              }
            }
            
            window.removeEventListener(eventName, callback);
          } catch (error) {
            console.error(`⚠️ Failed to remove event listener for ${eventName}:`, error);
          }
        },
        
        emit: function(eventName, data) {
          try {
            const event = new CustomEvent(eventName, {
              detail: data,
              bubbles: true,
              cancelable: true
            });
            window.dispatchEvent(event);
          } catch (error) {
            console.error(`⚠️ Failed to emit event ${eventName}:`, error);
          }
        },
        
        once: function(eventName, callback) {
          try {
            const onceCallback = (event) => {
              callback(event.detail);
              this.off(eventName, onceCallback);
            };
            this.on(eventName, onceCallback);
          } catch (error) {
            console.error(`⚠️ Failed to add once listener for ${eventName}:`, error);
          }
        }
      };
      
      // Setup global event logger (development only)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        try {
          const originalDispatch = window.dispatchEvent;
          window.dispatchEvent = function(event) {
            if (event.type.startsWith('moodchat-')) {
              console.log(`📡 Event: ${event.type}`, event.detail || '');
            }
            return originalDispatch.call(this, event);
          };
        } catch (error) {
          console.error('⚠️ Failed to setup event logger:', error);
        }
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
    
    // Trigger background sync
    triggerBackgroundSync: function() {
      console.log('🔄 Triggering background sync if available...');
      
      try {
        // Check for modular API background sync
        if (window.api && window.api.core && window.api.core.syncBackgroundTasks) {
          window.api.core.syncBackgroundTasks();
          console.log('✅ Background sync triggered');
        }
      } catch (error) {
        console.log('⚠️ Background sync failed:', error);
      }
      
      try {
        // Check for request queue processing
        if (window.api && window.api.request && window.api.request.processQueue) {
          window.api.request.processQueue();
          console.log('✅ Request queue processing triggered');
        }
      } catch (error) {
        console.log('⚠️ Request queue processing failed:', error);
      }
      
      try {
        // Check for caching features
        if (window.api && window.api.request && window.api.request.prefetchCriticalResources) {
          window.api.request.prefetchCriticalResources();
          console.log('✅ Resource prefetch triggered');
        }
      } catch (error) {
        console.log('⚠️ Resource prefetch failed:', error);
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
        const errorKey = `global-error:${event.filename}:${event.lineno}`;
        if (ERROR_TRACKER.shouldLog(errorKey, event.message)) {
          console.error('🚨 Global error caught:', event.error);
          
          // Don't show error for missing resources
          if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT')) {
            return;
          }
          
          // Show user-friendly error
          this.showErrorToUser('An unexpected error occurred. The app will continue to work in limited mode.');
          
          // Dispatch error event for other components
          const errorEvent = new CustomEvent('moodchat-global-error', {
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
        }
      });
      
      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        const errorKey = `promise-rejection:${event.reason?.message || 'unknown'}`;
        if (ERROR_TRACKER.shouldLog(errorKey, 'unhandledrejection')) {
          console.error('🚨 Unhandled promise rejection:', event.reason);
          
          // Show user-friendly error
          this.showErrorToUser('An operation failed. Please try again.');
          
          // Dispatch error event
          const errorEvent = new CustomEvent('moodchat-unhandled-rejection', {
            detail: {
              reason: event.reason,
              promise: event.promise,
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(errorEvent);
        }
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
      try {
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
      } catch (error) {
        console.error('⚠️ Failed to show error to user:', error);
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
      
      try {
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
      } catch (error) {
        console.error('⚠️ Session monitoring setup failed:', error);
      }
    },
    
    // Check session validity
    checkSessionValidity: function() {
      try {
        if (typeof AUTH_STATE === 'undefined' || !AUTH_STATE.hasToken) {
          return;
        }
        
        const hasToken = AUTH_STATE.hasToken();
        if (!hasToken) {
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
              }).catch(error => {
                console.error('⚠️ Token refresh error:', error);
              });
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Session validity check failed:', error);
      }
    },
    
    // Handle user inactivity
    handleUserInactivity: function() {
      try {
        console.log('⏰ User inactive for 30 minutes');
        
        // Show inactivity warning
        if (typeof window.showNotification === 'function') {
          window.showNotification('You have been inactive for 30 minutes. Session will expire soon.', 'warning', 10000);
        }
        
        // Dispatch inactivity event
        const event = new CustomEvent('moodchat-user-inactivity', {
          detail: {
            duration: '30m',
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.error('⚠️ User inactivity handler failed:', error);
      }
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
      
      try {
        // Only in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          // Monitor load times
          window.addEventListener('load', () => {
            try {
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
            } catch (error) {
              console.error('⚠️ Performance metrics collection failed:', error);
            }
          });
          
          // Monitor memory usage (if supported)
          if (performance.memory) {
            setInterval(() => {
              try {
                const memory = performance.memory;
                console.log(`📊 Memory usage:
                  - Used JS heap: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB
                  - Total JS heap: ${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB
                  - Heap limit: ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB
                `);
              } catch (error) {
                console.error('⚠️ Memory monitoring failed:', error);
              }
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
      } catch (error) {
        console.error('⚠️ Performance monitoring setup failed:', error);
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
      try {
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
      } catch (fatalError) {
        console.error('❌ Even fatal error screen failed:', fatalError);
        document.body.innerHTML = '<h1>Critical Error</h1><p>Please refresh the page.</p>';
      }
    },
    
    // Hide loading screen
    hideLoadingScreen: function() {
      try {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
          loadingScreen.classList.add('hidden');
          setTimeout(() => {
            if (loadingScreen.parentNode) {
              loadingScreen.parentNode.removeChild(loadingScreen);
            }
          }, 300);
        }
      } catch (error) {
        console.error('⚠️ Failed to hide loading screen:', error);
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
          window.removeEventListener('moodchat-bootstrap-complete', successHandler);
          window.removeEventListener('moodchat-bootstrap-complete', errorHandler);
          resolve();
        };
        
        const errorHandler = (event) => {
          if (!event.detail.success) {
            window.removeEventListener('moodchat-bootstrap-complete', successHandler);
            window.removeEventListener('moodchat-bootstrap-complete', errorHandler);
            reject(new Error(event.detail.message));
          }
        };
        
        window.addEventListener('moodchat-bootstrap-complete', successHandler);
        window.addEventListener('moodchat-bootstrap-complete', errorHandler);
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
  
  // Note: SESSION_COORDINATOR is excluded from this file as it belongs in session layer
  
  // ============================================================================
  // MAIN EXECUTION ENGINE - PHASE 7: STARTUP TRIGGER
  // ============================================================================
  
  // Ensure backward compatibility
  function ensureBackwardCompatibility() {
    console.log('🔄 Ensuring backward compatibility...');
    
    try {
      // Legacy function fallbacks
      if (typeof window.toggleSidebar === 'undefined') {
        window.toggleSidebar = function() {
          console.log('📐 Legacy toggleSidebar called');
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) {
            sidebar.classList.toggle('collapsed');
          }
        };
      }
      
      if (typeof window.switchTab === 'undefined') {
        window.switchTab = function(tabName) {
          console.log('🧭 Legacy switchTab called:', tabName);
          APP_BOOTSTRAP.loadPageSafely(tabName);
        };
      }
      
      if (typeof window.loadExternalTab === 'undefined') {
        window.loadExternalTab = function(tabName, filePath) {
          console.log('📄 Legacy loadExternalTab called:', tabName, filePath);
          APP_BOOTSTRAP.loadPageSafely(tabName);
        };
      }
      
      // Ensure showNotification exists
      if (typeof window.showNotification === 'undefined') {
        window.showNotification = function(message, type = 'info', duration = 5000) {
          console.log(`🔔 Legacy showNotification called: ${message}`);
          return APP_BOOTSTRAP.showErrorToUser(message, type, duration);
        };
      }
      
      console.log('✅ Backward compatibility ensured');
    } catch (error) {
      console.error('⚠️ Backward compatibility setup failed:', error);
    }
  }
  
  // Initialize enhanced app
  window.initializeEnhancedApp = function() {
    console.log('🚀 Initializing enhanced application...');
    
    // Check authentication before starting
    const isLoggedIn = userLoggedIn();
    const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;
    
    if (!isLoggedIn && !isPublicPage) {
      console.log('🔐 Authentication required, redirecting to login before initializing app');
      APP_BOOTSTRAP.redirectToAuth('Authentication required');
      return Promise.reject(new Error('Authentication required'));
    }
    
    // Ensure backward compatibility first
    ensureBackwardCompatibility();
    
    // Start bootstrap process
    return APP_BOOTSTRAP.bootstrap();
  };
  
  // Auto-start if DOM is already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📄 DOM ready, starting enhanced app bootstrap');
      window.initializeEnhancedApp().catch(error => {
        console.error('❌ Auto-start failed:', error);
      });
    });
  } else {
    console.log('📄 DOM already ready, starting enhanced app bootstrap');
    window.initializeEnhancedApp().catch(error => {
      console.error('❌ Auto-start failed:', error);
    });
  }
  
  // Export safe utilities
  window.safeAsync = async function(operation, errorHandler) {
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
  };
  
  window.safeEvent = function(element, eventType, handler) {
    if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(eventType, handler);
      return true;
    }
    return false;
  };
  
  window.safeDOM = function(selector, callback) {
    const element = document.querySelector(selector);
    if (element && typeof callback === 'function') {
      callback(element);
      return element;
    }
    return null;
  };
  
  // ============================================================================
  // OPTIONAL MODULE SAFETY HANDLING
  // ============================================================================
  
  // Safe wrapper for optional UI modules
  function safeLoadOptionalModule(moduleName, loadFunction) {
    try {
      console.log(`🔧 Loading optional module: ${moduleName}`);
      loadFunction();
      console.log(`✅ Optional module loaded: ${moduleName}`);
    } catch (error) {
      const errorKey = `optional-module:${moduleName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.warn(`⚠️ Optional module ${moduleName} failed to load:`, error.message);
      }
      // Continue without this optional module
    }
  }
  
  // Example usage for optional modules (to be called by other parts of the app)
  window.safeLoadOptionalModule = safeLoadOptionalModule;
  
  console.log('✅ app.core.bootstrap.js loaded successfully with enhanced safety features');
})();