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
  syncInterval: null
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
  
  console.log('Auth data saved successfully');
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
    
    // Optional: Check token expiration if you have expiry info
    // This would require JWT decoding or backend response
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
  console.log('Auth data cleared successfully');
}

/**
 * Checks if user is already logged in via JWT
 */
function checkAutoLogin() {
  console.log('Checking for auto-login...');
  
  const authData = getAuthData();
  
  if (authData && authData.token) {
    console.log('Valid JWT found, attempting auto-login');
    
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
        // Save JWT and user info
        saveAuthData(token, user);
        
        // Show success message
        updateNetworkStatusUI('online', 'Login successful!');
        
        // Small delay before redirect
        setTimeout(() => {
          window.location.href = 'chat.html';
        }, 1000);
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
        // Save JWT and user info
        saveAuthData(token, user);
        
        // Show success message
        updateNetworkStatusUI('online', 'Registration successful!');
        
        // Small delay before redirect
        setTimeout(() => {
          window.location.href = 'chat.html';
        }, 1000);
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

/**
 * Handles forgot password form submission
 */
async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  console.log('Forgot password form submitted');
  
  const form = event.target;
  const email = form.querySelector('input[type="email"]').value;
  
  // Disable form during submission
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;
  
  try {
    // Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      throw new Error('API not available. Please check your connection.');
    }
    
    // Call forgot password API
    console.log('Calling forgot password API...');
    const response = await window.api('/forgot-password', {
      method: 'POST',
      body: { email }
    });
    
    console.log('Forgot password API response:', response);
    
    // Show success/error message
    if (response && response.success) {
      updateNetworkStatusUI('online', 'Password reset email sent!');
      
      // Switch back to login form after delay
      setTimeout(() => {
        showLoginForm();
      }, 3000);
    } else {
      throw new Error(response?.message || 'Password reset failed');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    updateNetworkStatusUI('offline', `Password reset failed: ${error.message}`);
  } finally {
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// ============================================================================
// NETWORK STATUS UI UPDATES (READS FROM API.JS)
// ============================================================================

/**
 * Updates the network status indicator in the UI
 * Reads status from api.js or falls back to browser status
 * This ONLY updates the indicator, doesn't block any UI actions
 */
function updateNetworkStatusUI(status, message) {
  console.log(`Network status update: ${status} - ${message}`);
  
  // Update global state
  window.NetworkStatus.status = status;
  
  // Find or create network status indicator
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
      backendReachable: window.NetworkStatus.backendReachable
    }
  });
  window.dispatchEvent(event);
}

// ============================================================================
// NETWORK STATUS READING FROM API.JS (UPDATED TO HANDLE /STATUS ENDPOINT)
// ============================================================================

/**
 * Reads network status from api.js using multiple methods
 * Returns the current network status for UI display only
 */
