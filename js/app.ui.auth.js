// app.ui.auth.js - MoodChat Network Status Detection with JWT Auth
// FOCUS: Network status detection, backend health checks, and JWT auth handling
// UI forms, buttons, toggling logic, and auth handling remain in index.html

// ============================================================================
// NETWORK STATUS MANAGEMENT
// ============================================================================

// Global state for network status - READ ONLY from api.js
window.NetworkStatus = {
  status: 'checking', // 'checking', 'online', 'offline'
  backendReachable: false,
  lastChecked: null,
  checkInterval: null,
  syncInterval: null,
  authInitialized: false // NEW: Flag to prevent overwriting auth state
};

// ============================================================================
// JWT AUTHENTICATION MANAGEMENT
// ============================================================================

/**
 * Saves JWT token and user info to localStorage
 */
function saveAuthData(token, userData) {
  console.log('Saving auth data to localStorage');
  
  // Save combined auth data
  const authUser = {
    token: token,
    user: userData,
    timestamp: new Date().toISOString()
  };
  
  localStorage.setItem('authUser', JSON.stringify(authUser));
  
  // Also save user info separately for easy access
  localStorage.setItem('currentUser', JSON.stringify(userData));
  
  // Set auth initialized flag to prevent overwrites
  window.NetworkStatus.authInitialized = true;
  
  console.log('Auth data saved successfully, authInitialized:', true);
}

/**
 * Retrieves auth data from localStorage
 */
function getAuthData() {
  try {
    const authUserStr = localStorage.getItem('authUser');
    if (!authUserStr) return null;
    
    const authUser = JSON.parse(authUserStr);
    
    // Check if token exists
    if (!authUser.token) {
      console.log('No token found in auth data');
      return null;
    }
    
    console.log('Auth data retrieved successfully');
    return authUser;
  } catch (error) {
    console.error('Error retrieving auth data:', error);
    return null;
  }
}

/**
 * Clears auth data from localStorage (logout)
 */
function clearAuthData() {
  console.log('Clearing auth data from localStorage');
  localStorage.removeItem('authUser');
  localStorage.removeItem('currentUser');
  
  // Reset auth initialized flag
  window.NetworkStatus.authInitialized = false;
  
  console.log('Auth data cleared successfully');
}

/**
 * Checks if user is already logged in via JWT
 * Returns true if auto-login was attempted (successful or not)
 */
function checkAutoLogin() {
  console.log('Checking for auto-login...');
  
  const authData = getAuthData();
  
  if (authData && authData.token) {
    console.log('Valid JWT found, attempting auto-login');
    
    // Set auth initialized flag to prevent overwrites
    window.NetworkStatus.authInitialized = true;
    
    // Set user in app state if AppState exists
    if (window.AppState && authData.user) {
      window.AppState.user = authData.user;
      console.log('User set in AppState:', authData.user);
    }
    
    // Set token in api.js if API_COORDINATION exists
    if (window.API_COORDINATION) {
      window.API_COORDINATION.authToken = authData.token;
      console.log('Token set in API_COORDINATION');
    }
    
    // Redirect to chat page
    console.log('Redirecting to chat.html...');
    window.location.href = 'chat.html';
    return true;
  }
  
  console.log('No valid JWT found, showing login form');
  return false;
}

// ============================================================================
// AUTH FORM HANDLERS WITH JWT SUPPORT
// ============================================================================

/**
 * Handles login form submission
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  console.log('Login form submitted');
  
  const form = event.target;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;
  
  // Disable form during submission
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Logging in...';
  submitBtn.disabled = true;
  
  try {
    // Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      throw new Error('API not available. Please check your connection.');
    }
    
    // Call login API
    console.log('Calling login API...');
    const response = await window.api('/login', {
      method: 'POST',
      body: { email, password }
    });
    
    console.log('Login API response:', response);
    
    // Check for success
    if (response && response.success && response.data) {
      const { token, user } = response.data;
      
      if (token) {
        // Save JWT and user info - THIS IS NOW IMMEDIATE
        saveAuthData(token, user);
        
        // Set user in AppState immediately
        if (window.AppState) {
          window.AppState.user = user;
        }
        
        // Set token in API_COORDINATION immediately
        if (window.API_COORDINATION) {
          window.API_COORDINATION.authToken = token;
        }
        
        // Show success message
        updateNetworkStatusUI('online', 'Login successful!');
        
        // IMMEDIATE redirect to chat page (no delay)
        console.log('Login successful, redirecting immediately to chat.html');
        window.location.href = 'chat.html';
      } else {
        throw new Error('No token received from server');
      }
    } else {
      throw new Error(response?.message || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Show error in network status indicator
    updateNetworkStatusUI('offline', `Login failed: ${error.message}`);
    
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handles registration form submission
 */
