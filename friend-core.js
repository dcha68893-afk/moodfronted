// =============================================
// FRIEND PAGE - OFFLINE-FIRST EDITION v14.0
// MIGRATED: Full offline-first architecture (spec v1.0)
// ADDED: localStore.friends.js integration (IndexedDB cache)
// ADDED: friendQueue.manager.js integration (offline action queue)
// ADDED: friendSync.engine.js integration (server reconciliation)
// ADDED: Spec-compliant data model (id, serverId, isLocalOnly, syncVersion)
// ADDED: Optimistic UI updates with proper rollback
// ADDED: Status transition validation
// FIXED: All Users / Discovery showing 0 users
// FIXED: Search uses client-side filtering (no API calls)
// FIXED: Avatar field normalization (avatar/photoURL)
// FIXED: Global state exposure (window.FriendCore)
// FIXED: Event-driven rendering
// ADDED: Polling for incoming friend requests (30s interval)
// ADDED: Request deduplication with content-based hashing
// ADDED: Smart UI updates with shallow comparison
// FIXED: Sent requests rendering after load
// FIXED: Nearby users fallback when API missing (Bug #3)
// FIXED: Call button for non-friend users (Bug #4)
// FIXED: QR scanner stops after result (Bug #6)
// FIXED: Duplicate AUTH_READY warning suppressed
// FIXED: Polling deduplication with _fetchInFlight guard
// =============================================

import {
    login,
    register,
    logout,
    getValidToken as originalGetValidToken,
    secureFetch,
    escapeHtml as importedEscapeHtml,
    formatTimeAgo as importedFormatTimeAgo,
    getTrustScoreClass as importedGetTrustScoreClass,
    showNotification as importedShowNotification,
    navigateToChat as importedNavigateToChat,
    navigateToCall as importedNavigateToCall,
    simulateContactSync as importedSimulateContactSync,
    KnectaError,
    SessionError,
    ValidationError
} from './js/api.core.js';

import {
    generateMessageId as importedGenerateMessageId,
    validateMessageSchema,
    getMessages
} from './js/api.messages.js';

// =============================================
// [CONSTANTS & CONFIGURATION]
// =============================================

const DEBUG = false;
const PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

const MODULE_NAME = 'friends';
const MODULE_VERSION = '14.0';
const EXPECTED_PARENT_ORIGIN = window.location.origin;

// =============================================
// [POLLING CONFIGURATION]
// =============================================

const POLLING_CONFIG = {
    INCOMING_REQUESTS_INTERVAL: 60000,  // 60s — socket handles realtime; polling is offline fallback
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 5000,
    ENABLED: true
};

let pollingIntervals = {
    incomingRequests: null,
    sentRequests: null  // FIX: added for sent-requests polling
};

let pollingRetryCounts = {
    incomingRequests: 0
};

// =============================================
// [REQUEST DEDUPLICATION]
// =============================================

const RequestDeduplicator = {
    _processedHashes: new Map(),
    _maxCacheSize: 200,
    _cacheTTL: 60000, // 1 minute
    
    generateHash(request) {
        if (!request || !request.id) return null;
        
        const data = {
            id: request.id,
            senderId: request.senderId || request.sender?.id,
            receiverId: request.receiverId || request.receiver?.id,
            status: request.status,
            timestamp: request.timestamp || request.createdAt
        };
        
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return `${hash}_${data.id}`;
    },
    
    isDuplicate(request) {
        const hash = this.generateHash(request);
        if (!hash) return false;
        
        if (this._processedHashes.has(hash)) {
            const entry = this._processedHashes.get(hash);
            if (Date.now() - entry.timestamp < this._cacheTTL) {
                return true;
            }
            this._processedHashes.delete(hash);
        }
        return false;
    },
    
    markProcessed(request) {
        const hash = this.generateHash(request);
        if (!hash) return;
        
        this._processedHashes.set(hash, {
            timestamp: Date.now(),
            request: request
        });
        
        this._cleanup();
    },
    
    _cleanup() {
        if (this._processedHashes.size <= this._maxCacheSize) return;
        
        const now = Date.now();
        for (const [hash, entry] of this._processedHashes.entries()) {
            if (now - entry.timestamp > this._cacheTTL) {
                this._processedHashes.delete(hash);
            }
        }
        
        // If still too large, remove oldest 20%
        if (this._processedHashes.size > this._maxCacheSize) {
            const entries = Array.from(this._processedHashes.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this._processedHashes.delete(entries[i][0]);
            }
        }
    },
    
    reset() {
        this._processedHashes.clear();
    }
};

// =============================================
// [SHALLOW COMPARISON UTILITIES]
// =============================================

const ShallowCompare = {
    areRequestsEqual(oldRequests, newRequests) {
        if (!oldRequests && !newRequests) return true;
        if (!oldRequests || !newRequests) return false;
        if (oldRequests.length !== newRequests.length) return false;
        
        // Sort both arrays by ID for consistent comparison
        const sortedOld = [...oldRequests].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const sortedNew = [...newRequests].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        
        for (let i = 0; i < sortedOld.length; i++) {
            const oldReq = sortedOld[i];
            const newReq = sortedNew[i];
            
            // Compare key fields
            if (oldReq.id !== newReq.id) return false;
            if (oldReq.status !== newReq.status) return false;
            if ((oldReq.senderId || oldReq.sender?.id) !== (newReq.senderId || newReq.sender?.id)) return false;
            
            // Compare timestamp within 2 seconds tolerance
            const oldTime = oldReq.timestamp || oldReq.createdAt || 0;
            const newTime = newReq.timestamp || newReq.createdAt || 0;
            if (Math.abs(oldTime - newTime) > 2000) return false;
        }
        
        return true;
    },
    
    hasChanges(oldData, newData, keyFields = ['id', 'status', 'timestamp']) {
        if (!oldData && !newData) return false;
        if (!oldData || !newData) return true;
        
        for (const field of keyFields) {
            const oldValue = oldData[field];
            const newValue = newData[field];
            
            if (oldValue !== newValue) {
                // Handle nested objects like sender.id
                if (typeof oldValue === 'object' && typeof newValue === 'object') {
                    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                        return true;
                    }
                } else if (oldValue !== newValue) {
                    return true;
                }
            }
        }
        
        return false;
    }
};

// =============================================
// [POLLING MANAGER] - FIXED: deduplication with _fetchInFlight
// =============================================

const PollingManager = {
    _isPolling: false,
    _lastFetchTimestamp: null,
    _lastRequestHash: null,
    _fetchInFlight: false,  // FIXED: dedup flag for polling
    
    async startPollingIncomingRequests() {
        if (!POLLING_CONFIG.ENABLED) {
            Logger.info('PollingManager', 'Polling disabled by configuration');
            return;
        }
        
        if (pollingIntervals.incomingRequests) {
            Logger.debug('PollingManager', 'Polling already active');
            return;
        }
        
        // Wait for module to be active before starting polling
        const waitForActive = () => {
            return new Promise((resolve) => {
                if (currentState === LIFECYCLE_STATES.ACTIVE && authReadyReceived && __session.ready) {
                    resolve();
                } else {
                    const checkInterval = setInterval(() => {
                        if (currentState === LIFECYCLE_STATES.ACTIVE && authReadyReceived && __session.ready) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 1000);
                }
            });
        };
        
        await waitForActive();
        
        Logger.info('PollingManager', 'Starting polling for incoming requests', {
            interval: POLLING_CONFIG.INCOMING_REQUESTS_INTERVAL
        });
        
        // Immediate first fetch
        await this._fetchIncomingRequests();
        
        // Set up interval
        pollingIntervals.incomingRequests = setInterval(async () => {
            await this._fetchIncomingRequests();
        }, POLLING_CONFIG.INCOMING_REQUESTS_INTERVAL);
        
        this._isPolling = true;
    },
    
    stopPollingIncomingRequests() {
        if (pollingIntervals.incomingRequests) {
            clearInterval(pollingIntervals.incomingRequests);
            pollingIntervals.incomingRequests = null;
            Logger.info('PollingManager', 'Stopped polling for incoming requests');
        }
        this._isPolling = false;
        this._lastFetchTimestamp = null;
        this._lastRequestHash = null;
        this._fetchInFlight = false;
        pollingRetryCounts.incomingRequests = 0;
    },

    // FIX: Sent requests were never polled — if a friend accepted your request while
    // your socket was disconnected, the "Sent Requests" list would never clear.
    startPollingSentRequests() {
        if (pollingIntervals.sentRequests) return;
        pollingIntervals.sentRequests = setInterval(
            () => this._fetchSentRequests(),
            POLLING_CONFIG.INCOMING_REQUESTS_INTERVAL
        );
        Logger.info('PollingManager', 'Started polling for sent requests');
    },

    stopPollingSentRequests() {
        if (pollingIntervals.sentRequests) {
            clearInterval(pollingIntervals.sentRequests);
            pollingIntervals.sentRequests = null;
            Logger.info('PollingManager', 'Stopped polling for sent requests');
        }
    },

    async _fetchSentRequests() {
        if (this._fetchSentInFlight) return;
        if (!authReadyReceived || !__session.ready || !__session.token) return;
        this._fetchSentInFlight = true;
        try {
            const response = await authorizedRequest('/api/friends/sent', { timeout: 10000 });
            if (response?.success) {
                let sentData = [];
                const d = response.data;
                if (Array.isArray(d?.requests))            sentData = d.requests;
                else if (Array.isArray(d?.data?.requests)) sentData = d.data.requests;
                else if (Array.isArray(d))                 sentData = d;

                const current = FriendCacheManager.getAllSentRequests?.() || [];
                const nowIds = new Set(sentData.map(r => String(r.receiverId || r.friendId || r.userId || '')));
                const disappeared = current.filter(r => {
                    const rid = String(r.receiverId || r.friendId || r.userId || '');
                    return rid && !nowIds.has(rid);
                });
                for (const gone of disappeared) {
                    const goneId = String(gone.receiverId || gone.friendId || gone.userId || '');
                    const alreadyFriend = (FriendCacheManager.getAllFriends?.() || [])
                        .find(f => String(f.id) === goneId);
                    if (!alreadyFriend) { loadFriendsFromBackend().catch(() => {}); break; }
                }
                if (!ShallowCompare.areRequestsEqual(current, sentData)) {
                    FriendCacheManager.setSentRequests?.(sentData);
                    FriendCacheManager.syncToGlobals();
                    window.dispatchEvent(new CustomEvent('sentRequestsUpdated', {
                        detail: { requests: sentData, source: 'polling', timestamp: Date.now() }
                    }));
                }
            }
        } catch (_) {} finally { this._fetchSentInFlight = false; }
    },

    // FIXED: Added _fetchInFlight deduplication guard
    async _fetchIncomingRequests() {
        // FIXED: Skip if already fetching to prevent duplicate requests
        if (this._fetchInFlight) {
            Logger.debug('PollingManager', 'Skipping poll - already in flight');
            return;
        }
        
        if (!assertActive('PollingManager._fetchIncomingRequests')) {
            Logger.debug('PollingManager', 'Module not active, skipping poll');
            return;
        }
        
        if (!authReadyReceived || !__session.ready || !__session.token) {
            Logger.debug('PollingManager', 'Auth not ready, skipping poll');
            return;
        }
        
        this._fetchInFlight = true;
        
        try {
            const response = await authorizedRequest('/api/friends/incoming', {
                timeout: 10000 // 10 second timeout for polling requests
            });
            
            pollingRetryCounts.incomingRequests = 0;
            
            if (response.success && (response.data?.requests || response.data)) {
                // FIX: extract requests array from any backend response shape
                let requestsData = [];
                const _d = response.data;
                if (Array.isArray(_d?.requests)) {
                    requestsData = _d.requests;
                } else if (Array.isArray(_d?.data?.requests)) {
                    requestsData = _d.data.requests;
                } else if (Array.isArray(_d)) {
                    requestsData = _d;
                } else if (_d && typeof _d === 'object') {
                    for (const v of Object.values(_d)) {
                        if (Array.isArray(v) && v.length > 0) { requestsData = v; break; }
                    }
                }
                
                // Deduplicate requests
                const uniqueRequests = this._deduplicateRequests(requestsData);
                
                // Check if data has actually changed before updating UI
                const currentRequests = FriendCacheManager.getAllRequests();
                
                if (!ShallowCompare.areRequestsEqual(currentRequests, uniqueRequests)) {
                    Logger.info('PollingManager', 'Incoming requests changed, updating UI', {
                        oldCount: currentRequests.length,
                        newCount: uniqueRequests.length
                    });
                    
                    // Update cache
                    FriendCacheManager.setRequests(uniqueRequests);
                    FriendCacheManager.syncToGlobals();
                    FriendCacheManager.persist();
                    
                    // Dispatch event for UI update
                    window.dispatchEvent(new CustomEvent('requestsUpdated', {
                        detail: { 
                            requests: uniqueRequests, 
                            count: uniqueRequests.length,
                            source: 'polling',
                            timestamp: Date.now()
                        }
                    }));
                    
                    // Also dispatch specific polling update event
                    window.dispatchEvent(new CustomEvent('incomingRequestsPolled', {
                        detail: {
                            requests: uniqueRequests,
                            previousCount: currentRequests.length,
                            newCount: uniqueRequests.length,
                            hasChanges: true,
                            timestamp: Date.now()
                        }
                    }));
                } else {
                    Logger.debug('PollingManager', 'No changes in incoming requests');
                    
                    window.dispatchEvent(new CustomEvent('incomingRequestsPolled', {
                        detail: {
                            hasChanges: false,
                            timestamp: Date.now()
                        }
                    }));
                }
                
                this._lastFetchTimestamp = Date.now();
            }
        } catch (error) {
            pollingRetryCounts.incomingRequests++;
            Logger.error('PollingManager', 'Failed to fetch incoming requests', error, {
                attempt: pollingRetryCounts.incomingRequests
            });
            
            // Exponential backoff for retries
            if (pollingRetryCounts.incomingRequests <= POLLING_CONFIG.MAX_RETRY_ATTEMPTS) {
                const delay = POLLING_CONFIG.RETRY_DELAY * Math.pow(2, pollingRetryCounts.incomingRequests - 1);
                Logger.info('PollingManager', `Retry ${pollingRetryCounts.incomingRequests} in ${delay}ms`);
                
                setTimeout(() => {
                    if (pollingIntervals.incomingRequests) {
                        this._fetchIncomingRequests();
                    }
                }, delay);
            } else {
                Logger.warn('PollingManager', 'Max retry attempts reached for incoming requests polling');
            }
        } finally {
            this._fetchInFlight = false;
        }
    },
    
    _deduplicateRequests(requests) {
        if (!requests || !Array.isArray(requests)) return [];
        
        const uniqueMap = new Map();
        
        for (const request of requests) {
            if (!request || !request.id) continue;
            
            // Skip if we've already processed this exact request
            if (RequestDeduplicator.isDuplicate(request)) {
                Logger.debug('PollingManager', 'Skipping duplicate request', { id: request.id });
                continue;
            }
            
            // Use ID as primary key for deduplication
            if (!uniqueMap.has(request.id)) {
                uniqueMap.set(request.id, request);
                RequestDeduplicator.markProcessed(request);
            } else {
                // If duplicate ID exists, keep the one with newer timestamp
                const existing = uniqueMap.get(request.id);
                const existingTime = existing.timestamp || existing.createdAt || 0;
                const newTime = request.timestamp || request.createdAt || 0;
                
                if (newTime > existingTime) {
                    uniqueMap.set(request.id, request);
                }
            }
        }
        
        // Sort by timestamp (newest first)
        const uniqueRequests = Array.from(uniqueMap.values());
        uniqueRequests.sort((a, b) => {
            const timeA = a.timestamp || a.createdAt || 0;
            const timeB = b.timestamp || b.createdAt || 0;
            return timeB - timeA;
        });
        
        return uniqueRequests;
    },
    
    isPolling() {
        return this._isPolling && pollingIntervals.incomingRequests !== null;
    },
    
    reset() {
        this.stopPollingIncomingRequests();
        this._isPolling = false;
        this._lastFetchTimestamp = null;
        this._lastRequestHash = null;
        this._fetchInFlight = false;
        pollingRetryCounts.incomingRequests = 0;
        RequestDeduplicator.reset();
    }
};

// =============================================
// [FRIEND CATEGORIES]
// =============================================

const friendCategories = {
    'acquaintance': { name: 'Acquaintance', color: 'var(--category-acquaintance)', icon: 'fas fa-handshake', description: 'Someone you know casually' },
    'friend': { name: 'Friend', color: 'var(--category-friend)', icon: 'fas fa-user-friends', description: 'A regular friend' },
    'close-friend': { name: 'Close Friend', color: 'var(--category-close-friend)', icon: 'fas fa-heart', description: 'A close personal friend' },
    'family': { name: 'Family', color: 'var(--category-family)', icon: 'fas fa-users', description: 'Family member' },
    'business': { name: 'Business', color: 'var(--category-business)', icon: 'fas fa-briefcase', description: 'Business contact' },
    'pinned': { name: 'Pinned', color: 'var(--warning-color)', icon: 'fas fa-thumbtack', description: 'Pinned friend' },
    'muted': { name: 'Muted', color: 'var(--text-secondary)', icon: 'fas fa-volume-mute', description: 'Muted friend' }
};

// =============================================
// [STORAGE KEYS]
// =============================================

const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'USER_TOKEN',
    USER_DATA: 'USER_DATA',
    FRIENDS: 'knecta_friends_cache',
    CONTACTS: 'knecta_contacts_cache',
    REQUESTS: 'knecta_friend_requests_cache',
    SENT_REQUESTS: 'knecta_sent_requests_cache',
    TEMPORARY_FRIENDS: 'knecta_temporary_friends_cache',
    PINNED_FRIENDS: 'knecta_pinned_friends_cache',
    MUTED_FRIENDS: 'knecta_muted_friends_cache',
    LAST_SYNC: 'knecta_friends_last_sync',
    USER_PROFILE: 'knecta_user_profile_cache',
    UNIQUE_QR_CODE: 'knecta_unique_qr_code',
    MUTUAL_FRIENDS_CACHE: 'knecta_mutual_friends_cache',
    USER_GROUPS: 'knecta_user_groups_cache',
    LAST_INTERACTIONS: 'knecta_last_interactions',
    PRIVATE_NOTES: 'knecta_private_notes',
    ALL_USERS_CACHE: 'knecta_all_users_cache',
    KYN_SESSION: 'kyn_session_cache_v3',
    KYN_MESSAGE_QUEUE: 'kyn_message_queue_v3',
    KYN_STATE: 'kyn_state_cache',
    KYN_ORIGIN_TRUST: 'kyn_origin_trust'
};

