// =============================================
// FRIEND CORE — UI BRIDGE & PUBLIC API
// Rendering, UI bridge, QR/camera, search, and the module's public API surface.
// Part of the friend-core.js split — see friend-core.bootstrap.js for details.
// This is the ENTRY module: load this file (not the other two directly) from
// friend.html, and import from THIS file in friend-ui.js.
// =============================================

import {
    showNotification as importedShowNotification,
    secureFetch,
    navigateToChat as importedNavigateToChat,
    navigateToCall as importedNavigateToCall,
    simulateContactSync as importedSimulateContactSync,
    escapeHtml as importedEscapeHtml,
    formatTimeAgo as importedFormatTimeAgo,
    getTrustScoreClass as importedGetTrustScoreClass
} from './js/api.core.js';
import {
    generateMessageId as importedGenerateMessageId
} from './js/api.messages.js';
import {
    APIGateway,
    ErrorHandler,
    FriendCacheManager,
    IframeEnvironment,
    LIFECYCLE_STATES,
    LOCAL_STORAGE_KEYS,
    LifecycleStateMachine,
    Logger,
    MODULE_NAME,
    MODULE_VERSION,
    MessageDispatcher,
    ModuleRegistrationManager,
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
    assertActive,
    authReadyReceived,
    authorizedRequest,
    childReadySent,
    currentState,
    flushRequestQueue,
    friendCategories,
    generateMessageId,
    handleAuthReady,
    handleParentReady,
    initializationLock,
    isAuthenticated,
    onModuleActive,
    parentReadyReceived,
    queueRequest,
    requestQueue,
    safeSend,
    sendChildReady,
    setInitializationLock,
    transitionTo
} from './friend-core.bootstrap.js';
import {
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
    setFriendsLoading,
    setGroups,
    setInitializationStarted,
    setIsInitialized,
    setLoadFriendsInFlight,
    setLoadFriendsLastCall,
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
} from './friend-core.operations.js';

async function loadFriendsFromBackend() {
    if (!assertActive('loadFriendsFromBackend')) {
        if (friendsLoading) clearFriendsLoading();
        return { success: false, error: 'Module not active' };
    }

    // FIX: Deduplicate concurrent calls — if a request is already in-flight,
    // return the same promise so callers all get the same result.
    const now = Date.now();
    if (_loadFriendsInFlight && (now - _loadFriendsLastCall) < 3000) {
        return _loadFriendsInFlight;
    }
    
    setLoadFriendsLastCall(Date.now());
    setLoadFriendsInFlight((async () => {
    try {
    // FIX Bug#4: When offline, immediately hydrate from local stores and return.
    // Don't wait for a network error — we know it will fail.
    if (!navigator.onLine) {
        Logger.info('loadFriendsFromBackend', 'Offline — loading from local cache');
        const cached = FriendCacheManager.getAllFriends();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
            updateFriendCounts?.();
            window.dispatchEvent(new CustomEvent('friendsUpdated', {
                detail: { friends: cached, count: cached.length, cached: true, offline: true }
            }));
            return { success: true, count: cached.length, cached: true, offline: true };
        }
        // Try IndexedDB via OfflineFirstFriends
        try { await OfflineFirstFriends._hydrateFromLocalStore(); } catch (_) {}
        // Try raw localStorage fallback
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
                    detail: { friends: raw, count: raw.length, cached: true, offline: true }
                }));
                return { success: true, count: raw.length, cached: true, offline: true };
            }
        } catch (_) {}
        return { success: false, offline: true };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadFriendsFromBackend();
                resolve(result);
            });
        });
    }
    
    if (friendsLoading) return { success: false, message: 'Already loading' };
    
    setFriendsLoading(true);
    
    try {
        const response = await authorizedRequest('/api/friends');
        
        Logger.info('loadFriendsFromBackend', 'Friends loaded', { success: response.success, data: response.data });
        
        if (response.success && response.data) {
            let friendsData = [];
            
            // Handle different response formats from backend
            if (response.data.friends && Array.isArray(response.data.friends)) {
                friendsData = response.data.friends;
            } else if (response.data.data && response.data.data.friends) {
                friendsData = response.data.data.friends;
            } else if (Array.isArray(response.data)) {
                friendsData = response.data;
            } else if (response.data.friends === undefined && Object.keys(response.data).length > 0) {
                friendsData = [response.data];
            }
            
            // Format friends data consistently, always excluding the current user
            const _selfId2 = __session?.user?.id || currentUser?.id;
            const validFriends = friendsData
                .filter(f => f && f.id && (!_selfId2 || String(f.id) !== String(_selfId2)))
                .map(friend => ({
                id: friend.id,
                displayName: friend.displayName || friend.username || 'User',
                username: friend.username || '',
                avatar: friend.avatar || friend.photoURL || '',
                photoURL: friend.avatar || friend.photoURL || '',
                // FIX (COVER-PHOTO-NOT-VISIBLE-TO-FRIENDS): the backend now returns
                // coverPhoto on every friend record (friendService.js USER_ATTRS),
                // but this normalizer dropped it, so it never reached the friend
                // profile modal even after the backend fix.
                coverPhoto: friend.coverPhoto || '',
                firstName: friend.firstName || '',
                lastName: friend.lastName || '',
                status: friend.status || 'offline',
                lastSeen: friend.lastActive || friend.lastSeen,
                online: friend.status === 'online',
                addedAt: friend.addedAt || friend.createdAt || Date.now()
            }));

            if (validFriends.length > 0) {
                FriendCacheManager.setFriends(validFriends);
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, validFriends);
                // Keep ALL key variants in sync so every module finds fresh data
                try { localStorage.setItem('kynecta_friends_cache_v8', JSON.stringify(validFriends)); } catch(_) {}
                Logger.debug('loadFriendsFromBackend', `Loaded ${validFriends.length} friends`);
            } else {
                // SAFETY: Never wipe a populated cache with an empty server response.
                // This prevents the "0 friends" flash caused by race conditions or
                // a momentarily wrong endpoint returning an empty array.
                const existing = FriendCacheManager.getAllFriends();
                if (existing.length === 0) {
                    FriendCacheManager.setFriends([]);
                    console.log('ℹ️ loadFriendsFromBackend: No friends yet (normal for new users)');
                } else {
                    console.log(`ℹ️ loadFriendsFromBackend: Server returned 0 — keeping ${existing.length} cached friends`);
                }
            }
            
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();
            
            updateFriendCounts?.();
            
            SafeStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
            
            window.dispatchEvent(new CustomEvent('friendsUpdated', { 
                detail: { friends: validFriends, count: validFriends.length }
            }));

            // Notify parent with full friends list (single send — parent listens for FRIENDS_DATA)
            window.parent.postMessage({ type: 'FRIENDS_DATA', friends: validFriends, source: 'friend-core', timestamp: Date.now() }, '*');

            // Dispatch CONTACTS_UPDATE locally so friend-ui.js counters stay accurate
            window.dispatchEvent(new CustomEvent('CONTACTS_UPDATE', {
                detail: { contacts: validFriends, count: validFriends.length, timestamp: Date.now() }
            }));
            
            clearFriendsLoading();
            // P1 FIX: Hydrate private notes from DB now that friend list is loaded
            hydratePrivateNotesFromDB();
            return { success: true, count: validFriends.length };
        }
        
        const cached = FriendCacheManager.getAllFriends();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
            updateFriendCounts?.();
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: cached, cached: true } }));
            // Send cached friends to parent too
            window.parent.postMessage({ type: 'FRIENDS_DATA', friends: cached }, '*');
            clearFriendsLoading();
            return { success: true, count: cached.length, cached: true };
        }
        
    } catch (error) {
        Logger.error('loadFriendsFromBackend', 'Failed to load friends', error);
        
        const cached = FriendCacheManager.getAllFriends();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
            updateFriendCounts?.();
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: cached, cached: true } }));
        } else {
            try {
                const localFriends = JSON.parse(localStorage.getItem('friends') || '[]');
                console.log('[LOCAL LOAD]', localFriends);
                if (Array.isArray(localFriends) && localFriends.length > 0) {
                    FriendCacheManager.setFriends(localFriends);
                    FriendCacheManager.syncToGlobals();
                    updateFriendCounts?.();
                    window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: localFriends, cached: true, offline: !navigator.onLine } }));
                }
            } catch (_) {}
        }
    } finally {
        clearFriendsLoading();
    }
    
    return { success: false };
    } finally {
        // Clear the in-flight promise so the next call after this one goes through
        setLoadFriendsInFlight(null);
    }
    })()); // end of async IIFE
    return _loadFriendsInFlight;
}

function getDiscoverableUsers() {
    let allUsersList = [];
    
    // Priority 1: window._allUsersCache (set by fetchAllUsersFromBackend)
    if (window._allUsersCache && Array.isArray(window._allUsersCache) && window._allUsersCache.length > 0) {
        allUsersList = window._allUsersCache;
        console.log(`[getDiscoverableUsers] Using window._allUsersCache: ${allUsersList.length} users`);
    }
    // Priority 2: window.FriendCore._allUsers
    else if (window.FriendCore && window.FriendCore._allUsers && window.FriendCore._allUsers.length > 0) {
        allUsersList = window.FriendCore._allUsers;
        console.log(`[getDiscoverableUsers] Using FriendCore._allUsers: ${allUsersList.length} users`);
    }
    // Priority 3: FriendCacheManager users
    else {
        allUsersList = FriendCacheManager.getAllUsers();
        console.log(`[getDiscoverableUsers] Using FriendCacheManager: ${allUsersList.length} users`);
    }
    
    if (!allUsersList || allUsersList.length === 0) {
        console.warn('[getDiscoverableUsers] No users found in any cache - try calling fetchAllUsersFromBackend()');
        return [];
    }
    
    // Get existing friend IDs to filter out
    const existingFriends = FriendCacheManager.getAllFriends();
    const friendIds = new Set();
    existingFriends.forEach(friend => {
        if (friend && friend.id) {
            friendIds.add(String(friend.id));
        }
    });
    
    // Get current user ID
    const currentUserId = __session.user?.id || currentUser?.id;
    
    // Filter out current user, existing friends, and system/bot accounts
    const discoverable = allUsersList.filter(user => {
        if (!user || !user.id) return false;
        if (currentUserId && String(user.id) === String(currentUserId)) return false;
        if (friendIds.has(String(user.id))) return false;
        // FIX-DISCOVER-BOTS: Filter out system/bot/admin accounts from discover list
        const uname = (user.username || '').toLowerCase();
        const dname = (user.displayName || user.name || '').toLowerCase();
        if (uname.startsWith('bot_') || uname.startsWith('system_') || uname.startsWith('admin_')) return false;
        if (dname === 'system' || dname === 'bot' || dname === 'admin') return false;
        if (user.isBot || user.is_bot || user.isSystem || user.is_system) return false;
        if (user.role === 'admin' && (user.isSystem || uname.includes('system') || uname.includes('bot'))) return false;
        if (user.accountType === 'bot' || user.account_type === 'bot') return false;
        return true;
    });
    
    // Normalize avatar fields
    discoverable.forEach(user => {
        user.photoURL = user.photoURL || user.avatar || '';
    });
    
    console.log(`[getDiscoverableUsers] Total: ${allUsersList.length}, Friends: ${friendIds.size}, Discoverable: ${discoverable.length}`);
    
    // Sort discoverable users (online first, then alphabetically)
    discoverable.sort((a, b) => {
        if (a.online !== b.online) return b.online ? 1 : -1;
        const nameA = (a.displayName || a.username || '').toLowerCase();
        const nameB = (b.displayName || b.username || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    return discoverable;
}

window.getDiscoverableUsers = getDiscoverableUsers;

async function loadFriendRequestsFromBackend() {
    if (!assertActive('loadFriendRequestsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadFriendRequestsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/incoming');
        
        Logger.info('loadFriendRequestsFromBackend', 'Requests loaded', { success: response.success });
        
        if (response.success && response.data) {
            let requestsData = [];
            
            // Handle different response formats
            if (response.data.requests && Array.isArray(response.data.requests)) {
                requestsData = response.data.requests;
            } else if (response.data.data?.requests && Array.isArray(response.data.data.requests)) {
                requestsData = response.data.data.requests;
            } else if (Array.isArray(response.data)) {
                requestsData = response.data;
            } else if (response.data.data && Array.isArray(response.data.data)) {
                requestsData = response.data.data;
            }
            
            // Format requests for cache
            const formattedRequests = requestsData.map(req => ({
                id: req.id,
                senderId: req.senderId || req.requesterId,
                receiverId: req.receiverId,
                status: req.status,
                senderName: req.user?.displayName || req.user?.username || 'User',
                senderUsername: req.user?.username || '',
                senderAvatar: req.user?.avatar || '',
                user: req.user,
                createdAt: req.createdAt,
                timestamp: req.createdAt || Date.now()
            }));
            
            console.log(`[loadFriendRequestsFromBackend] Loaded ${formattedRequests.length} incoming requests`);
            
            // FIX: Always replace cache with authoritative server result — even if 0.
            // This clears stale phantom requests that were cached from previous optimistic updates.
            FriendCacheManager.setRequests(formattedRequests);
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();

            window.dispatchEvent(new CustomEvent('requestsUpdated', { 
                detail: { requests: formattedRequests, count: formattedRequests.length, authoritative: true }
            }));
            
            return { success: true, count: formattedRequests.length };
        }
        
        // Server response failed — keep cache but don't overwrite with stale data
        const cached = FriendCacheManager.getAllRequests();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
            window.dispatchEvent(new CustomEvent('requestsUpdated', { 
                detail: { requests: cached, cached: true }
            }));
        }
    } catch (error) {
        Logger.error('loadFriendRequestsFromBackend', 'Failed to load requests', error);
        
        const cached = FriendCacheManager.getAllRequests();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
        }
    }
    
    return { success: false };
}

// SETTINGS WIRING: friends.friendSuggestions — the backend already has a fully-built
// GET /api/friends/suggestions endpoint (mutual-friend + shared-group scoring, falls back to
// newest users). Nothing on the client ever called it. This wires it up; rendering is gated
// on the setting in friend-ui.js's renderFriendSuggestions().
async function loadFriendSuggestions(limit = 10) {
    if (!assertActive('loadFriendSuggestions')) {
        return { success: false, error: 'Module not active' };
    }
    if (window.__friendSuggestions === false) {
        return { success: true, suggestions: [] };
    }
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadFriendSuggestions(limit);
                resolve(result);
            });
        });
    }

    try {
        const response = await authorizedRequest(`/api/friends/suggestions?limit=${limit}`);
        if (response.success && response.data) {
            const suggestions = response.data.suggestions || response.data.data?.suggestions || [];
            window.friendSuggestions = suggestions;
            window.dispatchEvent(new CustomEvent('friendSuggestionsUpdated', {
                detail: { suggestions }
            }));
            return { success: true, suggestions };
        }
    } catch (error) {
        Logger.error('loadFriendSuggestions', 'Failed to load suggestions', error);
    }
    return { success: false, suggestions: [] };
}

