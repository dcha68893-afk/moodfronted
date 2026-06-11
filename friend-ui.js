// =============================================
// FRIEND PAGE UI - STABILIZED COMMUNICATION v4.7
// DETERMINISTIC MICRO-FRONTEND ARCHITECTURE
// COMPLETE INTEGRATION WITH REAL BACKEND SYSTEM
// FIXED: Optimistic UI with proper connection handling
// FIXED: Accept/Decline with retry mechanism
// FIXED: Stale ES module bindings for sentRequests, friends, friendRequests
// FIXED: Sent requests count badge updates
// FIXED: Nearby users fallback to allUsers when API fails
// FIXED: Call button for non-friend users in Discover section
// FIXED: Friend request count badge updates on every refresh
// FIXED: Nearby fetch debounced to prevent duplicate calls
// FIXED: waitForConnectionReady now properly detects ACTIVE state
// =============================================

// =============================================
// [1] IMPORT VERIFICATION - COMPLETE WITH ALL CORE EXPORTS
// =============================================

import {
    // Core State
    authReadyReceived,
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
    SessionManager,
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

    // Search Functions - CRITICAL FOR REAL SEARCH
    searchFriends,
    searchFriendsByLetter,

    // Lifecycle - Core exports from friend-core.js
    LifecycleStateMachine,
    LIFECYCLE_STATES,
    __session,
    parentReadyReceived,
    childReadySent,
    currentState,
    transitionTo,
    assertActive,
    onModuleActive,
    sendChildReady,
    handleParentReady,

    // Nearby Discovery
    NearbyManager,

    // Authorized HTTP request helper
    authorizedRequest,

    // State setters (ES module bindings are read-only; use these to mutate)
    setCurrentCategoryFilter,
    setCurrentSearchTerm

} from './friend-core.js';

// =============================================
// [2B] CHAT NAVIGATION FIX - FIXED with proper event
// =============================================

/**
 * Enhanced navigate to chat that ensures the messages module opens
 * the chat with the selected user immediately
 */
function navigateToChatWithUser(userId, userName, additionalData = {}) {
    if (!userId) {
        console.error('[ChatNav] Cannot navigate to chat: No user ID provided');
        showNotification('Cannot start chat: User not found', 'error');
        return;
    }
    
    const displayName = userName || 'User';
    // FIX: parseInt() returns NaN for UUID-based IDs — chat module receives NaN
    // and shows "Unknown User". Preserve the ID as-is: coerce to integer only
    // when the ID is purely numeric, otherwise keep as string (UUID).
    const rawId = String(userId).trim();
    const parsedInt = parseInt(rawId, 10);
    const safeUserId = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
    console.log('[ChatNav] Opening chat with user:', { userId: safeUserId, displayName });
    
    // Close any open modals
    if (domElements.startChatModal) domElements.startChatModal.classList.remove('active');
    if (domElements.friendDetailsPanel) domElements.friendDetailsPanel.classList.remove('active');
    if (domElements.addFriendModal) domElements.addFriendModal.classList.remove('active');
    
    // Build the chat payload
    const chatPayload = {
        userId: safeUserId,
        userName: displayName,
        timestamp: Date.now(),
        source: 'friends-module'
    };

    // Store under both keys for reliability
    sessionStorage.setItem('pending_chat', JSON.stringify(chatPayload));
    sessionStorage.setItem('open_chat_on_load', JSON.stringify(chatPayload));
    
    // Send OPEN_CHAT_WITH_USER event to parent
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'OPEN_CHAT_WITH_USER',
            userId: safeUserId,
            userName: displayName,
            source: 'friends-ui',
            timestamp: Date.now()
        }, '*');
        
        // Also send SWITCH_MODULE to ensure navigation
        window.parent.postMessage({
            type: 'SWITCH_MODULE',
            module: 'messages',
            payload: chatPayload,
            source: 'friends-ui',
            timestamp: Date.now()
        }, '*');
        
        showNotification(`Opening chat with ${displayName}...`, 'info', 1500);
    } else {
        // Fallback: direct navigation
        window.location.href = `message.html?openChat=${safeUserId}&userName=${encodeURIComponent(displayName)}`;
    }
}

// =============================================
// [2C] CALL NAVIGATION FIX - RELIABLE IMPLEMENTATION
// =============================================

function navigateToCallModule(userId, userName, callType = 'voice') {
    if (!userId) {
        console.error('[CallNav] Cannot navigate to call: No user ID provided');
        showNotification('Cannot start call: User not found', 'error');
        return;
    }
    
    const displayName = userName || 'User';
    // FIX: same UUID-safe ID coercion as navigateToChatWithUser
    const rawId = String(userId).trim();
    const parsedInt = parseInt(rawId, 10);
    const safeUserId = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
    console.log('[CallNav] Opening call with user:', { userId: safeUserId, displayName, callType });
    
    // Close any open modals
    if (domElements.startChatModal) domElements.startChatModal.classList.remove('active');
    if (domElements.friendDetailsPanel) domElements.friendDetailsPanel.classList.remove('active');
    if (domElements.addFriendModal) domElements.addFriendModal.classList.remove('active');
    
    // Build the call payload
    const callPayload = {
        userId: safeUserId,
        userName: displayName,
        callType: callType,
        returnTo: 'friends',
        timestamp: Date.now(),
        source: 'friends-module'
    };
    
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'SWITCH_MODULE',
            module: 'calls',
            payload: callPayload,
            source: 'friends-ui',
            timestamp: Date.now()
        }, '*');
        
        showNotification(`Starting ${callType} call with ${displayName}...`, 'info', 1500);
    } else {
        // Fallback: direct navigation
        window.location.href = `calls.html?userId=${safeUserId}&name=${encodeURIComponent(displayName)}&type=${callType}`;
    }
}

// =============================================
// HOISTED HELPERS — defined at module scope so tab handlers can call them
// before bindAllEvents() has finished running
// =============================================

async function loadGroupsIntoSelect() {
    const groupSelect = document.getElementById('groupSelect');
    if (!groupSelect) return;
    groupSelect.innerHTML = '<option value="">Loading groups…</option>';
    try {
        await loadGroupsFromBackend();
        const groupsArr = Array.isArray(groups) ? groups : [];
        if (groupsArr.length === 0) {
            groupSelect.innerHTML = '<option value="">No groups found</option>';
            return;
        }
        groupSelect.innerHTML =
            '<option value="">— Select a group —</option>' +
            groupsArr.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    } catch (e) {
        groupSelect.innerHTML = '<option value="">Failed to load groups</option>';
    }
}

async function loadGroupMembers(groupId, searchTerm) {
    const groupMembersList = document.getElementById('groupMembersList');
    if (!groupMembersList || !groupId) return;
    groupMembersList.innerHTML =
        '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading members…</div>';
    try {
        const response = await authorizedRequest(`/api/groups/${groupId}/members`);
        let members = (response && response.data && (response.data.members || response.data)) || [];
        if (!Array.isArray(members)) members = [];
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            members = members.filter(m =>
                (m.username || '').toLowerCase().includes(s) ||
                (m.displayName || '').toLowerCase().includes(s)
            );
        }
        if (members.length === 0) {
            groupMembersList.innerHTML =
                '<div style="text-align:center;padding:20px;color:var(--text-secondary);">No members found</div>';
            return;
        }
        groupMembersList.innerHTML = members.map(m => {
            const isSelf = m.id === (currentUser && currentUser.id);
            const avatarUrl = m.photoURL || m.avatar;
            const avatarInner = avatarUrl
                ? `<img src="${escapeHtml(avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
                : escapeHtml(((m.displayName || m.username || '?')[0]).toUpperCase());
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid var(--border-color);">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;flex-shrink:0;overflow:hidden;">${avatarInner}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;">${escapeHtml(m.displayName || m.username)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">@${escapeHtml(m.username || '')}</div>
                </div>
                <button class="action-btn primary group-add-btn" data-user-id="${m.id}" data-username="${escapeHtml(m.username || '')}" style="padding:6px 14px;font-size:13px;"${isSelf ? ' disabled' : ''}>
                    ${isSelf ? 'You' : '<i class="fas fa-user-plus"></i> Add'}
                </button>
            </div>`;
        }).join('');
        groupMembersList.querySelectorAll('.group-add-btn').forEach(btn => {
            btn.addEventListener('click', async function () {
                const rawId = this.dataset.userId;
                const parsedInt = parseInt(rawId, 10);
                const uid = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
                const uname = this.dataset.username;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const result = await sendFriendRequest(uid, 'friend', 'Added from group');
                if (result && result.success) {
                    this.innerHTML = '<i class="fas fa-check"></i> Sent';
                    showNotification('Request sent to @' + uname, 'success');
                } else {
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-user-plus"></i> Add';
                    showNotification((result && result.error) || 'Failed to send request', 'error');
                }
            });
        });
    } catch (e) {
        groupMembersList.innerHTML =
            '<div style="text-align:center;padding:20px;color:var(--danger-color);">Failed to load members</div>';
    }
}

// =============================================
// [2] DEBUG HELPER - ENHANCED
// =============================================
const UI_DEBUG = true;
let _uiInitialized = false;
let _eventHandlersBound = false;
let _retryButtonsSetup = false;

function logUI(message, data) {
    if (UI_DEBUG) console.log(`[UI] ${message}`, data || '');
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({
                type: 'UI_DEBUG',
                payload: { message, data },
                source: 'friends-ui',
                timestamp: Date.now()
            }, '*');
        } catch (e) {}
    }
}

// =============================================
// [2A] LIFECYCLE UI GUARD - STRICT STATE COMPLIANCE
// =============================================

/**
 * Checks if the module is in ACTIVE state and parent is ready
 * If not, shows a passive loading state or disables interactive elements
 */
let _cachedUIActive = false;
let _lastUIActiveCheck = 0;

function isUIActive() {
    // DEMO BYPASS: if the current friends array is entirely demo contacts,
    // allow rendering immediately regardless of lifecycle state so users see
    // the demo friends instead of the "please wait" spinner.
    const friendArr = Array.isArray(friends) ? friends : [];
    if (friendArr.length > 0 && friendArr.every(f => f && f.isDemo)) {
        return true;
    }

    // Cache result for 100ms to avoid excessive checks
    const now = Date.now();
    if (now - _lastUIActiveCheck < 100) {
        return _cachedUIActive;
    }
    _lastUIActiveCheck = now;
    
    // Use LifecycleStateMachine if available
    if (LifecycleStateMachine && typeof LifecycleStateMachine.isActive !== 'undefined') {
        _cachedUIActive = LifecycleStateMachine.isActive === true && parentReadyReceived === true;
        return _cachedUIActive;
    }
    // Fallback to checking parentReadyReceived
    _cachedUIActive = (parentReadyReceived === true && currentState === LIFECYCLE_STATES.ACTIVE);
    return _cachedUIActive;
}

/**
 * canRenderCached — returns true when we have local data to show even if the
 * lifecycle hasn't reached ACTIVE yet (offline or slow parent handshake).
 * Use this instead of isUIActive() for all read-only rendering paths.
 */
function canRenderCached() {
    if (isUIActive()) return true;
    // Allow rendering if we have ANY local data — friends list, requests, or users
    const hasFriends   = (window.friends?.length  || friends?.length)  > 0;
    const hasRequests  = (window.friendRequests?.length || friendRequests?.length) > 0;
    const hasUsers     = (window._allUsersCache?.length) > 0;
    const hasCached    = hasFriends || hasRequests || hasUsers;
    // Also allow if IndexedDB hydration has been triggered (offline-first path)
    const offlineHydrated = !navigator.onLine && hasCached;
    return offlineHydrated || hasCached;
}

function getLifecycleState() {
    if (LifecycleStateMachine && LifecycleStateMachine.current) {
        return LifecycleStateMachine.current;
    }
    if (currentState) {
        return currentState;
    }
    return LIFECYCLE_STATES.BOOT;
}

function getLifecycleStateDisplay() {
    const state = getLifecycleState();
    const stateNames = {
        'BOOT': 'Booting',
        'INITIALIZING': 'Initializing',
        'READY': 'Ready',
        'WAIT_PARENT': 'Connecting',
        'ACTIVE': 'Active',
        'ERROR': 'Error'
    };
    return stateNames[state] || state;
}

function guardUIAction(actionName, fn, fallback = null) {
    return function(...args) {
        if (!isUIActive()) {
            const state = getLifecycleState();
            const parentReady = parentReadyReceived;
            
            logUI(`UI action '${actionName}' blocked - module not active`, {
                state,
                parentReady,
                sessionReady: __session?.ready
            });
            
            // Only show notification for user-initiated actions
            if (actionName !== 'passive' && actionName !== 'render' && showNotification) {
                if (actionName.includes('click') || actionName.includes('btn') || actionName.includes('action')) {
                    let message = 'Please wait while module initializes...';
                    if (state === LIFECYCLE_STATES.WAIT_PARENT) {
                        message = 'Waiting for connection...';
                    } else if (state === LIFECYCLE_STATES.READY) {
                        message = 'Establishing session...';
                    }
                    showNotification(message, 'info', 2000);
                }
            }
            
            if (typeof fallback === 'function') {
                return fallback.apply(this, args);
            }
            return fallback;
        }
        return fn.apply(this, args);
    };
}

// =============================================
// [3] IMMEDIATE DOM ELEMENT REFERENCES - WITH SAFE GETTERS
// =============================================

const domElements = {
    // Main containers
    friendDetailsPanel: null,
    addFriendModal: null,
    friendRequestModal: null,
    startChatModal: null,
    mutualFriendsModal: null,
    cameraScannerModal: null,
    notification: null,
    sidebar: null,

    // Section containers
    allFriendsSection: null,
    contactsSection: null,
    friendsSection: null,
    requestsSection: null,
    temporarySection: null,
    pinnedSection: null,
    mutedSection: null,

    // List containers
    allFriendsList: null,
    contactsList: null,
    friendsList: null,
    requestsList: null,
    sentRequestsList: null,
    temporaryList: null,
    pinnedList: null,
    mutedList: null,

    // Category tabs
    allTab: null,
    contactsTab: null,
    friendsTab: null,
    requestsTab: null,
    temporaryTab: null,
    pinnedTab: null,
    mutedTab: null,

    // Action buttons
    addFriendBtn: null,
    syncContactsBtn: null,
    scanQRBtn: null,
    discoverBtn: null,
    startNewChatBtn: null,
    backBtn: null,
    closeAddFriendModal: null,
    cancelAddFriendBtn: null,
    closeStartChatModal: null,
    cancelStartChatBtn: null,
    closeMutualFriendsModal: null,
    closeCameraBtn: null,
    toggleCameraBtn: null,
    toggleFlashBtn: null,
    scanQRBtnModal: null,
    sendFriendRequestBtn: null,
    declineRequestBtn: null,
    acceptRequestBtn: null,
    confirmStartChatBtn: null,
    redirectToLoginBtn: null,
    retryAuthBtn: null,

    // Search inputs
    friendSearch: null,
    allUsersSearch: null,
    searchChatUser: null,

    // Form inputs
    usernameInput: null,
    friendCategorySelect: null,
    friendNote: null,

    // Status elements
    connectionStatus: null,
    dataSourceIndicator: null,
    dataSourceText: null,

    // QR container
    qrCodeContainer: null
};

// Safe element getter with caching
function getElement(id) {
    if (domElements[id] && document.body.contains(domElements[id])) {
        return domElements[id];
    }
    const element = document.getElementById(id);
    if (element) {
        domElements[id] = element;
    }
    return element;
}

function refreshDomElements() {
    const elementIds = [
        'friendDetailsPanel', 'addFriendModal', 'friendRequestModal', 'startChatModal',
        'mutualFriendsModal', 'cameraScannerModal', 'notification', 'sidebar',
        'allFriendsSection', 'contactsSection', 'friendsSection', 'requestsSection',
        'temporarySection', 'pinnedSection', 'mutedSection',
        'allFriendsList', 'contactsList', 'friendsList', 'requestsList', 'sentRequestsList',
        'temporaryList', 'pinnedList', 'mutedList',
        'allTab', 'contactsTab', 'friendsTab', 'requestsTab', 'temporaryTab', 'pinnedTab', 'mutedTab',
        'addFriendBtn', 'syncContactsBtn', 'scanQRBtn', 'discoverBtn', 'startNewChatBtn', 'backBtn',
        'closeAddFriendModal', 'cancelAddFriendBtn', 'closeStartChatModal', 'cancelStartChatBtn',
        'closeMutualFriendsModal', 'closeCameraBtn', 'toggleCameraBtn', 'toggleFlashBtn',
        'scanQRBtnModal', 'sendFriendRequestBtn', 'declineRequestBtn', 'acceptRequestBtn',
        'confirmStartChatBtn', 'redirectToLoginBtn', 'retryAuthBtn',
        'friendSearch', 'allUsersSearch', 'searchChatUser',
        'usernameInput', 'friendCategorySelect', 'friendNote',
        'connectionStatus', 'dataSourceIndicator', 'dataSourceText',
        'qrCodeContainer'
    ];
    
    elementIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            domElements[id] = element;
        }
    });
}

// Initial DOM element refresh
refreshDomElements();

logUI('DOM Elements loaded', {
    addFriendBtn: !!domElements.addFriendBtn,
    allTab: !!domElements.allTab,
    friendsTab: !!domElements.friendsTab,
    requestsTab: !!domElements.requestsTab,
    allFriendsList: !!domElements.allFriendsList
});

export const DOM = domElements;

// =============================================
// [4] UI STATE MANAGEMENT - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const UIState = {
    elements: new Map(),
    elementQueries: new Map(),
    history: { stack: [], maxSize: 10, currentIndex: -1 },
    renderCache: new Map(),
    renderTimers: new Map(),
    restorePoints: new Map(),
    activeModals: new Set(),
    activeSection: 'allFriendsSection',
    selectedFriendId: null,
    connectionState: {
        status: 'disconnected',
        lastUpdate: null,
        showStatusBar: true,
        parentVersion: null,
        environment: 'unknown',
        sessionValid: false,
        compatibilityMode: false,
        lifecycleState: getLifecycleState()
    },
    metrics: { lastRender: 0, renderCount: 0, errorCount: 0, fallbackCount: 0, renderTime: 0 },
    debug: window.__IFRAME_DEBUG__ || false,
    _warningsShown: new Set(),
    _pendingSearch: null,

    getElement(id) {
        if (this.elements.has(id)) {
            const cached = this.elements.get(id);
            if (cached && document.body.contains(cached)) return cached;
        }
        const element = document.getElementById(id);
        if (element) this.elements.set(id, element);
        return element;
    },

    querySelector(selector, parent = document) {
        const key = `${parent === document ? 'document' : parent.id || 'unknown'}:${selector}`;
        if (this.elementQueries.has(key)) {
            const cached = this.elementQueries.get(key);
            if (cached && document.body.contains(cached)) return cached;
        }
        const element = parent.querySelector(selector);
        if (element) this.elementQueries.set(key, element);
        return element;
    },

    pushView(sectionId, params = {}) {
        this.history.stack.push({ sectionId, params, timestamp: Date.now(), scrollPosition: window.scrollY });
        if (this.history.stack.length > this.history.maxSize) this.history.stack.shift();
        this.history.currentIndex = this.history.stack.length - 1;
    },

    popView() {
        if (this.history.stack.length > 1) {
            this.history.stack.pop();
            this.history.currentIndex = this.history.stack.length - 1;
            return this.history.stack[this.history.currentIndex];
        }
        return null;
    },

    createRestorePoint(id) {
        this.restorePoints.set(id, {
            section: this.activeSection,
            selectedFriendId: this.selectedFriendId,
            scrollPosition: window.scrollY,
            activeModals: Array.from(this.activeModals),
            timestamp: Date.now()
        });
        return id;
    },

    restoreFromPoint(id) {
        const point = this.restorePoints.get(id);
        if (point) {
            this.activeSection = point.section;
            this.selectedFriendId = point.selectedFriendId;

            const section = this.getElement(point.section);
            if (section) {
                document.querySelectorAll('.friends-section').forEach(s => s.classList.remove('active'));
                section.classList.add('active');
            }

            point.activeModals.forEach(modalId => {
                const modal = this.getElement(modalId);
                if (modal) modal.classList.add('active');
                this.activeModals.add(modalId);
            });

            setTimeout(() => window.scrollTo(0, point.scrollPosition), 50);
            return true;
        }
        return false;
    },

    clearExpiredCache() {
        const now = Date.now();
        this.renderTimers.forEach((timestamp, key) => {
            if (now - timestamp > 300000) {
                this.renderCache.delete(key);
                this.renderTimers.delete(key);
            }
        });
    },

    updateConnectionState(status, data = {}) {
        const oldStatus = this.connectionState.status;
        this.connectionState.status = status;
        this.connectionState.lastUpdate = Date.now();
        this.connectionState.lifecycleState = getLifecycleState();
        if (data.parentVersion) this.connectionState.parentVersion = data.parentVersion;
        if (data.sessionValid !== undefined) this.connectionState.sessionValid = data.sessionValid;
        if (data.compatibilityMode !== undefined) this.connectionState.compatibilityMode = data.compatibilityMode;
        this.connectionState.environment = IframeEnvironment ? IframeEnvironment.type : 'unknown';
        this.updateConnectionStatusUI();
    },

    updateConnectionStatusUI() {
        const statusEl = this.getElement('connectionStatus');
        if (!statusEl) return;

        const states = {
            'disconnected': { class: 'disconnected', text: 'Disconnected' },
            'connecting': { class: 'connecting', text: 'Connecting...' },
            'connected': { class: 'connected', text: 'Connected' },
            'degraded': { class: 'degraded', text: 'Degraded' }
        };

        const state = states[this.connectionState.status] || states.disconnected;
        statusEl.className = `connection-status ${state.class}`;
        
        // Add lifecycle state as data attribute
        statusEl.dataset.lifecycle = this.connectionState.lifecycleState;
        
        // Update text with lifecycle info
        const lifecycleDisplay = getLifecycleStateDisplay();
        statusEl.title = `Lifecycle: ${lifecycleDisplay} | Session: ${this.connectionState.sessionValid ? 'Valid' : 'Invalid'}`;
        
        statusEl.style.display = this.connectionState.showStatusBar ? 'inline-flex' : 'none';
    },

    _showOnce(key, message, level = 'info', showNotification = false) {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        if (showNotification && typeof showNotification === 'function') {
            showNotification(message, level, 3000);
        } else if (level === 'warn') {
            console.warn(`[UIState] ${message}`);
        } else if (level === 'error') {
            console.error(`[UIState] ${message}`);
        } else if (this.debug) {
            console.log(`[UIState] ${message}`);
        }
    },

    getDebugInfo() {
        return {
            connection: this.connectionState,
            metrics: this.metrics,
            kyn: {
                handshakeCompleted: kynState ? kynState.handshakeCompleted : false,
                compatibilityMode: kynState ? kynState.compatibilityMode : false,
                parentReady: parentReadyReceived
            },
            session: {
                valid: __session?.ready || false
            },
            environment: IframeEnvironment ? IframeEnvironment.type : 'unknown',
            features: IframeEnvironment ? IframeEnvironment.features : {},
            lifecycle: {
                state: getLifecycleState(),
                isActive: isUIActive(),
                parentReady: parentReadyReceived,
                sessionReady: __session?.ready,
                childReadySent: childReadySent
            }
        };
    }
};

// =============================================
// [5] UI ERROR BOUNDARIES - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const UIBoundaries = {
    _warningsShown: new Set(),

    renderSection(sectionId, renderFn, fallbackFn = null) {
        return ErrorHandler.createBoundary(`Section:${sectionId}`, () => {
            const startTime = performance.now();
            try {
                // If not active, show passive loading state
                if (!isUIActive()) {
                    const container = UIState.getElement(sectionId);
                    if (container && container.children.length === 0) {
                        container.innerHTML = this.createPassiveLoadingState(sectionId);
                    }
                    return null;
                }
                
                const result = renderFn();
                UIState.metrics.lastRender = performance.now() - startTime;
                UIState.metrics.renderCount++;
                UIState.metrics.renderTime = performance.now() - startTime;
                return result;
            } catch (error) {
                UIState.metrics.errorCount++;
                this._showOnce(`section_error_${sectionId}`, `Section ${sectionId} render failed`, 'debug');
                DiagnosticsAgent.trackFailure(error, { section: sectionId });
                if (fallbackFn) return fallbackFn();
                const container = UIState.getElement(sectionId);
                if (container) container.innerHTML = this.createSectionFallback(sectionId);
                return null;
            }
        }, null);
    },
    
    createPassiveLoadingState(sectionId) {
        const sectionNames = {
            'allFriendsSection': 'All Friends',
            'contactsSection': 'Contacts',
            'friendsSection': 'Friends',
            'requestsSection': 'Requests',
            'temporarySection': 'Temporary',
            'pinnedSection': 'Pinned',
            'mutedSection': 'Muted'
        };
        
        const lifecycleState = getLifecycleState();
        const lifecycleDisplay = getLifecycleStateDisplay();
        let statusMessage = 'Loading...';
        
        if (lifecycleState === LIFECYCLE_STATES.BOOT || lifecycleState === LIFECYCLE_STATES.INITIALIZING) {
            statusMessage = 'Initializing module...';
        } else if (lifecycleState === LIFECYCLE_STATES.READY) {
            statusMessage = 'Waiting for parent connection...';
        } else if (lifecycleState === LIFECYCLE_STATES.WAIT_PARENT) {
            statusMessage = 'Establishing connection...';
        } else if (lifecycleState === LIFECYCLE_STATES.ERROR) {
            statusMessage = 'Connection error - retrying...';
        }
        
        return `
            <div class="empty-state loading-passive" data-lifecycle="${lifecycleState}">
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <p>Loading ${sectionNames[sectionId] || 'section'}...</p>
                <p class="subtext">${statusMessage}</p>
                <p class="subtext" style="font-size: 10px; margin-top: 5px;">State: ${lifecycleDisplay}</p>
            </div>
        `;
    },

    createSectionFallback(sectionId) {
        UIState.metrics.fallbackCount++;
        const sectionNames = {
            'allFriendsSection': 'All Friends',
            'contactsSection': 'Contacts',
            'friendsSection': 'Friends',
            'requestsSection': 'Requests',
            'temporarySection': 'Temporary',
            'pinnedSection': 'Pinned',
            'mutedSection': 'Muted'
        };
        return `
            <div class="empty-state error-boundary" data-section="${sectionId}">
                <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
                <p>Unable to load ${sectionNames[sectionId] || 'section'}</p>
                <p class="subtext">Please try refreshing</p>
                <button class="action-btn secondary retry-section-btn" data-section="${sectionId}" style="margin-top: 15px;">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>
        `;
    },

    createModalFallback(modalId) {
        return `
            <div class="add-friend-container error-boundary">
                <div class="add-friend-header">
                    <h3>Unable to Load</h3>
                    <button class="add-friend-btn close-modal-fallback" data-modal="${modalId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding: 40px 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--warning-color); margin-bottom: 15px;"></i>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">Failed to load modal content</p>
                    <button class="action-btn secondary retry-modal-btn" data-modal="${modalId}">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            </div>
        `;
    },

    asyncBoundary(name, fn, fallback = null) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this._showOnce(`async_${name}`, `Error in ${name}`, 'debug');
                DiagnosticsAgent.trackFailure(error, { asyncBoundary: name });
                if (typeof fallback === 'function') return fallback(...args);
                return fallback;
            }
        };
    },

    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        if (level === 'warn' && UIState.debug) console.warn(`[UIBoundaries] ${message}`);
        else if (level === 'error' && UIState.debug) console.error(`[UIBoundaries] ${message}`);
        else if (UIState.debug) console.log(`[UIBoundaries] ${message}`);
    }
};

