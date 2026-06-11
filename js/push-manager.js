/**
 * push-manager.js — Frontend push notification setup
 *
 * Handles:
 *  - Service Worker registration
 *  - Push permission request
 *  - VAPID subscription creation and upload to backend
 *  - Badge count management
 *  - Notification preference sync
 */

(function (global) {
  'use strict';

  let _swRegistration = null;
  let _subscribed     = false;

  function _apiBase() { return window.API_BASE_URL || window.BACKEND_URL || ''; }
  function _token() {
    return window.authToken
      || sessionStorage.getItem('kynecta_auth_token')
      || localStorage.getItem('kynecta_auth_token')
      || localStorage.getItem('authToken') || '';
  }
  function _headers() {
    const t = _token();
    return Object.assign({ 'Content-Type': 'application/json' }, t ? { 'Authorization': `Bearer ${t}` } : {});
  }

  // ── Convert VAPID key from base64 to Uint8Array ────────────────────────────
  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = global.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // ── Register service worker ────────────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PushManager] Service workers not supported');
      return false;
    }

    try {
      _swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[PushManager] ✅ Service Worker registered');

      // Listen for controller change (SW update)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PushManager] SW updated — reloading');
        // Don't auto-reload — just log. User refreshes when ready.
      });

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
          window.KynectaOfflineQueue?.flush?.();
        }
        if (event.data?.type === 'NAVIGATE' && event.data.url) {
          window.location.href = event.data.url;
        }
      });

      return true;
    } catch (e) {
      console.warn('[PushManager] SW registration failed:', e.message);
      return false;
    }
  }

  // ── Request notification permission and subscribe ──────────────────────────
  async function subscribe() {
    if (!_swRegistration) {
      console.warn('[PushManager] SW not registered yet');
      return false;
    }

    // Check permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[PushManager] Notification permission denied');
      return false;
    }

    try {
      // Fetch VAPID public key from server
      const resp = await fetch(`${_apiBase()}/api/push/vapid-public-key`, {
        headers: _headers(),
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Could not fetch VAPID key');
      const { data } = await resp.json();
      const applicationServerKey = _urlBase64ToUint8Array(data.publicKey);

      // Create push subscription
      const sub = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJSON = sub.toJSON();

      // Upload subscription to backend
      const uploadResp = await fetch(`${_apiBase()}/api/push/subscribe`, {
        method: 'POST',
        headers: _headers(),
        credentials: 'include',
        body: JSON.stringify({
          endpoint: subJSON.endpoint,
          p256dh:   subJSON.keys.p256dh,
          auth:     subJSON.keys.auth,
          userAgent: navigator.userAgent.slice(0, 200),
        }),
      });

      if (!uploadResp.ok) throw new Error('Subscription upload failed');
      _subscribed = true;
      localStorage.setItem('kyn_push_subscribed', '1');
      console.log('[PushManager] ✅ Push subscription active');
      return true;
    } catch (e) {
      console.error('[PushManager] Subscribe error:', e.message);
      return false;
    }
  }

  // ── Unsubscribe ────────────────────────────────────────────────────────────
  async function unsubscribe() {
    if (!_swRegistration) return;
    const sub = await _swRegistration.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(`${_apiBase()}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: _headers(),
        credentials: 'include',
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    _subscribed = false;
    localStorage.removeItem('kyn_push_subscribed');
  }

  // ── Update app badge (unread count) ───────────────────────────────────────
  function setBadge(count) {
    // Via SW for lock screen badge
    navigator.serviceWorker.ready.then(sw => {
      sw.active?.postMessage({ type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE', count });
    }).catch(() => {});
    // Direct API (Chrome 81+)
    if (count > 0 && 'setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // ── Auto-init ─────────────────────────────────────────────────────────────
  async function init() {
    const swOk = await registerSW();
    if (!swOk) return;

    // Auto-subscribe if user previously granted permission
    if (localStorage.getItem('kyn_push_subscribed') === '1' &&
        Notification.permission === 'granted') {
      await subscribe();
    }
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaPushManager = {
    init,
    subscribe,
    unsubscribe,
    setBadge,
    get subscribed() { return _subscribed; },
    get registration() { return _swRegistration; },
  };

  console.log('[KynectaPushManager] ✅ Loaded');

})(window);
