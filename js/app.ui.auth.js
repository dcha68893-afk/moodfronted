// app.ui.auth.js - MoodChat Network Status Detection with JWT Auth
// UPDATED: Fixed response handling - no more response.text() or response.json() calls
// FIXED: TypeError: response.text is not a function - api.js returns parsed JSON
// FIXED: All API response handling now treats response as already-parsed JSON
// FIXED: Login form submission now properly sends POST request to backend
// URGENT FIX: Direct form binding to ensure login form submits

// ============================================================================
// PREVENT DOUBLE INITIALIZATION
// ============================================================================
if (window.__loginHandlerInitialized) {
    console.log('Login handler already initialized, skipping re-initialization');
} else {
    window.__loginHandlerInitialized = true;
}

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
  
  // Assign to window.currentUser for compatibility
  window.currentUser = userData;
  
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
  localStorage.removeItem('authToken');
  window.currentUser = null;
  console.log('Auth data cleared successfully');
}

/**
 * Safely handles API response (api.js returns parsed JSON, not Response object)
 */
function handleApiResponse(response) {
  // api.js returns already-parsed JSON, not a Response object
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid API response format');
  }
  
  // Check for HTTP errors in the response object
  const success = response.success;
  const message = response.data?.message || response.message || 'Unknown server error';
  const status = response.status || response.statusCode || 500;
  
  // If not successful, throw error with message
  if (!success) {
    throw new Error(message);
  }
  
  return response;
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
    // Validate token with backend API ONLY
    if (typeof window.api === 'function') {
      console.log('STRICT API VALIDATION: Validating token with backend...');
      
      // Check if we're already on chat page
      const isChatPage = window.location.pathname.includes('chat.html');
      if (isChatPage) {
        console.log('Already on chat page, skipping redirect');
        return true;
      }
      
      const response = await window.api('/auth/verify', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authData.token}`
        }
      });
      
      // Handle the parsed JSON response from api.js
      const result = handleApiResponse(response);
      
      // STRICT REQUIREMENT: Only proceed if API returns success
      if (result && result.success === true && result.user) {
        console.log('STRICT API VALIDATION: Token validated successfully with backend');
        
        // Update window.currentUser
        window.currentUser = result.user;
        
        // Save user info separately for easy access
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        
        // Show success message
        updateNetworkStatusUI('online', 'Auto-login successful!');
        
        // Dispatch auth:login event to wake up other modules
        document.dispatchEvent(
          new CustomEvent('auth:login', { detail: result.user })
        );
        
        // Only redirect if we're not already on chat page
        if (!window.location.pathname.includes('chat.html')) {
          console.log('Redirecting to chat.html...');
          window.location.href = 'chat.html';
        }
        
        return true;
      } else {
        // STRICT REQUIREMENT: Clear invalid auth data when API validation fails
        console.log('STRICT API VALIDATION: Token validation failed');
        clearAuthData();
        updateNetworkStatusUI('offline', 'Session expired. Please log in again.');
        return false;
      }
    } else {
      // STRICT REQUIREMENT: No API available, cannot auto-login
      console.log('STRICT REQUIREMENT: API not available, cannot auto-login');
      clearAuthData();
      return false;
    }
  } catch (error) {
    console.error('STRICT API VALIDATION: Auto-login failed:', error);
    
    // STRICT REQUIREMENT: Clear invalid auth data on any error
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
 * SIMPLIFIED LOGIN HANDLER - DIRECT FORM BINDING
 * This fixes the issue where form submission wasn't triggering
 */
async function handleLoginSubmit(event) {
  console.log('✅ LOGIN SUBMIT HANDLER TRIGGERED - FIXED VERSION');
  event.preventDefault();
  event.stopPropagation();
  
  console.log('📋 Collecting form data...');
  
  // Get the form that was submitted
  const form = event.target;
  
  // Find form inputs - try multiple selectors to be safe
  let identifierInput = form.querySelector('input[name="identifier"]') ||
                       form.querySelector('input[name="email"]') ||
                       form.querySelector('input[name="username"]') ||
                       form.querySelector('input[type="email"]') ||
                       form.querySelector('input[type="text"]:not([type="password"])');
  
  let passwordInput = form.querySelector('input[name="password"]') ||
                     form.querySelector('input[type="password"]');
  
  console.log('🔍 Found inputs:', {
    identifierInput: identifierInput ? identifierInput.name || identifierInput.type : 'NOT FOUND',
    passwordInput: passwordInput ? passwordInput.name || passwordInput.type : 'NOT FOUND'
  });
  
  if (!identifierInput || !passwordInput) {
    console.error('❌ Form inputs not found. Searching all inputs in form...');
    const allInputs = form.querySelectorAll('input');
    console.log('All inputs in form:', Array.from(allInputs).map(input => ({
      name: input.name,
      type: input.type,
      id: input.id,
      className: input.className
    })));
    
    updateNetworkStatusUI('offline', 'Login form configuration error');
    return;
  }
  
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;
  
  console.log('📝 Form data collected:', { 
    identifier: identifier ? identifier.substring(0, 3) + '...' : 'empty', 
    password: password ? '***' : 'empty' 
  });
  
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
  const originalText = submitBtn ? submitBtn.textContent : 'Login';
  if (submitBtn) {
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;
  }
  
  // Hide any existing countdown
  const countdownEl = document.getElementById('loginAttemptCountdown');
  if (countdownEl) countdownEl.classList.add('hidden');
  
  try {
    // STRICT REQUIREMENT: Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      console.error('❌ API helper function not available');
      throw new Error('Authentication service not available. Please check your connection.');
    }
    
    console.log('📤 Sending login request to /auth/login...');
    
    // Prepare login data
    const loginData = {
      identifier: identifier,
      password: password
    };
    
    console.log('📦 Login payload:', { 
      identifier: identifier,
      password: '***'
    });
    
    // Call api.js - it returns parsed JSON
    console.log('🔌 Calling window.api("/auth/login", { method: "POST", body: loginData })');
    
    const response = await window.api('/auth/login', {
      method: 'POST',
      body: loginData
    });
    
    console.log('✅ Login API response received:', response);
    
    // Check if response indicates success (handle both formats)
    if (response && (response.success === true || response.ok === true || response.status === 'success')) {
      console.log('🎉 LOGIN SUCCESS: Valid response received');
      
      // Extract token and user from response
      const token = response.token || response.data?.token;
      const user = response.user || response.data?.user;
      
      if (!token || !user) {
        console.error('❌ Invalid login response - missing token or user:', response);
        throw new Error('Invalid login response: missing token or user data');
      }
      
      console.log('💾 Saving authentication data...');
      
      // Save to localStorage
      localStorage.setItem('authToken', token);
      localStorage.setItem('currentUser', JSON.stringify(user));
      window.currentUser = user;
      
      // Also save using the existing function for compatibility
      saveAuthData(token, user);
      
      // Reset login attempts for this identifier
      LoginAttempts.resetAttempts(identifier);
      
      // STRICT REQUIREMENT: Only show success AFTER API confirms
      updateNetworkStatusUI('online', 'Login successful!');
      
      // Set token in api.js if API_COORDINATION exists
      if (window.API_COORDINATION) {
        window.API_COORDINATION.authToken = token;
      }
      
      // Set user in AppState if it exists
      if (window.AppState) {
        window.AppState.user = user;
      }
      
      // FORCE POST-LOGIN STATE UPDATE
      document.dispatchEvent(
        new CustomEvent('auth:login', { detail: user })
      );
      
      // Trigger UI success flow
      triggerUISuccessFlow(user);
      
      // REDIRECT AFTER SUCCESS
      console.log('🔄 Redirecting to chat.html in 1 second...');
      setTimeout(() => {
        window.location.href = 'chat.html';
      }, 1000);
      
    } else {
      // Login failed
      const errorMessage = response?.message || response?.data?.message || 'Login failed';
      console.error('❌ Login API returned failure:', errorMessage);
      throw new Error(errorMessage);
    }
    
  } catch (error) {
    console.error('❌ LOGIN FAILED:', error);
    
    // Record failed attempt
    const attempt = LoginAttempts.recordAttempt(identifier);
    
    // Check if we should show countdown
    const newBlockInfo = LoginAttempts.isBlocked(identifier);
    if (newBlockInfo) {
      showLoginAttemptCountdown(newBlockInfo);
    }
    
    // Display clear error messages
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
    } else if (errorMessage.includes('Network') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection.';
    }
    
    // Show error in network status indicator
    updateNetworkStatusUI('offline', errorMessage);
    
    // Also show error in form
    showAuthError(errorMessage);
    
    // Re-enable form
    if (submitBtn) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  }
}

/**
 * Direct login button click handler as backup
 */
async function handleLoginButtonClick(event) {
  console.log('🔄 Direct login button click handler triggered');
  
  // Find the login form
  const loginForm = document.getElementById('login-form');
  if (!loginForm) {
    console.error('❌ Login form not found');
    return;
  }
  
  // Create a synthetic submit event
  const submitEvent = new Event('submit', {
    bubbles: true,
    cancelable: true
  });
  
  // Trigger the form submission
  loginForm.dispatchEvent(submitEvent);
}

/**
 * Triggers existing UI success flow after successful login
 */
function triggerUISuccessFlow(user) {
  console.log('Triggering UI success flow for user:', user);
  
  // 1. Update any success indicators in the UI
  const successIndicator = document.getElementById('login-success-indicator');
  if (successIndicator) {
    successIndicator.style.display = 'block';
    successIndicator.textContent = `Welcome, ${user.username || user.displayName || user.email}!`;
    
    // Hide after 3 seconds
    setTimeout(() => {
      successIndicator.style.display = 'none';
    }, 3000);
  }
  
  // 2. Hide login form if it exists
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.style.display = 'none';
  }
  
  // 3. Show loading/redirecting indicator
  const redirectIndicator = document.createElement('div');
  redirectIndicator.id = 'redirect-indicator';
  redirectIndicator.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 20px;
    border-radius: 10px;
    z-index: 1000;
    text-align: center;
  `;
  redirectIndicator.innerHTML = `
    <h3>Login Successful!</h3>
    <p>Redirecting to chat...</p>
    <div class="spinner"></div>
  `;
  
  // Add spinner styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top: 4px solid #fff;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 10px auto;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
  
  document.body.appendChild(redirectIndicator);
  
  // Dispatch login success event for other components
  const event = new CustomEvent('moodchat-login-success', {
    detail: { user, timestamp: new Date().toISOString() }
  });
  window.dispatchEvent(event);
}