// =============================================
// [6] RENDERING PIPELINE - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const RenderPipeline = {
    status: { skeleton: false, initialRender: false, progressive: false, liveUpdate: false, ready: false, kynReady: false },
    queue: [],
    processing: false,
    _warningsShown: new Set(),
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;
        
        this.renderSkeleton();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.renderInitial());
        } else {
            this.renderInitial();
        }
        window.addEventListener('friendCoreReady', () => this.renderProgressive());
        window.addEventListener('kynSessionReady', () => this.handleSessionReady());
        window.addEventListener('userDataLoaded', () => setTimeout(() => this.enableLiveUpdates(), 500));
        
        // Listen for lifecycle changes
        window.addEventListener('lifecycleChanged', (event) => {
            if (event.detail?.toState === LIFECYCLE_STATES.ACTIVE) {
                UIState.updateConnectionState('connected', { 
                    sessionValid: true,
                    lifecycleState: LIFECYCLE_STATES.ACTIVE
                });
                this.renderProgressive();
                this.enableLiveUpdates();
            } else if (event.detail?.toState === LIFECYCLE_STATES.WAIT_PARENT) {
                UIState.updateConnectionState('connecting', {
                    lifecycleState: LIFECYCLE_STATES.WAIT_PARENT
                });
                this.refreshPassiveStates();
            } else if (event.detail?.toState === LIFECYCLE_STATES.ERROR) {
                UIState.updateConnectionState('degraded', {
                    lifecycleState: LIFECYCLE_STATES.ERROR
                });
            }
        });
        
        // Listen for parent ready
        window.addEventListener('parentReady', () => {
            logUI('Parent ready event received in UI');
            UIState.updateConnectionState('connected', {
                sessionValid: __session?.ready || false
            });
        });
        
        this._showOnce('init', 'RenderPipeline initialized', 'debug');
    },
    
    refreshPassiveStates() {
        const sections = [
            'allFriendsSection', 'contactsSection', 'friendsSection',
            'requestsSection', 'temporarySection', 'pinnedSection', 'mutedSection'
        ];
        
        sections.forEach(sectionId => {
            const container = UIState.getElement(sectionId);
            if (container && container.querySelector('.loading-passive')) {
                const section = document.getElementById(sectionId);
                if (section && section.classList.contains('active')) {
                    if (sectionId === 'allFriendsSection') renderAllFriendsList();
                    else if (sectionId === 'contactsSection') renderContacts();
                    else if (sectionId === 'friendsSection') renderFriends();
                    else if (sectionId === 'requestsSection') {
                        renderFriendRequests();
                        renderSentRequests();
                    }
                    else if (sectionId === 'temporarySection') renderTemporaryFriends();
                    else if (sectionId === 'pinnedSection') renderPinnedFriends();
                    else if (sectionId === 'mutedSection') renderMutedFriends();
                }
            }
        });
    },

    handleSessionReady() {
        UIState.updateConnectionState('connected');
        this.renderProgressive();
    },

    renderSkeleton() {
        UIBoundaries.renderSection('allFriendsSection', () => {
            if (domElements.allFriendsList && domElements.allFriendsList.children.length === 0) {
                domElements.allFriendsList.innerHTML = this.createSkeletonLoader('friends', 8);
            }
        });
        UIBoundaries.renderSection('friendsSection', () => {
            if (domElements.friendsList && domElements.friendsList.children.length === 0) {
                domElements.friendsList.innerHTML = this.createSkeletonLoader('friends', 5);
            }
        });
        UIBoundaries.renderSection('requestsSection', () => {
            if (domElements.requestsList && domElements.requestsList.children.length === 0) {
                domElements.requestsList.innerHTML = this.createSkeletonLoader('requests', 3);
            }
        });
        this.status.skeleton = true;
        this._showOnce('skeleton', 'Skeleton rendered', 'debug');
    },

    createSkeletonLoader(type, count = 5) {
        let html = '';
        for (let i = 0; i < count; i++) {
            if (type === 'friends') {
                html += `
                    <div class="friend-item skeleton-item">
                        <div class="friend-avatar skeleton-pulse" style="width: 50px; height: 50px; border-radius: 50%;"></div>
                        <div class="friend-info" style="flex: 1;">
                            <div class="skeleton-pulse" style="height: 18px; width: 70%; margin-bottom: 8px;"></div>
                            <div class="skeleton-pulse" style="height: 14px; width: 40%;"></div>
                        </div>
                        <div class="friend-actions">
                            <div class="skeleton-pulse" style="width: 32px; height: 32px; border-radius: 8px;"></div>
                            <div class="skeleton-pulse" style="width: 32px; height: 32px; border-radius: 8px;"></div>
                        </div>
                    </div>
                `;
            } else if (type === 'requests') {
                html += `
                    <div class="friend-item skeleton-item">
                        <div class="friend-avatar skeleton-pulse" style="width: 50px; height: 50px; border-radius: 50%;"></div>
                        <div class="friend-info" style="flex: 1;">
                            <div class="skeleton-pulse" style="height: 18px; width: 60%; margin-bottom: 8px;"></div>
                            <div class="skeleton-pulse" style="height: 14px; width: 30%;"></div>
                        </div>
                        <div class="friend-actions">
                            <div class="skeleton-pulse" style="width: 32px; height: 32px; border-radius: 8px;"></div>
                            <div class="skeleton-pulse" style="width: 32px; height: 32px; border-radius: 8px;"></div>
                        </div>
                    </div>
                `;
            }
        }
        return html;
    },

    renderInitial() {
        UIBoundaries.renderSection('allFriendsSection', () => {
            this.renderFriendsListInstantly();
            this.status.initialRender = true;
        }, () => {
            if (domElements.allFriendsList) {
                domElements.allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
            }
        });
        this._showOnce('initial', 'Initial render complete', 'debug');
    },

    renderProgressive: function() {
        // FIX: Allow progressive render when we have cached data offline,
        // even if the lifecycle hasn't reached ACTIVE yet.
        if (!isUIActive() && !canRenderCached()) {
            logUI('renderProgressive blocked - not active and no cache');
            return;
        }
        if (this.status.progressive) return;
        
        UIBoundaries.renderSection('allFriendsSection', () => {
            if (apiReady && cacheLoaded) {
                updateCurrentSection();
                this.status.progressive = true;
            }
        });
        this._showOnce('progressive', 'Progressive enhancement complete', 'debug');
    },

    enableLiveUpdates: function() {
        if (!isUIActive()) {
            // PHASE10-FIX: Don't just block — schedule a retry so live updates
            // activate as soon as the lifecycle reaches ACTIVE.
            // Only retry once to avoid infinite loops.
            if (!this._liveUpdateRetryScheduled) {
                this._liveUpdateRetryScheduled = true;
                setTimeout(() => {
                    this._liveUpdateRetryScheduled = false;
                    this.enableLiveUpdates();
                }, 2000);
            }
            return;
        }
        if (this.status.liveUpdate) return;
        
        this.setupLiveUpdateListeners();
        this.status.liveUpdate = true;
        this.status.ready = true;
        this._showOnce('live', 'Live updates enabled', 'debug');
    },

    setupLiveUpdateListeners() {
        // Always update counts on these events - no lifecycle guard needed
        window.addEventListener('updateFriendCounts', () => updateFriendCounts());

        // FIX: Listen for CONTACTS_UPDATE dispatched by friend-core after loadFriendsFromBackend.
        // This keeps the count badges and the contacts section in sync without requiring ACTIVE state.
        window.addEventListener('CONTACTS_UPDATE', (event) => {
            updateFriendCounts();
            const contacts = event.detail?.contacts;
            if (Array.isArray(contacts) && contacts.length > 0) {
                // Patch window.contacts so renderContacts() has live data
                window.contacts = contacts;
                if (UIState.activeSection === 'contactsSection') renderContacts();
                if (UIState.activeSection === 'allFriendsSection') renderAllFriendsList();
            }
        });

        window.addEventListener('friendsUpdated', (event) => {
            updateFriendCounts();
            const fromCache      = event.detail?.instant || event.detail?.cached || event.detail?.offline;
            const isRealtime     = event.detail?.realtime === true;
            const isPresence     = event.detail?.presenceUpdate === true;

            if (isPresence) {
                const { userId, online } = event.detail || {};
                if (userId) updateFriendPresence(userId, online, null);
                return;
            }

            const _delay = isRealtime ? 0 : (fromCache ? 50 : 300);
            this.queueRender('friends', debounce(() => {
                updateFriendCounts();
                if (UIState.activeSection === 'friendsSection') renderFriends();
                else if (UIState.activeSection === 'allFriendsSection') renderAllFriendsList();
                else { updateFriendCounts(); }
            }, Math.max(_delay, isRealtime ? 50 : 500)));
        });

        // FIX: Handle FRIENDS_SYNC / FRIENDS_DATA / FRIEND_RELATIONSHIP_CHANGED from parent
        // so this module immediately reflects friend state changes made in other modules.
        window.addEventListener('message', (evt) => {
            if (!evt.data || typeof evt.data !== 'object') return;
            const { type, friends: inboundFriends, requests } = evt.data;

            if (type === 'FRIENDS_SYNC' || type === 'FRIENDS_DATA') {
                if (Array.isArray(inboundFriends) && inboundFriends.length > 0) {
                    if (window.FriendCacheManager?.setFriends) {
                        window.FriendCacheManager.setFriends(inboundFriends);
                        window.FriendCacheManager.syncToGlobals?.();
                    } else {
                        window.friends = inboundFriends;
                    }
                    updateFriendCounts();
                    this.queueRender('friends', debounce(() => {
                        if (UIState.activeSection === 'friendsSection') renderFriends();
                        else if (UIState.activeSection === 'allFriendsSection') renderAllFriendsList();
                        updateFriendCounts();
                    }, 200));
                }
            }

            if (type === 'FRIEND_RELATIONSHIP_CHANGED') {
                const { action, friendId, friend } = evt.data;
                if (action === 'accepted' && friendId) {
                    if (friend && window.FriendCacheManager?.setFriend) {
                        window.FriendCacheManager.setFriend(friend);
                        window.FriendCacheManager.syncToGlobals?.();
                    }
                    // Flip any visible "Add Friend" buttons to "Friends"
                    document.querySelectorAll(
                        `[data-user-id="${friendId}"] .friend-action-btn[data-action="add"],
                         .friend-action-btn[data-action="add"][data-user-id="${friendId}"]`
                    ).forEach(btn => {
                        btn.innerHTML = '<i class="fas fa-check"></i>';
                        btn.title = 'Friends';
                        btn.dataset.action = 'friends';
                        btn.disabled = true;
                        btn.classList.remove('success');
                        btn.classList.add('friends-already');
                    });
                    updateFriendCounts();
                    this.queueRender('friends', debounce(() => {
                        if (UIState.activeSection === 'friendsSection') renderFriends();
                        updateFriendCounts();
                    }, 150));
                } else if (action === 'removed' && friendId) {
                    if (window.FriendCacheManager?.removeFriend) {
                        window.FriendCacheManager.removeFriend(String(friendId));
                        window.FriendCacheManager.syncToGlobals?.();
                    }
                    this.queueRender('friends', debounce(() => {
                        if (UIState.activeSection === 'friendsSection') renderFriends();
                        updateFriendCounts();
                    }, 150));
                }
            }

            // Also handle FRIENDS_SYNC dispatched as a window CustomEvent (same-frame path)
            if (type === 'friend:accepted') {
                const { friend: acceptedFriend } = evt.data.payload || {};
                if (acceptedFriend && window.FriendCacheManager?.setFriend) {
                    window.FriendCacheManager.setFriend(acceptedFriend);
                    window.FriendCacheManager.syncToGlobals?.();
                    updateFriendCounts();
                    this.queueRender('friends', debounce(() => {
                        renderFriends(); renderAllFriendsList(); updateFriendCounts();
                    }, 200));
                }
            }
        });

        // Catch any data load completion events and update counts
        window.addEventListener('requestsUpdated', () => updateFriendCounts());
        window.addEventListener('sentRequestsUpdated', () => updateFriendCounts());
        window.addEventListener('friendRequestSent', () => {
            updateFriendCounts();
            renderSentRequests();
        });
        window.addEventListener('pinnedFriendsUpdated', () => updateFriendCounts());
        window.addEventListener('mutedFriendsUpdated', () => updateFriendCounts());
        window.addEventListener('contactsUpdated', () => updateFriendCounts());

        
        window.addEventListener('requestsUpdated', (event) => {
            // Always update counts; render if we have data, are active, or event is real-time
            updateFriendCounts();
            const hasRequests = (window.friendRequests?.length || friendRequests?.length || 0) > 0;
            const hasSent     = (window.sentRequests?.length  || sentRequests?.length  || 0) > 0;
            const isRealtime  = event.detail?.realtime === true;
            if (!isUIActive() && !hasRequests && !hasSent && !isRealtime) return;

            // FIX: Always render both lists — receiver may be on friends/all-users tab
            // when the socket event arrives. Render immediately, section doesn't matter.
            this.queueRender('requests', debounce(() => {
                renderFriendRequests();
                renderSentRequests();
                updateFriendCounts();
            }, isRealtime ? 0 : 300));
        });

        window.addEventListener('sentRequestsUpdated', (event) => {
            updateFriendCounts();
            const isOptimistic = event.detail?.optimistic === true || event.detail?.confirmed === true;
            if (isOptimistic) {
                renderSentRequests();
                updateFriendCounts();
            } else {
                const hasSent = (window.sentRequests?.length || sentRequests?.length || 0) > 0;
                if (!isUIActive() && !hasSent) return;
                this.queueRender('sentRequests', debounce(() => {
                    renderSentRequests();
                    updateFriendCounts();
                }, 200));
            }
        });

        window.addEventListener('contactsUpdated', () => {
            const hasContacts = (window.contacts?.length || contacts?.length || 0) > 0;
            if (!isUIActive() && !hasContacts) return;
            
            this.queueRender('contacts', debounce(() => {
                if (UIState.activeSection === 'contactsSection') renderContacts();
            }, 300));
        });
        
        // Listen for search results from core
        window.addEventListener('friendSearchResults', (event) => {
            if (!isUIActive()) return;
            const { query, results } = event.detail || {};
            logUI('Search results received from core', { query, count: results?.length });
            this.queueRender('searchResults', debounce(() => {
                displaySearchResults(results, query);
            }, 100));
        });
        
        // Listen for friend request accepted events
        window.addEventListener('friendRequestAccepted', (event) => {
            if (!isUIActive()) return;
            const { friendId, friend } = event.detail || {};
            console.log('[UI] Friend request accepted for:', friendId);
            if (friend && friend.id) {
                if (!Array.isArray(window.friends)) window.friends = [];
                if (!window.friends.find(f => String(f.id) === String(friend.id))) {
                    window.friends = [...window.friends, friend];
                }
            }
            updateFriendCounts();
            renderFriends();
            renderAllFriendsList();
            renderFriendRequests();
            setTimeout(() => {
                loadFriendsFromBackend().then(() => {
                    renderFriends(); renderAllFriendsList(); updateFriendCounts();
                    if (window.FriendCacheManager?.syncToGlobals) window.FriendCacheManager.syncToGlobals();
                }).catch(() => {});
                loadFriendRequestsFromBackend().then(() => renderFriendRequests()).catch(() => {});
                loadSentRequestsFromBackend().then(() => renderSentRequests()).catch(() => {});
            }, 500);
        });
        
        // Listen for global search results
        window.addEventListener('friendGlobalSearchResults', (event) => {
            if (!isUIActive()) return;
            const { query, results } = event.detail || {};
            logUI('Global search results received', { query, count: results?.length });
            this.queueRender('globalSearchResults', debounce(() => {
                displaySearchResults(results, query);
            }, 100));
        });
        
        // Listen for allUsersLoaded event to trigger re-render
        window.addEventListener('allUsersLoaded', (event) => {
            const { users, count } = event.detail || {};
            logUI('allUsersLoaded event received', { count: count || users?.length });
            // Update cache immediately regardless of lifecycle state
            if (Array.isArray(users) && users.length > 0) {
                _allUsersCache = users;
                window._allUsersCache = users;
            }
            this.queueRender('allUsers', debounce(() => {
                // Check if all-users tab is active before re-rendering
                const allUsersTab = document.querySelector('.add-friend-tab[data-tab="all-users"]');
                const allUsersContent = document.getElementById('all-usersTab');
                if (allUsersTab && allUsersTab.classList.contains('active') &&
                    allUsersContent && allUsersContent.classList.contains('active')) {
                    renderAllUsersList();
                }
            }, 50));
        });
        
        this.processQueue();
    },

    queueRender(key, renderFn) {
        this.queue.push({ key, renderFn, timestamp: Date.now() });
        if (!this.processing) this.processQueue();
    },

    processQueue() {
        this.processing = true;
        const process = () => {
            if (this.queue.length === 0) {
                this.processing = false;
                return;
            }
            const grouped = {};
            this.queue.forEach(item => grouped[item.key] = item);
            this.queue = [];
            Object.values(grouped).forEach(item => {
                try {
                    item.renderFn();
                } catch (error) {
                    this._showOnce(`render_${item.key}`, `Failed to render ${item.key}`, 'debug');
                    DiagnosticsAgent.trackFailure(error, { renderQueue: item.key });
                }
            });
            setTimeout(process, 100);
        };
        setTimeout(process, 50);
    },

    renderFriendsListInstantly() {
        return ErrorHandler.createBoundary('renderFriendsListInstantly', () => {
            if (!domElements.allFriendsList) return;

            // FIX: Always prefer window globals (set by loadCachedDataInstantly/syncToGlobals)
            // over the module-level imported arrays which may not be populated yet.
            const pinnedArray  = Array.isArray(window.pinnedFriends)  ? window.pinnedFriends  : (Array.isArray(pinnedFriends)  ? pinnedFriends  : []);
            const friendArray  = Array.isArray(window.friends)        ? window.friends        : (Array.isArray(friends)        ? friends        : []);
            const contactArray = Array.isArray(window.contacts)       ? window.contacts       : (Array.isArray(contacts)       ? contacts       : []);

            const allToDisplay = [...pinnedArray, ...friendArray, ...contactArray].slice(0, 25);

            if (allToDisplay.length === 0) {
                // FIX: When arrays are empty offline, trigger IndexedDB hydration
                // instead of immediately showing passive-loading. The hydration will
                // dispatch friendsUpdated which re-renders with real data.
                if (!navigator.onLine || !isUIActive()) {
                    // Check if there's anything in localStorage first (fastest path)
                    try {
                        const lsKey = 'knecta_friends_cache';
                        const raw = JSON.parse(localStorage.getItem(lsKey) || localStorage.getItem('friends') || '[]');
                        // FIX: Filter to only accepted friends — pending/blocked records must not
                        // render as friends. status absent on legacy records → treat as accepted.
                        const acceptedOnly = Array.isArray(raw) ? raw.filter(f => {
                            if (!f || !f.id) return false;
                            const st = f.status || 'accepted';
                            return st === 'accepted' || st === 'online' || st === 'offline' || st === 'away' || st === 'busy';
                        }) : [];
                        if (acceptedOnly.length > 0) {
                            // Populate module globals and re-render
                            if (window.FriendCacheManager?.setFriends) {
                                window.FriendCacheManager.setFriends(acceptedOnly);
                                window.FriendCacheManager.syncToGlobals?.();
                            }
                            // Render immediately from localStorage data
                            const fragment = document.createDocumentFragment();
                            acceptedOnly.slice(0, 25).forEach(item => {
                                if (!item?.id) return;
                                const el = createFriendItemElement(item, 'friend', true);
                                if (el) fragment.appendChild(el);
                            });
                            domElements.allFriendsList.innerHTML = '';
                            domElements.allFriendsList.appendChild(fragment);
                            domElements.allFriendsList.classList.add('instant-load');
                            return;
                        }
                    } catch (_) {}

                    // Nothing in localStorage — trigger async IndexedDB hydration.
                    // Show skeleton while we wait (not a blank screen).
                    if (!domElements.allFriendsList.querySelector('.skeleton-item')) {
                        domElements.allFriendsList.innerHTML = UIBoundaries.createPassiveLoadingState('allFriendsSection');
                    }
                    // Kick off IndexedDB hydration — result fires friendsUpdated
                    (async () => {
                        try {
                            const ls = window.KynectaFriendsLocalStore;
                            if (!ls) return;
                            await ls.ready();
                            const idbFriends = await ls.getFriends();
                            if (!idbFriends.length) return;
                            // Normalize and populate globals
                            const normalized = idbFriends.map(r => ({
                                id:          r.friendId,
                                localId:     r.id,
                                displayName: r.displayName || r.username || r.friendId,
                                username:    r.username || '',
                                avatar:      r.avatar || '',
                                photoURL:    r.avatar || '',
                                status:      r.status,
                                addedAt:     r.createdAt,
                                isLocalOnly: r.isLocalOnly,
                            }));
                            if (window.FriendCacheManager?.setFriends) {
                                window.FriendCacheManager.setFriends(normalized);
                                window.FriendCacheManager.syncToGlobals?.();
                            }
                            window.dispatchEvent(new CustomEvent('friendsUpdated', {
                                detail: { friends: normalized, count: normalized.length, cached: true, offline: !navigator.onLine }
                            }));
                        } catch (e) {
                            console.warn('[renderFriendsListInstantly] IndexedDB hydration failed:', e.message);
                        }
                    })();
                    return;
                }

                domElements.allFriendsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-friends"></i>
                        <p>No friends yet</p>
                        <p class="subtext">Add friends to start connecting</p>
                        <button class="action-btn primary" id="emptyStateAddFriendBtn" style="margin-top: 15px;">
                            <i class="fas fa-user-plus"></i> Add Friend
                        </button>
                    </div>
                `;

                const emptyBtn = document.getElementById('emptyStateAddFriendBtn');
                if (emptyBtn) {
                    emptyBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        if (domElements.addFriendModal) domElements.addFriendModal.classList.add('active');
                    });
                }
                return;
            }

            domElements.allFriendsList.innerHTML = '';
            const fragment = document.createDocumentFragment();
            allToDisplay.forEach(item => {
                if (!item?.id) return;
                const friendElement = createFriendItemElement(item,
                    pinnedArray.some(f => f && f.id === item.id) ? 'pinned' :
                    friendArray.some(f => f && f.id === item.id) ? 'friend' : 'contact',
                    true
                );
                if (friendElement) fragment.appendChild(friendElement);
            });

            domElements.allFriendsList.appendChild(fragment);
            domElements.allFriendsList.classList.add('instant-load');

        }, () => {
            if (domElements.allFriendsList) {
                domElements.allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
            }
        });
    },

    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        if (level === 'warn' && (UIState.debug || (IframeEnvironment && IframeEnvironment.type === 'LOCAL_DEV'))) {
            console.warn(`[RenderPipeline] ${message}`);
        } else if (level === 'error' && (UIState.debug || (IframeEnvironment && IframeEnvironment.type === 'LOCAL_DEV'))) {
            console.error(`[RenderPipeline] ${message}`);
        } else if (UIState.debug) {
            console.log(`[RenderPipeline] ${message}`);
        }
    }
};

// =============================================
// [7] CORE INTEGRATION BRIDGE - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const CoreIntegration = {
    subscriptions: new Set(),
    _warningsShown: new Set(),
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;
        this.subscribeToCoreEvents();
        this._showOnce('init', 'CoreIntegration initialized', 'debug');
    },

    subscribeToCoreEvents() {
        this.subscribe('friendCoreReady', (event) => {
            const data = this.validateEventData(event);
            if (!data) return;
            this._showOnce('core_ready', 'Friend core ready', 'debug');
            if (data.sessionValid) UIState.updateConnectionState('connected');
            else UIState.updateConnectionState('degraded');
            
            window.dispatchEvent(new CustomEvent('lifecycleChanged', {
                detail: { 
                    toState: LIFECYCLE_STATES.ACTIVE,
                    fromState: data.state || 'UNKNOWN'
                }
            }));
            
            RenderPipeline.renderProgressive();
        });

        this.subscribe('parentSessionReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.session) return;
            this._showOnce('parent_ready', 'Parent session ready', 'debug');
            if (data.session.user) updateUIWithUserData(data.session.user);
            hideAuthError();
            updateCurrentSection();
            UIState.updateConnectionState('connected');
            
            if (!isUIActive()) {
                window.dispatchEvent(new CustomEvent('lifecycleChanged', {
                    detail: { toState: LIFECYCLE_STATES.ACTIVE }
                }));
            }
        });

        this.subscribe('parentSessionUpdated', (event) => {
            const data = this.validateEventData(event);
            if (!data?.session) return;
            this._showOnce('parent_updated', 'Parent session updated', 'debug');
            if (data.session.user) updateUIWithUserData(data.session.user);
        });

        this.subscribe('parentSessionLogout', (event) => {
            this._showOnce('parent_logout', 'Parent session logout', 'debug');
            showAuthError('You have been logged out');
            UIState.updateConnectionState('disconnected');
            updateCurrentSection();
        });

        this.subscribe('userDataLoaded', (event) => {
            const data = this.validateEventData(event);
            if (!data?.userData) return;
            this._showOnce('user_loaded', 'User data loaded', 'debug');
            if (featureFlags.qrCode && data.userData.id) setTimeout(generateUniqueQRCode, 300);
            updateFriendCounts();
        });

        this.subscribe('knectaAuthReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.user) return;
            this._showOnce('auth_ready', 'Auth ready', 'debug');
            if (isInitialized) updateCurrentSection();
        });

        this.subscribe('knectaCacheReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.user) return;
            this._showOnce('cache_ready', 'Cache ready', 'debug');
        });

        this.subscribe('knectaTokenExpired', () => {
            this._showOnce('token_expired', 'Token expired', 'debug');
            showAuthError('Your session has expired. Please log in again.');
        });

        this.subscribe('knectaAuthError', () => {
            this._showOnce('auth_error', 'Auth error', 'debug');
            showAuthError('Authentication error. Please try again.');
        });

        this.subscribe('friendsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.friends) {
                updateFriendCounts();
                // FIX: always render — render functions have their own data-presence guards
                if (UIState.activeSection === 'friendsSection') renderFriends();
                else renderAllFriendsList();
            }
        });

        this.subscribe('requestsUpdated', (event) => {
            const data = this.validateEventData(event);
            // FIX: Always render — section guard was causing receiver to miss incoming requests
            updateFriendCounts();
            renderFriendRequests();
            renderSentRequests();
        });

        this.subscribe('sentRequestsUpdated', (event) => {
            const data = this.validateEventData(event);
            // FIX: Always render sent requests regardless of active section
            renderSentRequests();
            updateFriendCounts();
        });

        this.subscribe('updateCurrentSection', () => updateCurrentSection());
        this.subscribe('renderFriendsListInstantly', () => RenderPipeline.renderFriendsListInstantly());
        
        this.subscribe('friendPresenceUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.userId) {
                updateFriendPresence(data.userId, data.online, data.lastSeen);
            }
        });
        
        this.subscribe('friendRequestReceived', (event) => {
            const data = this.validateEventData(event);
            // FIX: Render immediately from the already-updated cache — no API roundtrip needed.
            // The core already called FriendCacheManager.setRequest() and syncToGlobals() before
            // dispatching this event, so window.friendRequests is already up-to-date.
            updateFriendCounts();
            if (UIState.activeSection === 'requestsSection') {
                renderFriendRequests();
                renderSentRequests();
            } else {
                // Not on requests tab — just update the badge count
                updateFriendCounts();
            }
            if (data?.request?.senderName) {
                showNotification(`New friend request from ${data.request.senderName}`, 'info');
            } else {
                showNotification('New friend request received', 'info');
            }
        });
        
        this.subscribe('friendRequestAccepted', (event) => {
            const data = this.validateEventData(event);
            // FIX: Always reload and re-render the friends list unconditionally.
            // Previously renderFriends/renderAllFriendsList were only called when the
            // activeSection matched — so if the user was on the requests tab when the
            // accept completed, the friends list stayed empty and the count stayed 0.
            updateFriendCounts();
            renderFriends();
            renderAllFriendsList();
            renderFriendRequests();
            renderSentRequests();
            if (data?.friendId) {
                loadFriendsFromBackend().then(() => {
                    renderFriends();
                    renderAllFriendsList();
                    updateFriendCounts();
                    if (window.FriendCacheManager && typeof window.FriendCacheManager.syncToGlobals === 'function') {
                        window.FriendCacheManager.syncToGlobals();
                    }
                }).catch(() => {});
                loadSentRequestsFromBackend().catch(() => {});
                loadFriendRequestsFromBackend().catch(() => {});
            }
        });
        
        this.subscribe('friendRequestRejected', (event) => {
            showNotification('Friend request was rejected', 'info');
            updateFriendCounts();
            if (UIState.activeSection === 'requestsSection') {
                renderFriendRequests();
                renderSentRequests();
            }
            loadSentRequestsFromBackend().catch(() => {});
        });
        
        this.subscribe('friendRemoved', (event) => {
            const data = this.validateEventData(event);
            // FIX: Render immediately — core already updated cache before dispatch.
            // No API refetch needed for instant response.
            updateFriendCounts();
            if (UIState.activeSection === 'friendsSection') {
                renderFriends();
            } else if (UIState.activeSection === 'allFriendsSection') {
                renderAllFriendsList();
            }
            if (data?.friendId) {
                loadFriendsFromBackend().catch(() => {});
            }
        });
        
        this.subscribe('parentReady', () => {
            logUI('Parent ready event received in CoreIntegration');
            UIState.updateConnectionState('connected');
        });
        
        this.subscribe('lifecycleChanged', (event) => {
            if (event.detail?.toState === LIFECYCLE_STATES.ACTIVE) {
                logUI('Lifecycle changed to ACTIVE in CoreIntegration');
                UIState.updateConnectionState('connected');
                RenderPipeline.renderProgressive();
                RenderPipeline.enableLiveUpdates();
            }
        });
        
        // Subscribe to search results from core
        this.subscribe('friendGlobalSearchResults', (event) => {
            const data = this.validateEventData(event);
            if (data?.results) {
                logUI('Global search results received', { count: data.results.length });
                displaySearchResults(data.results, data.query);
            }
        });
        
        // Subscribe to allUsersLoaded to refresh UI when data arrives
        this.subscribe('allUsersLoaded', (event) => {
            const data = this.validateEventData(event);
            logUI('allUsersLoaded event in CoreIntegration', { 
                count: data?.users?.length || data?.count || 0 
            });
            // Force refresh if all-users tab is active
            const allUsersTab = document.querySelector('.add-friend-tab[data-tab="all-users"]');
            const allUsersContent = document.getElementById('all-usersTab');
            if (allUsersTab && allUsersTab.classList.contains('active') && 
                allUsersContent && allUsersContent.classList.contains('active')) {
                setTimeout(() => renderAllUsersList(), 10);
            }
        });
    },

    subscribe(eventName, handler) {
        const wrappedHandler = (event) => {
            try {
                handler(event);
            } catch (error) {
                this._showOnce(`handler_${eventName}`, `Error in ${eventName} handler`, 'debug');
                DiagnosticsAgent.trackFailure(error, { handler: eventName });
            }
        };
        window.addEventListener(eventName, wrappedHandler);
        this.subscriptions.add({ eventName, handler: wrappedHandler });
        return this;
    },

    validateEventData(event) {
        if (!event || typeof event !== 'object') return null;
        if (!event.detail || typeof event.detail !== 'object') return null;
        return SecurityManager ? SecurityManager.sanitizeMessage(event.detail) : event.detail;
    },

    destroy() {
        this.subscriptions.forEach(({ eventName, handler }) => window.removeEventListener(eventName, handler));
        this.subscriptions.clear();
        this._showOnce('destroy', 'All subscriptions cleared', 'debug');
    },

    _showOnce(key, message, level = 'info') {
        if (this._warningsShown.has(key)) return;
        this._warningsShown.add(key);
        if (level === 'warn' && (UIState.debug || (IframeEnvironment && IframeEnvironment.type === 'LOCAL_DEV'))) {
            console.warn(`[CoreIntegration] ${message}`);
        } else if (level === 'error' && (UIState.debug || (IframeEnvironment && IframeEnvironment.type === 'LOCAL_DEV'))) {
            console.error(`[CoreIntegration] ${message}`);
        } else if (UIState.debug) {
            console.log(`[CoreIntegration] ${message}`);
        }
    }
};

// =============================================
// [7A] SEARCH RESULT DISPLAY FUNCTION - REAL BACKEND INTEGRATION
// =============================================
function displaySearchResults(results, query) {
    const allUsersListElement = document.getElementById('allUsersList');
    const allUsersStatusElement = document.getElementById('allUsersStatus');
    
    if (!allUsersListElement) return;
    
    if (!results || results.length === 0) {
        allUsersListElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No users found for "${escapeHtml(query || '')}"</p>
                <p class="subtext">Try a different search term</p>
            </div>
        `;
        if (allUsersStatusElement) {
            allUsersStatusElement.textContent = `0 users found for "${escapeHtml(query || '')}"`;
        }
        return;
    }
    
    if (allUsersStatusElement) {
        allUsersStatusElement.textContent = `${results.length} user${results.length !== 1 ? 's' : ''} found for "${escapeHtml(query || '')}"`;
    }
    
    const fragment = document.createDocumentFragment();
    let validCount = 0;
    results.forEach(user => {
        const userItem = createUserSearchItemElement(user);
        if (userItem && userItem.nodeType === Node.ELEMENT_NODE) {
            fragment.appendChild(userItem);
            validCount++;
        } else {
            console.warn('[displaySearchResults] Skipping invalid user item', user);
        }
    });
    
    allUsersListElement.innerHTML = '';
    if (validCount === 0) {
        allUsersListElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
                <p>Unable to display users</p>
                <p class="subtext">Please try refreshing</p>
            </div>
        `;
    } else {
        allUsersListElement.appendChild(fragment);
    }
}

// =============================================
// [7B] GET ONLINE STATUS CLASS FROM USER OBJECT
// =============================================
function getUserOnlineStatusClass(user) {
    if (!user) return 'offline';
    
    // Check explicit online flag first
    if (user.online === true) return 'online';
    
    // Check status field
    const status = (user.status || '').toLowerCase();
    if (status === 'online') return 'online';
    if (status === 'away') return 'away';
    if (status === 'busy') return 'busy';
    if (status === 'offline') return 'offline';
    
    // Check lastSeen for recent activity
    if (user.lastSeen) {
        try {
            const lastSeen = new Date(user.lastSeen);
            const minutesAgo = Math.floor((Date.now() - lastSeen) / 60000);
            if (minutesAgo < 5) return 'online';
            if (minutesAgo < 15) return 'away';
        } catch (e) {}
    }
    
    return 'offline';
}

function getUserOnlineStatusText(user) {
    if (!user) return 'Offline';
    
    if (user.online === true) return 'Online now';
    
    const status = (user.status || '').toLowerCase();
    if (status === 'online') return 'Online now';
    if (status === 'away') return 'Away';
    if (status === 'busy') return 'Busy';
    
    if (user.lastSeen) {
        try {
            const lastSeen = new Date(user.lastSeen);
            const minutesAgo = Math.floor((Date.now() - lastSeen) / 60000);
            if (minutesAgo < 5) return 'Online now';
            if (minutesAgo < 15) return `Last seen ${minutesAgo} minutes ago`;
            return `Last seen ${formatTimeAgo(lastSeen)}`;
        } catch (e) {}
    }
    
    return 'Offline';
}

// =============================================
// [8] UI RENDERING FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

// FIXED: updateFriendCounts - no lifecycle guard, reads from window globals (set by syncToGlobals)
export const updateFriendCounts = function() {
    try {
        // window globals are always fresh - syncToGlobals() dispatches updateFriendCounts after every update
        const friendArray   = Array.isArray(window.friends)       ? window.friends       : (Array.isArray(friends)       ? friends       : []);
        const contactArray  = Array.isArray(window.contacts)      ? window.contacts      : (Array.isArray(contacts)      ? contacts      : []);
        const requestArray  = Array.isArray(window.friendRequests) ? window.friendRequests : (Array.isArray(friendRequests) ? friendRequests : []);
        const sentArray     = Array.isArray(window.sentRequests)   ? window.sentRequests   : (Array.isArray(sentRequests)   ? sentRequests   : []);
        const pinnedArray   = Array.isArray(window.pinnedFriends)  ? window.pinnedFriends  : (Array.isArray(pinnedFriends)  ? pinnedFriends  : []);
        const mutedArray    = Array.isArray(window.mutedFriends)   ? window.mutedFriends   : (Array.isArray(mutedFriends)   ? mutedFriends   : []);
        const temporaryArray = Array.isArray(window.temporaryFriends) ? window.temporaryFriends : (Array.isArray(temporaryFriends) ? temporaryFriends : []);

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set('totalFriends', friendArray.length);
        set('totalFriendsStat', friendArray.length);
        set('friendsCount', friendArray.length);
        set('onlineFriends', friendArray.filter(f => f && (f.online === true || f.status === 'online')).length);
        set('pinnedFriends', pinnedArray.length);
        set('pinnedCount', pinnedArray.length);
        set('mutedCount', mutedArray.length);
        set('contactsCount', contactArray.length);
        set('requestsCount', requestArray.length);
        set('requestsSectionCount', requestArray.length);
        set('sentRequestsCount', sentArray.length);
        set('temporaryCount', temporaryArray.length);
    } catch(e) {
        console.warn('[updateFriendCounts] Error:', e);
    }
};

export const updateCurrentSection = function() {
    // FIX: Use canRenderCached so cached friends always render offline,
    // even before the parent handshake / ACTIVE lifecycle state.
    if (!isUIActive() && !canRenderCached()) {
        return null;
    }
    return ErrorHandler.createBoundary('updateCurrentSection', () => {
        updateFriendCounts();

        const activeSection = document.querySelector('.friends-section.active');
        if (activeSection) {
            const sectionId = activeSection.id;
            UIState.activeSection = sectionId;

            switch(sectionId) {
                case 'allFriendsSection': renderAllFriendsList(); break;
                case 'contactsSection': renderContacts(); break;
                case 'friendsSection': renderFriends(); break;
                case 'requestsSection':
                    renderFriendRequests();
                    renderSentRequests();
                    break;
                case 'temporarySection': renderTemporaryFriends(); break;
                case 'pinnedSection': renderPinnedFriends(); break;
                case 'mutedSection': renderMutedFriends(); break;
            }
        }
    }, null);
};

export const renderAllFriendsList = function() {
    // Use window globals (always fresh from syncToGlobals)
    const _localFriends = (() => {
        try {
            const parsed = JSON.parse(localStorage.getItem('friends') || '[]');
            console.log('[LOCAL LOAD]', parsed);
            return window.safeArray(parsed);
        } catch (_) {
            return [];
        }
    })();
    const _pinnedArray = Array.isArray(window.pinnedFriends) ? window.pinnedFriends : (Array.isArray(pinnedFriends) ? pinnedFriends : []);
    const _friendArray = Array.isArray(window.friends) ? window.friends : (Array.isArray(friends) ? friends : _localFriends);
    const _contactArray = Array.isArray(window.contacts) ? window.contacts : (Array.isArray(contacts) ? contacts : []);
    const _temporaryArray = Array.isArray(window.temporaryFriends) ? window.temporaryFriends : (Array.isArray(temporaryFriends) ? temporaryFriends : []);
    const _hasData = _friendArray.length + _pinnedArray.length + _contactArray.length + _temporaryArray.length > 0;

    // PRODUCTION FIX: If we have cached data, always render it even before ACTIVE state.
    // Previously this returned null when !isUIActive(), causing blank screens on tab click.
    if (!_hasData && !isUIActive()) {
        // Show skeleton loader instead of blank/null so user sees something immediately
        if (domElements.allFriendsList && !domElements.allFriendsList.querySelector('.skeleton-item')) {
            domElements.allFriendsList.innerHTML = `
                <div class="skeleton-item" style="display:flex;align-items:center;padding:12px 16px;gap:12px;opacity:0.5;">
                    <div style="width:44px;height:44px;border-radius:50%;background:var(--border-color,#e0e0e0);flex-shrink:0;"></div>
                    <div style="flex:1;"><div style="height:12px;background:var(--border-color,#e0e0e0);border-radius:4px;margin-bottom:6px;width:60%;"></div><div style="height:10px;background:var(--border-color,#e0e0e0);border-radius:4px;width:40%;"></div></div>
                </div>
                <div class="skeleton-item" style="display:flex;align-items:center;padding:12px 16px;gap:12px;opacity:0.35;">
                    <div style="width:44px;height:44px;border-radius:50%;background:var(--border-color,#e0e0e0);flex-shrink:0;"></div>
                    <div style="flex:1;"><div style="height:12px;background:var(--border-color,#e0e0e0);border-radius:4px;margin-bottom:6px;width:70%;"></div><div style="height:10px;background:var(--border-color,#e0e0e0);border-radius:4px;width:45%;"></div></div>
                </div>
                <div class="skeleton-item" style="display:flex;align-items:center;padding:12px 16px;gap:12px;opacity:0.2;">
                    <div style="width:44px;height:44px;border-radius:50%;background:var(--border-color,#e0e0e0);flex-shrink:0;"></div>
                    <div style="flex:1;"><div style="height:12px;background:var(--border-color,#e0e0e0);border-radius:4px;margin-bottom:6px;width:50%;"></div><div style="height:10px;background:var(--border-color,#e0e0e0);border-radius:4px;width:35%;"></div></div>
                </div>
            `;
        }
        return null;
    }
    
    return ErrorHandler.createBoundary('renderAllFriendsList', () => {
        if (!domElements.allFriendsList) return;

        domElements.allFriendsList.innerHTML = '';

        const pinnedArray = _pinnedArray;
        const friendArray = _friendArray;
        const contactArray = _contactArray;
        const temporaryArray = _temporaryArray;

        const allToDisplay = [...pinnedArray, ...friendArray, ...contactArray, ...temporaryArray];

        // FIX: Use String(id) as Map key — integer 3 and string '3' are different
        // Map keys, causing the same friend to appear twice in the list.
        const uniqueMap = new Map();
        allToDisplay.forEach(item => { if (item && item.id) uniqueMap.set(String(item.id), item); });
        const uniqueItems = Array.from(uniqueMap.values());

        if (uniqueItems.length === 0) {
            domElements.allFriendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No friends yet</p>
                    <p class="subtext">Add friends to start connecting</p>
                    <button class="action-btn primary" id="emptyStateAddFriendBtn" style="margin-top: 15px;">
                        <i class="fas fa-user-plus"></i> Add Friend
                    </button>
                </div>
            `;

            const emptyBtn = document.getElementById('emptyStateAddFriendBtn');
            if (emptyBtn) {
                emptyBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    if (domElements.addFriendModal) domElements.addFriendModal.classList.add('active');
                });
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        uniqueItems.forEach(item => {
            const type = pinnedArray.some(f => f && f.id === item.id) ? 'pinned' :
                       friendArray.some(f => f && f.id === item.id) ? 'friend' :
                       temporaryArray.some(f => f && f.id === item.id) ? 'temporary' : 'contact';

            const friendElement = createFriendItemElement(item, type);
            if (friendElement) fragment.appendChild(friendElement);
        });

        domElements.allFriendsList.appendChild(fragment);
        domElements.allFriendsList.classList.add('rendered');

    }, () => {
        if (domElements.allFriendsList) {
            domElements.allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
        }
    });
};

