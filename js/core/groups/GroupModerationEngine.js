/**
 * GroupModerationEngine.js
 * Phase 4 — Group Moderation + Social Graph Engine (Frontend)
 *
 * Implements:
 *  - Role-based moderation (kick, ban, mute, slow mode)
 *  - Permission enforcement client + socket side
 *  - Social graph synchronization (friends → groups → status)
 *  - Community discovery preparation
 *  - Audit logging (local)
 *
 * Integrates with existing broadcastToGroup() server method.
 *
 * @version 4.0.0
 * @phase 4 — Moderation + Social Graph
 */

(function () {
  'use strict';

  if (window.__GroupModerationEngine) return;

  // ─── ModerationAuditLog ───────────────────────────────────────────────────

  class ModerationAuditLog {
    constructor() {
      this._log     = [];
      this._maxSize = 500;
    }

    record(action, groupId, targetUserId, performedBy, meta = {}) {
      this._log.push({
        action, groupId, targetUserId, performedBy,
        meta, ts: Date.now(),
      });
      if (this._log.length > this._maxSize) this._log.shift();
    }

    getForGroup(groupId) {
      return this._log.filter(e => e.groupId === groupId);
    }

    getRecent(limit = 50) { return this._log.slice(-limit); }
    size() { return this._log.length; }
  }

  // ─── SlowModeManager ─────────────────────────────────────────────────────

  class SlowModeManager {
    constructor() {
      this._groups = new Map(); // groupId → { intervalMs, lastMessageAt: Map<userId, ts> }
    }

    setSlowMode(groupId, intervalMs) {
      this._groups.set(groupId, {
        intervalMs,
        lastMessageAt: new Map(),
      });
    }

    disableSlowMode(groupId) { this._groups.delete(groupId); }

    canSend(groupId, userId) {
      const config = this._groups.get(groupId);
      if (!config || config.intervalMs <= 0) return true;
      const last = config.lastMessageAt.get(String(userId)) || 0;
      return Date.now() - last >= config.intervalMs;
    }

    recordSend(groupId, userId) {
      const config = this._groups.get(groupId);
      if (config) config.lastMessageAt.set(String(userId), Date.now());
    }

    getRemainingCooldown(groupId, userId) {
      const config = this._groups.get(groupId);
      if (!config) return 0;
      const last    = config.lastMessageAt.get(String(userId)) || 0;
      const elapsed = Date.now() - last;
      return Math.max(0, config.intervalMs - elapsed);
    }
  }

  // ─── MuteRegistry ─────────────────────────────────────────────────────────

  class MuteRegistry {
    constructor() {
      // groupId → Set<userId>
      this._muted = new Map();
      // groupId:userId → expiresAt
      this._expiry = new Map();
    }

    mute(groupId, userId, durationMs = null) {
      if (!this._muted.has(groupId)) this._muted.set(groupId, new Set());
      this._muted.get(groupId).add(String(userId));
      if (durationMs) {
        const key = `${groupId}:${userId}`;
        this._expiry.set(key, Date.now() + durationMs);
        setTimeout(() => this.unmute(groupId, userId), durationMs);
      }
    }

    unmute(groupId, userId) {
      this._muted.get(groupId)?.delete(String(userId));
      this._expiry.delete(`${groupId}:${userId}`);
    }

    isMuted(groupId, userId) {
      const key    = `${groupId}:${userId}`;
      const expiry = this._expiry.get(key);
      if (expiry && Date.now() > expiry) { this.unmute(groupId, userId); return false; }
      return this._muted.get(groupId)?.has(String(userId)) || false;
    }
  }

  // ─── BanRegistry ──────────────────────────────────────────────────────────

  class BanRegistry {
    constructor() {
      // groupId → Map<userId, { reason, bannedBy, bannedAt, expiresAt }>
      this._bans = new Map();
    }

    ban(groupId, userId, meta = {}) {
      if (!this._bans.has(groupId)) this._bans.set(groupId, new Map());
      this._bans.get(groupId).set(String(userId), {
        reason:   meta.reason || null,
        bannedBy: meta.bannedBy || null,
        bannedAt: Date.now(),
        expiresAt: meta.durationMs ? Date.now() + meta.durationMs : null,
      });
    }

    unban(groupId, userId) {
      this._bans.get(groupId)?.delete(String(userId));
    }

    isBanned(groupId, userId) {
      const ban = this._bans.get(groupId)?.get(String(userId));
      if (!ban) return false;
      if (ban.expiresAt && Date.now() > ban.expiresAt) { this.unban(groupId, userId); return false; }
      return true;
    }

    getBan(groupId, userId) {
      return this._bans.get(groupId)?.get(String(userId)) || null;
    }
  }

  // ─── GroupModerationEngine (main) ─────────────────────────────────────────

  class GroupModerationEngine {
    constructor() {
      this._audit    = new ModerationAuditLog();
      this._slowMode = new SlowModeManager();
      this._mutes    = new MuteRegistry();
      this._bans     = new BanRegistry();
      this._started  = false;
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._attachListeners();
      console.log('[GroupModeration] ✅ Started');
    }

    // ── Permission-gated moderation actions ───────────────────────────────

    kick(groupId, targetUserId, reason = '') {
      if (!this._checkPerm(groupId, 'kick_member')) return false;
      this._sendModerationAction('group:kick', { groupId, targetUserId, reason });
      this._audit.record('kick', groupId, targetUserId, this._getMyUserId(), { reason });
      return true;
    }

    ban(groupId, targetUserId, reason = '', durationMs = null) {
      if (!this._checkPerm(groupId, 'ban_member')) return false;
      this._bans.ban(groupId, targetUserId, { reason, durationMs, bannedBy: this._getMyUserId() });
      this._sendModerationAction('group:ban', { groupId, targetUserId, reason, durationMs });
      this._audit.record('ban', groupId, targetUserId, this._getMyUserId(), { reason, durationMs });
      return true;
    }

    unban(groupId, targetUserId) {
      if (!this._checkPerm(groupId, 'ban_member')) return false;
      this._bans.unban(groupId, targetUserId);
      this._sendModerationAction('group:unban', { groupId, targetUserId });
      return true;
    }

    mute(groupId, targetUserId, durationMs = null) {
      if (!this._checkPerm(groupId, 'mute_member')) return false;
      this._mutes.mute(groupId, targetUserId, durationMs);
      this._sendModerationAction('group:mute', { groupId, targetUserId, durationMs });
      this._audit.record('mute', groupId, targetUserId, this._getMyUserId(), { durationMs });
      return true;
    }

    unmute(groupId, targetUserId) {
      this._mutes.unmute(groupId, targetUserId);
      this._sendModerationAction('group:unmute', { groupId, targetUserId });
      return true;
    }

    setSlowMode(groupId, intervalMs) {
      if (!this._checkPerm(groupId, 'update_group')) return false;
      this._slowMode.setSlowMode(groupId, intervalMs);
      this._sendModerationAction('group:slow_mode', { groupId, intervalMs });
      return true;
    }

    updateRole(groupId, targetUserId, newRole) {
      if (!this._checkPerm(groupId, 'manage_roles')) return false;
      this._sendModerationAction('group:role_update', { groupId, targetUserId, role: newRole });
      this._audit.record('role_update', groupId, targetUserId, this._getMyUserId(), { newRole });
      return true;
    }

    // ── Client-side pre-send checks ───────────────────────────────────────

    canSendMessage(groupId, userId) {
      if (this._bans.isBanned(groupId, userId)) return { allowed: false, reason: 'banned' };
      if (this._mutes.isMuted(groupId, userId)) return { allowed: false, reason: 'muted' };
      if (!this._slowMode.canSend(groupId, userId)) {
        const cooldown = this._slowMode.getRemainingCooldown(groupId, userId);
        return { allowed: false, reason: 'slow_mode', cooldownMs: cooldown };
      }
      return { allowed: true };
    }

    recordMessageSent(groupId, userId) {
      this._slowMode.recordSend(groupId, userId);
    }

    // ── Audit / State queries ─────────────────────────────────────────────

    isBanned(groupId, userId) { return this._bans.isBanned(groupId, userId); }
    isMuted(groupId, userId)  { return this._mutes.isMuted(groupId, userId); }
    getAuditLog(groupId)      { return this._audit.getForGroup(groupId); }

    getDiagnostics() {
      return {
        auditLog: this._audit.size(),
        slowModeGroups: this._slowMode._groups.size,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachListeners() {
      // Listen for server-side moderation events
      const moderationEvents = [
        'group:kick', 'group:ban', 'group:unban',
        'group:mute', 'group:unmute', 'group:slow_mode',
        'group:role_update',
      ];
      for (const evt of moderationEvents) {
        window.addEventListener('kyn:' + evt, e => {
          const data = e.detail || {};
          // Handle incoming moderation directed at current user
          if (String(data.targetUserId) === String(this._getMyUserId())) {
            window.dispatchEvent(new CustomEvent('kyn:moderation:action_received', {
              detail: { action: evt, ...data }
            }));
          }
          // Update local state
          if (evt === 'group:ban') {
            this._bans.ban(data.groupId, data.targetUserId, { reason: data.reason });
          } else if (evt === 'group:unban') {
            this._bans.unban(data.groupId, data.targetUserId);
          } else if (evt === 'group:mute') {
            this._mutes.mute(data.groupId, data.targetUserId, data.durationMs);
          } else if (evt === 'group:unmute') {
            this._mutes.unmute(data.groupId, data.targetUserId);
          } else if (evt === 'group:slow_mode') {
            this._slowMode.setSlowMode(data.groupId, data.intervalMs);
          }
        }, { passive: true });
      }

      // P1 FIX: Listen for group:settings:updated to sync slow mode, posting rule
      window.addEventListener('kyn:group:settings:updated', e => {
        const data = e.detail || {};
        if (data.groupId && data.settings) {
          if (data.settings.slowModeInterval !== undefined) {
            const ms = (data.settings.slowModeInterval || 0) * 1000;
            if (ms > 0) this._slowMode.setSlowMode(data.groupId, ms);
            else this._slowMode.disableSlowMode(data.groupId);
          }
        }
      }, { passive: true });
    }

    /**
     * P1 FIX: Call this after loading group data from API to sync server-side
     * slowModeInterval and postingRule into the client engine.
     * group = { id, slowModeInterval, postingRule, ... }
     */
    syncFromGroup(group) {
      if (!group) return;
      const gid = group.id;
      const slowSecs = group.slowModeInterval || 0;
      if (slowSecs > 0) {
        this._slowMode.setSlowMode(gid, slowSecs * 1000);
      } else {
        this._slowMode.disableSlowMode(gid);
      }
      // Store postingRule for local UI enforcement (server enforces too)
      if (!this._postingRules) this._postingRules = new Map();
      this._postingRules.set(gid, group.postingRule || 'open');
    }

    getPostingRule(groupId) {
      return this._postingRules?.get(groupId) || 'open';
    }

    _checkPerm(groupId, action) {
      const orch = window.__GroupOrchestrator;
      if (!orch) return true; // degrade gracefully if not loaded
      return orch.canDo(groupId, action);
    }

    _sendModerationAction(eventType, payload) {
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) {
        rt._socket.emit(eventType, { ...payload, timestamp: Date.now() });
      }
    }

    _getMyUserId() {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('moodchat_auth');
        return raw ? JSON.parse(raw)?.user?.id : null;
      } catch (_) { return null; }
    }
  }

  // ─── SocialGraphEngine ────────────────────────────────────────────────────

  class SocialGraphEngine {
    constructor() {
      this._friends    = new Map();  // userId → { userId, online, mutualGroups, stories }
      this._mutuals    = new Map();  // groupId → Set<userId>  (friends in this group)
      this._listeners  = [];
    }

    start() {
      this._attachListeners();
      console.log('[SocialGraph] ✅ Started');
    }

    getFriendsInGroup(groupId) {
      return Array.from(this._mutuals.get(groupId) || [])
        .map(uid => this._friends.get(uid))
        .filter(Boolean);
    }

    getFriendWithStories(userId) {
      const friend = this._friends.get(String(userId));
      if (!friend) return null;
      return {
        ...friend,
        hasStories: window.__StatusStoryEngine
          ? window.__StatusStoryEngine._sequence._sequences.has(String(userId))
          : false,
      };
    }

    getAllOnlineFriends() {
      return Array.from(this._friends.values()).filter(f => f.online);
    }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    getDiagnostics() {
      return {
        friends:  this._friends.size,
        online:   this.getAllOnlineFriends().length,
        mutuals:  this._mutuals.size,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachListeners() {
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('REALTIME_friend:online',  payload => this._setOnline(payload?.userId, true));
        bus.on('REALTIME_friend:offline', payload => this._setOnline(payload?.userId, false));
      }

      // Listen to friends sync postMessage from parent shell
      window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'FRIENDS_SYNC' || e.data.type === 'FRIENDS_DATA') {
          const friends = e.data.friends || e.data.payload?.friends || [];
          for (const f of friends) {
            this._friends.set(String(f.id || f.userId), {
              userId:  String(f.id || f.userId),
              name:    f.name || f.displayName,
              online:  f.online || false,
              avatar:  f.avatar || f.profilePicture,
            });
          }
          this._notify('friends:synced', { count: friends.length });
        }
      }, { passive: true });

      // Group membership → build mutual friend graph
      window.addEventListener('kyn:group:membership_change', e => {
        const { groupId, userId } = e.detail || {};
        if (!groupId || !userId) return;
        if (this._friends.has(String(userId))) {
          if (!this._mutuals.has(groupId)) this._mutuals.set(groupId, new Set());
          this._mutuals.get(groupId).add(String(userId));
        }
      }, { passive: true });
    }

    _setOnline(userId, online) {
      if (!userId) return;
      const f = this._friends.get(String(userId));
      if (f) { f.online = online; this._notify('friend:online_change', { userId, online }); }
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
    }
  }

  // ─── Singletons ───────────────────────────────────────────────────────────

  const modEngine   = new GroupModerationEngine();
  modEngine.start();

  const socialGraph = new SocialGraphEngine();
  socialGraph.start();

  window.__GroupModerationEngine = modEngine;
  window.GroupModeration         = modEngine;
  window.__SocialGraphEngine     = socialGraph;
  window.SocialGraph             = socialGraph;

  console.log('[GroupModeration] ✅ Ready');
  console.log('[SocialGraph] ✅ Ready');
})();
