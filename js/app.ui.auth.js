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
 * Reads network status from api.js without performing health checks
 * Returns the current network status for UI display only
 */
async function readNetworkStatusFromApi() {
  // Default to browser status
  if (!navigator.onLine) {
    return { status: 'offline', message: 'No internet connection', backendReachable: false };
  }
  
  // Try to read from api.js if available
  if (window.API_COORDINATION && typeof window.API_COORDINATION.getNetworkStatus === 'function') {
    try {
      const apiStatus = window.API_COORDINATION.getNetworkStatus();
      return {
        status: apiStatus.backendReachable ? 'online' : 'offline',
        message: apiStatus.backendReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: apiStatus.backendReachable
      };
    } catch (error) {
      console.warn('Failed to read network status from api.js:', error);
    }
  }
  
  // Fallback: Check if api.js has a reachable property
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
// PERIODIC STATUS UPDATES (READS FROM API.JS)
// ============================================================================

/**
 * Starts periodic network status updates from api.js
 * Reads status every 30 seconds without performing health checks
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
  }
  
  // Initial update
  setTimeout(() => {
    updateNetworkStatusFromApi().catch(console.error);
  }, 1000); // Start after 1 second to allow api.js to initialize
  
  // Set up periodic updates (every 30 seconds)
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      updateNetworkStatusFromApi().catch(console.error);
    } else {
      // Immediately update if browser goes offline
      updateNetworkStatusUI('offline', 'No internet connection');
      window.NetworkStatus.backendReachable = false;
    }
  }, 30000); // 30 seconds
  
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
// SETUP AUTH FORM EVENT LISTENERS
// ============================================================================

/**
 * Sets up event listeners for auth form toggling
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
  
  // 1. Set up auth form listeners FIRST (ensures forms work immediately)
  setupAuthFormListeners();
  
  // 2. Set initial network UI state (non-blocking)
  updateNetworkStatusUI('checking', 'Checking connection...');
  
  // 3. Integrate with existing AppState
  integrateWithAppState();
  
  // 4. Set up browser event listeners for network status
  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);
  
  // 5. Start periodic network status updates from api.js (non-blocking)
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