export const renderContacts = function() {
    const _contactArr = Array.isArray(window.contacts) ? window.contacts : (Array.isArray(contacts) ? contacts : []);
    if (_contactArr.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderContacts', () => {
        if (!domElements.contactsList) return;

        domElements.contactsList.innerHTML = '';

        const contactArray = Array.isArray(contacts) ? contacts : [];

        if (contactArray.length === 0) {
            domElements.contactsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-address-book"></i>
                    <p>No contacts found</p>
                    <p class="subtext">Sync your phone contacts to find friends</p>
                    <button class="action-btn primary" id="contactsSyncBtn" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Sync Contacts
                    </button>
                </div>
            `;

            const syncBtn = document.getElementById('contactsSyncBtn');
            if (syncBtn) {
                syncBtn.addEventListener('click', async () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    if (!featureFlags.contactsSync) return;
                    syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
                    syncBtn.disabled = true;
                    try {
                        await simulateContactSync();
                        await loadContactsFromBackend();
                        renderContacts();
                    } catch (error) {
                        console.warn('Contact sync failed:', error);
                        showNotification('Contact sync failed', 'error');
                    } finally {
                        syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Contacts';
                        syncBtn.disabled = false;
                    }
                });
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        contactArray.forEach(contact => {
            const contactElement = createFriendItemElement(contact, 'contact');
            if (contactElement) fragment.appendChild(contactElement);
        });
        domElements.contactsList.appendChild(fragment);

    }, () => {
        if (domElements.contactsList) {
            domElements.contactsList.innerHTML = UIBoundaries.createSectionFallback('contactsSection');
        }
    });
};

export const renderFriends = function() {
    // FIX: Read friends exclusively from FriendCacheManager/window globals.
    // NEVER trigger any API call or backend fetch from inside renderFriends —
    // doing so causes an infinite loop:
    //   renderFriends → loadFriendsFromBackend → syncToGlobals → friendsUpdated → renderFriends
    // The backend sync is handled by loadFriendsFromBackend() called from lifecycle events,
    // not from within the render function itself.
    let _friendArray = [];
    let _pinnedArray = [];

    // Priority 1: FriendCacheManager (the authoritative in-memory store)
    if (typeof FriendCacheManager !== 'undefined' && FriendCacheManager.getAllFriends) {
        const _cached = FriendCacheManager.getAllFriends();
        if (Array.isArray(_cached) && _cached.length > 0) {
            _friendArray = _cached;
        }
    }
    // Priority 2: window globals (set by syncToGlobals)
    if (_friendArray.length === 0) {
        _friendArray = Array.isArray(window.friends) ? window.friends :
                       (Array.isArray(friends) ? friends : []);
    }
    // Priority 3: FriendService last data (fallback, no new fetch)
    if (_friendArray.length === 0 && window.FriendService && window.FriendService._lastFriendsData) {
        _friendArray = window.FriendService._lastFriendsData || [];
    }

    _pinnedArray = Array.isArray(window.pinnedFriends) ? window.pinnedFriends :
                   (Array.isArray(pinnedFriends) ? pinnedFriends : []);

    console.log('[UI] renderFriends count:', _friendArray.length);
    
    // FIX: Deduplicate _friendArray by String(id) before rendering.
    // Multiple iframe instances (chat.html + calls.html sub-iframes) each call
    // syncToGlobals, potentially appending duplicates to window.friends.
    const _seenIds = new Set();
    _friendArray = _friendArray.filter(f => {
        if (!f || !f.id) return false;
        const k = String(f.id);
        if (_seenIds.has(k)) return false;
        _seenIds.add(k);
        return true;
    });

    // Normalize all friends to canonical structure
    const normalizedFriends = _friendArray.map(friend => {
        if (!friend) return null;
        
        // Use normalizeFriend if available (from FriendService)
        if (window.normalizeFriend) {
            return window.normalizeFriend(friend);
        }
        
        // Fallback normalization
        return {
            id: friend.id || friend.friendId,
            name: friend.name || friend.displayName || friend.username || `User ${friend.id || ''}`,
            avatar: friend.avatar || friend.photoURL || null,
            status: friend.status || 'offline',
            lastSeen: friend.lastSeen || friend.lastActive || null,
            isOnline: (friend.status === 'online') || (friend.isOnline === true),
            username: friend.username || '',
            displayName: friend.displayName || friend.name || friend.username || '',
            firstName: friend.firstName || '',
            lastName: friend.lastName || '',
            online: friend.online || friend.status === 'online',
            // Legacy compatibility
            ...friend
        };
    }).filter(Boolean);

    // Only block if truly no data and not active yet
    if (normalizedFriends.length === 0 && !isUIActive()) {
        return null;
    }
    
    return ErrorHandler.createBoundary('renderFriends', () => {
        if (!domElements.friendsList) return;

        domElements.friendsList.innerHTML = '';

        const friendArray = _friendArray;
        const pinnedArray = _pinnedArray;

        if (friendArray.length === 0) {
            domElements.friendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No friends yet</p>
                    <p class="subtext">Add friends to start connecting</p>
                    <button class="action-btn primary" id="friendsEmptyAddBtn" style="margin-top: 15px;">
                        <i class="fas fa-user-plus"></i> Add Friend
                    </button>
                </div>
            `;

            const addBtn = document.getElementById('friendsEmptyAddBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    if (domElements.addFriendModal) domElements.addFriendModal.classList.add('active');
                });
            }
            return;
        }

        // DEMO BANNER: shown when all friends are demo contacts
        const allDemo = friendArray.length > 0 && friendArray.every(f => f && f.isDemo);
        if (allDemo) {
            const banner = document.createElement('div');
            banner.className = 'demo-friends-banner';
            banner.style.cssText = [
                'background:linear-gradient(135deg,rgba(108,99,255,.12),rgba(255,101,132,.12))',
                'border:1px dashed rgba(108,99,255,.4)',
                'border-radius:12px',
                'padding:14px 16px',
                'margin-bottom:12px',
                'font-size:13px',
                'color:var(--text-secondary,#888)',
                'text-align:center',
                'display:flex',
                'align-items:center',
                'gap:10px',
                'justify-content:center'
            ].join(';');
            banner.innerHTML = [
                '<i class="fas fa-magic" style="color:#6C63FF;font-size:16px;flex-shrink:0"></i>',
                '<span>',
                '<strong style="color:var(--text-primary,#333)">Welcome!</strong> ',
                'These are demo contacts showing how the friends feature works. ',
                '<button id="demoBannerAddBtn" style="background:none;border:none;padding:0;cursor:pointer;color:#6C63FF;font-weight:600;text-decoration:underline;font-size:13px">Add a real friend</button> to get started.',
                '</span>'
            ].join('');
            domElements.friendsList.appendChild(banner);
            const addBtn = banner.querySelector('#demoBannerAddBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    if (domElements.addFriendModal) domElements.addFriendModal.classList.add('active');
                });
            }
        }

        const sortedFriends = [...friendArray].sort((a, b) => {
            if (!a || !b) return 0;
            const aPinned = pinnedArray.some(f => f && f.id === a.id);
            const bPinned = pinnedArray.some(f => f && f.id === b.id);
            if (aPinned !== bPinned) return bPinned ? 1 : -1;
            const aOnline = a.online === true || a.status === 'online';
            const bOnline = b.online === true || b.status === 'online';
            if (aOnline !== bOnline) return bOnline ? 1 : -1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        const fragment = document.createDocumentFragment();
        sortedFriends.forEach(friend => {
            const friendElement = createFriendItemElement(friend, 'friend');
            if (friendElement) fragment.appendChild(friendElement);
        });
        domElements.friendsList.appendChild(fragment);

    }, () => {
        if (domElements.friendsList) {
            domElements.friendsList.innerHTML = UIBoundaries.createSectionFallback('friendsSection');
        }
    });
};