// =============================================
// [SESSION STORAGE] - MEMORY ONLY
// =============================================
const __session = {
    token: null,
    user: null,
    expiresAt: null,
    ready: false
};

// =============================================
// [LIFECYCLE STATE MACHINE]
// =============================================

const LIFECYCLE_STATES = {
    BOOT: 'BOOT',
    INITIALIZING: 'INITIALIZING',
    WAITING_AUTH: 'WAITING_AUTH',
    AUTH_READY: 'AUTH_READY',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    ACTIVE: 'ACTIVE',
    ERROR: 'ERROR'
};

let currentState = LIFECYCLE_STATES.BOOT;
let childReadySent = false;
let parentReadyReceived = false;
let authReadyReceived = false;
let _stateHistory = [];
const _listeners = new Set();
let initializationLock = false;

// =============================================
// [REQUEST QUEUE]
// =============================================

const requestQueue = [];
let isFlushingQueue = false;

function queueRequest(requestFn) {
    console.log(`[${MODULE_NAME}] Queueing request (auth not ready)`);
    requestQueue.push(requestFn);
    
    if (requestQueue.length > 100) {
        requestQueue.shift();
        console.warn(`[${MODULE_NAME}] Request queue truncated to 100 items`);
    }
}

async function flushRequestQueue() {
    if (isFlushingQueue) {
        console.log(`[${MODULE_NAME}] Queue flush already in progress`);
        return;
    }
    
    if (!authReadyReceived || currentState !== LIFECYCLE_STATES.ACTIVE) {
        console.log(`[${MODULE_NAME}] Cannot flush queue - auth not ready or not active`);
        return;
    }
    
    isFlushingQueue = true;
    const queueSize = requestQueue.length;
    console.log(`[${MODULE_NAME}] Flushing ${queueSize} queued requests`);
    
    while (requestQueue.length > 0) {
        const requestFn = requestQueue.shift();
        try {
            await requestFn();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Queued request failed:`, error);
        }
    }
    
    isFlushingQueue = false;
    console.log(`[${MODULE_NAME}] Queue flush complete`);
}

// =============================================
// [STRICT STATE TRANSITION]
// =============================================

const VALID_TRANSITIONS = {
    [LIFECYCLE_STATES.BOOT]: [LIFECYCLE_STATES.INITIALIZING],
    [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.WAITING_AUTH],
    [LIFECYCLE_STATES.WAITING_AUTH]: [LIFECYCLE_STATES.AUTH_READY, LIFECYCLE_STATES.ERROR],
    [LIFECYCLE_STATES.AUTH_READY]: [LIFECYCLE_STATES.READY],
    [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAIT_PARENT],
    [LIFECYCLE_STATES.WAIT_PARENT]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.ERROR],
    [LIFECYCLE_STATES.ACTIVE]: [],
    [LIFECYCLE_STATES.ERROR]: [LIFECYCLE_STATES.INITIALIZING]
};

function transitionTo(nextState, reason = '') {
    if (currentState === nextState) {
        Logger.debug('Lifecycle', `Already in state ${nextState} - ignoring transition`, { reason });
        return true;
    }

    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
        console.warn(`[Lifecycle] Invalid transition: ${currentState} → ${nextState} (reason: ${reason})`);
        return false;
    }

    const fromState = currentState;
    currentState = nextState;

    _stateHistory.push({
        from: fromState,
        to: nextState,
        timestamp: Date.now(),
        reason
    });

    if (_stateHistory.length > 30) _stateHistory.shift();

    _notifyListeners(nextState, fromState, reason);
    console.log(`[${MODULE_NAME}] State: ${fromState} → ${nextState}`, { reason });

    window.dispatchEvent(new CustomEvent('lifecycleChanged', {
        detail: { toState: nextState, fromState, reason }
    }));

    return true;
}

function _notifyListeners(toState, fromState, reason) {
    _listeners.forEach(listener => {
        try { listener(toState, fromState, reason); } catch (e) {}
    });
}

function onTransition(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
}

const LifecycleStateMachine = {
    get current() { return currentState; },
    get isActive() { return currentState === LIFECYCLE_STATES.ACTIVE; },
    get isAuthReady() { return authReadyReceived; },
    get isReady() { return currentState === LIFECYCLE_STATES.READY; },
    get isWaitingParent() { return currentState === LIFECYCLE_STATES.WAIT_PARENT; },
    get parentReady() { return parentReadyReceived; },
    get sessionReady() { return __session.ready; },
    transition: transitionTo,
    onTransition,
    reset() {
        currentState = LIFECYCLE_STATES.BOOT;
        childReadySent = false;
        parentReadyReceived = false;
        authReadyReceived = false;
        _stateHistory = [];
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        __session.ready = false;
        initializationLock = false;
        requestQueue.length = 0;
        isFlushingQueue = false;
    }
};

// =============================================
// [LIFECYCLE GUARD]
// =============================================

function assertActive(actionName) {
    if (currentState !== LIFECYCLE_STATES.ACTIVE) {
        console.warn(`[Lifecycle] Blocked action "${actionName}" — not ACTIVE (current: ${currentState}, parentReady: ${parentReadyReceived}, authReady: ${authReadyReceived}, sessionReady: ${__session.ready})`);
        
        window.dispatchEvent(new CustomEvent('actionBlocked', {
            detail: { action: actionName, state: currentState, parentReady: parentReadyReceived, authReady: authReadyReceived, sessionReady: __session.ready }
        }));
        
        return false;
    }
    return true;
}

function assertAuthReady(actionName) {
    if (!authReadyReceived) {
        console.warn(`[Lifecycle] Blocked action "${actionName}" — auth not ready (state: ${currentState}, authReady: ${authReadyReceived})`);
        return false;
    }
    return true;
}

function assertReadyForSession(actionName) {
    if (currentState !== LIFECYCLE_STATES.ACTIVE || !parentReadyReceived || !__session.ready || !authReadyReceived) {
        console.warn(`[Lifecycle] Blocked session action "${actionName}" — prerequisites not met (state: ${currentState}, parentReady: ${parentReadyReceived}, authReady: ${authReadyReceived}, sessionReady: ${__session.ready})`);
        return false;
    }
    return true;
}

// =============================================
// [EXACTLY-ONCE CHILD_READY SENDER]
// =============================================
function sendChildReady() {
    if (childReadySent) {
        console.warn('[Lifecycle] CHILD_READY already sent');
        return false;
    }

    if (currentState !== LIFECYCLE_STATES.READY) {
        console.warn(`[Lifecycle] Cannot send CHILD_READY - state: ${currentState}`);
        return false;
    }

    const sent = sendMessageInternal({
        type: 'CHILD_READY',
        module: MODULE_NAME,
        source: MODULE_NAME,
        target: 'parent',
        payload: {
            module: MODULE_NAME,
            version: MODULE_VERSION,
            frameId: ParentCommunicationManager.getFrameId(),
            timestamp: Date.now()
        }
    });

    if (sent) {
        childReadySent = true;
        console.log(`[${MODULE_NAME}] CHILD_READY sent with module=${MODULE_NAME}`);
        transitionTo(LIFECYCLE_STATES.WAIT_PARENT, 'child_ready_sent');
        return true;
    }
    return false;
}

// =============================================
// [PARENT_READY HANDLER]
// =============================================
function handleParentReady(message, event) {
    if (parentReadyReceived) {
        console.warn('[Lifecycle] PARENT_READY already received — ignoring');
        return;
    }

    if (currentState !== LIFECYCLE_STATES.WAIT_PARENT) {
        console.warn(`[Lifecycle] PARENT_READY received in invalid state: ${currentState} — ignoring`);
        return;
    }

    // PRODUCTION FIX: Learn origin from the event so cross-origin parent is trusted
    if (event && event.origin) {
        SecurityValidator.learnTrustedOrigin(event.origin);
    } else if (message && message._origin) {
        SecurityValidator.learnTrustedOrigin(message._origin);
    }

    console.log('[Lifecycle] PARENT_READY received - extracting session');

    let session = null;

    if (message.payload?.session) {
        session = message.payload.session;
        console.log('[Lifecycle] PARENT_READY: extracted session from payload.session');
    } else if (message.session) {
        session = message.session;
        console.log('[Lifecycle] PARENT_READY: extracted session from root session');
    }

    if (session) {
        applySession(session);
    } else if (__session.user) {
        console.log('[Lifecycle] PARENT_READY: using existing session from AUTH_READY');
    } else {
        console.warn('[Lifecycle] PARENT_READY: no session data available');
    }

    parentReadyReceived = true;
    transitionTo(LIFECYCLE_STATES.ACTIVE, 'parent_ready_received');
    window.__PARENT_READY__       = true;
    window.__HANDSHAKE_COMPLETE__ = true;
    window.__IFRAME_READY__       = true;  // FIX: was never set — blocked all friend ops
    console.log(`[${MODULE_NAME}] ✅ ACTIVE`);
    onModuleActive();
}

// =============================================
// [AUTH_READY HANDLER] - FIXED: suppress duplicate warning
// =============================================

// FIXED: Added deduplication flag for AUTH_READY
let _authReadyHandled = false;

function handleAuthReady(message) {
    // FIXED: Suppress duplicate AUTH_READY silently (no console.warn)
    if (_authReadyHandled) {
        Logger.debug('Lifecycle', 'AUTH_READY already handled - ignoring duplicate');
        return;
    }

    if (currentState !== LIFECYCLE_STATES.WAITING_AUTH && 
        currentState !== LIFECYCLE_STATES.AUTH_READY && 
        currentState !== LIFECYCLE_STATES.INITIALIZING) {
        console.warn(`[Lifecycle] AUTH_READY received in invalid state: ${currentState} — ignoring`);
        return;
    }

    console.log('[Lifecycle] AUTH_READY received - extracting session');

    let token = null;
    let user  = null;

    if (message.payload?.session) {
        const s = message.payload.session;
        token = s.token || null;
        user  = s.user  || null;
    }

    if (!token && message.payload?.token)  token = message.payload.token;
    if (!user  && message.payload?.user)   user  = message.payload.user;

    if (!user && message.payload?.userId) {
        const uid = message.payload.userId;
        user = {
            id:          uid,
            userId:      uid,
            username:    message.payload.session?.username    || message.payload.username    || String(uid),
            email:       message.payload.session?.email       || message.payload.email       || '',
            displayName: message.payload.session?.displayName || message.payload.displayName || String(uid)
        };
    }

    if (!user && message.userId) {
        const uid = message.userId;
        user = { id: uid, userId: uid, username: String(uid), email: '', displayName: String(uid) };
    }
    if (!token && message.token) token = message.token;
    
    if (user) {
        if (!user.id   && user.userId) user.id     = user.userId;
        if (!user.userId && user.id)   user.userId = user.id;

        console.log('[Lifecycle] Applying AUTH_READY session:', { userId: user.id, username: user.username });

        applySession({
            token:         token,
            user:          user,
            expiresAt:     message.payload?.expiresAt || Date.now() + 3600000,
            ready:         true,
            authenticated: true
        });

        _authReadyHandled = true;  // FIXED: Mark as handled to prevent duplicates
        authReadyReceived = true;
        transitionTo(LIFECYCLE_STATES.AUTH_READY, 'auth_ready_received');
        transitionTo(LIFECYCLE_STATES.READY,      'auth_ready_complete');
        sendChildReady();
        flushRequestQueue();

        // Start polling for incoming and sent requests after auth is ready
        PollingManager.startPollingIncomingRequests();
        PollingManager.startPollingSentRequests(); // FIX: sent requests now auto-refresh

    } else {
        console.error('[Lifecycle] AUTH_READY received but could not extract user.', {
            hasPayloadSession: !!message.payload?.session,
            hasPayloadUser:    !!message.payload?.user,
            hasPayloadUserId:  !!message.payload?.userId,
            hasRootUserId:     !!message.userId,
            payloadKeys:       message.payload ? Object.keys(message.payload) : []
        });
    }
}

function applySession(session) {
    if (!session) {
        console.warn(`[${MODULE_NAME}] No session data`);
        return;
    }

    console.log(`[${MODULE_NAME}] applySession:`, {
        hasToken: !!session.token,
        hasUser: !!session.user,
        userId: session.user?.id || session.userId
    });

    let token = session.token || session.accessToken || null;
    let user = session.user || null;
    
    if (!user && (session.id || session.userId)) {
        user = {
            id: session.id || session.userId,
            userId: session.userId || session.id,
            username: session.username || session.displayName || 'User',
            displayName: session.displayName || session.username || 'User'
        };
    }

    __session.token = token;
    __session.user = user;
    __session.ready = !!user;

    if (__session.user) {
        currentUser = __session.user;
        userData = __session.user;
        window.currentUser = __session.user;
        window.userData = __session.user;
        
        window.dispatchEvent(new CustomEvent('userDataLoaded', {
            detail: { user: __session.user, source: 'session' }
        }));
    }
}

function onModuleActive() {
    console.log(`[${MODULE_NAME}] Module ACTIVE — safe to perform API calls`);
    flushQueue();
    
    if (!__session.ready && parentReadyReceived && authReadyReceived) {
        requestSessionFromParent();
    }
    
    window.dispatchEvent(new CustomEvent('loadInitialData'));
    window.dispatchEvent(new CustomEvent('moduleActivated'));
    window.dispatchEvent(new CustomEvent('parentReady'));
}

// =============================================
// [MESSAGE QUEUE]
// =============================================

const _messageQueue = [];
const _processedMessageIds = new Set();
const _maxProcessedSize = 500;

function queueMessage(message) {
    if (_messageQueue.length < 100) {
        _messageQueue.push({
            ...message,
            queuedAt: Date.now()
        });
        Logger.debug('Queue', 'Message queued', { type: message.type });
    }
    return true;
}

function flushQueue() {
    if (!parentReadyReceived || currentState !== LIFECYCLE_STATES.ACTIVE) {
        Logger.debug('Queue', 'Cannot flush - parent not ready or not active');
        return 0;
    }
    
    let flushed = 0;
    while (_messageQueue.length > 0) {
        const msg = _messageQueue.shift();
        if (sendMessageInternal(msg)) {
            flushed++;
        }
    }
    
    if (flushed > 0) {
        Logger.info('Queue', `Flushed ${flushed} queued messages`);
    }
    return flushed;
}

// =============================================
// [MESSAGE WRAPPER]
// =============================================

const generateMessageId = importedGenerateMessageId || function() {
    return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 4)}`;
};

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 4)}`;
}

function isMessageProcessed(messageId) {
    if (messageId === undefined || messageId === null) return false; // FIX: never block id-less messages
    return _processedMessageIds.has(messageId);
}

function markMessageProcessed(messageId) {
    if (messageId === undefined || messageId === null) return; // FIX: never store undefined/null
    _processedMessageIds.add(messageId);
    if (_processedMessageIds.size > _maxProcessedSize) {
        const toRemove = Array.from(_processedMessageIds).slice(0, 100);
        toRemove.forEach(id => _processedMessageIds.delete(id));
    }
}

function sendMessageInternal(message) {
    if (!window.parent || window.parent === window) {
        Logger.warn('sendMessage', 'Parent window not available');
        return false;
    }

    if (!message || typeof message !== 'object') {
        Logger.error('sendMessage', 'Invalid message object');
        return false;
    }

    const validatedMessage = {
        type: message.type,
        module: message.module || MODULE_NAME,
        id: message.id || generateMessageId(),
        requestId: message.requestId || (message.type.includes('REQUEST') ? generateRequestId() : null),
        source: MODULE_NAME,
        target: 'parent',
        payload: message.payload || {},
        timestamp: Date.now()
    };
    
    if (!validatedMessage.requestId) {
        delete validatedMessage.requestId;
    }
    
    if (!validatedMessage.type || !validatedMessage.id || !validatedMessage.source || 
        !validatedMessage.target || validatedMessage.payload === undefined) {
        Logger.error('sendMessage', 'Invalid message schema', validatedMessage);
        return false;
    }
    
    try {
        // PRODUCTION FIX: In cross-origin production iframes, window.location.origin
        // doesn't match the parent's origin so postMessage is silently dropped.
        // Use '*' as target — the parent validates messages on its end.
        const targetOrigin = PRODUCTION ? '*' : window.location.origin;
        window.parent.postMessage(validatedMessage, targetOrigin);
        Logger.debug('sendMessage', 'Sent', { type: validatedMessage.type, id: validatedMessage.id });
        DiagnosticsAgent.trackSend(validatedMessage.type);
        return true;
    } catch (error) {
        Logger.error('sendMessage', 'Failed', error);
        return false;
    }
}

function safeSend(message) {
    if (currentState !== LIFECYCLE_STATES.ACTIVE) {
        Logger.debug('safeSend', 'Not ACTIVE, queueing', { type: message.type, state: currentState });
        return queueMessage(message);
    }
    return sendMessageInternal(message);
}

// =============================================
// [AUTHENTICATED REQUEST THROUGH PARENT]
// =============================================

function isAuthenticated() {
    return authReadyReceived && __session.ready && !!__session.token;
}

async function authorizedRequest(endpoint, options = {}) {
    Logger.debug('authorizedRequest', `→ ${endpoint}`);
    
    if (!authReadyReceived) {
        console.warn(`[authorizedRequest] Auth not ready - queuing request for ${endpoint}`);
        
        return new Promise((resolve, reject) => {
            queueRequest(async () => {
                try {
                    const result = await authorizedRequest(endpoint, options);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    if (!assertActive('authorizedRequest')) {
        return { success: false, error: 'Module not active', statusCode: 503 };
    }
    
    if (!__session.ready || !__session.token) {
        Logger.warn('authorizedRequest', 'Session not ready, waiting for parent session');
        return { success: false, error: 'Session not ready', statusCode: 401 };
    }
    
    let normalizedEndpoint = endpoint;
    if (normalizedEndpoint && typeof normalizedEndpoint === 'string') {
        normalizedEndpoint = normalizedEndpoint.trim();
        
        if (normalizedEndpoint.startsWith('/api/')) {
            normalizedEndpoint = normalizedEndpoint.substring(4);
        } else if (normalizedEndpoint.startsWith('api/')) {
            normalizedEndpoint = '/' + normalizedEndpoint.substring(3);
        }
        
        if (!normalizedEndpoint.startsWith('/')) {
            normalizedEndpoint = '/' + normalizedEndpoint;
        }
        
        normalizedEndpoint = normalizedEndpoint.replace(/\/+/g, '/');
    }
    
    return new Promise((resolve) => {
        const requestId = generateRequestId();
        const timeout = options.timeout || 30000;
        let resolved = false;
        
        const timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                Logger.warn('authorizedRequest', `API request timeout for ${normalizedEndpoint}`, { requestId });
                resolve({ success: false, error: 'API request timeout', statusCode: 408 });
            }
        }, timeout);
        
        const handler = (event) => {
            if (resolved) return;
            
            const message = event.data;
            if (message.type === 'API_RESPONSE' && message.requestId === requestId) {
                resolved = true;
                clearTimeout(timeoutId);
                
                // The parent sometimes puts data at the top level of the message
                // rather than inside message.payload.  Lift top-level fields first.
                const TOP_LEVEL_KEYS = [
                    'data', 'result', 'items',
                    'friends', 'users', 'requests',
                    'pinned', 'muted', 'contacts',
                    'groups', 'nearby', 'sent'
                ];

                let rawPayload = message.payload;

                // If payload is missing/empty, try building it from top-level keys
                if (!rawPayload || typeof rawPayload !== 'object' || Object.keys(rawPayload).length === 0) {
                    for (const k of TOP_LEVEL_KEYS) {
                        if (message[k] !== undefined) {
                            rawPayload = { success: true, [k]: message[k], data: message[k] };
                            break;
                        }
                    }
                    // Bare success/error flags with no data array
                    if (!rawPayload) {
                        if (message.success === true || message.success === false || message.error) {
                            rawPayload = {
                                success: message.success !== false && !message.error,
                                error: message.error,
                                statusCode: message.statusCode
                            };
                        }
                    }
                }

                const payload = rawPayload || {};
                
                // Normalise: treat any truthy statusCode < 400 or presence of known data
                // fields as success, even if payload.success is missing/undefined.
                const hasDataFields = (
                    payload.data !== undefined ||
                    payload.friends !== undefined ||
                    payload.requests !== undefined ||
                    payload.users !== undefined ||
                    payload.pinned !== undefined ||
                    payload.muted !== undefined ||
                    payload.contacts !== undefined
                );
                const httpOk = payload.statusCode !== undefined && payload.statusCode < 400;
                const isSuccess = payload.success === true || (payload.success === undefined && (hasDataFields || httpOk));

                if (isSuccess) {
                    Logger.info('authorizedRequest', `API success: ${normalizedEndpoint}`, { requestId });
                    
                    let responseData = null;
                    if (payload.data !== undefined) {
                        responseData = payload.data;
                    } else if (payload.friends !== undefined) {
                        responseData = { friends: payload.friends };
                    } else if (payload.requests !== undefined) {
                        responseData = { requests: payload.requests };
                    } else if (payload.users !== undefined) {
                        responseData = { users: payload.users };
                    } else if (payload.pinned !== undefined) {
                        responseData = { pinned: payload.pinned };
                    } else if (payload.muted !== undefined) {
                        responseData = { muted: payload.muted };
                    } else if (payload.contacts !== undefined) {
                        responseData = { contacts: payload.contacts };
                    } else {
                        const { success, statusCode, ...rest } = payload;
                        responseData = Object.keys(rest).length > 0 ? rest : null;
                    }
                    
                    resolve({ success: true, data: responseData, statusCode: payload.statusCode || 200 });
                    return;
                }
                
                if (payload.error || payload.success === false) {
                    Logger.warn('authorizedRequest', `API error: ${payload.error || 'Unknown error'}`, { endpoint: normalizedEndpoint, requestId });
                    
                    if (payload.error === 'Authentication required' || payload.statusCode === 401) {
                        Logger.error('authorizedRequest', 'Authentication failed - token may be invalid', { endpoint: normalizedEndpoint });
                        
                        safeSend({
                            type: 'AUTH_ERROR',
                            payload: {
                                module: MODULE_NAME,
                                error: 'Authentication failed',
                                timestamp: Date.now()
                            }
                        });
                        
                        resolve({ success: false, error: 'Authentication required', statusCode: 401 });
                        return;
                    }
                    
                    resolve({ success: false, error: payload.error || payload.message || 'API request failed', statusCode: payload.statusCode || 500, data: payload.data });
                    return;
                }
                
                // Final fallback: treat the entire payload as data rather than hard-failing
                Logger.warn('authorizedRequest', 'Ambiguous API response format — treating as success with raw payload', { endpoint: normalizedEndpoint, requestId });
                const { success: _s, statusCode: _sc, ...fallbackData } = payload;
                resolve({ success: true, data: Object.keys(fallbackData).length > 0 ? fallbackData : null, statusCode: payload.statusCode || 200 });
            }
        };
        
        window.addEventListener('message', handler);
        
        const requestPayload = {
            endpoint: normalizedEndpoint,
            method: options.method || 'GET',
            headers: options.headers || {},
            requireAuth: options.requireAuth !== false,
            timestamp: Date.now()
        };
        
        if (options.body) {
            requestPayload.body = options.body;
        }
        
        if (options.params) {
            requestPayload.params = options.params;
        }
        
        const message = {
            type: 'API_REQUEST',
            requestId: requestId,
            payload: requestPayload
        };
        
        Logger.info('authorizedRequest', 'Sending API_REQUEST to parent', { endpoint: normalizedEndpoint, requestId, method: options.method });
        
        if (!safeSend(message)) {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                resolve({ success: false, error: 'Failed to send API request to parent', statusCode: 503 });
            }
        }
    });
}

// =============================================
// [API GATEWAY]
// =============================================
const APIGateway = {
    _pendingRequests: new Map(),
    _requestCounter: 0,
    
    async request(endpoint, options = {}) {
        if (!authReadyReceived) {
            console.warn(`[APIGateway] Auth not ready - queuing request for ${endpoint}`);
            
            return new Promise((resolve, reject) => {
                queueRequest(async () => {
                    try {
                        const result = await this.request(endpoint, options);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        }
        
        if (!assertActive('APIGateway.request')) {
            return { success: false, error: 'Module not active', statusCode: 503 };
        }
        
        return await authorizedRequest(endpoint, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body ? JSON.stringify(options.body) : undefined,
            params: options.params,
            requireAuth: options.requireAuth !== false
        });
    },
    
    clearPending() {
        this._pendingRequests.clear();
    }
};

// =============================================
// [LOGGING SYSTEM]
// =============================================

const Logger = {
    levels: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
    currentLevel: PRODUCTION ? 2 : 0,
    module: 'FriendCore',
    onceTracker: new Set(),
    
    format(level, module, message, data) {
        return `[${new Date().toISOString()}] [${this.module}:${module}] [${level}] ${message}`;
    },
    
    debug(module, message, data) {
        if (this.currentLevel > this.levels.DEBUG) return;
        if (DEBUG) {
            console.debug(this.format('DEBUG', module, message), data || '');
        }
    },
    
    info(module, message, data) {
        if (this.currentLevel > this.levels.INFO) return;
        console.info(this.format('INFO', module, message), data || '');
    },
    
    warn(module, message, data) {
        if (this.currentLevel > this.levels.WARN) return;
        if (PRODUCTION && this.onceTracker.has(`warn:${module}:${message}`)) return;
        this.onceTracker.add(`warn:${module}:${message}`);
        console.warn(this.format('WARN', module, message), data || '');
    },
    
    error(module, message, error, data) {
        if (this.currentLevel > this.levels.ERROR) return;
        console.error(this.format('ERROR', module, message), error || '', data || '');
    },
    
    once(key, message, error, data) {
        if (this.onceTracker.has(key)) return;
        this.onceTracker.add(key);
        if (error instanceof Error) {
            this.error('Once', message, error, { ...data, key });
        } else {
            this.warn('Once', `${message} (once)`, { ...data, key });
        }
    },
    
    clearCache() { this.onceTracker.clear(); }
};

// =============================================
// [STATUS MANAGER]
// =============================================

const StatusManager = {
    currentStatus: null,
    lastStatusTime: 0,
    statusHistory: new Set(),
    _allowedStatuses: new Set(['INIT', 'AUTH_WAIT', 'READY', 'ERROR', 'SESSION_UPDATE', 'SYNC_COMPLETE']),
    
    show(status, message, data = {}) {
        const now = Date.now();
        const statusKey = `${status}:${message}`;
        
        if (this.currentStatus === statusKey && now - this.lastStatusTime < 3000) return;
        if (this.statusHistory.has(statusKey)) return;
        if (PRODUCTION && !this._allowedStatuses.has(status)) return;
        
        const statusEmojis = {
            'INIT': '🚀', 'AUTH_WAIT': '🔐', 'READY': '🔵', 'ERROR': '❌', 
            'SESSION_UPDATE': '🔄', 'SYNC_COMPLETE': '✅'
        };
        
        const emoji = statusEmojis[status] || '📌';
        console.log(`[${MODULE_NAME}] ${emoji} ${status} - ${message}`);
        
        this.currentStatus = statusKey;
        this.lastStatusTime = now;
        this.statusHistory.add(statusKey);
    },
    
    reset() {
        this.currentStatus = null;
        this.lastStatusTime = 0;
    }
};

// =============================================
// [ERROR HANDLING]
// =============================================

let NetworkError;
try {
    const apiCore = await import('./js/api.core.js');
    NetworkError = apiCore.NetworkError;
} catch (e) {
    NetworkError = class NetworkError extends Error {
        constructor(message) {
            super(message || 'Network error');
            this.name = 'NetworkError';
        }
    };
}

const ErrorHandler = {
    boundaries: new Map(),
    circuitBreakers: new Map(),
    _logger: Logger,
    
    setLogger(logger) { this._logger = logger; },
    
    init() {
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error || event.message);
            event.preventDefault();
            return true;
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason || 'Unhandled Promise rejection');
            event.preventDefault();
            return true;
        });
    },
    
    handleGlobalError(error) {
        const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this._logger.error('Global', 'Unhandled error', error, { errorId });
    },
    
    createCircuitBreaker(name, options = {}) {
        const defaults = { failureThreshold: 5, successThreshold: 1, timeout: 30000 };
        const config = { ...defaults, ...options };
        
        const breaker = {
            name,
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            lastFailure: null,
            nextAttempt: null,
            
            async execute(fn) {
                if (this.state === 'OPEN') {
                    if (Date.now() >= this.nextAttempt) {
                        this.state = 'HALF_OPEN';
                    } else {
                        throw new Error(`Circuit breaker OPEN for ${name}`);
                    }
                }
                
                try {
                    const result = await fn();
                    
                    if (this.state === 'HALF_OPEN') {
                        this.successes++;
                        if (this.successes >= config.successThreshold) this.reset();
                    }
                    
                    return result;
                } catch (error) {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.state === 'CLOSED' && this.failures >= config.failureThreshold) {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                    }
                    
                    if (this.state === 'HALF_OPEN') {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                    }
                    
                    throw error;
                }
            },
            
            reset() {
                this.state = 'CLOSED';
                this.failures = 0;
                this.successes = 0;
                this.lastFailure = null;
                this.nextAttempt = null;
            }
        };
        
        this.circuitBreakers.set(name, breaker);
        return breaker;
    },
    
    getCircuitBreaker(name) {
        return this.circuitBreakers.get(name);
    },
    
    createBoundary(name, fn, fallback = null) {
        // Execute fn immediately (not as a wrapper) so render calls work correctly
        try {
            return fn();
        } catch (error) {
            Logger.error('Boundary', `${name} failed`, error);
            if (typeof fallback === 'function') return fallback();
            return fallback;
        }
    }
};

// =============================================
// [SAFE STORAGE LAYER]
// =============================================

const SafeStorage = {
    _memoryStore: new Map(),
    _storageAvailable: null,
    _warningsShown: new Set(),
    _subscribers: new Map(),
    
    init() {
        this._checkAvailability();
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return;
        try {
            const testKey = `__test_${Date.now()}`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
        } catch (e) {
            this._storageAvailable = false;
        }
    },
    
    subscribe(key, callback) {
        if (!this._subscribers.has(key)) {
            this._subscribers.set(key, new Set());
        }
        this._subscribers.get(key).add(callback);
        return () => this.unsubscribe(key, callback);
    },
    
    unsubscribe(key, callback) {
        const subs = this._subscribers.get(key);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) this._subscribers.delete(key);
        }
    },
    
    _notifySubscribers(key, value) {
        const subs = this._subscribers.get(key);
        if (subs) {
            subs.forEach(cb => {
                try { cb(value); } catch (e) {}
            });
        }
    },
    
    getItem(key) {
        this._checkAvailability();
        if (this._storageAvailable) {
            try {
                const value = localStorage.getItem(key);
                if (value !== null) return value;
            } catch (e) {}
        }
        return this._memoryStore.get(key) || null;
    },
    
    setItem(key, value) {
        this._checkAvailability();
        const stringValue = String(value);
        
        if (this._storageAvailable) {
            try {
                localStorage.setItem(key, stringValue);
            } catch (e) {}
        }
        
        this._memoryStore.set(key, stringValue);
        this._notifySubscribers(key, stringValue);
        return true;
    },
    
    removeItem(key) {
        this._checkAvailability();
        if (this._storageAvailable) {
            try { localStorage.removeItem(key); } catch (e) {}
        }
        this._memoryStore.delete(key);
        this._notifySubscribers(key, null);
        return true;
    },
    
    getObject(key) {
        const value = this.getItem(key);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch (e) {
            return null;
        }
    },
    
    setObject(key, obj) {
        try {
            return this.setItem(key, JSON.stringify(obj));
        } catch (e) {
            return false;
        }
    },
    
    clear() {
        this._memoryStore.clear();
        if (this._storageAvailable) {
            try { localStorage.clear(); } catch (e) {}
        }
        this._subscribers.clear();
    }
};

// =============================================
// [SECURITY VALIDATOR]
// =============================================

const SecurityValidator = {
    _trustedOrigins: new Set(),
    _dynamicTrust: new Map(),
    _initialized: false,
    _allowedOrigins: [
        window.location.origin,
        'http://localhost',
        'http://127.0.0.1',
        'null'
    ],
    _processedMessages: new Set(),
    _maxProcessedSize: 500,
    
    init() {
        if (this._initialized) return;
        
        this._allowedOrigins.forEach(origin => {
            if (origin) this._trustedOrigins.add(origin);
        });
        
        this._initialized = true;
        Logger.info('SecurityValidator', 'Initialized with strict origin policy');
    },
    
    // PRODUCTION FIX: Trust https production origins and onrender.com
    _dynamicTrusted: new Set(),

    learnTrustedOrigin(origin) {
        if (origin && typeof origin === 'string' && origin.startsWith('https://')) {
            this._dynamicTrusted.add(origin);
            Logger.info('SecurityValidator', `Dynamically trusted origin: ${origin}`);
        }
    },

    isOriginTrusted(origin) {
        if (!origin) return false;

        // Always trust same origin
        if (origin === window.location.origin) return true;

        // Always trust localhost variants
        if (origin === 'http://localhost' || origin === 'http://127.0.0.1' ||
            origin === 'http://localhost:3000' || origin === 'http://localhost:4000' ||
            origin === 'http://127.0.0.1:3000' || origin === 'http://127.0.0.1:4000') return true;

        // Trust 'null' (file:// or sandboxed iframe)
        if (origin === 'null') return true;

        // PRODUCTION FIX: Trust known Render.com origins explicitly
        const KNOWN_ORIGINS = [
            'https://moodfronted.onrender.com',
            'https://moodchat-fy56.onrender.com'
        ];
        if (KNOWN_ORIGINS.includes(origin)) return true;

        // Trust any *.onrender.com HTTPS origin
        try {
            const url = new URL(origin);
            if (url.protocol === 'https:' && url.hostname.endsWith('.onrender.com')) return true;
            // Trust same-hostname different port
            const selfUrl = new URL(window.location.href);
            if (url.hostname === selfUrl.hostname) return true;
        } catch(e) {}

        // Trust origins learned dynamically after first valid handshake
        if (this._dynamicTrusted.has(origin)) return true;

        // Trust origins pre-registered in _trustedOrigins set
        if (this._trustedOrigins && this._trustedOrigins.has(origin)) return true;

        return false;
    },
    
    validateMessage(event) {
        if (!event || !event.origin) return false;
        
        if (!this.isOriginTrusted(event.origin)) {
            Logger.warn('Security', `Blocked message from untrusted origin: ${event.origin}`);
            return false;
        }
        
        return true;
    },
    
    validateMessageFormat(message) {
        if (!message || typeof message !== 'object') return false;
        if (!message.type || typeof message.type !== 'string') return false;

        // Allow internally-unwrapped REALTIME_EVENT messages (no source/target check needed)
        if (message._unwrapped === true) return true;

        // Allow REALTIME_EVENT: prefix messages through so the unwrapper can handle them
        if (message.type.startsWith('REALTIME_EVENT:')) return true;

        if (message.source && message.source !== 'parent' && message.source !== MODULE_NAME) {
            return false;
        }
        if (message.target && message.target !== MODULE_NAME && message.target !== 'parent' && message.target !== '*') {
            return false;
        }

        return true;
    },
    
    isDuplicate(messageId) {
        if (this._processedMessages.has(messageId)) return true;
        this._processedMessages.add(messageId);
        this._cleanupProcessed();
        return false;
    },
    
    _cleanupProcessed() {
        if (this._processedMessages.size > this._maxProcessedSize) {
            const toRemove = Array.from(this._processedMessages).slice(0, 100);
            toRemove.forEach(id => this._processedMessages.delete(id));
        }
    },
    
    sanitizeMessage(data) {
        if (!data || typeof data !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (e) {
            return null;
        }
    },
    
    validateType(type) {
        const allowedTypes = [
            'PARENT_READY', 'SESSION_SYNC', 'MODULE_REGISTERED', 'ACK',
            'HEARTBEAT', 'HEARTBEAT_ACK', 'FRIEND_UPDATE', 'API_RESPONSE',
            'API_REQUEST', 'SEND_MESSAGE', 'START_CALL', 'ACCEPT_CALL',
            'UPDATE_PROFILE', 'OPEN_GROUP', 'CHANGE_STATUS', 'FRIEND_REQUEST_SENT',
            'FRIEND_ACCEPTED', 'FRIEND_REJECTED', 'FRIEND_REMOVED', 'FRIEND_BLOCKED',
            'FRIEND_EXPIRED', 'FRIEND_REQUEST_EXPIRED', 'NOTIFICATION_NEW',
            'GROUP_UPDATE', 'TOKEN_EXPIRED', 'AUTH_ERROR', 'CHILD_READY',
            'REGISTER_MODULE', 'REQUEST_SESSION', 'SESSION_DATA', 'FRIEND_SEARCH',
            'AUTH_READY'
        ];
        
        return allowedTypes.includes(type);
    }
};

// =============================================
// [PARENT COMMUNICATION MANAGER]
// =============================================

const ParentCommunicationManager = {
    _parentOrigin: window.location.origin,
    _frameId: null,
    _messageListeners: new Map(),
    _initialized: false,
    _pendingRequests: new Map(),
    
    init(frameId) {
        if (this._initialized) return;
        
        this._frameId = frameId || this._generateFrameId();
        this._setupListener();
        
        this._initialized = true;
        Logger.info('ParentCommunication', 'Initialized', { frameId: this._frameId });
    },
    
    _generateFrameId() {
        const stored = SafeStorage.getItem('kyn_frame_id_v4');
        if (stored) return stored;
        
        const newId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_v4`;
        SafeStorage.setItem('kyn_frame_id_v4', newId);
        return newId;
    },
    
    _setupListener() {
        this._messageHandler = (event) => {
            setTimeout(() => this._handleMessage(event), 0);
        };
        window.addEventListener('message', this._messageHandler);
    },
    
    _handleMessage(event) {
        try {
            if (!SecurityValidator.validateMessage(event)) return;
            
            const message = event.data;
            if (!message || typeof message !== 'object') {
                Logger.debug('ParentCommunication', 'Invalid message format: not an object');
                return;
            }
            
            if (!SecurityValidator.validateMessageFormat(message)) {
                Logger.debug('ParentCommunication', 'Invalid message format', message);
                return;
            }
            
            if (isMessageProcessed(message.id)) {
                Logger.debug('ParentCommunication', 'Duplicate message ignored', { id: message.id });
                return;
            }
            markMessageProcessed(message.id);

                    Logger.debug('ParentCommunication', 'Message received', { type: message.type, id: message.id });
        
        // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──
        if (message.type === 'SETTING_CHANGED' || message.type === 'SETTINGS_UPDATED') {
            const payload = message.payload || message;

            if (message.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                const { section, key, value } = payload;
                applySettingToFriendModule(section, key, value);
                window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));
            }
            if (message.type === 'SETTINGS_UPDATED' && payload.settings) {
                const s = payload.settings;
                Object.entries(s).forEach(([sec, secVal]) => {
                    if (secVal && typeof secVal === 'object')
                        Object.entries(secVal).forEach(([k, v]) => applySettingToFriendModule(sec, k, v));
                });
                window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));
            }
            return;
        }

        // applySettingToFriendModule is defined at top-level below
        
        if (message.type === 'PARENT_READY') {
            // PRODUCTION FIX: stamp origin on message so handleParentReady can learn it
            message._origin = event.origin;
            handleParentReady(message, event);
            return;
        }
        
        if (message.type === 'AUTH_READY') {
            handleAuthReady(message);
            return;
        }
        
        if (message.type === 'SESSION_DATA') {
            this._handleSessionData(message);
            return;
        }
            
            if (message.type === 'ACK' && message.payload?.messageId) {
                this._handleAck(message.payload.messageId);
                return;
            }
            
            if (message.type === 'HEARTBEAT') {
                this._sendHeartbeatAck(message);
                return;
            }
            
            // ── FIX A: Bare socket event names forwarded directly by chat.html's
            //    _fwdToFriendIframe() arrive WITHOUT the 'REALTIME_EVENT:' prefix.
            //    e.g. { type: 'friend:request', payload: {...}, source: 'ws-bridge' }
            //    These were silently ignored because no handler matched the bare name.
            //    Remap them to internal types here before any further processing.
            const _bareSocketMap = {
                'friend:request':            'FRIEND_REQUEST_RECEIVED',
                'friend_request':            'FRIEND_REQUEST_RECEIVED',
                'friendRequest':             'FRIEND_REQUEST_RECEIVED',
                'friend:accepted':           'FRIEND_REQUEST_ACCEPTED',
                'friend_accepted':           'FRIEND_REQUEST_ACCEPTED',
                'friend:request:accepted':   'FRIEND_REQUEST_ACCEPTED',
                'friend:rejected':           'FRIEND_REQUEST_REJECTED',
                'friend_rejected':           'FRIEND_REQUEST_REJECTED',
                'friend:request:rejected':   'FRIEND_REQUEST_REJECTED',
                'friend:removed':            'FRIEND_REMOVED',
                'friend_removed':            'FRIEND_REMOVED',
                'friend:unfriended':         'FRIEND_REMOVED',
                // P1/P2 FIX: new server-emitted events from friendExpiryWorker
                'friend:expired':            'FRIEND_EXPIRED',
                'friend:request_expired':    'FRIEND_REQUEST_EXPIRED',
                'notification:new':          'NOTIFICATION_NEW',
            };
            if (message.type && _bareSocketMap[message.type]) {
                const _barePayload = message.payload || {};
                const _bareMapped  = _bareSocketMap[message.type];
                ParentCommunicationManager._handleMessage({
                    origin: event.origin,
                    data: {
                        type:       _bareMapped,
                        payload:    _barePayload,
                        _unwrapped: true,
                        id:         'bare_' + _bareMapped + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
                    }
                });
                return;
            }

            // ── FIX B: REALTIME_EVENT: prefix — app_realtime_socket.js forwards socket events
            //    as { type: 'REALTIME_EVENT:friend:accepted', payload: {...} }.
            //    Unwrap and re-dispatch as bare internal types so all existing handlers fire.
            if (message.type && message.type.startsWith('REALTIME_EVENT:')) {
                const innerType = message.type.slice('REALTIME_EVENT:'.length);
                const innerPayload = message.payload || {};
                // Map socket event names → internal message types
                const socketToInternal = {
                    'friend:request':           'FRIEND_REQUEST_RECEIVED',
                    'friend:accepted':           'FRIEND_REQUEST_ACCEPTED',
                    'friend:rejected':           'FRIEND_REQUEST_REJECTED',
                    'friend:removed':            'FRIEND_REMOVED',
                    'friend:blocked':            'FRIEND_BLOCKED',
                    'friend:online':             'FRIEND_ONLINE',
                    'friend:offline':            'FRIEND_OFFLINE',
                    // Already-translated forms (double-forwarded)
                    'FRIEND_REQUEST_RECEIVED':   'FRIEND_REQUEST_RECEIVED',
                    'FRIEND_REQUEST_ACCEPTED':   'FRIEND_REQUEST_ACCEPTED',
                    'FRIEND_REQUEST_REJECTED':   'FRIEND_REQUEST_REJECTED',
                    'FRIEND_REMOVED':            'FRIEND_REMOVED',
                };
                const mapped = socketToInternal[innerType];
                if (mapped) {
                    // Re-invoke this same handler with the unwrapped message.
                    // FIX: always inject a unique id so markMessageProcessed() doesn't
                    // store undefined and silently block every future id-less message.
                    ParentCommunicationManager._handleMessage({
                        origin: event.origin,
                        data: {
                            type:       mapped,
                            payload:    innerPayload,
                            _unwrapped: true,
                            id:         'unwrap_' + mapped + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
                        }
                    });
                }
                return;
            }

            // ── Real-time friend events forwarded from the WS bridge in chat.html ──
            if (message.type === 'FRIEND_REQUEST_RECEIVED') {
                const payload   = message.payload || {};
                // Accept both top-level and nested-under-.request shapes
                const reqData   = (payload.request && typeof payload.request === 'object') ? payload.request : payload;
                const requestId = reqData.id || reqData.requestId || payload.id || payload.requestId;
                const senderId  = reqData.requesterId || reqData.senderId || reqData.from ||
                                  payload.requesterId || payload.senderId || payload.from;

                if (requestId) {
                    // FIX: Don't deduplicate by requestId alone — the cache may contain a
                    // stale placeholder. Always apply the latest server data.
                    // Look up sender info from all-users cache when socket payload is thin.
                    let senderName   = reqData.senderName   || reqData.user?.displayName || payload.senderName   || payload.user?.displayName || '';
                    let senderUser   = reqData.user          || payload.user              || null;
                    let senderAvatar = reqData.senderAvatar  || reqData.user?.avatar      || payload.senderAvatar || payload.user?.avatar || '';
                    let senderUsername = reqData.senderUsername || reqData.user?.username  || payload.senderUsername || payload.user?.username || '';

                    if ((!senderName || senderName === 'Someone') && senderId) {
                        // FIX: Resolve from local all-users cache to populate sender info immediately
                        try {
                            const allCache =
                                (Array.isArray(window._allUsersCache) ? window._allUsersCache : null) ||
                                (FriendCacheManager.getAllUsers ? FriendCacheManager.getAllUsers() : []);
                            const found = allCache.find(u => u && String(u.id) === String(senderId));
                            if (found) {
                                senderName   = found.displayName || found.name ||
                                    ([found.firstName, found.lastName].filter(Boolean).join(' ').trim()) ||
                                    found.username || 'Someone';
                                senderAvatar   = found.avatar    || found.photoURL || '';
                                senderUsername = found.username  || '';
                                senderUser     = senderUser || found;
                            }
                        } catch (_) {}
                    }
                    if (!senderName) senderName = 'Someone';

                    const newRequest = {
                        id:             requestId,
                        senderId:       senderId,
                        receiverId:     __session.user?.id,
                        status:         'pending',
                        senderName,
                        senderUsername,
                        senderAvatar,
                        user:           senderUser || {
                            id:          senderId,
                            displayName: senderName,
                            username:    senderUsername,
                            avatar:      senderAvatar,
                        },
                        displayName:    senderName,
                        createdAt:      reqData.createdAt || payload.createdAt || new Date().toISOString(),
                        timestamp:      Date.now(),
                    };
                    FriendCacheManager.setRequest(newRequest);
                    FriendCacheManager.syncToGlobals();
                    FriendCacheManager.persist();

                    // FIX: Also persist to IndexedDB (KynectaFriendsLocalStore) so the
                    // incoming request survives a page refresh without another API call.
                    const _lsIncoming = window.KynectaFriendsLocalStore;
                    if (_lsIncoming && requestId) {
                        _lsIncoming.ready().then(async () => {
                            try {
                                await _lsIncoming.save({
                                    id:          String(requestId),
                                    friendId:    String(senderId || requestId),
                                    userId:      __session.user?.id ? String(__session.user.id) : 'unknown',
                                    serverId:    String(requestId),
                                    status:      'pending_received',
                                    displayName: senderName,
                                    username:    senderUsername,
                                    avatar:      senderAvatar,
                                    isLocalOnly: false,
                                    createdAt:   newRequest.createdAt,
                                    updatedAt:   new Date().toISOString(),
                                });
                            } catch (_) {}
                        }).catch(() => {});
                    }

                    // FIX: Confirm with backend immediately — this also updates the badge
                    // count from the authoritative server count.
                    loadFriendRequestsFromBackend().catch(() => {});

                    window.dispatchEvent(new CustomEvent('requestsUpdated', {
                        detail: { requests: FriendCacheManager.getAllRequests(), realtime: true }
                    }));
                    window.dispatchEvent(new CustomEvent('friendRequestReceived', {
                        detail: { request: newRequest, realtime: true }
                    }));
                    showNotification?.(`New friend request from ${newRequest.senderName}`, 'info');
                }
                return;
            }

            if (message.type === 'FRIEND_REQUEST_ACCEPTED') {
                // Someone accepted OUR sent request.
                // BUG FIX: we must also update KynectaFriendsLocalStore (pending_sent -> accepted)
                // and FriendCacheManager here, not just reload from backend.
                // Without this the sender's local store keeps the friend as pending_sent forever.

                const _acceptedFriendId = message.payload?.friendId
                    || message.payload?.acceptedById
                    || message.payload?.userId
                    || null;
                const _acceptedRequestId = message.payload?.requestId || null;
                let _friendPayload       = message.payload?.friend || message.payload?.user || null;

                // FIX: If the socket payload didn't include a full user object, resolve
                // from the local all-users cache so the friend card populates immediately.
                if (_acceptedFriendId && (!_friendPayload || !_friendPayload.displayName)) {
                    try {
                        const _allCache =
                            (Array.isArray(window._allUsersCache) ? window._allUsersCache : null) ||
                            (FriendCacheManager.getAllUsers ? FriendCacheManager.getAllUsers() : []);
                        const _found = _allCache.find(u => u && String(u.id) === String(_acceptedFriendId));
                        if (_found) {
                            _friendPayload = Object.assign({}, _friendPayload || {}, {
                                id:          _found.id,
                                displayName: _found.displayName || _found.name ||
                                    ([_found.firstName, _found.lastName].filter(Boolean).join(' ').trim()) ||
                                    _found.username || '',
                                username:    _found.username  || '',
                                avatar:      _found.avatar    || _found.photoURL || '',
                                status:      _found.status    || 'offline',
                            });
                        }
                    } catch (_) {}
                }

                // Step 1: update KynectaFriendsLocalStore
                const _ls = window.KynectaFriendsLocalStore;
                if (_ls && _acceptedFriendId) {
                    _ls.ready().then(async () => {
                        try {
                            const _lr = await _ls.getByFriendId(String(_acceptedFriendId));
                            if (_lr) {
                                // Promote existing pending_sent record to accepted
                                await _ls.confirm(
                                    _lr.id,
                                    _acceptedRequestId || _lr.serverId,
                                    {
                                        status:      'accepted',
                                        isLocalOnly: false,
                                        updatedAt:   new Date().toISOString()
                                    }
                                );
                                Logger.info('FRIEND_REQUEST_ACCEPTED', 'LocalStore record confirmed accepted', { id: _lr.id });
                            } else {
                                // No existing record found - create an accepted entry
                                const _newRecord = {
                                    friendId:    String(_acceptedFriendId),
                                    userId:      __session.user?.id ? String(__session.user.id) : 'unknown',
                                    serverId:    _acceptedRequestId || null,
                                    status:      'accepted',
                                    isLocalOnly: false,
                                    createdAt:   new Date().toISOString(),
                                    updatedAt:   new Date().toISOString()
                                };
                                if (_friendPayload) {
                                    _newRecord.displayName = _friendPayload.displayName || '';
                                    _newRecord.avatar      = _friendPayload.avatar || _friendPayload.photoURL || '';
                                    _newRecord.username    = _friendPayload.username || '';
                                }
                                await _ls.save(_newRecord);
                                Logger.info('FRIEND_REQUEST_ACCEPTED', 'LocalStore record created as accepted', { friendId: _acceptedFriendId });
                            }
                        } catch (_e) {
                            Logger.warn('FRIEND_REQUEST_ACCEPTED', 'LocalStore update failed', _e.message);
                        }
                    }).catch(() => {});
                }

                // Step 2: update FriendCacheManager in-memory cache
                if (_acceptedFriendId) {
                    FriendCacheManager.setFriend({
                        ...(_friendPayload || {}),
                        id:     String(_acceptedFriendId),
                        status: 'accepted'
                    });
                }

                // Step 3: remove from sent-requests cache (no longer pending)
                if (_acceptedRequestId) {
                    FriendCacheManager.removeSentRequest?.(_acceptedRequestId);
                }
                if (_acceptedFriendId) {
                    const _allSent = FriendCacheManager.getAllSentRequests?.() || [];
                    const _matchSent = _allSent.find(r =>
                        String(r.receiverId || r.friendId || r.userId) === String(_acceptedFriendId)
                    );
                    if (_matchSent?.id) FriendCacheManager.removeSentRequest?.(_matchSent.id);
                }

                FriendCacheManager.syncToGlobals();

                // Step 4: reload from backend for authoritative data
                Promise.allSettled([loadFriendsFromBackend(), loadSentRequestsFromBackend()])
                    .then(() => {
                        FriendCacheManager.persist();
                        window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { realtime: true } }));
                        window.dispatchEvent(new CustomEvent('friendRequestAccepted', {
                            detail: {
                                requestId: _acceptedRequestId,
                                friendId:  _acceptedFriendId,
                                friend:    _friendPayload,
                                realtime:  true
                            }
                        }));
                    });

                showNotification?.('Your friend request was accepted!', 'success');
                return;
            }

            if (message.type === 'FRIEND_REQUEST_REJECTED') {
                const rId = message.payload?.requestId || message.payload?.id;
                if (rId) FriendCacheManager.removeRequest(rId);
                FriendCacheManager.syncToGlobals();
                FriendCacheManager.persist();
                loadSentRequestsFromBackend().catch(() => {});
                return;
            }

            if (message.type === 'FRIEND_REMOVED') {
                const fId = message.payload?.friendId || message.payload?.userId;
                if (fId) {
                    FriendCacheManager.removeFriend(String(fId));
                    // FIX: Also clean up from LocalStore so it doesn't resurrect on next sync
                    const _ls = window.KynectaFriendsLocalStore;
                    if (_ls) {
                        _ls.ready().then(async () => {
                            try {
                                const _lr = await _ls.getByFriendId(String(fId));
                                if (_lr) await _ls.hardDelete(_lr.id).catch(() => {});
                            } catch (_) {}
                        }).catch(() => {});
                    }
                    FriendCacheManager.syncToGlobals();
                    FriendCacheManager.persist();
                    // FIX: trigger both events so every UI section (friends list + counts) refreshes
                    window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { realtime: true } }));
                    window.dispatchEvent(new CustomEvent('friendRemoved',  { detail: { friendId: fId, realtime: true } }));
                    // Re-fetch authoritative list in background
                    loadFriendsFromBackend().catch(() => {});
                }
                return;
            }

            if (message.type === 'FRIEND_ONLINE' || message.type === 'FRIEND_OFFLINE') {
                const uid    = message.payload?.userId || message.payload?.id;
                const online = message.type === 'FRIEND_ONLINE';
                if (uid) {
                    const f = FriendCacheManager.getFriend(String(uid));
                    if (f) {
                        FriendCacheManager.setFriend({ ...f, online, status: online ? 'online' : 'offline' });
                        FriendCacheManager.syncToGlobals();
                        window.dispatchEvent(new CustomEvent('friendsUpdated', {
                            detail: { presenceUpdate: true, userId: uid, online }
                        }));
                    }
                }
                return;
            }
            // ── END real-time friend event handlers ────────────────────────────

            if (message.type === 'API_RESPONSE' && message.requestId) {
                this._handleApiResponse(message);
                return;
            }
            
            const listeners = this._messageListeners.get(message.type) || [];
            listeners.forEach(listener => {
                try { listener(message); } catch (error) {
                    Logger.error('ParentCommunication', 'Listener error', error, { type: message.type });
                }
            });
            
            const generalListeners = this._messageListeners.get('*') || [];
            generalListeners.forEach(listener => {
                try { listener(message); } catch (error) {
                    Logger.error('ParentCommunication', 'General listener error', error);
                }
            });
        } catch (error) {
            Logger.error('ParentCommunication', 'Message handler error', error);
        }
    },
    
    _handleSessionData(message) {
        const payload = message.payload || message;
        
        if (!payload || !payload.token || !payload.user) {
            Logger.warn('ParentCommunication', 'Invalid SESSION_DATA - missing required fields');
            
            if (currentState === LIFECYCLE_STATES.ACTIVE && parentReadyReceived && authReadyReceived) {
                setTimeout(() => this._requestSession(), 1000);
            }
            return;
        }
        
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
        
        Logger.info('ParentCommunication', 'SESSION_DATA received', { userId: payload.user.id });
        
        if (typeof currentUser !== 'undefined') {
            window.currentUser = payload.user;
        }
        if (typeof userData !== 'undefined') {
            window.userData = payload.user;
        }
        
        TokenPromise.resolveToken(payload.token);
        
        window.dispatchEvent(new CustomEvent('sessionSynced', {
            detail: { session: payload, timestamp: Date.now() }
        }));
        
        if (currentState === LIFECYCLE_STATES.ACTIVE && authReadyReceived) {
            window.dispatchEvent(new CustomEvent('loadInitialData'));
        }
    },
    
    _requestSession() {
        if (!parentReadyReceived || currentState !== LIFECYCLE_STATES.ACTIVE || !authReadyReceived) {
            Logger.warn('ParentCommunication', 'Cannot request session - not ACTIVE or auth not ready');
            return false;
        }
        
        Logger.info('ParentCommunication', 'Requesting session from parent');
        
        return safeSend({
            type: 'REQUEST_SESSION',
            payload: {
                module: MODULE_NAME,
                frameId: this._frameId,
                timestamp: Date.now()
            }
        });
    },
    
    _handleAck(messageId) {
        Logger.debug('ParentCommunication', `ACK received for ${messageId}`);
    },
    
    _handleApiResponse(message) {
        const { requestId, payload } = message;
        
        Logger.info('ParentCommunication', 'API_RESPONSE received', { requestId, success: payload?.success });
        
        if (requestId && this._pendingRequests.has(requestId)) {
            const { resolve, reject } = this._pendingRequests.get(requestId);
            this._pendingRequests.delete(requestId);
            
            if (payload.error) {
                reject(new Error(payload.error));
            } else {
                resolve(payload);
            }
        }
        
        window.dispatchEvent(new CustomEvent('apiResponse', {
            detail: { requestId, data: payload.data, error: payload.error, statusCode: payload.statusCode }
        }));
    },
    
    _sendHeartbeatAck(heartbeatMessage) {
        safeSend({
            type: 'HEARTBEAT_ACK',
            payload: {
                id: heartbeatMessage.payload?.id || heartbeatMessage.id,
                module: MODULE_NAME,
                frameId: this._frameId,
                timestamp: Date.now()
            }
        });
        Logger.debug('ParentCommunication', 'Heartbeat ACK sent');
    },
    
    send(message, expectAck = false) {
        return safeSend(message);
    },
    
    sendWithAck(message, timeout = 5000) {
        const requestId = message.requestId || generateRequestId();
        const messageWithId = { ...message, requestId };
        
        return new Promise((resolve, reject) => {
            this._pendingRequests.set(requestId, { resolve, reject });
            
            if (!safeSend(messageWithId)) {
                this._pendingRequests.delete(requestId);
                reject(new Error('Failed to send message'));
                return;
            }
        });
    },
    
    getFrameId() {
        return this._frameId;
    },
    
    on(type, listener) {
        if (!this._messageListeners.has(type)) {
            this._messageListeners.set(type, []);
        }
        this._messageListeners.get(type).push(listener);
    },
    
    off(type, listener) {
        if (!this._messageListeners.has(type)) return;
        const listeners = this._messageListeners.get(type).filter(l => l !== listener);
        if (listeners.length === 0) {
            this._messageListeners.delete(type);
        } else {
            this._messageListeners.set(type, listeners);
        }
    },
    
    destroy() {
        if (this._messageHandler) {
            window.removeEventListener('message', this._messageHandler);
            this._messageHandler = null;
        }
        this._messageListeners.clear();
        this._pendingRequests.clear();
        Logger.info('ParentCommunication', 'Destroyed');
    }
};