/**
 * STRICT API-DRIVEN REGISTRATION HANDLER - FIXED response handling
 */
async function handleRegisterSubmit(event) {
  event.preventDefault();
  console.log('STRICT API-DRIVEN: Registration form submitted');
  
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
    // STRICT REQUIREMENT: Check if API is available
    if (!window.api || typeof window.api !== 'function') {
      throw new Error('Registration service not available');
    }
    
    console.log('STRICT API-DRIVEN: Calling register API via centralized api.js...');
    
    // Prepare registration data
    const registerData = {
      username: username,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      displayName: displayName || username
    };
    
    // Call api.js - it returns parsed JSON
    const response = await window.api('/auth/register', {
      method: 'POST',
      body: registerData
    });
    
    console.log('STRICT API-DRIVEN: Register API response:', response);
    
    // Check if response indicates success
    if (response && (response.success === true || response.ok === true)) {
      // Extract token and user from response
      const token = response.token || response.data?.token;
      const user = response.user || response.data?.user;
      
      if (!token || !user) {
        throw new Error('Invalid registration response: missing token or user data');
      }
      
      // Save JWT and user info
      saveAuthData(token, user);
      
      // STRICT REQUIREMENT: Only show success AFTER API confirms
      updateNetworkStatusUI('online', 'Registration successful!');
      
      // Set token in api.js if API_COORDINATION exists
      if (window.API_COORDINATION) {
        window.API_COORDINATION.authToken = token;
      }
      
      // Set user in AppState if it exists
      if (window.AppState) {
        window.AppState.user = user;
      }
      
      // Trigger UI success flow
      triggerUISuccessFlow(user);
      
      // Small delay before redirect
      setTimeout(() => {
        window.location.href = 'chat.html';
      }, 1000);
    } else {
      // Registration failed
      const errorMessage = response?.message || response?.data?.message || 'Registration failed';
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('STRICT API-DRIVEN: Registration error:', error);
    
    // Display clear error messages
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
    } else if (errorMessage.includes('Network') || errorMessage.includes('network')) {
      errorMessage = 'Network error. Please check your connection.';
    }
    
    updateNetworkStatusUI('offline', `Registration failed: ${errorMessage}`);
    
    // Show error in form
    showAuthError(errorMessage);
    
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

/**
 * Handles forgot password form submission - FIXED response handling
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
      throw new Error('Password reset service not available');
    }
    
    // Call forgot password API using centralized api.js
    console.log('Calling forgot password API via centralized api.js...');
    
    // Call api.js - it returns parsed JSON
    const response = await window.api('/auth/forgot-password', {
      method: 'POST',
      body: { email }
    });
    
    console.log('Forgot password API response:', response);
    
    // Check if response indicates success
    if (response && (response.success === true || response.ok === true)) {
      updateNetworkStatusUI('online', 'Password reset email sent!');
      
      // Switch back to login form after delay
      setTimeout(() => {
        showLoginForm();
      }, 3000);
    } else {
      const errorMessage = response?.message || response?.data?.message || 'Password reset failed';
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    updateNetworkStatusUI('offline', `Password reset failed: ${error.message}`);
    
    // Show error in form
    showAuthError(error.message);
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
 */
function updateNetworkStatusUI(status, message) {
  console.log(`STRICT UI: Network status update: ${status} - ${message}`);
  
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
      indicator.innerHTML = '✅ ' + (message || 'Online');
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
// NETWORK STATUS READING FROM API.JS (UPDATED)
// ============================================================================

/**
 * Reads network status from api.js using multiple methods
 */
async function readNetworkStatusFromApi() {
  console.log('readNetworkStatusFromApi called - checking multiple sources...');
  
  // Method 1: Check browser network status first
  if (!navigator.onLine) {
    console.log('Browser reports offline');
    return { status: 'offline', message: 'No internet connection', backendReachable: false };
  }
  
  // Method 2: Check AppNetwork if available
  if (window.AppNetwork && typeof window.AppNetwork.isOnline === 'function') {
    const isOnline = window.AppNetwork.isOnline();
    console.log('AppNetwork says isOnline:', isOnline);
    
    if (!isOnline) {
      return { status: 'offline', message: 'No internet connection', backendReachable: false };
    }
  }
  
  // Method 3: Check if api.js has exposed status directly
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
  
  // Method 4: Check other api.js exposed properties
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
  
  // Method 5: Direct API call to /status endpoint
  if (typeof window.api === 'function') {
    try {
      console.log('Attempting direct /status API call...');
      
      // Use a timeout to prevent blocking UI
      const statusPromise = window.api('/status');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), 3000)
      );
      
      const response = await Promise.race([statusPromise, timeoutPromise]);
      
      // api.js returns parsed JSON, so just use it directly
      console.log('/status API response:', response);
      
      // Check if response indicates backend is reachable
      const isReachable = response && (
        response.status === 'ok' || 
        response.success === true ||
        response.healthy === true ||
        (response.statusCode && response.statusCode === 200) ||
        (response.code && response.code === 200) ||
        response.ok === true ||
        response.ok === 200
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
  
  // Method 6: Check if we've received any api-network-status events
  console.log('Checking for cached network status...');
  if (window.NetworkStatus.lastChecked && 
      Date.now() - window.NetworkStatus.lastChecked.getTime() < 30000) {
    // Use cached status if it's recent
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
// API.JS EVENT LISTENER
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
  
  // Listen for api-ready events
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
// PERIODIC STATUS UPDATES
// ============================================================================

/**
 * Starts periodic network status updates from api.js
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
  
  // Set up periodic updates
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
  
  // Wait a moment before updating
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
// AUTH FORM TOGGLING FUNCTIONS
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
// SETUP AUTH FORM EVENT LISTENERS WITH SUBMIT HANDLERS - DIRECT FIX
// ============================================================================

/**
 * Direct form binding - ensures login form submits properly
 */
function setupLoginFormDirectBinding() {
  console.log('🔧 DIRECT FIX: Setting up login form binding...');
  
  const loginForm = document.getElementById('login-form');
  if (!loginForm) {
    console.error('❌ DIRECT FIX: Login form not found with ID #login-form');
    
    // Try alternative selectors
    const alternativeForms = document.querySelectorAll('form');
    console.log('All forms on page:', alternativeForms.length);
    alternativeForms.forEach((form, i) => {
      console.log(`Form ${i}:`, {
        id: form.id,
        className: form.className,
        action: form.action,
        method: form.method
      });
    });
    
    return;
  }
  
  console.log('✅ DIRECT FIX: Found login form:', {
    id: loginForm.id,
    className: loginForm.className,
    action: loginForm.action,
    method: loginForm.method,
    childElements: loginForm.children.length
  });
  
  // Remove ALL existing submit listeners
  const newForm = loginForm.cloneNode(true);
  loginForm.parentNode.replaceChild(newForm, loginForm);
  
  // Get the new form reference
  const freshLoginForm = document.getElementById('login-form');
  
  // Add submit handler DIRECTLY
  freshLoginForm.addEventListener('submit', handleLoginSubmit);
  
  console.log('✅ DIRECT FIX: Login form submit handler bound DIRECTLY');
  
  // Also bind to any submit button as backup
  const submitButton = freshLoginForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.addEventListener('click', function(e) {
      console.log('🔄 Submit button clicked directly');
      e.preventDefault();
      freshLoginForm.dispatchEvent(new Event('submit'));
    });
  }
}

/**
 * Sets up event listeners for auth form toggling and submission
 */
function setupAuthFormListeners() {
  console.log('Setting up auth form event listeners...');
  
  // First, set up form toggle buttons if they exist
  const loginBtn = document.getElementById('login-button');
  const signupBtn = document.getElementById('signup-button');
  const forgotBtn = document.getElementById('forgot-password-button');
  
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }
  
  if (signupBtn) {
    signupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
  }
  
  if (forgotBtn) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showForgotPasswordForm();
    });
  }
  
  // URGENT FIX: Use direct binding for login form
  setupLoginFormDirectBinding();
  
  // Register form submit handler (unchanged)
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    console.log('Setting up register form submit listener');
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }
  
  // Forgot password form submit handler (unchanged)
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    console.log('Setting up forgot password form submit listener');
    forgotForm.addEventListener('submit', handleForgotPasswordSubmit);
  }
  
  // Also set up any direct form toggle links
  const toggleLinks = document.querySelectorAll('.toggle-form');
  toggleLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetForm = e.target.getAttribute('data-target');
      if (targetForm === 'register') {
        showRegisterForm();
      } else if (targetForm === 'forgot') {
        showForgotPasswordForm();
      } else {
        showLoginForm();
      }
    });
  });
  
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
  console.log('AppNetwork.isOnline:', window.AppNetwork ? window.AppNetwork.isOnline() : 'N/A');
  console.log('API_COORDINATION:', window.API_COORDINATION);
  console.log('MoodChatAPI:', window.MoodChatAPI);
  console.log('API_STATUS:', window.API_STATUS);
  console.log('window.api function:', typeof window.api);
  console.log('NetworkStatus:', window.NetworkStatus);
  console.log('Current AppState.network:', window.AppState?.network);
  console.log('Auth data exists:', !!localStorage.getItem('authUser'));
  console.log('Login attempts:', LoginAttempts.attempts);
  console.log('window.currentUser:', window.currentUser);
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
// FORM SETUP FUNCTION - ENHANCED
// ============================================================================

