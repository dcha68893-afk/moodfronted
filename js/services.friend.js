/**
 * Kynecta Friend Service
 * Abstraction layer for friend-related API calls
 * @version 1.0.0
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

            const response = await this._makeRequest('GET', `/api/friends?${params}`);
            if (!response) return []; // offline or error

            // ── safeArray guard (patch v1) ─────────────────────────────────
            const friends = (typeof safeArray === 'function')
                ? safeArray(response.data)
                : (Array.isArray(response.data) ? response.data : []);
            
            // Cache result
            this._cache.set(cacheKey, {
                data: friends,
                timestamp: Date.now()
            });

            console.log('[LOCAL SAVE] friends_list', friends.length, 'items');

            // Update store
            if (window.KynectaStore) {
                window.KynectaStore.set('friends.list', friends);
            }
            // FIX Bug#5: Write to the canonical localStorage key that FriendCacheManager
            // reads on startup ('knecta_friends_cache'), not just AppStorage.
            try { localStorage.setItem('knecta_friends_cache', JSON.stringify(friends)); } catch (_) {}
            // Also write to AppStorage for cross-iframe access
            if (window.AppStorage) {
                window.AppStorage.set('knecta_friends_cache', friends);
            }

            return friends;
        }

        /**
         * Send friend request
         * @param {string} userId - User ID to send request to
         * @param {string} message - Optional request message
         * @returns {Promise}
         */
        async sendFriendRequest(userId, message = '') {
            if (!userId) {
                console.warn('[FriendService] sendFriendRequest: missing userId');
                return null;
            }
            const response = await this._makeRequest('POST', '/api/friends/requests', {
                userId,
                message
            });
            if (!response) return null; // offline / error

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('FRIEND_REQUEST_SENT', { userId, ...response.data });
            }

            return response.data;
        }

        /**
         * Accept friend request
         * @param {string} requestId - Request ID
         * @returns {Promise}
         */
        async acceptFriendRequest(requestId) {
            if (!requestId) return null;
            const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/accept`);
            if (!response) return null;

            // Update store
            if (window.KynectaStore) {
                const requests = window.KynectaStore.get('friends.requests') || [];
                const updated = requests.filter(r => r.id !== requestId);
                window.KynectaStore.set('friends.requests', updated);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('FRIEND_REQUEST_ACCEPTED', response.data);
            }

            return response.data;
        }

        /**
         * Reject friend request
         * @param {string} requestId - Request ID
         * @returns {Promise}
         */
        async rejectFriendRequest(requestId) {
            if (!requestId) return null;
            const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/reject`);
            if (!response) return null;

            // Update store
            if (window.KynectaStore) {
                const requests = window.KynectaStore.get('friends.requests') || [];
                const updated = requests.filter(r => r.id !== requestId);
                window.KynectaStore.set('friends.requests', updated);
            }

            return response.data;
        }

        /**
         * Remove friend
         * @param {string} friendId - Friend ID
         * @returns {Promise}
         */
        async removeFriend(friendId) {
            if (!friendId) return null;
            const response = await this._makeRequest('DELETE', `/api/friends/${friendId}`);
            if (!response) return null;

            // Update store
            if (window.KynectaStore) {
                const friends = window.KynectaStore.get('friends.list') || [];
                const updated = friends.filter(f => f.id !== friendId);
                window.KynectaStore.set('friends.list', updated);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('FRIEND_REMOVED', { friendId });
            }

            return response.data;
        }

        /**
         * Block user
         * @param {string} userId - User ID to block
         * @returns {Promise}
         */
        async blockUser(userId) {
            if (!userId) return null;
            const response = await this._makeRequest('POST', '/api/users/block', { userId });
            if (!response) return null;

            // Update store
            if (window.KynectaStore) {
                const blocked = window.KynectaStore.get('friends.blocked') || [];
                window.KynectaStore.set('friends.blocked', [...blocked, userId]);
                
                // Remove from friends if present
                const friends = window.KynectaStore.get('friends.list') || [];
                const updatedFriends = friends.filter(f => f.id !== userId);
                window.KynectaStore.set('friends.list', updatedFriends);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('USER_BLOCKED', { userId });
            }

            return response.data;
        }

        /**
         * Unblock user
         * @param {string} userId - User ID to unblock
         * @returns {Promise}
         */
        async unblockUser(userId) {
            if (!userId) return null;
            const response = await this._makeRequest('POST', '/api/users/unblock', { userId });
            if (!response) return null;

            // Update store
            if (window.KynectaStore) {
                const blocked = window.KynectaStore.get('friends.blocked') || [];
                const updated = blocked.filter(id => id !== userId);
                window.KynectaStore.set('friends.blocked', updated);
            }

            // Emit event
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('USER_UNBLOCKED', { userId });
            }

            return response.data;
        }

        /**
         * Get online friends
         * @returns {Promise} Resolves with online friend IDs
         */
        async getOnlineFriends() {
            const response = await this._makeRequest('GET', '/api/friends/online');
            if (!response) return []; // offline or error

            // ── safeArray guard (patch v1) ─────────────────────────────────
            const onlineList = (typeof safeArray === 'function')
                ? safeArray(response.data)
                : (Array.isArray(response.data) ? response.data : []);
            
            // Update store
            if (window.KynectaStore) {
                window.KynectaStore.set('friends.online', new Set(onlineList));
            }
            // FIX: persist to canonical key
            try { localStorage.setItem('friends_online', JSON.stringify(onlineList)); } catch (_) {}
            if (window.AppStorage) {
                window.AppStorage.set('friends_online', onlineList);
            }

            return onlineList;
        }

        /**
         * Subscribe to friend presence updates
         * @param {Function} callback - Presence update handler
         * @returns {Function} Unsubscribe function
         */
        subscribeToPresence(callback) {
            if (window.KynectaRealtime) {
                return window.KynectaRealtime.on('PRESENCE_UPDATE', (payload) => {
                    // Update store
                    if (window.KynectaStore) {
                        const online = window.KynectaStore.get('friends.online') || new Set();
                        if (payload.online) {
                            online.add(payload.userId);
                        } else {
                            online.delete(payload.userId);
                        }
                        window.KynectaStore.set('friends.online', online);
                    }

                    callback(payload);
                });
            }

            // Polling fallback
            const interval = setInterval(async () => {
                const online = await this.getOnlineFriends();
                callback({ type: 'batch', online });
            }, 30000);

            return () => clearInterval(interval);
        }

        // ========== PRIVATE METHODS ==========

        async _makeRequest(method, endpoint, data = null) {
            // ── Offline guard (patch v1) ───────────────────────────────────
            if (!navigator.onLine) {
                console.warn('[FriendService] Offline — skipping request:', endpoint);
                return null;
            }

            // ── Token resolution — prefer parent session, fall through to
            //    AppStorage (single source of truth), then localStorage ──────
            let token = null;
            try {
                // 1. Injected session from parent postMessage
                if (window.__PARENT_SESSION__?.token) {
                    token = window.__PARENT_SESSION__.token;
                } else if (window.AUTH_SESSION?.token) {
                    token = window.AUTH_SESSION.token;
                }
                // 2. AppStorage (single source of truth — patch v1)
                if (!token && window.AppStorage) {
                    token = window.AppStorage.get('token') ||
                            window.AppStorage.get('moodchat_token') ||
                            window.AppStorage.get('accessToken');
                }
                // 3. Raw localStorage fallback
                if (!token && window.localStorage) {
                    token = localStorage.getItem('token') ||
                            localStorage.getItem('moodchat_token') ||
                            localStorage.getItem('accessToken') ||
                            localStorage.getItem('kynecta_token');
                }
            } catch (e) {
                console.warn('[FriendService] Token resolution error:', e.message);
            }

            const headers = {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            };

            const options = {
                method,
                headers,
                credentials: 'include'
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            // Use api.request.js if available
            if (window.api?.request) {
                return window.api.request.request(endpoint, options);
            }

            // Fallback to fetch
            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        }
    }

    // Initialize and expose globally
    window.services = window.services || {};
    window.services.friend = new FriendService();

    console.log('[FriendService] ✅ Ready');
})();