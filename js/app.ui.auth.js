// app.ui.auth.js - MoodChat Network Status Detection with JWT Auth
// UPDATED: Fixed network status logic - separates connectivity from auth state
// FIXED: UI now correctly interprets backend and auth state independently
// FIXED: Never shows "No network" for auth problems
// URGENT FIX: Network status only reflects connectivity, auth status handled separately

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
// AUTH STATUS MANAGEMENT (NEW)
// ============================================================================

// Separate state for authentication status
window.AuthStatus = {
  isAuthenticated: false,
  lastChecked: null,
  user: null,
  token: null
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
      this.attempts[attempts.identifier].lastAttempt = Date.now();
      
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
  
  // Update AuthStatus
  window.AuthStatus.isAuthenticated = true;
  window.AuthStatus.user = userData;
  window.AuthStatus.token = token;
  window.AuthStatus.lastChecked = new Date();
  
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
  
  // Update AuthStatus
  window.AuthStatus.isAuthenticated = false;
  window.AuthStatus.user = null;
  window.AuthStatus.token = null;
  window.AuthStatus.lastChecked = new Date();
  
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
        
        // Update AuthStatus
        window.AuthStatus.isAuthenticated = true;
        window.AuthStatus.user = result.user;
        window.AuthStatus.token = authData.token;
        
        // Show success message
        updateAuthStatusUI('authenticated', 'Auto-login successful!');
        
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
        updateAuthStatusUI('unauthenticated', 'Session expired. Please log in again.');
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
    
    // Show error message (auth error, not network error)
    updateAuthStatusUI('unauthenticated', 'Auto-login failed. Please log in again.');
    
    return false;
  }
}

// ============================================================================
// AUTH FORM HANDLERS WITH JWT SUPPORT AND PROGRESSIVE LOGIN LIMITS
// ============================================================================

/**
 * UNIVERSAL LOGIN HANDLER - Works even if forms are recreated
 */