async function loadSentRequestsFromBackend() {
    if (!assertActive('loadSentRequestsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadSentRequestsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/sent');
        
        Logger.info('loadSentRequestsFromBackend', 'Sent requests loaded', { success: response.success });
        
        if (response.success && response.data) {
            let requestsData = [];
            
            // Handle different response formats
            if (response.data.requests && Array.isArray(response.data.requests)) {
                requestsData = response.data.requests;
            } else if (response.data.data?.requests && Array.isArray(response.data.data.requests)) {
                requestsData = response.data.data.requests;
            } else if (Array.isArray(response.data)) {
                requestsData = response.data;
            }
            
            // Format requests for cache - ensure proper user info
            const formattedRequests = requestsData.map(req => {
                // Extract user info from various possible locations
                let userInfo = null;
                
                if (req.user) {
                    userInfo = req.user;
                } else if (req.receiver) {
                    userInfo = req.receiver;
                } else if (req.receiverId) {
                    userInfo = {
                        id: req.receiverId,
                        displayName: req.receiverName || req.receiverUsername || 'User',
                        username: req.receiverUsername || ''
                    };
                }
                
                return {
                    id: req.id,
                    receiverId: req.receiverId,
                    senderId: req.senderId || req.requesterId,
                    status: req.status,
                    receiverName: userInfo?.displayName || userInfo?.username || 'User',
                    receiverUsername: userInfo?.username || '',
                    receiverAvatar: userInfo?.avatar || userInfo?.photoURL || '',
                    user: userInfo,
                    createdAt: req.createdAt,
                    timestamp: req.createdAt || Date.now()
                };
            });
            
            console.log(`[loadSentRequestsFromBackend] Loaded ${formattedRequests.length} sent requests`);
            
            // FIX: Always replace cache with authoritative server result — even if empty (0).
            // Previously, when server returned 0, the function fell through to the stale
            // cached value, keeping phantom optimistic records visible in the UI forever.
            setSentRequests(formattedRequests);
            FriendCacheManager.setSentRequests(formattedRequests);
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();

            // FIX: Also clean up any stale local-only (optimistic) records from IndexedDB
            // that weren't confirmed by the server.
            const _ls = window.KynectaFriendsLocalStore;
            if (_ls && formattedRequests.length === 0) {
                _ls.ready().then(async () => {
                    try {
                        const _pending = await _ls.getPendingSent().catch(() => []);
                        for (const _p of (_pending || [])) {
                            if (_p.isLocalOnly) await _ls.hardDelete(_p.id).catch(() => {});
                        }
                    } catch (_) {}
                }).catch(() => {});
            }
            
            window.dispatchEvent(new CustomEvent('sentRequestsUpdated', { 
                detail: { requests: formattedRequests, count: formattedRequests.length, timestamp: Date.now() }
            }));
            
            return { success: true, count: formattedRequests.length };
        }
        
        const cached = FriendCacheManager.getAllSentRequests();
        if (cached.length > 0) {
            setSentRequests(cached);
            FriendCacheManager.syncToGlobals();
            window.dispatchEvent(new CustomEvent('sentRequestsUpdated', { 
                detail: { requests: cached, cached: true, timestamp: Date.now() }
            }));
        }
    } catch (error) {
        Logger.error('loadSentRequestsFromBackend', 'Failed to load sent requests', error);
        
        const cached = FriendCacheManager.getAllSentRequests();
        if (cached.length > 0) {
            setSentRequests(cached);
            FriendCacheManager.syncToGlobals();
        }
    }
    
    return { success: false };
}

async function loadPinnedFriendsFromBackend() {
    if (!assertActive('loadPinnedFriendsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadPinnedFriendsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/pinned');
        
        Logger.info('loadPinnedFriendsFromBackend', 'Pinned friends loaded', { success: response.success });
        
        if (response.success && (response.data?.friends || response.data)) {
            const friendsData = response.data?.friends || response.data || [];
            const validFriends = Array.isArray(friendsData) ? friendsData.filter(f => validateFriendData(f)) : [];
            
            validFriends.forEach(f => FriendCacheManager._cache.pinnedFriends.set(f.id, f));
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();
            return { success: true, count: validFriends.length };
        }
    } catch (error) {
        Logger.error('loadPinnedFriendsFromBackend', 'Failed to load pinned friends', error);
    }
    
    return { success: false };
}

async function loadMutedFriendsFromBackend() {
    if (!assertActive('loadMutedFriendsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadMutedFriendsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/muted');
        
        Logger.info('loadMutedFriendsFromBackend', 'Muted friends loaded', { success: response.success });
        
        if (response.success && (response.data?.friends || response.data)) {
            const friendsData = response.data?.friends || response.data || [];
            const validFriends = Array.isArray(friendsData) ? friendsData.filter(f => validateFriendData(f)) : [];
            
            validFriends.forEach(f => FriendCacheManager._cache.mutedFriends.set(f.id, f));
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();
            return { success: true, count: validFriends.length };
        }
    } catch (error) {
        Logger.error('loadMutedFriendsFromBackend', 'Failed to load muted friends', error);
    }
    
    return { success: false };
}

async function loadContactsFromBackend() {
    if (!assertActive('loadContactsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadContactsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/contacts/synced');
        
        Logger.info('loadContactsFromBackend', 'Contacts loaded', { success: response.success });
        
        if (response.success && (response.data?.contacts || response.data)) {
            const contactsData = response.data?.contacts || response.data || [];
            setContacts(Array.isArray(contactsData) ? contactsData : []);
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.CONTACTS, contacts);
            window.dispatchEvent(new CustomEvent('contactsUpdated', { detail: { contacts } }));
            return { success: true, count: contacts.length };
        }
    } catch (error) {
        Logger.error('loadContactsFromBackend', 'Failed to load contacts', error);
        
        const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (cached) {
            try { setContacts(JSON.parse(cached)); } catch (e) { setContacts([]); }
        }
    }
    
    return { success: false };
}

async function loadGroupsFromBackend() {
    if (!assertActive('loadGroupsFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await loadGroupsFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/groups/user');
        
        Logger.info('loadGroupsFromBackend', 'Groups loaded', { success: response.success });
        
        if (response.success && (response.data?.groups || response.data)) {
            const groupsData = response.data?.groups || response.data || [];
            setGroups(Array.isArray(groupsData) ? groupsData : []);
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.USER_GROUPS, groups);
            return { success: true, count: groups.length };
        }
    } catch (error) {
        Logger.error('loadGroupsFromBackend', 'Failed to load groups', error);
        
        const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cached) {
            try { setGroups(JSON.parse(cached)); } catch (e) { setGroups([]); }
        }
    }
    
    return { success: false };
}

async function fetchAllUsersFromBackend() {
    // ── OFFLINE-FIRST: serve IndexedDB cache immediately, before any auth/active
    // check, so discovery never shows a blank screen offline. ─────────────────
    if (!navigator.onLine) {
        try {
            const ls = window.KynectaFriendsLocalStore;
            const idbUsers = ls ? (await ls.getAllUsers().catch(() => [])) : [];
            if (idbUsers.length > 0) {
                window._allUsersCache = idbUsers;
                if (window.FriendCore) {
                    window.FriendCore._allUsers         = idbUsers;
                    window.FriendCore.discoverableUsers = idbUsers;
                    window.FriendCore._allUsersCache    = idbUsers;
                }
                if (window.FriendCacheManager?.setUsers) window.FriendCacheManager.setUsers(idbUsers);
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users: idbUsers, count: idbUsers.length, cached: true, offline: true }
                }));
                return { success: true, users: idbUsers, count: idbUsers.length, cached: true, offline: true };
            }
        } catch (_) {}
        // IndexedDB empty — try localStorage before giving up
        try {
            const raw = JSON.parse(localStorage.getItem('discover_users') || '[]');
            if (Array.isArray(raw) && raw.length > 0) {
                window._allUsersCache = raw;
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users: raw, count: raw.length, cached: true, offline: true }
                }));
                return { success: true, users: raw, count: raw.length, cached: true, offline: true };
            }
        } catch (_) {}
        return { success: false, users: [], offline: true };
    }

    if (!assertActive('fetchAllUsersFromBackend')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        return new Promise((resolve) => {
            queueRequest(async () => {
                const result = await fetchAllUsersFromBackend();
                resolve(result);
            });
        });
    }
    
    try {
        const response = await authorizedRequest('/api/friends/users/all?limit=200');
        
        Logger.info('fetchAllUsersFromBackend', 'Users fetched', { success: response.success });
        
        let usersData = [];
        
        if (response.success && response.data) {
            if (response.data.users && Array.isArray(response.data.users)) {
                usersData = response.data.users;
            } else if (Array.isArray(response.data)) {
                usersData = response.data;
            } else if (response.data.data && response.data.data.users) {
                usersData = response.data.data.users;
            }
        }
        
        const currentUserId = __session.user?.id;
        const filteredUsers = Array.isArray(usersData) ? usersData.filter(user => String(user.id) !== String(currentUserId)) : [];
        
        // Normalize avatar fields
        filteredUsers.forEach(user => {
            user.photoURL = user.photoURL || user.avatar || '';
            user.displayName = user.displayName || user.name || user.username || 'User';
        });
        
        // ✅ CRITICAL: Store in window._allUsersCache for UI access
        window._allUsersCache = filteredUsers;
        
        // ✅ Store in FriendCacheManager for persistence
        FriendCacheManager.setUsers(filteredUsers);
        if (Array.isArray(filteredUsers) && filteredUsers.length > 0) {
            localStorage.setItem('discover_users', JSON.stringify(filteredUsers));
        }

        // ✅ FIX: Persist to IndexedDB 'users' store — primary offline source for discovery
        if (filteredUsers.length > 0) {
            const ls = window.KynectaFriendsLocalStore;
            if (ls && typeof ls.saveUsers === 'function') {
                ls.saveUsers(filteredUsers).catch(e =>
                    console.warn('[fetchAllUsers] IndexedDB users save failed:', e.message)
                );
            } else {
                // Fallback: write directly to AppCache if localStore not ready
                window.AppCache?.save?.('users', filteredUsers.map(u => ({
                    ...u, id: String(u.id), userId: String(u.id)
                }))).catch?.(() => {});
            }
        }
        
        // ✅ Make available on FriendCore for UI
        if (window.FriendCore) {
            window.FriendCore._allUsers         = filteredUsers;
            window.FriendCore.discoverableUsers = filteredUsers;
            window.FriendCore._allUsersCache    = filteredUsers;
        }
        
        // Store original unfiltered users for debugging
        if (!window._allUsersRaw) window._allUsersRaw = [];
        window._allUsersRaw = Array.isArray(usersData) ? usersData : [];
        
        // Sort for display
        filteredUsers.sort((a, b) => {
            if (a.online !== b.online) return b.online ? 1 : -1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        
        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist();
        localStorage.setItem('all_users_last_sync', Date.now().toString());
        
        // ✅ Dispatch event for UI to update
        window.dispatchEvent(new CustomEvent('allUsersLoaded', {
            detail: { users: filteredUsers, count: filteredUsers.length }
        }));
        
        console.log(`✅ fetchAllUsersFromBackend: Loaded ${filteredUsers.length} users for discovery`);
        
        return { success: true, count: filteredUsers.length, users: filteredUsers };
    } catch (error) {
        Logger.error('fetchAllUsersFromBackend', 'Failed to fetch users', error);
        
        // Priority 1: In-memory FriendCacheManager (fastest, already loaded)
        const cached = FriendCacheManager.getAllUsers();
        if (cached.length > 0) {
            setAllUsers(cached);
            if (window.FriendCore) window.FriendCore._allUsers = cached;
            window._allUsersCache = cached;
            window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                detail: { users: cached, count: cached.length, cached: true }
            }));
            return { success: true, count: cached.length, cached: true, users: cached };
        }

        // Priority 2: IndexedDB 'users' store (survives page refresh, works offline)
        try {
            const ls = window.KynectaFriendsLocalStore;
            const idbUsers = ls ? (await ls.getAllUsers().catch(() => [])) : [];
            if (Array.isArray(idbUsers) && idbUsers.length > 0) {
                setAllUsers(idbUsers);
                if (window.FriendCore) {
                    window.FriendCore._allUsers         = idbUsers;
                    window.FriendCore.discoverableUsers = idbUsers;
                    window.FriendCore._allUsersCache    = idbUsers;
                }
                window._allUsersCache = idbUsers;
                FriendCacheManager.setUsers(idbUsers);
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users: idbUsers, count: idbUsers.length, cached: true, offline: !navigator.onLine }
                }));
                return { success: true, count: idbUsers.length, cached: true, users: idbUsers };
            }
        } catch (_) {}

        // Priority 3: localStorage (quick-access fallback)
        try {
            const localUsers = JSON.parse(localStorage.getItem('discover_users') || '[]');
            console.log('[LOCAL LOAD]', localUsers);
            if (Array.isArray(localUsers) && localUsers.length > 0) {
                setAllUsers(localUsers);
                if (window.FriendCore) {
                    window.FriendCore._allUsers         = localUsers;
                    window.FriendCore.discoverableUsers = localUsers;
                }
                window._allUsersCache = localUsers;
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users: localUsers, count: localUsers.length, cached: true, offline: !navigator.onLine }
                }));
                return { success: true, count: localUsers.length, cached: true, users: localUsers };
            }
        } catch (_) {}
    }
    
    return { success: false, users: [] };
}

