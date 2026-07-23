/**
 * js/friendService.integration.js - Cross-Module Friend Data Integration
 * 
 * UNIFIED FRIEND DATA ACCESS FOR ALL MODULES
 * Ensures chat, calls, groups, and other modules use the same FriendService
 * Provides backward compatibility while migrating to unified service
 * 
 * Version: 1.0.0
 */

(function() {
    'use strict';
    
    console.log('[FriendService Integration] Initializing cross-module integration...');
    
    // =============================================
    // [GLOBAL FRIEND DATA ACCESS LAYER]
    // =============================================
    
    /**
     * Unified friend data accessor for all modules
     * Provides consistent API across chat, calls, groups, etc.
     */
    window.FriendDataAccess = {
        /**
         * Get all friends (canonical shape)
         * @returns {Promise<Array>} Array of normalized friend objects
         */
        async getFriends() {
            // Use friend-core.js data directly - it's the primary source
            try {
                return this._getLegacyFriends();
            } catch (e) {
                console.warn('[FriendDataAccess] Legacy friends failed:', e);
                return [];
            }
        },
        
        /**
         * Get friend by ID
         * @param {string} friendId 
         * @returns {Promise<Object|null>} Friend object or null
         */
        async getFriendById(friendId) {
            if (!friendId) return null;
            
            // Use friend-core.js data directly
            try {
                return this._getLegacyFriendById(friendId);
            } catch (e) {
                console.warn('[FriendDataAccess] Legacy friend lookup failed:', e);
                return null;
            }
        },
        
        /**
         * Get online friends only
         * @returns {Promise<Array>} Array of online friends
         */
        async getOnlineFriends() {
            const friends = await this.getFriends();
            return friends.filter(f => f.isOnline || f.status === 'online');
        },
        
        /**
         * Search friends by name/username
         * @param {string} query 
         * @returns {Promise<Array>} Matching friends
         */
        async searchFriends(query) {
            if (!query || typeof query !== 'string') return [];
            
            const friends = await this.getFriends();
            const searchTerm = query.toLowerCase().trim();
            
            return friends.filter(f => 
                (f.name && f.name.toLowerCase().includes(searchTerm)) ||
                (f.username && f.username.toLowerCase().includes(searchTerm)) ||
                (f.displayName && f.displayName.toLowerCase().includes(searchTerm))
            );
        },
        
        /**
         * Check if user is friend
         * @param {string} friendId 
         * @returns {Promise<boolean>}
         */
        async isFriend(friendId) {
            const friend = await this.getFriendById(friendId);
            return !!friend;
        },
        
        /**
         * Get friend count
         * @returns {Promise<number>}
         */
        async getFriendCount() {
            const friends = await this.getFriends();
            return friends.length;
        },
        
        /**
         * Subscribe to friend data updates
         * @param {Function} callback 
         * @returns {Function} Unsubscribe function
         */
        subscribe(callback) {
            if (typeof callback !== 'function') return () => {};
            
            if (window.FriendService && typeof window.FriendService.on === 'function') {
                return window.FriendService.on('friends-loaded', callback);
            }
            
            // Fallback to window events
            const handler = (e) => callback(e.detail);
            window.addEventListener('friendsUpdated', handler);
            window.addEventListener('friendsLoaded', handler);
            
            return () => {
                window.removeEventListener('friendsUpdated', handler);
                window.removeEventListener('friendsLoaded', handler);
            };
        },
        
        // =============================================
        // [LEGACY FALLBACK METHODS]
        // =============================================
        
        _getLegacyFriends() {
            // Try multiple legacy sources in priority order
            const sources = [
                () => window.friends || [],
                () => window.FriendCore?.friends || [],
                () => window.KynectaStore?.get('friends.list') || [],
                () => JSON.parse(localStorage.getItem('friends') || '[]'),
                () => JSON.parse(localStorage.getItem('knecta_friends_cache') || '[]')
            ];
            
            for (const getSource of sources) {
                try {
                    const friends = getSource();
                    if (Array.isArray(friends) && friends.length > 0) {
                        return this._normalizeLegacyFriends(friends);
                    }
                } catch (e) {
                    console.warn('[FriendDataAccess] Legacy source failed:', e);
                }
            }
            
            return [];
        },
        
        _getLegacyFriendById(friendId) {
            const friends = this._getLegacyFriends();
            return friends.find(f => String(f.id) === String(friendId)) || null;
        },
        
        _normalizeLegacyFriends(friends) {
            return friends.map(friend => {
                if (!friend || !friend.id) return null;
                
                // Normalize to canonical shape
                return {
                    id: friend.id || friend.friendId || friend.userId,
                    name: friend.name || friend.displayName || friend.username || `User ${friend.id}`,
                    avatar: friend.avatar || friend.photoURL || null,
                    status: friend.status || 'offline',
                    lastSeen: friend.lastSeen || friend.lastActive || null,
                    isOnline: (friend.status === 'online') || (friend.isOnline === true),
                    username: friend.username || '',
                    displayName: friend.displayName || friend.name || friend.username || '',
                    // Preserve additional fields for compatibility
                    ...friend
                };
            }).filter(Boolean);
        }
    };
    
    // =============================================
    // [MODULE INTEGRATION HELPERS]
    // =============================================
    
    /**
     * Chat module integration
     */
    window.ChatFriendIntegration = {
        async getChatFriends() {
            return await window.FriendDataAccess.getFriends();
        },
        
        async getOnlineChatFriends() {
            return await window.FriendDataAccess.getOnlineFriends();
        },
        
        async isChatFriend(userId) {
            return await window.FriendDataAccess.isFriend(userId);
        },
        
        subscribeToChatFriends(callback) {
            return window.FriendDataAccess.subscribe(callback);
        }
    };
    
    /**
     * Calls module integration
     */
    window.CallFriendIntegration = {
        async getCallableFriends() {
            return await window.FriendDataAccess.getOnlineFriends();
        },
        
        async canCallUser(userId) {
            const friend = await window.FriendDataAccess.getFriendById(userId);
            return !!(friend && friend.isOnline);
        },
        
        subscribeToCallFriends(callback) {
            return window.FriendDataAccess.subscribe(callback);
        }
    };
    
    /**
     * Groups module integration
     */
    window.GroupFriendIntegration = {
        async getGroupableFriends() {
            return await window.FriendDataAccess.getFriends();
        },
        
        async searchGroupMembers(query) {
            return await window.FriendDataAccess.searchFriends(query);
        },
        
        async addFriendsToGroup(friendIds, groupId) {
            // This would integrate with group management
            console.log('[GroupIntegration] Add friends to group:', friendIds, groupId);
        }
    };
    
    // =============================================
    // [BACKWARD COMPATIBILITY LAYER]
    // =============================================
    
    /**
     * DISABLED - FriendService backward compatibility
     * friend-core.js handles all friend data management
     */
    const ensureBackwardCompatibility = () => {
        console.log('[FriendService Integration] Backward compatibility DISABLED - friend-core.js handles data');
        
        // Initialize window.friends from friend-core if available
        if (!window.friends || !Array.isArray(window.friends)) {
            window.friends = window.friends || [];
        }
    };
    
    // =============================================
    // [INITIALIZATION]
    // =============================================
    
    // DISABLE FriendService integration - friend-core.js handles everything
    console.log('[FriendService Integration] DISABLED - friend-core.js handles all friend data');
    
    // Use legacy compatibility mode only - friend-core.js is the primary source
    window.FriendDataAccess._getLegacyFriends = function() {
        // Use friend-core data as primary source
        return window.friends || [];
    };
    
    // Log integration status
    console.log('[FriendService Integration] Ready');
    console.log('[FriendService Integration] FriendService available:', !!window.FriendService);
    console.log('[FriendService Integration] FriendCore active:', !!(window.FriendCore && window.FriendCore.isReady && window.FriendCore.isReady()));
    console.log('[FriendService Integration] Legacy compatibility enabled');
    
    // Expose integration status
    window.FriendIntegrationStatus = {
        ready: true,
        friendServiceAvailable: !!window.FriendService,
        friendCoreActive: !!(window.FriendCore && window.FriendCore.isReady && window.FriendCore.isReady()),
        legacyCompatibility: true,
        modules: ['chat', 'calls', 'groups'],
        timestamp: Date.now()
    };
    
})();