async function handleLoginSubmit(event) {
  console.log('🔐 LOGIN SUBMIT HANDLER TRIGGERED - UNIVERSAL');
  
  // Prevent default form submission
  if (event && event.preventDefault) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  console.log('📋 Collecting form data...');
  
  // Get the form - handle both event target and direct form finding
  let form;
  if (event && event.target && event.target.tagName === 'FORM') {
    form = event.target;
  } else {
    // Find the login form dynamically
    form = document.getElementById('login-form');
    if (!form) {
      // Try to find any form with login inputs
      const forms = document.querySelectorAll('form');
      for (const f of forms) {
        if (f.querySelector('input[type="email"], input[name="email"], input[name="identifier"]') &&
            f.querySelector('input[type="password"]')) {
          form = f;
          break;
        }
      }
    }
  }
  
  if (!form) {
    console.error('❌ No login form found on page');
    updateAuthStatusUI('error', 'Login form not found');
    return;
  }
  
  console.log('✅ Found form:', form.id || 'no-id', form.className);
  
  // Find form inputs - try multiple selectors
  let identifierInput = form.querySelector('input[name="identifier"]') ||
                       form.querySelector('input[name="email"]') ||
                       form.querySelector('input[name="username"]') ||
                       form.querySelector('input[type="email"]') ||
                       form.querySelector('input[type="text"]:not([type="password"])');
  
  let passwordInput = form.querySelector('input[name="password"]') ||
                     form.querySelector('input[type="password"]');
  
  console.log('🔍 Inputs found:', {
    identifier: identifierInput ? identifierInput.name || identifierInput.type : 'NOT FOUND',
    password: passwordInput ? passwordInput.name || passwordInput.type : 'NOT FOUND'
  });
  
  if (!identifierInput || !passwordInput) {
    console.error('❌ Form inputs not found');
    updateAuthStatusUI('error', 'Login form configuration error');
    return;
  }
  
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;
  
  console.log('📝 Form data:', { 
    identifier: identifier ? identifier.substring(0, 3) + '...' : 'empty', 
    password: password ? '***' : 'empty' 
  });
  
  if (!identifier || !password) {
    updateAuthStatusUI('error', 'Email/username and password are required');
    return;
  }
  
  // Check if this identifier is currently blocked
  const blockInfo = LoginAttempts.isBlocked(identifier);
  if (blockInfo) {
    showLoginAttemptCountdown(blockInfo);
    let message = 'Account temporarily locked. Please wait ';
    if (blockInfo.attemptCount >= LoginAttempts.maxAttempts) {
      message += 'and consider using password recovery.';
    }
    updateAuthStatusUI('error', message);
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
    // Check if API is available
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
    
    console.log('📦 Login payload prepared');
    
    // Call api.js
    const response = await window.api('/auth/login', {
      method: 'POST',
      body: loginData
    });
    
    console.log('✅ Login API response received:', response ? 'Success' : 'No response');
    
    // Check if response indicates success
    if (response && (response.success === true || response.ok === true || response.status === 'success')) {
      console.log('🎉 LOGIN SUCCESS');
      
      // Extract token and user from response
      const token = response.token || response.data?.token;
      const user = response.user || response.data?.user;
      
      if (!token || !user) {
        console.error('❌ Invalid login response - missing token or user');
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
      
      // Show success message
      updateAuthStatusUI('authenticated', 'Login successful!');
      
      // Set token in api.js if API_COORDINATION exists
      if (window.API_COORDINATION) {
        window.API_COORDINATION.authToken = token;
      }
      
      // Set user in AppState if it exists
      if (window.AppState) {
        window.AppState.user = user;
      }
      
      // Dispatch auth:login event
      document.dispatchEvent(
        new CustomEvent('auth:login', { detail: user })
      );
      
      // Trigger UI success flow
      triggerUISuccessFlow(user);
      
      // REDIRECT AFTER SUCCESS
      console.log('🔄 Redirecting to chat.html...');
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
    console.error('❌ LOGIN FAILED:', error.message);
    
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
    
    // Show error in auth status indicator (not network status)
    updateAuthStatusUI('error', errorMessage);
    
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
 * Event delegation for login form - handles dynamically created forms
 */
function handleLoginFormClick(event) {
  console.log('🎯 EVENT DELEGATION: Click detected');
  
  // Check if this is a submit button click
  const target = event.target;
  if (target.tagName === 'BUTTON' && 
      (target.type === 'submit' || 
       target.getAttribute('type') === 'submit' ||
       target.textContent.toLowerCase().includes('login'))) {
    
    console.log('🎯 Submit button clicked via event delegation');
    
    // Find the parent form
    let form = target.closest('form');
    if (!form) {
      // Look for any form with login inputs
      const forms = document.querySelectorAll('form');
      for (const f of forms) {
        if (f.querySelector('input[type="email"], input[name="email"], input[name="identifier"]') &&
            f.querySelector('input[type="password"]')) {
          form = f;
          break;
        }
      }
    }
    
    if (form) {
      console.log('🎯 Found form via button click:', form.id || 'no-id');
      event.preventDefault();
      event.stopPropagation();
      
      // Trigger the login handler
      handleLoginSubmit({ target: form });
    }
  }
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
    updateAuthStatusUI('error', 'All fields are required');
    return;
  }
  
  if (password !== confirmPassword) {
    updateAuthStatusUI('error', 'Passwords do not match');
    return;
  }
  
  if (password.length < 8) {
    updateAuthStatusUI('error', 'Password must be at least 8 characters');
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
      updateAuthStatusUI('authenticated', 'Registration successful!');
      
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
    
    updateAuthStatusUI('error', `Registration failed: ${errorMessage}`);
    
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
      updateAuthStatusUI('success', 'Password reset email sent!');
      
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
    updateAuthStatusUI('error', `Password reset failed: ${error.message}`);
    
    // Show error in form
    showAuthError(error.message);
  } finally {
    // Re-enable form
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// ============================================================================
// NETWORK STATUS UI UPDATES (REVISED LOGIC)
// ============================================================================

/**
 * Updates the NETWORK status indicator in the UI
 * ONLY shows connectivity status, NOT auth status
 */
function updateNetworkStatusUI(status, message) {
  console.log(`NETWORK STATUS UPDATE: ${status} - ${message}`);
  
  // Update global state
  window.NetworkStatus.status = status;
  
  // Only update network indicator, not auth indicator
  let indicator = document.getElementById('network-status-indicator');
  
  // Create indicator if it doesn't exist
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'network-status-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 50px;
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
  
  // Update indicator based on NETWORK status only
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
      indicator.innerHTML = '✅ Connected';
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
      indicator.innerHTML = '⚠️ No connection';
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
// AUTH STATUS UI UPDATES (NEW)
// ============================================================================

/**
 * Updates the AUTH status indicator in the UI
 * Separate from network status
 */
function updateAuthStatusUI(status, message) {
  console.log(`AUTH STATUS UPDATE: ${status} - ${message}`);
  
  // Update AuthStatus state
  if (status === 'authenticated') {
    window.AuthStatus.isAuthenticated = true;
  } else if (status === 'unauthenticated') {
    window.AuthStatus.isAuthenticated = false;
  }
  
  // Find or create auth status indicator
  let indicator = document.getElementById('auth-status-indicator');
  
  // Create indicator if it doesn't exist
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'auth-status-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 998;
      opacity: 0.9;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(indicator);
  }
  
  // Update indicator based on AUTH status
  switch(status) {
    case 'authenticated':
      indicator.style.background = '#10b981'; // Green
      indicator.style.color = '#ffffff';
      indicator.innerHTML = '✅ ' + (message || 'Authenticated');
      indicator.style.display = 'block';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (indicator && indicator.parentNode) {
          indicator.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.style.display = 'none';
            }
          }, 300);
        }
      }, 3000);
      break;
      
    case 'unauthenticated':
      indicator.style.background = '#f59e0b'; // Amber
      indicator.style.color = '#000000';
      indicator.innerHTML = '🔒 ' + (message || 'Please log in');
      indicator.style.display = 'block';
      break;
      
    case 'error':
      indicator.style.background = '#ef4444'; // Red
      indicator.style.color = '#ffffff';
      indicator.innerHTML = '⚠️ ' + (message || 'Authentication error');
      indicator.style.display = 'block';
      
      // Auto-hide after 5 seconds for errors
      setTimeout(() => {
        if (indicator && indicator.parentNode) {
          indicator.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.style.display = 'none';
            }
          }, 300);
        }
      }, 5000);
      break;
      
    case 'success':
      indicator.style.background = '#10b981'; // Green
      indicator.style.color = '#ffffff';
      indicator.innerHTML = '✅ ' + (message || 'Success');
      indicator.style.display = 'block';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (indicator && indicator.parentNode) {
          indicator.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.style.display = 'none';
            }
          }, 300);
        }
      }, 3000);
      break;
  }
  
  // Dispatch auth status event
  const event = new CustomEvent('moodchat-auth-status', {
    detail: {
      status: status,
      message: message,
      timestamp: new Date().toISOString(),
      isAuthenticated: window.AuthStatus.isAuthenticated
    }
  });
  window.dispatchEvent(event);
}