function guardFriendOperation(operationName) {
    const guard = SafetyGuards.enforceSessionGuard(operationName);
    if (!guard.valid) {
        window.dispatchEvent(new CustomEvent('friendOperationFailed', {
            detail: { operation: operationName, reason: guard.reason }
        }));
        
        if (typeof importedShowNotification === 'function') {
            importedShowNotification(guard.reason, 'error', 3000);
        }
        
        throw new Error(guard.reason);
    }
    return guard.session;
}

async function apiCallWithRetry(url, options = {}, maxRetries = 1) {
    const safeOptions = options || {};
    
    if (!url.includes('/public/')) {
        try {
            guardFriendOperation('apiCall');
        } catch (e) {
            return { success: false, error: e.message, statusCode: 401 };
        }
    }
    
    const circuitBreaker = ErrorHandler.getCircuitBreaker('api') || 
        ErrorHandler.createCircuitBreaker('api', { failureThreshold: 5, timeout: 60000 });
    
    return circuitBreaker.execute(async () => {
        if (!url.includes('/public/')) {
            const response = await authorizedRequest(url, {
                ...safeOptions,
                requireAuth: true,
                silent: safeOptions.silent || false
            });
            return response;
        }
        
        try {
            const response = await fetch(url, {
                method: options?.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options?.headers || {})
                },
                body: options?.body
            });
            const data = await response.json();
            return { success: response.ok, data, statusCode: response.status };
        } catch (error) {
            throw error;
        }
    }).catch(error => {
        return { success: false, error: error.message, statusCode: error.statusCode || 500 };
    });
}

async function verifySession(timeoutMs = 500) {
    return V6.verifySession(timeoutMs);
}

async function sendFriendRequest(friendId, category = 'friend', note = '', isTemporary = false, duration = null, isBusiness = false) {
    try {
        guardFriendOperation('sendFriendRequest');
    } catch (e) {
        return { success: false, error: e.message, status: 'session_failed' };
    }

    // FIX: Look up the user's display info from all available caches so the
    // optimistic "Sent Requests" card never shows "Unknown User".
    // Priority: window._allUsersCache → FriendCacheManager users → localStorage discover_users
    let displayName = null, username = null, avatar = null;
    try {
        const allUsersCache =
            (window._allUsersCache && Array.isArray(window._allUsersCache) ? window._allUsersCache : null) ||
            (FriendCacheManager.getAllUsers ? FriendCacheManager.getAllUsers() : null) ||
            (() => { try { return JSON.parse(localStorage.getItem('discover_users') || '[]'); } catch(_) { return []; } })();

        if (Array.isArray(allUsersCache)) {
            const found = allUsersCache.find(u => u && String(u.id) === String(friendId));
            if (found) {
                displayName = found.displayName || found.name ||
                    ([found.firstName, found.lastName].filter(Boolean).join(' ').trim()) ||
                    found.username || null;
                username    = found.username || null;
                avatar      = found.avatar   || found.photoURL || null;
            }
        }
    } catch (_) {}

    return await FriendRequestManager.sendFriendRequest(friendId, {
        category,
        note,
        isTemporary,
        duration,
        isBusiness,
        message: note,  // P2 FIX: also send as 'message' field (connection note / requestMessage)
        displayName,
        username,
        avatar,
    });
}

async function acceptFriendRequestOnline(requestId, friendId) {
    try {
        guardFriendOperation('acceptFriendRequest');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    return await FriendRequestManager.acceptFriendRequest(requestId, friendId);
}

async function declineFriendRequest(requestData) {
    try {
        guardFriendOperation('declineFriendRequest');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    return await FriendRequestManager.declineFriendRequest(requestData.id);
}

async function cancelFriendRequest(requestData) {
    try {
        guardFriendOperation('cancelFriendRequest');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    return await FriendRequestManager.cancelFriendRequest(requestData.id);
}

async function togglePinFriend(friendData) {
    try {
        guardFriendOperation('togglePinFriend');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    if (!validateFriendData(friendData)) {
        showNotification?.('Invalid friend data', 'error');
        return { success: false };
    }
    
    const verification = await V6.verifySession();
    if (!verification.valid) {
        showNotification?.('Session verification failed', 'error');
        return { success: false };
    }
    
    const friendId = friendData.id;
    const isPinned = FriendCacheManager._cache.pinnedFriends.has(friendId);
    
    if (isPinned) {
        FriendCacheManager._cache.pinnedFriends.delete(friendId);
    } else {
        FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
    }
    FriendCacheManager.syncToGlobals();
    FriendCacheManager.persist();
    
    try {
        const response = await authorizedRequest(`/api/friends/${friendId}/pin`, {
            method: isPinned ? 'DELETE' : 'POST'
        });
        
        Logger.info('togglePinFriend', 'Pin toggled', { friendId, isPinned: !isPinned, success: response?.success });
        
        if (response?.success) {
            updateCurrentSection?.();
            updateFriendCounts?.();
            showNotification?.(isPinned ? 'Friend unpinned' : 'Friend pinned', 'success');
            return { success: true };
        } else {
            if (isPinned) {
                FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
            } else {
                FriendCacheManager._cache.pinnedFriends.delete(friendId);
            }
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();
            
            showNotification?.('Failed to update pin status', 'error');
            return { success: false };
        }
    } catch (error) {
        if (isPinned) {
            FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
        } else {
            FriendCacheManager._cache.pinnedFriends.delete(friendId);
        }
        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist();
        
        if (error.message !== 'Session expired') {
            Logger.error('togglePinFriend', 'Failed to toggle pin', error);
            showNotification?.('Failed to update pin status', 'error');
        }
        return { success: false };
    }
}

async function toggleMuteFriend(friendData) {
    try {
        guardFriendOperation('toggleMuteFriend');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    if (!validateFriendData(friendData)) {
        showNotification?.('Invalid friend data', 'error');
        return { success: false };
    }
    
    const verification = await V6.verifySession();
    if (!verification.valid) {
        showNotification?.('Session verification failed', 'error');
        return { success: false };
    }
    
    const friendId = friendData.id;
    const isMuted = FriendCacheManager._cache.mutedFriends.has(friendId);
    
    if (isMuted) {
        FriendCacheManager._cache.mutedFriends.delete(friendId);
    } else {
        FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
    }
    FriendCacheManager.syncToGlobals();
    FriendCacheManager.persist();
    
    try {
        const response = await authorizedRequest(`/api/friends/${friendId}/mute`, {
            method: isMuted ? 'DELETE' : 'POST'
        });
        
        Logger.info('toggleMuteFriend', 'Mute toggled', { friendId, isMuted: !isMuted, success: response?.success });
        
        if (response?.success) {
            updateCurrentSection?.();
            updateFriendCounts?.();
            showNotification?.(isMuted ? 'Friend unmuted' : 'Friend muted', 'success');
            return { success: true };
        } else {
            if (isMuted) {
                FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
            } else {
                FriendCacheManager._cache.mutedFriends.delete(friendId);
            }
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();
            
            showNotification?.('Failed to update mute status', 'error');
            return { success: false };
        }
    } catch (error) {
        if (isMuted) {
            FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
        } else {
            FriendCacheManager._cache.mutedFriends.delete(friendId);
        }
        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist();
        
        if (error.message !== 'Session expired') {
            Logger.error('toggleMuteFriend', 'Failed to toggle mute', error);
            showNotification?.('Failed to update mute status', 'error');
        }
        return { success: false };
    }
}

async function removeFriend(friendData) {
    try {
        guardFriendOperation('removeFriend');
    } catch (e) {
        return { success: false, error: e.message };
    }

    if (!validateFriendData(friendData)) {
        showNotification?.('Invalid friend data', 'error');
        return { success: false };
    }

    const verification = await V6.verifySession();
    if (!verification.valid) {
        showNotification?.('Session verification failed', 'error');
        return { success: false };
    }

    const friendId = friendData.id;
    const wasPinned = FriendCacheManager._cache.pinnedFriends.delete(friendId);
    const wasMuted  = FriendCacheManager._cache.mutedFriends.delete(friendId);
    const wasFriend = FriendCacheManager.removeFriend(friendId);

    // Persist removed state immediately to localStorage + IndexedDB + KynectaStore
    await saveFriendLocal(friendData, 'removed', { isLocalOnly: true });

    FriendCacheManager.syncToGlobals();
    FriendCacheManager.persist();

    // Offline path: queue for later
    if (!navigator.onLine) {
        await OfflineFirstFriends.enqueueAction('remove', friendId, {}, null);
        return { success: true, queued: true };
    }

    try {
        const response = await authorizedRequest(`/api/friends/${friendId}`, {
            method: 'DELETE'
        });

        Logger.info('removeFriend', 'Friend removed', { friendId, success: response?.success });

        if (response?.success) {
            // Confirm removal in IndexedDB (hard delete)
            const ls = window.KynectaFriendsLocalStore;
            if (ls) {
                const lr = await ls.getByFriendId(String(friendId)).catch(() => null);
                if (lr) await ls.hardDelete(lr.id).catch(() => {});
            }

            updateCurrentSection?.();
            updateFriendCounts?.();
            showNotification?.('Friend removed', 'success');

            safeSend({
                type: 'FRIEND_REMOVED',
                payload: { friendId, timestamp: Date.now() }
            });

            return { success: true };
        } else {
            // Rollback all layers
            if (wasFriend) FriendCacheManager.setFriend(friendData);
            if (wasPinned) FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
            if (wasMuted)  FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
            await saveFriendLocal(friendData, 'accepted', { isLocalOnly: false });
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();

            showNotification?.('Failed to remove friend', 'error');
            return { success: false };
        }
    } catch (error) {
        // Network error: queue retry, rollback UI
        Logger.error('removeFriend', 'Network error – queuing', error);
        await OfflineFirstFriends.enqueueAction('remove', friendId, {}, null);

        if (wasFriend) FriendCacheManager.setFriend(friendData);
        if (wasPinned) FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
        if (wasMuted)  FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
        await saveFriendLocal(friendData, 'accepted', { isLocalOnly: false });
        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist();

        if (error.message !== 'Session expired') {
        }
        return { success: true, queued: true };
    }
}

async function blockUser(friendData) {
    try {
        guardFriendOperation('blockUser');
    } catch (e) {
        return { success: false, error: e.message };
    }

    if (!validateFriendData(friendData)) {
        showNotification?.('Invalid user data', 'error');
        return { success: false };
    }

    const verification = await V6.verifySession();
    if (!verification.valid) {
        showNotification?.('Session verification failed', 'error');
        return { success: false };
    }

    const friendId = friendData.id;

    const wasFriend = FriendCacheManager.removeFriend(friendId);
    const wasPinned = FriendCacheManager._cache.pinnedFriends.delete(friendId);
    const wasMuted  = FriendCacheManager._cache.mutedFriends.delete(friendId);

    // Persist blocked state immediately to localStorage + IndexedDB + KynectaStore
    await saveFriendLocal(friendData, 'blocked', { isLocalOnly: true });

    FriendCacheManager.syncToGlobals();
    FriendCacheManager.persist();

    // Offline path: queue for later
    if (!navigator.onLine) {
        await OfflineFirstFriends.enqueueAction('block', friendId, {}, null);
        return { success: true, queued: true };
    }

    try {
        const response = await authorizedRequest(`/api/friends/${friendId}/block`, {
            method: 'POST'
        });

        Logger.info('blockUser', 'User blocked', { friendId, success: response?.success });

        if (response?.success) {
            // Confirm blocked in IndexedDB
            const ls = window.KynectaFriendsLocalStore;
            if (ls) {
                const lr = await ls.getByFriendId(String(friendId)).catch(() => null);
                if (lr) await ls.updateStatus(lr.id, 'blocked').catch(() => {});
            }

            updateCurrentSection?.();
            updateFriendCounts?.();
            showNotification?.('User blocked', 'success');

            safeSend({
                type: 'FRIEND_BLOCKED',
                payload: { userId: friendId, timestamp: Date.now() }
            });

            return { success: true };
        } else {
            // Rollback
            if (wasFriend) FriendCacheManager.setFriend(friendData);
            if (wasPinned) FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
            if (wasMuted)  FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
            await saveFriendLocal(friendData, 'accepted', { isLocalOnly: false });
            FriendCacheManager.syncToGlobals();
            FriendCacheManager.persist();

            showNotification?.('Failed to block user', 'error');
            return { success: false };
        }
    } catch (error) {
        // Network error: queue retry, rollback UI
        Logger.error('blockUser', 'Network error – queuing', error);
        await OfflineFirstFriends.enqueueAction('block', friendId, {}, null);

        if (wasFriend) FriendCacheManager.setFriend(friendData);
        if (wasPinned) FriendCacheManager._cache.pinnedFriends.set(friendId, friendData);
        if (wasMuted)  FriendCacheManager._cache.mutedFriends.set(friendId, friendData);
        await saveFriendLocal(friendData, 'accepted', { isLocalOnly: false });
        FriendCacheManager.syncToGlobals();
        FriendCacheManager.persist();

        if (error.message !== 'Session expired') {
        }
        return { success: true, queued: true };
    }
}

function savePrivateNote(friendId, note) {
    if (!validateFriendId(friendId)) {
        showNotification?.('Invalid friend ID', 'error');
        return false;
    }

    if (note && note.length > 1000) {
        showNotification?.('Note is too long (max 1000 characters)', 'error');
        return false;
    }

    // DB column is VARCHAR(200) — truncate silently before sending
    const safeNote = note ? String(note).substring(0, 200) : '';

    try {
        if (!window.privateNotes) window.privateNotes = {};
        window.privateNotes[friendId] = safeNote;

        // Step 1: localStorage — instant, survives offline
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, window.privateNotes);

        // Step 2 (P1 FIX): Persist to DB — notes column existed but was never written to.
        // Using fire-and-forget: UI reflects change immediately, DB catches up async.
        (function() {
            try {
                const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
                const _token = (typeof __session !== 'undefined' && __session?.token)
                    || localStorage.getItem('token')
                    || localStorage.getItem('authToken')
                    || localStorage.getItem('moodchat_token')
                    || '';
                fetch(`${_apiBase}/friends/${friendId}/notes`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
                    body: JSON.stringify({ notes: safeNote })
                }).then(res => {
                    if (!res.ok) Logger.warn('Notes', 'API persist failed', { status: res.status, friendId });
                }).catch(err => {
                    Logger.warn('Notes', 'Notes API call failed (kept in localStorage)', err.message);
                });
            } catch (_) {}
        })();

        showNotification?.('Note saved', 'success');
        return true;
    } catch (error) {
        Logger.error('Notes', 'Failed to save note', error, { friendId });
        showNotification?.('Failed to save note', 'error');
        return false;
    }
}

function hydratePrivateNotesFromDB() {
    setTimeout(() => {
        try {
            const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
            const _token = (typeof __session !== 'undefined' && __session?.token)
                || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
            const friendIds = (window.friends || []).map(f => f.id).filter(Boolean).slice(0, 100);
            friendIds.forEach(fid => {
                fetch(`${_apiBase}/friends/${fid}/notes`, {
                    headers: { 'Authorization': `Bearer ${_token}` }
                }).then(r => r.ok ? r.json() : null).then(data => {
                    if (data?.success && data.data?.notes) {
                        if (!window.privateNotes) window.privateNotes = {};
                        window.privateNotes[fid] = data.data.notes;
                        SafeStorage.setObject(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, window.privateNotes);
                    }
                }).catch(() => {});
            });
        } catch (_) {}
    }, 3000);
}

function getLastInteraction(friendId) {
    try {
        if (!window.lastInteractions) window.lastInteractions = {};
        
        const interaction = window.lastInteractions[friendId];
        if (!interaction?.timestamp) return null;
        
        const now = new Date();
        const then = new Date(interaction.timestamp);
        const minutes = Math.floor((now - then) / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        
        return `${Math.floor(days / 7)}w ago`;
    } catch (error) {
        return null;
    }
}

function handleFriendSelection(friendId, callback) {
    try {
        guardFriendOperation('friendSelection');
    } catch (e) {
        if (callback) callback({ success: false, error: e.message });
        return { success: false, error: e.message };
    }
    
    const friend = FriendCacheManager.getFriend(friendId) || 
                  FriendCacheManager.getUser(friendId);
    
    if (!friend) {
        if (callback) callback({ success: false, error: 'Friend not found' });
        return { success: false, error: 'Friend not found' };
    }
    
    setSelectedFriend(friend);
    
    window.dispatchEvent(new CustomEvent('friendSelected', {
        detail: { friend, timestamp: Date.now() }
    }));
    
    if (callback) callback({ success: true, friend });
    return { success: true, friend };
}

function getFriendsForMessaging() {
    try {
        guardFriendOperation('getFriendsForMessaging');
    } catch (e) {
        return [];
    }
    
    return FriendCacheManager.getAllFriends()
        .filter(f => f && f.id && !f.blocked)
        .map(f => ({
            id: f.id,
            name: f.displayName || f.name || f.username || 'User',
            username: f.username || '',
            avatar: f.photoURL || f.avatar || '',
            online: f.online || false,
            lastSeen: f.lastSeen || null
        }));
}

function getFriendsForCalling() {
    try {
        guardFriendOperation('getFriendsForCalling');
    } catch (e) {
        return [];
    }
    
    return FriendCacheManager.getAllFriends()
        .filter(f => f && f.id && f.online && !f.blocked)
        .map(f => ({
            id: f.id,
            name: f.displayName || f.name || f.username || 'User',
            username: f.username || '',
            avatar: f.photoURL || f.avatar || '',
            online: true
        }));
}

function getFriendsForGroup() {
    try {
        guardFriendOperation('getFriendsForGroup');
    } catch (e) {
        return [];
    }
    
    return FriendCacheManager.getAllFriends()
        .filter(f => f && f.id && !f.blocked)
        .map(f => ({
            id: f.id,
            name: f.displayName || f.name || f.username || 'User',
            username: f.username || '',
            avatar: f.photoURL || f.avatar || '',
            selected: false
        }));
}

async function startCameraScanner() {
    if (!authReadyReceived || !__session.ready || !__session.token) {
        if (!assertActive('startCameraScanner')) {
            showNotification?.('Module not active, please wait...', 'warning');
            return;
        }
        let attempts = 0;
        const waitAndStart = setInterval(() => {
            attempts++;
            if (authReadyReceived && __session.ready && __session.token) {
                clearInterval(waitAndStart);
                startCameraScanner();
            } else if (attempts >= 20) {
                clearInterval(waitAndStart);
                showNotification?.('Session timed out — please refresh', 'error');
            }
        }, 300);
        return;
    }

    QRCodeManager.resetScan();
    
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('scannerCanvas');
    
    if (!video || !canvas) {
        showNotification?.('Camera elements not found', 'error');
        return;
    }
    
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    
    try {
        setCameraStream(await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 15 }
            },
            audio: false
        }));
        
        video.srcObject = cameraStream;
        
        startRealQRCodeScanning(video, canvas);
        showNotification?.('Camera started', 'success');
        
    } catch (error) {
        Logger.error('Camera', 'Failed to start camera', error);
        
        const container = document.querySelector('.camera-container');
        if (container) {
            container.innerHTML = `
                <div class="no-camera-message">
                    <i class="fas fa-video-slash"></i>
                    <h3>Camera Access Required</h3>
                    <p>Please allow camera access to scan QR codes.</p>
                </div>
            `;
        }
        
        showNotification?.('Could not access camera', 'error');
    }
}