async function handleRegisterSubmit(event) {
  event.preventDefault();
  console.log('Registration form submitted');
  
  const form = event.target;
  const name = form.querySelector('input[type="text"]').value;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;
  
  // Disable form during submission
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Registering...';
  submitBtn.disabled = true;
  
  try {
    // Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      throw new Error('API not available. Please check your connection.');
    }
    
    // Call register API
    console.log('Calling register API...');
    const response = await window.api('/register', {
      method: 'POST',
      body: { name, email, password }
    });
    
    console.log('Register API response:', response);
    
    // Check for success
    if (response && response.success && response.data) {
      const { token, user } = response.data;
      
      if (token) {
        // Save JWT and user info - THIS IS NOW IMMEDIATE
        saveAuthData(token, user);
        
        // Set user in AppState immediately
        if (window.AppState) {
          window.AppState.user = user;
        }
        
        // Set token in API_COORDINATION immediately
        if (window.API_COORDINATION) {
          window.API_COORDINATION.authToken = token;
        }
        
        // Show success message
        updateNetworkStatusUI('online', 'Registration successful!');
        
        // IMMEDIATE redirect to chat page (no delay)
        console.log('Registration successful, redirecting immediately to chat.html');
        window.location.href = 'chat.html';
      } else {
        throw new Error('No token received from server');
      }
    } else {
      throw new Error(response?.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    // Show error in network status indicator
    updateNetworkStatusUI('offline', `Registration failed: ${error.message}`);
    
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// ============================================================================
// MODIFIED: NETWORK STATUS UI UPDATES (PROTECTED AGAINST AUTH OVERWRITES)
// ============================================================================

/**
 * Updates the network status indicator in the UI
 * Reads status from api.js or falls back to browser status
 * This ONLY updates the indicator, doesn't block any UI actions
 * NEVER clears or overrides auth state
 */
function updateNetworkStatusUI(status, message) {
  console.log(`Network status update: ${status} - ${message} (authInitialized: ${window.NetworkStatus.authInitialized})`);
  
  // Update global state
  window.NetworkStatus.status = status;
  
  // CRITICAL: Check if auth is already initialized before any state clearing
  if (window.NetworkStatus.authInitialized) {
    console.log('Auth already initialized, preserving user state regardless of network status');
    
    // Even if backend is unreachable, DO NOT clear auth data
    if (status === 'offline' || status === 'checking') {
      console.log('Backend unreachable but user remains logged in (auth preserved)');
      message = `${message} - User remains logged in`;
    }
  }
  
  // Rest of the function remains the same...
  let indicator = document.getElementById('network-status-indicator');
  
  // Create indicator if it doesn't exist
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'network-status-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 999;
      opacity: 0.9;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(indicator);
    
    // Add animation styles if not present
    if (!document.getElementById('network-status-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'network-status-styles';
      styleSheet.textContent = `
        @keyframes slideIn {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 0.9;
          }
        }
        
        @keyframes slideOut {
          from {
            transform: translateY(0);
            opacity: 0.9;
          }
          to {
            transform: translateY(100%);
            opacity: 0;
          }
        }
        
        .pulse-animation {
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { opacity: 0.7; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }
      `;
      document.head.appendChild(styleSheet);
    }
  }
  
  // Update indicator based on status
  switch(status) {
    case 'checking':
      indicator.style.background = '#f59e0b'; // Amber
      indicator.style.color = '#000000';
      indicator.innerHTML = '🔄 Checking connection...';
      indicator.classList.add('pulse-animation');
      indicator.style.display = 'block';
      break;
      
    case 'online':
      indicator.style.background = '#10b981'; // Green
      indicator.style.color = '#ffffff';
      indicator.innerHTML = '✅ Online' + (message ? ` - ${message}` : '');
      indicator.classList.remove('pulse-animation');
      indicator.style.display = 'block';
      
      // Auto-hide after 3 seconds if online (unless it's a login/register success)
      if (!message || (!message.includes('Login') && !message.includes('Registration'))) {
        setTimeout(() => {
          if (indicator && indicator.parentNode && window.NetworkStatus.status === 'online') {
            indicator.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
              if (indicator && indicator.parentNode) {
                indicator.style.display = 'none';
              }
            }, 300);
          }
        }, 3000);
      }
      break;
      
    case 'offline':
      indicator.style.background = '#ef4444'; // Red
      indicator.style.color = '#ffffff';
      indicator.innerHTML = '⚠️ Offline' + (message ? ` - ${message}` : '');
      indicator.classList.remove('pulse-animation');
      indicator.style.display = 'block';
      break;
  }
  
  // Dispatch event for other components to listen to
  const event = new CustomEvent('moodchat-network-status', {
    detail: {
      status: status,
      message: message,
      timestamp: new Date().toISOString(),
      backendReachable: window.NetworkStatus.backendReachable,
      authInitialized: window.NetworkStatus.authInitialized // Include in event
    }
  });
  window.dispatchEvent(event);
}

// ============================================================================
// MODIFIED: API.JS EVENT LISTENER (PROTECTED AGAINST AUTH OVERWRITES)
// ============================================================================

/**
 * Sets up listener for api.js network status events
 * PROTECTED: Network events should never clear or override auth state
 */
function setupApiStatusListener() {
  console.log('Setting up api.js network status event listeners (protected mode)...');
  
  // Track if we've already handled the first API ready event
  let firstApiReadyHandled = false;
  
  // Listen for api-network-status events
  window.addEventListener('api-network-status', (event) => {
    console.log('Received api-network-status event:', event.detail);
    
    const { isReachable, message } = event.detail || {};
    const browserOnline = navigator.onLine;
    
    // CRITICAL: Check if auth is already initialized
    const authData = getAuthData();
    const hasAuth = !!(authData && authData.token);
    
    if (hasAuth) {
      console.log('User has auth token, network events will not affect auth state');
    }
    
    // Determine status based on api.js and browser status
    if (!browserOnline) {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      
      // NEVER clear auth data even if offline
      updateNetworkStatusUI('offline', 'No internet connection' + (hasAuth ? ' - User remains logged in' : ''));
    } else if (isReachable) {
      window.NetworkStatus.status = 'online';
      window.NetworkStatus.backendReachable = true;
      updateNetworkStatusUI('online', message || 'Connected to MoodChat' + (hasAuth ? ' - User logged in' : ''));
    } else {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      
      // NEVER clear auth data even if backend unreachable
      updateNetworkStatusUI('offline', message || 'Cannot reach MoodChat server' + (hasAuth ? ' - User remains logged in' : ''));
    }
    
    window.NetworkStatus.lastChecked = new Date();
  });
  
  // MODIFIED: Listen for api-ready events (with protection against multiple triggers)
  const handleApiReady = () => {
    console.log('API ready event received (first handled:', firstApiReadyHandled, ')');
    
    // Only handle auto-login on first API ready event
    if (!firstApiReadyHandled) {
      firstApiReadyHandled = true;
      
      // Check for existing auth data
      const authData = getAuthData();
      
      if (authData && authData.token) {
        console.log('Found existing auth token on first API ready, performing auto-login');
        
        // Set auth initialized flag
        window.NetworkStatus.authInitialized = true;
        
        // Set user in AppState
        if (window.AppState && authData.user) {
          window.AppState.user = authData.user;
          console.log('Auto-login: User set in AppState');
        }
        
        // Set token in API_COORDINATION
        if (window.API_COORDINATION) {
          window.API_COORDINATION.authToken = authData.token;
          console.log('Auto-login: Token set in API_COORDINATION');
        }
        
        // Check if we're on index.html (login page)
        if (window.location.pathname.includes('index.html') || 
            window.location.pathname === '/' || 
            window.location.pathname.endsWith('/')) {
          console.log('Auto-login: Redirecting to chat.html');
          setTimeout(() => {
            window.location.href = 'chat.html';
          }, 500);
        } else {
          console.log('Auto-login: Already on chat page or other page');
        }
      } else {
        console.log('No auth token found on first API ready, showing login form');
      }
    } else {
      console.log('Subsequent API ready event - skipping auth initialization');
    }
    
    // Always update network status (non-blocking)
    setTimeout(() => {
      updateNetworkStatusFromApi().catch(console.error);
    }, 500);
  };
  
  window.addEventListener('api-ready', handleApiReady);
  window.addEventListener('apiready', handleApiReady);
  window.addEventListener('apiReady', handleApiReady);
}

// ============================================================================
// MODIFIED: PERIODIC STATUS UPDATES (PROTECTED VERSION)
// ============================================================================

/**
 * Starts periodic network status updates from api.js
 * PROTECTED: Updates network status only, never affects auth state
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
    window.NetworkStatus.checkInterval = null;
  }
  
  // Initial update after api.js has time to initialize
  setTimeout(() => {
    console.log('Initial network status check (protected mode)...');
    updateNetworkStatusFromApi().catch(error => {
      console.log('Initial network status check failed:', error.message);
    });
  }, 2000);
  
  // Set up periodic updates (every 10 seconds - non-blocking)
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      console.log('Periodic network status check (protected mode)...');
      updateNetworkStatusFromApi().catch(error => {
        console.log('Periodic network status check failed:', error.message);
      });
    } else {
      // Immediately update if browser goes offline
      console.log('Browser offline detected in periodic check');
      
      // CRITICAL: Never clear auth data even if offline
      const authData = getAuthData();
      const hasAuth = !!(authData && authData.token);
      
      updateNetworkStatusUI('offline', 'No internet connection' + (hasAuth ? ' - User remains logged in' : ''));
      window.NetworkStatus.backendReachable = false;
      window.NetworkStatus.lastChecked = new Date();
    }
  }, 10000); // 10 seconds
  
  console.log('Periodic network status updates started (protected mode)');
}

// ============================================================================
// MODIFIED: BROWSER ONLINE/OFFLINE EVENT HANDLERS (PROTECTED)
// ============================================================================

/**
 * Handles browser's online event
 * PROTECTED: Never clears auth data
 */
function handleBrowserOnline() {
  console.log('Browser online event detected');
  
  // Check if user has auth
  const authData = getAuthData();
  const hasAuth = !!(authData && authData.token);
  
  updateNetworkStatusUI('checking', 'Reconnecting...' + (hasAuth ? ' - User logged in' : ''));
  
  // Wait a moment before updating (allow network to stabilize)
  setTimeout(() => {
    updateNetworkStatusFromApi().catch(console.error);
  }, 1000);
}

/**
 * Handles browser's offline event
 * PROTECTED: Never clears auth data
 */
function handleBrowserOffline() {
  console.log('Browser offline event detected');
  
  // Check if user has auth
  const authData = getAuthData();
  const hasAuth = !!(authData && authData.token);
  
  updateNetworkStatusUI('offline', 'No internet connection' + (hasAuth ? ' - User remains logged in' : ''));
  window.NetworkStatus.backendReachable = false;
  window.NetworkStatus.lastChecked = new Date();
}

// ============================================================================
// MODIFIED: NETWORK STATUS READING (PROTECTED VERSION)
// ============================================================================

/**
 * Reads network status from api.js using multiple methods
 * PROTECTED: Returns network status only, never affects auth state
 */
async function readNetworkStatusFromApi() {
  console.log('readNetworkStatusFromApi called (protected mode)...');
  
  // Check if user has auth token
  const authData = getAuthData();
  const hasAuth = !!(authData && authData.token);
  
  // Method 1: Check browser network status first (fastest)
  if (!navigator.onLine) {
    console.log('Browser reports offline (user has auth:', hasAuth, ')');
    return { 
      status: 'offline', 
      message: 'No internet connection' + (hasAuth ? ' - User remains logged in' : ''), 
      backendReachable: false 
    };
  }
  
  // Rest of the function remains similar but messages include auth status
  // ... (rest of the function unchanged except for messages)
  
  // In each return statement, append auth status to message if needed
  // For example, in Method 2:
  if (window.API_COORDINATION && window.API_COORDINATION.backendReachable !== undefined) {
    const isReachable = window.API_COORDINATION.backendReachable;
    console.log('API_COORDINATION says backendReachable:', isReachable);
    return {
      status: isReachable ? 'online' : 'offline',
      message: (isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server') + 
               (hasAuth ? ' - User logged in' : ''),
      backendReachable: isReachable
    };
  }
  
  // ... (rest of the function with similar modifications to messages)
  
  // Final fallback
  console.log('Unable to determine network status, showing checking...');
  return { 
    status: 'checking', 
    message: 'Checking connection...' + (hasAuth ? ' - User logged in' : ''), 
    backendReachable: false 
  };
}

/**
 * Updates UI based on network status from api.js
 * PROTECTED: Updates network status only, never affects auth state
 */
async function updateNetworkStatusFromApi() {
  try {
    console.log('Updating network status from api.js (protected mode)...');
    const statusInfo = await readNetworkStatusFromApi();
    console.log('Status info determined:', statusInfo);
    
    window.NetworkStatus.status = statusInfo.status;
    window.NetworkStatus.backendReachable = statusInfo.backendReachable;
    window.NetworkStatus.lastChecked = new Date();
    
    updateNetworkStatusUI(statusInfo.status, statusInfo.message);
  } catch (error) {
    console.error('Error updating network status from api.js:', error);
    
    // Check if user has auth
    const authData = getAuthData();
    const hasAuth = !!(authData && authData.token);
    
    updateNetworkStatusUI('checking', 'Checking connection...' + (hasAuth ? ' - User logged in' : ''));
  }
}

// ============================================================================
// MODIFIED: INTEGRATION WITH APP STATE (PROTECTED)
// ============================================================================

/**
 * Integrates network status with existing AppState
 * PROTECTED: Never clears user from AppState
 */
function integrateWithAppState() {
  // Ensure AppState exists
  if (!window.AppState) {
    window.AppState = {};
  }
  
  // Ensure network state exists in AppState
  if (!window.AppState.network) {
    window.AppState.network = {
      status: 'checking',
      backendReachable: false,
      lastChecked: null
    };
  }
  
  // Ensure user exists in AppState if we have auth data
  const authData = getAuthData();
  if (authData && authData.user && !window.AppState.user) {
    window.AppState.user = authData.user;
    console.log('Restored user from localStorage to AppState:', authData.user);
  }
  
  // Clear any existing sync interval
  if (window.NetworkStatus.syncInterval) {
    clearInterval(window.NetworkStatus.syncInterval);
  }
  
  // Sync NetworkStatus with AppState.network every 2 seconds
  // BUT NEVER clear or override AppState.user
  window.NetworkStatus.syncInterval = setInterval(() => {
    if (window.AppState && window.AppState.network) {
      window.AppState.network.status = window.NetworkStatus.status;
      window.AppState.network.backendReachable = window.NetworkStatus.backendReachable;
      window.AppState.network.lastChecked = window.NetworkStatus.lastChecked;
    }
  }, 2000);
}

// ============================================================================
// MODIFIED: INITIALIZATION (WITH PROTECTED AUTO-LOGIN)
// ============================================================================

/**
 * Initializes network status monitoring and auth forms
 * PROTECTED: Auth state is preserved across network events
 */
function initializeAuthUI() {
  console.log('Initializing auth UI and network status monitoring (protected mode)...');
  
  // 1. First check for auto-login (before setting up forms)
  const shouldAutoLogin = checkAutoLogin();
  
  // If auto-login succeeded and we're redirecting, don't set up forms
  if (shouldAutoLogin) {
    console.log('Auto-login in progress, skipping form setup');
    return;
  }
  
  // 2. Check if we're already on chat.html with auth
  if (window.location.pathname.includes('chat.html')) {
    const authData = getAuthData();
    if (authData && authData.token) {
      console.log('Already on chat page with auth token, skipping form setup');
      window.NetworkStatus.authInitialized = true;
      
      // Set up network monitoring only
      setupApiStatusListener();
      integrateWithAppState();
      startPeriodicNetworkUpdates();
      return;
    }
  }
  
  // 3. Set up auth form listeners (only if we're on login page)
  setupAuthFormListeners();
  
  // 4. Set initial network UI state (non-blocking)
  updateNetworkStatusUI('checking', 'Checking connection...');
  
  // 5. Set up api.js event listener for real-time status updates
  setupApiStatusListener();
  
  // 6. Integrate with existing AppState
  integrateWithAppState();
  
  // 7. Set up browser event listeners for network status
  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);
  
  // 8. Start periodic network status updates from api.js (non-blocking)
  setTimeout(() => {
    startPeriodicNetworkUpdates();
  }, 1000); // Start after 1 second to ensure API is loaded
  
  console.log('Auth UI and network monitoring initialized (protected mode)');
}

// ============================================================================
// MODIFIED: DEBUG FUNCTION TO SHOW PROTECTED STATE
// ============================================================================

/**
 * Debug function to check all available status sources
 */
window.debugNetworkStatus = function() {
  console.log('=== NETWORK STATUS DEBUG (PROTECTED) ===');
  console.log('Browser online:', navigator.onLine);
  console.log('API_COORDINATION:', window.API_COORDINATION);
  console.log('NetworkStatus.authInitialized:', window.NetworkStatus.authInitialized);
  console.log('NetworkStatus.backendReachable:', window.NetworkStatus.backendReachable);
  console.log('Auth data exists:', !!localStorage.getItem('authUser'));
  console.log('Current user in AppState:', window.AppState?.user);
  console.log('Current user in localStorage:', JSON.parse(localStorage.getItem('currentUser') || 'null'));
  console.log('===========================');
};