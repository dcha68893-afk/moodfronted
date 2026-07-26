// =============================================
// FRIEND CORE — OPERATIONS
// Friend/contact/group state, request management, data loading from backend.
// Part of the friend-core.js split — see friend-core.bootstrap.js for details.
// =============================================

import {
    secureFetch
} from './js/api.core.js';
import {
    FriendCacheManager,
    IframeEnvironment,
    LIFECYCLE_STATES,
    LOCAL_STORAGE_KEYS,
    Logger,
    MODULE_NAME,
    OfflineFirstFriends,
    ParentCommunicationManager,
    PollingManager,
    SafeStorage,
    SandboxDetector,
    SecurityValidator,
    SessionManager,
    StatusManager,
    TokenPromise,
    __session,
    _messageQueue,
    assertActive,
    authReadyReceived,
    authorizedRequest,
    currentState,
    generateMessageId,
    generateRequestId,
    handleAuthReady,
    handleParentReady,
    parentReadyReceived,
    queueRequest,
    requestQueue,
    safeSend,
    sendChildReady,
    sendMessageInternal,
    setParentReadyReceived
} from './friend-core.bootstrap.js';
import {
    applySettingToFriendModule,
    loadFriendRequestsFromBackend,
    loadFriendsFromBackend,
    loadSentRequestsFromBackend,
    showNotification,
    updateFriendCounts
} from './friend-core.ui-bridge.js';

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

const FriendRequestManager = {
    _pendingOperations: new Map(),
    _maxOperationAge: 30000,
    _requestInProgress: new Set(),

    async sendFriendRequest(userId, options = {}) {
        if (!assertActive('sendFriendRequest')) {
            // FIX: Module not yet ACTIVE — queue the request to fire once active.
            // Previously this returned { success: false } silently, making the
            // button appear completely broken to the user. Now we wait and retry.
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try {
                        const result = await this.sendFriendRequest(userId, options);
                        resolve(result);
                    } catch (error) { reject(error); }
                });
            });
        }

        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try {
                        const result = await this.sendFriendRequest(userId, options);
                        resolve(result);
                    } catch (error) { reject(error); }
                });
            });
        }

        if (!userId) return { success: false, error: 'Invalid user ID' };

        const opId = `send_${userId}_${Date.now()}`;

        if (this._pendingOperations.has(userId)) {
            // Already in-flight — return same promise so UI gets the result
            return this._pendingOperations.get(userId).promise;
        }

        if (this._requestInProgress.has(userId)) {
            // FIX: Previously returned silent { success: false } — now shows feedback
            // and clears the stale lock so the user can retry immediately.
            this._requestInProgress.delete(userId);
            showNotification?.('Friend request already being sent, please wait a moment...', 'info');
            return { success: false, error: 'Request already in progress' };
        }

        const promise = this._executeSendRequest(userId, options, opId);
        this._pendingOperations.set(userId, { promise, timestamp: Date.now() });
        this._requestInProgress.add(userId);

        promise.finally(() => {
            setTimeout(() => {
                this._pendingOperations.delete(userId);
                this._requestInProgress.delete(userId);
            }, 400); // FIX: was 1000ms — shorter window prevents blocking retry clicks
        });

        return promise;
    },

    async _executeSendRequest(userId, options, opId) {
        Logger.info('FriendRequestManager', 'Sending friend request (offline-first)', { userId, options });

        // ── Optimistic local record ──────────────────────────────────────────
        const tempId = `temp_${Date.now()}`;
        const optimisticRequest = {
            id:          tempId,
            receiverId:  userId,
            senderId:    __session.user?.id,
            status:      'pending',
            timestamp:   Date.now(),
            category:    options.category || 'friend',
            note:        options.note || '',
            isTemporary: options.isTemporary || false,
            duration:    options.duration || null,
            isBusiness:  options.isBusiness || false,
            optimistic:  true,
            isLocalOnly: true,
            displayName: options.displayName || null,
            username:    options.username    || null,
            avatar:      options.avatar      || null,
        };

        // FIX: Non-blocking save — awaiting IndexedDB here was hanging the entire flow
        saveFriendLocal({ id: userId, serverId: null, createdAt: new Date().toISOString(),
            displayName: options.displayName, username: options.username, avatar: options.avatar },
            'pending_sent', { isLocalOnly: true }).catch(() => {});

        FriendCacheManager.setSentRequest(optimisticRequest);
        FriendCacheManager.syncToGlobals();

        // Dispatch immediately so UI shows "Pending" button before network call
        window.dispatchEvent(new CustomEvent('friendRequestSent', {
            detail: { request: optimisticRequest, optimistic: true }
        }));
        window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
            detail: { requests: FriendCacheManager.getAllSentRequests?.() || [], optimistic: true }
        }));

        // ── Offline path ─────────────────────────────────────────────────────
        if (!navigator.onLine) {
            Logger.info('FriendRequestManager', 'Offline – request queued for later');
            await OfflineFirstFriends.enqueueAction('add', userId, { ...options }, null);
            return { success: true, queued: true, request: optimisticRequest };
        }

        // ── Online path ──────────────────────────────────────────────────────
        // FIX: Use direct fetch — postMessage bridge POST can silently time out (30s).
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://nexora-3bla.onrender.com/api';
        const _token = __session.token || localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('nexopa_token') || '';
        try {
            let response;
            try {
                // P1/P2 FIX: Pass all fields server now accepts (isTemporary, duration, isBusiness, message)
                const _requestBody = {
                    receiverId:  userId,
                    category:    options.category    || 'friend',
                    note:        options.note        || '',
                    isTemporary: options.isTemporary || false,
                    duration:    options.duration    || null,
                    isBusiness:  options.isBusiness  || false,
                    message:     options.message     || '',
                };
                const _res = await fetch(`${_apiBase}/friends/requests/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
                    body: JSON.stringify(_requestBody)
                });
                const _json = await _res.json().catch(() => ({}));
                const _inner = (_json && 'data' in _json) ? _json.data : _json;
                response = { success: _res.ok, statusCode: _res.status, data: _inner,
                             error: _json.error || _json.message || null };
                console.log('[FriendRequestManager] Send result:', _res.status, response.success);
            } catch (_fetchErr) {
                Logger.warn('FriendRequestManager', 'Direct fetch failed, using bridge', _fetchErr.message);
                response = await authorizedRequest('/api/friends/requests/send', {
                    method: 'POST',
                    body: JSON.stringify({ receiverId: userId, category: options.category || 'friend', note: options.note || '' })
                });
            }

            Logger.info('FriendRequestManager', 'Send request response', { success: response?.success });

            if (response && response.success) {
                let requestData = null;
                if (response.data) {
                    requestData = response.data.request
                        || response.data.data?.request
                        || (response.data.id ? response.data : null)
                        || response.data;
                }

                // Replace temp optimistic with confirmed server record
                FriendCacheManager.removeSentRequest(tempId);

                const confirmedData = {
                    id:          requestData?.id       || tempId,
                    serverId:    requestData?.id       || null,
                    receiverId:  requestData?.receiverId || userId,
                    senderId:    requestData?.requesterId || __session.user?.id,
                    status:      requestData?.status   || 'pending',
                    createdAt:   requestData?.createdAt || new Date().toISOString(),
                    timestamp:   requestData?.createdAt || Date.now(),
                    displayName: options.displayName   || null,
                    username:    options.username      || null,
                    avatar:      options.avatar        || null,
                    isLocalOnly: false,
                };

                FriendCacheManager.setSentRequest(confirmedData);
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();

                window.dispatchEvent(new CustomEvent('friendRequestSent', { detail: { request: confirmedData, success: true } }));
                window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
                    detail: { requests: FriendCacheManager.getAllSentRequests?.() || [], confirmed: true }
                }));

                // Non-blocking background persist + reload
                saveFriendLocal({ id: userId, ...confirmedData }, 'pending_sent', { isLocalOnly: false }).catch(() => {});
                setTimeout(() => {
                    loadSentRequestsFromBackend().catch(() => {});
                    loadFriendRequestsFromBackend().catch(() => {});
                }, 800);

                showNotification?.('Friend request sent!', 'success');
                return { success: true, request: confirmedData };

            } else {
                FriendCacheManager.removeSentRequest(tempId);
                saveFriendLocal({ id: userId }, 'removed', { isLocalOnly: false }).catch(() => {});
                FriendCacheManager.syncToGlobals();
                window.dispatchEvent(new CustomEvent('friendRequestFailed', {
                    detail: { request: optimisticRequest, error: response?.error || response?.message || 'API error' }
                }));
                window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
                    detail: { requests: FriendCacheManager.getAllSentRequests?.() || [] }
                }));
                showNotification?.(response?.error || response?.message || 'Failed to send friend request', 'error');
                return { success: false, error: response?.error || response?.message || 'Failed to send request' };
            }

        } catch (error) {
            Logger.error('FriendRequestManager', 'Send request failed – keeping queued', error);
            optimisticRequest.queued = true;
            FriendCacheManager.setSentRequest(optimisticRequest);
            FriendCacheManager.syncToGlobals();
            OfflineFirstFriends.enqueueAction('add', userId, { ...options }, null).catch(() => {});
            window.dispatchEvent(new CustomEvent('friendRequestQueued', { detail: { request: optimisticRequest, error: error.message } }));
            return { success: true, queued: true, request: optimisticRequest };
        }
    },

    async acceptFriendRequest(requestId, friendId) {
        console.log('[FriendRequestManager] acceptFriendRequest called with:', { requestId, friendId });

        if (!assertActive('acceptFriendRequest')) {
            console.error('[FriendRequestManager] Module not active');
            return { success: false, error: 'Module not active' };
        }

        if (!authReadyReceived || !__session.ready || !__session.token) {
            console.log('[FriendRequestManager] Auth not ready, queueing request');
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try {
                        const result = await this.acceptFriendRequest(requestId, friendId);
                        resolve(result);
                    } catch (error) { reject(error); }
                });
            });
        }

        if (!requestId || !friendId) {
            console.error('[FriendRequestManager] Invalid request data:', { requestId, friendId });
            return { success: false, error: 'Invalid request data' };
        }

        const existingRequest = FriendCacheManager.getRequest(requestId);

        // ── Optimistic: move pending_received → accepted in all layers ───────
        FriendCacheManager.removeRequest(requestId);

        // FIX: Wrap LocalStore in 2s timeout — ls.ready()/getByFriendId() hangs silently in iframe
        const ls = window.KynectaFriendsLocalStore;
        let localRecordId = null;
        try {
            if (ls) {
                await Promise.race([
                    (async () => {
                        await ls.ready();
                        const lr = await ls.getByFriendId(String(friendId)).catch(() => null);
                        if (lr) { localRecordId = lr.id; await ls.updateStatus(lr.id, 'accepted').catch(() => {}); }
                    })(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('ls timeout')), 2000))
                ]);
            }
        } catch (_) {}
        FriendCacheManager.syncToGlobals();

        // ── Offline path ─────────────────────────────────────────────────────
        if (!navigator.onLine) {
            await OfflineFirstFriends.enqueueAction('accept', friendId, { requestId }, localRecordId);
            return { success: true, queued: true };
        }

        // ── Online path (direct fetch — bridge POST silently times out) ──────
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://nexora-3bla.onrender.com/api';
        const _token = __session.token || localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('nexopa_token') || '';
        try {
            let response;
            try {
                const _res = await fetch(`${_apiBase}/friends/requests/${requestId}/accept`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` }
                });
                const _json = await _res.json().catch(() => ({}));
                const _inner = (_json && 'data' in _json) ? _json.data : _json;
                response = { success: _res.ok, statusCode: _res.status, data: _inner, error: _json.error || _json.message || null };
                console.log('[FriendRequestManager] Direct accept result:', _res.status, response.success);
            } catch (_fetchErr) {
                Logger.warn('acceptFriendRequest', 'Direct fetch failed, using bridge', _fetchErr.message);
                response = await authorizedRequest(`/api/friends/requests/${requestId}/accept`, { method: 'POST' });
            }

            console.log('[FriendRequestManager] Accept request response:', response);
            try {
            if (response && response.success) {
                const _rd = response.data || {};
                const _rdf = _rd.friendRequest || _rd.friendship || {};
                const _rdu = _rd.friend || _rd.user || {};
                let newFriend = {
                    id:          String(_rdu.id || friendId),
                    serverId:    _rdf.id || null,
                    displayName: _rdu.displayName || _rdu.username || existingRequest?.senderName || existingRequest?.user?.displayName || 'Friend',
                    username:    _rdu.username || existingRequest?.senderUsername || existingRequest?.user?.username || '',
                    avatar:      _rdu.avatar || existingRequest?.senderAvatar || existingRequest?.user?.avatar || '',
                    photoURL:    _rdu.avatar || existingRequest?.senderAvatar || existingRequest?.user?.avatar || '',
                    firstName:   _rdu.firstName || '', lastName: _rdu.lastName || '',
                    status:      _rdu.status || 'offline', lastSeen: _rdu.lastSeen || null,
                    addedAt: Date.now(), category: existingRequest?.category || 'friend', isLocalOnly: false,
                };
                // Immediate cache update + event dispatch — NO awaits before events
                FriendCacheManager.setFriend(newFriend);
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();
                window.dispatchEvent(new CustomEvent('friendRequestAccepted', { detail: { requestId, friendId, success: true, friend: newFriend } }));
                window.dispatchEvent(new CustomEvent('friendAdded', { detail: { friend: newFriend } }));
                window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: FriendCacheManager.getAllFriends(), realtime: true } }));
                if (typeof showNotification === 'function') showNotification(`You are now friends with ${newFriend.displayName}!`, 'success');
                const _sid = existingRequest?.senderId || existingRequest?.sender?.id || existingRequest?.requesterId || friendId;
                safeSend({ type: 'FRIEND_ACCEPTED', payload: {
                    requestId, friendId, friend: newFriend,
                    targetUserId: String(_sid), acceptedById: String(__session.user?.id || ''),
                    acceptedByName: __session.user?.displayName || __session.user?.username || '',
                    acceptedByAvatar: __session.user?.avatar || __session.user?.photoURL || '',
                    timestamp: Date.now()
                }});
                // Immediately push full friends list to parent so ALL modules
                // (chat, call, status, groups) update without waiting for next poll.
                try {
                    window.parent.postMessage({
                        type: 'FRIENDS_DATA',
                        friends: FriendCacheManager.getAllFriends(),
                        source: 'friend-core',
                        trigger: 'accept',
                        timestamp: Date.now()
                    }, '*');
                    window.parent.postMessage({
                        type: 'FRIEND_RELATIONSHIP_CHANGED',
                        action: 'accepted',
                        friendId: String(newFriend.id),
                        targetUserId: String(_sid),
                        acceptedById: String(__session.user?.id || ''),
                        friend: newFriend,
                        timestamp: Date.now()
                    }, '*');
                } catch (_) {}
                saveFriendLocal(newFriend, 'accepted', { isLocalOnly: false }).catch(() => {});
                if (ls && localRecordId) ls.confirm(localRecordId, newFriend.serverId, { status: 'accepted', ...newFriend }).catch(() => {});
                setTimeout(async () => {
                    await loadFriendsFromBackend().catch(() => {});
                    await loadFriendRequestsFromBackend().catch(() => {});
                    await loadSentRequestsFromBackend().catch(() => {});
                    FriendCacheManager.syncToGlobals(); FriendCacheManager.persist();
                    window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: FriendCacheManager.getAllFriends(), realtime: true, delayed: true } }));
                    window.dispatchEvent(new CustomEvent('updateFriendCounts'));
                }, 1000);
                return { success: true, friend: newFriend };
            } else {
                const errorMsg = response?.error || response?.message || 'Accept failed';
                if (existingRequest) FriendCacheManager.setRequest(existingRequest);
                if (ls && localRecordId) ls.updateStatus(localRecordId, 'pending_received').catch(() => {});
                FriendCacheManager.syncToGlobals();
                if (typeof showNotification === 'function') showNotification(errorMsg, 'error');
                return { success: false, error: errorMsg };
            }
            } catch (innerError) {
                console.error('[FriendRequestManager] Accept inner error:', innerError);
                OfflineFirstFriends.enqueueAction('accept', friendId, { requestId }, localRecordId).catch(() => {});
                if (existingRequest) FriendCacheManager.setRequest(existingRequest);
                FriendCacheManager.syncToGlobals();
                return { success: true, queued: true, error: innerError.message };
            }
        } catch (error) {
            console.error('[FriendRequestManager] Accept outer error:', error);
            return { success: false, error: error.message };
        }
    },

    async declineFriendRequest(requestId) {
        if (!assertActive('declineFriendRequest')) {
            return { success: false, error: 'Module not active' };
        }

        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try { resolve(await this.declineFriendRequest(requestId)); }
                    catch (error) { reject(error); }
                });
            });
        }

        if (!requestId) return { success: false, error: 'Invalid request ID' };

        Logger.info('FriendRequestManager', 'Declining friend request', { requestId });

        const existingRequest = FriendCacheManager.getRequest(requestId);
        // FIX: socket-delivered requests use 'requesterId'; polling-fetched use 'senderId'
        const friendId = existingRequest?.senderId || existingRequest?.requesterId || existingRequest?.user?.id || existingRequest?.sender?.id;

        // Optimistic: remove from incoming requests + persist removed state
        FriendCacheManager.removeRequest(requestId);
        if (friendId) {
            await saveFriendLocal({ id: friendId }, 'removed', { isLocalOnly: true }).catch(() => {});
        }

        const ls = window.KynectaFriendsLocalStore;
        let localRecordId = null;
        if (ls && friendId) {
            try {
                const lr = await ls.getByFriendId(String(friendId));
                if (lr) { localRecordId = lr.id; }
            } catch (e) { /* non-fatal */ }
        }
        FriendCacheManager.syncToGlobals();

        if (!navigator.onLine) {
            await OfflineFirstFriends.enqueueAction('reject', friendId || requestId, { requestId }, localRecordId);
            return { success: true, queued: true };
        }

        try {
            const response = await authorizedRequest(`/api/friends/requests/${requestId}/reject`, {
                method: 'POST'
            });

            if (response && response.success) {
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();
                window.dispatchEvent(new CustomEvent('friendRequestDeclined', {
                    detail: { requestId, success: true }
                }));
                safeSend({ type: 'FRIEND_REJECTED', payload: { requestId, timestamp: Date.now() } });
                setTimeout(() => PollingManager._fetchIncomingRequests(), 500);
                return { success: true };
            } else {
                // Rollback
                if (existingRequest) FriendCacheManager.setRequest(existingRequest);
                if (ls && localRecordId) {
                    await ls.updateStatus(localRecordId, 'pending_received').catch(() => {});
                }
                FriendCacheManager.syncToGlobals();
                return { success: false, error: response?.error || 'Decline failed' };
            }
        } catch (error) {
            Logger.error('FriendRequestManager', 'Decline failed – queuing', error);
            await OfflineFirstFriends.enqueueAction('reject', friendId || requestId, { requestId }, localRecordId);
            // Restore while queued
            if (existingRequest) FriendCacheManager.setRequest(existingRequest);
            if (ls && localRecordId) {
                await ls.updateStatus(localRecordId, 'pending_received').catch(() => {});
            }
            FriendCacheManager.syncToGlobals();
            return { success: true, queued: true };
        }
    },

    async cancelFriendRequest(requestId) {
        if (!assertActive('cancelFriendRequest')) {
            return { success: false, error: 'Module not active' };
        }

        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try { resolve(await this.cancelFriendRequest(requestId)); }
                    catch (error) { reject(error); }
                });
            });
        }

        if (!requestId) return { success: false, error: 'Invalid request ID' };

        Logger.info('FriendRequestManager', 'Canceling friend request', { requestId });

        const existingSent = FriendCacheManager.getSentRequest?.(requestId);
        const friendId = existingSent?.receiverId;

        // Optimistic: remove from sent requests + persist removed state
        FriendCacheManager.removeSentRequest(requestId);
        if (friendId) {
            await saveFriendLocal({ id: friendId }, 'removed', { isLocalOnly: true }).catch(() => {});
        }

        const ls = window.KynectaFriendsLocalStore;
        let localRecordId = null;
        if (ls && friendId) {
            try {
                const lr = await ls.getByFriendId(String(friendId));
                if (lr) { localRecordId = lr.id; }
            } catch (e) { /* non-fatal */ }
        }
        FriendCacheManager.syncToGlobals();

        if (!navigator.onLine) {
            await OfflineFirstFriends.enqueueAction('cancel', friendId || requestId, { requestId }, localRecordId);
            return { success: true, queued: true };
        }

        try {
            const response = await authorizedRequest(`/api/friends/requests/${requestId}`, {
                method: 'DELETE'
            });

            if (response && response.success) {
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();
                window.dispatchEvent(new CustomEvent('friendRequestCancelled', {
                    detail: { requestId, success: true }
                }));
                safeSend({ type: 'FRIEND_REJECTED', payload: { requestId, timestamp: Date.now() } });
                return { success: true };
            } else {
                // Rollback
                if (existingSent) FriendCacheManager.setSentRequest(existingSent);
                if (ls && localRecordId) {
                    await ls.updateStatus(localRecordId, 'pending_sent').catch(() => {});
                }
                FriendCacheManager.syncToGlobals();
                return { success: false, error: response?.error || 'Cancel failed' };
            }
        } catch (error) {
            Logger.error('FriendRequestManager', 'Cancel failed – queuing', error);
            await OfflineFirstFriends.enqueueAction('cancel', friendId || requestId, { requestId }, localRecordId);
            if (existingSent) FriendCacheManager.setSentRequest(existingSent);
            if (ls && localRecordId) {
                await ls.updateStatus(localRecordId, 'pending_sent').catch(() => {});
            }
            FriendCacheManager.syncToGlobals();
            return { success: true, queued: true };
        }
    },

    cleanup() {
        const now = Date.now();
        for (const [id, op] of this._pendingOperations) {
            if (now - op.timestamp > this._maxOperationAge) {
                this._pendingOperations.delete(id);
                this._requestInProgress.delete(id.split('_')[1]);
            }
        }
    }
};