/**
 * Sets up all auth forms immediately with better error handling
 */
function setupAuthFormsImmediately() {
  console.log('Setting up auth forms immediately...');
  
  // Setup form toggle listeners
  setupAuthFormListeners();
  
  // Show default form (login)
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  
  // Determine which form to show by default
  let defaultForm = 'login';
  
  // Check URL hash for form type
  const hash = window.location.hash;
  if (hash === '#register') {
    defaultForm = 'register';
  } else if (hash === '#forgot') {
    defaultForm = 'forgot';
  }
  
  // Show the appropriate form
  switch(defaultForm) {
    case 'register':
      if (registerForm) {
        showRegisterForm();
      } else if (loginForm) {
        showLoginForm();
      }
      break;
    case 'forgot':
      if (forgotForm) {
        showForgotPasswordForm();
      } else if (loginForm) {
        showLoginForm();
      }
      break;
    default:
      if (loginForm) {
        showLoginForm();
      }
  }
  
  console.log('Auth forms set up immediately');
}

// ============================================================================
// SHOW AUTH ERROR FUNCTION
// ============================================================================

/**
 * Shows authentication error in the UI
 */
function showAuthError(message) {
  console.error('AUTH ERROR:', message);
  
  // Try to find existing error container
  let errorContainer = document.getElementById('auth-error-container');
  
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'auth-error-container';
    errorContainer.style.cssText = `
      background: #fee;
      border: 1px solid #f99;
      color: #900;
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      text-align: center;
    `;
    
    // Insert at the top of the auth form
    const authContainer = document.querySelector('.auth-container') || document.body;
    authContainer.insertBefore(errorContainer, authContainer.firstChild);
  }
  
  errorContainer.textContent = message;
  errorContainer.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (errorContainer && errorContainer.parentNode) {
      errorContainer.style.display = 'none';
    }
  }, 5000);
}

