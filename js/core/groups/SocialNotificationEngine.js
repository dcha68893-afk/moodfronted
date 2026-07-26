/**
 * SocialNotificationEngine.js
 * Phase 4 — Distributed Notification + Reaction Engine (Frontend)
 *
 * Unified notification system covering:
 *  - Group mentions, reactions, replies
 *  - Story mentions, reactions, views, replies
 *  - Group role changes, invites, calls
 *  - Deduplication across tabs
 *  - Unread counter accuracy per group + status
 *  - Reaction real-time sync with dedup
 *
 * Integrates with:
 *  - existing NotificationStabilizationLayer (Phase 1)
 *  - kyn:group:* and kyn:status:* CustomEvents
 *  - existing KynectaEventBus
 *
 * @version 4.0.0
 * @phase 4 — Social Notifications
 */

(function () {
  'use strict';

  if (window.__SocialNotificationEngine) return;

  // ─── UnreadCountStore ─────────────────────────────────────────────────────

  class UnreadCountStore {
    constructor() {
      this._counts    = new Map();   // `group:${id}` | `dm:${id}` → count
      this._listeners = [];
    }

    increment(scope, by = 1) {
      const prev = this._counts.get(scope) || 0;
      this._counts.set(scope, prev + by);
      this._emit(scope, this._counts.get(scope));
    }

    clear(scope) {
      if (this._counts.get(scope) > 0) {
        this._counts.set(scope, 0);
        this._emit(scope, 0);
      }
    }

    getCount(scope)   { return this._counts.get(scope) || 0; }

    getTotal() {
      let total = 0;
      for (const v of this._counts.values()) total += v;
      return total;
    }

    getAllGroups() {
      const out = {};
      for (const [k, v] of this._counts) out[k] = v;
      return out;
    }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _emit(scope, count) {
      const total = this.getTotal();
      this._listeners.forEach(fn => { try { fn({ scope, count, total }); } catch (_) {} });

      // Update document title badge (consistent with Phase 1 NotifStab)
      try {
        const title  = document.title.replace(/^\(\d+\) /, '');
        document.title = total > 0 ? `(${total}) ${title}` : title;
      } catch (_) {}

      // Update app badge API
      if (navigator.setAppBadge) {
        total > 0
          ? navigator.setAppBadge(total).catch(() => {})
          : navigator.clearAppBadge().catch(() => {});
      }

      // Broadcast to all iframes
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(f => {
        try {
          f.contentWindow.postMessage({ type: 'UNREAD_COUNT_UPDATE', scope, count, total }, '*');
        } catch (_) {}
      });
    }
  }

  // ─── ReactionEngine ───────────────────────────────────────────────────────

  class ReactionEngine {
    constructor() {
      // `${messageId}:${userId}:${emoji}` → ts — dedup window
      this._seen         = new Map();
      this._dedupWindowMs = 8000;
      // messageId → Map<emoji, Set<userId>>
      this._reactions    = new Map();
    }

    processReaction(messageId, userId, emoji, action = 'add') {
      const key = `${messageId}:${userId}:${emoji}`;
      const now = Date.now();

      // Prune dedup window
      for (const [k, ts] of this._seen) {
        if (now - ts > this._dedupWindowMs) this._seen.delete(k);
      }
      if (this._seen.has(key)) return null; // duplicate
      this._seen.set(key, now);

      // Update local reaction map
      if (!this._reactions.has(messageId)) this._reactions.set(messageId, new Map());
      const emojiMap = this._reactions.get(messageId);

      if (action === 'add') {
        if (!emojiMap.has(emoji)) emojiMap.set(emoji, new Set());
        emojiMap.get(emoji).add(String(userId));
      } else if (action === 'remove') {
        emojiMap.get(emoji)?.delete(String(userId));
        if (!emojiMap.get(emoji)?.size) emojiMap.delete(emoji);
      }

      return this.getReactions(messageId);
    }

    getReactions(messageId) {
      const map = this._reactions.get(messageId);
      if (!map) return {};
      const out = {};
      for (const [emoji, users] of map) {
        out[emoji] = Array.from(users);
      }
      return out;
    }

    sendReaction(contextType, contextId, messageId, emoji) {
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;

      const eventMap = { group: 'group:reaction', dm: 'message:react', status: 'status:react' };
      const event    = eventMap[contextType] || 'message:react';

      rt._socket.emit(event, {
        [contextType === 'group' ? 'groupId' : 'chatId']: contextId,
        messageId,
        emoji,
        timestamp: Date.now(),
      });
    }

    removeReaction(contextType, contextId, messageId, emoji) {
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;
      rt._socket.emit('message:unreact', { contextId, messageId, emoji, timestamp: Date.now() });
    }
  }

  // ─── NotificationDeduplicator ─────────────────────────────────────────────

  class NotificationDeduplicator {
    constructor() {
      this._seen    = new Map();
      this._window  = 5000;
    }

    isDuplicate(key) {
      const now  = Date.now();
      for (const [k, ts] of this._seen) if (now - ts > this._window) this._seen.delete(k);
      if (this._seen.has(key)) return true;
      this._seen.set(key, now);
      return false;
    }
  }

  // ─── SocialNotificationEngine (main) ──────────────────────────────────────

  class SocialNotificationEngine {
    constructor() {
      this._unread   = new UnreadCountStore();
      this._reactions = new ReactionEngine();
      this._dedup    = new NotificationDeduplicator();
      this._myUserId = null;
      this._started  = false;
    }

    start() {
      if (this._started) return;
      this._started  = true;
      this._myUserId = this._getMyUserId();
      this._attachListeners();
      console.log('[SocialNotif] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    getGroupUnread(groupId)   { return this._unread.getCount(`group:${groupId}`); }
    clearGroupUnread(groupId) { this._unread.clear(`group:${groupId}`); }
    getTotalUnread()          { return this._unread.getTotal(); }
    getAllUnreads()            { return this._unread.getAllGroups(); }

    onUnreadChange(fn)        { return this._unread.onChange(fn); }

    reactToMessage(contextType, contextId, messageId, emoji) {
      return this._reactions.sendReaction(contextType, contextId, messageId, emoji);
    }

    getReactions(messageId) {
      return this._reactions.getReactions(messageId);
    }

    getDiagnostics() {
      return {
        totalUnread: this.getTotalUnread(),
        reactionsTracked: this._reactions._reactions.size,
        started: this._started,
      };
    }

    // ── Private — Listeners ───────────────────────────────────────────────

    _attachListeners() {
      // ── Group notifications ──────────────────────────────────────────────

      window.addEventListener('kyn:group:message', e => {
        const { groupId, message } = e.detail || {};
        if (!groupId) return;
        const senderId = message?.senderId || message?.userId;
        if (senderId && String(senderId) !== String(this._myUserId)) {
          this._unread.increment(`group:${groupId}`);
        }

        // Mention detection
        const myId   = this._myUserId;
        const text   = message?.content || message?.text || '';
        const mentioned = myId && (
          text.includes(`@${myId}`) ||
          (message?.mentions || []).map(String).includes(String(myId))
        );
        if (mentioned && !this._dedup.isDuplicate(`mention:${message?.id}`)) {
          this._showNotification('Group Mention', `You were mentioned in a group`, groupId);
        }
      }, { passive: true });

      // P2 FIX: @everyone notification — notify every member when admin uses @everyone
      window.addEventListener('kyn:group:mention:everyone', e => {
        const { groupId } = e.detail || {};
        if (!groupId) return;
        if (!this._dedup.isDuplicate(`everyone:${groupId}:${Date.now()}`)) {
          this._showNotification('📣 Group Announcement', 'An admin posted an @everyone message', groupId);
          this._unread.increment(`group:${groupId}`);
        }
      }, { passive: true });

      // P2 FIX: Auto-mute notification
      window.addEventListener('kyn:group:member:auto_muted', e => {
        const { userId, groupId, until } = e.detail || {};
        if (String(userId) === String(this._myUserId)) {
          const untilTime = until ? new Date(until).toLocaleTimeString() : 'a short period';
          this._showNotification('⚠️ Auto-muted', `You were auto-muted for flooding until ${untilTime}`, groupId);
        }
      }, { passive: true });

      // P1 FIX: Pinned message notification
      window.addEventListener('kyn:group:message:pinned', e => {
        const { groupId, messageId } = e.detail || {};
        if (!groupId) return;
        this._showNotification('📌 Message Pinned', 'An admin pinned a message', groupId);
      }, { passive: true });

      // P2 FIX: Warning notification
      window.addEventListener('kyn:group:member:warned', e => {
        const { groupId, warnings, reason } = e.detail || {};
        this._showNotification('⚠️ Warning Received', `You received a warning in this group (${warnings} total)${reason ? ': ' + reason : ''}`, groupId);
      }, { passive: true });

      window.addEventListener('kyn:group:reaction', e => {
        const { messageId, userId, emoji, action } = e.detail || {};
        if (!messageId) return;
        const reactions = this._reactions.processReaction(messageId, userId, emoji, action || 'add');
        if (reactions === null) return; // duplicate
        // Broadcast updated reactions to iframes
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(f => {
          try {
            f.contentWindow.postMessage({
              type: 'REALTIME_EVENT:group:reaction_updated',
              payload: { messageId, reactions },
            }, '*');
          } catch (_) {}
        });
        try {
          window.dispatchEvent(new CustomEvent('kyn:group:reaction_updated', {
            detail: { messageId, reactions }
          }));
        } catch (_) {}
      }, { passive: true });

      window.addEventListener('kyn:group:role_update', e => {
        const data = e.detail || {};
        if (String(data.userId) === String(this._myUserId)) {
          this._showNotification('Role Updated', `Your role in this group has changed`, data.groupId);
        }
      }, { passive: true });

      // ── Status/story notifications ───────────────────────────────────────

      window.addEventListener('kyn:status:reaction', e => {
        const data = e.detail || {};
        // Only notify story owner
        if (String(data.ownerId) === String(this._myUserId)) {
          if (!this._dedup.isDuplicate(`story:react:${data.storyId}:${data.userId}`)) {
            this._showNotification('Story Reaction', `Someone reacted to your story: ${data.emoji}`, null);
          }
        }
      }, { passive: true });

      window.addEventListener('kyn:status:reply', e => {
        const data = e.detail || {};
        if (String(data.ownerId) === String(this._myUserId)) {
          if (!this._dedup.isDuplicate(`story:reply:${data.storyId}:${data.userId}`)) {
            this._showNotification('Story Reply', `Someone replied to your story`, null);
          }
        }
      }, { passive: true });

      // ── Unread count from postMessage (cross-iframe) ─────────────────────

      window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        const { type, scope, count } = e.data;
        if (type === 'UNREAD_COUNT_UPDATE' && scope) {
          // Trust updates from sibling iframes
          this._unread._counts.set(scope, count || 0);
        }
        // Clear unread when iframe signals chat opened
        if (type === 'GROUP_CHAT_OPENED' && e.data.groupId) {
          this._unread.clear(`group:${e.data.groupId}`);
        }
      }, { passive: true });

      // ── Reconnect — preserve unread counts ──────────────────────────────

      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => {
          // Re-broadcast current unread counts to all iframes after reconnect
          setTimeout(() => {
            const all = this._unread.getAllGroups();
            for (const [scope, count] of Object.entries(all)) {
              if (count > 0) this._unread._emit(scope, count);
            }
          }, 1000);
        });
      }
    }

    _showNotification(title, body, groupId) {
      // Use Phase 1 NotifStab for dedup + storm prevention
      const notifStab = window.__NotificationStabilizationLayer;
      const key       = `${title}:${body}`;
      if (notifStab && !notifStab.shouldShow(key, groupId || 'social')) return;

      if (Notification.permission === 'granted') {
        try {
          new Notification(title, { body, tag: key, icon: '/icon.png' });
        } catch (_) {}
      }
    }

    _getMyUserId() {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('nexopa_auth');
        return raw ? JSON.parse(raw)?.user?.id : null;
      } catch (_) { return null; }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new SocialNotificationEngine();

  // Start after Phase 1 is ready
  const tryStart = () => {
    if (window.__NotificationStabilizationLayer || window.KynectaEventBus) {
      engine.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__SocialNotificationEngine = engine;
  window.SocialNotif                = engine;

  console.log('[SocialNotif] ✅ Ready');
})();