setInterval(() => FriendRequestManager.cleanup(), 60000);

function handleFriendAcceptedEvent(event) {
    const { requestId, friendId, friend } = event.detail || {};
    
    if (!friendId && !requestId) {
        Logger.warn('FriendAcceptedHandler', 'Invalid FRIEND_ACCEPTED event', event.detail);
        return;
    }
    
    Logger.info('FriendAcceptedHandler', 'Processing FRIEND_ACCEPTED event', { requestId, friendId });
    
    // Reload friends from backend
    loadFriendsFromBackend().then(result => {
        Logger.info('FriendAcceptedHandler', 'Friends reloaded after FRIEND_ACCEPTED', result);
    }).catch(error => {
        Logger.error('FriendAcceptedHandler', 'Failed to reload friends', error);
    });
    
    // Reload sent requests
    loadSentRequestsFromBackend().then(result => {
        Logger.info('FriendAcceptedHandler', 'Sent requests reloaded after FRIEND_ACCEPTED', result);
    }).catch(error => {
        Logger.error('FriendAcceptedHandler', 'Failed to reload sent requests', error);
    });
    
    // Reload incoming requests
    loadFriendRequestsFromBackend().then(result => {
        Logger.info('FriendAcceptedHandler', 'Incoming requests reloaded after FRIEND_ACCEPTED', result);
    }).catch(error => {
        Logger.error('FriendAcceptedHandler', 'Failed to reload incoming requests', error);
    });
    
    // Dispatch internal UI update event
    window.dispatchEvent(new CustomEvent('friendsListNeedsRefresh', {
        detail: {
            source: 'FRIEND_ACCEPTED',
            requestId,
            friendId,
            timestamp: Date.now()
        }
    }));
    
    window.dispatchEvent(new CustomEvent('refreshAllFriendData', {
        detail: {
            source: 'FRIEND_ACCEPTED',
            timestamp: Date.now()
        }
    }));
}

window.addEventListener('FRIEND_ACCEPTED', handleFriendAcceptedEvent);

window.addEventListener('friendRequestAccepted', handleFriendAcceptedEvent);

const FriendSearchEngine = {
    _searchCache: new Map(),
    
    async search(query, options = {}) {
        if (!assertActive('FriendSearchEngine.search')) {
            Logger.warn('FriendSearchEngine', 'Search blocked - module not active');
            return [];
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            Logger.warn('FriendSearchEngine', 'Search blocked - auth not ready');
            
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const results = await this.search(query, options);
                    resolve(results);
                });
            });
        }
        
        const normalizedQuery = typeof query === 'string' ? query.toLowerCase().trim() : '';
        
        if (!normalizedQuery) {
            return [];
        }
        
        const cacheKey = `${normalizedQuery}_${options.includeUsers ? 'withUsers' : 'friendsOnly'}`;
        const cached = this._searchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 30000) {
            Logger.debug('FriendSearchEngine', 'Returning cached results', { query: normalizedQuery, count: cached.results.length });
            return cached.results;
        }
        
        Logger.info('FriendSearchEngine', 'Performing client-side search', { query: normalizedQuery, options });
        
        // FIXED: Use client-side filtering instead of API call
        let results = [];
        
        if (options.includeUsers) {
            // Search across all users (for discovery)
            const allUsers = window._allUsersCache || FriendCacheManager.getAllUsers();
            if (allUsers && allUsers.length > 0) {
                results = allUsers.filter(user => {
                    if (!user || !user.id) return false;
                    
                    const name = (user.displayName || user.name || '').toLowerCase();
                    const username = (user.username || '').toLowerCase();
                    const email = (user.email || '').toLowerCase();
                    
                    return name.includes(normalizedQuery) || 
                           username.includes(normalizedQuery) || 
                           email.includes(normalizedQuery);
                });
            }
        } else {
            // Search only friends
            results = FriendCacheManager.searchFriends(normalizedQuery, { includeUsers: false });
        }
        
        // Filter out current user
        const currentUserId = __session.user?.id;
        if (currentUserId) {
            results = results.filter(user => String(user.id) !== String(currentUserId));
        }
        
        this._searchCache.set(cacheKey, {
            results,
            timestamp: Date.now()
        });
        
        // Normalize avatar fields
        results.forEach(user => {
            if (user && user.id) {
                user.photoURL = user.photoURL || user.avatar || '';
                if (!FriendCacheManager.getUser(user.id)) {
                    FriendCacheManager.setUser(user);
                }
            }
        });
        
        window.dispatchEvent(new CustomEvent('friendGlobalSearchResults', {
            detail: { query: normalizedQuery, results }
        }));
        
        return results;
    },
    
    async searchByLetter(letter, options = {}) {
        if (!letter || typeof letter !== 'string') return [];
        
        const normalizedLetter = letter.toLowerCase().trim();
        
        if (normalizedLetter.length !== 1) {
            return this.search(normalizedLetter, options);
        }
        
        Logger.info('FriendSearchEngine', 'Searching by first letter', { letter: normalizedLetter });
        
        return this.search(normalizedLetter, { ...options, limit: 50 });
    },
    
    clearCache() {
        this._searchCache.clear();
    }
};

