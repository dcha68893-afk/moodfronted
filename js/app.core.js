// app.core.js - MoodChat Core Services & Bootstrapping
// UPDATED: Network status waits for api.js health check completion
// FIXED: Never show "Offline" before api.js completes health check
// ENHANCED: Background validation with proper network coordination
// UPDATED: AbortError does not trigger offline mode - keep backend status as "checking"
// FIXED: Removed duplicate isOnline declaration to avoid SyntaxError
// FIXED: Wrapped in IIFE to avoid global scope pollution and conflicts
// FIXED: Global collision prevention - removed all isOnline declarations
// ENHANCED: Reduced console noise for periodic network polling - only log on status changes
// UPDATED: Auth restoration logic - only mark user as authenticated if /auth/me succeeds
// UPDATED: Proper /auth/me route mounting and middleware integration
// FIXED: Application initialization order - wait for auth validation before fallback
// ADDED: Token validation on startup to check localStorage for accessToken and redirect if missing/expired
// CRITICAL FIX: Refresh-safe bootstrap - wait for /auth/me validation before loading UI
// CRITICAL FIX: Bootstrapping order - UI renders immediately, auth happens in background

(function () {
  // ============================================================================
  // GLOBAL AUTH READY FLAG - ADDED FOR REFRESH-SAFE BOOTSTRAP
  // ============================================================================
  
  // Single source of truth for auth readiness
  window.AUTH_READY = false;
  
  // Store pending iframe/UI operations that need to wait for auth
  window.AUTH_PENDING_OPERATIONS = [];
  
  // Function to execute pending operations when auth is ready
  function executePendingAuthOperations() {
    if (window.AUTH_READY && window.AUTH_PENDING_OPERATIONS.length > 0) {
      console.log(`Executing ${window.AUTH_PENDING_OPERATIONS.length} pending operations...`);
      window.AUTH_PENDING_OPERATIONS.forEach(operation => {
        try {
          operation();
        } catch (error) {
          console.error('Error executing pending operation:', error);
        }
      });
      window.AUTH_PENDING_OPERATIONS = [];
    }
  }
  
  // Function to queue operations until auth is ready
  function queueUntilAuthReady(operation) {
    if (window.AUTH_READY) {
      operation();
    } else {
      window.AUTH_PENDING_OPERATIONS.push(operation);
    }
  }

  // ============================================================================
  // TOKEN VALIDATION ON STARTUP - UPDATED FOR REFRESH-SAFE BOOTSTRAP
  // ============================================================================
  
  // Validate stored token on app start to ensure user is authenticated
  function validateTokenOnStartup() {
    console.log('🔐 Validating stored token on app startup...');
    
    // Check if we're already on login page - if so, skip validation
    if (window.location.pathname.endsWith('index.html') || 
        window.location.pathname.endsWith('/') ||
        window.location.pathname.includes('/login')) {
      console.log('On login page, skipping token validation');
      return;
    }
    
    // Check for accessToken in localStorage (same logic as api.js)
    const accessToken = localStorage.getItem('accessToken');
    const moodchatToken = localStorage.getItem('moodchat_jwt_token');
    
    // If no token exists at all, redirect to login immediately
    if (!accessToken && !moodchatToken) {
      console.log('❌ No auth tokens found in localStorage, redirecting to login');
      localStorage.clear();
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 100);
      return;
    }
    
    // CRITICAL: Do NOT assume token is valid just because it exists
    // We'll validate via /auth/me API call later
    console.log('Token found, will validate via /auth/me API');
    
    // Ensure token is available for api.js
    ensureTokenForApiJs(accessToken || moodchatToken);
  }
  
  // Check if token refresh is needed
  function checkTokenRefreshNeeded() {
    console.log('🔄 Checking if token refresh is needed...');
    
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiresAt = localStorage.getItem('tokenExpiresAt');
    
    if (!accessToken || !tokenExpiresAt) {
      console.log('No token or expiry info available for refresh check');
      return;
    }
    
    const expiresDate = new Date(tokenExpiresAt);
    const now = new Date();
    const timeUntilExpiry = expiresDate - now;
    
    // If token expires in less than 15 minutes, try to refresh
    if (timeUntilExpiry < 15 * 60 * 1000) {
      console.log('Token expires soon, attempting refresh...');
      attemptTokenRefresh(accessToken);
    } else {
      console.log(`Token still valid for ${Math.floor(timeUntilExpiry / (1000 * 60))} minutes`);
      
      // Schedule next check
      const nextCheckDelay = Math.max(30000, timeUntilExpiry - (30 * 60 * 1000));
      setTimeout(checkTokenRefreshNeeded, nextCheckDelay);
    }
  }
  
  // Attempt to refresh the token
  function attemptTokenRefresh(currentToken) {
    console.log('Attempting token refresh...');
    
    // Check if api.js is available for token refresh
    if (typeof window.api === 'function' || window.MoodChatConfig?.api) {
      console.log('Using api.js for token refresh');
      
      const apiFunction = window.MoodChatConfig?.api || window.api;
      
      // Try to refresh the token
      apiFunction('/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      })
      .then(response => {
        if (response && response.success && response.data && response.data.token) {
          // Store new token
          localStorage.setItem('accessToken', response.data.token);
          
          // Update expiry if provided
          if (response.data.expiresAt || response.data.expiresIn) {
            let newExpiresAt;
            if (response.data.expiresAt) {
              newExpiresAt = response.data.expiresAt;
            } else if (response.data.expiresIn) {
              // Calculate expiry from seconds
              const expiresInMs = response.data.expiresIn * 1000;
              newExpiresAt = new Date(Date.now() + expiresInMs).toISOString();
            }
            localStorage.setItem('tokenExpiresAt', newExpiresAt);
            console.log('✅ Token refreshed successfully');
          }
        } else {
          console.log('Token refresh failed, will require re-login');
          // Schedule check for when token actually expires
          const tokenExpiresAt = localStorage.getItem('tokenExpiresAt');
          if (tokenExpiresAt) {
            const expiresDate = new Date(tokenExpiresAt);
            const timeUntilExpiry = expiresDate - Date.now();
            setTimeout(() => {
              validateTokenOnStartup();
            }, Math.max(1000, timeUntilExpiry));
          }
        }
      })
      .catch(error => {
        console.log('Token refresh error:', error.message);
        // Schedule check for when token actually expires
        const tokenExpiresAt = localStorage.getItem('tokenExpiresAt');
        if (tokenExpiresAt) {
          const expiresDate = new Date(tokenExpiresAt);
          const timeUntilExpiry = expiresDate - Date.now();
          setTimeout(() => {
            validateTokenOnStartup();
          }, Math.max(1000, timeUntilExpiry));
        }
      });
    } else {
      console.log('api.js not available for token refresh');
      // Schedule check for when token actually expires
      const tokenExpiresAt = localStorage.getItem('tokenExpiresAt');
      if (tokenExpiresAt) {
        const expiresDate = new Date(tokenExpiresAt);
        const timeUntilExpiry = expiresDate - Date.now();
        setTimeout(() => {
          validateTokenOnStartup();
        }, Math.max(1000, timeUntilExpiry));
      }
    }
  }
  
  // Ensure token is available for api.js
  function ensureTokenForApiJs(accessToken) {
    // If api.js expects token in a specific format or location, ensure it's available
    console.log('Ensuring token is available for api.js...');
    
    // Also store in MoodChat JWT token location for compatibility
    if (!localStorage.getItem('moodchat_jwt_token') && accessToken) {
      localStorage.setItem('moodchat_jwt_token', accessToken);
      console.log('Token also stored in moodchat_jwt_token for compatibility');
    }
  }
  
  // Run token validation immediately when script loads
  // (before any other initialization)
  validateTokenOnStartup();

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
  // API.JS COORDINATION & WAIT SYSTEM - UPDATED
  // ============================================================================

  // Global promise for API readiness
  window.MoodChatAPIReady = window.MoodChatAPIReady || new Promise((resolve, reject) => {
    console.log('Creating MoodChatAPIReady promise...');
    
    // Store resolve/reject functions globally so api.js can trigger them
    window.__MOODCHAT_API_RESOLVE = resolve;
    window.__MOODCHAT_API_REJECT = reject;
    
    // Set a safety timeout (60 seconds) in case something goes wrong
    setTimeout(() => {
      if (!window.__MOODCHAT_API_READY) {
        console.warn('⚠️ API.js not detected within 60 seconds, continuing without it');
        window.__MOODCHAT_API_READY = false;
        window.__MOODCHAT_API_EVENTS = window.__MOODCHAT_API_EVENTS || [];
        window.__MOODCHAT_API_EVENTS.push('timeout');
        resolve(false);
      }
    }, 60000);
  });

  // Initialize global config - ADDED: networkStatus to track UI state
  window.MoodChatConfig = window.MoodChatConfig || {
    backendReachable: null, // Changed: null means "not checked yet"
    api: null,
    healthChecked: false,
    initialized: false,
    networkStatus: 'checking', // NEW: 'checking', 'online', 'offline'
    lastLoggedBackendStatus: null, // NEW: Track last logged status to reduce noise
    lastHealthCheckTime: 0, // NEW: Track last health check time
    healthCheckInterval: null, // NEW: Store interval reference
    authRoutesMounted: false, // NEW: Track if auth routes are mounted
    authMiddlewareLoaded: false, // NEW: Track if auth middleware is loaded
    authValidationInProgress: false // NEW: Track if auth validation is in progress
  };

  const API_COORDINATION = {
    MAX_POLL_ATTEMPTS: 30, // 30 attempts * 100ms = 3 seconds max polling
    POLL_INTERVAL: 100, // Check every 100ms
    apiReady: false,
    apiCheckComplete: false,
    waitPromise: null,
    pollAttempts: 0,
    healthCheckInProgress: false, // NEW: Track health check status
    lastBackendStatus: null, // NEW: Track last known backend status to detect changes
    healthCheckCount: 0, // NEW: Count health checks for debugging
    
    // Wait for window.api to be available using multiple detection methods
    waitForApi: function() {
      if (this.apiCheckComplete) {
        return Promise.resolve(this.apiReady);
      }
      
      if (this.waitPromise) {
        return this.waitPromise;
      }
      
      this.waitPromise = new Promise((resolve) => {
        console.log('🔍 Waiting for api.js to load using multiple detection methods...');
        
        const checkApi = () => {
          // METHOD 1: Check if api.js is loaded (window.api exists and is a function)
          if (typeof window.api === 'function') {
            console.log('✅ api.js loaded successfully (window.api detected)');
            this.handleApiDetected();
            resolve(true);
            return true;
          }
          
          // METHOD 2: Check if global promise was already resolved
          if (window.__MOODCHAT_API_READY === true) {
            console.log('✅ api.js ready via global flag');
            this.handleApiDetected();
            resolve(true);
            return true;
          }
          
          // METHOD 3: Check stored events array
          if (window.__MOODCHAT_API_EVENTS && window.__MOODCHAT_API_EVENTS.includes('ready')) {
            console.log('✅ api.js ready via stored events');
            this.handleApiDetected();
            resolve(true);
            return true;
          }
          
          // METHOD 4: Check for api instance in config
          if (window.MoodChatConfig && window.MoodChatConfig.api) {
            console.log('✅ api.js ready via MoodChatConfig.api');
            this.handleApiDetected();
            resolve(true);
            return true;
          }
          
          return false;
        };
        
        // Try immediate check first
        if (checkApi()) {
          return;
        }
        
        // METHOD 5: Set up event listeners for multiple event types
        const eventTypes = ['api-ready', 'apiready', 'apiReady', 'moodchat-api-ready'];
        
        eventTypes.forEach(eventType => {
          window.addEventListener(eventType, () => {
            console.log(`✅ api.js ready via ${eventType} event`);
            this.handleApiDetected();
            resolve(true);
          }, { once: true });
        });
        
        // METHOD 6: Poll for api.js (fallback method)
        const startPolling = () => {
          console.log('Starting polling for api.js...');
          
          const pollInterval = setInterval(() => {
            this.pollAttempts++;
            
            if (checkApi()) {
              clearInterval(pollInterval);
              return;
            }
            
            // Check if we've exceeded max attempts
            if (this.pollAttempts >= this.MAX_POLL_ATTEMPTS) {
              clearInterval(pollInterval);
              console.log('⚠️ api.js polling completed without detection, some features may be limited');
              this.apiReady = false;
              this.apiCheckComplete = true;
              resolve(false);
            }
          }, this.POLL_INTERVAL);
        };
        
        // Start polling after a short delay
        setTimeout(startPolling, 50);
      });
      
      return this.waitPromise;
    },
    
    // Handle API detection
    handleApiDetected: function() {
      this.apiReady = true;
      this.apiCheckComplete = true;
      
      // Store api instance in config
      if (typeof window.api === 'function') {
        window.MoodChatConfig.api = window.api;
      }
      
      // Mark as ready in global state
      window.__MOODCHAT_API_READY = true;
      
      // Resolve global promise if not already resolved
      if (window.__MOODCHAT_API_RESOLVE) {
        window.__MOODCHAT_API_RESOLVE(true);
        window.__MOODCHAT_API_RESOLVE = null;
      }
      
      // Start health check in background (NON-BLOCKING)
      setTimeout(() => {
        this.checkBackendHealth();
      }, 100);
      
      // Start periodic health checks with reduced logging
      this.startPeriodicHealthChecks();
      
      // NEW: Ensure auth routes are properly mounted
      this.ensureAuthRoutesMounted();
    },
    
    // NEW: Ensure auth routes are properly mounted and protected
    ensureAuthRoutesMounted: async function() {
      console.log('🔄 Ensuring auth routes are properly mounted...');
      
      try {
        // Check if auth routes are already mounted
        if (window.MoodChatConfig.authRoutesMounted) {
          console.log('✅ Auth routes already mounted');
          return true;
        }
        
        // Wait for backend to be reachable
        await this.waitForBackendReady();
        
        if (!window.MoodChatConfig.backendReachable) {
          console.log('⚠️ Backend not reachable, cannot mount auth routes');
          return false;
        }
        
        console.log('🔄 Verifying /auth/me route is mounted and protected...');
        
        // Test the /auth/me route with a proper authentication check
        const testResult = await this.verifyAuthMeRoute();
        
        if (testResult.success) {
          window.MoodChatConfig.authRoutesMounted = true;
          console.log('✅ Auth routes successfully verified and mounted');
          return true;
        } else {
          console.log('⚠️ Auth route verification failed:', testResult.message);
          
          // Try to mount auth routes if not already done
          await this.mountAuthRoutes();
          
          // Retry verification
          const retryResult = await this.verifyAuthMeRoute();
          
          if (retryResult.success) {
            window.MoodChatConfig.authRoutesMounted = true;
            console.log('✅ Auth routes mounted and verified after retry');
            return true;
          } else {
            console.log('❌ Failed to mount auth routes after retry:', retryResult.message);
            return false;
          }
        }
      } catch (error) {
        console.log('❌ Error ensuring auth routes are mounted:', error.message);
        return false;
      }
    },
    
    // NEW: Verify /auth/me route is working correctly
    verifyAuthMeRoute: async function() {
      try {
        if (!this.apiReady || !window.MoodChatConfig.api) {
          return { success: false, message: 'API not ready' };
        }
        
        // First check if we have a token
        const token = JWT_VALIDATION.getToken();
        if (!token) {
          console.log('No token available for /auth/me verification');
          return { success: false, message: 'No token available' };
        }
        
        console.log('🔐 Testing /auth/me route with authentication...');
        
        // Make a test request to /auth/me
        const response = await window.MoodChatConfig.api('/auth/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          timeout: 10000,
          silent: true // Don't log errors for testing
        });
        
        // Check response
        if (response && response.success !== false) {
          console.log('✅ /auth/me route is properly mounted and protected');
          return { 
            success: true, 
            message: 'Route is working',
            data: response 
          };
        } else {
          // Check if it's an authentication error (which is expected without valid token)
          if (response && (response.status === 401 || response.status === 403)) {
            console.log('✅ /auth/me route is mounted and properly rejecting invalid tokens');
            return { 
              success: true, 
              message: 'Route is rejecting invalid tokens as expected',
              status: response.status 
            };
          } else {
            console.log('⚠️ /auth/me route returned unexpected response:', response);
            return { 
              success: false, 
              message: response?.message || 'Unexpected response',
              response: response 
            };
          }
        }
      } catch (error) {
        // Check if it's a network error or route not found
        if (error.message && error.message.includes('404') || error.message.includes('Not Found')) {
          console.log('⚠️ /auth/me route not found (404)');
          return { 
            success: false, 
            message: 'Route not found (404)',
            error: error.message 
          };
        } else if (error.message && error.message.includes('Network')) {
          console.log('⚠️ Network error accessing /auth/me');
          return { 
            success: false, 
            message: 'Network error',
            error: error.message 
          };
        } else {
          console.log('⚠️ Error testing /auth/me:', error.message);
          return { 
            success: false, 
            message: error.message || 'Unknown error',
            error: error 
          };
        }
      }
    },
    
    // NEW: Mount auth routes if not already mounted
    mountAuthRoutes: async function() {
      console.log('🔄 Attempting to mount auth routes...');
      
      try {
        if (!this.apiReady || !window.MoodChatConfig.api) {
          return { success: false, message: 'API not ready' };
        }
        
        // Try to mount auth routes by making a special request
        const mountResponse = await window.MoodChatConfig.api('/admin/mount-auth-routes', {
          method: 'POST',
          timeout: 5000,
          silent: true
        });
        
        if (mountResponse && mountResponse.success) {
          console.log('✅ Auth routes mounted successfully');
          return { success: true, message: 'Routes mounted', data: mountResponse };
        } else {
          console.log('⚠️ Could not mount auth routes via admin endpoint');
          
          // Try alternative mounting method
          return await this.mountAuthRoutesAlternative();
        }
      } catch (error) {
        console.log('⚠️ Error mounting auth routes:', error.message);
        return { success: false, message: error.message, error: error };
      }
    },
    
    // NEW: Alternative method to mount auth routes
    mountAuthRoutesAlternative: async function() {
      console.log('🔄 Trying alternative auth route mounting...');
      
      try {
        // Check if we can access the health endpoint (which should always work)
        const healthResponse = await window.MoodChatConfig.api('/health', {
          method: 'GET',
          timeout: 5000,
          silent: true
        });
        
        if (healthResponse && healthResponse.success !== false) {
          console.log('✅ Backend health check successful, auth routes should be available');
          
          // Wait a moment for routes to initialize
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify routes are now available
          const verifyResult = await this.verifyAuthMeRoute();
          
          if (verifyResult.success) {
            return { success: true, message: 'Auth routes verified after health check' };
          } else {
            return { 
              success: false, 
              message: 'Auth routes still not available after health check',
              details: verifyResult 
            };
          }
        } else {
          return { success: false, message: 'Health check failed, cannot mount auth routes' };
        }
      } catch (error) {
        console.log('⚠️ Alternative mounting failed:', error.message);
        return { success: false, message: error.message, error: error };
      }
    },
    
    // NEW: Wait for backend to be ready
    waitForBackendReady: async function() {
      return new Promise((resolve) => {
        // If backend is already reachable, resolve immediately
        if (window.MoodChatConfig.backendReachable === true) {
          resolve(true);
          return;
        }
        
        // If backend is confirmed unreachable, reject
        if (window.MoodChatConfig.backendReachable === false) {
          resolve(false);
          return;
        }
        
        // Wait for backend-ready event
        const handleBackendReady = (event) => {
          if (event.detail.reachable === true) {
            window.removeEventListener('moodchat-backend-ready', handleBackendReady);
            window.removeEventListener('moodchat-network-status', handleNetworkStatus);
            resolve(true);
          }
        };
        
        // Also listen for network status
        const handleNetworkStatus = (event) => {
          if (event.detail.status === 'online' && window.MoodChatConfig.backendReachable === true) {
            window.removeEventListener('moodchat-backend-ready', handleBackendReady);
            window.removeEventListener('moodchat-network-status', handleNetworkStatus);
            resolve(true);
          } else if (event.detail.status === 'offline') {
            window.removeEventListener('moodchat-backend-ready', handleBackendReady);
            window.removeEventListener('moodchat-network-status', handleNetworkStatus);
            resolve(false);
          }
        };
        
        window.addEventListener('moodchat-backend-ready', handleBackendReady);
        window.addEventListener('moodchat-network-status', handleNetworkStatus);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          window.removeEventListener('moodchat-backend-ready', handleBackendReady);
          window.removeEventListener('moodchat-network-status', handleNetworkStatus);
          resolve(false);
        }, 10000);
      });
    },
    
    // Start periodic health checks with intelligent logging
    startPeriodicHealthChecks: function() {
      // Clear any existing interval
      if (window.MoodChatConfig.healthCheckInterval) {
        clearInterval(window.MoodChatConfig.healthCheckInterval);
      }
      
      // Start periodic health checks (every 30 seconds)
      window.MoodChatConfig.healthCheckInterval = setInterval(() => {
        this.healthCheckCount++;
        
        // Only log every 10th check or if it's been a while
        if (this.healthCheckCount % 10 === 0) {
          console.log(`🔄 Periodic health check #${this.healthCheckCount} running...`);
        }
        
        this.checkBackendHealthSilent();
      }, 30000); // 30 seconds
      
      console.log('✅ Periodic health checks started (30s interval)');
    },
    
    // Check backend health using api.js - UPDATED: AbortError does not mark backend as unreachable
    checkBackendHealth: async function() {
      if (!this.apiReady || !window.MoodChatConfig.api) {
        console.log('Skipping health check: api.js not ready');
        window.MoodChatConfig.backendReachable = false;
        window.MoodChatConfig.networkStatus = 'offline';
        return false;
      }
      
      // Prevent duplicate health checks
      if (this.healthCheckInProgress) {
        console.log('Health check already in progress');
        return false;
      }
      
      this.healthCheckInProgress = true;
      
      try {
        console.log('🩺 Starting backend health check...');
        
        // Set initial network status to "checking"
        window.MoodChatConfig.networkStatus = 'checking';
        
        // Notify UI that we're checking connection
        this.notifyNetworkStatus('checking', 'Checking backend connection...');
        
        // Try to call health endpoint with timeout
        const healthResponse = await window.MoodChatConfig.api('/health', { 
          method: 'GET',
          timeout: 5000 // 5 second timeout
        });
        
        if (healthResponse && healthResponse.success !== false) {
          const previousStatus = window.MoodChatConfig.backendReachable;
          window.MoodChatConfig.backendReachable = true;
          window.MoodChatConfig.healthChecked = true;
          window.MoodChatConfig.networkStatus = 'online';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== true) {
            console.log('✅ Backend reachable: true (status changed)');
          }
          
          // Notify UI
          this.notifyNetworkStatus('online', 'Connected to backend');
          
          // Dispatch event for other components
          const event = new CustomEvent('moodchat-backend-ready', {
            detail: { 
              reachable: true, 
              timestamp: new Date().toISOString(),
              networkStatus: 'online'
            }
          });
          window.dispatchEvent(event);
          
          // NEW: Ensure auth routes are mounted after backend is ready
          setTimeout(() => {
            this.ensureAuthRoutesMounted().catch(err => {
              console.log('⚠️ Auth route mounting after health check failed:', err.message);
            });
          }, 500);
          
          return true;
        } else {
          const previousStatus = window.MoodChatConfig.backendReachable;
          window.MoodChatConfig.backendReachable = false;
          window.MoodChatConfig.networkStatus = 'offline';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== false) {
            console.log('⚠️ Backend health check failed (status changed):', healthResponse);
          }
          
          // Notify UI
          this.notifyNetworkStatus('offline', 'Backend unreachable');
          
          return false;
        }
      } catch (error) {
        // UPDATED: AbortError does not mark backend as unreachable
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
          console.log('🔄 Backend health check aborted (timeout), keeping status as "checking"');
          // Keep backend status as "checking" or unknown - don't mark as offline
          window.MoodChatConfig.backendReachable = null; // null means "unknown/checking"
          window.MoodChatConfig.networkStatus = 'checking';
          
          // Notify UI
          this.notifyNetworkStatus('checking', 'Backend check timed out - retrying');
          
          // Don't dispatch backend-ready event with false, keep checking
          return false;
        } else {
          // Real network failure (DNS, connection refused, etc.)
          const previousStatus = window.MoodChatConfig.backendReachable;
          window.MoodChatConfig.backendReachable = false;
          window.MoodChatConfig.networkStatus = 'offline';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== false) {
            console.log('⚠️ Backend health check error (real network failure, status changed):', error.message);
          }
          
          // Notify UI
          this.notifyNetworkStatus('offline', 'Backend connection failed: ' + error.message);
          
          return false;
        }
      } finally {
        this.healthCheckInProgress = false;
      }
    },
    
    // Silent version of health check for periodic polling - logs only on status changes
    checkBackendHealthSilent: async function() {
      if (!this.apiReady || !window.MoodChatConfig.api) {
        // Only log if this is a significant change
        if (window.MoodChatConfig.backendReachable !== false) {
          console.log('Silent health check: api.js not ready');
        }
        window.MoodChatConfig.backendReachable = false;
        window.MoodChatConfig.networkStatus = 'offline';
        return false;
      }
      
      // Prevent duplicate health checks
      if (this.healthCheckInProgress) {
        return false;
      }
      
      this.healthCheckInProgress = true;
      
      try {
        // Store previous status for comparison
        const previousStatus = window.MoodChatConfig.backendReachable;
        const previousNetworkStatus = window.MoodChatConfig.networkStatus;
        
        // Try to call health endpoint with timeout
        const healthResponse = await window.MoodChatConfig.api('/health', { 
          method: 'GET',
          timeout: 5000,
          silent: true // Add flag for silent requests
        });
        
        if (healthResponse && healthResponse.success !== false) {
          window.MoodChatConfig.backendReachable = true;
          window.MoodChatConfig.healthChecked = true;
          window.MoodChatConfig.networkStatus = 'online';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== true || previousNetworkStatus !== 'online') {
            console.log('✅ Periodic check: Backend reachable (status changed)');
            this.notifyNetworkStatus('online', 'Connected to backend');
          }
          
          return true;
        } else {
          window.MoodChatConfig.backendReachable = false;
          window.MoodChatConfig.networkStatus = 'offline';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== false || previousNetworkStatus !== 'offline') {
            console.log('⚠️ Periodic check: Backend unreachable (status changed)');
            this.notifyNetworkStatus('offline', 'Backend unreachable');
          }
          
          return false;
        }
      } catch (error) {
        // UPDATED: AbortError does not mark backend as unreachable
        if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
          // Don't change status on timeout during periodic checks
          // Only log if we've been in this state for a while
          const timeSinceLastCheck = Date.now() - window.MoodChatConfig.lastHealthCheckTime;
          if (timeSinceLastCheck > 120000) { // 2 minutes
            console.log('🔄 Periodic check: Backend check timed out, status remains checking');
          }
          return false;
        } else {
          // Real network failure
          const previousStatus = window.MoodChatConfig.backendReachable;
          const previousNetworkStatus = window.MoodChatConfig.networkStatus;
          
          window.MoodChatConfig.backendReachable = false;
          window.MoodChatConfig.networkStatus = 'offline';
          window.MoodChatConfig.lastHealthCheckTime = Date.now();
          
          // Only log if status changed
          if (previousStatus !== false || previousNetworkStatus !== 'offline') {
            console.log('⚠️ Periodic check: Network error (status changed):', error.message);
            this.notifyNetworkStatus('offline', 'Backend connection failed');
          }
          
          return false;
        }
      } finally {
        this.healthCheckInProgress = false;
      }
    },
    
    // Notify UI about network status changes
    notifyNetworkStatus: function(status, message) {
      // Only log if status changed or it's an important message
      const currentStatus = window.MoodChatConfig.networkStatus;
      if (currentStatus !== status || message.includes('changed') || message.includes('failed') || message.includes('Connected')) {
        console.log(`Network status: ${status} - ${message}`);
      }
      
      const event = new CustomEvent('moodchat-network-status', {
        detail: {
          status: status,
          message: message,
          backendReachable: window.MoodChatConfig.backendReachable,
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(event);
    },
    
    // Check if api.js is available
    isApiAvailable: function() {
      return this.apiReady && (typeof window.api === 'function' || window.MoodChatConfig.api);
    },
    
    // Check if backend is reachable (read from api.js state or health check)
    // UPDATED: Returns null if not checked yet
    isBackendReachable: function() {
      return window.MoodChatConfig.backendReachable;
    },
    
    // Get current network status for UI
    getNetworkStatus: function() {
      return window.MoodChatConfig.networkStatus || 'checking';
    },
    
    // Make safe API call that works with or without api.js
    safeApiCall: async function(endpoint, options = {}) {
      // Wait for API to be ready
      await this.waitForApi();
      
      if (!this.apiReady) {
        console.log(`API call skipped (api.js not available): ${endpoint}`);
        throw new Error('API service not available');
      }
      
      // NEW: Special handling for /auth/me to ensure proper error handling
      const isAuthMeEndpoint = endpoint === '/auth/me';
      const isAuthEndpoint = endpoint.startsWith('/auth/');
      
      try {
        // Use stored api instance or window.api
        const apiFunction = window.MoodChatConfig.api || window.api;
        if (typeof apiFunction !== 'function') {
          throw new Error('API function not available');
        }
        
        // For auth endpoints, ensure routes are mounted
        if (isAuthEndpoint && !window.MoodChatConfig.authRoutesMounted) {
          console.log(`🔄 Auth endpoint ${endpoint} requested, ensuring auth routes are mounted...`);
          await this.ensureAuthRoutesMounted();
        }
        
        return await apiFunction(endpoint, options);
      } catch (error) {
        // NEW: Enhanced error handling for auth endpoints
        if (isAuthMeEndpoint) {
          console.log(`🔐 /auth/me endpoint error: ${error.message}`);
          
          // Check if it's a 404 (route not mounted)
          if (error.message && error.message.includes('404') || error.message.includes('Not Found')) {
            console.log('⚠️ /auth/me route not found, attempting to mount auth routes...');
            
            // Try to mount auth routes and retry
            try {
              await this.mountAuthRoutes();
              
              // Retry the request
              const apiFunction = window.MoodChatConfig.api || window.api;
              if (typeof apiFunction === 'function') {
                return await apiFunction(endpoint, options);
              }
            } catch (mountError) {
              console.log('❌ Failed to mount auth routes:', mountError.message);
              throw new Error(`Auth route not available: ${mountError.message}`);
            }
          }
          
          // For auth errors (401/403), don't mark backend as unreachable
          if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
            console.log('🔐 Authentication error (expected for invalid/missing tokens)');
            // Re-throw with specific auth error
            throw new Error(`Authentication failed: ${error.message}`);
          }
        }
        
        console.log(`API call failed: ${endpoint}`, error);
        throw error;
      }
    },
    
    // Heartbeat check to confirm real online status
    heartbeatCheck: async function() {
      try {
        await this.safeApiCall('/health', { method: 'GET' });
        return true;
      } catch (error) {
        console.log('Heartbeat check failed:', error);
        return false;
      }
    },
    
    // Get real online status (browser + API heartbeat) - UPDATED: Returns "checking" if not determined
    getRealOnlineStatus: async function() {
      // First check browser online status using safe function
      if (!(window.AppNetwork?.isOnline?.() ?? navigator.onLine)) {
        return 'offline';
      }
      
      // If health check hasn't completed yet, return "checking"
      if (window.MoodChatConfig.networkStatus === 'checking') {
        return 'checking';
      }
      
      // Then verify with API heartbeat (only if api.js is ready and backend reachable)
      if (this.apiReady && window.MoodChatConfig.backendReachable === true) {
        try {
          const reachable = await this.heartbeatCheck();
          return reachable ? 'online' : 'offline';
        } catch (error) {
          // UPDATED: AbortError doesn't count as offline
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.log('🔄 Heartbeat check aborted, status remains checking');
            return 'checking';
          }
          return 'offline';
        }
      }
      
      // If backend not reachable, return offline
      if (window.MoodChatConfig.backendReachable === false) {
        return 'offline';
      }
      
      // If api.js not ready or backend status unknown, rely on browser status
      return (window.AppNetwork?.isOnline?.() ?? navigator.onLine) ? 'online' : 'offline';
    },
    
    // NEW: Validate authentication via /auth/me endpoint with enhanced error handling
    checkAuthMe: async function() {
      try {
        // Wait for API to be ready
        await this.waitForApi();
        
        if (!this.apiReady || !window.MoodChatConfig.api) {
          console.log('Cannot check auth: api.js not ready');
          return { valid: false, reason: 'API service not available' };
        }
        
        // Check if we have a JWT token
        if (!JWT_VALIDATION.hasToken()) {
          console.log('No JWT token found for auth check');
          return { valid: false, reason: 'No token found' };
        }
        
        const token = JWT_VALIDATION.getToken();
        
        try {
          console.log('🔄 Validating authentication via /auth/me endpoint...');
          
          // Ensure auth routes are mounted before making the request
          if (!window.MoodChatConfig.authRoutesMounted) {
            console.log('🔄 Auth routes not mounted yet, mounting...');
            const mounted = await this.ensureAuthRoutesMounted();
            if (!mounted) {
              console.log('⚠️ Could not mount auth routes for auth check');
              return { 
                valid: false, 
                reason: 'Auth routes not available'
              };
            }
          }
          
          const response = await this.safeApiCall('/auth/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            timeout: 10000 // 10 second timeout
          });
          
          // NEW: Enhanced response handling for auth separation
          if (response && response.success && response.data) {
            console.log('✅ Authentication validation successful');
            return { 
              valid: true, 
              user: response.data,
              tokenValid: true
            };
          } else {
            // Check if it's an auth error (401/403) - these don't mean backend is unreachable
            if (response && (response.status === 401 || response.status === 403)) {
              console.log('⚠️ Authentication validation failed (invalid token):', response.message || 'Unauthorized');
              return { 
                valid: false, 
                reason: response?.message || 'Invalid token',
                authError: true, // Flag for auth errors (not network errors)
                status: response.status
              };
            } else {
              console.log('⚠️ Authentication validation failed:', response);
              return { 
                valid: false, 
                reason: response?.message || 'Invalid response from server'
              };
            }
          }
        } catch (apiError) {
          // NEW: Enhanced error handling for network/auth separation
          console.log('API request failed for auth validation:', apiError.message);
          
          // Check error type
          if (apiError.message && apiError.message.includes('Authentication failed')) {
            // This is an auth error, not a network error
            return { 
              valid: false, 
              reason: 'Authentication failed: ' + apiError.message,
              authError: true
            };
          } else if (apiError.message && (apiError.message.includes('404') || apiError.message.includes('Not Found'))) {
            // Route not found - might need to mount auth routes
            return { 
              valid: false, 
              reason: 'Auth route not found',
              routeNotFound: true
            };
          } else {
            // Network or other error
            return { 
              valid: false, 
              reason: 'API validation failed: ' + apiError.message 
            };
          }
        }
      } catch (error) {
        console.error('Auth validation error:', error);
        return { valid: false, reason: error.message || 'Validation failed' };
      }
    }
  };

  // ============================================================================
  // JWT TOKEN VALIDATION - BACKGROUND ONLY
  // ============================================================================

  const JWT_VALIDATION = {
    TOKEN_KEY: 'moodchat_jwt_token',
    VALIDATED_KEY: 'moodchat_jwt_validated',
    VALIDATION_LOCK: 'moodchat_validation_in_progress',
    BACKGROUND_CHECKED: 'moodchat_background_checked',
    
    // Check if token exists
    hasToken: function() {
      return !!localStorage.getItem(this.TOKEN_KEY);
    },
    
    // Get token
    getToken: function() {
      return localStorage.getItem(this.TOKEN_KEY);
    },
    
    // Clear token
    clearToken: function() {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.VALIDATED_KEY);
      localStorage.removeItem(this.BACKGROUND_CHECKED);
    },
    
    // Store token
    storeToken: function(token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    },
    
    // Check if background validation was already performed
    isBackgroundChecked: function() {
      return localStorage.getItem(this.BACKGROUND_CHECKED) === 'true';
    },
    
    // Mark background validation as completed
    markBackgroundChecked: function() {
      localStorage.setItem(this.BACKGROUND_CHECKED, 'true');
    },
    
    // Check if validation is already in progress
    isValidationInProgress: function() {
      return localStorage.getItem(this.VALIDATION_LOCK) === 'true';
    },
    
    // Set validation lock
    setValidationLock: function(state) {
      if (state) {
        localStorage.setItem(this.VALIDATION_LOCK, 'true');
      } else {
        localStorage.removeItem(this.VALIDATION_LOCK);
      }
    },
    
    // Check if token was already validated
    isAlreadyValidated: function() {
      return localStorage.getItem(this.VALIDATED_KEY) === 'true';
    },
    
    // Mark token as validated
    markAsValidated: function() {
      localStorage.setItem(this.VALIDATED_KEY, 'true');
    },
    
    // Validate token by calling protected endpoint using api.js
    validateToken: async function() {
      const token = this.getToken();
      if (!token) {
        return { valid: false, reason: 'No token found' };
      }
      
      try {
        // Use the new checkAuthMe function
        return await API_COORDINATION.checkAuthMe();
      } catch (error) {
        console.error('Token validation error:', error);
        return { valid: false, reason: error.message || 'Validation failed' };
      }
    },
    
    // Fallback token validation (basic JWT parsing) - only used when absolutely necessary
    fallbackTokenValidation: function(token) {
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          return { valid: false, reason: 'Invalid token format' };
        }
        
        // Decode JWT payload
        const payload = JSON.parse(atob(tokenParts[1]));
        
        // Check if token is expired
        if (payload.exp && payload.exp < Date.now() / 1000) {
          return { valid: false, reason: 'Token expired' };
        }
        
        return { valid: true, user: payload };
      } catch (e) {
        return { valid: false, reason: 'Invalid token payload' };
      }
    },
    
    // Perform BACKGROUND authentication check - NON-BLOCKING
    performBackgroundAuthCheck: async function() {
      console.log('Starting BACKGROUND JWT token validation...');
      
      // Check if we already validated in background
      if (this.isBackgroundChecked()) {
        console.log('Background validation already performed, skipping');
        return { validated: false, skipped: true };
      }
      
      // Check if we're already validating
      if (this.isValidationInProgress()) {
        console.log('Validation already in progress, skipping duplicate');
        return { validated: false, skipped: true };
      }
      
      // Set validation lock
      this.setValidationLock(true);
      
      try {
        if (!this.hasToken()) {
          console.log('No JWT token found in background check');
          this.setValidationLock(false);
          this.markBackgroundChecked();
          return { validated: false, noToken: true };
        }
        
        const validation = await this.validateToken();
        
        if (!validation.valid) {
          console.log('Background token validation failed:', validation.reason);
          this.setValidationLock(false);
          this.markBackgroundChecked();
          return { validated: false, invalid: true, reason: validation.reason };
        }
        
        console.log('Background token validation successful');
        this.markAsValidated();
        this.setValidationLock(false);
        this.markBackgroundChecked();
        return { validated: true, user: validation.user };
        
      } catch (error) {
        console.error('Background auth check error:', error);
        this.setValidationLock(false);
        this.markBackgroundChecked();
        return { validated: false, error: error.message };
      }
    },
    
    // Soft redirect to login (non-intrusive) - ONLY for missing tokens
    suggestLoginRedirect: function() {
      // Don't redirect during iframe/child page loads
      if (window !== window.top || window.location.pathname.includes('chat.html') || 
          window.location.pathname.includes('group.html')) {
        console.log('Skipping redirect during iframe/child page load');
        return false;
      }
      
      // Only redirect if we have NO token at all (not just expired)
      if (!this.hasToken() && 
          !localStorage.getItem('moodchat_device_session') &&
          !localStorage.getItem('moodchat-auth-state')) {
        
        // Check if we're already on login page
        if (window.location.pathname.endsWith('index.html') || 
            window.location.pathname.endsWith('/')) {
          return false;
        }
        
        console.log('No auth data found, redirecting to login...');
        setTimeout(() => {
          window.location.replace('/index.html');
        }, 100);
        return true;
      }
      
      return false;
    }
  };

  // ============================================================================
  // INSTANT STARTUP SYSTEM - WHATSAPP-STYLE LOADING
  // ============================================================================

  // Global state - Use window.currentUser instead of redeclaring
  window.currentUser = window.currentUser || null;

  // Network status is now managed within the API_COORDINATION module and functions
  let currentTab = 'groups';
  let isLoading = false;
  let isSidebarOpen = true;
  let authStateRestored = false;
  // CHANGED: Initial network status is "checking" not false - now managed by API_COORDINATION
  let syncQueue = [];
  let instantUILoaded = false;
  let backgroundSyncInProgress = false;
  let pendingUIUpdates = [];

  // Track startup state
  let appStartupPerformed = false;
  let backgroundValidationScheduled = false;
  let authValidationComplete = false; // NEW: Track if auth validation is complete
  let authValidationInProgress = false; // NEW: Track if auth validation is in progress

  // ============================================================================
  // REFRESH-SAFE AUTH VALIDATION - UPDATED CRITICAL SECTION
  // ============================================================================

  // NEW: Single, deterministic auth validation function for refresh-safe bootstrap
  async function validateAuthDeterministic() {
    console.log('🔄 REFRESH-SAFE: Starting deterministic auth validation...');
    
    // Set validation in progress flag
    window.MoodChatConfig.authValidationInProgress = true;
    authValidationInProgress = true;
    
    // CRITICAL: Read token from localStorage using SAME fallback logic as api.js
    const accessToken = localStorage.getItem('accessToken');
    const moodchatToken = localStorage.getItem('moodchat_jwt_token');
    const token = accessToken || moodchatToken;
    
    // If no token exists, mark as not authenticated
    if (!token) {
      console.log('❌ No auth token found in localStorage');
      window.AUTH_READY = false;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      authValidationComplete = true;
      
      // Clear any cached auth state
      localStorage.removeItem('moodchat-auth-state');
      
      // If we're not on login page, redirect
      if (!window.location.pathname.endsWith('index.html') && 
          !window.location.pathname.endsWith('/')) {
        console.log('Redirecting to login (no token)...');
        setTimeout(() => {
          window.location.href = '/index.html';
        }, 100);
      }
      
      return { valid: false, reason: 'No token found' };
    }
    
    // CRITICAL: DO NOT assume presence = validity
    console.log('Token found in localStorage, validating via /auth/me API...');
    
    // Wait for API to be ready first
    console.log('Waiting for API to be ready for auth validation...');
    const apiAvailable = await API_COORDINATION.waitForApi();
    
    if (!apiAvailable) {
      console.log('API not available, cannot validate auth');
      window.AUTH_READY = false;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      authValidationComplete = true;
      return { valid: false, reason: 'API service not available' };
    }
    
    try {
      // CRITICAL: Call /auth/me using api.js and await the result
      console.log('🔐 Calling /auth/me to validate token...');
      const validation = await API_COORDINATION.checkAuthMe();
      
      if (validation.valid && validation.user) {
        // SUCCESS: Token is valid, user is authenticated
        console.log('✅ /auth/me validation successful');
        
        // Create validated user object
        const validatedUser = {
          uid: validation.user.id || validation.user._id || validation.user.sub,
          email: validation.user.email || 'user@example.com',
          displayName: validation.user.name || validation.user.username || 'User',
          photoURL: validation.user.avatar || `https://ui-avatars.com/api/?name=User&background=8b5cf6&color=fff`,
          emailVerified: validation.user.emailVerified || false,
          isOffline: false,
          providerId: 'api',
          refreshToken: token,
          getIdToken: () => Promise.resolve(token),
          ...validation.user,
          validated: true // Mark as validated
        };
        
        // Set user
        window.currentUser = validatedUser;
        authStateRestored = true;
        
        // Setup user isolation
        USER_DATA_ISOLATION.setCurrentUser(validatedUser.uid);
        DATA_CACHE.setCurrentUser(validatedUser.uid);
        SETTINGS_SERVICE.setCurrentUser(validatedUser.uid);
        
        // Update global state
        updateGlobalAuthState(validatedUser);
        
        // Update cached auth state with validation flag
        const authData = {
          type: 'auth-state',
          user: {
            uid: validatedUser.uid,
            email: validatedUser.email,
            displayName: validatedUser.displayName,
            photoURL: validatedUser.photoURL,
            emailVerified: validatedUser.emailVerified || false,
            authMethod: 'api'
          },
          isAuthenticated: true,
          validated: true,
          timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
        
        // CRITICAL: Mark auth as READY
        window.AUTH_READY = true;
        console.log('✅ AUTH_READY = true - Authentication validated and ready');
        
        // Execute any pending operations
        executePendingAuthOperations();
        
        // Broadcast auth ready
        broadcastAuthReady();
        
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        authValidationComplete = true;
        
        console.log('✓ User authenticated and validated via /auth/me');
        return { valid: true, user: validatedUser };
      } else {
        // FAILURE: Token is invalid
        console.log('❌ /auth/me validation failed:', validation.reason);
        
        // Clear invalid tokens
        console.log('🔐 Clearing invalid token...');
        JWT_VALIDATION.clearToken();
        localStorage.removeItem('accessToken');
        localStorage.removeItem('tokenExpiresAt');
        localStorage.removeItem('moodchat-auth-state');
        
        // Mark auth as NOT ready
        window.AUTH_READY = false;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        authValidationComplete = true;
        
        // Clear any existing user data
        window.currentUser = null;
        authStateRestored = false;
        
        // Redirect to login
        if (!window.location.pathname.endsWith('index.html') && 
            !window.location.pathname.endsWith('/')) {
          console.log('Redirecting to login (invalid token)...');
          setTimeout(() => {
            window.location.href = '/index.html';
          }, 100);
        }
        
        return { valid: false, reason: validation.reason };
      }
    } catch (error) {
      // ERROR: API call failed
      console.log('❌ /auth/me API call failed:', error.message);
      
      // Check if it's a network error vs auth error
      if (error.message && (error.message.includes('Network') || error.message.includes('timeout'))) {
        // Network error - keep token but don't mark as authenticated
        console.log('⚠️ Network error during auth validation, keeping token but not marking as authenticated');
        
        // Create offline user for UI continuity
        createOfflineUserForUI();
        
        window.AUTH_READY = false;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        authValidationComplete = true;
        
        return { valid: false, reason: 'Network error: ' + error.message, networkError: true };
      } else {
        // Auth or other error - clear tokens
        console.log('🔐 Clearing token due to validation error');
        JWT_VALIDATION.clearToken();
        localStorage.removeItem('accessToken');
        localStorage.removeItem('moodchat-auth-state');
        
        window.AUTH_READY = false;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        authValidationComplete = true;
        
        // Redirect to login
        if (!window.location.pathname.endsWith('index.html') && 
            !window.location.pathname.endsWith('/')) {
          console.log('Redirecting to login (validation error)...');
          setTimeout(() => {
            window.location.href = '/index.html';
          }, 100);
        }
        
        return { valid: false, reason: 'Validation error: ' + error.message };
      }
    }
  }

  // NEW: Enhanced auth validation function that validates tokens before marking user as authenticated
  async function validateAuthOnStartup() {
    console.log('🔄 Starting authentication validation on startup...');
    
    // Set validation in progress flag
    window.MoodChatConfig.authValidationInProgress = true;
    authValidationInProgress = true;
    
    // Check if we have a token
    if (!JWT_VALIDATION.hasToken()) {
      console.log('No JWT token found, auth validation not needed');
      authValidationComplete = true;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      return false;
    }
    
    // Wait for API to be ready first
    console.log('Waiting for API to be ready for auth validation...');
    const apiAvailable = await API_COORDINATION.waitForApi();
    
    if (!apiAvailable) {
      console.log('API not available, cannot validate auth');
      authValidationComplete = true;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      return false;
    }
    
    // Wait for backend health check if needed
    if (window.MoodChatConfig.networkStatus === 'checking') {
      console.log('Waiting for backend health check before auth validation...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (window.MoodChatConfig.networkStatus !== 'checking') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
    }
    
    // Check if backend is reachable
    if (window.MoodChatConfig.backendReachable !== true) {
      console.log('Backend not reachable, cannot validate auth');
      authValidationComplete = true;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      return false;
    }
    
    // NEW: Ensure auth routes are mounted before validation
    console.log('🔄 Ensuring auth routes are mounted before validation...');
    const authRoutesMounted = await API_COORDINATION.ensureAuthRoutesMounted();
    
    if (!authRoutesMounted) {
      console.log('⚠️ Auth routes not mounted, cannot validate auth via /auth/me');
      
      // Try fallback validation
      const token = JWT_VALIDATION.getToken();
      const fallbackValidation = JWT_VALIDATION.fallbackTokenValidation(token);
      
      if (fallbackValidation.valid) {
        console.log('✅ Using fallback token validation (JWT parsing)');
        
        const fallbackUser = {
          uid: fallbackValidation.user.sub || fallbackValidation.user.userId || 'user_' + Date.now(),
          email: fallbackValidation.user.email || 'user@example.com',
          displayName: fallbackValidation.user.name || fallbackValidation.user.username || 'User',
          photoURL: fallbackValidation.user.picture || fallbackValidation.user.avatar || `https://ui-avatars.com/api/?name=User&background=8b5cf6&color=fff`,
          emailVerified: fallbackValidation.user.email_verified || false,
          isOffline: false,
          providerId: 'api',
          refreshToken: token,
          getIdToken: () => Promise.resolve(token),
          ...fallbackValidation.user,
          validated: false // Mark as not validated by server
        };
        
        // Set user but mark as not validated
        window.currentUser = fallbackUser;
        authStateRestored = true;
        
        // Setup user isolation
        USER_DATA_ISOLATION.setCurrentUser(fallbackUser.uid);
        DATA_CACHE.setCurrentUser(fallbackUser.uid);
        SETTINGS_SERVICE.setCurrentUser(fallbackUser.uid);
        
        // Update global state
        updateGlobalAuthState(fallbackUser);
        
        console.log('✓ User authenticated via fallback validation (not server-validated)');
        authValidationComplete = true;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        return true;
      } else {
        console.log('❌ Fallback token validation failed');
        authValidationComplete = true;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        return false;
      }
    }
    
    try {
      // Call /auth/me to validate the token
      console.log('🔐 Validating authentication via API...');
      const validation = await API_COORDINATION.checkAuthMe();
      
      if (validation.valid && validation.user) {
        console.log('✅ Authentication validation successful on startup');
        
        // Create validated user object
        const validatedUser = {
          uid: validation.user.id || validation.user._id || validation.user.sub,
          email: validation.user.email || 'user@example.com',
          displayName: validation.user.name || validation.user.username || 'User',
          photoURL: validation.user.avatar || `https://ui-avatars.com/api/?name=User&background=8b5cf6&color=fff`,
          emailVerified: validation.user.emailVerified || false,
          isOffline: false,
          providerId: 'api',
          refreshToken: JWT_VALIDATION.getToken(),
          getIdToken: () => Promise.resolve(JWT_VALIDATION.getToken()),
          ...validation.user,
          validated: true // Mark as validated
        };
        
        // Set user
        window.currentUser = validatedUser;
        authStateRestored = true;
        
        // Setup user isolation
        USER_DATA_ISOLATION.setCurrentUser(validatedUser.uid);
        DATA_CACHE.setCurrentUser(validatedUser.uid);
        SETTINGS_SERVICE.setCurrentUser(validatedUser.uid);
        
        // Update global state
        updateGlobalAuthState(validatedUser);
        
        // Update cached auth state with validation flag
        const authData = {
          type: 'auth-state',
          user: {
            uid: validatedUser.uid,
            email: validatedUser.email,
            displayName: validatedUser.displayName,
            photoURL: validatedUser.photoURL,
            emailVerified: validatedUser.emailVerified || false,
            authMethod: 'api'
          },
          isAuthenticated: true,
          validated: true, // NEW: Mark as validated
          timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
        
        console.log('✓ User authenticated and validated on startup');
        authValidationComplete = true;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        return true;
      } else {
        console.log('❌ Authentication validation failed:', validation.reason);
        
        // Only clear token if it's an auth error (not network error)
        if (validation.authError || validation.routeNotFound) {
          console.log('🔐 Clearing invalid token');
          JWT_VALIDATION.clearToken();
          
          // Clear cached auth state
          localStorage.removeItem('moodchat-auth-state');
        } else {
          console.log('⚠️ Validation failed but keeping token (might be network issue)');
        }
        
        // Create offline user
        createOfflineUserForUI();
        
        console.log('✓ Invalid token cleared, using offline user');
        authValidationComplete = true;
        window.MoodChatConfig.authValidationInProgress = false;
        authValidationInProgress = false;
        return false;
      }
    } catch (error) {
      console.log('❌ Auth validation error:', error);
      
      // On error, create offline user but keep token (might be network issue)
      createOfflineUserForUI();
      
      console.log('✓ Auth validation failed, using offline user');
      authValidationComplete = true;
      window.MoodChatConfig.authValidationInProgress = false;
      authValidationInProgress = false;
      return false;
    }
  }

  // Create offline user for UI (non-blocking)
  function createOfflineUserForUI() {
    const offlineUserId = 'offline_user_' + getDeviceId() + '_' + Date.now();
    const offlineUser = {
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
    
    // Set user immediately
    window.currentUser = offlineUser;
    authStateRestored = true;
    
    // Setup user isolation
    USER_DATA_ISOLATION.setCurrentUser(offlineUser.uid);
    DATA_CACHE.setCurrentUser(offlineUser.uid);
    SETTINGS_SERVICE.setCurrentUser(offlineUser.uid);
    
    // Update global state
    updateGlobalAuthState(offlineUser);
    
    console.log('✓ Offline user created for instant UI');
  }

  // ============================================================================
  // BACKGROUND VALIDATION (NON-BLOCKING) - UPDATED
  // ============================================================================

  function scheduleBackgroundValidation() {
    if (backgroundValidationScheduled) {
      console.log('Background validation already scheduled');
      return;
    }
    
    backgroundValidationScheduled = true;
    
    // Wait for UI to load first, then validate
    setTimeout(() => {
      console.log('Starting background token validation...');
      
      // Skip if we already did auth validation on startup
      if (authValidationComplete && window.currentUser && window.currentUser.validated) {
        console.log('Auth already validated on startup, skipping background validation');
        return;
      }
      
      // Perform validation in background
      JWT_VALIDATION.performBackgroundAuthCheck()
        .then(validationResult => {
          if (validationResult.validated && validationResult.user) {
            console.log('✓ Background token validation successful');
            
            // Update user with fresh data from validation
            const validatedUser = {
              uid: validationResult.user.id || validationResult.user._id || validationResult.user.sub,
              email: validationResult.user.email,
              displayName: validationResult.user.name || validationResult.user.username || 'User',
              photoURL: validationResult.user.avatar || window.currentUser?.photoURL,
              emailVerified: validationResult.user.emailVerified || false,
              isOffline: false,
              providerId: 'api',
              refreshToken: JWT_VALIDATION.getToken(),
              getIdToken: () => Promise.resolve(JWT_VALIDATION.getToken()),
              ...validationResult.user,
              validated: true
            };
            
            // Update auth state silently
            handleAuthStateChange(validatedUser);
            
            // Update cached auth state with validation flag
            const authData = {
              type: 'auth-state',
              user: {
                uid: validatedUser.uid,
                email: validatedUser.email,
                displayName: validatedUser.displayName,
                photoURL: validatedUser.photoURL,
                emailVerified: validatedUser.emailVerified || false,
                authMethod: 'api'
              },
              isAuthenticated: true,
              validated: true,
              timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
            
            // Broadcast silent update
            broadcastSilentAuthUpdate(validatedUser);
            
            console.log('✓ User updated with validated token data');
          } else if (validationResult.invalid) {
            console.log('✗ Background token validation failed:', validationResult.reason);
            
            // Don't logout immediately if user was created from cache
            // Only show notification if we had a real token that failed validation
            if (window.currentUser && window.currentUser.fromCache) {
              console.log('User was from cache, keeping cached state');
              
              // Schedule notification after UI is fully loaded (non-intrusive)
              setTimeout(() => {
                console.log('Scheduling re-auth notification due to invalid token...');
                showReauthNotification();
              }, 5000);
            }
          } else if (validationResult.noToken) {
            console.log('No JWT token found in background check');
            // No token but we might have device session - that's fine
          }
        })
        .catch(error => {
          console.log('Background validation error:', error);
        });
    }, 3000); // Wait 3 seconds for UI to stabilize
  }

  // Update auth state without disrupting UI
  function handleAuthStateChange(user, fromDeviceAuth = false) {
    const userId = user ? user.uid : null;
    const currentUserId = window.currentUser ? window.currentUser.uid : null;
    
    // If user is changing, clear old user's data
    if (userId !== currentUserId && currentUserId) {
      console.log(`User changed from ${currentUserId} to ${userId}, clearing old user data`);
      
      // Clear old user's cached data
      USER_DATA_ISOLATION.clearUserData(currentUserId);
      
      // Clear settings for old user
      SETTINGS_SERVICE.clearUserSettings();
    }
    
    // Update current user
    window.currentUser = user;
    
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
    
    console.log('Auth state updated:', user ? `User ${user.uid} (${fromDeviceAuth ? 'device' : 'api'})` : 'No user');
  }

  // Broadcast silent auth update
  function broadcastSilentAuthUpdate(user) {
    const event = new CustomEvent('moodchat-auth-silent-update', {
      detail: { 
        user: user,
        timestamp: new Date().toISOString(),
        source: 'background-validation'
      }
    });
    window.dispatchEvent(event);
  }

  // Show reauth notification (non-intrusive)
  function showReauthNotification() {
    // Don't show notification if user is already offline/device user
    if (window.currentUser && (window.currentUser.isOffline || window.currentUser.providerId === 'device')) {
      return;
    }
    
    // Create subtle notification
    const notification = document.createElement('div');
    notification.id = 'reauth-notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #f59e0b;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 1000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      animation: slideInUp 0.3s ease-out;
      max-width: 300px;
    `;
    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">Session Expired</div>
      <div style="font-size: 14px; opacity: 0.9;">Please sign in again to continue</div>
      <button id="reauth-action" style="margin-top: 8px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 4px; font-size: 14px; cursor: pointer;">
        Sign In
      </button>
    `;
    
    document.body.appendChild(notification);
    
    // Add click handler
    const reauthAction = document.getElementById('reauth-action');
    if (reauthAction) {
      reauthAction.addEventListener('click', () => {
        window.logout().then(() => {
          window.location.href = '/index.html';
        });
      });
    }
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutDown 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }
    }, 30000);
  }

  // ============================================================================
  // MAIN STARTUP SEQUENCE - REFRESH-SAFE BOOTSTRAP - UPDATED
  // ============================================================================

  async function initializeApp() {
    console.log('🚀 Starting MoodChat initialization...');
    
    // Prevent duplicate startup
    if (appStartupPerformed) {
      console.log('App startup already performed, skipping');
      return;
    }
    
    appStartupPerformed = true;
    
    // STEP 1: Set initial network status to "checking" - FIXED: Not "offline"
    window.MoodChatConfig.networkStatus = 'checking';
    console.log('Initial network status: checking...');
    
    // Notify UI about initial checking state
    API_COORDINATION.notifyNetworkStatus('checking', 'Checking connection...');
    
    // STEP 2: Wait for api.js using enhanced detection
    console.log('Waiting for api.js using multiple detection methods...');
    const apiAvailable = await API_COORDINATION.waitForApi();
    
    // STEP 3: CRITICAL - Run deterministic auth validation BEFORE ANY UI LOADS
    console.log('🔐 CRITICAL: Running deterministic auth validation before any UI loads...');
    
    // This is the key fix: validate auth via /auth/me BEFORE allowing UI to load
    try {
      await validateAuthDeterministic();
      console.log('✅ Auth validation completed before proceeding with startup');
    } catch (error) {
      console.log('⚠️ Auth validation error during startup:', error);
      // Continue but auth will not be ready
    }
    
    // STEP 4: Check if auth is ready - if not, DO NOT load UI
    if (!window.AUTH_READY) {
      console.log('⚠️ Auth NOT ready, waiting for validation or redirecting...');
      
      // If we're not on login page and have no valid auth, redirect
      if (!window.location.pathname.endsWith('index.html') && 
          !window.location.pathname.endsWith('/')) {
        
        // Check if we have any token at all
        const hasToken = JWT_VALIDATION.hasToken() || localStorage.getItem('accessToken');
        
        if (!hasToken) {
          console.log('No token found, redirecting to login...');
          setTimeout(() => {
            window.location.href = '/index.html';
          }, 100);
          return;
        } else {
          console.log('Token exists but validation failed, showing loading screen...');
          // Keep showing loading screen until redirect or validation completes
        }
      }
    } else {
      console.log('✅ Auth is READY, proceeding with UI initialization');
    }
    
    // STEP 5: Check backend reachability in background - NON-BLOCKING
    console.log('Starting backend health check in background...');
    
    if (!apiAvailable) {
      console.log('⚠️ api.js not available, some features will be limited');
      window.MoodChatConfig.networkStatus = 'offline';
      API_COORDINATION.notifyNetworkStatus('offline', 'API service unavailable');
    } else {
      // Health check is already running in background from handleApiDetected()
      console.log('api.js available, health check running in background');
    }
    
    // STEP 6: Hide loading screen ONLY if auth is ready
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      // Only hide if auth is ready, otherwise keep showing
      if (window.AUTH_READY) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
          if (loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
        }, 300);
      } else {
        console.log('Keeping loading screen visible (auth not ready)');
      }
    }
    
    // STEP 7: Initialize core services (non-blocking) - but only if auth is ready
    if (window.AUTH_READY) {
      setTimeout(() => {
        // Initialize settings
        SETTINGS_SERVICE.initialize();
        
        // Setup global auth access
        setupGlobalAuthAccess();
        
        // Initialize network detection - UPDATED: Won't set offline prematurely
        initializeNetworkDetection();
        
        // Expose global state to iframes
        exposeGlobalStateToIframes();
        
        // Setup event listeners
        setupEventListeners();
        
        // Setup cross-page communication
        setupCrossPageCommunication();
        
        console.log('✓ Core services initialized');
      }, 50);
    }
    
    // STEP 8: Initialize UI ONLY if auth is ready
    if (window.AUTH_READY) {
      setTimeout(() => {
        initializeAppUI();
      }, 100);
    } else {
      console.log('⚠️ Delaying UI initialization until auth is ready...');
      
      // Wait for auth ready event
      window.addEventListener('moodchat-auth-ready', () => {
        console.log('✅ Auth ready event received, initializing UI...');
        setTimeout(() => {
          initializeAppUI();
        }, 100);
      }, { once: true });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!window.AUTH_READY) {
          console.log('⚠️ Auth ready timeout, checking if we should redirect...');
          
          // If we have a token but validation is taking too long, show offline UI
          if (JWT_VALIDATION.hasToken() || localStorage.getItem('accessToken')) {
            console.log('Token exists but validation timeout, creating offline user...');
            createOfflineUserForUI();
            window.AUTH_READY = true;
            executePendingAuthOperations();
            broadcastAuthReady();
            setTimeout(() => {
              initializeAppUI();
            }, 100);
          } else {
            // No token, redirect to login
            if (!window.location.pathname.endsWith('index.html') && 
                !window.location.pathname.endsWith('/')) {
              console.log('No token and auth timeout, redirecting to login...');
              window.location.href = '/index.html';
            }
          }
        }
      }, 10000);
    }
    
    // STEP 9: Schedule background validation ONLY if backend becomes reachable AND auth is ready
    window.addEventListener('moodchat-backend-ready', (event) => {
      if (event.detail.reachable && JWT_VALIDATION.hasToken() && window.AUTH_READY) {
        console.log('Backend ready, scheduling background token validation...');
        scheduleBackgroundValidation();
      }
    });
    
    console.log('✓ App initialization sequence started');
  }

  // Initialize app UI (non-blocking) - UPDATED to respect AUTH_READY flag
  function initializeAppUI() {
    console.log('Initializing app UI instantly...');
    
    // Apply minimal styling
    injectStyles();
    
    // Initialize sidebar
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
      contentArea.className = 'flex-1 overflow-auto bg-gray-50 dark:bg-gray-900';
      document.body.appendChild(contentArea);
    }
    
    // Load default page (non-blocking) - ONLY if authenticated AND validated
    setTimeout(() => {
      if (window.currentUser && !window.currentUser.isOfflineMode && window.currentUser.validated) {
        loadPage(APP_CONFIG.defaultPage);
      } else {
        // Show offline or login page
        showOfflinePlaceholderUI();
      }
    }, 150);
    
    // Set default tab (non-blocking) - ONLY if authenticated AND validated
    setTimeout(() => {
      if (window.currentUser && !window.currentUser.isOfflineMode && window.currentUser.validated) {
        try {
          const groupsTab = document.querySelector(TAB_CONFIG.groups.container);
          if (groupsTab) {
            showTab('groups');
          } else {
            console.log('Groups tab not found, loading as external...');
            loadExternalTab('groups', EXTERNAL_TABS.groups);
          }
        } catch (error) {
          console.log('Error setting default tab:', error);
          // Fallback to chats tab
          if (TAB_CONFIG.chats.container && document.querySelector(TAB_CONFIG.chats.container)) {
            showTab('chats');
          }
        }
      }
    }, 200);
    
    // Mark auth as ready and broadcast
    authStateRestored = true;
    broadcastAuthReady();
    
    // Load cached data instantly - ONLY if authenticated AND validated
    setTimeout(() => {
      if (window.currentUser && !window.currentUser.isOfflineMode && window.currentUser.validated) {
        loadCachedDataInstantly();
      }
    }, 300);
    
    // Start background services after delay - ONLY if online AND backend reachable AND validated
    // This will be triggered when network status becomes "online"
    window.addEventListener('moodchat-network-status', (event) => {
      if (event.detail.status === 'online' && 
          window.currentUser && 
          !window.currentUser.isOfflineMode &&
          window.currentUser.validated) {
        setTimeout(() => {
          NETWORK_SERVICE_MANAGER.startAllServices();
          NETWORK_SERVICE_MANAGER.startBackgroundSync();
        }, 1000);
      }
    });
    
    console.log('✓ App UI initialized instantly');
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
        
        const cursorRequest = msgIndex.openCursor(range);
        if (cursorRequest) {
          cursorRequest.onsuccess = function(cursorEvent) {
            const cursor = cursorEvent.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        }
        
        // Clear actions for this user
        const actTransaction = db.transaction(['actions'], 'readwrite');
        const actStore = actTransaction.objectStore('actions');
        const actIndex = actStore.index('userId');
        
        const actionCursorRequest = actIndex.openCursor(range);
        if (actionCursorRequest) {
          actionCursorRequest.onsuccess = function(cursorEvent) {
            const cursor = cursorEvent.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        }
        
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
      this.setCurrentUser(window.currentUser ? window.currentUser.uid : null);
      
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
      if (!window.currentUser) {
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
      const offlineData = OFFLINE_DATA_GENERATOR.generateAllOfflineData(window.currentUser.uid);
      
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
        userId: window.currentUser.uid
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
  // ENHANCED NETWORK-DEPENDENT SERVICE MANAGER WITH BACKGROUND SYNC
  // ============================================================================

  const NETWORK_SERVICE_MANAGER = {
    services: new Map(),
    
    states: {
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
      
      if (API_COORDINATION.getNetworkStatus() !== 'online') {
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
      if (API_COORDINATION.getNetworkStatus() !== 'online' || !window.currentUser) {
        backgroundSyncInProgress = false;
        this.states.backgroundSync.running = false;
        return;
      }
      
      console.log('Performing background sync for user:', window.currentUser.uid);
      
      // 1. Sync queued messages
      processQueuedMessages();
      
      // 2. Refresh cached data in background
      refreshCachedDataInBackground();
      
      // 3. Update app initialization state
      DATA_CACHE.cacheAppInitialized(true);
      
      // 4. NEW: Ensure auth routes are mounted during sync
      API_COORDINATION.ensureAuthRoutesMounted().catch(err => {
        console.log('⚠️ Auth route mounting during sync failed:', err.message);
      });
      
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
  // AUTHENTICATION HANDLERS
  // ============================================================================

  // Get device ID (consistent across sessions) - FIXED: Non-recursive implementation
  let _cachedDeviceId = null;
  function getDeviceId() {
    // Return cached device ID if already generated
    if (_cachedDeviceId) {
      return _cachedDeviceId;
    }
    
    // Check localStorage for existing device ID
    let deviceId = localStorage.getItem('moodchat_device_id');
    if (!deviceId) {
      // Use crypto.randomUUID() if available, otherwise fallback to timestamp + random
      if (window.crypto && window.crypto.randomUUID) {
        deviceId = 'device_' + window.crypto.randomUUID();
      } else {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 15);
        deviceId = 'device_' + timestamp + '_' + randomPart;
      }
      localStorage.setItem('moodchat_device_id', deviceId);
    }
    
    // Cache the device ID
    _cachedDeviceId = deviceId;
    return deviceId;
  }

  // Store device-based session
  function storeDeviceBasedSession(user) {
    try {
      const session = {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified || false,
        providerId: user.providerId || 'api',
        deviceId: getDeviceId(),
        loggedOut: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        lastLogin: new Date().toISOString()
      };
      
      localStorage.setItem('moodchat_device_session', JSON.stringify(session));
      console.log('Device-based session stored for user:', user.uid);
    } catch (error) {
      console.log('Error storing device session:', error);
    }
  }

  // Update global auth state
  function updateGlobalAuthState(user) {
    window.MOODCHAT_AUTH = {
      currentUser: user,
      isAuthenticated: !!user,
      userId: user ? user.uid : null,
      userEmail: user ? user.email : null,
      displayName: user ? user.displayName : null,
      photoURL: user ? user.photoURL : null,
      isAuthReady: authStateRestored,
      authMethod: user ? (user.isOffline ? 'device' : 'api') : null,
      timestamp: new Date().toISOString()
    };
    
    // Dispatch custom event for other components
    const event = new CustomEvent('moodchat-auth-change', {
      detail: { 
        user: user, 
        isAuthenticated: !!user,
        isAuthReady: authStateRestored,
        authMethod: user ? (user.isOffline ? 'device' : 'api') : null
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
        emailVerified: user.emailVerified || false,
        authMethod: user.isOffline ? 'device' : 'api'
      } : null,
      isAuthenticated: !!user,
      validated: user?.validated || false, // NEW: Include validation flag
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
        user: window.currentUser,
        timestamp: new Date().toISOString(),
        isOffline: (window.currentUser && window.currentUser.isOffline),
        validated: window.currentUser?.validated || false // NEW: Include validation flag
      }
    });
    window.dispatchEvent(event);
    console.log('Auth ready broadcasted, user:', window.currentUser ? window.currentUser.uid : 'No user');
  }

  // ============================================================================
  // ENHANCED GLOBAL AUTH ACCESS WITH API.JS INTEGRATION
  // ============================================================================

  function setupGlobalAuthAccess() {
    // Create global access methods for all pages
    window.getCurrentUser = () => window.currentUser;
    window.getCurrentUserId = () => window.currentUser ? window.currentUser.uid : null;
    window.isAuthenticated = () => !!window.currentUser;
    window.isAuthReady = () => authStateRestored;
    window.waitForAuth = () => {
      return new Promise((resolve) => {
        if (authStateRestored) {
          resolve(window.currentUser);
        } else {
          const listener = () => {
            window.removeEventListener('moodchat-auth-ready', listener);
            resolve(window.currentUser);
          };
          window.addEventListener('moodchat-auth-ready', listener);
        }
      });
    };
    
    // Enhanced login function using api.js - with proper online/offline handling
    window.login = function(email, password) {
      return new Promise(async (resolve, reject) => {
        // UPDATED: Check network status more accurately
        const networkStatus = API_COORDINATION.getNetworkStatus();
        const isBrowserOffline = !(window.AppNetwork?.isOnline?.() ?? navigator.onLine);
        
        // Block login ONLY if browser is offline OR backend is confirmed unreachable
        if (isBrowserOffline) {
          window.showToast('Cannot login while offline. Please check your internet connection.', 'error');
          resolve({
            success: false,
            offline: true,
            message: 'Cannot login while offline (browser offline)'
          });
          return;
        }
        
        // Check if backend is confirmed unreachable (not just checking/unknown)
        if (window.MoodChatConfig.backendReachable === false) {
          window.showToast('Login service not available. Please try again later.', 'error');
          resolve({
            success: false,
            message: 'Backend confirmed unreachable'
          });
          return;
        }
        
        // UPDATED: Allow login even if backend status is "checking" or "unknown" (null)
        // This handles AbortError/timeout scenarios where we don't know the real status
        
        // Clear any existing user data before login
        const existingUsers = USER_DATA_ISOLATION.getCachedUsers();
        existingUsers.forEach(userId => {
          USER_DATA_ISOLATION.clearUserData(userId);
        });
        
        // Clear old session
        localStorage.removeItem('moodchat_device_session');
        JWT_VALIDATION.clearToken();
        
        // Show loading state
        window.showLoginLoading(true);
        
        try {
          // UPDATED: Use api.js login endpoint properly
          const response = await API_COORDINATION.safeApiCall('/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          
          window.showLoginLoading(false);
          
          // UPDATED: Handle api.js response structure
          if (response && response.success && response.data && response.data.token) {
            // Store JWT token
            JWT_VALIDATION.storeToken(response.data.token);
            
            // Create user object from response
            const userData = response.data.user || response.data;
            const user = {
              uid: userData.id || userData._id || 'user_' + Date.now(),
              email: userData.email || email,
              displayName: userData.name || userData.username || email.split('@')[0],
              photoURL: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || email.split('@')[0])}&background=8b5cf6&color=fff`,
              emailVerified: userData.emailVerified || false,
              isOffline: false,
              providerId: 'api',
              refreshToken: response.data.refreshToken || response.data.token,
              getIdToken: () => Promise.resolve(response.data.token),
              ...userData,
              validated: true // NEW: Mark as validated
            };
            
            // Store device session for offline use
            storeDeviceBasedSession(user);
            
            // Update cached auth state with validation flag
            const authData = {
              type: 'auth-state',
              user: {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified || false,
                authMethod: 'api'
              },
              isAuthenticated: true,
              validated: true, // NEW: Mark as validated
              timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
            
            // Generate offline data for this user
            setTimeout(() => {
              DATA_CACHE.ensureOfflineDataAvailable();
            }, 100);
            
            handleAuthStateChange(user);
            
            // Show success message
            window.showToast('Login successful!', 'success');
            
            resolve({
              success: true,
              user: user,
              message: 'Login successful'
            });
          } else {
            // Show error message from api.js response
            const errorMsg = response?.message || response?.error || 'Login failed. Please check your credentials.';
            window.showToast(errorMsg, 'error');
            
            resolve({
              success: false,
              message: errorMsg
            });
          }
        } catch (error) {
          window.showLoginLoading(false);
          
          // UPDATED: Handle AbortError specially
          if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
            console.log('🔄 Login request aborted (timeout), backend status remains checking');
            window.showToast('Login request timed out. Please try again.', 'warning');
            resolve({
              success: false,
              timeout: true,
              message: 'Login request timed out'
            });
          } else {
            // Real network error
            window.showToast(error.message || 'Network error. Please check your connection.', 'error');
            
            console.log('API login failed:', error);
            resolve({
              success: false,
              message: 'Login failed: ' + error.message
            });
          }
        }
      });
    };
    
    // Enhanced logout function using api.js
    window.logout = function() {
      return new Promise(async (resolve) => {
        const userId = window.currentUser ? window.currentUser.uid : null;
        
        // Clear user data regardless of online/offline
        if (userId) {
          USER_DATA_ISOLATION.clearUserData(userId);
          SETTINGS_SERVICE.clearUserSettings();
        }
        
        // Mark device session as logged out
        try {
          const storedSession = localStorage.getItem('moodchat_device_session');
          if (storedSession) {
            const session = JSON.parse(storedSession);
            session.loggedOut = true;
            localStorage.setItem('moodchat_device_session', JSON.stringify(session));
          }
        } catch (error) {
          console.log('Error updating device session on logout:', error);
        }
        
        // Clear all local references
        localStorage.removeItem('moodchat-auth');
        localStorage.removeItem('moodchat-auth-state');
        
        // Clear JWT token on logout
        JWT_VALIDATION.clearToken();
        
        // Try API logout if available and user is not offline AND backend is reachable
        if (window.currentUser && !window.currentUser.isOffline && 
            API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable === true && 
            JWT_VALIDATION.hasToken()) {
          try {
            await API_COORDINATION.safeApiCall('/auth/logout', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${JWT_VALIDATION.getToken()}`
              }
            });
            
            handleAuthStateChange(null);
            window.showToast('Logged out successfully', 'success');
            resolve({
              success: true,
              message: 'Logout successful and user data cleared'
            });
          } catch (error) {
            // Even if API fails, clear local data
            console.log('API logout failed, clearing local data:', error);
            handleAuthStateChange(null);
            window.showToast('Logged out (local data cleared)', 'info');
            resolve({
              success: true,
              offline: true,
              message: 'Logged out with local data cleared (API error: ' + error.message + ')' 
            });
          }
        } else {
          // Device-based or offline logout
          handleAuthStateChange(null);
          window.showToast('Logged out successfully', 'success');
          resolve({
            success: true,
            offline: true,
            message: 'Logged out and cleared user data'
          });
        }
      });
    };
    
    // Enhanced register function using api.js
    window.register = function(email, password, displayName) {
      return new Promise(async (resolve, reject) => {
        // UPDATED: Check network status more accurately
        const networkStatus = API_COORDINATION.getNetworkStatus();
        const isBrowserOffline = !(window.AppNetwork?.isOnline?.() ?? navigator.onLine);
        
        // Block registration ONLY if browser is offline OR backend is confirmed unreachable
        if (isBrowserOffline) {
          window.showToast('Cannot register while offline. Please check your internet connection.', 'error');
          resolve({
            success: false,
            offline: true,
            message: 'Cannot register while offline (browser offline)'
          });
          return;
        }
        
        // Check if backend is confirmed unreachable (not just checking/unknown)
        if (window.MoodChatConfig.backendReachable === false) {
          window.showToast('Registration service not available. Please try again later.', 'error');
          resolve({
            success: false,
            message: 'Backend confirmed unreachable'
          });
          return;
        }
        
        // UPDATED: Allow registration even if backend status is "checking" or "unknown" (null)
        // This handles AbortError/timeout scenarios where we don't know the real status
        
        // Clear any existing user data before registration
        const existingUsers = USER_DATA_ISOLATION.getCachedUsers();
        existingUsers.forEach(userId => {
          USER_DATA_ISOLATION.clearUserData(userId);
        });
        
        // Clear old session
        localStorage.removeItem('moodchat_device_session');
        JWT_VALIDATION.clearToken();
        
        // Show loading state
        window.showRegisterLoading(true);
        
        try {
          // UPDATED: Use api.js register endpoint properly
          const response = await API_COORDINATION.safeApiCall('/auth/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              email, 
              password, 
              name: displayName || email.split('@')[0] 
            })
          });
          
          window.showRegisterLoading(false);
          
          // UPDATED: Handle api.js response structure
          if (response && response.success && response.data && response.data.token) {
            // Store JWT token
            JWT_VALIDATION.storeToken(response.data.token);
            
            // Create user object from response
            const userData = response.data.user || response.data;
            const user = {
              uid: userData.id || userData._id || 'user_' + Date.now(),
              email: userData.email || email,
              displayName: userData.name || userData.username || displayName || email.split('@')[0],
              photoURL: userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || displayName || email.split('@')[0])}&background=8b5cf6&color=fff`,
              emailVerified: userData.emailVerified || false,
              isOffline: false,
              providerId: 'api',
              refreshToken: response.data.refreshToken || response.data.token,
              getIdToken: () => Promise.resolve(response.data.token),
              ...userData,
              validated: true // NEW: Mark as validated
            };
            
            // Store device session for offline use
            storeDeviceBasedSession(user);
            
            // Update cached auth state with validation flag
            const authData = {
              type: 'auth-state',
              user: {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified || false,
                authMethod: 'api'
              },
              isAuthenticated: true,
              validated: true, // NEW: Mark as validated
              timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('moodchat-auth-state', JSON.stringify(authData));
            
            // Generate offline data for this user
            setTimeout(() => {
              DATA_CACHE.ensureOfflineDataAvailable();
            }, 100);
            
            handleAuthStateChange(user);
            
            // Show success message
            window.showToast('Registration successful!', 'success');
            
            resolve({
              success: true,
              user: user,
              message: 'Registration successful'
            });
          } else {
            // Show error message from api.js response
            const errorMsg = response?.message || response?.error || 'Registration failed. Please try again.';
            window.showToast(errorMsg, 'error');
            
            resolve({
              success: false,
              message: errorMsg
            });
          }
        } catch (error) {
          window.showRegisterLoading(false);
          
          // UPDATED: Handle AbortError specially
          if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
            console.log('🔄 Registration request aborted (timeout), backend status remains checking');
            window.showToast('Registration request timed out. Please try again.', 'warning');
            resolve({
              success: false,
              timeout: true,
              message: 'Registration request timed out'
            });
          } else {
            // Real network error
            window.showToast(error.message || 'Network error. Please check your connection.', 'error');
            
            console.log('API registration failed:', error);
            resolve({
              success: false,
              message: 'Registration failed: ' + error.message
            });
          }
        }
      });
    };
    
    // Expose to window for immediate access
    window.MOODCHAT_AUTH_API = {
      getCurrentUser: () => window.currentUser,
      getUserId: () => window.currentUser ? window.currentUser.uid : null,
      isAuthenticated: () => !!window.currentUser,
      getUserEmail: () => window.currentUser ? window.currentUser.email : null,
      getDisplayName: () => window.currentUser ? window.currentUser.displayName : null,
      getPhotoURL: () => window.currentUser ? window.currentUser.photoURL : null,
      isAuthReady: () => authStateRestored,
      waitForAuth: window.waitForAuth,
      login: window.login,
      logout: window.logout,
      register: window.register,
      clearUserData: (userId) => USER_DATA_ISOLATION.clearUserData(userId),
      getDeviceId: () => getDeviceId()
    };
  }

  // ============================================================================
  // INSTANT UI LOADING SYSTEM (ENHANCED FOR OFFLINE)
  // ============================================================================

  function loadCachedDataInstantly() {
    if (!window.currentUser || !window.currentUser.uid) {
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
      const offlineData = OFFLINE_DATA_GENERATOR.generateAllOfflineData(window.currentUser.uid);
      
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
        userId: window.currentUser.uid,
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
      createOfflineUserForUI();
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
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus !== 'online' || !window.currentUser || !window.currentUser.uid) {
      console.log('Cannot refresh cached data: offline or no user');
      return;
    }
    
    console.log('Refreshing cached data in background for user:', window.currentUser.uid);
    
    // This function should be implemented by individual tab modules
    // It will fetch fresh data from the server using api.js and update the cache
    // Dispatch event to trigger background data refresh
    const event = new CustomEvent('refresh-cached-data', {
      detail: {
        userId: window.currentUser.uid,
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
  // NETWORK DETECTION WITH INSTANT UI SUPPORT - UPDATED: No premature offline
  // ============================================================================

  function initializeNetworkDetection() {
    console.log('Initializing network detection with proper status handling...');
    
    // Set initial state - FIXED: Start with "checking" not false
    window.MoodChatConfig.networkStatus = 'checking';
    updateNetworkStatus('checking');
    
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
    
    // Register API service using api.js
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

  // Handle online event - UPDATED: Won't mark as offline if backend check is pending
  async function handleOnline() {
    console.log('Network: Online detected, verifying with API...');
    
    // Update browser status but keep overall status as "checking" until API confirms
    const browserOnline = window.AppNetwork?.isOnline?.() ?? navigator.onLine;
    
    // Notify UI that we're checking connection
    API_COORDINATION.notifyNetworkStatus('checking', 'Checking backend connection...');
    
    // Verify real online status with API heartbeat (only if backend reachable)
    if (API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable !== false) {
      try {
        const realOnline = await API_COORDINATION.getRealOnlineStatus();
        
        if (realOnline === 'online') {
          console.log('Network: Confirmed online with API');
          updateNetworkStatus('online');
          
          // Broadcast network change to other files
          broadcastNetworkChange('online');
          
          // Start all network-dependent services only if backend is reachable
          if (window.MoodChatConfig.backendReachable === true) {
            NETWORK_SERVICE_MANAGER.startAllServices();
            
            // Start background sync
            setTimeout(() => {
              NETWORK_SERVICE_MANAGER.startBackgroundSync();
            }, 500);
          }
          
          // Update UI to show online status
          showOnlineIndicator();
        } else if (realOnline === 'offline') {
          console.log('Network: Browser says online but API is unreachable');
          updateNetworkStatus('offline');
          showOfflineIndicator();
        }
        // If realOnline is 'checking', we stay in checking state
        
      } catch (error) {
        console.log('Network: API check failed:', error);
        updateNetworkStatus('offline');
        showOfflineIndicator();
      }
    } else {
      // No API available, rely on browser status
      console.log('Network: API not available, using browser status');
      updateNetworkStatus(browserOnline ? 'online' : 'offline');
      
      if (browserOnline) {
        showOnlineIndicator();
      } else {
        showOfflineIndicator();
      }
    }
  }

  // Handle offline event
  function handleOffline() {
    console.log('Network: Offline detected');
    updateNetworkStatus('offline');
    
    // Stop all network-dependent services
    NETWORK_SERVICE_MANAGER.stopAllServices();
    
    // Broadcast network change to other files
    broadcastNetworkChange('offline');
    
    // Show offline indicator
    showOfflineIndicator();
    
    // Disable login/register buttons
    enableAuthForms(false);
  }

  // Enable/disable auth forms based on online status - UPDATED: Only disable when confirmed offline
  function enableAuthForms(enabled) {
    const loginButton = document.querySelector('#loginBox button[type="submit"]');
    const registerButton = document.querySelector('#registerBox button[type="submit"]');
    
    if (loginButton) {
      loginButton.disabled = !enabled;
      loginButton.title = enabled ? '' : 'Login disabled while offline';
    }
    
    if (registerButton) {
      registerButton.disabled = !enabled;
      registerButton.title = enabled ? '' : 'Registration disabled while offline';
    }
    
    // Show warning if disabled
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus === 'offline' && (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/'))) {
      const warning = document.getElementById('offline-auth-warning');
      if (!warning) {
        const warningDiv = document.createElement('div');
        warningDiv.id = 'offline-auth-warning';
        warningDiv.style.cssText = `
          background: #f59e0b;
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 14px;
          text-align: center;
        `;
        warningDiv.textContent = '⚠️ Login and registration are disabled while offline';
        
        const authContainer = document.querySelector('.auth-container') || document.querySelector('main');
        if (authContainer) {
          authContainer.insertBefore(warningDiv, authContainer.firstChild);
        }
      }
    } else {
      const warning = document.getElementById('offline-auth-warning');
      if (warning && warning.parentNode) {
        warning.parentNode.removeChild(warning);
      }
    }
  }

  // Update network status globally - UPDATED: Accepts status string
  function updateNetworkStatus(status) {
    // Convert status string to boolean for legacy compatibility
    window.MoodChatConfig.networkStatus = status;
    
    // Expose globally for other modules
    window.MOODCHAT_NETWORK = {
      isOnline: status === 'online',
      isOffline: status === 'offline',
      isChecking: status === 'checking',
      status: status,
      lastChange: new Date().toISOString(),
      syncQueueSize: syncQueue.length,
      services: NETWORK_SERVICE_MANAGER.getServiceStates(),
      backendReachable: window.MoodChatConfig.backendReachable
    };
    
    // Dispatch custom event for other components
    const event = new CustomEvent('moodchat-network-change', {
      detail: { 
        status: status,
        isOnline: status === 'online',
        isOffline: status === 'offline',
        isChecking: status === 'checking',
        services: NETWORK_SERVICE_MANAGER.getServiceStates(),
        backendReachable: window.MoodChatConfig.backendReachable
      }
    });
    window.dispatchEvent(event);
    
    console.log(`Network status: ${status}, Backend reachable: ${window.MoodChatConfig.backendReachable}`);
    
    // Update auth forms - FIXED: Only disable when confirmed offline
    enableAuthForms(status !== 'offline');
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
  function broadcastNetworkChange(status) {
    const networkStatus = {
      type: 'network-status',
      status: status,
      isOnline: status === 'online',
      isOffline: status === 'offline',
      isChecking: status === 'checking',
      timestamp: new Date().toISOString(),
      services: NETWORK_SERVICE_MANAGER.getServiceStates(),
      backendReachable: window.MoodChatConfig.backendReachable
    };
    
    try {
      localStorage.setItem(CACHE_CONFIG.KEYS.NETWORK_STATUS, JSON.stringify(networkStatus));
      
      // Dispatch storage event for other tabs/windows
      window.dispatchEvent(new StorageEvent('storage', {
        key: CACHE_CONFIG.KEYS.NETWORK_STATUS,
        newValue: JSON.stringify(networkStatus)
      }));
    } catch (e) {
      console.log('Could not broadcast network status to localStorage:', e);
    }
  }

  // Start periodic sync monitor
  function startSyncMonitor() {
    // Check for queued items every 30 seconds
    setInterval(() => {
      const networkStatus = API_COORDINATION.getNetworkStatus();
      if (networkStatus === 'online' && syncQueue.length > 0) {
        console.log('Periodic sync check - processing queue');
        processQueuedMessages();
      }
    }, 30000);
    
    // Background data refresh every 5 minutes when online and backend reachable
    setInterval(() => {
      const networkStatus = API_COORDINATION.getNetworkStatus();
      if (networkStatus === 'online' && window.currentUser) {
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

  // API service functions using api.js
  function startApiService() {
    console.log('Starting API service using api.js...');
    // Ensure api.js is properly integrated
    if (!API_COORDINATION.isApiAvailable()) {
      console.warn('api.js not available. Make sure api.js is loaded.');
    }
    window.dispatchEvent(new CustomEvent('api-service-ready'));
  }

  function stopApiService() {
    console.log('Stopping API service...');
  }

  // Realtime updates service
  function startRealtimeUpdates() {
    console.log('Starting realtime updates service...');
    
    if (typeof window.startRealtimeListeners === 'function') {
      window.startRealtimeListeners();
    }
  }

  function stopRealtimeUpdates() {
    console.log('Stopping realtime updates service...');
    
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
    if (!window.currentUser || !window.currentUser.uid) {
      console.log('No current user, not loading queue');
      return;
    }
    
    const transaction = db.transaction(['messages', 'actions'], 'readonly');
    const messageStore = transaction.objectStore('messages');
    const actionStore = transaction.objectStore('actions');
    
    const userId = window.currentUser.uid;
    
    // Load messages for current user only
    const msgIndex = messageStore.index('userId');
    const msgRange = IDBKeyRange.only(userId);
    
    const msgRequest = msgIndex.getAll(msgRange);
    if (msgRequest) {
      msgRequest.onsuccess = function(event) {
        const messages = event.target.result;
        if (messages) {
          messages.forEach(msg => {
            if (msg.status === 'pending') {
              syncQueue.push(msg);
            }
          });
          console.log(`Loaded ${messages.length} messages from queue for user ${userId}`);
        }
      };
    }
    
    // Load actions for current user only
    const actIndex = actionStore.index('userId');
    const actRange = IDBKeyRange.only(userId);
    
    const actRequest = actIndex.getAll(actRange);
    if (actRequest) {
      actRequest.onsuccess = function(event) {
        const actions = event.target.result;
        if (actions) {
          actions.forEach(action => {
            if (action.status === 'pending') {
              syncQueue.push(action);
            }
          });
          console.log(`Loaded ${actions.length} actions from queue for user ${userId}`);
        }
      };
    }
  }

  // Queue any action for offline sync with user isolation
  function queueForSync(data, type = 'message') {
    if (!window.indexedDB || !window.currentUser || !window.currentUser.uid) {
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
          userId: window.currentUser.uid,
          attempts: 0
        };
        
        const addRequest = store.add(item);
        
        addRequest.onsuccess = function() {
          console.log(`${type} queued for sync for user ${window.currentUser.uid}:`, data);
          
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
            userId: window.currentUser.uid,
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
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus !== 'online' || !window.indexedDB || syncQueue.length === 0 || !window.currentUser) return;
    
    console.log(`Processing ${syncQueue.length} queued items for user ${window.currentUser.uid}...`);
    
    const request = indexedDB.open('MoodChatMessageQueue', 3);
    
    request.onerror = function(event) {
      console.log('Failed to open IndexedDB for processing:', event.target.error);
    };
    
    request.onsuccess = function(event) {
      const db = event.target.result;
      const userId = window.currentUser.uid;
      
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
    
    if (getRequest) {
      getRequest.onsuccess = function() {
        const items = getRequest.result;
        if (!items) return;
        
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
  }

  // Send a queued item
  function sendQueuedItem(item, db, storeName, userId) {
    // Check if we're still online and backend is reachable
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus !== 'online' || window.MoodChatConfig.backendReachable !== true) {
      console.log(`Cannot send ${storeName} ${item.id}: offline or backend unreachable`);
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
      default:
        return defaultSendItem;
    }
  }

  // Default send functions (Updated to use api.js where possible)
  function defaultSendMessage(message) {
    // Silent version for periodic checks - less verbose logging
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable === true && 
        networkStatus === 'online' && window.currentUser && JWT_VALIDATION.hasToken()) {
      return API_COORDINATION.safeApiCall('/chat/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_VALIDATION.getToken()}`
        },
        body: JSON.stringify({
          chatId: message.chatId,
          message: message.content,
          type: message.type || 'text'
        })
      });
    }
    return Promise.resolve();
  }

  function defaultSendStatus(status) {
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable === true && 
        networkStatus === 'online' && window.currentUser && JWT_VALIDATION.hasToken()) {
      return API_COORDINATION.safeApiCall('/user/status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_VALIDATION.getToken()}`
        },
        body: JSON.stringify({
          status: status.status,
          emoji: status.emoji
        })
      });
    }
    return Promise.resolve();
  }

  function defaultSendFriendRequest(request) {
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable === true && 
        networkStatus === 'online' && window.currentUser && JWT_VALIDATION.hasToken()) {
      return API_COORDINATION.safeApiCall('/friends/request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_VALIDATION.getToken()}`
        },
        body: JSON.stringify({
          userId: request.userId,
          message: request.message
        })
      });
    }
    return Promise.resolve();
  }

  function defaultSendCallLog(callLog) {
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (API_COORDINATION.isApiAvailable() && window.MoodChatConfig.backendReachable === true && 
        networkStatus === 'online' && window.currentUser && JWT_VALIDATION.hasToken()) {
      return API_COORDINATION.safeApiCall('/calls/log', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_VALIDATION.getToken()}`
        },
        body: JSON.stringify({
          callId: callLog.callId,
          duration: callLog.duration,
          type: callLog.type,
          participants: callLog.participants
        })
      });
    }
    return Promise.resolve();
  }

  function defaultSendItem(item) {
    return Promise.resolve();
  }

  // Mark item as sent (with user verification)
  function markItemAsSent(itemId, db, storeName, userId) {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const getRequest = store.get(itemId);
    
    if (getRequest) {
      getRequest.onsuccess = function() {
        const item = getRequest.result;
        if (item && item.userId === userId) {
          item.status = 'sent';
          item.sentAt = new Date().toISOString();
          
          const updateRequest = store.put(item);
          if (updateRequest) {
            updateRequest.onsuccess = function() {
              console.log(`${storeName} ${itemId} marked as sent for user ${userId}`);
              
              // Remove from in-memory queue
              syncQueue = syncQueue.filter(item => item.id !== itemId);
              window.MOODCHAT_NETWORK.syncQueueSize = syncQueue.length;
            };
          }
        }
      };
    }
  }

  // Mark item as failed (with user verification)
  function markItemAsFailed(itemId, db, storeName, reason, userId) {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const getRequest = store.get(itemId);
    
    if (getRequest) {
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
  }

  // Update item attempt count (with user verification)
  function updateItemAttempts(itemId, db, storeName, attempts, userId) {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    const getRequest = store.get(itemId);
    
    if (getRequest) {
      getRequest.onsuccess = function() {
        const item = getRequest.result;
        if (item && item.userId === userId) {
          item.attempts = attempts;
          store.put(item);
        }
      };
    }
  }

  // Enhanced Safe API call wrapper using api.js functions
  function safeApiCall(apiFunction, data, type = 'action', cacheKey = null) {
    return new Promise((resolve, reject) => {
      // Always try cache first for GET-like operations (INSTANT LOADING)
      if (cacheKey && (type === 'get' || apiFunction.name.includes('get'))) {
        const cachedData = DATA_CACHE.getInstant(cacheKey);
        if (cachedData) {
          console.log(`Using cached data instantly for: ${cacheKey}`);
          resolve({
            success: true,
            offline: !(API_COORDINATION.getNetworkStatus() === 'online'),
            cached: true,
            data: cachedData,
            message: 'Data loaded instantly from cache',
            instant: true
          });
          
          // Also try to get fresh data in background if online and backend reachable
          const networkStatus = API_COORDINATION.getNetworkStatus();
          if (networkStatus === 'online') {
            setTimeout(() => {
              fetchFreshDataInBackground(apiFunction, data, cacheKey);
            }, 1000);
          }
          return;
        }
      }
      
      // If no cache and we're offline or backend unreachable, use offline data generator
      const networkStatus = API_COORDINATION.getNetworkStatus();
      if (networkStatus === 'offline' && cacheKey && window.currentUser) {
        console.log(`Offline mode: Using offline data for: ${cacheKey}`);
        
        // Determine which offline data to generate based on cache key
        let offlineData = null;
        if (cacheKey.includes('friends')) {
          offlineData = DATA_CACHE.getOfflineTabData('friends');
        } else if (cacheKey.includes('chats')) {
          offlineData = DATA_CACHE.getOfflineTabData('chats');
        } else if (cacheKey.includes('groups')) {
          offlineData = DATA_CACHE.getOfflineTabData('groups');
        } else if (cacheKey.includes('calls')) {
          offlineData = DATA_CACHE.getOfflineTabData('calls');
        } else if (cacheKey.includes('profile')) {
          offlineData = OFFLINE_DATA_GENERATOR.generateUserProfile(window.currentUser.uid);
        }
        
        if (offlineData) {
          // Cache the offline data for next time
          DATA_CACHE.set(cacheKey, offlineData, CACHE_CONFIG.EXPIRATION.OFFLINE_DATA);
          
          resolve({
            success: true,
            offline: true,
            cached: false,
            data: offlineData,
            message: 'Using offline data generator',
            isOfflineData: true
          });
          return;
        }
      }
      
      // For online operations with backend reachable
      if (networkStatus === 'online' && window.MoodChatConfig.backendReachable === true) {
        // Make real API call using api.js
        try {
          const result = apiFunction(data);
          if (result && result.then) {
            result
              .then(apiResult => {
                // Cache the result if successful
                if (cacheKey && apiResult.success !== false) {
                  DATA_CACHE.set(cacheKey, apiResult.data);
                  
                  // Notify UI about fresh data (silent update)
                  if (instantUILoaded) {
                    const updateEvent = new CustomEvent('fresh-data-available', {
                      detail: {
                        cacheKey: cacheKey,
                        data: apiResult.data,
                        source: 'server',
                        silent: true
                      }
                    });
                    window.dispatchEvent(updateEvent);
                  }
                }
                resolve(apiResult);
              })
              .catch(error => {
                console.log('API call failed:', error);
                // Show error toast
                window.showToast(`API Error: ${error.message}`, 'error');
                
                // Try to use offline data as fallback
                if (cacheKey && window.currentUser) {
                  const offlineData = DATA_CACHE.getOfflineTabData(cacheKey.split('-')[0]);
                  if (offlineData) {
                    resolve({
                      success: true,
                      offline: true,
                      cached: false,
                      data: offlineData,
                      message: 'API failed, using offline data',
                      isOfflineData: true,
                      originalError: error.message
                    });
                  } else {
                    // Queue for retry
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
                        message: 'Action queued for retry',
                        queueId: queueResult.id,
                        userId: queueResult.userId
                      });
                    });
                  }
                }
              });
          } else {
            resolve(result);
          }
        } catch (error) {
          console.log('API call error:', error);
          // Show error toast
          window.showToast(`API Error: ${error.message}`, 'error');
          reject(error);
        }
      } else {
        // Offline or backend unreachable - queue the data
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
            queueId: queueResult.id,
            userId: queueResult.userId
          });
        })
        .catch(error => {
          resolve({
            success: false,
            offline: true,
            queued: false,
            message: 'Action not queued',
            error: error.message
          });
        });
      }
    });
  }

  // Fetch fresh data in background using api.js
  function fetchFreshDataInBackground(apiFunction, data, cacheKey) {
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus !== 'online' || window.MoodChatConfig.backendReachable !== true) return;
    
    console.log(`Fetching fresh data in background for: ${cacheKey}`);
    
    try {
      const result = apiFunction(data);
      if (result && result.then) {
        result
          .then(apiResult => {
            if (cacheKey && apiResult.success !== false) {
              // Update cache with fresh data
              DATA_CACHE.set(cacheKey, apiResult.data);
              
              // Notify UI about the update (silently)
              const updateEvent = new CustomEvent('background-data-updated', {
                detail: {
                  cacheKey: cacheKey,
                  data: apiResult.data,
                  timestamp: new Date().toISOString(),
                  silent: true
                }
              });
              window.dispatchEvent(updateEvent);
              
              console.log(`Background data updated for: ${cacheKey}`);
            }
          })
          .catch(error => {
            console.log(`Background data fetch failed for ${cacheKey}:`, error);
          });
      }
    } catch (error) {
      console.log(`Background API call error for ${cacheKey}:`, error);
    }
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
      getCurrentUser: () => window.currentUser,
      getUserId: () => window.currentUser ? window.currentUser.uid : null,
      isAuthenticated: () => !!window.currentUser,
      getUserEmail: () => window.currentUser ? window.currentUser.email : null,
      getDisplayName: () => window.currentUser ? window.currentUser.displayName : null,
      getPhotoURL: () => window.currentUser ? window.currentUser.photoURL : null,
      isAuthReady: () => authStateRestored,
      waitForAuth: window.waitForAuth,
      clearUserData: (userId) => USER_DATA_ISOLATION.clearUserData(userId),
      getCachedUsers: () => USER_DATA_ISOLATION.getCachedUsers(),
      getDeviceId: () => getDeviceId()
    };
    
    // Expose network state - UPDATED with status
    window.MOODCHAT_GLOBAL.network = {
      isOnline: () => API_COORDINATION.getNetworkStatus() === 'online',
      isOffline: () => API_COORDINATION.getNetworkStatus() === 'offline',
      isChecking: () => API_COORDINATION.getNetworkStatus() === 'checking',
      getStatus: () => API_COORDINATION.getNetworkStatus(),
      getSyncQueueSize: () => syncQueue.length,
      getServiceStates: () => NETWORK_SERVICE_MANAGER.getServiceStates(),
      isServiceRunning: (name) => NETWORK_SERVICE_MANAGER.isServiceRunning(name),
      isBackendReachable: () => window.MoodChatConfig.backendReachable,
      waitForOnline: () => {
        return new Promise((resolve) => {
          const status = API_COORDINATION.getNetworkStatus();
          if (status === 'online') {
            resolve();
          } else {
            const listener = () => {
              window.removeEventListener('moodchat-network-change', listener);
              resolve();
            };
            window.addEventListener('moodchat-network-change', (e) => {
              if (e.detail.status === 'online') {
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
      createOfflineUser: () => createOfflineUserForUI()
    };
    
    // Expose API coordination
    window.MOODCHAT_GLOBAL.api = API_COORDINATION;
    
    // Expose global AppState for UI components
    window.AppState = {
      network: {
        status: API_COORDINATION.getNetworkStatus(),
        backendReachable: window.MoodChatConfig.backendReachable,
        isOnline: API_COORDINATION.getNetworkStatus() === 'online',
        isOffline: API_COORDINATION.getNetworkStatus() === 'offline',
        isChecking: API_COORDINATION.getNetworkStatus() === 'checking'
      },
      auth: {
        currentUser: window.currentUser,
        isAuthenticated: !!window.currentUser,
        isReady: authStateRestored,
        validated: window.currentUser?.validated || false // NEW: Add validation status
      },
      api: {
        isReady: API_COORDINATION.apiReady,
        isAvailable: API_COORDINATION.isApiAvailable()
      }
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

  // INSTANT DATA LOADING: Load cached data immediately, then trigger background load
  function loadTabDataInstantly(tabName) {
    console.log(`Loading tab data instantly for: ${tabName} for user: ${window.currentUser ? window.currentUser.uid : 'none'}`);
    
    // Check if we have cached data for this tab
    const hasCachedData = DATA_CACHE.hasCachedTabData(tabName);
    let dataSource = 'cache';
    
    // Dispatch event with cached data first (if available)
    if (hasCachedData && window.currentUser) {
      const cachedData = getCachedDataForTab(tabName);
      const cacheEvent = new CustomEvent('tab-cached-data-ready', {
        detail: {
          tab: tabName,
          userId: window.currentUser.uid,
          data: cachedData,
          source: 'cache',
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(cacheEvent);
      
      console.log(`Instant cached data loaded for tab: ${tabName}`);
    } else if (window.currentUser) {
      // No cached data, use offline data generator
      console.log(`No cached data for ${tabName}, using offline data generator`);
      const offlineData = DATA_CACHE.getOfflineTabData(tabName);
      if (offlineData) {
        const offlineEvent = new CustomEvent('tab-cached-data-ready', {
          detail: {
            tab: tabName,
            userId: window.currentUser.uid,
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
    
    // Then trigger background data load if online and backend reachable using api.js
    const networkStatus = API_COORDINATION.getNetworkStatus();
    if (networkStatus === 'online' && window.MoodChatConfig.backendReachable === true) {
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

  // Trigger data load for a tab with user isolation using api.js
  function triggerTabDataLoad(tabName) {
    console.log(`Triggering data load for tab: ${tabName} for user: ${window.currentUser ? window.currentUser.uid : 'none'}`);
    
    // Dispatch event for other components to load data via api.js
    const event = new CustomEvent('tab-data-request', {
      detail: {
        tab: tabName,
        userId: window.currentUser ? window.currentUser.uid : null,
        networkStatus: API_COORDINATION.getNetworkStatus(),
        services: NETWORK_SERVICE_MANAGER.getServiceStates(),
        timestamp: new Date().toISOString(),
        background: true, // Indicate this is a background load
        usingApiJs: API_COORDINATION.isApiAvailable(), // Flag for api.js usage
        backendReachable: window.MoodChatConfig.backendReachable // Flag for backend reachability
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
                  console.log('Form data queued for user:', window.currentUser ? window.currentUser.uid : 'none');
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
        window.toggleSidebar();
      });
    }

    // Network status listeners
    window.addEventListener('moodchat-network-status', (event) => {
      console.log('Network status changed:', event.detail.status);
      updateNetworkStatus(event.detail.status);
    });

    // Auth ready listener for pending operations
    window.addEventListener('moodchat-auth-ready', () => {
      console.log('Auth ready event received in setupEventListeners');
      executePendingAuthOperations();
    });

    // Cached data loaded listener
    window.addEventListener('cached-data-loaded', (event) => {
      console.log('Cached data loaded, source:', event.detail.source);
    });

    // Tab cached data ready listener
    window.addEventListener('tab-cached-data-ready', (event) => {
      console.log(`Tab cached data ready for ${event.detail.tab}, source: ${event.detail.source}`);
    });

    // Background data updated listener
    window.addEventListener('background-data-updated', (event) => {
      console.log(`Background data updated for ${event.detail.cacheKey}`);
    });

    // Fresh data available listener
    window.addEventListener('fresh-data-available', (event) => {
      console.log(`Fresh data available for ${event.detail.cacheKey}`);
    });
  }

  // ============================================================================
  // CROSS-PAGE COMMUNICATION
  // ============================================================================

  function setupCrossPageCommunication() {
    // Listen for storage events from other tabs/windows
    window.addEventListener('storage', (event) => {
      if (event.key === 'moodchat-auth-state') {
        try {
          const authData = JSON.parse(event.newValue || '{}');
          if (authData.type === 'auth-state' && authData.user && window.currentUser?.uid !== authData.user.uid) {
            console.log('Auth state changed in another tab, updating...');
            
            // Update current user if different
            if (authData.isAuthenticated && authData.user) {
              const updatedUser = {
                uid: authData.user.uid,
                email: authData.user.email,
                displayName: authData.user.displayName,
                photoURL: authData.user.photoURL,
                emailVerified: authData.user.emailVerified || false,
                isOffline: authData.user.authMethod === 'device',
                providerId: authData.user.authMethod || 'api',
                refreshToken: 'cross-tab-sync',
                getIdToken: () => Promise.resolve('cross-tab-sync'),
                validated: authData.validated || false
              };
              
              handleAuthStateChange(updatedUser);
            } else {
              handleAuthStateChange(null);
            }
          }
        } catch (e) {
          console.log('Error parsing cross-tab auth state:', e);
        }
      }
      
      if (event.key === CACHE_CONFIG.KEYS.NETWORK_STATUS) {
        try {
          const networkData = JSON.parse(event.newValue || '{}');
          if (networkData.type === 'network-status') {
            console.log('Network status changed in another tab:', networkData.status);
            updateNetworkStatus(networkData.status);
          }
        } catch (e) {
          console.log('Error parsing cross-tab network status:', e);
        }
      }
    });
  }

  // ============================================================================
  // STYLES INJECTION
  // ============================================================================

  function injectStyles() {
    const styleId = 'moodchat-core-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
      .theme-dark { background-color: #1f2937; color: #f9fafb; }
      .theme-light { background-color: #f9fafb; color: #1f2937; }
      .font-small { font-size: 0.875rem; }
      .font-medium { font-size: 1rem; }
      .font-large { font-size: 1.125rem; }
      .font-xlarge { font-size: 1.25rem; }
      .hidden { display: none !important; }
      .tab-loading-indicator {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 9999;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #8b5cf6;
        animation: spin 1s linear infinite;
      }
      .loading-text {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-20px); opacity: 0; }
      }
      @keyframes slideInUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes slideOutDown {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(100%); opacity: 0; }
      }
      .high-contrast {
        filter: contrast(1.2);
      }
      .reduce-motion * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      .large-text {
        font-size: 1.25rem;
      }
      .wallpaper-gradient1 {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .wallpaper-gradient2 {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      .wallpaper-pattern1 {
        background-image: radial-gradient(#4a5568 1px, transparent 1px);
        background-size: 20px 20px;
      }
      .wallpaper-default {
        background-color: #f3f4f6;
      }
      .wallpaper-custom {
        background-size: cover;
        background-attachment: fixed;
      }
      :root {
        --font-size-multiplier: 1;
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // ============================================================================
  // MODAL MANAGEMENT
  // ============================================================================

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  window.closeModal = closeModal;

  // ============================================================================
  // BOOTSTRAP INITIALIZATION
  // ============================================================================

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    // DOM already loaded
    setTimeout(initializeApp, 0);
  }

  // ============================================================================
  // GLOBAL EXPORTS
  // ============================================================================

  // Expose critical functions globally for other scripts
  window.switchTab = switchTab;
  window.loadExternalTab = loadExternalTab;
  window.queueForSync = queueForSync;
  window.safeApiCall = safeApiCall;
  window.processQueuedMessages = processQueuedMessages;
  window.getDeviceId = getDeviceId;
  window.getCurrentUser = () => window.currentUser;
  window.isAuthenticated = () => !!window.currentUser;
  window.isAuthReady = () => authStateRestored;
  window.waitForAuth = () => {
    return new Promise((resolve) => {
      if (authStateRestored) {
        resolve(window.currentUser);
      } else {
        const listener = () => {
          window.removeEventListener('moodchat-auth-ready', listener);
          resolve(window.currentUser);
        };
        window.addEventListener('moodchat-auth-ready', listener);
      }
    });
  };

  // Expose API coordination for external use
  window.MoodChatAPI = API_COORDINATION;
  window.MoodChatCache = DATA_CACHE;
  window.MoodChatSettings = SETTINGS_SERVICE;
  window.MoodChatNetworkServices = NETWORK_SERVICE_MANAGER;
  window.MoodChatUserIsolation = USER_DATA_ISOLATION;

  // Expose token validation
  window.MoodChatJWT = JWT_VALIDATION;

  // Global toast function (if not defined)
  if (!window.showToast) {
    window.showToast = function(message, type = 'info') {
      console.log(`Toast (${type}): ${message}`);
      
      // Create a simple toast notification
      const toast = document.createElement('div');
      toast.className = 'moodchat-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#f87171' : type === 'success' ? '#10b981' : '#3b82f6'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        animation: slideInUp 0.3s ease-out;
      `;
      toast.textContent = message;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.style.animation = 'slideOutDown 0.3s ease-in';
          setTimeout(() => toast.remove(), 300);
        }
      }, 3000);
    };
  }

  // Global loading functions (if not defined)
  if (!window.showLoginLoading) {
    window.showLoginLoading = function(show) {
      const button = document.querySelector('#loginBox button[type="submit"]');
      if (button) {
        button.disabled = show;
        button.innerHTML = show ? 
          '<span class="loading-spinner-small"></span> Logging in...' : 
          'Login';
      }
    };
  }

  if (!window.showRegisterLoading) {
    window.showRegisterLoading = function(show) {
      const button = document.querySelector('#registerBox button[type="submit"]');
      if (button) {
        button.disabled = show;
        button.innerHTML = show ? 
          '<span class="loading-spinner-small"></span> Registering...' : 
          'Register';
      }
    };
  }

  // Add small spinner style if not present
  if (!document.querySelector('#loading-spinner-small-style')) {
    const spinnerStyle = document.createElement('style');
    spinnerStyle.id = 'loading-spinner-small-style';
    spinnerStyle.textContent = `
      .loading-spinner-small {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 1s linear infinite;
        margin-right: 8px;
        vertical-align: middle;
      }
    `;
    document.head.appendChild(spinnerStyle);
  }

  console.log('✅ app.core.js loaded successfully');
})();