function startRealQRCodeScanning(video, canvas) {
    if (!featureFlags.qrCode) return;
    
    const ctx = canvas.getContext('2d');
    setScanningActive(true);
    let scanRequestSent = false;
    let _qrScanActive = true;  // FIXED: Add stop flag for QR scanning
    
    function scan() {
        if (!scanningActive || !document.getElementById('cameraScannerModal')?.classList.contains('active')) {
            return;
        }
        
        if (!_qrScanActive) {  // FIXED: Exit if scan is complete
            return;
        }
        
        if (scanRequestSent) {
            return;
        }
        
        // Accept readyState >= HAVE_CURRENT_DATA (2) for faster start
        if (video.readyState >= 2) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                if (typeof jsQR === 'function') {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "attemptBoth"
                    });
                    
                    if (code && !scanRequestSent) {
                        drawQRCodeRect(code.location, ctx);
                        scanRequestSent = true;
                        _qrScanActive = false;
                        if (_scanInterval) { clearInterval(_scanInterval); _scanInterval = null; }
                        processScannedQRCodeReal(code.data);
                        return;
                    }
                }
            } catch (e) {}
        }
    }
    
    // Use 100ms interval (10 fps scan) instead of rAF + HAVE_ENOUGH_DATA wait
    let _scanInterval = setInterval(() => {
        if (!scanningActive || !_qrScanActive || scanRequestSent) {
            clearInterval(_scanInterval); _scanInterval = null;
        } else { scan(); }
    }, 100);
    // Also try immediately on first rAF
    requestAnimationFrame(scan);
    
    function drawQRCodeRect(location, ctx) {
        try {
            ctx.beginPath();
            ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            ctx.closePath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#00FF00";
            ctx.stroke();
        } catch (e) {}
    }
}

function processScannedQRCodeReal(qrData) {
    QRCodeManager.processScannedQR(qrData).then(result => {
        // FIXED: Stop scanner first before processing result
        _qrScanActive = false;   // ← STOP loop
        setScanningActive(false);   // ← Stop scanning flag
        stopCameraScanner();      // ← Stop camera
        
        if (!result.success) {
            showNotification?.(result.error, 'error');
            QRCodeManager.resetScan();
            return;
        }
        
        const user = result.user || result.data;
        const scannedUserId = user?.id || user?.userId;
        
        if (!user || !scannedUserId) {
            showNotification?.('Invalid QR code data', 'error');
            QRCodeManager.resetScan();
            return;
        }
        
        user.id = user.id || scannedUserId;
        user.userId = user.userId || scannedUserId;
        
        const currentUserId = __session.user?.id;
        if (currentUserId === scannedUserId || String(currentUserId) === String(scannedUserId)) {
            showNotification?.('You cannot add yourself as a friend', 'warning');
            QRCodeManager.resetScan();
            return;
        }
        
        const existingFriend = FriendCacheManager.getFriend(scannedUserId);
        if (existingFriend) {
            showNotification?.('You are already friends with this user', 'info');
            QRCodeManager.resetScan();
            return;
        }
        
        const existingSent = FriendCacheManager.getAllSentRequests()
            .find(r => r.receiverId === scannedUserId || r.receiverId === String(scannedUserId));
        if (existingSent) {
            showNotification?.('Friend request already sent', 'info');
            QRCodeManager.resetScan();
            return;
        }
        
        showFriendRequestFromQRReal(result.data, result.user || user);
        
        const modal = document.getElementById('cameraScannerModal');
        if (modal) modal.classList.remove('active');
        
        showNotification?.('QR code scanned!', 'success');
    }).catch(error => {
        console.error('[QR] Failed to process QR code:', error);
        _qrScanActive = false;
        setScanningActive(false);
        stopCameraScanner();
        showNotification?.('Error processing QR code', 'error');
        QRCodeManager.resetScan();
    });
}

function showFriendRequestFromQRReal(qrData, userInfo) {
    const user = userInfo || qrData;
    const userId = user.id || user.userId || qrData?.userId;
    
    const avatar = document.getElementById('requestAvatar');
    const name = document.getElementById('requestName');
    const username = document.getElementById('requestUsername');
    const mutual = document.getElementById('mutualCount');
    const accept = document.getElementById('acceptRequestBtn');
    const modal = document.getElementById('friendRequestModal');
    
    if (!modal) {
        console.error('[QR] Friend request modal not found');
        return;
    }
    
    if (avatar) {
        const avatarUrl = user.photoURL || user.avatar;
        if (avatarUrl) {
            avatar.style.backgroundImage = `url('${escapeHtml(avatarUrl)}')`;
            avatar.style.backgroundSize = 'cover';
            avatar.innerHTML = '';
        } else {
            avatar.style.backgroundImage = '';
            const initials = (user.displayName || 'U').charAt(0).toUpperCase();
            avatar.innerHTML = `<span style="color: white; font-size: 24px;">${initials}</span>`;
        }
    }
    
    if (name) name.textContent = user.displayName || 'QR Code User';
    if (username) username.textContent = user.username || '@unknown';
    
    if (mutual) {
        getMutualFriendsCount(userId).then(count => {
            mutual.textContent = count.toString();
        }).catch(() => {
            mutual.textContent = '0';
        });
    }
    
    if (accept) {
        const newAccept = accept.cloneNode(true);
        accept.parentNode.replaceChild(newAccept, accept);
        
        newAccept.dataset.userId = userId;
        newAccept.dataset.userName = user.displayName || user.username || 'User';
        newAccept.dataset.qrData = JSON.stringify(qrData);
        newAccept.textContent = 'Send Friend Request & Save';
        
        newAccept.addEventListener('click', async (e) => {
            const targetUserId = e.target.dataset.userId;
            const userName = e.target.dataset.userName;
            
            e.target.disabled = true;
            e.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            
            const result = await sendFriendRequest(targetUserId, 'friend', `Added via QR code on ${new Date().toLocaleDateString()}`);
            
            if (result && result.success) {
                showNotification?.(`Friend request sent to ${userName}`, 'success');
                
                const modalEl = document.getElementById('friendRequestModal');
                if (modalEl) modalEl.classList.remove('active');
                
                loadSentRequestsFromBackend().catch(() => {});
            } else {
                showNotification?.(result?.error || 'Failed to send friend request', 'error');
                e.target.disabled = false;
                e.target.textContent = 'Send Friend Request & Save';
            }
        });
    }
    
    modal.classList.add('active');
}

async function fetchUserInfoFromQR(userId) {
    if (!SafetyGuards.isSessionValid()) throw new Error('No valid session');
    
    try {
        const response = await authorizedRequest(`/api/friends/user/${userId}`);
        if (response.success && (response.data?.user || response.data)) {
            const user = response.data?.user || response.data;
            if (validateFriendData(user)) return user;
        }
        throw new Error('User not found');
    } catch (error) {
        Logger.error('QR', 'Failed to fetch user', error, { userId });
        throw error;
    }
}

async function getMutualFriendsCount(userId) {
    try {
        const response = await authorizedRequest(`/api/friends/mutual/${userId}`);
        if (response.success && (response.data?.mutualFriends || response.data)) {
            const mutual = response.data?.mutualFriends || response.data || [];
            return mutual.length;
        }
    } catch (error) {
        Logger.warn('QR', 'Failed to get mutual friends count', error);
    }
    return 0;
}

function stopCameraScanner() {
    setScanningActive(false);
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        setCameraStream(null);
    }
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = null;
}

async function toggleCamera() {
    if (!assertActive('toggleCamera')) {
        showNotification?.('Module not active', 'warning');
        return;
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        showNotification?.('Auth not ready', 'warning');
        return;
    }
    
    setCurrentCamera(currentCamera === 'environment' ? 'user' : 'environment');
    await startCameraScanner();
}

function toggleFlash() {
    if (!assertActive('toggleFlash')) {
        showNotification?.('Module not active', 'warning');
        return;
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        showNotification?.('Auth not ready', 'warning');
        return;
    }
    
    if (!cameraStream) return;
    
    const track = cameraStream.getVideoTracks()[0];
    if (!track?.getCapabilities) {
        showNotification?.('Flash not supported', 'warning');
        return;
    }
    
    const caps = track.getCapabilities();
    if (!caps.torch) {
        showNotification?.('Flash not supported on this camera', 'warning');
        return;
    }
    
    setFlashOn(!flashOn);
    track.applyConstraints({ advanced: [{ torch: flashOn }] });
    
    const btn = document.getElementById('toggleFlashBtn');
    if (btn) {
        btn.innerHTML = flashOn ? '<i class="fas fa-lightbulb"></i> Flash On' : '<i class="far fa-lightbulb"></i> Flash Off';
        btn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
    }
    
    showNotification?.(flashOn ? 'Flash on' : 'Flash off', 'info');
}