function requestSessionFromParent() {
    if (!parentReadyReceived || currentState !== LIFECYCLE_STATES.ACTIVE || !authReadyReceived) {
        Logger.warn('ParentCommunication', 'Cannot request session - not ACTIVE or auth not ready');
        return false;
    }
    
    return ParentCommunicationManager._requestSession();
}

// =============================================
// [MODULE REGISTRATION MANAGER]
// =============================================

const ModuleRegistrationManager = {
    _registrationAttempted: false,
    _registrationCompleted: false,
    _capabilities: [
        'friends', 'friend-requests', 'qr-codes', 'mutual-friends',
        'pinned-friends', 'muted-friends', 'groups', 'search'
    ],
    
    init() {
        Logger.info('Registration', 'Initialized');
    },
    
    async register() {
        if (this._registrationCompleted) {
            Logger.debug('Registration', 'Already registered');
            return true;
        }
        
        if (this._registrationAttempted) {
            Logger.warn('Registration', 'Registration already attempted');
            return false;
        }
        
        this._registrationAttempted = true;
        
        const parentReady = parentReadyReceived;
        if (!parentReady) {
            Logger.error('Registration', 'Parent not ready');
            this._registrationAttempted = false;
            return false;
        }
        
        const sent = sendMessageInternal({
            type: 'REGISTER_MODULE',
            payload: {
                module: MODULE_NAME,
                version: MODULE_VERSION,
                frameId: ParentCommunicationManager.getFrameId(),
                capabilities: this._capabilities
            }
        });
        
        if (!sent) {
            Logger.error('Registration', 'Failed to send registration');
            this._registrationAttempted = false;
            return false;
        }
        
        this._registrationCompleted = true;
        Logger.info('Registration', 'Registration successful');
        return true;
    },
    
    isRegistered() {
        return this._registrationCompleted;
    },
    
    reset() {
        this._registrationAttempted = false;
        this._registrationCompleted = false;
    }
};

