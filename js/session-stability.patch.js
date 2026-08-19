/**
 * session-stability.patch.js
 *
 * Authenticated-shell session authority:
 * - one redirect path for invalid/expired sessions
 * - no expiry/re-auth popups
 * - immediate access-token refresh before/at expiry
 * - single-flight refresh (prevents competing refresh calls)
 * - Security > Session Timeout is the inactivity source of truth
 *
 * Compatibility layer around app.core.session.js; the existing auth/encryption
 * implementation remains the source of session credentials.
 */
(function (window) {
  'use strict';

  if (window.__KYN_SESSION_STABILITY_PATCH__) return;
  window.__KYN_SESSION_STABILITY_PATCH__ = true;

  var redirecting = false;
  var refreshPromise = null;
  var refreshFailures = 0;
  var refreshTimer = null;
  var inactivityTimer = null;
  var inactivityWarningTimer = null;
  var activityBound = false;
  var timeoutChangeBound = false;

  var TIMEOUTS = {
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1hr': 60 * 60 * 1000,
    '8hr': 8 * 60 * 60 * 1000
  };

  function readSessionTimeout() {
    var keys = ['knecta_settings_cache', 'app_settings_global', 'nexopa_settings', 'nexopa_settings_global'];
    for (var i = 0; i < keys.length; i += 1) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        var candidates = [
          parsed && parsed.data && parsed.data.security && parsed.data.security.sessionTimeout,
          parsed && parsed.security && parsed.security.sessionTimeout,
          parsed && parsed.settings && parsed.settings.security && parsed.settings.security.sessionTimeout,
          parsed && parsed.currentSettings && parsed.currentSettings.security && parsed.currentSettings.security.sessionTimeout
        ];
        for (var j = 0; j < candidates.length; j += 1) {
          if (candidates[j] && TIMEOUTS[candidates[j]]) return TIMEOUTS[candidates[j]];
        }
      } catch (_) {}
    }
    return TIMEOUTS['30min'];
  }

  function topLoginRedirect(reason) {
    if (redirecting) return;
    redirecting = true;
    try { if (refreshTimer) clearTimeout(refreshTimer); } catch (_) {}
    try { if (inactivityTimer) clearTimeout(inactivityTimer); } catch (_) {}
    try { if (inactivityWarningTimer) clearTimeout(inactivityWarningTimer); } catch (_) {}
    try {
      window.postMessage({ type: 'nexopa-session-pause', reason: reason || 'session_expired', timestamp: new Date().toISOString() }, '*');
    } catch (_) {}
    try {
      var target = '/index.html?session=expired';
      if (window.top && window.top !== window) window.top.location.replace(target);
      else window.location.replace(target);
    } catch (_) {
      try { window.location.href = '/index.html?session=expired'; } catch (__) {}
    }
  }

  function clearAuthForRedirect() {
    try {
      if (window.AUTH_STATE && typeof window.AUTH_STATE.clearAuthState === 'function') window.AUTH_STATE.clearAuthState();
    } catch (_) {}
    try {
      if (window.Session) {
        delete window.Session._localToken;
        delete window.Session._localUser;
        delete window.Session._hydrated;
      }
      window.currentUser = null;
    } catch (_) {}
  }

  function refreshImmediately(reason) {
    if (refreshPromise) return refreshPromise;
    var auth = window.AUTH_STATE;
    if (!auth || typeof auth.refreshTokenSafely !== 'function') {
      topLoginRedirect(reason || 'refresh_unavailable');
      return Promise.resolve({ success: false });
    }

    refreshPromise = Promise.resolve()
      .then(function () { return auth.refreshTokenSafely(); })
      .then(function (result) {
        refreshFailures = 0;
        try {
          if (window.SESSION_COORDINATOR && typeof window.SESSION_COORDINATOR.scheduleTokenRefresh === 'function') {
            window.SESSION_COORDINATOR.scheduleTokenRefresh();
          }
        } catch (_) {}
        return result || { success: true };
      })
      .catch(function (error) {
        refreshFailures += 1;
        if (!navigator.onLine) return { success: false, transient: true, error: error };
        if (refreshFailures < 3) {
          setTimeout(function () { refreshImmediately('refresh_retry'); }, 1500);
          return { success: false, transient: true, error: error };
        }
        clearAuthForRedirect();
        topLoginRedirect('refresh_failed');
        return { success: false, error: error };
      })
      .finally(function () { refreshPromise = null; });

    return refreshPromise;
  }

  function scheduleImmediateRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    var auth = window.AUTH_STATE;
    if (!auth || typeof auth.getTimeToExpiry !== 'function' || !auth.isAuthenticated || !auth.isAuthenticated()) return;
    var ttl = auth.getTimeToExpiry();
    if (ttl === null || ttl === undefined || !Number.isFinite(ttl)) return;
    var delay = ttl <= 0 ? 0 : Math.max(1000, ttl - 60000);
    refreshTimer = setTimeout(function () {
      var current = window.AUTH_STATE && typeof window.AUTH_STATE.getTimeToExpiry === 'function' ? window.AUTH_STATE.getTimeToExpiry() : null;
      refreshImmediately(current !== null && current <= 0 ? 'token_expired' : 'token_near_expiry');
    }, delay);
  }

  function resetInactivityTimer() {
    var coordinator = window.SESSION_COORDINATOR;
    if (!coordinator || !coordinator._config) return;
    if (!window.AUTH_STATE || !window.AUTH_STATE.isAuthenticated || !window.AUTH_STATE.isAuthenticated()) return;
    var timeout = readSessionTimeout();
    coordinator._config.inactivityTimeout = timeout;
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (inactivityWarningTimer) clearTimeout(inactivityWarningTimer);
    inactivityWarningTimer = null;
    inactivityTimer = setTimeout(function () {
      clearAuthForRedirect();
      topLoginRedirect('inactivity_timeout');
    }, timeout);
  }

  function bindActivity() {
    if (activityBound) return;
    activityBound = true;
    ['mousedown', 'keydown', 'touchstart', 'mousemove', 'click', 'scroll'].forEach(function (eventName) {
      window.addEventListener(eventName, function () {
        resetInactivityTimer();
        scheduleImmediateRefresh();
      }, { passive: true });
    });
    resetInactivityTimer();
  }

  function bindTimeoutChanges() {
    if (timeoutChangeBound) return;
    timeoutChangeBound = true;
    window.addEventListener('message', function (event) {
      var msg = event && event.data;
      if (!msg || msg.type !== 'SETTINGS_UPDATED' || msg.section !== 'security' || msg.key !== 'sessionTimeout') return;
      resetInactivityTimer();
    });
    window.addEventListener('nexopa-settings-changed', function () { resetInactivityTimer(); });
  }

  function patchCoordinator() {
    var coordinator = window.SESSION_COORDINATOR;
    if (!coordinator || coordinator.__kynSessionPatched) return !!coordinator;
    coordinator.__kynSessionPatched = true;
    coordinator.handleSessionInvalid = function (detail) {
      clearAuthForRedirect();
      topLoginRedirect((detail && detail.reason) || 'session_invalid');
    };
    coordinator.showReauthenticationWarning = function () {};
    coordinator.showSessionExpiryWarning = function () {};
    coordinator.handleTokenExpired = function () { refreshImmediately('token_expired_event'); };
    coordinator.scheduleTokenRefresh = function () { scheduleImmediateRefresh(); };
    coordinator._getConfiguredInactivityTimeoutMs = readSessionTimeout;
    coordinator.handleUserInactivity = function () {};
    coordinator.handleInactivityLogout = function () {
      clearAuthForRedirect();
      topLoginRedirect('inactivity_timeout');
    };
    bindActivity();
    bindTimeoutChanges();
    scheduleImmediateRefresh();
    resetInactivityTimer();
    return true;
  }

  // Catch expiry/invalid events even when the coordinator is created later.
  window.addEventListener('nexopa-session-invalid', function (event) {
    clearAuthForRedirect();
    topLoginRedirect((event && event.detail && event.detail.reason) || 'session_invalid');
  });
  window.addEventListener('nexopa-token-expired', function () { refreshImmediately('token_expired_event'); });

  function boot() {
    if (patchCoordinator()) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (patchCoordinator() || attempts >= 100) clearInterval(timer);
    }, 50);
  }

  window.addEventListener('nexopa-session-ready', boot);
  window.addEventListener('nexopa-auth-state-changed', function () {
    patchCoordinator();
    scheduleImmediateRefresh();
    resetInactivityTimer();
  });
  window.addEventListener('nexopa-session-refreshed', function () { scheduleImmediateRefresh(); });
  window.addEventListener('load', boot, { once: true });
  boot();
})(window);