async function generateUniqueQRCode() {
    if (!assertActive('generateUniqueQRCode')) {
        const container = document.getElementById('qrCodeContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 10px; color: var(--primary-color);"></i>
                    <p>Initializing QR code system...</p>
                    <p style="font-size: 12px; margin-top: 5px;">Module state: ${currentState} | Parent ready: ${parentReadyReceived} | Auth ready: ${authReadyReceived} | Session ready: ${__session.ready}</p>
                </div>
            `;
        }
        return;
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        const container = document.getElementById('qrCodeContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Auth not ready - please wait</p>
                </div>
            `;
        }
        return;
    }
    
    const container = document.getElementById('qrCodeContainer');
    if (!container) return;
    
    const user = __session.user || currentUser || userData || window.currentUser || window.userData;
    
    if (!user) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>Sign in to generate QR code</p>
            </div>
        `;
        return;
    }
    
    let userId = user.id || user.userId || user._id;
    if (userId !== undefined && userId !== null) {
        userId = String(userId);
    }
    
    const username = user.username || user.userName || user.handle || '';
    const displayName = user.displayName || user.name || user.fullName || 'User';
    const email = user.email || user.userEmail || '';
    const photoURL = user.photoURL || user.avatar || user.profilePicture || '';
    
    console.log('[QR] Generating unique QR for user:', { userId, username, displayName, email });
    
    if (!userId) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>Invalid user data - missing ID</p>
                <p style="font-size: 10px; margin-top: 5px;">User data: ${JSON.stringify(user).substring(0, 100)}</p>
            </div>
        `;
        return;
    }
    
    const userForQR = {
        id: userId,
        username: username,
        displayName: displayName,
        email: email,
        photoURL: photoURL,
        generatedAt: Date.now(),
        nonce: Math.random().toString(36).substring(2, 15)
    };
    
    if (typeof QRCode === 'undefined') {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>QR code library not loaded</p>
                <button onclick="location.reload()" style="margin-top: 10px; padding: 5px 15px; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reload Page
                </button>
            </div>
        `;
        return;
    }
    
    try {
        // P1 FIX: generateQRCode is now async (HMAC-SHA256)
        const qrData = await QRCodeManager.generateQRCode(userForQR);

        if (!qrData) {
            throw new Error('Failed to generate QR data');
        }
        
        container.innerHTML = '';
        
        new QRCode(container, {
            text: qrData,
            width: 280,
            height: 280,
            colorDark: '#0084ff',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        // BUG FIX: this info block used to be appended INSIDE #qrCodeContainer — the same
        // fixed 200x200px, overflow:hidden box the QR image itself renders into. With both
        // the QR canvas and this text competing for space in a flex container, the QR image
        // got squeezed and clipped, losing resolution and its quiet-zone border — exactly why
        // it wasn't reliably scannable. Render it as a sibling of the QR box instead, so the
        // QR box only ever contains the QR image at full, unclipped size.
        const displayText = username ? `@${username}` : (displayName !== 'User' ? displayName : `User ${userId.substring(0, 8)}`);
        let infoDiv = document.getElementById('qrCodeInfo');
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.id = 'qrCodeInfo';
            infoDiv.style.cssText = 'text-align: center; margin-top: 15px;';
            container.parentNode?.insertBefore(infoDiv, container.nextSibling);
        }
        infoDiv.innerHTML = `
            <div style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${escapeHtml(displayText)}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Scan to add as friend</div>
            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; opacity: 0.6;">ID: ${userId}</div>
        `;
        
        SafeStorage.setItem(LOCAL_STORAGE_KEYS.UNIQUE_QR_CODE, qrData);
        
        console.log('[QR] Unique QR code generated successfully for user:', userId);
        
    } catch (error) {
        console.error('[QR] Failed to generate QR code:', error);
        
        const fallbackId = username || displayName || userId;
        container.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 10px; color: var(--primary-color);"></i>
                <p style="font-weight: 500; margin-bottom: 5px;">${escapeHtml(displayName || 'User')}</p>
                <p style="font-size: 10px; color: var(--text-secondary); margin-bottom: 10px;">@${escapeHtml(username || userId)}</p>
                <p style="font-size: 10px; color: var(--text-secondary); margin-top: 5px;">Your unique QR code</p>
                <p style="font-size: 9px; color: var(--text-secondary);">ID: ${userId}</p>
                <button onclick="generateUniqueQRCode()" style="margin-top: 15px; padding: 5px 15px; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function validateQRCodeData(qrData) {
    return QRCodeManager.validateQRCode(qrData).valid;
}

async function showMutualFriends(userId, userName) {
    try {
        guardFriendOperation('showMutualFriends');
    } catch (e) {
        return { success: false, error: e.message };
    }
    
    if (!validateFriendId(userId)) {
        showNotification?.('Invalid user ID', 'error');
        return;
    }
    
    try {
        const response = await authorizedRequest(`/api/friends/mutual/${userId}`);
        
        if (response.success && (response.data?.mutualFriends || response.data)) {
            const mutual = response.data?.mutualFriends || response.data || [];
            
            if (mutual.length === 0) {
                showNotification?.(`No mutual friends with ${userName}`, 'info');
                return;
            }
            
            displayMutualFriendsModal(mutual, userName);
        } else {
            showNotification?.('No mutual friends found', 'info');
        }
        
    } catch (error) {
        Logger.error('MutualFriends', 'Failed to load mutual friends', error, { userId });
        showNotification?.('Error loading mutual friends', 'error');
    }
}

function displayMutualFriendsModal(mutualFriends, userName) {
    try {
        const countText = document.getElementById('mutualCountText');
        const listEl = document.getElementById('mutualFriendsList');
        const modal = document.getElementById('mutualFriendsModal');
        
        if (!countText || !listEl || !modal) return;
        
        countText.textContent = `${mutualFriends.length} mutual friends with ${userName}`;
        listEl.innerHTML = '';
        
        if (mutualFriends.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No mutual friends found</p>
                </div>
            `;
        } else {
            mutualFriends.forEach(friend => {
                const initials = friend.displayName
                    ? friend.displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
                    : 'U';
                
                const item = document.createElement('div');
                item.className = 'mutual-friend-item';
                item.innerHTML = `
                    <div class="mutual-friend-avatar" ${friend.photoURL ? `style="background-image: url('${escapeHtml(friend.photoURL)}')"` : ''}>
                        ${friend.photoURL ? '' : `<span>${initials}</span>`}
                    </div>
                    <div class="mutual-friend-info">
                        <div class="mutual-friend-name">${escapeHtml(friend.displayName || 'Unknown')}</div>
                        ${friend.username ? `<div class="mutual-friend-username">${escapeHtml(friend.username)}</div>` : ''}
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    showFriendDetails?.(friend, 'friend');
                    modal.classList.remove('active');
                });
                
                listEl.appendChild(item);
            });
        }
        
        modal.classList.add('active');
        
    } catch (error) {
        Logger.error('MutualFriends', 'Failed to display modal', error);
    }
}

function updateUIWithUserData(userData) {
    try {
        setCurrentUser(userData);
        setUserData(userData);
        updateUserDisplayElements(userData);
        if (userData?.id && featureFlags.qrCode) setTimeout(generateUniqueQRCode, 100);
        window.dispatchEvent(new CustomEvent('userDataLoaded', { detail: { userData, source: dataSource.source } }));
    } catch (error) {
        Logger.error('UI', 'Failed to update UI with user data', error);
    }
}

function updateUserDisplayElements(userData) {}

function updateDataSourceIndicator(source) {
    try {
        const indicator = document.getElementById('dataSourceIndicator');
        if (!indicator) return;
        
        indicator.className = 'data-source-indicator active';
        indicator.classList.add(source);
        
        const text = document.getElementById('dataSourceText');
        if (text) {
            const labels = {
                'parent': 'Data from Parent',
                'unified_auth': 'Data from Auth System',
                'cache': 'Cached Data',
                'direct': 'Data from API',
                'standalone': 'Standalone Mode',
                'guest': 'Guest Mode'
            };
            text.textContent = labels[source] || 'Unknown Source';
        }
        
        setTimeout(() => indicator.classList.remove('active'), 5000);
        
    } catch (error) {}
}

function initializeMainFunctionality() {
    try {
        hideAuthError();
        if (typeof initialize === 'function') {
            initialize();
        }
    } catch (error) {
        Logger.error('Init', 'Failed to initialize main functionality', error);
    }
}

function initializeOriginalFunctionality() {
    try {
        loadCachedDataInstantly();
        setCacheLoaded(true);
        setTimeout(startParallelDataLoading, 1000);
        setTimeout(updateCurrentSection, 500);
    } catch (error) {}
}

function showAuthError(message) {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError(message);
            return;
        }
        
        const overlay = document.getElementById('authErrorOverlay');
        const msgEl = document.getElementById('authErrorMessage');
        
        if (overlay && msgEl) {
            msgEl.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        }
    } catch (error) {}
}

function hideAuthError() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideAuthError();
            return;
        }
        
        const overlay = document.getElementById('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    } catch (error) {}
}

function showReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.showReconnectionState();
        return;
    }
    
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
}

function hideReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.hideReconnectionState();
        return;
    }
    
    const indicator = document.getElementById('reconnectionIndicator');
    if (indicator) indicator.remove();
}

function saveFriendsToLocalStorage() {
    try {
        FriendCacheManager.persist();
        SafeStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        // FIX: Keep legacy 'friends' key in sync so no code ever reads stale data
        try {
            const allFriends = FriendCacheManager.getAllFriends();
            if (allFriends.length > 0) localStorage.setItem('friends', JSON.stringify(allFriends));
        } catch (_) {}
        return true;
    } catch (error) {
        Logger.error('Persistence', 'Failed to save to localStorage', error);
        return false;
    }
}

function startParallelDataLoading() {
    if (backgroundTasksStarted) return;
    
    if (!assertActive('backgroundDataLoading')) {
        Logger.debug('Data', 'Blocked data loading - module not active');
        return;
    }
    
    if (!authReadyReceived || !__session.ready || !__session.token) {
        Logger.debug('Data', 'Blocked data loading - auth not ready');
        return;
    }
    
    // FIX Bug#6b: If offline, skip all API loaders and just hydrate from local cache.
    if (!navigator.onLine) {
        Logger.info('Data', 'Offline — skipping API loaders, hydrating from local cache');
        setBackgroundTasksStarted(true);
        loadCachedDataInstantly();
        OfflineFirstFriends._hydrateFromLocalStore().catch(() => {});

        // FIX: hydrate discovery users from IndexedDB so the Discover tab is
        // never blank when the app opens offline.
        (async () => {
            try {
                const ls = window.KynectaFriendsLocalStore;
                if (!ls) return;
                const idbUsers = await ls.getAllUsers().catch(() => []);
                if (!idbUsers.length) {
                    // Last resort: localStorage
                    const raw = JSON.parse(localStorage.getItem('discover_users') || '[]');
                    if (raw.length) {
                        window._allUsersCache = raw;
                        if (window.FriendCore) window.FriendCore._allUsers = raw;
                        window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                            detail: { users: raw, count: raw.length, cached: true, offline: true }
                        }));
                    }
                    return;
                }
                window._allUsersCache = idbUsers;
                if (window.FriendCore) {
                    window.FriendCore._allUsers         = idbUsers;
                    window.FriendCore.discoverableUsers = idbUsers;
                    window.FriendCore._allUsersCache    = idbUsers;
                }
                if (window.FriendCacheManager?.setUsers) window.FriendCacheManager.setUsers(idbUsers);
                window.dispatchEvent(new CustomEvent('allUsersLoaded', {
                    detail: { users: idbUsers, count: idbUsers.length, cached: true, offline: true }
                }));
            } catch (_) {}
        })();

        return;
    }
    
    setBackgroundTasksStarted(true);
    
    // PRODUCTION FIX: Do NOT call KnectaAuth.showLoading(true) — it shows a
    // full-screen blocking spinner overlay. Data loads silently in background.

    const loaders = [
        loadFriendsFromBackend(),
        loadFriendRequestsFromBackend(),
        loadSentRequestsFromBackend(),
        loadPinnedFriendsFromBackend(),
        loadMutedFriendsFromBackend(),
        loadContactsFromBackend(),
        loadGroupsFromBackend(),
        fetchAllUsersFromBackend()
    ];
    
    Promise.allSettled(loaders).then(() => {
        updateCurrentSection?.();
        showNotification?.('Friends data loaded', 'success');
        // PRODUCTION FIX: No showLoading(false) needed since we removed showLoading(true)
    });
}

function initializeParentChildCommunication() {
    try {
        setupSessionEventListeners();
        loadCachedDataInstantly();
    } catch (error) {
        Logger.error('ParentChild', 'Failed to initialize communication', error);
    }
}

function setupSessionEventListeners() {
    try {
        window.addEventListener('parentSessionReady', handleParentSessionReady);
        window.addEventListener('parentSessionUpdated', handleParentSessionUpdate);
        window.addEventListener('parentSessionLogout', handleParentLogout);
        window.addEventListener('parentProfileUpdated', handleParentProfileUpdate);
        window.addEventListener('knectaAuthReady', handleUnifiedAuthReady);
        window.addEventListener('knectaCacheReady', handleUnifiedCacheReady);
        
        window.addEventListener('kynSessionTimeout', () => {
            showAuthError('Session request timed out. Please refresh the page.');
        });
        
        window.addEventListener('kynSessionFailed', (event) => {
            showAuthError(event.detail?.reason || 'Failed to establish session');
        });
    } catch (error) {}
}

function handleParentSessionReady(event) {
    try {
        dataSource.parentSessionReceived = true;
        dataSource.fetched = true;
        dataSource.fallbackMode = false;
        
        const session = event.detail.session;
        
        dataSource.source = 'parent';
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        __session.token = session.token;
        __session.user = session.user;
        __session.expiresAt = session.expiresAt || null;
        __session.ready = true;
        
        setCurrentUser(session.user);
        setUserData(session.user);
        
        SessionManager.handleSessionSync({ payload: { session } });
        
        updateUIWithUserData(session.user);
        updateDataSourceIndicator('parent');
        
        initializeMainFunctionality();
    } catch (error) {}
}

function handleParentSessionUpdate(event) {
    try {
        const session = event.detail.session;
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        __session.token = session.token;
        __session.user = session.user;
        __session.expiresAt = session.expiresAt || null;
        __session.ready = true;
        
        setCurrentUser(session.user);
        setUserData(session.user);
        SessionManager.handleSessionSync({ payload: { session } });
        updateUIWithUserData(session.user);
    } catch (error) {}
}

function handleParentLogout(event) {
    try {
        dataSource.userData = null;
        dataSource.token = null;
        dataSource.fetched = false;
        dataSource.parentSessionReceived = false;
        
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        __session.ready = false;
        
        setCurrentUser(null);
        setUserData(null);
        
        FriendCacheManager.clear();
        FriendCacheManager.syncToGlobals();
        
        SessionManager.handleSessionInvalidated();
        updateCurrentSection?.();
        showAuthError('You have been logged out. Please log in again.');
        transitionTo(LIFECYCLE_STATES.WAIT_PARENT, 'parent logout');
    } catch (error) {}
}

function handleParentProfileUpdate(event) {
    try {
        const user = event.detail.user;
        dataSource.userData = user;
        
        if (__session.user) {
            __session.user = { ...__session.user, ...user };
        }
        
        setCurrentUser(user);
        setUserData(user);
        updateUIWithUserData(user);
        showNotification?.('Profile updated', 'success');
    } catch (error) {}
}

function handleUnifiedAuthReady(event) {
    try {
        if (!dataSource.parentSessionReceived) {
            const detail = event.detail;
            dataSource.source = 'unified_auth';
            dataSource.userData = detail.user;
            dataSource.token = detail.token;
            dataSource.fetched = true;
            
            __session.token = detail.token;
            __session.user = detail.user;
            __session.ready = true;
            
            setCurrentUser(detail.user);
            setUserData(detail.user);
            SessionManager.handleSessionSync({ payload: { session: { token: detail.token, user: detail.user } } });
            updateUIWithUserData(detail.user);
            updateDataSourceIndicator('unified_auth');
            initializeMainFunctionality();
            showNotification?.('Using authentication system. Parent coordination not available.', 'warning');
        }
    } catch (error) {}
}

function handleUnifiedCacheReady(event) {
    try {
        if (!dataSource.fetched) {
            const detail = event.detail;
            if (detail.user) {
                dataSource.source = 'cache';
                dataSource.userData = detail.user;
                dataSource.token = detail.token;
                dataSource.fetched = true;
                
                if (detail.token) {
                    __session.token = detail.token;
                    __session.user = detail.user;
                    __session.ready = true;
                }
                
                setCurrentUser(detail.user);
                setUserData(detail.user);
                updateUIWithUserData(detail.user);
                updateDataSourceIndicator('cache');
                initializeMainFunctionality();
                showNotification?.('Using cached data. Sign in for live updates.', 'warning');
            }
        }
    } catch (error) {}
}

async function initialize() {
    if (initializationLock) {
        Logger.warn('Init', 'Initialization already in progress');
        return isInitialized;
    }
    if (isInitialized) {
        Logger.info('Init', 'Already initialized');
        return true;
    }
    
    setInitializationLock(true);
    setInitializationStarted(true);
    
    Logger.info('Init', 'Starting friend module initialization');
    StatusManager.show('INIT', 'Friend module initializing');
    
    try {
        transitionTo(LIFECYCLE_STATES.INITIALIZING, 'start');
        
        SafeStorage.init();
        IframeEnvironment.detect();
        
        const frameId = ParentCommunicationManager.getFrameId();
        ParentCommunicationManager.init(frameId);
        
        transitionTo(LIFECYCLE_STATES.WAITING_AUTH, 'waiting_for_auth');
        StatusManager.show('AUTH_WAIT', 'Waiting for authentication from parent');
        
        MessageDispatcher.init();
        UIBridge.init();
        
        loadCachedDataInstantly();
        
        window.addEventListener('loadInitialData', () => {
            // FIX Bug#6: Explicit offline branch — show cached data immediately
            // and skip any API loaders (they will fail and leave the list blank).
            if (!navigator.onLine) {
                Logger.info('Init', 'loadInitialData fired while offline — using local cache');
                loadCachedDataInstantly();
                OfflineFirstFriends._hydrateFromLocalStore().catch(() => {});
                return;
            }
            
            if (authReadyReceived && __session.ready) {
                startParallelDataLoading();
                
                setTimeout(() => {
                    console.log('[Init] Loading all users for discovery...');
                    fetchAllUsersFromBackend().then(result => {
                        console.log(`[Init] All users loaded: ${result.count} discoverable users`);
                        if (result.users && result.users.length > 0) {
                            window.allUsersList = result.users;
                            if (window.FriendCore) {
                                window.FriendCore._allUsers = result.users;
                                window.FriendCore.discoverableUsers = result.users;
                            }
                            
                            window.dispatchEvent(new CustomEvent('allUsersReady', {
                                detail: { users: result.users, count: result.users.length }
                            }));
                            
                            if (window.currentSection === 'discovery' || window.location.hash === '#discovery') {
                                renderAllUsersList();
                            }
                        }
                    }).catch(error => {
                        console.error('[Init] Failed to load all users:', error);
                    });
                }, 500);
            } else {
                queueRequest(() => {
                    startParallelDataLoading();
                    queueRequest(() => fetchAllUsersFromBackend());
                });
            }
        });
        
        window.addEventListener('parentReady', () => {
            if (currentState === LIFECYCLE_STATES.ACTIVE && authReadyReceived) {
                SessionManager.requestSession();
            }
        });
        
        setIsInitialized(true);
        
        Logger.info('Init', 'Friend module initialized, waiting for auth');
        
        window.dispatchEvent(new CustomEvent('friendModuleReady', {
            detail: {
                module: MODULE_NAME,
                version: MODULE_VERSION,
                state: currentState,
                authReady: authReadyReceived,
                parentReady: parentReadyReceived,
                sessionReady: __session.ready,
                timestamp: Date.now()
            }
        }));
        
        window.dispatchEvent(new CustomEvent('lifecycleChanged', {
            detail: { toState: currentState }
        }));
        
    } catch (error) {
        Logger.error('Init', 'Initialization failed', error);
        transitionTo(LIFECYCLE_STATES.ERROR, 'init_failed');
        StatusManager.show('ERROR', 'Initialization failed');
        setIsInitialized(false);
    } finally {
        setInitializationLock(false);
    }
    
    return isInitialized;
}

let apiCoreSynced = false;

async function syncWithApiCore() {
    if (apiCoreSynced) return true;
    
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;
        
        const check = () => {
            attempts++;
            
            const isReady = 
                (window.__API_CORE__ && typeof window.__API_CORE__.isReady === 'function' && window.__API_CORE__.isReady()) ||
                (window.knectaAPI && typeof window.knectaAPI.request === 'function') ||
                (typeof secureFetch === 'function' && typeof getValidToken === 'function');
            
            if (isReady) {
                apiCoreSynced = true;
                resolve(true);
                return;
            }
            
            if (attempts >= maxAttempts) {
                Logger.once('api-core-sync-timeout', 'API Core timeout - continuing');
                apiCoreSynced = true;
                resolve(false);
                return;
            }
            
            setTimeout(check, 100);
        };
        
        check();
    });
}

function updateCurrentSection() {
    window.dispatchEvent(new CustomEvent('updateCurrentSection'));
}

function updateFriendCounts() {
    window.dispatchEvent(new CustomEvent('updateFriendCounts'));
}

function showFriendDetails(friend, type) {
    window.dispatchEvent(new CustomEvent('showFriendDetails', { detail: { friend, type } }));
}

function renderFriendsListInstantly() {
    window.dispatchEvent(new CustomEvent('renderFriendsListInstantly'));
}

function addFriendItem(friendData, container, type) {
    window.dispatchEvent(new CustomEvent('ui:addFriendItem', { detail: { friendData, container, type } }));
}

function addFriendItemInstant(friendData, container, type) {
    window.dispatchEvent(new CustomEvent('ui:addFriendItemInstant', { detail: { friendData, container, type } }));
}

function renderContacts() { window.dispatchEvent(new CustomEvent('renderContacts')); }

function renderFriends() { window.dispatchEvent(new CustomEvent('renderFriends')); }

function renderFriendRequests() { window.dispatchEvent(new CustomEvent('renderFriendRequests')); }

function renderSentRequests() { window.dispatchEvent(new CustomEvent('renderSentRequests')); }

function addFriendRequestItem(requestData, container, type) {
    window.dispatchEvent(new CustomEvent('ui:addFriendRequestItem', { detail: { requestData, container, type } }));
}

function handleFriendAction(action, friendData, type, button) {
    window.dispatchEvent(new CustomEvent('ui:handleFriendAction', { detail: { action, friendData, type, button } }));
}

function handleRequestAction(action, requestData, button) {
    window.dispatchEvent(new CustomEvent('ui:handleRequestAction', { detail: { action, requestData, button } }));
}

function filterFriendsByCategory(category) {
    setCurrentCategoryFilter(category);
    window.dispatchEvent(new CustomEvent('filterFriendsByCategory', { detail: { category } }));
}

function searchFriendsLegacy(searchTerm) {
    setCurrentSearchTerm(searchTerm?.toLowerCase().trim() || '');
    window.dispatchEvent(new CustomEvent('searchFriends', { detail: { searchTerm } }));
}

function renderAllUsersList() {
    const discoverableUsers = getDiscoverableUsers();
    
    console.log(`[renderAllUsersList] Rendering ${discoverableUsers.length} discoverable users`);
    
    if (discoverableUsers.length === 0) {
        console.warn('[renderAllUsersList] No discoverable users found');
        
        if (authReadyReceived && __session.ready && (!window._allUsersCache || window._allUsersCache.length === 0)) {
            console.log('[renderAllUsersList] No users in cache, fetching from backend...');
            fetchAllUsersFromBackend().then(result => {
                if (result.success && result.users && result.users.length > 0) {
                    console.log(`[renderAllUsersList] Loaded ${result.users.length} users, re-rendering`);
                    const freshUsers = getDiscoverableUsers();
                    window.dispatchEvent(new CustomEvent('renderAllUsersList', {
                        detail: { users: freshUsers, count: freshUsers.length }
                    }));
                } else {
                    window.dispatchEvent(new CustomEvent('renderAllUsersList', {
                        detail: { users: [], count: 0, error: 'No users found' }
                    }));
                }
            });
            return;
        }
        
        window.dispatchEvent(new CustomEvent('renderAllUsersList', {
            detail: { users: [], count: 0, message: 'No users to discover' }
        }));
        return;
    }
    
    window.dispatchEvent(new CustomEvent('renderAllUsersList', {
        detail: { users: discoverableUsers, count: discoverableUsers.length, timestamp: Date.now() }
    }));
}

function loadFriendDetails(friendData, type) {
    window.dispatchEvent(new CustomEvent('loadFriendDetails', { detail: { friendData, type } }));
}

function showFriendRequestProfile(requestData) {
    window.dispatchEvent(new CustomEvent('showFriendRequestProfile', { detail: { requestData } }));
}

function showFriendOptions(friendData) {
    window.dispatchEvent(new CustomEvent('showFriendOptions', { detail: { friendData } }));
}

function viewChatHistory(friendData) {
    navigateToChat?.(friendData.id, friendData.displayName || 'User');
}

function viewCallHistory(friendData) {
    navigateToCall?.(friendData.id, friendData.displayName || 'User');
}

function showChangeCategoryModal(friendData) {
    window.dispatchEvent(new CustomEvent('showChangeCategoryModal', { detail: { friendData } }));
}

function renderTemporaryFriends() {
    window.dispatchEvent(new CustomEvent('renderTemporaryFriends'));
}

function renderPinnedFriends() {
    window.dispatchEvent(new CustomEvent('renderPinnedFriends'));
}

function renderMutedFriends() {
    window.dispatchEvent(new CustomEvent('renderMutedFriends'));
}

function showStartChatModal() {
    window.dispatchEvent(new CustomEvent('showStartChatModal'));
}

function setupEventListeners() {}

function showNotification(message, type = 'success', duration = 3000) {
    if (typeof importedShowNotification === 'function') return importedShowNotification(message, type, duration);
    console.log(`[Notification] ${type.toUpperCase()}: ${message}`);
    return null;
}

function navigateToChat(userId, userName) {
    if (typeof importedNavigateToChat === 'function') return importedNavigateToChat(userId, userName);
    Logger.warn('Navigation', 'navigateToChat not available', { userId, userName });
    return null;
}

function navigateToCall(userId, userName) {
    if (typeof importedNavigateToCall === 'function') return importedNavigateToCall(userId, userName);
    Logger.warn('Navigation', 'navigateToCall not available', { userId, userName });
    return null;
}

function simulateContactSync() {
    if (typeof importedSimulateContactSync === 'function') return importedSimulateContactSync();
    Logger.warn('Contacts', 'simulateContactSync not available');
    return Promise.resolve({ success: false, error: 'Not available' });
}

function escapeHtml(text) {
    if (typeof importedEscapeHtml === 'function') return importedEscapeHtml(text);
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatTimeAgo(date) {
    if (typeof importedFormatTimeAgo === 'function') return importedFormatTimeAgo(date);
    if (!date) return '';
    try {
        const now = new Date();
        const then = new Date(date);
        const diff = Math.floor((now - then) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return `${Math.floor(diff / 604800)}w ago`;
    } catch (e) {
        return String(date);
    }
}

function formatDate(date) {
    try {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return String(date);
    }
}

function getTrustScoreClass(score) {
    if (typeof importedGetTrustScoreClass === 'function') return importedGetTrustScoreClass(score);
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
}

window.addEventListener('requestFriendList', (event) => {
    const { source, callback } = event.detail || {};
    
    if (source === 'message') {
        const friendsList = getFriendsForMessaging();
        window.dispatchEvent(new CustomEvent('friendListResponse', {
            detail: { friends: friendsList, source: 'message' }
        }));
    } else if (source === 'call') {
        const friendsList = getFriendsForCalling();
        window.dispatchEvent(new CustomEvent('friendListResponse', {
            detail: { friends: friendsList, source: 'call' }
        }));
    } else if (source === 'group') {
        const friendsList = getFriendsForGroup();
        window.dispatchEvent(new CustomEvent('friendListResponse', {
            detail: { friends: friendsList, source: 'group' }
        }));
    }
});

window.addEventListener('selectFriendForAction', (event) => {
    const { friendId, action, callbackId } = event.detail || {};
    
    if (!friendId) return;
    
    const result = handleFriendSelection(friendId);
    
    if (callbackId) {
        window.dispatchEvent(new CustomEvent('friendSelectionResult', {
            detail: { callbackId, result, friend: result.friend }
        }));
    }
});

window.addEventListener('offline', () => {
    Logger.debug('V6', 'Network offline');
    // FIX Bug#6: When we go offline, immediately re-hydrate the UI from
    // local caches so the list stays visible instead of going blank.
    try {
        const cached = FriendCacheManager.getAllFriends();
        if (cached.length > 0) {
            FriendCacheManager.syncToGlobals();
            updateFriendCounts?.();
            window.dispatchEvent(new CustomEvent('friendsUpdated', {
                detail: { friends: cached, count: cached.length, cached: true, offline: true }
            }));
        } else {
            // Try IndexedDB hydration as deeper fallback
            OfflineFirstFriends._hydrateFromLocalStore().catch(() => {});
        }
    } catch (_) {}
});

window.addEventListener('online', () => {
    Logger.debug('V6', 'Network online');
    // FIX: When connection restores, re-run parallel data loading so friends
    // list refreshes from the server and queued mutations get flushed.
    try {
        setBackgroundTasksStarted(false); // allow re-run
        if (currentState === LIFECYCLE_STATES.ACTIVE && authReadyReceived && __session.ready) {
            Logger.info('V6', 'Reconnected — resuming data loading');
            startParallelDataLoading();
        }
        // Flush any queued offline mutations
        if (window.AppOfflineQueue?.flush) window.AppOfflineQueue.flush().catch(() => {});
        if (window.FriendQueueManager?.flush) window.FriendQueueManager.flush().catch(() => {});
    } catch (_) {}
});

window.addEventListener('beforeunload', () => {
    saveFriendsToLocalStorage();
    stopCameraScanner();
    if (backgroundSyncInterval) clearInterval(backgroundSyncInterval);
    ParentCommunicationManager.destroy();
    ResourceManager.release();
    MessageBus.destroy();
    APIGateway.clearPending();
    clearFriendsLoading();
    MessageTracker.reset();
    FriendCacheManager.persist();
    FriendSearchEngine.clearCache();
    PollingManager.stopPollingIncomingRequests();
    PollingManager.stopPollingSentRequests(); // FIX: stop sent polling on cleanup
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();
    
    ParentCoordinator.init().catch(() => {});
    
    initialize().catch(error => {
        Logger.error('Init', 'Failed to initialize friend core', error);
        showAuthError('Failed to connect to parent. Please refresh the page.');
        setApiReady(false);
        setIsInitialized(false);
        window.dispatchEvent(new CustomEvent('friendCoreReady', { 
            detail: { error: true, message: error.message, timestamp: Date.now(), state: currentState, authReady: authReadyReceived, parentReady: parentReadyReceived, sessionReady: __session.ready, v6: V6.getState() } 
        }));
    });
});

const HandshakeClient = null;

const RecoveryManagerV6 = null;

const StartupGovernor = null;

const searchFriends = async (query, options) => {
    const results = await FriendSearchEngine.search(query, options);
    window.dispatchEvent(new CustomEvent('friendSearchResults', {
        detail: { query, results }
    }));
    return results;
};

const searchFriendsByLetter = async (letter, options) => {
    const results = await FriendSearchEngine.searchByLetter(letter, options);
    window.dispatchEvent(new CustomEvent('friendSearchResults', {
        detail: { query: letter, results, byLetter: true }
    }));
    return results;
};

const addFriendToGroup = GroupParticipationManager.addFriendToGroup.bind(GroupParticipationManager);

const removeFriendFromGroup = GroupParticipationManager.removeFriendFromGroup.bind(GroupParticipationManager);

const getGroupMembers = GroupParticipationManager.getGroupMembers.bind(GroupParticipationManager);

const HeartbeatClient = null;

const ReliabilityLayer = null;

const IframeSessionClient = null;

const IframeTransport = null;

const TransportAgent = null;

const KYN = {
    ParentCommunicationManager,
    SessionManager,
    SecurityManager,
    CompatibilityBridge,
    DiagnosticsAgent,
    SecurityValidator,
    IframeEnvironment,
    state: kynState,
    APIGateway,
    LifecycleStateMachine,
    TokenPromise,
    ModuleRegistrationManager,
    FriendCacheManager,
    FriendRequestManager,
    FriendSearchEngine,
    QRCodeManager,
    GroupParticipationManager,
    V6,
    HeartbeatClient,
    ReliabilityLayer,
    IframeSessionClient,
    IframeTransport,
    TransportAgent
};

const friendCore = {
    version: '13.2',
    initialized: false,
    fallbackMode: false,
    init: initialize,
    kyn: KYN,
    diagnostics: DiagnosticsAgent,
    secureAPI: APIGateway,
    authorizedRequest,
    stateMachine: LifecycleStateMachine,
    v6: V6,
    handleFriendSelection,
    getFriendsForMessaging,
    getFriendsForCalling,
    getFriendsForGroup,
    validateQRCodeData,
    searchFriends,
    searchFriendsByLetter,
    addFriendToGroup,
    removeFriendFromGroup,
    getGroupMembers,
    isAuthReady: () => authReadyReceived,
    isParentReady: () => parentReadyReceived,
    isSessionReady: () => __session.ready,
    getState: () => currentState,
    isActive: () => currentState === LIFECYCLE_STATES.ACTIVE && parentReadyReceived && authReadyReceived && __session.ready,
    getSession: () => ({ token: __session.token, user: __session.user, ready: __session.ready }),
    getAllUsers: () => window._allUsersCache || FriendCacheManager.getAllUsers(),
    fetchAllUsers: fetchAllUsersFromBackend,
    startPolling: PollingManager.startPollingIncomingRequests.bind(PollingManager),
    stopPolling: PollingManager.stopPollingIncomingRequests.bind(PollingManager),
    isPolling: PollingManager.isPolling.bind(PollingManager)
};

window.FriendCore = friendCore;

window._allUsersCache = window._allUsersCache || [];

window.friendCore = friendCore;

const NearbyManager = {
    _searching:  false,
    _watchId:    null,
    _coords:     null,
    _onResult:   null,
    _onStatus:   null,
    _pollTimer:  null,

    start(onResult, onStatus) {
        if (this._searching) return;
        this._onResult = onResult || (() => {});
        this._onStatus = onStatus || (() => {});
        this._searching = true;
        this._onStatus('Requesting location...');

        if (!navigator.geolocation) {
            this._onStatus('Location not supported — showing online users');
            this._fetchNearby();
            return;
        }

        // Fire getCurrentPosition FIRST for an instant first result (watchPosition can take 5–30s)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                this._coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                this._onStatus('Searching nearby...');
                this._pushPresence();
                this._fetchNearby();
            },
            () => {
                this._onStatus('Location denied — showing online users');
                this._fetchNearby();
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
        );

        // Also watch for ongoing movement updates
        this._watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const prev = this._coords;
                this._coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                const moved = !prev ||
                    Math.abs(prev.lat - this._coords.lat) > 0.0005 ||
                    Math.abs(prev.lng - this._coords.lng) > 0.0005;
                if (moved) { this._pushPresence(); this._fetchNearby(); }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        );

        // Periodic refresh every 15s
        this._pollTimer = setInterval(() => { if (this._searching) this._fetchNearby(); }, 15000);
    },

    stop() {
        this._searching = false;
        if (this._watchId !== null) { navigator.geolocation.clearWatch(this._watchId); this._watchId = null; }
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        this._coords = null; this._onResult = null; this._onStatus = null;
    },

    async _pushPresence() {
        if (!this._coords || !__session.token) return;
        try {
            await authorizedRequest('/api/friends/nearby/presence', {
                method: 'POST',
                body: JSON.stringify({ lat: this._coords.lat, lng: this._coords.lng, status: 'online' })
            });
        } catch (_) {}
    },

    async _fetchNearby() {
        if (!this._searching) return;
        try {
            let url = '/api/friends/nearby';
            if (this._coords) url += `?lat=${this._coords.lat}&lng=${this._coords.lng}&radius=5000`;
            const response = await authorizedRequest(url);
            if (response.success && this._onResult) {
                const users = response.data?.users || [];
                users.forEach(u => { u.photoURL = u.photoURL || u.avatar || ''; });
                if (users.length > 0 || response.data?.mode) {
                    this._onResult(users, response.data?.mode || 'geo');
                    return;
                }
            }
            const fallback = (window._allUsersCache || []).filter(u => u.online === true || u.status === 'online');
            if (this._onResult) this._onResult(fallback, 'fallback');
        } catch (err) {
            Logger.error('NearbyManager', 'Failed to fetch nearby users', err);
            const fallback = (window._allUsersCache || []).filter(u => u.online === true || u.status === 'online');
            if (this._onResult) this._onResult(fallback, 'fallback');
        }
    }
};

async function snoozeFriend(friendId, days = 7) {
    if (!validateFriendId(friendId)) return { success: false, error: 'Invalid friend ID' };
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/${friendId}/snooze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
            body: JSON.stringify({ days })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            // Mark friend as snoozed in local state
            if (window.friends) {
                const f = window.friends.find(f => f.id == friendId);
                if (f) { f.snoozedUntil = data.data?.snoozedUntil; f.snoozed = true; }
            }
            showNotification?.(`Friend snoozed for ${days} day${days > 1 ? 's' : ''}`, 'success');
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { action: 'snooze', friendId } }));
        } else {
            showNotification?.(data.message || 'Failed to snooze friend', 'error');
        }
        return data;
    } catch (e) {
        Logger.error('Snooze', 'snoozeFriend failed', e);
        return { success: false, error: e.message };
    }
}

async function unsnoozeFriend(friendId) {
    if (!validateFriendId(friendId)) return { success: false, error: 'Invalid friend ID' };
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/${friendId}/snooze`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${_token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            if (window.friends) {
                const f = window.friends.find(f => f.id == friendId);
                if (f) { f.snoozedUntil = null; f.snoozed = false; }
            }
            showNotification?.('Friend unsnoozed', 'success');
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { action: 'unsnooze', friendId } }));
        }
        return data;
    } catch (e) {
        Logger.error('Snooze', 'unsnoozeFriend failed', e);
        return { success: false, error: e.message };
    }
}