const QRCodeManager = {
    _qrCache: new Map(),
    _scanCompleted: false,
    
    // P1 FIX: now async so it can use HMAC-SHA256 via Web Crypto
    async generateQRCode(userData) {
        if (!userData) return null;

        let userId = userData.id || userData.userId || 'unknown';
        if (userId !== undefined && userId !== null) {
            userId = String(userId);
        }

        const username    = userData.username    || userData.userName    || '';
        const displayName = userData.displayName || userData.name        || 'User';
        const email       = userData.email       || '';

        if (userId === 'unknown') {
            console.error('[QRCodeManager] Cannot generate QR: missing user ID');
            return null;
        }

        // SECURITY FIX: QR codes are now generated and signed server-side (POST
        // /api/friends/qr/generate). The old approach signed the payload in the browser
        // using an HMAC keyed to this user's own session token — that's a signature nobody
        // else could ever verify (not the scanner, not even the backend, without persisting
        // live session tokens), so it existed but nothing ever checked it. The backend has
        // its own secret and can verify a scanned QR is genuine and unmodified.
        try {
            const response = await authorizedRequest('/api/friends/qr/generate', { method: 'POST' });
            if (response && response.success && response.data?.qrData) {
                const qrData = response.data.qrData;
                const qrString = JSON.stringify(qrData);
                this._qrCache.set(userId, qrData);
                console.log('[QRCodeManager] Generated server-signed QR for user:', { userId, username, displayName });
                return qrString;
            }
            console.warn('[QRCodeManager] /qr/generate did not return qrData, falling back to local generation (offline mode — this QR will not carry a verifiable signature until back online)');
        } catch (error) {
            console.warn('[QRCodeManager] /qr/generate request failed, falling back to local generation (offline mode)', error.message);
        }

        // Offline fallback only — used when the backend can't be reached. A QR generated
        // this way carries a signature the backend cannot verify, so treat it as best-effort;
        // it'll still work once /qr/generate is reachable again.
        const timestamp = Date.now();
        const nonce = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

        const signature = await this.generateSecureHashAsync(userId, username, timestamp, nonce);

        const qrData = {
            type:        'knecta_friend_request',
            version:     '14.0',
            userId:      userId,
            username:    username,
            displayName: displayName,
            email:       email,
            timestamp:   timestamp,
            nonce:       nonce,
            expiresAt:   timestamp + (24 * 60 * 60 * 1000),
            signature:   signature,
            _unverifiedOfflineQr: true
        };

        const qrString = JSON.stringify(qrData);
        this._qrCache.set(userId, qrData);
        
        console.log('[QRCodeManager] Generated offline (unverified) QR for user:', { userId, username, displayName });
        
        return qrString;
    },

    validateQRCode(qrString) {
        try {
            const qrData = typeof qrString === 'string' ? JSON.parse(qrString) : qrString;
            
            if (!qrData || !qrData.userId) {
                return { valid: false, reason: 'Invalid QR code format' };
            }
            
            if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
                return { valid: false, reason: 'QR code expired — ask your friend to refresh their QR code' };
            }
            
            return { valid: true, data: qrData };
        } catch (error) {
            return { valid: false, reason: 'Could not read QR code data' };
        }
    },
    
    // P1 FIX: Replaced hardcoded-secret djb2 hash (anyone reading the JS source
    // could forge any userId's QR token). Now uses:
    //   - Async path: HMAC-SHA256 via Web Crypto with session-derived key
    //   - Sync fallback: FNV-1a 32-bit keyed with session token prefix (not forgeable
    //     without knowing the live session token)
    _generateSecureHash(userId, username, email, timestamp, nonce) {
        try {
            // FNV-1a 32-bit with session token as key material (sync fallback)
            const sessionSeed = (typeof __session !== 'undefined' && __session?.token)
                ? __session.token.substring(0, 16)
                : 'knecta-qr-v14';
            const data = `${userId}:${username}:${email}:${timestamp}:${nonce}:${sessionSeed}`;
            let hash = 0x811c9dc5;
            for (let i = 0; i < data.length; i++) {
                hash ^= data.charCodeAt(i);
                hash = (hash * 0x01000193) >>> 0;
            }
            return hash.toString(16).padStart(8, '0') + timestamp.toString(36).substring(0, 6);
        } catch (error) {
            return `qr_${String(userId).substring(0, 8)}_${Date.now()}`;
        }
    },

    // P1 FIX: Async HMAC-SHA256 QR signature using Web Crypto API.
    // Use this from async contexts (generateQRCode is now async).
    async generateSecureHashAsync(userId, username, timestamp, nonce) {
        try {
            if (!window.crypto || !window.crypto.subtle) {
                return this._generateSecureHash(userId, username, '', timestamp, nonce);
            }
            const sessionToken = (typeof __session !== 'undefined' && __session?.token) || '';
            const keyMaterial = `${userId}:${sessionToken.substring(0, 32)}`;
            const enc = new TextEncoder();
            const cryptoKey = await window.crypto.subtle.importKey(
                'raw', enc.encode(keyMaterial),
                { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
            );
            const message = `${userId}:${username}:${timestamp}:${nonce}`;
            const sigBuf = await window.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
            return Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
        } catch (e) {
            Logger.warn('QRCodeManager', 'HMAC failed, using sync fallback', e.message);
            return this._generateSecureHash(userId, username, '', timestamp, nonce);
        }
    },
    
    async processScannedQR(qrString) {
        if (!assertActive('processScannedQR')) {
            return { success: false, error: 'Module not active' };
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const result = await this.processScannedQR(qrString);
                    resolve(result);
                });
            });
        }
        
        this._scanCompleted = false;
        
        const validation = this.validateQRCode(qrString);
        if (!validation.valid) {
            return { success: false, error: validation.reason };
        }
        
        const qrData = validation.data;
        
        const currentUserId = __session.user?.id;
        if (currentUserId === qrData.userId) {
            return { success: false, error: 'Cannot add yourself' };
        }
        
        const existingFriend = FriendCacheManager.getFriend(qrData.userId);
        if (existingFriend) {
            return { success: false, error: 'Already friends', friend: existingFriend };
        }
        
        const existingSent = Array.from(FriendCacheManager.getAllSentRequests())
            .find(r => r.receiverId === qrData.userId);
        if (existingSent) {
            return { success: false, error: 'Request already sent', request: existingSent };
        }
        
        try {
            const response = await authorizedRequest(`/api/friends/user/${qrData.userId}`);
            
            Logger.info('QRCodeManager', 'Fetch user from QR', { userId: qrData.userId, success: response.success });
            
            if (response.success && (response.data?.user || response.data)) {
                const userInfo = response.data?.user || response.data;
                
                this._scanCompleted = true;
                
                return {
                    success: true,
                    data: qrData,
                    user: userInfo
                };
            }
        } catch (error) {
            Logger.error('QRCodeManager', 'Failed to fetch user', error);
        }
        
        this._scanCompleted = true;
        
        return {
            success: true,
            data: qrData,
            user: {
                id: qrData.userId,
                displayName: qrData.displayName,
                username: qrData.username,
                avatar: qrData.avatar || ''
            }
        };
    },
    
    async sendFriendRequestFromQR(userId, options = {}) {
        if (!assertActive('sendFriendRequestFromQR')) {
            return { success: false, error: 'Module not active' };
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const result = await this.sendFriendRequestFromQR(userId, options);
                    resolve(result);
                });
            });
        }
        
        Logger.info('QRCodeManager', 'Sending friend request from QR', { userId });

        // FIX: this used to always call the generic request-send endpoint, completely
        // bypassing the dedicated /api/friends/qr/connect endpoint that already existed on
        // the backend (auto-accepts if the other person already sent you a pending request,
        // and rejects blocked users) — that endpoint was fully built but never called by
        // anything. Use it when we have the raw scanned QR string to build a token from;
        // fall back to the generic endpoint only if that's unavailable or fails.
        if (options.rawQrString) {
            try {
                const token = btoa(unescape(encodeURIComponent(options.rawQrString)));
                const qrResponse = await authorizedRequest('/api/friends/qr/connect', {
                    method: 'POST',
                    body: JSON.stringify({ token })
                });
                if (qrResponse && qrResponse.success) {
                    if (qrResponse.data?.request) {
                        FriendCacheManager.setSentRequest(qrResponse.data.request);
                        FriendCacheManager.syncToGlobals();
                        FriendCacheManager.persist();
                    }
                    if (qrResponse.data?.friendship || qrResponse.data?.alreadyFriends) {
                        loadFriendsFromBackend().catch(() => {});
                    }
                    return { success: true, request: qrResponse.data?.request, friendship: qrResponse.data?.friendship, alreadyFriends: qrResponse.data?.alreadyFriends };
                }
                Logger.warn('QRCodeManager', 'qr/connect failed, falling back to generic request', qrResponse?.error || qrResponse?.message);
            } catch (e) {
                Logger.warn('QRCodeManager', 'qr/connect threw, falling back to generic request', e.message);
            }
        }

        const response = await authorizedRequest('/api/friends/requests/send', {
            method: 'POST',
            body: JSON.stringify({ 
                receiverId: userId, 
                category: options.category || 'friend', 
                note: options.note || 'Added via QR code',
                isTemporary: false
            })
        });
        
        if (response && response.success) {
            if (response.data) {
                FriendCacheManager.setSentRequest(response.data);
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();
            }
            
            return { success: true, request: response.data };
        } else {
            return { success: false, error: response?.error || 'Failed to send friend request' };
        }
    },
    
    isScanCompleted() {
        return this._scanCompleted;
    },
    
    resetScan() {
        this._scanCompleted = false;
    }
};

const GroupParticipationManager = {
    async addFriendToGroup(groupId, friendId, options = {}) {
        if (!assertActive('addFriendToGroup')) {
            return { success: false, error: 'Module not active' };
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const result = await this.addFriendToGroup(groupId, friendId, options);
                    resolve(result);
                });
            });
        }
        
        if (!groupId || !friendId) {
            return { success: false, error: 'Invalid parameters' };
        }
        
        const friend = FriendCacheManager.getFriend(friendId);
        if (!friend) {
            return { success: false, error: 'Friend not found' };
        }
        
        const optimisticMember = {
            id: friendId,
            displayName: friend.displayName || friend.name,
            username: friend.username,
            addedAt: Date.now(),
            role: options.role || 'member',
            optimistic: true
        };
        
        window.dispatchEvent(new CustomEvent('group:memberAdding', {
            detail: { groupId, member: optimisticMember }
        }));
        
        try {
            const response = await authorizedRequest(`/api/groups/${groupId}/members`, {
                method: 'POST',
                body: JSON.stringify({ userId: friendId, role: options.role || 'member' })
            });
            
            if (response && response.success) {
                window.dispatchEvent(new CustomEvent('group:memberAdded', {
                    detail: { groupId, member: optimisticMember, success: true }
                }));
                
                safeSend({
                    type: 'GROUP_UPDATE',
                    payload: {
                        event: 'memberAdded',
                        groupId,
                        friendId,
                        timestamp: Date.now()
                    }
                });
                
                return { success: true, member: optimisticMember };
            } else {
                return { success: false, error: response?.error || 'Failed to add to group' };
            }
        } catch (error) {
            Logger.error('GroupParticipationManager', 'Failed to add to group', error);
            return { success: false, error: error.message };
        }
    },
    
    async removeFriendFromGroup(groupId, friendId) {
        if (!assertActive('removeFriendFromGroup')) {
            return { success: false, error: 'Module not active' };
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const result = await this.removeFriendFromGroup(groupId, friendId);
                    resolve(result);
                });
            });
        }
        
        if (!groupId || !friendId) {
            return { success: false, error: 'Invalid parameters' };
        }
        
        window.dispatchEvent(new CustomEvent('group:memberRemoving', {
            detail: { groupId, friendId }
        }));
        
        try {
            const response = await authorizedRequest(`/api/groups/${groupId}/members/${friendId}`, {
                method: 'DELETE'
            });
            
            if (response && response.success) {
                window.dispatchEvent(new CustomEvent('group:memberRemoved', {
                    detail: { groupId, friendId, success: true }
                }));
                
                safeSend({
                    type: 'GROUP_UPDATE',
                    payload: {
                        event: 'memberRemoved',
                        groupId,
                        friendId,
                        timestamp: Date.now()
                    }
                });
                
                return { success: true };
            } else {
                return { success: false, error: response?.error || 'Failed to remove from group' };
            }
        } catch (error) {
            Logger.error('GroupParticipationManager', 'Failed to remove from group', error);
            return { success: false, error: error.message };
        }
    },
    
    async getGroupMembers(groupId) {
        if (!assertActive('getGroupMembers')) {
            return { success: false, members: [], error: 'Module not active' };
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            return new Promise((resolve) => {
                queueRequest(async () => {
                    const result = await this.getGroupMembers(groupId);
                    resolve(result);
                });
            });
        }
        
        try {
            const response = await authorizedRequest(`/api/groups/${groupId}/members`);
            
            if (response.success && (response.data?.members || response.data)) {
                const members = response.data?.members || response.data || [];
                return { success: true, members };
            }
        } catch (error) {
            Logger.error('GroupParticipationManager', 'Failed to get members', error);
        }
        
        return { success: false, members: [] };
    }
};