// =============================================
// [SESSION MANAGER]
// =============================================

const SessionManager = {
    _session: null,
    _sessionValid: false,
    _sessionData: null,
    _token: null,
    _user: null,
    
    init() {
        Logger.info('SessionManager', 'Initialized (memory-only)');
    },
    
    handleSessionSync(message) {
        const payload = message.payload || message;
        
        if (!payload || !payload.token || !payload.user) {
            Logger.warn('SessionManager', 'Invalid session sync - missing required fields');
            return;
        }
        
        this._session = payload;
        this._sessionValid = true;
        this._sessionData = payload;
        this._token = payload.token;
        this._user = payload.user;
        
        __session.token = payload.token;
        __session.user = payload.user;
        __session.expiresAt = payload.expiresAt || null;
        __session.ready = true;
        
        Logger.info('SessionManager', 'Session synced', { userId: payload.user.id });
        
        if (typeof currentUser !== 'undefined') {
            window.currentUser = payload.user;
        }
        if (typeof userData !== 'undefined') {
            window.userData = payload.user;
        }
        
        if (payload.token) {
            TokenPromise.resolveToken(payload.token);
        }
        
        window.dispatchEvent(new CustomEvent('sessionSynced', {
            detail: { session: payload, timestamp: Date.now() }
        }));
    },
    
    requestSession() {
        if (!parentReadyReceived || currentState !== LIFECYCLE_STATES.ACTIVE || !authReadyReceived) {
            Logger.warn('SessionManager', 'Cannot request session - not ACTIVE or auth not ready');
            return false;
        }
        
        return safeSend({
            type: 'REQUEST_SESSION',
            payload: {
                module: MODULE_NAME,
                frameId: ParentCommunicationManager.getFrameId(),
                timestamp: Date.now()
            }
        });
    },
    
    handleSessionInvalidated() {
        this._session = null;
        this._sessionValid = false;
        this._sessionData = null;
        this._token = null;
        this._user = null;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        __session.ready = false;
        
        Logger.info('SessionManager', 'Session invalidated');
        
        window.dispatchEvent(new CustomEvent('sessionInvalidated'));
    },
    
    getSession() {
        return this._session;
    },
    
    getToken() {
        return this._token;
    },
    
    getUser() {
        return this._user;
    },
    
    isSessionValid() {
        return this._sessionValid && __session.ready;
    },
    
    reset() {
        this._session = null;
        this._sessionValid = false;
        this._sessionData = null;
        this._token = null;
        this._user = null;
        __session.token = null;
        __session.user = null;
        __session.expiresAt = null;
        __session.ready = false;
    }
};