async function restrictFriend(friendId) {
    if (!validateFriendId(friendId)) return { success: false, error: 'Invalid friend ID' };
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/${friendId}/restrict`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${_token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            if (window.friends) {
                const f = window.friends.find(f => f.id == friendId);
                if (f) f.isRestricted = true;
            }
            showNotification?.('Friend restricted', 'success');
        } else {
            showNotification?.(data.message || 'Failed to restrict friend', 'error');
        }
        return data;
    } catch (e) {
        Logger.error('Restrict', 'restrictFriend failed', e);
        return { success: false, error: e.message };
    }
}

async function unrestrictFriend(friendId) {
    if (!validateFriendId(friendId)) return { success: false, error: 'Invalid friend ID' };
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/${friendId}/restrict`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${_token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            if (window.friends) {
                const f = window.friends.find(f => f.id == friendId);
                if (f) f.isRestricted = false;
            }
            showNotification?.('Friend unrestricted', 'success');
        }
        return data;
    } catch (e) {
        Logger.error('Restrict', 'unrestrictFriend failed', e);
        return { success: false, error: e.message };
    }
}

async function reportFriend(friendId, reason, description = '') {
    if (!validateFriendId(friendId)) return { success: false, error: 'Invalid friend ID' };
    if (!reason) return { success: false, error: 'Reason required' };
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/${friendId}/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
            body: JSON.stringify({ reason, description })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            showNotification?.('Report submitted. Thank you.', 'success');
        } else {
            showNotification?.(data.message || 'Failed to submit report', 'error');
        }
        return data;
    } catch (e) {
        Logger.error('Report', 'reportFriend failed', e);
        return { success: false, error: e.message };
    }
}