async function readNetworkStatusFromApi() {
  console.log('readNetworkStatusFromApi called - checking multiple sources...');
  
  // Method 1: Check browser network status first (fastest)
  if (!navigator.onLine) {
    console.log('Browser reports offline');
    return { status: 'offline', message: 'No internet connection', backendReachable: false };
  }
  
  // Method 2: Check if api.js has exposed status directly (most reliable)
  console.log('Checking API_COORDINATION:', window.API_COORDINATION);
  if (window.API_COORDINATION && window.API_COORDINATION.backendReachable !== undefined) {
    const isReachable = window.API_COORDINATION.backendReachable;
    console.log('API_COORDINATION says backendReachable:', isReachable);
    return {
      status: isReachable ? 'online' : 'offline',
      message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
      backendReachable: isReachable
    };
  }
  
  // Method 3: Check other api.js exposed properties
  console.log('Checking other API status properties...');
  
  // Check for MoodChatAPI global object
  if (window.MoodChatAPI && window.MoodChatAPI.backendReachable !== undefined) {
    const isReachable = window.MoodChatAPI.backendReachable;
    console.log('MoodChatAPI says backendReachable:', isReachable);
    return {
      status: isReachable ? 'online' : 'offline',
      message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
      backendReachable: isReachable
    };
  }
  
  // Check for API_STATUS global object
  if (window.API_STATUS && window.API_STATUS.backendReachable !== undefined) {
    const isReachable = window.API_STATUS.backendReachable;
    console.log('API_STATUS says backendReachable:', isReachable);
    return {
      status: isReachable ? 'online' : 'offline',
      message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
      backendReachable: isReachable
    };
  }
  
  // Method 4: Direct API call to /status endpoint (fallback)
  if (typeof window.api === 'function') {
    try {
      console.log('Attempting direct /status API call...');
      
      // Use a timeout to prevent blocking UI
      const statusPromise = window.api('/status');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), 3000)
      );
      
      const response = await Promise.race([statusPromise, timeoutPromise]);
      console.log('/status API response:', response);
      
      // Check if response indicates backend is reachable
      // The backend might return different success indicators
      const isReachable = response && (
        response.status === 'ok' || 
        response.success === true ||
        response.healthy === true ||
        (response.statusCode && response.statusCode === 200) ||
        (response.code && response.code === 200)
      );
      
      console.log('Direct API check says backendReachable:', isReachable);
      
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    } catch (error) {
      console.log('Direct API status check failed:', error.message);
      // Don't throw, just continue to other methods
    }
  }
  
  // Method 5: Check if we've received any api-network-status events
  console.log('Checking for cached network status...');
  if (window.NetworkStatus.lastChecked && 
      Date.now() - window.NetworkStatus.lastChecked.getTime() < 30000) {
    // Use cached status if it's recent (less than 30 seconds old)
    console.log('Using cached network status:', window.NetworkStatus.status);
    return {
      status: window.NetworkStatus.status,
      message: window.NetworkStatus.status === 'online' ? 'Connected to MoodChat' : 
               window.NetworkStatus.status === 'offline' ? 'Cannot reach MoodChat server' : 
               'Checking connection...',
      backendReachable: window.NetworkStatus.backendReachable
    };
  }
  
  // If we can't determine status, show checking
  console.log('Unable to determine network status, showing checking...');
  return { status: 'checking', message: 'Checking connection...', backendReachable: false };
}

/**
 * Updates UI based on network status from api.js
 * This runs in the background and does NOT block UI interactions
 */
async function updateNetworkStatusFromApi() {
  try {
    console.log('Updating network status from api.js...');
    const statusInfo = await readNetworkStatusFromApi();
    console.log('Status info determined:', statusInfo);
    
    window.NetworkStatus.status = statusInfo.status;
    window.NetworkStatus.backendReachable = statusInfo.backendReachable;
    window.NetworkStatus.lastChecked = new Date();
    
    updateNetworkStatusUI(statusInfo.status, statusInfo.message);
  } catch (error) {
    console.error('Error updating network status from api.js:', error);
    updateNetworkStatusUI('checking', 'Checking connection...');
  }
}

// ============================================================================
// API.JS EVENT LISTENER (UPDATED TO HANDLE MORE EVENTS)
// ============================================================================

/**
 * Sets up listener for api.js network status events
 */
function setupApiStatusListener() {
  console.log('Setting up api.js network status event listeners...');
  
  // Listen for api-network-status events
  window.addEventListener('api-network-status', (event) => {
    console.log('Received api-network-status event:', event.detail);
    
    const { isReachable, message } = event.detail || {};
    const browserOnline = navigator.onLine;
    
    // Determine status based on api.js and browser status
    if (!browserOnline) {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', 'No internet connection');
    } else if (isReachable) {
      window.NetworkStatus.status = 'online';
      window.NetworkStatus.backendReachable = true;
      updateNetworkStatusUI('online', message || 'Connected to MoodChat');
    } else {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', message || 'Cannot reach MoodChat server');
    }
    
    window.NetworkStatus.lastChecked = new Date();
  });
  
  // Listen for api-ready events (multiple variants)
  const handleApiReady = () => {
    console.log('API ready event received, checking network status...');
    setTimeout(() => {
      updateNetworkStatusFromApi().catch(console.error);
    }, 500); // Small delay to ensure API is fully ready
  };
  
  window.addEventListener('api-ready', handleApiReady);
  window.addEventListener('apiready', handleApiReady);
  window.addEventListener('apiReady', handleApiReady);
}

// ============================================================================
// PERIODIC STATUS UPDATES (IMPROVED LOGIC)
// ============================================================================

