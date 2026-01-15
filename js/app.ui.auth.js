// app.ui.auth.js - MoodChat Network Status Detection
// FOCUS: Network status detection and backend health checks ONLY
// UI forms, buttons, toggling logic, and auth handling remain in index.html

// ============================================================================
// NETWORK STATUS MANAGEMENT
// ============================================================================

// Global state for network status - READ ONLY from api.js
window.NetworkStatus = {
  status: 'checking', // 'checking', 'online', 'offline'
  backendReachable: false,
  lastChecked: null,
  checkInterval: null
};

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
      
      // Auto-hide after 3 seconds if online
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
// NETWORK STATUS READING FROM API.JS (NON-BLOCKING)
// ============================================================================

/**
 * Reads network status from api.js using two methods:
 * 1. Event listener for api.js status updates (preferred)
 * 2. Direct API call to /status endpoint as fallback
 * Returns the current network status for UI display only
 */
async function readNetworkStatusFromApi() {
  // Method 1: Check browser network status first (fastest)
  if (!navigator.onLine) {
    return { status: 'offline', message: 'No internet connection', backendReachable: false };
  }
  
  // Method 2: Listen for api.js status events if available
  // api.js will dispatch 'api-network-status' events when status changes
  // We handle these events in setupApiStatusListener()
  
  // Method 3: Direct status check using window.api() (safe fallback)
  if (typeof window.api === 'function') {
    try {
      // Use a timeout to prevent blocking UI
      const statusPromise = window.api('/status');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), 5000)
      );
      
      const response = await Promise.race([statusPromise, timeoutPromise]);
      const isReachable = response && response.status === 'ok';
      
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    } catch (error) {
      console.log('API status check failed (non-critical):', error.message);
      // Don't throw, just return offline status
    }
  }
  
  // Method 4: Check if api.js has exposed status directly
  if (window.API_COORDINATION && window.API_COORDINATION.backendReachable !== undefined) {
    const isReachable = window.API_COORDINATION.backendReachable;
    return {
      status: isReachable ? 'online' : 'offline',
      message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
      backendReachable: isReachable
    };
  }
  
  // If api.js not fully loaded yet, show checking status
  return { status: 'checking', message: 'Checking connection...', backendReachable: false };
}

/**
 * Updates UI based on network status from api.js
 * This runs in the background and does NOT block UI interactions
 */