const UIBridge = {
    _initialized: false,
    _eventListeners: new Map(),
    
    init() {
        if (this._initialized) return;
        
        document.addEventListener('DOMContentLoaded', () => {
            this._attachEventListeners();
        });
        
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            setTimeout(() => this._attachEventListeners(), 100);
        }
        
        this._initialized = true;
        Logger.info('UIBridge', 'Initialized');
    },
    
    _attachEventListeners() {
        this._attachSendMessageListener();
        this._attachStartCallListener();
        this._attachAcceptCallListener();
        this._attachUpdateProfileListener();
        this._attachOpenGroupListener();
        this._attachChangeStatusListener();
        this._attachFriendRequestListeners();
        this._attachQRCodeListeners();
        this._attachFriendSearchListeners();
    },
    
    _attachSendMessageListener() {
        const handler = (event) => {
            if (!assertActive('ui:sendMessage')) {
                return;
            }
            
            const { friendId, message } = event.detail || {};
            if (!friendId || !message) return;
            
            safeSend({
                type: 'SEND_MESSAGE',
                payload: {
                    friendId,
                    message,
                    timestamp: Date.now()
                }
            });
        };
        
        window.addEventListener('ui:sendMessage', handler);
        this._eventListeners.set('sendMessage', handler);
    },
    
    _attachStartCallListener() {
        const handler = (event) => {
            if (!assertActive('ui:startCall')) {
                return;
            }
            
            const { friendId, friendName, callType } = event.detail || {};
            if (!friendId) return;

            // FIX-ROOT-CAUSE-DEAD-CALL-PATH: this used to post a 'START_CALL'
            // message to the parent (chat.html), which has no handler for
            // that type at all — chat.html only recognizes 'SWITCH_MODULE',
            // 'INITIATE_CALL', and 'CALL_INITIATE'. Since nothing anywhere in
            // the codebase ever actually dispatches the 'ui:startCall' DOM
            // event this handler listens for, this was fully dead — but a
            // silent dead end, not an error, so a future button wired to
            // 'ui:startCall' expecting it to place a call would fail with no
            // indication why. Route through the exact same SWITCH_MODULE path
            // the real, working "call" button in friend-ui.js's
            // navigateToCallModule() uses, so this is the same one real call
            // engine rather than a second, different, silently-broken one.
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'SWITCH_MODULE',
                    module: 'calls',
                    payload: {
                        userId: friendId,
                        userName: friendName || 'User',
                        callType: callType === 'audio' ? 'voice' : (callType || 'voice'),
                        returnTo: 'friends',
                        timestamp: Date.now(),
                        source: 'friends-module'
                    },
                    source: 'friend-core',
                    timestamp: Date.now()
                }, '*');
            }
        };
        
        window.addEventListener('ui:startCall', handler);
        this._eventListeners.set('startCall', handler);
    },
    
    _attachAcceptCallListener() {
        const handler = (event) => {
            if (!assertActive('ui:acceptCall')) {
                return;
            }
            
            const { callId } = event.detail || {};
            if (!callId) return;
            
            safeSend({
                type: 'ACCEPT_CALL',
                payload: {
                    callId,
                    timestamp: Date.now()
                }
            });
        };
        
        window.addEventListener('ui:acceptCall', handler);
        this._eventListeners.set('acceptCall', handler);
    },
    
    _attachUpdateProfileListener() {
        const handler = (event) => {
            if (!assertActive('ui:updateProfile')) {
                return;
            }
            
            const { profileData } = event.detail || {};
            if (!profileData) return;
            
            safeSend({
                type: 'UPDATE_PROFILE',
                payload: {
                    profile: profileData,
                    timestamp: Date.now()
                }
            });
        };
        
        window.addEventListener('ui:updateProfile', handler);
        this._eventListeners.set('updateProfile', handler);
    },
    
    _attachOpenGroupListener() {
        const handler = (event) => {
            if (!assertActive('ui:openGroup')) {
                return;
            }
            
            const { groupId } = event.detail || {};
            if (!groupId) return;
            
            safeSend({
                type: 'OPEN_GROUP',
                payload: {
                    groupId,
                    timestamp: Date.now()
                }
            });
        };
        
        window.addEventListener('ui:openGroup', handler);
        this._eventListeners.set('openGroup', handler);
    },
    
    _attachChangeStatusListener() {
        const handler = (event) => {
            if (!assertActive('ui:changeStatus')) {
                return;
            }
            
            const { status } = event.detail || {};
            if (!status) return;
            
            safeSend({
                type: 'CHANGE_STATUS',
                payload: {
                    status,
                    timestamp: Date.now()
                }
            });
        };
        
        window.addEventListener('ui:changeStatus', handler);
        this._eventListeners.set('changeStatus', handler);
    },
    
  _attachFriendRequestListeners() {
    // Send friend request handler
    const sendHandler = (event) => {
        if (!assertActive('ui:sendFriendRequest')) {
            console.warn('[UIBridge] Cannot send friend request - module not active');
            return;
        }
        
        const { userId, options } = event.detail || {};
        console.log('[UIBridge] Send friend request:', { userId, options });
        
        if (!userId) return;
        
        FriendRequestManager.sendFriendRequest(userId, options || {})
            .then(result => {
                console.log('[UIBridge] Send friend request result:', result);
                window.dispatchEvent(new CustomEvent('ui:friendRequestResult', {
                    detail: { userId, result }
                }));
            })
            .catch(error => {
                console.error('[UIBridge] Send friend request error:', error);
            });
    };
    
    window.addEventListener('ui:sendFriendRequest', sendHandler);
    this._eventListeners.set('sendFriendRequest', sendHandler);
    
    // ACCEPT friend request handler - FIXED
    const acceptHandler = (event) => {
        if (!assertActive('ui:acceptFriendRequest')) {
            console.warn('[UIBridge] Cannot accept friend request - module not active');
            return;
        }
        
        const { requestId, friendId } = event.detail || {};
        console.log('[UIBridge] Accept friend request - DETAILS:', { requestId, friendId, eventDetail: event.detail });
        
        if (!requestId || !friendId) {
            console.error('[UIBridge] Missing requestId or friendId for accept');
            return;
        }
        
        // Show loading state
        window.dispatchEvent(new CustomEvent('ui:showLoading', {
            detail: { message: 'Accepting friend request...' }
        }));
        
        FriendRequestManager.acceptFriendRequest(requestId, friendId)
            .then(result => {
                console.log('[UIBridge] Accept friend request result:', result);
                window.dispatchEvent(new CustomEvent('ui:friendRequestResult', {
                    detail: { requestId, result }
                }));
                
                if (result.success) {
                    // Trigger UI refresh
                    window.dispatchEvent(new CustomEvent('ui:refreshFriendsList'));
                    window.dispatchEvent(new CustomEvent('ui:refreshRequestsList'));
                }
            })
            .catch(error => {
                console.error('[UIBridge] Accept friend request error:', error);
                window.dispatchEvent(new CustomEvent('ui:friendRequestResult', {
                    detail: { requestId, error: error.message, result: { success: false, error: error.message } }
                }));
            })
            .finally(() => {
                window.dispatchEvent(new CustomEvent('ui:hideLoading'));
            });
    };
    
    window.addEventListener('ui:acceptFriendRequest', acceptHandler);
    this._eventListeners.set('acceptFriendRequest', acceptHandler);
    
    // Decline handler
    const declineHandler = (event) => {
        if (!assertActive('ui:declineFriendRequest')) {
            return;
        }
        
        const { requestId } = event.detail || {};
        if (!requestId) return;
        
        FriendRequestManager.declineFriendRequest(requestId)
            .then(result => {
                window.dispatchEvent(new CustomEvent('ui:friendRequestResult', {
                    detail: { requestId, result }
                }));
            });
    };
    
    window.addEventListener('ui:declineFriendRequest', declineHandler);
    this._eventListeners.set('declineFriendRequest', declineHandler);
    
    // Cancel handler
    const cancelHandler = (event) => {
        if (!assertActive('ui:cancelFriendRequest')) {
            return;
        }
        
        const { requestId } = event.detail || {};
        if (!requestId) return;
        
        FriendRequestManager.cancelFriendRequest(requestId)
            .then(result => {
                window.dispatchEvent(new CustomEvent('ui:friendRequestResult', {
                    detail: { requestId, result }
                }));
            });
    };
    
    window.addEventListener('ui:cancelFriendRequest', cancelHandler);
    this._eventListeners.set('cancelFriendRequest', cancelHandler);
},

    _attachQRCodeListeners() {
        const scanHandler = (event) => {
            if (!assertActive('ui:scanQRCode')) {
                return;
            }
            
            const { qrData } = event.detail || {};
            if (!qrData) return;
            
            QRCodeManager.processScannedQR(qrData)
                .then(result => {
                    window.dispatchEvent(new CustomEvent('ui:qrScanResult', {
                        detail: result
                    }));
                    
                    if (result.success && result.user) {
                        QRCodeManager.sendFriendRequestFromQR(result.user.id, {
                            note: 'Added via QR code scan',
                            rawQrString: qrData
                        }).then(requestResult => {
                            window.dispatchEvent(new CustomEvent('ui:qrFriendRequestResult', {
                                detail: { userId: result.user.id, result: requestResult }
                            }));
                        });
                    }
                });
        };
        
        window.addEventListener('ui:scanQRCode', scanHandler);
        this._eventListeners.set('scanQRCode', scanHandler);
        
        const generateHandler = () => {
            if (!assertActive('ui:generateQRCode')) {
                return;
            }
            
            const user = __session.user;
            if (user) {
                // P1 FIX: generateQRCode is now async — wrap in IIFE
                (async () => {
                    const qrString = await QRCodeManager.generateQRCode(user);
                    window.dispatchEvent(new CustomEvent('ui:qrGenerated', {
                        detail: { qrData: qrString }
                    }));
                })();
            }
        };
        
        window.addEventListener('ui:generateQRCode', generateHandler);
        this._eventListeners.set('generateQRCode', generateHandler);
    },
    
    _attachFriendSearchListeners() {
        const searchHandler = (event) => {
            if (!assertActive('ui:friendSearch')) {
                return;
            }
            
            const { query, options } = event.detail || {};
            if (!query) return;
            
            Logger.info('UIBridge', 'Friend search requested', { query });
            
            FriendSearchEngine.search(query, options || {})
                .then(results => {
                    window.dispatchEvent(new CustomEvent('ui:friendSearchResults', {
                        detail: { query, results, source: 'backend' }
                    }));
                })
                .catch(error => {
                    Logger.error('UIBridge', 'Friend search failed', error);
                    window.dispatchEvent(new CustomEvent('ui:friendSearchError', {
                        detail: { query, error: error.message }
                    }));
                });
        };
        
        window.addEventListener('ui:friendSearch', searchHandler);
        this._eventListeners.set('friendSearch', searchHandler);
        
        const searchByLetterHandler = (event) => {
            if (!assertActive('ui:friendSearchByLetter')) {
                return;
            }
            
            const { letter, options } = event.detail || {};
            if (!letter) return;
            
            Logger.info('UIBridge', 'Friend search by letter requested', { letter });
            
            FriendSearchEngine.searchByLetter(letter, options || {})
                .then(results => {
                    window.dispatchEvent(new CustomEvent('ui:friendSearchResults', {
                        detail: { query: letter, results, source: 'backend', byLetter: true }
                    }));
                })
                .catch(error => {
                    Logger.error('UIBridge', 'Friend search by letter failed', error);
                    window.dispatchEvent(new CustomEvent('ui:friendSearchError', {
                        detail: { letter, error: error.message }
                    }));
                });
        };
        
        window.addEventListener('ui:friendSearchByLetter', searchByLetterHandler);
        this._eventListeners.set('friendSearchByLetter', searchByLetterHandler);
    },
    
    destroy() {
        this._eventListeners.forEach((handler, event) => {
            window.removeEventListener(event, handler);
        });
        this._eventListeners.clear();
    }
};

const IdempotentTracker = {
    _executed: new Map(),
    _executionTimestamps: new Map(),
    _executionCounts: new Map(),
    
    markExecuted(operation, id = 'default', ttl = 30000) {
        const key = `${operation}:${id}`;
        if (!this._executed.has(operation)) {
            this._executed.set(operation, new Set());
        }
        this._executed.get(operation).add(id);
        this._executionTimestamps.set(key, Date.now());
        this._executionCounts.set(key, (this._executionCounts.get(key) || 0) + 1);
        
        setTimeout(() => {
            const opSet = this._executed.get(operation);
            if (opSet) {
                opSet.delete(id);
                if (opSet.size === 0) this._executed.delete(operation);
            }
            this._executionTimestamps.delete(key);
        }, ttl);
        
        return true;
    },
    
    wasExecuted(operation, id = 'default') {
        const opSet = this._executed.get(operation);
        return opSet ? opSet.has(id) : false;
    },
    
    getExecutionCount(operation, id = 'default') {
        const key = `${operation}:${id}`;
        return this._executionCounts.get(key) || 0;
    },
    
    clear(operation, id = 'default') {
        const key = `${operation}:${id}`;
        const opSet = this._executed.get(operation);
        if (opSet) opSet.delete(id);
        if (opSet && opSet.size === 0) this._executed.delete(operation);
        this._executionTimestamps.delete(key);
        this._executionCounts.delete(key);
    },
    
    reset() {
        this._executed.clear();
        this._executionTimestamps.clear();
        this._executionCounts.clear();
    }
};

const MessageTracker = {
    _processedMessageIds: new Set(),
    _maxProcessedSize: 500,
    
    isProcessed(messageId) {
        return this._processedMessageIds.has(messageId);
    },
    
    markProcessed(messageId) {
        this._processedMessageIds.add(messageId);
        this._cleanupProcessed();
    },
    
    _cleanupProcessed() {
        if (this._processedMessageIds.size > this._maxProcessedSize) {
            const toRemove = Array.from(this._processedMessageIds).slice(0, 100);
            toRemove.forEach(id => this._processedMessageIds.delete(id));
        }
    },
    
    reset() {
        this._processedMessageIds.clear();
    }
};

const V6_STATES = {
    INIT: 'INIT',
    REGISTERING: 'REGISTERING',
    REGISTERED: 'REGISTERED',
    SESSION_RECEIVED: 'SESSION_RECEIVED',
    ACTIVE: 'ACTIVE',
    SYNCING: 'SYNCING',
    READY: 'READY',
    DEGRADED: 'DEGRADED'
};