// ============================================================================
// NETWORK STATUS READING FROM API.JS (REVISED LOGIC)
// ============================================================================

/**
 * Reads network status from api.js - STRICTLY for connectivity only
 */
async function readNetworkStatusFromApi() {
  console.log('Reading NETWORK status (connectivity only)...');
  
  // Method 1: Check browser network status first
  if (!navigator.onLine) {
    console.log('Browser reports offline - NO INTERNET');
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
  
  // Method 3: Direct API call to /status endpoint (STRICT connectivity check)
  if (typeof window.api === 'function') {
    try {
      console.log('Attempting direct /status API call for connectivity check...');
      
      // Use a timeout to prevent blocking UI
      const statusPromise = window.api('/status');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), 3000)
      );
      
      const response = await Promise.race([statusPromise, timeoutPromise]);
      
      // api.js returns parsed JSON, so just use it directly
      console.log('/status API response for connectivity:', response);
      
      // CRITICAL: Check ONLY if backend is reachable (any 2xx/4xx/5xx response means backend is reachable)
      // Even 401/403/500 means backend IS reachable, just returning an error
      const isReachable = response !== undefined && response !== null;
      
      console.log('Connectivity check: backendReachable =', isReachable, '(any response means reachable)');
      
      if (isReachable) {
        // Backend responded (even with error) - we have connectivity
        return {
          status: 'online',
          message: 'Connected to MoodChat',
          backendReachable: true
        };
      } else {
        // No response at all - backend is not reachable
        return {
          status: 'offline',
          message: 'Cannot reach MoodChat server',
          backendReachable: false
        };
      }
    } catch (error) {
      console.log('Direct API connectivity check failed:', error.message);
      
      // Check error type to determine if it's a connectivity issue
      if (error.message.includes('timeout') || 
          error.message.includes('Network') || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('network') ||
          error.message.includes('offline')) {
        // Network/connectivity error
        return {
          status: 'offline',
          message: 'Cannot reach MoodChat server',
          backendReachable: false
        };
      } else {
        // Some other error (might be auth or server error) - backend IS reachable
        console.log('Backend reachable but returned error:', error.message);
        return {
          status: 'online',
          message: 'Connected to MoodChat',
          backendReachable: true
        };
      }
    }
  }
  
  // Method 4: Check if we've received any api-network-status events
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
 * Updates UI based on NETWORK status from api.js
 */