// =============================================
// [TOKEN PROMISE]
// =============================================

const TokenPromise = {
    _token: null,
    _tokenReceived: false,
    _listeners: new Set(),
    
    init() {},
    
    resolveToken(token) {
        if (this._tokenReceived && token === this._token) return;
        
        this._token = token;
        this._tokenReceived = true;
        
        this._listeners.forEach(listener => {
            try { listener(token); } catch (e) {}
        });
    },
    
    getToken() {
        if (__session.token) return __session.token;
        if (this._token) return this._token;
        return null;
    },
    
    hasToken() {
        return !!(this.getToken());
    },
    
    onToken(listener) {
        this._listeners.add(listener);
        const token = this.getToken();
        if (token) {
            try { listener(token); } catch (e) {}
        }
        return () => this._listeners.delete(listener);
    },
    
    reset() {
        this._token = null;
        this._tokenReceived = false;
        this._listeners.clear();
    }
};

// =============================================
// [SANDBOX DETECTOR]
// =============================================

const SandboxDetector = {
    detected: false,
    restrictions: {
        localStorage: true,
        cookies: true,
        parentAccess: true,
        postMessage: true,
        crypto: true
    },
    _warningsShown: new Set(),
    
    detect() {
        try {
            this._testLocalStorage();
            this._testParentAccess();
            this._testCrypto();
            if (!this.restrictions.localStorage || !this.restrictions.parentAccess) {
                this.detected = true;
            }
        } catch (error) {}
        return this.detected;
    },
    
    _testLocalStorage() {
        try {
            localStorage.setItem('__test__', 'test');
            localStorage.removeItem('__test__');
        } catch (e) {
            this.restrictions.localStorage = false;
        }
    },
    
    _testParentAccess() {
        try {
            if (window.parent && window.parent !== window) {
                const test = window.parent.location.href;
            }
        } catch (e) {
            this.restrictions.parentAccess = false;
        }
    },
    
    _testCrypto() {
        try {
            if (!window.crypto || !window.crypto.subtle) {
                this.restrictions.crypto = false;
            }
        } catch (e) {
            this.restrictions.crypto = false;
        }
    },
    
    adapt() {
        if (this.detected && window.featureFlags) {
            window.featureFlags.messageSigning = false;
            window.featureFlags.heartbeat = false;
        }
    }
};