const V6_STATE_MACHINE = {
    _state: V6_STATES.INIT,
    _stateHistory: [],
    _listeners: new Set(),
    _maxHistorySize: 30,
    _timers: {
        handshake: null,
        session: null,
        parentReady: null,
        heartbeat: null,
        recovery: null
    },
    _heartbeatMissed: 0,
    _heartbeatMaxMissed: 3,
    _lastHeartbeat: 0,
    _handshakeComplete: false,
    _handshakeStartTime: 0,
    _sessionValid: false,
    _sessionData: null,
    _messageQueue: [],
    _queueMaxSize: 50,
    _requestIdCache: new Set(),
    _sessionAuthority: null,
    
    init() {
        this._handshakeStartTime = Date.now();
        this._state = V6_STATES.INIT;
        return this;
    },
    
    get current() { return this._state; },
    
    transition(toState, reason = '') {
        const validTransitions = {
            [V6_STATES.INIT]: [V6_STATES.REGISTERING, V6_STATES.DEGRADED],
            [V6_STATES.REGISTERING]: [V6_STATES.REGISTERED, V6_STATES.DEGRADED],
            [V6_STATES.REGISTERED]: [V6_STATES.SESSION_RECEIVED, V6_STATES.DEGRADED],
            [V6_STATES.SESSION_RECEIVED]: [V6_STATES.ACTIVE, V6_STATES.DEGRADED],
            [V6_STATES.ACTIVE]: [V6_STATES.SYNCING, V6_STATES.DEGRADED],
            [V6_STATES.SYNCING]: [V6_STATES.READY, V6_STATES.DEGRADED],
            [V6_STATES.READY]: [V6_STATES.DEGRADED],
            [V6_STATES.DEGRADED]: [V6_STATES.ACTIVE, V6_STATES.READY]
        };
        
        const allowed = validTransitions[this._state];
        if (!allowed || !allowed.includes(toState)) {
            return false;
        }
        
        if (this._state === toState) return true;
        
        const fromState = this._state;
        this._state = toState;
        
        this._stateHistory.push({
            from: fromState,
            to: toState,
            timestamp: Date.now(),
            reason
        });
        
        if (this._stateHistory.length > this._maxHistorySize) {
            this._stateHistory.shift();
        }
        
        this._notifyListeners(toState, fromState, reason);
        this._handleStateTransition(toState, fromState);
        
        return true;
    },
    
    _handleStateTransition(toState, fromState) {
        if (toState === V6_STATES.ACTIVE) {
            this._clearTimers(['handshake', 'session', 'parentReady', 'recovery']);
            this._handshakeComplete = true;
        }
        
        if (toState === V6_STATES.READY) {
            this._flushMessageQueue();
        }
        
        if (toState === V6_STATES.DEGRADED) {
            this._stopHeartbeat();
            this._messageQueue = [];
        }
        
        if (toState === V6_STATES.SESSION_RECEIVED && this._sessionValid) {
            setTimeout(() => {
                if (this._state === V6_STATES.SESSION_RECEIVED) {
                    this.transition(V6_STATES.ACTIVE, 'session_valid');
                }
            }, 10);
        }
    },
    
    _notifyListeners(toState, fromState, reason) {
        this._listeners.forEach(listener => {
            try { listener(toState, fromState, reason); } catch (e) {}
        });
    },
    
    onTransition(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    },
    
    startHandshakeTimer() {},
    startSessionTimer() {},
    startParentReadyTimer() {},
    
    requestSessionFromParent() {
        if (this._state !== V6_STATES.REGISTERED) return;
        
        Logger.debug('V6', 'Requesting session from parent');
        
        sendMessageInternal({
            type: 'REQUEST_SESSION',
            payload: {
                module: MODULE_NAME,
                frameId: ParentCommunicationManager.getFrameId(),
                requestId: generateRequestId(),
                timestamp: Date.now()
            }
        });
    },
    
    _clearTimer(name) {
        if (this._timers[name]) {
            clearTimeout(this._timers[name]);
            this._timers[name] = null;
        }
    },
    
    _clearTimers(names) {
        names.forEach(name => this._clearTimer(name));
    },
    
    _clearAllTimers() {
        Object.keys(this._timers).forEach(key => {
            if (this._timers[key]) {
                clearTimeout(this._timers[key]);
                this._timers[key] = null;
            }
        });
    },
    
    startHeartbeat() {
        Logger.debug('V6', 'Heartbeat start ignored - module only responds');
    },
    
    _sendHeartbeat() {},
    _stopHeartbeat() {},
    
    heartbeatAckReceived() {
        this._heartbeatMissed = 0;
        this._lastHeartbeat = Date.now();
    },
    
    startRecoveryTimer() {},
    
    queueMessage(message) {
        if (this._messageQueue.length >= this._queueMaxSize) {
            this._messageQueue.shift();
        }
        
        this._messageQueue.push({
            ...message,
            queuedAt: Date.now()
        });
    },
    
    _flushMessageQueue() {
        if (this._messageQueue.length === 0) return;
        
        const queue = [...this._messageQueue];
        this._messageQueue = [];
        
        queue.forEach(msg => {
            setTimeout(() => {
                sendMessageInternal({
                    type: msg.type,
                    payload: msg.payload
                });
            }, 10);
        });
    },
    
    handleSessionActive(payload) {
        if (!payload) return;
        
        const session = payload.session || payload;
        const user = session.user || session;
        
        if (!user || !user.id) {
            Logger.debug('V6', 'Invalid session structure from parent');
            return;
        }
        
        this._sessionValid = true;
        this._sessionData = {
            token: session.token || 'authenticated',
            user: user,
            expiresAt: session.expiresAt,
            version: session.version || 1,
            authenticated: true
        };
        this._sessionAuthority = 'parent';
        
        __session.token = session.token || 'authenticated';
        __session.user = user;
        __session.expiresAt = session.expiresAt || null;
        __session.ready = true;
        
        if (typeof currentUser !== 'undefined') {
            window.currentUser = user;
        }
        
        if (this._state === V6_STATES.REGISTERED) {
            this.transition(V6_STATES.SESSION_RECEIVED, 'session_active');
        }
        
        if (this._state === V6_STATES.SESSION_RECEIVED) {
            setTimeout(() => {
                if (this._state === V6_STATES.SESSION_RECEIVED) {
                    this.transition(V6_STATES.ACTIVE, 'auto_active');
                }
            }, 100);
        }
    },
    
    handleSessionNull(payload) {
        this._sessionValid = false;
        this._sessionData = { authenticated: false };
        this._sessionAuthority = null;
        __session.ready = false;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        
        if (this._state === V6_STATES.REGISTERED) {
            this.transition(V6_STATES.SESSION_RECEIVED, 'session_null');
        }
    },
    
    handleSessionRefreshed(payload) {
        if (!payload) return;
        
        if (!payload.authenticated || !payload.token || !payload.user) {
            Logger.debug('V6', 'Invalid refreshed session structure');
            return;
        }
        
        this._sessionValid = true;
        this._sessionData = {
            token: payload.token,
            user: payload.user,
            expiresAt: payload.expiresAt,
            version: payload.version,
            authenticated: true
        };
        this._sessionAuthority = 'parent';
        
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
        
        if (this._state === V6_STATES.DEGRADED) {
            this.transition(V6_STATES.ACTIVE, 'session_refreshed');
        }
    },
    
    handleSessionInvalidated() {
        this._sessionValid = false;
        this._sessionData = { authenticated: false };
        this._sessionAuthority = null;
        __session.ready = false;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        
        if (this._state !== V6_STATES.DEGRADED) {
            this.transition(V6_STATES.DEGRADED, 'session_invalidated');
        }
    },
    
    async verifySession(timeoutMs = 500) {
        if (this._state !== V6_STATES.ACTIVE && this._state !== V6_STATES.READY) {
            return { valid: false, reason: 'not_active' };
        }
        
        const requestId = generateRequestId();
        
        return new Promise((resolve) => {
            const handler = (event) => {
                if (event.detail?.requestId === requestId) {
                    window.removeEventListener('verifySessionResponse', handler);
                    const result = event.detail?.result;
                    if (result?.valid === true) {
                        resolve({ valid: true });
                    } else {
                        resolve({ valid: false, reason: 'invalid' });
                    }
                }
            };
            
            window.addEventListener('verifySessionResponse', handler);
            
            sendMessageInternal({
                type: 'VERIFY_SESSION',
                requestId,
                payload: {
                    module: MODULE_NAME,
                    frameId: ParentCommunicationManager.getFrameId(),
                    timestamp: Date.now()
                }
            });
        });
    },
    
    sendRegistration() {
        if (this._state !== V6_STATES.INIT) return;
        
        this.transition(V6_STATES.REGISTERING, 'sending_registration');
        
        const requestId = generateRequestId();
        
        sendMessageInternal({
            type: 'REGISTER_MODULE',
            requestId,
            payload: {
                module: MODULE_NAME,
                frameId: ParentCommunicationManager.getFrameId(),
                timestamp: Date.now(),
                version: '6.0',
                capabilities: ['friends', 'friend-requests', 'qr-codes']
            }
        });
        
        this.transition(V6_STATES.REGISTERED, 'auto_registered');
        
        setTimeout(() => {
            sendChildReady();
        }, 100);
    },
    
    handleModuleRegistered(payload) {
        if (this._state !== V6_STATES.REGISTERING) return;
        
        this._clearTimer('handshake');
        this.transition(V6_STATES.REGISTERED, 'module_registered');
    },
    
    handleParentReady() {
        this._clearTimer('parentReady');
        setParentReadyReceived(true);
        
        if (this._state === V6_STATES.SESSION_RECEIVED) {
            if (this._sessionValid) {
                this.transition(V6_STATES.ACTIVE, 'parent_ready_with_session');
            } else {
                Logger.debug('V6', 'No session - showing login required');
            }
        } else if (this._state === V6_STATES.REGISTERED) {
            this.transition(V6_STATES.DEGRADED, 'parent_ready_no_session');
        }
    },
    
    canPerformActions() {
        return this._state === V6_STATES.READY && __session.ready && authReadyReceived;
    },
    
    canPerformApiCalls() {
        return (this._state === V6_STATES.ACTIVE || this._state === V6_STATES.READY) && __session.ready && authReadyReceived;
    },
    
    shouldQueueMessage() {
        return this._state === V6_STATES.REGISTERING || 
               this._state === V6_STATES.REGISTERED ||
               this._state === V6_STATES.SESSION_RECEIVED ||
               this._state === V6_STATES.SYNCING;
    },
    
    getSession() {
        return this._sessionData || { authenticated: false };
    },
    
    isSessionValid() {
        return this._sessionValid && __session.ready;
    },
    
    getState() {
        return {
            state: this._state,
            sessionValid: this.isSessionValid(),
            handshakeComplete: this._handshakeComplete,
            handshakeTime: this._handshakeStartTime ? Date.now() - this._handshakeStartTime : 0,
            queueLength: this._messageQueue.length,
            heartbeatMissed: this._heartbeatMissed,
            sessionAuthority: this._sessionAuthority,
            parentReady: parentReadyReceived,
            authReady: authReadyReceived,
            sessionReady: __session.ready
        };
    },
    
    isRequestDuplicate(requestId) {
        if (this._requestIdCache.has(requestId)) return true;
        this._requestIdCache.add(requestId);
        setTimeout(() => this._requestIdCache.delete(requestId), 60000);
        return false;
    },
    
    reset() {
        this._clearAllTimers();
        this._stopHeartbeat();
        this._state = V6_STATES.INIT;
        this._stateHistory = [];
        this._messageQueue = [];
        this._heartbeatMissed = 0;
        this._handshakeComplete = false;
        this._handshakeStartTime = Date.now();
        this._sessionValid = false;
        this._sessionData = null;
        this._requestIdCache.clear();
        this._sessionAuthority = null;
    }
};

const V6 = V6_STATE_MACHINE.init();

const CompatibilityBridge = {
    mode: 'auto',
    legacyDetected: false,
    parentCapabilities: null,
    _warningsShown: new Set(),
    
    detectParentCapabilities() {
        const stored = SafeStorage.getItem('parent_capabilities');
        if (stored) {
            try {
                this.parentCapabilities = JSON.parse(stored);
                this.determineMode();
                return this.parentCapabilities;
            } catch (e) {}
        }
        
        const isModernParent = window.__PARENT_READY__ && window.__PARENT_VERSION__ >= 3;
        
        this.parentCapabilities = {
            modern: isModernParent,
            kyn: true,
            signatures: true,
            heartbeats: true,
            batching: false,
            protocol: isModernParent ? 'KYN-3.0' : 'KYN-2.0'
        };
        
        return this.parentCapabilities;
    },
    
    determineMode() {
        if (!this.parentCapabilities) this.detectParentCapabilities();
        
        if (this.parentCapabilities.modern === false || this.legacyDetected) {
            this.mode = 'legacy';
            return 'legacy';
        }
        
        if (this.parentCapabilities.kyn) {
            this.mode = 'modern';
            return 'modern';
        }
        
        this.mode = 'auto';
        return 'auto';
    },
    
    adaptOutgoing(message) {
        this.determineMode();
        if (this.mode === 'legacy') return this.toLegacyFormat(message);
        return message;
    },
    
    adaptIncoming(message) {
        if (!message) return null;
        if (message.protocol === 'KYN-3.0' || message.protocol === 'KYN-2.0') return message;
        if (this.isLegacyFormat(message)) {
            this.legacyDetected = true;
            return this.fromLegacyFormat(message);
        }
        return this.inferFormat(message);
    },
    
    toLegacyFormat(message) {
        return {
            type: message.type,
            data: message.payload,
            messageId: message.id,
            timestamp: message.timestamp,
            source: message.source || 'iframe',
            target: 'parent'
        };
    },
    
    fromLegacyFormat(message) {
        return {
            protocol: 'KYN-2.0',
            id: message.messageId || `legacy_${Date.now()}`,
            type: message.type,
            source: message.source || 'parent',
            target: 'iframe',
            frameId: message.frameId || ParentCommunicationManager.getFrameId(),
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || message,
            legacy: true
        };
    },
    
    isLegacyFormat(message) {
        return !message.protocol && (message.type && !message.id) && (message.data || !message.frameId);
    },
    
    inferFormat(message) {
        return {
            protocol: 'KYN-2.0',
            id: message.id || message.messageId || `inf_${Date.now()}`,
            type: message.type || message.action || 'UNKNOWN',
            source: message.source || 'parent',
            target: 'iframe',
            frameId: message.frameId || ParentCommunicationManager.getFrameId(),
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || message,
            inferred: true
        };
    },
    
    setParentCapabilities(capabilities) {
        this.parentCapabilities = capabilities;
        SafeStorage.setObject('parent_capabilities', capabilities);
        this.determineMode();
    }
};