export const renderFriendRequests = function() {
    const _reqArr = window.friendRequests || friendRequests || [];
    if (_reqArr.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderFriendRequests', () => {
        if (!domElements.requestsList) return;

        // CRITICAL: Clear the container first
        domElements.requestsList.innerHTML = '';

        // Use the global friendRequests variable
        const requestArray = window.friendRequests || friendRequests || [];
        
        console.log('[UI] renderFriendRequests called, count:', requestArray.length);

        if (requestArray.length === 0) {
            domElements.requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No friend requests</p>
                    <p class="subtext">When someone sends you a request, it will appear here</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        requestArray.forEach(request => {
            const requestElement = createFriendRequestItemElement(request, 'incoming');
            if (requestElement) fragment.appendChild(requestElement);
        });
        domElements.requestsList.appendChild(fragment);
        
        // Update the count badge
        const requestsCountElement = document.getElementById('requestsCount');
        if (requestsCountElement) requestsCountElement.textContent = requestArray.length;
        const requestsSectionCountElement = document.getElementById('requestsSectionCount');
        if (requestsSectionCountElement) requestsSectionCountElement.textContent = requestArray.length;

    }, () => {
        if (domElements.requestsList) {
            domElements.requestsList.innerHTML = UIBoundaries.createSectionFallback('requestsSection');
        }
    });
};
// =============================================
// FIXED: waitForConnectionReady - properly detects ACTIVE state and authorizedRequest availability
// This fixes the "Connection not ready" error when accepting friend requests
// =============================================

async function waitForConnectionReady(maxRetries = 10, delayMs = 300) {
    for (let i = 0; i < maxRetries; i++) {
        // Check conditions using safe fallbacks
        const sessionValid = (typeof __session !== 'undefined' && __session?.ready === true) ||
                             (window.__session?.ready === true);
        const parentReady = (typeof parentReadyReceived !== 'undefined' && parentReadyReceived === true) ||
                            (window.parentReadyReceived === true);
        const stateActive = (typeof currentState !== 'undefined' && currentState === LIFECYCLE_STATES.ACTIVE) ||
                            (window.currentState === LIFECYCLE_STATES.ACTIVE);
        const authReady = (typeof authReadyReceived !== 'undefined' && authReadyReceived === true) ||
                          (window.authReadyReceived === true);
        const apiAvailable = typeof authorizedRequest === 'function';
        
        if (sessionValid && parentReady && stateActive && authReady && apiAvailable) {
            console.log('[UI] Connection ready after', i, 'retries');
            return true;
        }
        
        console.log('[UI] Waiting for connection... retry', i + 1, '/', maxRetries, {
            sessionValid, parentReady, stateActive, authReady, apiAvailable
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    console.error('[UI] Connection not ready after max retries');
    return false;
}

// In friend-ui.js - REPLACE the optimisticAcceptRequest function
// =============================================
// OPTIMISTIC ACCEPT FRIEND REQUEST - COMPLETE FIXED VERSION
// Add this function after waitForConnectionReady
// =============================================

async function optimisticAcceptRequest(requestData, button) {
    if (!requestData) return;
    
    const requestId = requestData.id;
    // FIX: socket-delivered requests use 'requesterId'; polling-fetched use 'senderId'
    const senderId = requestData.senderId || requestData.requesterId || requestData.user?.id || requestData.sender?.id;
    const requestElement = button ? button.closest('.friend-item') : null;
    const displayName = requestData.user?.displayName || requestData.displayName || 'User';
    
    console.log('[UI] Optimistic accept request:', { requestId, senderId });
    
    // Store original data for potential rollback
    const originalRequests = [...(friendRequests || [])];
    const originalRequestElement = requestElement ? requestElement.cloneNode(true) : null;
    
    // OPTIMISTIC UI: Remove from DOM immediately with animation
    if (requestElement) {
        removeRequestCardWithAnimation(requestElement, requestId, true);
    }
    
    // Also update local state immediately
    let requestIndex = -1;
    if (friendRequests && Array.isArray(friendRequests)) {
        requestIndex = friendRequests.findIndex(r => r.id === requestId);
        if (requestIndex !== -1) {
            friendRequests.splice(requestIndex, 1);
        }
    }
    
    // Update UI counts immediately
    updateFriendCounts();
    
    showNotification(`Accepting request from ${displayName}...`, 'info', 1500);
    
    // Wait for connection to be ready
    const isReady = await waitForConnectionReady(15, 500);
    
    if (!isReady) {
        console.error('[UI] Connection not ready for accept');
        showNotification('Connection not ready. Please try again.', 'error');
        
        // Rollback UI
        if (requestElement && requestElement.parentNode === null && originalRequestElement) {
            const container = domElements.requestsList;
            if (container) {
                if (requestIndex !== -1 && container.children[requestIndex]) {
                    container.insertBefore(originalRequestElement, container.children[requestIndex]);
                } else {
                    container.appendChild(originalRequestElement);
                }
                originalRequestElement.style.opacity = '1';
                originalRequestElement.style.transform = '';
                originalRequestElement.style.transition = '';
            }
        }
        
        if (requestIndex !== -1 && originalRequests[requestIndex]) {
            friendRequests.splice(requestIndex, 0, originalRequests[requestIndex]);
        }
        renderFriendRequests();
        updateFriendCounts();
        return;
    }
    
    console.log('[UI] Connection ready, proceeding with API call');
    
    try {
        // FIX: Use the imported acceptFriendRequestOnline from friend-core.js.
        // FriendRequestManager is an internal class inside friend-core and is not
        // exported — calling it here caused "FriendRequestManager is not defined".
        // acceptFriendRequestOnline is the correct public API for this operation.
        const response = await acceptFriendRequestOnline(requestId, senderId);
        
        console.log('[UI] Accept request API response:', response);
        
        if (response && response.success) {
            if (friendRequests && Array.isArray(friendRequests)) {
                const idx = friendRequests.findIndex(r => r.id === requestId);
                if (idx !== -1) friendRequests.splice(idx, 1);
            }
            if (window.friendRequests && Array.isArray(window.friendRequests)) {
                const idx = window.friendRequests.findIndex(r => r.id === requestId);
                if (idx !== -1) window.friendRequests.splice(idx, 1);
            }
            // Immediately inject accepted friend so counts update to 1 right away
            const _newFriend = response.friend || {
                id: String(senderId), displayName: displayName,
                username: requestData.senderUsername || requestData.user?.username || '',
                avatar: requestData.senderAvatar || requestData.user?.avatar || '',
                status: 'offline', addedAt: Date.now()
            };
            if (!Array.isArray(window.friends)) window.friends = [];
            if (!window.friends.find(f => String(f.id) === String(_newFriend.id))) {
                window.friends = [...window.friends, _newFriend];
            }
            if (window.FriendCacheManager?.setFriend) {
                window.FriendCacheManager.setFriend(_newFriend);
                window.FriendCacheManager.syncToGlobals();
            }
            renderFriendRequests(); renderFriends(); renderAllFriendsList(); updateFriendCounts();
            showNotification(`You are now friends with ${displayName}!`, 'success');
            setTimeout(async () => {
                try {
                    await loadFriendsFromBackend();
                    await loadFriendRequestsFromBackend();
                    await loadSentRequestsFromBackend();
                    renderFriends(); renderAllFriendsList(); renderFriendRequests(); updateFriendCounts();
                    if (window.FriendCacheManager?.syncToGlobals) window.FriendCacheManager.syncToGlobals();
                } catch (_) {}
            }, 800);
            
        } else {
            console.error('[UI] Accept request API failed:', response?.error);
            showNotification(response?.error || 'Failed to accept request', 'error');
            
            // Rollback UI
            if (requestElement && requestElement.parentNode === null && originalRequestElement) {
                const container = domElements.requestsList;
                if (container) {
                    if (requestIndex !== -1 && container.children[requestIndex]) {
                        container.insertBefore(originalRequestElement, container.children[requestIndex]);
                    } else {
                        container.appendChild(originalRequestElement);
                    }
                    originalRequestElement.style.opacity = '1';
                    originalRequestElement.style.transform = '';
                    originalRequestElement.style.transition = '';
                }
            }
            
            friendRequests.length = 0;
            friendRequests.push(...originalRequests);
            renderFriendRequests();
            updateFriendCounts();
        }
    } catch (error) {
        console.error('[UI] Accept request error:', error);
        showNotification(error.message || 'Failed to accept request', 'error');
        
        // Rollback UI
        if (requestElement && requestElement.parentNode === null && originalRequestElement) {
            const container = domElements.requestsList;
            if (container) {
                if (requestIndex !== -1 && container.children[requestIndex]) {
                    container.insertBefore(originalRequestElement, container.children[requestIndex]);
                } else {
                    container.appendChild(originalRequestElement);
                }
                originalRequestElement.style.opacity = '1';
                originalRequestElement.style.transform = '';
                originalRequestElement.style.transition = '';
            }
        }
        
        friendRequests.length = 0;
        friendRequests.push(...originalRequests);
        renderFriendRequests();
        updateFriendCounts();
    }
}

function removeRequestCardWithAnimation(requestElement, requestId, isIncoming) {
    if (!requestElement) return;
    
    // Add fade-out animation class
    requestElement.style.transition = 'opacity 0.3s ease, transform 0.2s ease';
    requestElement.style.opacity = '0';
    requestElement.style.transform = 'translateX(-10px)';
    
    // Remove after animation completes
    setTimeout(() => {
        if (requestElement.parentNode) {
            requestElement.remove();
            
            // Check if there are no more requests and show empty state
            const container = isIncoming ? domElements.requestsList : domElements.sentRequestsList;
            if (container && container.children.length === 0) {
                if (isIncoming) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <p>No friend requests</p>
                            <p class="subtext">When someone sends you a request, it will appear here</p>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-paper-plane"></i>
                            <p>No sent requests</p>
                            <p class="subtext">Your sent friend requests will appear here</p>
                        </div>
                    `;
                }
            }
            
            // Update counts
            updateFriendCounts();
        }
    }, 250);
}

// Optimistic decline friend request with UI removal first and proper connection handling
async function optimisticDeclineRequest(requestData, button) {
    if (!requestData) return;
    
    const requestId = requestData.id;
    const requestElement = button ? button.closest('.friend-item') : null;
    const displayName = requestData.user?.displayName || requestData.displayName || 'User';
    
    console.log('[UI] Optimistic decline request:', { requestId });
    
    // Store original data for potential rollback
    const originalRequests = [...(friendRequests || [])];
    const originalRequestElement = requestElement ? requestElement.cloneNode(true) : null;
    
    // OPTIMISTIC UI: Remove from DOM immediately with animation
    if (requestElement) {
        removeRequestCardWithAnimation(requestElement, requestId, true);
    }
    
    // Also update local state immediately
    let requestIndex = -1;
    if (friendRequests && Array.isArray(friendRequests)) {
        requestIndex = friendRequests.findIndex(r => r.id === requestId);
        if (requestIndex !== -1) {
            friendRequests.splice(requestIndex, 1);
        }
    }
    
    showNotification(`Declining request from ${displayName}...`, 'info', 1500);
    
    // Wait for connection to be ready before making API call
    const isReady = await waitForConnectionReady(15, 500);
    
    if (!isReady) {
        console.error('[UI] Connection not ready, cannot decline request');
        showNotification('Connection not ready. Please try again.', 'error');
        
        // Rollback: restore the request to DOM and local state
        if (requestElement && requestElement.parentNode === null && originalRequestElement) {
            const container = domElements.requestsList;
            if (container) {
                if (requestIndex !== -1 && container.children[requestIndex]) {
                    container.insertBefore(originalRequestElement, container.children[requestIndex]);
                } else {
                    container.appendChild(originalRequestElement);
                }
                originalRequestElement.style.opacity = '1';
                originalRequestElement.style.transform = '';
                originalRequestElement.style.transition = '';
            }
        }
        
        if (requestIndex !== -1 && originalRequests[requestIndex]) {
            friendRequests.splice(requestIndex, 0, originalRequests[requestIndex]);
        }
        return;
    }
    
    try {
        const result = await declineFriendRequest(requestData);
        
        if (result && result.success !== false) {
            showNotification(`Request from ${displayName} declined`, 'info');
            // Refresh requests in background to stay in sync
            setTimeout(() => loadFriendRequestsFromBackend(), 500);
        } else {
            // API failed - rollback UI
            console.error('[UI] Decline request API failed:', result?.error);
            showNotification(result?.error || 'Failed to decline request', 'error');
            
            // Rollback: restore the request to DOM and local state
            if (requestElement && requestElement.parentNode === null && originalRequestElement) {
                const container = domElements.requestsList;
                if (container) {
                    if (requestIndex !== -1 && container.children[requestIndex]) {
                        container.insertBefore(originalRequestElement, container.children[requestIndex]);
                    } else {
                        container.appendChild(originalRequestElement);
                    }
                    originalRequestElement.style.opacity = '1';
                    originalRequestElement.style.transform = '';
                    originalRequestElement.style.transition = '';
                }
            }
            
            friendRequests.length = 0;
            friendRequests.push(...originalRequests);
            renderFriendRequests();
        }
    } catch (error) {
        console.error('[UI] Decline request error:', error);
        showNotification(error.message || 'Failed to decline request', 'error');
        
        // Rollback: restore the request to DOM and local state
        if (requestElement && requestElement.parentNode === null && originalRequestElement) {
            const container = domElements.requestsList;
            if (container) {
                if (requestIndex !== -1 && container.children[requestIndex]) {
                    container.insertBefore(originalRequestElement, container.children[requestIndex]);
                } else {
                    container.appendChild(originalRequestElement);
                }
                originalRequestElement.style.opacity = '1';
                originalRequestElement.style.transform = '';
                originalRequestElement.style.transition = '';
            }
        }
        
        friendRequests.length = 0;
        friendRequests.push(...originalRequests);
        renderFriendRequests();
    }
}

// Manually refresh friend requests — renders from cache when offline
export const refreshFriendRequests = async function() {
    // If offline or not active but we have cached requests, just re-render them
    const hasRequests = (window.friendRequests?.length || friendRequests?.length || 0) > 0;
    if (!isUIActive()) {
        if (hasRequests) {
            renderFriendRequests();
            renderSentRequests();
        }
        return null;
    }
    return ErrorHandler.createBoundary('refreshFriendRequests', async () => {
        console.log('[UI] Manually refreshing friend requests...');
        
        await loadFriendRequestsFromBackend();
        renderFriendRequests();
        
        // Also refresh sent requests
        await loadSentRequestsFromBackend();
        renderSentRequests();
        
        updateFriendCounts();
        
        console.log('[UI] Friend requests refreshed, count:', friendRequests?.length || 0);
    }, null);
};

// FIXED: renderSentRequests - read from window.sentRequests to avoid stale ES module binding
export const renderSentRequests = function() {
    const sentArray = window.sentRequests || sentRequests || [];
    
    console.log('[UI] renderSentRequests called, count:', sentArray.length);
    if (sentArray.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderSentRequests', () => {
        if (!domElements.sentRequestsList) return;

        domElements.sentRequestsList.innerHTML = '';

        // FIXED: Use window.sentRequests for live data (syncToGlobals keeps this fresh)
        const sentArray = (window.sentRequests && Array.isArray(window.sentRequests)) 
            ? window.sentRequests 
            : (Array.isArray(sentRequests) ? sentRequests : []);
        
        console.log('[UI] renderSentRequests called, count:', sentArray.length);

        if (sentArray.length === 0) {
            domElements.sentRequestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-paper-plane"></i>
                    <p>No sent requests</p>
                    <p class="subtext">Your sent friend requests will appear here</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        sentArray.forEach(request => {
            const requestElement = createFriendRequestItemElement(request, 'sent');
            if (requestElement) fragment.appendChild(requestElement);
        });
        domElements.sentRequestsList.appendChild(fragment);

    }, () => {
        if (domElements.sentRequestsList) {
            domElements.sentRequestsList.innerHTML = UIBoundaries.createSectionFallback('requestsSection');
        }
    });
};

export const renderTemporaryFriends = function() {
    const _tempArr = Array.isArray(window.temporaryFriends) ? window.temporaryFriends : (Array.isArray(temporaryFriends) ? temporaryFriends : []);
    if (_tempArr.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderTemporaryFriends', () => {
        if (!domElements.temporaryList) return;

        domElements.temporaryList.innerHTML = '';

        const temporaryArray = Array.isArray(temporaryFriends) ? temporaryFriends : [];

        if (temporaryArray.length === 0) {
            domElements.temporaryList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clock"></i>
                    <p>No temporary friends</p>
                    <p class="subtext">Temporary friends expire after a set time</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        temporaryArray.forEach(friend => {
            const friendElement = createFriendItemElement(friend, 'temporary');
            if (friendElement) fragment.appendChild(friendElement);
        });
        domElements.temporaryList.appendChild(fragment);

    }, () => {
        if (domElements.temporaryList) {
            domElements.temporaryList.innerHTML = UIBoundaries.createSectionFallback('temporarySection');
        }
    });
};

export const renderPinnedFriends = function() {
    const _pinnedArr = Array.isArray(window.pinnedFriends) ? window.pinnedFriends : (Array.isArray(pinnedFriends) ? pinnedFriends : []);
    if (_pinnedArr.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderPinnedFriends', () => {
        if (!domElements.pinnedList) return;

        domElements.pinnedList.innerHTML = '';

        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];

        if (pinnedArray.length === 0) {
            domElements.pinnedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-thumbtack"></i>
                    <p>No pinned friends</p>
                    <p class="subtext">Pin important friends to keep them at the top</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        pinnedArray.forEach(friend => {
            const friendElement = createFriendItemElement(friend, 'pinned');
            if (friendElement) fragment.appendChild(friendElement);
        });
        domElements.pinnedList.appendChild(fragment);

    }, () => {
        if (domElements.pinnedList) {
            domElements.pinnedList.innerHTML = UIBoundaries.createSectionFallback('pinnedSection');
        }
    });
};

export const renderMutedFriends = function() {
    const _mutedArr = Array.isArray(window.mutedFriends) ? window.mutedFriends : (Array.isArray(mutedFriends) ? mutedFriends : []);
    if (_mutedArr.length === 0 && !isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderMutedFriends', () => {
        if (!domElements.mutedList) return;

        domElements.mutedList.innerHTML = '';

        const mutedArray = Array.isArray(mutedFriends) ? mutedFriends : [];

        if (mutedArray.length === 0) {
            domElements.mutedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-volume-mute"></i>
                    <p>No muted friends</p>
                    <p class="subtext">Mute friends to disable notifications</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        mutedArray.forEach(friend => {
            const friendElement = createFriendItemElement(friend, 'muted');
            if (friendElement) fragment.appendChild(friendElement);
        });
        domElements.mutedList.appendChild(fragment);

    }, () => {
        if (domElements.mutedList) {
            domElements.mutedList.innerHTML = UIBoundaries.createSectionFallback('mutedSection');
        }
    });
};

// =============================================
// [8A] RENDER ALL USERS LIST - FIXED with instant render + real-time search
// =============================================

// Cache for all users data
let _allUsersCache = [];
window.safeArray = window.safeArray || function safeArray(data) {
    return Array.isArray(data) ? data : [];
};

// Update the cache from various sources (sync fast-path + async IndexedDB fallback)
function updateAllUsersCache() {
    // Priority 1: FriendCore in-memory cache (fastest)
    if (window.FriendCore && window.FriendCore._allUsersCache && Array.isArray(window.FriendCore._allUsersCache) && window.FriendCore._allUsersCache.length > 0) {
        _allUsersCache = window.FriendCore._allUsersCache;
        // console.log(`[All Users] Cache updated from FriendCore: ${_allUsersCache.length} users`);
        return _allUsersCache;
    }
    // Priority 2: window global (set by fetchAllUsersFromBackend / syncEngine)
    if (window._allUsersCache && Array.isArray(window._allUsersCache) && window._allUsersCache.length > 0) {
        _allUsersCache = window._allUsersCache;
        // console.log(`[All Users] Cache updated from window: ${_allUsersCache.length} users`);
        return _allUsersCache;
    }
    // Priority 3: imported module-level allUsers array
    if (typeof allUsers !== 'undefined' && Array.isArray(allUsers) && allUsers.length > 0) {
        _allUsersCache = allUsers;
        // console.log(`[All Users] Cache updated from imported allUsers: ${_allUsersCache.length} users`);
        return _allUsersCache;
    }
    // Priority 4: localStorage quick-access
    try {
        const lsUsers = window.safeArray(JSON.parse(localStorage.getItem('discover_users') || '[]'));
        if (lsUsers.length > 0) {
            _allUsersCache = lsUsers;
            console.log('[LOCAL LOAD] discover_users from localStorage:', lsUsers.length);
            return _allUsersCache;
        }
    } catch (_) {}

    // Priority 5: IndexedDB 'users' store — async, fires a re-render when ready.
    // This is the critical offline path: if localStorage was cleared or never
    // populated, IndexedDB is the only durable offline source.
    (async () => {
        try {
            const ls = window.KynectaFriendsLocalStore;
            if (!ls || typeof ls.getAllUsers !== 'function') return;
            const idbUsers = await ls.getAllUsers();
            if (!Array.isArray(idbUsers) || idbUsers.length === 0) return;
            _allUsersCache        = idbUsers;
            window._allUsersCache = idbUsers;
            if (window.FriendCore) {
                window.FriendCore._allUsers         = idbUsers;
                window.FriendCore._allUsersCache    = idbUsers;
                window.FriendCore.discoverableUsers = idbUsers;
            }
            console.log(`[All Users] Cache hydrated from IndexedDB: ${idbUsers.length} users`);
            // Re-render the discover tab with the newly loaded data
            try { renderAllUsersList?.(); } catch (_) {}
        } catch (e) {
            console.warn('[All Users] IndexedDB hydration failed:', e.message);
        }
    })();

    return _allUsersCache; // return current (possibly empty) value synchronously
}

// Get filtered users based on search term
function getFilteredUsers(searchTerm) {
    // FIX-DISCOVER: Use getDiscoverableUsers() which filters out bots, system accounts,
    // AND existing friends. Previously _allUsersCache was used directly, skipping all filters.
    let users;
    if (typeof window.getDiscoverableUsers === 'function') {
        try { users = window.getDiscoverableUsers(_allUsersCache); } catch(_) {}
    }
    if (!users || !users.length) {
        // fallback: filter manually from cache
        const currentUserId = currentUser?.id;
        const existingFriendIds = new Set(
            window.safeArray(window.FriendCore?.friends || window.FriendCore?.getFriends?.() || [])
                .map(f => String(f.id || f.userId || ''))
                .filter(Boolean)
        );
        users = window.safeArray(_allUsersCache.length > 0 ? _allUsersCache : updateAllUsersCache()).filter(user => {
            if (!user || !user.id) return false;
            if (currentUserId && String(user.id) === String(currentUserId)) return false;
            if (existingFriendIds.has(String(user.id))) return false;
            // Filter bots/system accounts
            const uname = (user.username || '').toLowerCase();
            if (uname.startsWith('bot_') || uname.startsWith('system_') || uname.startsWith('admin_')) return false;
            if (user.isBot || user.is_bot || user.isSystem || user.is_system) return false;
            if (user.accountType === 'bot' || user.account_type === 'bot') return false;
            return true;
        });
    }
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        users = users.filter(user => {
            const displayNameMatch = (user.displayName || '').toLowerCase().includes(term);
            const usernameMatch = (user.username || '').toLowerCase().includes(term);
            const emailMatch = (user.email || '').toLowerCase().includes(term);
            return displayNameMatch || usernameMatch || emailMatch;
        });
    }
    
    // Sort users: online first, then alphabetically
    users.sort((a, b) => {
        const aOnline = a.online === true || a.status === 'online';
        const bOnline = b.online === true || b.status === 'online';
        if (aOnline !== bOnline) return bOnline ? 1 : -1;
        return (a.displayName || '').localeCompare(b.displayName || '');
    });
    
    return users;
}

// Render all users from cache (instant)
function renderAllUsersFromCache() {
    const allUsersListElement = document.getElementById('allUsersList');
    const allUsersStatusElement = document.getElementById('allUsersStatus');
    const searchInput = document.getElementById('allUsersSearch');
    
    if (!allUsersListElement) return false;
    
    const searchTerm = searchInput ? searchInput.value : '';
    const filteredUsers = getFilteredUsers(searchTerm);
    
    // console.log(`[All Users] Rendering ${filteredUsers.length} users from cache (search: "${searchTerm}")`);
    
    if (allUsersStatusElement) {
        if (searchTerm) {
            allUsersStatusElement.textContent = `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} found for "${escapeHtml(searchTerm)}"`;
        } else {
            allUsersStatusElement.textContent = `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} available`;
        }
    }
    
    allUsersListElement.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        if (searchTerm) {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No users found for "${escapeHtml(searchTerm)}"</p>
                    <p class="subtext">Try a different search term</p>
                </div>
            `;
        } else {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 15px;"></i>
                    <p>Loading users...</p>
                </div>
            `;
        }
        return false;
    }
    
    const fragment = document.createDocumentFragment();
    filteredUsers.forEach(user => {
        const userItem = createUserSearchItemElement(user);
        if (userItem && userItem.nodeType === Node.ELEMENT_NODE) {
            fragment.appendChild(userItem);
        }
    });
    
    allUsersListElement.appendChild(fragment);
    return true;
}

// Refresh from API in background
async function refreshAllUsersFromAPI() {
    // Rate limiting: don't refresh if already refreshed within last 5 seconds
    const now = Date.now();
    if (window._lastUsersRefresh && now - window._lastUsersRefresh < 5000) {
        // console.log('[All Users] Refresh throttled - last refresh was < 5s ago');
        return;
    }
    window._lastUsersRefresh = now;
    
    // console.log('[All Users] Refreshing from API...');
    try {
        if (typeof fetchAllUsersFromBackend === 'function') {
            await fetchAllUsersFromBackend();
        }
        updateAllUsersCache();
        renderAllUsersFromCache();
        // console.log('[All Users] API refresh complete');
    } catch (err) {
        console.error('[All Users] API refresh failed:', err);
    }
}

export const renderAllUsersList = function() {
    // FIX: Don't block rendering when offline — cached data should always render
    // even if the lifecycle state is not ACTIVE yet.
    const hasCachedUsers = (
        (_allUsersCache && _allUsersCache.length > 0) ||
        (window._allUsersCache && window._allUsersCache.length > 0) ||
        (window.FriendCore?._allUsers?.length > 0)
    );
    if (!isUIActive() && !hasCachedUsers) {
        return null;
    }
    return ErrorHandler.createBoundary('renderAllUsersList', () => {
        // Step 1: Update cache from all available sources (triggers async IndexedDB
        // hydration if all sync sources are empty)
        updateAllUsersCache();
        
        // Step 2: Render immediately from whatever cache is available
        const hasData = renderAllUsersFromCache();
        
        // Step 3: If still no data, show offline-aware empty state (not just spinner)
        if (!hasData && _allUsersCache.length === 0) {
            const allUsersListElement = document.getElementById('allUsersList');
            if (allUsersListElement) {
                if (!navigator.onLine) {
                    allUsersListElement.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-wifi-slash" style="font-size: 32px; margin-bottom: 15px; color: var(--text-muted);"></i>
                            <p>You're offline</p>
                            <p style="font-size:12px;color:var(--text-muted);">No cached users found. Connect to load the directory.</p>
                        </div>
                    `;
                } else {
                    allUsersListElement.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 15px;"></i>
                            <p>Loading users...</p>
                        </div>
                    `;
                }
            }
        }
        
        // Step 4: Background refresh from API (only when online and not already in-flight)
        if (navigator.onLine && !window._allUsersRefreshing) {
            window._allUsersRefreshing = true;
            refreshAllUsersFromAPI().finally(() => {
                window._allUsersRefreshing = false;
            });
        }
        
    }, () => {
        const allUsersListElement = document.getElementById('allUsersList');
        if (allUsersListElement) {
            allUsersListElement.innerHTML = `
                <div class="empty-state error-boundary">
                    <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
                    <p>Unable to load users</p>
                    <button class="action-btn secondary retry-users-btn" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
            const retryBtn = allUsersListElement.querySelector('.retry-users-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    refreshAllUsersFromAPI();
                });
            }
        }
    });
};