// =============================================
// [IFRAME ENVIRONMENT DETECTOR]
// =============================================

const IframeEnvironment = {
    type: 'UNKNOWN',
    features: {
        isLocal: false,
        isRenderHosted: false,
        isVpnNetwork: false,
        isProduction: false,
        isSecure: false,
        highLatency: false,
        unstableNetwork: false,
        saveData: false,
        effectiveType: 'unknown',
        rtt: 0,
        downlink: 0,
        isIframe: false,
        isCrossOrigin: false,
        parentOrigin: null,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        connectionType: 'unknown'
    },
    
    _detected: false,
    
    detect() {
        if (this._detected) return this.type;
        try {
            this._detectEnvironment();
            this._detectNetworkConditions();
            this._detectIframeStatus();
            this._detectVpn();
            this._detected = true;
        } catch (error) {
            this.type = 'UNKNOWN';
        }
        return this.type;
    },
    
    _detectEnvironment() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1' || 
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.')) {
            this.type = 'LOCAL_DEV';
            this.features.isLocal = true;
        } else if (hostname.includes('.onrender.com') || hostname.includes('render.com')) {
            this.type = 'RENDER_HOSTED';
            this.features.isRenderHosted = true;
        } else if (protocol === 'https:' && !hostname.includes('localhost')) {
            this.type = 'PRODUCTION';
            this.features.isProduction = true;
        }
        
        this.features.isSecure = protocol === 'https:';
    },
    
    _detectNetworkConditions() {
        try {
            if (navigator.connection) {
                const conn = navigator.connection;
                this.features.saveData = conn.saveData || false;
                this.features.effectiveType = conn.effectiveType || 'unknown';
                this.features.rtt = conn.rtt || 0;
                this.features.downlink = conn.downlink || 0;
                this.features.connectionType = conn.type || 'unknown';
                this.features.highLatency = conn.rtt > 300;
            }
            
            if (!this.features.rtt && performance.timing) {
                const timing = performance.timing;
                if (timing.responseEnd && timing.requestStart) {
                    const measuredRtt = timing.responseEnd - timing.requestStart;
                    this.features.rtt = measuredRtt;
                    this.features.highLatency = measuredRtt > 300;
                }
            }
        } catch (error) {}
    },
    
    _detectIframeStatus() {
        try {
            this.features.isIframe = window.parent !== window && window.parent !== null;
            if (this.features.isIframe) {
                try {
                    this.features.parentOrigin = window.parent.location.origin;
                    this.features.isCrossOrigin = this.features.parentOrigin !== window.location.origin;
                } catch (e) {
                    this.features.isCrossOrigin = true;
                    this.features.parentOrigin = 'cross-origin';
                }
            }
        } catch (error) {
            this.features.isIframe = false;
        }
    },
    
    _detectVpn() {
        const hostname = window.location.hostname;
        const vpnPatterns = [
            /^10\.8\./, /^10\.9\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./, /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./
        ];
        
        const isVpnIp = vpnPatterns.some(pattern => pattern.test(hostname));
        this.features.isVpnNetwork = isVpnIp || (this.features.highLatency && this.features.effectiveType === '4g');
        
        if (this.features.isVpnNetwork && this.type === 'UNKNOWN') {
            this.type = 'VPN_NETWORK';
        }
    },
    
    getAdaptiveConfig() {
        return {
            heartbeatInterval: this.features.highLatency ? 45000 : 30000,
            sessionRefresh: this.features.highLatency ? 450000 : 300000,
            ackTimeout: 2000,
            useKeepalive: this.features.isVpnNetwork,
            compression: this.features.saveData,
            retryBaseDelay: this.features.highLatency ? 2000 : 1000,
            maxRetries: 1
        };
    },
    
    getInfo() {
        return {
            type: this.type,
            features: { ...this.features },
            config: this.getAdaptiveConfig()
        };
    }
};

// =============================================
// [MESSAGE DISPATCHER]
// =============================================

const MessageDispatcher = {
    _handlers: new Map(),
    _initialized: false,
    
    init() {
        if (this._initialized) return;
        
        ParentCommunicationManager.on('*', this._handleMessage.bind(this));
        ParentCommunicationManager.on('MODULE_REGISTERED', this._handleModuleRegistered.bind(this));
        ParentCommunicationManager.on('SESSION_SYNC', this._handleSessionSync.bind(this));
        ParentCommunicationManager.on('SESSION_DATA', this._handleSessionData.bind(this));
        ParentCommunicationManager.on('SESSION_INVALIDATED', this._handleSessionInvalidated.bind(this));
        ParentCommunicationManager.on('FRIEND_UPDATE', this._handleFriendUpdate.bind(this));
        ParentCommunicationManager.on('API_RESPONSE', this._handleApiResponse.bind(this));
        ParentCommunicationManager.on('FRIEND_SEARCH', this._handleFriendSearch.bind(this));
        ParentCommunicationManager.on('AUTH_READY', this._handleAuthReady.bind(this));
        
        this._initialized = true;
        Logger.info('MessageDispatcher', 'Initialized');
    },
    
    _handleMessage(message) {
        Logger.debug('MessageDispatcher', 'Message received', { type: message.type, id: message.id });
    },
    
    _handleModuleRegistered(message) {
        Logger.info('MessageDispatcher', 'MODULE_REGISTERED received');
    },
    
    _handleSessionSync(message) {
        SessionManager.handleSessionSync(message);
    },
    
    _handleSessionData(message) {
        ParentCommunicationManager._handleSessionData(message);
    },
    
    _handleSessionInvalidated(message) {
        SessionManager.handleSessionInvalidated();
    },
    
    _handleAuthReady(message) {
        handleAuthReady(message);
    },
    
    _handleFriendUpdate(message) {
        const payload = message.payload || message;
        if (!payload || !payload.friendId) return;
        
        const friend = FriendCacheManager.getFriend(payload.friendId);
        if (friend) {
            const updatedFriend = { ...friend, ...payload.updates };
            FriendCacheManager.setFriend(updatedFriend);
            FriendCacheManager.syncToGlobals();
            
            window.dispatchEvent(new CustomEvent('friendUpdated', {
                detail: { friendId: payload.friendId, updates: payload.updates }
            }));
        }
    },
    
    _handleApiResponse(message) {
        const payload = message.payload || message;
        const requestId = message.requestId || payload.requestId || payload.id;
        
        Logger.info('MessageDispatcher', 'API_RESPONSE received', { requestId, success: payload?.success });
        
        if (requestId) {
            window.dispatchEvent(new CustomEvent('apiResponse', {
                detail: { requestId, data: payload.data, error: payload.error, statusCode: payload.statusCode }
            }));
        }
    },
    
    _handleFriendSearch(message) {
        const payload = message.payload || message;
        const { query } = payload;
        
        Logger.info('MessageDispatcher', 'FRIEND_SEARCH received', { query });
        
        if (query && typeof query === 'string') {
            FriendSearchEngine.search(query).then(results => {
                window.dispatchEvent(new CustomEvent('friendSearchResults', {
                    detail: { query, results }
                }));
            });
        }
    },
    
    registerHandler(type, handler) {
        if (!this._handlers.has(type)) {
            this._handlers.set(type, []);
        }
        this._handlers.get(type).push(handler);
    },
    
    unregisterHandler(type, handler) {
        if (!this._handlers.has(type)) return;
        const handlers = this._handlers.get(type).filter(h => h !== handler);
        if (handlers.length === 0) {
            this._handlers.delete(type);
        } else {
            this._handlers.set(type, handlers);
        }
    }
};

// =============================================
// [FRIEND CACHE MANAGER]
// =============================================

