/**
 * app.core.store.js  (Offline-First Edition v2.2)
 * Immutable state management with reactive updates.
 * UI always reads from this store; writes flow through localStore first.
 *
 * FIXES applied v2.2:
 *   ✅  Full group management with byId, list, myGroups, joinedGroups, adminGroups
 *   ✅  Group members, messages, invites, pendingQueue support
 *   ✅  loadGroupsFromLocal() — IDB + localStorage bootstrap
 *   ✅  upsertGroup() — central write path with LocalGroupStore persistence
 *   ✅  removeGroupFromStore() — full cleanup from all collections
 *   ✅  upsertGroupMember() / removeGroupMember() — member management
 *   ✅  loadGroupMessages() / upsertGroupMessage() — message handling
 *   ✅  setGroupSyncState() — UI loading/pending/error states
 *   ✅  Event listeners for groupSync:* and kyn:group* events
 *
 * @version 2.2.0
 */

(function () {
    'use strict';

    const STORE_CONFIG = {
        maxHistoryPerKey: 50,
        debug: false,
        persistKeys: ['user', 'session', 'settings', 'theme'],
        persistDebounce: 500
    };

    const STORE_SCHEMA = {
        user: {
            id: null, username: null, displayName: null, email: null,
            phone: null, photoURL: null, status: null, lastSeen: null,
            online: false, settings: {}
        },
        session: {
            authenticated: false, token: null, refreshToken: null,
            expiresAt: null, userId: null
        },
        messages: {
            byId: {},
            byChat: {},
            unread: {},
            typing: {},
            drafts: {}
        },
        friends: {
            byId: {}, list: [], online: [],  // Set → Array for JSON-serialisability
            requests: [], blocked: []
        },
        groups: {
            byId: {},
            list: [],
            myGroups: [],
            joinedGroups: [],
            adminGroups: [],
            members: {},
            messages: {},
            invites: [],
            pendingQueue: [],
            syncState: {
                syncing: false,
                lastSync: 0,
                pendingCount: 0,
                failedIds: []
            },
            lastSync: 0
        },
        calls: {
            active: null, history: [], missed: [], ringing: null
        },
        status: { byId: {}, list: [], viewed: {} },
        settings: {
            theme: 'light',
            fontSize: 16,
            notifications: true,
            soundEnabled: true,
            language: 'en',
            wallpaper: null,
            privacy: {},
            accentColor: '#4F46E5',
            reduceMotion: false,
            syncEnabled: true
        },
        ui: {
            currentPage: 'messages', modals: {}, loading: {}, notifications: []
        },
        sync: {
            lastSync: 0, syncing: false, pending: [], failed: []
        },
        network: {
            online: navigator.onLine, connectionType: null, latency: null
        }
    };

    // ─── Keys ─────────────────────────────────────────────────────────────────────
    const LS_CANONICAL = 'knecta_settings_cache';   // LocalStoreSettings key
    const LS_STORE_PFX = 'kynecta_store_';           // KynectaStore persist prefix
    const LS_GROUPS_BOOTSTRAP = 'kynecta_groups_bootstrap';

    class KynectaStore {
        constructor() {
            this._state               = this._createInitialState();
            this._subscribers         = new Map();
            this._wildcardSubscribers = new Set();
            this._history             = new Map();
            this._config              = { ...STORE_CONFIG };
            this._batchTimeout        = null;
            this._persistTimeout      = null;
            this._localStoreUnsub     = null;
            this._stats = { updates: 0, gets: 0, subscriptions: 0, rollbacks: 0 };

            this._hydrateStoreFromLocal();   // NEW: fast boot from all kynecta_*_cache keys
            this._loadPersistedState();
            this._setupOfflineFirstListeners();
            this._setupStorePersistence();   // NEW: debounced write-back on every store change
            this._subscribeToLocalStore();

            // Load groups on boot (async)
            this.loadGroupsFromLocal();

            window.KynectaStore = this;
            console.log('[Store] ✅ Initialized (offline-first v2.2)');
        }

        // ── PUBLIC API ───────────────────────────────────────────────────────────

        get(keyPath, defaultValue = null) {
            this._stats.gets++;
            if (!keyPath) return this._state;
            const keys = keyPath.split('.');
            let value = this._state;
            for (const key of keys) {
                if (value === null || value === undefined) return defaultValue;
                value = value[key];
            }
            return value !== undefined ? value : defaultValue;
        }

        set(keyPath, value, options = {}) {
            if (!keyPath) return false;
            const oldValue = this.get(keyPath);
            if (JSON.stringify(oldValue) === JSON.stringify(value)) return true;

            if (options.history !== false) this._recordHistory(keyPath, oldValue);

            const newState = this._setImmutable(this._state, keyPath.split('.'), value);
            if (!newState) return false;

            this._state = newState;
            this._stats.updates++;

            const shouldPersist = options.persist ||
                this._config.persistKeys.some(k => keyPath.startsWith(k));
            if (shouldPersist) this._schedulePersistence();

            if (!options.silent) this._notifySubscribers(keyPath, value, oldValue);
            return true;
        }

        update(keyPath, updater, options = {}) {
            const current  = this.get(keyPath);
            const newValue = updater(current);
            this.set(keyPath, newValue, options);
            return newValue;
        }

        batch(batchFn) {
            return new Promise((resolve) => {
                if (this._batchTimeout) clearTimeout(this._batchTimeout);
                const batch = {
                    updates: [],
                    set:    (k, v)  => batch.updates.push({ keyPath: k, value: v }),
                    update: (k, fn) => batch.updates.push({ keyPath: k, value: fn(this.get(k)) })
                };
                batchFn(batch);
                this._batchTimeout = setTimeout(() => { this._applyBatch(batch.updates); resolve(); }, 0);
            });
        }

        subscribe(keyPath, callback) {
            if (keyPath === '*') {
                this._wildcardSubscribers.add(callback);
                this._stats.subscriptions++;
                return () => this._wildcardSubscribers.delete(callback);
            }
            if (!this._subscribers.has(keyPath)) this._subscribers.set(keyPath, new Set());
            this._subscribers.get(keyPath).add(callback);
            this._stats.subscriptions++;
            return () => {
                const subs = this._subscribers.get(keyPath);
                if (subs) { subs.delete(callback); if (!subs.size) this._subscribers.delete(keyPath); }
            };
        }

        select(selector, callback) {
            let lastValue = selector(this._state);
            const unsub = this.subscribe('*', () => {
                const newValue = selector(this._state);
                if (JSON.stringify(lastValue) !== JSON.stringify(newValue)) {
                    callback(newValue, lastValue);
                    lastValue = newValue;
                }
            });
            callback(lastValue);
            return unsub;
        }

        getState() { return this._deepFreeze({ ...this._state }); }

        reset(keys = null) {
            const initial = this._createInitialState();
            if (keys) {
                keys.forEach(key => { if (key in initial) this.set(key, initial[key]); });
            } else {
                this._state = initial;
                this._notifySubscribers('*', this._state, null);
            }
        }

        getHistory(keyPath, limit = 10) {
            return (this._history.get(keyPath) || []).slice(-limit);
        }

        rollback(keyPath, steps = 1) {
            const history = this._history.get(keyPath) || [];
            if (history.length < steps) return false;
            const targetIndex = history.length - steps;
            this.set(keyPath, history[targetIndex]);
            this._stats.rollbacks++;
            this._history.set(keyPath, history.slice(0, targetIndex));
            return true;
        }

        getStats() {
            return {
                ...this._stats,
                subscribersByPath: Array.from(this._subscribers.entries())
                    .map(([path, set]) => ({ path, count: set.size })),
                wildcardSubscribers: this._wildcardSubscribers.size,
                historySize: Array.from(this._history.values())
                    .reduce((acc, arr) => acc + arr.length, 0)
            };
        }

        setDebug(enabled) { this._config.debug = enabled; }

        // ── Offline-first helpers ────────────────────────────────────────────────

        async loadMessagesFromLocal(chatId) {
            const localStore = window.KynectaLocalStore;
            if (!localStore) return;
            try {
                await localStore.ready();
                const msgs = await localStore.getMessagesByChat(chatId, { limit: 100 });
                this.set(`messages.byChat.${chatId}`, Array.isArray(msgs) ? msgs : [], { silent: false });
            } catch (err) {
                console.warn('[Store] loadMessagesFromLocal failed:', err.message);
            }
        }

        upsertMessage(chatId, message) {
            if (!chatId || !message || !message.id) return;
            const existing = this.get(`messages.byChat.${chatId}`) || [];
            const arr = Array.isArray(existing) ? existing : [];
            const idx = arr.findIndex(m =>
                m.id === message.id ||
                (message.serverId && m.serverId === message.serverId)
            );
            if (idx >= 0) {
                const updated = [...arr];
                updated[idx] = { ...arr[idx], ...message };
                this.set(`messages.byChat.${chatId}`, updated);
            } else {
                this.set(`messages.byChat.${chatId}`, [...arr, message]);
            }
        }

        // ── Offline-first friend helpers ─────────────────────────────────

        async loadFriendsFromLocal() {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;
            try {
                await ls.ready();
                const [friends, incoming, blocked] = await Promise.all([
                    ls.getFriends(),
                    ls.getPendingReceived(),
                    ls.getBlocked(),
                ]);
                const toDisplay = r => ({
                    id:          r.friendId,
                    localId:     r.id,
                    serverId:    r.serverId,
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username  || '',
                    avatar:      r.avatar    || '',
                    photoURL:    r.avatar    || '',
                    status:      r.status,
                    addedAt:     r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                });
                this.batch(b => {
                    b.set('friends.list',     friends.map(toDisplay));
                    b.set('friends.requests', incoming.map(toDisplay));
                    b.set('friends.blocked',  blocked.map(toDisplay));
                });
                console.log('[Store] Friends loaded from local: ' + friends.length + ' friends, ' + incoming.length + ' requests');
            } catch (err) {
                console.warn('[Store] loadFriendsFromLocal failed:', err.message);
            }
        }

        upsertFriend(friendData) {
            if (!friendData || !friendData.id) return;
            const list = this.get('friends.list') || [];
            const idx  = list.findIndex(f => String(f.id) === String(friendData.id));
            const entry = {
                id:          friendData.id,
                displayName: friendData.displayName || friendData.username || String(friendData.id),
                username:    friendData.username  || '',
                avatar:      friendData.avatar    || friendData.photoURL || '',
                photoURL:    friendData.avatar    || friendData.photoURL || '',
                status:      friendData.status    || 'offline',
                addedAt:     friendData.addedAt   || friendData.createdAt || Date.now(),
                isLocalOnly: friendData.isLocalOnly !== false,
            };
            if (idx >= 0) {
                const updated = [...list];
                updated[idx] = { ...list[idx], ...entry };
                this.set('friends.list', updated);
            } else {
                this.set('friends.list', [...list, entry]);
            }
        }

        removeFriendFromStore(friendId) {
            const list = this.get('friends.list') || [];
            this.set('friends.list', list.filter(f => String(f.id) !== String(friendId)));
        }

        syncFromLocalStore() {
            const lss = window.LocalStoreSettings;
            if (!lss) return;
            try {
                const local = lss.getAll();
                if (!local || Object.keys(local).length <= 1) return;
                const mapped = _localSettingsToStoreSchema(local);
                const current = this.get('settings') || {};
                this.set('settings', Object.assign({}, current, mapped), { persist: true });
            } catch (e) { console.warn('[Store] syncFromLocalStore failed:', e.message); }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // ── NEW GROUP METHODS (v2.2) ──────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════════════

        /**
         * Load groups from LocalGroupStore (IndexedDB) into reactive store.
         * Called on boot and after every server sync.
         * Uses synchronous localStorage bootstrap for instant first paint.
         */
        async loadGroupsFromLocal() {
            // Step 1: Synchronous bootstrap from localStorage (instant)
            this._applyGroupBootstrap();

            // Step 2: Async load from IndexedDB (richer data)
            const localGroupStore = window.LocalGroupStore;
            if (!localGroupStore) return;

            try {
                await localGroupStore.ready();
                
                const [groups, myGroups, joinedGroups, adminGroups, invites] = await Promise.all([
                    localGroupStore.getAllGroups(),
                    localGroupStore.getMyGroups(),
                    localGroupStore.getJoinedGroups(),
                    localGroupStore.getAdminGroups(),
                    localGroupStore.getPendingInvites()
                ]);

                this.batch(b => {
                    // Build byId map
                    const byId = {};
                    groups.forEach(g => { byId[g.id] = g; });
                    b.set('groups.byId', byId);
                    b.set('groups.list', groups);
                    b.set('groups.myGroups', myGroups);
                    b.set('groups.joinedGroups', joinedGroups);
                    b.set('groups.adminGroups', adminGroups);
                    b.set('groups.invites', invites);
                });

                // Cache to localStorage for next boot
                this._cacheGroupBootstrap({ groups, myGroups, joinedGroups, adminGroups, invites });
                
                console.log('[Store] Groups loaded from local:', groups.length, 'groups');
            } catch (err) {
                console.warn('[Store] loadGroupsFromLocal failed:', err.message);
            }
        }

        /**
         * Upsert a single group into the reactive store.
         * Central write path — persists to LocalGroupStore first.
         */
        async upsertGroup(groupData) {
            if (!groupData || !groupData.id) return false;

            const localGroupStore = window.LocalGroupStore;
            
            // Persist to IndexedDB first
            if (localGroupStore) {
                try {
                    await localGroupStore.ready();
                    await localGroupStore.saveGroup(groupData);
                } catch (err) {
                    console.warn('[Store] upsertGroup: IDB save failed:', err.message);
                }
            }

            // Update store synchronously
            const byId = this.get('groups.byId') || {};
            const list = this.get('groups.list') || [];
            const myGroups = this.get('groups.myGroups') || [];
            const joinedGroups = this.get('groups.joinedGroups') || [];
            const adminGroups = this.get('groups.adminGroups') || [];

            const idx = list.findIndex(g => g.id === groupData.id);
            const isNew = idx === -1;
            
            const updatedGroup = {
                id: groupData.id,
                name: groupData.name,
                description: groupData.description || '',
                avatar: groupData.avatar || groupData.photoURL || '',
                coverImage: groupData.coverImage || '',
                createdBy: groupData.createdBy,
                createdAt: groupData.createdAt || Date.now(),
                updatedAt: groupData.updatedAt || Date.now(),
                memberCount: groupData.memberCount || 0,
                maxMembers: groupData.maxMembers || 500,
                isPrivate: groupData.isPrivate !== false,
                joinCode: groupData.joinCode || null,
                settings: groupData.settings || {},
                lastMessage: groupData.lastMessage || null,
                lastActivity: groupData.lastActivity || Date.now(),
                syncState: groupData.syncState || 'synced'
            };

            // Update byId
            const newById = { ...byId, [groupData.id]: updatedGroup };
            
            // Update list
            let newList;
            if (idx >= 0) {
                newList = [...list];
                newList[idx] = updatedGroup;
            } else {
                newList = [...list, updatedGroup];
            }

            // Update myGroups if current user is a member
            const userId = this.get('user.id');
            let newMyGroups = [...myGroups];
            let newJoinedGroups = [...joinedGroups];
            let newAdminGroups = [...adminGroups];

            if (userId) {
                const isMember = groupData.members?.includes?.(userId) || 
                                (groupData.memberIds?.includes?.(userId)) ||
                                groupData.createdBy === userId;
                
                if (isMember && isNew) {
                    newMyGroups.push(updatedGroup);
                    newJoinedGroups.push(updatedGroup);
                } else if (!isMember && !isNew) {
                    newMyGroups = newMyGroups.filter(g => g.id !== groupData.id);
                    newJoinedGroups = newJoinedGroups.filter(g => g.id !== groupData.id);
                }

                // Update adminGroups if user is admin
                const isAdmin = groupData.admins?.includes?.(userId) || groupData.createdBy === userId;
                if (isAdmin && isNew) {
                    newAdminGroups.push(updatedGroup);
                } else if (!isAdmin) {
                    newAdminGroups = newAdminGroups.filter(g => g.id !== groupData.id);
                }
            }

            this.batch(b => {
                b.set('groups.byId', newById);
                b.set('groups.list', newList);
                b.set('groups.myGroups', newMyGroups);
                b.set('groups.joinedGroups', newJoinedGroups);
                b.set('groups.adminGroups', newAdminGroups);
            });

            // Update cache
            this._cacheGroupBootstrap({
                groups: newList,
                myGroups: newMyGroups,
                joinedGroups: newJoinedGroups,
                adminGroups: newAdminGroups,
                invites: this.get('groups.invites') || []
            });

            return true;
        }

        /**
         * Remove a group from the reactive store and IDB.
         */
        async removeGroupFromStore(groupId) {
            if (!groupId) return false;

            const localGroupStore = window.LocalGroupStore;
            if (localGroupStore) {
                try {
                    await localGroupStore.ready();
                    await localGroupStore.deleteGroup(groupId);
                } catch (err) {
                    console.warn('[Store] removeGroupFromStore: IDB delete failed:', err.message);
                }
            }

            const byId = this.get('groups.byId') || {};
            const list = this.get('groups.list') || [];
            const myGroups = this.get('groups.myGroups') || [];
            const joinedGroups = this.get('groups.joinedGroups') || [];
            const adminGroups = this.get('groups.adminGroups') || [];
            const members = this.get('groups.members') || {};
            const messages = this.get('groups.messages') || {};
            const unread = this.get('groups.unread') || {};

            const newById = { ...byId };
            delete newById[groupId];

            const newList = list.filter(g => g.id !== groupId);
            const newMyGroups = myGroups.filter(g => g.id !== groupId);
            const newJoinedGroups = joinedGroups.filter(g => g.id !== groupId);
            const newAdminGroups = adminGroups.filter(g => g.id !== groupId);
            
            const newMembers = { ...members };
            delete newMembers[groupId];
            
            const newMessages = { ...messages };
            delete newMessages[groupId];
            
            const newUnread = { ...unread };
            delete newUnread[groupId];

            this.batch(b => {
                b.set('groups.byId', newById);
                b.set('groups.list', newList);
                b.set('groups.myGroups', newMyGroups);
                b.set('groups.joinedGroups', newJoinedGroups);
                b.set('groups.adminGroups', newAdminGroups);
                b.set('groups.members', newMembers);
                b.set('groups.messages', newMessages);
                b.set('groups.unread', newUnread);
            });

            this._cacheGroupBootstrap({
                groups: newList,
                myGroups: newMyGroups,
                joinedGroups: newJoinedGroups,
                adminGroups: newAdminGroups,
                invites: this.get('groups.invites') || []
            });

            return true;
        }

        /**
         * Upsert a group member.
         */
        async upsertGroupMember(groupId, memberData) {
            if (!groupId || !memberData || !memberData.userId) return false;

            const localGroupStore = window.LocalGroupStore;
            if (localGroupStore) {
                try {
                    await localGroupStore.ready();
                    await localGroupStore.saveMember(groupId, memberData);
                } catch (err) {
                    console.warn('[Store] upsertGroupMember: IDB save failed:', err.message);
                }
            }

            const members = this.get('groups.members') || {};
            const groupMembers = members[groupId] || [];
            
            const idx = groupMembers.findIndex(m => m.userId === memberData.userId);
            let newGroupMembers;
            
            if (idx >= 0) {
                newGroupMembers = [...groupMembers];
                newGroupMembers[idx] = { ...groupMembers[idx], ...memberData };
            } else {
                newGroupMembers = [...groupMembers, memberData];
            }
            
            const newMembers = { ...members, [groupId]: newGroupMembers };
            this.set('groups.members', newMembers);
            
            // Also update memberCount in group data
            const group = this.get(`groups.byId.${groupId}`);
            if (group) {
                const updatedGroup = { ...group, memberCount: newGroupMembers.length };
                await this.upsertGroup(updatedGroup);
            }
            
            return true;
        }

        /**
         * Remove a group member.
         */
        async removeGroupMember(groupId, userId) {
            if (!groupId || !userId) return false;

            const localGroupStore = window.LocalGroupStore;
            if (localGroupStore) {
                try {
                    await localGroupStore.ready();
                    await localGroupStore.deleteMember(groupId, userId);
                } catch (err) {
                    console.warn('[Store] removeGroupMember: IDB delete failed:', err.message);
                }
            }

            const members = this.get('groups.members') || {};
            const groupMembers = members[groupId] || [];
            
            const newGroupMembers = groupMembers.filter(m => m.userId !== userId);
            const newMembers = { ...members, [groupId]: newGroupMembers };
            this.set('groups.members', newMembers);
            
            // Update memberCount in group data
            const group = this.get(`groups.byId.${groupId}`);
            if (group) {
                const updatedGroup = { ...group, memberCount: newGroupMembers.length };
                await this.upsertGroup(updatedGroup);
            }
            
            return true;
        }

        /**
         * Load group messages from IDB into store.
         */
        async loadGroupMessages(groupId, limit = 50) {
            if (!groupId) return [];

            const localGroupStore = window.LocalGroupStore;
            if (!localGroupStore) return [];

            try {
                await localGroupStore.ready();
                const messages = await localGroupStore.getMessages(groupId, { limit });
                
                const groupMessages = this.get('groups.messages') || {};
                this.set('groups.messages', { ...groupMessages, [groupId]: messages });
                
                return messages;
            } catch (err) {
                console.warn('[Store] loadGroupMessages failed:', err.message);
                return [];
            }
        }

        /**
         * Upsert a group message (persist to IDB + store).
         */
        async upsertGroupMessage(groupId, message) {
            if (!groupId || !message || !message.id) return false;

            const localGroupStore = window.LocalGroupStore;
            if (localGroupStore) {
                try {
                    await localGroupStore.ready();
                    await localGroupStore.saveMessage(groupId, message);
                } catch (err) {
                    console.warn('[Store] upsertGroupMessage: IDB save failed:', err.message);
                }
            }

            const groupMessages = this.get('groups.messages') || {};
            const existing = groupMessages[groupId] || [];
            
            const idx = existing.findIndex(m => m.id === message.id);
            let newMessages;
            
            if (idx >= 0) {
                newMessages = [...existing];
                newMessages[idx] = { ...existing[idx], ...message };
            } else {
                newMessages = [...existing, message];
                // Sort by timestamp
                newMessages.sort((a, b) => (a.timestamp || a.createdAt || 0) - (b.timestamp || b.createdAt || 0));
            }
            
            this.set('groups.messages', { ...groupMessages, [groupId]: newMessages });
            
            // Update lastMessage in group data
            if (newMessages.length > 0) {
                const lastMsg = newMessages[newMessages.length - 1];
                const group = this.get(`groups.byId.${groupId}`);
                if (group) {
                    const updatedGroup = {
                        ...group,
                        lastMessage: lastMsg,
                        lastActivity: lastMsg.timestamp || lastMsg.createdAt || Date.now()
                    };
                    await this.upsertGroup(updatedGroup);
                }
            }
            
            return true;
        }

        /**
         * Set group sync state (for UI loading/pending/error indicators).
         */
        setGroupSyncState(groupId, state, error = null) {
            const syncState = this.get('groups.syncState') || {
                syncing: false,
                lastSync: 0,
                pendingCount: 0,
                failedIds: []
            };
            
            const newSyncState = { ...syncState };
            
            if (groupId === '*') {
                newSyncState.syncing = state === 'syncing';
                if (state === 'synced') newSyncState.lastSync = Date.now();
                if (state === 'error') newSyncState.failedIds = error ? [error] : [];
            } else {
                // Per-group state can be stored in groups.byId[groupId].syncState
                const group = this.get(`groups.byId.${groupId}`);
                if (group) {
                    const updatedGroup = {
                        ...group,
                        syncState: state,
                        syncError: error
                    };
                    this.upsertGroup(updatedGroup);
                }
            }
            
            if (groupId === '*') {
                this.set('groups.syncState', newSyncState);
            }
        }

        // ── Private ──────────────────────────────────────────────────────────────

        /**
         * NEW (offline-first): Hydrate the reactive store at module load from every
         * `kynecta_*_cache` key found in localStorage.  This gives a zero-latency
         * first paint — the UI has real data before any network round-trip.
         */
        _hydrateStoreFromLocal() {
            if (!window.localStorage) return;
            try {
                const cachePrefix = 'kynecta_';
                const cacheSuffix = '_cache';
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(cachePrefix) || !key.endsWith(cacheSuffix)) continue;

                    // Derive store keyPath from cache key: "kynecta_friends_cache" → "friends"
                    const domain = key.slice(cachePrefix.length, key.length - cacheSuffix.length);
                    if (!domain || !(domain in this._state)) continue;

                    try {
                        const raw = localStorage.getItem(key);
                        if (!raw) continue;
                        const parsed = JSON.parse(raw);
                        // Cache entries may wrap payload under { data, timestamp } or be the raw value
                        const payload = (parsed && parsed.data !== undefined) ? parsed.data : parsed;
                        if (payload !== null && payload !== undefined) {
                            this.set(domain, payload, { silent: true, persist: false });
                            if (this._config.debug) console.log('[Store] Hydrated', domain, 'from', key);
                        }
                    } catch { /* malformed cache entry — skip */ }
                }
                // Prefer unified IndexedDB snapshots when available.
                if (window.KynectaCache && typeof window.KynectaCache.getModuleSnapshot === 'function') {
                    Object.keys(this._state).forEach((domain) => {
                        if (domain === 'network') return;
                        Promise.resolve(window.KynectaCache.getModuleSnapshot(domain))
                            .then((snapshot) => {
                                if (snapshot !== null && snapshot !== undefined) {
                                    this.set(domain, snapshot, { silent: true, persist: false });
                                }
                            })
                            .catch(() => {});
                    });
                }
                console.log('[Store] _hydrateStoreFromLocal complete');
            } catch (err) {
                console.warn('[Store] _hydrateStoreFromLocal error:', err.message);
            }
        }

        /**
         * NEW (offline-first): Subscribe to all store updates and debounce-write the
         * changed top-level slice back to its `kynecta_<key>_cache` localStorage key.
         * This keeps the cache fresh so the next page load sees current data instantly.
         */
        _setupStorePersistence() {
            const debounceMap = new Map();
            const DEBOUNCE_MS = this._config.persistDebounce || 500;
            const cachePrefix = 'kynecta_';
            const cacheSuffix = '_cache';

            this.subscribe('*', (_state, _old, _path) => {
                // Determine the top-level key that changed
                const topKey = typeof _path === 'string' ? _path.split('.')[0] : null;
                // Skip ephemeral or already-handled slices
                if (!topKey || topKey === 'network' || topKey === 'ui') return;

                if (debounceMap.has(topKey)) clearTimeout(debounceMap.get(topKey));
                debounceMap.set(topKey, setTimeout(() => {
                    debounceMap.delete(topKey);
                    try {
                        const value = this.get(topKey);
                        if (value === null || value === undefined) return;
                        const cacheKey = `${cachePrefix}${topKey}${cacheSuffix}`;
                        localStorage.setItem(cacheKey, JSON.stringify({
                            data: value,
                            timestamp: Date.now()
                        }));
                        if (window.KynectaCache && typeof window.KynectaCache.setModuleSnapshot === 'function') {
                            window.KynectaCache.setModuleSnapshot(topKey, value, { source: 'KynectaStore' }).catch(() => {});
                        }
                    } catch { /* quota exceeded or private browsing — ignore */ }
                }, DEBOUNCE_MS));
            });

            console.log('[Store] _setupStorePersistence active');
        }

        _subscribeToLocalStore() {
            if (!window.LocalStoreSettings) {
                setTimeout(() => this._subscribeToLocalStore(), 300);
                return;
            }
            if (this._localStoreUnsub) this._localStoreUnsub();

            this._localStoreUnsub = window.LocalStoreSettings.subscribe((_path, _value, allSettings) => {
                const mapped = _localSettingsToStoreSchema(allSettings);
                const current = this.get('settings') || {};
                this.set('settings', Object.assign({}, current, mapped), { persist: false, silent: false });
            });
            console.log('[Store] Subscribed to LocalStoreSettings');
        }

        _setupOfflineFirstListeners() {
            window.addEventListener('kyn:chatSynced', async (e) => {
                const { chatId } = e.detail || {};
                if (chatId) await this.loadMessagesFromLocal(chatId);
            });
            window.addEventListener('online',  () => this.set('network.online', true));
            window.addEventListener('offline', () => this.set('network.online', false));

            window.addEventListener('settingsSavedLocal', () => {
                this.syncFromLocalStore();
            });

            window.addEventListener('kyn:friendsSynced', async () => {
                await this.loadFriendsFromLocal();
            });

            // ── NEW GROUP EVENT LISTENERS (v2.2) ──────────────────────────────────
            
            window.addEventListener('groupSync:started', () => {
                this.setGroupSyncState('*', 'syncing');
            });
            
            window.addEventListener('groupSync:completed', async () => {
                this.setGroupSyncState('*', 'synced');
                await this.loadGroupsFromLocal();  // Reload fresh from IDB
            });
            
            window.addEventListener('groupSync:failed', (e) => {
                const { error } = e.detail || {};
                this.setGroupSyncState('*', 'error', error);
            });
            
            window.addEventListener('kyn:groupCreated', async (e) => {
                const { group } = e.detail || {};
                if (group) await this.upsertGroup(group);
            });
            
            window.addEventListener('kyn:groupUpdated', async (e) => {
                const { group } = e.detail || {};
                if (group) await this.upsertGroup(group);
            });
            
            window.addEventListener('kyn:groupDeleted', async (e) => {
                const { groupId } = e.detail || {};
                if (groupId) await this.removeGroupFromStore(groupId);
            });
            
            window.addEventListener('kyn:groupMemberAdded', async (e) => {
                const { groupId, member } = e.detail || {};
                if (groupId && member) await this.upsertGroupMember(groupId, member);
            });
            
            window.addEventListener('kyn:groupMemberRemoved', async (e) => {
                const { groupId, userId } = e.detail || {};
                if (groupId && userId) await this.removeGroupMember(groupId, userId);
            });
            
            window.addEventListener('kyn:groupMessageReceived', async (e) => {
                const { groupId, message } = e.detail || {};
                if (groupId && message) await this.upsertGroupMessage(groupId, message);
            });
            
            window.addEventListener('kyn:groupInviteReceived', async (e) => {
                const { invite } = e.detail || {};
                if (invite) {
                    const invites = this.get('groups.invites') || [];
                    if (!invites.find(i => i.id === invite.id)) {
                        this.set('groups.invites', [...invites, invite]);
                    }
                }
            });
        }

        _createInitialState() {
            return JSON.parse(JSON.stringify(STORE_SCHEMA));
        }

        _setImmutable(obj, keys, value, index = 0) {
            const key = keys[index];
            if (Array.isArray(obj) && !isNaN(key)) {
                const idx = parseInt(key, 10);
                if (index === keys.length - 1) {
                    const a = [...obj]; a[idx] = value; return a;
                }
                const a = [...obj];
                a[idx] = this._setImmutable(obj[idx], keys, value, index + 1);
                return a;
            }
            if (index === keys.length - 1) return { ...obj, [key]: value };
            const nextObj = obj[key] || (isNaN(keys[index + 1]) ? {} : []);
            return { ...obj, [key]: this._setImmutable(nextObj, keys, value, index + 1) };
        }

        _recordHistory(keyPath, value) {
            if (!this._history.has(keyPath)) this._history.set(keyPath, []);
            const history = this._history.get(keyPath);
            history.push(value);
            if (history.length > this._config.maxHistoryPerKey) history.shift();
        }

        _notifySubscribers(keyPath, newValue, oldValue) {
            if (this._subscribers.has(keyPath)) {
                this._subscribers.get(keyPath).forEach(cb => {
                    try { cb(newValue, oldValue, keyPath); }
                    catch (e) { console.error('[Store] Subscriber error:', e); }
                });
            }
            const parts = keyPath.split('.');
            while (parts.length > 1) {
                parts.pop();
                const pp = parts.join('.');
                if (this._subscribers.has(pp)) {
                    const pv = this.get(pp);
                    this._subscribers.get(pp).forEach(cb => {
                        try { cb(pv, null, pp); }
                        catch (e) { console.error('[Store] Subscriber error:', e); }
                    });
                }
            }
            this._wildcardSubscribers.forEach(cb => {
                try { cb(this._state, null, keyPath); }
                catch (e) { console.error('[Store] Wildcard subscriber error:', e); }
            });
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('STORE_UPDATED',
                    { keyPath, newValue, oldValue, timestamp: Date.now() }, { async: true });
            }
        }

        _applyBatch(updates) {
            let newState = this._state;
            updates.forEach(({ keyPath, value }) => {
                const old = this.get(keyPath);
                newState = this._setImmutable(newState, keyPath.split('.'), value);
                this._recordHistory(keyPath, old);
            });
            this._state = newState;
            this._stats.updates++;
            updates.forEach(({ keyPath }) => {
                const v = this.get(keyPath);
                this._notifySubscribers(keyPath, v, null);
            });
            this._schedulePersistence();
        }

        _schedulePersistence() {
            if (this._persistTimeout) clearTimeout(this._persistTimeout);
            this._persistTimeout = setTimeout(() => {
                this._persistState();
                this._persistTimeout = null;
            }, this._config.persistDebounce);
        }

        _persistState() {
            if (!window.localStorage) return;
            try {
                this._config.persistKeys.forEach(key => {
                    const value = this.get(key);
                    if (value !== null && value !== undefined) {
                        localStorage.setItem(`${LS_STORE_PFX}${key}`, JSON.stringify(value));
                    }
                });

                const settingsValue = this.get('settings');
                const lss = window.LocalStoreSettings;
                if (settingsValue && lss) {
                    const flat = _storeSchemaToLocalSettings(settingsValue);
                    lss.persist(Object.assign({}, lss.getAll(), flat));
                }
            } catch (err) { console.warn('[Store] Failed to persist state:', err); }
        }

        _loadPersistedState() {
            if (!window.localStorage) return;
            try {
                ['user', 'session', 'theme'].forEach(key => {
                    const stored = localStorage.getItem(`${LS_STORE_PFX}${key}`);
                    if (stored) {
                        try { this.set(key, JSON.parse(stored), { silent: true, persist: false }); } catch {}
                    }
                });

                let canonicalSettings = null;
                let canonicalTs       = 0;

                try {
                    const rawLSS = localStorage.getItem(LS_CANONICAL);
                    if (rawLSS) {
                        const parsedLSS = JSON.parse(rawLSS);
                        const lssTs = parsedLSS.timestamp || 0;
                        if (lssTs >= canonicalTs) {
                            canonicalSettings = _localSettingsToStoreSchema(parsedLSS.data || parsedLSS);
                            canonicalTs = lssTs;
                        }
                    }
                } catch {}

                try {
                    const rawStore = localStorage.getItem(`${LS_STORE_PFX}settings`);
                    if (rawStore) {
                        const parsedStore = JSON.parse(rawStore);
                        const storeTs = parsedStore._savedAt || 0;
                        if (storeTs > canonicalTs) {
                            canonicalSettings = parsedStore;
                            canonicalTs = storeTs;
                        }
                    }
                } catch {}

                if (canonicalSettings) {
                    const current = this.get('settings') || {};
                    this.set('settings', Object.assign({}, current, canonicalSettings),
                        { silent: true, persist: false });
                }
            } catch (err) { console.warn('[Store] Failed to load persisted state:', err); }
        }

        _deepFreeze(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            Object.keys(obj).forEach(key => {
                if (typeof obj[key] === 'object') this._deepFreeze(obj[key]);
            });
            return Object.freeze(obj);
        }

        /**
         * Apply cached group bootstrap from localStorage (instant first paint).
         */
        _applyGroupBootstrap() {
            try {
                const cached = localStorage.getItem(LS_GROUPS_BOOTSTRAP);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (data.groups) {
                        const byId = {};
                        data.groups.forEach(g => { byId[g.id] = g; });
                        this.batch(b => {
                            b.set('groups.byId', byId);
                            b.set('groups.list', data.groups);
                            b.set('groups.myGroups', data.myGroups || []);
                            b.set('groups.joinedGroups', data.joinedGroups || []);
                            b.set('groups.adminGroups', data.adminGroups || []);
                            b.set('groups.invites', data.invites || []);
                        });
                        console.log('[Store] Group bootstrap applied from cache');
                    }
                }
            } catch (err) {
                console.warn('[Store] Failed to apply group bootstrap:', err.message);
            }
        }

        /**
         * Cache group data to localStorage for fast next-load.
         */
        _cacheGroupBootstrap(data) {
            try {
                const toCache = {
                    groups: data.groups || [],
                    myGroups: data.myGroups || [],
                    joinedGroups: data.joinedGroups || [],
                    adminGroups: data.adminGroups || [],
                    invites: data.invites || [],
                    _cachedAt: Date.now()
                };
                localStorage.setItem(LS_GROUPS_BOOTSTRAP, JSON.stringify(toCache));
            } catch (err) {
                console.warn('[Store] Failed to cache group bootstrap:', err.message);
            }
        }
    }

    // ─── Schema translation helpers ───────────────────────────────────────────────

    function _localSettingsToStoreSchema(local) {
        if (!local) return {};
        const out = {};
        if (local.theme)    out.theme    = local.theme;
        if (local.language) out.language = local.language;
        if (local.notifications) {
            out.notifications = local.notifications.messages !== false;
            out.soundEnabled  = local.notifications.calls   !== false;
        }
        if (local.privacy)  out.privacy  = Object.assign({}, local.privacy);
        if (local.chat && local.chat.fontSize) {
            const sizeMap = { small: 14, medium: 16, large: 18 };
            out.fontSize = sizeMap[local.chat.fontSize] || 16;
        }
        if (local.syncEnabled !== undefined) out.syncEnabled = local.syncEnabled;
        return out;
    }

    function _storeSchemaToLocalSettings(settings) {
        if (!settings) return {};
        const out = {};
        if (settings.theme)    out.theme    = settings.theme;
        if (settings.language) out.language = settings.language;
        if (settings.notifications !== undefined) {
            out.notifications = {
                messages: settings.notifications !== false,
                calls:    settings.soundEnabled  !== false,
                groups:   settings.notifications !== false,
            };
        }
        if (settings.privacy)  out.privacy  = Object.assign({}, settings.privacy);
        if (settings.fontSize) {
            const n = settings.fontSize;
            out.chat = { fontSize: n <= 14 ? 'small' : n >= 18 ? 'large' : 'medium' };
        }
        if (settings.syncEnabled !== undefined) out.syncEnabled = settings.syncEnabled;
        out._savedAt = Date.now();
        return out;
    }

    // ─── Bootstrap ────────────────────────────────────────────────────────────────

    const store = new KynectaStore();
    window.KynectaStore = store;

    if (window.__KYNECTA_AUTHORITIES__) window.__KYNECTA_AUTHORITIES__.store = store;

    console.log('[Store] ✅ Ready (offline-first v2.2)');
})();