// Real-time search handler for all users
function setupAllUsersSearch() {
    const searchInput = document.getElementById('allUsersSearch');
    if (!searchInput) return;
    
    // Remove existing listener if any
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    domElements.allUsersSearch = newSearchInput;
    
    // Add real-time input listener (no debounce for instant feedback)
    newSearchInput.addEventListener('input', function(e) {
        if (!isUIActive()) return;
        const searchTerm = this.value;
        console.log('[All Users] Real-time search:', searchTerm);
        
        // Check if all-users tab is active
        const allUsersTab = document.querySelector('.add-friend-tab[data-tab="all-users"]');
        const allUsersContent = document.getElementById('all-usersTab');
        if (allUsersTab && allUsersTab.classList.contains('active') && 
            allUsersContent && allUsersContent.classList.contains('active')) {
            // Render filtered results from cache
            const filteredUsers = getFilteredUsers(searchTerm);
            renderFilteredUsersList(filteredUsers, searchTerm);
        }
    });
}

// Render filtered users list (for real-time search)
function renderFilteredUsersList(users, searchTerm) {
    const allUsersListElement = document.getElementById('allUsersList');
    const allUsersStatusElement = document.getElementById('allUsersStatus');
    
    if (!allUsersListElement) return;
    
    if (allUsersStatusElement) {
        if (searchTerm) {
            allUsersStatusElement.textContent = `${users.length} user${users.length !== 1 ? 's' : ''} found for "${escapeHtml(searchTerm)}"`;
        } else {
            allUsersStatusElement.textContent = `${users.length} user${users.length !== 1 ? 's' : ''} available`;
        }
    }
    
    allUsersListElement.innerHTML = '';
    
    if (users.length === 0) {
        if (searchTerm) {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No users found for "${escapeHtml(searchTerm)}"</p>
                    <p class="subtext">Try a different search term</p>
                </div>
            `;
        } else {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No users found</p>
                </div>
            `;
        }
        return;
    }
    
    const fragment = document.createDocumentFragment();
    users.forEach(user => {
        const userItem = createUserSearchItemElement(user);
        if (userItem && userItem.nodeType === Node.ELEMENT_NODE) {
            fragment.appendChild(userItem);
        }
    });
    allUsersListElement.appendChild(fragment);
}
// [9] UI ELEMENT CREATORS - STRICT LIFECYCLE COMPLIANCE
// =============================================

function createFriendItemElement(friendData, type, instantMode = false) {
    // Enhanced validation with multiple fallback checks
    if (!friendData) {
        console.warn('[createFriendItemElement] No friendData provided');
        return null;
    }
    
    const friendId = friendData.id || friendData.friendId || friendData.userId;
    if (!friendId) {
        console.warn('[createFriendItemElement] No valid ID found in friendData:', friendData);
        return null;
    }

    return ErrorHandler.createBoundary(`createFriendItem:${friendId}`, () => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.userId = friendId;
        friendItem.dataset.type = type || 'friend';

        // Enhanced display name fallbacks with multiple sources
        const displayName = escapeHtml(
            friendData.displayName || 
            friendData.name || 
            friendData.username || 
            friendData.friendName || 
            `User ${friendId}`.substring(0, 20)
        );
        
        // Enhanced username fallbacks
        const username = friendData.username || friendData.handle || friendData.screenName;
        const escapedUsername = username ? escapeHtml(username) : null;
        
        // Enhanced avatar URL fallbacks
        const photoURL = friendData.photoURL || friendData.avatar || friendData.profileImage || friendData.image;
        const avatarUrl = photoURL ? escapeHtml(photoURL) : null;

        // Enhanced initials generation with better fallbacks
        const initials = displayName
            .split(' ')
            .filter(word => word && word.length > 0)
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U')
            .padEnd(2, 'U'); // Ensure always 2 characters

        // Enhanced online status detection with safe fallbacks
        const statusClass = typeof getUserOnlineStatusClass === 'function' 
            ? getUserOnlineStatusClass(friendData) 
            : 'offline';
        const statusText = typeof getUserOnlineStatusText === 'function' 
            ? getUserOnlineStatusText(friendData) 
            : 'Offline';

        // Safe last interaction fallback
        const lastInteraction = typeof getLastInteraction === 'function' 
            ? getLastInteraction(friendId) 
            : null;
        const displayStatusText = lastInteraction || statusText || 'Unknown status';

        // Safe mutual friends count fallback
        const mutualCount = (mutualFriendsCache && mutualFriendsCache[friendId]) 
            ? mutualFriendsCache[friendId] 
            : 0;
        
        // Safe category fallbacks
        const category = friendData.category || 'friend';
        const categoryInfo = (friendCategories && friendCategories[category]) 
            ? friendCategories[category] 
            : friendCategories.friend || { name: 'Friend', icon: 'fas fa-user' };

        // Safe pinned/muted checks with array validation
        const isPinned = Array.isArray(pinnedFriends) && pinnedFriends.some(f => f && f.id === friendId);
        const isMuted = Array.isArray(mutedFriends) && mutedFriends.some(f => f && f.id === friendId);
        const isTemporary = friendData.isTemporary === true;
        const isBusiness = friendData.isBusiness === true;

        const isDemo = friendData.isDemo === true;

        // Avatar HTML generation
        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<div class="friend-avatar" style="background-image: url('${avatarUrl}');"></div>`;
        } else {
            avatarHtml = `<div class="friend-avatar"><span>${initials}</span></div>`;
        }

        let badgesHtml = '';
        if (isDemo) badgesHtml += '<span class="temp-friend-badge" style="background:rgba(108,99,255,.15);color:#6C63FF;border:1px solid rgba(108,99,255,.3)"><i class="fas fa-flask"></i> Demo</span>';
        if (isTemporary) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-clock"></i> Temp</span>';
        if (isBusiness) badgesHtml += '<span class="business-badge"><i class="fas fa-briefcase"></i> Business</span>';
        if (isPinned) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-thumbtack"></i> Pinned</span>';
        if (isMuted) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-volume-mute"></i> Muted</span>';
        // P3 FIX: Snoozed + Restricted badges
        const isSnoozed    = friendData?.snoozed || (friendData?.snoozedUntil && new Date(friendData.snoozedUntil) > new Date());
        const isRestricted = friendData?.isRestricted || false;
        if (isSnoozed)    badgesHtml += '<span class="temp-friend-badge" style="background:rgba(255,165,0,.1);color:#c07000;"><i class="fas fa-bell-slash"></i> Snoozed</span>';
        if (isRestricted) badgesHtml += '<span class="temp-friend-badge" style="background:rgba(229,62,62,.1);color:#c53030;"><i class="fas fa-user-lock"></i> Restricted</span>';
        // P2 FIX: Best Friends badge based on closenessLevel from server
        const closeness = friendData?.closenessLevel || 0;
        if (closeness >= 7) badgesHtml += '<span class="temp-friend-badge" style="background:rgba(255,193,7,.15);color:#b8860b;"><i class="fas fa-star"></i> Best Friend</span>';
        // P2 FIX: Shared groups count badge (data comes from suggestions API)
        if (friendData?.sharedGroupCount > 0) badgesHtml += `<span class="temp-friend-badge" style="background:rgba(72,187,120,.1);color:#276749;"><i class="fas fa-users"></i> ${friendData.sharedGroupCount} common group${friendData.sharedGroupCount > 1 ? 's' : ''}</span>`;

        let categoryBadgeHtml = '';
        if (isPinned) {
            categoryBadgeHtml = '<div class="friend-category-badge pinned" title="Pinned Friend"><i class="fas fa-thumbtack"></i></div>';
        } else if (isMuted) {
            categoryBadgeHtml = '<div class="friend-category-badge muted" title="Muted Friend"><i class="fas fa-volume-mute"></i></div>';
        } else if (categoryInfo) {
            categoryBadgeHtml = `<div class="friend-category-badge ${category}" title="${escapeHtml(categoryInfo.name)}"><i class="${categoryInfo.icon}"></i></div>`;
        }

        let mutualFriendsHtml = '';
        if (mutualCount > 0 && featureFlags.mutualFriends) {
            mutualFriendsHtml = `<span class="mutual-friends" data-user-id="${friendId}" data-user-name="${displayName}"><i class="fas fa-users"></i> ${mutualCount} mutual</span>`;
        }

        let trustScoreHtml = '';
        if (friendData.trustScore && !instantMode) {
            const trustClass = getTrustScoreClass(friendData.trustScore);
            trustScoreHtml = `<span class="trust-score ${trustClass}"><i class="fas fa-shield-alt"></i> ${friendData.trustScore}/10</span>`;
        }

        let actionsHtml = '';
        if (type === 'contact') {
            actionsHtml = `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-action-btn success" data-action="add" title="Add as Friend">
                    <i class="fas fa-user-plus"></i>
                </button>
            `;
        } else if (type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary') {
            // P2/P3 FIX: Add snooze, restrict, report to the more-options dropdown
            const isSnoozed    = friendData?.snoozed    || (friendData?.snoozedUntil && new Date(friendData.snoozedUntil) > new Date());
            const isRestricted = friendData?.isRestricted || false;
            actionsHtml = `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <div class="friend-more-menu-wrapper" style="position:relative;">
                    <button class="friend-action-btn" data-action="more" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="friend-more-dropdown" style="display:none;position:absolute;right:0;top:100%;background:var(--surface-elevated,#fff);border:1px solid var(--border-color,#e0e0e0);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:100;min-width:160px;padding:4px 0;">
                        <button class="friend-dropdown-item" data-action="snooze" data-friend-id="${friendId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:14px;text-align:left;">
                            <i class="fas fa-bell-slash" style="width:16px;opacity:.7;"></i>
                            ${isSnoozed ? 'Unsnooze' : 'Snooze (7 days)'}
                        </button>
                        <button class="friend-dropdown-item" data-action="restrict" data-friend-id="${friendId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:14px;text-align:left;">
                            <i class="fas fa-user-lock" style="width:16px;opacity:.7;"></i>
                            ${isRestricted ? 'Unrestrict' : 'Restrict'}
                        </button>
                        <button class="friend-dropdown-item" data-action="report" data-friend-id="${friendId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;border:none;background:none;cursor:pointer;font-size:14px;color:#e53e3e;text-align:left;">
                            <i class="fas fa-flag" style="width:16px;opacity:.7;"></i>
                            Report
                        </button>
                    </div>
                </div>
            `;
        }

        friendItem.innerHTML = `
            <div class="friend-avatar-wrapper">
                ${avatarHtml}
                <div class="friend-status ${statusClass}"></div>
                ${categoryBadgeHtml}
            </div>
            <div class="friend-info">
                <div class="friend-name">
                    <span class="friend-name-text">${displayName}</span>
                    <span class="friend-details-badges">${badgesHtml}</span>
                </div>
                <div class="friend-details">
                    ${username ? `<span class="friend-username">${username}</span>` : ''}
                    ${mutualFriendsHtml}
                    <span>${displayStatusText}</span>
                    ${trustScoreHtml}
                </div>
            </div>
            <div class="friend-actions">
                ${actionsHtml}
            </div>
        `;

        friendItem.addEventListener('click', (e) => {
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
                logUI(`Friend item clicked: ${friendId}`);
                if (isDemo) {
                    showNotification('This is a demo contact. Add real friends to start chatting!', 'info', 3000);
                    return;
                }
                showFriendDetails(friendData, type);
            }
        });

        const actionButtons = friendItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                if (isDemo) {
                    showNotification('Add real friends to use this feature!', 'info', 3000);
                    return;
                }
                const action = btn.dataset.action;
                const userId = btn.dataset.userId || friendData?.id;
                const userName = btn.dataset.userName || friendData?.displayName || 'User';
                
                console.log(`[FriendAction] ${action} for ${userId} (${userName})`);
                
                if (action === 'start-chat') {
                    navigateToChatWithUser(userId, userName);
                } else if (action === 'call') {
                    navigateToCallModule(userId, userName);
                } else if (action === 'add') {
                    sendFriendRequest(userId);
                } else if (action === 'more') {
                    // P2/P3 FIX: toggle dropdown instead of old modal
                    const wrapper = btn.closest('.friend-more-menu-wrapper');
                    const dropdown = wrapper?.querySelector('.friend-more-dropdown');
                    if (dropdown) {
                        const isOpen = dropdown.style.display !== 'none';
                        // Close all other dropdowns first
                        document.querySelectorAll('.friend-more-dropdown').forEach(d => d.style.display = 'none');
                        dropdown.style.display = isOpen ? 'none' : 'block';
                        if (!isOpen) {
                            const closeHandler = (ev) => {
                                if (!wrapper.contains(ev.target)) {
                                    dropdown.style.display = 'none';
                                    document.removeEventListener('click', closeHandler, true);
                                }
                            };
                            setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
                        }
                    } else {
                        showFriendOptions(friendData);
                    }
                } else if (action === 'snooze') {
                    // P3 FIX: snooze / unsnooze
                    const fid = btn.dataset.friendId;
                    const isSnoozed = friendData?.snoozed || (friendData?.snoozedUntil && new Date(friendData.snoozedUntil) > new Date());
                    btn.closest('.friend-more-dropdown').style.display = 'none';
                    if (isSnoozed) {
                        window.FriendCoreAPI?.unsnoozeFriend?.(fid);
                    } else {
                        window.FriendCoreAPI?.snoozeFriend?.(fid, 7);
                    }
                } else if (action === 'restrict') {
                    // P3 FIX: restrict / unrestrict
                    const fid = btn.dataset.friendId;
                    const isRestricted = friendData?.isRestricted || false;
                    btn.closest('.friend-more-dropdown').style.display = 'none';
                    if (isRestricted) {
                        window.FriendCoreAPI?.unrestrictFriend?.(fid);
                    } else {
                        window.FriendCoreAPI?.restrictFriend?.(fid);
                    }
                } else if (action === 'report') {
                    // P2 FIX: show report modal
                    const fid = btn.dataset.friendId;
                    btn.closest('.friend-more-dropdown').style.display = 'none';
                    showReportModal(fid, friendData?.displayName || friendData?.username || '');
                } else {
                    logUI(`Unknown action: ${action}`);
                }
            });
        });

        const mutualFriendsElement = friendItem.querySelector('.mutual-friends');
        if (mutualFriendsElement) {
            mutualFriendsElement.addEventListener('click', (e) => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                const userId = mutualFriendsElement.dataset.userId;
                const userName = mutualFriendsElement.dataset.userName;
                logUI(`Mutual friends clicked: ${userId}`);
                showMutualFriends(userId, userName);
            });
        }

        return friendItem;

    }, null);
}

function createFriendRequestItemElement(requestData, type) {
    if (!requestData || !requestData.id) return null;

    return ErrorHandler.createBoundary(`createRequestItem:${requestData.id}`, () => {
        const requestItem = document.createElement('div');
        requestItem.className = 'friend-item';
        requestItem.dataset.requestId = requestData.id;
        requestItem.dataset.type = type + '_request';

        const userData = requestData.user || requestData.sender || requestData.receiver || requestData;
        const userId = userData.id || 'unknown';

        const displayName = escapeHtml(userData.displayName || 'Unknown User');
        const username = userData.username ? escapeHtml(userData.username) : null;
        const photoURL = userData.photoURL || userData.avatar;
        const avatarUrl = photoURL ? escapeHtml(photoURL) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const mutualCount = mutualFriendsCache && mutualFriendsCache[userId] ? mutualFriendsCache[userId] : 0;

        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<div class="friend-avatar" style="background-image: url('${avatarUrl}');"></div>`;
        } else {
            avatarHtml = `<div class="friend-avatar"><span>${initials}</span></div>`;
        }

        const createdAt = requestData.createdAt || requestData.timestamp || Date.now();
        const timeAgo = formatTimeAgo(new Date(createdAt));

        const note = requestData.note ? escapeHtml(requestData.note) : null;

        let actionsHtml = '';
        if (type === 'incoming') {
    actionsHtml = `
        <button class="friend-action-btn success accept-request-btn" data-action="accept" data-request-id="${requestData.id}" data-friend-id="${userId}" title="Accept">
            <i class="fas fa-check"></i>
        </button>
        <button class="friend-action-btn danger decline-request-btn" data-action="decline" data-request-id="${requestData.id}" title="Decline">
            <i class="fas fa-times"></i>
        </button>
        <button class="friend-action-btn" data-action="view-profile" title="View Profile">
            <i class="fas fa-eye"></i>
        </button>
    `;
        } else {
            actionsHtml = `
                <button class="friend-action-btn danger" data-action="cancel" title="Cancel Request">
                    <i class="fas fa-times"></i>
                </button>
                <button class="friend-action-btn" data-action="view-profile" title="View Profile">
                    <i class="fas fa-eye"></i>
                </button>
            `;
        }

        requestItem.innerHTML = `
            <div class="friend-avatar-wrapper">
                ${avatarHtml}
            </div>
            <div class="friend-info">
                <div class="friend-name">
                    <span class="friend-name-text">${displayName}</span>
                    <div style="font-size: 12px; color: ${type === 'incoming' ? 'var(--success-color)' : 'var(--primary-color)'}; margin-top: 3px;">
                        ${type === 'incoming' ? 'Incoming Request' : 'Sent Request'}
                    </div>
                </div>
                <div class="friend-details">
                    ${username ? `<span class="friend-username">${username}</span>` : ''}
                    ${mutualCount > 0 ? `<span class="mutual-friends" data-user-id="${userId}" data-user-name="${displayName}"><i class="fas fa-users"></i> ${mutualCount} mutual</span>` : ''}
                    <span>${type === 'incoming' ? 'Received ' : 'Sent '}${timeAgo}</span>
                </div>
                ${note ? `<div class="request-note">"${note}"</div>` : ''}
            </div>
            <div class="friend-actions">
                ${actionsHtml}
            </div>
        `;

        requestItem.addEventListener('click', (e) => {
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
                logUI(`Request item clicked: ${requestData.id}`);
                showFriendRequestProfile(requestData);
            }
        });

        const actionButtons = requestItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                const action = btn.dataset.action;
                const requestId = btn.dataset.requestId || requestData.id;
                const friendId = btn.dataset.friendId;
                
                logUI(`Request action: ${action} for ${requestId}`);
                
                if (action === 'accept') {
                    // Use optimistic UI for accept
                    optimisticAcceptRequest(requestData, btn);
                } else if (action === 'decline') {
                    // Use optimistic UI for decline
                    optimisticDeclineRequest(requestData, btn);
                } else if (action === 'cancel') {
                    handleRequestAction(action, requestData, btn);
                } else if (action === 'view-profile') {
                    showFriendRequestProfile(requestData);
                } else {
                    handleRequestAction(action, requestData, btn);
                }
            });
        });

        const mutualFriendsElement = requestItem.querySelector('.mutual-friends');
        if (mutualFriendsElement) {
            mutualFriendsElement.addEventListener('click', (e) => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                const userId = mutualFriendsElement.dataset.userId;
                const userName = mutualFriendsElement.dataset.userName;
                logUI(`Mutual friends clicked from request: ${userId}`);
                showMutualFriends(userId, userName);
            });
        }

        return requestItem;

    }, null);
}

