/**
 * push-manager.js — Frontend push notification setup
 *
 * Handles:
 *  - Service Worker registration
 *  - Push permission request
 *  - VAPID subscription creation and upload to backend
 *  - Badge count management
 *  - Notification preference sync
 *  - Message-module presence reconciliation
 *  - Plaintext foreground notification preview
 *  - Message date separator visual normalization
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

  // ── Message-module UI hardening ───────────────────────────────────────────
  // There are several historical date-divider selectors in the Messages
  // module. Some old rules still give .date-divider a dark rectangular/pill
  // surface even though the current renderer uses .message-date-separator.
  // Normalize every known selector here so the visible day label is always
  // just centered text: Today / Yesterday / 19/08/2026.
  function _normalizeMessageDateSeparators() {
    if (document.getElementById('__kynMessageDateSeparatorFix')) return;
    const style = document.createElement('style');
    style.id = '__kynMessageDateSeparatorFix';
    style.textContent = `
      .date-divider,
      .date-divider span,
      .message-date-separator,
      .message-date-separator span,
      .date-separator,
      .date-separator span,
      .chat-date-separator,
      .chat-date-separator span {
        background: transparent !important;
        background-color: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        outline: 0 !important;
      }
      .date-divider,
      .message-date-separator,
      .date-separator,
      .chat-date-separator {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        margin: 12px 0 !important;
        padding: 0 !important;
      }
      .date-divider span,
      .message-date-separator span,
      .date-separator span,
      .chat-date-separator span {
        display: inline !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 0 !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        color: var(--kyn-text-secondary, #8696a0) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Presence accuracy for the Messages module ──────────────────────────────
  // The backend's check_user_online event is authoritative: it checks the
  // actual live Socket.IO room/socket state rather than trusting a stale
  // client-side cache. Refresh the peer status when Messages asks for it and
  // treat IDLE/TYPING as online because the user is still connected.
  function _installPresenceReconciliation() {
    if (window.__kynMessagePresenceFixInstalled) return;
    window.__kynMessagePresenceFixInstalled = true;

    const lastChecks = new Map();
    const CHECK_TTL = 5000;

    function requestAuthoritativeStatus(userId) {
      const uid = String(userId || '');
      if (!uid) return;
      const now = Date.now();
      const last = lastChecks.get(uid) || 0;
      if (now - last < CHECK_TTL) return;
      lastChecks.set(uid, now);
      try {
        const rt = window.KynectaRealtime;
        if (rt && typeof rt.emit === 'function') {
          const p = rt.emit('check_user_online', { targetUserId: uid }, { retry: false });
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (_) {}
    }

    function applyAuthoritativeStatus(payload) {
      if (!payload || !payload.userId) return;
      const uid = String(payload.userId);
      const online = payload.online === true;
      const engine = window.PresenceEngine;
      if (engine) {
        try {
          if (online && typeof engine._markOnline === 'function') {
            engine._markOnline(uid, { source: 'server_authoritative', timestamp: payload.timestamp || Date.now() });
          } else if (!online && typeof engine._markOffline === 'function') {
            engine._markOffline(uid, { source: 'server_authoritative', timestamp: payload.timestamp || Date.now() });
          }
        } catch (_) {}
      }
      try {
        window.dispatchEvent(new CustomEvent('kyn:authoritativePresence', {
          detail: { userId: uid, online, timestamp: payload.timestamp || Date.now() }
        }));
      } catch (_) {}
    }

    function bindBus() {
      const bus = window.KynectaEventBus || window.appEvents;
      if (!bus || typeof bus.on !== 'function') return false;
      if (window.__kynMessagePresenceBusBound) return true;
      window.__kynMessagePresenceBusBound = true;
      bus.on('SOCKET_EVENT', (payload) => {
        if (!payload) return;
        if (payload.type === 'user_online_status') applyAuthoritativeStatus(payload);
      });
      return true;
    }

    // Patch the public status reader once the foundation has initialized.
    // This is deliberately limited to the Messages iframe and does not change
    // the presence engine's behavior for other modules.
    const patchEngine = () => {
      const engine = window.PresenceEngine;
      if (!engine || engine.__kynMessageStatusPatched || typeof engine.getStatus !== 'function') return;
      const originalGetStatus = engine.getStatus.bind(engine);
      engine.getStatus = function (userId) {
        const status = originalGetStatus(userId);
        if (userId && String(userId) !== String(this._myUserId || '')) {
          requestAuthoritativeStatus(userId);
        }
        if (status === 'online' || status === 'idle' || status === 'typing' || status === 'backgrounded') {
          return 'online';
        }
        return status;
      };
      engine.__kynMessageStatusPatched = true;
    };

    bindBus();
    patchEngine();
    const timer = setInterval(() => {
      bindBus();
      patchEngine();
      if (window.PresenceEngine?.__kynMessageStatusPatched && window.__kynMessagePresenceBusBound) {
        clearInterval(timer);
      }
    }, 500);
    setTimeout(() => clearInterval(timer), 15000);

    // Also reconcile the currently open chat peer whenever Messages tells us
    // which conversation is active. This prevents a stale "offline" label
    // from surviving a navigation from Friend/Status/Call into Messages.
    window.addEventListener('kyn:activeChatChanged', (event) => {
      const peer = event.detail?.peerId || event.detail?.userId;
      if (peer) requestAuthoritativeStatus(peer);
    });
  }

  // ── Foreground message notification preview ───────────────────────────────
  // The server/service worker must NEVER receive plaintext merely to make a
  // notification preview readable. When Messages has the E2E keys locally,
  // decrypt the already-received envelope in this page and use that plaintext
  // for a foreground notification. If decryption is not (yet) available, show
  // exactly "New message received" — never ciphertext, and never a partial/
  // stale preview.
  //
  // CRYPTO-PIPELINE: this used to carry its own copy of "does this look
  // encrypted" detection and call decryptFromChat() directly with senderId as
  // the peer. That is now the single canonical decryptMessageForDisplay() in
  // e2e-encryption.js — same envelope detection, same peer resolution, same
  // cache (so if the chat panel already decrypted this message, this shows
  // instantly with no second decrypt), same automatic retry if keys aren't
  // ready yet.
  function _safeNotificationText(value) {
    if (value === null || value === undefined || value === '') return 'New message received';
    return typeof value === 'string' ? value.slice(0, 240) : 'New message received';
  }

  function _installForegroundMessagePreview() {
    if (window.__kynPlaintextNotificationFixInstalled) return;
    window.__kynPlaintextNotificationFixInstalled = true;

    window.addEventListener('kyn:incomingMessage', async (event) => {
      try {
        const detail = event.detail || {};
        const message = detail.message || detail;
        if (!message || !message.senderId) return;
        const myId = window.SessionManager?.getUserId?.() || window.SessionManager?.getCurrentUserId?.();
        if (myId && String(message.senderId) === String(myId)) return;
        if (document.visibilityState === 'visible') return; // native push handles background delivery

        const chatId = detail.chatId || message.chatId || message.conversationId;
        let text = message.content;
        if (window.KynectaE2E?.decryptMessageForDisplay && chatId) {
          try {
            // fallbackText is exactly "New message received" per the
            // never-show-ciphertext rule — if this is still queued (keys not
            // ready), that's what shows now; if a later retry succeeds, the
            // shared cache means the chat panel (already open or opened next)
            // will show the real text immediately without decrypting again.
            text = await window.KynectaE2E.decryptMessageForDisplay(message, chatId, myId, { fallbackText: 'New message received' });
          } catch (_) { text = 'New message received'; }
        }

        const body = _safeNotificationText(text);
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        // The browser notification is only a convenience while the app page is
        // hidden; it never sends plaintext to the backend or service worker.
        new Notification(message.senderName || message.sender || 'New message', {
          body,
          tag: `kynecta-message-${message.id || message.localId || detail.chatId || 'new'}`,
          icon: '/icons/nexopa-192.png',
        });
      } catch (_) {}
    });
  }

  // ── Register service worker ────────────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PushManager] Service workers not supported');
      return false;
    }

    try {
      // FIX-SW-SCOPE-CONFLICT: share the single service worker at '/'.
      _swRegistration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      console.log('[PushManager] ✅ Service Worker registered');

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PushManager] SW updated — reloading');
      });

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

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[PushManager] Notification permission denied');
      return false;
    }

    try {
      const resp = await fetch(`${_apiBase()}/api/push/vapid-public-key`, {
        headers: _headers(),
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Could not fetch VAPID key');
      const { data } = await resp.json();
      const applicationServerKey = _urlBase64ToUint8Array(data.publicKey);

      const sub = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJSON = sub.toJSON();
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
    navigator.serviceWorker.ready.then(sw => {
      sw.active?.postMessage({ type: count > 0 ? 'SET_BADGE' : 'CLEAR_BADGE', count });
    }).catch(() => {});
    if (count > 0 && 'setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {});
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // ── Auto-init ──────────────────────────────────────────────────────────────
  async function init() {
    _normalizeMessageDateSeparators();
    _installPresenceReconciliation();
    _installForegroundMessagePreview();

    const swOk = await registerSW();
    if (!swOk) return;

    if (localStorage.getItem('kyn_push_subscribed') === '1' &&
        Notification.permission === 'granted') {
      await subscribe();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

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