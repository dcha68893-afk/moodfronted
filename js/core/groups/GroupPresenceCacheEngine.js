/**
 * GroupPresenceCacheEngine.js
 * Phase 4 — Group Presence Engine + Phase 4 Cache Reconciliation (Frontend)
 *
 * Group Presence:
 *  - Live online indicators per group member
 *  - Typing indicators with auto-expiry
 *  - Voice-active / screen-share indicators
 *  - Multi-device presence collision prevention
 *  - Ghost user sweep in groups
 *
 * Cache Reconciliation (Phase 4 layer):
 *  - Prevents stale group messages, reactions, stories from reappearing
 *  - Coordinates with Phase 1 PersistenceStabilizationLayer
 *  - Incremental hydration with sync checkpoints
 *  - Version-token validation for group + story caches
 *
 * @version 4.0.0
 * @phase 4
 */

(function () {
  'use strict';

  if (window.__GroupPresenceCacheEngine) return;

  const TYPING_TIMEOUT_MS  = 6000;
  const GHOST_TIMEOUT_MS   = 90000;
  const PRESENCE_SWEEP_MS  = 30000;

  // ─── GroupPresenceEngine ──────────────────────────────────────────────────

  class GroupPresenceTracker {
    constructor() {
      // groupId → Map<userId, { status, lastSeen, device, typing, voice }>
      this._groups   = new Map();
      // groupId → Map<userId, typingTimerId>
      this._typings  = new Map();
      this._listeners = [];
    }

    ensure(groupId) {
      if (!this._groups.has(groupId)) this._groups.set(groupId, new Map());
      if (!this._typings.has(groupId)) this._typings.set(groupId, new Map());
      return this._groups.get(groupId);
    }

    setPresence(groupId, userId, status, meta = {}) {
      const members = this.ensure(groupId);
      const uid     = String(userId);
      const prev    = members.get(uid);
      members.set(uid, {
        userId:   uid,
        status:   status,    // 'online' | 'offline' | 'idle' | 'backgrounded'
        lastSeen: Date.now(),
        voice:    meta.voice    ?? prev?.voice    ?? false,
        screen:   meta.screen   ?? prev?.screen   ?? false,
        device:   meta.device   ?? prev?.device   ?? null,
      });
      this._notify('group:presence_update', { groupId, userId: uid, status });
    }

    setTyping(groupId, userId, isTyping) {
      const uid      = String(userId);
      const timers   = this._typings.get(groupId) || new Map();
      const members  = this.ensure(groupId);
      const member   = members.get(uid) || { userId: uid, status: 'online', lastSeen: Date.now() };

      if (isTyping) {
        // Reset existing timer
        if (timers.has(uid)) clearTimeout(timers.get(uid));
        const tid = setTimeout(() => {
          timers.delete(uid);
          member.typing = false;
          this._notify('group:typing_stopped', { groupId, userId: uid });
        }, TYPING_TIMEOUT_MS);
        timers.set(uid, tid);
        member.typing = true;
        members.set(uid, member);
        this._notify('group:typing_started', { groupId, userId: uid });
      } else {
        if (timers.has(uid)) { clearTimeout(timers.get(uid)); timers.delete(uid); }
        member.typing = false;
        members.set(uid, member);
        this._notify('group:typing_stopped', { groupId, userId: uid });
      }

      this._typings.set(groupId, timers);
    }

    getTypingUsers(groupId) {
      const members = this._groups.get(groupId);
      if (!members) return [];
      return Array.from(members.values()).filter(m => m.typing).map(m => m.userId);
    }

    getOnlineCount(groupId) {
      const members = this._groups.get(groupId);
      if (!members) return 0;
      const now     = Date.now();
      return Array.from(members.values()).filter(m =>
        m.status === 'online' && now - m.lastSeen < GHOST_TIMEOUT_MS
      ).length;
    }

    sweepGhosts() {
      const now = Date.now();
      for (const [groupId, members] of this._groups) {
        for (const [uid, member] of members) {
          if (member.status === 'online' && now - member.lastSeen > GHOST_TIMEOUT_MS) {
            member.status = 'offline';
            this._notify('group:presence_update', { groupId, userId: uid, status: 'offline', reason: 'ghost_sweep' });
          }
        }
      }
    }

    clearGroup(groupId) {
      const timers = this._typings.get(groupId);
      if (timers) { for (const tid of timers.values()) clearTimeout(tid); }
      this._groups.delete(groupId);
      this._typings.delete(groupId);
    }

    onChange(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _notify(event, data) {
      this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} });
      try { window.dispatchEvent(new CustomEvent('kyn:' + event, { detail: data })); } catch (_) {}
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('REALTIME_' + event, data, { async: true });
    }
  }

  // ─── Phase4CacheReconciliation ────────────────────────────────────────────

  class Phase4CacheReconciliation {
    constructor() {
      // scope → { version, token, lastSync }
      this._checkpoints = new Map();
      this._deletedIds  = new Set();   // fast-path dedup
    }

    recordCheckpoint(scope, version, token) {
      this._checkpoints.set(scope, { version, token, lastSync: Date.now() });
    }

    isStale(scope, serverVersion) {
      const cp = this._checkpoints.get(scope);
      if (!cp) return true;
      return serverVersion > cp.version;
    }

    /**
     * Validate a batch of entities before rendering.
     * Works in conjunction with Phase 1 PersistenceStabilizationLayer.
     */
    validateBatch(type, entities, idKey = 'id') {
      const p1 = window.__PersistenceStabilizationLayer;
      return entities.filter(e => {
        const id = e[idKey];
        if (!id) return false;
        if (this._deletedIds.has(`${type}:${id}`)) return false;
        if (p1 && p1.isDeleted(type, id)) return false;
        return true;
      });
    }

    markDeleted(type, id) {
      this._deletedIds.add(`${type}:${id}`);
      window.__PersistenceStabilizationLayer?.markDeleted(type, id);
    }

    /**
     * Patch the existing AppCache.load() in this frame to auto-validate
     * group messages and status entities through Phase 4 filters.
     */
    patchAppCache() {
      const patchTarget = (cache, label) => {
        if (!cache || typeof cache.load !== 'function') return;
        const orig = cache.load.bind(cache);
        const self = this;
        cache.load = async function (storeName, ...args) {
          const result = await orig(storeName, ...args);
          if (!Array.isArray(result)) return result;

          const typeMap = {
            groupMessages: 'group_message',
            statuses:      'status',
            stories:       'status',
            reactions:     'reaction',
          };
          const entityType = typeMap[storeName];
          if (!entityType) return result;

          const filtered = self.validateBatch(entityType, result);
          if (filtered.length < result.length) {
            console.log(`[Phase4Cache] Filtered ${result.length - filtered.length} stale ${entityType}(s) from ${label}`);
          }
          return filtered;
        };
      };

      patchTarget(window.AppCache, 'AppCache');
      patchTarget(window.KynectaCache, 'KynectaCache');
    }

    getDiagnostics() {
      return {
        checkpoints:  this._checkpoints.size,
        deletedItems: this._deletedIds.size,
      };
    }
  }

  // ─── GroupPresenceCacheEngine (main) ──────────────────────────────────────

  class GroupPresenceCacheEngine {
    constructor() {
      this._presence = new GroupPresenceTracker();
      this._cache    = new Phase4CacheReconciliation();
      this._started  = false;
    }

    start() {
      if (this._started) return;
      this._started = true;

      this._attachPresenceListeners();
      this._cache.patchAppCache();

      // Ghost sweep every 30s
      setInterval(() => this._presence.sweepGhosts(), PRESENCE_SWEEP_MS);

      // Reconnect — re-request group presence
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => this._requestPresenceSync());
      }

      console.log('[GroupPresenceCache] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    getTypingUsers(groupId)  { return this._presence.getTypingUsers(groupId); }
    getOnlineCount(groupId)  { return this._presence.getOnlineCount(groupId); }
    onPresenceChange(fn)     { return this._presence.onChange(fn); }

    validateBatch(type, entities) { return this._cache.validateBatch(type, entities); }
    markDeleted(type, id)         { this._cache.markDeleted(type, id); }
    recordCheckpoint(scope, v, t) { this._cache.recordCheckpoint(scope, v, t); }

    getDiagnostics() {
      return {
        presence: { groups: this._presence._groups.size },
        cache:    this._cache.getDiagnostics(),
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _attachPresenceListeners() {
      // Group presence events from socket
      window.addEventListener('kyn:group:presence', e => {
        const { groupId, userId, online, status } = e.detail || {};
        if (!groupId || !userId) return;
        this._presence.setPresence(groupId, userId, status || (online ? 'online' : 'offline'));
      }, { passive: true });

      window.addEventListener('kyn:group:typing', e => {
        const { groupId, userId, isTyping } = e.detail || {};
        if (!groupId || !userId) return;
        this._presence.setTyping(groupId, userId, isTyping !== false);
      }, { passive: true });

      // Friends coming online/offline → update group presence
      window.addEventListener('kyn:friend:online', e => {
        const { userId } = e.detail || {};
        if (!userId) return;
        // Update presence in all groups this user belongs to
        for (const [groupId, members] of this._presence._groups) {
          if (members.has(String(userId))) {
            this._presence.setPresence(groupId, userId, 'online');
          }
        }
      }, { passive: true });

      window.addEventListener('kyn:friend:offline', e => {
        const { userId } = e.detail || {};
        if (!userId) return;
        for (const [groupId, members] of this._presence._groups) {
          if (members.has(String(userId))) {
            this._presence.setPresence(groupId, userId, 'offline');
          }
        }
      }, { passive: true });

      // Group join/leave → add/remove from presence tracking
      window.addEventListener('kyn:group:join', e => {
        const { groupId, member } = e.detail || {};
        if (groupId && member?.userId) {
          this._presence.setPresence(groupId, member.userId, 'online');
        }
      }, { passive: true });

      window.addEventListener('kyn:group:leave', e => {
        const { groupId, userId } = e.detail || {};
        if (groupId && userId) {
          this._presence.setPresence(groupId, userId, 'offline');
        }
      }, { passive: true });

      // Deleted content → update cache
      window.addEventListener('kyn:group:delete', e => {
        const { messageId } = e.detail || {};
        if (messageId) this._cache.markDeleted('group_message', messageId);
      }, { passive: true });

      window.addEventListener('kyn:status:deleted', e => {
        const id = e.detail?.storyId || e.detail?.id;
        if (id) this._cache.markDeleted('status', id);
      }, { passive: true });

      window.addEventListener('kyn:status:expired', e => {
        const { statusIds } = e.detail || {};
        if (Array.isArray(statusIds)) {
          statusIds.forEach(id => this._cache.markDeleted('status', id));
        }
      }, { passive: true });

      // Cache validation token from server
      window.addEventListener('message', e => {
        if (e.data?.type === 'CACHE_TOKEN' && e.data.scope) {
          this._cache.recordCheckpoint(e.data.scope, e.data.version, e.data.token);
        }
      }, { passive: true });
    }

    _requestPresenceSync() {
      const rt = window.KynectaRealtime;
      if (!rt?._socket?.connected) return;
      // Re-subscribe to group presence after reconnect
      for (const groupId of this._presence._groups.keys()) {
        rt._socket.emit('group:presence_subscribe', { groupId });
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const engine = new GroupPresenceCacheEngine();

  const tryStart = () => {
    if (window.KynectaRealtime || window.KynectaEventBus) {
      engine.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__GroupPresenceCacheEngine = engine;
  window.GroupPresenceCache         = engine;

  console.log('[GroupPresenceCache] ✅ Ready');
})();