// FIXED: createUserSearchItemElement - use live window globals and add call button for non-friends
function createUserSearchItemElement(user) {
    if (!user || !user.id) {
        console.warn('[createUserSearchItemElement] Invalid user (missing id)', user);
        return null;
    }

    // FIXED: Use window globals to get live data (syncToGlobals keeps these fresh)
    const safeFriends = (window.friends && Array.isArray(window.friends)) ? window.friends : (Array.isArray(friends) ? friends : []);
    const safeSentRequests = (window.sentRequests && Array.isArray(window.sentRequests)) ? window.sentRequests : (Array.isArray(sentRequests) ? sentRequests : []);
    const safeFriendRequests = (window.friendRequests && Array.isArray(window.friendRequests)) ? window.friendRequests : (Array.isArray(friendRequests) ? friendRequests : []);

    try {
        const userId = user.id;
        const displayName = (user.displayName || user.username || 'Unknown User').toString();
        const escapedDisplayName = escapeHtml(displayName);
        const username = user.username ? escapeHtml(user.username.toString()) : null;
        
        const avatarUrl = user.photoURL || user.avatar;
        const avatarSrc = avatarUrl ? escapeHtml(avatarUrl) : null;
        
        const bioRaw = user.bio || '';
        const bio = bioRaw ? escapeHtml(bioRaw.substring(0, 30) + (bioRaw.length > 30 ? '...' : '')) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const isAlreadyFriend = safeFriends.some(f => f && f.id === userId);
        const hasPendingRequest = safeSentRequests.some(r => r && r.receiverId === userId);
        const hasIncomingRequest = safeFriendRequests.some(r => r && r.senderId === userId);

        let avatarHtml = '';
        if (avatarSrc) {
            avatarHtml = `<div class="user-search-avatar" style="background-image: url('${avatarSrc}');"></div>`;
        } else {
            avatarHtml = `<div class="user-search-avatar"><span>${escapeHtml(initials)}</span></div>`;
        }

        let actionsHtml = '';

        if (isAlreadyFriend) {
            actionsHtml = `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${escapedDisplayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${userId}" data-user-name="${escapedDisplayName}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-action-btn" data-action="more" title="More options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            `;
        } else if (hasPendingRequest) {
            actionsHtml = `
                <button class="friend-action-btn danger" data-action="cancel-request" title="Cancel Request">
                    <i class="fas fa-clock"></i>
                </button>
            `;
        } else if (hasIncomingRequest) {
            actionsHtml = `
                <button class="friend-action-btn success" data-action="accept" title="Accept Request">
                    <i class="fas fa-check"></i>
                </button>
                <button class="friend-action-btn danger" data-action="decline" title="Decline Request">
                    <i class="fas fa-times"></i>
                </button>
            `;
        } else {
            // FIXED: Add call button for non-friend users (strangers) in discover section
            actionsHtml = `
                <button class="friend-action-btn success" data-action="add" title="Add Friend">
                    <i class="fas fa-user-plus"></i>
                </button>
                <button class="friend-action-btn chat" data-action="start-chat" 
                    data-user-id="${userId}" 
                    data-user-name="${escapedDisplayName}"
                    title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" 
                    data-user-id="${userId}" 
                    data-user-name="${escapedDisplayName}"
                    title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
            `;
        }

        const userItem = document.createElement('div');
        userItem.className = 'user-search-item';
        userItem.dataset.userId = userId;

        const onlineStatus = user.online === true || user.status === 'online';
        const statusClass = getUserOnlineStatusClass(user);
        const statusHtml = `<span class="user-search-status ${statusClass}"></span>`;

        userItem.innerHTML = `
            ${avatarHtml}
            <div class="user-search-info">
                <div class="user-search-name">
                    ${escapedDisplayName}
                    ${statusHtml}
                </div>
                <div class="user-search-username">
                    ${username || 'No username'}
                    ${bio ? ` • ${bio}` : ''}
                </div>
            </div>
            <div class="user-search-actions">
                ${actionsHtml}
            </div>
        `;

        userItem.addEventListener('click', (e) => {
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            if (!e.target.closest('.user-search-actions')) {
                logUI(`User search item clicked: ${userId}`);
                showFriendDetails(user, 'user');
            }
        });

        const actionButtons = userItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                const action = btn.dataset.action;
                logUI(`User search action: ${action} for ${userId}`);

                switch(action) {
                    case 'start-chat':
                        const chatUserId = btn.dataset.userId;
                        const chatUserName = btn.dataset.userName;
                        console.log('[UserSearch] Start chat with:', { chatUserId, chatUserName });
                        navigateToChatWithUser(chatUserId, chatUserName);
                        break;
                    case 'call':
                        const callUserId = btn.dataset.userId;
                        const callUserName = btn.dataset.userName;
                        console.log('[UserSearch] Start call with:', { callUserId, callUserName });
                        navigateToCallModule(callUserId, callUserName);
                        break;
                    case 'add':
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        sendFriendRequest(userId, 'friend', 'Added via All Users').then(result => {
                            if (result && result.success) {
                                // Show pending clock — request is sent but NOT yet accepted
                                btn.innerHTML = '<i class="fas fa-clock"></i>';
                                btn.className = 'friend-action-btn danger';
                                btn.title = 'Request pending';
                                btn.dataset.action = 'cancel-request';
                                showNotification(`Friend request sent to ${displayName}`, 'success');
                            } else {
                                btn.disabled = false;
                                btn.innerHTML = '<i class="fas fa-user-plus"></i>';
                                showNotification((result && result.error) || 'Failed to send friend request', 'error');
                            }
                        }).catch(err => {
                            console.error('Send friend request error:', err);
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fas fa-user-plus"></i>';
                            showNotification('Failed to send friend request', 'error');
                        });
                        break;
                    case 'more':
                        showFriendOptions(user);
                        break;
                    case 'cancel-request':
                        const sentRequest = safeSentRequests.find(r => r && r.receiverId === userId);
                        if (sentRequest) cancelFriendRequest(sentRequest);
                        break;
     
                    case 'accept': {
                        const incomingRequest = safeFriendRequests.find(r => r && r.senderId === userId);
                        if (incomingRequest) {
                            // Use optimistic UI for accept
                            optimisticAcceptRequest(incomingRequest, btn);
                        }
                        break;
                    }

                    case 'decline': {
                        const declineRequest = safeFriendRequests.find(r => r && r.senderId === userId);
                        if (declineRequest) {
                            optimisticDeclineRequest(declineRequest, btn);
                        }
                        break;
                    }
                }
            });
        });

        return userItem;

    } catch (error) {
        console.error('[createUserSearchItemElement] Error creating user item:', error, user);
        return null;
    }
}

// =============================================
// [10] FRIEND DETAILS AND PROFILE FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const showFriendDetails = function(friendData, type) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showFriendDetails', () => {
        if (!friendData || !friendData.id) return;

        UIState.selectedFriendId = friendData.id;

        const titleElement = document.querySelector('.friend-details-title');
        if (titleElement) {
            titleElement.textContent = type === 'user' ? 'User Profile' : 'Friend Details';
        }

        if (domElements.friendDetailsPanel) {
            domElements.friendDetailsPanel.classList.add('active');
            UIState.pushView(UIState.activeSection, { friendId: friendData.id });

            if (isMobile) {
                window.scrollTo(0, 0);
                document.body.classList.add('mobile-details-open');
            }
        }

        loadFriendDetails(friendData, type);

    }, null);
};

export const loadFriendDetails = async function(friendData, type) {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('loadFriendDetails', async () => {
        const detailsContent = document.getElementById('friendDetailsContent');
        if (!detailsContent) return;

        detailsContent.innerHTML = `
            <div class="loading-container">
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <p>Loading friend details...</p>
            </div>
        `;

        try {
            let detailedData = { ...friendData };
            let friendshipData = null;

            if (type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary') {
                const friend = friends.find(f => f && f.id === friendData.id);
                if (friend) {
                    friendshipData = {
                        category: friend.category || 'friend',
                        notes: friend.notes || '',
                        isTemporary: friend.isTemporary || false,
                        expiresAt: friend.expiresAt || null,
                        isBusiness: friend.isBusiness || false,
                        trustScore: friend.trustScore || 5,
                        addedAt: friend.addedAt || friend.createdAt || new Date().toISOString()
                    };
                }
            }

            const friendId = detailedData.id;
            const mutualCount = mutualFriendsCache && mutualFriendsCache[friendId] ? mutualFriendsCache[friendId] : 0;

            const statusClass = getUserOnlineStatusClass(detailedData);
            const statusText = getUserOnlineStatusText(detailedData);

            const lastInteraction = getLastInteraction(friendId);
            const displayStatusText = lastInteraction || statusText;

            const category = friendshipData?.category || 'friend';
            const categoryInfo = friendCategories[category] || friendCategories.friend;

            const displayName = escapeHtml(detailedData.displayName || 'Unknown User');
            const username = detailedData.username ? escapeHtml(detailedData.username) : 'No username';
            const photoURL = detailedData.photoURL || detailedData.avatar;
            const avatarUrl = photoURL ? escapeHtml(photoURL) : null;
            const email = detailedData.email ? escapeHtml(detailedData.email) : null;
            const phoneNumber = detailedData.phoneNumber ? escapeHtml(detailedData.phoneNumber) : null;
            const bio = detailedData.bio ? escapeHtml(detailedData.bio) : null;
            const interests = detailedData.interests ? detailedData.interests.map(i => escapeHtml(i)).join(', ') : null;

            const initials = displayName
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2)
                .replace(/[^A-Z0-9]/g, 'U');

            let notes = '';
            if (window.privateNotes && window.privateNotes[friendId]) {
                notes = escapeHtml(window.privateNotes[friendId]);
            } else if (friendshipData?.notes) {
                notes = escapeHtml(friendshipData.notes);
            }

            const isPinned = pinnedFriends && pinnedFriends.some(f => f && f.id === friendId);
            const isMuted = mutedFriends && mutedFriends.some(f => f && f.id === friendId);
            const isAlreadyFriend = friends && friends.some(f => f && f.id === friendId);
            const hasPendingRequest = sentRequests && sentRequests.some(r => r && r.receiverId === friendId);
            const hasIncomingRequest = friendRequests && friendRequests.some(r => r && r.senderId === friendId);

            let avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${avatarUrl}');"></div>`;
            } else {
                avatarHtml = `<div class="friend-profile-avatar"><span style="color: white; font-size: 36px;">${initials}</span></div>`;
            }

            let categoryBadgeHtml = '';
            if (isPinned) {
                categoryBadgeHtml = '<div class="friend-category-badge pinned" style="width: 30px; height: 30px; font-size: 12px;"><i class="fas fa-thumbtack"></i></div>';
            } else if (isMuted) {
                categoryBadgeHtml = '<div class="friend-category-badge muted" style="width: 30px; height: 30px; font-size: 12px;"><i class="fas fa-volume-mute"></i></div>';
            }

            detailsContent.innerHTML = `
                <div class="friend-profile-header">
                    <div class="friend-profile-avatar-wrapper">
                        ${avatarHtml}
                        ${categoryBadgeHtml}
                    </div>
                    <div class="friend-profile-name">${displayName}</div>
                    <div class="friend-profile-username">${username}</div>
                    <div class="friend-profile-status ${statusClass}">${displayStatusText}</div>
                </div>
                
                <div class="friend-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-info-circle"></i>
                        <span>Basic Information</span>
                    </div>
                    
                    ${friendshipData ? `
                    <div class="info-item">
                        <span class="info-label">Friendship Category:</span>
                        <span class="info-value">
                            <div class="category-display ${category}">
                                <i class="${categoryInfo.icon}"></i>
                                ${escapeHtml(categoryInfo.name)}
                            </div>
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Friends Since:</span>
                        <span class="info-value">${formatDate(new Date(friendshipData.addedAt))}</span>
                    </div>
                    
                    ${friendshipData.isTemporary && friendshipData.expiresAt ? `
                    <div class="info-item">
                        <span class="info-label">Expires:</span>
                        <span class="info-value">${formatDate(new Date(friendshipData.expiresAt))}</span>
                    </div>
                    ` : ''}
                    
                    ${friendshipData.isBusiness ? `
                    <div class="info-item">
                        <span class="info-label">Business Contact:</span>
                        <span class="info-value">Yes</span>
                    </div>
                    ` : ''}
                    
                    ` : ''}
                    
                    <div class="info-item">
                        <span class="info-label">Mutual Friends:</span>
                        <span class="info-value">
                            <span class="mutual-friends-link" data-user-id="${friendId}" data-user-name="${displayName}">
                                <i class="fas fa-users"></i> ${mutualCount} mutual
                            </span>
                        </span>
                    </div>
                    
                    ${detailedData.trustScore ? `
                    <div class="info-item">
                        <span class="info-label">Trust Score:</span>
                        <span class="info-value">
                            <div class="trust-score ${getTrustScoreClass(detailedData.trustScore)}">
                                <i class="fas fa-shield-alt"></i>
                                ${detailedData.trustScore}/10
                            </div>
                        </span>
                    </div>
                    ` : ''}
                    
                    ${email ? `
                    <div class="info-item">
                        <span class="info-label">Email:</span>
                        <span class="info-value">${email}</span>
                    </div>
                    ` : ''}
                    
                    ${phoneNumber ? `
                    <div class="info-item">
                        <span class="info-label">Phone:</span>
                        <span class="info-value">${phoneNumber}</span>
                    </div>
                    ` : ''}
                    
                    ${bio ? `
                    <div class="info-item">
                        <span class="info-label">Bio:</span>
                        <span class="info-value">${bio}</span>
                    </div>
                    ` : ''}
                    
                    ${interests ? `
                    <div class="info-item">
                        <span class="info-label">Interests:</span>
                        <span class="info-value">${interests}</span>
                    </div>
                    ` : ''}
                </div>
                
                ${!isAlreadyFriend && !hasPendingRequest && !hasIncomingRequest && type !== 'contact' ? `
                <div class="friend-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-user-plus"></i>
                        <span>Add as Friend</span>
                    </div>
                    <p style="margin-bottom: 15px; color: var(--text-secondary);">You can add this user as a friend to start chatting and sharing.</p>
                    <div class="action-buttons">
                        <button class="action-btn success" id="addUserAsFriendBtn">
                            <i class="fas fa-user-plus"></i> Send Friend Request
                        </button>
                    </div>
                </div>
                ` : ''}
                
                ${isAlreadyFriend ? `
                <div class="friend-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-sticky-note"></i>
                        <span>Private Notes</span>
                    </div>
                    <textarea class="notes-textarea" id="friendNotesTextarea" placeholder="Add private notes about this friend...">${notes}</textarea>
                    <button class="action-btn secondary" id="saveNotesBtn" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Save Notes
                    </button>
                </div>
                ` : ''}
                
                <div class="action-buttons">
                    ${type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary' ? `
                    <button class="action-btn success" id="startChatDetailsBtn" data-user-id="${friendId}" data-user-name="${displayName}">
                        <i class="fas fa-comments"></i> Start Chat
                    </button>
                    <button class="action-btn primary" id="callFriendBtn" data-user-id="${friendId}" data-user-name="${displayName}">
                        <i class="fas fa-phone"></i> Start Call
                    </button>
                    <button class="action-btn secondary" id="friendOptionsBtn">
                        <i class="fas fa-cog"></i> Options
                    </button>
                    ` : ''}
                    
                    ${type === 'contact' ? `
                    <button class="action-btn success" id="startChatWithContactBtn" data-user-id="${friendId}" data-user-name="${displayName}">
                        <i class="fas fa-comments"></i> Start Chat
                    </button>
                    <button class="action-btn primary" id="addContactBtn">
                        <i class="fas fa-user-plus"></i> Add as Friend
                    </button>
                    ` : ''}
                    
                    ${type === 'user' && !isAlreadyFriend && !hasPendingRequest ? `
                    <button class="action-btn success" id="startChatWithUserBtn" data-user-id="${friendId}" data-user-name="${displayName}">
                        <i class="fas fa-comments"></i> Start Chat
                    </button>
                    <button class="action-btn primary" id="addUserBtn">
                        <i class="fas fa-user-plus"></i> Add as Friend
                    </button>
                    ` : ''}
                </div>
            `;

            const mutualFriendsLink = detailsContent.querySelector('.mutual-friends-link');
            if (mutualFriendsLink) {
                mutualFriendsLink.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    logUI(`Mutual friends link clicked: ${friendId}`);
                    showMutualFriends(friendId, displayName);
                });
            }

            if (type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary') {
                const startChatBtn = document.getElementById('startChatDetailsBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Start chat from details: ${this.dataset.userId}`);
                        navigateToChatWithUser(this.dataset.userId, this.dataset.userName);
                    });
                }

                const callBtn = document.getElementById('callFriendBtn');
                if (callBtn) {
                    callBtn.addEventListener('click', function() {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Start call from details: ${this.dataset.userId}`);
                        navigateToCallModule(this.dataset.userId, this.dataset.userName);
                    });
                }

                const optionsBtn = document.getElementById('friendOptionsBtn');
                if (optionsBtn) {
                    optionsBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Show options from details: ${friendId}`);
                        showFriendOptions(friendData);
                    });
                }

                const saveNotesBtn = document.getElementById('saveNotesBtn');
                if (saveNotesBtn) {
                    saveNotesBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        const notesTextarea = document.getElementById('friendNotesTextarea');
                        if (notesTextarea) {
                            logUI(`Saving notes for: ${friendId}`);
                            savePrivateNote(friendId, notesTextarea.value);
                        }
                    });
                }
            }

            if (type === 'contact') {
                const startChatBtn = document.getElementById('startChatWithContactBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Start chat with contact: ${this.dataset.userId}`);
                        navigateToChatWithUser(this.dataset.userId, this.dataset.userName);
                    });
                }

                const addContactBtn = document.getElementById('addContactBtn');
                if (addContactBtn) {
                    addContactBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Add contact as friend: ${friendId}`);
                        sendFriendRequest(friendId);
                    });
                }
            }

            if (type === 'user') {
                const startChatBtn = document.getElementById('startChatWithUserBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Start chat with user: ${this.dataset.userId}`);
                        navigateToChatWithUser(this.dataset.userId, this.dataset.userName);
                    });
                }

                const addUserBtn = document.getElementById('addUserBtn');
                if (addUserBtn) {
                    addUserBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Add user as friend: ${friendId}`);
                        sendFriendRequest(friendId);
                    });
                }

                const addUserAsFriendBtn = document.getElementById('addUserAsFriendBtn');
                if (addUserAsFriendBtn) {
                    addUserAsFriendBtn.addEventListener('click', () => {
                        if (!isUIActive()) {
                            showNotification('Please wait while module initializes...', 'info');
                            return;
                        }
                        logUI(`Add user as friend (alt): ${friendId}`);
                        sendFriendRequest(friendId);
                    });
                }
            }

        } catch (error) {
            console.warn('Error loading friend details:', error);

            detailsContent.innerHTML = `
                <div class="empty-state error-boundary">
                    <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
                    <p>Error loading friend details</p>
                    <p class="subtext">${escapeHtml(error.message || 'Please try again later')}</p>
                    <button class="action-btn secondary retry-details-btn" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;

            const retryBtn = detailsContent.querySelector('.retry-details-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    loadFriendDetails(friendData, type);
                });
            }
        }

    }, null);
};

export const showFriendRequestProfile = function(requestData) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showFriendRequestProfile', () => {
        if (!requestData) return;

        const userData = requestData.user || requestData.sender || requestData.receiver || requestData;
        const userId = userData.id || 'unknown';
        const displayName = escapeHtml(userData.displayName || 'Unknown User');
        const username = userData.username ? escapeHtml(userData.username) : 'No username';
        const photoURL = userData.photoURL || userData.avatar;
        const avatarUrl = photoURL ? escapeHtml(photoURL) : null;
        const bio = userData.bio ? escapeHtml(userData.bio) : null;
        const email = userData.email ? escapeHtml(userData.email) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const mutualCount = mutualFriendsCache && mutualFriendsCache[userId] ? mutualFriendsCache[userId] : 0;
        const createdAt = requestData.createdAt || requestData.timestamp || Date.now();
        const requestDate = formatDate(new Date(createdAt));
        const note = requestData.note ? escapeHtml(requestData.note) : null;
        const category = requestData.category || null;
        const categoryInfo = category ? friendCategories[category] : null;

        // FIX: requestData.type is the server status ('pending'), NOT 'incoming_request'.
        // The only reliable way to tell if this is incoming is to check whether the
        // requester (senderId/requesterId) is someone OTHER than the current user.
        // dataset.type on the card element is set to 'incoming_request' or 'sent_request'
        // but we don't have the element here — use senderId instead.
        const _reqSenderId = requestData.senderId || requestData.requesterId || requestData.user?.id || requestData.sender?.id;
        const _myId = (currentUser && (currentUser.id || currentUser.userId)) ||
                      (window.__session && window.__session.userId) ||
                      (window.currentUser && (window.currentUser.id || window.currentUser.userId));
        const isIncoming = _reqSenderId && _myId
            ? String(_reqSenderId) !== String(_myId)
            : (requestData.type === 'incoming_request' || requestData.status === 'pending');

        const profileModal = document.createElement('div');
        profileModal.className = 'add-friend-modal active';
        profileModal.id = `requestProfileModal_${Date.now()}`;

        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${avatarUrl}'); width: 100px; height: 100px;"></div>`;
        } else {
            avatarHtml = `<div class="friend-profile-avatar" style="width: 100px; height: 100px;"><span style="color: white; font-size: 36px;">${initials}</span></div>`;
        }

        profileModal.innerHTML = `
            <div class="add-friend-container friend-request-profile">
                <div class="add-friend-header">
                    <h3>${isIncoming ? 'Friend Request' : 'Sent Request'}</h3>
                    <button class="add-friend-btn close-profile-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding: 25px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div class="friend-profile-avatar-wrapper" style="justify-content: center;">
                            ${avatarHtml}
                        </div>
                        <div class="friend-profile-name" style="font-size: 20px; margin-top: 15px;">${displayName}</div>
                        <div class="friend-profile-username">${username}</div>
                        <div style="margin-top: 10px; padding: 6px 12px; background-color: ${isIncoming ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0, 132, 255, 0.1)'}; color: ${isIncoming ? 'var(--success-color)' : 'var(--primary-color)'}; border-radius: 20px; font-size: 14px; display: inline-block;">
                            ${isIncoming ? 'Incoming Friend Request' : 'Sent Friend Request'}
                        </div>
                        ${bio ? `<div style="margin-top: 15px; color: var(--text-secondary); font-size: 14px; max-width: 300px; margin-left: auto; margin-right: auto;">${bio}</div>` : ''}
                    </div>
                    
                    <div class="friend-info-section">
                        <div class="info-section-title">
                            <i class="fas fa-info-circle"></i>
                            <span>Request Information</span>
                        </div>
                        
                        ${email ? `
                        <div class="info-item">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${email}</span>
                        </div>
                        ` : ''}
                        
                        <div class="info-item">
                            <span class="info-label">Request Date:</span>
                            <span class="info-value">${requestDate}</span>
                        </div>
                        
                        <div class="info-item">
                            <span class="info-label">Mutual Friends:</span>
                            <span class="info-value">
                                <span class="mutual-friends-link" data-user-id="${userId}" data-user-name="${displayName}">
                                    <i class="fas fa-users"></i> ${mutualCount} mutual
                                </span>
                            </span>
                        </div>
                        
                        ${note ? `
                        <div class="info-item">
                            <span class="info-label">Request Note:</span>
                            <span class="info-value" style="font-style: italic;">"${note}"</span>
                        </div>
                        ` : ''}
                        
                        ${categoryInfo ? `
                        <div class="info-item">
                            <span class="info-label">Category:</span>
                            <span class="info-value">
                                <div class="category-display ${category}">
                                    <i class="${categoryInfo.icon}"></i>
                                    ${escapeHtml(categoryInfo.name)}
                                </div>
                            </span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="request-actions" style="display: flex; gap: 10px; margin-top: 25px;">
                        <button class="action-btn secondary close-profile-btn" style="flex: 1;">
                            <i class="fas fa-times"></i> Close
                        </button>
                        ${isIncoming ? `
                        <button class="action-btn danger decline-profile-btn" style="flex: 1;">
                            <i class="fas fa-times"></i> Decline
                        </button>
                        <button class="action-btn success accept-profile-btn" style="flex: 1;">
                            <i class="fas fa-check"></i> Accept
                        </button>
                        ` : `
                        <button class="action-btn danger cancel-profile-btn" style="flex: 1;">
                            <i class="fas fa-times"></i> Cancel Request
                        </button>
                        `}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(profileModal);

        const closeBtn = profileModal.querySelector('.close-profile-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(profileModal);
            });
        }

        const closeProfileBtn = profileModal.querySelector('.close-profile-btn');
        if (closeProfileBtn) {
            closeProfileBtn.addEventListener('click', () => {
                document.body.removeChild(profileModal);
            });
        }

        const mutualFriendsLink = profileModal.querySelector('.mutual-friends-link');
        if (mutualFriendsLink) {
            mutualFriendsLink.addEventListener('click', () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                logUI(`Mutual friends from request profile: ${userId}`);
                showMutualFriends(userId, displayName);
                document.body.removeChild(profileModal);
            });
        }

        if (isIncoming) {
            const declineBtn = profileModal.querySelector('.decline-profile-btn');
            if (declineBtn) {
                declineBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    logUI(`Decline request: ${requestData.id}`);
                    optimisticDeclineRequest(requestData, declineBtn);
                    document.body.removeChild(profileModal);
                });
            }

            const acceptBtn = profileModal.querySelector('.accept-profile-btn');
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    logUI(`Accept request: ${requestData.id}`);
                    optimisticAcceptRequest(requestData, acceptBtn);
                    document.body.removeChild(profileModal);
                });
            }
        } else {
            const cancelBtn = profileModal.querySelector('.cancel-profile-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    logUI(`Cancel request: ${requestData.id}`);
                    cancelFriendRequest(requestData);
                    document.body.removeChild(profileModal);
                });
            }
        }

    }, null);
};

// =============================================
// [11] FRIEND OPTIONS AND MANAGEMENT FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

// P2 FIX: Report modal — frontend showed "Report" but the function was missing.
export function showReportModal(friendId, displayName) {
    // Remove any existing report modal
    const existing = document.getElementById('friendReportModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'friendReportModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:16px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2);">
            <h3 style="margin:0 0 8px;font-size:17px;">Report ${escapeHtml(displayName || 'user')}</h3>
            <p style="margin:0 0 16px;font-size:13px;opacity:.7;">Select a reason. Your report is anonymous.</p>
            <div id="reportReasonGroup" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                ${['Spam or scam','Harassment or bullying','Fake account','Inappropriate content','Other'].map(r =>
                    `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;">
                        <input type="radio" name="reportReason" value="${r}" style="accent-color:var(--primary,#6c5ce7);">
                        ${escapeHtml(r)}
                    </label>`
                ).join('')}
            </div>
            <textarea id="reportDescription" placeholder="Additional details (optional)" maxlength="500"
                style="width:100%;border:1px solid var(--border-color,#e0e0e0);border-radius:8px;padding:10px;font-size:13px;resize:vertical;min-height:70px;box-sizing:border-box;margin-bottom:16px;"></textarea>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="cancelReportBtn" style="padding:10px 18px;border:1px solid var(--border-color,#e0e0e0);background:none;border-radius:8px;cursor:pointer;font-size:14px;">Cancel</button>
                <button id="submitReportBtn" style="padding:10px 18px;background:#e53e3e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Submit Report</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector('#cancelReportBtn').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.querySelector('#submitReportBtn').onclick = async () => {
        const reasonEl = modal.querySelector('input[name="reportReason"]:checked');
        if (!reasonEl) { showNotification('Please select a reason', 'warning'); return; }
        const reason      = reasonEl.value;
        const description = modal.querySelector('#reportDescription').value.trim();
        modal.querySelector('#submitReportBtn').textContent = 'Submitting…';
        modal.querySelector('#submitReportBtn').disabled = true;
        await window.FriendCoreAPI?.reportFriend?.(friendId, reason, description);
        modal.remove();
    };
}

