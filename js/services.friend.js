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
            
            // Cache result
            this._cache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            // Update store
            if (window.KynectaStore) {
                window.KynectaStore.set('friends.list', response.data);
            }

            return response.data;
        }

        /**
         * Send friend request
         * @param {string} userId - User ID to send request to
         * @param {string} message - Optional request message
         * @returns {Promise}
         */
        async sendFriendRequest(userId, message = '') {
            const response = await this._makeRequest('POST', '/api/friends/requests', {
                userId,
                message
            });

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
            const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/accept`);

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
            const response = await this._makeRequest('POST', `/api/friends/requests/${requestId}/reject`);

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
            const response = await this._makeRequest('DELETE', `/api/friends/${friendId}`);

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
            const response = await this._makeRequest('POST', '/api/users/block', { userId });

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
            const response = await this._makeRequest('POST', '/api/users/unblock', { userId });

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
            
            // Update store
            if (window.KynectaStore) {
                window.KynectaStore.set('friends.online', new Set(response.data));
            }

            return response.data;
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
            // Get token from various sources
            let token = null;
            if (window.__PARENT_SESSION__?.token) {
                token = window.__PARENT_SESSION__.token;
            } else if (window.AUTH_SESSION?.token) {
                token = window.AUTH_SESSION.token;
            } else if (window.localStorage) {
                token = window.localStorage.getItem('kynecta_token');
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