async function importPhoneContacts() {
    try {
        if (!('contacts' in navigator && 'ContactsManager' in window)) {
            showNotification?.('Phone contact import not supported on this device/browser', 'warning');
            return { success: false, error: 'ContactsManager not supported' };
        }

        const contacts = await navigator.contacts.select(['tel'], { multiple: true });
        if (!contacts || contacts.length === 0) {
            return { success: true, data: { matches: [] } };
        }

        // Normalize + SHA-256 hash each phone number — never send raw numbers
        const enc = new TextEncoder();
        const phoneHashes = [];
        for (const contact of contacts) {
            for (const tel of (contact.tel || [])) {
                const normalized = tel.replace(/\D/g, '');
                if (normalized.length < 7) continue;
                const hashBuf = await window.crypto.subtle.digest('SHA-256', enc.encode(normalized));
                const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                phoneHashes.push(hashHex);
            }
        }

        if (phoneHashes.length === 0) return { success: true, data: { matches: [] } };

        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';

        const res = await fetch(`${_apiBase}/friends/contacts/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
            body: JSON.stringify({ phoneHashes })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success && data.data?.matches?.length > 0) {
            showNotification?.(`Found ${data.data.matches.length} contact${data.data.matches.length > 1 ? 's' : ''} on MoodChat`, 'success');
            window.dispatchEvent(new CustomEvent('contactMatchesFound', { detail: data.data }));
        } else {
            showNotification?.('No contacts found on MoodChat', 'info');
        }
        return data;
    } catch (e) {
        Logger.error('PhoneContacts', 'importPhoneContacts failed', e);
        showNotification?.('Could not import contacts', 'error');
        return { success: false, error: e.message };
    }
}

async function getFriendPrivacySettings() {
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/privacy`, {
            headers: { 'Authorization': `Bearer ${_token}` }
        });
        const data = await res.json().catch(() => ({}));
        return data?.success ? data.data : { whoCanSendFriendRequests: 'everyone', whoCanSeeMyFriends: 'everyone', anniversaryNotifications: true };
    } catch (e) {
        Logger.error('Privacy', 'getFriendPrivacySettings failed', e);
        return { whoCanSendFriendRequests: 'everyone', whoCanSeeMyFriends: 'everyone', anniversaryNotifications: true };
    }
}