export const showFriendOptions = function(friendData) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showFriendOptions', () => {
        if (!friendData || !friendData.id) return;

        const friendId = friendData.id;
        const displayName = escapeHtml(friendData.displayName || 'User');
        const photoURL = friendData.photoURL || friendData.avatar;
        const avatarUrl = photoURL ? escapeHtml(photoURL) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const isPinned = pinnedFriends && pinnedFriends.some(f => f && f.id === friendId);
        const isMuted = mutedFriends && mutedFriends.some(f => f && f.id === friendId);

        const optionsModal = document.createElement('div');
        optionsModal.className = 'add-friend-modal active';
        optionsModal.id = `optionsModal_${Date.now()}`;

        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${avatarUrl}'); width: 80px; height: 80px; margin: 0 auto 15px;"></div>`;
        } else {
            avatarHtml = `<div class="friend-profile-avatar" style="width: 80px; height: 80px; margin: 0 auto 15px;"><span style="color: white; font-size: 24px;">${initials}</span></div>`;
        }

        optionsModal.innerHTML = `
            <div class="add-friend-container">
                <div class="add-friend-header">
                    <h3>Friend Options</h3>
                    <button class="add-friend-btn close-options-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding: 25px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div class="friend-profile-avatar-wrapper" style="justify-content: center;">
                            ${avatarHtml}
                        </div>
                        <div class="friend-profile-name" style="font-size: 18px;">${displayName}</div>
                    </div>
                    
                    <div class="action-buttons" style="flex-direction: column; gap: 10px;">
                        <button class="action-btn secondary" id="changeCategoryBtn">
                            <i class="fas fa-tag"></i> Change Category
                        </button>
                        <button class="action-btn secondary" id="togglePinBtn">
                            <i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin Friend' : 'Pin Friend'}
                        </button>
                        <button class="action-btn secondary" id="toggleMuteBtn">
                            <i class="fas fa-volume-mute"></i> ${isMuted ? 'Unmute Friend' : 'Mute Friend'}
                        </button>
                        <button class="action-btn secondary" id="viewChatHistoryBtn">
                            <i class="fas fa-history"></i> View Chat History
                        </button>
                        <button class="action-btn secondary" id="viewCallHistoryBtn">
                            <i class="fas fa-phone-history"></i> View Call History
                        </button>
                        <button class="action-btn warning" id="removeFriendBtn">
                            <i class="fas fa-user-minus"></i> Remove Friend
                        </button>
                        <button class="action-btn danger" id="blockUserBtn">
                            <i class="fas fa-ban"></i> Block User
                        </button>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid var(--border-color);">
                    <button class="action-btn secondary close-options-btn" style="width: 100%;">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(optionsModal);

        const closeModal = () => {
            document.body.removeChild(optionsModal);
        };

        const closeBtn = optionsModal.querySelector('.close-options-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        const closeOptionsBtn = optionsModal.querySelector('.close-options-btn');
        if (closeOptionsBtn) closeOptionsBtn.addEventListener('click', closeModal);

        const changeCategoryBtn = optionsModal.querySelector('#changeCategoryBtn');
        if (changeCategoryBtn) {
            changeCategoryBtn.addEventListener('click', () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                closeModal();
                logUI(`Change category for: ${friendId}`);
                showChangeCategoryModal(friendData);
            });
        }

        const togglePinBtn = optionsModal.querySelector('#togglePinBtn');
        if (togglePinBtn) {
            togglePinBtn.addEventListener('click', async () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                closeModal();
                logUI(`Toggle pin for: ${friendId}`);
                await togglePinFriend(friendData);
            });
        }

        const toggleMuteBtn = optionsModal.querySelector('#toggleMuteBtn');
        if (toggleMuteBtn) {
            toggleMuteBtn.addEventListener('click', async () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                closeModal();
                logUI(`Toggle mute for: ${friendId}`);
                await toggleMuteFriend(friendData);
            });
        }

        const viewChatHistoryBtn = optionsModal.querySelector('#viewChatHistoryBtn');
        if (viewChatHistoryBtn) {
            viewChatHistoryBtn.addEventListener('click', () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                closeModal();
                logUI(`View chat history: ${friendId}`);
                navigateToChatWithUser(friendId, displayName);
            });
        }

        const viewCallHistoryBtn = optionsModal.querySelector('#viewCallHistoryBtn');
        if (viewCallHistoryBtn) {
            viewCallHistoryBtn.addEventListener('click', () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                closeModal();
                logUI(`View call history: ${friendId}`);
                navigateToCallModule(friendId, displayName);
            });
        }

        const removeFriendBtn = optionsModal.querySelector('#removeFriendBtn');
        if (removeFriendBtn) {
            removeFriendBtn.addEventListener('click', async () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                if (confirm(`Are you sure you want to remove ${displayName} from your friends?`)) {
                    closeModal();
                    logUI(`Remove friend: ${friendId}`);
                    await removeFriend(friendData);
                }
            });
        }

        const blockUserBtn = optionsModal.querySelector('#blockUserBtn');
        if (blockUserBtn) {
            blockUserBtn.addEventListener('click', async () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                if (confirm(`Are you sure you want to block ${displayName}? They will not be able to contact you.`)) {
                    closeModal();
                    logUI(`Block user: ${friendId}`);
                    await blockUser(friendData);
                }
            });
        }

    }, null);
};

export const showChangeCategoryModal = function(friendData) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showChangeCategoryModal', () => {
        if (!friendData || !friendData.id) return;

        const friendId = friendData.id;
        const displayName = escapeHtml(friendData.displayName || 'User');
        const currentCategory = friendData.category || 'friend';

        const modal = document.createElement('div');
        modal.className = 'add-friend-modal active';
        modal.id = `categoryModal_${Date.now()}`;

        const categoryOptions = Object.entries(friendCategories)
            .filter(([key]) => !['pinned', 'muted'].includes(key))
            .map(([key, value]) => {
                const selected = key === currentCategory ? 'selected' : '';
                return `<option value="${key}" ${selected}>${escapeHtml(value.name)}</option>`;
            })
            .join('');

        modal.innerHTML = `
            <div class="add-friend-container">
                <div class="add-friend-header">
                    <h3>Change Category</h3>
                    <button class="add-friend-btn close-category-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding: 25px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <p style="color: var(--text-secondary);">Change category for ${displayName}</p>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Select New Category</label>
                        <select class="text-input" id="newCategorySelect">
                            ${categoryOptions}
                        </select>
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                    <button class="action-btn secondary close-category-btn">Cancel</button>
                    <button class="action-btn primary" id="saveCategoryBtn">Save Category</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        const closeBtn = modal.querySelector('.close-category-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        const cancelBtn = modal.querySelector('.close-category-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        const saveBtn = modal.querySelector('#saveCategoryBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                const newCategorySelect = modal.querySelector('#newCategorySelect');
                const newCategory = newCategorySelect ? newCategorySelect.value : 'friend';

                try {
                    const friendIndex = friends.findIndex(f => f && f.id === friendId);
                    if (friendIndex !== -1) {
                        friends[friendIndex].category = newCategory;
                        SafeStorage.setObject(LOCAL_STORAGE_KEYS.FRIENDS, friends);
                    }

                    updateCurrentSection();
                    showNotification('Category updated', 'success');
                } catch (error) {
                    console.warn('Failed to update category:', error);
                    showNotification('Failed to update category', 'error');
                }

                closeModal();
            });
        }

    }, null);
};

// =============================================
// [12] START CHAT MODAL FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const showStartChatModal = function() {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showStartChatModal', () => {
        if (!domElements.startChatModal) return;

        domElements.startChatModal.classList.add('active');
        UIState.activeModals.add('startChatModal');

        window.selectedChatFriend = null;

        const confirmBtn = document.getElementById('confirmStartChatBtn');
        if (confirmBtn) confirmBtn.disabled = true;

        const searchInput = document.getElementById('searchChatUser');
        if (searchInput) searchInput.value = '';

        populateChatFriendsList();

    }, null);
};

function populateChatFriendsList() {
    return ErrorHandler.createBoundary('populateChatFriendsList', () => {
        const chatFriendsList = document.getElementById('chatFriendsList');
        if (!chatFriendsList) return;

        chatFriendsList.innerHTML = '';

        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        const friendArray = Array.isArray(friends) ? friends : [];
        const contactArray = Array.isArray(contacts) ? contacts : [];

        const allChattableFriends = [];
        const seenIds = new Set();

        pinnedArray.forEach(friend => {
            if (friend && friend.id && !seenIds.has(friend.id)) {
                seenIds.add(friend.id);
                allChattableFriends.push({ ...friend, _priority: 1 });
            }
        });

        friendArray.forEach(friend => {
            if (friend && friend.id && !seenIds.has(friend.id)) {
                seenIds.add(friend.id);
                const isOnline = friend.online === true || friend.status === 'online';
                allChattableFriends.push({ ...friend, _priority: isOnline ? 2 : 3 });
            }
        });

        contactArray.forEach(contact => {
            if (contact && contact.id && !seenIds.has(contact.id)) {
                seenIds.add(contact.id);
                allChattableFriends.push({ ...contact, _priority: 4 });
            }
        });

        allChattableFriends.sort((a, b) => (a._priority || 5) - (b._priority || 5));

        if (allChattableFriends.length === 0) {
            chatFriendsList.innerHTML = `
                <div class="empty-state" style="padding: 30px 20px;">
                    <i class="fas fa-user-friends" style="font-size: 24px; margin-bottom: 10px; color: var(--text-secondary);"></i>
                    <p style="color: var(--text-secondary);">No friends available to chat</p>
                    <p style="font-size: 14px; margin-top: 10px; color: var(--text-secondary);">Add friends first to start chatting</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();

        allChattableFriends.forEach(friend => {
            const displayName = escapeHtml(friend.displayName || 'Unknown User');
            const username = friend.username ? escapeHtml(friend.username) : null;
            const photoURL = friend.photoURL || friend.avatar;
            const avatarUrl = photoURL ? escapeHtml(photoURL) : null;

            const initials = displayName
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2)
                .replace(/[^A-Z0-9]/g, 'U');

            const isOnline = friend.online === true || friend.status === 'online';
            const statusClass = isOnline ? 'online' : 'offline';

            let avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = `<div class="friend-avatar" style="background-image: url('${avatarUrl}');"></div>`;
            } else {
                avatarHtml = `<div class="friend-avatar"><span>${initials}</span></div>`;
            }

            const friendItem = document.createElement('div');
            friendItem.className = 'friend-item';
            friendItem.style.cursor = 'pointer';
            friendItem.style.marginBottom = '8px';
            friendItem.dataset.userId = friend.id;

            friendItem.innerHTML = `
                <div class="friend-avatar-wrapper">
                    ${avatarHtml}
                    <div class="friend-status ${statusClass}"></div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">
                        <span class="friend-name-text">${displayName}</span>
                    </div>
                    <div class="friend-details">
                        ${username ? `<span class="friend-username">${username}</span>` : ''}
                        <span>${isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>
            `;

            friendItem.addEventListener('click', () => {
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                logUI(`Chat friend selected: ${friend.id}`);
                document.querySelectorAll('#chatFriendsList .friend-item').forEach(item => {
                    item.classList.remove('selected');
                });

                friendItem.classList.add('selected');
                window.selectedChatFriend = friend;

                const confirmBtn = document.getElementById('confirmStartChatBtn');
                if (confirmBtn) confirmBtn.disabled = false;
            });

            fragment.appendChild(friendItem);
        });

        chatFriendsList.appendChild(fragment);

    }, null);
}

function searchChatFriends(searchTerm) {
    return ErrorHandler.createBoundary('searchChatFriends', () => {
        const items = document.querySelectorAll('#chatFriendsList .friend-item');
        const term = searchTerm.toLowerCase().trim();

        items.forEach(item => {
            const name = item.querySelector('.friend-name-text')?.textContent.toLowerCase() || '';
            const username = item.querySelector('.friend-username')?.textContent.toLowerCase() || '';

            if (name.includes(term) || username.includes(term) || term === '') {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });

    }, null);
}

// =============================================
// [13] FILTERING AND SEARCH FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const filterFriendsByCategory = function(category) {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('filterFriendsByCategory', () => {
        setCurrentCategoryFilter(category);
        updateCurrentSection();

        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`.category-filter-btn[data-category="${category}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }, null);
};

export const searchFriendsLegacy = function(searchTerm) {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('searchFriends', () => {
        currentSearchTerm = searchTerm ? searchTerm.toLowerCase().trim() : '';
        updateCurrentSection();
    }, null);
};

// =============================================
// [14] ACTION HANDLERS - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const handleFriendAction = function(action, friendData, type, button) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('handleFriendAction', () => {
        const userId = button?.dataset?.userId || friendData?.id;
        const userName = button?.dataset?.userName || friendData?.displayName || 'User';

        logUI(`Handling friend action: ${action} for ${userId}`);

        switch(action) {
            case 'start-chat':
                navigateToChatWithUser(userId, userName);
                break;
            case 'call':
                navigateToCallModule(userId, userName);
                break;
            case 'add':
                sendFriendRequest(userId);
                break;
            case 'more':
                showFriendOptions(friendData);
                break;
            default:
                logUI(`Unknown action: ${action}`);
        }
    }, null);
};

export const handleRequestAction = function(action, requestData, button) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('handleRequestAction', async () => {
        logUI(`Handling request action: ${action} for ${requestData.id}`);

        switch(action) {
            case 'accept': {
                // Disable button to prevent double-click
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }
                
                const requestId = requestData.id;
                const senderId = requestData.senderId || requestData.user?.id;
                
                console.log('[UI] Accepting request:', { requestId, senderId });
                
                try {
                    // Call the accept function
                    const result = await acceptFriendRequestOnline(requestId, senderId);
                    
                    console.log('[UI] Accept result:', result);
                    
                    if (result && result.success) {
                        
                        // FIX: Refresh all data unconditionally — don't gate on activeSection.
                        await Promise.all([
                            loadFriendsFromBackend(),
                            loadFriendRequestsFromBackend(),
                            loadSentRequestsFromBackend()
                        ]);
                        
                        // Always re-render every list and update counts
                        renderFriends();
                        renderAllFriendsList();
                        renderFriendRequests();
                        renderSentRequests();
                        updateFriendCounts();
                        if (window.FriendCacheManager && typeof window.FriendCacheManager.syncToGlobals === 'function') {
                            window.FriendCacheManager.syncToGlobals();
                        }
                        
                        // Close any open modals
                        if (domElements.friendRequestModal) {
                            domElements.friendRequestModal.classList.remove('active');
                        }
                    } else {
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-check"></i>';
                        }
                        showNotification(result?.error || 'Failed to accept request', 'error');
                    }
                } catch (error) {
                    console.error('[UI] Accept error:', error);
                    if (button) {
                        button.disabled = false;
                        button.innerHTML = '<i class="fas fa-check"></i>';
                    }
                    showNotification(error.message || 'Failed to accept request', 'error');
                }
                break;
            }
            case 'decline': {
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }
                
                try {
                    await declineFriendRequest(requestData);
                    showNotification('Friend request declined', 'info');
                    
                    // Refresh requests list
                    await loadFriendRequestsFromBackend();
                    renderFriendRequests();
                } catch (error) {
                    console.error('[UI] Decline error:', error);
                    if (button) {
                        button.disabled = false;
                        button.innerHTML = '<i class="fas fa-times"></i>';
                    }
                    showNotification('Failed to decline request', 'error');
                }
                break;
            }
            case 'cancel': {
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                }
                
                try {
                    await cancelFriendRequest(requestData);
                    showNotification('Friend request cancelled', 'info');
                    
                    await loadSentRequestsFromBackend();
                    renderSentRequests();
                } catch (error) {
                    console.error('[UI] Cancel error:', error);
                    if (button) {
                        button.disabled = false;
                        button.innerHTML = '<i class="fas fa-times"></i> Cancel';
                    }
                }
                break;
            }
            case 'view-profile':
                showFriendRequestProfile(requestData);
                break;
            default:
                logUI(`Unknown request action: ${action}`);
        }
    }, null);
};

const handleSendFriendRequest = async function() {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return;
    }
    const activeTab = document.querySelector('.add-friend-tab.active');
    if (!activeTab) return;

    const activeTabName = activeTab.dataset.tab;
    logUI(`Send friend request from tab: ${activeTabName}`);

    // ── All Users tab: find the selected/highlighted user card and send to them ──
    if (activeTabName === 'all-users') {
        // Try to find a selected user card first; otherwise show guidance
        const selectedCard = document.querySelector('#allUsersList .user-item.selected, #allUsersList .friend-item.selected');
        if (selectedCard) {
            const rawId = selectedCard.dataset.userId || selectedCard.dataset.id;
            const parsedInt = parseInt(rawId, 10);
            const uid = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
            const uname = selectedCard.dataset.displayName || selectedCard.dataset.username || 'User';
            if (!uid) { showNotification('Please select a user first', 'warning'); return; }
            const result = await sendFriendRequest(uid, 'friend', 'Added via All Users');
            if (result && result.success) {
                showNotification(`Friend request sent to ${uname}`, 'success');
            } else {
                showNotification(result?.error || 'Failed to send friend request', 'error');
            }
        } else {
            // No card selected — tell user to click the Add button on a user card directly
            showNotification('Tap the Add button (➕) on the user you want to add', 'info');
        }
        return;
    }

    // ── Username tab ───────────────────────────────────────────────────────────
    if (activeTabName === 'username') {
        const usernameInput = document.getElementById('usernameInput');
        const raw = usernameInput?.value.trim() || '';

        if (!raw) {
            showNotification('Please enter a username to search', 'warning');
            return;
        }
        // Accept both "@john" and "john"
        const searchTerm = raw.startsWith('@') ? raw.substring(1) : raw;
        if (!searchTerm) {
            showNotification('Please enter a valid username', 'warning');
            return;
        }
        
        // Use the searchFriends function from core for REAL search
        if (typeof searchFriends === 'function') {
            const users = await searchFriends(searchTerm, { includeUsers: true, limit: 20 });
            // Case-insensitive match
            const user = users.find(u => u.username?.toLowerCase() === searchTerm.toLowerCase());
            
            if (!user) {
                showNotification(`No user found with username "${searchTerm}"`, 'error');
                return;
            }

            if (user.id === currentUser?.id) {
                showNotification('You cannot add yourself', 'warning');
                return;
            }

            const categorySelect = document.getElementById('friendCategorySelect');
            const category = categorySelect?.value || 'friend';
            const noteInput = document.getElementById('friendNote');
            const note = noteInput?.value.trim() || '';
            const isBusiness = category === 'business';

            const result = await sendFriendRequest(user.id, category, note, false, null, isBusiness);

            if (result && result.success) {
                showNotification(`Friend request sent to ${user.displayName || user.username}`, 'success');
                if (usernameInput) usernameInput.value = '';
                if (noteInput) noteInput.value = '';
            } else {
                showNotification(result?.error || 'Failed to send friend request', 'error');
            }
        } else {
            showNotification('Search function not available', 'error');
        }
        return;
    }

    // ── QR tab — handled by scanner; Send button not used here ────────────────
    if (activeTabName === 'qr') {
        showNotification('Scan a QR code to add a friend', 'info');
        return;
    }

    // ── Nearby tab — handled by individual Add buttons ─────────────────────
    if (activeTabName === 'nearby') {
        showNotification('Tap the Add button next to a nearby user', 'info');
        return;
    }
};

function updateFriendPresence(userId, online, lastSeen) {
    [friends, pinnedFriends, mutedFriends, temporaryFriends].forEach(arr => {
        const friend = arr.find(f => f && f.id === userId);
        if (friend) {
            friend.online = online;
            friend.status = online ? 'online' : 'offline';
            if (lastSeen) friend.lastSeen = lastSeen;
        }
    });

    if (UIState.activeSection === 'friendsSection') {
        renderFriends();
    } else if (UIState.activeSection === 'allFriendsSection') {
        renderAllFriendsList();
    }
}

// =============================================
// [15] DEBOUNCE UTILITY
// =============================================

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// =============================================
// [15A] NEARBY FETCH DEBOUNCE - FIXED for console noise
// =============================================
let _nearbyDebounceTimer = null;
function triggerNearbyFetch(lat, lng, radius) {
    if (_nearbyDebounceTimer) clearTimeout(_nearbyDebounceTimer);
    _nearbyDebounceTimer = setTimeout(() => fetchNearbyUsers(lat, lng, radius), 400);
}
function fetchNearbyUsers(lat, lng, radius) {
    // This is a placeholder - actual implementation is in the NearbyManager
    console.log('[Nearby] Fetching nearby users after debounce');
}

// =============================================
// [16] SETUP FUNCTIONS
// =============================================

function setupRetryButtons() {
    if (_retryButtonsSetup) return;
    _retryButtonsSetup = true;
    
    document.addEventListener('click', (e) => {
        const retryBtn = e.target.closest('.retry-section-btn');
        if (retryBtn) {
            const sectionId = retryBtn.dataset.section;
            logUI(`Retry section: ${sectionId}`);
            if (sectionId) {
                if (sectionId === 'allFriendsSection') {
                    RenderPipeline.renderFriendsListInstantly();
                    setTimeout(() => loadFriendsFromBackend().then(() => renderAllFriendsList()), 100);
                } else {
                    updateCurrentSection();
                }
            }
            return;
        }

        const retryModalBtn = e.target.closest('.retry-modal-btn');
        if (retryModalBtn) {
            const modalId = retryModalBtn.dataset.modal;
            logUI(`Retry modal: ${modalId}`);
            if (modalId === 'cameraScannerModal' && featureFlags.camera) {
                startCameraScanner();
            }
            return;
        }

        const retryUsersBtn = e.target.closest('.retry-users-btn');
        if (retryUsersBtn) {
            logUI('Retry users list');
            refreshAllUsersFromAPI();
            return;
        }
        
        const retrySearchBtn = e.target.closest('.retry-search-btn');
        if (retrySearchBtn) {
            logUI('Retry search');
            renderAllUsersList();
            return;
        }
    });
}

// =============================================
// [17] EVENT BINDING FUNCTION - STRICT LIFECYCLE COMPLIANCE
// =============================================

function bindAllEvents() {
    if (_eventHandlersBound) {
        logUI('Events already bound, skipping');
        return;
    }
    _eventHandlersBound = true;
    
    logUI('Binding all events...');
    
    // Refresh DOM elements before binding
    refreshDomElements();
    
    // Setup real-time search for All Users
    setupAllUsersSearch();
    
    // Add Friend button - FIXED with multiple handlers for reliability
    if (domElements.addFriendBtn) {
        const newBtn = domElements.addFriendBtn.cloneNode(true);
        domElements.addFriendBtn.parentNode.replaceChild(newBtn, domElements.addFriendBtn);
        domElements.addFriendBtn = newBtn;
        
        domElements.addFriendBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Add friend button clicked');
            if (domElements.addFriendModal) {
                domElements.addFriendModal.classList.add('active');
                const methodsTab = document.querySelector('.add-friend-tab[data-tab="methods"]');
                if (methodsTab) {
                    document.querySelectorAll('.add-friend-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.add-friend-tab-content').forEach(c => c.classList.remove('active'));
                    methodsTab.classList.add('active');
                    const methodsContent = document.getElementById('methodsTab');
                    if (methodsContent) methodsContent.classList.add('active');
                }
            }
        });
        
        if (typeof $ !== 'undefined') {
            $('#addFriendBtn').off('click').on('click', function(e) {
                e.preventDefault();
                if (!isUIActive()) {
                    showNotification('Please wait while module initializes...', 'info');
                    return;
                }
                logUI('Add friend button clicked (jQuery)');
                if (domElements.addFriendModal) {
                    domElements.addFriendModal.classList.add('active');
                }
            });
        }
    } else {
        logUI('Add friend button not found!');
        setTimeout(() => {
            refreshDomElements();
            if (domElements.addFriendBtn) {
                logUI('Add friend button found on retry');
                bindAllEvents();
            }
        }, 1000);
    }

    // Close Add Friend modal
    if (domElements.closeAddFriendModal) {
        domElements.closeAddFriendModal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.addFriendModal) {
                domElements.addFriendModal.classList.remove('active');
            }
        });
    }

    if (domElements.cancelAddFriendBtn) {
        domElements.cancelAddFriendBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.addFriendModal) {
                domElements.addFriendModal.classList.remove('active');
            }
        });
    }

    // Back button
    if (domElements.backBtn) {
        domElements.backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.friendDetailsPanel) {
                domElements.friendDetailsPanel.classList.remove('active');
            }
            if (isMobile) {
                document.body.classList.remove('mobile-details-open');
            }
        });
    }

    // Start New Chat button
    if (domElements.startNewChatBtn) {
        domElements.startNewChatBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Start new chat clicked');
            showStartChatModal();
        });
    }

    // Close Start Chat modal
    if (domElements.closeStartChatModal) {
        domElements.closeStartChatModal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.startChatModal) {
                domElements.startChatModal.classList.remove('active');
            }
        });
    }

    if (domElements.cancelStartChatBtn) {
        domElements.cancelStartChatBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.startChatModal) {
                domElements.startChatModal.classList.remove('active');
            }
        });
    }

    // Sync Contacts button
    if (domElements.syncContactsBtn) {
        domElements.syncContactsBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Sync contacts clicked');
            if (!featureFlags.contactsSync) return;

            const btn = this;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
            btn.disabled = true;

            try {
                await simulateContactSync();
                await loadContactsFromBackend();
                renderContacts();
                // Sync runs silently in background - no toast shown to user
            } catch (error) {
                console.warn('Contact sync failed:', error);
                showNotification('Failed to sync contacts', 'error');
            } finally {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
    }

    // Scan QR button - FIXED
    if (domElements.scanQRBtn) {
        const newScanBtn = domElements.scanQRBtn.cloneNode(true);
        domElements.scanQRBtn.parentNode.replaceChild(newScanBtn, domElements.scanQRBtn);
        domElements.scanQRBtn = newScanBtn;
        
        domElements.scanQRBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Scan QR clicked');
            if (!featureFlags.qrCode || !featureFlags.camera) {
                showNotification('QR code scanning is not available', 'warning');
                return;
            }

            if (domElements.addFriendModal) {
                domElements.addFriendModal.classList.add('active');
                const qrTab = document.querySelector('.add-friend-tab[data-tab="qr"]');
                if (qrTab) {
                    document.querySelectorAll('.add-friend-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.add-friend-tab-content').forEach(c => c.classList.remove('active'));
                    qrTab.classList.add('active');
                    const qrContent = document.getElementById('qrTab');
                    if (qrContent) qrContent.classList.add('active');
                    setTimeout(() => {
                        if (typeof generateUniqueQRCode === 'function') {
                            generateUniqueQRCode();
                        } else {
                            logUI('generateUniqueQRCode not available yet');
                        }
                    }, 200);
                }
            }
        });
    }

    // Scan QR modal button - with fullscreen handling
