/**
 * js/friendService.js - Frontend Friend Service (Offline-First Edition)
 * 
 * UNIFIED FRIEND DATA SERVICE - SINGLE SOURCE OF TRUTH
 * Matches backend friendService.js structure exactly
 * Implements offline-first loading with cache priority
 * 
 * Canonical friend shape (matches backend):
 * { id, name, avatar, status, lastSeen, isOnline }
 * 
 * @version 1.0.0
 */

(function() {
    'use strict';

    // =============================================
    // [CONSTANTS & CONFIGURATION]
    // =============================================
    
    const API_ENDPOINTS = {
        FRIENDS: '/api/friends',
        REQUESTS: '/api/friends/requests',
        NEARBY: '/api/friends/nearby',
        SEND_REQUEST: '/api/friends/requests/send',
        ACCEPT_REQUEST: '/api/friends/requests/:requestId/accept',
        REJECT_REQUEST: '/api/friends/requests/:requestId/reject',
        REMOVE_FRIEND: '/api/friends/:friendId',
        BLOCK_USER: '/api/friends/block/:friendId',
        UNBLOCK_USER: '/api/friends/block/:friendId'
    };

    const CACHE_KEYS = {
        FRIENDS: 'friends_cache',
        REQUESTS: 'friend_requests_cache',
        SENT_REQUESTS: 'sent_requests_cache',
        NEARBY_USERS: 'nearby_users_cache',
        LAST_SYNC: 'friends_last_sync'
    };

    const CACHE_TTL = {
        FRIENDS: 5 * 60 * 1000, // 5 minutes
        REQUESTS: 2 * 60 * 1000, // 2 minutes
        NEARBY: 10 * 60 * 1000 // 10 minutes
    };

    // =============================================
    // [CANONICAL FRIEND NORMALIZER]
    // =============================================
    // 
    // ALL modules (chat, calls, groups) must consume this same shape.
    // Shape: { id, name, avatar, status, lastSeen, isOnline }
    // 
    // This matches the backend formatFriend() function exactly.
    
    function normalizeFriend(friendData) {
        if (!friendData) return null;
        
        // Handle both backend format and cached format
        const data = friendData.data || friendData;
        
        return {
            // Canonical cross-module fields (matches backend)
            id: data.id || null,
            name: data.name || data.displayName || data.username || `User ${data.id || ''}`,
            avatar: data.avatar || data.photoURL || null,
            status: data.status || 'offline', // NEVER undefined
            lastSeen: data.lastSeen || data.lastActive || null,
            isOnline: (data.status === 'online') || (data.isOnline === true),
            
            // Extended fields (UI convenience)
            username: data.username || '',
            displayName: data.displayName || data.name || data.username || '',
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            lastActive: data.lastActive || data.lastSeen || null,
            
            // Friendship metadata
            friendshipId: data.friendshipId || data.id,
            addedAt: data.addedAt || data.createdAt || null,
            category: data.category || 'friend',
            isPinned: !!data.isPinned,
            isMuted: !!data.isMuted,
            closenessLevel: data.closenessLevel || 0,
            
            // Backend compatibility fields
            requestId: data.requestId || data.id,
            senderId: data.senderId || data.userId,
            receiverId: data.receiverId,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        };
    }

    // =============================================
    // [CACHE UTILITIES]
    // =============================================
    
    function getCache(key) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;
            
            const parsed = JSON.parse(item);
            if (parsed.expires && Date.now() > parsed.expires) {
                localStorage.removeItem(key);
                return null;
            }
            
            return parsed.data;
        } catch (e) {
            console.warn('[FriendService] Cache read error:', e);
            return null;
        }
    }

    function setCache(key, data, ttl) {
        try {
            const item = {
                data: data,
                timestamp: Date.now(),
                expires: Date.now() + ttl
            };
            localStorage.setItem(key, JSON.stringify(item));
        } catch (e) {
            console.warn('[FriendService] Cache write error:', e);
        }
    }

    function invalidateCache(pattern) {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(pattern)) {
                localStorage.removeItem(key);
            }
        });
    }

    // =============================================
    // [API UTILITIES]
    // =============================================
    
    async function apiCall(endpoint, options = {}) {
        try {
            // Use parent communication system like friend-core.js
            if (window.parent && window.parent !== window) {
                return new Promise((resolve, reject) => {
                    const requestId = 'friendService_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    const timeout = setTimeout(() => {
                        reject(new Error('API request timeout'));
                    }, 15000);

                    const handleMessage = (event) => {
                        if (event.data && event.data.type === 'API_RESPONSE' && event.data.requestId === requestId) {
                            clearTimeout(timeout);
                            window.parent.removeEventListener('message', handleMessage);
                            
                            if (event.data.payload && event.data.payload.success !== false) {
                                resolve(event.data.payload);
                            } else {
                                reject(new Error(event.data.payload?.message || 'API operation failed'));
                            }
                        }
                    };

                    window.parent.addEventListener('message', handleMessage);
                    
                    // Send API request to parent
                    window.parent.postMessage({
                        type: 'API_REQUEST',
                        endpoint: endpoint,
                        method: options.method || 'GET',
                        requestId: requestId,
                        timestamp: Date.now()
                    }, '*');
                });
            } else {
                // Fallback to direct API call if no parent (for standalone testing)
                const token = localStorage.getItem('authToken') || localStorage.getItem('kynecta_token');
                if (!token) {
                    throw new Error('No authentication token');
                }

                const response = await fetch(endpoint, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        ...options.headers
                    },
                    ...options
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.message || 'API operation failed');
                }

                return result;
            }
        } catch (error) {
            console.error('[FriendService] API call failed:', error);
            throw error;
        }
    }

    // =============================================
    // [MAIN FRIEND SERVICE CLASS]
    // =============================================
    
    class FriendService {
        constructor() {
            this._initialized = false;
            this._listeners = new Map();
            this._loading = {
                friends: false,
                requests: false,
                sentRequests: false,
                nearby: false
            };
            
            // Expose globally for other modules
            window.FriendService = this;
            console.log('[FriendService] Initialized');
        }

        // =============================================
        // [EVENT SYSTEM]
        // =============================================
        
        on(event, callback) {
            if (!this._listeners.has(event)) {
                this._listeners.set(event, []);
            }
            this._listeners.get(event).push(callback);
        }

        emit(event, data) {
            const callbacks = this._listeners.get(event) || [];
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('[FriendService] Event callback error:', e);
                }
            });
        }

        // =============================================
        // [OFFLINE-FIRST LOADING]
        // =============================================
        
        /**
         * Load friends with offline-first priority:
         * 1. Load from cache instantly
         * 2. Update UI immediately
         * 3. Sync with backend silently
         */
        async loadFriends(options = {}) {
            const { forceRefresh = false, silent = false, timeout = 10000 } = options;
            
            if (this._loading.friends && !forceRefresh) {
                return getCache(CACHE_KEYS.FRIENDS) || [];
            }

            this._loading.friends = true;
            
            try {
                // STEP 1: Enhanced cache-first loading with priority rules
                const cachedFriends = getCache(CACHE_KEYS.FRIENDS);
                const lastSync = getCache(CACHE_KEYS.LAST_SYNC);
                const cacheAge = lastSync ? Date.now() - lastSync : Infinity;
                const maxCacheAge = 5 * 60 * 1000; // 5 minutes for friends data
                
                if (cachedFriends && !forceRefresh) {
                    // Use cache if fresh or if offline
                    if (cacheAge < maxCacheAge || !navigator.onLine) {
                        const normalized = cachedFriends.map(normalizeFriend);
                        if (!silent) {
                            console.log(`[FriendService] Friends from cache (${normalized.length} items, ${Math.round(cacheAge/1000)}s old)`);
                            this.emit('friends-loaded', normalized);
                        }
                        return normalized;
                    }
                }

                // STEP 2: Fetch from backend with timeout protection
                const result = await Promise.race([
                    apiCall(API_ENDPOINTS.FRIENDS),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), timeout)
                    )
                ]);
                
                const friends = result?.data?.friends || result?.data || [];
                
                // Validate response data
                if (!Array.isArray(friends)) {
                    throw new Error('Invalid friends data format from API');
                }
                
                // STEP 3: Enhanced normalization with error handling
                const normalizedFriends = friends.map(friend => {
                    try {
                        return normalizeFriend(friend);
                    } catch (e) {
                        console.warn('[FriendService] Failed to normalize friend:', friend, e);
                        return null;
                    }
                }).filter(Boolean);
                
                // STEP 4: Cache with timestamp
                setCache(CACHE_KEYS.FRIENDS, friends, CACHE_TTL.FRIENDS);
                setCache(CACHE_KEYS.LAST_SYNC, Date.now(), 24 * 60 * 60 * 1000);
                
                // STEP 5: Update UI
                if (!silent) {
                    console.log('[FriendService] Friends loaded from API:', normalizedFriends.length);
                    this.emit('friends-loaded', normalizedFriends);
                }
                
                return normalizedFriends;
                
            } catch (error) {
                console.error('[FriendService] Failed to load friends:', error);
                
                // Enhanced fallback strategy with multiple sources
                let fallbackData = null;
                let fallbackSource = 'none';
                
                // Strategy 1: Use cache even if expired
                const cachedFriends = getCache(CACHE_KEYS.FRIENDS);
                if (cachedFriends && Array.isArray(cachedFriends) && cachedFriends.length > 0) {
                    fallbackData = cachedFriends;
                    fallbackSource = 'cache';
                }
                
                // Strategy 2: Try legacy sources if cache fails
                if (!fallbackData) {
                    try {
                        const legacySources = [
                            () => window.friends || [],
                            () => window.FriendCore?.friends || [],
                            () => JSON.parse(localStorage.getItem('friends') || '[]'),
                            () => JSON.parse(localStorage.getItem('knecta_friends_cache') || '[]')
                        ];
                        
                        for (const source of legacySources) {
                            try {
                                const data = source();
                                if (Array.isArray(data) && data.length > 0) {
                                    fallbackData = data;
                                    fallbackSource = 'legacy';
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    } catch (e) {
                        console.warn('[FriendService] Legacy fallback failed:', e);
                    }
                }
                
                if (fallbackData) {
                    const normalized = fallbackData.map(normalizeFriend);
                    console.log(`[FriendService] Using ${fallbackSource} fallback (${normalized.length} items)`);
                    if (!silent) {
                        this.emit('friends-loaded', normalized);
                    }
                    return normalized;
                }
                
                // No fallback available - emit error and return empty array
                if (!silent) {
                    console.error('[FriendService] No fallback data available');
                }
                this.emit('friends-error', error);
                return [];
                
                // Return empty array to prevent UI crashes
                if (!silent) {
                    this.emit('friends-loaded', []);
                }
                return [];
                
            } finally {
                this._loading.friends = false;
            }
        }

        async loadFriendRequests(options = {}) {
            const { forceRefresh = false, silent = false } = options;
            
            if (this._loading.requests && !forceRefresh) {
                return getCache(CACHE_KEYS.REQUESTS) || [];
            }

            this._loading.requests = true;
            
            try {
                const cachedRequests = getCache(CACHE_KEYS.REQUESTS);
                if (cachedRequests && !forceRefresh) {
                    const normalized = cachedRequests.map(normalizeFriend);
                    if (!silent) {
                        this.emit('requests-loaded', normalized);
                    }
                    return normalized;
                }

                const result = await apiCall(API_ENDPOINTS.REQUESTS);
                const requests = result.data.requests || [];
                
                const normalizedRequests = requests.map(normalizeFriend);
                setCache(CACHE_KEYS.REQUESTS, requests, CACHE_TTL.REQUESTS);
                
                if (!silent) {
                    this.emit('requests-loaded', normalizedRequests);
                }
                
                return normalizedRequests;
                
            } catch (error) {
                console.error('[FriendService] Failed to load requests:', error);
                
                const cachedRequests = getCache(CACHE_KEYS.REQUESTS);
                if (cachedRequests) {
                    const normalized = cachedRequests.map(normalizeFriend);
                    if (!silent) {
                        this.emit('requests-loaded', normalized);
                    }
                    return normalized;
                }
                
                if (!silent) {
                    this.emit('requests-loaded', []);
                }
                return [];
                
            } finally {
                this._loading.requests = false;
            }
        }

        async loadSentRequests(options = {}) {
            const { forceRefresh = false, silent = false } = options;
            
            if (this._loading.sentRequests && !forceRefresh) {
                return getCache(CACHE_KEYS.SENT_REQUESTS) || [];
            }

            this._loading.sentRequests = true;
            
            try {
                const cachedRequests = getCache(CACHE_KEYS.SENT_REQUESTS);
                if (cachedRequests && !forceRefresh) {
                    const normalized = cachedRequests.map(normalizeFriend);
                    if (!silent) {
                        this.emit('sent-requests-loaded', normalized);
                    }
                    return normalized;
                }

                const result = await apiCall(`${API_ENDPOINTS.REQUESTS}/sent`);
                const requests = result.data.requests || [];
                
                const normalizedRequests = requests.map(normalizeFriend);
                setCache(CACHE_KEYS.SENT_REQUESTS, requests, CACHE_TTL.REQUESTS);
                
                if (!silent) {
                    this.emit('sent-requests-loaded', normalizedRequests);
                }
                
                return normalizedRequests;
                
            } catch (error) {
                console.error('[FriendService] Failed to load sent requests:', error);
                
                const cachedRequests = getCache(CACHE_KEYS.SENT_REQUESTS);
                if (cachedRequests) {
                    const normalized = cachedRequests.map(normalizeFriend);
                    if (!silent) {
                        this.emit('sent-requests-loaded', normalized);
                    }
                    return normalized;
                }
                
                if (!silent) {
                    this.emit('sent-requests-loaded', []);
                }
                return [];
                
            } finally {
                this._loading.sentRequests = false;
            }
        }

        async loadNearbyUsers(options = {}) {
            const { forceRefresh = false, silent = false } = options;
            
            if (this._loading.nearby && !forceRefresh) {
                return getCache(CACHE_KEYS.NEARBY_USERS) || [];
            }

            this._loading.nearby = true;
            
            try {
                const cachedUsers = getCache(CACHE_KEYS.NEARBY_USERS);
                if (cachedUsers && !forceRefresh) {
                    const normalized = cachedUsers.map(normalizeFriend);
                    if (!silent) {
                        this.emit('nearby-loaded', normalized);
                    }
                    return normalized;
                }

                const result = await apiCall(API_ENDPOINTS.NEARBY);
                const users = result.data.users || [];
                
                const normalizedUsers = users.map(normalizeFriend);
                setCache(CACHE_KEYS.NEARBY_USERS, users, CACHE_TTL.NEARBY);
                
                if (!silent) {
                    this.emit('nearby-loaded', normalizedUsers);
                }
                
                return normalizedUsers;
                
            } catch (error) {
                console.error('[FriendService] Failed to load nearby users:', error);
                
                const cachedUsers = getCache(CACHE_KEYS.NEARBY_USERS);
                if (cachedUsers) {
                    const normalized = cachedUsers.map(normalizeFriend);
                    if (!silent) {
                        this.emit('nearby-loaded', normalized);
                    }
                    return normalized;
                }
                
                if (!silent) {
                    this.emit('nearby-loaded', []);
                }
                return [];
                
            } finally {
                this._loading.nearby = false;
            }
        }

        // =============================================
        // [FRIEND OPERATIONS]
        // =============================================
        
        async sendFriendRequest(receiverId, notes = '') {
            try {
                const result = await apiCall(API_ENDPOINTS.SEND_REQUEST, {
                    method: 'POST',
                    body: JSON.stringify({ receiverId, notes })
                });

                // Invalidate caches
                invalidateCache('friends_');
                invalidateCache('friend_requests_');
                
                this.emit('request-sent', result.data);
                return result.data;
                
            } catch (error) {
                console.error('[FriendService] Failed to send friend request:', error);
                throw error;
            }
        }

        async acceptFriendRequest(requestId) {
            try {
                const endpoint = API_ENDPOINTS.ACCEPT_REQUEST.replace(':requestId', requestId);
                const result = await apiCall(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({})
                });

                // Invalidate caches
                invalidateCache('friends_');
                invalidateCache('friend_requests_');
                
                this.emit('request-accepted', result.data);
                return result.data;
                
            } catch (error) {
                console.error('[FriendService] Failed to accept friend request:', error);
                throw error;
            }
        }

        async rejectFriendRequest(requestId) {
            try {
                const endpoint = API_ENDPOINTS.REJECT_REQUEST.replace(':requestId', requestId);
                const result = await apiCall(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({})
                });

                // Invalidate caches
                invalidateCache('friend_requests_');
                
                this.emit('request-rejected', result.data);
                return result.data;
                
            } catch (error) {
                console.error('[FriendService] Failed to reject friend request:', error);
                throw error;
            }
        }

        async removeFriend(friendId) {
            try {
                const endpoint = API_ENDPOINTS.REMOVE_FRIEND.replace(':friendId', friendId);
                await apiCall(endpoint, {
                    method: 'DELETE'
                });

                // Invalidate caches
                invalidateCache('friends_');
                
                this.emit('friend-removed', { friendId });
                
            } catch (error) {
                console.error('[FriendService] Failed to remove friend:', error);
                throw error;
            }
        }

        async blockUser(friendId) {
            try {
                const endpoint = API_ENDPOINTS.BLOCK_USER.replace(':friendId', friendId);
                await apiCall(endpoint, {
                    method: 'POST',
                    body: JSON.stringify({})
                });

                // Invalidate caches
                invalidateCache('friends_');
                
                this.emit('user-blocked', { friendId });
                
            } catch (error) {
                console.error('[FriendService] Failed to block user:', error);
                throw error;
            }
        }

        async unblockUser(friendId) {
            try {
                const endpoint = API_ENDPOINTS.UNBLOCK_USER.replace(':friendId', friendId);
                await apiCall(endpoint, {
                    method: 'DELETE'
                });

                // Invalidate caches
                invalidateCache('friends_');
                
                this.emit('user-unblocked', { friendId });
                
            } catch (error) {
                console.error('[FriendService] Failed to unblock user:', error);
                throw error;
            }
        }

        // =============================================
        // [STATUS UPDATES]
        // =============================================
        
        updateFriendStatus(friendId, status, lastSeen = null) {
            // Update cache
            const friends = getCache(CACHE_KEYS.FRIENDS) || [];
            const updatedFriends = friends.map(friend => {
                if (friend.id === friendId || friend.friendId === friendId) {
                    return {
                        ...friend,
                        status: status,
                        lastSeen: lastSeen || friend.lastSeen,
                        lastActive: lastSeen || friend.lastActive
                    };
                }
                return friend;
            });
            
            setCache(CACHE_KEYS.FRIENDS, updatedFriends, CACHE_TTL.FRIENDS);
            
            // Emit status update
            this.emit('status-update', {
                friendId,
                status,
                lastSeen,
                isOnline: status === 'online'
            });
        }

        // =============================================
        // [UTILITY METHODS]
        // =============================================
        
        isLoading(type = 'friends') {
            return this._loading[type] || false;
        }

        getCacheInfo() {
            return {
                friends: getCache(CACHE_KEYS.FRIENDS)?.length || 0,
                requests: getCache(CACHE_KEYS.REQUESTS)?.length || 0,
                sentRequests: getCache(CACHE_KEYS.SENT_REQUESTS)?.length || 0,
                nearby: getCache(CACHE_KEYS.NEARBY_USERS)?.length || 0,
                lastSync: getCache(CACHE_KEYS.LAST_SYNC) || null
            };
        }

        clearCache() {
            invalidateCache('friends_');
            invalidateCache('friend_requests_');
            invalidateCache('nearby_users_');
            this.emit('cache-cleared');
        }

        // =============================================
        // [INITIALIZATION]
        // =============================================
        
        async initialize() {
            // DISABLED - FriendService should not auto-initialize
            // friend-core.js handles all friend data management
            console.log('[FriendService] Auto-initialization DISABLED - friend-core.js handles data');
            this._initialized = true; // Mark as initialized to prevent further calls
            return;
        }
    }

    // =============================================
    // [GLOBAL INSTANCE]
    // =============================================
    
    // Create and expose global instance
    const friendService = new FriendService();
    
    // Only initialize manually to prevent conflicts with friend-core.js
    // The service will be available but won't auto-load data
    console.log('[FriendService] Service loaded - manual initialization only (friend-core.js handles data)');

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = friendService;
    }

    // Expose normalizeFriend function for other modules
    window.normalizeFriend = normalizeFriend;

})();