async function updateFriendPrivacySettings(settings = {}) {
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/privacy`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
            body: JSON.stringify(settings)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) showNotification?.('Privacy settings saved', 'success');
        else showNotification?.(data.message || 'Failed to save settings', 'error');
        return data;
    } catch (e) {
        Logger.error('Privacy', 'updateFriendPrivacySettings failed', e);
        return { success: false, error: e.message };
    }
}

async function exportFriendsCSV() {
    try {
        const _apiBase = window.__getApiBase ? window.__getApiBase() : 'https://moodchat-fy56.onrender.com/api';
        const _token = (typeof __session !== 'undefined' && __session?.token)
            || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        const res = await fetch(`${_apiBase}/friends/export/csv`, {
            headers: { 'Authorization': `Bearer ${_token}` }
        });
        if (!res.ok) { showNotification?.('Export failed', 'error'); return { success: false }; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `friends-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification?.('Friends exported', 'success');
        return { success: true };
    } catch (e) {
        Logger.error('Export', 'exportFriendsCSV failed', e);
        showNotification?.('Export failed', 'error');
        return { success: false, error: e.message };
    }
}

export {
    // Core State
    currentUser,
    userData,
    friends,
    contacts,
    friendRequests,
    sentRequests,
    temporaryFriends,
    pinnedFriends,
    mutedFriends,
    selectedFriend,
    currentCategoryFilter,
    currentSearchTerm,
    isMobile,
    mutualFriendsCache,
    groups,
    allUsers,
    cameraStream,
    currentCamera,
    flashOn,
    apiReady,
    scanningActive,
    isInitialized,
    initializationStarted,
    backgroundSyncInterval,
    isAuthReady,
    backgroundTasksStarted,
    cacheLoaded,
    friendCategories,
    LOCAL_STORAGE_KEYS,
    dataSource,
    featureFlags,

    // KYN Protocol State
    kynState,
    DiagnosticsAgent,
    IframeEnvironment,
    CompatibilityBridge,
    MessageBus,
    NavigationGuard,
    UIFailsafe,
    SandboxDetector,
    SafeStorage,
    HeartbeatClient,
    ReliabilityLayer,
    IframeSessionClient,
    IframeTransport,
    TransportAgent,

    // Core Systems
    ParentCoordinator,
    KnectaAuth,
    Logger,
    ResourceManager,
    SecurityManager,
    ErrorHandler,
    SafetyGuards,

    // Initialization
    initialize,
    initializeParentChildCommunication,
    loadCachedDataInstantly,
    startParallelDataLoading,
    updateUIWithUserData,
    updateDataSourceIndicator,
    initializeMainFunctionality,
    showAuthError,
    hideAuthError,
    showReconnectionState,
    hideReconnectionState,

    // API Functions
    getValidToken,
    getCurrentUser,
    authorizedRequest,

    // Friend Request Management
    sendFriendRequest,
    acceptFriendRequestOnline,
    declineFriendRequest,
    cancelFriendRequest,

    // Data Loading
    loadFriendsFromBackend,
    loadFriendRequestsFromBackend,
    loadFriendSuggestions,
    loadSentRequestsFromBackend,
    loadPinnedFriendsFromBackend,
    loadMutedFriendsFromBackend,
    loadContactsFromBackend,
    loadGroupsFromBackend,
    fetchAllUsersFromBackend,
    saveFriendsToLocalStorage,

    // Friend Management
    togglePinFriend,
    toggleMuteFriend,
    savePrivateNote,
    getLastInteraction,
    removeFriend,
    blockUser,

    // QR & Camera
    startCameraScanner,
    stopCameraScanner,
    toggleCamera,
    toggleFlash,
    generateUniqueQRCode,
    validateQRCodeData,

    // Mutual Friends
    showMutualFriends,

    // Navigation & UI
    showNotification,
    navigateToChat,
    navigateToCall,
    simulateContactSync,

    // Utilities
    escapeHtml,
    formatTimeAgo,
    formatDate,
    getTrustScoreClass,
    checkMobile,

    // V6 State
    V6,

    // Lifecycle
    LifecycleStateMachine,
    LIFECYCLE_STATES,
    __session,
    parentReadyReceived,
    authReadyReceived,
    childReadySent,
    assertActive,
    onModuleActive,
    transitionTo,
    currentState,
    sendChildReady,
    handleParentReady,
    handleAuthReady,
    requestQueue,
    flushRequestQueue,
    isAuthenticated,

    // Core controllers
    ParentCommunicationManager,
    MessageDispatcher,
    SessionManager,
    SecurityValidator,
    UIBridge,

    // V6 compatibility
    V6_STATES,

    // Friend management internals
    FriendCacheManager,
    FriendRequestManager,
    FriendSearchEngine,
    QRCodeManager,
    GroupParticipationManager,
    OfflineFirstFriends,
    saveFriendLocal,

    // State and promises
    TokenPromise,
    ModuleRegistrationManager,
    MessageTracker,
    IdempotentTracker,

    // Additional utility functions
    generateMessageId,
    importedGenerateMessageId,
    validateFriendId,
    validateFriendData,
    timeoutPromise,
    withTimeout,
    syncWithApiCore,
    apiCallWithRetry,
    verifySession,
    APIGateway,
    handleFriendSelection,
    getFriendsForMessaging,
    getFriendsForCalling,
    getFriendsForGroup,
    updateCurrentSection,
    updateFriendCounts,
    showFriendDetails,
    renderFriendsListInstantly,
    addFriendItem,
    addFriendItemInstant,
    renderContacts,
    renderFriends,
    renderFriendRequests,
    renderSentRequests,
    addFriendRequestItem,
    handleFriendAction,
    handleRequestAction,
    filterFriendsByCategory,
    searchFriendsLegacy,
    setCurrentCategoryFilter,
    setCurrentSearchTerm,
    renderAllUsersList,
    loadFriendDetails,
    showFriendRequestProfile,
    showFriendOptions,
    viewChatHistory,
    viewCallHistory,
    showChangeCategoryModal,
    renderTemporaryFriends,
    renderPinnedFriends,
    renderMutedFriends,
    showStartChatModal,
    setupEventListeners,
    initializeOriginalFunctionality,

    // Additional search and group functions
    searchFriends,
    searchFriendsByLetter,
    addFriendToGroup,
    removeFriendFromGroup,
    getGroupMembers,

    // Compatibility exports
    HandshakeClient,
    RecoveryManagerV6,
    StartupGovernor,

    // Namespaces
    KYN,
    friendCore,

    // StatusManager and ENV_CONFIG
    StatusManager,
    ENV_CONFIG,

    // Nearby Discovery
    NearbyManager,

    // Polling Manager
    PollingManager,

    // P1/P2/P3 NEW EXPORTS
    hydratePrivateNotesFromDB,
    snoozeFriend,
    unsnoozeFriend,
    restrictFriend,
    unrestrictFriend,
    reportFriend,
    importPhoneContacts,
    getFriendPrivacySettings,
    updateFriendPrivacySettings,
    exportFriendsCSV,
};

if (typeof window !== 'undefined') {
    window.FriendCoreAPI = {
        snoozeFriend,
        unsnoozeFriend,
        restrictFriend,
        unrestrictFriend,
        reportFriend,
        importPhoneContacts,
        getFriendPrivacySettings,
        updateFriendPrivacySettings,
        exportFriendsCSV,
        hydratePrivateNotesFromDB,
    };
}

window.__FRIEND_MODULE_READY__ = true;

window.__MODULE_READY__ = true;

window.debugUserDiscovery = function() {
    console.log('=== USER DISCOVERY DEBUG ===');
    console.log('window._allUsersCache:', window._allUsersCache?.length || 0);
    console.log('window._allUsersRaw:', window._allUsersRaw?.length || 0);
    console.log('window.discoverableUsers:', window.discoverableUsers?.length || 0);
    console.log('window.FriendCore?._allUsers:', window.FriendCore?._allUsers?.length || 0);
    console.log('allUsers variable:', window.allUsers?.length || 0);
    console.log('FriendCacheManager users:', FriendCacheManager?.getAllUsers()?.length || 0);
    console.log('Current user ID:', __session.user?.id || currentUser?.id);
    console.log('Friends count:', FriendCacheManager?.getAllFriends()?.length || 0);
    console.log('Auth ready:', authReadyReceived);
    console.log('Session ready:', __session.ready);
    console.log('Parent ready:', parentReadyReceived);
    console.log('Module active:', currentState === LIFECYCLE_STATES.ACTIVE);
    
    const discoverable = getDiscoverableUsers();
    console.log('Discoverable users (via getDiscoverableUsers):', discoverable.length);
    if (discoverable.length > 0) {
        console.log('Sample users:', discoverable.slice(0, 3));
    }
    console.log('===========================');
    return discoverable;
};

function applySettingToFriendModule(section, key, value) {
    if (section === 'appearance') {
        if (key === 'theme') {
            var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
        }
        if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
        if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
        if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
        if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'enableNotifications' || key === 'messageNotifications') window.__messageNotificationsEnabled = value;
        if (key === 'groupNotifications') window.__groupNotificationsEnabled = value;
        if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
    }
    if (section === 'privacy') {
        if (key === 'whoCanAddMe') window.__whoCanAddMe = value;
        if (key === 'canMessageMe') window.__canMessageMe = value;
        if (key === 'onlineStatus') window.__showOnlineStatus = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'readReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'typingIndicators') { window.__typingIndicatorsEnabled = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
        if (key === 'contactDiscovery') window.__contactDiscovery = value;
    }
    if (section === 'friends') {
        if (key === 'friendRequestNotifications') window.__friendRequestNotifications = value;
        if (key === 'autoAcceptFriends') window.__autoAcceptFriends = value;
        if (key === 'allowRequestMessage') window.__allowRequestMessage = value;
        if (key === 'showOnlineStatus') window.__showOnlineStatus = value;
        if (key === 'sortFriendsBy') window.__sortFriendsBy = value;
        if (key === 'friendLimitWarning') window.__friendLimitWarning = value;
        if (key === 'discoverByPhone') window.__discoverByPhone = value;
        if (key === 'discoverByEmail') window.__discoverByEmail = value;
        if (key === 'friendSuggestions') window.__friendSuggestions = value;
        if (key === 'friendRequestPrivacy') window.__friendRequestPrivacy = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
        if (key === 'messagePreviews') window.__messagePreviews = value;
        if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
        if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') window.__mediaAutoDownload = value;
    }
    if (section === 'profile') {
        if (key === 'displayName') window.__currentUserDisplayName = value;
        if (key === 'photoUrl') window.__currentUserAvatar = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'profileVisibility') window.__profileVisibility = value;
        if (key === 'currentMood') window.__currentMood = value;
    }
    if (section === 'security') {
        // FIX (Security settings audit): this module runs inside an
        // iframe and has no access to the auth session or logout — writing
        // __sessionTimeout here did nothing because nothing (in this frame
        // or any other) ever read it. The actual inactivity timeout is now
        // enforced by SESSION_COORDINATOR in the parent frame's
        // app.core.session.js, which reads the saved value straight from
        // localStorage('knecta_settings_cache').security.sessionTimeout.
        if (key === 'sessionTimeout') window.__sessionTimeout = value; // kept for any legacy readers; not the enforcement path
    }
    if (section === 'mood') {
        if (key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
        if (key === 'autoMoodDetection') window.__autoMoodDetection = value;
        if (key === 'shareMoodStatus') window.__shareMoodStatus = value;
        if (key === 'showMoodTo') window.__showMoodTo = value;
    }
    if (section === 'status') {
        if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
        if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
        if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
        if (key === 'showStatusTo') window.__showStatusTo = value;
    }
    if (section === 'advanced') {
        if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        if (key === 'debugLogging' || key === 'debugMode') window.__debugLogging = value;
        if (key === 'performanceMode') { window.__performanceMode = value; document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false'); }
        if (key === 'dataSaver') window.__dataSaver = value;
        if (key === 'offlineMode') window.__offlineMode = value;
        if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
        if (key === 'experimentalFeatures') window.__experimentalFeatures = value;
    }
    if (section === 'storage') {
        if (key === 'autoClearCache') window.__autoClearCache = value;
    }
}

(function bootstrapSettingsFromCache() {
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(sectionEntry) {
            var section = sectionEntry[0], sectionVal = sectionEntry[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(keyEntry) {
                try { applySettingToFriendModule(section, keyEntry[0], keyEntry[1]); } catch(e) {}
            });
        });
        console.log('[friend-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'friends', source: 'friends', timestamp: Date.now() }, '*');
        } catch(e) {}

        // FIX: Bridge kyn: CustomEvents (dispatched by app.realtime.socket.js _routeMessage)
        // to the FriendCacheManager so online presence updates work without postMessage relay
        (function _bridgeKynEvents() {
            function _handlePresence(evt, isOnline) {
                const uid = evt.detail && (evt.detail.userId || evt.detail.id);
                if (!uid) return;
                try {
                    const fc = window.FriendCacheManager;
                    if (!fc) return;
                    const f = fc.getFriend(String(uid));
                    if (!f) return;
                    fc.setFriend({ ...f, online: isOnline, status: isOnline ? 'online' : 'offline' });
                    if (typeof fc.syncToGlobals === 'function') fc.syncToGlobals();
                    window.dispatchEvent(new CustomEvent('friendsUpdated', {
                        detail: { presenceUpdate: true, userId: uid, online: isOnline }
                    }));
                } catch(_) {}
            }

            window.addEventListener('kyn:user:online',   function(e) { _handlePresence(e, true);  });
            window.addEventListener('kyn:user:offline',  function(e) { _handlePresence(e, false); });
            window.addEventListener('kyn:friend:online', function(e) { _handlePresence(e, true);  });
            window.addEventListener('kyn:friend:offline',function(e) { _handlePresence(e, false); });

            // Bridge kyn:friend:request → friend request notification
            window.addEventListener('kyn:friend:request', function(e) {
                try {
                    const detail = e.detail || {};
                    window.dispatchEvent(new CustomEvent('friendRequestReceived', { detail }));
                } catch(_) {}
            });

            // Bridge kyn:friend:accepted → friend acceptance notification
            window.addEventListener('kyn:friend:accepted', function(e) {
                try {
                    const detail = e.detail || {};
                    window.dispatchEvent(new CustomEvent('friendRequestAccepted', { detail }));
                } catch(_) {}
            });

            console.log('[friend-core] kyn: CustomEvent bridge active ✅');
        })();

    });
})();

// Additional exports required for cross-module wiring between the 3 split files
export {
    applySettingToFriendModule
};
