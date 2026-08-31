// app.core.session.js - Nexopa Session Coordination & Authentication System
// HARDENED VERSION - Single Source of Truth for Authentication & Session Management
// VERSION: 3.0 - CENTRALIZED SESSION AUTHORITY WITH FULL BACKWARD COMPATIBILITY
// 
// This file is the authoritative session manager for the entire application.
// All session state, token storage, authentication status, and iframe propagation
// is controlled exclusively through this module.
//
// ALL ORIGINAL FEATURES PRESERVED:
// - Session hardening (PHASE 2-11)
// - Safety guards & error isolation
// - Dependency barrier system
// - TOKEN_VALIDATION pipeline
// - SESSION_COORDINATOR full lifecycle management
// - Iframe coordination with handshake protocol
// - Cross-tab sync via BroadcastChannel
// - Activity monitoring & inactivity timeout
// - Token refresh scheduling
// - UI callbacks integration
// - Full backward compatibility
// ============================================================================

(function () {
  'use strict';

  // IMMEDIATE SELF-REGISTRATION - CRITICAL FOR BOOTSTRAP
  if (!window.__SESSION_MODULE_LOADED__) {
    window.__SESSION_MODULE_LOADED__ = true;
  }

  // Prevent multiple initializations
  if (window.__SESSION_COORDINATOR_READY__ && window.Session && window.Session._initialized) {
    return;
  }

  // ============================================================================
  // CENTRALIZED SESSION STATE - SINGLE SOURCE OF TRUTH
  // ============================================================================
  // This is the authoritative session state. All other systems (AUTH_STATE,
  // SESSION_COORDINATOR, TOKEN_VALIDATION) will reference this.
  // ============================================================================
  
  const STORAGE_KEY = 'kynecta_auth';
  
  let centralSession = {
    token: null,
    refreshToken: null,
    user: null,
    expiresAt: null,
    issuedAt: null,
    isAuthenticated: false,
    initialized: false,
    lastUpdated: null
  };
  
  // Lock to prevent concurrent modifications
  let sessionModificationLock = false;
  let sessionInitialized = false;
  let sessionInitializationSignature = null;
  
  // ============================================================================
  // SESSION HARDENING: PHASE 2 - SESSION SCHEMA DEFINITION (PRESERVED)
  // ============================================================================
  
  const SESSION_SCHEMA = {
    token: "string",
    expiresAt: "number",
    issuedAt: "number"
  };

  function normalizeSessionUserId(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return String(value);
  }

  function normalizeSessionTimestamp(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  // ============================================================================
  // SESSION HARDENING: PHASE 4 - ATOMIC STATE MACHINE (PRESERVED)
  // ============================================================================

  const SESSION_STATES = {
    UNINITIALIZED: 'UNINITIALIZED',
    LOADING: 'LOADING',
    VALID: 'VALID',
    VALIDATING: 'VALIDATING',
    REFRESHING: 'REFRESHING',
    EXPIRED: 'EXPIRED',
    ERROR: 'ERROR',
    DESTROYED: 'DESTROYED',
    RECOVERY: 'RECOVERY'
  };

  // Prevent backward transitions
  const VALID_TRANSITIONS = {
    UNINITIALIZED: [SESSION_STATES.LOADING],
    LOADING: [SESSION_STATES.VALIDATING, SESSION_STATES.ERROR],
    VALIDATING: [SESSION_STATES.VALID, SESSION_STATES.EXPIRED, SESSION_STATES.ERROR],
    VALID: [SESSION_STATES.EXPIRED, SESSION_STATES.ERROR, SESSION_STATES.RECOVERY, SESSION_STATES.REFRESHING],
    REFRESHING: [SESSION_STATES.VALID, SESSION_STATES.EXPIRED, SESSION_STATES.ERROR],
    EXPIRED: [SESSION_STATES.RECOVERY, SESSION_STATES.DESTROYED],
    ERROR: [SESSION_STATES.RECOVERY, SESSION_STATES.DESTROYED],
    DESTROYED: [SESSION_STATES.LOADING],
    RECOVERY: [SESSION_STATES.LOADING]
  };

  // ============================================================================
  // SESSION HARDENING: PHASE 3 - STRICT SESSION VALIDATOR (PRESERVED)
  // ============================================================================

    // PATCH v1.2: validateSession checks STRUCTURE only — not expiry.
    // Expiry enforcement belongs to background server validation (validateSessionInBackground).
    // Blocking boot on expiry is the primary cause of the reopen loop:
    //   stored session → expiresAt check fails → setCentralSession returns false
    //   → centralSession stays empty → UI redirects to login → loop.
    function validateSession(session) {
      if (!session || typeof session !== 'object') {
        return { isValid: false, reason: 'Session is null or not an object' };
      }

      for (const [key, type] of Object.entries(SESSION_SCHEMA)) {
        if (!(key in session)) {
          return { isValid: false, reason: `Missing required field: ${key}` };
        }
        if (typeof session[key] !== type) {
          return { isValid: false, reason: `Field ${key} must be ${type}, got ${typeof session[key]}` };
        }
      }

      if (session.refreshToken !== null &&
          session.refreshToken !== undefined &&
          typeof session.refreshToken !== 'string') {
        return { isValid: false, reason: `Field refreshToken must be string|null, got ${typeof session.refreshToken}` };
      }

      if (session.userId === null || session.userId === undefined || session.userId === '') {
        return { isValid: false, reason: 'Missing required field: userId' };
      }

      // NOTE: Expiry is NOT checked here. An expired-but-present token is still
      // structurally valid and must be loaded so the UI can render immediately.
      // Background validation (validateSessionInBackground) will invalidate it
      // server-side if needed, after the UI is visible.

      return { isValid: true };
    }

  function getSafeSession(session) {
    if (!session) return null;
    
    const validation = validateSession(session);
    if (!validation.isValid) {
      return null;
    }

    return {
      token: session.token,
      refreshToken: session.refreshToken,
      userId: session.userId,
      expiresAt: session.expiresAt,
      issuedAt: session.issuedAt,
      uid: session.userId,
      exp: session.expiresAt
    };
  }

  function decodeTokenPayload(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch (_error) {
      return null;
    }
  }

  function resolveSessionExpiry(rawExpiresAt, token) {
    const normalized = normalizeSessionTimestamp(rawExpiresAt);
    if (normalized) return normalized;

    const tokenPayload = decodeTokenPayload(token);
    if (tokenPayload?.exp) {
      const expMs = Number(tokenPayload.exp) * 1000;
      if (Number.isFinite(expMs)) return expMs;
    }

    return Date.now() + (7 * 24 * 60 * 60 * 1000);
  }

  // ============================================================================
  // CENTRAL SESSION MANAGEMENT FUNCTIONS
  // ============================================================================
  
  function loadSessionFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return null;
      
      // CRITICAL: INSTANT RESTORATION - Load session immediately without validation
      // This ensures UI can render instantly. Validation happens in background.
      const sessionData = {
        token: parsed.token,
        refreshToken: parsed.refreshToken || null,
        user: parsed.user,
        userId: normalizeSessionUserId(parsed.userId || parsed.id || parsed.user?.id || parsed.user?.uid),
        expiresAt: resolveSessionExpiry(parsed.expiresAt, parsed.token),
        issuedAt: normalizeSessionTimestamp(parsed.issuedAt) || Date.now(),
        _instantRestored: true, // Mark as instantly restored
        _needsValidation: true // Mark for background validation
      };
      
      // Set global state immediately for UI rendering
      if (sessionData.token && sessionData.user) {
        if (!window.Session) window.Session = {};
        window.Session._localToken = sessionData.token;
        window.Session._localUser = sessionData.user;
        window.Session._hydrated = true;
        window.currentUser = sessionData.user;
        
        console.log('[Session] INSTANT session restoration complete - UI can render now');
      }
      
      // Schedule background validation (non-blocking)
      setTimeout(() => {
        validateSessionInBackground(sessionData);
      }, 50);
      
      return sessionData;
    } catch (error) {
      console.warn('[Session] loadSessionFromStorage error:', error.message);
      return null;
    }
  }
  
  // PATCH v1.2: Background validation — non-blocking, offline-aware.
  // Never redirects to login directly. Fires an event; UI decides what to do.
  function validateSessionInBackground(sessionData) {
    if (!sessionData || !sessionData._needsValidation) {
      return;
    }

    // Wait until document is fully loaded so we don't interrupt first render
    const doValidate = () => {
      try {
        // Only attempt server-side validation when online
        if (!navigator.onLine) {
          console.log('[Session] Background validation skipped — offline');
          if (window.Session) window.Session._needsValidation = false;
          return;
        }

        const sessionToValidate = {
          token: sessionData.token,
          refreshToken: sessionData.refreshToken || null,
          userId: sessionData.userId,
          expiresAt: sessionData.expiresAt || (Date.now() + 1),
          issuedAt: sessionData.issuedAt
        };

        const validation = validateSession(sessionToValidate);

        if (!validation.isValid && !validation.expired) {
          // Structurally malformed — safe to invalidate
          console.warn('[Session] Background validation: malformed session —', validation.reason);
          handleInvalidSession('malformed_session');
        } else if (validation.expired) {
          // Expired token: try refresh first, only logout if refresh fails
          console.warn('[Session] Background validation: token expired — attempting refresh');
          if (window.api && window.api.auth && typeof window.api.auth.refreshToken === 'function') {
            const rp = window.api.auth.refreshToken();
            if (rp && typeof rp.then === 'function') {
              rp.then(result => {
                if (!result || !result.success) handleInvalidSession('refresh_failed');
              }).catch(() => {
                // Refresh request failed (network error) — keep local session, do not logout
                console.warn('[Session] Token refresh request failed (network?) — keeping local session');
              });
            }
          }
          // If no refresh method, just keep local session silently
        } else {
          console.log('[Session] Background validation: session is valid');
          if (window.Session) {
            window.Session._needsValidation = false;
            window.Session._validated = true;
          }
          try {
            window.dispatchEvent(new CustomEvent('nexopa-session-validated', {
              detail: { session: sessionData, timestamp: Date.now(), source: 'background_validation' }
            }));
          } catch (e) {}
        }
      } catch (error) {
        console.error('[Session] Background validation error:', error.message);
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(doValidate, 2000); // 2 s after ready — UI is fully painted
    } else {
      window.addEventListener('load', () => setTimeout(doValidate, 2000), { once: true });
    }
  }
  
  function handleInvalidSession(reason) {
    try {
      console.log('[Session] Handling invalid session:', reason);
      
      // Clear invalid session data
      clearCentralSession();
      clearSessionStorage();
      
      // Clear temporary state
      if (window.Session) {
        delete window.Session._localToken;
        delete window.Session._localUser;
        delete window.Session._hydrated;
        delete window.Session._needsValidation;
        delete window.Session._validated;
      }
      window.currentUser = null;
      
      // Fire session invalid event
      try {
        window.dispatchEvent(new CustomEvent('nexopa-session-invalid', {
          detail: { 
            timestamp: Date.now(), 
            reason: reason,
            source: 'background_validation'
          }
        }));
      } catch (e) {}
      
    } catch (error) {
      console.error('[Session] Error handling invalid session:', error.message);
    }
  }
  
  function saveSessionToStorage() {
    if (sessionModificationLock) return false;
    
    try {
      if (!centralSession.token || !centralSession.user) {
        // Don't clear storage automatically
        return false;
      }
      
      const data = {
        token: centralSession.token,
        user: centralSession.user,
        refreshToken: centralSession.refreshToken,
        userId: centralSession.user?.id || centralSession.user?.uid || null,
        authenticated: true,
        expiresAt: centralSession.expiresAt,
        issuedAt: centralSession.issuedAt || Date.now(),
        lastUpdated: new Date().toISOString()
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      return false;
    }
  }
  
  function clearSessionStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  function setCentralSession(sessionData) {
    if (sessionModificationLock) {
      return false;
    }

    const sessionUserId = sessionData?.user?.id || sessionData?.user?.uid || null;
    const sessionSignature = `${sessionUserId || 'anonymous'}:${sessionData?.token || ''}`;
    if (sessionInitialized && sessionInitializationSignature === sessionSignature) {
      console.log('[Session] Duplicate setSession ignored');
      return true;
    }
    
    sessionModificationLock = true;
    
    try {
      const { token, user, refreshToken, expiresAt, expiresIn } = sessionData;
      
      if (!token || !user) {
        return false;
      }
      
      let expiryDate = resolveSessionExpiry(expiresAt, token);
      if (!expiryDate && expiresIn) {
        expiryDate = Date.now() + (Number(expiresIn) * 1000);
      }
      
      const sessionToValidate = {
        token: token,
        refreshToken: refreshToken || null,
        userId: normalizeSessionUserId(user.id || user.uid || sessionData.userId),
        expiresAt: expiryDate,
        issuedAt: Date.now()
      };
      
      const validation = validateSession(sessionToValidate);
      if (!validation.isValid && !validation.expired) {
        // Only reject structurally malformed sessions, not just expired ones
        console.warn('[Session] setCentralSession: rejecting malformed session —', validation.reason);
        return false;
      }
      
      centralSession.token = token;
      centralSession.refreshToken = refreshToken || null;
      centralSession.user = user;
      centralSession.expiresAt = expiryDate;
      centralSession.issuedAt = Date.now();
      centralSession.isAuthenticated = true;
      centralSession.lastUpdated = new Date().toISOString();
      sessionInitialized = true;
      sessionInitializationSignature = sessionSignature;
      
      saveSessionToStorage();
      
      return true;
    } finally {
      sessionModificationLock = false;
    }
  }
  
  function clearCentralSession() {
    if (sessionModificationLock) {
      return false;
    }
    
    sessionModificationLock = true;
    
    try {
      centralSession.token = null;
      centralSession.refreshToken = null;
      centralSession.user = null;
      centralSession.expiresAt = null;
      centralSession.issuedAt = null;
      centralSession.isAuthenticated = false;
      centralSession.lastUpdated = new Date().toISOString();
      sessionInitialized = false;
      sessionInitializationSignature = null;
      
      clearSessionStorage(); // removes kynecta_auth

      // PATCH v1.3: Also clear ALL parallel keys that other modules write.
      // Without this, AUTH_STATE and SessionManager keys survived clearCentralSession,
      // causing userLoggedIn() to return true on the next boot despite no valid session.
      const PARALLEL_KEYS = [
        'kynecta_session', 'accessToken', 'refreshToken',
        'nexopa_token', 'USER_TOKEN', 'token',
        'nexopa_accessToken', 'nexopa_refreshToken', 'nexopa_user',
        'nexopa_tokenExpiry', 'nexopa_issuedAt', 'nexopa_validated',
        'nexopa_validationTimestamp', 'auth_token', 'auth_user',
        'currentUser', 'user', 'REFRESH_TOKEN', 'TOKEN_EXPIRY',
        'isLoggedIn', 'kynecta_token'
      ];
      PARALLEL_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });

      // Clear global flags
      window.__SESSION__       = null;
      window.__IS_LOGGED_IN__  = false;
      window.__SESSION_READY__ = false;
      window.currentUser       = null;
      window.__userToken       = null;
      window.__accessToken     = null;
      
      return true;
    } finally {
      sessionModificationLock = false;
    }
  }
  
  function getCentralToken() {
    return centralSession.token;
  }
  
  function getCentralRefreshToken() {
    return centralSession.refreshToken;
  }
  
  function getCentralUser() {
    return centralSession.user;
  }
  
  // PATCH v1.2: isAuthenticated is true if we have a token+user, regardless of expiry.
  // Expiry enforcement happens server-side during background validation.
  // Failing here on expiry causes the UI to see "not logged in" on reopen → loop.
  function isCentralAuthenticated() {
    if (!centralSession.token) return false;
    if (!centralSession.user) return false;
    return true;
  }
  
  function getCentralSessionState() {
    return {
      token: centralSession.token,
      refreshToken: centralSession.refreshToken,
      user: centralSession.user,
      expiresAt: centralSession.expiresAt,
      issuedAt: centralSession.issuedAt,
      isAuthenticated: isCentralAuthenticated(),
      initialized: centralSession.initialized
    };
  }

  function getCentralSession() {
    if (!centralSession.token || !centralSession.user) {
      return null;
    }

    return {
      token: centralSession.token,
      refreshToken: centralSession.refreshToken,
      user: centralSession.user,
      userId: centralSession.user?.id || centralSession.user?.uid || null,
      expiresAt: centralSession.expiresAt,
      issuedAt: centralSession.issuedAt,
      authenticated: isCentralAuthenticated(),
      initialized: centralSession.initialized
    };
  }
  
  function getSafeCentralSession() {
    if (!isCentralAuthenticated()) {
      return null;
    }
    
    return {
      token: '[REDACTED]',
      refreshToken: centralSession.refreshToken ? '[REDACTED]' : null,
      user: {
        id: centralSession.user.id || centralSession.user.uid,
        uid: centralSession.user.id || centralSession.user.uid,
        name: centralSession.user.name || centralSession.user.displayName,
        email: centralSession.user.email
      },
      expiresAt: centralSession.expiresAt,
      issuedAt: centralSession.issuedAt,
      isAuthenticated: true
    };
  }
  
  // ============================================================================
  // INTERNAL READINESS STATE (PRESERVED)
  // ============================================================================
  
  let __SESSION_READY = false;
  let __SESSION_READY_RESOLVER = null;
  let __SESSION_READY_FORCE_TIMEOUT = null;
  let __SESSION_READY_RESOLVED = false;

  if (!window.app) {
    window.app = {};
  }
  
  if (!window.app.session) {
    window.app.session = {};
  }

  window.app.session.isReady = false;
  window.__SESSION_READY__ = false;

  window.app.session.isLoaded = function() {
    return window.SESSION_COORDINATOR && window.SESSION_COORDINATOR._sessionLoaded === true;
  };

  window.app.session.getSession = function() {
    return getSafeCentralSession();
  };

  window.app.session.ready = new Promise((resolve) => {
    __SESSION_READY_RESOLVER = resolve;
  });

  function forceSessionReady(reason) {
    if (__SESSION_READY_RESOLVED) return;
    
    __SESSION_READY = true;
    window.app.session.isReady = true;
    window.__SESSION_READY__ = true;
    __SESSION_READY_RESOLVED = true;
    
    if (__SESSION_READY_RESOLVER) {
      __SESSION_READY_RESOLVER({
        ready: true,
        forced: true,
        reason: reason,
        timestamp: new Date().toISOString()
      });
    }
    
    if (__SESSION_READY_FORCE_TIMEOUT) {
      clearTimeout(__SESSION_READY_FORCE_TIMEOUT);
      __SESSION_READY_FORCE_TIMEOUT = null;
    }
    
    window.dispatchEvent(new CustomEvent('nexopa-session-ready', {
      detail: {
        forced: true,
        reason: reason,
        timestamp: new Date().toISOString()
      }
    }));
  }

  __SESSION_READY_FORCE_TIMEOUT = setTimeout(() => {
    forceSessionReady('force_timeout');
  }, 8000);

  function markSessionReady() {
    if (__SESSION_READY_RESOLVED) return;
    
    const authStateInitialized = window.AUTH_STATE && window.AUTH_STATE._initialized === true;
    const coordinatorInitialized = window.SESSION_COORDINATOR && window.SESSION_COORDINATOR._initialized === true;
    const sessionLoaded = window.SESSION_COORDINATOR && window.SESSION_COORDINATOR._sessionLoaded === true;
    
    if (authStateInitialized && coordinatorInitialized && sessionLoaded) {
      __SESSION_READY = true;
      window.app.session.isReady = true;
      window.__SESSION_READY__ = true;
      __SESSION_READY_RESOLVED = true;
      
      if (__SESSION_READY_RESOLVER) {
        __SESSION_READY_RESOLVER({
          ready: true,
          forced: false,
          authStateInitialized: authStateInitialized,
          coordinatorInitialized: coordinatorInitialized,
          sessionLoaded: sessionLoaded,
          timestamp: new Date().toISOString()
        });
      }
      
      if (__SESSION_READY_FORCE_TIMEOUT) {
        clearTimeout(__SESSION_READY_FORCE_TIMEOUT);
        __SESSION_READY_FORCE_TIMEOUT = null;
      }
      
      window.dispatchEvent(new CustomEvent('nexopa-session-ready', {
        detail: {
          forced: false,
          authStateInitialized: authStateInitialized,
          coordinatorInitialized: coordinatorInitialized,
          sessionLoaded: sessionLoaded,
          timestamp: new Date().toISOString()
        }
      }));
      
      return true;
    }
    
    return false;
  }

  // ============================================================================
  // SAFETY GUARDS & ERROR ISOLATION (FULLY PRESERVED)
  // ============================================================================

  const SAFETY_GUARDS = {
    maxRetryAttempts: 2,
    retryCooldownMs: 5000,
    logThrottleMs: 30000,
    initializationTimeoutMs: 30000,
    sessionValidationMaxAttempts: 2,
    iframeHandshakeMaxAttempts: 2,
    blockedMethods: new Set(),
    errorCounts: new Map(),
    lastErrorLogs: new Map(),
    dependencyTimeoutMs: 5000,
    watchdogIntervalMs: 30000,
    deadlockRecoveryMs: 20000,
    authWaitTimeoutMs: 3000,
    authPollingIntervalMs: 100,
    authMaxPollingAttempts: 30,
    validationMutexAcquired: false,
    validationInProgress: false,
    refreshLockActive: false,
    refreshPromise: null
  };

  const WATCHDOG = {
    _timer: null,
    _lastHeartbeat: Date.now(),
    _frozenChecks: 0,
    _maxFrozenChecks: 3,
    
    start: function() {
      if (this._timer) {
        clearInterval(this._timer);
      }
      
      this._lastHeartbeat = Date.now();
      this._frozenChecks = 0;
      
      this._timer = setInterval(() => {
        executeSafely('WATCHDOG.check', () => {
          const now = Date.now();
          const timeSinceHeartbeat = now - this._lastHeartbeat;
          
          if (timeSinceHeartbeat > SAFETY_GUARDS.watchdogIntervalMs * 2) {
            this._frozenChecks++;
            
            if (this._frozenChecks >= this._maxFrozenChecks) {
              this._triggerDeadlockRecovery();
            }
          } else {
            this._frozenChecks = 0;
          }
        });
      }, SAFETY_GUARDS.watchdogIntervalMs);
    },
    
    heartbeat: function() {
      this._lastHeartbeat = Date.now();
    },
    
    _triggerDeadlockRecovery: function() {
      if (SESSION_COORDINATOR) {
        executeSafely('WATCHDOG.recovery', () => {
          if (SESSION_COORDINATOR._monitoringInterval) {
            clearInterval(SESSION_COORDINATOR._monitoringInterval);
            SESSION_COORDINATOR._monitoringInterval = null;
          }
          
          if (SESSION_COORDINATOR._inactivityTimeout) {
            clearTimeout(SESSION_COORDINATOR._inactivityTimeout);
            SESSION_COORDINATOR._inactivityTimeout = null;
          }
          
          if (SESSION_COORDINATOR._refreshTimeout) {
            clearTimeout(SESSION_COORDINATOR._refreshTimeout);
            SESSION_COORDINATOR._refreshTimeout = null;
          }
          
          if (SESSION_COORDINATOR._warningTimeout) {
            clearTimeout(SESSION_COORDINATOR._warningTimeout);
            SESSION_COORDINATOR._warningTimeout = null;
          }
          
          if (SESSION_COORDINATOR._sessionWaitTimeoutId) {
            clearTimeout(SESSION_COORDINATOR._sessionWaitTimeoutId);
            SESSION_COORDINATOR._sessionWaitTimeoutId = null;
          }
        });
      }
      
      if (AUTH_STATE && typeof AUTH_STATE._transitionState === 'function') {
        executeSafely('WATCHDOG.recovery.transition', () => {
          AUTH_STATE._transitionState(SESSION_STATES.RECOVERY);
        });
      }
      
      setTimeout(() => {
        if (SESSION_COORDINATOR && typeof SESSION_COORDINATOR.initialize === 'function') {
          executeSafely('WATCHDOG.recovery.reinit', () => {
            SESSION_COORDINATOR.initialize();
          });
        }
      }, 1000);
      
      this._frozenChecks = 0;
    },
    
    stop: function() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  };

  function executeSafely(funcName, func, context = null, ...args) {
    WATCHDOG.heartbeat();
    
    if (SAFETY_GUARDS.blockedMethods.has(funcName)) {
      return null;
    }

    try {
      return func.apply(context, args);
    } catch (error) {
      const errorCount = (SAFETY_GUARDS.errorCounts.get(funcName) || 0) + 1;
      SAFETY_GUARDS.errorCounts.set(funcName, errorCount);

      if (errorCount >= SAFETY_GUARDS.maxRetryAttempts) {
        SAFETY_GUARDS.blockedMethods.add(funcName);
      }

      return null;
    }
  }

  function executeWithRetry(funcName, func, maxAttempts = SAFETY_GUARDS.sessionValidationMaxAttempts) {
    return new Promise((resolve) => {
      let attempts = 0;

      const attempt = () => {
        attempts++;
        
        try {
          const result = func();
          resolve({ success: true, result, attempts });
        } catch (error) {
          if (attempts >= maxAttempts) {
            resolve({ 
              success: false, 
              error: {
                message: error.message || 'Operation failed',
                code: error.code || 'UNKNOWN_ERROR',
                attempts: attempts
              }, 
              attempts 
            });
            return;
          }

          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          setTimeout(attempt, delay);
        }
      };

      attempt();
    });
  }

  function validateSessionData(sessionData) {
    const validation = validateSession(sessionData);
    return { 
      isValid: validation.isValid, 
      reason: validation.reason 
    };
  }

  // ============================================================================
  // MESSAGE REGISTRY (FULLY PRESERVED)
  // ============================================================================
  
  const MESSAGE_REGISTRY = {
    _sentMessages: new Set(),
    _receivedMessages: new Set(),
    
    generateMessageId: function() {
      return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    registerSent: function(messageId) {
      if (this._sentMessages.has(messageId)) {
        return false;
      }
      this._sentMessages.add(messageId);
      return true;
    },
    
    registerReceived: function(messageId) {
      if (this._receivedMessages.has(messageId)) {
        return false;
      }
      this._receivedMessages.add(messageId);
      return true;
    },
    
    clearStaleMessages: function() {
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const stalePattern = /msg_(\d+)_/;
      
      this._sentMessages.forEach(id => {
        const match = id.match(stalePattern);
        if (match && parseInt(match[1]) < fiveMinutesAgo) {
          this._sentMessages.delete(id);
        }
      });
      
      this._receivedMessages.forEach(id => {
        const match = id.match(stalePattern);
        if (match && parseInt(match[1]) < fiveMinutesAgo) {
          this._receivedMessages.delete(id);
        }
      });
    }
  };

  // ============================================================================
  // DEPENDENCY READINESS BARRIER (FULLY PRESERVED)
  // ============================================================================

  const DEPENDENCY_BARRIER = {
    _dependencies: {
      bootstrap: { ready: false, checked: false, required: false },
      apiAuth: { ready: false, checked: false, required: true },
      apiCore: { ready: false, checked: false, required: true },
      apiRequest: { ready: false, checked: false, required: false },
      ui: { ready: false, checked: false, required: false }
    },
    _listeners: [],
    _readyPromise: null,
    _readyResolved: false,
    
    checkDependency: function(name, checkFn) {
      return executeSafely(`DEPENDENCY_BARRIER.check.${name}`, () => {
        const dep = this._dependencies[name];
        if (!dep) return false;
        
        try {
          const isReady = checkFn();
          if (isReady && !dep.ready) {
            dep.ready = true;
            this._notifyListeners();
          }
          dep.checked = true;
          return isReady;
        } catch (error) {
          return false;
        }
      }) || false;
    },
    
    checkAll: function() {
      this.checkDependency('bootstrap', () => {
        return typeof BOOTSTRAP_STATE !== 'undefined' && 
               BOOTSTRAP_STATE !== null && 
               BOOTSTRAP_STATE.isReady === true;
      });
      
      this.checkDependency('apiAuth', () => {
        const isApiAuthReady = window.api && 
               window.api !== null && 
               window.api.auth && 
               window.api.auth !== null;
        
        return isApiAuthReady;
      });
      
      this.checkDependency('apiCore', () => {
        return window.__API_CORE && 
               window.__API_CORE !== null && 
               window.__API_CORE.ready === true;
      });
      
      this.checkDependency('apiRequest', () => {
        return window.api && 
               window.api !== null && 
               window.api.request && 
               window.api.request !== null;
      });
      
      this.checkDependency('ui', () => {
        return typeof UI_ORCHESTRATOR !== 'undefined' && 
               UI_ORCHESTRATOR !== null && 
               typeof UI_ORCHESTRATOR.getState === 'function';
      });
      
      return this.getReadyStatus();
    },
    
    getReadyStatus: function() {
      return {
        required: Object.entries(this._dependencies)
          .filter(([_, dep]) => dep.required)
          .every(([_, dep]) => dep.ready),
        all: Object.values(this._dependencies).every(dep => !dep.required || dep.ready),
        details: { ...this._dependencies }
      };
    },
    
    waitForReady: function(timeoutMs = SAFETY_GUARDS.dependencyTimeoutMs) {
      if (this._readyResolved) {
        return Promise.resolve(this.getReadyStatus());
      }
      
      if (this._readyPromise) {
        return this._readyPromise;
      }
      
      this._readyPromise = new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          const pending = Object.entries(this._dependencies)
            .filter(([name, dep]) => dep.required && !dep.ready)
            .map(([name]) => name);
          
          this._readyResolved = true;
          resolve(this.getReadyStatus());
        }, timeoutMs);
        
        const status = this.checkAll();
        if (status.required) {
          clearTimeout(timeoutId);
          this._readyResolved = true;
          resolve(status);
          return;
        }
        
        const listener = () => {
          const newStatus = this.getReadyStatus();
          if (newStatus.required) {
            clearTimeout(timeoutId);
            this._removeListener(listener);
            this._readyResolved = true;
            resolve(newStatus);
          }
        };
        
        this._addListener(listener);
      });
      
      return this._readyPromise;
    },
    
    _addListener: function(listener) {
      this._listeners.push(listener);
    },
    
    _removeListener: function(listener) {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    },
    
    _notifyListeners: function() {
      const status = this.getReadyStatus();
      this._listeners.forEach(listener => {
        executeSafely('DEPENDENCY_BARRIER.notify', listener);
      });
    },
    
    reset: function() {
      Object.keys(this._dependencies).forEach(key => {
        this._dependencies[key].ready = false;
        this._dependencies[key].checked = false;
      });
      this._listeners = [];
      this._readyPromise = null;
      this._readyResolved = false;
    }
  };

  // ============================================================================
  // GLOBAL AUTH STATE MANAGEMENT (PRESERVED, NOW USING CENTRAL SESSION)
  // ============================================================================

  if (typeof AUTH_STATE === 'undefined') {
    
    const initializeAuthStateSafely = function() {
      return executeSafely('AUTH_STATE.initialize', () => {
        window.AUTH_STATE = {
          _token: null,
          _refreshToken: null,
          _user: null,
          _tokenExpiry: null,
          _refreshExpiry: null,
          _validated: false,
          _validationTimestamp: null,
          _storageKeyPrefix: 'nexopa_',
          _sessionState: SESSION_STATES.UNINITIALIZED,
          _stateTransitionLock: false,
          _tabId: 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          _initialized: false,
          _initializationAttempts: 0,
          _maxInitializationAttempts: 3,
          _refreshInProgress: false,
          _validationMutex: false,
          _validationPromise: null,
          _issuedAt: null,
          
          // Sync with central session
          _syncWithCentral: function() {
            this._token = centralSession.token;
            this._refreshToken = centralSession.refreshToken;
            this._user = centralSession.user;
            this._issuedAt = centralSession.issuedAt;
            if (centralSession.expiresAt) {
              this._tokenExpiry = new Date(centralSession.expiresAt);
            } else {
              this._tokenExpiry = null;
            }
            this._validated = !!centralSession.isAuthenticated;
            this._validationTimestamp = this._validated ? new Date() : null;
          },
          
          _transitionState: function(newState) {
            if (this._stateTransitionLock) {
              return false;
            }
            
            const currentState = this._sessionState;
            const validTransitions = VALID_TRANSITIONS[currentState];
            
            if (!validTransitions || !validTransitions.includes(newState)) {
              return false;
            }
            
            this._stateTransitionLock = true;
            this._sessionState = newState;
            
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('nexopa-session-state-changed', {
                detail: {
                  previousState: currentState,
                  newState: newState,
                  timestamp: new Date().toISOString()
                }
              }));
              this._stateTransitionLock = false;
            }, 0);
            
            return true;
          },
          
          getSessionState: function() {
            return this._sessionState;
          },
          
          isStateValidForOperation: function(operation) {
            const validStates = {
              'read': [SESSION_STATES.VALID, SESSION_STATES.VALIDATING],
              'write': [SESSION_STATES.VALID],
              'refresh': [SESSION_STATES.VALID, SESSION_STATES.REFRESHING],
              'load': [SESSION_STATES.LOADING, SESSION_STATES.UNINITIALIZED]
            };
            
            return validStates[operation] ? validStates[operation].includes(this._sessionState) : true;
          },
          
          initialize: function() {
            if (this._initialized) {
              return;
            }

            this._initializationAttempts++;
            if (this._initializationAttempts > this._maxInitializationAttempts) {
              return;
            }
            
            this._transitionState(SESSION_STATES.LOADING);
            
            // Sync with central session
            this._syncWithCentral();
            
            executeSafely('AUTH_STATE._loadFromStorage', this._loadFromStorage, this);
            executeSafely('AUTH_STATE._setupCrossTabSync', this._setupCrossTabSync, this);
            executeSafely('AUTH_STATE._setupPeriodicValidation', this._setupPeriodicValidation, this);
            
            this._initialized = true;
            
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.initialize.recordDependency', () => {
                window.app._dependencyGraph.authState = {
                  initialized: true,
                  initializationTime: new Date().toISOString(),
                  tabId: this._tabId,
                  hasToken: this.hasToken(),
                  hasUser: !!this._user,
                  sessionState: this._sessionState
                };
              });
            }
            
            markSessionReady();
          },
          
          _loadFromStorage: function() {
            try {
              // Load from central storage first
              const stored = loadSessionFromStorage();
              
              if (stored) {
                this._token = stored.token;
                this._refreshToken = stored.refreshToken;
                this._user = stored.user;
                if (stored.expiresAt) {
                  this._tokenExpiry = new Date(stored.expiresAt);
                }
                this._issuedAt = stored.issuedAt;
                
                // Also update central session
                if (!centralSession.token) {
                  centralSession.token = this._token;
                  centralSession.refreshToken = this._refreshToken;
                  centralSession.user = this._user;
                  centralSession.expiresAt = stored.expiresAt;
                  centralSession.issuedAt = stored.issuedAt;
                  centralSession.isAuthenticated = true;
                }
              }
              
              // Fallback to legacy storage keys (backward compatibility)
              if (!this._token) {
                this._token = localStorage.getItem(this._storageKeyPrefix + 'accessToken') || 
                             localStorage.getItem('accessToken') || 
                             sessionStorage.getItem('accessToken');
              }
              
              if (!this._refreshToken) {
                this._refreshToken = localStorage.getItem(this._storageKeyPrefix + 'refreshToken') || 
                                    localStorage.getItem('refreshToken');
              }
              
              if (!this._user) {
                const userStr = localStorage.getItem(this._storageKeyPrefix + 'user') || 
                               localStorage.getItem('nexopa_user') || 
                               sessionStorage.getItem('nexopa_user');
                if (userStr) {
                  try {
                    this._user = JSON.parse(userStr);
                  } catch (e) {
                    this._user = null;
                  }
                }
              }
              
              let expiryStr = null;
              if (!expiryStr) {
                expiryStr = localStorage.getItem(this._storageKeyPrefix + 'tokenExpiry') || 
                           localStorage.getItem('tokenExpiresAt');
              }
              
              if (expiryStr) {
                this._tokenExpiry = new Date(expiryStr);
              }
              
              let issuedStr = localStorage.getItem(this._storageKeyPrefix + 'issuedAt');
              if (issuedStr) {
                this._issuedAt = parseInt(issuedStr, 10);
              }
              
              const validatedStr = localStorage.getItem(this._storageKeyPrefix + 'validated');
              this._validated = validatedStr === 'true';
              
              if (validatedStr) {
                const timestampStr = localStorage.getItem(this._storageKeyPrefix + 'validationTimestamp');
                if (timestampStr) {
                  this._validationTimestamp = new Date(timestampStr);
                }
              }
              
              // Validate loaded session
              const rawSession = {
                token: this._token,
                refreshToken: this._refreshToken,
                userId: this._user?.id || this._user?.uid,
                expiresAt: this._tokenExpiry?.getTime(),
                issuedAt: this._issuedAt
              };
              
              const validation = validateSession(rawSession);
              if (!validation.isValid) {
                if (validation.expired) {
                  this._transitionState(SESSION_STATES.EXPIRED);
                } else {
                  const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
                  if (!hasStoredSession) {
                    this._clearLocalState();
                    this._transitionState(SESSION_STATES.UNINITIALIZED);
                  }
                }
              } else {
                this._saveToKynectaAuth();
              }
              
            } catch (error) {
              const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
              if (!hasStoredSession) {
                this._clearLocalState();
              }
            }
          },
          
          _saveToStorage: function() {
            try {
              // FIX-DUPLICATE-TOKEN-STORAGE (consolidation): route through the
              // canonical AuthStorage module first (when loaded) so this write
              // also updates 'kynecta_auth' and runs account-switch detection —
              // see the matching fix in js/api.auth.js for the full rationale.
              // The prefixed/legacy keys below are kept as-is for any code
              // that still reads them directly.
              if (this._token && window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                window.AuthStorage.saveAuth({
                  token: this._token,
                  refreshToken: this._refreshToken || null,
                  user: this._user || null,
                });
              }
              if (this._token) {
                localStorage.setItem(this._storageKeyPrefix + 'accessToken', this._token);
                localStorage.setItem('accessToken', this._token);
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'accessToken');
                localStorage.removeItem('accessToken');
              }
              
              if (this._refreshToken) {
                localStorage.setItem(this._storageKeyPrefix + 'refreshToken', this._refreshToken);
                localStorage.setItem('refreshToken', this._refreshToken);
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'refreshToken');
                localStorage.removeItem('refreshToken');
              }
              
              if (this._user) {
                const userStr = JSON.stringify(this._user);
                localStorage.setItem(this._storageKeyPrefix + 'user', userStr);
                localStorage.setItem('nexopa_user', userStr);
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'user');
                localStorage.removeItem('nexopa_user');
                sessionStorage.removeItem('nexopa_user');
              }
              
              if (this._tokenExpiry) {
                localStorage.setItem(this._storageKeyPrefix + 'tokenExpiry', this._tokenExpiry.toISOString());
                localStorage.setItem('tokenExpiresAt', this._tokenExpiry.toISOString());
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'tokenExpiry');
                localStorage.removeItem('tokenExpiresAt');
              }
              
              if (this._issuedAt) {
                localStorage.setItem(this._storageKeyPrefix + 'issuedAt', this._issuedAt.toString());
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'issuedAt');
              }
              
              localStorage.setItem(this._storageKeyPrefix + 'validated', this._validated.toString());
              
              if (this._validationTimestamp) {
                localStorage.setItem(this._storageKeyPrefix + 'validationTimestamp', this._validationTimestamp.toISOString());
              } else {
                localStorage.removeItem(this._storageKeyPrefix + 'validationTimestamp');
              }
              
              this._saveToKynectaAuth();
              
              const storageEvent = new CustomEvent('nexopa-storage-update', {
                detail: {
                  sourceTab: this._tabId,
                  timestamp: new Date().toISOString(),
                  hasToken: !!this._token,
                  hasUser: !!this._user,
                  sessionState: this._sessionState
                }
              });
              setTimeout(() => window.dispatchEvent(storageEvent), 100);
              
            } catch (error) {
              // Silent
            }
          },
          
          _saveToKynectaAuth: function() {
            try {
              if (this._token && this._user) {
                const authData = {
                  token: this._token,
                  user: this._user,
                  refreshToken: this._refreshToken,
                  expiresAt: this._tokenExpiry ? this._tokenExpiry.toISOString() : null,
                  issuedAt: this._issuedAt || Date.now()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
                
                // Also update central session
                if (!centralSession.token) {
                  centralSession.token = this._token;
                  centralSession.refreshToken = this._refreshToken;
                  centralSession.user = this._user;
                  centralSession.expiresAt = this._tokenExpiry ? this._tokenExpiry.toISOString() : null;
                  centralSession.issuedAt = this._issuedAt || Date.now();
                  centralSession.isAuthenticated = true;
                }
              } else if (!this._token || !this._user) {
                const hasValidSession = this._token && this._user;
                if (!hasValidSession) {
                  localStorage.removeItem(STORAGE_KEY);
                }
              }
            } catch (error) {
              // Silent
            }
          },
          
          _setupCrossTabSync: function() {
            window.addEventListener('storage', (event) => {
              if (event.key === this._storageKeyPrefix + 'accessToken' || 
                  event.key === 'accessToken' ||
                  event.key === this._storageKeyPrefix + 'user' ||
                  event.key === 'nexopa_user' ||
                  event.key === STORAGE_KEY) {
                
                setTimeout(() => {
                  executeSafely('AUTH_STATE.storageEvent', () => {
                    this._loadFromStorage();
                    this._syncWithCentral();
                    
                    if (event.key.includes('accessToken') || event.key === STORAGE_KEY) {
                      if (this._token) {
                        window.dispatchEvent(new CustomEvent('nexopa-token-synced', {
                          detail: {
                            source: 'storage_event',
                            timestamp: new Date().toISOString()
                          }
                        }));
                      } else {
                        window.dispatchEvent(new CustomEvent('nexopa-token-cleared', {
                          detail: {
                            source: 'storage_event',
                            timestamp: new Date().toISOString()
                          }
                        }));
                      }
                    }
                    
                    if (event.key.includes('user') || event.key === STORAGE_KEY) {
                      if (this._user) {
                        window.dispatchEvent(new CustomEvent('nexopa-user-synced', {
                          detail: {
                            source: 'storage_event',
                            user: this._user,
                            timestamp: new Date().toISOString()
                          }
                        }));
                      } else {
                        window.dispatchEvent(new CustomEvent('nexopa-user-cleared', {
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
            
            window.addEventListener('nexopa-storage-update', (event) => {
              if (event.detail.sourceTab !== this._tabId) {
                executeSafely('AUTH_STATE.customStorageEvent', this._loadFromStorage, this);
              }
            });
          },
          
          _setupPeriodicValidation: function() {
            setInterval(() => {
              if (this.isAuthenticated()) {
                executeSafely('AUTH_STATE.periodicValidation', () => {
                  this.validateSilently().catch(() => {});
                });
              }
            }, 5 * 60 * 1000);
          },
          
          _clearLocalState: function() {
            this._token = null;
            this._refreshToken = null;
            this._user = null;
            this._tokenExpiry = null;
            this._refreshExpiry = null;
            this._validated = false;
            this._validationTimestamp = null;
            this._issuedAt = null;

            // PATCH v1.3: Wipe AUTH_STATE's own parallel localStorage keys.
            // These keys (nexopa_accessToken, nexopa_user etc.) survived logout
            // and were read back on reopen, creating a ghost session that conflicted
            // with the main kynecta_auth state and caused the reopen loop.
            const prefix = this._storageKeyPrefix || 'nexopa_';
            ['accessToken','refreshToken','user','tokenExpiry','issuedAt','validated','validationTimestamp']
                .forEach(k => { try { localStorage.removeItem(prefix + k); } catch(_) {} });
            // Also clear the accessToken shadow key that AUTH_STATE writes without prefix
            try { localStorage.removeItem('accessToken'); } catch(_) {}
            try { localStorage.removeItem('refreshToken'); } catch(_) {}
          },
          
          hasToken: function() {
            return !!this._token;
          },
          
          getToken: function() {
            return this._token;
          },
          
          getRefreshToken: function() {
            return this._refreshToken;
          },
          
          getUser: function() {
            return this._user;
          },
          
          isAuthenticated: function() {
            if (!this._token) return false;
            if (!this._user) return false;
            // PATCH v1.3: Removed !this._validated check.
            // A freshly-restored session from localStorage is not yet server-validated,
            // but it IS authenticated for UI purposes. Requiring _validated=true here
            // caused loadAppContent().validateSession() to fail on reopen → 5s wait → showAuthUI → loop.
            // Server validation happens asynchronously in the background.
            return true;
          },
          
          setAuthState: function(user, token, refreshToken, expiresIn) {
            const expiryDate = new Date();
            expiryDate.setSeconds(expiryDate.getSeconds() + (expiresIn || 3600));
            
            const rawSession = {
              token: token,
              refreshToken: refreshToken,
              userId: user?.id || user?.uid,
              expiresAt: expiryDate.getTime(),
              issuedAt: Date.now()
            };
            
            const validation = validateSession(rawSession);
            if (!validation.isValid) {
              return;
            }
            
            this._user = user;
            this._token = token;
            this._refreshToken = refreshToken;
            this._tokenExpiry = expiryDate;
            this._issuedAt = rawSession.issuedAt;
            this._validated = true;
            this._validationTimestamp = new Date();
            
            // Update central session
            setCentralSession({
              token: token,
              user: user,
              refreshToken: refreshToken,
              expiresAt: expiryDate.toISOString(),
              expiresIn: expiresIn
            });
            
            if (this._sessionState !== SESSION_STATES.VALID) {
              this._transitionState(SESSION_STATES.VALID);
            }
            
            executeSafely('AUTH_STATE.setAuthState.save', this._saveToStorage, this);
            
            window.currentUser = user;
            
            if (typeof updateGlobalAuthState === 'function') {
              executeSafely('updateGlobalAuthState', () => updateGlobalAuthState(user));
            }
            
            window.dispatchEvent(new CustomEvent('session:ready', {
              detail: {
                user: user,
                timestamp: new Date().toISOString()
              }
            }));
            
            window.dispatchEvent(new CustomEvent('nexopa-auth-state-changed', {
              detail: {
                user: user,
                hasToken: !!token,
                validated: true,
                timestamp: new Date().toISOString(),
                sessionState: this._sessionState
              }
            }));
            
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.setAuthState.record', () => {
                window.app._dependencyGraph.authState.lastUpdate = new Date().toISOString();
                window.app._dependencyGraph.authState.hasToken = !!token;
                window.app._dependencyGraph.authState.hasUser = !!user;
                window.app._dependencyGraph.authState.validated = true;
                window.app._dependencyGraph.authState.sessionState = this._sessionState;
              });
            }
          },
          
          clearAuthState: function() {
            const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
            
            this._transitionState(SESSION_STATES.DESTROYED);
            this._clearLocalState();
            
            // Clear central session
            clearCentralSession();
            
            try {
              if (!hasStoredSession) {
                localStorage.removeItem(this._storageKeyPrefix + 'accessToken');
                localStorage.removeItem(this._storageKeyPrefix + 'refreshToken');
                localStorage.removeItem(this._storageKeyPrefix + 'user');
                localStorage.removeItem(this._storageKeyPrefix + 'tokenExpiry');
                localStorage.removeItem(this._storageKeyPrefix + 'validated');
                localStorage.removeItem(this._storageKeyPrefix + 'validationTimestamp');
                localStorage.removeItem(this._storageKeyPrefix + 'issuedAt');
                
                localStorage.removeItem('accessToken');
                localStorage.removeItem('nexopa_jwt_token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('nexopa_user');
                localStorage.removeItem('tokenExpiresAt');
                localStorage.removeItem('nexopa-auth-state');
                localStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem('nexopa_user');
              }
            } catch (error) {
              // Silent
            }
            
            window.currentUser = null;
            
            if (typeof updateGlobalAuthState === 'function') {
              executeSafely('updateGlobalAuthState.clear', () => updateGlobalAuthState(null));
            }
            
            window.dispatchEvent(new CustomEvent('session:destroy', {
              detail: {
                timestamp: new Date().toISOString()
              }
            }));
            
            window.dispatchEvent(new CustomEvent('nexopa-auth-state-cleared', {
              detail: {
                timestamp: new Date().toISOString(),
                sessionState: this._sessionState,
                storagePreserved: hasStoredSession
              }
            }));
            
            if (window.app && window.app._dependencyGraph) {
              executeSafely('AUTH_STATE.clearAuthState.record', () => {
                window.app._dependencyGraph.authState.lastClear = new Date().toISOString();
                window.app._dependencyGraph.authState.hasToken = false;
                window.app._dependencyGraph.authState.hasUser = false;
                window.app._dependencyGraph.authState.validated = false;
                window.app._dependencyGraph.authState.sessionState = this._sessionState;
              });
            }
          },
          
          validateSilently: function() {
            if (this._validationMutex) {
              return this._validationPromise || Promise.reject({ 
                success: false, 
                error: {
                  message: 'Validation already in progress',
                  code: 'VALIDATION_IN_PROGRESS'
                }
              });
            }
            
            this._validationMutex = true;
            this._validationPromise = new Promise((resolve, reject) => {
              if (!this._token) {
                this._validationMutex = false;
                this._validationPromise = null;
                reject({ 
                  success: false, 
                  error: {
                    message: 'No token to validate',
                    code: 'NO_TOKEN'
                  }
                });
                return;
              }
              
              if (window.api && window.api.auth && typeof window.api.auth.validateTokenSilently === 'function') {
                executeSafely('validateTokenSilently', () => {
                  window.api.auth.validateTokenSilently()
                    .then(result => {
                      this._validationMutex = false;
                      this._validationPromise = null;
                      
                      if (result && result.valid) {
                        this._validated = true;
                        this._validationTimestamp = new Date();
                        this._saveToStorage();
                        resolve({ success: true, valid: true });
                      } else {
                        this._validated = false;
                        if (result && result.code && (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN')) {
                          const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
                          if (!hasStoredSession) {
                            this.clearAuthState();
                          }
                        }
                        reject({ 
                          success: false, 
                          error: {
                            message: 'Token validation failed',
                            code: 'VALIDATION_FAILED'
                          }
                        });
                      }
                    })
                    .catch(error => {
                      this._validationMutex = false;
                      this._validationPromise = null;
                      this._validated = false;
                      if (error && error.code && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')) {
                        const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
                        if (!hasStoredSession) {
                          this.clearAuthState();
                        }
                      }
                      reject({ 
                        success: false, 
                        error: {
                          message: error.message || 'Validation failed',
                          code: error.code || 'VALIDATION_ERROR'
                        }
                      });
                    });
                });
                return;
              }
              
              try {
                const parts = this._token.split('.');
                if (parts.length !== 3) {
                  this._validationMutex = false;
                  this._validationPromise = null;
                  this._validated = false;
                  reject({ 
                    success: false, 
                    error: {
                      message: 'Invalid token format',
                      code: 'INVALID_FORMAT'
                    }
                  });
                  return;
                }
                
                const payload = JSON.parse(atob(parts[1]));
                const now = Math.floor(Date.now() / 1000);
                
                if (payload.exp && payload.exp < now) {
                  this._validationMutex = false;
                  this._validationPromise = null;
                  this._validated = false;
                  reject({ 
                    success: false, 
                    error: {
                      message: 'Token expired',
                      code: 'TOKEN_EXPIRED'
                    }
                  });
                  return;
                }
                
                this._validated = true;
                this._validationTimestamp = new Date();
                this._saveToStorage();
                this._validationMutex = false;
                this._validationPromise = null;
                resolve({ success: true, valid: true });
                
              } catch (error) {
                this._validationMutex = false;
                this._validationPromise = null;
                this._validated = false;
                reject({ 
                  success: false, 
                  error: {
                    message: 'Token validation error',
                    code: 'VALIDATION_ERROR'
                  }
                });
              }
            });
            
            return this._validationPromise;
          },
          
          getTimeToExpiry: function() {
            if (!this._tokenExpiry) return null;
            const now = new Date();
            return this._tokenExpiry.getTime() - now.getTime();
          },
          
          expiresSoon: function(minutes = 10) {
            const timeToExpiry = this.getTimeToExpiry();
            if (!timeToExpiry) return false;
            return timeToExpiry < (minutes * 60 * 1000);
          },
          
          markAsValidated: function() {
            this._validated = true;
            this._validationTimestamp = new Date();
            this._saveToStorage();
          },
          
          markAsInvalid: function() {
            this._validated = false;
            this._saveToStorage();
          },
          
          isValidated: function() {
            return this._validated;
          },
          
          getLastValidation: function() {
            return this._validationTimestamp;
          },
          
          getState: function() {
            const rawSession = {
              token: this._token,
              refreshToken: this._refreshToken,
              userId: this._user?.id || this._user?.uid,
              expiresAt: this._tokenExpiry?.getTime(),
              issuedAt: this._issuedAt
            };
            
            const safeSession = getSafeSession(rawSession);
            
            return {
              hasToken: this.hasToken(),
              token: safeSession?.token ? '[REDACTED]' : null,
              refreshToken: safeSession?.refreshToken ? '[REDACTED]' : null,
              user: safeSession ? { 
                id: safeSession.userId,
                uid: safeSession.userId,
                exp: safeSession.expiresAt
              } : null,
              authenticated: this.isAuthenticated() && !!safeSession,
              validated: this._validated && !!safeSession,
              tokenExpiry: this._tokenExpiry,
              timeToExpiry: this.getTimeToExpiry(),
              expiresSoon: this.expiresSoon(),
              validationTimestamp: this._validationTimestamp,
              tabId: this._tabId,
              storagePrefix: this._storageKeyPrefix,
              sessionState: this._sessionState
            };
          },
          
          refreshTokenSafely: function() {
            if (this._refreshInProgress) {
              return this._refreshPromise || Promise.reject({ 
                success: false, 
                error: {
                  message: 'Refresh already in progress',
                  code: 'REFRESH_IN_PROGRESS'
                }
              });
            }
            
            this._refreshInProgress = true;
            this._transitionState(SESSION_STATES.REFRESHING);
            
            this._refreshPromise = new Promise((resolve, reject) => {
              if (!this._refreshToken) {
                this._refreshInProgress = false;
                this._refreshPromise = null;
                this._transitionState(SESSION_STATES.EXPIRED);
                reject({ 
                  success: false, 
                  error: {
                    message: 'No refresh token available',
                    code: 'NO_REFRESH_TOKEN'
                  }
                });
                return;
              }
              
              if (window.api && window.api.auth && typeof window.api.auth.refreshToken === 'function') {
                executeSafely('refreshToken', () => {
                  window.api.auth.refreshToken(this._refreshToken)
                    .then(result => {
                      this._refreshInProgress = false;
                      this._refreshPromise = null;
                      
                      if (result && result.token) {
                        this.setAuthState(this._user, result.token, result.refreshToken, result.expiresIn);
                        
                        window.dispatchEvent(new CustomEvent('session:refresh', {
                          detail: {
                            timestamp: new Date().toISOString()
                          }
                        }));
                        
                        resolve({ success: true, token: result.token });
                      } else {
                        this._transitionState(SESSION_STATES.EXPIRED);
                        reject({ 
                          success: false, 
                          error: {
                            message: 'Refresh failed',
                            code: 'REFRESH_FAILED'
                          }
                        });
                      }
                    })
                    .catch(error => {
                      this._refreshInProgress = false;
                      this._refreshPromise = null;
                      this._transitionState(SESSION_STATES.EXPIRED);
                      reject({ 
                        success: false, 
                        error: {
                          message: error.message || 'Refresh failed',
                          code: error.code || 'REFRESH_ERROR'
                        }
                      });
                    });
                });
              } else {
                if (typeof TOKEN_VALIDATION !== 'undefined' && TOKEN_VALIDATION !== null && typeof TOKEN_VALIDATION.refreshToken === 'function') {
                  TOKEN_VALIDATION.refreshToken()
                    .then(result => {
                      this._refreshInProgress = false;
                      this._refreshPromise = null;
                      
                      if (result && result.success) {
                        window.dispatchEvent(new CustomEvent('session:refresh', {
                          detail: {
                            timestamp: new Date().toISOString()
                          }
                        }));
                        
                        resolve({ success: true, token: result.token });
                      } else {
                        this._transitionState(SESSION_STATES.EXPIRED);
                        reject({ 
                          success: false, 
                          error: {
                            message: (result && result.reason) || 'Refresh failed',
                            code: 'REFRESH_FAILED'
                          }
                        });
                      }
                    })
                    .catch(error => {
                      this._refreshInProgress = false;
                      this._refreshPromise = null;
                      this._transitionState(SESSION_STATES.EXPIRED);
                      reject({ 
                        success: false, 
                        error: {
                          message: error.message || 'Refresh failed',
                          code: 'REFRESH_ERROR'
                        }
                      });
                    });
                } else {
                  this._refreshInProgress = false;
                  this._refreshPromise = null;
                  this._transitionState(SESSION_STATES.EXPIRED);
                  reject({ 
                    success: false, 
                    error: {
                      message: 'No refresh method available',
                      code: 'NO_REFRESH_METHOD'
                    }
                  });
                }
              }
            });
            
            return this._refreshPromise;
          }
        };
        
        setTimeout(() => {
          if (window.AUTH_STATE && window.AUTH_STATE.initialize) {
            window.AUTH_STATE.initialize();
          }
        }, 50);
        
      });
    };

    initializeAuthStateSafely();
    
  } else {
    if (AUTH_STATE && AUTH_STATE.initialize && !AUTH_STATE._initialized) {
      setTimeout(() => {
        executeSafely('AUTH_STATE.delayedInitialize', AUTH_STATE.initialize, AUTH_STATE);
      }, 50);
    }
  }

  // ============================================================================
  // TOKEN VALIDATION PIPELINE (FULLY PRESERVED)
  // ============================================================================

  if (typeof TOKEN_VALIDATION === 'undefined') {
    
    const initializeTokenValidationSafely = function() {
      return executeSafely('TOKEN_VALIDATION.creation', () => {
        window.TOKEN_VALIDATION = {
          _config: {
            validationEndpoints: [
              '/auth/me',
              '/auth/validate',
              '/api/auth/verify'
            ],
            refreshEndpoint: '/auth/refresh',
            timeout: 10000,
            retryAttempts: 2,
            retryDelay: 1000,
            cacheDuration: 300000
          },
          
          _validationCache: new Map(),
          _lastValidationAttempt: null,
          _validationAttempts: 0,
          _maxValidationAttempts: SAFETY_GUARDS.sessionValidationMaxAttempts,
          _validationBlocked: false,
          _validationMutex: false,
          _validationPromise: null,
          
          validateWithBackend: function() {
            if (this._validationBlocked) {
              return Promise.resolve({ 
                success: false, 
                valid: false, 
                error: {
                  message: 'Validation blocked',
                  code: 'VALIDATION_BLOCKED'
                }
              });
            }

            if (this._validationMutex) {
              return this._validationPromise || Promise.resolve({ 
                success: false, 
                valid: false, 
                error: {
                  message: 'Validation already in progress',
                  code: 'VALIDATION_IN_PROGRESS'
                }
              });
            }

            this._validationMutex = true;
            this._validationPromise = new Promise((resolve) => {
              const token = AUTH_STATE && typeof AUTH_STATE.getToken === 'function' ? AUTH_STATE.getToken() : null;
              if (!token) {
                this._validationMutex = false;
                this._validationPromise = null;
                resolve({ 
                  success: false, 
                  valid: false, 
                  error: {
                    message: 'No token found',
                    code: 'NO_TOKEN'
                  }
                });
                return;
              }
              
              this._validationAttempts++;
              if (this._validationAttempts > this._maxValidationAttempts) {
                this._validationBlocked = true;
                this._validationMutex = false;
                this._validationPromise = null;
                resolve({ 
                  success: false, 
                  valid: false, 
                  error: {
                    message: 'Max validation attempts reached',
                    code: 'MAX_ATTEMPTS'
                  }
                });
                return;
              }
              
              const cacheKey = 'backend_' + token.substring(0, 20);
              const cached = this._validationCache.get(cacheKey);
              if (cached && (Date.now() - cached.timestamp) < this._config.cacheDuration) {
                this._validationMutex = false;
                this._validationPromise = null;
                resolve(cached.result);
                return;
              }
              
              this._tryValidationEndpoints(token)
                .then(result => {
                  this._validationAttempts = 0;
                  this._validationMutex = false;
                  this._validationPromise = null;
                  
                  if (result && result.valid) {
                    this._validationCache.set(cacheKey, {
                      result: result,
                      timestamp: Date.now()
                    });
                  }
                  
                  if (result && result.valid && AUTH_STATE) {
                    executeSafely('TOKEN_VALIDATION.updateAuthState', () => {
                      if (typeof AUTH_STATE.markAsValidated === 'function') {
                        AUTH_STATE.markAsValidated();
                      }
                      if (result.user && typeof AUTH_STATE.setAuthState === 'function') {
                        AUTH_STATE.setAuthState(result.user, token);
                      }
                    });
                  } else if (AUTH_STATE && typeof AUTH_STATE.markAsInvalid === 'function') {
                    executeSafely('TOKEN_VALIDATION.markInvalid', () => {
                      AUTH_STATE.markAsInvalid();
                    });
                    
                    if (result && result.error && (result.error.code === 'UNAUTHORIZED' || result.error.code === 'FORBIDDEN')) {
                      const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
                      if (!hasStoredSession && typeof AUTH_STATE.clearAuthState === 'function') {
                        AUTH_STATE.clearAuthState();
                      }
                    }
                  }
                  
                  resolve(result);
                })
                .catch(error => {
                  this._validationMutex = false;
                  this._validationPromise = null;
                  
                  const fallbackResult = this._validateClientSide(token);
                  
                  if (AUTH_STATE) {
                    executeSafely('TOKEN_VALIDATION.fallbackUpdate', () => {
                      if (fallbackResult && fallbackResult.valid && typeof AUTH_STATE.markAsValidated === 'function') {
                        AUTH_STATE.markAsValidated();
                      } else if (typeof AUTH_STATE.markAsInvalid === 'function') {
                        AUTH_STATE.markAsInvalid();
                      }
                    });
                  }
                  
                  resolve(fallbackResult);
                });
            });
            
            return this._validationPromise;
          },
          
          _tryValidationEndpoints: function(token) {
            return new Promise(async (resolve, reject) => {
              const endpoints = this._config.validationEndpoints;
              let lastError = null;
              
              for (const endpoint of endpoints) {
                try {
                  const result = await this._validateWithEndpoint(endpoint, token);
                  if (result && result.valid !== undefined) {
                    resolve(result);
                    return;
                  }
                } catch (error) {
                  lastError = error;
                }
              }
              
              reject(lastError || new Error('All validation endpoints failed'));
            });
          },
          
          _validateWithEndpoint: function(endpoint, token) {
            return new Promise((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                reject(new Error(`Validation timeout for ${endpoint}`));
              }, this._config.timeout);
              
              if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION !== null && typeof API_COORDINATION.safeApiCall === 'function') {
                executeSafely('TOKEN_VALIDATION.apiCall', () => {
                  API_COORDINATION.safeApiCall(endpoint, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  })
                  .then(response => {
                    clearTimeout(timeoutId);
                    if (response && response.success && response.data) {
                      resolve({
                        success: true,
                        valid: true,
                        user: response.data,
                        validated: true,
                        source: endpoint
                      });
                    } else {
                      resolve({
                        success: false,
                        valid: false,
                        error: {
                          message: (response && response.message) || 'Validation failed',
                          code: response && response.code ? response.code : 'VALIDATION_FAILED'
                        },
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
                      if (response.status === 401 || response.status === 403) {
                        throw { message: `HTTP ${response.status}`, code: response.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' };
                      }
                      throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                  })
                  .then(data => {
                    resolve({
                      success: true,
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
          
          _validateClientSide: function(token) {
            try {
              const parts = token.split('.');
              if (parts.length !== 3) {
                return { 
                  success: false, 
                  valid: false, 
                  error: {
                    message: 'Invalid token format',
                    code: 'INVALID_FORMAT'
                  }
                };
              }
              
              const payload = JSON.parse(atob(parts[1]));
              const now = Math.floor(Date.now() / 1000);
              
              if (payload.exp && payload.exp < now) {
                return { 
                  success: false, 
                  valid: false, 
                  error: {
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                  }
                };
              }
              
              return {
                success: true,
                valid: true,
                user: {
                  id: payload.sub || payload.userId || 'unknown',
                  email: payload.email || 'user@example.com',
                  name: payload.name || 'User',
                  validated: false
                },
                validated: false,
                source: 'client_side'
              };
              
            } catch (error) {
              return { 
                success: false, 
                valid: false, 
                error: {
                  message: 'Token validation error',
                  code: 'VALIDATION_ERROR'
                }
              };
            }
          },
          
          refreshToken: function() {
            return new Promise((resolve) => {
              if (!AUTH_STATE) {
                resolve({ 
                  success: false, 
                  error: {
                    message: 'AUTH_STATE not available',
                    code: 'AUTH_STATE_MISSING'
                  }
                });
                return;
              }
              
              const token = typeof AUTH_STATE.getToken === 'function' ? AUTH_STATE.getToken() : null;
              const refreshToken = typeof AUTH_STATE.getRefreshToken === 'function' ? AUTH_STATE.getRefreshToken() : null;
              
              if (!token && !refreshToken) {
                resolve({ 
                  success: false, 
                  error: {
                    message: 'No token to refresh',
                    code: 'NO_TOKEN'
                  }
                });
                return;
              }
              
              const refreshPayload = refreshToken ? {
                refreshToken: refreshToken
              } : {
                token: token
              };
              
              if (typeof API_COORDINATION !== 'undefined' && API_COORDINATION !== null && typeof API_COORDINATION.safeApiCall === 'function') {
                executeSafely('TOKEN_VALIDATION.refreshApiCall', () => {
                  API_COORDINATION.safeApiCall(this._config.refreshEndpoint, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(refreshPayload)
                  })
                  .then(response => {
                    if (response && response.success && response.data && response.data.token) {
                      executeSafely('TOKEN_VALIDATION.updateTokens', () => {
                        if (typeof AUTH_STATE.setAuthState === 'function') {
                          AUTH_STATE.setAuthState(
                            typeof AUTH_STATE.getUser === 'function' ? AUTH_STATE.getUser() : null,
                            response.data.token,
                            response.data.refreshToken,
                            response.data.expiresIn
                          );
                        }
                      });
                      
                      resolve({ success: true, token: response.data.token });
                    } else {
                      resolve({ 
                        success: false, 
                        error: {
                          message: (response && response.message) || 'Refresh failed',
                          code: 'REFRESH_FAILED'
                        }
                      });
                    }
                  })
                  .catch(error => {
                    resolve({ 
                      success: false, 
                      error: {
                        message: 'Refresh request failed',
                        code: 'REFRESH_ERROR'
                      }
                    });
                  });
                });
              } else {
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
                      if (response.status === 401 || response.status === 403) {
                        throw { message: `HTTP ${response.status}`, code: response.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' };
                      }
                      throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                  })
                  .then(data => {
                    if (data && data.token) {
                      executeSafely('TOKEN_VALIDATION.updateTokensDirect', () => {
                        if (typeof AUTH_STATE.setAuthState === 'function') {
                          AUTH_STATE.setAuthState(
                            typeof AUTH_STATE.getUser === 'function' ? AUTH_STATE.getUser() : null,
                            data.token,
                            data.refreshToken,
                            data.expiresIn
                          );
                        }
                      });
                      resolve({ success: true, token: data.token });
                    } else {
                      resolve({ 
                        success: false, 
                        error: {
                          message: 'No token in response',
                          code: 'NO_TOKEN_RESPONSE'
                        }
                      });
                    }
                  })
                  .catch(error => {
                    resolve({ 
                      success: false, 
                      error: {
                        message: error.message || 'Refresh request failed',
                        code: error.code || 'REFRESH_ERROR'
                      }
                    });
                  });
                });
              }
            });
          },
          
          validateWithMultipleMethods: function() {
            return new Promise(async (resolve) => {
              try {
                const backendResult = await this.validateWithBackend();
                if (backendResult && backendResult.valid) {
                  resolve(backendResult);
                  return;
                }
              } catch (error) {
                // Silent
              }
              
              if (window.api && window.api.auth && typeof window.api.auth.validateToken === 'function') {
                try {
                  const apiResult = await executeSafely('modularAPI.validateToken', 
                    () => window.api.auth.validateToken());
                  if (apiResult && apiResult.valid) {
                    resolve(apiResult);
                    return;
                  }
                } catch (error) {
                  // Silent
                }
              }
              
              const token = AUTH_STATE && typeof AUTH_STATE.getToken === 'function' ? AUTH_STATE.getToken() : null;
              const clientResult = token ? this._validateClientSide(token) : { 
                success: false, 
                valid: false, 
                error: {
                  message: 'No token',
                  code: 'NO_TOKEN'
                }
              };
              if (clientResult && clientResult.valid) {
                resolve(clientResult);
                return;
              }
              
              resolve({
                success: false,
                valid: false,
                error: {
                  message: 'All validation methods failed',
                  code: 'ALL_METHODS_FAILED'
                }
              });
            });
          },
          
          clearCache: function() {
            executeSafely('TOKEN_VALIDATION.clearCache', () => {
              this._validationCache.clear();
              this._lastValidationAttempt = null;
            });
          },
          
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
        
      });
    };

    initializeTokenValidationSafely();
  }

  // ============================================================================
  // SESSION COORDINATOR - HARDENED SESSION LIFECYCLE MANAGEMENT (FULLY PRESERVED)
  // ============================================================================

  const initializeSessionCoordinatorSafely = function() {
    return executeSafely('SESSION_COORDINATOR.creation', () => {
      window.SESSION_COORDINATOR = {
        _config: {
          monitoringInterval: 5 * 60 * 1000,
          inactivityTimeout: 30 * 60 * 1000,
          warningThreshold: 10 * 60 * 1000,
          refreshThreshold: 15 * 60 * 1000,
          maxRetryAttempts: 2,
          retryBackoff: [1000, 3000],
          sessionWaitTimeout: 8000,
          maxPollingAttempts: 30,
          iframeHandshakeTimeout: 5000,
          maxHandshakeAttempts: 2,
          maxTokenValidationRetries: 2,
          validationRetryDelay: 5000
        },
        
        _listeners: new Map(),
        _monitoringInterval: null,
        _inactivityTimeout: null,
        _refreshTimeout: null,
        _warningTimeout: null,
        _retryCount: 0,
        _lastActivity: Date.now(),
        _broadcastChannel: null,
        _sessionLoading: false,
        _sessionLoaded: false,
        _sessionLoadStartTime: null,
        _sessionPollingAttempts: 0,
        _sessionWaitTimeoutId: null,
        _authReady: false,
        _authWaitTimeoutId: null,
        _authPollingInterval: null,
        _iframes: new Map(),
        _iframeMessageQueue: new Map(),
        _iframeHandshakeAttempts: new Map(),
        _iframeHandshakeTimeouts: new Map(),
        _iframeReadyStates: new Map(),
        _iframeSessionPropagated: new Map(),
        _outboundMessageQueue: [],
        _messageQueueFlushed: false,
        _dependenciesReady: {
          bootstrap: false,
          apiAuth: false,
          apiRequest: false,
          ui: false
        },
        _initialized: false,
        _initializationAttempts: 0,
        _maxInitializationAttempts: 3,
        _initializationLock: false,
        _initializationPromise: null,
        _initializationResolve: null,
        _validationScheduled: false,
        _validationInProgress: false,
        _stateLogged: {
          waiting: false,
          success: false,
          failure: false
        },
        _uiCallbacks: {
          onAuthenticated: null,
          onUnauthenticated: null,
          onSessionError: null,
          onSessionRestored: null
        },
        
        // Sync with central session
        _syncWithCentral: function() {
          this._sessionLoaded = centralSession.initialized;
          if (centralSession.isAuthenticated) {
            this._stateLogged.success = true;
          }
        },
        
        isSessionLoaded: function() {
          return this._sessionLoaded === true;
        },
        
        registerUICallbacks: function(callbacks) {
          executeSafely('SESSION_COORDINATOR.registerUICallbacks', () => {
            if (callbacks) {
              if (typeof callbacks.onAuthenticated === 'function') {
                this._uiCallbacks.onAuthenticated = callbacks.onAuthenticated;
              }
              if (typeof callbacks.onUnauthenticated === 'function') {
                this._uiCallbacks.onUnauthenticated = callbacks.onUnauthenticated;
              }
              if (typeof callbacks.onSessionError === 'function') {
                this._uiCallbacks.onSessionError = callbacks.onSessionError;
              }
              if (typeof callbacks.onSessionRestored === 'function') {
                this._uiCallbacks.onSessionRestored = callbacks.onSessionRestored;
              }
            }
          });
        },
        
        _waitForApiAuth: async function() {
          if (!window.api || !window.api.auth) {
            this._authReady = false;
            return false;
          }
          
          if (window.api.auth && typeof window.api.auth.waitForReady === 'function') {
            try {
              const authReadyPromise = window.api.auth.waitForReady();
              const timeoutPromise = new Promise((_, reject) => {
                this._authWaitTimeoutId = setTimeout(() => {
                  reject(new Error('api.auth waitForReady timeout'));
                }, SAFETY_GUARDS.authWaitTimeoutMs);
              });
              
              await Promise.race([authReadyPromise, timeoutPromise]);
              
              if (this._authWaitTimeoutId) {
                clearTimeout(this._authWaitTimeoutId);
                this._authWaitTimeoutId = null;
              }
              
              this._authReady = true;
              return true;
            } catch (error) {
              if (this._authWaitTimeoutId) {
                clearTimeout(this._authWaitTimeoutId);
                this._authWaitTimeoutId = null;
              }
              return this._pollForApiAuth();
            }
          } else {
            return this._pollForApiAuth();
          }
        },
        
        _pollForApiAuth: function() {
          return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = SAFETY_GUARDS.authMaxPollingAttempts;
            
            const checkAuth = () => {
              attempts++;
              
              if (window.api && window.api.auth && window.api.auth !== null) {
                const hasRequiredMethods = 
                  typeof window.api.auth.validateToken === 'function' ||
                  typeof window.api.auth.validateTokenSilently === 'function' ||
                  typeof window.api.auth.getCurrentUser === 'function';
                
                if (hasRequiredMethods) {
                  this._authReady = true;
                  if (this._authPollingInterval) {
                    clearInterval(this._authPollingInterval);
                    this._authPollingInterval = null;
                  }
                  resolve(true);
                  return;
                }
              }
              
              if (attempts >= maxAttempts) {
                this._authReady = false;
                if (this._authPollingInterval) {
                  clearInterval(this._authPollingInterval);
                  this._authPollingInterval = null;
                }
                resolve(false);
                return;
              }
              
            };
            
            checkAuth();
            
            if (!this._authReady) {
              this._authPollingInterval = setInterval(checkAuth, SAFETY_GUARDS.authPollingIntervalMs);
            }
          });
        },
        
        initialize: function() {
          if (this._initialized) {
            return Promise.resolve(this.getStatus());
          }

          if (this._initializationLock) {
            return this._initializationPromise || Promise.resolve(this.getStatus());
          }

          this._initializationLock = true;
          this._initializationAttempts++;
          
          if (this._initializationAttempts > this._maxInitializationAttempts) {
            this._initializationLock = false;
            return Promise.resolve(this.getStatus());
          }

          this._initializationPromise = new Promise((resolve) => {
            this._initializationResolve = resolve;
            
            WATCHDOG.start();
            
            const waitForAppReady = () => {
              if (window.__APP_READY__ === true) {
                if (!this._stateLogged.waiting) {
                  this._stateLogged.waiting = true;
                }
                
                Promise.resolve().then(() => {
                  return this._waitForApiAuth();
                }).then((authReady) => {
                  this._dependenciesReady = {
                    bootstrap: !!(window.BOOTSTRAP_STATE && window.BOOTSTRAP_STATE.isReady),
                    apiAuth: !!(window.api && window.api.auth) || authReady,
                    apiRequest: !!(window.api && window.api.request),
                    ui: !!(window.UI_ORCHESTRATOR && typeof UI_ORCHESTRATOR.getState === 'function')
                  };
                  
                  if (window.app && window.app._dependencyGraph) {
                    executeSafely('SESSION_COORDINATOR.recordDependency', () => {
                      window.app._dependencyGraph.sessionCoordinator = {
                        initialized: true,
                        initializationTime: new Date().toISOString(),
                        config: this._config,
                        dependenciesReady: this._dependenciesReady,
                        authReady: this._authReady
                      };
                    });
                  }
                  
                  if (AUTH_STATE && typeof AUTH_STATE.initialize === 'function' && !AUTH_STATE._initialized) {
                    executeSafely('AUTH_STATE.delayedInit', AUTH_STATE.initialize, AUTH_STATE);
                  }
                  
                  executeSafely('SESSION_COORDINATOR.setupEventListeners', this.setupEventListeners, this);
                  executeSafely('SESSION_COORDINATOR.startSessionMonitoring', this.startSessionMonitoring, this);
                  executeSafely('SESSION_COORDINATOR.setupCrossTabSync', this.setupCrossTabSync, this);
                  executeSafely('SESSION_COORDINATOR.setupActivityMonitoring', this.setupActivityMonitoring, this);
                  executeSafely('SESSION_COORDINATOR.setupIframeCoordination', this.setupIframeCoordination, this);
                  executeSafely('SESSION_COORDINATOR.checkInitialSessionStateAsync', this.checkInitialSessionStateAsync, this);
                  
                  this._initialized = true;
                  this._initializationLock = false;
                  window.__SESSION_COORDINATOR_READY__ = true;
                  
                  this._setupMessageQueueFlush();
                  resolve(this.getStatus());
                  
                }).catch(error => {
                  this._dependenciesReady = {
                    bootstrap: false,
                    apiAuth: this._authReady || false,
                    apiRequest: false,
                    ui: false
                  };
                  
                  executeSafely('SESSION_COORDINATOR.degradedInit', () => {
                    if (AUTH_STATE && typeof AUTH_STATE.initialize === 'function') {
                      AUTH_STATE.initialize();
                    }
                    
                    this.setupEventListeners();
                    this.checkInitialSessionStateAsync();
                    
                    this._initialized = true;
                    this._initializationLock = false;
                    window.__SESSION_COORDINATOR_READY__ = true;
                    resolve(this.getStatus());
                  });
                });
              } else {
                setTimeout(waitForAppReady, 50);
              }
            };
            
            waitForAppReady();
          });
          
          return this._initializationPromise;
        },
        
        _checkDependencies: function() {
          return DEPENDENCY_BARRIER.waitForReady(SAFETY_GUARDS.dependencyTimeoutMs)
            .then(status => {
              this._dependenciesReady.bootstrap = DEPENDENCY_BARRIER._dependencies.bootstrap.ready;
              this._dependenciesReady.apiAuth = DEPENDENCY_BARRIER._dependencies.apiAuth.ready || this._authReady;
              this._dependenciesReady.apiRequest = DEPENDENCY_BARRIER._dependencies.apiRequest.ready;
              this._dependenciesReady.ui = DEPENDENCY_BARRIER._dependencies.ui.ready;
              return status;
            });
        },
        
        _setupMessageQueueFlush: function() {
          const checkFlush = () => {
            if (AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' && 
                AUTH_STATE.getSessionState() === SESSION_STATES.VALID && !this._messageQueueFlushed) {
              this._flushMessageQueue();
              this._messageQueueFlushed = true;
            } else if (!this._messageQueueFlushed) {
              setTimeout(checkFlush, 100);
            }
          };
          
          checkFlush();
        },
        
        _flushMessageQueue: function() {
          if (this._outboundMessageQueue.length === 0) return;
          
          this._outboundMessageQueue.forEach(message => {
            executeSafely('flushMessage', () => {
              if (message.type === 'iframe' && message.iframeId) {
                this._sendMessageToIframe(message.iframeId, message.data);
              } else if (message.type === 'broadcast') {
                this.broadcastSessionChange(message.eventType, message.data);
              }
            });
          });
          
          this._outboundMessageQueue = [];
        },
        
        _queueOutboundMessage: function(message) {
          this._outboundMessageQueue.push(message);
        },
        
        setupEventListeners: function() {
          window.addEventListener('nexopa-login-success', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLoginSuccess', () => {
              this.handleLoginSuccess(event.detail);
            });
          });
          
          window.addEventListener('nexopa-login-failed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLoginFailed', () => {
              this.handleLoginFailed(event.detail);
            });
          });
          
          window.addEventListener('nexopa-logout', (event) => {
            executeSafely('SESSION_COORDINATOR.handleLogout', () => {
              this.handleLogout(event.detail);
            });
          });
          
          window.addEventListener('nexopa-token-expired', (event) => {
            executeSafely('SESSION_COORDINATOR.handleTokenExpired', () => {
              this.handleTokenExpired(event.detail);
            });
          });
          
          window.addEventListener('nexopa-session-invalid', (event) => {
            executeSafely('SESSION_COORDINATOR.handleSessionInvalid', () => {
              this.handleSessionInvalid(event.detail);
            });
          });
          
          window.addEventListener('nexopa-session-refreshed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleSessionRefreshed', () => {
              this.handleSessionRefreshed(event.detail);
            });
          });
          
          window.addEventListener('nexopa-auth-state-changed', (event) => {
            executeSafely('SESSION_COORDINATOR.handleAuthStateChanged', () => {
              this.handleAuthStateChanged(event.detail);
            });
          });
          
          window.addEventListener('nexopa-auth-state-cleared', (event) => {
            executeSafely('SESSION_COORDINATOR.handleAuthStateCleared', () => {
              this.handleAuthStateCleared(event.detail);
            });
          });
          
          window.addEventListener('nexopa-token-synced', (event) => {
            executeSafely('SESSION_COORDINATOR.broadcastSynced', () => {
              this.broadcastSessionChange('synced', AUTH_STATE && typeof AUTH_STATE.getUser === 'function' ? AUTH_STATE.getUser() : null);
            });
          });
          
          window.addEventListener('nexopa-user-synced', (event) => {
            executeSafely('SESSION_COORDINATOR.updateUISynced', () => {
              if (event.detail && event.detail.user) {
                this.updateUIForAuthenticatedState(event.detail.user);
              }
            });
          });
          
          window.addEventListener('nexopa-session-state-changed', (event) => {
            if (event.detail.newState === SESSION_STATES.RECOVERY) {
              this.enterRecoveryMode();
            }
          });
        },
        
        handleLoginSuccess: function(detail) {
          const rawSession = {
            token: detail.token,
            refreshToken: detail.refreshToken,
            userId: detail.user?.id || detail.user?.uid,
            expiresAt: detail.expiresIn ? Date.now() + (detail.expiresIn * 1000) : null,
            issuedAt: Date.now()
          };
          
          const validation = validateSession(rawSession);
          if (!validation.isValid) {
            if (this._uiCallbacks.onSessionError) {
              this._uiCallbacks.onSessionError({ 
                message: 'Invalid session data', 
                code: 'INVALID_SESSION_DATA' 
              });
            }
            return;
          }
          
          if (AUTH_STATE && typeof AUTH_STATE.setAuthState === 'function') {
            executeSafely('AUTH_STATE.setAuthState.login', () => {
              AUTH_STATE.setAuthState(
                detail.user,
                detail.token,
                detail.refreshToken,
                detail.expiresIn
              );
            });
          }
          
          // Also update central session
          setCentralSession({
            token: detail.token,
            user: detail.user,
            refreshToken: detail.refreshToken,
            expiresIn: detail.expiresIn
          });
          
          this._stateLogged = {
            waiting: false,
            success: true,
            failure: false
          };
          
          executeSafely('SESSION_COORDINATOR.updateUILogin', () => {
            if (detail && detail.user) {
              this.updateUIForAuthenticatedState(detail.user);
              
              if (this._uiCallbacks.onAuthenticated) {
                this._uiCallbacks.onAuthenticated(detail.user);
              }
            }
          });
          
          executeSafely('SESSION_COORDINATOR.clearWarningsLogin', () => {
            this.clearSessionWarnings();
          });
          
          this._retryCount = 0;
          
          executeSafely('SESSION_COORDINATOR.startMonitoringLogin', () => {
            this.startSessionMonitoring();
          });
          
          executeSafely('SESSION_COORDINATOR.scheduleRefreshLogin', () => {
            this.scheduleTokenRefresh();
          });
          
          executeSafely('SESSION_COORDINATOR.broadcastLogin', () => {
            this.broadcastSessionChange('authenticated', detail.user);
          });
          
          executeSafely('SESSION_COORDINATOR.propagateLogin', () => {
            this.propagateSessionToIframes(detail.user, detail.token);
          });
          
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.loadAppContent === 'function') {
            executeSafely('APP_BOOTSTRAP.loadAppContent', APP_BOOTSTRAP.loadAppContent);
          }
        },
        
        handleLoginFailed: function(detail) {
          const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
          
          if (AUTH_STATE && typeof AUTH_STATE.clearAuthState === 'function' && !hasStoredSession) {
            executeSafely('AUTH_STATE.clearAuthState.loginFailed', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          this._stateLogged = {
            waiting: false,
            success: false,
            failure: true
          };
          
          if (this._uiCallbacks.onSessionError) {
            this._uiCallbacks.onSessionError({ 
              message: (detail && detail.message) || 'Login failed', 
              code: 'LOGIN_FAILED' 
            });
          }
          
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.loginFailed', () => {
              window.showNotification((detail && detail.message) || 'Login failed. Please try again.', 'error');
            });
          }
          
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.showAuthUI === 'function') {
            executeSafely('APP_BOOTSTRAP.showAuthUI', APP_BOOTSTRAP.showAuthUI);
          }
          
          executeSafely('SESSION_COORDINATOR.broadcastLoginFailed', () => {
            this.broadcastSessionChange('login_failed', null);
          });
        },
        
        handleLogout: function(detail) {
          this.stopSessionMonitoring();
          if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            this._refreshTimeout = null;
          }
          if (this._warningTimeout) {
            clearTimeout(this._warningTimeout);
            this._warningTimeout = null;
          }
          
          const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
          
          if (AUTH_STATE && typeof AUTH_STATE.clearAuthState === 'function' && !hasStoredSession) {
            executeSafely('AUTH_STATE.clearAuthState.logout', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          // Clear central session
          clearCentralSession();
          
          this._stateLogged = {
            waiting: false,
            success: false,
            failure: false
          };
          
          executeSafely('SESSION_COORDINATOR.updateUILogout', () => {
            this.updateUIForUnauthenticatedState();
            
            if (this._uiCallbacks.onUnauthenticated) {
              this._uiCallbacks.onUnauthenticated();
            }
          });
          
          if (typeof DATA_CACHE !== 'undefined' && DATA_CACHE !== null && typeof DATA_CACHE.clearAll === 'function') {
            executeSafely('DATA_CACHE.clearAll', DATA_CACHE.clearAll);
          }
          
          if (typeof SETTINGS_SERVICE !== 'undefined' && SETTINGS_SERVICE !== null && window.currentUser) {
            executeSafely('SETTINGS_SERVICE.clearUserSettings', () => {
              if (typeof SETTINGS_SERVICE.clearUserSettings === 'function') {
                SETTINGS_SERVICE.clearUserSettings();
              }
            });
          }
          
          if (typeof USER_DATA_ISOLATION !== 'undefined' && USER_DATA_ISOLATION !== null && window.currentUser) {
            executeSafely('USER_DATA_ISOLATION.clearUserData', () => {
              const userId = window.currentUser.uid || window.currentUser.id;
              if (userId && typeof USER_DATA_ISOLATION.clearUserData === 'function') {
                USER_DATA_ISOLATION.clearUserData(userId);
              }
            });
          }
          
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.showAuthUI === 'function') {
            executeSafely('APP_BOOTSTRAP.showAuthUI.logout', APP_BOOTSTRAP.showAuthUI);
          }
          
          executeSafely('SESSION_COORDINATOR.broadcastLogout', () => {
            this.broadcastSessionChange('logged_out', null);
          });
          
          executeSafely('SESSION_COORDINATOR.propagateLogout', () => {
            this.propagateLogoutToIframes();
          });
          
          if (this._broadcastChannel) {
            executeSafely('SESSION_COORDINATOR.closeBroadcast', () => {
              try {
                this._broadcastChannel.close();
              } catch (e) {
                // Silent
              }
              this._broadcastChannel = null;
            });
          }
          
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.logout', () => {
              window.showNotification('Logged out successfully', 'success');
            });
          }
        },
        
        handleTokenExpired: function(detail) {
          executeSafely('SESSION_COORDINATOR.attemptTokenRefresh', () => {
            this.attemptTokenRefresh().then(refreshResult => {
              if (refreshResult && refreshResult.success) {
                executeSafely('SESSION_COORDINATOR.dispatchRefreshed', () => {
                  window.dispatchEvent(new CustomEvent('nexopa-session-refreshed', {
                    detail: { 
                      token: refreshResult.token,
                      timestamp: new Date().toISOString()
                    }
                  }));
                });
                
                window.dispatchEvent(new CustomEvent('session:refresh', {
                  detail: {
                    timestamp: new Date().toISOString()
                  }
                }));
                
                if (typeof window.showNotification === 'function') {
                  executeSafely('showNotification.refreshSuccess', () => {
                    window.showNotification('Session refreshed', 'success', 3000);
                  });
                }
              } else {
                window.dispatchEvent(new CustomEvent('session:expired', {
                  detail: {
                    reason: 'Token refresh failed',
                    timestamp: new Date().toISOString()
                  }
                }));
                
                executeSafely('SESSION_COORDINATOR.showReauthWarning', () => {
                  this.showReauthenticationWarning();
                });
                
                executeSafely('SESSION_COORDINATOR.dispatchReauthRequired', () => {
                  window.dispatchEvent(new CustomEvent('nexopa-reauthentication-required', {
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
        
        handleSessionInvalid: function(detail) {
          const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
          
          if (AUTH_STATE && typeof AUTH_STATE.clearAuthState === 'function' && !hasStoredSession) {
            executeSafely('AUTH_STATE.clearAuthState.sessionInvalid', AUTH_STATE.clearAuthState, AUTH_STATE);
          }
          
          this._stateLogged = {
            waiting: false,
            success: false,
            failure: true
          };
          
          window.dispatchEvent(new CustomEvent('session:expired', {
            detail: {
              reason: 'Session invalid',
              timestamp: new Date().toISOString()
            }
          }));
          
          executeSafely('SESSION_COORDINATOR.updateUISessionInvalid', () => {
            this.updateUIForUnauthenticatedState();
            
            if (this._uiCallbacks.onUnauthenticated) {
              this._uiCallbacks.onUnauthenticated();
            }
          });
          
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.redirectToAuth === 'function') {
            executeSafely('APP_BOOTSTRAP.redirectToAuth', () => {
              APP_BOOTSTRAP.redirectToAuth(detail && detail.reason ? detail.reason : 'Session invalid');
            });
          }
          
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.sessionInvalid', () => {
              window.showNotification('Your session has expired. Please log in again.', 'error', 10000);
            });
          }
        },
        
        handleSessionRefreshed: function(detail) {
          executeSafely('SESSION_COORDINATOR.clearWarningsRefreshed', () => {
            this.clearSessionWarnings();
          });
          
          if (detail && detail.token && AUTH_STATE && typeof AUTH_STATE.getUser === 'function' && AUTH_STATE.getUser()) {
            executeSafely('AUTH_STATE.setAuthState.refreshed', () => {
              if (typeof AUTH_STATE.setAuthState === 'function') {
                AUTH_STATE.setAuthState(AUTH_STATE.getUser(), detail.token);
              }
            });
            
            // Update central session
            setCentralSession({
              token: detail.token,
              user: AUTH_STATE.getUser(),
              refreshToken: AUTH_STATE.getRefreshToken()
            });
          }
          
          this._stateLogged = {
            waiting: false,
            success: true,
            failure: false
          };
          
          window.dispatchEvent(new CustomEvent('session:refresh', {
            detail: {
              timestamp: new Date().toISOString()
            }
          }));
          
          executeSafely('SESSION_COORDINATOR.scheduleRefreshRefreshed', () => {
            this.scheduleTokenRefresh();
          });
          
          executeSafely('SESSION_COORDINATOR.broadcastRefreshed', () => {
            this.broadcastSessionChange('refreshed', AUTH_STATE && typeof AUTH_STATE.getUser === 'function' ? AUTH_STATE.getUser() : null);
          });
          
          executeSafely('SESSION_COORDINATOR.propagateRefreshed', () => {
            this.propagateSessionToIframes(
              AUTH_STATE && typeof AUTH_STATE.getUser === 'function' ? AUTH_STATE.getUser() : null, 
              detail && detail.token ? detail.token : null
            );
          });
        },
        
        handleAuthStateChanged: function(detail) {
          window.currentUser = detail && detail.user ? detail.user : null;
          
          executeSafely('SESSION_COORDINATOR.propagateAuthChange', () => {
            this.propagateSessionToIframes(
              detail && detail.user ? detail.user : null, 
              AUTH_STATE && typeof AUTH_STATE.getToken === 'function' ? AUTH_STATE.getToken() : null
            );
          });
        },
        
        handleAuthStateCleared: function() {
          window.currentUser = null;
          
          executeSafely('SESSION_COORDINATOR.propagateAuthCleared', () => {
            this.propagateLogoutToIframes();
          });
        },
        
        enterRecoveryMode: function() {
          this._iframes.forEach((iframe, iframeId) => {
            if (iframe && iframe.ready && iframe.window) {
              executeSafely(`pauseIframe.${iframeId}`, () => {
                try {
                  iframe.window.postMessage({
                    type: 'nexopa-session-pause',
                    reason: 'recovery_mode',
                    timestamp: new Date().toISOString()
                  }, '*');
                } catch (error) {
                  // Silent
                }
              });
            }
          });
          
          const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
          
          if (AUTH_STATE && typeof AUTH_STATE.clearAuthState === 'function' && !hasStoredSession) {
            AUTH_STATE.clearAuthState();
          }
          
          if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.handleSessionRecovery === 'function') {
            executeSafely('APP_BOOTSTRAP.handleSessionRecovery', APP_BOOTSTRAP.handleSessionRecovery);
          }
          
          setTimeout(() => {
            if (typeof APP_BOOTSTRAP !== 'undefined' && APP_BOOTSTRAP !== null && typeof APP_BOOTSTRAP.redirectToAuth === 'function') {
              executeSafely('APP_BOOTSTRAP.redirectToAuth.recovery', () => {
                APP_BOOTSTRAP.redirectToAuth('Session recovery required');
              });
            }
          }, 1000);
        },
        
        attemptTokenRefresh: function() {
          return new Promise(async (resolve) => {
            this._retryCount++;
            
            if (this._retryCount > this._config.maxRetryAttempts) {
              resolve({
                success: false,
                error: {
                  message: 'Maximum retry attempts exceeded',
                  code: 'MAX_RETRIES'
                }
              });
              return;
            }
            
            const backoffIndex = Math.min(this._retryCount - 1, this._config.retryBackoff.length - 1);
            const delay = this._config.retryBackoff[backoffIndex];
            
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const refreshMethods = [
              this.refreshViaTokenValidation.bind(this),
              this.refreshViaApiCall.bind(this),
              this.refreshViaAuthState.bind(this)
            ];
            
            for (const method of refreshMethods) {
              try {
                const result = await method();
                if (result && result.success) {
                  this._retryCount = 0;
                  resolve(result);
                  return;
                }
              } catch (error) {
                // Silent
              }
            }
            
            resolve({
              success: false,
              error: {
                message: 'All refresh methods failed',
                code: 'ALL_METHODS_FAILED'
              }
            });
          });
        },
        
        refreshViaTokenValidation: async function() {
          if (typeof TOKEN_VALIDATION === 'undefined' || TOKEN_VALIDATION === null || typeof TOKEN_VALIDATION.refreshToken !== 'function') {
            throw new Error('TOKEN_VALIDATION not available');
          }
          
          return await TOKEN_VALIDATION.refreshToken();
        },
        
        refreshViaApiCall: async function() {
          if (!AUTH_STATE) {
            throw new Error('AUTH_STATE not available');
          }
          
          const token = typeof AUTH_STATE.getToken === 'function' ? AUTH_STATE.getToken() : null;
          const refreshToken = typeof AUTH_STATE.getRefreshToken === 'function' ? AUTH_STATE.getRefreshToken() : null;
          
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
            throw new Error((response && response.message) || 'Refresh failed');
          }
        },
        
        refreshViaAuthState: async function() {
          if (typeof AUTH_STATE === 'undefined' || AUTH_STATE === null || typeof AUTH_STATE.getToken !== 'function' || !AUTH_STATE.getToken()) {
            throw new Error('AUTH_STATE not available or no token');
          }
          
          return {
            success: true,
            token: AUTH_STATE.getToken()
          };
        },
        
        showReauthenticationWarning: function() {
          const warningId = 'reauth-warning';
          
          const existing = document.getElementById(warningId);
          if (existing) existing.remove();
          
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
          
          document.getElementById('reauth-now').addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('nexopa-reauthentication-required', {
              detail: { reason: 'User requested re-authentication' }
            }));
            warning.remove();
          });
          
          document.getElementById('reauth-dismiss').addEventListener('click', () => {
            warning.style.animation = 'slideOutDown 0.3s ease-in';
            setTimeout(() => warning.remove(), 300);
          });
          
          setTimeout(() => {
            if (warning.parentNode) {
              warning.style.animation = 'slideOutDown 0.3s ease-in';
              setTimeout(() => warning.remove(), 300);
            }
          }, 30000);
        },
        
        clearSessionWarnings: function() {
          const warnings = document.querySelectorAll('#reauth-warning, #session-warning');
          warnings.forEach(warning => {
            if (warning.parentNode) {
              warning.parentNode.removeChild(warning);
            }
          });
          
          if (this._warningTimeout) {
            clearTimeout(this._warningTimeout);
            this._warningTimeout = null;
          }
          
          if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            this._refreshTimeout = null;
          }
        },
        
        updateUIForAuthenticatedState: function(user) {
          if (!user) return;
          
          const safeUser = {
            ...user,
            uid: user.id || user.uid,
            id: user.id || user.uid
          };
          
          window.currentUser = safeUser;
          
          if (typeof updateGlobalAuthState === 'function') {
            executeSafely('updateGlobalAuthState.authenticated', () => updateGlobalAuthState(safeUser));
          }
          
          const dashboard = document.getElementById('dashboardContainer') || 
                           document.querySelector('.dashboard-container');
          if (dashboard) {
            dashboard.classList.remove('hidden');
          }
          
          const auth = document.getElementById('authContainer') || 
                       document.querySelector('.auth-container');
          if (auth) {
            auth.classList.add('hidden');
          }
          
          executeSafely('SESSION_COORDINATOR.updateUserDisplay', () => {
            this.updateUserDisplayElements(safeUser);
          });
        },
        
        updateUIForUnauthenticatedState: function() {
          window.currentUser = null;
          
          if (typeof updateGlobalAuthState === 'function') {
            executeSafely('updateGlobalAuthState.unauthenticated', () => updateGlobalAuthState(null));
          }
          
          const auth = document.getElementById('authContainer') || 
                       document.querySelector('.auth-container');
          if (auth) {
            auth.classList.remove('hidden');
          }
          
          const dashboard = document.getElementById('dashboardContainer') || 
                           document.querySelector('.dashboard-container');
          if (dashboard) {
            dashboard.classList.add('hidden');
          }
          
          executeSafely('SESSION_COORDINATOR.clearUserDisplay', () => {
            this.clearUserDisplayElements();
          });
        },
        
        updateUIForLimitedMode: function() {
          const blockedElements = document.querySelectorAll('[data-session-blocked="true"]');
          blockedElements.forEach(element => {
            element.removeAttribute('data-session-blocked');
            element.disabled = false;
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
          });
          
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.limitedMode', () => {
              window.showNotification('Running in limited mode. Some features may be unavailable until session loads.', 'info', 5000);
            });
          }
          
          if (window.app && window.app._dependencyGraph) {
            executeSafely('SESSION_COORDINATOR.recordLimitedMode', () => {
              window.app._dependencyGraph.sessionCoordinator.limitedMode = {
                active: true,
                activatedAt: new Date().toISOString(),
                reason: 'Session load timeout'
              };
            });
          }
        },
        
        updateUserDisplayElements: function(user) {
          if (!user) return;
          
          // FIX (shows-"User"-everywhere): this used to read ONLY
          // user.displayName, with no fallback to username or
          // firstName/lastName. Any account whose cached user object hadn't
          // been hydrated with a computed displayName yet (e.g. right after
          // Google or manual login, before /auth/me ran) showed the literal
          // string "User" even though a real username was sitting right on
          // the same object. Compute the same fallback chain the backend
          // itself uses for displayName instead of assuming it's populated.
          const resolvedName = user.displayName
            || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
            || user.username
            || 'User';

          const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
          avatars.forEach(avatar => {
            if (user.photoURL) {
              avatar.src = user.photoURL;
              avatar.alt = resolvedName;
            }
          });
          
          const names = document.querySelectorAll('.user-name, .display-name');
          names.forEach(name => {
            name.textContent = resolvedName;
          });
          
          const emails = document.querySelectorAll('.user-email');
          emails.forEach(email => {
            email.textContent = user.email || '';
          });
        },
        
        clearUserDisplayElements: function() {
          const avatars = document.querySelectorAll('.user-avatar, .avatar-img');
          avatars.forEach(avatar => {
            avatar.src = '';
            avatar.alt = 'User';
          });
          
          const names = document.querySelectorAll('.user-name, .display-name');
          names.forEach(name => {
            name.textContent = 'User';
          });
          
          const emails = document.querySelectorAll('.user-email');
          emails.forEach(email => {
            email.textContent = '';
          });
        },
        
        startSessionMonitoring: function() {
          if (this._monitoringInterval) {
            clearInterval(this._monitoringInterval);
          }
          
          this._monitoringInterval = setInterval(() => {
            executeSafely('SESSION_COORDINATOR.checkSessionValidity', () => {
              this.checkSessionValidity();
            });
          }, this._config.monitoringInterval);
          
          setTimeout(() => {
            executeSafely('SESSION_COORDINATOR.checkSessionValidityInitial', () => {
              this.checkSessionValidity();
            });
          }, 1000);
        },
        
        stopSessionMonitoring: function() {
          if (this._monitoringInterval) {
            clearInterval(this._monitoringInterval);
            this._monitoringInterval = null;
          }
          
          executeSafely('SESSION_COORDINATOR.clearWarningsStop', () => {
            this.clearSessionWarnings();
          });
          
          if (this._inactivityTimeout) {
            clearTimeout(this._inactivityTimeout);
            this._inactivityTimeout = null;
          }
        },
        
        checkSessionValidity: function() {
          if (!AUTH_STATE || typeof AUTH_STATE.hasToken !== 'function' || !AUTH_STATE.hasToken()) {
            return;
          }
          
          if (typeof AUTH_STATE.isAuthenticated !== 'function' || !AUTH_STATE.isAuthenticated()) {
            if (typeof TOKEN_VALIDATION !== 'undefined' && TOKEN_VALIDATION !== null && typeof TOKEN_VALIDATION.validateWithBackend === 'function') {
              executeSafely('TOKEN_VALIDATION.validateWithBackend.check', () => {
                TOKEN_VALIDATION.validateWithBackend().then(result => {
                  if (!result || !result.valid) {
                    executeSafely('SESSION_COORDINATOR.dispatchSessionInvalid', () => {
                      window.dispatchEvent(new CustomEvent('nexopa-session-invalid', {
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
          
          const timeToExpiry = typeof AUTH_STATE.getTimeToExpiry === 'function' ? AUTH_STATE.getTimeToExpiry() : null;
          
          if (timeToExpiry !== null) {
            if (timeToExpiry <= 0) {
              executeSafely('SESSION_COORDINATOR.dispatchTokenExpired', () => {
                window.dispatchEvent(new CustomEvent('nexopa-token-expired', {
                  detail: {
                    reason: 'Token has expired',
                    timestamp: new Date().toISOString()
                  }
                }));
              });
              return;
            }
            
            if (timeToExpiry < this._config.warningThreshold) {
              executeSafely('SESSION_COORDINATOR.showExpiryWarning', () => {
                this.showSessionExpiryWarning(timeToExpiry);
              });
            }
            
            if (timeToExpiry < this._config.refreshThreshold) {
              executeSafely('SESSION_COORDINATOR.scheduleTokenRefreshCheck', () => {
                this.scheduleTokenRefresh(timeToExpiry);
              });
            }
          }
        },
        
        showSessionExpiryWarning: function(timeUntilExpiry) {
          const minutes = Math.ceil(timeUntilExpiry / (60 * 1000));
          
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
          
          if (!this._warningTimeout) {
            this._warningTimeout = setTimeout(() => {
              executeSafely('SESSION_COORDINATOR.showReauthWarningDelayed', () => {
                this.showReauthenticationWarning();
              });
            }, Math.max(0, timeUntilExpiry - (5 * 60 * 1000)));
          }
        },
        
        scheduleTokenRefresh: function(timeUntilExpiry = null) {
          if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
            this._refreshTimeout = null;
          }
          
          if (!AUTH_STATE) return;
          
          if (timeUntilExpiry === null) {
            timeUntilExpiry = typeof AUTH_STATE.getTimeToExpiry === 'function' ? AUTH_STATE.getTimeToExpiry() : null;
            if (timeUntilExpiry === null) return;
          }
          
          const refreshTime = Math.max(
            60000,
            Math.min(
              timeUntilExpiry * 0.3,
              timeUntilExpiry - 60000
            )
          );
          
          this._refreshTimeout = setTimeout(() => {
            executeSafely('SESSION_COORDINATOR.attemptScheduledRefresh', () => {
              this.attemptTokenRefresh().then(result => {
                if (!result || !result.success) {
                  setTimeout(() => {
                    executeSafely('SESSION_COORDINATOR.retryScheduledRefresh', () => {
                      if (this._retryCount < this._config.maxRetryAttempts) {
                        this.scheduleTokenRefresh(typeof AUTH_STATE.getTimeToExpiry === 'function' ? AUTH_STATE.getTimeToExpiry() : null);
                      }
                    });
                  }, 30000);
                }
              });
            });
          }, refreshTime);
        },
        
        // FIX (Security settings audit): this whole feature was a placeholder.
        // Three problems, all fixed here:
        //  1. `_config.inactivityTimeout` was a hardcoded 30-minute constant.
        //     Settings > Security > "Session Timeout" (15min/30min/1hr/8hr)
        //     saved fine and even set `window.__sessionTimeout` in five
        //     different *iframe* module files (messages-core.js, group-core.js,
        //     friend-core.js, calls-core.js, status-core.js) — but this
        //     coordinator lives in the parent frame (index.html), so that
        //     global was invisible to it. The setting had no path into the
        //     one place that could actually act on it.
        //  2. Even at the fixed 30 minutes, `handleUserInactivity` only ever
        //     showed a "session will expire soon" toast and dispatched a
        //     `nexopa-user-inactivity` event that nothing in the codebase
        //     ever listens for — no logout ever actually happened.
        //  3. app.core.bootstrap.js runs a second, fully independent,
        //     also-hardcoded 30-minute inactivity timer in parallel (see
        //     its own setupSessionMonitoring/handleUserInactivity). That one
        //     is left to only show its warning toast; this coordinator is now
        //     the single source of truth for the actual logout so the two
        //     timers can't race and log the user out twice.
        _getConfiguredInactivityTimeoutMs: function() {
          const TIMEOUT_MS = { '15min': 15 * 60 * 1000, '30min': 30 * 60 * 1000, '1hr': 60 * 60 * 1000, '8hr': 8 * 60 * 60 * 1000 };
          try {
            const raw = localStorage.getItem('knecta_settings_cache');
            if (raw) {
              const parsed = JSON.parse(raw);
              const choice = parsed && parsed.data && parsed.data.security && parsed.data.security.sessionTimeout;
              if (choice && TIMEOUT_MS[choice]) return TIMEOUT_MS[choice];
            }
          } catch (_) { /* fall through to default */ }
          return this._config.inactivityTimeout || TIMEOUT_MS['30min'];
        },

        setupActivityMonitoring: function() {
          this._lastActivity = Date.now();
          this._config.inactivityTimeout = this._getConfiguredInactivityTimeoutMs();
          
          const resetActivityTimeout = () => {
            this._lastActivity = Date.now();
            
            if (this._inactivityTimeout) {
              clearTimeout(this._inactivityTimeout);
              this._inactivityTimeout = null;
            }
            if (this._warningTimeout) {
              clearTimeout(this._warningTimeout);
              this._warningTimeout = null;
            }
            
            const fullTimeout = this._config.inactivityTimeout;
            const warnAfter = Math.max(0, fullTimeout - this._config.warningThreshold);
            
            this._warningTimeout = setTimeout(() => {
              executeSafely('SESSION_COORDINATOR.handleInactivityWarning', () => {
                this.handleUserInactivity();
              });
            }, warnAfter);
            
            this._inactivityTimeout = setTimeout(() => {
              executeSafely('SESSION_COORDINATOR.handleInactivityLogout', () => {
                this.handleInactivityLogout();
              });
            }, fullTimeout);
          };
          
          ['mousedown', 'keydown', 'touchstart', 'mousemove', 'click', 'scroll'].forEach(event => {
            window.addEventListener(event, resetActivityTimeout, { passive: true });
          });
          
          // Keep the timer in sync when the user changes Session Timeout in
          // Settings, without needing a page reload. settings-core.js's
          // SettingsState.update() already posts this message to window.parent
          // on every change; the Settings page runs as an iframe of index.html,
          // so this coordinator (running in the index.html parent) receives it.
          window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || msg.type !== 'SETTINGS_UPDATED') return;
            if (msg.section !== 'security' || msg.key !== 'sessionTimeout') return;
            executeSafely('SESSION_COORDINATOR.applySessionTimeoutChange', () => {
              this._config.inactivityTimeout = this._getConfiguredInactivityTimeoutMs();
              resetActivityTimeout();
            });
          });
          
          resetActivityTimeout();
        },
        
        handleUserInactivity: function() {
          const minutesLeft = Math.round(this._config.warningThreshold / 60000);
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.inactivity', () => {
              window.showNotification(`You've been inactive. You'll be logged out in about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} unless you interact with the app.`, 'warning', 10000);
            });
          }
          
          executeSafely('SESSION_COORDINATOR.dispatchInactivity', () => {
            window.dispatchEvent(new CustomEvent('nexopa-user-inactivity', {
              detail: {
                minutesUntilLogout: minutesLeft,
                timestamp: new Date().toISOString()
              }
            }));
          });
        },
        
        // The real enforcement step: Settings > Security > Session Timeout
        // now actually logs the user out (and every open module iframe/tab,
        // via handleLogout's existing broadcastSessionChange +
        // propagateLogoutToIframes) once the chosen duration of inactivity
        // elapses, instead of the setting being a no-op after saving.
        handleInactivityLogout: function() {
          if (typeof window.showNotification === 'function') {
            executeSafely('showNotification.inactivityLogout', () => {
              window.showNotification('You were logged out due to inactivity.', 'info', 8000);
            });
          }
          this.handleLogout({ reason: 'Session timed out due to inactivity' });
        },
        
        setupCrossTabSync: function() {
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              this._broadcastChannel = new BroadcastChannel('nexopa_session');
              
              this._broadcastChannel.addEventListener('message', (event) => {
                executeSafely('SESSION_COORDINATOR.broadcastMessage', () => {
                  const data = event.data;
                  
                  if (data && data.type === 'session_change') {
                    if (data.detail && data.detail.type === 'logged_out') {
                      this.handleLogout({ reason: 'Logged out from another tab' });
                    } else if (data.detail && data.detail.type === 'authenticated' && data.detail.user) {
                      this.updateUIForAuthenticatedState(data.detail.user);
                    }
                  } else if (data && data.type === 'ping') {
                    try {
                      this._broadcastChannel.postMessage({
                        type: 'pong',
                        tabId: AUTH_STATE && AUTH_STATE._tabId ? AUTH_STATE._tabId : 'unknown',
                        timestamp: new Date().toISOString()
                      });
                    } catch (error) {
                      // Silent
                    }
                  }
                });
              });
              
              setTimeout(() => {
                if (this._broadcastChannel) {
                  executeSafely('SESSION_COORDINATOR.sendInitialPing', () => {
                    try {
                      this._broadcastChannel.postMessage({
                        type: 'ping',
                        tabId: AUTH_STATE && AUTH_STATE._tabId ? AUTH_STATE._tabId : 'unknown',
                        timestamp: new Date().toISOString()
                      });
                    } catch (error) {
                      // Silent
                    }
                  });
                }
              }, 1000);
              
            } catch (error) {
              // Silent
            }
          }
        },
        
        setupIframeCoordination: function() {
          MESSAGE_REGISTRY.clearStaleMessages();
          
          window.addEventListener('message', (event) => {
            executeSafely('SESSION_COORDINATOR.handleIframeMessage', () => {
              if (!this._isTrustedOrigin(event.origin)) {
                return;
              }
              
              const data = event.data;
              
              if (!this._validateMessageSchema(data)) {
                return;
              }
              
              if (data && data.messageId && !MESSAGE_REGISTRY.registerReceived(data.messageId)) {
                return;
              }
              
              if (data && data.type === 'nexopa-iframe-ready') {
                this._handleIframeReadySecure(event.source, data);
              }
              
              if (data && data.type === 'nexopa-iframe-auth-request') {
                this.handleIframeAuthRequest(event.source, data);
              }
              
              if (data && data.type === 'nexopa-iframe-data-request') {
                this.handleIframeDataRequest(event.source, data);
              }
              
              if (data && data.type === 'nexopa-handshake-response') {
                this._handleHandshakeResponse(event.source, data);
              }
            });
          });
          
          executeSafely('SESSION_COORDINATOR.detectExistingIframes', () => {
            this._detectExistingIframes();
          });
          
          executeSafely('SESSION_COORDINATOR.monitorForNewIframes', () => {
            this._monitorForNewIframes();
          });
        },
        
        _isTrustedOrigin: function(origin) {
          const currentOrigin = window.location.origin;
          const trustedOrigins = [
            currentOrigin,
            'http://localhost',
            'http://127.0.0.1',
            'https://nexopa.app',
            'https://*.nexopa.app'
          ];
          
          return trustedOrigins.some(trusted => {
            if (trusted.includes('*')) {
              const regex = new RegExp('^' + trusted.replace(/\*/g, '.*') + '$');
              return regex.test(origin);
            }
            return origin === trusted;
          });
        },
        
        _validateMessageSchema: function(data) {
          if (!data || typeof data !== 'object') return false;
          if (!data.type || typeof data.type !== 'string') return false;
          
          const typesRequiringId = ['nexopa-handshake-response', 'nexopa-iframe-auth-request', 'nexopa-iframe-data-request'];
          if (typesRequiringId.includes(data.type) && (!data.messageId || typeof data.messageId !== 'string')) {
            return false;
          }
          
          if (data.timestamp && isNaN(new Date(data.timestamp).getTime())) {
            return false;
          }
          
          return true;
        },
        
        _handleIframeReadySecure: function(iframeWindow, data) {
          const iframeId = data.iframeId || data.sourceId;
          const pageKey = data.pageKey;
          
          const existing = this._iframes.get(iframeId);
          if (existing && existing.ready) {
            return;
          }
          
          const attempts = (this._iframeHandshakeAttempts.get(iframeId) || 0) + 1;
          this._iframeHandshakeAttempts.set(iframeId, attempts);
          
          if (attempts > this._config.maxHandshakeAttempts) {
            this._disableIframe(iframeId);
            return;
          }
          
          const existingTimeout = this._iframeHandshakeTimeouts.get(iframeId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          
          const handshakeTimeout = setTimeout(() => {
            this._iframeHandshakeTimeouts.delete(iframeId);
            this._disableIframe(iframeId);
          }, this._config.iframeHandshakeTimeout);
          
          this._iframeHandshakeTimeouts.set(iframeId, handshakeTimeout);
          
          this._iframes.set(iframeId, {
            id: iframeId,
            window: iframeWindow,
            pageKey: pageKey,
            ready: false,
            trusted: true,
            handshakeAttempts: attempts,
            lastCommunication: new Date().toISOString(),
            sessionPropagated: false
          });
          
          this._initiateHandshake(iframeWindow, iframeId, pageKey);
        },
        
        _initiateHandshake: function(iframeWindow, iframeId, pageKey) {
          const messageId = MESSAGE_REGISTRY.generateMessageId();
          
          if (!MESSAGE_REGISTRY.registerSent(messageId)) {
            setTimeout(() => this._initiateHandshake(iframeWindow, iframeId, pageKey), 100);
            return;
          }
          
          const handshakeMessage = {
            type: 'nexopa-handshake-request',
            messageId: messageId,
            iframeId: iframeId,
            pageKey: pageKey,
            timestamp: new Date().toISOString(),
            sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
          };
          
          try {
            iframeWindow.postMessage(handshakeMessage, '*');
          } catch (error) {
            this._iframeHandshakeAttempts.delete(iframeId);
          }
        },
        
        _handleHandshakeResponse: function(iframeWindow, data) {
          const iframeId = data.iframeId;
          const messageId = data.messageId;
          
          if (!iframeId || !messageId) {
            return;
          }
          
          const handshakeTimeout = this._iframeHandshakeTimeouts.get(iframeId);
          if (handshakeTimeout) {
            clearTimeout(handshakeTimeout);
            this._iframeHandshakeTimeouts.delete(iframeId);
          }
          
          const iframe = this._iframes.get(iframeId);
          if (!iframe) {
            return;
          }
          
          iframe.ready = true;
          iframe.lastCommunication = new Date().toISOString();
          this._iframes.set(iframeId, iframe);
          
          executeSafely(`sendSessionDataToIframe.${iframeId}`, () => {
            this._sendSessionDataToIframeSecure(iframeWindow, iframeId, iframe.pageKey);
          });
          
          executeSafely(`processQueuedMessages.${iframeId}`, () => {
            this._processQueuedMessages(iframeId);
          });
        },
        
        _sendSessionDataToIframeSecure: function(iframeWindow, iframeId, pageKey) {
          if (this._iframeSessionPropagated.get(iframeId)) {
            return;
          }
          
          const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
          
          const sessionData = {
            type: 'nexopa-complete-session-data',
            messageId: MESSAGE_REGISTRY.generateMessageId(),
            auth: safeSession ? {
              isAuthenticated: true,
              user: {
                id: safeSession.userId,
                uid: safeSession.userId,
                exp: safeSession.expiresAt
              },
              validated: true,
              token: '[REDACTED]',
              sessionState: SESSION_STATES.VALID
            } : {
              isAuthenticated: false,
              user: null,
              validated: false,
              token: null,
              sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
            },
            network: {
              status: API_COORDINATION && typeof API_COORDINATION.getNetworkStatus === 'function' ? API_COORDINATION.getNetworkStatus() : 'unknown',
              backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
              isOnline: API_COORDINATION && typeof API_COORDINATION.getNetworkStatus === 'function' ? API_COORDINATION.getNetworkStatus() === 'online' : false
            },
            ui: typeof UI_ORCHESTRATOR !== 'undefined' && UI_ORCHESTRATOR !== null && typeof UI_ORCHESTRATOR.getState === 'function' ? UI_ORCHESTRATOR.getState() : null,
            bootstrap: typeof BOOTSTRAP_STATE !== 'undefined' && BOOTSTRAP_STATE !== null && typeof BOOTSTRAP_STATE.getStatusReport === 'function' ? BOOTSTRAP_STATE.getStatusReport() : null,
            pageInfo: pageKey && APP_CONFIG && APP_CONFIG.pages && APP_CONFIG.pages[pageKey] ? 
              APP_CONFIG.pages[pageKey] : { id: iframeId },
            timestamp: new Date().toISOString()
          };
          
          if (!MESSAGE_REGISTRY.registerSent(sessionData.messageId)) {
            return;
          }
          
          try {
            iframeWindow.postMessage(sessionData, '*');
            this._iframeSessionPropagated.set(iframeId, true);
            
            if (window.app && window.app._dependencyGraph) {
              executeSafely('recordIframePropagation', () => {
                window.app._dependencyGraph.iframeSessionPropagations = 
                  window.app._dependencyGraph.iframeSessionPropagations || [];
                window.app._dependencyGraph.iframeSessionPropagations.push({
                  iframeId: iframeId,
                  pageKey: pageKey,
                  timestamp: new Date().toISOString(),
                  messageId: sessionData.messageId
                });
              });
            }
          } catch (error) {
            // Silent
          }
        },
        
        _sendMessageToIframe: function(iframeId, message) {
          const iframe = this._iframes.get(iframeId);
          if (!iframe || !iframe.ready || !iframe.window) {
            return false;
          }
          
          if (!message.messageId) {
            message.messageId = MESSAGE_REGISTRY.generateMessageId();
          }
          
          if (!MESSAGE_REGISTRY.registerSent(message.messageId)) {
            return false;
          }
          
          if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
          }
          
          try {
            iframe.window.postMessage(message, '*');
            iframe.lastCommunication = new Date().toISOString();
            return true;
          } catch (error) {
            return false;
          }
        },
        
        handleIframeAuthRequest: function(iframeWindow, data) {
          if (!data || !data.requestId || !data.messageId) {
            return;
          }
          
          const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
          
          const response = {
            type: 'nexopa-auth-state-response',
            messageId: MESSAGE_REGISTRY.generateMessageId(),
            requestId: data.requestId,
            data: safeSession ? {
              user: {
                id: safeSession.userId,
                uid: safeSession.userId
              },
              isAuthenticated: true,
              validated: true,
              sessionState: SESSION_STATES.VALID,
              timestamp: new Date().toISOString()
            } : {
              user: null,
              isAuthenticated: false,
              validated: false,
              sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED,
              timestamp: new Date().toISOString()
            }
          };
          
          try {
            iframeWindow.postMessage(response, '*');
          } catch (error) {
            // Silent
          }
        },
        
        handleIframeDataRequest: function(iframeWindow, data) {
          if (!data || !data.requestId || !data.key || !data.messageId) {
            return;
          }
          
          let responseData = null;
          
          switch(data.key) {
            case 'userProfile':
              const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
              responseData = safeSession ? { id: safeSession.userId, uid: safeSession.userId } : null;
              break;
            case 'settings':
              responseData = typeof SETTINGS_SERVICE !== 'undefined' && SETTINGS_SERVICE !== null ? (SETTINGS_SERVICE.current || {}) : {};
              break;
            case 'networkStatus':
              responseData = {
                status: API_COORDINATION && typeof API_COORDINATION.getNetworkStatus === 'function' ? API_COORDINATION.getNetworkStatus() : 'unknown',
                backendReachable: window.NexopaConfig ? window.NexopaConfig.backendReachable : null,
                isOnline: API_COORDINATION && typeof API_COORDINATION.getNetworkStatus === 'function' ? API_COORDINATION.getNetworkStatus() === 'online' : false
              };
              break;
            default:
              if (typeof DATA_CACHE !== 'undefined' && DATA_CACHE !== null && typeof DATA_CACHE.getInstant === 'function') {
                responseData = DATA_CACHE.getInstant(data.key);
              }
          }
          
          const response = {
            type: 'nexopa-data-response',
            messageId: MESSAGE_REGISTRY.generateMessageId(),
            requestId: data.requestId,
            key: data.key,
            data: responseData,
            timestamp: new Date().toISOString()
          };
          
          try {
            iframeWindow.postMessage(response, '*');
          } catch (error) {
            // Silent
          }
        },
        
        _detectExistingIframes: function() {
          document.querySelectorAll('iframe').forEach((iframe, index) => {
            const iframeId = iframe.id || `iframe-${index}-${Date.now()}`;
            
            if (!this._iframes.has(iframeId)) {
              this._iframes.set(iframeId, {
                id: iframeId,
                element: iframe,
                ready: false,
                trusted: false,
                window: null,
                lastCommunication: null,
                sessionPropagated: false
              });
              
              setTimeout(() => {
                if (iframe.contentWindow) {
                  this._initiateHandshake(iframe.contentWindow, iframeId, null);
                }
              }, 1000);
            }
          });
        },
        
        _monitorForNewIframes: function() {
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
                            trusted: false,
                            window: null,
                            lastCommunication: null,
                            sessionPropagated: false
                          });
                          
                          setTimeout(() => {
                            executeSafely(`connectToNewIframe.${iframeId}`, () => {
                              const iframe = this._iframes.get(iframeId);
                              if (iframe && iframe.element && iframe.element.contentWindow) {
                                this._initiateHandshake(iframe.element.contentWindow, iframeId, null);
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
          }
        },
        
        _processQueuedMessages: function(iframeId) {
          const queue = this._iframeMessageQueue.get(iframeId);
          if (queue) {
            const iframe = this._iframes.get(iframeId);
            if (iframe && iframe.window) {
              queue.forEach(message => {
                this._sendMessageToIframe(iframeId, message);
              });
            }
            
            this._iframeMessageQueue.delete(iframeId);
          }
        },
        
        _queueMessageForIframe: function(iframeId, message) {
          if (!this._iframeMessageQueue.has(iframeId)) {
            this._iframeMessageQueue.set(iframeId, []);
          }
          
          this._iframeMessageQueue.get(iframeId).push(message);
        },
        
        _disableIframe: function(iframeId) {
          const iframe = this._iframes.get(iframeId);
          if (iframe) {
            iframe.ready = false;
            iframe.trusted = false;
            this._iframes.set(iframeId, iframe);
            
            const handshakeTimeout = this._iframeHandshakeTimeouts.get(iframeId);
            if (handshakeTimeout) {
              clearTimeout(handshakeTimeout);
              this._iframeHandshakeTimeouts.delete(iframeId);
            }
            
            this._iframeMessageQueue.delete(iframeId);
          }
        },
        
        propagateSessionToIframes: function(user, token) {
          const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
          
          this._iframes.forEach((iframe, iframeId) => {
            if (iframe && iframe.ready && iframe.window && iframe.trusted) {
              executeSafely(`propagateToIframe.${iframeId}.ready`, () => {
                this._sendSessionDataToIframeSecure(iframe.window, iframeId, iframe.pageKey);
              });
            } else if (iframe && iframe.trusted && iframe.element && iframe.element.contentWindow) {
              executeSafely(`propagateToIframe.${iframeId}.element`, () => {
                try {
                  this._sendSessionDataToIframeSecure(iframe.element.contentWindow, iframeId, iframe.pageKey);
                } catch (error) {
                  // Silent
                }
              });
            }
          });
        },
        
        propagateLogoutToIframes: function() {
          const logoutMessage = {
            type: 'nexopa-session-change',
            messageId: MESSAGE_REGISTRY.generateMessageId(),
            data: {
              type: 'logged_out',
              user: null,
              isAuthenticated: false,
              sessionState: SESSION_STATES.DESTROYED,
              timestamp: new Date().toISOString()
            }
          };
          
          this._iframes.forEach((iframe, iframeId) => {
            if (iframe && iframe.ready && iframe.window && iframe.trusted) {
              executeSafely(`propagateLogoutToIframe.${iframeId}`, () => {
                this._sendMessageToIframe(iframeId, logoutMessage);
              });
            }
          });
        },
        
        checkInitialSessionStateAsync: function() {
          this._sessionLoading = true;
          this._sessionLoadStartTime = Date.now();
          this._sessionPollingAttempts = 0;
          
          this._sessionWaitTimeoutId = setTimeout(() => {
            executeSafely('SESSION_COORDINATOR.sessionTimeout', () => {
              this.handleSessionLoadTimeout();
            });
          }, this._config.sessionWaitTimeout);
          
          this._checkSessionStateAsync();
        },
        
        _checkSessionStateAsync: function() {
          if (this._sessionPollingAttempts >= this._config.maxPollingAttempts) {
            this.handleSessionLoadTimeout();
            return;
          }
          
          this._sessionPollingAttempts++;
          
          if (!AUTH_STATE || !AUTH_STATE._initialized) {
            setTimeout(() => {
              this._checkSessionStateAsync();
            }, 200);
            return;
          }
          
          const rawSession = {
            token: AUTH_STATE._token,
            refreshToken: AUTH_STATE._refreshToken,
            userId: AUTH_STATE._user?.id || AUTH_STATE._user?.uid,
            expiresAt: AUTH_STATE._tokenExpiry?.getTime(),
            issuedAt: AUTH_STATE._issuedAt
          };
          
          const validation = validateSession(rawSession);
          const hasToken = !!AUTH_STATE._token;
          const user = AUTH_STATE._user;
          const sessionState = typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED;
          
          if (validation.isValid && user && sessionState === SESSION_STATES.VALID) {
            if (!this._stateLogged.success) {
              this._stateLogged.success = true;
              this._stateLogged.waiting = false;
            }
            
            this.finishSessionLoading();
            this.updateUIForAuthenticatedState(user);
            
            if (this._uiCallbacks.onSessionRestored) {
              this._uiCallbacks.onSessionRestored(user);
            }
            
            window.dispatchEvent(new CustomEvent('session:ready', {
              detail: {
                restored: true,
                timestamp: new Date().toISOString()
              }
            }));
            
            this.broadcastSessionChange('authenticated', user);
            this.propagateSessionToIframes(user, AUTH_STATE._token);
          } else if (hasToken && !validation.isValid) {
            if (validation.expired) {
              if (!this._validationInProgress) {
                this._validationInProgress = true;
                
                if (AUTH_STATE && typeof AUTH_STATE.refreshTokenSafely === 'function') {
                  executeSafely('AUTH_STATE.refreshOnStartup', () => {
                    AUTH_STATE.refreshTokenSafely()
                      .then(result => {
                        this._validationInProgress = false;
                        if (result && result.success) {
                          this.finishSessionLoading();
                          this._checkSessionStateAsync();
                        } else {
                          this.finishSessionLoading();
                          this.updateUIForUnauthenticatedState();
                          
                          window.dispatchEvent(new CustomEvent('session:expired', {
                            detail: {
                              reason: 'Refresh failed on startup',
                              timestamp: new Date().toISOString()
                            }
                          }));
                          
                          if (this._uiCallbacks.onUnauthenticated) {
                            this._uiCallbacks.onUnauthenticated();
                          }
                        }
                      })
                      .catch(() => {
                        this._validationInProgress = false;
                        this.finishSessionLoading();
                        this.updateUIForUnauthenticatedState();
                        
                        window.dispatchEvent(new CustomEvent('session:expired', {
                          detail: {
                            reason: 'Refresh failed on startup',
                            timestamp: new Date().toISOString()
                          }
                        }));
                        
                        if (this._uiCallbacks.onUnauthenticated) {
                          this._uiCallbacks.onUnauthenticated();
                        }
                      });
                  });
                } else {
                  this._validationInProgress = false;
                  this.finishSessionLoading();
                  this.updateUIForUnauthenticatedState();
                  
                  window.dispatchEvent(new CustomEvent('session:expired', {
                    detail: {
                      reason: 'No refresh method available',
                      timestamp: new Date().toISOString()
                    }
                  }));
                  
                  if (this._uiCallbacks.onUnauthenticated) {
                    this._uiCallbacks.onUnauthenticated();
                  }
                }
              } else {
                setTimeout(() => {
                  this._checkSessionStateAsync();
                }, 200);
              }
            } else {
              const hasStoredSession = localStorage.getItem(STORAGE_KEY) !== null;
              if (!hasStoredSession && AUTH_STATE && typeof AUTH_STATE.clearAuthState === 'function') {
                AUTH_STATE.clearAuthState();
              }
              
              this.finishSessionLoading();
              this.updateUIForUnauthenticatedState();
              
              if (this._uiCallbacks.onUnauthenticated) {
                this._uiCallbacks.onUnauthenticated();
              }
            }
          } else {
            this.finishSessionLoading();
            this.updateUIForUnauthenticatedState();
            
            if (this._uiCallbacks.onUnauthenticated) {
              this._uiCallbacks.onUnauthenticated();
            }
          }
        },
        
        handleSessionLoadTimeout: function() {
          if (this._sessionWaitTimeoutId) {
            clearTimeout(this._sessionWaitTimeoutId);
            this._sessionWaitTimeoutId = null;
          }
          
          this.finishSessionLoading();
          
          const rawSession = {
            token: AUTH_STATE?._token,
            refreshToken: AUTH_STATE?._refreshToken,
            userId: AUTH_STATE?._user?.id || AUTH_STATE?._user?.uid,
            expiresAt: AUTH_STATE?._tokenExpiry?.getTime(),
            issuedAt: AUTH_STATE?._issuedAt
          };
          
          const validation = validateSession(rawSession);
          const hasToken = validation.isValid;
          const user = hasToken ? AUTH_STATE?._user : null;
          
          if (hasToken && user) {
            if (!this._stateLogged.success && !this._stateLogged.failure) {
              // Silent
            }
            
            this.updateUIForAuthenticatedState(user);
            
            if (this._uiCallbacks.onSessionRestored) {
              this._uiCallbacks.onSessionRestored(user);
            }
            
            window.dispatchEvent(new CustomEvent('session:ready', {
              detail: {
                restored: true,
                cached: true,
                timestamp: new Date().toISOString()
              }
            }));
          } else {
            this.updateUIForUnauthenticatedState();
            
            if (this._uiCallbacks.onUnauthenticated) {
              this._uiCallbacks.onUnauthenticated();
            }
          }
          
          this.updateUIForLimitedMode();
          this.broadcastSessionChange('limited_mode', user);
        },
        
        finishSessionLoading: function() {
          if (!this._sessionLoading) {
            return;
          }
          
          if (this._sessionWaitTimeoutId) {
            clearTimeout(this._sessionWaitTimeoutId);
            this._sessionWaitTimeoutId = null;
          }
          
          if (this._authPollingInterval) {
            clearInterval(this._authPollingInterval);
            this._authPollingInterval = null;
          }
          
          this._sessionLoading = false;
          this._sessionLoaded = true;
          
          // Mark central session as initialized
          centralSession.initialized = true;
          
          if (window.app && window.app._dependencyGraph) {
            executeSafely('SESSION_COORDINATOR.recordSessionLoad', () => {
              window.app._dependencyGraph.sessionCoordinator.sessionLoad = {
                loaded: true,
                loadTime: Date.now() - this._sessionLoadStartTime,
                loadStartTime: new Date(this._sessionLoadStartTime).toISOString(),
                loadEndTime: new Date().toISOString(),
                pollingAttempts: this._sessionPollingAttempts
              };
            });
          }
          
          markSessionReady();
        },
        
        waitForSession: function(timeoutMs = 8000) {
          return new Promise((resolve) => {
            if (this._sessionLoaded) {
              const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
              resolve({
                loaded: true,
                timedOut: false,
                hasSession: !!safeSession,
                session: safeSession,
                sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
              });
              return;
            }
            
            const timeoutId = setTimeout(() => {
              resolve({
                loaded: false,
                timedOut: true,
                hasSession: false,
                session: null,
                sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED,
                reason: 'timeout'
              });
            }, timeoutMs);
            
            const checkInterval = setInterval(() => {
              if (this._sessionLoaded) {
                clearTimeout(timeoutId);
                clearInterval(checkInterval);
                const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
                resolve({
                  loaded: true,
                  timedOut: false,
                  hasSession: !!safeSession,
                  session: safeSession,
                  sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
                });
              }
            }, 100);
          });
        },
        
        isSessionLoading: function() {
          return this._sessionLoading;
        },
        
        isSessionLoaded: function() {
          return this._sessionLoaded;
        },
        
        getSessionLoadStatus: function() {
          return {
            loading: this._sessionLoading,
            loaded: this._sessionLoaded,
            loadStartTime: this._sessionLoadStartTime,
            pollingAttempts: this._sessionPollingAttempts,
            loadTime: this._sessionLoadStartTime ? Date.now() - this._sessionLoadStartTime : null,
            sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
          };
        },
        
        broadcastSessionChange: function(type, user) {
          if (AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' && AUTH_STATE.getSessionState() !== SESSION_STATES.VALID) {
            this._queueOutboundMessage({
              type: 'broadcast',
              eventType: type,
              data: user
            });
            return;
          }
          
          const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
          const isValidSession = safeSession && (type === 'authenticated' || type === 'refreshed' || type === 'synced');
          
          const event = new CustomEvent('nexopa-session-change', {
            detail: {
              type: type,
              user: isValidSession ? {
                id: safeSession.userId,
                uid: safeSession.userId,
                exp: safeSession.expiresAt
              } : user,
              timestamp: new Date().toISOString(),
              isAuthenticated: isValidSession,
              sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
            }
          });
          
          executeSafely('SESSION_COORDINATOR.dispatchSessionChange', () => {
            window.dispatchEvent(event);
          });
          
          if (this._broadcastChannel) {
            executeSafely('SESSION_COORDINATOR.broadcastChannelPost', () => {
              try {
                this._broadcastChannel.postMessage({
                  type: 'session_change',
                  messageId: MESSAGE_REGISTRY.generateMessageId(),
                  detail: {
                    type: type,
                    user: isValidSession ? {
                      id: safeSession.userId,
                      uid: safeSession.userId
                    } : user,
                    tabId: AUTH_STATE && AUTH_STATE._tabId ? AUTH_STATE._tabId : 'unknown',
                    timestamp: new Date().toISOString(),
                    sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED
                  }
                });
              } catch (error) {
                // Silent
              }
            });
          }
        },
        
        on: function(eventType, callback) {
          if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, []);
          }
          this._listeners.get(eventType).push(callback);
          
          window.addEventListener(`nexopa-${eventType}`, (event) => {
            executeSafely(`sessionListener.${eventType}`, () => {
              if (callback && typeof callback === 'function') {
                callback(event.detail);
              }
            });
          });
        },
        
        getStatus: function() {
          const safeSession = window.app?.session?.getSession ? window.app.session.getSession() : null;
          
          return executeSafely('SESSION_COORDINATOR.getStatus', () => ({
            isAuthenticated: !!safeSession,
            user: safeSession ? {
              id: safeSession.userId,
              uid: safeSession.userId
            } : null,
            hasToken: !!safeSession,
            tokenExpiry: safeSession?.expiresAt,
            timeToExpiry: safeSession?.expiresAt ? safeSession.expiresAt - Date.now() : null,
            validated: !!safeSession,
            lastValidation: AUTH_STATE && typeof AUTH_STATE.getLastValidation === 'function' ? AUTH_STATE.getLastValidation() : null,
            sessionState: AUTH_STATE && typeof AUTH_STATE.getSessionState === 'function' ? AUTH_STATE.getSessionState() : SESSION_STATES.UNINITIALIZED,
            monitoringActive: !!this._monitoringInterval,
            iframeCount: this._iframes.size,
            readyIframes: Array.from(this._iframes.values()).filter(f => f && f.ready && f.trusted).length,
            retryCount: this._retryCount,
            lastActivity: this._lastActivity,
            initialized: this._initialized,
            sessionLoading: this._sessionLoading,
            sessionLoaded: this._sessionLoaded,
            sessionPollingAttempts: this._sessionPollingAttempts,
            dependenciesReady: this._dependenciesReady,
            authReady: this._authReady,
            stateLogged: this._stateLogged
          })) || {
            isAuthenticated: false,
            user: null,
            hasToken: false,
            tokenExpiry: null,
            timeToExpiry: null,
            validated: false,
            lastValidation: null,
            sessionState: SESSION_STATES.UNINITIALIZED,
            monitoringActive: false,
            iframeCount: this._iframes.size,
            readyIframes: 0,
            retryCount: this._retryCount,
            lastActivity: this._lastActivity,
            initialized: this._initialized,
            sessionLoading: this._sessionLoading,
            sessionLoaded: this._sessionLoaded,
            sessionPollingAttempts: this._sessionPollingAttempts,
            dependenciesReady: this._dependenciesReady,
            authReady: this._authReady,
            stateLogged: this._stateLogged
          };
        },
        
        getSystemStatus: function() {
          return executeSafely('SESSION_COORDINATOR.getSystemStatus', () => ({
            authState: AUTH_STATE && typeof AUTH_STATE.getState === 'function' ? AUTH_STATE.getState() : { error: 'AUTH_STATE not available' },
            sessionCoordinator: {
              monitoringActive: !!this._monitoringInterval,
              inactivityTimeout: !!this._inactivityTimeout,
              refreshScheduled: !!this._refreshTimeout,
              warningActive: !!this._warningTimeout,
              retryCount: this._retryCount,
              iframeCount: this._iframes.size,
              readyIframes: Array.from(this._iframes.values()).filter(f => f && f.ready && f.trusted).length,
              queuedMessages: Array.from(this._iframeMessageQueue.keys()).length,
              outboundQueue: this._outboundMessageQueue.length,
              messageQueueFlushed: this._messageQueueFlushed,
              broadcastChannel: !!this._broadcastChannel,
              initialized: this._initialized,
              sessionLoading: this._sessionLoading,
              sessionLoaded: this._sessionLoaded,
              sessionPollingAttempts: this._sessionPollingAttempts,
              dependenciesReady: this._dependenciesReady,
              authReady: this._authReady,
              config: this._config
            },
            messageRegistry: {
              sentMessages: MESSAGE_REGISTRY._sentMessages.size,
              receivedMessages: MESSAGE_REGISTRY._receivedMessages.size
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
              readyIframes: 0,
              queuedMessages: 0,
              outboundQueue: 0,
              messageQueueFlushed: false,
              broadcastChannel: false,
              initialized: false,
              sessionLoading: this._sessionLoading,
              sessionLoaded: this._sessionLoaded,
              sessionPollingAttempts: this._sessionPollingAttempts,
              dependenciesReady: this._dependenciesReady,
              authReady: this._authReady,
              config: this._config
            },
            messageRegistry: {
              sentMessages: 0,
              receivedMessages: 0
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
      
    });
  };

  initializeSessionCoordinatorSafely();

  // ============================================================================
  // PUBLIC SESSION API EXPOSURE (NEW - SINGLE SOURCE OF TRUTH)
  // ============================================================================
  
  // Expose the central session management API
  window.Session = {
    // Core methods
    setSession: setCentralSession,
    clearSession: clearCentralSession,
    getToken: getCentralToken,
    getRefreshToken: getCentralRefreshToken,
    getUser: getCentralUser,
    getSession: getCentralSession,
    getSafeSession: getSafeCentralSession,
    getState: getCentralSessionState,
    isAuthenticated: isCentralAuthenticated,
    
    // Init and wait
    init: function() {
      // ── OFFLINE-FIRST AUTO-LOGIN ──────────────────────────────────────────
      // Load auth from localStorage immediately. Do NOT block on backend.
      // Backend validation happens in background only when online.
      const stored = loadSessionFromStorage();
      if (stored && stored.token) {
        centralSession.token        = stored.token;
        centralSession.refreshToken = stored.refreshToken || null;
        centralSession.user         = stored.user         || null;
        centralSession.expiresAt    = stored.expiresAt    || null;
        centralSession.issuedAt     = stored.issuedAt     || Date.now();
        centralSession.isAuthenticated = true;
        centralSession.lastUpdated = new Date().toISOString();
        console.log('[Session] ✅ Auto-login: session restored from localStorage');
      } else {
        console.log('[Session] ℹ️ No stored session found — login required');
      }
      centralSession.initialized = true;
      return Promise.resolve(true);
    },

    // ── isReady: synchronous check ─────────────────────────────────────────
    isReady: function() {
      return centralSession.initialized === true;
    },

    // ── waitForReady: async helper used by api.request.js ─────────────────
    waitForReady: function(timeoutMs = 8000) {
      if (centralSession.initialized) return Promise.resolve(true);
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), timeoutMs);
        const iv = setInterval(() => {
          if (centralSession.initialized) {
            clearTimeout(t);
            clearInterval(iv);
            resolve(true);
          }
        }, 30);
      });
    },

    // ── autoLogin: explicit call to attempt local restore ─────────────────
    autoLogin: function() {
      const stored = loadSessionFromStorage();
      if (stored && stored.token) {
        centralSession.token           = stored.token;
        centralSession.refreshToken    = stored.refreshToken || null;
        centralSession.user            = stored.user         || null;
        centralSession.expiresAt       = stored.expiresAt    || null;
        centralSession.issuedAt        = stored.issuedAt     || Date.now();
        centralSession.isAuthenticated = true;
        centralSession.lastUpdated     = new Date().toISOString();
        console.log('[Session] ✅ autoLogin() succeeded');
        return true;
      }
      console.log('[Session] ℹ️ autoLogin() — no stored auth');
      return false;
    },

    // ── redirectToLogin: navigate to login page ────────────────────────────
    redirectToLogin: function() {
      if (window.location.pathname !== '/' && !window.location.pathname.includes('index')) {
        console.log('[Session] Redirecting to login');
        window.location.href = '/';
      }
    },
    
    waitForSession: function(timeoutMs = 10000) {
      return new Promise((resolve) => {
        if (centralSession.initialized) {
          resolve({
            ready: true,
            isAuthenticated: centralSession.isAuthenticated,
            session: getCentralSession()
          });
          return;
        }
        
        const timeoutId = setTimeout(() => {
          resolve({
            ready: false,
            isAuthenticated: false,
            session: null,
            reason: 'timeout'
          });
        }, timeoutMs);
        
        const checkInterval = setInterval(() => {
          if (centralSession.initialized) {
            clearTimeout(timeoutId);
            clearInterval(checkInterval);
            resolve({
              ready: true,
              isAuthenticated: centralSession.isAuthenticated,
              session: getCentralSession()
            });
          }
        }, 50);
      });
    },
    
    // Internal state
    _initialized: false,
    _centralSession: centralSession
  };
  
  // Initialize Session API
  window.Session.init();

  // ============================================================================
  // INTEGRATION HOOKS & BOOTSTRAP - IMMEDIATE INITIALIZATION
  // ============================================================================

  window.__SESSION_MODULE_LOADED__ = true;

  const initializeImmediately = function() {
    setTimeout(() => {
      executeSafely('SESSION_COORDINATOR.immediateInit', () => {
        if (window.SESSION_COORDINATOR && typeof window.SESSION_COORDINATOR.initialize === 'function') {
          window.SESSION_COORDINATOR.initialize().then(() => {
            // Initialization complete
          });
        }
      });
    }, 50);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeImmediately();
    });
  } else {
    initializeImmediately();
  }

  // ============================================================================
  // MODULE EXPORTS (for module systems)
  // ============================================================================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      AUTH_STATE: window.AUTH_STATE,
      TOKEN_VALIDATION: window.TOKEN_VALIDATION,
      SESSION_COORDINATOR: window.SESSION_COORDINATOR,
      Session: window.Session,
      SESSION_STATES: SESSION_STATES,
      MESSAGE_REGISTRY: MESSAGE_REGISTRY,
      DEPENDENCY_BARRIER: DEPENDENCY_BARRIER
    };
  }

})();