// app.ui.auth.js - MoodChat Network Status Detection with JWT Auth
// UPDATED: Added progressive login attempts, password guidance, and better error handling
// FOCUS: Network status detection, backend health checks, JWT auth handling, and progressive login limits
// CRITICAL FIX: All auth calls use centralized api.js with correct endpoints

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
// LOGIN ATTEMPTS TRACKING & PROGRESSIVE DELAY
// ============================================================================

const LoginAttempts = {
  attempts: {},
  maxAttempts: 3,
  delays: [20000, 40000, 60000], // 20s, 40s, 60s
  storageKey: 'moodchat_login_attempts',
  
  init() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.attempts = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load login attempts:', e);
      this.attempts = {};
    }
  },
  
  recordAttempt(identifier) {
    if (!this.attempts[identifier]) {
      this.attempts[identifier] = {
        count: 1,
        lastAttempt: Date.now(),
        blockedUntil: null
      };
    } else {
      this.attempts[identifier].count++;
      this.attempts[identifier].lastAttempt = Date.now();
      
      // Apply progressive blocking
      if (this.attempts[identifier].count <= this.maxAttempts) {
        const delayIndex = Math.min(this.attempts[identifier].count - 1, this.delays.length - 1);
        this.attempts[identifier].blockedUntil = Date.now() + this.delays[delayIndex];
      } else {
        // After max attempts, block for 1 minute and suggest password recovery
        this.attempts[identifier].blockedUntil = Date.now() + 60000;
      }
    }
    
    this.save();
    return this.attempts[identifier];
  },
  
  resetAttempts(identifier) {
    if (this.attempts[identifier]) {
      delete this.attempts[identifier];
      this.save();
    }
  },
  
  isBlocked(identifier) {
    const attempt = this.attempts[identifier];
    if (!attempt) return false;
    
    if (attempt.blockedUntil && Date.now() < attempt.blockedUntil) {
      return {
        blocked: true,
        remaining: attempt.blockedUntil - Date.now(),
        attemptCount: attempt.count,
        maxAttempts: this.maxAttempts
      };
    }
    
    return false;
  },
  
  getAttemptCount(identifier) {
    return this.attempts[identifier]?.count || 0;
  },
  
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.attempts));
    } catch (e) {
      console.error('Failed to save login attempts:', e);
    }
  }
};

// Initialize login attempts tracking
LoginAttempts.init();

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
    
    console.log('Auth data retrieved successfully');
    return authUser;
  } catch (error) {
    console.error('Error retrieving auth data:', error);
    return null;
  }
}

/**
 * Validates JWT token (basic validation - checks if token exists)
 */