async function updateNetworkStatusFromApi() {
  try {
    console.log('Updating NETWORK status from api.js (connectivity only)...');
    const statusInfo = await readNetworkStatusFromApi();
    console.log('Network status determined:', statusInfo);
    
    window.NetworkStatus.status = statusInfo.status;
    window.NetworkStatus.backendReachable = statusInfo.backendReachable;
    window.NetworkStatus.lastChecked = new Date();
    
    // Update NETWORK UI only
    updateNetworkStatusUI(statusInfo.status, statusInfo.message);
    
    // If backend is reachable but we're not authenticated, update auth status
    if (statusInfo.backendReachable && !window.AuthStatus.isAuthenticated) {
      // Check if we have a token but it might be expired
      const authData = getAuthData();
      if (authData && authData.token) {
        updateAuthStatusUI('unauthenticated', 'Session expired. Please log in.');
      } else {
        updateAuthStatusUI('unauthenticated', 'Please log in to continue.');
      }
    }
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
    
    // Determine NETWORK status based on api.js and browser status
    if (!browserOnline) {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', 'No internet connection');
    } else if (isReachable) {
      window.NetworkStatus.status = 'online';
      window.NetworkStatus.backendReachable = true;
      updateNetworkStatusUI('online', 'Connected to MoodChat');
    } else {
      window.NetworkStatus.status = 'offline';
      window.NetworkStatus.backendReachable = false;
      updateNetworkStatusUI('offline', 'Cannot reach MoodChat server');
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
 * Starts periodic NETWORK status updates from api.js
 */
function startPeriodicNetworkUpdates() {
  // Clear any existing interval
  if (window.NetworkStatus.checkInterval) {
    clearInterval(window.NetworkStatus.checkInterval);
    window.NetworkStatus.checkInterval = null;
  }
  
  // Initial update after api.js has time to initialize
  setTimeout(() => {
    console.log('Initial NETWORK status check...');
    updateNetworkStatusFromApi().catch(error => {
      console.log('Initial network status check failed:', error.message);
    });
  }, 2000);
  
  // Set up periodic updates
  window.NetworkStatus.checkInterval = setInterval(() => {
    if (navigator.onLine) {
      console.log('Periodic NETWORK status check...');
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
  
  console.log('Periodic NETWORK status updates started');
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
  console.log('🔄 Showing login form');
  
  // Hide other forms
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  if (registerForm) registerForm.style.display = 'none';
  if (forgotForm) forgotForm.style.display = 'none';
  
  // Show login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.style.display = 'block';
    
    // Re-bind the submit handler when form is shown
    setTimeout(() => {
      bindLoginForm();
    }, 100);
    
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
// PERSISTENT FORM BINDING WITH EVENT DELEGATION
// ============================================================================

/**
 * Binds login form with event delegation for persistence
 */
function bindLoginForm() {
  console.log('🔧 Binding login form with event delegation...');
  
  const loginForm = document.getElementById('login-form');
  if (!loginForm) {
    console.log('⚠️ Login form not found yet, will retry');
    return;
  }
  
  console.log('✅ Found login form, setting up event delegation');
  
  // Remove any existing listeners
  loginForm.removeEventListener('submit', handleLoginSubmit);
  
  // Add the submit handler
  loginForm.addEventListener('submit', handleLoginSubmit);
  
  console.log('✅ Login form bound successfully');
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
  
  // Bind login form with event delegation
  bindLoginForm();
  
  // Set up periodic form binding to handle dynamic form changes
  setInterval(() => {
    const loginForm = document.getElementById('login-form');
    if (loginForm && !loginForm.__loginBound) {
      console.log('🔄 Periodic check: Binding login form');
      bindLoginForm();
      loginForm.__loginBound = true;
    }
  }, 2000);
  
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
  
  // Set up event delegation at document level as backup
  document.addEventListener('click', handleLoginFormClick);
  
  console.log('✅ Auth form event listeners set up with event delegation');
}

// ============================================================================
// DEBUG AND UTILITY FUNCTIONS
// ============================================================================

/**
 * Manual network check function for debugging
 */
window.checkNetworkNow = async function() {
  console.log('Manual NETWORK status check requested');
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
  console.log('AuthStatus:', window.AuthStatus);
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

/**
 * Manual login trigger for testing
 */
window.triggerLoginManually = function() {
  console.log('🔧 Manual login trigger called');
  const form = document.getElementById('login-form');
  if (form) {
    console.log('✅ Found form, triggering submit');
    form.dispatchEvent(new Event('submit'));
  } else {
    console.error('❌ No login form found');
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
  
  // Ensure auth state exists in AppState
  if (!window.AppState.auth) {
    window.AppState.auth = {
      isAuthenticated: false,
      user: null,
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
    
    // Sync AuthStatus with AppState.auth
    if (window.AppState && window.AppState.auth) {
      window.AppState.auth.isAuthenticated = window.AuthStatus.isAuthenticated;
      window.AppState.auth.user = window.AuthStatus.user;
      window.AppState.auth.lastChecked = window.AuthStatus.lastChecked;
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
        
        // Update AuthStatus
        window.AuthStatus.isAuthenticated = true;
        window.AuthStatus.user = user;
        window.AuthStatus.token = token;
        
        // Save user info if not already saved
        if (!localStorage.getItem('currentUser')) {
          localStorage.setItem('currentUser', JSON.stringify(user));
        }
        
        // Dispatch auth:login event
        document.dispatchEvent(
          new CustomEvent('auth:login', { detail: user })
        );
        
        // Update auth status (not network status)
        updateAuthStatusUI('authenticated', 'Session restored');
      } else {
        console.log('Invalid session, clearing auth data');
        clearAuthData();
        
        // Update auth status
        updateAuthStatusUI('unauthenticated', 'Session expired. Please log in.');
        
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
    
    // Update auth status
    updateAuthStatusUI('unauthenticated', 'Session validation failed');
    
    // If we're on chat page and validation fails, redirect to login
    if (window.location.pathname.includes('chat.html')) {
      console.log('Redirecting to login page due to validation error...');
      window.location.href = 'index.html';
    }
  }
}

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
  
  // 3. Set initial NETWORK UI state (connectivity only)
  if (typeof window.api === 'function') {
    try {
      const healthCheck = await window.api('/status');
      // Any response (even error) means backend is reachable
      if (healthCheck !== undefined && healthCheck !== null) {
        updateNetworkStatusUI('online', 'Connected to MoodChat');
      } else {
        updateNetworkStatusUI('checking', 'Checking connection...');
      }
    } catch (error) {
      // Error means backend IS reachable (we got a response)
      console.log('Backend reachable but returned error:', error.message);
      updateNetworkStatusUI('online', 'Connected to MoodChat');
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
  
  // 7. Start periodic NETWORK status updates
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
  const networkIndicator = document.getElementById('network-status-indicator');
  if (networkIndicator && networkIndicator.parentNode) {
    networkIndicator.parentNode.removeChild(networkIndicator);
  }
  
  // Remove auth indicator
  const authIndicator = document.getElementById('auth-status-indicator');
  if (authIndicator && authIndicator.parentNode) {
    authIndicator.parentNode.removeChild(authIndicator);
  }
  
  console.log('Network monitoring cleaned up');
};

/**
 * Logout function that clears auth data
 */
window.logoutUser = function() {
  console.log('Logging out user...');
  clearAuthData();
  
  // Update auth status
  updateAuthStatusUI('unauthenticated', 'Logged out successfully');
  
  // Redirect to login page after a short delay
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1000);
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

console.log('app.ui.auth.js - STRICT API-DRIVEN Auth UI with SEPARATED Network/Auth status - LOGIC FIX APPLIED');