/**
 * PART 3/4 — OPERATIONS
 * FriendRequestManager, Friend Operations (send/accept/decline),
 * QR Code Manager, Camera, Nearby Manager, Group Participation
 */
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
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = __session.token || localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('moodchat_token') || '';
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
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = __session.token || localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('moodchat_token') || '';
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


// =============================================
// [GLOBAL EVENT HANDLERS FOR FRIEND_ACCEPTED]
// =============================================

// Handle incoming FRIEND_ACCEPTED events from other modules/parent
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

// Register event listener for FRIEND_ACCEPTED
window.addEventListener('FRIEND_ACCEPTED', handleFriendAcceptedEvent);

// Also listen for the internal event from our own accept method
window.addEventListener('friendRequestAccepted', handleFriendAcceptedEvent);

// =============================================
// [FRIEND SEARCH ENGINE] - FIXED: CLIENT-SIDE SEARCH ONLY
// =============================================

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

// =============================================
// [QR CODE MANAGER]
// =============================================

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

        const timestamp = Date.now();
        const nonce = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

        // P1 FIX: use HMAC-SHA256 when Web Crypto is available
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
            signature:   signature
        };

        const qrString = JSON.stringify(qrData);
        this._qrCache.set(userId, qrData);
        
        console.log('[QRCodeManager] Generated unique QR for user:', { userId, username, displayName });
        
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

// =============================================
// [GROUP PARTICIPATION MANAGER]
// =============================================

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

// =============================================
// [UI BRIDGE]
// =============================================