/**
 * Starts periodic network status updates from api.js
 * Reads status every 10 seconds without blocking UI
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
    window.NetworkStatus.checkInterval = null;
  }
  
  // Initial update after api.js has time to initialize
  setTimeout(() => {
    console.log('Initial network status check...');
    updateNetworkStatusFromApi().catch(error => {
      console.log('Initial network status check failed:', error.message);
    });
  }, 2000);
  
  // Set up periodic updates (every 10 seconds - non-blocking)
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      console.log('Periodic network status check...');
      updateNetworkStatusFromApi().catch(error => {
        console.log('Periodic network status check failed:', error.message);
      });
    } else {
      // Immediately update if browser goes offline
      console.log('Browser offline detected in periodic check');
      updateNetworkStatusUI('offline', 'No internet connection');
      window.NetworkStatus.backendReachable = false;
      window.NetworkStatus.lastChecked = new Date();
    }
  }, 10000); // 10 seconds
  
  console.log('Periodic network status updates started');
}

// ============================================================================
// BROWSER ONLINE/OFFLINE EVENT HANDLERS
// ============================================================================

/**
 * Handles browser's online event
 */
function handleBrowserOnline() {
  console.log('Browser online event detected');
  updateNetworkStatusUI('checking', 'Reconnecting...');
  
  // Wait a moment before updating (allow network to stabilize)
  setTimeout(() => {
    updateNetworkStatusFromApi().catch(console.error);
  }, 1000);
}

/**
 * Handles browser's offline event
 */
function handleBrowserOffline() {
  console.log('Browser offline event detected');
  updateNetworkStatusUI('offline', 'No internet connection');
  window.NetworkStatus.backendReachable = false;
  window.NetworkStatus.lastChecked = new Date();
}

// ============================================================================
// AUTH FORM TOGGLING FUNCTIONS (NON-BLOCKING)
// ============================================================================

/**
 * Shows login form and hides other auth forms
 */
function showLoginForm() {
  console.log('Showing login form');
  
  // Hide other forms
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  if (registerForm) registerForm.style.display = 'none';
  if (forgotForm) forgotForm.style.display = 'none';
  
  // Show login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.style.display = 'block';
    // Focus on first input
    const emailInput = loginForm.querySelector('input[type="email"]');
    if (emailInput) emailInput.focus();
  }
  
  updateAuthButtonStates('login');
}

/**
 * Shows register form and hides other auth forms
 */
function showRegisterForm() {
  console.log('Showing register form');
  
  // Hide other forms
  const loginForm = document.getElementById('login-form');
  const forgotForm = document.getElementById('forgot-form');
  if (loginForm) loginForm.style.display = 'none';
  if (forgotForm) forgotForm.style.display = 'none';
  
  // Show register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.style.display = 'block';
    // Focus on first input
    const nameInput = registerForm.querySelector('input[type="text"]');
    if (nameInput) nameInput.focus();
  }
  
  updateAuthButtonStates('register');
}

/**
 * Shows forgot password form and hides other auth forms
 */
function showForgotPasswordForm() {
  console.log('Showing forgot password form');
  
  // Hide other forms
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'none';
  
  // Show forgot password form
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.style.display = 'block';
    // Focus on email input
    const emailInput = forgotForm.querySelector('input[type="email"]');
    if (emailInput) emailInput.focus();
  }
  
  updateAuthButtonStates('forgot');
}

/**
 * Updates active state of auth buttons
 */
function updateAuthButtonStates(activeForm) {
  const loginBtn = document.getElementById('login-button');
  const signupBtn = document.getElementById('signup-button');
  const forgotBtn = document.getElementById('forgot-password-button');
  
  // Reset all
  [loginBtn, signupBtn, forgotBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  // Set active
  switch(activeForm) {
    case 'login':
      if (loginBtn) loginBtn.classList.add('active');
      break;
    case 'register':
      if (signupBtn) signupBtn.classList.add('active');
      break;
    case 'forgot':
      if (forgotBtn) forgotBtn.classList.add('active');
      break;
  }
}

// ============================================================================
// SETUP AUTH FORM EVENT LISTENERS WITH SUBMIT HANDLERS
// ============================================================================

/**
 * Sets up event listeners for auth form toggling and submission
 */
function setupAuthFormListeners() {
  console.log('Setting up auth form event listeners...');
  
  // Login button
  const loginButton = document.getElementById('login-button');
  if (loginButton) {
    loginButton.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }
  
  // Signup/Register button
  const signupButton = document.getElementById('signup-button');
  if (signupButton) {
    signupButton.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
  }
  
  // Forgot password button
  const forgotButton = document.getElementById('forgot-password-button');
  if (forgotButton) {
    forgotButton.addEventListener('click', (e) => {
      e.preventDefault();
      showForgotPasswordForm();
    });
  }
  
  // Back to login from register
  const backFromRegister = document.getElementById('back-to-login-from-register');
  if (backFromRegister) {
    backFromRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }
  
  // Back to login from forgot password
  const backFromForgot = document.getElementById('back-to-login-from-forgot');
  if (backFromForgot) {
    backFromForgot.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }
  
  // Login form submit handler
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
  
  // Register form submit handler
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }
  
  // Forgot password form submit handler
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', handleForgotPasswordSubmit);
  }
  
  console.log('Auth form event listeners set up');
}