// ============================================================================
// IMPROVED AUTO-LOGIN FUNCTION FOR SESSION RESTORE
// ============================================================================

/**
 * Improved auto-login function that checks session on app load
 */
async function checkSessionOnLoad() {
  console.log('Checking session on app load...');
  
  // Check localStorage for token
  const token = localStorage.getItem('authToken') || localStorage.getItem('authUser');
  if (!token) {
    console.log('No token found in localStorage');
    return;
  }
  
  // Check if we're on login page
  const isLoginPage = window.location.pathname.includes('index.html') || 
                      window.location.pathname === '/' || 
                      window.location.pathname.endsWith('/');
  
  if (isLoginPage) {
    console.log('On login page, attempting auto-login...');
    await checkAutoLogin();
    return;
  }
  
  // We're on another page (like chat.html), validate the token
  try {
    if (typeof window.api === 'function') {
      console.log('Validating existing token on non-login page...');
      
      // Try to get user info
      const response = await window.api('/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('Session validation response:', response);
      
      // Handle both response formats
      const user = response.user || response.data?.user;
      
      if (user) {
        console.log('Session is valid, user:', user);
        window.currentUser = user;
        
        // Save user info if not already saved
        if (!localStorage.getItem('currentUser')) {
          localStorage.setItem('currentUser', JSON.stringify(user));
        }
        
        // Dispatch auth:login event
        document.dispatchEvent(
          new CustomEvent('auth:login', { detail: user })
        );
        
        // Update network status
        updateNetworkStatusUI('online', 'Session restored');
      } else {
        console.log('Invalid session, clearing auth data');
        clearAuthData();
        
        // If we're on chat page without valid session, redirect to login
        if (window.location.pathname.includes('chat.html')) {
          console.log('Redirecting to login page...');
          window.location.href = 'index.html';
        }
      }
    }
  } catch (error) {
    console.error('Session validation failed:', error);
    clearAuthData();
    
    // If we're on chat page and validation fails, redirect to login
    if (window.location.pathname.includes('chat.html')) {
      console.log('Redirecting to login page due to validation error...');
      window.location.href = 'index.html';
    }
  }
}

// ============================================================================
// DIRECT FORM TEST FUNCTION
// ============================================================================

/**
 * Test function to manually trigger login
 */
window.testLoginManually = async function(email, password) {
  console.log('🧪 MANUAL LOGIN TEST:', { email, password: '***' });
  
  const loginData = {
    identifier: email,
    password: password
  };
  
  try {
    const response = await window.api('/auth/login', {
      method: 'POST',
      body: loginData
    });
    
    console.log('🧪 MANUAL TEST RESPONSE:', response);
    return response;
  } catch (error) {
    console.error('🧪 MANUAL TEST ERROR:', error);
    throw error;
  }
};

// ============================================================================
// INITIALIZATION - ENHANCED
// ============================================================================

/**
 * Initializes network status monitoring and auth forms
 */
async function initializeAuthUI() {
  console.log('STRICT API-DRIVEN: Initializing auth UI and network status monitoring...');
  
  // 1. IMMEDIATELY set up auth forms
  const currentPage = window.location.pathname;
  const isLoginPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');
  
  if (isLoginPage) {
    console.log('STRICT API-DRIVEN: On login page, setting up forms IMMEDIATELY...');
    setupAuthFormsImmediately();
  }
  
  // 2. Check for session on load (improved auto-login)
  console.log('STRICT API-DRIVEN: Checking session on load...');
  await checkSessionOnLoad();
  
  // 3. Set initial network UI state
  if (typeof window.api === 'function') {
    try {
      const healthCheck = await window.api('/status');
      if (healthCheck && (healthCheck.ok || healthCheck.status === 'ok' || healthCheck.success)) {
        updateNetworkStatusUI('online', 'Connected to MoodChat');
      } else {
        updateNetworkStatusUI('checking', 'Checking connection...');
      }
    } catch (error) {
      updateNetworkStatusUI('checking', 'Checking connection...');
    }
  } else {
    updateNetworkStatusUI('checking', 'Checking connection...');
  }
  
  // 4. Set up api.js event listener
  setupApiStatusListener();
  
  // 5. Integrate with existing AppState
  integrateWithAppState();
  
  // 6. Set up browser event listeners
  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);
  
  // 7. Start periodic network status updates
  setTimeout(() => {
    startPeriodicNetworkUpdates();
  }, 1000);
  
  console.log('STRICT API-DRIVEN: Auth UI and network monitoring initialized');
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

/**
 * Main initialization function
 */
function initialize() {
  console.log('Initializing auth system...');
  
  // Setup forms immediately when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOMContentLoaded - Starting auth initialization');
      
      // First, set up forms immediately
      const currentPage = window.location.pathname;
      const isLoginPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');
      
      if (isLoginPage) {
        console.log('Setting up forms immediately on DOMContentLoaded');
        setupAuthFormsImmediately();
      }
      
      // Then initialize the rest of the auth UI
      initializeAuthUI();
    });
  } else {
    // DOM already loaded, set up forms immediately
    console.log('DOM already loaded, setting up forms immediately');
    
    const currentPage = window.location.pathname;
    const isLoginPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');
    
    if (isLoginPage) {
      console.log('Setting up forms immediately (DOM already ready)');
      setupAuthFormsImmediately();
    }
    
    // Then initialize the rest of the auth UI
    initializeAuthUI();
  }
}

// Start initialization
initialize();

console.log('app.ui.auth.js - STRICT API-DRIVEN Auth UI and network status module loaded - LOGIN FORM SUBMISSION DIRECT FIX APPLIED');