const DiagnosticsAgent = {
    enabled: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    
    metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0,
        failures: 0,
        startupTime: Date.now(),
        get environment() { return IframeEnvironment.type; }
    },
    
    enable() { this.enabled = true; },
    trackSend(type) { if (this.enabled) this.metrics.messagesSent++; },
    trackReceive(type) { if (this.enabled) this.metrics.messagesReceived++; },
    trackAck() { if (this.enabled) this.metrics.acksReceived++; },
    trackFailure(error, context) { if (this.enabled) this.metrics.failures++; },
    
    getMetrics() {
        return {
            ...this.metrics,
            queueLength: _messageQueue.length,
            requestQueueLength: requestQueue.length,
            sessionValid: __session.ready,
            authReady: authReadyReceived,
            sessionStatus: __session.ready ? 'active' : 'inactive',
            uptime: Date.now() - this.metrics.startupTime,
            state: currentState,
            parentReady: parentReadyReceived,
            v6: V6.getState()
        };
    },
    
    getHealth() {
        const metrics = this.getMetrics();
        let status = 'healthy';
        if (!authReadyReceived) status = 'waiting_auth';
        if (!__session.ready) status = 'degraded';
        
        return {
            status,
            metrics,
            environment: IframeEnvironment.type,
            state: currentState,
            parentReady: parentReadyReceived,
            authReady: authReadyReceived,
            v6State: V6.current,
            timestamp: Date.now()
        };
    },
    
    clear() {
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            acksReceived: 0,
            failures: 0,
            startupTime: Date.now(),
            environment: IframeEnvironment.type
        };
    }
};

const NavigationGuard = {
    _guarded: false,
    _warningsShown: new Set(),
    
    guard() {
        if (this._guarded) return;
        
        window.addEventListener('beforeunload', (e) => {
            SafeStorage.setObject('navigation_state', {
                section: window.UIState?.activeSection,
                friendId: window.UIState?.selectedFriendId,
                timestamp: Date.now()
            });
        });
        
        this._guarded = true;
    },
    
    restore() {
        const state = SafeStorage.getObject('navigation_state');
        if (state && Date.now() - state.timestamp < 300000) return state;
        return null;
    }
};