async function updateNetworkStatusFromApi() {
  try {
    const statusInfo = await readNetworkStatusFromApi();
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
// API.JS EVENT LISTENER (PREFERRED METHOD)
// ============================================================================

/**
 * Sets up listener for api.js network status events
 * api.js will dispatch 'api-network-status' events when backend reachability changes
 */
function setupApiStatusListener() {
  console.log('Setting up api.js network status event listener...');
  
  window.addEventListener('api-network-status', (event) => {
    console.log('Received api.js network status event:', event.detail);
    
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
}

// ============================================================================
// PERIODIC STATUS UPDATES (READS FROM API.JS)
// ============================================================================

/**
 * Starts periodic network status updates from api.js
 * Reads status every 10 seconds without blocking UI
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
  }
  
  // Initial update after api.js has time to initialize
  setTimeout(() => {
    updateNetworkStatusFromApi().catch(error => {
      console.log('Initial network status check failed:', error.message);
    });
  }, 2000);
  
  // Set up periodic updates (every 10 seconds - non-blocking)
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      updateNetworkStatusFromApi().catch(error => {
        console.log('Periodic network status check failed:', error.message);
      });
    } else {
      // Immediately update if browser goes offline
      updateNetworkStatusUI('offline', 'No internet connection');
      window.NetworkStatus.backendReachable = false;
      window.NetworkStatus.lastChecked = new Date();
    }
  }, 10000); // 10 seconds
  
  console.log('Periodic network status updates started (reading from api.js)');
}

// ============================================================================
// BROWSER ONLINE/OFFLINE EVENT HANDLERS
// ============================================================================

/**
 * Handles browser's online event
 * Triggers a network status update when browser comes online
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
 * Immediately updates status when browser goes offline
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
 * Instantly toggles without network checks
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
  
  // Update active button states if needed
  updateAuthButtonStates('login');
}

/**
 * Shows register form and hides other auth forms
 * Instantly toggles without network checks
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
  
  // Update active button states if needed
  updateAuthButtonStates('register');
}

/**
 * Shows forgot password form and hides other auth forms
 * Instantly toggles without network checks
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
  
  // Update active button states if needed
  updateAuthButtonStates('forgot');
}

/**
 * Updates active state of auth buttons (optional visual feedback)
 */
function updateAuthButtonStates(activeForm) {
  // This is for visual feedback only, not required for functionality
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
// AUTH FORM SUBMISSION HANDLERS (UPDATED TO USE CORRECTED API.JS)
// ============================================================================

/**
 * Handles login form submission using corrected api.js
 * Makes POST request to /auth/login endpoint
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  console.log('Login form submitted');
  
  const form = event.target;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  // Show loading state
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Logging in...';
  submitBtn.disabled = true;
  
  try {
    // Use corrected api.js for login request
    const response = await window.api('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    
    console.log('Login response:', response);
    
    if (response && response.token) {
      // Save auth token for future API calls
      localStorage.setItem('authUser', response.token);
      
      // Save minimal user info for auto-login
      const userInfo = {
        id: response.user.id,
        displayName: response.user.displayName,
        email: response.user.email,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours from now
      };
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
      
      // Show success message
      showToast('Login successful! Redirecting...', 'success');
      
      // Redirect to main app after a short delay
      setTimeout(() => {
        window.location.href = '/app.html';
      }, 1500);
    } else {
      throw new Error('Invalid login response');
    }
  } catch (error) {
    console.error('Login error:', error);
    showToast(error.message || 'Login failed. Please check your credentials.', 'error');
    
    // Restore button state
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handles registration form submission using corrected api.js
 * Makes POST request to /auth/register endpoint
 */
async function handleRegisterSubmit(event) {
  event.preventDefault();
  console.log('Register form submitted');
  
  const form = event.target;
  const displayName = form.querySelector('input[type="text"]').value;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelectorAll('input[type="password"]')[0].value;
  const confirmPassword = form.querySelectorAll('input[type="password"]')[1].value;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  // Basic validation
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  // Show loading state
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Creating account...';
  submitBtn.disabled = true;
  
  try {
    // Use corrected api.js for registration request
    const response = await window.api('/auth/register', {
      method: 'POST',
      body: { displayName, email, password }
    });
    
    console.log('Registration response:', response);
    
    if (response && response.token) {
      // Save auth token for future API calls
      localStorage.setItem('authUser', response.token);
      
      // Save minimal user info for auto-login
      const userInfo = {
        id: response.user.id,
        displayName: response.user.displayName,
        email: response.user.email,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours from now
      };
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
      
      // Show success message
      showToast('Registration successful! Redirecting...', 'success');
      
      // Auto-login and redirect after a short delay
      setTimeout(() => {
        window.location.href = '/app.html';
      }, 1500);
    } else {
      throw new Error('Invalid registration response');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showToast(error.message || 'Registration failed. Please try again.', 'error');
    
    // Restore button state
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handles forgot password form submission using corrected api.js
 * Makes POST request to /auth/forgot-password endpoint
 */
async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  console.log('Forgot password form submitted');
  
  const form = event.target;
  const email = form.querySelector('input[type="email"]').value;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  // Show loading state
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Sending reset link...';
  submitBtn.disabled = true;
  
  try {
    // Use corrected api.js for forgot password request
    const response = await window.api('/auth/forgot-password', {
      method: 'POST',
      body: { email }
    });
    
    console.log('Forgot password response:', response);
    
    if (response && response.success) {
      showToast('Password reset link sent! Check your email.', 'success');
      
      // Switch back to login form after a short delay
      setTimeout(() => {
        showLoginForm();
      }, 2000);
    } else {
      throw new Error('Failed to send reset link');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    showToast(error.message || 'Failed to send reset link. Please try again.', 'error');
  } finally {
    // Restore button state
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Shows a toast notification
 */
function showToast(message, type = 'info') {
  // Check if toast container exists
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 300px;
    `;
    document.body.appendChild(toastContainer);
  }
  
  // Create toast
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    padding: 12px 16px;
    margin-bottom: 10px;
    border-radius: 6px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    animation: slideInRight 0.3s ease-out;
    cursor: pointer;
  `;
  toast.textContent = message;
  
  // Add animation styles if needed
  if (!document.getElementById('toast-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'toast-animations';
    styleSheet.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 5000);
  
  // Click to dismiss
  toast.addEventListener('click', () => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  });
}

// ============================================================================
// AUTO-LOGIN CHECK ON PAGE LOAD
// ============================================================================

/**
 * Checks if user is already logged in (auto-login feature)
 * Uses localStorage tokens saved during registration/login
 */
function checkAutoLogin() {
  console.log('Checking for auto-login...');
  
  const authToken = localStorage.getItem('authUser');
  const userInfoStr = localStorage.getItem('userInfo');
  
  if (authToken && userInfoStr) {
    try {
      const userInfo = JSON.parse(userInfoStr);
      
      // Check if token is still valid (not expired)
      if (userInfo.expiresAt && userInfo.expiresAt > Date.now()) {
        console.log('Auto-login detected for:', userInfo.email);
        
        // Show auto-login notification
        showToast(`Welcome back, ${userInfo.displayName}!`, 'success');
        
        // Redirect to main app after a short delay
        setTimeout(() => {
          window.location.href = '/app.html';
        }, 1000);
        
        return true;
      } else {
        // Token expired, clear storage
        console.log('Auto-login token expired');
        localStorage.removeItem('authUser');
        localStorage.removeItem('userInfo');
      }
    } catch (error) {
      console.error('Auto-login error:', error);
      localStorage.removeItem('authUser');
      localStorage.removeItem('userInfo');
    }
  }
  
  return false;
}

// ============================================================================
// MANUAL NETWORK CHECK (FOR DEBUGGING) - UPDATED TO USE API.JS
// ============================================================================

/**
 * Manual network check function
 * Can be called from browser console for debugging: window.checkNetworkNow()
 * Now reads from api.js instead of performing its own checks
 */
window.checkNetworkNow = async function() {
  console.log('Manual network status read requested (from api.js)');
  await updateNetworkStatusFromApi();
  return window.NetworkStatus;
};

// ============================================================================
// NETWORK STATUS INTEGRATION WITH EXISTING APP STATE
// ============================================================================

/**
 * Integrates network status with existing AppState
 * Maintains compatibility with other components
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
  
  // Sync NetworkStatus with AppState.network
  const syncInterval = setInterval(() => {
    if (window.AppState && window.AppState.network) {
      window.AppState.network.status = window.NetworkStatus.status;
      window.AppState.network.backendReachable = window.NetworkStatus.backendReachable;
      window.AppState.network.lastChecked = window.NetworkStatus.lastChecked;
    }
  }, 1000);
  
  // Store interval ID for cleanup
  window.NetworkStatus.syncInterval = syncInterval;
}

// ============================================================================
// SETUP AUTH FORM EVENT LISTENERS (UPDATED WITH FORM SUBMISSIONS)
// ============================================================================

/**
 * Sets up event listeners for auth form toggling and submissions
 * Must be called after DOM is ready
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
  
  // Login form submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
  
  // Register form submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }
  
  // Forgot password form submission
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', handleForgotPasswordSubmit);
  }
  
  console.log('Auth form event listeners set up');
}

// ============================================================================
// INITIALIZATION (NON-BLOCKING)
// ============================================================================

/**
 * Initializes network status monitoring and auth forms
 * Runs asynchronously without blocking UI
 */
function initializeAuthUI() {
  console.log('Initializing auth UI and network status monitoring...');
  
  // 1. First check for auto-login (non-blocking)
  setTimeout(() => {
    if (!checkAutoLogin()) {
      // Only show auth forms if not auto-logging in
      
      // 2. Set up auth form listeners (ensures forms work immediately)
      setupAuthFormListeners();
      
      // 3. Set initial network UI state (non-blocking)
      updateNetworkStatusUI('checking', 'Checking connection...');
      
      // 4. Show login form by default
      showLoginForm();
    }
  }, 100);
  
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
  }, 500); // Start after 500ms to ensure forms are responsive
  
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
  window.removeEventListener('api-network-status', setupApiStatusListener);
  
  // Remove network indicator
  const indicator = document.getElementById('network-status-indicator');
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
  
  console.log('Network monitoring cleaned up');
};

// ============================================================================
// START AUTH UI WHEN DOCUMENT IS READY
// ============================================================================

// Start auth UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize immediately - forms work instantly
    initializeAuthUI();
  });
} else {
  // DOM already loaded, initialize immediately
  initializeAuthUI();
}

console.log('app.ui.auth.js - Auth UI and network status module loaded');