// ============================================================================
// DEBUG AND UTILITY FUNCTIONS
// ============================================================================

/**
 * Manual network check function for debugging
 */
window.checkNetworkNow = async function() {
  console.log('Manual network status check requested');
  await updateNetworkStatusFromApi();
  return window.NetworkStatus;
};

/**
 * Debug function to check all available status sources
 */
window.debugNetworkStatus = function() {
  console.log('=== NETWORK STATUS DEBUG ===');
  console.log('Browser online:', navigator.onLine);
  console.log('API_COORDINATION:', window.API_COORDINATION);
  console.log('MoodChatAPI:', window.MoodChatAPI);
  console.log('API_STATUS:', window.API_STATUS);
  console.log('window.api function:', typeof window.api);
  console.log('NetworkStatus:', window.NetworkStatus);
  console.log('Current AppState.network:', window.AppState?.network);
  console.log('Auth data exists:', !!localStorage.getItem('authUser'));
  console.log('===========================');
};

// ============================================================================
// NETWORK STATUS INTEGRATION WITH EXISTING APP STATE
// ============================================================================

/**
 * Integrates network status with existing AppState
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
  
  // Clear any existing sync interval
  if (window.NetworkStatus.syncInterval) {
    clearInterval(window.NetworkStatus.syncInterval);
  }
  
  // Sync NetworkStatus with AppState.network every 2 seconds
  window.NetworkStatus.syncInterval = setInterval(() => {
    if (window.AppState && window.AppState.network) {
      window.AppState.network.status = window.NetworkStatus.status;
      window.AppState.network.backendReachable = window.NetworkStatus.backendReachable;
      window.AppState.network.lastChecked = window.NetworkStatus.lastChecked;
    }
  }, 2000);
}

// ============================================================================
// INITIALIZATION (WITH AUTO-LOGIN CHECK)
// ============================================================================

/**
 * Initializes network status monitoring and auth forms
 */
function initializeAuthUI() {
  console.log('Initializing auth UI and network status monitoring...');
  
  // 1. First check for auto-login (before setting up forms)
  const shouldAutoLogin = checkAutoLogin();
  
  // If auto-login succeeded and we're redirecting, don't set up forms
  if (shouldAutoLogin) {
    console.log('Auto-login in progress, skipping form setup');
    return;
  }
  
  // 2. Set up auth form listeners
  setupAuthFormListeners();
  
  // 3. Set initial network UI state (non-blocking)
  updateNetworkStatusUI('checking', 'Checking connection...');
  
  // 4. Set up api.js event listener for real-time status updates
  setupApiStatusListener();
  
  // 5. Integrate with existing AppState
  integrateWithAppState();
  
  // 6. Set up browser event listeners for network status
  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);
  
  // 7. Start periodic network status updates from api.js (non-blocking)
  setTimeout(() => {
    startPeriodicNetworkUpdates();
  }, 1000); // Start after 1 second to ensure API is loaded
  
  console.log('Auth UI and network monitoring initialized');
}

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

/**
 * Cleans up network monitoring resources
 */
window.cleanupNetworkMonitoring = function() {
  console.log('Cleaning up network monitoring...');
  
  // Clear intervals
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
    window.NetworkStatus.checkInterval = null;
  }
  
  if (window.NetworkStatus.syncInterval) {
    clearInterval(window.NetworkStatus.syncInterval);
    window.NetworkStatus.syncInterval = null;
  }
  
  // Remove event listeners
  window.removeEventListener('online', handleBrowserOnline);
  window.removeEventListener('offline', handleBrowserOffline);
  
  // Remove network indicator
  const indicator = document.getElementById('network-status-indicator');
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
  
  console.log('Network monitoring cleaned up');
};

/**
 * Logout function that clears auth data
 */
window.logoutUser = function() {
  console.log('Logging out user...');
  clearAuthData();
  
  // Redirect to login page
  window.location.href = 'index.html';
};

// ============================================================================
// START AUTH UI WHEN DOCUMENT IS READY
// ============================================================================

// Start auth UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeAuthUI();
  });
} else {
  initializeAuthUI();
}

console.log('app.ui.auth.js - Auth UI and network status module loaded');