/**
 * Kynecta Friend Service
 * Abstraction layer for friend-related API calls
 * @version 1.1.0
 *
 * FIXES IN THIS VERSION:
 *  1. sendFriendRequest() wrapped in try/catch — errors no longer bubble up
 *     uncaught causing friend-core.js to silently save isLocalOnly:true forever.
 *  2. sendFriendRequest() logs the full error so you can see WHY it failed.
 *  3. acceptFriendRequest() / rejectFriendRequest() also wrapped — same pattern.
 *  4. _makeRequest() now logs every non-OK HTTP response before throwing so
 *     failures are always visible in the console.
 */

(function() {
    'use strict';

    class FriendService {
        constructor() {
            this._cache = new Map();
            this._pendingRequests = new Map();
            this._friendStatusIntervals = new Map();
        }

        /**
         * Get friends list
         * @param {Object} options - Query options
         * @returns {Promise} Resolves with friends list
         */
        async getFriends(options = {}) {
            const cacheKey = 'friends_list';
            
            // Check cache
            if (this._cache.has(cacheKey)) {
                const cached = this._cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 30000) {
                    return cached.data;
                }
            }

            const params = new URLSearchParams({
                limit: options.limit || 100,
                ...(options.offset && { offset: options.offset })
            });

            try {
                const response = await this._makeRequest('GET', `/api/friends?${params}`);
                if (!response) return [];

                // ── safeArray guard ────────────────────────────────────────────
                const rawFriends = (typeof safeArray === 'function')
                    ? safeArray(response.data)
                    : (Array.isArray(response.data) ? response.data : []);

                // Tag every record with status:'accepted' so FriendCacheManager
                // correctly places them in the friends cache (not pending/sent) on reload.
                const friends = rawFriends
                    .map(f => f ? { ...f, status: f.status || 'accepted' } : f)
                    .filter(Boolean);
                
                // Cache result
                this._cache.set(cacheKey, { data: friends, timestamp: Date.now() });

                console.log('[FriendService] getFriends: loaded', friends.length, 'items');

                // Update store
                if (window.KynectaStore) {
                    window.KynectaStore.set('friends.list', friends);
                }
                try { localStorage.setItem('knecta_friends_cache', JSON.stringify(friends)); } catch (_) {}
                if (window.AppStorage) {
                    window.AppStorage.set('knecta_friends_cache', friends);
                }
                // Write to IndexedDB one-by-one — AppCache.save() expects individual records
                if (friends.length > 0 && window.AppCache) {
                    const idbFriends = friends.map(f => ({
                        ...f,
                        id:          String(f.id || f.friendId),
                        friendId:    String(f.id || f.friendId),
                        userId:      String(f.userId || f.id),
                        status:      'accepted',
                        isLocalOnly: false,
                    }));
                    idbFriends.forEach(r => window.AppCache.save('friends', r).catch(() => {}));
                }

                return friends;
            } catch (err) {
                console.error('[FriendService] getFriends failed:', err.message);
                return [];
            }
        }

        /**
         * Send friend request
         * @param {string|number} userId - User ID to send request to
         * @param {string} message - Optional request message
         * @returns {Promise<Object|null>} Server response data or null on failure
         *
         * FIX v1.1.0: Wrapped in try/catch so HTTP errors (400/401/500) are caught
         * here and logged clearly instead of bubbling up to friend-core.js where
         * they were silently caught and the record was incorrectly saved as
         * isLocalOnly:true, making the request invisible to the receiver.
         */
        async sendFriendRequest(userId, message = '') {
            if (!userId) {
                console.warn('[FriendService] sendFriendRequest: missing userId');
                return null;
            }

            try {
                const response = await this._makeRequest('POST', '/api/friends/requests/send', {
                    receiverId: userId,
                    message
                });

                if (!response) {
                    // null means offline — caller should decide whether to queue
                    console.warn('[FriendService] sendFriendRequest: offline or no response for userId:', userId);
                    return null;
                }

                console.log('[FriendService] sendFriendRequest: ✅ success, requestId:', response.data?.request?.id || response.data?.id);

                // Emit event so any listener (friend-core, UI) can react immediately
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('FRIEND_REQUEST_SENT', { userId, ...response.data });
                }

                return response.data;

            } catch (err) {
                // FIX: Previously this error bubbled uncaught. Now we catch it here,
                // log it with full details, and return null so the caller can handle it
                // properly (e.g. show an error toast, NOT silently mark as local-only).
                console.error('[FriendService] sendFriendRequest FAILED for userId:', userId, '—', err.message);
                return null;
            }
        }

        /**
         * Accept friend request
         * @param {string|number} requestId - Request ID
         * @returns {Promise<Object|null>}
         *
         * FIX v1.1.0: Wrapped in try/catch — HTTP errors no longer throw uncaught.
         */
        async acceptFriendRequest(requestId) {
            if (!requestId) return null;

            try {
                const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/accept`);
                if (!response) return null;

                // Update store
                if (window.KynectaStore) {
                    const requests = window.KynectaStore.get('friends.requests') || [];
                    window.KynectaStore.set('friends.requests', requests.filter(r => r.id !== requestId));
                }

                // Emit event
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('FRIEND_REQUEST_ACCEPTED', response.data);
                }

                console.log('[FriendService] acceptFriendRequest: ✅ accepted requestId:', requestId);
                return response.data;

            } catch (err) {
                console.error('[FriendService] acceptFriendRequest FAILED for requestId:', requestId, '—', err.message);
                return null;
            }
        }

        /**
         * Reject friend request
         * @param {string|number} requestId - Request ID
         * @returns {Promise<Object|null>}
         *
         * FIX v1.1.0: Wrapped in try/catch.
         */
        async rejectFriendRequest(requestId) {
            if (!requestId) return null;

            try {
                const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/reject`);
                if (!response) return null;

                // Update store
                if (window.KynectaStore) {
                    const requests = window.KynectaStore.get('friends.requests') || [];
                    window.KynectaStore.set('friends.requests', requests.filter(r => r.id !== requestId));
                }

                console.log('[FriendService] rejectFriendRequest: ✅ rejected requestId:', requestId);
                return response.data;

            } catch (err) {
                console.error('[FriendService] rejectFriendRequest FAILED for requestId:', requestId, '—', err.message);
                return null;
            }
        }

        /**
         * Remove friend
         * @param {string|number} friendId - Friend ID
         * @returns {Promise<Object|null>}
         */
        async removeFriend(friendId) {
            if (!friendId) return null;

            try {
                const response = await this._makeRequest('DELETE', `/api/friends/${friendId}`);
                if (!response) return null;

                // Update store
                if (window.KynectaStore) {
                    const friends = window.KynectaStore.get('friends.list') || [];
                    window.KynectaStore.set('friends.list', friends.filter(f => f.id !== friendId));
                }

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('FRIEND_REMOVED', { friendId });
                }

                return response.data;

            } catch (err) {
                console.error('[FriendService] removeFriend FAILED for friendId:', friendId, '—', err.message);
                return null;
            }
        }

        /**
         * Block user
         * @param {string|number} userId - User ID to block
         * @returns {Promise<Object|null>}
         */
        async blockUser(userId) {
            if (!userId) return null;

            try {
                const response = await this._makeRequest('POST', `/api/friends/${encodeURIComponent(userId)}/block`);
                if (!response) return null;

                if (window.KynectaStore) {
                    const blocked = window.KynectaStore.get('friends.blocked') || [];
                    window.KynectaStore.set('friends.blocked', [...blocked, userId]);
                    const friends = window.KynectaStore.get('friends.list') || [];
                    window.KynectaStore.set('friends.list', friends.filter(f => f.id !== userId));
                }

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('USER_BLOCKED', { userId });
                }

                return response.data;

            } catch (err) {
                console.error('[FriendService] blockUser FAILED for userId:', userId, '—', err.message);
                return null;
            }
        }

        /**
         * Unblock user
         * @param {string|number} userId - User ID to unblock
         * @returns {Promise<Object|null>}
         */
        async unblockUser(userId) {
            if (!userId) return null;

            try {
                const response = await this._makeRequest('POST', `/api/friends/${encodeURIComponent(userId)}/unblock`);
                if (!response) return null;

                if (window.KynectaStore) {
                    const blocked = window.KynectaStore.get('friends.blocked') || [];
                    window.KynectaStore.set('friends.blocked', blocked.filter(id => id !== userId));
                }

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('USER_UNBLOCKED', { userId });
                }

                return response.data;

            } catch (err) {
                console.error('[FriendService] unblockUser FAILED for userId:', userId, '—', err.message);
                return null;
            }
        }

        /**
         * Get online friends
         * @returns {Promise<string[]>} Array of online user ID strings
         */
        async getOnlineFriends() {
            const cachedOnline = window.KynectaStore?.get('friends.online');
            if (cachedOnline instanceof Set) {
                return Array.from(cachedOnline);
            }

            try {
                const response = await this._makeRequest('GET', '/api/friends');
                if (!response) return [];

                const friends = (typeof safeArray === 'function')
                    ? safeArray(response.data)
                    : (Array.isArray(response.data) ? response.data : []);

                const onlineList = friends
                    .filter(f => f?.online === true || f?.status === 'online' || f?.presence === 'online')
                    .map(f => String(f.userId || f.friendId || f.id))
                    .filter(Boolean);

                if (window.KynectaStore) {
                    window.KynectaStore.set('friends.online', new Set(onlineList));
                }
                try { localStorage.setItem('friends_online', JSON.stringify(onlineList)); } catch (_) {}
                if (window.AppStorage) {
                    window.AppStorage.set('friends_online', onlineList);
                }

                return onlineList;

            } catch (err) {
                console.error('[FriendService] getOnlineFriends failed:', err.message);
                return [];
            }
        }

        /**
         * Subscribe to friend presence updates
         * @param {Function} callback - Presence update handler
         * @returns {Function} Unsubscribe function
         */
        subscribeToPresence(callback) {
            if (window.KynectaRealtime) {
                const eventTypes = ['presence:update', 'PRESENCE_UPDATE', 'user:online', 'user:offline'];
                const unsubscribers = eventTypes.map(eventType =>
                    window.KynectaRealtime.on(eventType, (payload = {}) => {
                        const uid    = payload.userId || payload.id;
                        const online = eventType === 'user:online'
                            ? true
                            : eventType === 'user:offline'
                                ? false
                                : payload.online;

                        if (window.KynectaStore && uid != null) {
                            const current    = window.KynectaStore.get('friends.online');
                            const onlineSet  = current instanceof Set
                                ? new Set(current)
                                : new Set(Array.isArray(current) ? current : []);
                            if (online) onlineSet.add(String(uid));
                            else        onlineSet.delete(String(uid));
                            window.KynectaStore.set('friends.online', onlineSet);
                        }

                        callback({ ...payload, userId: uid, online });
                    })
                );

                return () => unsubscribers.forEach(u => { try { u(); } catch (_) {} });
            }

            // Polling fallback when KynectaRealtime not available
            const interval = setInterval(async () => {
                const online = await this.getOnlineFriends();
                callback({ type: 'batch', online });
            }, 30000);

            return () => clearInterval(interval);
        }

        // ═══════════════════════════════════════════════════════════
        // PRIVATE METHODS
        // ═══════════════════════════════════════════════════════════

        /**
         * Internal HTTP request helper.
         *
         * FIX v1.1.0: Logs the full response body on non-OK status BEFORE throwing
         * so you can see the actual server error message in the console rather than
         * just "HTTP 400: Bad Request".
         */
        async _makeRequest(method, endpoint, data = null) {
            // Offline guard
            if (!navigator.onLine) {
                console.warn('[FriendService] Offline — skipping request:', endpoint);
                return null;
            }

            // Token resolution — prefer parent session → AppStorage → localStorage
            let token = null;
            try {
                if (window.__PARENT_SESSION__?.token) {
                    token = window.__PARENT_SESSION__.token;
                } else if (window.AUTH_SESSION?.token) {
                    token = window.AUTH_SESSION.token;
                }
                if (!token && window.AppStorage) {
                    token = window.AppStorage.get('token') ||
                            window.AppStorage.get('moodchat_token') ||
                            window.AppStorage.get('accessToken');
                }
                if (!token && window.localStorage) {
                    token = localStorage.getItem('token') ||
                            localStorage.getItem('moodchat_token') ||
                            localStorage.getItem('accessToken') ||
                            localStorage.getItem('kynecta_token');
                }
            } catch (e) {
                console.warn('[FriendService] Token resolution error:', e.message);
            }

            // Warn early if there's no token — this is almost always the root cause
            // of silent 401 failures on friend request sends.
            if (!token) {
                console.warn('[FriendService] _makeRequest: NO AUTH TOKEN for', method, endpoint,
                    '— request will likely fail with 401');
            }

            const headers = {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            };

            const options = { method, headers, credentials: 'include' };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            // Prefer api.request.js wrapper if available (handles CSRF etc.)
            if (window.api?.request) {
                return window.api.request.request(endpoint, options);
            }

            // Direct fetch fallback
            const response = await fetch(endpoint, options);

            if (!response.ok) {
                // FIX: Read and log the response body before throwing so the
                // actual server error message is visible in the console.
                let bodyText = '';
                try { bodyText = await response.text(); } catch (_) {}
                console.error(
                    '[FriendService] HTTP error', response.status, 'for', method, endpoint,
                    '— server said:', bodyText.slice(0, 500)
                );
                throw new Error(`HTTP ${response.status}: ${response.statusText} — ${bodyText.slice(0, 200)}`);
            }

            return await response.json();
        }
    }

    // Initialize and expose globally
    window.services       = window.services || {};
    window.services.friend = new FriendService();

    console.log('[FriendService] ✅ Ready (v1.1.0 — silent-error fixes applied)');
})();