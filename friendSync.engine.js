/**
 * friendSync.engine.js  (Offline-First Edition)
 * Fetches the server-authoritative friend list, merges it with the local
 * IndexedDB store, resolves conflicts, and keeps KynectaStore in sync.
 *
 * RULES (per spec):
 *  - Server state ALWAYS wins for final relationship status
 *  - Local-only (isLocalOnly:true) records are preserved until confirmed
 *  - No duplicate entries allowed
 *  - UI is always notified after reconciliation
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SYNC_INTERVAL      = 120_000;  // Full sync every 120s — socket handles realtime updates
    const SYNC_DEBOUNCE      = 400;      // Debounce rapid consecutive calls
    const REQUEST_TIMEOUT_MS = 15_000;
    const MAX_BACKOFF_MS     = 300_000;  // Max 5 minutes backoff

    // ── FriendSyncEngine ───────────────────────────────────────────────────

    class FriendSyncEngine {
        constructor() {
            this._syncing       = false;
            this._lastSync      = 0;
            this._syncTimer     = null;
            this._debounceTimer = null;
            this._backoffTimer  = null;
            this._consecutiveFailures = 0;
            this._currentBackoff = 0;
            this._stats = {
                totalSyncs:   0,
                successful:   0,
                failed:       0,
                lastDuration: 0,
                merged:       0,
                conflicts:    0,
            };

            this._setupListeners();
            window.KynectaFriendSyncEngine = this;
            console.log('[FriendSync] ✅ Initialized');
        }

        // ── Public API ──────────────────────────────────────────────────────

        /**
         * Perform a full sync: fetch server list + reconcile with localStore.
         * Safe to call multiple times; concurrent calls are collapsed.
         */
        async syncAll() {
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
                this._debounceTimer = null;
            }
            return new Promise((resolve) => {
                this._debounceTimer = setTimeout(async () => {
                    resolve(await this._runSync());
                }, SYNC_DEBOUNCE);
            });
        }

        /**
         * Sync only a specific relationship type (friends, requests, sent, blocked).
         */
        async syncType(type) {
            if (!this._isReady()) return null;
            switch (type) {
                case 'friends':  return this._syncFriends();
                case 'requests': return this._syncIncomingRequests();
                case 'sent':     return this._syncSentRequests();
                case 'blocked':  return this._syncBlocked();
                default: console.warn(`[FriendSync] Unknown sync type: ${type}`);
            }
        }

        startAutoSync(interval = SYNC_INTERVAL) {
            if (this._syncTimer) clearInterval(this._syncTimer);
            this._syncTimer = setInterval(() => this.syncAll(), interval);
        }

        stopAutoSync() {
            if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
        }

        getStats() { return { ...this._stats, lastSync: this._lastSync, syncing: this._syncing }; }

        // ── Core sync logic ─────────────────────────────────────────────────

        async _runSync() {
            // ── Sync loop guard (patch v1) ─────────────────────────────────
            const guard = typeof KynSyncGuard !== 'undefined' ? KynSyncGuard : null;
            if (guard) {
                if (!guard.acquire('friendSync')) {
                    return { skipped: true, reason: 'already syncing (guard)' };
                }
            } else {
                if (this._syncing) return { skipped: true, reason: 'already syncing' };
            }
            if (!navigator.onLine) {
                if (guard) guard.release('friendSync');
                return { skipped: true, reason: 'offline' };
            }
            if (!this._isReady()) {
                if (guard) guard.release('friendSync');
                return { skipped: true, reason: 'auth not ready' };
            }

            this._syncing = true;
            this._stats.totalSyncs++;
            const start = Date.now();

            this._emit('FRIEND_SYNC_STARTED');
            // FIXED: Reduced noise - only log sync start if not recently synced
            if (Date.now() - this._lastSync > SYNC_INTERVAL) {
                // console.log('[FriendSync] Starting full sync…');
            }

            try {
                await Promise.allSettled([
                    this._syncFriends(),
                    this._syncIncomingRequests(),
                    this._syncSentRequests(),
                    this._syncBlocked(),
                    this._syncAllUsers(),          // ← FIX: keep discovery cache fresh
                ]);

                // Push reconciled data into KynectaStore so UI re-renders
                await this._pushToStore();

                // Also flush any queued offline operations now that we have fresh server data
                const queue = window.KynectaFriendQueue;
                if (queue && queue.pendingCount() > 0) {
                    await queue.flush();
                }

                this._lastSync            = Date.now();
                this._stats.successful++;
                this._stats.lastDuration  = Date.now() - start;
                
                // Reset backoff on success
                this._consecutiveFailures = 0;
                this._currentBackoff = 0;
                if (this._backoffTimer) {
                    clearTimeout(this._backoffTimer);
                    this._backoffTimer = null;
                }

                this._emit('FRIEND_SYNC_COMPLETED', { duration: this._stats.lastDuration });
                if (window.KynectaStore) window.KynectaStore.set('sync.lastSync', this._lastSync);

                console.log(`[FriendSync] ✅ Sync completed in ${this._stats.lastDuration}ms`);
                return { success: true, duration: this._stats.lastDuration };

            } catch (error) {
                this._stats.failed++;
                this._consecutiveFailures++;
                
                // Calculate exponential backoff
                this._currentBackoff = Math.min(
                    REQUEST_TIMEOUT_MS * Math.pow(2, this._consecutiveFailures - 1),
                    MAX_BACKOFF_MS
                );
                
                // Only show error for first few failures to reduce noise
                if (this._consecutiveFailures <= 3) {
                    console.error('[FriendSync] Sync failed:', error);
                } else if (this._consecutiveFailures === 4) {
                    console.warn('[FriendSync] Multiple failures detected, enabling backoff - will retry silently');
                }
                
                this._emit('FRIEND_SYNC_FAILED', { error: error.message });
                
                // Schedule retry with backoff if it's a timeout/network error
                if (error.message.includes('timeout') || error.message.includes('network') || error.message.includes('fetch')) {
                    this._scheduleRetry();
                }
                
                return { success: false, error: error.message };
            } finally {
                this._syncing = false;
                if (typeof KynSyncGuard !== 'undefined') KynSyncGuard.release('friendSync');
            }
        }

        async _syncFriends() {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;

            try {
                const res = await this._request('/api/friends');
                if (!res?.success) return;

                const serverFriends = (res.data?.friends || res.data || [])
                    .map(f => this._normalizeRecord(f, 'accepted'));

                await this._reconcile(serverFriends, 'accepted');
                // FIXED: Reduced noise - only log if friends count changed
                if (serverFriends.length > 0) {
                    console.log(`[FriendSync] Friends synced: ${serverFriends.length}`);
                }
            } catch (e) {
                // Rate limit sync error messages
                if (!this._lastFriendsSyncErrorLogAt || Date.now() - this._lastFriendsSyncErrorLogAt > 8000) {
                    this._lastFriendsSyncErrorLogAt = Date.now();
                    console.warn('[FriendSync] friends sync error:', e.message);
                }
            }
        }

        async _syncIncomingRequests() {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;

            try {
                const res = await this._request('/api/friends/incoming');
                if (!res?.success) return;

                const reqs = (res.data?.requests || res.data || [])
                    .map(r => this._normalizeRecord(r, 'pending_received'));

                await this._reconcile(reqs, 'pending_received');
                // FIXED: Reduced noise - only log if requests exist
                if (reqs.length > 0) {
                    console.log(`[FriendSync] Incoming requests synced: ${reqs.length}`);
                }
            } catch (e) {
                // Rate limit sync error messages
                if (!this._lastIncomingRequestsSyncErrorLogAt || Date.now() - this._lastIncomingRequestsSyncErrorLogAt > 8000) {
                    this._lastIncomingRequestsSyncErrorLogAt = Date.now();
                    console.warn('[FriendSync] incoming requests sync error:', e.message);
                }
            }
        }

        async _syncSentRequests() {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;

            try {
                const res = await this._request('/api/friends/sent');
                if (!res?.success) return;

                const reqs = (res.data?.requests || res.data || [])
                    .map(r => this._normalizeRecord(r, 'pending_sent'));

                await this._reconcile(reqs, 'pending_sent');
                // FIXED: Reduced noise - only log if sent requests exist
                if (reqs.length > 0) {
                    console.log(`[FriendSync] Sent requests synced: ${reqs.length}`);
                }
            } catch (e) {
                // Rate limit sync error messages
                if (!this._lastSentRequestsSyncErrorLogAt || Date.now() - this._lastSentRequestsSyncErrorLogAt > 8000) {
                    this._lastSentRequestsSyncErrorLogAt = Date.now();
                    console.warn('[FriendSync] sent requests sync error:', e.message);
                }
            }
        }

        async _syncBlocked() {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;

            try {
                const res = await this._request('/api/friends/blocked');
                if (!res?.success) return;

                // FIX: API returns { blocked: [], total: 0 } — not blockedUsers, not a plain array.
                // The previous code tried (res.data?.blockedUsers || res.data || []).map(...)
                // which crashed because res.data is { blocked: [], total: 0 } — an object, not array.
                const rawList = res.data?.blocked       // ← correct key from GET /friends/blocked
                             || res.data?.blockedUsers  // legacy fallback
                             || (Array.isArray(res.data) ? res.data : []);  // plain-array fallback

                const blocked = rawList
                    .map(u => this._normalizeRecord(u, 'blocked'));

                await this._reconcile(blocked, 'blocked');
                if (blocked.length > 0) {
                    console.log(`[FriendSync] Blocked users synced: ${blocked.length}`);
                }
            } catch (e) {
                console.warn('[FriendSync] blocked sync error:', e.message);
            }
        }

        /**
         * Sync the full user directory into the IndexedDB 'users' store so
         * discovery works offline after the first online visit.
         * Falls back to rehydrating the UI from the stored IndexedDB data when
         * the network request fails (offline path).
         */
        async _syncAllUsers() {
            try {
                const res = await this._request('/api/friends/users/all?limit=500');
                if (!res?.success) throw new Error('API returned failure');

                const rawUsers = res.data?.users || (Array.isArray(res.data) ? res.data : []);
                const currentUserId = this._getCurrentUserId();
                const users = rawUsers
                    .filter(u => u?.id && String(u.id) !== String(currentUserId))
                    .map(u => ({
                        ...u,
                        id:          String(u.id),
                        photoURL:    u.photoURL || u.avatar || '',
                        displayName: u.displayName || u.name || u.username || 'User',
                    }));

                if (!users.length) return;

                // 1. Persist to IndexedDB (primary offline source)
                const ls = window.KynectaFriendsLocalStore;
                if (ls) await ls.saveUsers(users).catch(() => {});

                // 2. Persist to localStorage (secondary, quick-access)
                try { localStorage.setItem('discover_users', JSON.stringify(users)); } catch (_) {}

                // 3. Update in-memory caches
                window._allUsersCache = users;
                if (window.FriendCore) {
                    window.FriendCore._allUsers          = users;
                    window.FriendCore.discoverableUsers  = users;
                    window.FriendCore._allUsersCache     = users;
                }
                if (window.FriendCacheManager?.setUsers) {
                    window.FriendCacheManager.setUsers(users);
                }

                // 4. Notify UI
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users, count: users.length }
                }));

                console.log(`[FriendSync] Users synced: ${users.length}`);

            } catch (e) {
                // Network/API failure — rehydrate UI from IndexedDB so offline
                // discovery still works.
                console.warn('[FriendSync] users sync error (will serve cache):', e.message);
                try {
                    const ls = window.KynectaFriendsLocalStore;
                    if (!ls) return;
                    const idbUsers = await ls.getAllUsers();
                    if (!idbUsers.length) return;
                    window._allUsersCache = idbUsers;
                    if (window.FriendCore) window.FriendCore._allUsers = idbUsers;
                    window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                        detail: { users: idbUsers, count: idbUsers.length, cached: true, offline: !navigator.onLine }
                    }));
                } catch (_) {}
            }
        }

        /**
         * Reconcile server records for a given status with the local store.
         * Rules:
         *  - Server record present + local absent  → insert locally (isLocalOnly=false)
         *  - Server record present + local present → server wins for confirmed fields
         *  - Server record absent  + local present (isLocalOnly=false) → remove locally (orphan)
         *  - Server record absent  + local present (isLocalOnly=true)  → keep (unconfirmed, will retry)
         */
        async _reconcile(serverRecords, status) {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls) return;

            await ls.ready();
            const localRecords = await ls.getAll(status);
            const userId = this._getCurrentUserId();

            const serverMap = new Map();
            serverRecords.forEach(r => {
                serverMap.set(String(r.friendId), r);
                if (r.serverId) serverMap.set(String(r.serverId), r);
            });

            // FIX: Deduplicate local records by friendId first — keep the most
            // recently updated record, hard-delete the extras. This prevents
            // duplicates that arise when optimistic writes race with sync.
            const localByFriendId = new Map();
            for (const lr of localRecords) {
                const key = String(lr.friendId);
                const existing = localByFriendId.get(key);
                if (!existing) {
                    localByFriendId.set(key, lr);
                } else {
                    // Keep the server-confirmed record or the most recent one
                    const keepExisting = !existing.isLocalOnly ||
                        (existing.updatedAt || '') >= (lr.updatedAt || '');
                    if (keepExisting) {
                        await ls.hardDelete(lr.id).catch(() => {});
                    } else {
                        await ls.hardDelete(existing.id).catch(() => {});
                        localByFriendId.set(key, lr);
                    }
                }
            }
            const dedupedLocal = Array.from(localByFriendId.values());

            // Update or insert server records
            for (const sr of serverRecords) {
                // FIX: Match by friendId first (authoritative), then serverId
                const local = dedupedLocal.find(lr =>
                    String(lr.friendId) === String(sr.friendId) ||
                    (sr.serverId && lr.serverId && String(lr.serverId) === String(sr.serverId))
                );

                if (local) {
                    // Conflict: server wins for confirmed fields
                    if (local.status !== sr.status || local.serverId !== sr.serverId) {
                        this._stats.conflicts++;
                        await ls.upsert({ ...sr, id: local.id, isLocalOnly: false });
                    }
                } else {
                    // New from server — ensure no ghost optimistic record already exists
                    // by checking all statuses, not just this status bucket
                    try {
                        const ghost = await ls.getByFriendId(String(sr.friendId));
                        if (ghost && ghost.isLocalOnly && ghost.status === status) {
                            // Confirm the optimistic record instead of duplicating
                            await ls.confirm(ghost.id, sr.serverId || ghost.serverId, {
                                ...sr, isLocalOnly: false
                            });
                        } else {
                            await ls.upsert({
                                ...sr,
                                userId,
                                isLocalOnly: false,
                                syncVersion: sr.syncVersion || 1,
                            });
                            this._stats.merged++;
                        }
                    } catch (e) {
                        console.warn('[FriendSync] Upsert failed:', e.message);
                    }
                }
            }

            // Remove orphaned (server-confirmed) local records not in server list
            for (const lr of dedupedLocal) {
                if (lr.isLocalOnly) continue; // preserve pending local-only records
                const inServer = serverRecords.some(sr =>
                    String(sr.friendId) === String(lr.friendId) ||
                    (lr.serverId && sr.serverId && String(sr.serverId) === String(lr.serverId))
                );
                if (!inServer) {
                    await ls.hardDelete(lr.id);
                    console.debug(`[FriendSync] Removed orphan: ${lr.friendId}`);
                }
            }
        }

        /**
         * Normalize a server record to the standard local data model.
         */
        _normalizeRecord(raw, defaultStatus) {
            const userId = this._getCurrentUserId();
            // Server shape can be: { id, requesterId, receiverId, status, ... }
            // or a flat user: { id, username, ... } (from accepted friends list)
            const isFullRecord = raw.requesterId !== undefined || raw.receiverId !== undefined;

            if (isFullRecord) {
                // Determine friendId from the current user's perspective
                const friendId = String(raw.requesterId) === String(userId)
                    ? raw.receiverId
                    : raw.requesterId;

                // Map server status to local status vocabulary
                const statusMap = {
                    pending:  raw.requesterId === userId ? 'pending_sent' : 'pending_received',
                    accepted: 'accepted',
                    blocked:  'blocked',
                    rejected: 'removed',
                };

                return {
                    serverId:    raw.id,
                    userId:      String(userId),
                    friendId:    String(friendId),
                    status:      statusMap[raw.status] || defaultStatus,
                    createdAt:   raw.createdAt || new Date().toISOString(),
                    updatedAt:   raw.updatedAt || new Date().toISOString(),
                    syncVersion: 1,
                    isLocalOnly: false,
                    // Display data (optional, from include)
                    displayName: raw.friendRequesterUser?.username || raw.friendReceiverUser?.username || null,
                    username:    raw.friendRequesterUser?.username || raw.friendReceiverUser?.username || null,
                    avatar:      raw.friendRequesterUser?.avatar   || raw.friendReceiverUser?.avatar   || null,
                };
            } else {
                // Flat user object from accepted friends list
                return {
                    serverId:    null,
                    userId:      String(userId),
                    friendId:    String(raw.id),
                    status:      defaultStatus,
                    createdAt:   new Date().toISOString(),
                    updatedAt:   new Date().toISOString(),
                    syncVersion: 1,
                    isLocalOnly: false,
                    displayName: raw.displayName || raw.username,
                    username:    raw.username,
                    avatar:      raw.avatar,
                };
            }
        }

        /**
         * Push reconciled local data into KynectaStore so UI re-renders immediately.
         */
        async _pushToStore() {
            const ls    = window.KynectaFriendsLocalStore;
            const store = window.KynectaStore;
            if (!ls || !store) return;

            await ls.ready();

            const [rawFriends, rawIncoming, rawSent, rawBlocked] = await Promise.all([
                ls.getFriends(),
                ls.getPendingReceived(),
                ls.getPendingSent(),
                ls.getBlocked(),
            ]);

            // ── safeArray guards (patch v1) ────────────────────────────────
            const _sa = typeof safeArray === 'function' ? safeArray : (v => Array.isArray(v) ? v : []);
            const friends  = _sa(rawFriends);
            const incoming = _sa(rawIncoming);
            const sent     = _sa(rawSent);
            const blocked  = _sa(rawBlocked);

            // Notify FriendCacheManager if available
            const fcm = window.FriendCacheManager;
            if (fcm) {
                friends.forEach(f => fcm.setFriend?.(this._toDisplayFormat(f)));
                incoming.forEach(r => fcm.setRequest?.(this._toRequestFormat(r)));
                sent.forEach(r => fcm.setSentRequest?.(this._toRequestFormat(r)));
                fcm.syncToGlobals?.();
            }

            // Also write into KynectaStore directly
            const friendList   = friends.map(f => this._toDisplayFormat(f));
            const requestList  = incoming.map(r => this._toRequestFormat(r));
            const blockedList  = blocked.map(f => this._toDisplayFormat(f));

            store.batch(b => {
                b.set('friends.list', friendList);
                b.set('friends.requests', requestList);
                b.set('friends.blocked', blockedList);
            });

            // INTEGRATION: Update FriendService cache with latest data
            if (window.FriendService) {
                try {
                    // Update FriendService cache with normalized data
                    const normalizedFriends = friendList.map(friend => {
                        if (window.normalizeFriend) {
                            return window.normalizeFriend(friend);
                        }
                        return friend;
                    });

                    const normalizedRequests = requestList.map(request => {
                        if (window.normalizeFriend) {
                            return window.normalizeFriend(request);
                        }
                        return request;
                    });

                    // Update FriendService internal cache
                    window.FriendService._lastFriendsData = normalizedFriends;
                    window.FriendService._lastRequestsData = normalizedRequests;
                    
                    // Emit events to update UI
                    window.FriendService.emit('friends-loaded', normalizedFriends);
                    window.FriendService.emit('requests-loaded', normalizedRequests);
                    
                    console.log('[FriendSync] FriendService cache updated:', {
                        friends: normalizedFriends.length,
                        requests: normalizedRequests.length
                    });
                } catch (e) {
                    console.warn('[FriendSync] Failed to update FriendService:', e.message);
                }
            }

            // ── Persist to AppStorage (single source of truth — patch v1) ──
            if (window.AppStorage) {
                window.AppStorage.set('knecta_friends_cache', friendList);
                window.AppStorage.set('knecta_friend_requests_cache', requestList);
                console.log('[LOCAL SAVE] friends pushed to AppStorage:', friendList.length);
            }

            // Dispatch event for UI listeners
            window.dispatchEvent(new CustomEvent('kyn:friendsSynced', {
                detail: {
                    friends:  friends.length,
                    incoming: incoming.length,
                    sent:     sent.length,
                    blocked:  blocked.length,
                    timestamp: Date.now(),
                }
            }));
        }

        _toDisplayFormat(record) {
            return {
                id:          record.friendId,
                serverId:    record.serverId,
                localId:     record.id,
                status:      record.status,
                displayName: record.displayName || record.username || record.friendId,
                username:    record.username    || '',
                avatar:      record.avatar      || '',
                photoURL:    record.avatar      || '',
                addedAt:     record.createdAt,
                updatedAt:   record.updatedAt,
                isLocalOnly: record.isLocalOnly,
            };
        }

        _toRequestFormat(record) {
            return {
                id:          record.serverId || record.id,
                localId:     record.id,
                senderId:    record.status === 'pending_sent' ? record.userId : record.friendId,
                receiverId:  record.status === 'pending_sent' ? record.friendId : record.userId,
                status:      record.status === 'pending_sent' ? 'pending' : 'pending',
                friendId:    record.friendId,
                displayName: record.displayName || record.username || record.friendId,
                username:    record.username || '',
                avatar:      record.avatar   || '',
                createdAt:   record.createdAt,
                isLocalOnly: record.isLocalOnly,
            };
        }

        // ── HTTP helper ──────────────────────────────────────────────────────

        async _request(endpoint, options = {}) {
            const token = window.__PARENT_SESSION__?.token
                || window.AUTH_SESSION?.token
                || localStorage.getItem('kynecta_token');

            if (!token) {
                throw new Error('No authentication token available');
            }

            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            };

            // FIX: Increased from 8s — Render.com cold starts can take 10-15s
            const EFFECTIVE_TIMEOUT = Math.min(REQUEST_TIMEOUT_MS, 25000);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), EFFECTIVE_TIMEOUT);

            try {
                // Use parent communication system like other modules
                if (window.parent && window.parent !== window) {
                    return new Promise((resolve, reject) => {
                        const requestId = 'friendSync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        const timeoutId = setTimeout(() => {
                            reject(new Error('API request timeout'));
                        }, EFFECTIVE_TIMEOUT);

                        // FIX: Listen on THIS window — API_RESPONSE is posted back TO the
                        // child iframe by chat.html via event.source.postMessage().
                        // window.parent.addEventListener was wrong and silently ate all responses.
                        const handleMessage = (event) => {
                            if (event.data && event.data.type === 'API_RESPONSE' && event.data.requestId === requestId) {
                                clearTimeout(timeoutId);
                                window.removeEventListener('message', handleMessage);
                                
                                if (event.data.payload && event.data.payload.success !== false) {
                                    resolve(event.data.payload);
                                } else {
                                    const errorMsg = event.data.payload?.message || 'API operation failed';
                                    // Handle 401/403 authentication errors specifically
                                    if (event.data.status === 401 || event.data.status === 403) {
                                        reject(new Error(`Authentication failed: ${errorMsg}`));
                                    } else {
                                        reject(new Error(errorMsg));
                                    }
                                }
                            }
                        };

                        window.addEventListener('message', handleMessage);
                        
                        // Send API request to parent
                        window.parent.postMessage({
                            type: 'API_REQUEST',
                            endpoint: endpoint,
                            method: options.method || 'GET',
                            requestId: requestId,
                            timestamp: Date.now()
                        }, '*');
                    });
                }
                
                // Fallback to direct fetch (should not reach here in iframe mode)
                const res = await fetch(endpoint, {
                    method: 'GET',
                    ...options,
                    headers,
                    credentials: 'include',
                    signal: controller.signal,
                });
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        throw new Error(`Authentication failed: HTTP ${res.status}`);
                    }
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.json();
            } finally {
                clearTimeout(timeout);
            }
        }

        // ── Utilities ────────────────────────────────────────────────────────

        _getCurrentUserId() {
            return window.__PARENT_SESSION__?.userId
                || window.AUTH_SESSION?.userId
                || window.KynectaStore?.get('user.id')
                || null;
        }

        _isReady() {
            return !!this._getCurrentUserId();
        }

        _emit(event, data = {}) {
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(event, { ...data, timestamp: Date.now() });
            }
        }

        _setupListeners() {
            // Sync when network comes back
            window.addEventListener('online', () => {
                console.log('[FriendSync] Network restored – triggering sync');
                this.syncAll();
            });

            // Sync after auth is ready
            window.addEventListener('kyn:authReady', () => this.syncAll());
            window.addEventListener('AUTH_READY',    () => this.syncAll());

            // Sync when a queue item succeeds (keeps local state fresh)
            window.addEventListener('kyn:friendConfirmed', () => this.syncAll());

            // Listen for real-time events that should trigger a reconcile
            if (window.KynectaEventBus) {
                // FIX: immediately write incoming request to IndexedDB so it
                // survives offline / page reload, then do a light API reconcile.
                window.KynectaEventBus.on?.('FRIEND_REQUEST_RECEIVED', async (data) => {
                    if (data?.request) {
                        try {
                            const ls = window.KynectaFriendsLocalStore;
                            if (ls) {
                                const record = this._normalizeRecord(data.request, 'pending_received');
                                await ls.upsert({ ...record, isLocalOnly: false });
                                // Push to UI immediately without waiting for API
                                const reqFormatted = this._toRequestFormat(record);
                                if (window.FriendCacheManager?.setRequest) {
                                    window.FriendCacheManager.setRequest(reqFormatted);
                                    window.FriendCacheManager.syncToGlobals?.();
                                }
                                window.dispatchEvent(new CustomEvent('requestsUpdated', {
                                    detail: {
                                        requests: window.friendRequests || [],
                                        count:    (window.friendRequests || []).length,
                                        source:   'websocket'
                                    }
                                }));
                            }
                        } catch (e) {
                            console.warn('[FriendSync] WS request persist error:', e.message);
                        }
                    }
                    // Background API reconcile to confirm server state
                    this.syncType('requests');
                });

                // FIX: handle both event name variants:
                //   'FRIEND_ACCEPTED'          — emitted by friendSync_engine itself / EventBus
                //   'FRIEND_REQUEST_ACCEPTED'  — emitted by parent bridge when server sends friend:accepted
                // Both must update the local store and trigger a friends sync.
                const _handleFriendAccepted = async (data) => {
                    const _friendId = data?.friendId || data?.acceptedById || data?.userId;
                    if (_friendId) {
                        try {
                            const ls = window.KynectaFriendsLocalStore;
                            if (ls) {
                                await ls.ready();
                                const existing = await ls.getByFriendId(String(_friendId));
                                if (existing) {
                                    // Promote pending_sent or pending_received → accepted
                                    await ls.confirm(
                                        existing.id,
                                        data?.requestId || existing.serverId,
                                        { status: 'accepted', isLocalOnly: false, updatedAt: new Date().toISOString() }
                                    );
                                } else {
                                    // No record yet (sender side may not have one) — create it
                                    const _friendProfile = data?.user || data?.friend || {};
                                    await ls.save({
                                        friendId:    String(_friendId),
                                        userId:      window.__session?.user?.id
                                                     ? String(window.__session.user.id)
                                                     : 'unknown',
                                        serverId:    data?.requestId || null,
                                        status:      'accepted',
                                        isLocalOnly: false,
                                        displayName: _friendProfile.displayName || _friendProfile.username || '',
                                        avatar:      _friendProfile.avatar || _friendProfile.photoURL || '',
                                        username:    _friendProfile.username || '',
                                        createdAt:   new Date().toISOString(),
                                        updatedAt:   new Date().toISOString(),
                                    });
                                }
                                // Also update FriendCacheManager in-memory immediately
                                if (window.FriendCacheManager?.setFriend) {
                                    const _friendData = data?.user || data?.friend || {};
                                    window.FriendCacheManager.setFriend({
                                        ..._friendData,
                                        id:     String(_friendId),
                                        status: 'accepted'
                                    });
                                    window.FriendCacheManager.syncToGlobals?.();
                                }
                            }
                        } catch (_e) {
                            console.warn('[FriendSync] FRIEND_ACCEPTED local store update failed:', _e.message);
                        }
                    }
                    this.syncType('friends');
                };

                window.KynectaEventBus.on?.('FRIEND_ACCEPTED',          _handleFriendAccepted);
                window.KynectaEventBus.on?.('FRIEND_REQUEST_ACCEPTED',  _handleFriendAccepted);

                window.KynectaEventBus.on?.('FRIEND_REMOVED', () => this.syncType('friends'));
            }

            // FIX: Listen for FRIENDS_SYNC broadcast from parent (app_realtime_socket.js)
            // so modules like chat, status, call that embed this engine get instant updates
            // when a friend accept/remove happens in friend-core's iframe.
            window.addEventListener('message', (evt) => {
                if (!evt.data || typeof evt.data !== 'object') return;
                const { type, friends, requests } = evt.data;

                if (type === 'FRIENDS_SYNC' || type === 'FRIENDS_DATA') {
                    // Update window globals so all inline consumers see fresh data
                    if (Array.isArray(friends)) {
                        window.friends = friends;
                        // Merge into FriendCacheManager if available
                        if (window.FriendCacheManager && typeof window.FriendCacheManager.setFriend === 'function') {
                            friends.forEach(f => {
                                if (f && f.id) window.FriendCacheManager.setFriend(f);
                            });
                            window.FriendCacheManager.syncToGlobals?.();
                        }
                        window.dispatchEvent(new CustomEvent('friendsUpdated', {
                            detail: { friends, source: type, realtime: true }
                        }));
                        window.dispatchEvent(new CustomEvent('updateFriendCounts'));
                    }
                    if (Array.isArray(requests)) {
                        window.friendRequests = requests;
                        window.dispatchEvent(new CustomEvent('requestsUpdated', {
                            detail: { requests, source: type }
                        }));
                    }
                }

                if (type === 'FRIEND_RELATIONSHIP_CHANGED') {
                    const { action, friendId, friend } = evt.data;
                    if (action === 'accepted' && friendId) {
                        if (window.FriendCacheManager?.setFriend && friend) {
                            window.FriendCacheManager.setFriend({ ...friend, id: String(friendId) });
                            window.FriendCacheManager.syncToGlobals?.();
                        }
                        this.syncType('friends');
                    } else if (action === 'removed') {
                        if (window.FriendCacheManager?.removeFriend) {
                            window.FriendCacheManager.removeFriend(String(friendId));
                            window.FriendCacheManager.syncToGlobals?.();
                        }
                        this.syncType('friends');
                    }
                }
            });

            // Also handle the window-level FRIENDS_SYNC CustomEvent (same-frame)
            window.addEventListener('FRIENDS_SYNC', (evt) => {
                const { friends } = evt.detail || {};
                if (Array.isArray(friends) && window.FriendCacheManager?.setFriend) {
                    friends.forEach(f => { if (f && f.id) window.FriendCacheManager.setFriend(f); });
                    window.FriendCacheManager.syncToGlobals?.();
                    window.dispatchEvent(new CustomEvent('friendsUpdated', {
                        detail: { friends, source: 'FRIENDS_SYNC', realtime: true }
                    }));
                }
            });

            window.addEventListener('kyn:friendsSynced', () => {}); // no-op sentinel
        }

        // ── Backoff retry mechanism ────────────────────────────────────────
        _scheduleRetry() {
            if (this._backoffTimer) {
                clearTimeout(this._backoffTimer);
            }
            
            this._backoffTimer = setTimeout(async () => {
                // Only retry if we're still offline and haven't succeeded in the meantime
                if (this._consecutiveFailures > 0 && !navigator.onLine) {
                    await this._runSync();
                }
            }, this._currentBackoff);
        }
    }

    // ── Bootstrap ────────────────────────────────────────────────────────────

    const engine = new FriendSyncEngine();
    window.KynectaFriendSyncEngine = engine;

    // Start auto-sync
    engine.startAutoSync();

    console.log('[FriendSync] ✅ Ready');
})();