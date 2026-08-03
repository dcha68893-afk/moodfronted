// =============================================
// FRIEND CORE — BOOTSTRAP & LIFECYCLE
// Split from the original friend-core.js (v14.0) into 3 real ES modules:
//   friend-core.bootstrap.js   (this file) — iframe/session bootstrap, KYN protocol,
//                               core controllers, lifecycle state machine
//   friend-core.operations.js  — friend state, API/data-loading operations
//   friend-core.ui-bridge.js   — UI bridge, rendering, and the public API surface
//                               (this is the file friend.html / friend-ui.js load)
// =============================================

import {
    generateMessageId as importedGenerateMessageId
} from './js/api.messages.js';
import {
    acceptFriendRequestOnline,
    applySettingToFriendModule,
    declineFriendRequest,
    loadFriendRequestsFromBackend,
    loadFriendsFromBackend,
    loadSentRequestsFromBackend,
    showNotification
} from './friend-core.ui-bridge.js';
import {
    DiagnosticsAgent,
    FriendSearchEngine,
    currentUser,
    friends,
    setAllUsers,
    setCurrentUser,
    setFriendRequests,
    setFriends,
    setMutedFriends,
    setPinnedFriends,
    setSentRequests,
    setUserData,
    userData
} from './friend-core.operations.js';

const DEBUG = false;

const PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

const MODULE_NAME = 'friends';

const MODULE_VERSION = '14.0';

const EXPECTED_PARENT_ORIGIN = window.location.origin;

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

const friendCategories = {
    'acquaintance': { name: 'Acquaintance', color: 'var(--category-acquaintance)', icon: 'fas fa-handshake', description: 'Someone you know casually' },
    'friend': { name: 'Friend', color: 'var(--category-friend)', icon: 'fas fa-user-friends', description: 'A regular friend' },
    'close-friend': { name: 'Close Friend', color: 'var(--category-close-friend)', icon: 'fas fa-heart', description: 'A close personal friend' },
    'family': { name: 'Family', color: 'var(--category-family)', icon: 'fas fa-users', description: 'Family member' },
    'business': { name: 'Business', color: 'var(--category-business)', icon: 'fas fa-briefcase', description: 'Business contact' },
    'pinned': { name: 'Pinned', color: 'var(--warning-color)', icon: 'fas fa-thumbtack', description: 'Pinned friend' },
    'muted': { name: 'Muted', color: 'var(--text-secondary)', icon: 'fas fa-volume-mute', description: 'Muted friend' }
};

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

const __session = {
    token: null,
    user: null,
    expiresAt: null,
    ready: false
};

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

function setParentReadyReceived(value) { parentReadyReceived = value; }

let authReadyReceived = false;

let _stateHistory = [];

const _listeners = new Set();

let initializationLock = false;

function setInitializationLock(value) { initializationLock = value; }

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
        setCurrentUser(__session.user);
        setUserData(__session.user);
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
            'https://nexipa.onrender.com',
            'https://noxopa.onrender.com'
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

                    // SETTINGS WIRING: friends.friendRequestPrivacy — 'nobody' means this user
                    // doesn't want to receive requests at all; 'contacts' restricts to people
                    // already in the contacts list. Both are enforced client-side here (in
                    // addition to whatever the backend already does) so the setting has a
                    // visible effect even for requests that already made it through.
                    const _privacy = window.__friendRequestPrivacy || 'everyone';
                    const _isExistingContact = Array.isArray(window.contacts) &&
                        window.contacts.some(c => c && String(c.id) === String(senderId));
                    const _shouldAutoDecline =
                        (_privacy === 'nobody') ||
                        (_privacy === 'contacts' && senderId && !_isExistingContact);

                    if (_shouldAutoDecline) {
                        declineFriendRequest({ id: requestId }).catch(() => {});
                        if (window.__friendRequestNotifications !== false) {
                            showNotification?.(`A friend request from ${newRequest.senderName} was automatically declined (your friend request privacy is set to "${_privacy === 'nobody' ? 'no one' : 'contacts only'}")`, 'info');
                        }
                        return;
                    }

                    // SETTINGS WIRING: friends.autoAcceptFriends — when enabled, skip the
                    // pending-request step entirely and accept immediately.
                    if (window.__autoAcceptFriends === true && requestId) {
                        acceptFriendRequestOnline(requestId, senderId).then(result => {
                            if (window.__friendRequestNotifications !== false) {
                                showNotification?.(
                                    result?.success
                                        ? `${newRequest.senderName} was automatically added as a friend`
                                        : `New friend request from ${newRequest.senderName}`,
                                    result?.success ? 'success' : 'info'
                                );
                            }
                        }).catch(() => {
                            if (window.__friendRequestNotifications !== false) {
                                showNotification?.(`New friend request from ${newRequest.senderName}`, 'info');
                            }
                        });
                        return;
                    }

                    // SETTINGS WIRING: friends.friendRequestNotifications — default true.
                    if (window.__friendRequestNotifications !== false) {
                        showNotification?.(`New friend request from ${newRequest.senderName}`, 'info');
                    }
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

        setFriends(_f);
        setFriendRequests(_r);
        setSentRequests(_s);
        setPinnedFriends(_p);
        setMutedFriends(_m);
        setAllUsers(_u);

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

const _offlineInitTrigger = () => OfflineFirstFriends.init();

window.addEventListener('kyn:authReady', _offlineInitTrigger);

window.addEventListener('AUTH_READY', _offlineInitTrigger);

if (authReadyReceived && __session.ready) {
    setTimeout(() => OfflineFirstFriends.init(), 0);
}

setTimeout(() => OfflineFirstFriends.init(), 0);

// Additional exports required for cross-module wiring between the 3 split files
export {
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
    _messageQueue,
    assertActive,
    authReadyReceived,
    authorizedRequest,
    childReadySent,
    currentState,
    flushRequestQueue,
    friendCategories,
    generateMessageId,
    generateRequestId,
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
    sendMessageInternal,
    setInitializationLock,
    setParentReadyReceived,
    transitionTo
};
