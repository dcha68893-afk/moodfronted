/**
 * PART 2/4 — CACHE & API
 * FriendCacheManager, API Gateway, Data Loading,
 * Offline-first storage, Polling Manager
 */
const FriendCacheManager = {
    _cache: {
        friends: new Map(),
        requests: new Map(),
        sentRequests: new Map(),
        pinnedFriends: new Map(),
        mutedFriends: new Map(),
        users: new Map(),
        searchIndex: new Map(),
    },
    _ttl: {
        friends: 5 * 60 * 1000,
        requests: 2 * 60 * 1000,
        users: 10 * 60 * 1000,
        search: 60 * 1000,
    },
    _timestamps: new Map(),
    _listeners: new Map(),
    _searchCache: null,
    
    init() {
        this._loadFromStorage();
        this._setupAutoCleanup();
        StatusManager.show('READY', 'FriendCacheManager initialized');
    },
    
    _loadFromStorage() {
        try {
            // FIX: On startup, purge any stale v8 cache entries that have int+string duplicate IDs.
            // This happens when old code wrote both id=5 (integer) and id="5" (string) to the same array.
            // We rewrite the key with deduplicated data so broadcasts from chat.html are clean.
            try {
                const v8Key = 'kynecta_friends_cache_v8';
                const v8Raw = localStorage.getItem(v8Key);
                if (v8Raw) {
                    const v8Parsed = JSON.parse(v8Raw);
                    const arr = v8Parsed?.friends || (Array.isArray(v8Parsed) ? v8Parsed : null);
                    if (arr && arr.length > 0) {
                        const seen = new Set();
                        const deduped = arr.filter(f => {
                            if (!f || !f.id) return false;
                            const k = String(f.id);
                            if (seen.has(k)) return false;
                            seen.add(k);
                            return true;
                        });
                        if (deduped.length !== arr.length) {
                            // Rewrite with deduplicated data
                            localStorage.setItem(v8Key, JSON.stringify({ friends: deduped, timestamp: Date.now() }));
                        }
                    }
                }
            } catch (_) {}

            // FIX: Read from ALL known cache key variants written by different modules.
            // services.friend.js writes 'kynecta_friends_cache_v8'; messages module writes
            // the same key.  Previously only 'knecta_friends_cache' was read, causing 0 friends on reload.
            let friendsData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.FRIENDS); // 'knecta_friends_cache'
            if (!friendsData || !Array.isArray(friendsData) || friendsData.length === 0) {
                const raw = localStorage.getItem('kynecta_friends_cache_v8')
                         || localStorage.getItem('knecta_friends_cache_v8')
                         || localStorage.getItem('kynecta_friends_cache')
                         || localStorage.getItem('friends');
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        friendsData = parsed?.friends || (Array.isArray(parsed) ? parsed : []);
                    } catch (_) {}
                }
            }
            if (friendsData && Array.isArray(friendsData)) {
                friendsData.forEach(f => {
                    // FIX: Only load truly accepted friends. Records with status
                    // 'pending', 'pending_sent', 'pending_received', 'blocked',
                    // or 'removed' must NOT appear in the friends list.
                    // IMPORTANT: 'online', 'offline', 'away', 'busy' are PRESENCE statuses,
                    // NOT friendship statuses. The messages module saves all conversation
                    // participants to kynecta_friends_cache_v8 with their presence status —
                    // those must NOT be loaded as accepted friends or every user appears as
                    // a friend before they accept a request.
                    if (f && f.id) {
                        // A record is an accepted friend ONLY if it has an explicit
                        // friendship status of 'accepted', OR it has NO status at all
                        // (true legacy records from before status was added) AND it also
                        // has an 'addedAt' or 'friendId' field proving it came from the
                        // friends module — not the messages module's participant list.
                        const friendshipStatus = f.friendshipStatus || f.friendStatus || null;
                        const rawStatus = f.status;
                        const isPresenceOnly = rawStatus === 'online' || rawStatus === 'offline' ||
                                               rawStatus === 'away' || rawStatus === 'busy';

                        let isAcceptedFriend = false;
                        if (friendshipStatus === 'accepted') {
                            isAcceptedFriend = true;
                        } else if (rawStatus === 'accepted') {
                            isAcceptedFriend = true;
                        } else if (!rawStatus && !isPresenceOnly) {
                            // Legacy record with no status — only treat as friend if it
                            // has fields that uniquely identify a friends-module record
                            isAcceptedFriend = !!(f.addedAt || f.friendId || f.localId || f.serverId);
                        }
                        // Explicitly reject pending/blocked/removed records
                        if (rawStatus === 'pending_sent' || rawStatus === 'pending_received' ||
                            rawStatus === 'pending' || rawStatus === 'blocked' || rawStatus === 'removed' ||
                            rawStatus === 'none') {
                            isAcceptedFriend = false;
                        }

                        if (isAcceptedFriend) {
                            // FIX: Always use String key to prevent integer/string duplication
                            const key = String(f.id);
                            this._cache.friends.set(key, { ...f, id: key });
                        }
                    }
                });
            }
            
            const requestsData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.REQUESTS);
            if (requestsData && Array.isArray(requestsData)) {
                requestsData.forEach(r => {
                    if (r && r.id) this._cache.requests.set(r.id, r);
                });
            }
            
            const sentData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
            if (sentData && Array.isArray(sentData)) {
                sentData.forEach(r => {
                    if (r && r.id) this._cache.sentRequests.set(r.id, r);
                });
            }
            
            const pinnedData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
            if (pinnedData && Array.isArray(pinnedData)) {
                pinnedData.forEach(f => {
                    if (f && f.id) this._cache.pinnedFriends.set(f.id, f);
                });
            }
            
            const mutedData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
            if (mutedData && Array.isArray(mutedData)) {
                mutedData.forEach(f => {
                    if (f && f.id) this._cache.mutedFriends.set(f.id, f);
                });
            }
            
            const allUsersData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
            if (allUsersData && Array.isArray(allUsersData)) {
                allUsersData.forEach(u => {
                    if (u && u.id) this._cache.users.set(u.id, u);
                });
            }
        } catch (error) {
            Logger.error('FriendCacheManager', 'Failed to load from storage', error);
        }
    },
    
    _setupAutoCleanup() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    },
    
    cleanup() {
        const now = Date.now();
        
        for (const [id, friend] of this._cache.friends) {
            const key = `friend_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.friends) {
                this._cache.friends.delete(id);
                this._timestamps.delete(key);
            }
        }
        
        for (const [id, request] of this._cache.requests) {
            const key = `request_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.requests) {
                this._cache.requests.delete(id);
                this._timestamps.delete(key);
            }
        }
        
        for (const [id, user] of this._cache.users) {
            const key = `user_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.users) {
                this._cache.users.delete(id);
                this._timestamps.delete(key);
            }
        }
    },
    
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return () => this.off(event, callback);
    },
    
    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) this._listeners.delete(event);
        }
    },
    
    _emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try { cb(data); } catch (e) {}
            });
        }
    },
    
    getFriend(id) {
        return this._cache.friends.get(id) || null;
    },
    
    getAllFriends() {
        return Array.from(this._cache.friends.values());
    },
    
    setFriend(friend) {
        if (!friend || !friend.id) return false;
        const key = String(friend.id);
        // Never add current user as their own friend
        const _selfId = __session?.user?.id || currentUser?.id;
        if (_selfId && key === String(_selfId)) return false;
        this._cache.friends.set(key, { ...friend, id: key });
        this._timestamps.set(`friend_${key}`, Date.now());
        this._emit('friend:updated', friend);
        return true;
    },
    
    setFriends(friendsArray) {
        if (!Array.isArray(friendsArray)) return false;
        const _selfId = __session?.user?.id || currentUser?.id;
        friendsArray.forEach(f => {
            if (!f || !f.id) return;
            const key = String(f.id);
            // Never add current user as their own friend
            if (_selfId && key === String(_selfId)) return;
            const st = f.status;
            if (st === 'pending_sent' || st === 'pending_received' ||
                st === 'pending' || st === 'blocked' || st === 'removed' ||
                st === 'none') return;
            if ((st === 'online' || st === 'offline' || st === 'away' || st === 'busy') &&
                !(f.addedAt || f.friendId || f.localId || f.serverId)) return;
            this._cache.friends.set(key, { ...f, id: key });
            this._timestamps.set(`friend_${key}`, Date.now());
        });
        this._emit('friends:updated', this.getAllFriends());
        return true;
    },
    
    removeFriend(id) {
        const key = String(id);
        // Try both String and original forms (legacy data may have used integer key)
        const existed = this._cache.friends.delete(key) || this._cache.friends.delete(id);
        if (existed) {
            this._timestamps.delete(`friend_${key}`);
            this._timestamps.delete(`friend_${id}`);
            this._emit('friend:removed', id);
        }
        return existed;
    },
    
    getRequest(id) {
        return this._cache.requests.get(id) || null;
    },
    
    getAllRequests() {
        return Array.from(this._cache.requests.values());
    },
    
    setRequest(request) {
        if (!request || !request.id) return false;
        this._cache.requests.set(request.id, request);
        this._timestamps.set(`request_${request.id}`, Date.now());
        this._emit('request:updated', request);
        return true;
    },
    
    setRequests(requestsArray) {
        if (!Array.isArray(requestsArray)) return false;
        requestsArray.forEach(r => {
            if (r && r.id) {
                this._cache.requests.set(r.id, r);
                this._timestamps.set(`request_${r.id}`, Date.now());
            }
        });
        this._emit('requests:updated', this.getAllRequests());
        return true;
    },
    
    removeRequest(id) {
        const existed = this._cache.requests.delete(id);
        if (existed) {
            this._timestamps.delete(`request_${id}`);
            this._emit('request:removed', id);
        }
        return existed;
    },
    
    getAllSentRequests() {
        return Array.from(this._cache.sentRequests.values());
    },

    // FIX: getSentRequest was missing. cancelFriendRequest() calls this via optional
    // chaining — without it existingSent is always undefined and rollback on cancel
    // failure never restores the card in the UI.
    getSentRequest(id) {
        return this._cache.sentRequests.get(String(id)) || null;
    },

    setSentRequest(request) {
        if (!request || !request.id) return false;
        this._cache.sentRequests.set(request.id, request);
        this._timestamps.set(`sent_${request.id}`, Date.now());
        this._emit('sent:updated', request);
        return true;
    },
    
    setSentRequests(requestsArray) {
        if (!Array.isArray(requestsArray)) return false;
        requestsArray.forEach(r => {
            if (r && r.id) {
                this._cache.sentRequests.set(r.id, r);
                this._timestamps.set(`sent_${r.id}`, Date.now());
            }
        });
        this._emit('sent:all_updated', this.getAllSentRequests());
        return true;
    },
    
    removeSentRequest(id) {
        const existed = this._cache.sentRequests.delete(id);
        if (existed) {
            this._timestamps.delete(`sent_${id}`);
            this._emit('sent:removed', id);
        }
        return existed;
    },
    
    getUser(id) {
        return this._cache.users.get(id) || null;
    },
    
    getAllUsers() {
        return Array.from(this._cache.users.values());
    },
    
    setUser(user) {
        if (!user || !user.id) return false;
        this._cache.users.set(user.id, user);
        this._timestamps.set(`user_${user.id}`, Date.now());
        this._emit('user:updated', user);
        return true;
    },
    
    setUsers(usersArray) {
        if (!Array.isArray(usersArray)) return false;
        usersArray.forEach(u => {
            if (u && u.id) {
                this._cache.users.set(u.id, u);
                this._timestamps.set(`user_${u.id}`, Date.now());
            }
        });
        this._emit('users:updated', this.getAllUsers());
        return true;
    },
    
    // FIXED: Client-side search (NO API CALLS)
    searchFriends(query, options = {}) {
        if (!query || typeof query !== 'string') return [];
        
        const normalizedQuery = query.toLowerCase().trim();
        if (normalizedQuery.length === 0) return [];
        
        const results = [];
        const searchTargets = options.includeUsers ? 
            [...this._cache.friends.values(), ...this._cache.users.values()] : 
            [...this._cache.friends.values()];
        
        for (const item of searchTargets) {
            if (this._matchesQuery(item, normalizedQuery)) {
                results.push(item);
            }
        }
        
        // Sort results by relevance (name match first)
        results.sort((a, b) => {
            const aName = (a.displayName || a.name || '').toLowerCase();
            const bName = (b.displayName || b.name || '').toLowerCase();
            
            if (aName === normalizedQuery && bName !== normalizedQuery) return -1;
            if (bName === normalizedQuery && aName !== normalizedQuery) return 1;
            if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
            if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;
            
            return aName.localeCompare(bName);
        });
        
        return results;
    },
    
    _matchesQuery(item, query) {
        if (!item) return false;
        
        const name = (item.displayName || item.name || '').toLowerCase();
        const username = (item.username || '').toLowerCase();
        const email = (item.email || '').toLowerCase();
        
        return name.includes(query) || username.includes(query) || email.includes(query);
    },
    
    syncToGlobals() {
        const _fRaw = this.getAllFriends();
        const _r = this.getAllRequests();
        const _s = this.getAllSentRequests();
        const _p = Array.from(this._cache.pinnedFriends.values());
        const _m = Array.from(this._cache.mutedFriends.values());
        const _u = this.getAllUsers();

        // FIX: Always deduplicate by String(id) before exposing to window globals.
        // Multiple iframe instances can each write to window.friends via syncToGlobals,
        // and our optimistic-accept code also pushes directly to window.friends.
        // Using String(id) as key prevents int/string duplicate entries.
        const _dedupMap = new Map();
        _fRaw.forEach(f => { if (f && f.id) _dedupMap.set(String(f.id), f); });
        const _f = Array.from(_dedupMap.values());

        friends = _f;
        friendRequests = _r;
        sentRequests = _s;
        pinnedFriends = _p;
        mutedFriends = _m;
        allUsers = _u;

        window.friends = _f;
        window.friendRequests = _r;
        window.sentRequests = _s;
        window.pinnedFriends = _p;
        window.mutedFriends = _m;
        window.allUsers = _u;
        // FIX: Do NOT dispatch friendsUpdated here. syncToGlobals is called dozens of
        // times per second (after every API response). Dispatching friendsUpdated from here
        // creates an infinite loop:
        //   syncToGlobals → friendsUpdated → renderFriends → loadFriendsFromBackend → syncToGlobals
        // Callers that actually have new data (loadFriendsFromBackend, FRIEND_REMOVED, etc.)
        // dispatch friendsUpdated explicitly after syncToGlobals returns.
        window.dispatchEvent(new CustomEvent('updateFriendCounts'));
        // Broadcast to parent (chat/call/status/groups) with 80ms debounce
        if (!FriendCacheManager._syncBroadcastTimer) {
            FriendCacheManager._syncBroadcastTimer = setTimeout(() => {
                FriendCacheManager._syncBroadcastTimer = null;
                const _p = {
                    type: 'FRIENDS_SYNC',
                    friends: Array.from(FriendCacheManager._cache.friends.values()),
                    requests: Array.from(FriendCacheManager._cache.requests.values()),
                    sentRequests: Array.from(FriendCacheManager._cache.sentRequests.values()),
                    source: 'friend-core',
                    timestamp: Date.now()
                };
                try { window.parent.postMessage(_p, '*'); } catch (_) {}
                window.dispatchEvent(new CustomEvent('FRIENDS_SYNC', { detail: _p }));
            }, 80);
        }
    },
    
    persist() {
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, this.getAllFriends());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.REQUESTS, this.getAllRequests());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, this.getAllSentRequests());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, Array.from(this._cache.pinnedFriends.values()));
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, Array.from(this._cache.mutedFriends.values()));
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE, this.getAllUsers());
    },
    
    clear() {
        this._cache.friends.clear();
        this._cache.requests.clear();
        this._cache.sentRequests.clear();
        this._cache.pinnedFriends.clear();
        this._cache.mutedFriends.clear();
        this._cache.users.clear();
        this._cache.searchIndex.clear();
        this._timestamps.clear();
        if (this._searchCache) this._searchCache.clear();
        this.persist();
    }
};

FriendCacheManager.init();

// =============================================
// [OFFLINE-FIRST BOOTSTRAP]
// Connects FriendCacheManager to localStore.friends.js,
// friendQueue.manager.js, and friendSync.engine.js.
// UI always reads from localStore → KynectaStore.
// All mutations go through the queue when offline.
// =============================================

const OfflineFirstFriends = {
    _initialized: false,

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        // Wait for localStore to be ready
        const ls = window.KynectaFriendsLocalStore;
        if (ls) {
            try {
                await ls.ready();
                // Set current user on the store
                const userId = __session.user?.id
                    || window.__PARENT_SESSION__?.userId
                    || window.KynectaStore?.get('user.id')
                    || localStorage.getItem('currentUserId')
                    || (() => {
                        try {
                            const stored = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
                            return stored?.id || stored?.userId || null;
                        } catch (_error) {
                            return null;
                        }
                    })();
                if (userId) ls.setCurrentUser(String(userId));

                // Hydrate FriendCacheManager from localStore immediately (zero-wait UI)
                await this._hydrateFromLocalStore();
            } catch (e) {
                Logger.warn('OfflineFirstFriends', 'LocalStore hydration failed', e.message);
            }
        }

        // Listen for sync events from the sync engine
        window.addEventListener('kyn:friendsSynced', (e) => {
            Logger.debug('OfflineFirstFriends', 'Friends synced', e.detail);
            this._hydrateFromLocalStore();
        });

        // Listen for queue rollback events — restore UI to pre-optimistic state
        window.addEventListener('kyn:friendRollback', (e) => {
            const { item } = e.detail || {};
            if (item) {
                Logger.warn('OfflineFirstFriends', 'Rolling back optimistic state', item);
                this._hydrateFromLocalStore();
                showNotification?.('Action failed and was reverted. Please try again.', 'error');
            }
        });

        Logger.info('OfflineFirstFriends', '✅ Offline-first bridge initialized');
    },

    /**
     * Read from IndexedDB localStore and push into FriendCacheManager + KynectaStore.
     * This is what makes the UI "load instantly from local cache".
     */
    async _hydrateFromLocalStore() {
        const ls = window.KynectaFriendsLocalStore;
        if (!ls) return;
        try {
            await ls.ready();
            const [friends, incoming, sent] = await Promise.all([
                ls.getFriends(),
                ls.getPendingReceived(),
                ls.getPendingSent(),
            ]);

            // FIX Bug#2: Start from the CURRENT cache so we don't wipe localStorage-
            // loaded data when this runs concurrently with FriendCacheManager.init().
            const friendMap = new Map(FriendCacheManager._cache.friends);
            friends.forEach(r => {
                const display = {
                    id:          r.friendId,
                    localId:     r.id,
                    serverId:    r.serverId,
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    photoURL:    r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    status:      r.status,
                    addedAt:     r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                };
                friendMap.set(r.friendId, display);
            });
            FriendCacheManager._cache.friends = friendMap;

            // Push incoming requests
            const reqMap = new Map(FriendCacheManager._cache.requests);
            incoming.forEach(r => {
                reqMap.set(r.serverId || r.id, {
                    id:          r.serverId || r.id,
                    localId:     r.id,
                    senderId:    r.friendId,
                    receiverId:  r.userId,
                    status:      'pending',
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    createdAt:   r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                });
            });
            FriendCacheManager._cache.requests = reqMap;

            // Push sent requests
            const sentMap = new Map(FriendCacheManager._cache.sentRequests);
            sent.forEach(r => {
                sentMap.set(r.serverId || r.id, {
                    id:          r.serverId || r.id,
                    localId:     r.id,
                    receiverId:  r.friendId,
                    senderId:    r.userId,
                    status:      'pending',
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    createdAt:   r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                    optimistic:  r.isLocalOnly,
                });
            });
            FriendCacheManager._cache.sentRequests = sentMap;

            FriendCacheManager.syncToGlobals();
            try {
                const localFriends = Array.from(friendMap.values());
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, localFriends); // FIX: unified key
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: {
                        friends: localFriends,
                        count: localFriends.length,
                        cached: true,
                        offline: !navigator.onLine
                    }
                }));
            } catch (_error) {}
        } catch (e) {
            Logger.warn('OfflineFirstFriends', 'Hydration error', e.message);
        }
    },

    /**
     * Enqueue a friend action offline-first.
     * Creates a local record optimistically, then queues the server call.
     *
     * @param {'add'|'accept'|'reject'|'remove'|'cancel'|'block'|'unblock'} action
     * @param {string} friendId
     * @param {object} [opts]   Extra payload (requestId, notes, etc.)
     * @returns {Promise<{success:boolean, localId:string}>}
     */
    async enqueueAction(action, friendId, opts = {}) {
        const ls    = window.KynectaFriendsLocalStore;
        const queue = window.KynectaFriendQueue;

        const userId = __session.user?.id
            || window.__PARENT_SESSION__?.userId
            || window.KynectaStore?.get('user.id');

        // Determine optimistic local status
        const statusMap = {
            add:     'pending_sent',
            accept:  'accepted',
            reject:  'removed',
            remove:  'removed',
            cancel:  'removed',
            block:   'blocked',
            unblock: 'none',
        };
        const optimisticStatus = statusMap[action] || 'none';

        let localId = opts.localRecordId || null;

        if (ls) {
            try {
                await ls.ready();
                if (action === 'add') {
                    // Create new local-only record
                    const existing = await ls.getByFriendId(friendId);
                    if (existing && !['none','removed'].includes(existing.status)) {
                        return { success: false, error: 'Friendship already exists', existing };
                    }
                    const record = await ls.upsert({
                        userId:      String(userId),
                        friendId:    String(friendId),
                        status:      'pending_sent',
                        isLocalOnly: true,
                        displayName: opts.displayName,
                        username:    opts.username,
                        avatar:      opts.avatar,
                    });
                    localId = record.id;
                } else if (localId) {
                    await ls.updateStatus(localId, optimisticStatus).catch(() => {});
                } else {
                    // Try to find by friendId
                    const existing = await ls.getByFriendId(friendId);
                    if (existing) {
                        localId = existing.id;
                        await ls.updateStatus(localId, optimisticStatus).catch(() => {});
                    }
                }
            } catch (e) {
                Logger.warn('OfflineFirstFriends', 'LocalStore pre-enqueue failed', e.message);
            }
        }

        // Enqueue the server call
        if (queue) {
            queue.enqueue(action, friendId, opts, localId);
        }

        return { success: true, localId };
    },
};

// Auto-init when auth is ready
const _offlineInitTrigger = () => OfflineFirstFriends.init();
window.addEventListener('kyn:authReady', _offlineInitTrigger);
window.addEventListener('AUTH_READY', _offlineInitTrigger);
// Also init immediately if auth is already done
if (authReadyReceived && __session.ready) {
    setTimeout(() => OfflineFirstFriends.init(), 0);
}
setTimeout(() => OfflineFirstFriends.init(), 0);

// =============================================
// [saveFriendLocal] — UNIFIED PERSISTENCE HELPER
// Call this after any mutation to a friend record.
// Guarantees:
//   ✔ localStorage has data (FriendCacheManager.persist)
//   ✔ IndexedDB has data   (KynectaFriendsLocalStore)
//   ✔ UI loads from local first (KynectaStore reactive update)
//   ✔ Refresh does not delete friends
//
// Usage:
//   await saveFriendLocal(friendData, 'accepted');         // add/update friend
//   await saveFriendLocal(friendData, 'removed');          // remove friend
//   await saveFriendLocal(friendData, 'pending_sent');     // sent request
//   await saveFriendLocal(friendData, 'pending_received'); // incoming request
//   await saveFriendLocal(friendData, 'blocked');          // block
// =============================================

async function saveFriendLocal(friendData, status = 'accepted', opts = {}) {
    if (!friendData) return;

    const friendId = friendData.id || friendData.friendId;
    if (!friendId) {
        Logger.warn('saveFriendLocal', 'No friendId provided', friendData);
        return;
    }

    const userId = __session.user?.id
        || window.__PARENT_SESSION__?.userId
        || window.KynectaStore?.get('user.id');

    // ── 1. Write to FriendCacheManager (in-memory + localStorage) ──────────
    try {
        if (status === 'accepted') {
            FriendCacheManager.setFriend({ ...friendData, id: friendId });
        } else if (status === 'pending_sent') {
            FriendCacheManager.setSentRequest({
                id:         friendData.serverId || friendData.id || `temp_${friendId}`,
                receiverId: friendId,
                senderId:   userId,
                status:     'pending',
                displayName: friendData.displayName || friendData.username,
                avatar:      friendData.avatar || friendData.photoURL,
                username:    friendData.username,
                createdAt:   friendData.createdAt || new Date().toISOString(),
                isLocalOnly: opts.isLocalOnly !== false,
                ...friendData,
            });
        } else if (status === 'pending_received') {
            FriendCacheManager.setRequest({
                id:         friendData.serverId || friendData.id || `req_${friendId}`,
                senderId:   friendId,
                receiverId: userId,
                status:     'pending',
                displayName: friendData.displayName || friendData.username,
                avatar:      friendData.avatar || friendData.photoURL,
                username:    friendData.username,
                createdAt:   friendData.createdAt || new Date().toISOString(),
                isLocalOnly: opts.isLocalOnly !== false,
                ...friendData,
            });
        } else if (status === 'removed') {
            FriendCacheManager.removeFriend(friendId);
            FriendCacheManager.removeRequest?.(friendData.requestId || friendData.id);
            FriendCacheManager.removeSentRequest?.(friendData.requestId || friendData.id);
        } else if (status === 'blocked') {
            FriendCacheManager.removeFriend(friendId);
        }

        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist(); // → localStorage
    } catch (e) {
        Logger.warn('saveFriendLocal', 'FriendCacheManager update failed', e.message);
    }

    // ── 2. Write to IndexedDB (survives refresh, offline-first source) ──────
    const ls = window.KynectaFriendsLocalStore;
    if (ls) {
        try {
            await ls.ready();

            if (status === 'removed') {
                const existing = await ls.getByFriendId(String(friendId));
                if (existing) {
                    await ls.updateStatus(existing.id, 'removed').catch(() => {});
                }
            } else {
                await ls.upsert({
                    serverId:    friendData.serverId || null,
                    userId:      String(userId),
                    friendId:    String(friendId),
                    status:      status,
                    createdAt:   friendData.createdAt || new Date().toISOString(),
                    updatedAt:   new Date().toISOString(),
                    syncVersion: friendData.syncVersion || 1,
                    isLocalOnly: opts.isLocalOnly !== false,
                    displayName: friendData.displayName || friendData.username || null,
                    username:    friendData.username || null,
                    avatar:      friendData.avatar || friendData.photoURL || null,
                });
            }
        } catch (e) {
            Logger.warn('saveFriendLocal', 'IndexedDB upsert failed', e.message);
        }
    }

    // ── 3. Push into KynectaStore so reactive UI rerenders immediately ───────
    const store = window.KynectaStore;
    if (store) {
        try {
            if (status === 'accepted') {
                const list = store.get('friends.list') || [];
                const idx  = list.findIndex(f => String(f.id) === String(friendId));
                const entry = {
                    id:          friendId,
                    displayName: friendData.displayName || friendData.username || String(friendId),
                    username:    friendData.username || '',
                    avatar:      friendData.avatar || friendData.photoURL || '',
                    photoURL:    friendData.avatar || friendData.photoURL || '',
                    status:      friendData.onlineStatus || friendData.status || 'offline',
                    addedAt:     friendData.addedAt || friendData.createdAt || Date.now(),
                    isLocalOnly: opts.isLocalOnly !== false,
                };
                if (idx >= 0) { const u = [...list]; u[idx] = { ...list[idx], ...entry }; store.set('friends.list', u); }
                else           { store.set('friends.list', [...list, entry]); }
            } else if (status === 'removed') {
                const list = store.get('friends.list') || [];
                store.set('friends.list', list.filter(f => String(f.id) !== String(friendId)));
            } else if (status === 'blocked') {
                const list = store.get('friends.list') || [];
                store.set('friends.list', list.filter(f => String(f.id) !== String(friendId)));
                const blocked = store.get('friends.blocked') || [];
                if (!blocked.find(f => String(f.id) === String(friendId))) {
                    store.set('friends.blocked', [...blocked, { id: friendId, ...friendData }]);
                }
            }
        } catch (e) {
            Logger.warn('saveFriendLocal', 'KynectaStore update failed', e.message);
        }
    }

    Logger.debug('saveFriendLocal', `Saved ${friendId} as ${status}`, { isLocalOnly: opts.isLocalOnly });
}

// =============================================
// [FRIEND REQUEST MANAGER]
// =============================================


