/**
 * NotificationStabilizationLayer.js
 * Phase 1 — Notification Stabilization
 *
 * Stabilizes:
 *  - Duplicate notifications
 *  - Reconnect notification storms
 *  - Stale unread counts
 *  - Hidden-tab notification desync
 *  - Delayed notification rendering
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__NotificationStabilizationLayer) {
    console.log('[NotifStab] Already initialized — skipping.');
    return;
  }

  const DEDUP_WINDOW_MS = 5000;
  const MAX_STORM_PER_WINDOW = 8;
  const STORM_WINDOW_MS = 3000;

  // ─── NotificationDeduplicator ────────────────────────────────────────────────

  class NotificationDeduplicator {
    constructor() {
      this._seen = new Map(); // key -> ts
    }

    isDuplicate(key) {
      const last = this._seen.get(key);
      const now = Date.now();
      if (last && now - last < DEDUP_WINDOW_MS) return true;
      this._seen.set(key, now);
      this._prune();
      return false;
    }

    _prune() {
      const now = Date.now();
      for (const [k, ts] of this._seen) {
        if (now - ts > DEDUP_WINDOW_MS * 2) this._seen.delete(k);
      }
    }
  }

  // ─── NotificationStormPreventer ──────────────────────────────────────────────

  class NotificationStormPreventer {
    constructor() {
      this._buffer = [];
      this._suppressed = 0;
    }

    /**
     * Returns true if the notification should be shown.
     */
    allow() {
      const now = Date.now();
      this._buffer = this._buffer.filter((t) => now - t < STORM_WINDOW_MS);
      if (this._buffer.length >= MAX_STORM_PER_WINDOW) {
        this._suppressed++;
        return false;
      }
      this._buffer.push(now);
      return true;
    }

    getSuppressedCount() { return this._suppressed; }
  }

  // ─── UnreadCountManager ──────────────────────────────────────────────────────

  class UnreadCountManager {
    constructor() {
      this._counts = new Map(); // chatId -> count
      this._total = 0;
      this._listeners = [];
    }

    set(chatId, count) {
      const prev = this._counts.get(chatId) || 0;
      if (prev === count) return;
      this._counts.set(chatId, Math.max(0, count));
      this._recalcTotal();
      this._emit(chatId, count);
    }

    increment(chatId, by = 1) {
      const current = this._counts.get(chatId) || 0;
      this.set(chatId, current + by);
    }

    clear(chatId) {
      this.set(chatId, 0);
    }

    clearAll() {
      for (const chatId of this._counts.keys()) {
        this._counts.set(chatId, 0);
      }
      this._recalcTotal();
      this._emit(null, 0);
    }

    getTotal() { return this._total; }
    getForChat(chatId) { return this._counts.get(chatId) || 0; }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter((l) => l !== fn); };
    }

    _recalcTotal() {
      this._total = Array.from(this._counts.values()).reduce((a, b) => a + b, 0);
      this._updateBadge();
    }

    _updateBadge() {
      if (navigator.setAppBadge) {
        if (this._total > 0) navigator.setAppBadge(this._total).catch(() => {});
        else navigator.clearAppBadge().catch(() => {});
      }
      // Update document title badge
      try {
        const title = document.title.replace(/^\(\d+\) /, '');
        document.title = this._total > 0 ? `(${this._total}) ${title}` : title;
      } catch (_) {}
    }

    _emit(chatId, count) {
      for (const fn of this._listeners) {
        try { fn({ chatId, count, total: this._total }); } catch (_) {}
      }
    }
  }

  // ─── NotificationStabilizationLayer (main) ───────────────────────────────────

  class NotificationStabilizationLayer {
    constructor() {
      this._dedup = new NotificationDeduplicator();
      this._storm = new NotificationStormPreventer();
      this._unread = new UnreadCountManager();
      this._pendingNotifs = []; // buffered while tab is hidden
      this._lastReconnectAt = null;
    }

    init() {
      this._attachSocketListeners();
      this._attachVisibility();
      this._patchBrowserNotification();
      console.log('[NotifStab] ✅ Initialized');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    get unread() { return this._unread; }

    /**
     * Call before showing any notification.
     * Returns false if the notification should be suppressed.
     */
    shouldShow(id, chatId) {
      const key = `${chatId}:${id}`;
      if (this._dedup.isDuplicate(key)) return false;
      if (!this._storm.allow()) return false;
      return true;
    }

    getDiagnostics() {
      return {
        unreadTotal: this._unread.getTotal(),
        stormSuppressed: this._storm.getSuppressedCount(),
      };
    }

    // ── Socket event listeners ─────────────────────────────────────────────────

    _attachSocketListeners() {
      const handle = (type, payload) => {
        // Reconnect storm prevention — skip notification burst right after reconnect
        if (type === 'socket:reconnected' || type === 'socket:connected') {
          this._lastReconnectAt = Date.now();
          return;
        }

        if (type === 'message:created' || type === 'new_message' || type === 'MESSAGE_RECEIVED') {
          const chatId = payload?.chatId || payload?.conversationId || 'global';
          const id = payload?.id || payload?.messageId || payload?.localId;

          // Suppress notifications immediately after reconnect (storm prevention)
          if (this._lastReconnectAt && Date.now() - this._lastReconnectAt < 2000) {
            return;
          }

          if (!this.shouldShow(id, chatId)) return;

          // If tab is hidden, buffer the notification
          if (document.visibilityState === 'hidden') {
            this._pendingNotifs.push({ type, payload, ts: Date.now() });
            if (this._pendingNotifs.length > 20) this._pendingNotifs.shift();
            return;
          }

          // Increment unread count
          const isCurrentUser = payload?.senderId === this._getMyUserId();
          if (!isCurrentUser) {
            this._unread.increment(chatId);
          }
        }

        if (type === 'read_receipt' || type === 'message:read' || type === 'MESSAGE_READ') {
          const chatId = payload?.chatId || payload?.conversationId;
          if (chatId) this._unread.clear(chatId);
        }
      };

      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SOCKET_EVENT', (payload) => {
          if (payload?.type) handle(payload.type, payload);
        });
      }

      window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const type = e.data.type || '';
        if (type) handle(type, e.data);
      });
    }

    _attachVisibility() {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this._flushPendingNotifs();
        }
      });
    }

    _flushPendingNotifs() {
      const pending = this._pendingNotifs.splice(0);
      if (!pending.length) return;

      console.log(`[NotifStab] Flushing ${pending.length} buffered notifications`);

      // Group by chat and just update counts — don't re-fire native notifications
      const byChatId = {};
      for (const { payload } of pending) {
        const chatId = payload?.chatId || payload?.conversationId || 'global';
        byChatId[chatId] = (byChatId[chatId] || 0) + 1;
      }

      for (const [chatId, count] of Object.entries(byChatId)) {
        this._unread.increment(chatId, count);
      }
    }

    _getMyUserId() {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('moodchat_auth');
        if (!raw) return null;
        return JSON.parse(raw)?.user?.id || null;
      } catch (_) { return null; }
    }

    // ── Browser Notification dedup ─────────────────────────────────────────────

    _patchBrowserNotification() {
      if (typeof Notification === 'undefined') return;
      const self = this;
      const OrigNotif = window.Notification;

      // Wrap to detect duplicate notifications
      window.Notification = function (title, options = {}) {
        const key = title + '|' + (options.tag || '') + '|' + (options.body || '').slice(0, 30);
        if (self._dedup.isDuplicate(key)) {
          console.debug('[NotifStab] Duplicate browser notification suppressed:', title);
          return { close: () => {} }; // No-op
        }
        if (!self._storm.allow()) {
          console.debug('[NotifStab] Storm prevention — suppressing browser notification:', title);
          return { close: () => {} };
        }
        return new OrigNotif(title, options);
      };

      // Copy static properties
      Object.assign(window.Notification, OrigNotif);
      Object.setPrototypeOf(window.Notification, OrigNotif);

      console.log('[NotifStab] Notification constructor patched for dedup');
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new NotificationStabilizationLayer();
  layer.init();

  window.__NotificationStabilizationLayer = layer;
  window.NotifStab = layer;

  console.log('[NotifStab] ✅ Ready');
})();
