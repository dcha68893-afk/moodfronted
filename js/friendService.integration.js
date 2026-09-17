/**
 * js/friendService.integration.js - Cross-Module Friend Data Integration
 *
 * UNIFIED FRIEND DATA ACCESS FOR ALL MODULES
 * Ensures chat, calls, groups, and other modules use the same FriendService
 * Provides backward compatibility while migrating to unified service
 *
 * Version: 1.1.0
 */

(function() {
    'use strict';

    console.log('[FriendService Integration] Initializing cross-module integration...');

    // =============================================
    // [CANONICAL FRIEND USER-ID]
    // =============================================

    function canonicalFriendUserId(rawId) {
        if (rawId === undefined || rawId === null) return null;
        const value = String(rawId).trim();
        if (!value) return null;
        if (/^\d+$/.test(value)) return String(parseInt(value, 10));

        const parts = value.split('::').map(part => part.trim());
        if (parts.length > 1 && parts.every(part => /^\d+$/.test(part))) {
            const first = parseInt(parts[0], 10);
            if (parts.every(part => parseInt(part, 10) === first)) return String(first);
        }
        return value;
    }

    window.canonicalFriendUserId = canonicalFriendUserId;

    // Normalize the actual Friends DOM selection before friend-ui.js reads
    // dataset.userId/dataset.id. This fixes the source-side "1::1" artifact
    // without changing the service worker or PostgreSQL schema.
    function normalizeSelectedFriendId(event) {
        try {
            const target = event && event.target;
            if (!target || typeof target.closest !== 'function') return;
            const selected = target.closest('[data-user-id], [data-userid], [data-friend-id], [data-id]');
            if (!selected) return;

            for (const attr of ['data-user-id', 'data-userid', 'data-friend-id', 'data-id']) {
                if (!selected.hasAttribute(attr)) continue;
                const raw = selected.getAttribute(attr);
                const normalized = canonicalFriendUserId(raw);
                if (normalized && normalized !== raw) selected.setAttribute(attr, normalized);
            }
        } catch (_) {}
    }

    document.addEventListener('pointerdown', normalizeSelectedFriendId, true);
    document.addEventListener('mousedown', normalizeSelectedFriendId, true);
    document.addEventListener('click', normalizeSelectedFriendId, true);
    document.addEventListener('change', normalizeSelectedFriendId, true);

    // =============================================
    // [GLOBAL FRIEND DATA ACCESS LAYER]
    // =============================================

    window.FriendDataAccess = {
        async getFriends() {
            try {
                return this._getLegacyFriends();
            } catch (e) {
                console.warn('[FriendDataAccess] Legacy friends failed:', e);
                return [];
            }
        },

        async getFriendById(friendId) {
            if (!friendId) return null;
            const canonicalId = canonicalFriendUserId(friendId);
            if (!canonicalId) return null;
            try {
                return this._getLegacyFriendById(canonicalId);
            } catch (e) {
                console.warn('[FriendDataAccess] Legacy friend lookup failed:', e);
                return null;
            }
        },

        async getOnlineFriends() {
            const friends = await this.getFriends();
            return friends.filter(f => f.isOnline || f.status === 'online');
        },

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

        async isFriend(friendId) {
            const friend = await this.getFriendById(friendId);
            return !!friend;
        },

        async getFriendCount() {
            const friends = await this.getFriends();
            return friends.length;
        },

        subscribe(callback) {
            if (typeof callback !== 'function') return () => {};
            if (window.FriendService && typeof window.FriendService.on === 'function') {
                return window.FriendService.on('friends-loaded', callback);
            }
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
            const canonicalId = canonicalFriendUserId(friendId);
            const friends = this._getLegacyFriends();
            return friends.find(f => String(canonicalFriendUserId(f.id)) === String(canonicalId)) || null;
        },

        _normalizeLegacyFriends(friends) {
            return friends.map(friend => {
                if (!friend || !friend.id) return null;
                const canonicalId = canonicalFriendUserId(friend.id);
                if (!canonicalId) return null;
                return {
                    id: canonicalId,
                    name: friend.name || friend.displayName || friend.username || `User ${canonicalId}`,
                    avatar: friend.avatar || friend.photoURL || null,
                    status: friend.status || 'offline',
                    lastSeen: friend.lastSeen || friend.lastActive || null,
                    isOnline: (friend.status === 'online') || (friend.isOnline === true),
                    username: friend.username || '',
                    displayName: friend.displayName || friend.name || friend.username || '',
                    ...friend,
                    id: canonicalId
                };
            }).filter(Boolean);
        }
    };

    // =============================================
    // [MODULE INTEGRATION HELPERS]
    // =============================================

    window.ChatFriendIntegration = {
        async getChatFriends() { return await window.FriendDataAccess.getFriends(); },
        async getOnlineChatFriends() { return await window.FriendDataAccess.getOnlineFriends(); },
        async isChatFriend(userId) { return await window.FriendDataAccess.isFriend(userId); },
        subscribeToChatFriends(callback) { return window.FriendDataAccess.subscribe(callback); }
    };

    window.CallFriendIntegration = {
        async getCallableFriends() { return await window.FriendDataAccess.getOnlineFriends(); },
        async canCallUser(userId) {
            const friend = await window.FriendDataAccess.getFriendById(userId);
            return !!(friend && friend.isOnline);
        },
        subscribeToCallFriends(callback) { return window.FriendDataAccess.subscribe(callback); }
    };

    window.GroupFriendIntegration = {
        async getGroupableFriends() { return await window.FriendDataAccess.getFriends(); },
        async searchGroupMembers(query) { return await window.FriendDataAccess.searchFriends(query); },
        async addFriendsToGroup(friendIds, groupId) {
            console.log('[GroupIntegration] Add friends to group:', friendIds, groupId);
        }
    };

    // =============================================
    // [BACKWARD COMPATIBILITY LAYER]
    // =============================================

    const ensureBackwardCompatibility = () => {
        console.log('[FriendService Integration] Backward compatibility DISABLED - friend-core.js handles data');
        if (!window.friends || !Array.isArray(window.friends)) window.friends = window.friends || [];
    };

    // =============================================
    // [INITIALIZATION]
    // =============================================

    console.log('[FriendService Integration] DISABLED - friend-core.js handles all friend data');
    window.FriendDataAccess._getLegacyFriends = function() {
        return window.friends || [];
    };

    console.log('[FriendService Integration] Ready');
    console.log('[FriendService Integration] FriendService available:', !!window.FriendService);
    console.log('[FriendService Integration] FriendCore active:', !!(window.FriendCore && window.FriendCore.isReady && window.FriendCore.isReady()));
    console.log('[FriendService Integration] Legacy compatibility enabled');

    window.FriendIntegrationStatus = {
        ready: true,
        friendServiceAvailable: !!window.FriendService,
        friendCoreActive: !!(window.FriendCore && window.FriendCore.isReady && window.FriendCore.isReady()),
        legacyCompatibility: true,
        modules: ['chat', 'calls', 'groups'],
        canonicalFriendIds: true,
        timestamp: Date.now()
    };

})();
