/**
 * GroupOrchestrator.js
 * Phase 4 — Distributed Group Engine (Frontend)
 *
 * Integrates with existing architecture:
 *  - Listens to `kyn:group:*` CustomEvents (dispatched by app.realtime.socket.js
 *    for all group: socket events via the _routeMessage → kyn: dispatch path)
 *  - Posts `REALTIME_EVENT:group:*` postMessages for cross-iframe fan-out
 *    (chat.html parent shell fans out to all sibling iframes automatically)
 *  - Registers group/status socket events that are missing from the existing
 *    `allEvents` array by hooking into KynectaRealtime.on('*')
 *
 * HTML pages load this via phase4.bootstrap.js injected before </body>.
 * Runs in BOTH the parent shell (chat.html) and iframes (group.html, etc.)
 *
 * @version 4.0.0
 * @phase 4 — Group + Social Engine
 */

(function () {
  'use strict';

  if (window.__GroupOrchestrator) return;

  // ─── Group Role Hierarchy ─────────────────────────────────────────────────

  const GROUP_ROLE = Object.freeze({
    OWNER:      5,
    ADMIN:      4,
    MODERATOR:  3,
    MEMBER:     2,
    GUEST:      1,
    RESTRICTED: 0,
    BANNED:     -1,
  });

  const ROLE_NAMES = Object.fromEntries(Object.entries(GROUP_ROLE).map(([k, v]) => [v, k]));

  // ─── GroupPermissionEngine ────────────────────────────────────────────────

  class GroupPermissionEngine {
    can(userRole, action) {
      const permissions = {
        send_message:   GROUP_ROLE.MEMBER,
        delete_message: GROUP_ROLE.MODERATOR,
        kick_member:    GROUP_ROLE.MODERATOR,
        ban_member:     GROUP_ROLE.ADMIN,
        mute_member:    GROUP_ROLE.MODERATOR,
        update_group:   GROUP_ROLE.ADMIN,
        manage_roles:   GROUP_ROLE.ADMIN,
        delete_group:   GROUP_ROLE.OWNER,
        pin_message:    GROUP_ROLE.MODERATOR,
        send_invite:    GROUP_ROLE.MEMBER,
        approve_join:   GROUP_ROLE.MODERATOR,
        make_announce:  GROUP_ROLE.ADMIN,
      };
      const required = permissions[action] ?? GROUP_ROLE.MEMBER;
      return userRole >= required;
    }

    getUserRole(groupId) {
      const groups = window.__groupMembershipCache || {};
      return groups[groupId]?.role ?? GROUP_ROLE.MEMBER;
    }
  }

  // ─── GroupStateRegistry ───────────────────────────────────────────────────

  class GroupStateRegistry {
    constructor() {
      // groupId → { id, name, members: Map, unread, typing: Set, online: Set, lastMessageAt }
      this._groups = new Map();
    }

    ensure(groupId) {
      if (!this._groups.has(groupId)) {
        this._groups.set(groupId, {
          id:            groupId,
          name:          null,
          members:       new Map(),
          unread:        0,
          typing:        new Set(),
          online:        new Set(),
          lastMessageAt: null,
          joinedRoom:    false,
        });
      }
      return this._groups.get(groupId);
    }

    get(groupId) { return this._groups.get(groupId) || null; }

    addMember(groupId, userId, meta = {}) {
      const g = this.ensure(groupId);
      g.members.set(String(userId), { userId: String(userId), ...meta });
    }

    removeMember(groupId, userId) {
      const g = this._groups.get(groupId);
      if (g) g.members.delete(String(userId));
    }

    setTyping(groupId, userId, isTyping) {
      const g = this.ensure(groupId);
      if (isTyping) g.typing.add(String(userId));
      else g.typing.delete(String(userId));
      return Array.from(g.typing);
    }

    setOnline(groupId, userId, isOnline) {
      const g = this.ensure(groupId);
      if (isOnline) g.online.add(String(userId));
      else g.online.delete(String(userId));
    }

    incrementUnread(groupId, by = 1) {
      const g = this.ensure(groupId);
      g.unread += by;
      return g.unread;
    }

    clearUnread(groupId) {
      const g = this.ensure(groupId);
      if (g) g.unread = 0;
    }

    all() { return Array.from(this._groups.values()); }
    size() { return this._groups.size; }
  }

  // ─── GroupRealtimeDispatcher ──────────────────────────────────────────────

  class GroupRealtimeDispatcher {
    /**
     * Broadcast a group event to all iframes + EventBus + kyn: CustomEvent.
     * Uses the same postMessage pattern as app.realtime.socket.js.
     */
    dispatch(eventType, payload) {
      // 1. kyn: CustomEvent (for same-frame listeners like group.html)
      try {
        window.dispatchEvent(new CustomEvent('kyn:' + eventType, { detail: payload }));
      } catch (_) {}

      // 2. REALTIME_EVENT postMessage to all iframes (same as existing socket bridge)
      const iframes = document.querySelectorAll('iframe');
      if (iframes.length) {
        const msg = { type: 'REALTIME_EVENT:' + eventType, payload: payload || {} };
        iframes.forEach(f => {
          try { f.contentWindow.postMessage(msg, '*'); } catch (_) {}
        });
      }

      // 3. Post to parent if we're inside an iframe
      if (window !== window.top) {
        try { window.parent.postMessage({ type: 'REALTIME_EVENT:' + eventType, payload }, '*'); } catch (_) {}
      }

      // 4. KynectaEventBus
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('REALTIME_' + eventType, payload, { async: true });
    }
  }

  // ─── GroupSyncEngine ──────────────────────────────────────────────────────

  class GroupSyncEngine {
    constructor(registry, dispatcher) {
      this._registry   = registry;
      this._dispatcher = dispatcher;
      this._dedupIds   = new Map(); // messageId → ts
      this._dedupWindowMs = 5000;
    }

    onMessage(groupId, message) {
      if (this._isDuplicate(message.id || message.localId)) return;
      const g = this._registry.ensure(groupId);
      g.lastMessageAt = Date.now();
      const myId = this._getMyUserId();
      if (message.senderId && String(message.senderId) !== String(myId)) {
        this._registry.incrementUnread(groupId);
      }
      this._dispatcher.dispatch('group:message', { groupId, message });
    }

    onReaction(groupId, reaction) {
      if (this._isDuplicate(`react:${reaction.messageId}:${reaction.userId}:${reaction.emoji}`)) return;
      this._dispatcher.dispatch('group:reaction', { groupId, reaction });
    }

    onTyping(groupId, userId, isTyping) {
      const typingUsers = this._registry.setTyping(groupId, userId, isTyping);
      this._dispatcher.dispatch('group:typing', { groupId, userId, isTyping, typingUsers });
    }

    onPresence(groupId, userId, isOnline) {
      this._registry.setOnline(groupId, userId, isOnline);
      this._dispatcher.dispatch('group:presence', { groupId, userId, online: isOnline });
    }

    onMemberJoin(groupId, member) {
      this._registry.addMember(groupId, member.userId, member);
      this._dispatcher.dispatch('group:join', { groupId, member });
    }

    onMemberLeave(groupId, userId, reason) {
      this._registry.removeMember(groupId, userId);
      this._dispatcher.dispatch('group:leave', { groupId, userId, reason });
    }

    onEdit(groupId, messageId, newContent, editedAt) {
      this._dispatcher.dispatch('group:edit', { groupId, messageId, newContent, editedAt });
    }

    onDelete(groupId, messageId, deletedBy) {
      window.__PersistenceStabilizationLayer?.markDeleted('message', messageId);
      this._dispatcher.dispatch('group:delete', { groupId, messageId, deletedBy });
    }

    onRoleUpdate(groupId, userId, newRole) {
      const g = this._registry.get(groupId);
      if (g?.members.has(String(userId))) {
        g.members.get(String(userId)).role = newRole;
      }
      this._dispatcher.dispatch('group:role_update', { groupId, userId, newRole, roleName: ROLE_NAMES[newRole] });
    }

    onGroupUpdate(groupId, updates) {
      const g = this._registry.get(groupId);
      if (g && updates.name) g.name = updates.name;
      this._dispatcher.dispatch('group:update', { groupId, ...updates });
    }

    _isDuplicate(id) {
      if (!id) return false;
      const now  = Date.now();
      const last = this._dedupIds.get(id);
      for (const [k, ts] of this._dedupIds) {
        if (now - ts > this._dedupWindowMs) this._dedupIds.delete(k);
      }
      if (last) return true;
      this._dedupIds.set(id, now);
      return false;
    }

    _getMyUserId() {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('moodchat_auth');
        return raw ? JSON.parse(raw)?.user?.id : null;
      } catch (_) { return null; }
    }
  }

  // ─── GroupRecoveryEngine ──────────────────────────────────────────────────

  class GroupRecoveryEngine {
    constructor(registry, dispatcher) {
      this._registry   = registry;
      this._dispatcher = dispatcher;
    }

    attach() {
      // Reconnect — re-join all known group rooms
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => this._rejoinRooms());
        bus.on('SOCKET_EVENT', payload => {
          if (payload?.type === 'socket:reconnected') this._rejoinRooms();
        });
      }

      // Hidden-tab recovery
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          setTimeout(() => this._requestDeltaSync(), 500);
        }
      });
    }

    _rejoinRooms() {
      const rt = window.KynectaRealtime;
      if (!rt) return;
      for (const g of this._registry.all()) {
        if (g.joinedRoom) {
          // Re-announce membership so server re-adds socket to group room
          const socket = rt._socket;
          if (socket?.connected) {
            socket.emit('group:rejoin', { groupId: g.id });
          }
        }
      }
      this._requestDeltaSync();
    }

    _requestDeltaSync() {
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.emit('SYNC_STARTED', { reason: 'group_recovery', groups: this._registry.size() }, { async: true });
      }
      this._dispatcher.dispatch('group:sync_requested', { ts: Date.now() });
    }
  }

  // ─── GroupOrchestrator (main) ─────────────────────────────────────────────

  class GroupOrchestrator {
    constructor() {
      this._registry   = new GroupStateRegistry();
      this._dispatcher = new GroupRealtimeDispatcher();
      this._sync       = new GroupSyncEngine(this._registry, this._dispatcher);
      this._recovery   = new GroupRecoveryEngine(this._registry, this._dispatcher);
      this._perms      = new GroupPermissionEngine();
      this._started    = false;
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._registerMissingSocketEvents();
      this._attachKynEventListeners();
      this._recovery.attach();
      console.log('[GroupOrchestrator] ✅ Started');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    joinGroup(groupId) {
      const g = this._registry.ensure(groupId);
      g.joinedRoom = true;
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) {
        rt._socket.emit('group:join_room', { groupId });
      }
    }

    leaveGroup(groupId) {
      const g = this._registry.get(groupId);
      if (g) g.joinedRoom = false;
    }

    markRead(groupId) { this._registry.clearUnread(groupId); }
    getGroup(groupId) { return this._registry.get(groupId); }
    canDo(groupId, action) {
      return this._perms.can(this._perms.getUserRole(groupId), action);
    }

    getDiagnostics() {
      return {
        groups:  this._registry.size(),
        started: this._started,
      };
    }

    // ── Private — Register missing socket events ──────────────────────────

    _registerMissingSocketEvents() {
      // The existing allEvents array is missing group: and status: events.
      // We add them here via KynectaRealtime.on() without touching app.realtime.socket.js.
      const rt = window.KynectaRealtime;
      if (!rt) {
        setTimeout(() => this._registerMissingSocketEvents(), 1000);
        return;
      }

      const groupEvents = [
        'group:message', 'group:reaction', 'group:reply', 'group:edit',
        'group:delete', 'group:deleted', 'group:typing', 'group:join',
        'group:leave', 'group:kick', 'group:ban', 'group:presence',
        'group:update', 'group:role_update', 'group:pin', 'group:unpin',
        'group:call', 'group:announcement', 'group:media',
        'group:membership_change', 'group:updated',
        'group:read_receipt', 'group:member_joined', 'group:member_left',
        // FIX #11 — group creation event so creator is auto-inserted as owner
        'group:created', 'group_created',
        // FIX #12 — invite lifecycle events
        'group:invite', 'group:invite_created', 'group:invite_received',
        'group:invite_accepted', 'group:invite_declined',
      ];

      for (const evt of groupEvents) {
        if (rt.on && typeof rt.on === 'function') {
          rt.on(evt, (payload) => this._handleGroupSocketEvent(evt, payload));
        }
      }

      // Also listen via the wildcard if available
      if (rt.on) {
        rt.on('*', (payload, raw) => {
          const type = raw?.type || payload?.type;
          if (type?.startsWith('group:')) {
            this._handleGroupSocketEvent(type, payload);
          }
        });
      }
    }

    _handleGroupSocketEvent(eventType, payload) {
      const groupId = payload?.groupId || payload?.group_id || payload?.conversationId;
      if (!groupId) return;

      switch (eventType) {
        case 'group:message':
          this._sync.onMessage(groupId, payload.message || payload);
          break;
        case 'group:reaction':
          this._sync.onReaction(groupId, payload);
          break;
        case 'group:typing':
          this._sync.onTyping(groupId, payload.userId, payload.isTyping !== false);
          break;
        case 'group:edit':
          this._sync.onEdit(groupId, payload.messageId, payload.newContent, payload.editedAt);
          break;
        case 'group:delete':
        case 'group:deleted':
          this._sync.onDelete(groupId, payload.messageId || payload.id, payload.deletedBy);
          break;
        case 'group:join':
        case 'group:member_joined':
        case 'group:membership_change':
          if (payload.action === 'joined' || !payload.action) {
            this._sync.onMemberJoin(groupId, payload.member || payload);
          } else {
            this._sync.onMemberLeave(groupId, payload.userId, payload.reason);
          }
          break;
        case 'group:leave':
        case 'group:member_left':
          this._sync.onMemberLeave(groupId, payload.userId, payload.reason);
          break;
        case 'group:presence':
          this._sync.onPresence(groupId, payload.userId, payload.online);
          break;
        case 'group:role_update':
          this._sync.onRoleUpdate(groupId, payload.userId, payload.role);
          break;
        case 'group:update':
        case 'group:updated':
          this._sync.onGroupUpdate(groupId, payload);
          break;
        default:
          // FIX #11 — group:created: ensure creator is owner+member immediately
          if (eventType === 'group:created' || eventType === 'group_created') {
            const gId = groupId;
            const creatorId = payload.creatorId || payload.userId ||
              (() => { try { const s = window.__PARENT_SESSION__ || {}; return s.userId || (s.user && s.user.id); } catch(_){return null;} })();
            if (gId && creatorId) {
              this._registry.addMember(String(gId), String(creatorId), {
                userId: String(creatorId), role: 'owner', joinedAt: Date.now(), isCreator: true
              });
              if (!window.__groupMembershipCache) window.__groupMembershipCache = {};
              window.__groupMembershipCache[String(gId)] = { groupId: String(gId), userId: String(creatorId), role: 'owner', joinedAt: Date.now() };
              this._dispatcher.dispatch('group:membership_change', { groupId: gId, userId: creatorId, role: 'owner', action: 'joined' });
              console.log('[GroupOrchestrator] FIX#11 — Creator', creatorId, 'added as owner of group', gId);
            }
            break;
          }

          // FIX #12 — group invites: persist and dispatch
          if (eventType === 'group:invite' || eventType === 'group:invite_created') {
            const inviteId = payload.inviteId || ('inv_' + Date.now());
            const invite = { ...payload, inviteId, receivedAt: Date.now() };
            try {
              const stored = JSON.parse(localStorage.getItem('moodchat_group_invites_v1') || '{}');
              stored[inviteId] = invite;
              localStorage.setItem('moodchat_group_invites_v1', JSON.stringify(stored));
            } catch (_) {}
            this._dispatcher.dispatch('group:invite_received', invite);
            break;
          }

          if (eventType === 'group:invite_accepted') {
            this._sync.onMemberJoin(groupId, payload.member || { userId: payload.userId, role: 'member' });
            break;
          }

          // Fan out any other group event
          this._dispatcher.dispatch(eventType, payload);
      }
    }

    _attachKynEventListeners() {
      // Listen to kyn: events already dispatched by existing socket layer
      // (app.realtime.socket.js dispatches kyn:group:* for group: events)
      const groupEvents = [
        'group:message', 'group:reaction', 'group:typing', 'group:edit',
        'group:delete', 'group:join', 'group:leave', 'group:kick',
        'group:ban', 'group:presence', 'group:update', 'group:role_update',
        'group:membership_change', 'group:updated',
      ];

      for (const evt of groupEvents) {
        window.addEventListener('kyn:' + evt, e => {
          // Avoid double-processing from _registerMissingSocketEvents
          const payload = e.detail || {};
          const groupId = payload.groupId || payload.group_id;
          if (!groupId) return;
          this._handleGroupSocketEvent(evt, payload);
        }, { passive: true });
      }
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const orchestrator = new GroupOrchestrator();

  const tryStart = () => {
    if (window.KynectaRealtime) {
      orchestrator.start();
    } else {
      setTimeout(tryStart, 500);
    }
  };
  tryStart();

  window.__GroupOrchestrator = orchestrator;
  window.GroupOrchestrator   = orchestrator;
  window.GROUP_ROLE          = GROUP_ROLE;

  console.log('[GroupOrchestrator] ✅ Ready');
})();