const UIFailsafe = {
    _buttonStates: new Map(),
    _warningsShown: new Set(),
    
    protectButton(button, action) {
        if (!button) return;
        
        const originalClick = button.onclick;
        const disabled = button.disabled;
        
        this._buttonStates.set(button, { originalClick, disabled, action });
    },
    
    restoreButtons() {
        this._buttonStates.forEach((state, button) => {
            if (button && button.onclick !== state.originalClick) {
                button.onclick = state.originalClick;
                button.disabled = state.disabled;
            }
        });
    },
    
    showFallback(container, message = 'Temporarily unavailable') {
        if (!container) return;
        
        const fallback = document.createElement('div');
        fallback.className = 'empty-state';
        fallback.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
            <p>${message}</p>
            <p class="subtext">Please try again later</p>
        `;
        
        container.innerHTML = '';
        container.appendChild(fallback);
    }
};

const featureFlags = {
    qrCode: true,
    camera: true,
    contactsSync: true,
    mutualFriends: true,
    groups: true,
    temporaryFriends: true,
    pinnedFriends: true,
    mutedFriends: true,
    discovery: true,
    notes: true,
    kynProtocol: true,
    get messageSigning() { return !SandboxDetector.detected; },
    heartbeat: false,
    retryQueue: false,
    offlineBuffer: true,
    get batchMessages() { return IframeEnvironment.features.isVpnNetwork; },
    get compression() { return IframeEnvironment.features.saveData; },
    get keepalive() { return IframeEnvironment.features.isVpnNetwork; }
};

let currentUser = null;

function setCurrentUser(value) { currentUser = value; }

let userData = null;

function setUserData(value) { userData = value; }

let friends = [];

function setFriends(value) { friends = value; }

let contacts = [];

function setContacts(value) { contacts = value; }

let friendRequests = [];

function setFriendRequests(value) { friendRequests = value; }

let sentRequests = [];

function setSentRequests(value) { sentRequests = value; }

let temporaryFriends = [];

let pinnedFriends = [];

function setPinnedFriends(value) { pinnedFriends = value; }

let mutedFriends = [];

function setMutedFriends(value) { mutedFriends = value; }

let selectedFriend = null;

function setSelectedFriend(value) { selectedFriend = value; }

let currentCategoryFilter = 'all';

let currentSearchTerm = '';

function setCurrentCategoryFilter(value) { currentCategoryFilter = value; }

function setCurrentSearchTerm(value) { currentSearchTerm = value?.toLowerCase().trim() || ''; }

let isMobile = window.innerWidth <= 768;

let mutualFriendsCache = {};

let groups = [];

function setGroups(value) { groups = value; }

let allUsers = [];

function setAllUsers(value) { allUsers = value; }

let cameraStream = null;

function setCameraStream(value) { cameraStream = value; }

let currentCamera = 'environment';

function setCurrentCamera(value) { currentCamera = value; }

let flashOn = false;

function setFlashOn(value) { flashOn = value; }

let apiReady = false;

function setApiReady(value) { apiReady = value; }

let scanningActive = false;

function setScanningActive(value) { scanningActive = value; }

let isInitialized = false;

function setIsInitialized(value) { isInitialized = value; }

let initializationStarted = false;

function setInitializationStarted(value) { initializationStarted = value; }

let backgroundSyncInterval = null;

let isAuthReady = false;

let backgroundTasksStarted = false;

function setBackgroundTasksStarted(value) { backgroundTasksStarted = value; }

let cacheLoaded = false;

function setCacheLoaded(value) { cacheLoaded = value; }

let kynState = window.kynState || {
    frameId: null,
    sessionValid: false,
    parentReady: false,
    handshakeComplete: false,
    parentOrigin: window.location.origin,
    lastPong: Date.now(),
    protocolVersion: 'KYN-3.0',
    get compatibilityMode() { return SandboxDetector.detected; },
    get sandboxDetected() { return SandboxDetector.detected; }
};

const dataSource = {
    source: 'parent',
    userData: null,
    token: null,
    fetching: false,
    fetched: false,
    parentSessionReceived: false,
    parentControlled: true,
    fallbackMode: false
};

// FIX (module-split circular-import ordering): this used to call
// IframeEnvironment.getAdaptiveConfig() immediately at module-load time, which
// works fine in a single file but can run before friend-core.bootstrap.js (which
// declares IframeEnvironment) has finished initializing now that the two files
// import each other. Wrapping it in a Proxy defers the real call until the first
// time a property on ENV_CONFIG is actually read, by which point both modules
// have fully loaded — the object still behaves exactly like a plain config object
// everywhere else in the codebase.
const ENV_CONFIG = new Proxy({ __resolved: false }, {
    get(target, prop) {
        if (!target.__resolved) {
            Object.assign(target, IframeEnvironment.getAdaptiveConfig());
            target.__resolved = true;
        }
        return target[prop];
    }
});

function timeoutPromise(ms, message) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || 'Timeout')), ms);
    });
}

async function withTimeout(promise, ms, message) {
    try {
        return await Promise.race([promise, timeoutPromise(ms, message)]);
    } catch (error) {
        throw error;
    }
}

function validateFriendId(friendId) {
    if (typeof friendId !== 'string') return false;
    if (friendId.trim().length === 0) return false;
    if (friendId.length > 100) return false;
    const validPattern = /^[a-zA-Z0-9_\-:.@]+$/;
    return validPattern.test(friendId);
}

function validateFriendData(friendData) {
    if (!friendData || typeof friendData !== 'object') return false;
    
    const id = friendData.id || friendData.userId || friendData._id;
    if (!id || typeof id !== 'string') return false;
    
    if (id.trim().length === 0) return false;
    
    return true;
}

function checkMobile() {
    try { isMobile = window.innerWidth <= 768; } catch (error) {}
}

function getCurrentUser() {
    try {
        if (__session.user) {
            return __session.user;
        }
        if (SessionManager.getUser()) {
            return SessionManager.getUser();
        }
        if (window.parentCoordinator?.getUser) {
            const user = window.parentCoordinator.getUser();
            if (user) return user;
        }
        if (dataSource.userData) return dataSource.userData;
        if (window.KnectaAuth?.getUser) {
            const user = window.KnectaAuth.getUser();
            if (user) return user;
        }
        const userStr = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) return JSON.parse(userStr);
    } catch (error) {}
    return null;
}

function getValidToken() {
    return __session.token || SessionManager.getToken() || TokenPromise.getToken() || null;
}

const KnectaAuth = {
    token: null,
    tokenReady: false,
    tokenPromise: null,
    currentUser: null,
    userReady: false,
    cacheReady: false,
    migrationPerformed: false,
    parentControlled: true,
    
    init: async function() {
        try {
            this.checkTokenMigration();
            await this.waitForParentCoordinator();
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
            StatusManager.show('READY', 'KnectaAuth initialized');
        } catch (error) {
            Logger.error('KnectaAuth', 'Init failed', error);
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        }
    },
    
    checkTokenMigration: function() {
        const oldKeys = ['nexopa_token', 'accessToken', 'knecta_token', 'token', 'authToken', 'sessionToken'];
        for (const key of oldKeys) {
            localStorage.removeItem(key);
        }
    },
    
    waitForParentCoordinator: function() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50;
            const check = () => {
                attempts++;
                if (window.parentCoordinator) {
                    this.parentControlled = true;
                    resolve();
                    return;
                }
                if (attempts >= maxAttempts) {
                    this.parentControlled = false;
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    },
    
    loadCachedData: function() {
        const userStr = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) {
            try { this.currentUser = JSON.parse(userStr); } catch (e) {}
        }
    },
    
    dispatchReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaAuthReady', {
            detail: { token: this.token, user: this.currentUser, migrationPerformed: this.migrationPerformed, parentControlled: this.parentControlled }
        }));
        window.knectaToken = this.token;
        window.knectaUser = this.currentUser;
        window.authReady = true;
    },
    
    dispatchCacheReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaCacheReady', {
            detail: { token: this.token, user: this.currentUser, cacheOnly: true }
        }));
    },
    
    secureApiCall: async function(apiPath, options = {}, requireAuth = true) {
        if (window.parentCoordinator?.isAuthenticated()) {
            return window.parentCoordinator.apiRequest(apiPath, options);
        }
        return this.secureApiCallFallback(apiPath, options, requireAuth);
    },
    
    secureApiCallFallback: async function(apiPath, options = {}, requireAuth = true) {
        // PRODUCTION FIX: Do NOT call showLoading(true) here — it causes a
        // loading overlay flash on every background sync (contacts, friends, etc.)
        try {
            let token = null;
            if (requireAuth) {
                token = this.getToken();
                if (!token) throw new Error('Authentication required');
            }
            
            const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
            if (token && requireAuth) headers.Authorization = `Bearer ${token}`;
            
            const response = await secureFetch(apiPath, {
                method: options.method || 'GET',
                headers,
                body: options.body
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            return response.json();
        } finally {
            // PRODUCTION FIX: showLoading(false) removed — we never called showLoading(true) above
        }
    },
    
    showLoading: function(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.toggle('active', show);
    },
    
    handleTokenExpired: function() {
        this.token = null;
        this.tokenReady = false;
        __session.token = null;
        __session.ready = false;
        if (window.parentCoordinator) {
            window.parentCoordinator.handleTokenExpired();
        } else {
            showNotification?.('Session expired', 'error');
            window.dispatchEvent(new CustomEvent('knectaTokenExpired'));
        }
    },
    
    handleAuthError: function() {
        showNotification?.('Please log in to continue', 'warning');
        window.dispatchEvent(new CustomEvent('knectaAuthError'));
    },
    
    showNotification: function(message, type = 'success') {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError?.(message);
        } else {
            showNotification?.(message, type);
        }
    },
    
    isAuthenticated: function() { 
        return !!(window.parentCoordinator?.isAuthenticated() || __session.ready); 
    },
    getUser: function() { 
        return window.parentCoordinator?.getUser() || __session.user || this.currentUser; 
    },
    getToken: function() { 
        return window.parentCoordinator?.getToken() || __session.token || this.token; 
    }
};

const ParentCoordinator = {
    config: {
        parentOrigin: window.location.origin,
        get debug() { return IframeEnvironment.type === 'LOCAL_DEV'; }
    },
    
    state: {
        parentDetected: false,
        sessionReceived: false,
        sessionData: null,
        lastSync: null,
        parentReachable: false,
        authReady: false,
        parentOrigin: window.location.origin,
        authoritativeSession: false,
        messageHandlersBound: false
    },
    
    ui: {
        protectedUIBlocked: true,
        authErrorDisplayed: false
    },
    
    init: async function() {
        try {
            await this.detectParent();
            this.bindEnhancedMessageHandlers();
        } catch (error) {
            this.handleParentUnavailable();
        }
    },
    
    detectParent: function() {
        return new Promise((resolve, reject) => {
            if (window.parent === window || !window.parent) {
                this.state.parentDetected = false;
                reject(new Error('Parent window not available'));
                return;
            }
            
            try {
                const parentOrigin = window.parent.location.origin;
                this.state.parentDetected = true;
                this.state.parentOrigin = parentOrigin;
                window.kynState.parentOrigin = parentOrigin;
                StatusManager.show('READY', `Parent detected: ${parentOrigin}`);
                resolve();
            } catch (error) {
                this.state.parentDetected = true;
                this.state.parentOrigin = window.location.origin;
                window.kynState.parentOrigin = window.location.origin;
                StatusManager.show('READY', 'Parent detected (cross-origin)');
                resolve();
            }
        });
    },
    
    bindEnhancedMessageHandlers: function() {
        if (this.state.messageHandlersBound) return;
        
        window.addEventListener('message', (event) => {
            setTimeout(() => {
                if (!SecurityValidator.validateMessage(event)) return;
                
                const message = event.data;
                if (!message || !message.type) return;
                
                switch(message.type) {
                    case 'SESSION_DATA':
                        this.handleSessionData(message);
                        break;
                    case 'SESSION_ACTIVE':
                        this.handleSessionActive(message);
                        break;
                    case 'SESSION_NULL':
                        this.handleSessionNull(message);
                        break;
                    case 'SESSION_REFRESHED':
                        this.handleSessionRefreshed(message);
                        break;
                    case 'SESSION_INVALIDATED':
                        this.handleSessionInvalidated(message);
                        break;
                    case 'PARENT_READY':
                        // PRODUCTION FIX: pass raw event so origin can be learned
                        message._origin = event.origin;
                        handleParentReady(message, event);
                        break;
                    case 'AUTH_READY':
                        handleAuthReady(message);
                        break;
                    case 'LOGOUT':
                        this.handleLogout(message);
                        break;
                    case 'AUTH_STATE_CHANGED':
                        this.handleAuthStateChanged(message);
                        break;
                    case 'USER_PROFILE_UPDATED':
                        this.handleProfileUpdated(message);
                        break;
                    case 'REQUEST_FRIENDS_LIST': {
                        const allFriends = FriendCacheManager.getAllFriends();
                        window.parent.postMessage({ type: 'FRIENDS_DATA', friends: allFriends }, '*');
                        break;
                    }
                    // SETTINGS FIX: handle per-key setting changes from parent
                    case 'SETTING_CHANGED': {
                        const p = message.payload || message;
                        if (p.section && p.key !== undefined) {
                            applySettingToFriendModule(p.section, p.key, p.value);
                            window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section: p.section, key: p.key, value: p.value, timestamp: Date.now() } }));
                        }
                        break;
                    }
                    case 'SETTINGS_UPDATED': {
                        const s = (message.payload || message).settings || {};
                        Object.entries(s).forEach(([sec, secVal]) => {
                            if (secVal && typeof secVal === 'object')
                                Object.entries(secVal).forEach(([k, v]) => applySettingToFriendModule(sec, k, v));
                        });
                        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));
                        break;
                    }
                }
            }, 0);
        });
        
        window.addEventListener('knectaAuthReady', this.handleAuthReady.bind(this));
        window.addEventListener('knectaTokenExpired', this.handleTokenExpired.bind(this));
        window.addEventListener('knectaAuthError', this.handleAuthError.bind(this));
        
        this.state.messageHandlersBound = true;
    },
    
    handleSessionActive: function(data) {
        const payload = data.payload || data;
        if (!payload) return;
        
        this.state.authoritativeSession = true;
        this.state.sessionData = payload;
        this.state.sessionReceived = true;
        this.state.lastSync = Date.now();
        this.state.authReady = true;
        this.ui.protectedUIBlocked = false;
        
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
        
        StatusManager.show('SUCCESS', 'Authoritative session received');
        
        window.dispatchEvent(new CustomEvent('parentSessionReady', {
            detail: { session: payload, source: 'parent_coordinator', authoritative: true }
        }));
    },
    
    handleSessionData: function(data) {
        const payload = data.payload || data;
        if (!payload) return;
        
        this.state.sessionData = payload;
        this.state.sessionReceived = true;
        this.state.lastSync = Date.now();
        this.state.authReady = true;
        this.ui.protectedUIBlocked = false;
        
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
        
        StatusManager.show('SUCCESS', 'Session data received');
        
        window.dispatchEvent(new CustomEvent('parentSessionReady', {
            detail: { session: payload, source: 'parent_coordinator' }
        }));
    },
    
    handleSessionNull: function(data) {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        this.state.authoritativeSession = false;
        this.ui.protectedUIBlocked = true;
        __session.ready = false;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
    },
    
    handleSessionRefreshed: function(data) {
        const payload = data.payload || data;
        if (!payload) return;
        
        this.state.sessionData = payload;
        this.state.lastSync = Date.now();
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
    },
    
    handleSessionInvalidated: function(data) {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        this.state.authoritativeSession = false;
        this.ui.protectedUIBlocked = true;
        __session.ready = false;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
    },
    
    handleLogout: function(data) {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        this.state.authoritativeSession = false;
        this.ui.protectedUIBlocked = true;
        __session.ready = false;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        StatusManager.show('DISCONNECTED', 'Logged out');
        window.dispatchEvent(new CustomEvent('parentSessionLogout'));
    },
    
    handleAuthStateChanged: function(data) {
        const payload = data.payload || data;
        if (payload.authenticated && payload.session) {
            this.handleSessionData({ data: payload.session });
        } else {
            this.handleLogout(data);
        }
    },
    
    handleProfileUpdated: function(data) {
        const payload = data.payload || data;
        if (this.state.sessionData?.user && payload.userData) {
            this.state.sessionData.user = { ...this.state.sessionData.user, ...payload.userData };
            if (__session.user) {
                __session.user = { ...__session.user, ...payload.userData };
            }
            window.dispatchEvent(new CustomEvent('parentProfileUpdated', { detail: { user: this.state.sessionData.user } }));
        }
    },
    
    handleAuthReady: function(event) {
        if (this.state.sessionReceived) return;
        if (event.detail?.token && event.detail?.user) {
            this.state.authReady = true;
            this.ui.protectedUIBlocked = false;
            __session.token = event.detail.token;
            __session.user = event.detail.user;
            __session.ready = true;
            StatusManager.show('SUCCESS', 'Auth ready');
        }
    },
    
    handleTokenExpired: function() {
        safeSend({
            type: 'TOKEN_EXPIRED',
            payload: {
                source: MODULE_NAME,
                timestamp: Date.now()
            }
        });
        this.ui.protectedUIBlocked = true;
        __session.ready = false;
        __session.token = null;
    },
    
    handleAuthError: function() {
        safeSend({
            type: 'AUTH_ERROR',
            payload: {
                source: MODULE_NAME,
                timestamp: Date.now()
            }
        });
        this.ui.protectedUIBlocked = true;
    },
    
    handleParentUnavailable: function() {
        this.state.parentReachable = false;
        this.ui.protectedUIBlocked = true;
        StatusManager.show('DISCONNECTED', 'Parent unavailable');
    },
    
    sendToParent: function(message) { 
        return safeSend(message); 
    },
    
    shouldBlockProtectedUI: function() { return this.ui.protectedUIBlocked || !parentReadyReceived || !__session.ready || !authReadyReceived; },
    getSession: function() { return this.state.sessionData || { token: __session.token, user: __session.user }; },
    isAuthenticated: function() { return !!(this.state.sessionReceived && this.state.sessionData?.token) || __session.ready; },
    getUser: function() { return this.state.sessionData?.user || __session.user || null; },
    getToken: function() { return this.state.sessionData?.token || __session.token || null; },
    
    apiRequest: async function(endpoint, options = {}) {
        try {
            if (this.state.parentReachable && this.state.sessionReceived && parentReadyReceived) {
                return await this.apiRequestViaParent(endpoint, options);
            }
            return await this.apiRequestDirect(endpoint, options);
        } catch (error) {
            Logger.error('ParentCoordinator', 'API request failed', error, { endpoint });
            throw error;
        }
    },
    
    apiRequestViaParent: function(endpoint, options) {
        return new Promise((resolve, reject) => {
            const messageId = generateMessageId();
            const requestId = generateRequestId();
            
            const handler = (event) => {
                const message = event.data;
                if (message.type === 'API_RESPONSE' && message.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    if (message.payload.success) {
                        StatusManager.show('SUCCESS', `API: ${endpoint}`);
                        resolve(message.payload.data);
                    } else {
                        reject(new Error(message.payload.error || 'API request failed'));
                    }
                }
            };
            
            window.addEventListener('message', handler);
            
            safeSend({
                type: 'API_REQUEST',
                requestId,
                payload: {
                    endpoint,
                    options,
                    timestamp: Date.now()
                }
            });
        });
    },
    
    apiRequestDirect: async function(endpoint, options = {}) {
        const token = this.getToken();
        if (!token && options.requireAuth !== false) throw new Error('Authentication token not available');
        
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token && options.requireAuth !== false) headers.Authorization = `Bearer ${token}`;
        
        const response = await secureFetch(endpoint, {
            method: options.method || 'GET',
            headers,
            body: options.body
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                this.handleTokenExpired();
                throw new Error('Session expired');
            }
            throw new Error(`API error: ${response.status}`);
        }
        
        return response.json();
    },
    
    showAuthError: function(message) {
        this.ui.authErrorDisplayed = true;
        const overlay = document.getElementById('authErrorOverlay');
        const messageElement = document.getElementById('authErrorMessage');
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        } else {
            showNotification?.(message || 'Authentication error', 'error');
        }
    },
    
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        const overlay = document.getElementById('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    },
    
    showReconnectionState: function() {
        let indicator = document.getElementById('reconnectionIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'reconnectionIndicator';
            indicator.className = 'reconnection-indicator';
            indicator.innerHTML = `
                <div class="reconnection-content">
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <span>Reconnecting...</span>
                </div>
            `;
            document.body.appendChild(indicator);
        }
    },
    
    hideReconnectionState: function() {
        const indicator = document.getElementById('reconnectionIndicator');
        if (indicator) indicator.remove();
    },
    
    log: function(message, data) { if (this.config.debug) Logger.debug('ParentCoordinator', message, data); },
    logError: function(message, error) { Logger.error('ParentCoordinator', message, error); }
};

const SafetyGuards = {
    loggedErrors: new Set(),
    retryCounters: new Map(),
    messageCache: new Set(),
    
    safeLogError: function(module, functionName, error, data = null) {
        const errorKey = `${module}:${functionName}:${error?.message || error}`;
        if (!this.loggedErrors.has(errorKey)) {
            this.loggedErrors.add(errorKey);
            Logger.error(module, `${functionName} failed`, error, data);
        }
    },
    
    safeGetElement: function(id) {
        try { return document.getElementById(id); } catch (error) { return null; }
    },
    
    isSessionValid: function() {
        return currentState === LIFECYCLE_STATES.ACTIVE && __session.ready && authReadyReceived;
    },
    
    isUserDataValid: function() {
        return !!(getCurrentUser()?.id);
    },
    
    enforceSessionGuard: function(operation) {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            return { valid: false, reason: 'Module not ready' };
        }
        
        if (!parentReadyReceived) {
            return { valid: false, reason: 'Parent not ready' };
        }
        
        if (!authReadyReceived) {
            return { valid: false, reason: 'Authentication not ready' };
        }
        
        if (!__session.ready) {
            return { valid: false, reason: 'Session not valid' };
        }
        
        // FIX: __IFRAME_READY__ was NEVER set anywhere in the codebase — this guard
        // was blocking every single friend operation silently (click fires, no API call).
        // __HANDSHAKE_COMPLETE__ is set in handleParentReady() and is sufficient.
        // We remove the __IFRAME_READY__ check since it has no setter and would always
        // block. If you want to keep the flag, set it alongside __HANDSHAKE_COMPLETE__.
        if (!window.__HANDSHAKE_COMPLETE__) {
            return { valid: false, reason: 'Connection not ready' };
        }
        
        // FIX Bug#3: Do NOT block when offline — offline mutations need to
        // reach the optimistic / queue path inside each action handler.
        // API calls made while offline will be caught there and queued.
        
        return {
            valid: true,
            session: { token: __session.token, user: __session.user }
        };
    },
    
    safeExecute: function(funcName, func, fallbackValue = null, context = null) {
        try {
            return func.call(context || this);
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeExecute', error);
            return fallbackValue;
        }
    }
};

const SecurityManager = {
    get originWhitelist() { return SecurityValidator._trustedOrigins; },
    token: null,
    
    init() {
        // NOTE (module-split): originWhitelist already *is* SecurityValidator._trustedOrigins
        // (see the getter above), so this used to just add each trusted origin back into the
        // same Set it came from — a no-op even in the original single-file code. Removed to
        // avoid an unnecessary eager read of SecurityValidator across the module boundary.
    },
    
    isOriginTrusted: (origin) => SecurityValidator.isOriginTrusted(origin),
    
    sanitizeMessage(data) {
        return SecurityValidator.sanitizeMessage(data);
    },
    
    validateOrigin: (event) => SecurityValidator.validateMessage(event),
    
    detectSandbox: () => SandboxDetector.detect(),
    
    configureForEnvironment() {
        if (window.kynState?.sandboxDetected && window.featureFlags) {
            window.featureFlags.messageSigning = false;
            window.featureFlags.heartbeat = false;
        }
    },
    
    isolateToken(token) {
        this.token = token;
        return () => this.token;
    },
    
    clearToken() { this.token = null; }
};

SecurityManager.init();

const ResourceManager = {
    timers: new Set(),
    listeners: new Map(),
    observers: new Set(),
    intervals: new Set(),
    
    registerTimer(timerId) {
        this.timers.add(timerId);
        return timerId;
    },
    
    clearTimer(timerId) {
        clearTimeout(timerId);
        clearInterval(timerId);
        this.timers.delete(timerId);
    },
    
    registerInterval(intervalId) {
        this.intervals.add(intervalId);
        return intervalId;
    },
    
    clearInterval(intervalId) {
        clearInterval(intervalId);
        this.intervals.delete(intervalId);
    },
    
    registerListener(target, type, handler, options = {}) {
        target.addEventListener(type, handler, options);
        const key = Symbol('listener');
        this.listeners.set(key, { target, type, handler, options });
        return key;
    },
    
    registerObserver(observer) {
        this.observers.add(observer);
        return observer;
    },
    
    release() {
        this.timers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.timers.clear();
        
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        this.listeners.forEach(({ target, type, handler, options }) => {
            target.removeEventListener(type, handler, options);
        });
        this.listeners.clear();
        
        this.observers.forEach(observer => {
            if (observer.disconnect) observer.disconnect();
        });
        this.observers.clear();
        
        ParentCommunicationManager.destroy();
        this.timers.clear();
        this.intervals.clear();
        this.listeners.clear();
        this.observers.clear();
    }
};

const MessageBus = {
    handlers: new Map(),
    messageCache: new Set(),
    
    init() {
        this._setupListener();
        StatusManager.show('READY', 'MessageBus initialized');
    },
    
    _setupListener() {
        window.addEventListener('message', (event) => {
            setTimeout(() => this.handleIncoming(event), 0);
        });
    },
    
    validateOrigin: (origin) => SecurityValidator.isOriginTrusted(origin),
    
    validateMessage(data) {
        return !!(data && data.type && data.id);
    },
    
    handleIncoming(event) {
        if (!this.validateOrigin(event.origin)) return;
        if (!this.validateMessage(event.data)) return;
        
        const message = event.data;
        
        DiagnosticsAgent.trackReceive(message.type);
        
        const { id, type } = message;
        
        if (this.messageCache.has(id)) return;
        this.messageCache.add(id);
        setTimeout(() => this.messageCache.delete(id), 60000);
        
        const handler = this.handlers.get(type);
        if (handler) {
            try { handler(message, event); } catch (e) {}
        }
        
        const generalHandler = this.handlers.get('*');
        if (generalHandler) {
            try { generalHandler(message, event); } catch (e) {}
        }
    },
    
    send(target, message, targetOrigin = window.location.origin) {
        if (!target || !message) return false;
        
        const validatedMessage = {
            type: message.type,
            id: message.id || generateMessageId(),
            source: message.source || MODULE_NAME,
            target: 'parent',
            payload: message.payload || {},
            timestamp: Date.now()
        };
        
        if (message.requestId) {
            validatedMessage.requestId = message.requestId;
        }
        
        const adapted = CompatibilityBridge.adaptOutgoing(validatedMessage);
        
        try {
            target.postMessage(adapted, targetOrigin);
            DiagnosticsAgent.trackSend(adapted.type || adapted.action);
            return true;
        } catch (e) {
            return false;
        }
    },
    
    sendToParent(message) {
        if (!window.parent || window.parent === window) return false;
        return this.send(window.parent, message, window.kynState?.parentOrigin || window.location.origin);
    },
    
    on(type, handler) {
        this.handlers.set(type, handler);
    },
    
    off(type) {
        this.handlers.delete(type);
    },
    
    destroy() {
        window.removeEventListener('message', this.handleIncoming.bind(this));
        this.handlers.clear();
        this.messageCache.clear();
    }
};

let friendsLoading = false;

function setFriendsLoading(value) { friendsLoading = value; }

let friendsLoadingTimeout = null;

function clearFriendsLoading() {
    friendsLoading = false;
    if (friendsLoadingTimeout) {
        clearTimeout(friendsLoadingTimeout);
        friendsLoadingTimeout = null;
    }
}

function loadCachedDataInstantly() {
    try {
        // Load user data from cache (existing logic)
        const cachedUser = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA) || 
                           SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            userData = cachedUser;
            currentUser = cachedUser;
            Logger.info('loadCachedDataInstantly', 'User data loaded from cache');
        }

        // Load friends data from localStorage cache
        // NOTE: messages module saves as 'kynecta_friends_cache_v8' (with y),
        //       while our own key is 'knecta_friends_cache_v8' — try both.
        const cachedFriends = SafeStorage.getItem('knecta_friends_cache_v8') ||
                              SafeStorage.getItem('kynecta_friends_cache_v8') ||
                              SafeStorage.getItem('friends') ||
                              localStorage.getItem('kynecta_friends_cache_v8') ||
                              localStorage.getItem('knecta_friends_cache_v8');
        if (cachedFriends) {
            try {
                const friendsData = JSON.parse(cachedFriends);
                const friends = friendsData.friends || friendsData; // Handle both formats
                if (Array.isArray(friends) && friends.length > 0) {
                    // FIX: The messages module also writes to kynecta_friends_cache_v8
                    // with ALL conversation participants (not just accepted friends) and
                    // sets their online presence status ('online'/'offline') as the status
                    // field. We must NOT load these as accepted friends — only load records
                    // that explicitly have friendship status 'accepted' or are genuine
                    // legacy friend records (identifiable by friends-module-only fields).
                    const acceptedFriends = friends.filter(friend => {
                        if (!friend || !friend.id) return false;
                        const st = friend.status;
                        if (st === 'accepted') return true;
                        if (st === 'pending_sent' || st === 'pending_received' ||
                            st === 'pending' || st === 'blocked' || st === 'removed' ||
                            st === 'none') return false;
                        // Presence-only statuses from messages module participants —
                        // only treat as accepted friend if there's a friends-module marker
                        if (st === 'online' || st === 'offline' || st === 'away' || st === 'busy' || !st) {
                            return !!(friend.addedAt || friend.friendId || friend.localId || friend.serverId);
                        }
                        return false;
                    });
                    acceptedFriends.forEach(friend => {
                        FriendCacheManager._cache.friends.set(String(friend.id), friend);
                    });
                    if (acceptedFriends.length > 0) {
                        FriendCacheManager.syncToGlobals();
                        window.dispatchEvent(new CustomEvent('friendsUpdated', {
                            detail: { friends: acceptedFriends, count: acceptedFriends.length, cached: true, offline: !navigator.onLine }
                        }));
                    }
                    Logger.info('loadCachedDataInstantly', `Loaded ${acceptedFriends.length}/${friends.length} friends from localStorage cache`);
                }
            } catch (e) {
                Logger.warn('loadCachedDataInstantly', 'Failed to parse cached friends data', e);
            }
        }

        // Priority 1: LocalStorage — sync, fires friendsUpdated when ready
        try {
            const raw = JSON.parse(
                localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS) ||
                localStorage.getItem('friends') || '[]'
            );
            if (Array.isArray(raw) && raw.length > 0) {
                FriendCacheManager.setFriends(raw);
                FriendCacheManager.syncToGlobals();
                updateFriendCounts?.();
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: { friends: raw, count: raw.length, cached: true }
                }));
            }
        } catch (_) {}

        // Priority 2: SafeStorage — async, fires friendsUpdated when ready
        const storagePromise = SafeStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (storagePromise && typeof storagePromise.then === 'function') {
            storagePromise.then((raw) => {
                if (raw) {
                    const friends = JSON.parse(raw);
                    if (Array.isArray(friends) && friends.length > 0) {
                        FriendCacheManager.setFriends(friends);
                        FriendCacheManager.syncToGlobals();
                        window.dispatchEvent(new CustomEvent('friendsUpdated', {
                            detail: { friends: friends, count: friends.length, cached: true }
                        }));
                    }
                }
            })
            .catch(() => {});
        }

        // Priority 3: IndexedDB — async, fires friendsUpdated when ready
        (async () => {
            try {
                const ls = window.KynectaFriendsLocalStore;
                if (!ls) return;
                await ls.ready();
                const [idbFriends, idbIncoming, idbSent] = await Promise.all([
                    ls.getFriends(),
                    ls.getPendingReceived(),
                    ls.getPendingSent(),
                ]);
                if (idbFriends.length > 0) {
                    const normalized = idbFriends.map(r => ({
                        id: r.friendId, localId: r.id, serverId: r.serverId,
                        displayName: r.displayName || r.username || r.friendId,
                        username: r.username || '', avatar: r.avatar || '', photoURL: r.avatar || '',
                        coverPhoto: r.coverPhoto || '',
                        status: r.status, addedAt: r.createdAt, isLocalOnly: r.isLocalOnly,
                    }));
                    normalized.forEach(f => FriendCacheManager._cache.friends.set(String(f.id), f));
                    FriendCacheManager.syncToGlobals();
                    window.dispatchEvent(new CustomEvent('friendsUpdated', {
                        detail: { friends: normalized, count: normalized.length, cached: true, offline: !navigator.onLine }
                    }));
                }
                if (idbIncoming.length > 0) {
                    const reqs = idbIncoming.map(r => ({
                        id: r.serverId || r.id, localId: r.id,
                        senderId: r.friendId, receiverId: r.userId, status: 'pending',
                        displayName: r.displayName || r.username || r.friendId,
                        username: r.username || '', avatar: r.avatar || '', createdAt: r.createdAt,
                    }));
                    reqs.forEach(r => FriendCacheManager._cache.requests.set(String(r.id), r));
                    window.dispatchEvent(new CustomEvent('requestsUpdated', {
                        detail: { requests: reqs, count: reqs.length, cached: true }
                    }));
                }
                if (idbSent.length > 0) {
                    const sent = idbSent.map(r => ({
                        id: r.serverId || r.id, localId: r.id,
                        senderId: r.userId, receiverId: r.friendId, status: 'pending',
                        displayName: r.displayName || r.username || r.friendId,
                        username: r.username || '', avatar: r.avatar || '', createdAt: r.createdAt,
                    }));
                    sent.forEach(r => FriendCacheManager._cache.sentRequests.set(String(r.id), r));
                    window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
                        detail: { requests: sent, count: sent.length, cached: true }
                    }));
                }
            } catch (e) {
                Logger.warn('loadCachedDataInstantly', 'IndexedDB hydration failed', e.message);
            }
        })();

        // Always fire cached requests if present
        const cachedRequests = FriendCacheManager.getAllRequests();
        if (cachedRequests.length > 0) {
            window.dispatchEvent(new CustomEvent('requestsUpdated', {
                detail: { requests: cachedRequests, count: cachedRequests.length, cached: true }
            }));
        }

        const cachedSentRequests = FriendCacheManager.getAllSentRequests();
        if (cachedSentRequests.length > 0) {
            window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
                detail: { requests: cachedSentRequests, count: cachedSentRequests.length, cached: true }
            }));
        }

        // Discovery users
        const cachedAllUsers = FriendCacheManager.getAllUsers();
        if (cachedAllUsers.length > 0) {
            window._allUsersCache = cachedAllUsers;
            window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                detail: { users: cachedAllUsers, count: cachedAllUsers.length, cached: true }
            }));
        } else {
            // Try localStorage discover_users
            try {
                const rawUsers = JSON.parse(localStorage.getItem('discover_users') || '[]');
                if (Array.isArray(rawUsers) && rawUsers.length > 0) {
                    window._allUsersCache = rawUsers;
                    FriendCacheManager.setUsers(rawUsers);
                    window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                        detail: { users: rawUsers, count: rawUsers.length, cached: true }
                    }));
                }
            } catch (_) {}
        }
        
        const contactsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (contactsData) contacts = JSON.parse(contactsData) || [];
        
        const groupsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) groups = JSON.parse(groupsData) || [];
        
        const interactionsData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.LAST_INTERACTIONS);
        if (interactionsData) window.lastInteractions = JSON.parse(interactionsData) || {};
        
        const notesData = SafeStorage.getItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (notesData) window.privateNotes = JSON.parse(notesData) || {};
        
    } catch (error) {
        Logger.error('Cache', 'Failed to load cached data', error);
    }
}

let _loadFriendsInFlight = null;

function setLoadFriendsInFlight(value) { _loadFriendsInFlight = value; }

let _loadFriendsLastCall = 0;

function setLoadFriendsLastCall(value) { _loadFriendsLastCall = value; }

// Additional exports required for cross-module wiring between the 3 split files
export {
    CompatibilityBridge,
    DiagnosticsAgent,
    ENV_CONFIG,
    FriendRequestManager,
    FriendSearchEngine,
    GroupParticipationManager,
    IdempotentTracker,
    KnectaAuth,
    MessageBus,
    MessageTracker,
    NavigationGuard,
    ParentCoordinator,
    QRCodeManager,
    ResourceManager,
    SafetyGuards,
    SecurityManager,
    UIBridge,
    UIFailsafe,
    V6,
    V6_STATES,
    _loadFriendsInFlight,
    _loadFriendsLastCall,
    allUsers,
    apiReady,
    backgroundSyncInterval,
    backgroundTasksStarted,
    cacheLoaded,
    cameraStream,
    checkMobile,
    clearFriendsLoading,
    contacts,
    currentCamera,
    currentCategoryFilter,
    currentSearchTerm,
    currentUser,
    dataSource,
    featureFlags,
    flashOn,
    friendRequests,
    friends,
    friendsLoading,
    getCurrentUser,
    getValidToken,
    groups,
    initializationStarted,
    isAuthReady,
    isInitialized,
    isMobile,
    kynState,
    loadCachedDataInstantly,
    mutedFriends,
    mutualFriendsCache,
    pinnedFriends,
    saveFriendLocal,
    scanningActive,
    selectedFriend,
    sentRequests,
    setAllUsers,
    setApiReady,
    setBackgroundTasksStarted,
    setCacheLoaded,
    setCameraStream,
    setContacts,
    setCurrentCamera,
    setCurrentCategoryFilter,
    setCurrentSearchTerm,
    setCurrentUser,
    setFlashOn,
    setFriendRequests,
    setFriends,
    setFriendsLoading,
    setGroups,
    setInitializationStarted,
    setIsInitialized,
    setLoadFriendsInFlight,
    setLoadFriendsLastCall,
    setMutedFriends,
    setPinnedFriends,
    setScanningActive,
    setSelectedFriend,
    setSentRequests,
    setUserData,
    temporaryFriends,
    timeoutPromise,
    userData,
    validateFriendData,
    validateFriendId,
    withTimeout
};