function validateToken(token) {
  if (!token) return false;
  
  // Basic validation - token should be a string
  if (typeof token !== 'string') return false;
  
  // Check token format (at least 10 characters)
  if (token.length < 10) return false;
  
  return true;
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
 * Safely parses HTTP response with error handling
 */
async function safeParseResponse(response) {
  const text = await response.text();
  let data;
  
  try {
    data = JSON.parse(text);
  } catch {
    // If response is not JSON, throw error with the text
    throw new Error(text || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  // Check for HTTP errors (400, 401, 429, 500, etc.)
  if (!response.ok) {
    // Try to extract error message from JSON response
    const errorMessage = data?.error || data?.message || data?.details || 
                        `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMessage);
  }
  
  return data;
}

/**
 * Shows login attempt countdown in the UI
 */
function showLoginAttemptCountdown(blockInfo) {
  const countdownEl = document.getElementById('loginAttemptCountdown');
  const timerEl = document.getElementById('countdownTimer');
  const messageEl = document.getElementById('countdownMessage');
  
  if (!countdownEl || !timerEl || !messageEl) return;
  
  // Update message based on attempt count
  let message = 'Too many login attempts. Please wait:';
  if (blockInfo.attemptCount === 1) {
    message = 'First failed attempt. Please wait:';
  } else if (blockInfo.attemptCount === 2) {
    message = 'Second failed attempt. Please wait:';
  } else if (blockInfo.attemptCount >= 3) {
    message = 'Multiple failed attempts. Consider using password recovery. Wait:';
  }
  
  messageEl.textContent = message;
  countdownEl.classList.remove('hidden');
  
  // Start countdown
  let remaining = Math.ceil(blockInfo.remaining / 1000);
  
  function updateTimer() {
    if (remaining <= 0) {
      countdownEl.classList.add('hidden');
      clearInterval(timerInterval);
      return;
    }
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    remaining--;
  }
  
  updateTimer();
  const timerInterval = setInterval(updateTimer, 1000);
  
  // Return function to stop timer
  return () => {
    clearInterval(timerInterval);
    countdownEl.classList.add('hidden');
  };
}

/**
 * Checks if user is already logged in via JWT and validates token
 * Returns true if auto-login succeeds, false otherwise
 */
async function checkAutoLogin() {
  console.log('Checking for auto-login...');
  
  const authData = getAuthData();
  
  if (!authData || !authData.token) {
    console.log('No auth data found in localStorage');
    return false;
  }
  
  // Validate token format
  if (!validateToken(authData.token)) {
    console.log('Invalid token format found');
    clearAuthData();
    return false;
  }
  
  console.log('Valid JWT found, attempting auto-login...');
  
  try {
    // Check if backend is reachable before attempting auto-login
    if (window.API_COORDINATION && !window.API_COORDINATION.backendReachable) {
      console.log('Backend not reachable, deferring auto-login');
      updateNetworkStatusUI('offline', 'Cannot connect to server. Please check your connection.');
      return false;
    }
    
    // Validate token with backend (optional but recommended)
    if (typeof window.api === 'function') {
      try {
        console.log('Validating token with backend...');
        const response = await window.api('/auth/me', {
          headers: {
            'Authorization': `Bearer ${authData.token}`
          }
        });
        
        // Use safe parsing instead of direct response access
        let parsedResponse;
        if (response && typeof response === 'object' && 'ok' in response) {
          // This appears to be a raw Response object
          parsedResponse = await safeParseResponse(response);
        } else {
          // This might already be parsed, but ensure it has expected structure
          parsedResponse = response;
        }
        
        if (!parsedResponse || !parsedResponse.success) {
          throw new Error(parsedResponse?.error || 'Token validation failed');
        }
        
        console.log('Token validated successfully with backend');
      } catch (error) {
        console.log('Token validation with backend failed:', error.message);
        // Continue anyway - token might be valid but backend validation endpoint might not exist
      }
    }
    
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
    
    // Show success message
    updateNetworkStatusUI('online', 'Auto-login successful!');
    
    // Small delay before redirect
    setTimeout(() => {
      console.log('Redirecting to chat.html...');
      window.location.href = 'chat.html';
    }, 1500);
    
    return true;
  } catch (error) {
    console.error('Auto-login failed:', error);
    
    // Clear invalid auth data
    clearAuthData();
    
    // Show error message
    updateNetworkStatusUI('offline', 'Auto-login failed. Please log in again.');
    
    return false;
  }
}

// ============================================================================
// AUTH FORM HANDLERS WITH JWT SUPPORT AND PROGRESSIVE LOGIN LIMITS
// ============================================================================

/**
 * Handles login form submission with progressive attempt limiting
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  console.log('Login form submitted');
  
  const form = event.target;
  const identifier = form.querySelector('input[type="text"]')?.value || 
                    form.querySelector('input[type="email"]')?.value;
  const password = form.querySelector('input[type="password"]').value;
  
  if (!identifier || !password) {
    updateNetworkStatusUI('offline', 'Email/username and password are required');
    return;
  }
  
  // Check if this identifier is currently blocked
  const blockInfo = LoginAttempts.isBlocked(identifier);
  if (blockInfo) {
    // Show countdown timer
    showLoginAttemptCountdown(blockInfo);
    
    // Update UI message based on attempt count
    let message = 'Account temporarily locked. Please wait ';
    if (blockInfo.attemptCount >= LoginAttempts.maxAttempts) {
      message += 'and consider using password recovery.';
    }
    
    updateNetworkStatusUI('offline', message);
    return;
  }
  
  // Disable form during submission
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Logging in...';
  submitBtn.disabled = true;
  
  // Hide any existing countdown
  const countdownEl = document.getElementById('loginAttemptCountdown');
  if (countdownEl) countdownEl.classList.add('hidden');
  
  try {
    // Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      throw new Error('API not available. Please check your connection.');
    }
    
    // Call login API using centralized api.js - CRITICAL FIX: Use correct endpoint
    console.log('Calling login API via centralized api.js...');
    
    // Use window.api.login() method which handles the correct endpoint
    const loginResult = await window.api.login(identifier, password);
    
    console.log('Login API response:', loginResult);
    
    // Check for success
    if (loginResult && loginResult.success && loginResult.user && loginResult.token) {
      const { token, user } = loginResult;
      
      // Save JWT and user info
      saveAuthData(token, user);
      
      // Reset login attempts for this identifier
      LoginAttempts.resetAttempts(identifier);
      
      // Show success message
      updateNetworkStatusUI('online', 'Login successful!');
      
      // Set token in api.js if API_COORDINATION exists
      if (window.API_COORDINATION) {
        window.API_COORDINATION.authToken = token;
      }
      
      // Set user in AppState if it exists
      if (window.AppState) {
        window.AppState.user = user;
      }
      
      // Small delay before redirect
      setTimeout(() => {
        window.location.href = 'chat.html';
      }, 1000);
    } else {
      throw new Error(loginResult?.message || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Record failed attempt
    const attempt = LoginAttempts.recordAttempt(identifier);
    
    // Check if we should show countdown
    const newBlockInfo = LoginAttempts.isBlocked(identifier);
    if (newBlockInfo) {
      showLoginAttemptCountdown(newBlockInfo);
    }
    
    // Show appropriate error message
    let errorMessage = error.message;
    
    // Handle specific error cases
    if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
      errorMessage = 'Too many login attempts. Please wait and try again.';
    } else if (errorMessage.includes('Invalid credentials') || errorMessage.includes('401')) {
      errorMessage = `Invalid credentials. Attempt ${attempt.count} of ${LoginAttempts.maxAttempts}.`;
      
      if (attempt.count >= LoginAttempts.maxAttempts) {
        errorMessage += ' Consider using password recovery.';
      }
    } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
      errorMessage = 'Server error. Please try again later.';
    }
    
    // Show error in network status indicator
    updateNetworkStatusUI('offline', errorMessage);
    
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handles registration form submission with password guidance only
 */
async function handleRegisterSubmit(event) {
  event.preventDefault();
  console.log('Registration form submitted');
  
  const form = event.target;
  const username = form.querySelector('input[name="username"]')?.value;
  const email = form.querySelector('input[type="email"]')?.value;
  const password = form.querySelector('input[type="password"]')?.value;
  const confirmPassword = form.querySelectorAll('input[type="password"]')[1]?.value;
  const displayName = form.querySelector('input[name="displayName"]')?.value;
  
  // Basic frontend validation
  if (!username || !email || !password || !confirmPassword) {
    updateNetworkStatusUI('offline', 'All fields are required');
    return;
  }
  
  if (password !== confirmPassword) {
    updateNetworkStatusUI('offline', 'Passwords do not match');
    return;
  }
  
  if (password.length < 8) {
    updateNetworkStatusUI('offline', 'Password must be at least 8 characters');
    return;
  }
  
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
    
    // Call register API using centralized api.js - CRITICAL FIX: Use correct endpoint
    console.log('Calling register API via centralized api.js...');
    
    // Prepare registration data
    const registerData = {
      username: username,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      displayName: displayName || username
    };
    
    // Use window.api.register() method which handles the correct endpoint
    const registerResult = await window.api.register(registerData);
    
    console.log('Register API response:', registerResult);
    
    // Check for success
    if (registerResult && registerResult.success && registerResult.user && registerResult.token) {
      const { token, user } = registerResult;
      
      // Save JWT and user info
      saveAuthData(token, user);
      
      // Show success message
      updateNetworkStatusUI('online', 'Registration successful!');
      
      // Set token in api.js if API_COORDINATION exists
      if (window.API_COORDINATION) {
        window.API_COORDINATION.authToken = token;
      }
      
      // Set user in AppState if it exists
      if (window.AppState) {
        window.AppState.user = user;
      }
      
      // Small delay before redirect
      setTimeout(() => {
        window.location.href = 'chat.html';
      }, 1000);
    } else {
      throw new Error(registerResult?.message || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    // Show error in network status indicator
    let errorMessage = error.message;
    
    // Handle specific error cases
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      if (errorMessage.toLowerCase().includes('email')) {
        errorMessage = 'This email is already registered';
      } else if (errorMessage.toLowerCase().includes('username')) {
        errorMessage = 'This username is already taken';
      }
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      errorMessage = 'Please check your information and try again';
    } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
      errorMessage = 'Server error. Please try again later.';
    }
    
    updateNetworkStatusUI('offline', `Registration failed: ${errorMessage}`);
    
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
    
    // Call forgot password API using centralized api.js
    console.log('Calling forgot password API via centralized api.js...');
    
    // Use window.api for consistency
    const response = await window.api('/auth/forgot-password', {
      method: 'POST',
      body: { email }
    });
    
    // Safely parse the response
    let parsedResponse;
    if (response && typeof response === 'object' && 'ok' in response) {
      // This is a raw Response object
      parsedResponse = await safeParseResponse(response);
    } else {
      // Already parsed or different format
      parsedResponse = response;
    }
    
    console.log('Forgot password API response:', parsedResponse);
    
    // Show success/error message
    if (parsedResponse && parsedResponse.success) {
      updateNetworkStatusUI('online', 'Password reset email sent!');
      
      // Switch back to login form after delay
      setTimeout(() => {
        showLoginForm();
      }, 3000);
    } else {
      throw new Error(parsedResponse?.message || 'Password reset failed');
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
      if (!message || (!message.includes('Login') && !message.includes('Registration') && !message.includes('Auto-login'))) {
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
      indicator.innerHTML = '⚠️ ' + (message || 'Offline');
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
      
      // Safely parse the response
      let parsedResponse;
      if (response && typeof response === 'object' && 'ok' in response) {
        // This is a raw Response object
        parsedResponse = await safeParseResponse(response);
      } else {
        // Already parsed or different format
        parsedResponse = response;
      }
      
      console.log('/status API response:', parsedResponse);
      
      // Check if response indicates backend is reachable
      const isReachable = parsedResponse && (
        parsedResponse.status === 'ok' || 
        parsedResponse.success === true ||
        parsedResponse.healthy === true ||
        (parsedResponse.statusCode && parsedResponse.statusCode === 200) ||
        (parsedResponse.code && parsedResponse.code === 200)
      );
      
      console.log('Direct API check says backendReachable:', isReachable);
      
      return {
        status: isReachable ? 'online' : 'offline',
        message: isReachable ? 'Connected to MoodChat' : 'Cannot reach MoodChat server',
        backendReachable: isReachable
      };
    } catch (error) {
      console.log('Direct API status check failed:', error.message);
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
    }, 500);
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
  }, 10000);
  
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
  console.log('Login attempts:', LoginAttempts.attempts);
  console.log('===========================');
};

/**
 * Reset login attempts for debugging
 */
window.resetLoginAttempts = function(identifier) {
  if (identifier) {
    LoginAttempts.resetAttempts(identifier);
    console.log(`Reset login attempts for: ${identifier}`);
  } else {
    LoginAttempts.attempts = {};
    LoginAttempts.save();
    console.log('Reset all login attempts');
  }
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
  
  // 1. Check for auto-login (runs only on login page)
  const currentPage = window.location.pathname;
  const isLoginPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');
  
  if (isLoginPage) {
    console.log('On login page, checking for auto-login...');
    const shouldAutoLogin = checkAutoLogin();
    
    // If auto-login succeeds and we're redirecting, don't set up forms
    if (shouldAutoLogin) {
      console.log('Auto-login in progress, skipping form setup');
      return;
    }
  } else {
    console.log('Not on login page, skipping auto-login check');
  }
  
  // 2. Set up auth form listeners (only if on login page)
  if (isLoginPage) {
    setupAuthFormListeners();
  }
  
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
  }, 1000);
  
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