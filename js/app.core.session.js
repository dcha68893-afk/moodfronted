// app.core.session.js - MoodChat Session Coordination & Authentication System
// COMPLETE REFACTORED VERSION - Preserves all existing behavior
// UPDATED: Comprehensive session lifecycle management
// UPDATED: Multi-context synchronization (iframe, cross-tab)
// UPDATED: Token refresh with silent retry strategies
// UPDATED: Global auth state preservation
// UPDATED: Event-driven architecture integration
// UPDATED: Backward compatibility maintained
// UPDATED: Safety guards for robust initialization and error isolation

(function () {
  'use strict';

  // ============================================================================
  // SAFETY GUARDS & ERROR ISOLATION
  // ============================================================================

  // Safety guard configuration
  const SAFETY_GUARDS = {
    maxRetryAttempts: 3,
    retryCooldownMs: 5000,
    logThrottleMs: 30000,
    initializationTimeoutMs: 10000,
    sessionValidationMaxAttempts: 3,
    iframeHandshakeMaxAttempts: 2,
    blockedMethods: new Set(),
    errorCounts: new Map(),
    lastErrorLogs: new Map()
  };

  // Safe execution wrapper with error isolation
  function executeSafely(funcName, func, context = null, ...args) {
    if (SAFETY_GUARDS.blockedMethods.has(funcName)) {
      logThrottled(funcName, `Function ${funcName} is blocked due to repeated failures`);
      return null;
    }

    try {
      return func.apply(context, args);
    } catch (error) {
      const errorCount = (SAFETY_GUARDS.errorCounts.get(funcName) || 0) + 1;
      SAFETY_GUARDS.errorCounts.set(funcName, errorCount);

      logThrottled(funcName, `Error in ${funcName}: ${error.message} (count: ${errorCount})`);

      if (errorCount >= SAFETY_GUARDS.maxRetryAttempts) {
        SAFETY_GUARDS.blockedMethods.add(funcName);
        console.warn(`⚠️ ${funcName} blocked after ${errorCount} failures. Other functions will continue.`);
      }

      // Ensure other functions continue
      return null;
    }
  }

  // Throttled logging to prevent spam
  function logThrottled(funcName, message, level = 'error') {
    const now = Date.now();
    const lastLog = SAFETY_GUARDS.lastErrorLogs.get(funcName) || 0;
    
    if (now - lastLog > SAFETY_GUARDS.logThrottleMs) {
      if (level === 'error') {
        console.error(`❌ ${message}`);
      } else if (level === 'warn') {
        console.warn(`⚠️ ${message}`);
      } else {
        console.log(`📝 ${message}`);
      }
      SAFETY_GUARDS.lastErrorLogs.set(funcName, now);
    }
  }

  // Safe session data validation
  function validateSessionData(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
      return { isValid: false, reason: 'Session data is null or not an object' };
    }

    const requiredFields = ['sessionId', 'userId', 'token'];
    const missingFields = requiredFields.filter(field => !sessionData[field]);

    if (missingFields.length > 0) {
      return { 
        isValid: false, 
        reason: `Missing required fields: ${missingFields.join(', ')}` 
      };
    }

    // Additional validation for specific field types
    if (sessionData.userId && typeof sessionData.userId !== 'string') {
      return { isValid: false, reason: 'userId must be a string' };
    }

    if (sessionData.token && typeof sessionData.token !== 'string') {
      return { isValid: false, reason: 'token must be a string' };
    }

    return { isValid: true };
  }

  // Safe retry executor with limit
  function executeWithRetry(funcName, func, maxAttempts = SAFETY_GUARDS.sessionValidationMaxAttempts) {
    return new Promise((resolve) => {
      let attempts = 0;
      let lastError = null;

      const attempt = () => {
        attempts++;
        
        try {
          const result = func();
          resolve({ success: true, result, attempts });
        } catch (error) {
          lastError = error;
          logThrottled(funcName, `Attempt ${attempts}/${maxAttempts} failed: ${error.message}`);

          if (attempts >= maxAttempts) {
            logThrottled(funcName, `Max retry attempts (${maxAttempts}) reached for ${funcName}`);
            resolve({ success: false, error: lastError, attempts });
            return;
          }

          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          setTimeout(attempt, delay);
        }
      };

      attempt();
    });
  }

  // ============================================================================
  // GLOBAL AUTH STATE MANAGEMENT - CANONICAL SOURCE OF TRUTH
  // ============================================================================

  // ENSURE AUTH_STATE exists with all original properties and methods
  if (typeof AUTH_STATE === 'undefined') {
    console.log('🔐 Creating comprehensive AUTH_STATE singleton');
    
    const initializeAuthStateSafely = function() {
      return executeSafely('AUTH_STATE.initialize', () => {
        window.AUTH_STATE = {
          // Core authentication state
          _token: null,
          _refreshToken: null,
          _user: null,
          _tokenExpiry: null,
          _refreshExpiry: null,
          _validated: false,
          _validationTimestamp: null,
          _storageKeyPrefix: 'moodchat_',
          
          // Cross-tab synchronization ID
          _tabId: 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          
          // Initialization flag
          _initialized: false,
          
          // Safety state
          _initializationAttempts: 0,
          _maxInitializationAttempts: 3,
          
          // Initialize auth state system
          initialize: function() {
            if (this._initialized) {
              console.log('⚠️ AUTH_STATE already initialized');
              return;
            }

            this._initializationAttempts++;
            if (this._initializationAttempts > this._maxInitializationAttempts) {
              console.warn('⚠️ Max initialization attempts reached. Skipping AUTH_STATE initialization.');
              return;
            }
            
            console.log('🔐 Initializing AUTH_STATE system...');
            
            // Load from storage
            executeSafely('AUTH_STATE._loadFromStorage', this._loadFromStorage, this);
            
            // Setup cross-tab synchronization
            executeSafely('AUTH_STATE._setupCrossTabSync', this._setupCrossTabSync, this);
            
            // Setup periodic validation
            executeSafely('AUTH_STATE._setupPeriodicValidation', this._setupPeriodicValidation, this);
            
            this._initialized = true;
            console.log('✅ AUTH_STATE system initialized');
            
            // Record initialization
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.initialize.recordDependency', () => {
                window.app._dependencyGraph.authState = {
                  initialized: true,
                  initializationTime: new Date().toISOString(),
                  tabId: this._tabId,
                  hasToken: this.hasToken(),
                  hasUser: !!this._user
                };
              });
            }
          },
          
          // Load state from storage
          _loadFromStorage: function() {
            try {
              // Load token
              this._token = localStorage.getItem(this._storageKeyPrefix + 'accessToken') || 
                           localStorage.getItem('accessToken') || 
                           sessionStorage.getItem('accessToken');
              
              // Load refresh token
              this._refreshToken = localStorage.getItem(this._storageKeyPrefix + 'refreshToken') || 
                                  localStorage.getItem('refreshToken');
              
              // Load user
              const userStr = localStorage.getItem(this._storageKeyPrefix + 'user') || 
                             localStorage.getItem('moodchat_user') || 
                             sessionStorage.getItem('moodchat_user');
              if (userStr) {
                try {
                  this._user = JSON.parse(userStr);
                } catch (e) {
                  console.error('Failed to parse user data:', e);
                  this._user = null;
                }
              }
              
              // Load expiry
              const expiryStr = localStorage.getItem(this._storageKeyPrefix + 'tokenExpiry') || 
                               localStorage.getItem('tokenExpiresAt');
              if (expiryStr) {
                this._tokenExpiry = new Date(expiryStr);
              }
              
              // Load validation state
              const validatedStr = localStorage.getItem(this._storageKeyPrefix + 'validated');
              this._validated = validatedStr === 'true';
              
              if (validatedStr) {
                const timestampStr = localStorage.getItem(this._storageKeyPrefix + 'validationTimestamp');
                if (timestampStr) {
                  this._validationTimestamp = new Date(timestampStr);
                }
              }
              
              console.log('📥 Loaded auth state from storage:', {
                hasToken: !!this._token,
                hasUser: !!this._user,
                tokenExpiry: this._tokenExpiry,
                validated: this._validated
              });
              
            } catch (error) {
              console.error('❌ Failed to load auth state from storage:', error);
              this._clearLocalState();
            }
          },
          
          // Save state to storage
          _saveToStorage: function() {
            try {
              if (this._token) {
                localStorage.setItem(this._storageKeyPrefix + 'accessToken', this._token);
                localStorage.setItem('accessToken', this._token); // Legacy
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'accessToken');
                localStorage.removeItem('accessToken');
              }
              
              if (this._refreshToken) {
                localStorage.setItem(this._storageKeyPrefix + 'refreshToken', this._refreshToken);
                localStorage.setItem('refreshToken', this._refreshToken); // Legacy
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'refreshToken');
                localStorage.removeItem('refreshToken');
              }
              
              if (this._user) {
                const userStr = JSON.stringify(this._user);
                localStorage.setItem(this._storageKeyPrefix + 'user', userStr);
                localStorage.setItem('moodchat_user', userStr); // Legacy
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'user');
                localStorage.removeItem('moodchat_user');
                sessionStorage.removeItem('moodchat_user');
              }
              
              if (this._tokenExpiry) {
                localStorage.setItem(this._storageKeyPrefix + 'tokenExpiry', this._tokenExpiry.toISOString());
                localStorage.setItem('tokenExpiresAt', this._tokenExpiry.toISOString()); // Legacy
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'tokenExpiry');
                localStorage.removeItem('tokenExpiresAt');
              }
              
              localStorage.setItem(this._storageKeyPrefix + 'validated', this._validated.toString());
              
              if (this._validationTimestamp) {
                localStorage.setItem(this._storageKeyPrefix + 'validationTimestamp', this._validationTimestamp.toISOString());
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'validationTimestamp');
              }
              
              // Broadcast storage event for cross-tab sync (but not from this tab)
              const storageEvent = new CustomEvent('moodchat-storage-update', {
                detail: {
                  sourceTab: this._tabId,
                  timestamp: new Date().toISOString(),
                  hasToken: !!this._token,
                  hasUser: !!this._user
                }
              });
              setTimeout(() => window.dispatchEvent(storageEvent), 100);
              
            } catch (error) {
              console.error('❌ Failed to save auth state to storage:', error);
            }
          },
          
          // Setup cross-tab synchronization
          _setupCrossTabSync: function() {
            // Listen for storage events (other tabs)
            window.addEventListener('storage', (event) => {
              if (event.key === this._storageKeyPrefix + 'accessToken' || 
                  event.key === 'accessToken' ||
                  event.key === this._storageKeyPrefix + 'user' ||
                  event.key === 'moodchat_user') {
                
                console.log('🔄 Storage change detected from another tab:', event.key);
                
                // Small delay to ensure storage is updated
                setTimeout(() => {
                  executeSafely('AUTH_STATE.storageEvent', () => {
                    this._loadFromStorage();
                    
                    // Dispatch appropriate events
                    if (event.key.includes('accessToken')) {
                      if (this._token) {
                        window.dispatchEvent(new CustomEvent('moodchat-token-synced', {
                          detail: {
                            source: 'storage_event',
                            timestamp: new Date().toISOString()
                          }
                        }));
                      } else {
                        window.dispatchEvent(new CustomEvent('moodchat-token-cleared', {
                          detail: {
                            source: 'storage_event',
                            timestamp: new Date().toISOString()
                          }
                        }));
                      }
                    }
                    
                    if (event.key.includes('user')) {
                      if (this._user) {
                        window.dispatchEvent(new CustomEvent('moodchat-user-synced', {
                          detail: {
                            source: 'storage_event',
                            user: this._user,
                            timestamp: new Date().toISOString()
                          }
                        }));
                      } else {
                        window.dispatchEvent(new CustomEvent('moodchat-user-cleared', {
                          detail: {
                            source: 'storage_event',
                            timestamp: new Date().toISOString()
                          }
                        }));
                      }
                    }
                  });
                }, 50);
              }
            });
            
            // Listen for custom storage update events
            window.addEventListener('moodchat-storage-update', (event) => {
              if (event.detail.sourceTab !== this._tabId) {
                console.log('🔄 Custom storage update from another tab');
                executeSafely('AUTH_STATE.customStorageEvent', this._loadFromStorage, this);
              }
            });
            
            console.log('✅ Cross-tab synchronization enabled');
          },
          
          // Setup periodic validation
          _setupPeriodicValidation: function() {
            // Validate every 5 minutes if authenticated
            setInterval(() => {
              if (this.isAuthenticated()) {
                executeSafely('AUTH_STATE.periodicValidation', () => {
                  this.validateSilently().catch(() => {
                    // Silent failures are OK here
                  });
                });
              }
            }, 5 * 60 * 1000); // 5 minutes
            
            console.log('✅ Periodic validation enabled (every 5 minutes)');
          },
          
          // Clear local state (without affecting storage)
          _clearLocalState: function() {
            this._token = null;
            this._refreshToken = null;
            this._user = null;
            this._tokenExpiry = null;
            this._refreshExpiry = null;
            this._validated = false;
            this._validationTimestamp = null;
          },
          
          // PUBLIC API - ORIGINAL METHODS PRESERVED
          
          // Check if token exists
          hasToken: function() {
            return !!this._token;
          },
          
          // Get token
          getToken: function() {
            return this._token;
          },
          
          // Get refresh token
          getRefreshToken: function() {
            return this._refreshToken;
          },
          
          // Get user
          getUser: function() {
            return this._user;
          },
          
          // Check if authenticated
          isAuthenticated: function() {
            if (!this._token) return false;
            if (!this._user) return false;
            if (!this._validated) return false;
            
            // Check token expiry
            if (this._tokenExpiry) {
              const now = new Date();
              if (now > this._tokenExpiry) {
                console.log('⏰ Token expired');
                return false;
              }
            }
            
            return true;
          },
          
          // Set authentication state
          setAuthState: function(user, token, refreshToken, expiresIn) {
            console.log('🔐 Setting auth state:', { 
              user: user ? user.uid : null, 
              hasToken: !!token,
              hasRefreshToken: !!refreshToken,
              expiresIn: expiresIn 
            });
            
            this._user = user;
            this._token = token;
            this._refreshToken = refreshToken;
            
            if (expiresIn) {
              const expiryDate = new Date();
              expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
              this._tokenExpiry = expiryDate;
            } else {
              this._tokenExpiry = null;
            }
            
            this._validated = true;
            this._validationTimestamp = new Date();
            
            // Save to storage
            executeSafely('AUTH_STATE.setAuthState.save', this._saveToStorage, this);
            
            // Update window.currentUser for backward compatibility
            window.currentUser = user;
            
            // Update global auth state if function exists
            if (typeof updateGlobalAuthState === 'function') {
              executeSafely('updateGlobalAuthState', () => updateGlobalAuthState(user));
            }
            
            // Dispatch events
            window.dispatchEvent(new CustomEvent('moodchat-auth-state-changed', {
              detail: {
                user: user,
                hasToken: !!token,
                validated: true,
                timestamp: new Date().toISOString()
              }
            }));
            
            // Record in dependency graph
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.setAuthState.record', () => {
                window.app._dependencyGraph.authState.lastUpdate = new Date().toISOString();
                window.app._dependencyGraph.authState.hasToken = !!token;
                window.app._dependencyGraph.authState.hasUser = !!user;
                window.app._dependencyGraph.authState.validated = true;
              });
            }
          },
          
          // Clear authentication state
          clearAuthState: function() {
            console.log('🧹 Clearing auth state');
            
            // Clear local state
            this._clearLocalState();
            
            // Clear storage
            try {
              localStorage.removeItem(this._storageKeyPrefix + 'accessToken');
              localStorage.removeItem(this._storageKeyPrefix + 'refreshToken');
              localStorage.removeItem(this._storageKeyPrefix + 'user');
              localStorage.removeItem(this._storageKeyPrefix + 'tokenExpiry');
              localStorage.removeItem(this._storageKeyPrefix + 'validated');
              localStorage.removeItem(this._storageKeyPrefix + 'validationTimestamp');
              
              // Legacy keys
              localStorage.removeItem('accessToken');
              localStorage.removeItem('moodchat_jwt_token');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('moodchat_user');
              localStorage.removeItem('tokenExpiresAt');
              localStorage.removeItem('moodchat-auth-state');
              sessionStorage.removeItem('moodchat_user');
              
            } catch (error) {
              console.error('Failed to clear storage:', error);
            }
            
            // Clear window.currentUser
            window.currentUser = null;
            
            // Update global auth state if function exists
            if (typeof updateGlobalAuthState === 'function') {
              executeSafely('updateGlobalAuthState.clear', () => updateGlobalAuthState(null));
            }
            
            // Dispatch events
            window.dispatchEvent(new CustomEvent('moodchat-auth-state-cleared', {
              detail: {
                timestamp: new Date().toISOString()
              }
            }));
            
            // Record in dependency graph
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.clearAuthState.record', () => {
                window.app._dependencyGraph.authState.lastClear = new Date().toISOString();
                window.app._dependencyGraph.authState.hasToken = false;
                window.app._dependencyGraph.authState.hasUser = false;
                window.app._dependencyGraph.authState.validated = false;
              });
            }
          },
          
          // Validate token silently (without UI feedback)
          validateSilently: function() {
            return new Promise((resolve, reject) => {
              if (!this._token) {
                reject(new Error('No token to validate'));
                return;
              }
              
              console.log('🔐 Silent token validation');
              
              // Use modular API if available
              if (window.api && window.api.auth && window.api.auth.validateTokenSilently) {
                executeSafely('validateTokenSilently', () => {
                  window.api.auth.validateTokenSilently()
                    .then(result => {
                      if (result.valid) {
                        this._validated = true;
                        this._validationTimestamp = new Date();
                        this._saveToStorage();
                        resolve(true);
                      } else {
                        this._validated = false;
                        reject(new Error('Token validation failed'));
                      }
                    })
                    .catch(error => {
                      this._validated = false;
                      reject(error);
                    });
                });
                return;
              }
              
              // Fallback validation
              try {
                // Simple JWT validation
                const parts = this._token.split('.');
                if (parts.length !== 3) {
                  this._validated = false;
                  reject(new Error('Invalid token format'));
                  return;
                }
                
                const payload = JSON.parse(atob(parts[1]));
                const now = Math.floor(Date.now() / 1000);
                
                if (payload.exp && payload.exp < now) {
                  this._validated = false;
                  reject(new Error('Token expired'));
                  return;
                }
                
                this._validated = true;
                this._validationTimestamp = new Date();
                this._saveToStorage();
                resolve(true);
                
              } catch (error) {
                this._validated = false;
                reject(error);
              }
            });
          },
          
          // Get token expiry in milliseconds
          getTimeToExpiry: function() {
            if (!this._tokenExpiry) return null;
            const now = new Date();
            return this._tokenExpiry.getTime() - now.getTime();
          },
          
          // Check if token expires soon (within minutes)
          expiresSoon: function(minutes = 10) {
            const timeToExpiry = this.getTimeToExpiry();
            if (!timeToExpiry) return false;
            return timeToExpiry < (minutes * 60 * 1000);
          },
          
          // Mark as validated
          markAsValidated: function() {
            this._validated = true;
            this._validationTimestamp = new Date();
            this._saveToStorage();
          },
          
          // Mark as invalid
          markAsInvalid: function() {
            this._validated = false;
            this._saveToStorage();
          },
          
          // Get validation status
          isValidated: function() {
            return this._validated;
          },
          
          // Get last validation timestamp
          getLastValidation: function() {
            return this._validationTimestamp;
          },
          
          // Get comprehensive auth state
          getState: function() {
            return {
              hasToken: this.hasToken(),
              token: this._token ? '[REDACTED]' : null,
              refreshToken: this._refreshToken ? '[REDACTED]' : null,
              user: this._user,
              authenticated: this.isAuthenticated(),
              validated: this._validated,
              tokenExpiry: this._tokenExpiry,
              timeToExpiry: this.getTimeToExpiry(),
              expiresSoon: this.expiresSoon(),
              validationTimestamp: this._validationTimestamp,
              tabId: this._tabId,
              storagePrefix: this._storageKeyPrefix
            };
          }
        };
        
        // Auto-initialize
        setTimeout(() => {
          if (window.AUTH_STATE && window.AUTH_STATE.initialize) {
            window.AUTH_STATE.initialize();
          }
        }, 100);
        
        console.log('✅ AUTH_STATE singleton created');
      });
    };

    initializeAuthStateSafely();
    
  } else {
    console.log('✅ AUTH_STATE already exists, ensuring initialization');
    if (AUTH_STATE.initialize && !AUTH_STATE._initialized) {
      setTimeout(() => {
        executeSafely('AUTH_STATE.delayedInitialize', AUTH_STATE.initialize, AUTH_STATE);
      }, 100);
    }
  }

  // ============================================================================
  // TOKEN VALIDATION PIPELINE - COMPLETE VALIDATION ECOSYSTEM
  // ============================================================================

  // ENSURE TOKEN_VALIDATION exists with all original methods
  if (typeof TOKEN_VALIDATION === 'undefined') {
    console.log('🔐 Creating comprehensive TOKEN_VALIDATION pipeline');
    
    const initializeTokenValidationSafely = function() {
      return executeSafely('TOKEN_VALIDATION.creation', () => {
        window.TOKEN_VALIDATION = {
          // Configuration
          _config: {
            validationEndpoints: [
              '/auth/me',
              '/auth/validate',
              '/api/auth/verify'
            ],
            refreshEndpoint: '/auth/refresh',
            timeout: 10000, // 10 seconds
            retryAttempts: 3,
            retryDelay: 1000,
            cacheDuration: 300000 // 5 minutes
          },
          
          // Cache for validation results
          _validationCache: new Map(),
          _lastValidationAttempt: null,
          _validationAttempts: 0,
          _maxValidationAttempts: SAFETY_GUARDS.sessionValidationMaxAttempts,
          _validationBlocked: false,
          
          // Validate with backend (original method preserved)
          validateWithBackend: function() {
            if (this._validationBlocked) {
              logThrottled('TOKEN_VALIDATION.validateWithBackend', 
                'Validation blocked due to repeated failures');
              return Promise.resolve({ valid: false, reason: 'Validation blocked' });
            }

            console.log('🔐 Validating token with backend...');
            
            return new Promise((resolve) => {
              const token = AUTH_STATE ? AUTH_STATE.getToken() : null;
              if (!token) {
                resolve({ valid: false, reason: 'No token found' });
                return;
              }
              
              this._validationAttempts++;
              if (this._validationAttempts > this._maxValidationAttempts) {
                this._validationBlocked = true;
                logThrottled('TOKEN_VALIDATION.validateWithBackend', 
                  `Max validation attempts (${this._maxValidationAttempts}) reached. Blocking further attempts.`);
                resolve({ valid: false, reason: 'Max validation attempts reached' });
                return;
              }
              
              // Check cache first
              const cacheKey = 'backend_' + token.substring(0, 20);
              const cached = this._validationCache.get(cacheKey);
              if (cached && (Date.now() - cached.timestamp) < this._config.cacheDuration) {
                console.log('✅ Using cached validation result');
                resolve(cached.result);
                return;
              }
              
              // Try multiple endpoints in order
              this._tryValidationEndpoints(token)
                .then(result => {
                  // Reset attempts on success
                  this._validationAttempts = 0;
                  
                  // Cache successful validations
                  if (result.valid) {
                    this._validationCache.set(cacheKey, {
                      result: result,
                      timestamp: Date.now()
                    });
                  }
                  
                  // Update AUTH_STATE
                  if (result.valid && AUTH_STATE) {
                    executeSafely('TOKEN_VALIDATION.updateAuthState', () => {
                      AUTH_STATE.markAsValidated();
                      if (result.user) {
                        AUTH_STATE.setAuthState(result.user, token);
                      }
                    });
                  } else if (AUTH_STATE) {
                    executeSafely('TOKEN_VALIDATION.markInvalid', () => {
                      AUTH_STATE.markAsInvalid();
                    });
                  }
                  
                  resolve(result);
                })
                .catch(error => {
                  console.error('❌ Backend validation failed:', error);
                  
                  // Fallback to client-side validation
                  const fallbackResult = this._validateClientSide(token);
                  
                  if (AUTH_STATE) {
                    executeSafely('TOKEN_VALIDATION.fallbackUpdate', () => {
                      if (fallbackResult.valid) {
                        AUTH_STATE.markAsValidated();
                      } else {
                        AUTH_STATE.markAsInvalid();
                      }
                    });
                  }
                  
                  resolve(fallbackResult);
                });
            });
          },
          
          // Try multiple validation endpoints
          _tryValidationEndpoints: function(token) {
            return new Promise(async (resolve, reject) => {
              const endpoints = this._config.validationEndpoints;
              let lastError = null;
              
              for (const endpoint of endpoints) {
                try {
                  const result = await this._validateWithEndpoint(endpoint, token);
                  if (result.valid !== undefined) {
                    resolve(result);
                    return;
                  }
                } catch (error) {
                  lastError = error;
                  console.log(`⚠️ Validation endpoint failed: ${endpoint}`, error.message);
                  // Continue to next endpoint
                }
              }
              
              reject(lastError || new Error('All validation endpoints failed'));
            });
          },
          
          // Validate with specific endpoint
          _validateWithEndpoint: function(endpoint, token) {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error(`Validation timeout for ${endpoint}`));
              }, this._config.timeout);
              
              // Use API_COORDINATION if available
              if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION.safeApiCall) {
                executeSafely('TOKEN_VALIDATION.apiCall', () => {
                  API_COORDINATION.safeApiCall(endpoint, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  })
                  .then(response => {
                    clearTimeout(timeoutId);
                    if (response.success && response.data) {
                      resolve({
                        valid: true,
                        user: response.data,
                        validated: true,
                        source: endpoint
                      });
                    } else {
                      resolve({
                        valid: false,
                        reason: response.message || 'Validation failed',
                        source: endpoint
                      });
                    }
                  })
                  .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                  });
                });
              } else {
                // Direct fetch
                executeSafely('TOKEN_VALIDATION.directFetch', () => {
                  fetch(endpoint, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    }
                  })
                  .then(response => {
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                  })
                  .then(data => {
                    resolve({
                      valid: true,
                      user: data,
                      validated: true,
                      source: endpoint
                    });
                  })
                  .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                  });
                });
              }
            });
          },
          
          // Client-side validation fallback
          _validateClientSide: function(token) {
            console.log('🔐 Falling back to client-side validation');
            
            try {
              const parts = token.split('.');
              if (parts.length !== 3) {
                return { valid: false, reason: 'Invalid token format' };
              }
              
              const payload = JSON.parse(atob(parts[1]));
              const now = Math.floor(Date.now() / 1000);
              
              if (payload.exp && payload.exp < now) {
                return { valid: false, reason: 'Token expired' };
              }
              
              return {
                valid: true,
                user: {
                  id: payload.sub || payload.userId || 'unknown',
                  email: payload.email || 'user@example.com',
                  name: payload.name || 'User',
                  validated: false // Mark as not backend-validated
                },
                validated: false,
                source: 'client_side'
              };
              
            } catch (error) {
              return { valid: false, reason: 'Token validation error', error: error.message };
            }
          },
          
          // Refresh token (original method preserved)
          refreshToken: function() {
            console.log('🔄 Attempting token refresh...');
            
            return new Promise((resolve) => {
              if (!AUTH_STATE) {
                resolve({ success: false, reason: 'AUTH_STATE not available' });
                return;
              }
              
              const token = AUTH_STATE.getToken();
              const refreshToken = AUTH_STATE.getRefreshToken();
              
              if (!token && !refreshToken) {
                resolve({ success: false, reason: 'No token to refresh' });
                return;
              }
              
              // Use refresh token if available
              const refreshPayload = refreshToken ? {
                refreshToken: refreshToken
              } : {
                token: token
              };
              
              // Use API_COORDINATION if available
              if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION.safeApiCall) {
                executeSafely('TOKEN_VALIDATION.refreshApiCall', () => {
                  API_COORDINATION.safeApiCall(this._config.refreshEndpoint, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(refreshPayload)
                  })
                  .then(response => {
                    if (response.success && response.data && response.data.token) {
                      // Update tokens
                      executeSafely('TOKEN_VALIDATION.updateTokens', () => {
                        AUTH_STATE.setAuthState(
                          AUTH_STATE.getUser(),
                          response.data.token,
                          response.data.refreshToken,
                          response.data.expiresIn
                        );
                      });
                      
                      resolve({ success: true, token: response.data.token });
                    } else {
                      resolve({ success: false, reason: response.message || 'Refresh failed' });
                    }
                  })
                  .catch(error => {
                    console.error('❌ Token refresh failed:', error);
                    resolve({ success: false, reason: 'Refresh request failed' });
                  });
                });
              } else {
                // Direct fetch
                executeSafely('TOKEN_VALIDATION.refreshDirectFetch', () => {
                  fetch(this._config.refreshEndpoint, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(refreshPayload)
                  })
                  .then(response => {
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                  })
                  .then(data => {
                    if (data.token) {
                      executeSafely('TOKEN_VALIDATION.updateTokensDirect', () => {
                        AUTH_STATE.setAuthState(
                          AUTH_STATE.getUser(),
                          data.token,
                          data.refreshToken,
                          data.expiresIn
                        );
                      });
                      resolve({ success: true, token: data.token });
                    } else {
                      resolve({ success: false, reason: 'No token in response' });
                    }
                  })
                  .catch(error => {
                    console.error('❌ Token refresh failed:', error);
                    resolve({ success: false, reason: 'Refresh request failed' });
                  });
                });
              }
            });
          },
          
          // Validate with multiple methods (enhanced)
          validateWithMultipleMethods: function() {
            console.log('🔐 Validating token with multiple methods...');
            
            return new Promise(async (resolve) => {
              // Method 1: Backend validation
              try {
                const backendResult = await this.validateWithBackend();
                if (backendResult.valid) {
                  console.log('✅ Token validated via backend');
                  resolve(backendResult);
                  return;
                }
              } catch (error) {
                console.log('⚠️ Backend validation failed, trying next method');
              }
              
              // Method 2: Modular API validation
              if (window.api && window.api.auth && window.api.auth.validateToken) {
                try {
                  const apiResult = await executeSafely('modularAPI.validateToken', 
                    () => window.api.auth.validateToken());
                  if (apiResult && apiResult.valid) {
                    console.log('✅ Token validated via modular API');
                    resolve(apiResult);
                    return;
                  }
                } catch (error) {
                  console.log('⚠️ Modular API validation failed');
                }
              }
              
              // Method 3: Client-side validation
              const token = AUTH_STATE ? AUTH_STATE.getToken() : null;
              const clientResult = token ? this._validateClientSide(token) : { valid: false, reason: 'No token' };
              if (clientResult.valid) {
                console.log('✅ Token validated client-side (limited)');
                resolve(clientResult);
                return;
              }
              
              // All methods failed
              console.log('❌ All validation methods failed');
              resolve({
                valid: false,
                reason: 'All validation methods failed',
                error: 'Unable to validate token'
              });
            });
          },
          
          // Clear validation cache
          clearCache: function() {
            executeSafely('TOKEN_VALIDATION.clearCache', () => {
              this._validationCache.clear();
              this._lastValidationAttempt = null;
              console.log('🧹 Validation cache cleared');
            });
          },
          
          // Get validation statistics
          getStats: function() {
            return executeSafely('TOKEN_VALIDATION.getStats', () => ({
              cacheSize: this._validationCache.size,
              lastValidationAttempt: this._lastValidationAttempt,
              validationAttempts: this._validationAttempts,
              validationBlocked: this._validationBlocked,
              config: this._config
            })) || {
              cacheSize: 0,
              lastValidationAttempt: null,
              validationAttempts: this._validationAttempts,
              validationBlocked: this._validationBlocked,
              config: this._config
            };
          }
        };
        
        console.log('✅ TOKEN_VALIDATION pipeline created');
      });
    };

    initializeTokenValidationSafely();
  }

  // ============================================================================
  // SESSION COORDINATOR - COMPLETE SESSION LIFECYCLE MANAGEMENT
  // ============================================================================

  // CREATE SESSION_COORDINATOR singleton with safety guards
  console.log('🔐 Creating comprehensive SESSION_COORDINATOR');
  
  const initializeSessionCoordinatorSafely = function() {
    return executeSafely('SESSION_COORDINATOR.creation', () => {
      window.SESSION_COORDINATOR = {
        // Configuration
        _config: {
          monitoringInterval: 5 * 60 * 1000, // 5 minutes
          inactivityTimeout: 30 * 60 * 1000, // 30 minutes
          warningThreshold: 10 * 60 * 1000, // 10 minutes before expiry
          refreshThreshold: 15 * 60 * 1000, // 15 minutes before expiry
          maxRetryAttempts: 3,
          retryBackoff: [1000, 3000, 10000] // 1s, 3s, 10s
        },
        
        // State
        _listeners: new Map(),
        _monitoringInterval: null,
        _inactivityTimeout: null,
        _refreshTimeout: null,
        _warningTimeout: null,
        _retryCount: 0,
        _lastActivity: Date.now(),
        _broadcastChannel: null,
        
        // Iframe coordination
        _iframes: new Map(),
        _iframeMessageQueue: new Map(),
        _iframeHandshakeAttempts: new Map(),
        
        // Safety state
        _initialized: false,
        _initializationAttempts: 0,
        _maxInitializationAttempts: 3,
        
        // Initialize session coordinator
        initialize: function() {
          if (this._initialized) {
            console.log('⚠️ SESSION_COORDINATOR already initialized');
            return;
          }

          this._initializationAttempts++;
          if (this._initializationAttempts > this._maxInitializationAttempts) {
            console.warn('⚠️ Max initialization attempts reached. Skipping SESSION_COORDINATOR initialization.');
            return;
          }
          
          console.log('🔐 Initializing SESSION_COORDINATOR...');
          
          // Record initialization
          if (window.app && window.app._dependencyGraph) {
            executeSafely('SESSION_COORDINATOR.recordDependency', () => {
              window.app._dependencyGraph.sessionCoordinator = {
                initialized: true,
                initializationTime: new Date().toISOString(),
                config: this._config
              };
            });
          }
          
          // Ensure AUTH_STATE is initialized
          if (AUTH_STATE && AUTH_STATE.initialize && !AUTH_STATE._initialized) {
            executeSafely('AUTH_STATE.delayedInit', AUTH_STATE.initialize, AUTH_STATE);
          }
          
          // Setup event listeners
          executeSafely('SESSION_COORDINATOR.setupEventListeners', this.setupEventListeners, this);
          
          // Start session monitoring
          executeSafely('SESSION_COORDINATOR.startSessionMonitoring', this.startSessionMonitoring, this);
          
          // Setup cross-tab synchronization
          executeSafely('SESSION_COORDINATOR.setupCrossTabSync', this.setupCrossTabSync, this);
          
          // Setup activity monitoring
          executeSafely('SESSION_COORDINATOR.setupActivityMonitoring', this.setupActivityMonitoring, this);
          
          // Setup iframe coordination
          executeSafely('SESSION_COORDINATOR.setupIframeCoordination', this.setupIframeCoordination, this);
          
          // Check initial session state
          executeSafely('SESSION_COORDINATOR.checkInitialSessionState', this.checkInitialSessionState, this);
          
          this._initialized = true;
          console.log('✅ SESSION_COORDINATOR initialized');
        },
        
        // Setup event listeners (original method preserved)
        setupEventListeners: function() {
          console.log('🔐 Setting up session event listeners...');
          
          // Listen for login events
          window.addEventListener('moodchat-login-success', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLoginSuccess', () => {
              this.handleLoginSuccess(event.detail);
            });
          });
          
          window.addEventListener('moodchat-login-failed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLoginFailed', () => {
              this.handleLoginFailed(event.detail);
            });
          });
          
          // Listen for logout events
          window.addEventListener('moodchat-logout', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLogout', () => {
              this.handleLogout(event.detail);
            });
          });
          
          // Listen for token expiration
          window.addEventListener('moodchat-token-expired', (event) => {
            executeSafely('SESSION_COORDINATOR.handleTokenExpired', () => {
              this.handleTokenExpired(event.detail);
            });
          });
          
          // Listen for session invalidation
          window.addEventListener('moodchat-session-invalid', (event) => {
            executeSafely('SESSION_COORDINATOR.handleSessionInvalid', () => {
              this.handleSessionInvalid(event.detail);
            });
          });
          
          // Listen for session refresh
          window.addEventListener('moodchat-session-refreshed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleSessionRefreshed', () => {
              this.handleSessionRefreshed(event.detail);
            });
          });
          
          // Listen for auth state changes
          window.addEventListener('moodchat-auth-state-changed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleAuthStateChanged', () => {
              this.handleAuthStateChanged(event.detail);
            });
          });
          
          window.addEventListener('moodchat-auth-state-cleared', (event) => {
            executeSafely('SESSION_COORDINATOR.handleAuthStateCleared', () => {
              this.handleAuthStateCleared(event.detail);
            });
          });
          
          // Listen for storage sync events
          window.addEventListener('moodchat-token-synced', (event) => {
            console.log('🔄 Token synced from another tab');
            executeSafely('SESSION_COORDINATOR.broadcastSynced', () => {
              this.broadcastSessionChange('synced', AUTH_STATE ? AUTH_STATE.getUser() : null);
            });
          });
          
          window.addEventListener('moodchat-user-synced', (event) => {
            console.log('🔄 User synced from another tab');
            executeSafely('SESSION_COORDINATOR.updateUISynced', () => {
              this.updateUIForAuthenticatedState(event.detail.user);
            });
          });
          
          console.log('✅ Session event listeners setup complete');
        },
        
        // Handle login success (original method preserved)
        handleLoginSuccess: function(detail) {
          console.log('🔐 Login success:', detail.user?.uid || detail.user?.id);
          
          // Validate session data before proceeding
          const validation = validateSessionData(detail);
          if (!validation.isValid) {
            console.warn(`⚠️ Invalid login data: ${validation.reason}`);
            return;
          }
          
          // Update AUTH_STATE
          if (AUTH_STATE) {
            executeSafely('AUTH_STATE.setAuthState.login', () => {
              AUTH_STATE.setAuthState(
                detail.user,
                detail.token,
                detail.refreshToken,
                detail.expiresIn
              );
            });
          }
          
          // Update UI state
          executeSafely('SESSION_COORDINATOR.updateUILogin', () => {
            this.updateUIForAuthenticatedState(detail.user);
          });
          
          // Clear any existing timeouts or warnings
          executeSafely('SESSION_COORDINATOR.clearWarningsLogin', () => {
            this.clearSessionWarnings();
          });
          
          // Reset retry count
          this._retryCount = 0;
          
          // Start session monitoring
          executeSafely('SESSION_COORDINATOR.startMonitoringLogin', () => {
            this.startSessionMonitoring();
          });
          
          // Schedule token refresh if needed
          executeSafely('SESSION_COORDINATOR.scheduleRefreshLogin', () => {
            this.scheduleTokenRefresh();
          });
          
          // Notify other components
          executeSafely('SESSION_COORDINATOR.broadcastLogin', () => {
            this.broadcastSessionChange('authenticated', detail.user);
          });
          
          // Propagate to iframes
          executeSafely('SESSION_COORDINATOR.propagateLogin', () => {
            this.propagateSessionToIframes(detail.user, detail.token);
          });
          
          // Load dashboard content
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP.loadAppContent) {
            executeSafely('APP_BOOTSTRAP.loadAppContent', APP_BOOTSTRAP.loadAppContent);
          }
          
          console.log('✅ Login success fully processed');
        },
        
        // Handle login failed (original method preserved)
        handleLoginFailed: function(detail) {
          console.log('❌ Login failed:', detail.reason);
          
          // Clear any partial auth state
          if (AUTH_STATE) {
            executeSafely('AUTH_STATE.clearAuthState.loginFailed', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          // Show error to user
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.loginFailed', () => {
              window.showNotification(detail.message || 'Login failed. Please try again.', 'error');
            });
          }
          
          // Ensure auth UI is visible
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP.showAuthUI) {
            executeSafely('APP_BOOTSTRAP.showAuthUI', APP_BOOTSTRAP.showAuthUI);
          }
          
          // Notify components
          executeSafely('SESSION_COORDINATOR.broadcastLoginFailed', () => {
            this.broadcastSessionChange('login_failed', null);
          });
        },
        
        // Handle logout (original method preserved)
        handleLogout: function(detail) {
          console.log('👋 Logout:', detail.reason || 'User initiated');
          
          // Clear authentication state
          if (AUTH_STATE) {
            executeSafely('AUTH_STATE.clearAuthState.logout', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          // Clear UI state
          executeSafely('SESSION_COORDINATOR.updateUILogout', () => {
            this.updateUIForUnauthenticatedState();
          });
          
          // Stop session monitoring
          executeSafely('SESSION_COORDINATOR.stopMonitoringLogout', () => {
            this.stopSessionMonitoring();
          });
          
          // Clear any cached data
          if (typeof DATA_CACHE !== 'undefined') {
            executeSafely('DATA_CACHE.clearAll', DATA_CACHE.clearAll);
          }
          
          // Clear user settings
          if (typeof SETTINGS_SERVICE !== 'undefined' && window.currentUser) {
            executeSafely('SETTINGS_SERVICE.clearUserSettings', SETTINGS_SERVICE.clearUserSettings);
          }
          
          // Clear user isolation
          if (typeof USER_DATA_ISOLATION !== 'undefined' && window.currentUser) {
            executeSafely('USER_DATA_ISOLATION.clearUserData', () => {
              const userId = window.currentUser.uid || window.currentUser.id;
              USER_DATA_ISOLATION.clearUserData(userId);
            });
          }
          
          // Show auth UI
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP.showAuthUI) {
            executeSafely('APP_BOOTSTRAP.showAuthUI.logout', APP_BOOTSTRAP.showAuthUI);
          }
          
          // Notify other components
          executeSafely('SESSION_COORDINATOR.broadcastLogout', () => {
            this.broadcastSessionChange('logged_out', null);
          });
          
          // Propagate to iframes
          executeSafely('SESSION_COORDINATOR.propagateLogout', () => {
            this.propagateLogoutToIframes();
          });
          
          // Clear broadcast channel
          if (this._broadcastChannel) {
            executeSafely('SESSION_COORDINATOR.closeBroadcast', () => {
              this._broadcastChannel.close();
              this._broadcastChannel = null;
            });
          }
          
          // Show logout confirmation
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.logout', () => {
              window.showNotification('Logged out successfully', 'success');
            });
          }
          
          console.log('✅ Logout fully processed');
        },
        
        // Handle token expired (original method preserved)
        handleTokenExpired: function(detail) {
          console.log('⏰ Token expired:', detail.reason);
          
          // Try to refresh token using modular API
          executeSafely('SESSION_COORDINATOR.attemptTokenRefresh', () => {
            this.attemptTokenRefresh().then(refreshResult => {
              if (refreshResult.success) {
                console.log('✅ Token refreshed successfully');
                
                // Notify components
                executeSafely('SESSION_COORDINATOR.dispatchRefreshed', () => {
                  window.dispatchEvent(new CustomEvent('moodchat-session-refreshed', {
                    detail: { 
                      token: refreshResult.token,
                      timestamp: new Date().toISOString()
                    }
                  }));
                });
                
                // Show success notification
                if (typeof window.showNotification === 'function') {
                  executeSafely('showNotification.refreshSuccess', () => {
                    window.showNotification('Session refreshed', 'success', 3000);
                  });
                }
              } else {
                console.log('❌ Token refresh failed:', refreshResult.reason);
                
                // Show re-authentication warning
                executeSafely('SESSION_COORDINATOR.showReauthWarning', () => {
                  this.showReauthenticationWarning();
                });
                
                // Notify components
                executeSafely('SESSION_COORDINATOR.dispatchReauthRequired', () => {
                  window.dispatchEvent(new CustomEvent('moodchat-reauthentication-required', {
                    detail: {
                      reason: 'Token refresh failed',
                      timestamp: new Date().toISOString()
                    }
                  }));
                });
              }
            });
          });
        },
        
        // Handle session invalid (original method preserved)
        handleSessionInvalid: function(detail) {
          console.log('❌ Session invalid:', detail.reason);
          
          // Clear authentication state
          if (AUTH_STATE) {
            executeSafely('AUTH_STATE.clearAuthState.sessionInvalid', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          // Update UI
          executeSafely('SESSION_COORDINATOR.updateUISessionInvalid', () => {
            this.updateUIForUnauthenticatedState();
          });
          
          // Redirect to auth
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP.redirectToAuth) {
            executeSafely('APP_BOOTSTRAP.redirectToAuth', () => {
              APP_BOOTSTRAP.redirectToAuth(detail.reason);
            });
          }
          
          // Show notification
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.sessionInvalid', () => {
              window.showNotification('Your session has expired. Please log in again.', 'error', 10000);
            });
          }
        },
        
        // Handle session refreshed (original method preserved)
        handleSessionRefreshed: function(detail) {
          console.log('🔄 Session refreshed with new token');
          
          // Clear any session warnings
          executeSafely('SESSION_COORDINATOR.clearWarningsRefreshed', () => {
            this.clearSessionWarnings();
          });
          
          // Update token in auth state if available
          if (detail.token && AUTH_STATE && AUTH_STATE.getUser()) {
            executeSafely('AUTH_STATE.setAuthState.refreshed', () => {
              AUTH_STATE.setAuthState(AUTH_STATE.getUser(), detail.token);
            });
          }
          
          // Schedule next refresh
          executeSafely('SESSION_COORDINATOR.scheduleRefreshRefreshed', () => {
            this.scheduleTokenRefresh();
          });
          
          // Notify components
          executeSafely('SESSION_COORDINATOR.broadcastRefreshed', () => {
            this.broadcastSessionChange('refreshed', AUTH_STATE ? AUTH_STATE.getUser() : null);
          });
          
          // Propagate to iframes
          executeSafely('SESSION_COORDINATOR.propagateRefreshed', () => {
            this.propagateSessionToIframes(AUTH_STATE ? AUTH_STATE.getUser() : null, detail.token);
          });
        },
        
        // Handle auth state changed
        handleAuthStateChanged: function(detail) {
          console.log('🔄 Auth state changed');
          
          // Update window.currentUser for backward compatibility
          window.currentUser = detail.user;
          
          // Broadcast to iframes
          executeSafely('SESSION_COORDINATOR.propagateAuthChange', () => {
            this.propagateSessionToIframes(detail.user, AUTH_STATE ? AUTH_STATE.getToken() : null);
          });
        },
        
        // Handle auth state cleared
        handleAuthStateCleared: function() {
          console.log('🧹 Auth state cleared');
          
          // Update window.currentUser
          window.currentUser = null;
          
          // Broadcast to iframes
          executeSafely('SESSION_COORDINATOR.propagateAuthCleared', () => {
            this.propagateLogoutToIframes();
          });
        },
        
        // Attempt token refresh (original method preserved)
        attemptTokenRefresh: function() {
          console.log('🔄 Attempting token refresh...');
          
          return new Promise(async (resolve) => {
            // Increment retry count
            this._retryCount++;
            
            if (this._retryCount > this._config.maxRetryAttempts) {
              console.log('❌ Max retry attempts exceeded');
              resolve({
                success: false,
                reason: 'Maximum retry attempts exceeded'
              });
              return;
            }
            
            // Calculate backoff delay
            const backoffIndex = Math.min(this._retryCount - 1, this._config.retryBackoff.length - 1);
            const delay = this._config.retryBackoff[backoffIndex];
            
            console.log(`🔄 Retry attempt ${this._retryCount}/${this._config.maxRetryAttempts} with ${delay}ms delay`);
            
            // Apply backoff delay
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Try multiple refresh methods in order
            const refreshMethods = [
              this.refreshViaTokenValidation.bind(this),
              this.refreshViaApiCall.bind(this),
              this.refreshViaAuthState.bind(this)
            ];
            
            for (const method of refreshMethods) {
              try {
                const result = await method();
                if (result.success) {
                  // Reset retry count on success
                  this._retryCount = 0;
                  resolve(result);
                  return;
                }
              } catch (error) {
                console.log(`⚠️ Refresh method failed: ${error.message}`);
                // Continue to next method
              }
            }
            
            // All methods failed
            resolve({
              success: false,
              reason: 'All refresh methods failed'
            });
          });
        },
        
        // Refresh via TOKEN_VALIDATION (original method preserved)
        refreshViaTokenValidation: async function() {
          if (typeof TOKEN_VALIDATION === 'undefined' || !TOKEN_VALIDATION.refreshToken) {
            throw new Error('TOKEN_VALIDATION not available');
          }
          
          return await TOKEN_VALIDATION.refreshToken();
        },
        
        // Refresh via API call (original method preserved)
        refreshViaApiCall: async function() {
          if (!AUTH_STATE) {
            throw new Error('AUTH_STATE not available');
          }
          
          const token = AUTH_STATE.getToken();
          const refreshToken = AUTH_STATE.getRefreshToken();
          
          if (!token && !refreshToken) {
            throw new Error('No token to refresh');
          }
          
          if (!API_COORDINATION || !API_COORDINATION.isApiAvailable) {
            throw new Error('API not available');
          }
          
          const refreshPayload = refreshToken ? {
            refreshToken: refreshToken
          } : {
            token: token
          };
          
          const response = await API_COORDINATION.safeApiCall('/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(refreshPayload)
          });
          
          if (response && response.success && response.data && response.data.token) {
            return {
              success: true,
              token: response.data.token
            };
          } else {
            throw new Error(response?.message || 'Refresh failed');
          }
        },
        
        // Refresh via AUTH_STATE (original method preserved)
        refreshViaAuthState: async function() {
          if (typeof AUTH_STATE === 'undefined' || !AUTH_STATE.getToken()) {
            throw new Error('AUTH_STATE not available or no token');
          }
          
          // This is a fallback - just return the existing token
          return {
            success: true,
            token: AUTH_STATE.getToken()
          };
        },
        
        // Show re-authentication warning (original method preserved)
        showReauthenticationWarning: function() {
          const warningId = 'reauth-warning';
          
          // Remove existing warning
          const existing = document.getElementById(warningId);
          if (existing) existing.remove();
          
          // Create warning
          const warning = document.createElement('div');
          warning.id = warningId;
          warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f59e0b;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 9998;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideInUp 0.3s ease-out;
            max-width: 300px;
          `;
          
          warning.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Session Expiring Soon</div>
            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">
              Your session will expire soon. Please save your work.
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button id="reauth-now" style="
                flex: 1;
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
              ">Re-authenticate</button>
              <button id="reauth-dismiss" style="
                background: transparent;
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
              ">Dismiss</button>
            </div>
          `;
          
          document.body.appendChild(warning);
          
          // Add button handlers
          document.getElementById('reauth-now').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('moodchat-reauthentication-required', {
              detail: { reason: 'User requested re-authentication' }
            }));
            warning.remove();
          });
          
          document.getElementById('reauth-dismiss').addEventListener('click', () => {
            warning.style.animation = 'slideOutDown 0.3s ease-in';
            setTimeout(() => warning.remove(), 300);
          });
          
          // Auto-remove after 30 seconds
          setTimeout(() => {
            if (warning.parentNode) {
              warning.style.animation = 'slideOutDown 0.3s ease-in';
              setTimeout(() => warning.remove(), 300);
            }
          }, 30000);
          
          console.log('⚠️ Re-authentication warning shown');
        },
        
        // Clear session warnings (original method preserved)
        clearSessionWarnings: function() {
          const warnings = document.querySelectorAll('#reauth-warning, #session-warning');
          warnings.forEach(warning => {
            if (warning.parentNode) {
              warning.parentNode.removeChild(warning);
            }
          });
          
          // Clear timeouts
          if (this._warningTimeout) {
            clearTimeout(this._warningTimeout);
            this._warningTimeout = null;
          }
          
          if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            this._refreshTimeout = null;
          }
          
          console.log('🧹 Session warnings cleared');
        },
        
        // Update UI for authenticated state (original method preserved)
        updateUIForAuthenticatedState: function(user) {
          console.log('🎨 Updating UI for authenticated state');
          
          // Update current user reference
          window.currentUser = user;
          
          // Update global auth state if function exists
          if (typeof updateGlobalAuthState === 'function') {
            executeSafely('updateGlobalAuthState.authenticated', () => updateGlobalAuthState(user));
          }
          
          // Show dashboard container
          const dashboard = document.getElementById('dashboardContainer') || 
                           document.querySelector('.dashboard-container');
          if (dashboard) {
            dashboard.classList.remove('hidden');
          }
          
          // Hide auth container
          const auth = document.getElementById('authContainer') || 
                       document.querySelector('.auth-container');
          if (auth) {
            auth.classList.add('hidden');
          }
          
          // Update user display elements
          executeSafely('SESSION_COORDINATOR.updateUserDisplay', () => {
            this.updateUserDisplayElements(user);
          });
          
          console.log('✅ UI updated for authenticated state');
        },
        
        // Update UI for unauthenticated state (original method preserved)
        updateUIForUnauthenticatedState: function() {
          console.log('🎨 Updating UI for unauthenticated state');
          
          // Clear current user
          window.currentUser = null;
          
          // Update global auth state if function exists
          if (typeof updateGlobalAuthState === 'function') {
            executeSafely('updateGlobalAuthState.unauthenticated', () => updateGlobalAuthState(null));
          }
          
          // Show auth container
          const auth = document.getElementById('authContainer') || 
                       document.querySelector('.auth-container');
          if (auth) {
            auth.classList.remove('hidden');
          }
          
          // Hide dashboard container
          const dashboard = document.getElementById('dashboardContainer') || 
                           document.querySelector('.dashboard-container');
          if (dashboard) {
            dashboard.classList.add('hidden');
          }
          
          // Clear user display elements
          executeSafely('SESSION_COORDINATOR.clearUserDisplay', () => {
            this.clearUserDisplayElements();
          });
          
          console.log('✅ UI updated for unauthenticated state');
        },
        
        // Update user display elements (original method preserved)
        updateUserDisplayElements: function(user) {
          if (!user) return;
          
          // Update user avatar
          const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
          avatars.forEach(avatar => {
            if (user.photoURL) {
              avatar.src = user.photoURL;
              avatar.alt = user.displayName || 'User';
            }
          });
          
          // Update user name
          const names = document.querySelectorAll('.user-name, .display-name');
          names.forEach(name => {
            name.textContent = user.displayName || 'User';
          });
          
          // Update user email
          const emails = document.querySelectorAll('.user-email');
          emails.forEach(email => {
            email.textContent = user.email || '';
          });
        },
        
        // Clear user display elements (original method preserved)
        clearUserDisplayElements: function() {
          // Reset avatars
          const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
          avatars.forEach(avatar => {
            avatar.src = '';
            avatar.alt = 'User';
          });
          
          // Reset names
          const names = document.querySelectorAll('.user-name, .display-name');
          names.forEach(name => {
            name.textContent = 'User';
          });
          
          // Reset emails
          const emails = document.querySelectorAll('.user-email');
          emails.forEach(email => {
            email.textContent = '';
          });
        },
        
        // Start session monitoring (original method preserved)
        startSessionMonitoring: function() {
          if (this._monitoringInterval) {
            clearInterval(this._monitoringInterval);
          }
          
          // Check session every 5 minutes
          this._monitoringInterval = setInterval(() => {
            executeSafely('SESSION_COORDINATOR.checkSessionValidity', () => {
              this.checkSessionValidity();
            });
          }, this._config.monitoringInterval);
          
          // Check initially
          setTimeout(() => {
            executeSafely('SESSION_COORDINATOR.checkSessionValidityInitial', () => {
              this.checkSessionValidity();
            });
          }, 1000);
          
          console.log('✅ Session monitoring started');
        },
        
        // Stop session monitoring (original method preserved)
        stopSessionMonitoring: function() {
          if (this._monitoringInterval) {
            clearInterval(this._monitoringInterval);
            this._monitoringInterval = null;
          }
          
          // Clear other timeouts
          executeSafely('SESSION_COORDINATOR.clearWarningsStop', () => {
            this.clearSessionWarnings();
          });
          
          if (this._inactivityTimeout) {
            clearTimeout(this._inactivityTimeout);
            this._inactivityTimeout = null;
          }
          
          console.log('⏹️ Session monitoring stopped');
        },
        
        // Check session validity (original method preserved)
        checkSessionValidity: function() {
          if (!AUTH_STATE || !AUTH_STATE.hasToken()) {
            return;
          }
          
          // Check if authenticated
          if (!AUTH_STATE.isAuthenticated()) {
            console.log('🔐 Session not authenticated, attempting validation');
            
            // Try to validate
            if (typeof TOKEN_VALIDATION !== 'undefined') {
              executeSafely('TOKEN_VALIDATION.validateWithBackend.check', () => {
                TOKEN_VALIDATION.validateWithBackend().then(result => {
                  if (!result.valid) {
                    console.log('❌ Session validation failed');
                    executeSafely('SESSION_COORDINATOR.dispatchSessionInvalid', () => {
                      window.dispatchEvent(new CustomEvent('moodchat-session-invalid', {
                        detail: {
                          reason: 'Session validation failed',
                          timestamp: new Date().toISOString()
                        }
                      }));
                    });
                  }
                });
              });
            }
            return;
          }
          
          // Check token expiration
          const timeToExpiry = AUTH_STATE.getTimeToExpiry();
          
          if (timeToExpiry !== null) {
            // If expired, trigger token expired event
            if (timeToExpiry <= 0) {
              executeSafely('SESSION_COORDINATOR.dispatchTokenExpired', () => {
                window.dispatchEvent(new CustomEvent('moodchat-token-expired', {
                  detail: {
                    reason: 'Token has expired',
                    timestamp: new Date().toISOString()
                  }
                }));
              });
              return;
            }
            
            // If expiring soon (less than warning threshold), show warning
            if (timeToExpiry < this._config.warningThreshold) {
              executeSafely('SESSION_COORDINATOR.showExpiryWarning', () => {
                this.showSessionExpiryWarning(timeToExpiry);
              });
            }
            
            // If expiring soon (less than refresh threshold), schedule refresh
            if (timeToExpiry < this._config.refreshThreshold) {
              executeSafely('SESSION_COORDINATOR.scheduleTokenRefreshCheck', () => {
                this.scheduleTokenRefresh(timeToExpiry);
              });
            }
          }
        },
        
        // Show session expiry warning
        showSessionExpiryWarning: function(timeUntilExpiry) {
          const minutes = Math.ceil(timeUntilExpiry / (60 * 1000));
          
          // Only show warning every 5 minutes to avoid spamming
          const lastWarning = localStorage.getItem('last_session_warning');
          const now = Date.now();
          
          if (lastWarning && (now - parseInt(lastWarning)) < (5 * 60 * 1000)) {
            return;
          }
          
          localStorage.setItem('last_session_warning', now.toString());
          
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.expiryWarning', () => {
              window.showNotification(
                `Your session will expire in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
                'warning',
                10000
              );
            });
          }
          
          // Also show in-page warning if not already shown
          if (!this._warningTimeout) {
            this._warningTimeout = setTimeout(() => {
              executeSafely('SESSION_COORDINATOR.showReauthWarningDelayed', () => {
                this.showReauthenticationWarning();
              });
            }, Math.max(0, timeUntilExpiry - (5 * 60 * 1000))); // Show 5 minutes before expiry
          }
        },
        
        // Schedule token refresh
        scheduleTokenRefresh: function(timeUntilExpiry = null) {
          if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            this._refreshTimeout = null;
          }
          
          if (!AUTH_STATE) return;
          
          if (timeUntilExpiry === null) {
            timeUntilExpiry = AUTH_STATE.getTimeToExpiry();
            if (timeUntilExpiry === null) return;
          }
          
          // Schedule refresh at halfway point between now and expiry, but not too soon
          const refreshTime = Math.max(
            60000, // Minimum 1 minute
            Math.min(
              timeUntilExpiry - 60000, // At least 1 minute before expiry
              timeUntilExpiry / 2 // Halfway point
            )
          );
          
          console.log(`🔄 Token refresh scheduled in ${Math.round(refreshTime / 1000)} seconds`);
          
          this._refreshTimeout = setTimeout(() => {
            console.log('🔄 Executing scheduled token refresh');
            executeSafely('SESSION_COORDINATOR.attemptScheduledRefresh', () => {
              this.attemptTokenRefresh().then(result => {
                if (!result.success) {
                  console.log('❌ Scheduled refresh failed');
                  // Retry with exponential backoff
                  setTimeout(() => {
                    executeSafely('SESSION_COORDINATOR.retryScheduledRefresh', () => {
                      this.scheduleTokenRefresh(AUTH_STATE.getTimeToExpiry());
                    });
                  }, 30000); // Retry in 30 seconds
                }
              });
            });
          }, refreshTime);
        },
        
        // Setup activity monitoring
        setupActivityMonitoring: function() {
          this._lastActivity = Date.now();
          
          const resetActivityTimeout = () => {
            this._lastActivity = Date.now();
            
            if (this._inactivityTimeout) {
              clearTimeout(this._inactivityTimeout);
            }
            
            // Set timeout for inactivity
            this._inactivityTimeout = setTimeout(() => {
              executeSafely('SESSION_COORDINATOR.handleInactivity', () => {
                this.handleUserInactivity();
              });
            }, this._config.inactivityTimeout);
          };
          
          // Reset on user activity
          ['mousedown', 'keydown', 'touchstart', 'mousemove', 'click', 'scroll'].forEach(event => {
            window.addEventListener(event, resetActivityTimeout, { passive: true });
          });
          
          resetActivityTimeout(); // Start monitoring
          
          console.log('✅ Activity monitoring enabled');
        },
        
        // Handle user inactivity (original method preserved)
        handleUserInactivity: function() {
          console.log('⏰ User inactive for 30 minutes');
          
          // Show inactivity warning
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.inactivity', () => {
              window.showNotification('You have been inactive for 30 minutes. Session will expire soon.', 'warning', 10000);
            });
          }
          
          // Dispatch inactivity event
          executeSafely('SESSION_COORDINATOR.dispatchInactivity', () => {
            window.dispatchEvent(new CustomEvent('moodchat-user-inactivity', {
              detail: {
                duration: '30m',
                timestamp: new Date().toISOString()
              }
            }));
          });
        },
        
        // Setup cross-tab sync
        setupCrossTabSync: function() {
          // Use BroadcastChannel if available
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              this._broadcastChannel = new BroadcastChannel('moodchat_session');
              
              this._broadcastChannel.addEventListener('message', (event) => {
                executeSafely('SESSION_COORDINATOR.broadcastMessage', () => {
                  const data = event.data;
                  
                  if (data.type === 'session_change') {
                    console.log('🔄 BroadcastChannel session change:', data.detail.type);
                    
                    if (data.detail.type === 'logged_out') {
                      // Logout from another tab
                      this.handleLogout({ reason: 'Logged out from another tab' });
                    } else if (data.detail.type === 'authenticated' && data.detail.user) {
                      // Login from another tab
                      this.updateUIForAuthenticatedState(data.detail.user);
                    }
                  } else if (data.type === 'ping') {
                    // Respond to ping
                    try {
                      this._broadcastChannel.postMessage({
                        type: 'pong',
                        tabId: AUTH_STATE ? AUTH_STATE._tabId : 'unknown',
                        timestamp: new Date().toISOString()
                      });
                    } catch (error) {
                      console.log('⚠️ Failed to respond to ping:', error);
                    }
                  }
                });
              });
              
              // Send initial ping
              setTimeout(() => {
                if (this._broadcastChannel) {
                  executeSafely('SESSION_COORDINATOR.sendInitialPing', () => {
                    try {
                      this._broadcastChannel.postMessage({
                        type: 'ping',
                        tabId: AUTH_STATE ? AUTH_STATE._tabId : 'unknown',
                        timestamp: new Date().toISOString()
                      });
                    } catch (error) {
                      console.log('⚠️ Failed to send initial ping:', error);
                    }
                  });
                }
              }, 1000);
              
              console.log('✅ BroadcastChannel cross-tab sync enabled');
              
            } catch (error) {
              console.log('⚠️ BroadcastChannel not available:', error);
            }
          }
          
          // Fallback to localStorage events (already handled by AUTH_STATE)
          console.log('✅ Cross-tab synchronization setup complete');
        },
        
        // Setup iframe coordination with safety guards
        setupIframeCoordination: function() {
          console.log('🖼️ Setting up iframe coordination...');
          
          // Listen for iframe messages
          window.addEventListener('message', (event) => {
            executeSafely('SESSION_COORDINATOR.handleIframeMessage', () => {
              // Security check
              if (!this.isTrustedOrigin(event.origin)) {
                return;
              }
              
              const data = event.data;
              if (!data || !data.type) return;
              
              // Enhanced iframe ready handler with session propagation
              if (data.type === 'moodchat-iframe-ready') {
                this.handleIframeReady(event.source, data);
              }
              
              // Handle other iframe messages
              if (data.type === 'moodchat-iframe-auth-request') {
                this.handleIframeAuthRequest(event.source, data);
              }
              
              if (data.type === 'moodchat-iframe-data-request') {
                this.handleIframeDataRequest(event.source, data);
              }
            });
          });
          
          // Detect existing iframes
          executeSafely('SESSION_COORDINATOR.detectExistingIframes', () => {
            this.detectExistingIframes();
          });
          
          // Monitor for new iframes
          executeSafely('SESSION_COORDINATOR.monitorForNewIframes', () => {
            this.monitorForNewIframes();
          });
          
          console.log('✅ Iframe coordination setup complete');
        },
        
        // Enhanced iframe ready handler with session propagation (original method preserved)
        handleIframeReady: function(iframeWindow, data) {
          const iframeId = data.iframeId || data.sourceId;
          const pageKey = data.pageKey;
          
          console.log(`✅ Iframe ready: ${iframeId} (${pageKey || 'unknown page'})`);
          
          // Track handshake attempts
          const attempts = (this._iframeHandshakeAttempts.get(iframeId) || 0) + 1;
          this._iframeHandshakeAttempts.set(iframeId, attempts);
          
          if (attempts > SAFETY_GUARDS.iframeHandshakeMaxAttempts) {
            logThrottled('iframe-handshake', `Max handshake attempts (${attempts}) reached for iframe ${iframeId}. Ignoring.`);
            return;
          }
          
          // Store iframe reference
          this._iframes.set(iframeId, {
            id: iframeId,
            window: iframeWindow,
            pageKey: pageKey,
            ready: true,
            handshakeAttempts: attempts,
            lastCommunication: new Date().toISOString()
          });
          
          // CRITICAL: Send session data immediately
          executeSafely(`sendSessionDataToIframe.${iframeId}`, () => {
            this.sendSessionDataToIframe(iframeWindow, iframeId, pageKey);
          });
          
          // Process any queued messages
          executeSafely(`processQueuedMessages.${iframeId}`, () => {
            this.processQueuedMessages(iframeId);
          });
        },
        
        // Send comprehensive session data to iframe (original method preserved)
        sendSessionDataToIframe: function(iframeWindow, iframeId, pageKey) {
          // Prepare session data
          const sessionData = {
            type: 'moodchat-complete-session-data',
            auth: {
              isAuthenticated: AUTH_STATE ? AUTH_STATE.isAuthenticated() : false,
              user: AUTH_STATE ? AUTH_STATE.getUser() : null,
              validated: AUTH_STATE ? AUTH_STATE.isValidated() : false,
              token: AUTH_STATE && AUTH_STATE.getToken() ? '[REDACTED]' : null
            },
            network: {
              status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
              backendReachable: window.MoodChatConfig ? window.MoodChatConfig.backendReachable : null,
              isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
            },
            ui: typeof UI_ORCHESTRATOR !== 'undefined' ? UI_ORCHESTRATOR.getState() : null,
            bootstrap: typeof BOOTSTRAP_STATE !== 'undefined' ? BOOTSTRAP_STATE.getStatusReport() : null,
            pageInfo: pageKey && APP_CONFIG && APP_CONFIG.pages && APP_CONFIG.pages[pageKey] ? 
              APP_CONFIG.pages[pageKey] : { id: iframeId },
            timestamp: new Date().toISOString()
          };
          
          // Validate session data before sending
          const validation = validateSessionData(sessionData.auth);
          if (!validation.isValid) {
            console.warn(`⚠️ Invalid session data for iframe ${iframeId}: ${validation.reason}`);
            return;
          }
          
          // Send to iframe
          try {
            iframeWindow.postMessage(sessionData, '*');
            console.log(`📤 Session data sent to iframe: ${iframeId}`);
            
            // Record successful session propagation
            if (window.app && window.app._dependencyGraph) {
              executeSafely('recordIframePropagation', () => {
                window.app._dependencyGraph.iframeSessionPropagations = 
                  window.app._dependencyGraph.iframeSessionPropagations || [];
                window.app._dependencyGraph.iframeSessionPropagations.push({
                  iframeId: iframeId,
                  pageKey: pageKey,
                  timestamp: new Date().toISOString()
                });
              });
            }
          } catch (error) {
            console.error(`❌ Failed to send session data to iframe ${iframeId}:`, error);
          }
        },
        
        // Handle iframe auth request
        handleIframeAuthRequest: function(iframeWindow, data) {
          console.log('🔐 Iframe auth request');
          
          // Validate request data
          if (!data || !data.requestId) {
            console.warn('⚠️ Invalid iframe auth request: missing requestId');
            return;
          }
          
          // Send auth state to iframe
          try {
            iframeWindow.postMessage({
              type: 'moodchat-auth-state-response',
              requestId: data.requestId,
              data: {
                user: AUTH_STATE ? AUTH_STATE.getUser() : null,
                isAuthenticated: AUTH_STATE ? AUTH_STATE.isAuthenticated() : false,
                validated: AUTH_STATE ? AUTH_STATE.isValidated() : false,
                timestamp: new Date().toISOString()
              }
            }, '*');
          } catch (error) {
            console.error('❌ Failed to send auth response to iframe:', error);
          }
        },
        
        // Handle iframe data request
        handleIframeDataRequest: function(iframeWindow, data) {
          console.log('📊 Iframe data request:', data.key);
          
          // Validate request data
          if (!data || !data.requestId || !data.key) {
            console.warn('⚠️ Invalid iframe data request: missing requestId or key');
            return;
          }
          
          let responseData = null;
          
          // Get requested data
          switch(data.key) {
            case 'userProfile':
              responseData = AUTH_STATE ? AUTH_STATE.getUser() : null;
              break;
            case 'settings':
              responseData = typeof SETTINGS_SERVICE !== 'undefined' ? SETTINGS_SERVICE.current || {} : {};
              break;
            case 'networkStatus':
              responseData = {
                status: API_COORDINATION ? API_COORDINATION.getNetworkStatus() : 'unknown',
                backendReachable: window.MoodChatConfig ? window.MoodChatConfig.backendReachable : null,
                isOnline: API_COORDINATION ? API_COORDINATION.getNetworkStatus() === 'online' : false
              };
              break;
            default:
              // Try to get from cache
              if (typeof DATA_CACHE !== 'undefined') {
                responseData = DATA_CACHE.getInstant(data.key);
              }
          }
          
          // Send response
          try {
            iframeWindow.postMessage({
              type: 'moodchat-data-response',
              requestId: data.requestId,
              key: data.key,
              data: responseData,
              timestamp: new Date().toISOString()
            }, '*');
          } catch (error) {
            console.error('❌ Failed to send data response to iframe:', error);
          }
        },
        
        // Detect existing iframes
        detectExistingIframes: function() {
          document.querySelectorAll('iframe').forEach((iframe, index) => {
            const iframeId = iframe.id || `iframe-${index}-${Date.now()}`;
            
            if (!this._iframes.has(iframeId)) {
              this._iframes.set(iframeId, {
                id: iframeId,
                element: iframe,
                ready: false,
                window: null,
                lastCommunication: null
              });
              
              console.log(`🖼️ Existing iframe detected: ${iframeId}`);
            }
          });
        },
        
        // Monitor for new iframes
        monitorForNewIframes: function() {
          if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
              executeSafely('MutationObserver.iframes', () => {
                mutations.forEach((mutation) => {
                  if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeName === 'IFRAME') {
                        const iframeId = node.id || `iframe-new-${Date.now()}`;
                        
                        if (!this._iframes.has(iframeId)) {
                          this._iframes.set(iframeId, {
                            id: iframeId,
                            element: node,
                            ready: false,
                            window: null,
                            lastCommunication: null
                          });
                          
                          console.log(`🖼️ New iframe detected via MutationObserver: ${iframeId}`);
                          
                          // Try to send session data after a delay
                          setTimeout(() => {
                            executeSafely(`sendToNewIframe.${iframeId}`, () => {
                              const iframe = this._iframes.get(iframeId);
                              if (iframe && iframe.element.contentWindow) {
                                this.sendSessionDataToIframe(iframe.element.contentWindow, iframeId, null);
                              }
                            });
                          }, 1000);
                        }
                      }
                    });
                  }
                });
              });
            });
            
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
            
            console.log('✅ Iframe mutation observer enabled');
          }
        },
        
        // Check trusted origin
        isTrustedOrigin: function(origin) {
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
        },
        
        // Process queued messages for iframe
        processQueuedMessages: function(iframeId) {
          const queue = this._iframeMessageQueue.get(iframeId);
          if (queue) {
            console.log(`📤 Processing ${queue.length} queued messages for iframe ${iframeId}`);
            
            const iframe = this._iframes.get(iframeId);
            if (iframe && iframe.window) {
              queue.forEach(message => {
                try {
                  iframe.window.postMessage(message, '*');
                } catch (error) {
                  console.error(`❌ Failed to send queued message to iframe ${iframeId}:`, error);
                }
              });
            }
            
            this._iframeMessageQueue.delete(iframeId);
          }
        },
        
        // Queue message for iframe
        queueMessageForIframe: function(iframeId, message) {
          if (!this._iframeMessageQueue.has(iframeId)) {
            this._iframeMessageQueue.set(iframeId, []);
          }
          
          this._iframeMessageQueue.get(iframeId).push(message);
          console.log(`📝 Message queued for iframe ${iframeId}: ${message.type}`);
        },
        
        // Propagate session to all iframes
        propagateSessionToIframes: function(user, token) {
          console.log(`📤 Propagating session to ${this._iframes.size} iframes`);
          
          this._iframes.forEach((iframe, iframeId) => {
            if (iframe.ready && iframe.window) {
              executeSafely(`propagateToIframe.${iframeId}.ready`, () => {
                this.sendSessionDataToIframe(iframe.window, iframeId, iframe.pageKey);
              });
            } else if (iframe.element && iframe.element.contentWindow) {
              // Try even if not marked as ready
              executeSafely(`propagateToIframe.${iframeId}.element`, () => {
                try {
                  this.sendSessionDataToIframe(iframe.element.contentWindow, iframeId, iframe.pageKey);
                } catch (error) {
                  console.log(`⚠️ Failed to propagate to iframe ${iframeId}:`, error);
                }
              });
            }
          });
        },
        
        // Propagate logout to all iframes
        propagateLogoutToIframes: function() {
          console.log(`📤 Propagating logout to ${this._iframes.size} iframes`);
          
          const logoutMessage = {
            type: 'moodchat-session-change',
            data: {
              type: 'logged_out',
              user: null,
              isAuthenticated: false,
              timestamp: new Date().toISOString()
            }
          };
          
          this._iframes.forEach((iframe, iframeId) => {
            if (iframe.ready && iframe.window) {
              executeSafely(`propagateLogoutToIframe.${iframeId}`, () => {
                try {
                  iframe.window.postMessage(logoutMessage, '*');
                } catch (error) {
                  console.log(`⚠️ Failed to send logout to iframe ${iframeId}:`, error);
                }
              });
            }
          });
        },
        
        // Check initial session state
        checkInitialSessionState: function() {
          console.log('🔐 Checking initial session state...');
          
          // Wait a bit for everything to initialize
          setTimeout(() => {
            executeSafely('SESSION_COORDINATOR.checkInitialState', () => {
              const hasToken = AUTH_STATE ? AUTH_STATE.hasToken() : false;
              const isAuthenticated = AUTH_STATE ? AUTH_STATE.isAuthenticated() : false;
              const user = AUTH_STATE ? AUTH_STATE.getUser() : null;
              
              console.log('📋 Initial session state:', {
                hasToken: hasToken,
                isAuthenticated: isAuthenticated,
                hasUser: !!user,
                userValidated: AUTH_STATE ? AUTH_STATE.isValidated() : false
              });
              
              if (isAuthenticated && user) {
                console.log('✅ Session is valid, updating UI');
                this.updateUIForAuthenticatedState(user);
                this.broadcastSessionChange('authenticated', user);
                this.propagateSessionToIframes(user, AUTH_STATE ? AUTH_STATE.getToken() : null);
              } else if (hasToken && !isAuthenticated) {
                console.log('🔐 Token exists but not validated, attempting validation');
                
                // Try to validate the token
                if (typeof TOKEN_VALIDATION !== 'undefined') {
                  executeSafely('TOKEN_VALIDATION.validateOnStartup', () => {
                    TOKEN_VALIDATION.validateWithMultipleMethods().then(result => {
                      if (result.valid) {
                        console.log('✅ Token validated on startup');
                        this.updateUIForAuthenticatedState(result.user);
                        this.broadcastSessionChange('authenticated', result.user);
                        this.propagateSessionToIframes(result.user, AUTH_STATE ? AUTH_STATE.getToken() : null);
                      } else {
                        console.log('❌ Token validation failed on startup');
                        if (AUTH_STATE) {
                          AUTH_STATE.clearAuthState();
                        }
                        this.updateUIForUnauthenticatedState();
                      }
                    });
                  });
                }
              } else {
                console.log('👤 No valid session, showing auth UI');
                this.updateUIForUnauthenticatedState();
              }
            });
          }, 500);
        },
        
        // Broadcast session change
        broadcastSessionChange: function(type, user) {
          const event = new CustomEvent('moodchat-session-change', {
            detail: {
              type: type,
              user: user,
              timestamp: new Date().toISOString(),
              isAuthenticated: !!user
            }
          });
          
          executeSafely('SESSION_COORDINATOR.dispatchSessionChange', () => {
            window.dispatchEvent(event);
          });
          
          // Broadcast via BroadcastChannel if available
          if (this._broadcastChannel) {
            executeSafely('SESSION_COORDINATOR.broadcastChannelPost', () => {
              try {
                this._broadcastChannel.postMessage({
                  type: 'session_change',
                  detail: {
                    type: type,
                    user: user,
                    tabId: AUTH_STATE ? AUTH_STATE._tabId : 'unknown',
                    timestamp: new Date().toISOString()
                  }
                });
              } catch (error) {
                console.log('⚠️ Failed to broadcast via BroadcastChannel:', error);
              }
            });
          }
          
          console.log(`📢 Session change broadcasted: ${type}`);
        },
        
        // Register session event listener
        on: function(eventType, callback) {
          if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, []);
          }
          this._listeners.get(eventType).push(callback);
          
          window.addEventListener(`moodchat-${eventType}`, (event) => {
            executeSafely(`sessionListener.${eventType}`, () => {
              callback(event.detail);
            });
          });
        },
        
        // Get session status (original method preserved)
        getStatus: function() {
          return executeSafely('SESSION_COORDINATOR.getStatus', () => ({
            isAuthenticated: AUTH_STATE ? AUTH_STATE.isAuthenticated() : false,
            user: AUTH_STATE ? AUTH_STATE.getUser() : null,
            hasToken: AUTH_STATE ? AUTH_STATE.hasToken() : false,
            tokenExpiry: AUTH_STATE ? AUTH_STATE._tokenExpiry : null,
            timeToExpiry: AUTH_STATE ? AUTH_STATE.getTimeToExpiry() : null,
            validated: AUTH_STATE ? AUTH_STATE.isValidated() : false,
            lastValidation: AUTH_STATE ? AUTH_STATE.getLastValidation() : null,
            monitoringActive: !!this._monitoringInterval,
            iframeCount: this._iframes.size,
            retryCount: this._retryCount,
            lastActivity: this._lastActivity,
            initialized: this._initialized
          })) || {
            isAuthenticated: false,
            user: null,
            hasToken: false,
            tokenExpiry: null,
            timeToExpiry: null,
            validated: false,
            lastValidation: null,
            monitoringActive: false,
            iframeCount: this._iframes.size,
            retryCount: this._retryCount,
            lastActivity: this._lastActivity,
            initialized: this._initialized
          };
        },
        
        // Get comprehensive system status
        getSystemStatus: function() {
          return executeSafely('SESSION_COORDINATOR.getSystemStatus', () => ({
            authState: AUTH_STATE ? AUTH_STATE.getState() : { error: 'AUTH_STATE not available' },
            sessionCoordinator: {
              monitoringActive: !!this._monitoringInterval,
              inactivityTimeout: !!this._inactivityTimeout,
              refreshScheduled: !!this._refreshTimeout,
              warningActive: !!this._warningTimeout,
              retryCount: this._retryCount,
              iframeCount: this._iframes.size,
              queuedMessages: Array.from(this._iframeMessageQueue.keys()).length,
              broadcastChannel: !!this._broadcastChannel,
              initialized: this._initialized,
              config: this._config
            },
            safetyGuards: {
              blockedMethods: Array.from(SAFETY_GUARDS.blockedMethods),
              errorCounts: Object.fromEntries(SAFETY_GUARDS.errorCounts),
              maxRetryAttempts: SAFETY_GUARDS.maxRetryAttempts
            },
            timestamp: new Date().toISOString()
          })) || {
            authState: { error: 'AUTH_STATE not available' },
            sessionCoordinator: {
              monitoringActive: false,
              inactivityTimeout: false,
              refreshScheduled: false,
              warningActive: false,
              retryCount: this._retryCount,
              iframeCount: 0,
              queuedMessages: 0,
              broadcastChannel: false,
              initialized: false,
              config: this._config
            },
            safetyGuards: {
              blockedMethods: Array.from(SAFETY_GUARDS.blockedMethods),
              errorCounts: Object.fromEntries(SAFETY_GUARDS.errorCounts),
              maxRetryAttempts: SAFETY_GUARDS.maxRetryAttempts
            },
            timestamp: new Date().toISOString()
          };
        }
      };
      
      console.log('✅ SESSION_COORDINATOR created successfully');
    });
  };

  initializeSessionCoordinatorSafely();

  // ============================================================================
  // INTEGRATION HOOKS & BOOTSTRAP
  // ============================================================================

  // Auto-initialize SESSION_COORDINATOR when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📄 DOM ready, initializing session system');
      setTimeout(() => {
        executeSafely('SESSION_COORDINATOR.domInit', () => {
          if (window.SESSION_COORDINATOR && window.SESSION_COORDINATOR.initialize) {
            window.SESSION_COORDINATOR.initialize();
          }
        });
      }, 100);
    });
  } else {
    console.log('📄 DOM already ready, initializing session system');
    setTimeout(() => {
      executeSafely('SESSION_COORDINATOR.immediateInit', () => {
        if (window.SESSION_COORDINATOR && window.SESSION_COORDINATOR.initialize) {
          window.SESSION_COORDINATOR.initialize();
        }
      });
    }, 100);
  }

  // Export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      AUTH_STATE: window.AUTH_STATE,
      TOKEN_VALIDATION: window.TOKEN_VALIDATION,
      SESSION_COORDINATOR: window.SESSION_COORDINATOR
    };
  }

  console.log('✅ app.core.session.js loaded successfully with safety guards');
})();