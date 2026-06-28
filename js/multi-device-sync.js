/**
 * multi-device-sync.js — Multi-device message synchronization
 *
 * Syncs messages, chat state, starred messages, and pinned chats
 * to linked devices when the app loads or when new messages arrive.
 *
 * How it works:
 *  1. On load: calls GET /api/devices/sync?since=<lastSyncTs> to catch up
 *  2. On new message via Socket.IO: the backend pushes to sibling devices
 *     via Socket.IO rooms (user:<id>) — already happens through existing
 *     message delivery, but we need to handle the 'device:sync' event
 *  3. Every 5 minutes: lightweight heartbeat + incremental sync
 *  4. On visibility change (tab focus): re-sync since last sync
 *
 * Also registers this device on first load via POST /api/devices/link
 * (idempotent — uses deviceId stored in localStorage).
 */

(function (global) {
  'use strict';

  const API_BASE    = () => global.API_BASE_URL || '';
  const _token      = () => localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const DEVICE_ID_KEY  = 'kyn_device_id_v1';
  const LAST_SYNC_KEY  = 'kyn_last_sync_ts_v1';
  const SYNC_INTERVAL  = 5 * 60 * 1000; // 5 min

  let _syncTimer = null;
  let _syncing   = false;

  // ── Device registration ────────────────────────────────────────────────────
  function _getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'kyn-' + Array.from(crypto.getRandomValues(new Uint8Array(12)))
                         .map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function _getPlatform() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    if (/Android/.test(ua))     return 'Android';
    if (/Mac/.test(ua))         return 'macOS';
    if (/Win/.test(ua))         return 'Windows';
    if (/Linux/.test(ua))       return 'Linux';
    return 'Web';
  }

  async function registerDevice() {
    const deviceId   = _getOrCreateDeviceId();
    const deviceName = `${_getPlatform()} · ${navigator.userAgent.split('/').pop()?.split(' ')[0] || 'Browser'}`;

    try {
      await fetch(`${API_BASE()}/api/devices/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${_token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, deviceName, platform: _getPlatform() }),
      });
      console.log('[MultiDeviceSync] Device registered:', deviceId);
    } catch (e) {
      console.warn('[MultiDeviceSync] Device registration failed (non-fatal):', e.message);
    }
  }

  // ── Device heartbeat ───────────────────────────────────────────────────────
  async function _heartbeat() {
    try {
      await fetch(`${API_BASE()}/api/devices/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${_token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: _getOrCreateDeviceId() }),
      });
    } catch (_) {}
  }

  // ── Sync from backend ──────────────────────────────────────────────────────
  async function sync(force = false) {
    if (_syncing) return;
    _syncing = true;

    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    const since    = (!force && lastSync) ? new Date(parseInt(lastSync)).toISOString() : null;

    try {
      const url    = `${API_BASE()}/api/devices/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`;
      const res    = await fetch(url, { headers: { Authorization: `Bearer ${_token()}` } });
      const data   = await res.json();

      if (!data.data) return;

      const { chats, starred, pinned } = data.data;

      // Apply synced chat list updates to messages-core
      if (chats?.length) {
        _applyChats(chats);
      }

      // Apply starred messages
      if (starred?.length) {
        _applyStarred(starred);
      }

      // Apply pinned chats
      if (pinned?.length) {
        _applyPinned(pinned);
      }

      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      window.dispatchEvent(new CustomEvent('kyn:deviceSynced', { detail: { chats, starred, pinned } }));
    } catch (e) {
      console.warn('[MultiDeviceSync] Sync failed (non-fatal):', e.message);
    } finally {
      _syncing = false;
    }
  }

  // ── Apply synced data to in-memory state ───────────────────────────────────
  function _applyChats(chats) {
    const core = global.messagesCore || global.__messagesCore;
    if (!core?.ChatManager) return;

    chats.forEach(chat => {
      // If this chat isn't in the current chat list, add it
      const existing = core.ChatManager.getConversation?.(chat.id);
      if (!existing) {
        // Trigger a refresh of the conversation list
        window.dispatchEvent(new CustomEvent('kyn:conversationAdded', { detail: chat }));
      } else {
        // Update unread count, last message, etc.
        if (chat.unreadCount !== undefined && existing.unreadCount !== chat.unreadCount) {
          window.dispatchEvent(new CustomEvent('kyn:unreadCountChanged', {
            detail: { chatId: chat.id, count: chat.unreadCount }
          }));
        }
      }
    });
  }

  function _applyStarred(starred) {
    // Merge into local starred store
    const stored = JSON.parse(localStorage.getItem('kyn_starred_messages') || '[]');
    const ids    = new Set(stored.map(s => s.messageId));
    let changed  = false;

    starred.forEach(s => {
      if (!ids.has(s.messageId)) {
        stored.push(s);
        ids.add(s.messageId);
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem('kyn_starred_messages', JSON.stringify(stored));
      window.dispatchEvent(new CustomEvent('kyn:starredSynced', { detail: { starred: stored } }));
    }
  }

  function _applyPinned(pinned) {
    const stored = JSON.parse(localStorage.getItem('kyn_pinned_chats') || '[]');
    const ids    = new Set(stored.map(p => p.chatId));
    let changed  = false;

    pinned.forEach(p => {
      if (!ids.has(p.chatId)) {
        stored.push(p);
        ids.add(p.chatId);
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem('kyn_pinned_chats', JSON.stringify(stored));
      window.dispatchEvent(new CustomEvent('kyn:pinnedSynced', { detail: { pinned: stored } }));
    }
  }

  // ── Socket.IO: receive sync events from other devices ─────────────────────
  function _hookSocket() {
    const socket = global.__socket || global.socket;
    if (!socket) { setTimeout(_hookSocket, 1500); return; }

    // When another device of the same user sends a message, we receive it here
    socket.on('device:sync', (data) => {
      console.log('[MultiDeviceSync] Received sync event from sibling device:', data.type);
      switch (data.type) {
        case 'message:sent':
          // A message was sent from another device — add to our UI
          window.dispatchEvent(new CustomEvent('kyn:siblingMessageSent', { detail: data }));
          break;
        case 'message:read':
          // Mark messages as read that were read on another device
          window.dispatchEvent(new CustomEvent('kyn:siblingMessageRead', { detail: data }));
          break;
        case 'chat:archived':
          window.dispatchEvent(new CustomEvent('kyn:siblingChatArchived', { detail: data }));
          break;
        case 'chat:muted':
          window.dispatchEvent(new CustomEvent('kyn:siblingChatMuted', { detail: data }));
          break;
        default:
          // Trigger a full incremental sync for unknown events
          setTimeout(() => sync(false), 500);
      }
    });

    // Re-sync when reconnecting (may have missed events while offline)
    socket.on('connect', () => {
      console.log('[MultiDeviceSync] Socket reconnected — syncing...');
      setTimeout(() => sync(false), 1000);
    });
  }

  // ── Visibility change: sync when tab gets focus ────────────────────────────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const last = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
      const age  = Date.now() - last;
      if (age > 60_000) { // Only sync if last sync was > 1 minute ago
        sync(false);
      }
    }
  });

  // ── Start periodic sync ────────────────────────────────────────────────────
  function start() {
    registerDevice();
    sync(false); // Initial sync on load

    // Periodic sync
    _syncTimer = setInterval(() => {
      _heartbeat();
      sync(false);
    }, SYNC_INTERVAL);

    // Socket hooks
    _hookSocket();

    console.log('[MultiDeviceSync] ✅ Started');
  }

  function stop() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.kynMultiDeviceSync = { start, stop, sync, registerDevice };

  // Auto-start when user is logged in
  function _tryStart() {
    const tok = _token();
    if (!tok) { setTimeout(_tryStart, 1000); return; }
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _tryStart);
  } else {
    setTimeout(_tryStart, 500);
  }

}(window));
