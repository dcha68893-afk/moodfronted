/**
 * push-init.js — Auto-initialize push notifications across all pages
 *
 * push-manager.js is excellent but only loaded in message.html.
 * This thin wrapper loads in chat.html (the main shell) and calls
 * push-manager.js's subscribe() after the user is logged in.
 *
 * Also handles:
 *   - Requesting permission at the right time (after first interaction)
 *   - Notification badge count sync with unread counts
 *   - "Reply from notification" deep-link handling
 *   - Graceful fallback when push isn't supported
 */

(function (global) {
  'use strict';

  let _initialized = false;

  function _token() {
    return global.authToken ||
           sessionStorage.getItem('kynecta_auth_token') ||
           localStorage.getItem('kynecta_auth_token') ||
           localStorage.getItem('authToken') ||
           localStorage.getItem('accessToken') || '';
  }

  // ── Register SW and subscribe to push ─────────────────────────────────────
  async function initPush() {
    if (_initialized) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('[PushInit] Push not supported');
      return;
    }
    if (Notification.permission === 'denied') {
      console.log('[PushInit] Push permission denied by user');
      return;
    }

    _initialized = true;

    try {
      // Use existing push-manager.js if loaded
      if (global.KynPushManager?.subscribe) {
        await global.KynPushManager.subscribe();
        console.log('[PushInit] Push subscribed via KynPushManager');
        return;
      }

      // Otherwise do it directly
      const swReg = await navigator.serviceWorker.ready;

      // Fetch VAPID public key
      const apiBase = global.API_BASE_URL || '';
      const keyRes  = await fetch(`${apiBase}/api/push/vapid-public-key`, {
        headers: { Authorization: `Bearer ${_token()}` }
      });
      const keyData = await keyRes.json();
      const vapidKey = keyData.data?.publicKey;
      if (!vapidKey) {
        console.warn('[PushInit] No VAPID key from server');
        return;
      }

      // Convert VAPID key
      const padding  = '='.repeat((4 - vapidKey.length % 4) % 4);
      const base64   = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData  = atob(base64);
      const uint8    = new Uint8Array([...rawData].map(c => c.charCodeAt(0)));

      // Check if already subscribed
      let sub = await swReg.pushManager.getSubscription();
      if (!sub) {
        // Request permission first
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          console.log('[PushInit] Permission not granted:', perm);
          return;
        }
        sub = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: uint8,
        });
      }

      // Send subscription to backend
      const { endpoint, keys } = sub.toJSON();
      await fetch(`${apiBase}/api/push/subscribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${_token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          p256dh: keys.p256dh,
          auth:   keys.auth,
          userAgent: navigator.userAgent,
        }),
      });

      console.log('[PushInit] ✅ Push subscription active');
      window.dispatchEvent(new CustomEvent('kyn:pushSubscribed', { detail: { endpoint } }));
    } catch (e) {
      console.warn('[PushInit] Push init failed (non-fatal):', e.message);
    }
  }

  // ── Update badge count ─────────────────────────────────────────────────────
  function updateBadge(count) {
    // Set app icon badge (Badging API — Chrome only for now)
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      } else {
        navigator.clearAppBadge?.().catch(() => {});
      }
    }
  }

  // ── Handle notification click deep-link ───────────────────────────────────
  function _handleNotificationDeepLink() {
    // SW passes data via URL params when notification is clicked
    const params = new URLSearchParams(location.search);
    const chatId  = params.get('chatId');
    const groupId = params.get('groupId');
    const msgId   = params.get('messageId');

    if (chatId) {
      console.log('[PushInit] Notification deep-link → chatId:', chatId);
      // Slight delay for app to initialize
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kyn:openChat', {
          detail: { chatId, scrollToMessageId: msgId || null }
        }));
        // Clean URL
        history.replaceState({}, '', location.pathname);
      }, 800);
    }

    // FIX (VERIFIED-MISSING-DEEP-LINK, group message notifications): same
    // pattern as chatId above. pushService.js's pushGroupMessage() now sets
    // data.url = /chat.html?groupId=... (previously had no url at all).
    if (groupId) {
      console.log('[PushInit] Notification deep-link → groupId:', groupId);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kyn:openGroup', {
          detail: { groupId, scrollToMessageId: msgId || null }
        }));
        history.replaceState({}, '', location.pathname);
      }, 800);
    }
  }

  // ── Listen for unread count changes to update badge ────────────────────────
  window.addEventListener('kyn:unreadCountChanged', (e) => {
    const total = e.detail?.total || e.detail?.count || 0;
    updateBadge(total);
  });

  // ── Prompt for push permission at a natural moment ─────────────────────────
  // Don't ask on page load — wait for first user interaction in a chat
  let _prompted = false;
  window.addEventListener('kyn:firstMessageSent', () => {
    if (!_prompted) { _prompted = true; initPush(); }
  });
  window.addEventListener('kyn:chatOpened', () => {
    if (!_prompted && Notification.permission === 'default') {
      _prompted = true;
      // Small delay so the user is engaged before the prompt appears
      setTimeout(initPush, 3000);
    }
  });

  // Auto-init if permission already granted (returning user)
  if (Notification.permission === 'granted') {
    setTimeout(initPush, 1500);
  }

  // FIX: the service worker now focuses the ALREADY-OPEN window and posts the click here (a deep link in the URL is only read at
  // page load, so it could never reach a running app). Relay it to the same events the URL path uses.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.type !== 'KYN_NOTIFICATION_CLICK') return;
      const n = d.data || {};
      let q = null;
      try { q = new URL(d.url || n.url || '', location.origin).searchParams; } catch (_) {}
      const chatId = n.chatId || (q && q.get('chatId'));
      const groupId = n.groupId || (q && q.get('groupId'));
      const msgId = n.messageId || (q && q.get('messageId')) || null;
      if (groupId) window.dispatchEvent(new CustomEvent('kyn:openGroup', { detail: { groupId, scrollToMessageId: msgId } }));
      else if (chatId) window.dispatchEvent(new CustomEvent('kyn:openChat', { detail: { chatId, scrollToMessageId: msgId } }));
    });

    // FIX (E2E-BYPASS-QUICK-REPLY): a reply typed into a notification used to be POSTed by the service worker as plaintext.
    // The SW cannot encrypt (no identity/ratchet keys), so it now hands the text to this window, which sends it through the one
    // canonical encrypted pipeline (MessageModule.sendMessage -> encryptForChat), exactly like native-push.js's sendReply().
    // Protocol: reply with ok:true once sent, ok:false on a definite failure, and say NOTHING while the messaging module / chat list /
    // E2E keys are still loading (cold start) so the SW simply re-posts a second later. Deduplicated by rid.
    const _replyState = new Map(); // rid -> 'sending' | 'done'
    navigator.serviceWorker.addEventListener('message', async (e) => {
      const d = e && e.data;
      if (!d || d.type !== 'KYN_NOTIFICATION_REPLY' || !d.rid) return;
      const ack = (ok) => { try { (e.source || navigator.serviceWorker.controller).postMessage({ type: 'KYN_NOTIFICATION_REPLY_ACK', rid: d.rid, ok }); } catch (_) {} };
      const st = _replyState.get(d.rid);
      if (st === 'done') return ack(true);
      if (st === 'sending') return;
      const text = String(d.text || '').trim();
      if (!text) return ack(false);
      if (d.groupId && !d.chatId) return ack(false); // group replies must go through the group E2E composer, never from a notification
      const fr = document.getElementById('messagesIframe');
      const w = fr && fr.contentWindow, MM = w && w.MessageModule;
      if (!MM || typeof MM.sendMessage !== 'function') return;                                   // not loaded yet: SW will retry
      if (!w.KynectaE2E || typeof w.KynectaE2E.encryptForChat !== 'function') return;             // E2E not unlocked yet: SW will retry
      try { if (!MM.getConversations().some(c => String(c.chatId) === String(d.chatId))) return; } catch (_) { return; } // chat list not loaded yet
      _replyState.set(d.rid, 'sending');
      try {
        const res = await MM.sendMessage({ chatId: /^\d+$/.test(String(d.chatId)) ? Number(d.chatId) : d.chatId, content: text, type: 'text' });
        if (res && res.success === false) { _replyState.delete(d.rid); return ack(false); }
        _replyState.set(d.rid, 'done'); ack(true);
      } catch (err) { _replyState.delete(d.rid); console.warn('[PushInit] notification reply failed', err && err.message || err); ack(false); }
    });
  }

  // Handle notification clicks
  _handleNotificationDeepLink();

  global.kynPushInit = { initPush, updateBadge };

}(window));
