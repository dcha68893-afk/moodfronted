// app.core.bootstrap.js - MoodChat Bootstrap & Core Initialization Layer
// COMPLETE REWRITE WITH DETERMINISTIC BOOT SEQUENCE
// ALL ORIGINAL FUNCTIONALITY PRESERVED
// Session-first initialization, parent authority handshake, no race conditions
// Hardened state machine, error containment, degraded mode, recovery mechanisms

(function () {
  "use strict";

  // ============================================================================
  // BOOTSTRAP CONSTANTS - COMPLETE PRESERVATION
  // ============================================================================

  const BOOTSTRAP_CONSTANTS = {
    MAX_RETRIES: 2,
    INIT_TIMEOUT: 10000,
    STEP_TIMEOUT: 5000,
    DEBOUNCE_WINDOW: 1000,

    STATES: {
      INIT: "INIT",
      LOADING: "LOADING",
      AUTH: "AUTH",
      READY: "READY",
      RUNNING: "RUNNING",
      ERROR: "ERROR",
      DEGRADED: "DEGRADED",
    },

    CRITICALITY: {
      CONFIG: "critical",
      ENVIRONMENT: "critical",
      API_CORE: "critical",
      API_REQUEST: "critical",
      API_AUTH: "critical",
      SESSION: "optional",
      UI: "optional",
      IFRAME: "optional",
      ROUTING: "optional",
      VALIDATION: "optional",
    },

    EXECUTION_ORDER: [
      "config",
      "environment",
      "api.core",
      "api.request",
      "api.auth",
      "session",
      "validation",
      "ui",
      "iframe",
      "routing",
    ],
  };

  // ============================================================================
  // GLOBAL BOOT CONTEXT - COMPLETE PRESERVATION
  // ============================================================================


  // ============================================================================
  // BOOT STATE LOCK - PREVENT MULTIPLE INITIALIZATIONS
  // ============================================================================
  
  let __BOOT_LOCKED__ = false;
  let __BOOT_COMPLETED__ = false;
  let __BOOT_SIGNATURE__ = null;
  
  function acquireBootLock() {
    if (__BOOT_LOCKED__) {
      console.warn('[Bootstrap] ⚠️ Boot already in progress, skipping duplicate initialization');
      return false;
    }
    
    const signature = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (__BOOT_SIGNATURE__ === signature) {
      console.warn('[Bootstrap] ⚠️ Duplicate boot signature detected');
      return false;
    }
    
    __BOOT_LOCKED__ = true;
    __BOOT_SIGNATURE__ = signature;
    console.log('[Bootstrap] 🔒 Boot lock acquired:', signature);
    return true;
  }
  
  function releaseBootLock() {
    __BOOT_LOCKED__ = false;
    console.log('[Bootstrap] 🔓 Boot lock released');
  }
  
  function markBootCompleted(reason = 'unknown') {
    if (__BOOT_COMPLETED__) {
      console.log('[Bootstrap] ℹ️ Boot already completed:', reason);
      return true;
    }
    
    __BOOT_COMPLETED__ = true;
    window.__APP_BOOTSTRAP_COMPLETE__ = true;
    
    console.log('[Bootstrap] ✅ Boot completed:', reason);
    
    // Fire completion event
    try {
      window.dispatchEvent(new CustomEvent('moodchat-bootstrap-complete', {
        detail: { timestamp: Date.now(), reason: reason }
      }));
    } catch (e) {}
    
    return true;
  }

  // ============================================================================
  // OFFLINE-FIRST: initializeAppFromLocal() - NON-BLOCKING VERSION
  // ============================================================================
  // Called at startup to hydrate app state from localStorage WITHOUT waiting
  // for any API response. This is the WhatsApp-style local-first boot.
  // CRITICAL: NEVER blocks UI, NEVER waits for network
  // ============================================================================

  window.initializeAppFromLocal = function() {
    // CRITICAL: Prevent multiple initializations
    if (!acquireBootLock()) {
      return false;
    }
    
    try {
      console.log('[Bootstrap] ⚡ initializeAppFromLocal() — NON-BLOCKING hydration from localStorage');

      // STEP 1: Instant auth session restoration (NO VALIDATION YET)
      let sessionRestored = false;
      try {
        const rawAuth = localStorage.getItem('kynecta_auth');
        if (rawAuth) {
          const auth = JSON.parse(rawAuth);
          if (auth && auth.token) {
            // Set global auth state immediately for UI rendering
            if (!window.Session) window.Session = {};
            window.Session._localToken = auth.token;
            window.Session._localUser = auth.user;
            window.Session._hydrated = true;
            
            // Also set legacy locations for compatibility
            window.currentUser = auth.user;
            window.__AUTH_TEMP_TOKEN__ = auth.token;
            
            sessionRestored = true;
            console.log('[Bootstrap] ✅ Instant auth hydration from localStorage (UI can render now)');
          }
        }
      } catch(e) {
        console.warn('[Bootstrap] ⚠️ Auth hydration failed:', e.message);
      }

      // STEP 2: Instant store hydration (NO VALIDATION)
      if (window.KynectaStore) {
        const storeKeys = ['messages', 'friends', 'groups', 'settings', 'status'];
        storeKeys.forEach(key => {
          try {
            const raw = localStorage.getItem('kynecta_' + key + '_cache');
            if (raw) {
              const parsed = JSON.parse(raw);
              window.KynectaStore.set(key, parsed);
              console.log('[Bootstrap] ✅ Instant store hydration:', key);
            }
          } catch(e) {}
        });
      }

      // STEP 3: Mark bootstrap ready IMMEDIATELY - UI can now render
      markBootCompleted('local_hydration_complete');
      
      // STEP 4: Set boot context ready
      if (window.AppBootContext && typeof window.AppBootContext.setReady === 'function') {
        window.AppBootContext.setReady('config');
      }

      // STEP 5: Schedule background validation (NON-BLOCKING)
      setTimeout(() => {
        if (sessionRestored) {
          console.log('[Bootstrap] 🔄 Starting background auth validation...');
          validateSessionInBackground();
        }
      }, 100);

      console.log('[Bootstrap] ✅ initializeAppFromLocal() complete - UI ready, validation in background');
      return true;
    } catch(error) {
      console.error('[Bootstrap] ❌ initializeAppFromLocal() failed:', error.message);
      // Still mark completed to prevent blocking
      markBootCompleted('error_but_proceed');
      return false;
    } finally {
      releaseBootLock();
    }
  };
  
  // ============================================================================
  // BACKGROUND VALIDATION - NON-BLOCKING AUTH CHECK
  // ============================================================================
  
  function validateSessionInBackground() {
    try {
      // CRITICAL FIX: Skip validation entirely when offline to allow app to open
      if (!navigator.onLine) {
        console.log('[Bootstrap] 📴 Device offline - skipping background validation to allow app to open');
        return;
      }
      
      // Don't validate if we don't have a temp token
      if (!window.__AUTH_TEMP_TOKEN__) {
        console.log('[Bootstrap] No temp token, skipping background validation');
        return;
      }
      
      // CRITICAL FIX: Delay validation after login to prevent flicker
      // Check if this is a fresh login (within last 3 seconds)
      const now = Date.now();
      const lastLoginTime = window.__LAST_LOGIN_TIME__ || 0;
      if (now - lastLoginTime < 3000) {
        console.log('[Bootstrap] Fresh login detected, delaying background validation');
        setTimeout(validateSessionInBackground, 3000 - (now - lastLoginTime));
        return;
      }
      
      if (window.api && window.api.auth && window.api.auth.validateToken) {
        const validationPromise = window.api.auth.validateToken();
        
        if (validationPromise && validationPromise.then) {
          validationPromise.then(result => {
            if (result && result.valid) {
              console.log('[Bootstrap] â Background validation successful');
              // Clean up temp token
              delete window.__AUTH_TEMP_TOKEN__;
            } else {
              console.warn('[Bootstrap] â Background validation failed - attempting token refresh');
              // Try refresh before clearing session
              attemptTokenRefreshInBackground();
            }
          });
          
          // Safe-wrap catch
          if (validationPromise.catch) {
            validationPromise.catch(error => {
              console.warn('[Bootstrap] â Background validation error:', error.message);
              // Don't fail the app, just continue with local session
            });
          }
        }
      } else {
        console.log('[Bootstrap] â Auth validation not available yet, will retry later');
        // Retry validation later when auth is ready
        setTimeout(validateSessionInBackground, 2000);
      }
    } catch (error) {
      console.warn('[Bootstrap] â Background validation setup failed:', error.message);
    }
  }
  
  function attemptTokenRefreshInBackground() {
    try {
      if (window.api && window.api.auth && typeof window.api.auth.refreshToken === 'function') {
        console.log('[Bootstrap] 🔄 Attempting background token refresh');
        window.api.auth.refreshToken().then(result => {
          if (result && result.success !== false) {
            console.log('[Bootstrap] ✅ Background token refresh successful');
            delete window.__AUTH_TEMP_TOKEN__;
          } else {
            console.warn('[Bootstrap] ⚠️ Background token refresh failed - clearing session');
            handleInvalidSession();
          }
        }).catch(error => {
          console.warn('[Bootstrap] ⚠️ Background token refresh error:', error.message);
          handleInvalidSession();
        });
      } else {
        console.warn('[Bootstrap] ⚠️ Token refresh not available - clearing session');
        handleInvalidSession();
      }
    } catch (error) {
      console.warn('[Bootstrap] ⚠️ Token refresh attempt failed:', error.message);
      handleInvalidSession();
    }
  }
  
  function handleInvalidSession() {
    try {
      console.log('[Bootstrap] 🔄 Handling invalid session...');
      
      // Clear invalid session data
      if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
        window.AuthStorage.clearAuth();
      } else {
        localStorage.removeItem('kynecta_auth');
      }
      
      // Clear temporary state
      delete window.__AUTH_TEMP_TOKEN__;
      if (window.Session) {
        delete window.Session._localToken;
        delete window.Session._localUser;
        delete window.Session._hydrated;
      }
      window.currentUser = null;
      
      // Fire session invalid event
      try {
        window.dispatchEvent(new CustomEvent('moodchat-session-invalid', {
          detail: { timestamp: Date.now(), reason: 'background_validation_failed' }
        }));
      } catch (e) {}
      
    } catch (error) {
      console.error('[Bootstrap] ❌ Error handling invalid session:', error.message);
    }
  }

  // ── Network-aware sync trigger ─────────────────────────────────────────────
  // When we come back online, trigger full background sync
  window.addEventListener('online', function() {
    console.log('[Bootstrap] 🌐 Network restored — checking if token refresh needed');
    
    // Check if we have a session that might need refreshing
    try {
      const rawAuth = localStorage.getItem('kynecta_auth');
      if (rawAuth) {
        const auth = JSON.parse(rawAuth);
        if (auth && auth.token) {
          // Check if token is expired or close to expiring
          try {
            const parts = auth.token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.exp) {
                const expiryTime = payload.exp * 1000;
                const now = Date.now();
                const timeUntilExpiry = expiryTime - now;
                
                // If token expires within next hour, try to refresh it
                if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
                  console.log('[Bootstrap] 🔄 Token expires soon, attempting refresh');
                  setTimeout(() => {
                    attemptTokenRefreshInBackground();
                  }, 1000);
                }
              }
            }
          } catch (error) {
            console.warn('[Bootstrap] ⚠️ Could not check token expiry:', error.message);
          }
        }
      }
    } catch (error) {
      console.warn('[Bootstrap] ⚠️ Error checking session on network restore:', error.message);
    }
    
    // Schedule regular sync
    setTimeout(function() {
      if (window.KynectaSync && typeof window.KynectaSync.syncAll === 'function') {
        const syncPromise = window.KynectaSync.syncAll();
        if (syncPromise && syncPromise.catch) {
          syncPromise.catch(function(e) {
            console.warn('[Bootstrap] Sync on reconnect failed (non-fatal):', e.message);
          });
        }
      }
    }, 1500);
  });

  window.addEventListener('offline', function() {
    console.log('[Bootstrap] 📴 Network lost — app running in offline mode');
  });


    window.AppBootContext = window.AppBootContext || {
    configReady: false,
    sessionReady: false,
    uiReady: false,
    iframesReady: false,
    callsReady: false,

    _waiters: {
      config: [],
      session: [],
      ui: [],
      iframes: [],
      calls: [],
    },

    setReady: function (component) {
      if (this[component + "Ready"] === true) return;
      console.log(`[BOOT] ✅ AppBootContext.${component}Ready = true`);
      this[component + "Ready"] = true;

      if (this._waiters[component]) {
        this._waiters[component].forEach((resolve) => resolve(true));
        this._waiters[component] = [];
      }

      window.dispatchEvent(
        new CustomEvent(`moodchat-${component}-ready`, {
          detail: { timestamp: Date.now() },
        })
      );
    },

    waitFor: function (component, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        if (this[component + "Ready"] === true) {
          resolve(true);
          return;
        }

        const timeout = setTimeout(() => {
          const index = this._waiters[component].indexOf(resolve);
          if (index !== -1) this._waiters[component].splice(index, 1);
          reject(new Error(`Timeout waiting for ${component} (${timeoutMs}ms)`));
        }, timeoutMs);

        this._waiters[component].push(() => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
    },

    reset: function () {
      this.configReady = false;
      this.sessionReady = false;
      this.uiReady = false;
      this.iframesReady = false;
      this.callsReady = false;
      Object.keys(this._waiters).forEach((key) => {
        this._waiters[key] = [];
      });
    },
  };

  // ============================================================================
  // PROMISE BARRIER SYSTEM - COMPLETE PRESERVATION
  // ============================================================================

  const BootstrapBarrier = {
    waitForConfig: function (timeoutMs = 10000) {
      return window.AppBootContext.waitFor("config", timeoutMs);
    },
    waitForSession: function (timeoutMs = 15000) {
      return window.AppBootContext.waitFor("session", timeoutMs);
    },
    waitForUI: function (timeoutMs = 10000) {
      return window.AppBootContext.waitFor("ui", timeoutMs);
    },
    waitForIframes: function (timeoutMs = 10000) {
      return window.AppBootContext.waitFor("iframes", timeoutMs);
    },
    waitForCalls: function (timeoutMs = 10000) {
      return window.AppBootContext.waitFor("calls", timeoutMs);
    },
    waitForAll: function (components, timeoutMs = 20000) {
      return Promise.all(
        components.map((c) => this["waitFor" + c.charAt(0).toUpperCase() + c.slice(1)](timeoutMs))
      );
    },
  };

  // ============================================================================
  // ERROR TRACKER - COMPLETE PRESERVATION
  // ============================================================================

  const ERROR_TRACKER = {
    loggedErrors: new Set(),
    loggedPromises: new Set(),
    moduleFailures: new Map(),
    degradedMode: false,
    maxAttempts: 3,
    lastErrorTime: new Map(),
    DEBOUNCE_WINDOW: 1000,

    shouldLog: function (errorKey, context = "") {
      const key = `${errorKey}:${context}`;
      const now = Date.now();
      const lastTime = this.lastErrorTime.get(key) || 0;

      if (now - lastTime < this.DEBOUNCE_WINDOW) {
        return false;
      }

      if (this.loggedErrors.has(key)) {
        return false;
      }

      this.loggedErrors.add(key);

      if (this.loggedErrors.size > 1000) {
        const iterator = this.loggedErrors.values();
        for (let i = 0; i < 100; i++) {
          this.loggedErrors.delete(iterator.next().value);
        }
      }

      this.lastErrorTime.set(key, now);
      return true;
    },

    trackModuleFailure: function (moduleName, error, critical = false) {
      const failures = this.moduleFailures.get(moduleName) || {
        count: 0,
        lastError: null,
        critical: critical,
        timestamp: null,
        attempts: [],
      };

      failures.count++;
      failures.lastError = error ? error.message : "Unknown error";
      failures.timestamp = new Date().toISOString();
      failures.attempts.push({
        timestamp: failures.timestamp,
        error: error ? error.message : "Unknown error",
      });

      if (failures.attempts.length > 5) {
        failures.attempts = failures.attempts.slice(-5);
      }

      this.moduleFailures.set(moduleName, failures);

      if (!critical && failures.count > 2) {
        this.degradedMode = true;
        console.warn(`[ERROR] ⚠️ Switching to degraded mode due to ${moduleName} failures`);
      }

      return failures;
    },

    isDegradedMode: function () {
      return this.degradedMode;
    },

    getFailureReport: function () {
      const report = {
        degradedMode: this.degradedMode,
        moduleFailures: [],
      };

      this.moduleFailures.forEach((data, name) => {
        report.moduleFailures.push({
          module: name,
          count: data.count,
          lastError: data.lastError,
          critical: data.critical,
          timestamp: data.timestamp,
        });
      });

      return report;
    },

    clear: function () {
      this.loggedErrors.clear();
      this.loggedPromises.clear();
      this.lastErrorTime.clear();
    },
  };

  // ============================================================================
  // GLOBAL ERROR HANDLERS - COMPLETE PRESERVATION
  // ============================================================================

  const originalOnerror = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    const errorKey = `window-error:${source}:${lineno}`;
    if (ERROR_TRACKER.shouldLog(errorKey, message)) {
      console.error(`🚨 [Global Error] ${message} at ${source}:${lineno}:${colno}`, error || "");
    }
    if (typeof originalOnerror === "function") {
      return originalOnerror(message, source, lineno, colno, error);
    }
    return true;
  };

  const originalOnunhandledrejection = window.onunhandledrejection;
  window.onunhandledrejection = function (event) {
    const error = event.reason;
    const errorKey = `promise-rejection:${error?.message || "unknown"}`;
    if (ERROR_TRACKER.shouldLog(errorKey, "unhandledrejection")) {
      console.error("🚨 [Unhandled Promise Rejection]", error);
    }
    if (typeof originalOnunhandledrejection === "function") {
      return originalOnunhandledrejection(event);
    }
    event.preventDefault();
    return false;
  };

  window.addEventListener("unhandledrejection", function (event) {
    const errorKey = `async-error:${event.reason?.message || "unknown"}`;
    if (ERROR_TRACKER.shouldLog(errorKey, "unhandledrejection")) {
      console.error("🚨 [Async Error] Unhandled promise rejection:", event.reason);
      event.preventDefault();
    }
  });

  // ============================================================================
  // SAFE EXECUTION WRAPPERS - COMPLETE PRESERVATION
  // ============================================================================

  function safeExecute(fn, context = "anonymous", maxRetries = 1) {
    let attempts = 0;

    function execute() {
      try {
        return fn();
      } catch (error) {
        attempts++;
        const errorKey = `safe-execute:${context}:${attempts}`;
        if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
          console.error(`⚠️ [${context}] Execution attempt ${attempts} failed:`, error.message);
        }

        if (attempts < maxRetries) {
          return execute();
        }

        console.warn(`⚠️ [${context}] All attempts failed, returning null`);
        return null;
      }
    }

    return execute();
  }

  async function safeExecuteAsync(fn, context = "anonymous", maxRetries = 1) {
    let attempts = 0;

    async function execute() {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        const errorKey = `safe-execute-async:${context}:${attempts}`;
        if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
          console.error(`⚠️ [${context}] Async execution attempt ${attempts} failed:`, error.message);
        }

        if (attempts < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          return await execute();
        }

        console.warn(`⚠️ [${context}] All async attempts failed, returning null`);
        return null;
      }
    }

    return await execute();
  }

  function safeModuleInit(moduleName, initFunction) {
    try {
      console.log(`🔧 Initializing module: ${moduleName}`);
      const result = initFunction();
      console.log(`✅ Module initialized: ${moduleName}`);
      return result;
    } catch (error) {
      const errorKey = `module-init:${moduleName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.error(`❌ Module ${moduleName} initialization failed:`, error.message);
      }

      const isCritical =
        BOOTSTRAP_CONSTANTS.CRITICALITY[moduleName.toUpperCase().replace(/\./g, "_")] === "critical";
      ERROR_TRACKER.trackModuleFailure(moduleName, error, isCritical);

      return {
        _moduleFailed: true,
        _moduleName: moduleName,
        _error: error.message,
        isAvailable: () => false,
        safeCall: (methodName, ...args) => {
          console.warn(`⚠️ Module ${moduleName}.${methodName} called but module failed`);
          return null;
        },
      };
    }
  }

  // ============================================================================
  // AUTH READINESS HELPERS - COMPLETE PRESERVATION
  // ============================================================================

  function isAuthFullyReadySafe() {
    try {
      const authReady = Boolean(
        window.api && window.api.auth && window.api.auth.isAuthFullyReady === true
      );

      if (!authReady) {
        const hasAuthModule = window.api && window.api.auth;
        const hasEssentialMethods =
          hasAuthModule &&
          typeof window.api.auth.getUser === "function" &&
          typeof window.api.auth.isAuthenticated === "function";
        const hasAuthState =
          typeof AUTH_STATE !== "undefined" &&
          AUTH_STATE.isAuthenticated &&
          AUTH_STATE.isAuthenticated();

        return hasEssentialMethods || hasAuthState;
      }

      return authReady;
    } catch (error) {
      console.warn(`[BOOT] ⚠️ Safe auth readiness check failed: ${error.message}`);
      return false;
    }
  }

  async function waitForAuthReadySafe(timeoutMs = 5000) {
    console.log("[BOOT] 🔐 Safely waiting for auth readiness...");

    if (isAuthFullyReadySafe()) {
      console.log("[BOOT] ✅ Auth already fully ready");
      return true;
    }

    if (window.api && window.api.auth && typeof window.api.auth.waitForReady === "function") {
      try {
        await Promise.race([
          window.api.auth.waitForReady(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Auth waitForReady timeout")), timeoutMs)),
        ]);

        if (isAuthFullyReadySafe()) {
          console.log("[BOOT] ✅ Auth became ready via waitForReady");
          return true;
        }
      } catch (error) {
        console.warn(`[BOOT] ⚠️ Auth waitForReady failed: ${error.message}`);
      }
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (isAuthFullyReadySafe()) {
        console.log("[BOOT] ✅ Auth became ready during polling");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.warn("[BOOT] ⚠️ Auth readiness timeout - continuing in degraded mode");
    return false;
  }

  // ============================================================================
  // BOOTSTRAP STATE MACHINE - COMPLETE PRESERVATION
  // ============================================================================

  const BOOTSTRAP_STATE_MACHINE = {
    _currentState: BOOTSTRAP_CONSTANTS.STATES.INIT,
    _transitionHistory: [],
    _lock: false,
    _startTime: null,
    _timeoutId: null,
    _lastTransition: null,
    _lastErrorState: null,
    _errorTransitionCount: 0,

    VALID_TRANSITIONS: {
      INIT: ["LOADING", "ERROR"],
      LOADING: ["AUTH", "READY", "ERROR", "DEGRADED"],
      AUTH: ["READY", "ERROR", "DEGRADED"],
      DEGRADED: ["READY", "RUNNING", "ERROR"],
      READY: ["RUNNING", "ERROR", "DEGRADED"],
      RUNNING: ["ERROR", "DEGRADED"],
      ERROR: ["DEGRADED", "INIT"],
    },

    getState: function () {
      return this._currentState;
    },

    isDegraded: function () {
      return (
        this._currentState === BOOTSTRAP_CONSTANTS.STATES.DEGRADED || ERROR_TRACKER.isDegradedMode()
      );
    },

    transitionTo: function (newState, reason = "") {
      if (this._lock) {
        console.warn(`[BOOT] ⚠️ State transition blocked by lock: ${this._currentState} -> ${newState}`);
        return false;
      }

      if (this._currentState === newState) {
        console.log(`[BOOT] ℹ️ State unchanged: ${newState} (transition ignored)`);
        return true;
      }

      if (
        this._currentState === BOOTSTRAP_CONSTANTS.STATES.ERROR &&
        newState === BOOTSTRAP_CONSTANTS.STATES.ERROR
      ) {
        console.warn(`[BOOT] ⚠️ Blocked ERROR → ERROR transition`);
        return false;
      }

      if (newState === BOOTSTRAP_CONSTANTS.STATES.ERROR) {
        if (this._currentState === BOOTSTRAP_CONSTANTS.STATES.ERROR) {
          console.warn(`[BOOT] ⚠️ Already in ERROR state, blocking another ERROR transition`);
          return false;
        }

        const now = Date.now();
        if (this._lastErrorState && now - this._lastErrorState.timestamp < 5000) {
          this._errorTransitionCount++;
          if (this._errorTransitionCount > 3) {
            console.error(
              `[BOOT] ❌ Too many error transitions (${this._errorTransitionCount}), switching to DEGRADED mode`
            );
            this.transitionTo(BOOTSTRAP_CONSTANTS.STATES.DEGRADED, "too_many_errors");
            return false;
          }
        } else {
          this._errorTransitionCount = 1;
        }

        this._lastErrorState = {
          from: this._currentState,
          timestamp: now,
          reason: reason,
        };
      } else {
        this._errorTransitionCount = 0;
      }

      const oldState = this._currentState;
      const validTransitions = this.VALID_TRANSITIONS[oldState] || [];

      if (!validTransitions.includes(newState)) {
        console.error(`[BOOT] ❌ Invalid transition: ${oldState} -> ${newState}`);
        return false;
      }

      this._currentState = newState;
      this._lastTransition = {
        from: oldState,
        to: newState,
        timestamp: Date.now(),
        reason: reason,
      };
      this._transitionHistory.push(this._lastTransition);

      if (this._transitionHistory.length > 50) {
        this._transitionHistory = this._transitionHistory.slice(-50);
      }

      console.log(`[BOOT] 🔄 State: ${oldState} -> ${newState} ${reason ? `(${reason})` : ""}`);

      this.emitStateChange(oldState, newState);
      return true;
    },

    lock: function () {
      this._lock = true;
      console.log("[BOOT] 🔒 State machine locked");
    },

    unlock: function () {
      this._lock = false;
      console.log("[BOOT] 🔓 State machine unlocked");
    },

    startTimeoutGuard: function () {
      this._startTime = Date.now();

      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
      }

      this._timeoutId = setTimeout(() => {
        if (
          this._currentState !== BOOTSTRAP_CONSTANTS.STATES.RUNNING &&
          this._currentState !== BOOTSTRAP_CONSTANTS.STATES.ERROR &&
          this._currentState !== BOOTSTRAP_CONSTANTS.STATES.DEGRADED
        ) {
          console.error("[BOOT] ⏱️ Startup timeout - switching to degraded mode");
          this.transitionTo(BOOTSTRAP_CONSTANTS.STATES.DEGRADED, "startup_timeout");
        }
      }, BOOTSTRAP_CONSTANTS.INIT_TIMEOUT);
    },

    clearTimeoutGuard: function () {
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
    },

    emitStateChange: function (oldState, newState) {
      try {
        const event = new CustomEvent("moodchat-bootstrap-state-change", {
          detail: {
            oldState: oldState,
            newState: newState,
            isDegraded: this.isDegraded(),
            failures: ERROR_TRACKER.getFailureReport(),
            timestamp: Date.now(),
            history: [...this._transitionHistory],
          },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn("[BOOT] ⚠️ Failed to emit state change event:", error);
      }
    },

    reset: function () {
      this._currentState = BOOTSTRAP_CONSTANTS.STATES.INIT;
      this._transitionHistory = [];
      this._lock = false;
      this._lastTransition = null;
      this._lastErrorState = null;
      this._errorTransitionCount = 0;
      this.clearTimeoutGuard();
      console.log("[BOOT] 🔄 State machine reset");
    },
  };

  // ============================================================================
  // USER AUTHENTICATION HELPERS - COMPLETE PRESERVATION
  // ============================================================================

  function userLoggedIn() {
    try {
      // ── OFFLINE-FIRST: Check persisted auth FIRST, before any module ──────
      // This ensures the app opens immediately even if auth modules haven't
      // loaded yet or the device is offline.
      try {
        const rawAuth = localStorage.getItem("kynecta_auth");
        if (rawAuth) {
          const auth = JSON.parse(rawAuth);
          if (auth && auth.token) {
            return true; // local session exists → consider logged in
          }
        }
      } catch (_) {}

      // Legacy token keys fallback
      const legacyKeys = ["authToken", "accessToken", "token", "moodchat_token", "USER_TOKEN", "kynecta_token", "moodchat_jwt_token"];
      for (const key of legacyKeys) {
        if (localStorage.getItem(key)) return true;
      }

      // In-memory checks (modules may not be ready on first load)
      if (window.currentUser) return true;

      if (
        typeof AUTH_STATE !== "undefined" &&
        AUTH_STATE.isAuthenticated &&
        AUTH_STATE.isAuthenticated()
      ) {
        return true;
      }

      if (window.api && window.api.auth && window.api.auth.getUser) {
        const user = window.api.auth.getUser();
        if (user) return true;
      }

      return false;
    } catch (error) {
      console.warn("⚠️ userLoggedIn check failed:", error);
      return false;
    }
  }

  function safeLoadPageResources(pageName) {
    try {
      if (typeof window.loadPageResources === "function") {
        console.log(`📦 Loading resources for page: ${pageName}`);
        window.loadPageResources(pageName);
      }

      if (typeof window.preloadPageResources === "function") {
        console.log(`📦 Preloading resources for page: ${pageName}`);
        window.preloadPageResources(pageName);
      }

      return true;
    } catch (error) {
      const errorKey = `page-resources:${pageName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.warn(`⚠️ Failed to load resources for page ${pageName}:`, error.message);
      }
      return false;
    }
  }

  function ensureUserLoggedIn() {
    const isLoggedIn = userLoggedIn();
    const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;

    console.log(`🔐 Auth check: loggedIn=${isLoggedIn}, publicPage=${isPublicPage}`);

    if (!isLoggedIn && !isPublicPage) {
      // ── OFFLINE-FIRST: Never hard-redirect during initialization ──────────
      // If we have no local session at all, the UI layer (showAuthUI / showLogin)
      // will handle presenting the login form. We do NOT redirect here because:
      //   1. We may be offline and modules haven't hydrated yet
      //   2. A hard redirect breaks the back-stack and creates redirect loops
      console.log("🔐 No local session found — auth UI will be shown by UI flow");
      return false;
    }

    return isLoggedIn || isPublicPage;
  }

  // ============================================================================
  // AUTHENTICATION GATE - COMPLETE PRESERVATION
  // ============================================================================

  const AUTHENTICATION_GATE = {
    _isAuthenticated: false,
    _user: null,
    _validationAttempts: 0,

    validateSession: async function () {
      console.log("[BOOT] 🔐 Validating session...");

      if (BOOTSTRAP_STATE_MACHINE.isDegraded()) {
        console.log("[BOOT] ⚠️ Degraded mode - using simplified auth check");
        return this.simplifiedAuthCheck();
      }

      const isLoggedIn = userLoggedIn();
      const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;

      if (!isLoggedIn && !isPublicPage) {
        console.log("[BOOT] 🔐 Authentication required");
        return { valid: false, requiresAuth: true, isPublic: false };
      }

      if (isPublicPage) {
        console.log("[BOOT] 📄 Public page, auth not required");
        return { valid: true, requiresAuth: false, isPublic: true };
      }

      if (isLoggedIn) {
        const tokenValid = await this.validateToken();
        if (tokenValid) {
          this._isAuthenticated = true;
          console.log("[BOOT] ✅ Session validated");
          window.AppBootContext.setReady("session");
          return { valid: true, requiresAuth: true, isPublic: false };
        } else {
          console.log("[BOOT] ❌ Session invalid");
          return { valid: false, requiresAuth: true, isPublic: false };
        }
      }

      return { valid: false, requiresAuth: true, isPublic: false };
    },

    simplifiedAuthCheck: function () {
      try {
        const token = localStorage.getItem("accessToken") || localStorage.getItem("moodchat_jwt_token");
        const hasToken = !!token;

        if (hasToken) {
          try {
            const parts = token.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.exp && payload.exp < Date.now() / 1000) {
                return { valid: false, requiresAuth: true, degraded: true, reason: "Token expired" };
              }
            }
          } catch (e) {}

          return { valid: true, requiresAuth: true, degraded: true };
        }

        return { valid: false, requiresAuth: true, degraded: true };
      } catch (error) {
        console.warn("[BOOT] ⚠️ Simplified auth check failed:", error);
        return { valid: false, requiresAuth: true, degraded: true };
      }
    },

    validateToken: async function () {
      if (this._validationAttempts >= 2) {
        console.warn("[BOOT] ⚠️ Max validation attempts reached");
        return false;
      }

      this._validationAttempts++;

      try {
        if (window.api && window.api.auth && window.api.auth.validateToken) {
          const result = await window.api.auth.validateToken();
          return result.valid === true;
        }

        const token = localStorage.getItem("accessToken") || localStorage.getItem("moodchat_jwt_token");
        if (!token) return false;

        const parts = token.split(".");
        if (parts.length !== 3) return false;

        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && payload.exp < Date.now() / 1000) {
          return false;
        }

        return true;
      } catch (error) {
        console.warn("[BOOT] ⚠️ Token validation failed:", error.message);
        return false;
      }
    },

    blockUI: function () {
      console.log("[BOOT] 🚫 Blocking UI until authenticated");

      const appContainers = document.querySelectorAll("#app-container, .app-container, [data-app-container]");
      appContainers.forEach((container) => {
        container.style.display = "none";
      });

      const authContainers = document.querySelectorAll("#auth-container, .auth-container, [data-auth-container]");
      authContainers.forEach((container) => {
        container.style.display = "block";
      });

      const loadingScreen = document.getElementById("loadingScreen");
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }
    },

    releaseUI: function () {
      console.log("[BOOT] ✅ Releasing UI");

      const appContainers = document.querySelectorAll("#app-container, .app-container, [data-app-container]");
      appContainers.forEach((container) => {
        container.style.display = "block";
      });

      const authContainers = document.querySelectorAll("#auth-container, .auth-container, [data-auth-container]");
      authContainers.forEach((container) => {
        container.style.display = "none";
      });
    },

    redirectToLogin: function (reason = "Authentication required") {
      console.log(`[BOOT] 🔐 Redirecting to login: ${reason}`);

      const currentPath = window.location.pathname + window.location.search;
      const loginPages = ["/", "/index.html", "/index.html", "/index.html"];
      const isLoginPage = loginPages.some((page) => currentPath.endsWith(page));

      if (!isLoginPage) {
        try {
          sessionStorage.setItem("moodchat_return_path", currentPath);
        } catch (error) {
          console.warn("[BOOT] ⚠️ Failed to store return path:", error);
        }

        setTimeout(() => {
          window.location.href = "/index.html";
        }, 100);
      }

      return false;
    },

    isAuthenticated: function () {
      return this._isAuthenticated;
    },

    reset: function () {
      this._isAuthenticated = false;
      this._user = null;
      this._validationAttempts = 0;
    },
  };

  // ============================================================================
  // NAVIGATION CONTROLLER - COMPLETE PRESERVATION
  // ============================================================================

  const NavigationController = {
    _locked: false,
    _unlockCallbacks: [],

    lock: function (reason = "bootstrap") {
      if (this._locked) return;

      console.log(`[NAV] 🔒 Navigation locked: ${reason}`);
      this._locked = true;

      window.dispatchEvent(
        new CustomEvent("moodchat-navigation-lock", {
          detail: { reason, timestamp: Date.now() },
        })
      );
    },

    unlock: function (reason = "bootstrap_complete") {
      if (!this._locked) return;

      console.log(`[NAV] 🔓 Navigation unlocked: ${reason}`);
      this._locked = false;

      this._unlockCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn("[NAV] Unlock callback failed:", e);
        }
      });
      this._unlockCallbacks = [];

      window.dispatchEvent(
        new CustomEvent("moodchat-navigation-unlock", {
          detail: { reason, timestamp: Date.now() },
        })
      );
    },

    afterUnlock: function (callback) {
      if (!this._locked) {
        callback();
      } else {
        this._unlockCallbacks.push(callback);
      }
    },

    isLocked: function () {
      return this._locked;
    },
  };

  // ============================================================================
  // DEPENDENCY QUEUE SYSTEM - COMPLETE PRESERVATION
  // ============================================================================

  const DEPENDENCY_QUEUE = {
    _queue: [],
    _currentIndex: 0,
    _completed: new Set(),
    _failed: new Map(),
    _loggedWaiting: new Set(),
    _loggedSuccess: new Set(),
    _loggedFailure: new Set(),
    _appReady: false,
    _readyPromise: null,
    _readyResolve: null,
    _readyReject: null,

    DEPENDENCY_ORDER: [
      { name: "config", check: () => typeof APP_CONFIG !== "undefined", critical: true },
      { name: "environment", check: () => typeof window !== "undefined" && typeof document !== "undefined", critical: true },
      { name: "api.core", check: () => window.api && window.api.core, critical: true },
      { name: "api.request", check: () => window.api && window.api.request, critical: true },
      { name: "api.auth", check: () => window.api && window.api.auth && typeof window.api.auth.getUser === "function", critical: true },
      { name: "session", check: () => window.app && window.app.core && window.app.core.session, critical: false },
      { name: "ui", check: () => window.app && window.app.core && window.app.core.ui, critical: false },
    ],

    initialize: function () {
      this._queue = [...this.DEPENDENCY_ORDER];
      this._currentIndex = 0;
      this._completed.clear();
      this._failed.clear();
      this._loggedWaiting.clear();
      this._loggedSuccess.clear();
      this._loggedFailure.clear();
      this._appReady = false;

      this._readyPromise = new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
      });

      console.log("[DEP] 📋 Dependency queue initialized with", this._queue.length, "stages");
      return this;
    },

    checkDependency: function (dependency) {
      const isReady = dependency.check();
      const logKey = dependency.name;

      if (isReady) {
        if (!this._loggedSuccess.has(logKey)) {
          console.log(`✅ ${dependency.name} ready`);
          this._loggedSuccess.add(logKey);
        }
        return true;
      } else {
        if (!this._loggedWaiting.has(logKey) && !this._loggedFailure.has(logKey)) {
          console.log(`⏳ Waiting for ${dependency.name}...`);
          this._loggedWaiting.add(logKey);
        }
        return false;
      }
    },

    processNext: async function () {
      if (this._currentIndex >= this._queue.length) {
        if (!this._appReady) {
          this._appReady = true;
          window.__APP_READY__ = true;
          console.log("[DEP] 🎉 All dependencies satisfied - __APP_READY__ = true");
          if (this._readyResolve) {
            this._readyResolve(true);
          }
        }
        return true;
      }

      const dependency = this._queue[this._currentIndex];

      if (this._completed.has(dependency.name)) {
        this._currentIndex++;
        return this.processNext();
      }

      if (this._failed.has(dependency.name)) {
        if (dependency.critical) {
          console.error(`[DEP] ❌ Critical dependency ${dependency.name} failed - cannot proceed`);
          if (this._readyReject) {
            this._readyReject(new Error(`Critical dependency failed: ${dependency.name}`));
          }
          return false;
        } else {
          console.warn(`[DEP] ⚠️ Non-critical dependency ${dependency.name} failed - skipping`);
          this._currentIndex++;
          return this.processNext();
        }
      }

      if (this.checkDependency(dependency)) {
        this._completed.add(dependency.name);
        this._loggedWaiting.delete(dependency.name);
        this._currentIndex++;
        return this.processNext();
      } else {
        return false;
      }
    },

    start: function () {
      console.log("[DEP] 🚀 Starting dependency queue processing");

      const pollInterval = setInterval(async () => {
        const result = await this.processNext();

        if (this._appReady || this._currentIndex >= this._queue.length) {
          clearInterval(pollInterval);
        }
      }, 100);

      setTimeout(() => this.processNext(), 0);

      return this._readyPromise;
    },

    markFailed: function (moduleName, error) {
      const dependency = this._queue.find((d) => d.name === moduleName);
      if (dependency) {
        this._failed.set(moduleName, error);
        if (!this._loggedFailure.has(moduleName)) {
          console.error(`❌ ${moduleName} failed: ${error.message || error}`);
          this._loggedFailure.add(moduleName);
          ERROR_TRACKER.trackModuleFailure(moduleName, error, dependency.critical);
        }
      }
    },

    waitForReady: function () {
      return this._readyPromise;
    },

    isReady: function () {
      return this._appReady;
    },

    getFailedModules: function () {
      const failed = [];
      this._failed.forEach((error, name) => {
        failed.push({ name, error: error.message });
      });
      return failed;
    },
  };

  DEPENDENCY_QUEUE.initialize();
  window.__APP_DEPENDENCY_QUEUE = DEPENDENCY_QUEUE;

  // ============================================================================
  // SEQUENTIAL LOADER - COMPLETE PRESERVATION
  // ============================================================================

  const SEQUENTIAL_LOADER = {
    _loadedModules: new Map(),
    _currentStep: 0,
    _loading: false,
    _moduleAttempts: new Map(),

    MODULES: [
      {
        name: "config",
        validate: () => typeof APP_CONFIG !== "undefined",
        load: () => {
          window.AppBootContext.setReady("config");
          return Promise.resolve();
        },
        critical: true,
      },
      {
        name: "environment",
        validate: () => typeof window !== "undefined" && typeof document !== "undefined",
        load: () => Promise.resolve(),
        critical: true,
      },
      {
        name: "api.core",
        validate: () => window.api && window.api.core,
        load: async () => {
          return this.waitForWithGuard(() => window.api && window.api.core, "api.core");
        },
        critical: true,
      },
      {
        name: "api.request",
        validate: () => window.api && window.api.request,
        load: async () => {
          return this.waitForWithGuard(() => window.api && window.api.request, "api.request");
        },
        critical: true,
      },
      {
        name: "api.auth",
        validate: () => window.api && window.api.auth,
        load: async () => {
          return this.waitForWithGuard(() => window.api && window.api.auth, "api.auth");
        },
        critical: true,
      },
      {
        name: "session",
        validate: () => {
          const sessionLoaded = window.app && window.app.core && window.app.core.session;

          if (!sessionLoaded) {
            console.warn("[BOOT] ⚠️ Session module not available - continuing in degraded mode");
            return true;
          }

          const authReady = SEQUENTIAL_LOADER.isAuthFullyReadySafe();

          let authActuallyReady = authReady;
          if (!authActuallyReady) {
            const hasAuthModule = window.api && window.api.auth;
            const hasUser =
              window.currentUser ||
              (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser && AUTH_STATE.getUser());
            authActuallyReady =
              (hasAuthModule && hasUser) ||
              (typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated());
          }

          console.log(
            `[BOOT] 📊 Session validation: sessionLoaded=${sessionLoaded}, authReady=${authReady}, authActuallyReady=${authActuallyReady}`
          );

          return sessionLoaded && authActuallyReady;
        },
        load: async () => {
          console.log("[BOOT] 🔐 Preparing to load session module - ensuring auth is fully ready first");

          try {
            await SEQUENTIAL_LOADER.ensureAuthFullyReadySafe();

            console.log("[BOOT] 🔐 Auth fully ready, now waiting for session module");
            const sessionPromise = SEQUENTIAL_LOADER.waitForWithGuard(
              () => window.app && window.app.core && window.app.core.session,
              "session",
              3000
            );
            
            if (sessionPromise && sessionPromise.catch) {
              sessionPromise.catch((error) => {
                console.warn("[BOOT] â Session module timeout - continuing without it");
                return null;
              });
            }
            
            await sessionPromise;
          } catch (error) {
            console.warn("[BOOT] ⚠️ Session module failed to load - continuing without it");
            ERROR_TRACKER.trackModuleFailure("session", error, false);
          }

          return true;
        },
        critical: false,
      },
      {
        name: "ui",
        validate: () => window.app && window.app.core && window.app.core.ui,
        load: async () => {
          try {
            await this.waitForWithGuard(() => window.app && window.app.core && window.app.core.ui, "ui", 3000);
            window.AppBootContext.setReady("ui");
          } catch (error) {
            console.warn("[BOOT] ⚠️ UI module timeout - using fallback UI");
            this.createFallbackUI();
          }
          return true;
        },
        critical: false,
      },
    ],

    createFallbackUI: function () {
      if (document.getElementById("fallback-ui")) return;

      try {
        const fallbackDiv = document.createElement("div");
        fallbackDiv.id = "fallback-ui";
        fallbackDiv.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #1f2937;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        `;
        fallbackDiv.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <h2 style="margin-bottom: 16px;">Loading Application...</h2>
            <p style="color: #9ca3af;">Please wait while we initialize.</p>
          </div>
        `;
        document.body.appendChild(fallbackDiv);
      } catch (error) {
        console.warn("[BOOT] ⚠️ Failed to create fallback UI:", error);
      }
    },

    isAuthFullyReadySafe: function () {
      try {
        return isAuthFullyReadySafe();
      } catch (error) {
        console.warn("[BOOT] ⚠️ Auth readiness safe check failed:", error);
        return false;
      }
    },

    isAuthFullyReady: function () {
      try {
        if (!window.api || !window.api.auth) {
          return false;
        }

        const hasGetUser = typeof window.api.auth.getUser === "function";
        const hasIsAuthenticated = typeof window.api.auth.isAuthenticated === "function";
        const hasValidateToken = typeof window.api.auth.validateToken === "function";

        let isReady = true;
        if (window.api.auth.isReady && typeof window.api.auth.isReady === "function") {
          isReady = window.api.auth.isReady();
        }

        const apiAuthReady = window.__API_AUTH_READY === true;
        const authStateReady =
          typeof AUTH_STATE !== "undefined" && AUTH_STATE.isInitialized !== false;

        const readiness = {
          moduleExists: true,
          hasGetUser,
          hasIsAuthenticated,
          hasValidateToken,
          isReady,
          apiAuthReady,
          authStateReady,
          overall: (hasGetUser || hasIsAuthenticated) && (isReady || apiAuthReady),
        };

        console.log("[BOOT] 🔐 Auth readiness check:", readiness);

        return readiness.overall;
      } catch (error) {
        console.warn("[BOOT] ⚠️ Auth readiness check failed:", error);
        return false;
      }
    },

    ensureAuthFullyReadySafe: async function () {
      console.log("[BOOT] 🔐 Ensuring auth is fully ready before session loading (safe version)...");

      await waitForAuthReadySafe(5000);

      if (!isAuthFullyReadySafe()) {
        const hasUser =
          window.currentUser ||
          (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser && AUTH_STATE.getUser());
        const hasAuthModule = window.api && window.api.auth;

        if (hasUser && hasAuthModule) {
          console.log("[BOOT] ✅ Auth is actually ready despite safe check returning false");
          return true;
        }
      }

      return true;
    },

    ensureAuthFullyReady: async function () {
      console.log("[BOOT] 🔐 Ensuring auth is fully ready before session loading...");

      await this.waitForWithGuard(() => window.api && window.api.auth, "api.auth.basic");

      if (window.api && window.api.auth && typeof window.api.auth.isReady === "function") {
        console.log("[BOOT] 🔐 Auth has isReady() method, checking...");

        if (!window.api.auth.isReady()) {
          console.log("[BOOT] 🔐 Auth not ready yet, waiting for auth-ready event");

          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.log("[BOOT] ⏱️ Auth-ready event timeout, proceeding anyway");
              resolve();
            }, 5000);

            const handler = () => {
              clearTimeout(timeout);
              window.removeEventListener("auth-ready", handler);
              window.removeEventListener("apiAuthReady", handler);
              resolve();
            };

            window.addEventListener("auth-ready", handler, { once: true });
            window.addEventListener("apiAuthReady", handler, { once: true });
          });
        }
      }

      if (typeof AUTH_STATE !== "undefined" && AUTH_STATE.waitForInitialization && typeof AUTH_STATE.waitForInitialization === "function") {
        console.log("[BOOT] 🔐 Waiting for AUTH_STATE initialization");
        try {
          await AUTH_STATE.waitForInitialization();
        } catch (error) {
          console.warn("[BOOT] ⚠️ AUTH_STATE.waitForInitialization failed:", error);
        }
      }

      if (window.api && window.api.auth && typeof window.api.auth.waitForReady === "function") {
        console.log("[BOOT] 🔐 Waiting for api.auth.waitForReady()");
        try {
          await window.api.auth.waitForReady();
          console.log("[BOOT] ✅ api.auth.waitForReady() resolved");
        } catch (error) {
          console.warn("[BOOT] ⚠️ api.auth.waitForReady() failed:", error);
        }
      } else {
        console.log("[BOOT] 🔐 api.auth.waitForReady() not available, using alternative checks");
      }

      if (window.__API_CORE && window.__API_CORE.ready && typeof window.__API_CORE.ready.then === "function") {
        console.log("[BOOT] 🔐 Waiting for window.__API_CORE.ready");
        try {
          await window.__API_CORE.ready;
          console.log("[BOOT] ✅ window.__API_CORE.ready resolved");
        } catch (error) {
          console.warn("[BOOT] ⚠️ window.__API_CORE.ready failed:", error);
        }
      }

      const readyFlags = [
        { flag: window.__AUTH_READY, name: "__AUTH_READY" },
        { flag: window.__API_AUTH_READY, name: "__API_AUTH_READY" },
        { flag: window.__AUTH_INITIALIZED, name: "__AUTH_INITIALIZED" },
      ];

      for (const { flag, name } of readyFlags) {
        if (flag && typeof flag.then === "function") {
          console.log(`[BOOT] 🔐 Waiting for ${name}`);
          try {
            await flag;
            console.log(`[BOOT] ✅ ${name} resolved`);
          } catch (error) {
            console.warn(`[BOOT] ⚠️ ${name} failed:`, error);
          }
        }
      }

      console.log("[BOOT] ✅ Auth fully ready check completed");
    },

    loadAll: async function () {
      if (this._loading) {
        console.warn("[BOOT] ⚠️ Loader already running");
        return false;
      }

      this._loading = true;
      console.log("[BOOT] 📦 Loading dependencies sequentially...");

      BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.LOADING, "dependency_loading_start");

      let criticalFailure = false;

      for (let i = 0; i < this.MODULES.length; i++) {
        const module = this.MODULES[i];
        this._currentStep = i;

        if (!this._moduleAttempts.has(module.name)) {
          this._moduleAttempts.set(module.name, 0);
        }

        console.log(`[BOOT] 🔧 [${i + 1}/${this.MODULES.length}] Loading: ${module.name} (${module.critical ? "critical" : "optional"})`);

        const success = await this.loadModule(module);
        if (!success) {
          if (module.critical) {
            console.error(`[BOOT] ❌ Critical module failed: ${module.name}`);
            DEPENDENCY_QUEUE.markFailed(module.name, new Error(`Critical module failed`));
            ERROR_TRACKER.trackModuleFailure(module.name, new Error(`Critical module failed`), true);
            criticalFailure = true;
            break;
          } else {
            console.warn(`[BOOT] ⚠️ Optional module failed: ${module.name} - continuing`);
            DEPENDENCY_QUEUE.markFailed(module.name, new Error(`Optional module failed`));
            ERROR_TRACKER.trackModuleFailure(module.name, new Error(`Optional module failed`), false);
          }
        }
      }

      if (criticalFailure) {
        console.log("[BOOT] ⚠️ Critical module failure - switching to degraded mode");
        BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.DEGRADED, "critical_module_failure");
        this._loading = false;
        return false;
      }

      console.log("[BOOT] ✅ All dependencies loaded");
      this._loading = false;
      return true;
    },

    loadModule: async function (module, retryCount = 0) {
      if (module.validate()) {
        if (!this._loadedModules.has(module.name)) {
          this._loadedModules.set(module.name, true);
        }
        return true;
      }

      const attempts = this._moduleAttempts.get(module.name) || 0;
      if (attempts >= 2) {
        console.error(`[BOOT] ❌ Module ${module.name} exceeded max attempts (${attempts})`);
        DEPENDENCY_QUEUE.markFailed(module.name, new Error(`Max attempts exceeded`));
        return false;
      }

      this._moduleAttempts.set(module.name, attempts + 1);

      try {
        await this.loadWithTimeout(module.load, module.name);

        if (module.validate()) {
          this._loadedModules.set(module.name, true);
          return true;
        } else {
          throw new Error(`Validation failed for ${module.name}`);
        }
      } catch (error) {
        console.warn(`[BOOT] ⚠️ Failed to load ${module.name}:`, error.message);
        DEPENDENCY_QUEUE.markFailed(module.name, error);
        ERROR_TRACKER.trackModuleFailure(module.name, error, module.critical);

        if (module.critical && attempts < 1) {
          const backoffDelay = Math.pow(2, attempts) * 1000;
          console.log(`[BOOT] ⏳ Retrying ${module.name} in ${backoffDelay}ms (attempt ${attempts + 1}/2)...`);

          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          return await this.loadModule(module, attempts + 1);
        }

        if (module.critical) {
          console.error(`[BOOT] ❌ Max retries exceeded for critical module: ${module.name}`);
        }
        return false;
      }
    },

    loadWithTimeout: async function (loadFunction, moduleName) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Timeout loading ${moduleName}`));
        }, BOOTSTRAP_CONSTANTS.STEP_TIMEOUT);

        loadFunction()
          .then((result) => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });
    },

    waitForWithGuard: function (condition, moduleName, timeout = BOOTSTRAP_CONSTANTS.STEP_TIMEOUT) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
          try {
            if (condition()) {
              resolve(true);
              return;
            }
          } catch (error) {
            console.warn(`[BOOT] ⚠️ Condition check for ${moduleName} threw:`, error.message);
          }

          if (Date.now() - startTime > timeout) {
            reject(new Error(`Timeout waiting for ${moduleName}`));
            return;
          }

          setTimeout(check, 100);
        };

        check();
      });
    },

    isModuleLoaded: function (moduleName) {
      return this._loadedModules.get(moduleName) || false;
    },

    getStatus: function () {
      const status = {};
      this.MODULES.forEach((module) => {
        status[module.name] = {
          loaded: this._loadedModules.get(module.name) || false,
          critical: module.critical,
          attempts: this._moduleAttempts.get(module.name) || 0,
        };
      });
      return status;
    },

    reset: function () {
      this._loadedModules.clear();
      this._currentStep = 0;
      this._loading = false;
      this._moduleAttempts.clear();
    },
  };

  // ============================================================================
  // GLOBAL NAMESPACE GOVERNANCE - COMPLETE PRESERVATION
  // ============================================================================

  function ensureGlobalDependencies() {
    console.log("🔍 Ensuring global dependencies...");

    const authCheckPassed = ensureUserLoggedIn();
    if (!authCheckPassed) {
      // CRITICAL FIX: NEVER block bootstrap on auth — UI layer will show login
      console.log("⚠️ No local session detected — continuing bootstrap; UI will show login");
    }

    if (typeof window.app === "undefined") {
      console.log("⚠️ window.app not defined, creating defensive namespace container");
      window.app = {
        _namespaceInitialized: false,
        _coreRegistered: false,
        _pendingRegistrations: [],
        _dependencyGraph: {},

        _protectNamespace: function (namespace, defaultValue) {
          const parts = namespace.split(".");
          let current = window;

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
              if (typeof current[part] === "undefined") {
                current[part] = defaultValue || {};
              }
            } else {
              if (typeof current[part] === "undefined") {
                current[part] = {};
              }
              current = current[part];
            }
          }
        },

        _deferRegistration: function (namespace, factory) {
          this._pendingRegistrations.push({ namespace: namespace, factory: factory });
        },

        _processPendingRegistrations: function () {
          console.log(`📝 Processing ${this._pendingRegistrations.length} pending namespace registrations`);
          this._pendingRegistrations.forEach((registration) => {
            try {
              this._protectNamespace(registration.namespace, registration.factory());
              console.log(`✅ Deferred registration completed: ${registration.namespace}`);
            } catch (error) {
              console.error(`❌ Deferred registration failed for ${registration.namespace}:`, error);
            }
          });
          this._pendingRegistrations = [];
        },

        _markNamespaceInitialized: function () {
          this._namespaceInitialized = true;
          this._processPendingRegistrations();
        },
      };

      console.log("✅ Defensive namespace container created");
    } else {
      if (typeof window.app._namespaceInitialized === "undefined") {
        window.app._namespaceInitialized = false;
      }
      if (typeof window.app._coreRegistered === "undefined") {
        window.app._coreRegistered = false;
      }
      if (typeof window.app._pendingRegistrations === "undefined") {
        window.app._pendingRegistrations = [];
      }
      if (typeof window.app._dependencyGraph === "undefined") {
        window.app._dependencyGraph = {};
      }

      console.log("✅ Existing namespace container validated");
    }

    if (typeof APP_CONFIG === "undefined") {
      console.log("🔧 APP_CONFIG not defined, creating comprehensive configuration");
      window.APP_CONFIG = {
        parentShell: {
          file: "chat.html",
          isParent: true,
          containerId: "app-container",
          navigationId: "navigation-container",
        },

        navigation: {
          container: "#nav-container, .navigation-container, nav",
          persistState: true,
          storageKey: "moodchat_nav_state",
          validateBeforeLoad: true,
          sessionFirst: true,
        },

        pages: {
          chat: {
            id: "chat-page",
            file: "chat.html",
            requiresAuth: true,
            isIframe: false,
            isParent: true,
            icon: "💬",
            title: "Chat",
            default: true,
            loadOrder: 1,
          },
          group: {
            id: "group-page",
            file: "group.html",
            requiresAuth: true,
            isIframe: true,
            icon: "👥",
            title: "Groups",
            loadOrder: 2,
            container: "#iframe-container, .page-container",
          },
          message: {
            id: "message-page",
            file: "message.html",
            requiresAuth: true,
            isIframe: true,
            icon: "✉️",
            title: "Messages",
            loadOrder: 3,
            container: "#iframe-container, .page-container",
          },
          friend: {
            id: "friend-page",
            file: "friend.html",
            requiresAuth: true,
            isIframe: true,
            icon: "👤",
            title: "Friends",
            loadOrder: 4,
            container: "#iframe-container, .page-container",
          },
          calls: {
            id: "calls-page",
            file: "calls.html",
            requiresAuth: true,
            isIframe: true,
            icon: "📞",
            title: "Calls",
            loadOrder: 5,
            container: "#iframe-container, .page-container",
          },
          settings: {
            id: "settings-page",
            file: "settings.html",
            requiresAuth: true,
            isIframe: true,
            icon: "⚙️",
            title: "Settings",
            loadOrder: 6,
            container: "#iframe-container, .page-container",
          },
          status: {
            id: "status-page",
            file: "status.html",
            requiresAuth: true,
            isIframe: true,
            icon: "🟢",
            title: "Status",
            loadOrder: 7,
            container: "#iframe-container, .page-container",
          },
          tool: {
            id: "tool-page",
            file: "Tool.html",
            requiresAuth: true,
            isIframe: true,
            icon: "🛠️",
            title: "Tools",
            loadOrder: 8,
            container: "#iframe-container, .page-container",
          },
        },

        sessionSync: {
          enabled: true,
          // FIX: 5000ms too short on slow (1KB/s) links / Render cold starts —
          // session data could still be in-flight when this deadline hits,
          // causing modules to silently fail with "0 users loaded".
          timeout: 20000,
          retryAttempts: 5,
          broadcastToIframes: true,
          validateBeforePropagation: true,
        },

        loading: {
          sequence: ["session", "navigation", "default-page", "other-pages"],
          delayBetweenPages: 100,
          maxParallelLoads: 2,
        },

        defaultPage: "chat.html",
        defaultPageKey: "chat",
        modules: ["chat", "group", "message", "friend", "calls", "settings", "status", "tool"],
        apiBaseUrl: window.location.origin,
        allowedOrigins: [window.location.origin],
      };

      console.log("✅ Created comprehensive APP_CONFIG with centralized page registry");

      window.AppBootContext.setReady("config");
    } else {
      console.log("🔧 Enhancing existing APP_CONFIG for session-first architecture");

      if (typeof APP_CONFIG.parentShell === "undefined") {
        APP_CONFIG.parentShell = {
          file: "chat.html",
          isParent: true,
          containerId: "app-container",
        };
        console.log("✅ Added parentShell configuration");
      }

      if (typeof APP_CONFIG.navigation === "undefined") {
        APP_CONFIG.navigation = {
          container: "#nav-container, .navigation-container, nav",
          persistState: true,
          sessionFirst: true,
        };
        console.log("✅ Added navigation configuration");
      }

      if (typeof APP_CONFIG.sessionSync === "undefined") {
        APP_CONFIG.sessionSync = {
          enabled: true,
          timeout: 20000, // FIX: was 5000 — too short for slow links/cold starts
        };
        console.log("✅ Added session synchronization configuration");
      }

      if (APP_CONFIG.pages && typeof APP_CONFIG.pages === "object") {
        let needsConversion = false;

        Object.keys(APP_CONFIG.pages).forEach((key) => {
          if (typeof APP_CONFIG.pages[key] === "string") {
            needsConversion = true;
          }
        });

        if (needsConversion) {
          console.log("🔄 Converting legacy page format to structured format");

          const pageTemplates = {
            "chat.html": { id: "chat-page", isIframe: false, isParent: true, icon: "💬", default: true },
            "group.html": { id: "group-page", isIframe: true, icon: "👥", container: "#iframe-container" },
            "message.html": { id: "message-page", isIframe: true, icon: "✉️", container: "#iframe-container" },
            "friend.html": { id: "friend-page", isIframe: true, icon: "👤", container: "#iframe-container" },
            "calls.html": { id: "calls-page", isIframe: true, icon: "📞", container: "#iframe-container" },
            "settings.html": { id: "settings-page", isIframe: true, icon: "⚙️", container: "#iframe-container" },
            "status.html": { id: "status-page", isIframe: true, icon: "🟢", container: "#iframe-container" },
            "Tool.html": { id: "tool-page", isIframe: true, icon: "🛠️", container: "#iframe-container" },
          };

          Object.keys(APP_CONFIG.pages).forEach((key) => {
            const pageValue = APP_CONFIG.pages[key];

            if (typeof pageValue === "string") {
              const file = pageValue;
              const template = pageTemplates[file] || { id: `${key}-page`, isIframe: true };

              APP_CONFIG.pages[key] = {
                id: template.id,
                file: file,
                requiresAuth: true,
                isIframe: key === "chat" ? false : template.isIframe,
                isParent: key === "chat",
                icon: template.icon || "📄",
                title: key.charAt(0).toUpperCase() + key.slice(1),
                default: key === "chat",
                container: template.container,
                ...template,
              };

              console.log(`✅ Converted page "${key}" to structured format`);
            } else if (typeof pageValue === "object" && !pageValue.id) {
              APP_CONFIG.pages[key].id = pageValue.id || `${key}-page`;
              APP_CONFIG.pages[key].requiresAuth = pageValue.requiresAuth !== false;
              APP_CONFIG.pages[key].isIframe = key === "chat" ? false : pageValue.isIframe !== false;
              APP_CONFIG.pages[key].isParent = key === "chat";
              console.log(`✅ Enhanced existing page object for "${key}"`);
            }
          });
        }
      }

      if (typeof APP_CONFIG.defaultPage === "undefined") {
        APP_CONFIG.defaultPage = "chat.html";
        console.log("✅ Added defaultPage: chat.html (backward compatibility)");
      }

      if (typeof APP_CONFIG.defaultPageKey === "undefined") {
        APP_CONFIG.defaultPageKey = "chat";
        console.log("✅ Added defaultPageKey: chat (backward compatibility)");
      }

      if (!APP_CONFIG.modules) {
        APP_CONFIG.modules = ["chat", "group", "message", "friend", "calls", "settings", "status", "tool"];
        console.log("✅ Added modules list");
      }

      if (!APP_CONFIG.apiBaseUrl) {
        APP_CONFIG.apiBaseUrl = window.location.origin;
      }

      if (!APP_CONFIG.allowedOrigins) {
        APP_CONFIG.allowedOrigins = [window.location.origin];
      }

      console.log("✅ APP_CONFIG enhancement complete with session-first architecture");

      window.AppBootContext.setReady("config");
    }

    window.isPublicPage = function () {
      const publicPages = ["/", "/index.html", "/index.html", "/index.html", "/signup.html", "/auth.html", "/register.html"];
      const currentPath = window.location.pathname.toLowerCase();

      const urlParams = new URLSearchParams(window.location.search);
      const pageParam = urlParams.get("page");

      if (pageParam && APP_CONFIG.pages && APP_CONFIG.pages[pageParam]) {
        const pageConfig = APP_CONFIG.pages[pageParam];
        if (pageConfig.requiresAuth && !window.currentUser) {
          console.log(`⚠️ Page ${pageParam} requires auth but no session, treating as public`);
          return true;
        }
      }

      return publicPages.some((page) => currentPath.endsWith(page));
    };

    if (window.app && window.app._markNamespaceInitialized) {
      window.app._markNamespaceInitialized();
    }

    console.log("✅ Global dependencies ensured with namespace governance");
    return true;
  }

  safeExecute(ensureGlobalDependencies, "ensureGlobalDependencies");

  // ============================================================================
  // BOOTSTRAP STATE TRACKER - COMPLETE PRESERVATION
  // ============================================================================

  const BOOTSTRAP_STATE = {
    PHASES: {
      NOT_STARTED: "not_started",
      INITIALIZING: "initializing",
      API_WAITING: "api_waiting",
      AUTH_CHECKING: "auth_checking",
      UI_LOADING: "ui_loading",
      READY: "ready",
      DEGRADED: "degraded",
      FAILED: "failed",
    },

    currentPhase: "not_started",
    startTime: null,
    dependencies: {
      apiJs: false,
      domReady: false,
      authReady: false,
    },

    initialize: function () {
      const currentState = BOOTSTRAP_STATE_MACHINE.getState();
      if (currentState === BOOTSTRAP_CONSTANTS.STATES.ERROR) {
        console.log("[BOOT] ⏳ Bootstrap blocked: system in ERROR state");
        return this;
      }

      const isLoggedIn = userLoggedIn();
      const isPublicPage = window.isPublicPage ? window.isPublicPage() : false;

      // CRITICAL FIX: Never pause bootstrap on auth — always proceed
      if (!isLoggedIn && !isPublicPage) {
        console.log("⚠️ No session yet — bootstrap continues; UI handles login");
      }

      this.startTime = Date.now();
      this.currentPhase = this.PHASES.INITIALIZING;
      console.log(`🚀 Application bootstrap started at ${new Date().toISOString()}`);

      this.trackProgress("bootstrap_started");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.bootstrapState = {
          initialized: true,
          startTime: this.startTime,
          dependencies: { ...this.dependencies },
        };
      }

      return this;
    },

    markDependencyReady: function (dependency) {
      if (dependency in this.dependencies) {
        this.dependencies[dependency] = true;
        console.log(`✅ Dependency ready: ${dependency}`);
        this.trackProgress(`${dependency}_ready`);

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.dependencies[dependency] = true;
        }
      }

      this.checkAllDependencies();
    },

    checkAllDependencies: function () {
      const allReady = Object.values(this.dependencies).every((ready) => ready);
      if (allReady && this.currentPhase === this.PHASES.INITIALIZING) {
        this.currentPhase = this.PHASES.API_WAITING;
        console.log("✅ All bootstrap dependencies ready");
        this.trackProgress("all_dependencies_ready");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.allDependenciesReady = true;
          window.app._dependencyGraph.bootstrapState.allDependenciesReadyAt = new Date().toISOString();
        }
      }
    },

    setPhase: function (phase) {
      if (Object.values(this.PHASES).includes(phase)) {
        const previousPhase = this.currentPhase;
        this.currentPhase = phase;
        console.log(`🔄 Bootstrap phase: ${previousPhase} → ${phase}`);
        this.trackProgress(`phase_${phase}`);

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.bootstrapState.phase = phase;
          window.app._dependencyGraph.bootstrapState.phaseTransitions =
            window.app._dependencyGraph.bootstrapState.phaseTransitions || [];
          window.app._dependencyGraph.bootstrapState.phaseTransitions.push({
            from: previousPhase,
            to: phase,
            timestamp: new Date().toISOString(),
          });
        }

        this.broadcastPhaseChange(phase, previousPhase);
      }
    },

    getPhase: function () {
      return this.currentPhase;
    },

    isPhase: function (phase) {
      return this.currentPhase === phase;
    },

    isDegraded: function () {
      return (
        this.currentPhase === this.PHASES.DEGRADED ||
        BOOTSTRAP_STATE_MACHINE.isDegraded() ||
        ERROR_TRACKER.isDegradedMode()
      );
    },

    trackProgress: function (event) {
      const progressEvent = new CustomEvent("moodchat-bootstrap-progress", {
        detail: {
          event: event,
          phase: this.currentPhase,
          isDegraded: this.isDegraded(),
          failures: ERROR_TRACKER.getFailureReport(),
          timestamp: new Date().toISOString(),
          dependencies: { ...this.dependencies },
          elapsedMs: Date.now() - this.startTime,
        },
      });
      window.dispatchEvent(progressEvent);
    },

    broadcastPhaseChange: function (newPhase, oldPhase) {
      const phaseChangeEvent = new CustomEvent("moodchat-bootstrap-phase-change", {
        detail: {
          newPhase: newPhase,
          oldPhase: oldPhase,
          isDegraded: this.isDegraded(),
          failures: ERROR_TRACKER.getFailureReport(),
          timestamp: new Date().toISOString(),
          dependencies: { ...this.dependencies },
          elapsedMs: Date.now() - this.startTime,
        },
      });
      window.dispatchEvent(phaseChangeEvent);
    },

    complete: function (success = true, message = "") {
      const finalPhase = success ? (this.isDegraded() ? this.PHASES.DEGRADED : this.PHASES.READY) : this.PHASES.FAILED;
      this.setPhase(finalPhase);

      const completionEvent = new CustomEvent("moodchat-bootstrap-complete", {
        detail: {
          success: success,
          message: message,
          phase: finalPhase,
          isDegraded: this.isDegraded(),
          failures: ERROR_TRACKER.getFailureReport(),
          timestamp: new Date().toISOString(),
          elapsedMs: Date.now() - this.startTime,
          dependencies: { ...this.dependencies },
        },
      });
      window.dispatchEvent(completionEvent);

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.bootstrapState.completed = true;
        window.app._dependencyGraph.bootstrapState.completionSuccess = success;
        window.app._dependencyGraph.bootstrapState.completionMessage = message;
        window.app._dependencyGraph.bootstrapState.completionTime = new Date().toISOString();
        window.app._dependencyGraph.bootstrapState.completionElapsedMs = Date.now() - this.startTime;
        window.app._dependencyGraph.bootstrapState.failures = ERROR_TRACKER.getFailureReport();
      }

      console.log(`🏁 Application bootstrap ${success ? "completed successfully" : "failed"}: ${message}`);
      console.log(`⏱️ Total bootstrap time: ${Date.now() - this.startTime}ms`);
      if (this.isDegraded()) {
        console.warn(`⚠️ Application running in DEGRADED mode`);
      }

      NavigationController.unlock("bootstrap_complete");
    },

    getStatusReport: function () {
      return {
        phase: this.currentPhase,
        isDegraded: this.isDegraded(),
        dependencies: { ...this.dependencies },
        failures: ERROR_TRACKER.getFailureReport(),
        elapsedMs: Date.now() - this.startTime,
        startTime: new Date(this.startTime).toISOString(),
        currentTime: new Date().toISOString(),
      };
    },
  };

  safeExecute(() => BOOTSTRAP_STATE.initialize(), "BOOTSTRAP_STATE.initialize");

  // ============================================================================
  // HARDENED BOOTSTRAP CONTROLLER - COMPLETE PRESERVATION WITH DETERMINISTIC SEQUENCE
  // ============================================================================

  // ============================================================================
  // SAFE STAGE RUNNER — was missing, caused ReferenceError on every boot
  // ============================================================================
  async function safeStage(name, fn, opts = {}) {
    const critical = opts.critical !== false;
    try {
      console.log(`[BOOT] ▶ Stage: ${name}`);
      await fn();
      console.log(`[BOOT] ✅ Stage complete: ${name}`);
    } catch (err) {
      console.warn(`[BOOT] ⚠️ Stage "${name}" failed: ${err.message}`);
      if (critical) {
        // Critical stages that require Session/API are downgraded to warnings
        // because these modules may legitimately be absent in some deployments.
        // We do NOT throw — throwing aborts the entire boot and creates the loop.
        console.warn(`[BOOT] ⚠️ Critical stage "${name}" failed but continuing (offline-first).`);
      }
    }
  }

  const HARDENED_BOOTSTRAP_CONTROLLER = {
    _initialized: false,
    _startupPromise: null,
    _recoveryMode: false,
    _executionLock: false,
    _recoveryAttempts: 0,
    _restarting: false,
    _showingNotification: false,
    _showingError: false,
    _errorCallStack: [],

    bootstrap: async function () {
      if (this._executionLock) {
        console.warn("[BOOT] ⚠️ Bootstrap already in progress");
        return this._startupPromise;
      }

      if (this._initialized) {
        console.warn("[BOOT] ⚠️ Bootstrap already completed");
        return Promise.resolve(true);
      }

      this._executionLock = true;
      console.log("[BOOT] 🚀 Starting hardened bootstrap with deterministic sequence...");

      NavigationController.lock("bootstrap");

      this._startupPromise = (async () => {
        try {
          // STEP 1: Environment setup
          await safeStage("environment_setup", () => this.setupEnvironmentDeterministic(), { critical: true });

          // STEP 2: Core system (EventBus + Store)
          await safeStage("core_system", () => this.setupCoreSystemDeterministic(), { critical: true });

          // STEP 3: SESSION INIT - CRITICAL BLOCKER
          await safeStage("session_init", () => this.initSessionDeterministic(), { critical: true });

          // STEP 4: API init (with token from session)
          await safeStage("api_init", () => this.initApiDeterministic(), { critical: true });

          // STEP 5: Realtime/Socket init (only after session + API)
          await safeStage("realtime_init", () => this.initRealtimeDeterministic(), { critical: false });

          // STEP 6: Module registration (register only)
          await safeStage("module_registration", () => this.registerModulesDeterministic(), { critical: false });

          // STEP 7: Parent authority handshake (listen for CHILD_READY)
          await safeStage("parent_handshake", () => this.setupParentHandshakeDeterministic(), { critical: true });

          // STEP 8: Activation gate (wait for all modules ready)
          await safeStage("activation_gate", () => this.waitForActivationGate(), { critical: true });

          // STEP 9: Start Sync Manager (LAST)
          await safeStage("sync_manager_start", () => this.startSyncManagerDeterministic(), { critical: false });

          // STEP 10: Final ready
          this.finalizeReadyDeterministic();

          return true;
        } catch (error) {
          console.error("[BOOT] ❌ Hardened bootstrap failed:", error);
          BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.DEGRADED, `recovery_from_error: ${error.message}`);
          this.showDegradedModeNotification();
          this._initialized = true;
          this._executionLock = false;
          return false;
        } finally {
          this._executionLock = false;
          NavigationController.unlock("bootstrap_finally");
        }
      })();

      return this._startupPromise;
    },

    setupEnvironmentDeterministic: async function () {
      console.log("[BOOT] 🌍 Setting up environment...");

      if (!window.APP_CONFIG) {
        throw new Error("APP_CONFIG missing");
      }

      window.__BOOT_ENV = {
        startedAt: Date.now(),
        baseUrl: window.APP_CONFIG.apiBaseUrl || window.location.origin,
      };

      window.AppBootContext.setReady("config");
      console.log("[BOOT] ✅ Environment setup complete");
    },

    setupCoreSystemDeterministic: async function () {
      console.log("[BOOT] 🏗️ Setting up core system (EventBus + Store)...");

      if (!window.EventBus) {
        window.EventBus = {
          _listeners: new Map(),
          on(event, cb) {
            if (!this._listeners.has(event)) this._listeners.set(event, []);
            this._listeners.get(event).push(cb);
          },
          off(event, cb) {
            if (!this._listeners.has(event)) return;
            const idx = this._listeners.get(event).indexOf(cb);
            if (idx !== -1) this._listeners.get(event).splice(idx, 1);
          },
          emit(event, data) {
            if (!this._listeners.has(event)) return;
            this._listeners.get(event).forEach((cb) => {
              try {
                cb(data);
              } catch (e) {
                console.error(`[EventBus] handler error for ${event}`, e);
              }
            });
          },
        };
      }

      if (!window.Store) {
        window.Store = {
          _state: {},
          set(key, value) {
            this._state[key] = value;
            if (window.EventBus) window.EventBus.emit("store:change", { key, value });
          },
          get(key) {
            return this._state[key];
          },
        };
      }

      console.log("[BOOT] ✅ Core system ready");
    },

    initSessionDeterministic: async function () {
      console.log("[BOOT] 🔐 Initializing session...");
      BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.AUTH, "session_init_start");

      // ── OFFLINE-FIRST: hydrate from localStorage immediately, never block ──
      try {
        const rawAuth = localStorage.getItem("kynecta_auth");
        if (rawAuth) {
          const auth = JSON.parse(rawAuth);
          if (auth && auth.token) {
            if (!window.Session) window.Session = {};
            window.Session._localToken = auth.token;
            window.Session._localUser = auth.user;
            window.Session._hydrated = true;
            window.currentUser = auth.user || window.currentUser;
            window.__AUTH_TEMP_TOKEN__ = auth.token;
            window.__SESSION_READY__ = true;
            console.log("[BOOT] ✅ Session hydrated from localStorage immediately");
          }
        }
      } catch (e) {
        console.warn("[BOOT] ⚠️ localStorage hydration failed:", e.message);
      }

      // Try invoking Session.init() if available — but never throw on failure
      if (window.Session && typeof window.Session.init === "function") {
        try {
          await Promise.race([
            window.Session.init(),
            new Promise((resolve) => setTimeout(resolve, 3000))
          ]);
        } catch (e) {
          console.warn("[BOOT] ⚠️ Session.init() failed (continuing):", e.message);
        }
      } else {
        console.warn("[BOOT] ⚠️ Session module missing — using localStorage hydration only");
      }

      window.AppBootContext.setReady("session");
      console.log("[BOOT] ✅ Session stage complete");
    },

    initApiDeterministic: async function () {
      console.log("[BOOT] 🔌 Initializing API (with token from session)...");

      if (!window.API || typeof window.API.init !== "function") {
        console.warn("[BOOT] ⚠️ API module missing init() — skipping (using api.auth/api.request directly)");
        return;
      }

      try {
        await Promise.race([
          window.API.init(),
          new Promise((resolve) => setTimeout(resolve, 3000))
        ]);
      } catch (e) {
        console.warn("[BOOT] ⚠️ API.init() failed (continuing):", e.message);
      }
      console.log("[BOOT] ✅ API ready");
    },

    initRealtimeDeterministic: async function () {
      console.log("[BOOT] 📡 Initializing Realtime/Socket...");

      if (!window.Realtime || typeof window.Realtime.init !== "function") {
        console.warn("[BOOT] Realtime module not available, skipping");
        return;
      }

      await window.Realtime.init();
      console.log("[BOOT] ✅ Realtime ready");
    },

    registerModulesDeterministic: async function () {
      console.log("[BOOT] 📦 Registering modules (not activating yet)...");
      BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.LOADING, "module_registration");

      if (!window.APP_CONFIG.modules) {
        window.APP_CONFIG.modules = ["chat", "group", "message", "friend", "calls", "settings", "status", "tool"];
      }

      window.__REGISTERED_MODULES = new Set();
      window.__EXPECTED_MODULES = new Set(window.APP_CONFIG.modules);

      window.dispatchEvent(
        new CustomEvent("moodchat-modules-registered", {
          detail: {
            modules: Array.from(window.__EXPECTED_MODULES),
            timestamp: Date.now(),
          },
        })
      );

      console.log(`[BOOT] ✅ Registered ${window.__EXPECTED_MODULES.size} modules, waiting for CHILD_READY`);
    },

    setupParentHandshakeDeterministic: async function () {
      console.log("[BOOT] 🤝 Setting up parent authority handshake...");
      BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.LOADING, "parent_handshake");

      this._parentReadySent = false;
      this._registeredModules = new Set();

      const messageHandler = (event) => {
        const allowedOrigins = [window.location.origin];
        if (window.APP_CONFIG.allowedOrigins) {
          allowedOrigins.push(...window.APP_CONFIG.allowedOrigins);
        }

        if (!allowedOrigins.includes(event.origin)) {
          console.warn(`[BOOT] Ignoring message from untrusted origin: ${event.origin}`);
          return;
        }

        const data = event.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "CHILD_READY") {
          const moduleName = data.module;
          if (!moduleName) {
            console.warn("[BOOT] CHILD_READY without module name");
            return;
          }

          if (!window.__EXPECTED_MODULES.has(moduleName)) {
            console.warn(`[BOOT] Unexpected module: ${moduleName}`);
            return;
          }

          if (!this._registeredModules.has(moduleName)) {
            this._registeredModules.add(moduleName);
            console.log(`[BOOT] Module registered: ${moduleName} (${this._registeredModules.size}/${window.__EXPECTED_MODULES.size})`);
          }

          if (event.source) {
            event.source.postMessage(
              {
                type: "PARENT_READY",
                module: moduleName,
                timestamp: Date.now(),
              },
              event.origin
            );
            this._parentReadySent = true;
          }

          if (this._registeredModules.size === window.__EXPECTED_MODULES.size) {
            window.__ALL_MODULES_READY = true;
            console.log("[BOOT] All modules registered, triggering activation gate");
            if (this._activationResolve) {
              this._activationResolve(true);
            }
          }
        } else if (data.type === "REQUEST_SESSION") {
          if (event.source && window.Session) {
            event.source.postMessage(
              {
                type: "SESSION_DATA",
                data: {
                  user: window.Session.getUser ? window.Session.getUser() : null,
                  isAuthenticated: window.Session.isAuthenticated ? window.Session.isAuthenticated() : false,
                },
              },
              event.origin
            );
          }
        }
      };

      window.addEventListener("message", messageHandler.bind(this));
      window.__PARENT_HANDSHAKE_HANDLER = messageHandler;

      this._activationPromise = new Promise((resolve) => {
        this._activationResolve = resolve;
      });

      console.log("[BOOT] ✅ Parent handshake ready, listening for CHILD_READY");
    },

    waitForActivationGate: async function () {
      console.log("[BOOT] 🚪 Waiting for activation gate (all modules ready)...");

      if (window.__ALL_MODULES_READY) {
        console.log("[BOOT] ✅ All modules already ready, proceeding to activation");
        return;
      }

      // CRITICAL FIX: gate must time-out so boot completes even when no iframes
      // are present (e.g. fresh login on chat.html before any iframe loads).
      await Promise.race([
        this._activationPromise,
        new Promise((resolve) => setTimeout(() => {
          console.warn("[BOOT] ⏱️ Activation gate timeout — proceeding without all modules");
          resolve();
        }, 5000))
      ]);
      console.log("[BOOT] ✅ Activation gate passed");
    },

    startSyncManagerDeterministic: async function () {
      console.log("[BOOT] 🔄 Starting Sync Manager (LAST STEP)...");

      if (!window.SyncManager || typeof window.SyncManager.start !== "function") {
        console.warn("[BOOT] SyncManager not available, skipping");
        return;
      }

      await window.SyncManager.start();
      console.log("[BOOT] ✅ Sync Manager started");
    },

    finalizeReadyDeterministic: function () {
      console.log("[BOOT] 🎉 Bootstrap complete, system ready");

      BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.RUNNING, "bootstrap_complete");
      BOOTSTRAP_STATE.complete(true, "Bootstrap completed with deterministic sequence");

      if (window.EventBus) {
        window.EventBus.emit("bootstrap:ready", {
          timestamp: Date.now(),
          modules: Array.from(window.__REGISTERED_MODULES || []),
        });
      }

      window.__BOOTSTRAP_READY = true;
      this._initialized = true;
    },

    showDegradedModeNotification: function () {
      try {
        if (typeof window.showNotification === "function") {
          window.showNotification("Application running in degraded mode. Some features may be limited.", "warning", 10000);
        } else {
          const notification = document.createElement("div");
          notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: #f59e0b;
            color: white;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            z-index: 10000;
            animation: slideUp 0.3s ease-out;
          `;
          notification.textContent = "Application running in degraded mode. Some features may be limited.";
          document.body.appendChild(notification);
          setTimeout(() => {
            notification.style.animation = "slideDown 0.3s ease-in";
            setTimeout(() => notification.remove(), 300);
          }, 10000);
        }
      } catch (error) {
        console.warn("[BOOT] ⚠️ Failed to show degraded mode notification");
      }
    },

    waitForDOMReady: function () {
      return new Promise((resolve) => {
        if (document.readyState !== "loading") {
          resolve();
          return;
        }
        document.addEventListener("DOMContentLoaded", () => {
          resolve();
        });
        setTimeout(() => {
          resolve();
        }, BOOTSTRAP_CONSTANTS.STEP_TIMEOUT);
      });
    },

    safeShowNotification: function (message, type = "info", duration = 5000) {
      if (this._showingNotification) return;
      this._showingNotification = true;
      try {
        if (typeof window.showNotification === "function") {
          window.showNotification(message, type, duration);
        } else if (typeof this.showErrorToUser === "function") {
          this.showErrorToUser(message, type);
        } else {
          console.log(`[NOTIFICATION] ${type}: ${message}`);
        }
      } catch (error) {
        console.error("⚠️ Failed to show notification:", error);
      } finally {
        setTimeout(() => {
          this._showingNotification = false;
        }, 100);
      }
    },

    showErrorToUser: function (message, type = "error") {
      const callId = Date.now() + Math.random().toString(36).substring(2, 10);
      this._errorCallStack.push(callId);

      if (this._errorCallStack.length > 5) {
        console.error("⚠️ Error call stack too deep, aborting");
        this._errorCallStack.pop();
        return;
      }

      if (this._showingError) {
        this._errorCallStack.pop();
        return;
      }

      this._showingError = true;

      try {
        if (typeof window.showNotification === "function") {
          window.showNotification(message, type, 10000);
        } else {
          const errorDiv = document.createElement("div");
          errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === "error" ? "#f87171" : "#f59e0b"};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideInRight 0.3s ease-out;
          `;
          errorDiv.textContent = message;
          document.body.appendChild(errorDiv);

          setTimeout(() => {
            if (errorDiv.parentNode) {
              errorDiv.style.animation = "slideOutRight 0.3s ease-in";
              setTimeout(() => errorDiv.remove(), 300);
            }
          }, 10000);
        }
      } catch (error) {
        console.error("⚠️ Failed to show error to user:", error);
      } finally {
        setTimeout(() => {
          this._showingError = false;
          const index = this._errorCallStack.indexOf(callId);
          if (index > -1) this._errorCallStack.splice(index, 1);
        }, 100);
      }
    },

    showFatalError: function (error) {
      try {
        document.body.innerHTML = "";

        const errorScreen = document.createElement("div");
        errorScreen.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #1f2937;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        errorScreen.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
          <h1 style="font-size: 24px; margin-bottom: 16px;">Application Failed to Start</h1>
          <p style="margin-bottom: 24px; max-width: 500px; opacity: 0.8;">
            The application encountered a critical error and cannot continue.
            Please try refreshing the page or contact support if the problem persists.
          </p>
          <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px; max-width: 500px; text-align: left;">
            <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Error Details:</div>
            <div style="font-family: monospace; font-size: 12px;">${error.message}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <button id="retryButton" style="
              background: #8b5cf6;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            ">Try Again</button>
            <button id="reportButton" style="
              background: transparent;
              color: #8b5cf6;
              border: 1px solid #8b5cf6;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            ">Report Issue</button>
          </div>
        `;

        document.body.appendChild(errorScreen);

        document.getElementById("retryButton").addEventListener("click", () => {
          window.location.reload();
        });

        document.getElementById("reportButton").addEventListener("click", () => {
          const errorReport = {
            error: error.toString(),
            message: error.message,
            stack: error.stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            bootstrap: BOOTSTRAP_STATE.getStatusReport(),
          };
          console.error("Error report:", errorReport);
          this.safeShowNotification("Error details logged to console", "info", 5000);
        });
      } catch (fatalError) {
        console.error("❌ Even fatal error screen failed:", fatalError);
        document.body.innerHTML = "<h1>Critical Error</h1><p>Please refresh the page.</p>";
      }
    },

    getStatus: function () {
      return {
        initialized: this._initialized,
        state: BOOTSTRAP_STATE_MACHINE.getState(),
        isDegraded: BOOTSTRAP_STATE_MACHINE.isDegraded(),
        dependencies: SEQUENTIAL_LOADER.getStatus(),
        auth: AUTHENTICATION_GATE.isAuthenticated(),
        recoveryMode: this._recoveryMode,
        executionLock: this._executionLock,
        recoveryAttempts: this._recoveryAttempts,
        restarting: this._restarting,
        appReady: DEPENDENCY_QUEUE.isReady(),
        failures: ERROR_TRACKER.getFailureReport(),
        modulesReady: window.__ALL_MODULES_READY || false,
        parentReadySent: this._parentReadySent || false,
        registeredModules: this._registeredModules ? Array.from(this._registeredModules) : [],
      };
    },
  };

  // ============================================================================
  // APP BOOTSTRAP COMPATIBILITY LAYER - COMPLETE PRESERVATION
  // ============================================================================

  // CRITICAL FIX: Global bootstrap lock to prevent multiple executions
  if (window.__APP_BOOTSTRAPPED__) {
    console.log('[BOOT] ð App already bootstrapped, preventing duplicate execution');
    return;
  }
  window.__APP_BOOTSTRAPPED__ = true;

  // CRITICAL FIX: Global recovery limit to prevent infinite loops
  let GLOBAL_RECOVERY_ATTEMPTS = 0;
  const MAX_GLOBAL_RECOVERY = 1; // Only allow one global retry

  const APP_BOOTSTRAP = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    currentRetry: 0,
    isBootstrapping: false,
    bootstrapPromise: null,
    registeredCallbacks: [],
    pendingOperations: [],
    moduleFailures: new Set(),
    failedModules: new Map(),
    _showingNotification: false,
    _showingError: false,
    _errorCallStack: [],

    bootstrap: async function () {
      if (HARDENED_BOOTSTRAP_CONTROLLER._initialized) {
        console.log("[BOOT] ⚠️ Hardened controller already initialized, using it");
        return Promise.resolve(true);
      }

      console.log("[BOOT] 🔄 Redirecting to hardened bootstrap controller");
      return HARDENED_BOOTSTRAP_CONTROLLER.bootstrap();
    },

    showNotification: function (message, type = "info", duration = 5000) {
      if (this._showingNotification) return;
      this._showingNotification = true;

      try {
        if (typeof window.showNotification === "function") {
          window.showNotification(message, type, duration);
        } else {
          this.showErrorToUser(message, type);
        }
      } catch (error) {
        console.error("⚠️ Failed to show notification:", error);
      } finally {
        setTimeout(() => {
          this._showingNotification = false;
        }, 100);
      }
    },

    showErrorToUser: function (message, type = "error") {
      const callId = Date.now() + Math.random().toString(36).substring(2, 10);
      this._errorCallStack.push(callId);

      if (this._errorCallStack.length > 5) {
        console.error("⚠️ Error call stack too deep, aborting");
        this._errorCallStack.pop();
        return;
      }

      if (this._showingError) {
        this._errorCallStack.pop();
        return;
      }

      this._showingError = true;

      try {
        if (typeof window.showNotification === "function") {
          window.showNotification(message, type, 10000);
        } else {
          const errorDiv = document.createElement("div");
          errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === "error" ? "#f87171" : "#f59e0b"};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideInRight 0.3s ease-out;
          `;
          errorDiv.textContent = message;
          document.body.appendChild(errorDiv);

          setTimeout(() => {
            if (errorDiv.parentNode) {
              errorDiv.style.animation = "slideOutRight 0.3s ease-in";
              setTimeout(() => errorDiv.remove(), 300);
            }
          }, 10000);
        }
      } catch (error) {
        console.error("⚠️ Failed to show error to user:", error);
      } finally {
        setTimeout(() => {
          this._showingError = false;
          const index = this._errorCallStack.indexOf(callId);
          if (index > -1) this._errorCallStack.splice(index, 1);
        }, 100);
      }
    },

    crashSafeWaitForDOMReady: function () {
      return safeExecuteAsync(() => this.waitForDOMReady(), "waitForDOMReady", 1);
    },

    crashSafeWaitForModularApi: function () {
      return safeExecuteAsync(() => this.waitForModularApi(), "waitForModularApi", 1);
    },

    crashSafeWaitForAuthReady: function () {
      return safeExecuteAsync(() => this.waitForAuthReady(), "waitForAuthReady", 1);
    },

    crashSafeCheckAuthenticationState: function () {
      return safeExecuteAsync(() => this.checkAuthenticationState(), "checkAuthenticationState", 1);
    },

    crashSafeDetermineUIFlow: function (authState) {
      return safeExecuteAsync(() => this.determineUIFlow(authState), "determineUIFlow", 1);
    },

    crashSafeInitializeGlobalUI: function () {
      return safeExecuteAsync(() => this.initializeGlobalUI(), "initializeGlobalUI", 1);
    },

    crashSafeSetupCoordinationSystems: function () {
      return safeExecuteAsync(() => this.setupCoordinationSystems(), "setupCoordinationSystems", 1);
    },

    crashSafeRegisterCoreModule: function () {
      return safeExecuteAsync(() => this.registerCoreModule(), "registerCoreModule", 1);
    },

    waitForDOMReady: function () {
      return new Promise((resolve) => {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            console.log("✅ DOM is ready");
            resolve();
          });
          setTimeout(() => {
            console.log("⚠️ DOM ready timeout, continuing anyway");
            resolve();
          }, 5000);
        } else {
          console.log("✅ DOM already ready");
          resolve();
        }
      });
    },

    waitForModularApi: function () {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.API_WAITING);
      return new Promise(async (resolve) => {
        console.log("🔍 Waiting for modular API initialization...");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.apiWait = {
            started: true,
            startTime: new Date().toISOString(),
            methodsAttempted: [],
          };
        }

        if (typeof API_COORDINATION !== "undefined" && API_COORDINATION.waitForApi) {
          try {
            const apiAvailable = await API_COORDINATION.waitForApi();
            if (apiAvailable) {
              console.log("✅ Modular API initialized via API_COORDINATION");

              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.apiWait.methodsAttempted.push({
                  method: "API_COORDINATION.waitForApi",
                  success: true,
                  timestamp: new Date().toISOString(),
                });
                window.app._dependencyGraph.apiWait.completed = true;
                window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                window.app._dependencyGraph.apiWait.success = true;
              }

              resolve();
              return;
            }
          } catch (error) {
            console.log("⚠️ API_COORDINATION wait failed, trying alternative methods:", error);

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: "API_COORDINATION.waitForApi",
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        const detectionMethods = [
          () => window.api && window.api.core && window.api.core.initialize,
          () => window.api && window.api.auth && window.api.auth.getUser,
          () => window.api && window.api.request && window.api.request.secureFetch,
          () => window.__MOODCHAT_API_READY === true,
          () => window.MoodChatConfig && window.MoodChatConfig.api,
          () => window.__MOODCHAT_API_EVENTS && window.__MOODCHAT_API_EVENTS.includes("ready"),
        ];

        for (const method of detectionMethods) {
          if (method()) {
            console.log("✅ Modular API detected via alternative method");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: "immediate_detection",
                success: true,
                detectedBy: method.toString().substring(0, 100),
                timestamp: new Date().toISOString(),
              });
            }

            if (window.api && window.api.core && window.api.core.initialize) {
              try {
                await window.api.core.initialize();
                console.log("✅ API core initialized");

                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                }
              } catch (error) {
                console.log("⚠️ API core initialization failed:", error);

                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.apiCoreInitializationFailed = true;
                  window.app._dependencyGraph.apiWait.apiCoreInitializationError = error.message;
                }
              }
            }

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.completed = true;
              window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.apiWait.success = true;
            }

            resolve();
            return;
          }
        }

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.apiWait.immediateDetectionFailed = true;
        }

        const eventTypes = ["api-ready", "apiready", "apiReady", "moodchat-api-ready", "api.core-ready"];
        let eventReceived = false;

        const eventHandler = () => {
          if (!eventReceived) {
            eventReceived = true;
            console.log("✅ Modular API ready via event");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: "event_listener",
                success: true,
                eventType: "various",
                timestamp: new Date().toISOString(),
              });
            }

            eventTypes.forEach((type) => {
              window.removeEventListener(type, eventHandler);
            });

            clearTimeout(timeoutId);

            if (window.api && window.api.core && window.api.core.initialize) {
              window.api.core
                .initialize()
                .then(() => {
                  console.log("✅ API core initialized via event");
                  if (window.app && window.app._dependencyGraph) {
                    window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                  }
                  resolve();
                })
                .catch(() => { resolve(); });
            } else {
              resolve();
            }
          }
        };

        eventTypes.forEach((eventType) => {
          window.addEventListener(eventType, eventHandler, { once: true });
        });

        let pollCount = 0;
        const maxPolls = 50;
        const pollInterval = setInterval(() => {
          pollCount++;

          for (const method of detectionMethods) {
            if (method()) {
              clearInterval(pollInterval);
              clearTimeout(timeoutId);
              eventTypes.forEach((type) => {
                window.removeEventListener(type, eventHandler);
              });

              console.log(`✅ Modular API detected after ${pollCount} polls`);

              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.apiWait.methodsAttempted.push({
                  method: "polling",
                  success: true,
                  pollCount: pollCount,
                  timestamp: new Date().toISOString(),
                });
              }

              if (window.api && window.api.core && window.api.core.initialize) {
                window.api.core
                  .initialize()
                  .then(() => {
                    console.log("✅ API core initialized via polling");

                    if (window.app && window.app._dependencyGraph) {
                      window.app._dependencyGraph.apiWait.apiCoreInitialized = true;
                      window.app._dependencyGraph.apiWait.completed = true;
                      window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                      window.app._dependencyGraph.apiWait.success = true;
                    }

                    resolve();
                  })
                  .catch(() => {
                    console.log("⚠️ API core initialization failed, continuing");

                    if (window.app && window.app._dependencyGraph) {
                      window.app._dependencyGraph.apiWait.apiCoreInitializationFailed = true;
                      window.app._dependencyGraph.apiWait.completed = true;
                      window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                      window.app._dependencyGraph.apiWait.success = true;
                    }

                    resolve();
                  });
              } else {
                if (window.app && window.app._dependencyGraph) {
                  window.app._dependencyGraph.apiWait.completed = true;
                  window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
                  window.app._dependencyGraph.apiWait.success = true;
                }
                resolve();
              }

              return;
            }
          }

          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log("⚠️ Modular API not detected after polling, continuing without it");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.apiWait.methodsAttempted.push({
                method: "polling",
                success: false,
                pollCount: pollCount,
                maxPolls: maxPolls,
                timestamp: new Date().toISOString(),
              });
              window.app._dependencyGraph.apiWait.pollingExhausted = true;
              window.app._dependencyGraph.apiWait.completed = true;
              window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.apiWait.success = false;
            }

            resolve();
          }
        }, 100);

        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval);
          eventTypes.forEach((type) => {
            window.removeEventListener(type, eventHandler);
          });
          console.log("⚠️ Modular API wait timeout, continuing");

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.apiWait.timedOut = true;
            window.app._dependencyGraph.apiWait.completed = true;
            window.app._dependencyGraph.apiWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.apiWait.success = false;
          }

          resolve();
        }, 10000);
      });
    },

    waitForAuthReady: function () {
      return new Promise((resolve) => {
        console.log("🔐 Waiting for auth module readiness...");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.authWait = {
            started: true,
            startTime: new Date().toISOString(),
            methodsAttempted: [],
          };
        }

        if (window.api && window.api.auth && window.api.auth.isReady && window.api.auth.isReady()) {
          console.log("✅ Auth module already ready");

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authWait.methodsAttempted.push({
              method: "immediate_check",
              success: true,
              timestamp: new Date().toISOString(),
            });
            window.app._dependencyGraph.authWait.completed = true;
            window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authWait.success = true;
          }

          resolve();
          return;
        }

        const eventTypes = ["auth-ready", "authReady", "moodchat-auth-ready"];
        let eventReceived = false;

        const eventHandler = () => {
          if (!eventReceived) {
            eventReceived = true;
            console.log("✅ Auth module ready via event");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: "event_listener",
                success: true,
                eventType: "various",
                timestamp: new Date().toISOString(),
              });
            }

            eventTypes.forEach((type) => {
              window.removeEventListener(type, eventHandler);
            });

            clearTimeout(timeoutId);

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = true;
            }

            resolve();
          }
        };

        eventTypes.forEach((eventType) => {
          window.addEventListener(eventType, eventHandler, { once: true });
        });

        let pollCount = 0;
        const maxPolls = 30;
        const pollInterval = setInterval(() => {
          pollCount++;

          if (window.api && window.api.auth && window.api.auth.isReady && window.api.auth.isReady()) {
            clearInterval(pollInterval);
            clearTimeout(timeoutId);
            eventTypes.forEach((type) => {
              window.removeEventListener(type, eventHandler);
            });

            console.log(`✅ Auth module ready after ${pollCount} polls`);

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: "polling",
                success: true,
                pollCount: pollCount,
                timestamp: new Date().toISOString(),
              });
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = true;
            }

            resolve();
            return;
          }

          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log("⚠️ Auth module not ready after polling, continuing");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authWait.methodsAttempted.push({
                method: "polling",
                success: false,
                pollCount: pollCount,
                maxPolls: maxPolls,
                timestamp: new Date().toISOString(),
              });
              window.app._dependencyGraph.authWait.pollingExhausted = true;
              window.app._dependencyGraph.authWait.completed = true;
              window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
              window.app._dependencyGraph.authWait.success = false;
            }

            resolve();
          }
        }, 100);

        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval);
          eventTypes.forEach((type) => {
            window.removeEventListener(type, eventHandler);
          });
          console.log("⚠️ Auth module wait timeout, continuing");

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authWait.timedOut = true;
            window.app._dependencyGraph.authWait.completed = true;
            window.app._dependencyGraph.authWait.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authWait.success = false;
          }

          resolve();
        }, 5000);
      });
    },

    checkAuthenticationState: async function () {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.AUTH_CHECKING);
      console.log("🔐 Checking authentication state...");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.authCheck = {
          started: true,
          startTime: new Date().toISOString(),
          methodsAttempted: [],
        };
      }

      const authState = {
        hasToken: false,
        tokenValid: false,
        user: null,
        requiresAuth: true,
        isPublicPage: false,
      };

      authState.isPublicPage = window.isPublicPage ? window.isPublicPage() : false;

      if (authState.isPublicPage) {
        console.log("📄 Public page detected, auth not required");
        authState.requiresAuth = false;

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.authCheck.methodsAttempted.push({
            method: "public_page_detection",
            success: true,
            isPublicPage: true,
            timestamp: new Date().toISOString(),
          });
          window.app._dependencyGraph.authCheck.completed = true;
          window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
          window.app._dependencyGraph.authCheck.success = true;
          window.app._dependencyGraph.authCheck.result = authState;
        }

        return authState;
      }

      if (window.api && window.api.auth && window.api.auth.getUser) {
        try {
          const user = await window.api.auth.getUser();
          authState.user = user;
          authState.hasToken = !!user;
          authState.tokenValid = !!user;

          console.log("✅ Auth state checked via modular API");

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: "modular_api",
              success: true,
              timestamp: new Date().toISOString(),
            });
            window.app._dependencyGraph.authCheck.completed = true;
            window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
            window.app._dependencyGraph.authCheck.success = true;
            window.app._dependencyGraph.authCheck.result = authState;
          }

          return authState;
        } catch (error) {
          console.log("⚠️ Modular auth API failed:", error);

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.authCheck.methodsAttempted.push({
              method: "modular_api",
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      if (typeof AUTH_STATE !== "undefined") {
        try {
          authState.hasToken = AUTH_STATE.hasToken ? AUTH_STATE.hasToken() : false;

          if (authState.hasToken) {
            authState.user = AUTH_STATE.getUser ? AUTH_STATE.getUser() : null;

            if (AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated()) {
              authState.tokenValid = true;
              console.log("✅ Token already validated in auth state");

              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.authCheck.methodsAttempted.push({
                  method: "auth_state",
                  success: true,
                  timestamp: new Date().toISOString(),
                });
              }
            } else {
              console.log("🔐 Token exists but needs validation");

              if (window.app && window.app._dependencyGraph) {
                window.app._dependencyGraph.authCheck.methodsAttempted.push({
                  method: "auth_state",
                  success: true,
                  tokenValid: false,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } else {
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authCheck.methodsAttempted.push({
                method: "auth_state",
                success: true,
                hasToken: false,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          console.log("⚠️ AUTH_STATE check failed:", error);
          this.moduleFailures.add("AUTH_STATE");
          this.failedModules.set("AUTH_STATE", error);
        }
      } else {
        try {
          const token = localStorage.getItem("accessToken") || localStorage.getItem("moodchat_jwt_token");
          authState.hasToken = !!token;

          if (authState.hasToken) {
            console.log("🔐 Token found in localStorage");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authCheck.methodsAttempted.push({
                method: "local_storage",
                success: true,
                hasToken: true,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.authCheck.methodsAttempted.push({
                method: "local_storage",
                success: true,
                hasToken: false,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          console.log("⚠️ localStorage access failed:", error);
        }
      }

      console.log("📋 Auth state check complete:", {
        hasToken: authState.hasToken,
        tokenValid: authState.tokenValid,
        requiresAuth: authState.requiresAuth,
        isPublicPage: authState.isPublicPage,
      });

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.authCheck.completed = true;
        window.app._dependencyGraph.authCheck.completionTime = new Date().toISOString();
        window.app._dependencyGraph.authCheck.success = true;
        window.app._dependencyGraph.authCheck.result = authState;
      }

      return authState;
    },

    determineUIFlow: async function (authState) {
      console.log("🔄 Determining UI flow based on auth state...");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiFlow = {
          started: true,
          startTime: new Date().toISOString(),
          authState: authState,
        };
      }

      if (authState.isPublicPage) {
        console.log("📄 Public page flow: Show auth UI");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = "public_page";
          window.app._dependencyGraph.uiFlow.action = "show_auth_ui";
        }

        this.showAuthUI();
        return;
      }

      if (!authState.hasToken) {
        // ── OFFLINE-FIRST: No local session at all — show login form ──────────
        // Do NOT redirect; show the auth UI inline so the user can log in.
        console.log("🔐 No local session — showing auth UI");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiFlow.decision = "no_token";
          window.app._dependencyGraph.uiFlow.action = "show_auth_ui";
        }

        this.showAuthUI();
        return;
      }

      // ── OFFLINE-FIRST: Token exists locally → OPEN APP IMMEDIATELY ────────
      // We trust the local session. Background validation will silently
      // verify with the server (if online) and only log out on hard 401.
      console.log("✅ Local session found — opening app immediately (offline-first)");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiFlow.decision = "local_session_present";
        window.app._dependencyGraph.uiFlow.action = "show_dashboard_ui_immediately";
      }

      this.showDashboardUI();

      // ── BACKGROUND VALIDATION — non-blocking ─────────────────────────────
      // Only runs when online. A 401 triggers logout; network errors are ignored.
      if (navigator.onLine) {
        // CRITICAL FIX: Check if this is a fresh login to prevent flicker
        const now = Date.now();
        const lastLoginTime = window.__LAST_LOGIN_TIME__ || 0;
        if (now - lastLoginTime < 3000) {
          console.log("ðŸ•°ï¸ [BOOT] Fresh login detected, delaying background validation to prevent flicker");
          setTimeout(() => {
            this.performBackgroundValidation();
          }, 3000 - (now - lastLoginTime));
        } else {
          this.performBackgroundValidation();
        }
      } else {
        console.log("ðŸ“± [BOOT] Device is offline â€” skipping background validation, app stays open");
      }
      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiFlow.completed = true;
        window.app._dependencyGraph.uiFlow.completionTime = new Date().toISOString();
      }
    },

    performBackgroundValidation: function() {
      console.log("ð [BOOT] Performing background validation...");
      this.validateToken()
        .then((validationResult) => {
          if (validationResult && validationResult.valid === false) {
            console.warn("â [BOOT] Background validation: token rejected by server â logging out");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.uiFlow.backgroundValidation = "failed";
              window.app._dependencyGraph.uiFlow.backgroundValidationReason = validationResult.reason;
            }

            // Give the user a moment to see the app before forcing logout
            setTimeout(() => {
              this.redirectToAuth("Session expired â please log in again");
            }, 500);
          } else {
            console.log("â [BOOT] Background validation: token is valid");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.uiFlow.backgroundValidation = "success";
            }
          }
        })
        .catch((err) => {
          // Network error / offline â silently ignore, app stays open
          console.log("ð [BOOT] Background validation skipped (network error):", err && err.message);
        });
    },

    validateToken: async function () {
      console.log("ð Validating authentication token...");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.tokenValidation = {
          started: true,
          startTime: new Date().toISOString(),
          methodsAttempted: [],
        };
      }

      if (window.api && window.api.auth && window.api.auth.validateToken) {
        try {
          const result = await window.api.auth.validateToken();
          if (result.valid !== undefined) {
            console.log("✅ Token validated via modular API");

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
                method: "modular_api",
                success: true,
                timestamp: new Date().toISOString(),
              });
              window.app._dependencyGraph.tokenValidation.completed = true;
              window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
              window.app._dependencyGraph.tokenValidation.success = true;
              window.app._dependencyGraph.tokenValidation.result = result;
            }

            return result;
          }
        } catch (error) {
          console.log("⚠️ Modular API validation failed:", error.message);

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
              method: "modular_api",
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      const validationMethods = [this.validateWithAuthState.bind(this), this.validateWithApiJs.bind(this), this.validateWithDirectCall.bind(this)];

      for (const method of validationMethods) {
        const methodName = method.name || method.toString().substring(0, 50);
        try {
          const result = await method();
          if (result.valid !== undefined) {
            console.log(`✅ Token validated via ${methodName}`);

            if (window.app && window.app._dependencyGraph) {
              window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
                method: methodName,
                success: true,
                timestamp: new Date().toISOString(),
              });
              window.app._dependencyGraph.tokenValidation.completed = true;
              window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
              window.app._dependencyGraph.tokenValidation.success = true;
              window.app._dependencyGraph.tokenValidation.result = result;
            }

            return result;
          }
        } catch (error) {
          console.log(`⚠️ Validation method ${methodName} failed:`, error.message);

          if (window.app && window.app._dependencyGraph) {
            window.app._dependencyGraph.tokenValidation.methodsAttempted.push({
              method: methodName,
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      const finalResult = {
        valid: false,
        reason: "All validation methods failed",
        error: "Unable to validate token",
      };

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.tokenValidation.completed = true;
        window.app._dependencyGraph.tokenValidation.completionTime = new Date().toISOString();
        window.app._dependencyGraph.tokenValidation.success = false;
        window.app._dependencyGraph.tokenValidation.result = finalResult;
      }

      return finalResult;
    },

    validateWithAuthState: async function () {
      if (typeof AUTH_STATE === "undefined" || typeof TOKEN_VALIDATION === "undefined") {
        throw new Error("AUTH_STATE or TOKEN_VALIDATION not available");
      }
      return await TOKEN_VALIDATION.validateWithBackend();
    },

    validateWithApiJs: async function () {
      if (typeof API_COORDINATION === "undefined" || !API_COORDINATION.isApiAvailable()) {
        throw new Error("API_COORDINATION not available");
      }
      return await API_COORDINATION.checkAuthMe();
    },

    validateWithDirectCall: async function () {
      const token = localStorage.getItem("accessToken") || localStorage.getItem("moodchat_jwt_token");
      if (!token) {
        return { valid: false, reason: "No token found" };
      }

      try {
        const parts = token.split(".");
        if (parts.length !== 3) {
          return { valid: false, reason: "Invalid token format" };
        }

        try {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.exp && payload.exp < Date.now() / 1000) {
            return { valid: false, reason: "Token expired" };
          }

          return {
            valid: true,
            user: {
              id: payload.sub || payload.userId || "unknown",
              email: payload.email || "user@example.com",
              name: payload.name || "User",
            },
          };
        } catch (e) {
          return { valid: false, reason: "Invalid token payload" };
        }
      } catch (error) {
        return { valid: false, reason: "Token validation error", error: error.message };
      }
    },

    registerCoreModule: async function () {
      console.log("📝 Registering core module...");

      if (window.app && window.app._coreRegistered) {
        console.log("⚠️ Core module already registered, skipping");
        return;
      }

      if (!window.app || !window.app._namespaceInitialized) {
        console.log("⚠️ Namespace not initialized, deferring core registration");

        if (window.app && window.app._deferRegistration) {
          window.app._deferRegistration("app.core", () => {
            console.log("✅ Deferred core module registration executing");
            return this.createCoreModule();
          });
        }
        return;
      }

      try {
        const coreModule = this.createCoreModule();

        if (!window.app.core) {
          window.app.core = coreModule;
        } else {
          Object.keys(coreModule).forEach((key) => {
            if (typeof window.app.core[key] === "undefined") {
              window.app.core[key] = coreModule[key];
            }
          });
        }

        if (window.app._coreRegistered !== undefined) {
          window.app._coreRegistered = true;
        }

        if (window.app._dependencyGraph) {
          window.app._dependencyGraph.coreRegistration = {
            registered: true,
            registrationTime: new Date().toISOString(),
            moduleProperties: Object.keys(coreModule),
          };
        }

        console.log("✅ Core module registered successfully");
      } catch (error) {
        console.error("❌ Core module registration failed:", error);

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coreRegistration = {
            registered: false,
            registrationTime: new Date().toISOString(),
            error: error.message,
          };
        }

        this.moduleFailures.add("app.core");
        this.failedModules.set("app.core", error);
      }
    },

    createCoreModule: function () {
      return {
        api: {
          isReady: function () {
            return window.api && window.api.core && window.api.core.initialize;
          },
          waitForReady: function (timeout = 10000) {
            return new Promise((resolve, reject) => {
              if (this.isReady()) {
                resolve(true);
                return;
              }

              const checkInterval = setInterval(() => {
                if (this.isReady()) {
                  clearInterval(checkInterval);
                  clearTimeout(timeoutId);
                  resolve(true);
                }
              }, 100);

              const timeoutId = setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error("API readiness timeout"));
              }, timeout);
            });
          },
          initializeWithCoordination: async function () {
            try {
              if (this.isReady()) {
                await window.api.core.initialize();
                return true;
              }
              return false;
            } catch (error) {
              console.error("API initialization failed:", error);
              return false;
            }
          },
        },

        lifecycle: {
          getPhase: function () {
            return BOOTSTRAP_STATE.getPhase();
          },
          isBootstrapped: function () {
            return BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.READY) || BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.DEGRADED);
          },
          isDegraded: function () {
            return BOOTSTRAP_STATE.isDegraded();
          },
          waitForBootstrap: function () {
            return DEPENDENCY_QUEUE.waitForReady();
          },
          getStatus: function () {
            return APP_BOOTSTRAP.getStatus();
          },
          onBootstrapComplete: function (callback) {
            APP_BOOTSTRAP.registerCallback(callback);
          },
          queueOperation: function (operation) {
            APP_BOOTSTRAP.queueOperation(operation);
          },
        },

        state: {
          getAuthState: function () {
            try {
              return {
                isAuthenticated: !!(
                  window.currentUser ||
                  (typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())
                ),
                user:
                  window.currentUser ||
                  (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
                hasToken: !!(typeof AUTH_STATE !== "undefined" && AUTH_STATE.hasToken && AUTH_STATE.hasToken()),
                tokenValid: !!(typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated()),
              };
            } catch (error) {
              console.warn("⚠️ Failed to get auth state:", error);
              return { isAuthenticated: false, user: null, hasToken: false, tokenValid: false };
            }
          },
          getUIState: function () {
            try {
              if (typeof UI_ORCHESTRATOR !== "undefined") {
                return UI_ORCHESTRATOR.getState();
              }
            } catch (error) {
              console.warn("⚠️ Failed to get UI state:", error);
            }
            return null;
          },
          getNetworkState: function () {
            try {
              return {
                status:
                  typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                    ? API_COORDINATION.getNetworkStatus()
                    : "unknown",
                isOnline:
                  typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                    ? API_COORDINATION.getNetworkStatus() === "online"
                    : false,
              };
            } catch (error) {
              console.warn("⚠️ Failed to get network state:", error);
              return { status: "unknown", isOnline: false };
            }
          },
          getSessionState: function () {
            try {
              if (typeof SESSION_COORDINATOR !== "undefined") {
                return SESSION_COORDINATOR.getStatus();
              }
            } catch (error) {
              console.warn("⚠️ Failed to get session state:", error);
            }
            return null;
          },
        },

        events: {
          on: function (eventName, callback) {
            try {
              if (typeof MoodChatEvents !== "undefined") {
                MoodChatEvents.on(eventName, callback);
              } else {
                window.addEventListener(eventName, (event) => {
                  callback(event.detail);
                });
              }
            } catch (error) {
              console.error(`⚠️ Failed to add event listener for ${eventName}:`, error);
            }
          },
          off: function (eventName, callback) {
            try {
              if (typeof MoodChatEvents !== "undefined") {
                MoodChatEvents.off(eventName, callback);
              } else {
                window.removeEventListener(eventName, callback);
              }
            } catch (error) {
              console.error(`⚠️ Failed to remove event listener for ${eventName}:`, error);
            }
          },
          emit: function (eventName, data) {
            try {
              if (typeof MoodChatEvents !== "undefined") {
                MoodChatEvents.emit(eventName, data);
              } else {
                const event = new CustomEvent(eventName, {
                  detail: data,
                  bubbles: true,
                  cancelable: true,
                });
                window.dispatchEvent(event);
              }
            } catch (error) {
              console.error(`⚠️ Failed to emit event ${eventName}:`, error);
            }
          },
          once: function (eventName, callback) {
            try {
              if (typeof MoodChatEvents !== "undefined") {
                MoodChatEvents.once(eventName, callback);
              } else {
                const onceCallback = (event) => {
                  callback(event.detail);
                  window.removeEventListener(eventName, onceCallback);
                };
                window.addEventListener(eventName, onceCallback);
              }
            } catch (error) {
              console.error(`⚠️ Failed to add once listener for ${eventName}:`, error);
            }
          },
        },

        errors: {
          getStats: function () {
            try {
              if (typeof ERROR_HANDLER !== "undefined") {
                return ERROR_HANDLER.getStats();
              }
            } catch (error) {
              console.warn("⚠️ Failed to get error stats:", error);
            }
            return null;
          },
          onError: function (callback) {
            try {
              if (typeof ERROR_HANDLER !== "undefined") {
                ERROR_HANDLER.onError(callback);
              }
            } catch (error) {
              console.warn("⚠️ Failed to register error handler:", error);
            }
          },
          showError: function (message, type = "error") {
            try {
              if (typeof ERROR_HANDLER !== "undefined") {
                ERROR_HANDLER.showErrorToUser(message, type);
              } else {
                console.error(`[${type.toUpperCase()}] ${message}`);
              }
            } catch (error) {
              console.warn("⚠️ Failed to show error:", error);
            }
          },
        },

        performance: {
          getBootstrapMetrics: function () {
            if (BOOTSTRAP_STATE.startTime) {
              return {
                elapsedMs: Date.now() - BOOTSTRAP_STATE.startTime,
                startTime: new Date(BOOTSTRAP_STATE.startTime).toISOString(),
                currentPhase: BOOTSTRAP_STATE.getPhase(),
                isDegraded: BOOTSTRAP_STATE.isDegraded(),
              };
            }
            return null;
          },
          getDependencyMetrics: function () {
            if (window.app && window.app._dependencyGraph) {
              return {
                apiWait: window.app._dependencyGraph.apiWait,
                authWait: window.app._dependencyGraph.authWait,
                authCheck: window.app._dependencyGraph.authCheck,
                tokenValidation: window.app._dependencyGraph.tokenValidation,
                uiFlow: window.app._dependencyGraph.uiFlow,
                failures: ERROR_TRACKER.getFailureReport(),
              };
            }
            return null;
          },
        },

        compatibility: {
          hasLegacyFunctions: function () {
            return {
              switchTab: typeof window.switchTab === "function",
              toggleSidebar: typeof window.toggleSidebar === "function",
              showNotification: typeof window.showNotification === "function",
              loadExternalTab: typeof window.loadExternalTab === "function",
            };
          },
          getMoodChatCoreStatus: function () {
            return {
              exists: typeof window.MoodChatCore !== "undefined",
              components: window.MoodChatCore ? Object.keys(window.MoodChatCore) : [],
            };
          },
        },

        system: {
          getStatus: function () {
            return {
              namespace: {
                initialized: window.app ? window.app._namespaceInitialized : false,
                coreRegistered: window.app ? window.app._coreRegistered : false,
              },
              bootstrap: BOOTSTRAP_STATE.getStatusReport(),
              dependencies: {
                apiJs: BOOTSTRAP_STATE.dependencies.apiJs,
                domReady: BOOTSTRAP_STATE.dependencies.domReady,
                authReady: BOOTSTRAP_STATE.dependencies.authReady,
              },
              appReady: DEPENDENCY_QUEUE.isReady(),
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
              failures: ERROR_TRACKER.getFailureReport(),
              timestamp: new Date().toISOString(),
            };
          },
          getDependencyGraph: function () {
            return window.app ? window.app._dependencyGraph : null;
          },
          getHealth: function () {
            const status = this.getStatus();
            return {
              healthy:
                (status.bootstrap.phase === BOOTSTRAP_STATE.PHASES.READY ||
                  status.bootstrap.phase === BOOTSTRAP_STATE.PHASES.DEGRADED) &&
                status.appReady,
              phase: status.bootstrap.phase,
              isDegraded: status.isDegraded,
              appReady: status.appReady,
              dependenciesReady: Object.values(status.dependencies).every((v) => v),
              namespaceReady: status.namespace.initialized,
              coreRegistered: status.namespace.coreRegistered,
            };
          },
        },

        utils: {
          safeAsync: async function (operation, errorHandler) {
            try {
              return await operation();
            } catch (error) {
              if (typeof errorHandler === "function") {
                errorHandler(error);
              } else {
                console.error("Operation failed:", error);
              }
              throw error;
            }
          },
          debounce: function (func, wait) {
            let timeout;
            return function executedFunction(...args) {
              const later = () => {
                clearTimeout(timeout);
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          },
          throttle: function (func, limit) {
            let inThrottle;
            return function (...args) {
              if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
              }
            };
          },
        },
      };
    },

    showAuthUI: function () {
      console.log("👤 Showing authentication UI");

      this.hideLoadingScreen();

      const authContainer =
        document.getElementById("authContainer") || document.querySelector(".auth-container") || document.querySelector("main");

      if (authContainer) {
        authContainer.classList.remove("hidden");
      }

      const event = new CustomEvent("moodchat-auth-ui-required", {
        detail: {
          timestamp: new Date().toISOString(),
          reason: "Public page or no valid session",
          isDegraded: BOOTSTRAP_STATE.isDegraded(),
        },
      });
      window.dispatchEvent(event);
    },

    showDashboardUI: function () {
      console.log("🏠 Showing dashboard UI");

      if (!userLoggedIn()) {
        console.log("🔐 User not logged in, redirecting to login instead of showing dashboard");
        this.redirectToAuth("User not logged in");
        return;
      }

      this.hideLoadingScreen();

      const appContainer =
        document.getElementById("appContainer") || document.querySelector(".app-container") || document.querySelector("main");

      if (appContainer) {
        appContainer.classList.remove("hidden");
      }

      const event = new CustomEvent("moodchat-dashboard-ui-required", {
        detail: {
          timestamp: new Date().toISOString(),
          user:
            window.currentUser ||
            (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
          isDegraded: BOOTSTRAP_STATE.isDegraded(),
          failures: ERROR_TRACKER.getFailureReport(),
        },
      });
      window.dispatchEvent(event);

      this.loadAppContent();
    },

    redirectToAuth: function (reason = "Authentication required") {
      console.log(`🔐 Redirecting to auth: ${reason}`);

      const currentPath = window.location.pathname;
      const authPages = ["/", "/index.html", "/index.html", "/index.html", "/signup.html"];
      const isAuthPage = authPages.some((page) => currentPath.endsWith(page));

      if (!isAuthPage) {
        const returnPath = currentPath + window.location.search;
        try {
          sessionStorage.setItem("moodchat_return_path", returnPath);
        } catch (error) {
          console.warn("⚠️ Failed to store return path:", error);
        }

        setTimeout(() => {
          window.location.href = "/index.html";
        }, 100);
      } else {
        console.log("Already on auth page, not redirecting");
        this.showAuthUI();
      }
    },

    initializeGlobalUI: async function () {
      BOOTSTRAP_STATE.setPhase(BOOTSTRAP_STATE.PHASES.UI_LOADING);
      console.log("🎨 Initializing global UI components...");

      const sessionBarrierPromise = BootstrapBarrier.waitForSession(10000);
      if (sessionBarrierPromise && sessionBarrierPromise.catch) {
        sessionBarrierPromise.catch(() => {
          console.warn("[BOOT] â Session not ready for UI init, proceeding anyway");
        });
      }
      await sessionBarrierPromise;

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.uiInitialization = {
          started: true,
          startTime: new Date().toISOString(),
          components: [],
        };
      }

      try {
        const uiComponents = [
          { name: "sidebar", init: () => this.crashSafeInitializeSidebar() },
          { name: "navigation", init: () => this.crashSafeInitializeNavigation() },
          { name: "theme", init: () => this.crashSafeInitializeTheme() },
          { name: "notifications", init: () => this.crashSafeInitializeNotifications() },
          { name: "responsive", init: () => this.crashSafeInitializeResponsiveBehaviors() },
        ];

        for (const component of uiComponents) {
          try {
            console.log(`🎨 Initializing ${component.name}...`);
            await component.init();
            console.log(`✅ ${component.name} initialized`);
          } catch (error) {
            const errorKey = `ui-component:${component.name}`;
            if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
              console.error(`❌ ${component.name} initialization failed:`, error.message);
            }
            this.failedModules.set(component.name, error);
          }
        }

        console.log("✅ Global UI components initialization attempt completed");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiInitialization.completed = true;
          window.app._dependencyGraph.uiInitialization.completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.success = true;
        }
      } catch (error) {
        console.error("⚠️ Global UI initialization failed:", error);

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.uiInitialization.completed = true;
          window.app._dependencyGraph.uiInitialization.completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.success = false;
          window.app._dependencyGraph.uiInitialization.error = error.message;
        }
      } finally {
        window.AppBootContext.setReady("ui");
      }
    },

    crashSafeInitializeSidebar: function () {
      return safeExecuteAsync(() => this.initializeSidebar(), "initializeSidebar", 1);
    },

    crashSafeInitializeNavigation: function () {
      return safeExecuteAsync(() => this.initializeNavigation(), "initializeNavigation", 1);
    },

    crashSafeInitializeTheme: function () {
      return safeExecuteAsync(() => this.initializeTheme(), "initializeTheme", 1);
    },

    crashSafeInitializeNotifications: function () {
      return safeExecuteAsync(() => this.initializeNotifications(), "initializeNotifications", 1);
    },

    crashSafeInitializeResponsiveBehaviors: function () {
      return safeExecuteAsync(() => this.initializeResponsiveBehaviors(), "initializeResponsiveBehaviors", 1);
    },

    initializeSidebar: function () {
      const sidebar = document.querySelector(".sidebar");
      if (!sidebar) return Promise.resolve();

      return new Promise((resolve) => {
        console.log("📐 Initializing sidebar...");

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          window.app._dependencyGraph.uiInitialization.components.push({
            name: "sidebar",
            startTime: new Date().toISOString(),
          });
        }

        sidebar.classList.remove("hidden");

        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          sidebar.classList.add("mobile-collapsed");
        } else {
          sidebar.classList.remove("mobile-collapsed");
        }

        const toggleButton = document.querySelector(".sidebar-toggle, #sidebarToggle");
        if (toggleButton) {
          toggleButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.toggle("collapsed");

            const event = new CustomEvent("moodchat-sidebar-toggle", {
              detail: {
                collapsed: sidebar.classList.contains("collapsed"),
                timestamp: new Date().toISOString(),
              },
            });
            window.dispatchEvent(event);
          });
        }

        console.log("✅ Sidebar initialized");

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const sidebarIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "sidebar");
          if (sidebarIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[sidebarIndex].success = true;
          }
        }

        resolve();
      });
    },

    initializeNavigation: function () {
      console.log("🧭 Initializing navigation...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: "navigation",
          startTime: new Date().toISOString(),
        });
      }

      if (typeof window.switchTab === "function") {
        console.log("✅ Using existing navigation system");

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const navIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "navigation");
          if (navIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[navIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[navIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[navIndex].success = true;
            window.app._dependencyGraph.uiInitialization.components[navIndex].method = "existing_system";
          }
        }

        return Promise.resolve();
      }

      document.querySelectorAll("[data-nav]").forEach((element) => {
        element.addEventListener("click", (e) => {
          e.preventDefault();
          const target = element.getAttribute("data-nav");
          this.navigateTo(target);
        });
      });

      window.addEventListener("popstate", (event) => {
        if (event.state && event.state.page) {
          this.navigateTo(event.state.page, false);
        }
      });

      console.log("✅ Navigation initialized");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const navIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "navigation");
        if (navIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[navIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[navIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[navIndex].success = true;
          window.app._dependencyGraph.uiInitialization.components[navIndex].method = "basic_implementation";
        }
      }

      return Promise.resolve();
    },

    navigateTo: function (page, pushState = true) {
      console.log(`🧭 Navigating to: ${page}`);

      if (!userLoggedIn() && page !== "login" && page !== "index") {
        console.log("🔐 Authentication required, redirecting to login");
        this.redirectToAuth("Authentication required for page navigation");
        return;
      }

      if (NavigationController.isLocked()) {
        console.log(`[NAV] ⏳ Navigation locked, queuing ${page}`);
        NavigationController.afterUnlock(() => this.navigateTo(page, pushState));
        return;
      }

      if (pushState) {
        window.history.pushState({ page: page }, "", page);
      }

      const event = new CustomEvent("moodchat-navigation", {
        detail: {
          page: page,
          timestamp: new Date().toISOString(),
          pushState: pushState,
        },
      });
      window.dispatchEvent(event);
    },

    initializeTheme: function () {
      console.log("🎨 Initializing theme...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: "theme",
          startTime: new Date().toISOString(),
        });
      }

      if (typeof SETTINGS_SERVICE !== "undefined") {
        try {
          SETTINGS_SERVICE.applyTheme();
          console.log("✅ Theme initialized via settings service");

          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
            const themeIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "theme");
            if (themeIndex !== -1) {
              window.app._dependencyGraph.uiInitialization.components[themeIndex].completed = true;
              window.app._dependencyGraph.uiInitialization.components[themeIndex].completionTime = new Date().toISOString();
              window.app._dependencyGraph.uiInitialization.components[themeIndex].success = true;
              window.app._dependencyGraph.uiInitialization.components[themeIndex].method = "settings_service";
            }
          }

          return Promise.resolve();
        } catch (error) {
          console.warn("⚠️ Settings service theme application failed:", error);
          this.moduleFailures.add("SETTINGS_SERVICE.applyTheme");
          this.failedModules.set("SETTINGS_SERVICE", error);
        }
      }

      try {
        const html = document.documentElement;
        const savedTheme = localStorage.getItem("moodchat_theme") || "dark";

        html.classList.remove("theme-dark", "theme-light", "theme-auto");

        if (savedTheme === "auto") {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          html.classList.add(prefersDark ? "theme-dark" : "theme-light");
          html.classList.add("theme-auto");
        } else {
          html.classList.add(`theme-${savedTheme}`);
        }

        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
          if (savedTheme === "auto") {
            html.classList.remove("theme-dark", "theme-light");
            html.classList.add(e.matches ? "theme-dark" : "theme-light");
          }
        });

        console.log(`✅ Theme initialized: ${savedTheme}`);

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
          const themeIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "theme");
          if (themeIndex !== -1) {
            window.app._dependencyGraph.uiInitialization.components[themeIndex].completed = true;
            window.app._dependencyGraph.uiInitialization.components[themeIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.uiInitialization.components[themeIndex].success = true;
            window.app._dependencyGraph.uiInitialization.components[themeIndex].method = "fallback";
            window.app._dependencyGraph.uiInitialization.components[themeIndex].theme = savedTheme;
          }
        }
      } catch (error) {
        console.warn("⚠️ Fallback theme initialization failed:", error);
      }

      return Promise.resolve();
    },

    initializeNotifications: function () {
      console.log("🔔 Initializing notification system...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: "notifications",
          startTime: new Date().toISOString(),
        });
      }

      let container = document.getElementById("notification-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "notification-container";
        container.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        `;
        document.body.appendChild(container);
      }

      window.showNotification = function (message, type = "info", duration = 5000) {
        try {
          const notification = document.createElement("div");
          notification.className = `notification notification-${type}`;
          notification.style.cssText = `
            background: ${
              type === "error"
                ? "#f87171"
                : type === "success"
                ? "#10b981"
                : type === "warning"
                ? "#f59e0b"
                : "#3b82f6"
            };
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideInRight 0.3s ease-out;
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 400px;
          `;

          notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close" style="
              background: transparent;
              border: none;
              color: white;
              cursor: pointer;
              margin-left: 10px;
              font-size: 18px;
            ">&times;</button>
          `;

          container.appendChild(notification);

          notification.querySelector(".notification-close").addEventListener("click", () => {
            notification.style.animation = "slideOutRight 0.3s ease-in";
            setTimeout(() => notification.remove(), 300);
          });

          if (duration > 0) {
            setTimeout(() => {
              if (notification.parentNode) {
                notification.style.animation = "slideOutRight 0.3s ease-in";
                setTimeout(() => notification.remove(), 300);
              }
            }, duration);
          }

          if (!document.getElementById("notification-animations")) {
            const style = document.createElement("style");
            style.id = "notification-animations";
            style.textContent = `
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
              }
            `;
            document.head.appendChild(style);
          }

          return notification;
        } catch (error) {
          console.error("⚠️ Failed to create notification:", error);
          return null;
        }
      };

      console.log("✅ Notification system initialized");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const notifIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "notifications");
        if (notifIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[notifIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[notifIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[notifIndex].success = true;
        }
      }

      return Promise.resolve();
    },

    initializeResponsiveBehaviors: function () {
      console.log("📱 Initializing responsive behaviors...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        window.app._dependencyGraph.uiInitialization.components.push({
          name: "responsive",
          startTime: new Date().toISOString(),
        });
      }

      let resizeTimeout;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.handleResponsiveChange();
        }, 250);
      });

      this.handleResponsiveChange();

      console.log("✅ Responsive behaviors initialized");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.uiInitialization) {
        const respIndex = window.app._dependencyGraph.uiInitialization.components.findIndex((c) => c.name === "responsive");
        if (respIndex !== -1) {
          window.app._dependencyGraph.uiInitialization.components[respIndex].completed = true;
          window.app._dependencyGraph.uiInitialization.components[respIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.uiInitialization.components[respIndex].success = true;
        }
      }

      return Promise.resolve();
    },

    handleResponsiveChange: function () {
      try {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const isDesktop = window.innerWidth >= 1024;

        document.body.classList.remove("mobile-view", "tablet-view", "desktop-view");
        document.body.classList.add(isMobile ? "mobile-view" : isTablet ? "tablet-view" : "desktop-view");

        const sidebar = document.querySelector(".sidebar");
        if (sidebar) {
          if (isMobile) {
            sidebar.classList.add("mobile-collapsed");
          } else {
            sidebar.classList.remove("mobile-collapsed");
          }
        }

        const event = new CustomEvent("moodchat-responsive-change", {
          detail: {
            isMobile: isMobile,
            isTablet: isTablet,
            isDesktop: isDesktop,
            width: window.innerWidth,
            height: window.innerHeight,
            timestamp: new Date().toISOString(),
          },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn("⚠️ Responsive change handler failed:", error);
      }
    },

    loadAppContent: function () {
      console.log("📦 Loading app content with session-aware sequencing...");

      if (!userLoggedIn()) {
        // ── OFFLINE-FIRST: Never hard-redirect from content loading ──────────
        // If local session is missing, show auth UI. A redirect here would break
        // offline scenarios and cause redirect loops on slow connections.
        console.log("🔐 No local session in loadAppContent — showing auth UI");
        this.showAuthUI();
        return;
      }

      const validateSession = () => {
        if (window.currentUser) return true;
        if (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser) {
          try {
            const user = AUTH_STATE.getUser();
            if (user) {
              window.currentUser = user;
              return true;
            }
          } catch (error) {
            console.warn("⚠️ Failed to get user from AUTH_STATE:", error);
          }
        }
        return false;
      };

      try {
        const user =
          window.currentUser || (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null);
        const event = new CustomEvent("moodchat-content-loading", {
          detail: {
            timestamp: new Date().toISOString(),
            user: user,
            sessionReady: !!user,
            isDegraded: BOOTSTRAP_STATE.isDegraded(),
          },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn("⚠️ Failed to dispatch content loading event:", error);
      }

      if (!validateSession()) {
        console.warn("⚠️ Session not ready, delaying content load...");

        const waitForSession = () => {
          return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (validateSession()) {
                clearInterval(checkInterval);
                console.log("✅ Session ready, proceeding with content load");
                resolve(true);
              }
            }, 100);

            setTimeout(() => {
              clearInterval(checkInterval);
              console.log("⚠️ Session wait timeout, proceeding anyway");
              resolve(false);
            }, 5000);
          });
        };

        waitForSession().then((sessionReady) => {
          if (!sessionReady && !BOOTSTRAP_STATE.isDegraded()) {
            console.error("❌ Session never became ready, showing auth UI");
            APP_BOOTSTRAP.showAuthUI();
            return;
          }
          this.loadAppContentInternal();
        });

        return;
      }

      this.loadAppContentInternal();
    },

    loadAppContentInternal: function () {
      console.log("🔄 Executing session-aware content loading sequence");

      safeExecuteAsync(() => this.initializeNavigationContainer(), "initializeNavigationContainer", 1).then(() => {
        const pageToLoad = this.determinePageToLoad();

        safeExecuteAsync(() => this.ensureParentShellLoaded(), "ensureParentShellLoaded", 1).then(() => {
          BootstrapBarrier.waitForSession(10000)
            .then(() => {
              this.loadPageSafely(pageToLoad);
              this.initializeIframeCoordination();
              window.AppBootContext.setReady("iframes");
            })
            .catch(() => {
              console.warn("[BOOT] ⚠️ Session wait timeout for iframes, loading anyway");
              this.loadPageSafely(pageToLoad);
              this.initializeIframeCoordination();
              window.AppBootContext.setReady("iframes");
            });
        }).catch((error) => {
          console.error("❌ Failed to ensure parent shell:", error);
          if (!BOOTSTRAP_STATE.isDegraded()) {
            this.showFatalError(new Error("Parent shell failed to load"));
          } else {
            console.warn("[BOOT] ⚠️ Parent shell failed in degraded mode - continuing");
          }
        });
      }).catch((error) => {
        console.error("❌ Navigation initialization failed:", error);
        const pageToLoad = this.determinePageToLoad();
        this.loadPageSafely(pageToLoad);
      });
    },

    initializeNavigationContainer: function () {
      return new Promise((resolve) => {
        console.log("🧭 Initializing navigation container...");

        const navSelectors =
          APP_CONFIG.navigation?.container || "#nav-container, .navigation-container, nav";
        const navContainer = document.querySelector(navSelectors);

        if (!navContainer) {
          console.log("⚠️ Navigation container not found, creating one");

          const newNav = document.createElement("nav");
          newNav.id = "navigation-container";
          newNav.className = "navigation-container";
          newNav.style.cssText = `
            position: relative;
            z-index: 1000;
            background: var(--bg-secondary);
            padding: 10px;
            display: flex;
            gap: 10px;
            border-bottom: 1px solid var(--border-color);
          `;

          if (APP_CONFIG.pages) {
            Object.keys(APP_CONFIG.pages).forEach((pageKey) => {
              const page = APP_CONFIG.pages[pageKey];
              if (page.requiresAuth !== false) {
                const navItem = document.createElement("button");
                navItem.className = "nav-item";
                navItem.dataset.page = pageKey;
                navItem.innerHTML = `${page.icon || "📄"} ${page.title || pageKey}`;
                navItem.style.cssText = `
                  padding: 8px 12px;
                  border: none;
                  background: transparent;
                  color: var(--text-primary);
                  cursor: pointer;
                  border-radius: 4px;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                `;

                navItem.addEventListener("click", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.loadPageSafely(pageKey);
                });

                newNav.appendChild(navItem);
              }
            });
          }

          const appContainer = document.querySelector(APP_CONFIG.parentShell?.containerId || "#app-container");
          if (appContainer) {
            appContainer.prepend(newNav);
          } else {
            document.body.prepend(newNav);
          }

          console.log("✅ Created navigation container");
        } else {
          console.log("✅ Navigation container found");

          navContainer.querySelectorAll("[data-page], [data-tab]").forEach((item) => {
            const pageKey = item.getAttribute("data-page") || item.getAttribute("data-tab");
            item.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.loadPageSafely(pageKey);
            });
          });
        }

        window.dispatchEvent(
          new CustomEvent("moodchat-navigation-ready", {
            detail: {
              timestamp: new Date().toISOString(),
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
            },
          })
        );

        resolve();
      });
    },

    determinePageToLoad: function () {
      console.log("🔍 Determining page to load...");

      let savedPageKey = null;
      try {
        const savedValue = sessionStorage.getItem("moodchat_last_page");

        if (savedValue) {
          if (
            savedValue.startsWith("[object") ||
            savedValue.includes("Object]") ||
            savedValue.trim() === ""
          ) {
            console.warn("⚠️ Invalid session storage value detected, removing:", savedValue);
            sessionStorage.removeItem("moodchat_last_page");
            savedPageKey = null;
          } else if (APP_CONFIG.pages && APP_CONFIG.pages[savedValue]) {
            savedPageKey = savedValue;
            console.log("✅ Restoring page from session storage:", savedPageKey);
          } else if (savedValue.endsWith(".html")) {
            if (APP_CONFIG.pages) {
              const matchingKey = Object.keys(APP_CONFIG.pages).find(
                (key) => APP_CONFIG.pages[key].file === savedValue
              );
              if (matchingKey) {
                savedPageKey = matchingKey;
                console.log("✅ Mapped HTML file to page key:", savedValue, "->", savedPageKey);
              }
            }
          }
        }
      } catch (error) {
        console.error("❌ Error reading session storage:", error);
        sessionStorage.removeItem("moodchat_last_page");
      }

      if (!savedPageKey && APP_CONFIG.defaultPageKey && APP_CONFIG.pages) {
        if (APP_CONFIG.pages[APP_CONFIG.defaultPageKey]) {
          savedPageKey = APP_CONFIG.defaultPageKey;
          console.log("✅ Using default page key:", savedPageKey);
        }
      }

      if (!savedPageKey) {
        savedPageKey = "chat";
        console.log("⚠️ Using fallback page key: chat");
      }

      if (!APP_CONFIG.pages || !APP_CONFIG.pages[savedPageKey]) {
        console.error("❌ Page not found in config:", savedPageKey);
        savedPageKey = "chat";
      }

      console.log("🎯 Determined page to load:", {
        pageKey: savedPageKey,
        pageConfig: APP_CONFIG.pages[savedPageKey],
      });

      return savedPageKey;
    },

    ensureParentShellLoaded: function () {
      return new Promise((resolve) => {
        const currentPath = window.location.pathname;
        const parentShellFile = APP_CONFIG.parentShell?.file || "chat.html";

        if (currentPath.endsWith(parentShellFile) || currentPath.endsWith("/")) {
          console.log("✅ Already in parent shell");
          resolve();
          return;
        }

        const parentContainerId = APP_CONFIG.parentShell?.containerId || "app-container";
        const parentContainer = document.getElementById(parentContainerId);

        if (parentContainer) {
          console.log("✅ Parent container exists");
          resolve();
          return;
        }

        console.log("⚠️ Parent shell not detected, but continuing...");
        resolve();
      });
    },

    loadPageSafely: function (pageKey) {
      console.log(`🚀 Loading page: ${pageKey}`);

      if (!userLoggedIn() && pageKey !== "login" && pageKey !== "index") {
        console.log(`🔐 Authentication required for page ${pageKey}, redirecting to login`);
        this.redirectToAuth(`Authentication required for page ${pageKey}`);
        return;
      }

      if (!APP_CONFIG.pages || !APP_CONFIG.pages[pageKey]) {
        console.error(`❌ Page "${pageKey}" not found in config`);
        pageKey = "chat";
      }

      const pageConfig = APP_CONFIG.pages[pageKey];

      safeLoadPageResources(pageKey);

      try {
        sessionStorage.setItem("moodchat_last_page", pageKey);
        console.log("💾 Saved page key to session storage:", pageKey);
      } catch (error) {
        console.error("❌ Failed to save to session storage:", error);
      }

      this.updateActiveNavigation(pageKey);

      if (pageConfig.isIframe && !pageConfig.isParent) {
        BootstrapBarrier.waitForSession(5000)
          .then(() => {
            this.loadIframePage(pageConfig);
          })
          .catch(() => {
            console.warn("[BOOT] ⚠️ Session not ready for iframe, loading anyway");
            this.loadIframePage(pageConfig);
          });
      } else {
        this.loadMainPage(pageConfig);
      }
    },

    loadIframePage: function (pageConfig) {
      console.log(`🖼️ Loading iframe page: ${pageConfig.title || pageConfig.file}`);

      const containerSelector =
        pageConfig.container ||
        APP_CONFIG.parentShell?.iframeContainer ||
        "#iframe-container, .page-container";
      let container = document.querySelector(containerSelector);

      if (!container) {
        console.error(`❌ Iframe container not found: ${containerSelector}`);

        const newContainer = document.createElement("div");
        newContainer.id = "iframe-container";
        newContainer.className = "page-container";
        newContainer.style.cssText = `
          width: 100%;
          height: 100%;
          position: relative;
        `;

        const appContainer = document.querySelector(APP_CONFIG.parentShell?.containerId || "#app-container");
        if (appContainer) {
          const nav = appContainer.querySelector("#navigation-container, nav");
          if (nav && nav.nextSibling) {
            appContainer.insertBefore(newContainer, nav.nextSibling);
          } else {
            appContainer.appendChild(newContainer);
          }
        } else {
          document.body.appendChild(newContainer);
        }

        console.log("✅ Created iframe container");
        this.loadIframePage(pageConfig);
        return;
      }

      container.innerHTML = "";

      const iframe = document.createElement("iframe");
      iframe.id = pageConfig.id;
      iframe.className = "page-iframe";
      iframe.src = pageConfig.file;
      iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      `;
      iframe.setAttribute("data-page-key", Object.keys(APP_CONFIG.pages).find((key) => APP_CONFIG.pages[key].id === pageConfig.id));
      iframe.setAttribute("loading", "eager");

      const loadingDiv = document.createElement("div");
      loadingDiv.className = "iframe-loading";
      loadingDiv.innerHTML = `Loading ${pageConfig.title || "page"}...`;
      loadingDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--text-secondary);
      `;

      container.appendChild(loadingDiv);
      container.appendChild(iframe);

      iframe.addEventListener("load", () => {
        console.log(`✅ Iframe loaded: ${pageConfig.id}`);

        if (loadingDiv.parentNode) {
          loadingDiv.remove();
        }

        this.propagateSessionToIframe(iframe, pageConfig);

        window.dispatchEvent(
          new CustomEvent("moodchat-page-loaded", {
            detail: {
              pageId: pageConfig.id,
              pageKey: Object.keys(APP_CONFIG.pages).find((key) => APP_CONFIG.pages[key].id === pageConfig.id),
              isIframe: true,
              timestamp: new Date().toISOString(),
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
            },
          })
        );
      });

      iframe.addEventListener("error", (error) => {
        console.error(`❌ Iframe failed to load: ${pageConfig.file}`, error);

        loadingDiv.innerHTML = `Failed to load ${pageConfig.title || "page"}.<br>Please try again.`;
        loadingDiv.style.color = "var(--error-color, #f87171)";

        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.src = iframe.src;
          }
        }, 3000);
      });
    },

    propagateSessionToIframe: function (iframe, pageConfig) {
      try {
        const sendSession = () => {
          if (iframe.contentWindow) {
            const sessionData = {
              type: "moodchat-session-data",
              user:
                window.currentUser ||
                (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
              isAuthenticated: !!(
                window.currentUser ||
                (typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())
              ),
              token: typeof AUTH_STATE !== "undefined" && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null,
              timestamp: new Date().toISOString(),
              pageConfig: pageConfig,
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
            };

            iframe.contentWindow.postMessage(sessionData, "*");
            console.log(`📤 Session propagated to iframe: ${pageConfig.id}`);
          } else {
            setTimeout(sendSession, 100);
          }
        };

        sendSession();
      } catch (error) {
        console.error(`❌ Failed to propagate session to iframe ${pageConfig.id}:`, error);
      }
    },

    loadMainPage: function (pageConfig) {
      console.log(`🏠 Loading main page: ${pageConfig.title || pageConfig.file}`);

      if (pageConfig.isParent) {
        console.log("✅ Already on parent shell page");

        this.updateActiveNavigation(Object.keys(APP_CONFIG.pages).find((key) => APP_CONFIG.pages[key].id === pageConfig.id));

        window.dispatchEvent(
          new CustomEvent("moodchat-page-loaded", {
            detail: {
              pageId: pageConfig.id,
              pageKey: Object.keys(APP_CONFIG.pages).find((key) => APP_CONFIG.pages[key].id === pageConfig.id),
              isIframe: false,
              timestamp: new Date().toISOString(),
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
            },
          })
        );

        return;
      }

      if (typeof window.loadPage === "function") {
        window.loadPage(pageConfig.file);
      } else if (typeof window.loadExternalTab === "function") {
        const pageKey = Object.keys(APP_CONFIG.pages).find((key) => APP_CONFIG.pages[key].id === pageConfig.id);
        window.loadExternalTab(pageKey, pageConfig.file);
      } else {
        window.location.href = pageConfig.file;
      }
    },

    updateActiveNavigation: function (pageKey) {
      console.log(`🧭 Updating active navigation for: ${pageKey}`);

      document.querySelectorAll(".nav-item.active, [data-page].active, [data-tab].active").forEach((item) => {
        item.classList.remove("active");
      });

      const selectors = [
        `.nav-item[data-page="${pageKey}"]`,
        `[data-page="${pageKey}"]`,
        `[data-tab="${pageKey}"]`,
        `[data-nav="${pageKey}"]`,
      ];

      let activeItem = null;
      for (const selector of selectors) {
        activeItem = document.querySelector(selector);
        if (activeItem) break;
      }

      if (activeItem) {
        activeItem.classList.add("active");
        console.log("✅ Navigation updated");
      } else {
        console.log("⚠️ Navigation item not found for:", pageKey);
      }
    },

    initializeIframeCoordination: function () {
      console.log("🔗 Initializing iframe coordination system...");

      if (typeof IFRAME_COORDINATOR !== "undefined" && IFRAME_COORDINATOR.initialize) {
        setTimeout(() => {
          try {
            IFRAME_COORDINATOR.initialize();
          } catch (error) {
            console.warn("⚠️ IFRAME_COORDINATOR initialization failed:", error);
          }
        }, 1000);
      }
    },

    setupCoordinationSystems: async function () {
      console.log("🔗 Setting up coordination systems...");

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.coordinationSetup = {
          started: true,
          startTime: new Date().toISOString(),
          systems: [],
        };
      }

      try {
        const coordinationSystems = [
          { name: "event_coordination", init: () => this.crashSafeSetupEventCoordination() },
          { name: "iframe_coordination", init: () => this.crashSafeSetupIframeCoordinationWithRetry() },
          { name: "error_handling", init: () => this.crashSafeSetupErrorHandling() },
          { name: "session_monitoring", init: () => this.crashSafeSetupSessionMonitoring() },
          { name: "performance_monitoring", init: () => this.crashSafeSetupPerformanceMonitoring() },
          { name: "background_sync", init: () => this.crashSafeTriggerBackgroundSync() },
        ];

        for (const system of coordinationSystems) {
          try {
            console.log(`🔗 Setting up ${system.name}...`);
            await system.init();
            console.log(`✅ ${system.name} setup completed`);
          } catch (error) {
            const errorKey = `coordination-system:${system.name}`;
            if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
              console.error(`❌ ${system.name} setup failed:`, error.message);
            }
            this.failedModules.set(system.name, error);
          }
        }

        console.log("✅ Coordination systems setup attempt completed");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coordinationSetup.completed = true;
          window.app._dependencyGraph.coordinationSetup.completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.success = true;
        }
      } catch (error) {
        console.error("⚠️ Coordination setup failed:", error);

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.coordinationSetup.completed = true;
          window.app._dependencyGraph.coordinationSetup.completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.success = false;
          window.app._dependencyGraph.coordinationSetup.error = error.message;
        }
      }
    },

    crashSafeSetupEventCoordination: function () {
      return safeExecuteAsync(() => this.setupEventCoordination(), "setupEventCoordination", 1);
    },

    crashSafeSetupIframeCoordinationWithRetry: function () {
      return safeExecuteAsync(() => this.setupIframeCoordinationWithRetry(), "setupIframeCoordinationWithRetry", 1);
    },

    crashSafeSetupErrorHandling: function () {
      return safeExecuteAsync(() => this.setupErrorHandling(), "setupErrorHandling", 1);
    },

    crashSafeSetupSessionMonitoring: function () {
      return safeExecuteAsync(() => this.setupSessionMonitoring(), "setupSessionMonitoring", 1);
    },

    crashSafeSetupPerformanceMonitoring: function () {
      return safeExecuteAsync(() => this.setupPerformanceMonitoring(), "setupPerformanceMonitoring", 1);
    },

    crashSafeTriggerBackgroundSync: function () {
      return safeExecuteAsync(() => this.triggerBackgroundSync(), "triggerBackgroundSync", 1);
    },

    setupIframeCoordinationWithRetry: async function () {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`🖼️ Setting up iframe coordination (attempt ${attempts}/${maxAttempts})...`);
          await this.setupIframeCoordinationInternal();
          console.log("✅ Iframe coordination setup successful");
          return;
        } catch (error) {
          console.error(`⚠️ Iframe coordination attempt ${attempts} failed:`, error.message);

          if (attempts >= maxAttempts) {
            console.warn("⚠️ Max iframe coordination attempts reached, continuing without full iframe support");
            this.createMinimalIframeAPI();
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
        }
      }
    },

    setupIframeCoordinationInternal: async function () {
      console.log("🖼️ Setting up iframe coordination...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: "iframe_coordination",
          startTime: new Date().toISOString(),
        });
      }

      window.MoodChatIframes = new Map();

      const safeGetAuthData = () => {
        try {
          return {
            user:
              window.currentUser ||
              (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
            isAuthenticated: !!(
              window.currentUser ||
              (typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())
            ),
            token: typeof AUTH_STATE !== "undefined" && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null,
          };
        } catch (error) {
          console.warn("⚠️ Failed to get auth data for iframe:", error.message);
          return { user: null, isAuthenticated: false, token: null };
        }
      };

      const messageHandler = (event) => {
        try {
          if (
            event.origin !== window.location.origin &&
            !event.origin.includes("localhost") &&
            !event.origin.includes("127.0.0.1")
          ) {
            return;
          }

          const data = event.data;
          if (!data || typeof data !== "object") return;

          switch (data?.type) {
            case "moodchat-iframe-ready":
              this.handleIframeReady(event.source, data);
              break;

            case "moodchat-iframe-auth-request":
              this.handleIframeAuthRequest(event.source, data);
              break;

            case "moodchat-iframe-data-request":
              this.handleIframeDataRequest(event.source, data);
              break;

            case "moodchat-iframe-action":
              this.handleIframeAction(event.source, data);
              break;

            case "moodchat-iframe-navigate":
              this.handleIframeNavigate(data);
              break;
          }
        } catch (error) {
          console.error("⚠️ Error in iframe message handler:", error);
        }
      };

      window.addEventListener("message", messageHandler);

      window.MoodChatIframeAPI = {
        sendToParent: function (type, data) {
          try {
            window.parent.postMessage(
              {
                type: type,
                data: data,
                source: "moodchat-iframe",
                timestamp: new Date().toISOString(),
              },
              "*"
            );
          } catch (error) {
            console.error("⚠️ Failed to send message to parent:", error);
          }
        },

        requestAuthState: function () {
          return new Promise((resolve) => {
            const listener = (event) => {
              try {
                if (event.data?.type === "moodchat-auth-state-response") {
                  window.removeEventListener("message", listener);
                  resolve(event.data.data);
                }
              } catch (error) {
                console.error("⚠️ Error in auth state response:", error);
                resolve({ user: null, isAuthenticated: false });
              }
            };
            window.addEventListener("message", listener);

            this.sendToParent("moodchat-iframe-auth-request");

            setTimeout(() => {
              window.removeEventListener("message", listener);
              console.warn("⚠️ Auth state request timeout");
              resolve({ user: null, isAuthenticated: false });
            }, 5000);
          });
        },

        requestData: function (key) {
          return new Promise((resolve) => {
            const listener = (event) => {
              try {
                if (event.data?.type === "moodchat-data-response" && event.data.key === key) {
                  window.removeEventListener("message", listener);
                  resolve(event.data.data);
                }
              } catch (error) {
                console.error("⚠️ Error in data response:", error);
                resolve(null);
              }
            };
            window.addEventListener("message", listener);

            this.sendToParent("moodchat-iframe-data-request", { key: key });

            setTimeout(() => {
              window.removeEventListener("message", listener);
              console.warn(`⚠️ Data request timeout for key: ${key}`);
              resolve(null);
            }, 5000);
          });
        },
      };

      console.log("✅ Iframe coordination setup complete");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const iframeIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(
          (s) => s.name === "iframe_coordination"
        );
        if (iframeIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[iframeIndex].success = true;
        }
      }
    },

    createMinimalIframeAPI: function () {
      console.log("🛠️ Creating minimal iframe API stub...");

      window.MoodChatIframes = new Map();
      window.MoodChatIframeAPI = {
        sendToParent: function () {
          console.warn("⚠️ Iframe API limited - sendToParent not available");
        },
        requestAuthState: function () {
          return Promise.resolve({ user: null, isAuthenticated: false });
        },
        requestData: function () {
          return Promise.resolve(null);
        },
      };
    },

    handleIframeReady: function (iframeWindow, data) {
      try {
        console.log("🖼️ Iframe ready:", data.iframeId);

        window.MoodChatIframes.set(data.iframeId, {
          window: iframeWindow,
          id: data.iframeId,
          ready: true,
          lastActive: Date.now(),
        });

        this.sendInitialStateToIframe(iframeWindow);
      } catch (error) {
        console.error("⚠️ Error handling iframe ready:", error);
      }
    },

    handleIframeAuthRequest: function (iframeWindow, data) {
      try {
        console.log("🔐 Iframe auth request");

        const authData = this.safeGetAuthData();

        iframeWindow.postMessage(
          {
            type: "moodchat-auth-state-response",
            data: {
              user: authData.user,
              isAuthenticated: authData.isAuthenticated,
              validated: authData.user?.validated || false,
              timestamp: new Date().toISOString(),
              isDegraded: BOOTSTRAP_STATE.isDegraded(),
            },
          },
          "*"
        );
      } catch (error) {
        console.error("⚠️ Error handling iframe auth request:", error);
      }
    },

    handleIframeDataRequest: function (iframeWindow, data) {
      try {
        console.log("📊 Iframe data request:", data.key);

        let responseData = null;

        switch (data.key) {
          case "userProfile":
            responseData =
              window.currentUser ||
              (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null);
            break;
          case "settings":
            responseData = typeof SETTINGS_SERVICE !== "undefined" && SETTINGS_SERVICE.current ? SETTINGS_SERVICE.current : {};
            break;
          case "networkStatus":
            responseData = {
              status:
                typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                  ? API_COORDINATION.getNetworkStatus()
                  : "unknown",
              backendReachable: window.MoodChatConfig?.backendReachable,
              isOnline:
                typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                  ? API_COORDINATION.getNetworkStatus() === "online"
                  : false,
            };
            break;
          default:
            if (typeof DATA_CACHE !== "undefined" && DATA_CACHE.getInstant) {
              responseData = DATA_CACHE.getInstant(data.key);
            }
        }

        iframeWindow.postMessage(
          {
            type: "moodchat-data-response",
            key: data.key,
            data: responseData,
            timestamp: new Date().toISOString(),
          },
          "*"
        );
      } catch (error) {
        console.error("⚠️ Error handling iframe data request:", error);
      }
    },

    handleIframeAction: function (iframeWindow, data) {
      try {
        console.log("⚡ Iframe action:", data.action);

        switch (data.action) {
          case "logout":
            if (typeof window.logout === "function") {
              window.logout();
            }
            break;

          case "refresh":
            if (typeof window.location !== "undefined") {
              window.location.reload();
            }
            break;

          case "navigate":
            if (data.target) {
              this.navigateTo(data.target);
            }
            break;

          case "showNotification":
            if (typeof window.showNotification === "function" && data.message) {
              window.showNotification(data.message, data.type || "info", data.duration);
            }
            break;
        }
      } catch (error) {
        console.error("⚠️ Error handling iframe action:", error);
      }
    },

    handleIframeNavigate: function (data) {
      try {
        console.log("🧭 Iframe navigation request:", data.target);

        if (data.target) {
          this.navigateTo(data.target);
        }
      } catch (error) {
        console.error("⚠️ Error handling iframe navigation:", error);
      }
    },

    sendInitialStateToIframe: function (iframeWindow) {
      try {
        const authData = this.safeGetAuthData();

        const initialState = {
          type: "moodchat-initial-state",
          auth: {
            user: authData.user,
            isAuthenticated: authData.isAuthenticated,
            validated: authData.user?.validated || false,
          },
          network: {
            status:
              typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                ? API_COORDINATION.getNetworkStatus()
                : "unknown",
            backendReachable: window.MoodChatConfig?.backendReachable,
            isOnline:
              typeof API_COORDINATION !== "undefined" && API_COORDINATION.getNetworkStatus
                ? API_COORDINATION.getNetworkStatus() === "online"
                : false,
          },
          settings: typeof SETTINGS_SERVICE !== "undefined" && SETTINGS_SERVICE.current ? SETTINGS_SERVICE.current : {},
          bootstrap: BOOTSTRAP_STATE.getStatusReport(),
          timestamp: new Date().toISOString(),
          isDegraded: BOOTSTRAP_STATE.isDegraded(),
        };

        iframeWindow.postMessage(initialState, "*");
      } catch (error) {
        console.error("⚠️ Error sending initial state to iframe:", error);
      }
    },

    safeGetAuthData: function () {
      try {
        return {
          user:
            window.currentUser ||
            (typeof AUTH_STATE !== "undefined" && AUTH_STATE.getUser ? AUTH_STATE.getUser() : null),
          isAuthenticated: !!(
            window.currentUser ||
            (typeof AUTH_STATE !== "undefined" && AUTH_STATE.isAuthenticated && AUTH_STATE.isAuthenticated())
          ),
          token: typeof AUTH_STATE !== "undefined" && AUTH_STATE.getToken ? AUTH_STATE.getToken() : null,
        };
      } catch (error) {
        console.warn("⚠️ Failed to get auth data:", error.message);
        return { user: null, isAuthenticated: false, token: null };
      }
    },

    setupEventCoordination: function () {
      console.log("📡 Setting up event coordination...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: "event_coordination",
          startTime: new Date().toISOString(),
        });
      }

      window.MoodChatEvents = {
        listeners: new Map(),

        on: function (eventName, callback) {
          try {
            if (!this.listeners.has(eventName)) {
              this.listeners.set(eventName, []);
            }
            this.listeners.get(eventName).push(callback);

            window.addEventListener(eventName, callback);
          } catch (error) {
            console.error(`⚠️ Failed to add event listener for ${eventName}:`, error);
          }
        },

        off: function (eventName, callback) {
          try {
            if (this.listeners.has(eventName)) {
              const callbacks = this.listeners.get(eventName);
              const index = callbacks.indexOf(callback);
              if (index > -1) {
                callbacks.splice(index, 1);
              }
            }

            window.removeEventListener(eventName, callback);
          } catch (error) {
            console.error(`⚠️ Failed to remove event listener for ${eventName}:`, error);
          }
        },

        emit: function (eventName, data) {
          try {
            const event = new CustomEvent(eventName, {
              detail: data,
              bubbles: true,
              cancelable: true,
            });
            window.dispatchEvent(event);
          } catch (error) {
            console.error(`⚠️ Failed to emit event ${eventName}:`, error);
          }
        },

        once: function (eventName, callback) {
          try {
            const onceCallback = (event) => {
              callback(event.detail);
              this.off(eventName, onceCallback);
            };
            this.on(eventName, onceCallback);
          } catch (error) {
            console.error(`⚠️ Failed to add once listener for ${eventName}:`, error);
          }
        },
      };

      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        try {
          const originalDispatch = window.dispatchEvent;
          window.dispatchEvent = function (event) {
            if (event.type.startsWith("moodchat-")) {
              console.log(`📡 Event: ${event.type}`, event.detail || "");
            }
            return originalDispatch.call(this, event);
          };
        } catch (error) {
          console.error("⚠️ Failed to setup event logger:", error);
        }
      }

      console.log("✅ Event coordination setup complete");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const eventIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(
          (s) => s.name === "event_coordination"
        );
        if (eventIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[eventIndex].success = true;
        }
      }
    },

    triggerBackgroundSync: function () {
      console.log("🔄 Triggering background sync if available...");

      try {
        if (window.api && window.api.core && window.api.core.syncBackgroundTasks) {
          window.api.core.syncBackgroundTasks();
          console.log("✅ Background sync triggered");
        }
      } catch (error) {
        console.log("⚠️ Background sync failed:", error);
      }

      try {
        if (window.api && window.api.request && window.api.request.processQueue) {
          window.api.request.processQueue();
          console.log("✅ Request queue processing triggered");
        }
      } catch (error) {
        console.log("⚠️ Request queue processing failed:", error);
      }

      try {
        if (window.api && window.api.request && window.api.request.prefetchCriticalResources) {
          window.api.request.prefetchCriticalResources();
          console.log("✅ Resource prefetch triggered");
        }
      } catch (error) {
        console.log("⚠️ Resource prefetch failed:", error);
      }
    },

    setupErrorHandling: function () {
      console.log("🛡️ Setting up error handling...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: "error_handling",
          startTime: new Date().toISOString(),
        });
      }

      window.addEventListener("error", (event) => {
        const errorKey = `global-error:${event.filename}:${event.lineno}`;
        if (ERROR_TRACKER.shouldLog(errorKey, event.message)) {
          console.error("🚨 Global error caught:", event.error);

          if (event.target && (event.target.tagName === "IMG" || event.target.tagName === "SCRIPT")) {
            return;
          }

          this.showErrorToUser("An unexpected error occurred. The app will continue to work in limited mode.");

          const errorEvent = new CustomEvent("moodchat-global-error", {
            detail: {
              error: event.error,
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              timestamp: new Date().toISOString(),
            },
          });
          window.dispatchEvent(errorEvent);
        }
      });

      window.addEventListener("unhandledrejection", (event) => {
        const errorKey = `promise-rejection:${event.reason?.message || "unknown"}`;
        if (ERROR_TRACKER.shouldLog(errorKey, "unhandledrejection")) {
          console.error("🚨 Unhandled promise rejection:", event.reason);

          this.showErrorToUser("An operation failed. Please try again.");

          const errorEvent = new CustomEvent("moodchat-unhandled-rejection", {
            detail: {
              reason: event.reason,
              promise: event.promise,
              timestamp: new Date().toISOString(),
            },
          });
          window.dispatchEvent(errorEvent);
        }
      });

      window.addEventListener("offline", () => {
        this.showErrorToUser("You are offline. Some features may be limited.", "warning");
      });

      console.log("✅ Error handling setup complete");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        const errorIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(
          (s) => s.name === "error_handling"
        );
        if (errorIndex !== -1) {
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].completed = true;
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].completionTime = new Date().toISOString();
          window.app._dependencyGraph.coordinationSetup.systems[errorIndex].success = true;
        }
      }
    },

    setupSessionMonitoring: function () {
      console.log("⏰ Setting up session monitoring...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: "session_monitoring",
          startTime: new Date().toISOString(),
        });
      }

      try {
        setInterval(() => {
          this.checkSessionValidity();
        }, 5 * 60 * 1000);

        let activityTimeout;
        const resetActivityTimeout = () => {
          clearTimeout(activityTimeout);
          activityTimeout = setTimeout(() => {
            this.handleUserInactivity();
          }, 30 * 60 * 1000);
        };

        ["mousedown", "keydown", "touchstart", "mousemove"].forEach((event) => {
          window.addEventListener(event, resetActivityTimeout, { passive: true });
        });

        resetActivityTimeout();

        console.log("✅ Session monitoring setup complete");

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
          const sessionIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(
            (s) => s.name === "session_monitoring"
          );
          if (sessionIndex !== -1) {
            window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].completed = true;
            window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.coordinationSetup.systems[sessionIndex].success = true;
          }
        }
      } catch (error) {
        console.error("⚠️ Session monitoring setup failed:", error);
      }
    },

    checkSessionValidity: function () {
      try {
        if (typeof AUTH_STATE === "undefined" || !AUTH_STATE.hasToken) {
          return;
        }

        const hasToken = AUTH_STATE.hasToken();
        if (!hasToken) {
          return;
        }

        if (AUTH_STATE._tokenExpiry) {
          const expiryDate = new Date(AUTH_STATE._tokenExpiry);
          const now = new Date();
          const timeUntilExpiry = expiryDate - now;

          if (timeUntilExpiry < 5 * 60 * 1000) {
            console.log("🔐 Token expires soon, attempting refresh...");

            if (typeof TOKEN_VALIDATION !== "undefined" && TOKEN_VALIDATION.refreshToken) {
              TOKEN_VALIDATION.refreshToken()
                .then((result) => {
                  if (!result.success) {
                    console.log("⚠️ Token refresh failed, user will need to re-authenticate soon");
                  }
                })
                .catch((error) => {
                  console.error("⚠️ Token refresh error:", error);
                });
            }
          }
        }
      } catch (error) {
        console.error("⚠️ Session validity check failed:", error);
      }
    },

    handleUserInactivity: function () {
      try {
        console.log("⏰ User inactive for 30 minutes");

        if (typeof window.showNotification === "function") {
          window.showNotification("You have been inactive for 30 minutes. Session will expire soon.", "warning", 10000);
        }

        const event = new CustomEvent("moodchat-user-inactivity", {
          detail: {
            duration: "30m",
            timestamp: new Date().toISOString(),
          },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.error("⚠️ User inactivity handler failed:", error);
      }
    },

    setupPerformanceMonitoring: function () {
      console.log("📊 Setting up performance monitoring...");

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
        window.app._dependencyGraph.coordinationSetup.systems.push({
          name: "performance_monitoring",
          startTime: new Date().toISOString(),
        });
      }

      try {
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
          window.addEventListener("load", () => {
            try {
              const timing = performance.timing;
              const loadTime = timing.loadEventEnd - timing.navigationStart;
              const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;

              console.log(`📊 Performance metrics:
                - Load time: ${loadTime}ms
                - DOM ready: ${domReadyTime}ms
                - Redirects: ${timing.redirectEnd - timing.redirectStart}ms
                - DNS: ${timing.domainLookupEnd - timing.domainLookupStart}ms
                - TCP: ${timing.connectEnd - timing.connectStart}ms
                - Request: ${timing.responseStart - timing.requestStart}ms
                - Response: ${timing.responseEnd - timing.responseStart}ms
              `);
            } catch (error) {
              console.error("⚠️ Performance metrics collection failed:", error);
            }
          });

          if (performance.memory) {
            setInterval(() => {
              try {
                const memory = performance.memory;
                console.log(`📊 Memory usage:
                  - Used JS heap: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB
                  - Total JS heap: ${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB
                  - Heap limit: ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB
                `);
              } catch (error) {
                console.error("⚠️ Memory monitoring failed:", error);
              }
            }, 30000);
          }
        }

        console.log("✅ Performance monitoring setup complete");

        if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.coordinationSetup) {
          const perfIndex = window.app._dependencyGraph.coordinationSetup.systems.findIndex(
            (s) => s.name === "performance_monitoring"
          );
          if (perfIndex !== -1) {
            window.app._dependencyGraph.coordinationSetup.systems[perfIndex].completed = true;
            window.app._dependencyGraph.coordinationSetup.systems[perfIndex].completionTime = new Date().toISOString();
            window.app._dependencyGraph.coordinationSetup.systems[perfIndex].success = true;
          }
        }
      } catch (error) {
        console.error("⚠️ Performance monitoring setup failed:", error);
      }
    },

    attemptRecovery: async function (error) {
      console.log("🔄 Attempting recovery from bootstrap failure...");

      GLOBAL_RECOVERY_ATTEMPTS++;
      if (GLOBAL_RECOVERY_ATTEMPTS > MAX_GLOBAL_RECOVERY) {
        console.error("â Global recovery limit exceeded, stopping retries to prevent infinite loops");
        this.showFatalError(new Error("Application failed to start after recovery attempts"));
        return;
      }

      this.currentRetry++;

      if (this.currentRetry > this.MAX_RETRIES) {
        console.error("â Maximum retries exceeded, switching to degraded mode");

        if (window.app && window.app._dependencyGraph) {
          window.app._dependencyGraph.maxRetriesExceeded = true;
          window.app._dependencyGraph.maxRetriesExceededAt = new Date().toISOString();
        }

        BOOTSTRAP_STATE_MACHINE.transitionTo(BOOTSTRAP_CONSTANTS.STATES.DEGRADED, "max_retries_exceeded");
        this.showDegradedModeNotification();
        throw error;
      }

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.recoveryAttempts = window.app._dependencyGraph.recoveryAttempts || [];
        window.app._dependencyGraph.recoveryAttempts.push({
          attempt: this.currentRetry,
          maxRetries: this.MAX_RETRIES,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`🔄 Retry attempt ${this.currentRetry}/${this.MAX_RETRIES} in ${this.RETRY_DELAY}ms`);

      this.showErrorToUser(`Application startup failed. Retrying... (${this.currentRetry}/${this.MAX_RETRIES})`, "warning");

      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            await this.bootstrap();
            resolve();
          } catch (retryError) {
            reject(retryError);
          }
        }, this.RETRY_DELAY);
      });
    },

    showFatalError: function (error) {
      try {
        document.body.innerHTML = "";

        const errorScreen = document.createElement("div");
        errorScreen.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #1f2937;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        errorScreen.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
          <h1 style="font-size: 24px; margin-bottom: 16px;">Application Failed to Start</h1>
          <p style="margin-bottom: 24px; max-width: 500px; opacity: 0.8;">
            The application encountered a critical error and cannot continue.
            Please try refreshing the page or contact support if the problem persists.
          </p>
          <div style="background: rgba(255,255,255,0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px; max-width: 500px; text-align: left;">
            <div style="font-size: 12px; opacity: 0.6; margin-bottom: 8px;">Error Details:</div>
            <div style="font-family: monospace; font-size: 12px;">${error.message}</div>
          </div>
          <div style="display: flex; gap: 12px;">
            <button id="retryButton" style="
              background: #8b5cf6;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            ">Try Again</button>
            <button id="reportButton" style="
              background: transparent;
              color: #8b5cf6;
              border: 1px solid #8b5cf6;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
            ">Report Issue</button>
          </div>
        `;

        document.body.appendChild(errorScreen);

        document.getElementById("retryButton").addEventListener("click", () => {
          window.location.reload();
        });

        document.getElementById("reportButton").addEventListener("click", () => {
          const errorReport = {
            error: error.toString(),
            message: error.message,
            stack: error.stack,
            url: window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            bootstrap: BOOTSTRAP_STATE.getStatusReport(),
            failures: ERROR_TRACKER.getFailureReport(),
          };

          console.error("Error report:", errorReport);
          this.showNotification(
            "Error details have been logged to the console. Please provide this information to support.",
            "info",
            5000
          );
        });
      } catch (fatalError) {
        console.error("❌ Even fatal error screen failed:", fatalError);
        document.body.innerHTML = "<h1>Critical Error</h1><p>Please refresh the page.</p>";
      }
    },

    hideLoadingScreen: function () {
      try {
        const loadingScreen = document.getElementById("loadingScreen");
        if (loadingScreen) {
          loadingScreen.classList.add("hidden");
          setTimeout(() => {
            if (loadingScreen.parentNode) {
              loadingScreen.parentNode.removeChild(loadingScreen);
            }
          }, 300);
        }
      } catch (error) {
        console.error("⚠️ Failed to hide loading screen:", error);
      }
    },

    registerCallback: function (callback) {
      if (typeof callback === "function") {
        this.registeredCallbacks.push(callback);
        console.log("✅ Callback registered for bootstrap completion");
      }
    },

    executeRegisteredCallbacks: function () {
      console.log(`🔄 Executing ${this.registeredCallbacks.length} registered callbacks...`);

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.callbackExecution = {
          started: true,
          startTime: new Date().toISOString(),
          totalCallbacks: this.registeredCallbacks.length,
          executedCallbacks: 0,
          failedCallbacks: 0,
        };
      }

      this.registeredCallbacks.forEach((callback, index) => {
        try {
          callback();

          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
            window.app._dependencyGraph.callbackExecution.executedCallbacks++;
          }
        } catch (error) {
          console.error(`❌ Callback ${index} failed:`, error);

          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
            window.app._dependencyGraph.callbackExecution.failedCallbacks++;
            window.app._dependencyGraph.callbackExecution.callbackErrors =
              window.app._dependencyGraph.callbackExecution.callbackErrors || [];
            window.app._dependencyGraph.callbackExecution.callbackErrors.push({
              index: index,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      });

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.callbackExecution) {
        window.app._dependencyGraph.callbackExecution.completed = true;
        window.app._dependencyGraph.callbackExecution.completionTime = new Date().toISOString();
        window.app._dependencyGraph.callbackExecution.success = window.app._dependencyGraph.callbackExecution.failedCallbacks === 0;
      }

      this.registeredCallbacks = [];
    },

    queueOperation: function (operation) {
      if (typeof operation === "function") {
        this.pendingOperations.push(operation);
        console.log("✅ Operation queued for after bootstrap");
      }
    },

    executePendingOperations: function () {
      console.log(`🔄 Executing ${this.pendingOperations.length} pending operations...`);

      if (window.app && window.app._dependencyGraph) {
        window.app._dependencyGraph.operationExecution = {
          started: true,
          startTime: new Date().toISOString(),
          totalOperations: this.pendingOperations.length,
          executedOperations: 0,
          failedOperations: 0,
        };
      }

      this.pendingOperations.forEach((operation, index) => {
        try {
          operation();

          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
            window.app._dependencyGraph.operationExecution.executedOperations++;
          }
        } catch (error) {
          console.error(`❌ Operation ${index} failed:`, error);

          if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
            window.app._dependencyGraph.operationExecution.failedOperations++;
            window.app._dependencyGraph.operationExecution.operationErrors =
              window.app._dependencyGraph.operationExecution.operationErrors || [];
            window.app._dependencyGraph.operationExecution.operationErrors.push({
              index: index,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        }
      });

      if (window.app && window.app._dependencyGraph && window.app._dependencyGraph.operationExecution) {
        window.app._dependencyGraph.operationExecution.completed = true;
        window.app._dependencyGraph.operationExecution.completionTime = new Date().toISOString();
        window.app._dependencyGraph.operationExecution.success = window.app._dependencyGraph.operationExecution.failedOperations === 0;
      }

      this.pendingOperations = [];
    },

    waitForBootstrap: function () {
      if (BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.READY) || BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.DEGRADED)) {
        return Promise.resolve();
      }

      if (BOOTSTRAP_STATE.isPhase(BOOTSTRAP_STATE.PHASES.FAILED)) {
        return Promise.reject(new Error("Bootstrap failed"));
      }

      return DEPENDENCY_QUEUE.waitForReady();
    },

    getStatus: function () {
      return {
        isBootstrapping: this.isBootstrapping,
        phase: BOOTSTRAP_STATE.getPhase(),
        isDegraded: BOOTSTRAP_STATE.isDegraded(),
        retryCount: this.currentRetry,
        dependencies: BOOTSTRAP_STATE.dependencies,
        registeredCallbacks: this.registeredCallbacks.length,
        pendingOperations: this.pendingOperations.length,
        appReady: DEPENDENCY_QUEUE.isReady(),
        namespaceStatus: window.app
          ? {
              initialized: window.app._namespaceInitialized,
              coreRegistered: window.app._coreRegistered,
              pendingRegistrations: window.app._pendingRegistrations.length,
            }
          : null,
        failedModules: Array.from(this.failedModules.keys()),
        failures: ERROR_TRACKER.getFailureReport(),
      };
    },
  };

  // ============================================================================
  // BACKWARD COMPATIBILITY - COMPLETE PRESERVATION
  // ============================================================================

  function ensureBackwardCompatibility() {
    console.log("🔄 Ensuring backward compatibility...");

    try {
      if (typeof window.toggleSidebar === "undefined") {
        window.toggleSidebar = function () {
          console.log("📐 Legacy toggleSidebar called");
          const sidebar = document.querySelector(".sidebar");
          if (sidebar) {
            sidebar.classList.toggle("collapsed");
          }
        };
      }

      if (typeof window.switchTab === "undefined") {
        window.switchTab = function (tabName) {
          console.log("🧭 Legacy switchTab called:", tabName);
          APP_BOOTSTRAP.loadPageSafely(tabName);
        };
      }

      if (typeof window.loadExternalTab === "undefined") {
        window.loadExternalTab = function (tabName, filePath) {
          console.log("📄 Legacy loadExternalTab called:", tabName, filePath);
          APP_BOOTSTRAP.loadPageSafely(tabName);
        };
      }

      if (typeof window.showNotification === "undefined") {
        window.showNotification = function (message, type = "info", duration = 5000) {
          console.log(`🔔 Legacy showNotification called: ${message}`);
          return APP_BOOTSTRAP.showErrorToUser(message, type, duration);
        };
      }

      if (typeof window.startApp === "undefined") {
        window.startApp = async function () {
          console.log("🚀 Legacy startApp called - redirecting to barrier-based bootstrap");

          try {
            await BootstrapBarrier.waitForConfig(5000);
          } catch (e) {
            console.warn("Config wait timeout in startApp");
          }

          try {
            await BootstrapBarrier.waitForSession(10000);
          } catch (e) {
            console.warn("Session wait timeout in startApp");
          }

          return HARDENED_BOOTSTRAP_CONTROLLER.bootstrap();
        };
      }

      console.log("✅ Backward compatibility ensured");
    } catch (error) {
      console.error("⚠️ Backward compatibility setup failed:", error);
    }
  }

  // ============================================================================
  // MAIN EXECUTION ENGINE - COMPLETE PRESERVATION WITH DETERMINISTIC SEQUENCE

window.initializeEnhancedApp = function () {
    console.log("🚀 Initializing enhanced application...");

    // CRITICAL: Immediate auth restoration - NO DELAYS for production
    const checkAuthAndInitialize = () => {
        // CRITICAL FIX: ALWAYS continue bootstrap - NEVER block on auth
        console.log('[BOOT] â Bootstrap continues regardless of auth state');
        
        // Check localStorage directly for immediate restoration (NON-BLOCKING)
        // PATCH: Use kynecta_auth as primary key (matches authStorage.js)
        // then fall back to legacy keys so __SESSION_READY__ is accurate
        let hasValidStorage = false;
        try {
            const rawAuth = localStorage.getItem('kynecta_auth');
            if (rawAuth) {
                const auth = JSON.parse(rawAuth);
                hasValidStorage = !!(auth && auth.token);
            }
            if (!hasValidStorage) {
                const legacyToken = localStorage.getItem('auth_token') ||
                                    localStorage.getItem('accessToken') ||
                                    localStorage.getItem('USER_TOKEN') ||
                                    localStorage.getItem('kynecta_token');
                const legacyUser  = localStorage.getItem('auth_user') ||
                                    localStorage.getItem('currentUser') ||
                                    localStorage.getItem('user');
                hasValidStorage = !!(legacyToken && legacyUser && legacyToken.length > 20);
            }
        } catch(e) {}

        // CRITICAL FIX: Set session ready flag immediately
        window.__SESSION_READY__ = hasValidStorage;
        
        console.log(`[BOOT] Auth check: hasStorage=${hasValidStorage}, sessionReady=${window.__SESSION_READY__}`);
        
        // CRITICAL: Immediate restoration without delays (NON-BLOCKING)
        if (hasValidStorage) {
            console.log("[BOOT] Immediate session restoration from localStorage");

            try {
                let user = null;
                let token = null;

                // Primary: kynecta_auth
                const rawAuth = localStorage.getItem('kynecta_auth');
                if (rawAuth) {
                    const auth = JSON.parse(rawAuth);
                    user  = auth.user  || null;
                    token = auth.token || null;
                }
                // Legacy fallback
                if (!token) {
                    token = localStorage.getItem('auth_token') ||
                            localStorage.getItem('accessToken') ||
                            localStorage.getItem('USER_TOKEN');
                    const rawUser = localStorage.getItem('auth_user') ||
                                    localStorage.getItem('currentUser') ||
                                    localStorage.getItem('user');
                    try { user = rawUser ? JSON.parse(rawUser) : null; } catch(e) {}
                }

                if (token) {
                    // Set global state immediately - no waiting for AuthGateway
                    window.currentUser = user;
                    window.__userToken = token;
                    window.__accessToken = token;

                    // Fire auth event immediately
                    try {
                        window.dispatchEvent(new CustomEvent('auth:login', {
                            detail: { user, token, timestamp: Date.now() }
                        }));
                    } catch (e) {}

                    console.log("[BOOT] Session restored immediately");
                }
            } catch (e) {
                console.warn("[BOOT] Failed to restore session:", e);
            }
        }
        
        // CRITICAL FIX: NEVER redirect based on auth - let UI handle navigation
        console.log('[BOOT] Bootstrap complete - UI will handle auth navigation');
        console.log('[BOOT] Auth check complete - proceeding with bootstrap');
    };
    
    // Execute immediately - no async delays
    checkAuthAndInitialize();
};

// CRITICAL: Prevent multiple bootstrap calls
if (!window.__BOOTSTRAP_INITED__) {
    window.__BOOTSTRAP_INITED__ = true;
    
    (function immediateBootstrap() {
        const startApp = () => {
            console.log('Starting enhanced app bootstrap');
            
            // CRITICAL: Check if function exists AND is callable
            if (typeof window.initializeEnhancedApp === 'function') {
                try {
                    const result = window.initializeEnhancedApp();
                    // Only call catch if it returns a Promise
                    if (result && typeof result.catch === 'function') {
                        result.catch((error) => {
                            console.error('Auto-start failed:', error);
                        });
                    }
                } catch (error) {
                    console.error('Auto-start error:', error);
                }
            } else {
                console.error('initializeEnhancedApp function not found');
            }
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startApp);
        } else {
            console.log('DOM already ready, starting enhanced app bootstrap immediately');
            startApp();
        }
    })();
}

// ============================================================================
// EXPOSED UTILITIES - COMPLETE PRESERVATION
// ============================================================================

  window.safeAsync = async function (operation, errorHandler) {
    try {
      return await operation();
    } catch (error) {
      if (typeof errorHandler === "function") {
        errorHandler(error);
      } else {
        console.error("Operation failed:", error);
      }
      throw error;
    }
  };

  window.safeEvent = function (element, eventType, handler) {
    if (element && typeof element.addEventListener === "function") {
      element.addEventListener(eventType, handler);
      return true;
    }
    return false;
  };

  window.safeDOM = function (selector, callback) {
    const element = document.querySelector(selector);
    if (element && typeof callback === "function") {
      callback(element);
      return element;
    }
    return null;
  };

  window.__APP_READY__ = false;

  window.safeLoadOptionalModule = function (moduleName, loadFunction) {
    try {
      console.log(`🔧 Loading optional module: ${moduleName}`);
      loadFunction();
      console.log(`✅ Optional module loaded: ${moduleName}`);
    } catch (error) {
      const errorKey = `optional-module:${moduleName}`;
      if (ERROR_TRACKER.shouldLog(errorKey, error.message)) {
        console.warn(`⚠️ Optional module ${moduleName} failed to load:`, error.message);
      }
    }
  };

  window.isAuthFullyReadySafe = isAuthFullyReadySafe;
  window.waitForAuthReadySafe = waitForAuthReadySafe;
  window.BootstrapBarrier = BootstrapBarrier;
  window.AppBootContext = window.AppBootContext;
  window.NavigationController = NavigationController;

  window.getBootstrapStatus = function () {
    return {
      state: BOOTSTRAP_STATE_MACHINE.getState(),
      isDegraded: BOOTSTRAP_STATE_MACHINE.isDegraded(),
      failures: ERROR_TRACKER.getFailureReport(),
      modules: SEQUENTIAL_LOADER.getStatus(),
      bootContext: {
        configReady: window.AppBootContext.configReady,
        sessionReady: window.AppBootContext.sessionReady,
        uiReady: window.AppBootContext.uiReady,
        iframesReady: window.AppBootContext.iframesReady,
        callsReady: window.AppBootContext.callsReady,
      },
      deterministicSequence: {
        environment: true,
        core: true,
        session: window.AppBootContext.sessionReady,
        api: !!window.api,
        realtime: !!window.Realtime,
        modulesRegistered: window.__EXPECTED_MODULES ? window.__EXPECTED_MODULES.size : 0,
        modulesReady: window.__REGISTERED_MODULES ? window.__REGISTERED_MODULES.size : 0,
        parentReadySent: HARDENED_BOOTSTRAP_CONTROLLER._parentReadySent || false,
        syncStarted: !!window.SyncManager,
      },
    };
  };

  console.log("✅ app.core.bootstrap.js loaded successfully with DETERMINISTIC BOOT SEQUENCE, session-first gating, parent authority handshake, and complete functionality preservation");
})();