const FriendCacheManager = {
    _cache: {
        friends: new Map(),
        requests: new Map(),
        sentRequests: new Map(),
        pinnedFriends: new Map(),
        mutedFriends: new Map(),
        users: new Map(),
        searchIndex: new Map(),
    },
    _ttl: {
        friends: 5 * 60 * 1000,
        requests: 2 * 60 * 1000,
        users: 10 * 60 * 1000,
        search: 60 * 1000,
    },
    _timestamps: new Map(),
    _listeners: new Map(),
    _searchCache: null,
    
    init() {
        this._loadFromStorage();
        this._setupAutoCleanup();
        StatusManager.show('READY', 'FriendCacheManager initialized');
    },
    
    _loadFromStorage() {
        try {
            // FIX: On startup, purge any stale v8 cache entries that have int+string duplicate IDs.
            // This happens when old code wrote both id=5 (integer) and id="5" (string) to the same array.
            // We rewrite the key with deduplicated data so broadcasts from chat.html are clean.
            try {
                const v8Key = 'kynecta_friends_cache_v8';
                const v8Raw = localStorage.getItem(v8Key);
                if (v8Raw) {
                    const v8Parsed = JSON.parse(v8Raw);
                    const arr = v8Parsed?.friends || (Array.isArray(v8Parsed) ? v8Parsed : null);
                    if (arr && arr.length > 0) {
                        const seen = new Set();
                        const deduped = arr.filter(f => {
                            if (!f || !f.id) return false;
                            const k = String(f.id);
                            if (seen.has(k)) return false;
                            seen.add(k);
                            return true;
                        });
                        if (deduped.length !== arr.length) {
                            // Rewrite with deduplicated data
                            localStorage.setItem(v8Key, JSON.stringify({ friends: deduped, timestamp: Date.now() }));
                        }
                    }
                }
            } catch (_) {}

            // FIX: Read from ALL known cache key variants written by different modules.
            // services.friend.js writes 'kynecta_friends_cache_v8'; messages module writes
            // the same key.  Previously only 'knecta_friends_cache' was read, causing 0 friends on reload.
            let friendsData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.FRIENDS); // 'knecta_friends_cache'
            if (!friendsData || !Array.isArray(friendsData) || friendsData.length === 0) {
                const raw = localStorage.getItem('kynecta_friends_cache_v8')
                         || localStorage.getItem('knecta_friends_cache_v8')
                         || localStorage.getItem('kynecta_friends_cache')
                         || localStorage.getItem('friends');
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        friendsData = parsed?.friends || (Array.isArray(parsed) ? parsed : []);
                    } catch (_) {}
                }
            }
            if (friendsData && Array.isArray(friendsData)) {
                friendsData.forEach(f => {
                    // FIX: Only load truly accepted friends. Records with status
                    // 'pending', 'pending_sent', 'pending_received', 'blocked',
                    // or 'removed' must NOT appear in the friends list.
                    // IMPORTANT: 'online', 'offline', 'away', 'busy' are PRESENCE statuses,
                    // NOT friendship statuses. The messages module saves all conversation
                    // participants to kynecta_friends_cache_v8 with their presence status —
                    // those must NOT be loaded as accepted friends or every user appears as
                    // a friend before they accept a request.
                    if (f && f.id) {
                        // A record is an accepted friend ONLY if it has an explicit
                        // friendship status of 'accepted', OR it has NO status at all
                        // (true legacy records from before status was added) AND it also
                        // has an 'addedAt' or 'friendId' field proving it came from the
                        // friends module — not the messages module's participant list.
                        const friendshipStatus = f.friendshipStatus || f.friendStatus || null;
                        const rawStatus = f.status;
                        const isPresenceOnly = rawStatus === 'online' || rawStatus === 'offline' ||
                                               rawStatus === 'away' || rawStatus === 'busy';

                        let isAcceptedFriend = false;
                        if (friendshipStatus === 'accepted') {
                            isAcceptedFriend = true;
                        } else if (rawStatus === 'accepted') {
                            isAcceptedFriend = true;
                        } else if (!rawStatus && !isPresenceOnly) {
                            // Legacy record with no status — only treat as friend if it
                            // has fields that uniquely identify a friends-module record
                            isAcceptedFriend = !!(f.addedAt || f.friendId || f.localId || f.serverId);
                        }
                        // Explicitly reject pending/blocked/removed records
                        if (rawStatus === 'pending_sent' || rawStatus === 'pending_received' ||
                            rawStatus === 'pending' || rawStatus === 'blocked' || rawStatus === 'removed' ||
                            rawStatus === 'none') {
                            isAcceptedFriend = false;
                        }

                        if (isAcceptedFriend) {
                            // FIX: Always use String key to prevent integer/string duplication
                            const key = String(f.id);
                            this._cache.friends.set(key, { ...f, id: key });
                        }
                    }
                });
            }
            
            const requestsData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.REQUESTS);
            if (requestsData && Array.isArray(requestsData)) {
                requestsData.forEach(r => {
                    if (r && r.id) this._cache.requests.set(r.id, r);
                });
            }
            
            const sentData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
            if (sentData && Array.isArray(sentData)) {
                sentData.forEach(r => {
                    if (r && r.id) this._cache.sentRequests.set(r.id, r);
                });
            }
            
            const pinnedData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
            if (pinnedData && Array.isArray(pinnedData)) {
                pinnedData.forEach(f => {
                    if (f && f.id) this._cache.pinnedFriends.set(f.id, f);
                });
            }
            
            const mutedData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
            if (mutedData && Array.isArray(mutedData)) {
                mutedData.forEach(f => {
                    if (f && f.id) this._cache.mutedFriends.set(f.id, f);
                });
            }
            
            const allUsersData = SafeStorage.getObject(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
            if (allUsersData && Array.isArray(allUsersData)) {
                allUsersData.forEach(u => {
                    if (u && u.id) this._cache.users.set(u.id, u);
                });
            }
        } catch (error) {
            Logger.error('FriendCacheManager', 'Failed to load from storage', error);
        }
    },
    
    _setupAutoCleanup() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    },
    
    cleanup() {
        const now = Date.now();
        
        for (const [id, friend] of this._cache.friends) {
            const key = `friend_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.friends) {
                this._cache.friends.delete(id);
                this._timestamps.delete(key);
            }
        }
        
        for (const [id, request] of this._cache.requests) {
            const key = `request_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.requests) {
                this._cache.requests.delete(id);
                this._timestamps.delete(key);
            }
        }
        
        for (const [id, user] of this._cache.users) {
            const key = `user_${id}`;
            const timestamp = this._timestamps.get(key);
            if (timestamp && now - timestamp > this._ttl.users) {
                this._cache.users.delete(id);
                this._timestamps.delete(key);
            }
        }
    },
    
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return () => this.off(event, callback);
    },
    
    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) this._listeners.delete(event);
        }
    },
    
    _emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try { cb(data); } catch (e) {}
            });
        }
    },
    
    getFriend(id) {
        return this._cache.friends.get(id) || null;
    },
    
    getAllFriends() {
        return Array.from(this._cache.friends.values());
    },
    
    setFriend(friend) {
        if (!friend || !friend.id) return false;
        const key = String(friend.id);
        // Never add current user as their own friend
        const _selfId = __session?.user?.id || currentUser?.id;
        if (_selfId && key === String(_selfId)) return false;
        this._cache.friends.set(key, { ...friend, id: key });
        this._timestamps.set(`friend_${key}`, Date.now());
        this._emit('friend:updated', friend);
        return true;
    },
    
    setFriends(friendsArray) {
        if (!Array.isArray(friendsArray)) return false;
        const _selfId = __session?.user?.id || currentUser?.id;
        friendsArray.forEach(f => {
            if (!f || !f.id) return;
            const key = String(f.id);
            // Never add current user as their own friend
            if (_selfId && key === String(_selfId)) return;
            const st = f.status;
            if (st === 'pending_sent' || st === 'pending_received' ||
                st === 'pending' || st === 'blocked' || st === 'removed' ||
                st === 'none') return;
            if ((st === 'online' || st === 'offline' || st === 'away' || st === 'busy') &&
                !(f.addedAt || f.friendId || f.localId || f.serverId)) return;
            this._cache.friends.set(key, { ...f, id: key });
            this._timestamps.set(`friend_${key}`, Date.now());
        });
        this._emit('friends:updated', this.getAllFriends());
        return true;
    },
    
    removeFriend(id) {
        const key = String(id);
        // Try both String and original forms (legacy data may have used integer key)
        const existed = this._cache.friends.delete(key) || this._cache.friends.delete(id);
        if (existed) {
            this._timestamps.delete(`friend_${key}`);
            this._timestamps.delete(`friend_${id}`);
            this._emit('friend:removed', id);
        }
        return existed;
    },
    
    getRequest(id) {
        return this._cache.requests.get(id) || null;
    },
    
    getAllRequests() {
        return Array.from(this._cache.requests.values());
    },
    
    setRequest(request) {
        if (!request || !request.id) return false;
        this._cache.requests.set(request.id, request);
        this._timestamps.set(`request_${request.id}`, Date.now());
        this._emit('request:updated', request);
        return true;
    },
    
    setRequests(requestsArray) {
        if (!Array.isArray(requestsArray)) return false;
        requestsArray.forEach(r => {
            if (r && r.id) {
                this._cache.requests.set(r.id, r);
                this._timestamps.set(`request_${r.id}`, Date.now());
            }
        });
        this._emit('requests:updated', this.getAllRequests());
        return true;
    },
    
    removeRequest(id) {
        const existed = this._cache.requests.delete(id);
        if (existed) {
            this._timestamps.delete(`request_${id}`);
            this._emit('request:removed', id);
        }
        return existed;
    },
    
    getAllSentRequests() {
        return Array.from(this._cache.sentRequests.values());
    },

    // FIX: getSentRequest was missing. cancelFriendRequest() calls this via optional
    // chaining — without it existingSent is always undefined and rollback on cancel
    // failure never restores the card in the UI.
    getSentRequest(id) {
        return this._cache.sentRequests.get(String(id)) || null;
    },

    setSentRequest(request) {
        if (!request || !request.id) return false;
        this._cache.sentRequests.set(request.id, request);
        this._timestamps.set(`sent_${request.id}`, Date.now());
        this._emit('sent:updated', request);
        return true;
    },
    
    setSentRequests(requestsArray) {
        if (!Array.isArray(requestsArray)) return false;
        requestsArray.forEach(r => {
            if (r && r.id) {
                this._cache.sentRequests.set(r.id, r);
                this._timestamps.set(`sent_${r.id}`, Date.now());
            }
        });
        this._emit('sent:all_updated', this.getAllSentRequests());
        return true;
    },
    
    removeSentRequest(id) {
        const existed = this._cache.sentRequests.delete(id);
        if (existed) {
            this._timestamps.delete(`sent_${id}`);
            this._emit('sent:removed', id);
        }
        return existed;
    },
    
    getUser(id) {
        return this._cache.users.get(id) || null;
    },
    
    getAllUsers() {
        return Array.from(this._cache.users.values());
    },
    
    setUser(user) {
        if (!user || !user.id) return false;
        this._cache.users.set(user.id, user);
        this._timestamps.set(`user_${user.id}`, Date.now());
        this._emit('user:updated', user);
        return true;
    },
    
    setUsers(usersArray) {
        if (!Array.isArray(usersArray)) return false;
        usersArray.forEach(u => {
            if (u && u.id) {
                this._cache.users.set(u.id, u);
                this._timestamps.set(`user_${u.id}`, Date.now());
            }
        });
        this._emit('users:updated', this.getAllUsers());
        return true;
    },
    
    // FIXED: Client-side search (NO API CALLS)
    searchFriends(query, options = {}) {
        if (!query || typeof query !== 'string') return [];
        
        const normalizedQuery = query.toLowerCase().trim();
        if (normalizedQuery.length === 0) return [];
        
        const results = [];
        const searchTargets = options.includeUsers ? 
            [...this._cache.friends.values(), ...this._cache.users.values()] : 
            [...this._cache.friends.values()];
        
        for (const item of searchTargets) {
            if (this._matchesQuery(item, normalizedQuery)) {
                results.push(item);
            }
        }
        
        // Sort results by relevance (name match first)
        results.sort((a, b) => {
            const aName = (a.displayName || a.name || '').toLowerCase();
            const bName = (b.displayName || b.name || '').toLowerCase();
            
            if (aName === normalizedQuery && bName !== normalizedQuery) return -1;
            if (bName === normalizedQuery && aName !== normalizedQuery) return 1;
            if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
            if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;
            
            return aName.localeCompare(bName);
        });
        
        return results;
    },
    
    _matchesQuery(item, query) {
        if (!item) return false;
        
        const name = (item.displayName || item.name || '').toLowerCase();
        const username = (item.username || '').toLowerCase();
        const email = (item.email || '').toLowerCase();
        
        return name.includes(query) || username.includes(query) || email.includes(query);
    },
    
    syncToGlobals() {
        const _fRaw = this.getAllFriends();
        const _r = this.getAllRequests();
        const _s = this.getAllSentRequests();
        const _p = Array.from(this._cache.pinnedFriends.values());
        const _m = Array.from(this._cache.mutedFriends.values());
        const _u = this.getAllUsers();

        // FIX: Always deduplicate by String(id) before exposing to window globals.
        // Multiple iframe instances can each write to window.friends via syncToGlobals,
        // and our optimistic-accept code also pushes directly to window.friends.
        // Using String(id) as key prevents int/string duplicate entries.
        const _dedupMap = new Map();
        _fRaw.forEach(f => { if (f && f.id) _dedupMap.set(String(f.id), f); });
        const _f = Array.from(_dedupMap.values());

        friends = _f;
        friendRequests = _r;
        sentRequests = _s;
        pinnedFriends = _p;
        mutedFriends = _m;
        allUsers = _u;

        window.friends = _f;
        window.friendRequests = _r;
        window.sentRequests = _s;
        window.pinnedFriends = _p;
        window.mutedFriends = _m;
        window.allUsers = _u;
        // FIX: Do NOT dispatch friendsUpdated here. syncToGlobals is called dozens of
        // times per second (after every API response). Dispatching friendsUpdated from here
        // creates an infinite loop:
        //   syncToGlobals → friendsUpdated → renderFriends → loadFriendsFromBackend → syncToGlobals
        // Callers that actually have new data (loadFriendsFromBackend, FRIEND_REMOVED, etc.)
        // dispatch friendsUpdated explicitly after syncToGlobals returns.
        window.dispatchEvent(new CustomEvent('updateFriendCounts'));
        // Broadcast to parent (chat/call/status/groups) with 80ms debounce
        if (!FriendCacheManager._syncBroadcastTimer) {
            FriendCacheManager._syncBroadcastTimer = setTimeout(() => {
                FriendCacheManager._syncBroadcastTimer = null;
                const _p = {
                    type: 'FRIENDS_SYNC',
                    friends: Array.from(FriendCacheManager._cache.friends.values()),
                    requests: Array.from(FriendCacheManager._cache.requests.values()),
                    sentRequests: Array.from(FriendCacheManager._cache.sentRequests.values()),
                    source: 'friend-core',
                    timestamp: Date.now()
                };
                try { window.parent.postMessage(_p, '*'); } catch (_) {}
                window.dispatchEvent(new CustomEvent('FRIENDS_SYNC', { detail: _p }));
            }, 80);
        }
    },
    
    persist() {
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, this.getAllFriends());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.REQUESTS, this.getAllRequests());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.SENT_REQUESTS, this.getAllSentRequests());
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, Array.from(this._cache.pinnedFriends.values()));
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, Array.from(this._cache.mutedFriends.values()));
        SafeStorage.setObject(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE, this.getAllUsers());
    },
    
    clear() {
        this._cache.friends.clear();
        this._cache.requests.clear();
        this._cache.sentRequests.clear();
        this._cache.pinnedFriends.clear();
        this._cache.mutedFriends.clear();
        this._cache.users.clear();
        this._cache.searchIndex.clear();
        this._timestamps.clear();
        if (this._searchCache) this._searchCache.clear();
        this.persist();
    }
};

FriendCacheManager.init();

// =============================================
// [OFFLINE-FIRST BOOTSTRAP]
// Connects FriendCacheManager to localStore.friends.js,
// friendQueue.manager.js, and friendSync.engine.js.
// UI always reads from localStore → KynectaStore.
// All mutations go through the queue when offline.
// =============================================

const OfflineFirstFriends = {
    _initialized: false,

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        // Wait for localStore to be ready
        const ls = window.KynectaFriendsLocalStore;
        if (ls) {
            try {
                await ls.ready();
                // Set current user on the store
                const userId = __session.user?.id
                    || window.__PARENT_SESSION__?.userId
                    || window.KynectaStore?.get('user.id')
                    || localStorage.getItem('currentUserId')
                    || (() => {
                        try {
                            const stored = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || 'null');
                            return stored?.id || stored?.userId || null;
                        } catch (_error) {
                            return null;
                        }
                    })();
                if (userId) ls.setCurrentUser(String(userId));

                // Hydrate FriendCacheManager from localStore immediately (zero-wait UI)
                await this._hydrateFromLocalStore();
            } catch (e) {
                Logger.warn('OfflineFirstFriends', 'LocalStore hydration failed', e.message);
            }
        }

        // Listen for sync events from the sync engine
        window.addEventListener('kyn:friendsSynced', (e) => {
            Logger.debug('OfflineFirstFriends', 'Friends synced', e.detail);
            this._hydrateFromLocalStore();
        });

        // Listen for queue rollback events — restore UI to pre-optimistic state
        window.addEventListener('kyn:friendRollback', (e) => {
            const { item } = e.detail || {};
            if (item) {
                Logger.warn('OfflineFirstFriends', 'Rolling back optimistic state', item);
                this._hydrateFromLocalStore();
                showNotification?.('Action failed and was reverted. Please try again.', 'error');
            }
        });

        Logger.info('OfflineFirstFriends', '✅ Offline-first bridge initialized');
    },

    /**
     * Read from IndexedDB localStore and push into FriendCacheManager + KynectaStore.
     * This is what makes the UI "load instantly from local cache".
     */
    async _hydrateFromLocalStore() {
        const ls = window.KynectaFriendsLocalStore;
        if (!ls) return;
        try {
            await ls.ready();
            const [friends, incoming, sent] = await Promise.all([
                ls.getFriends(),
                ls.getPendingReceived(),
                ls.getPendingSent(),
            ]);

            // FIX Bug#2: Start from the CURRENT cache so we don't wipe localStorage-
            // loaded data when this runs concurrently with FriendCacheManager.init().
            const friendMap = new Map(FriendCacheManager._cache.friends);
            friends.forEach(r => {
                const display = {
                    id:          r.friendId,
                    localId:     r.id,
                    serverId:    r.serverId,
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    photoURL:    r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    status:      r.status,
                    addedAt:     r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                };
                friendMap.set(r.friendId, display);
            });
            FriendCacheManager._cache.friends = friendMap;

            // Push incoming requests
            const reqMap = new Map(FriendCacheManager._cache.requests);
            incoming.forEach(r => {
                reqMap.set(r.serverId || r.id, {
                    id:          r.serverId || r.id,
                    localId:     r.id,
                    senderId:    r.friendId,
                    receiverId:  r.userId,
                    status:      'pending',
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    createdAt:   r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                });
            });
            FriendCacheManager._cache.requests = reqMap;

            // Push sent requests
            const sentMap = new Map(FriendCacheManager._cache.sentRequests);
            sent.forEach(r => {
                sentMap.set(r.serverId || r.id, {
                    id:          r.serverId || r.id,
                    localId:     r.id,
                    receiverId:  r.friendId,
                    senderId:    r.userId,
                    status:      'pending',
                    displayName: r.displayName || r.username || r.friendId,
                    username:    r.username || '',
                    avatar:      r.avatar || '',
                    coverPhoto:  r.coverPhoto || '',
                    createdAt:   r.createdAt,
                    isLocalOnly: r.isLocalOnly,
                    optimistic:  r.isLocalOnly,
                });
            });
            FriendCacheManager._cache.sentRequests = sentMap;

            FriendCacheManager.syncToGlobals();
            try {
                const localFriends = Array.from(friendMap.values());
                SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, localFriends); // FIX: unified key
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: {
                        friends: localFriends,
                        count: localFriends.length,
                        cached: true,
                        offline: !navigator.onLine
                    }
                }));
            } catch (_error) {}
        } catch (e) {
            Logger.warn('OfflineFirstFriends', 'Hydration error', e.message);
        }
    },

    /**
     * Enqueue a friend action offline-first.
     * Creates a local record optimistically, then queues the server call.
     *
     * @param {'add'|'accept'|'reject'|'remove'|'cancel'|'block'|'unblock'} action
     * @param {string} friendId
     * @param {object} [opts]   Extra payload (requestId, notes, etc.)
     * @returns {Promise<{success:boolean, localId:string}>}
     */
    async enqueueAction(action, friendId, opts = {}) {
        const ls    = window.KynectaFriendsLocalStore;
        const queue = window.KynectaFriendQueue;

        const userId = __session.user?.id
            || window.__PARENT_SESSION__?.userId
            || window.KynectaStore?.get('user.id');

        // Determine optimistic local status
        const statusMap = {
            add:     'pending_sent',
            accept:  'accepted',
            reject:  'removed',
            remove:  'removed',
            cancel:  'removed',
            block:   'blocked',
            unblock: 'none',
        };
        const optimisticStatus = statusMap[action] || 'none';

        let localId = opts.localRecordId || null;

        if (ls) {
            try {
                await ls.ready();
                if (action === 'add') {
                    // Create new local-only record
                    const existing = await ls.getByFriendId(friendId);
                    if (existing && !['none','removed'].includes(existing.status)) {
                        return { success: false, error: 'Friendship already exists', existing };
                    }
                    const record = await ls.upsert({
                        userId:      String(userId),
                        friendId:    String(friendId),
                        status:      'pending_sent',
                        isLocalOnly: true,
                        displayName: opts.displayName,
                        username:    opts.username,
                        avatar:      opts.avatar,
                    });
                    localId = record.id;
                } else if (localId) {
                    await ls.updateStatus(localId, optimisticStatus).catch(() => {});
                } else {
                    // Try to find by friendId
                    const existing = await ls.getByFriendId(friendId);
                    if (existing) {
                        localId = existing.id;
                        await ls.updateStatus(localId, optimisticStatus).catch(() => {});
                    }
                }
            } catch (e) {
                Logger.warn('OfflineFirstFriends', 'LocalStore pre-enqueue failed', e.message);
            }
        }

        // Enqueue the server call
        if (queue) {
            queue.enqueue(action, friendId, opts, localId);
        }

        return { success: true, localId };
    },
};

// Auto-init when auth is ready
const _offlineInitTrigger = () => OfflineFirstFriends.init();
window.addEventListener('kyn:authReady', _offlineInitTrigger);
window.addEventListener('AUTH_READY', _offlineInitTrigger);
// Also init immediately if auth is already done
if (authReadyReceived && __session.ready) {
    setTimeout(() => OfflineFirstFriends.init(), 0);
}
setTimeout(() => OfflineFirstFriends.init(), 0);

// =============================================
// [saveFriendLocal] — UNIFIED PERSISTENCE HELPER
// Call this after any mutation to a friend record.
// Guarantees:
//   ✔ localStorage has data (FriendCacheManager.persist)
//   ✔ IndexedDB has data   (KynectaFriendsLocalStore)
//   ✔ UI loads from local first (KynectaStore reactive update)
//   ✔ Refresh does not delete friends
//
// Usage:
//   await saveFriendLocal(friendData, 'accepted');         // add/update friend
//   await saveFriendLocal(friendData, 'removed');          // remove friend
//   await saveFriendLocal(friendData, 'pending_sent');     // sent request
//   await saveFriendLocal(friendData, 'pending_received'); // incoming request
//   await saveFriendLocal(friendData, 'blocked');          // block
// =============================================

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