if (domElements.scanQRBtnModal) {
    const newScanModalBtn = domElements.scanQRBtnModal.cloneNode(true);
    domElements.scanQRBtnModal.parentNode.replaceChild(newScanModalBtn, domElements.scanQRBtnModal);
    domElements.scanQRBtnModal = newScanModalBtn;
    
    domElements.scanQRBtnModal.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isUIActive()) {
            showNotification('Please wait while module initializes...', 'info');
            return;
        }
        logUI('Scan QR modal clicked');
        if (!featureFlags.qrCode || !featureFlags.camera) {
            showNotification('Camera access is not available', 'warning');
            return;
        }

        if (domElements.cameraScannerModal) {
            document.body.classList.add('camera-active');
            domElements.cameraScannerModal.classList.add('active');
            if (typeof startCameraScanner === 'function') {
                startCameraScanner();
            } else {
                logUI('startCameraScanner not available yet');
                showNotification('Camera scanner not ready', 'error');
            }
        }
    });
}

    // Close camera button - with fullscreen cleanup
if (domElements.closeCameraBtn) {
    const newCloseCamBtn = domElements.closeCameraBtn.cloneNode(true);
    domElements.closeCameraBtn.parentNode.replaceChild(newCloseCamBtn, domElements.closeCameraBtn);
    domElements.closeCameraBtn = newCloseCamBtn;
    
    domElements.closeCameraBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        logUI('Close camera clicked');
        if (typeof stopCameraScanner === 'function') {
            stopCameraScanner();
        }
        if (domElements.cameraScannerModal) {
            document.body.classList.remove('camera-active');
            domElements.cameraScannerModal.classList.remove('active');
        }
    });
}

    // Toggle camera button
    if (domElements.toggleCameraBtn) {
        domElements.toggleCameraBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            toggleCamera();
        });
    }

    // Toggle flash button
    if (domElements.toggleFlashBtn) {
        domElements.toggleFlashBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            toggleFlash();
        });
    }

    // Discover button
    if (domElements.discoverBtn) {
        domElements.discoverBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Discover clicked');
            if (!featureFlags.discovery) return;

            if (domElements.addFriendModal) {
                domElements.addFriendModal.classList.add('active');
                const allUsersTab = document.querySelector('.add-friend-tab[data-tab="all-users"]');
                if (allUsersTab) {
                    document.querySelectorAll('.add-friend-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.add-friend-tab-content').forEach(c => c.classList.remove('active'));
                    allUsersTab.classList.add('active');
                    const allUsersContent = document.getElementById('all-usersTab');
                    if (allUsersContent) allUsersContent.classList.add('active');
                    setTimeout(renderAllUsersList, 50);
                }
            }
        });
    }

    // Send Friend Request button - FIXED
    if (domElements.sendFriendRequestBtn) {
        const newSendBtn = domElements.sendFriendRequestBtn.cloneNode(true);
        domElements.sendFriendRequestBtn.parentNode.replaceChild(newSendBtn, domElements.sendFriendRequestBtn);
        domElements.sendFriendRequestBtn = newSendBtn;
        
        domElements.sendFriendRequestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI('Send friend request clicked');
            handleSendFriendRequest();
        });
    }

    // Accept Request button
    if (domElements.acceptRequestBtn) {
        domElements.acceptRequestBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            const userId = this.dataset.userId;
            const qrData = this.dataset.qrData ? JSON.parse(this.dataset.qrData) : null;

            if (qrData && qrData.userId) {
                if (validateQRCodeData && validateQRCodeData(qrData)) {
                    await sendFriendRequest(qrData.userId);
                    if (domElements.friendRequestModal) {
                        domElements.friendRequestModal.classList.remove('active');
                    }
                } else {
                    showNotification('Invalid or expired QR code', 'error');
                }
            } else if (userId) {
                await acceptFriendRequestOnline(null, userId);
                if (domElements.friendRequestModal) {
                    domElements.friendRequestModal.classList.remove('active');
                }
            }
        });
    }

    // Decline Request button
    if (domElements.declineRequestBtn) {
        domElements.declineRequestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.friendRequestModal) {
                domElements.friendRequestModal.classList.remove('active');
            }
        });
    }

    // Close Mutual Friends modal
    if (domElements.closeMutualFriendsModal) {
        domElements.closeMutualFriendsModal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (domElements.mutualFriendsModal) {
                domElements.mutualFriendsModal.classList.remove('active');
            }
        });
    }

    // Confirm Start Chat button
    if (domElements.confirmStartChatBtn) {
        domElements.confirmStartChatBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            if (window.selectedChatFriend) {
                const userId = window.selectedChatFriend.id;
                const userName = window.selectedChatFriend.displayName || window.selectedChatFriend.username || 'User';
                console.log('[ChatModal] Confirmed chat with:', { userId, userName });
                navigateToChatWithUser(userId, userName);
                if (domElements.startChatModal) {
                    domElements.startChatModal.classList.remove('active');
                }
                window.selectedChatFriend = null;
            } else {
                showNotification('Please select a friend to chat with', 'warning');
            }
        });
    }

    // Redirect to Login button
    if (domElements.redirectToLoginBtn) {
        domElements.redirectToLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (ParentCoordinator?.state?.parentDetected) {
                ParentCoordinator.sendToParent({
                    type: 'REDIRECT_TO_LOGIN',
                    source: 'friend.html',
                    timestamp: Date.now()
                });
            } else {
                window.location.href = '/index.html';
            }
        });
    }

    // Retry Auth button
    if (domElements.retryAuthBtn) {
        domElements.retryAuthBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            hideAuthError();
            window.location.reload();
        });
    }

    // Category tabs
    const categoryTabs = {
        'allTab': 'allFriendsSection',
        'contactsTab': 'contactsSection',
        'friendsTab': 'friendsSection',
        'requestsTab': 'requestsSection',
        'temporaryTab': 'temporarySection',
        'pinnedTab': 'pinnedSection',
        'mutedTab': 'mutedSection'
    };

    Object.keys(categoryTabs).forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (!tab) {
            logUI(`Tab not found: ${tabId}`);
            return;
        }

        tab.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            logUI(`Tab clicked: ${tabId}`);

            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.friends-section').forEach(section => section.classList.remove('active'));

            const sectionId = categoryTabs[tabId];
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
                UIState.activeSection = sectionId;
                // Render directly - functions now handle data availability themselves
                if (sectionId === 'allFriendsSection') renderAllFriendsList();
                else if (sectionId === 'friendsSection') renderFriends();
                else if (isUIActive()) updateCurrentSection();
            }
        });
    });

    // Category filter buttons
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            const category = this.dataset.category;
            logUI(`Category filter clicked: ${category}`);
            filterFriendsByCategory(category);
        });
    });

    // Search input
    if (domElements.friendSearch) {
        domElements.friendSearch.addEventListener('input', debounce(function() {
            if (!isUIActive()) return;
            logUI(`Search input: ${this.value}`);
            searchFriendsLegacy(this.value);
        }, 300));
    }

    if (domElements.searchChatUser) {
        domElements.searchChatUser.addEventListener('input', function() {
            if (!isUIActive()) return;
            searchChatFriends(this.value);
        });
    }

    // Add Friend tabs
    document.querySelectorAll('.add-friend-tab').forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            const tabName = this.dataset.tab;
            logUI(`Add friend tab clicked: ${tabName}`);

            document.querySelectorAll('.add-friend-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.add-friend-tab-content').forEach(content => content.classList.remove('active'));

            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');

                if (tabName === 'all-users') {
                    // ALWAYS try to render immediately with whatever data is available
                    // Then fetch fresh data in background
                    console.log('[All Users] Tab activated, attempting to render');
                    renderAllUsersList();
                }

                if (tabName === 'qr' && featureFlags.qrCode) {
                    if (currentUser?.id) {
                        setTimeout(generateUniqueQRCode, 100);
                    }
                }

                if (tabName === 'groups') {
                    setTimeout(loadGroupsIntoSelect, 100);
                }

                // Nearby tab - auto-start discovery
                if (tabName === 'nearby') {
                    setTimeout(() => {
                        const startNearbyBtn = document.getElementById('startNearbyBtn');
                        if (startNearbyBtn && !startNearbyBtn.disabled) {
                            startNearbyBtn.click();
                        }
                    }, 100);
                }

                if (tabName !== 'nearby') {
                    // Stop nearby scanning when leaving that tab
                    if (NearbyManager && NearbyManager.stop) {
                        NearbyManager.stop();
                    }
                    const sBtn = document.getElementById('startNearbyBtn');
                    const xBtn = document.getElementById('stopNearbyBtn');
                    if (sBtn) sBtn.disabled = false;
                    if (xBtn) xBtn.disabled = true;
                }
            }
        });
    });

    // Method items
    document.querySelectorAll('.method-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            const method = this.dataset.method;
            logUI(`Method item clicked: ${method}`);

            document.querySelectorAll('.add-friend-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.add-friend-tab-content').forEach(c => c.classList.remove('active'));

            const tabToActivate = document.querySelector(`.add-friend-tab[data-tab="${method}"]`);
            const contentToActivate = document.getElementById(`${method}Tab`);

            if (tabToActivate && contentToActivate) {
                tabToActivate.classList.add('active');
                contentToActivate.classList.add('active');

                if (method === 'qr' && featureFlags.qrCode && currentUser?.id) {
                    setTimeout(generateUniqueQRCode, 100);
                }
                
                // Nearby method - auto-start
                if (method === 'nearby') {
                    setTimeout(() => {
                        const startNearbyBtn = document.getElementById('startNearbyBtn');
                        if (startNearbyBtn && !startNearbyBtn.disabled) {
                            startNearbyBtn.click();
                        }
                    }, 100);
                }
            }
        });
    });

    // In friend-ui.js, ensure the refresh button handler is properly set

const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
if (refreshRequestsBtn) {
    refreshRequestsBtn.addEventListener('click', async () => {
        if (!isUIActive()) {
            showNotification('Please wait...', 'info');
            return;
        }
        refreshRequestsBtn.disabled = true;
        refreshRequestsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            await Promise.all([
                loadFriendRequestsFromBackend(),
                loadSentRequestsFromBackend()
            ]);
            renderFriendRequests();
            renderSentRequests();
            updateFriendCounts();
            showNotification('Requests refreshed!', 'success');
        } catch (error) {
            console.error('[UI] Refresh failed:', error);
            showNotification('Refresh failed', 'error');
        } finally {
            refreshRequestsBtn.disabled = false;
            refreshRequestsBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    });
}

    // ── Nearby Discovery ──────────────────────────────────────────────────────
    const startNearbyBtn = document.getElementById('startNearbyBtn');
    const stopNearbyBtn  = document.getElementById('stopNearbyBtn');
    const nearbyStatusEl = document.getElementById('nearbyStatusText');
    const nearbyListEl   = document.getElementById('nearbyFriendsList');

    function renderNearbyUsers(users, mode) {
        if (!nearbyListEl) return;
        if (!users || users.length === 0) {
            nearbyListEl.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:20px;">No users found nearby right now.</p>`;
            return;
        }
        nearbyListEl.innerHTML = users.map(u => {
            const avatarUrl = u.photoURL || u.avatar;
            const avatarHtml = avatarUrl 
                ? `<img src="${escapeHtml(avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
                : escapeHtml((u.displayName||u.username||'?')[0].toUpperCase());
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid var(--border-color);">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;flex-shrink:0;overflow:hidden;">
                    ${avatarHtml}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.displayName||u.username)}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">@${escapeHtml(u.username)} · ${escapeHtml(u.status||'offline')}</div>
                </div>
                <button class="action-btn primary nearby-add-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" style="padding:6px 14px;font-size:13px;">
                    <i class="fas fa-user-plus"></i> Add
                </button>
            </div>
        `}).join('');

        // Wire add buttons
        nearbyListEl.querySelectorAll('.nearby-add-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                // FIX: parseInt breaks UUID-based IDs — use safe coercion
                const rawId = this.dataset.userId;
                const parsedInt = parseInt(rawId, 10);
                const uid = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
                const uname = this.dataset.username;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const result = await sendFriendRequest(uid, 'friend', 'Added via Nearby Discovery');
                if (result && result.success) {
                    this.innerHTML = '<i class="fas fa-check"></i> Sent';
                    showNotification(`Friend request sent to @${uname}`, 'success');
                } else {
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-user-plus"></i> Add';
                    showNotification(result?.error || 'Failed to send request', 'error');
                }
            });
        });
    }

    if (startNearbyBtn) {
        startNearbyBtn.addEventListener('click', function() {
            if (!isUIActive()) { showNotification('Please wait…', 'info'); return; }
            this.disabled = true;
            if (stopNearbyBtn) stopNearbyBtn.disabled = false;
            if (nearbyStatusEl) nearbyStatusEl.textContent = 'Starting…';
            NearbyManager.start(
                (users, mode) => {
                    const modeLabel = mode === 'location' ? 'nearby (GPS)' : 'online users';
                    if (nearbyStatusEl) nearbyStatusEl.textContent = `Showing ${users.length} ${modeLabel}`;
                    renderNearbyUsers(users, mode);
                },
                (status) => { if (nearbyStatusEl) nearbyStatusEl.textContent = status; }
            );
        });
    }

    if (stopNearbyBtn) {
        stopNearbyBtn.disabled = true;
        stopNearbyBtn.addEventListener('click', function() {
            NearbyManager.stop();
            this.disabled = true;
            if (startNearbyBtn) startNearbyBtn.disabled = false;
            if (nearbyStatusEl) nearbyStatusEl.textContent = 'Stopped';
            if (nearbyListEl) nearbyListEl.innerHTML = '';
        });
    }

    // ── Groups tab: load groups into select, load members on change ────────────
    const groupSelect       = document.getElementById('groupSelect');
    const groupMemberSearch = document.getElementById('groupMemberSearch');
    const groupMembersList  = document.getElementById('groupMembersList');

    if (groupSelect) {
        groupSelect.addEventListener('change', function() {
            const gid = this.value;
            if (!gid) {
                if (groupMembersList) groupMembersList.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);"><i class="fas fa-users" style="font-size:32px;margin-bottom:10px;display:block;"></i>Select a group to view members</div>';
                return;
            }
            loadGroupMembers(gid, groupMemberSearch?.value || '');
        });
    }

    if (groupMemberSearch) {
        let groupSearchTimer;
        groupMemberSearch.addEventListener('input', function() {
            clearTimeout(groupSearchTimer);
            groupSearchTimer = setTimeout(() => {
                const gid = groupSelect?.value;
                if (gid) loadGroupMembers(gid, this.value.trim());
            }, 300);
        });
    }

    // Hook groups tab activation to load groups
    document.querySelectorAll('.add-friend-tab[data-tab="groups"]').forEach(tab => {
        tab.addEventListener('click', function() {
            setTimeout(loadGroupsIntoSelect, 100);
        });
    });
    document.querySelectorAll('.method-item[data-method="groups"]').forEach(item => {
        item.addEventListener('click', function() {
            setTimeout(loadGroupsIntoSelect, 150);
        });
    });

    // ── All Users: wire the "Add" button via event delegation ────────────────
    const allUsersList = document.getElementById('allUsersList');
    if (allUsersList) {
        allUsersList.addEventListener('click', async function(e) {
            const addBtn = e.target.closest('.friend-action-btn[data-action="add"]');
            if (!addBtn) return;
            if (!isUIActive()) {
                showNotification('Please wait while module initializes…', 'info');
                return;
            }
            const rawId = addBtn.dataset.userId;
            const parsedInt = parseInt(rawId, 10);
            const userId = (!isNaN(parsedInt) && String(parsedInt) === rawId) ? parsedInt : rawId;
            const userName = addBtn.dataset.userName || '';
            if (!userId) return;
            
            addBtn.disabled = true;
            const origHtml = addBtn.innerHTML;
            addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            const result = await sendFriendRequest(userId, 'friend', 'Added from All Users');
            if (result && result.success) {
                addBtn.innerHTML = '<i class="fas fa-check"></i>';
                addBtn.style.background = 'var(--success-color)';
                showNotification(`Friend request sent to ${userName}`, 'success');
                // Refresh the list to update button states
                setTimeout(() => renderAllUsersList(), 500);
            } else {
                addBtn.disabled = false;
                addBtn.innerHTML = origHtml;
                showNotification(result?.error || 'Failed to send friend request', 'error');
            }
        });
    }

    logUI('Event binding complete');
}

// =============================================
// [18] INITIALIZATION - STRICT LIFECYCLE COMPLIANCE
// =============================================

function initializeUI() {
    if (_uiInitialized) return;
    _uiInitialized = true;
    
    logUI('Initializing UI...');

    // FIX: Load cached data into window globals BEFORE RenderPipeline.init()
    // so renderFriendsListInstantly() sees populated arrays on first paint.
    // This is synchronous (localStorage reads) so it completes immediately.
    try {
        if (typeof loadCachedDataInstantly === 'function') {
            loadCachedDataInstantly();
        }
    } catch (_) {}

    bindAllEvents();
    RenderPipeline.init();
    CoreIntegration.init();
    setupRetryButtons();
    checkMobile();
    
    // Listen for lifecycle changes to re-bind if needed
    window.addEventListener('lifecycleChanged', () => {
        if (!_eventHandlersBound) {
            bindAllEvents();
        }
    });

    // ──// UNIFIED SETTINGS SUBSCRIPTION - Single source of truth
    // Subscribe to AppSettings for all settings changes
    if (window.AppSettings) {
        window.AppSettings.subscribe(function(settings, path, value) {
            try {
                if (path && path !== '*') {
                    // Single setting changed
                    const parts = path.split('.');
                    const section = parts[0];
                    const key = parts.slice(1).join('.');
                    if (typeof applySettingToFriendModule === 'function') {
                        applySettingToFriendModule(section, key, value);
                        if (section === 'appearance' && key === 'theme') {
                            // Force a repaint so the theme CSS variables take effect immediately
                            document.documentElement.style.display = 'none';
                            void document.documentElement.offsetHeight;
                            document.documentElement.style.display = '';
                        }
                    }
                } else {
                    // Full settings object changed
                    if (settings && typeof settings === 'object' && typeof applySettingToFriendModule === 'function') {
                        Object.entries(settings).forEach(([sec, secVal]) => {
                            if (secVal && typeof secVal === 'object') {
                                Object.entries(secVal).forEach(([k, v]) => applySettingToFriendModule(sec, k, v));
                            }
                        });
                    }
                }
            } catch(err) {
                console.warn('[FriendUI] Settings subscription error:', err);
            }
        });
    } else {
        // Fallback: Wait for AppSettings to be ready
        window.addEventListener('appSettingsReady', function() {
            if (window.AppSettings) {
                window.AppSettings.subscribe(function(settings, path, value) {
                    try {
                        if (path && path !== '*') {
                            const parts = path.split('.');
                            const section = parts[0];
                            const key = parts.slice(1).join('.');
                            if (typeof applySettingToFriendModule === 'function') {
                                applySettingToFriendModule(section, key, value);
                                if (section === 'appearance' && key === 'theme') {
                                    // Force a repaint so the theme CSS variables take effect immediately
                                    document.documentElement.style.display = 'none';
                                    void document.documentElement.offsetHeight;
                                    document.documentElement.style.display = '';
                                }
                            }
                        } else {
                            if (settings && typeof settings === 'object' && typeof applySettingToFriendModule === 'function') {
                                Object.entries(settings).forEach(([sec, secVal]) => {
                                    if (secVal && typeof secVal === 'object') {
                                        Object.entries(secVal).forEach(([k, v]) => applySettingToFriendModule(sec, k, v));
                                    }
                                });
                            }
                        }
                    } catch(err) {
                        console.warn('[FriendUI] Settings subscription error:', err);
                    }
                });
            }
        }, { once: true });
    }

    // Legacy event listeners for backwards compatibility
    window.addEventListener('settingChanged', function(e) {
        const { section, key, value } = e.detail || {};
        if (section && key !== undefined && typeof applySettingToFriendModule === 'function') {
            applySettingToFriendModule(section, key, value);
            if (section === 'appearance' && key === 'theme') {
                // Force a repaint so the theme CSS variables take effect immediately
                document.documentElement.style.display = 'none';
                void document.documentElement.offsetHeight;
                document.documentElement.style.display = '';
            }
        }
    });
    window.addEventListener('settingsUpdated', function(e) {
        const { settings } = e.detail || {};
        if (settings && typeof settings === 'object' && typeof applySettingToFriendModule === 'function') {
            Object.entries(settings).forEach(([sec, secVal]) => {
                if (secVal && typeof secVal === 'object') {
                    Object.entries(secVal).forEach(([k, v]) => applySettingToFriendModule(sec, k, v));
                }
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        logUI('DOMContentLoaded, initializing UI');
        initializeUI();
    });
} else {
    logUI('DOM already loaded, initializing UI immediately');
    initializeUI();
}

setInterval(() => UIState.clearExpiredCache(), 600000);

setInterval(() => {
    if (V6 && V6.isSessionValid()) {
        UIState.updateConnectionState('connected');
    } else if (V6 && V6.current === 'DEGRADED') {
        UIState.updateConnectionState('degraded');
    } else {
        UIState.updateConnectionState('connecting');
    }

    if (kynState) {
        UIState.connectionState.sessionValid = V6 ? V6.isSessionValid() : false;
    }
    
    UIState.connectionState.lifecycleState = getLifecycleState();
}, 5000);

// Initialize core but don't wait - UI will render skeleton first
initialize().catch(error => {
    console.warn('Failed to initialize friend core:', error);
    if (!cacheLoaded) {
        loadCachedDataInstantly();
        RenderPipeline.renderFriendsListInstantly();
    }
    UIState.updateConnectionState('degraded');
});

// =============================================
// [19] CLEANUP ON UNLOAD
// =============================================

window.addEventListener('beforeunload', () => {
    saveFriendsToLocalStorage();
    stopCameraScanner();

    if (backgroundSyncInterval) {
        clearInterval(backgroundSyncInterval);
    }
});

// =============================================
// [20] RETRY INITIALIZATION IF ELEMENTS MISSING
// =============================================

setTimeout(() => {
    if (!domElements.addFriendBtn || !domElements.scanQRBtn || !domElements.closeCameraBtn) {
        logUI('Some DOM elements missing, refreshing references');
        
        refreshDomElements();
        
        if (!_eventHandlersBound) {
            bindAllEvents();
        }
    }
}, 2000);

window.addEventListener('friendCoreReady', () => {
    logUI('Friend core ready, ensuring events are bound');
    if (!_eventHandlersBound) {
        bindAllEvents();
    }
    
    window.dispatchEvent(new CustomEvent('lifecycleChanged', {
        detail: { toState: LIFECYCLE_STATES.ACTIVE }
    }));
});

window.addEventListener('parentReady', () => {
    logUI('Parent ready event received in UI');
    UIState.updateConnectionState('connected');
    
    window.dispatchEvent(new CustomEvent('lifecycleChanged', {
        detail: { toState: LIFECYCLE_STATES.ACTIVE }
    }));
});

// Export for use in other modules
export {
    isUIActive,
    getLifecycleState,
    getLifecycleStateDisplay
};

// =============================================
// END OF UI MODULE
// Version: 4.7
// ✅ FIXED: Optimistic UI for accept/decline with fade-out animation
// ✅ FIXED: Connection readiness check before API calls (waitForConnectionReady now detects ACTIVE state)
// ✅ FIXED: Retry mechanism for failed API calls with rollback
// ✅ FIXED: Instant All Users rendering from cache
// ✅ FIXED: Real-time search with input event listener
// ✅ FIXED: Call button navigation to calls module with SWITCH_MODULE
// ✅ FIXED: Chat button sends OPEN_CHAT_WITH_USER event
// ✅ FIXED: Online status from user.status field
// ✅ FIXED: Avatar normalization (photoURL || avatar) everywhere
// ✅ FIXED: Stale ES module bindings for sentRequests, friends, friendRequests
// ✅ FIXED: Sent requests count badge updates
// ✅ FIXED: Call button for non-friend users in Discover section
// ✅ FIXED: Friend request count badge updates on every refresh (requestsUpdated listener)
// ✅ FIXED: Nearby fetch debounced to prevent duplicate calls (triggerNearbyFetch)
// ✅ PRESERVED: All existing UI features and animations
// ✅ PRESERVED: All category filters and friend lists
// ✅ PRESERVED: Camera and QR code functionality
// =============================================