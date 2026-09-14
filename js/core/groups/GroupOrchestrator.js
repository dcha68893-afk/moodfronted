/**
 * GroupOrchestrator.js
 * Phase 4 — Distributed Group Engine (Frontend)
 */

(function () {
  'use strict';

  if (window.__GroupOrchestrator) return;

  const GROUP_ROLE = Object.freeze({
    OWNER: 5,
    ADMIN: 4,
    MODERATOR: 3,
    MEMBER: 2,
    GUEST: 1,
    RESTRICTED: 0,
    BANNED: -1,
  });

  const ROLE_NAMES = Object.fromEntries(Object.entries(GROUP_ROLE).map(([k, v]) => [v, k]));

  class GroupPermissionEngine {
    can(userRole, action) {
      const permissions = {
        send_message: GROUP_ROLE.MEMBER,
        delete_message: GROUP_ROLE.MODERATOR,
        kick_member: GROUP_ROLE.MODERATOR,
        ban_member: GROUP_ROLE.ADMIN,
        mute_member: GROUP_ROLE.MODERATOR,
        update_group: GROUP_ROLE.ADMIN,
        manage_roles: GROUP_ROLE.ADMIN,
        delete_group: GROUP_ROLE.OWNER,
        pin_message: GROUP_ROLE.MODERATOR,
        send_invite: GROUP_ROLE.MEMBER,
        approve_join: GROUP_ROLE.MODERATOR,
        make_announce: GROUP_ROLE.ADMIN,
      };
      const required = permissions[action] ?? GROUP_ROLE.MEMBER;
      return userRole >= required;
    }

    getUserRole(groupId) {
      const groups = window.__groupMembershipCache || {};
      return groups[groupId]?.role ?? GROUP_ROLE.MEMBER;
    }
  }

  class GroupStateRegistry {
    constructor() { this._groups = new Map(); }

    ensure(groupId) {
      if (!this._groups.has(groupId)) {
        this._groups.set(groupId, {
          id: groupId,
          name: null,
          members: new Map(),
          unread: 0,
          typing: new Set(),
          online: new Set(),
          lastMessageAt: null,
          joinedRoom: false,
        });
      }
      return this._groups.get(groupId);
    }

    get(groupId) { return this._groups.get(groupId) || null; }
    addMember(groupId, userId, meta = {}) {
      this.ensure(groupId).members.set(String(userId), { userId: String(userId), ...meta });
    }
    removeMember(groupId, userId) {
      const g = this._groups.get(groupId);
      if (g) g.members.delete(String(userId));
    }
    setTyping(groupId, userId, isTyping) {
      const g = this.ensure(groupId);
      if (isTyping) g.typing.add(String(userId)); else g.typing.delete(String(userId));
      return Array.from(g.typing);
    }
    setOnline(groupId, userId, isOnline) {
      const g = this.ensure(groupId);
      if (isOnline) g.online.add(String(userId)); else g.online.delete(String(userId));
    }
    incrementUnread(groupId, by = 1) { const g = this.ensure(groupId); g.unread += by; return g.unread; }
    clearUnread(groupId) { this.ensure(groupId).unread = 0; }
    all() { return Array.from(this._groups.values()); }
    size() { return this._groups.size; }
  }

  class GroupRealtimeDispatcher {
    dispatch(eventType, payload) {
      const detail = (payload && typeof payload === 'object')
        ? { ...payload, __gobEcho: true }
        : { __gobEcho: true, value: payload };

      // A group event received from the socket is already propagated by the
      // application's realtime shell to sibling iframes. Re-posting it from
      // an iframe to its parent creates an iframe -> parent -> iframe feedback
      // loop, which was the source of the Maximum call stack / repeated typing
      // dispatch failures. Keep this dispatcher local for iframe-originated
      // UI fan-out; socket-originated events remain authoritative.
      try {
        window.dispatchEvent(new CustomEvent('kyn:' + eventType, { detail }));
      } catch (_) {}

      const iframes = document.querySelectorAll('iframe');
      if (iframes.length && window === window.top) {
        const msg = { type: 'REALTIME_EVENT:' + eventType, payload: payload || {} };
        iframes.forEach(f => { try { f.contentWindow.postMessage(msg, '*'); } catch (_) {} });
      }

      const bus = window.KynectaEventBus;
      if (bus) bus.emit('REALTIME_' + eventType, payload, { async: true });
    }
  }

  class GroupSyncEngine {
    constructor(registry, dispatcher) {
      this._registry = registry;
      this._dispatcher = dispatcher;
      this._dedupIds = new Map();
      this._dedupWindowMs = 5000;
    }

    onMessage(groupId, message) {
      if (this._isDuplicate(message.id || message.localId || message.clientMessageId)) return;
      const g = this._registry.ensure(groupId);
      g.lastMessageAt = Date.now();
      const myId = this._getMyUserId();

      // Sender already has the optimistic bubble and reconciles it with the
      // REST response. Ignore that sender's group socket echo on this client.
      if (message.senderId && myId && String(message.senderId) === String(myId)) return;

      if (message.senderId) this._registry.incrementUnread(groupId);
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
      if (!member?.userId) return;
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
      if (g?.members.has(String(userId))) g.members.get(String(userId)).role = newRole;
      this._dispatcher.dispatch('group:role_update', { groupId, userId, newRole, roleName: ROLE_NAMES[newRole] });
    }
    onGroupUpdate(groupId, updates) {
      const g = this._registry.get(groupId);
      if (g && updates.name) g.name = updates.name;
      this._dispatcher.dispatch('group:update', { groupId, ...updates });
    }
    _isDuplicate(id) {
      if (!id) return false;
      const now = Date.now();
      const last = this._dedupIds.get(id);
      for (const [k, ts] of this._dedupIds) if (now - ts > this._dedupWindowMs) this._dedupIds.delete(k);
      if (last) return true;
      this._dedupIds.set(id, now);
      return false;
    }
    _getMyUserId() {
      try {
        const raw = localStorage.getItem('kynecta_auth') || localStorage.getItem('necpa_auth');
        return raw ? JSON.parse(raw)?.user?.id : null;
      } catch (_) { return null; }
    }
  }

  class GroupRecoveryEngine {
    constructor(registry, dispatcher) { this._registry = registry; this._dispatcher = dispatcher; }
    attach() {
      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', () => this._rejoinRooms());
        bus.on('SOCKET_EVENT', payload => { if (payload?.type === 'socket:reconnected') this._rejoinRooms(); });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') setTimeout(() => this._requestDeltaSync(), 500);
      });
    }
    _rejoinRooms() {
      const rt = window.KynectaRealtime;
      if (!rt) return;
      for (const g of this._registry.all()) {
        if (g.joinedRoom && rt._socket?.connected) rt._socket.emit('group:rejoin', { groupId: g.id });
      }
      this._requestDeltaSync();
    }
    _requestDeltaSync() {
      const bus = window.KynectaEventBus;
      if (bus) bus.emit('SYNC_STARTED', { reason: 'group_recovery', groups: this._registry.size() }, { async: true });
      // Do not dispatch sync_requested across frames; it is not a server event.
    }
  }

  class GroupOrchestrator {
    constructor() {
      this._registry = new GroupStateRegistry();
      this._dispatcher = new GroupRealtimeDispatcher();
      this._sync = new GroupSyncEngine(this._registry, this._dispatcher);
      this._recovery = new GroupRecoveryEngine(this._registry, this._dispatcher);
      this._perms = new GroupPermissionEngine();
      this._started = false;
    }
    start() {
      if (this._started) return;
      this._started = true;
      this._registerMissingSocketEvents();
      this._attachKynEventListeners();
      this._recovery.attach();
      console.log('[GroupOrchestrator] ✅ Started');
    }
    joinGroup(groupId) {
      const g = this._registry.ensure(groupId);
      g.joinedRoom = true;
      const rt = window.KynectaRealtime;
      if (rt?._socket?.connected) rt._socket.emit('group:join_room', { groupId });
    }
    leaveGroup(groupId) { const g = this._registry.get(groupId); if (g) g.joinedRoom = false; }
    markRead(groupId) { this._registry.clearUnread(groupId); }
    getGroup(groupId) { return this._registry.get(groupId); }
    canDo(groupId, action) { return this._perms.can(this._perms.getUserRole(groupId), action); }
    getDiagnostics() { return { groups: this._registry.size(), started: this._started }; }

    _registerMissingSocketEvents() {
      const rt = window.KynectaRealtime;
      if (!rt) { setTimeout(() => this._registerMissingSocketEvents(), 1000); return; }
      const groupEvents = [
        'group:message', 'group:reaction', 'group:reply', 'group:edit',
        'group:delete', 'group:deleted', 'group:typing', 'group:join',
        'group:leave', 'group:kick', 'group:ban', 'group:presence',
        'group:update', 'group:role_update', 'group:pin', 'group:unpin',
        'group:call', 'group:announcement', 'group:media',
        'group:membership_change', 'group:updated', 'group:read_receipt',
        'group:member_joined', 'group:member_left', 'group:created', 'group_created',
        'group:invite', 'group:invite_created', 'group:invite_received',
        'group:invite_accepted', 'group:invite_declined',
      ];
      for (const evt of groupEvents) if (typeof rt.on === 'function') {
        rt.on(evt, payload => this._handleGroupSocketEvent(evt, payload));
      }
    }

    _handleGroupSocketEvent(eventType, payload) {
      const groupId = payload?.groupId || payload?.group_id || payload?.conversationId;
      if (!groupId) return;
      switch (eventType) {
        case 'group:message': this._sync.onMessage(groupId, payload.message || payload); break;
        case 'group:reaction': this._sync.onReaction(groupId, payload); break;
        case 'group:typing': this._sync.onTyping(groupId, payload.userId, payload.isTyping !== false); break;
        case 'group:edit': this._sync.onEdit(groupId, payload.messageId, payload.newContent, payload.editedAt); break;
        case 'group:delete':
        case 'group:deleted': this._sync.onDelete(groupId, payload.messageId || payload.id, payload.deletedBy); break;
        case 'group:join':
        case 'group:member_joined':
        case 'group:membership_change':
          if (payload.action === 'joined' || !payload.action) this._sync.onMemberJoin(groupId, payload.member || payload);
          else this._sync.onMemberLeave(groupId, payload.userId, payload.reason);
          break;
        case 'group:leave':
        case 'group:member_left': this._sync.onMemberLeave(groupId, payload.userId, payload.reason); break;
        case 'group:presence': this._sync.onPresence(groupId, payload.userId, payload.online); break;
        case 'group:role_update': this._sync.onRoleUpdate(groupId, payload.userId, payload.role); break;
        case 'group:update':
        case 'group:updated': this._sync.onGroupUpdate(groupId, payload); break;
        default:
          if (eventType === 'group:created' || eventType === 'group_created') {
            const creatorId = payload.creatorId || payload.userId || (() => {
              try { const s = window.__PARENT_SESSION__ || {}; return s.userId || (s.user && s.user.id); } catch (_) { return null; }
            })();
            if (creatorId) {
              this._registry.addMember(String(groupId), String(creatorId), { userId: String(creatorId), role: 'owner', joinedAt: Date.now(), isCreator: true });
              if (!window.__groupMembershipCache) window.__groupMembershipCache = {};
              window.__groupMembershipCache[String(groupId)] = { groupId: String(groupId), userId: String(creatorId), role: 'owner', joinedAt: Date.now() };
            }
            break;
          }
          if (eventType === 'group:invite' || eventType === 'group:invite_created') {
            const inviteId = payload.inviteId || ('inv_' + Date.now());
            const invite = { ...payload, inviteId, receivedAt: Date.now() };
            try {
              const stored = JSON.parse(localStorage.getItem('necpa_group_invites_v1') || '{}');
              stored[inviteId] = invite;
              localStorage.setItem('necpa_group_invites_v1', JSON.stringify(stored));
            } catch (_) {}
            this._dispatcher.dispatch('group:invite_received', invite);
            break;
          }
          if (eventType === 'group:invite_accepted') {
            this._sync.onMemberJoin(groupId, payload.member || { userId: payload.userId, role: 'member' });
            break;
          }
          this._dispatcher.dispatch(eventType, payload);
      }
    }

    _attachKynEventListeners() {
      const groupEvents = [
        'group:message', 'group:reaction', 'group:typing', 'group:edit',
        'group:delete', 'group:join', 'group:leave', 'group:kick',
        'group:ban', 'group:presence', 'group:update', 'group:role_update',
        'group:membership_change', 'group:updated',
      ];
      for (const evt of groupEvents) {
        window.addEventListener('kyn:' + evt, e => {
          const payload = e.detail || {};
          if (payload.__gobEcho) return;
          const groupId = payload.groupId || payload.group_id;
          if (!groupId) return;
          this._handleGroupSocketEvent(evt, payload);
        }, { passive: true });
      }
    }
  }

  const orchestrator = new GroupOrchestrator();
  const tryStart = () => { if (window.KynectaRealtime) orchestrator.start(); else setTimeout(tryStart, 500); };
  tryStart();
  window.__GroupOrchestrator = orchestrator;
  window.GroupOrchestrator = orchestrator;
  window.GROUP_ROLE = GROUP_ROLE;
  console.log('[GroupOrchestrator] ✅ Ready');
})();