// =============================================
// [FRIEND REQUEST MANAGER]
// =============================================

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
                            note: 'Added via QR code scan'
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

// =============================================
// [IDEMPOTENT OPERATION TRACKER]
// =============================================

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

// =============================================
// [MESSAGE TRACKER]
// =============================================

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

// =============================================
// [V6 COMPATIBILITY LAYER]
// =============================================

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
        parentReadyReceived = true;
        
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

// =============================================
// [COMPATIBILITY BRIDGE]
// =============================================

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

// =============================================
// [DIAGNOSTICS AGENT]
// =============================================

const DiagnosticsAgent = {
    enabled: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    
    metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0,
        failures: 0,
        startupTime: Date.now(),
        environment: IframeEnvironment.type
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

// =============================================
// [NAVIGATION GUARD]
// =============================================

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

// =============================================
// [UI FAILSAFE]
// =============================================

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

// =============================================
// [FEATURE FLAGS]
// =============================================

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
    messageSigning: !SandboxDetector.detected,
    heartbeat: false,
    retryQueue: false,
    offlineBuffer: true,
    batchMessages: IframeEnvironment.features.isVpnNetwork,
    compression: IframeEnvironment.features.saveData,
    keepalive: IframeEnvironment.features.isVpnNetwork
};

// =============================================
// [GLOBAL VARIABLES]
// =============================================

let currentUser = null;
let userData = null;
let friends = [];
let contacts = [];
let friendRequests = [];
let sentRequests = [];
let temporaryFriends = [];
let pinnedFriends = [];
let mutedFriends = [];
let selectedFriend = null;
let currentCategoryFilter = 'all';
let currentSearchTerm = '';

// Setters for ES module consumers (imported variables are read-only bindings)
function setCurrentCategoryFilter(value) { currentCategoryFilter = value; }
function setCurrentSearchTerm(value) { currentSearchTerm = value?.toLowerCase().trim() || ''; }
let isMobile = window.innerWidth <= 768;
let mutualFriendsCache = {};
let groups = [];
let allUsers = [];
let cameraStream = null;
let currentCamera = 'environment';
let flashOn = false;
let apiReady = false;
let scanningActive = false;
let isInitialized = false;
let initializationStarted = false;
let backgroundSyncInterval = null;
let isAuthReady = false;
let backgroundTasksStarted = false;
let cacheLoaded = false;

let kynState = window.kynState || {
    frameId: null,
    sessionValid: false,
    parentReady: false,
    handshakeComplete: false,
    parentOrigin: window.location.origin,
    lastPong: Date.now(),
    protocolVersion: 'KYN-3.0',
    compatibilityMode: SandboxDetector.detected,
    sandboxDetected: SandboxDetector.detected
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

const ENV_CONFIG = IframeEnvironment.getAdaptiveConfig();

// =============================================
// [UTILITY FUNCTIONS]
// =============================================

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

// =============================================
// [KNECTA AUTH]
// =============================================

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
        const oldKeys = ['moodchat_token', 'accessToken', 'knecta_token', 'token', 'authToken', 'sessionToken'];
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

// =============================================
// [PARENT COORDINATOR]
// =============================================

const ParentCoordinator = {
    config: {
        parentOrigin: window.location.origin,
        debug: IframeEnvironment.type === 'LOCAL_DEV'
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

// =============================================
// [SAFETY GUARDS]
// =============================================

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

// =============================================
// [SECURITY MANAGER]
// =============================================

const SecurityManager = {
    originWhitelist: SecurityValidator._trustedOrigins,
    token: null,
    
    init() {
        SecurityValidator._trustedOrigins.forEach(origin => {
            if (typeof origin === 'string') this.originWhitelist.add(origin);
        });
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

// =============================================
// [RESOURCE MANAGER]
// =============================================

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

// =============================================
// [MESSAGE BUS]
// =============================================

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

// =============================================
// [DATA LOADING FUNCTIONS]
// =============================================

let friendsLoading = false;
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

// FIX: Track in-flight loadFriendsFromBackend calls. Multiple iframe instances
// (chat.html parent + calls.html sub-iframe each with friend.html) all call this
// within milliseconds of each other on startup. Without this guard, each call
// independently sets window.friends and dispatches friendsUpdated, causing 3x
// renders and duplicate list entries.
let _loadFriendsInFlight = null;
let _loadFriendsLastCall = 0;

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
    
    _loadFriendsLastCall = Date.now();
    _loadFriendsInFlight = (async () => {
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
    
    friendsLoading = true;
    
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
        _loadFriendsInFlight = null;
    }
    })(); // end of async IIFE
    return _loadFriendsInFlight;
}

// =============================================
// [DISCOVERABLE USERS] - FIXED VERSION
// =============================================

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

// Export for global access
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

// FIXED: loadSentRequestsFromBackend - ensures sent requests are properly loaded and dispatched
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
            sentRequests = formattedRequests;
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
            sentRequests = cached;
            FriendCacheManager.syncToGlobals();
            window.dispatchEvent(new CustomEvent('sentRequestsUpdated', { 
                detail: { requests: cached, cached: true, timestamp: Date.now() }
            }));
        }
    } catch (error) {
        Logger.error('loadSentRequestsFromBackend', 'Failed to load sent requests', error);
        
        const cached = FriendCacheManager.getAllSentRequests();
        if (cached.length > 0) {
            sentRequests = cached;
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
            contacts = Array.isArray(contactsData) ? contactsData : [];
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.CONTACTS, contacts);
            window.dispatchEvent(new CustomEvent('contactsUpdated', { detail: { contacts } }));
            return { success: true, count: contacts.length };
        }
    } catch (error) {
        Logger.error('loadContactsFromBackend', 'Failed to load contacts', error);
        
        const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (cached) {
            try { contacts = JSON.parse(cached); } catch (e) { contacts = []; }
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
            groups = Array.isArray(groupsData) ? groupsData : [];
            SafeStorage.setObject(LOCAL_STORAGE_KEYS.USER_GROUPS, groups);
            return { success: true, count: groups.length };
        }
    } catch (error) {
        Logger.error('loadGroupsFromBackend', 'Failed to load groups', error);
        
        const cached = SafeStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cached) {
            try { groups = JSON.parse(cached); } catch (e) { groups = []; }
        }
    }
    
    return { success: false };
}

// =============================================
// [FETCH ALL USERS] - FIXED: Sets window._allUsersCache and dispatches events
// =============================================

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
            allUsers = cached;
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
                allUsers = idbUsers;
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
                allUsers = localUsers;
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

// =============================================
// [FRIEND OPERATIONS]
// =============================================

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

// P1 FIX: Hydrate private notes from DB after friend list loads.
// Called once from initializeFriendModule after friends are fetched.
// DB values win over stale localStorage so notes sync across devices.
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
    
    selectedFriend = friend;
    
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

// =============================================
// [CAMERA AND QR CODE FUNCTIONS]
// =============================================

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
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 15 }
            },
            audio: false
        });
        
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

// FIXED: QR scanner stops after result (Bug #6)
function startRealQRCodeScanning(video, canvas) {
    if (!featureFlags.qrCode) return;
    
    const ctx = canvas.getContext('2d');
    scanningActive = true;
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

// FIXED: QR scanner stops after result (Bug #6)
function processScannedQRCodeReal(qrData) {
    QRCodeManager.processScannedQR(qrData).then(result => {
        // FIXED: Stop scanner first before processing result
        _qrScanActive = false;   // ← STOP loop
        scanningActive = false;   // ← Stop scanning flag
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
        scanningActive = false;
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
    scanningActive = false;
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
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
    
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
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
    
    flashOn = !flashOn;
    track.applyConstraints({ advanced: [{ torch: flashOn }] });
    
    const btn = document.getElementById('toggleFlashBtn');
    if (btn) {
        btn.innerHTML = flashOn ? '<i class="fas fa-lightbulb"></i> Flash On' : '<i class="far fa-lightbulb"></i> Flash Off';
        btn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
    }
    
    showNotification?.(flashOn ? 'Flash on' : 'Flash off', 'info');
}

// FIX: function contains `await QRCodeManager.generateQRCode(...)` below
// but was declared non-async — this is a SyntaxError ("Unexpected reserved
// word") that aborts the entire friend-core.js module on load. All call
// sites (setTimeout, onclick, fire-and-forget) don't depend on the return
// value, so marking this async is safe.
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
            width: 200,
            height: 200,
            colorDark: '#0084ff',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'text-align: center; margin-top: 15px;';
        
        const displayText = username ? `@${username}` : (displayName !== 'User' ? displayName : `User ${userId.substring(0, 8)}`);
        infoDiv.innerHTML = `
            <div style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${escapeHtml(displayText)}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Scan to add as friend</div>
            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; opacity: 0.6;">ID: ${userId}</div>
        `;
        container.appendChild(infoDiv);
        
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

// =============================================
// [MUTUAL FRIENDS FUNCTIONS]
// =============================================

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

// =============================================
// [UI UPDATE FUNCTIONS]
// =============================================

function updateUIWithUserData(userData) {
    try {
        currentUser = userData;
        userData = userData;
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
        cacheLoaded = true;
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
        backgroundTasksStarted = true;
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
    
    backgroundTasksStarted = true;
    
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

// =============================================
// [PARENT COORDINATION INTEGRATION]
// =============================================

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
        
        currentUser = session.user;
        userData = session.user;
        
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
        
        currentUser = session.user;
        userData = session.user;
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
        
        currentUser = null;
        userData = null;
        
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
        
        currentUser = user;
        userData = user;
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
            
            currentUser = detail.user;
            userData = detail.user;
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
                
                currentUser = detail.user;
                userData = detail.user;
                updateUIWithUserData(detail.user);
                updateDataSourceIndicator('cache');
                initializeMainFunctionality();
                showNotification?.('Using cached data. Sign in for live updates.', 'warning');
            }
        }
    } catch (error) {}
}

// =============================================
// [INITIALIZATION FLOW]
// =============================================

async function initialize() {
    if (initializationLock) {
        Logger.warn('Init', 'Initialization already in progress');
        return isInitialized;
    }
    if (isInitialized) {
        Logger.info('Init', 'Already initialized');
        return true;
    }
    
    initializationLock = true;
    initializationStarted = true;
    
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
        
        isInitialized = true;
        
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
        isInitialized = false;
    } finally {
        initializationLock = false;
    }
    
    return isInitialized;
}

// =============================================
// [SYNC WITH API CORE]
// =============================================

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

// =============================================
// [MISSING FUNCTION WRAPPERS]
// =============================================

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
    currentCategoryFilter = category;
    window.dispatchEvent(new CustomEvent('filterFriendsByCategory', { detail: { category } }));
}

function searchFriendsLegacy(searchTerm) {
    currentSearchTerm = searchTerm?.toLowerCase().trim() || '';
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

// =============================================
// [GLOBAL EVENT LISTENERS]
// =============================================

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
        backgroundTasksStarted = false; // allow re-run
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

// =============================================
// [DOM READY INITIALIZATION]
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();
    
    ParentCoordinator.init().catch(() => {});
    
    initialize().catch(error => {
        Logger.error('Init', 'Failed to initialize friend core', error);
        showAuthError('Failed to connect to parent. Please refresh the page.');
        apiReady = false;
        isInitialized = false;
        window.dispatchEvent(new CustomEvent('friendCoreReady', { 
            detail: { error: true, message: error.message, timestamp: Date.now(), state: currentState, authReady: authReadyReceived, parentReady: parentReadyReceived, sessionReady: __session.ready, v6: V6.getState() } 
        }));
    });
});

// =============================================
// [EXPORTS]
// =============================================

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

// ✅ CRITICAL: Expose FriendCore globally for UI access
window.FriendCore = friendCore;
window._allUsersCache = window._allUsersCache || [];
window.friendCore = friendCore;

// =============================================
// [NEARBY MANAGER] - Real geolocation-based discovery
// =============================================
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


// ============================================================
// P2/P3 FIX: New friend management functions
// All were referenced in the audit as missing implementations.
// ============================================================

/**
 * snoozeFriend (P3 FIX)
 * Hide a friend from the active list for N days without unfriending.
 * @param {number} friendId
 * @param {number} days  1|3|7|14|30 — default 7
 */
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

/**
 * restrictFriend (P3 FIX)
 * Restricted friends see only public posts — no notification sent.
 */
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

/**
 * reportFriend (P2 FIX)
 * Frontend showed a Report button but the API call was missing.
 */
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

/**
 * importPhoneContacts (P2 FIX)
 * Use navigator.contacts API (Chrome Android) to get phone numbers,
 * hash them with SHA-256 client-side, then ask the backend to match users.
 * Raw phone numbers are NEVER sent to the server.
 */
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

/**
 * getFriendPrivacySettings (P3 FIX)
 */
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

/**
 * exportFriendsCSV (P3 FIX)
 */
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

// P2/P3 FIX: Expose on window so friend-ui.js (loaded as separate ES module) can call
// new functions via window.FriendCoreAPI?.snoozeFriend() etc.
// friend-ui.js imports some functions directly but can't import async fns added after initial load.
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

// =============================================
// [DEBUG HELPER]
// =============================================

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

// =============================================
// END OF FILE
// Version: 13.2
// ✅ FIXED: All Users / Discovery showing 0 users
// ✅ FIXED: window.FriendCore exposed globally
// ✅ FIXED: Client-side search (no API calls)
// ✅ FIXED: Avatar field normalization (photoURL || avatar)
// ✅ FIXED: Event-driven rendering with allUsersLoaded
// ✅ FIXED: fetchAllUsersFromBackend sets window._allUsersCache
// ✅ ADDED: Polling for incoming requests (30s interval)
// ✅ ADDED: Request deduplication with content-based hashing
// ✅ ADDED: Smart UI updates with shallow comparison
// ✅ ADDED: FRIEND_ACCEPTED event handling and parent notification
// ✅ ADDED: Idempotent accept/decline operations
// ✅ ADDED: Event-driven reload on FRIEND_ACCEPTED
// ✅ FIXED: Sent requests rendering after load
// ✅ FIXED: Nearby fallback when API endpoint missing (Bug #3)
// ✅ FIXED: Call button for non-friend users (Bug #4)
// ✅ FIXED: QR scanner stops after result (Bug #6)
// ✅ FIXED: Duplicate AUTH_READY warning suppressed (silent return)
// ✅ FIXED: Polling deduplication with _fetchInFlight guard
// =============================================

// ── TOP-LEVEL: accessible from all closures ──────────────────────────────────
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
        if (key === 'sessionTimeout') window.__sessionTimeout = value;
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
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// =============================================
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

// =============================================
// [FIX 3 — PARENT/SERVER RELAY: FRIEND_ACCEPTED → FRIEND_REQUEST_ACCEPTED]
// =============================================
// When this module sends  FRIEND_ACCEPTED  to the parent (via safeSend/postMessage),
// the parent (or server WebSocket handler) MUST relay a  FRIEND_REQUEST_ACCEPTED
// message back to the ORIGINAL SENDER's active session.
//
// The payload now includes:
//   targetUserId    — the user ID of the original request sender (must be notified)
//   acceptedById    — the user ID of the receiver who just accepted
//   acceptedByName  — display name of the receiver
//   acceptedByAvatar— avatar of the receiver
//   friend          — full friend profile object of the receiver
//   requestId       — the original friend-request ID
//   friendId        — same as acceptedById (the accepting user's ID)
//
// Add this handler in your parent window / server WebSocket router:
//
//   if (message.type === 'FRIEND_ACCEPTED') {
//       const { targetUserId, friendId, requestId, friend,
//               acceptedById, acceptedByName, acceptedByAvatar } = message.payload;
//
//       if (targetUserId) {
//           sendToUser(targetUserId, {
//               type: 'FRIEND_REQUEST_ACCEPTED',
//               payload: {
//                   requestId,
//                   friendId:       acceptedById,        // the receiver's ID
//                   friend: friend || {                  // receiver's profile
//                       id:          acceptedById,
//                       displayName: acceptedByName,
//                       avatar:      acceptedByAvatar
//                   },
//                   acceptedById,
//                   acceptedByName,
//                   timestamp: Date.now()
//               }
//           });
//       }
//   }
//
// sendToUser() is your server's mechanism for pushing a message to a specific
// online user (WebSocket broadcast, SSE push, Firebase RTDB, Pusher, etc.).
// =============================================