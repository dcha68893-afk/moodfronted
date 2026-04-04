// =============================================
// FRIEND PAGE UI - STABILIZED COMMUNICATION v4.1
// DETERMINISTIC MICRO-FRONTEND ARCHITECTURE
// COMPLETE INTEGRATION WITH REAL BACKEND SYSTEM
// STABILITY v4.1: Lifecycle hardening, duplicate prevention, error resilience
// =============================================

// =============================================
// [1] IMPORT VERIFICATION - COMPLETE WITH ALL CORE EXPORTS
// =============================================

import {
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
    handleParentReady

} from './friend-core.js';

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
        if (!isUIActive()) {
            logUI('renderProgressive blocked - not active');
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
            logUI('enableLiveUpdates blocked - not active');
            return;
        }
        if (this.status.liveUpdate) return;
        
        this.setupLiveUpdateListeners();
        this.status.liveUpdate = true;
        this.status.ready = true;
        this._showOnce('live', 'Live updates enabled', 'debug');
    },

    setupLiveUpdateListeners() {
        window.addEventListener('friendsUpdated', () => {
            if (!isUIActive()) return;
            
            this.queueRender('friends', debounce(() => {
                if (UIState.activeSection === 'friendsSection') renderFriends();
                if (UIState.activeSection === 'allFriendsSection') renderAllFriendsList();
            }, 300));
        });
        
        window.addEventListener('requestsUpdated', () => {
            if (!isUIActive()) return;
            
            this.queueRender('requests', debounce(() => {
                if (UIState.activeSection === 'requestsSection') {
                    renderFriendRequests();
                    renderSentRequests();
                }
            }, 300));
        });
        
        window.addEventListener('contactsUpdated', () => {
            if (!isUIActive()) return;
            
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
        
        // Listen for global search results
        window.addEventListener('friendGlobalSearchResults', (event) => {
            if (!isUIActive()) return;
            const { query, results } = event.detail || {};
            logUI('Global search results received', { query, count: results?.length });
            this.queueRender('globalSearchResults', debounce(() => {
                displaySearchResults(results, query);
            }, 100));
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

            domElements.allFriendsList.innerHTML = '';

            const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
            const friendArray = Array.isArray(friends) ? friends : [];
            const contactArray = Array.isArray(contacts) ? contacts : [];

            const allToDisplay = [...pinnedArray, ...friendArray, ...contactArray].slice(0, 25);

            if (allToDisplay.length === 0) {
                if (!isUIActive()) {
                    domElements.allFriendsList.innerHTML = UIBoundaries.createPassiveLoadingState('allFriendsSection');
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

            const fragment = document.createDocumentFragment();
            allToDisplay.forEach(item => {
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
                if (UIState.activeSection === 'friendsSection') renderFriends();
                if (UIState.activeSection === 'allFriendsSection') renderAllFriendsList();
            }
        });

        this.subscribe('requestsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.requests) {
                updateFriendCounts();
                if (UIState.activeSection === 'requestsSection') renderFriendRequests();
            }
        });

        this.subscribe('sentRequestsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.requests) {
                if (UIState.activeSection === 'requestsSection') renderSentRequests();
            }
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
            if (data?.request) {
                showNotification('New friend request received', 'info');
                if (UIState.activeSection === 'requestsSection') {
                    loadFriendRequestsFromBackend();
                }
            }
        });
        
        this.subscribe('friendRequestAccepted', (event) => {
            const data = this.validateEventData(event);
            if (data?.friendId) {
                showNotification('Friend request accepted!', 'success');
                loadFriendsFromBackend();
                loadSentRequestsFromBackend();
            }
        });
        
        this.subscribe('friendRequestRejected', (event) => {
            showNotification('Friend request was rejected', 'info');
            loadSentRequestsFromBackend();
        });
        
        this.subscribe('friendRemoved', (event) => {
            const data = this.validateEventData(event);
            if (data?.friendId) {
                showNotification('Friend removed', 'info');
                if (UIState.activeSection === 'friendsSection') loadFriendsFromBackend();
                if (UIState.activeSection === 'allFriendsSection') loadFriendsFromBackend();
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
    results.forEach(user => {
        const userItem = createUserSearchItemElement(user);
        if (userItem) fragment.appendChild(userItem);
    });
    
    allUsersListElement.innerHTML = '';
    allUsersListElement.appendChild(fragment);
}

// =============================================
// [8] UI RENDERING FUNCTIONS - STRICT LIFECYCLE COMPLIANCE
// =============================================

export const updateFriendCounts = function() {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('updateFriendCounts', () => {
        const totalFriendsElement = document.getElementById('totalFriends');
        const onlineFriendsElement = document.getElementById('onlineFriends');
        const pinnedFriendsElement = document.getElementById('pinnedFriends');
        const friendsCountElement = document.getElementById('friendsCount');
        const contactsCountElement = document.getElementById('contactsCount');
        const requestsCountElement = document.getElementById('requestsCount');
        const requestsSectionCountElement = document.getElementById('requestsSectionCount');
        const sentRequestsCountElement = document.getElementById('sentRequestsCount');
        const pinnedCountElement = document.getElementById('pinnedCount');
        const mutedCountElement = document.getElementById('mutedCount');

        const friendArray = Array.isArray(friends) ? friends : [];
        const contactArray = Array.isArray(contacts) ? contacts : [];
        const requestArray = Array.isArray(friendRequests) ? friendRequests : [];
        const sentArray = Array.isArray(sentRequests) ? sentRequests : [];
        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        const mutedArray = Array.isArray(mutedFriends) ? mutedFriends : [];

        if (totalFriendsElement) totalFriendsElement.textContent = friendArray.length;
        const onlineCount = friendArray.filter(f => f && f.online).length;
        if (onlineFriendsElement) onlineFriendsElement.textContent = onlineCount;
        if (pinnedFriendsElement) pinnedFriendsElement.textContent = pinnedArray.length;
        if (friendsCountElement) friendsCountElement.textContent = friendArray.length;
        if (contactsCountElement) contactsCountElement.textContent = contactArray.length;
        if (requestsCountElement) requestsCountElement.textContent = requestArray.length;
        if (requestsSectionCountElement) requestsSectionCountElement.textContent = requestArray.length;
        if (sentRequestsCountElement) sentRequestsCountElement.textContent = sentArray.length;
        if (pinnedCountElement) pinnedCountElement.textContent = pinnedArray.length;
        if (mutedCountElement) mutedCountElement.textContent = mutedArray.length;
    }, null);
};

export const updateCurrentSection = function() {
    if (!isUIActive()) {
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
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderAllFriendsList', () => {
        if (!domElements.allFriendsList) return;

        domElements.allFriendsList.innerHTML = '';

        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        const friendArray = Array.isArray(friends) ? friends : [];
        const contactArray = Array.isArray(contacts) ? contacts : [];
        const temporaryArray = Array.isArray(temporaryFriends) ? temporaryFriends : [];

        const allToDisplay = [...pinnedArray, ...friendArray, ...contactArray, ...temporaryArray];

        const uniqueMap = new Map();
        allToDisplay.forEach(item => { if (item && item.id) uniqueMap.set(item.id, item); });
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
    if (!isUIActive()) {
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
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderFriends', () => {
        if (!domElements.friendsList) return;

        domElements.friendsList.innerHTML = '';

        const friendArray = Array.isArray(friends) ? friends : [];
        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];

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
            if (a.online !== b.online) return b.online ? 1 : -1;
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
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderFriendRequests', () => {
        if (!domElements.requestsList) return;

        domElements.requestsList.innerHTML = '';

        const requestArray = Array.isArray(friendRequests) ? friendRequests : [];

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

    }, () => {
        if (domElements.requestsList) {
            domElements.requestsList.innerHTML = UIBoundaries.createSectionFallback('requestsSection');
        }
    });
};

export const renderSentRequests = function() {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderSentRequests', () => {
        if (!domElements.sentRequestsList) return;

        domElements.sentRequestsList.innerHTML = '';

        const sentArray = Array.isArray(sentRequests) ? sentRequests : [];

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
    if (!isUIActive()) {
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
    if (!isUIActive()) {
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
    if (!isUIActive()) {
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

export const renderAllUsersList = function() {
    if (!isUIActive()) {
        return null;
    }
    return ErrorHandler.createBoundary('renderAllUsersList', () => {
        const allUsersListElement = document.getElementById('allUsersList');
        const allUsersStatusElement = document.getElementById('allUsersStatus');
        const allUsersSearchElement = document.getElementById('allUsersSearch');

        if (!allUsersListElement) return;

        const searchTerm = allUsersSearchElement ? allUsersSearchElement.value.toLowerCase().trim() : '';
        
        // If there's a search term, perform REAL search through core
        if (searchTerm && typeof searchFriends === 'function') {
            logUI('Performing real search for:', searchTerm);
            
            // Show loading state
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 15px;"></i>
                    <p>Searching for "${escapeHtml(searchTerm)}"...</p>
                </div>
            `;
            
            if (allUsersStatusElement) {
                allUsersStatusElement.textContent = `Searching for "${escapeHtml(searchTerm)}"...`;
            }
            
            // Perform real search
            searchFriends(searchTerm, { includeUsers: true, limit: 50 })
                .then(results => {
                    logUI('Search results:', { count: results.length });
                    displaySearchResults(results, searchTerm);
                })
                .catch(error => {
                    logUI('Search failed:', error);
                    allUsersListElement.innerHTML = `
                        <div class="empty-state error-boundary">
                            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color);"></i>
                            <p>Search failed</p>
                            <p class="subtext">${escapeHtml(error.message || 'Please try again')}</p>
                            <button class="action-btn secondary retry-search-btn" style="margin-top: 15px;">
                                <i class="fas fa-sync-alt"></i> Retry
                            </button>
                        </div>
                    `;
                    
                    const retryBtn = allUsersListElement.querySelector('.retry-search-btn');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', () => renderAllUsersList());
                    }
                    
                    if (allUsersStatusElement) {
                        allUsersStatusElement.textContent = `Search failed`;
                    }
                });
            return;
        }
        
        // No search term - show all users from cache or fetch new
        const userArray = Array.isArray(allUsers) ? allUsers : [];
        const currentUserId = currentUser?.id;

        let filteredUsers = userArray.filter(user => {
            if (!user || !user.id) return false;
            if (user.id === currentUserId) return false;
            return true;
        });

        filteredUsers.sort((a, b) => {
            if (a.online !== b.online) return b.online ? 1 : -1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        if (allUsersStatusElement) {
            allUsersStatusElement.textContent = `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} available`;
        }

        allUsersListElement.innerHTML = '';

        if (filteredUsers.length === 0) {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No users found</p>
                    <p class="subtext">Check back later for new users</p>
                    <button class="action-btn secondary refresh-users-btn" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            `;
            
            const refreshBtn = allUsersListElement.querySelector('.refresh-users-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    fetchAllUsersFromBackend().then(() => renderAllUsersList());
                });
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        filteredUsers.forEach(user => {
            const userItem = createUserSearchItemElement(user);
            if (userItem) fragment.appendChild(userItem);
        });
        allUsersListElement.appendChild(fragment);

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
                    if (!isUIActive()) {
                        showNotification('Please wait while module initializes...', 'info');
                        return;
                    }
                    fetchAllUsersFromBackend().then(() => renderAllUsersList());
                });
            }
        }
    });
};

// =============================================
// [9] UI ELEMENT CREATORS - STRICT LIFECYCLE COMPLIANCE
// =============================================

function createFriendItemElement(friendData, type, instantMode = false) {
    if (!friendData || !friendData.id) return null;

    return ErrorHandler.createBoundary(`createFriendItem:${friendData.id}`, () => {
        const friendId = friendData.id;
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.userId = friendId;
        friendItem.dataset.type = type;

        const displayName = escapeHtml(friendData.displayName || 'Unknown User');
        const username = friendData.username ? escapeHtml(friendData.username) : null;
        // Support both photoURL (real users) and avatar (demo / backend avatar field)
        const photoURL = friendData.photoURL
            ? escapeHtml(friendData.photoURL)
            : (friendData.avatar ? escapeHtml(friendData.avatar) : null);

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        let statusClass = 'offline';
        let statusText = 'Offline';

        if (friendData.online) {
            statusClass = 'online';
            statusText = 'Online now';
        } else if (friendData.lastSeen) {
            try {
                const lastSeen = new Date(friendData.lastSeen);
                const minutesAgo = Math.floor((Date.now() - lastSeen) / 60000);
                if (minutesAgo < 5) {
                    statusClass = 'online';
                    statusText = 'Online now';
                } else if (minutesAgo < 15) {
                    statusClass = 'away';
                    statusText = 'Recently';
                } else {
                    statusText = `Last seen ${formatTimeAgo(lastSeen)}`;
                }
            } catch (e) {
                statusText = 'Offline';
            }
        }

        const lastInteraction = getLastInteraction(friendId);
        if (lastInteraction) statusText = lastInteraction;

        const mutualCount = mutualFriendsCache && mutualFriendsCache[friendId] ? mutualFriendsCache[friendId] : 0;
        const category = friendData.category || 'friend';
        const categoryInfo = friendCategories[category] || friendCategories.friend;

        const isPinned = pinnedFriends && pinnedFriends.some(f => f && f.id === friendId);
        const isMuted = mutedFriends && mutedFriends.some(f => f && f.id === friendId);
        const isTemporary = friendData.isTemporary === true;
        const isBusiness = friendData.isBusiness === true;

        let avatarHtml = '';
        if (photoURL) {
            avatarHtml = `<div class="friend-avatar" style="background-image: url('${photoURL}');"></div>`;
        } else {
            avatarHtml = `<div class="friend-avatar"><span>${initials}</span></div>`;
        }

        const isDemo = friendData.isDemo === true;

        let badgesHtml = '';
        if (isDemo) badgesHtml += '<span class="temp-friend-badge" style="background:rgba(108,99,255,.15);color:#6C63FF;border:1px solid rgba(108,99,255,.3)"><i class="fas fa-flask"></i> Demo</span>';
        if (isTemporary) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-clock"></i> Temp</span>';
        if (isBusiness) badgesHtml += '<span class="business-badge"><i class="fas fa-briefcase"></i> Business</span>';
        if (isPinned) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-thumbtack"></i> Pinned</span>';
        if (isMuted) badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-volume-mute"></i> Muted</span>';

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
            actionsHtml = `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${friendId}" data-user-name="${displayName}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-action-btn" data-action="more" title="More options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
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
                    <span>${statusText}</span>
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
                logUI(`Friend action: ${action} for ${friendId}`);
                handleFriendAction(action, friendData, type, btn);
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
        const photoURL = userData.photoURL ? escapeHtml(userData.photoURL) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const mutualCount = mutualFriendsCache && mutualFriendsCache[userId] ? mutualFriendsCache[userId] : 0;

        let avatarHtml = '';
        if (photoURL) {
            avatarHtml = `<div class="friend-avatar" style="background-image: url('${photoURL}');"></div>`;
        } else {
            avatarHtml = `<div class="friend-avatar"><span>${initials}</span></div>`;
        }

        const createdAt = requestData.createdAt || requestData.timestamp || Date.now();
        const timeAgo = formatTimeAgo(new Date(createdAt));

        const note = requestData.note ? escapeHtml(requestData.note) : null;

        let actionsHtml = '';
        if (type === 'incoming') {
            actionsHtml = `
                <button class="friend-action-btn success" data-action="accept" title="Accept">
                    <i class="fas fa-check"></i>
                </button>
                <button class="friend-action-btn danger" data-action="decline" title="Decline">
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
                logUI(`Request action: ${action} for ${requestData.id}`);
                handleRequestAction(action, requestData, btn);
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

function createUserSearchItemElement(user) {
    if (!user || !user.id) return null;

    return ErrorHandler.createBoundary(`createUserItem:${user.id}`, () => {
        const userId = user.id;

        const displayName = escapeHtml(user.displayName || 'Unknown User');
        const username = user.username ? escapeHtml(user.username) : null;
        const photoURL = user.photoURL ? escapeHtml(user.photoURL) : null;
        const bio = user.bio ? escapeHtml(user.bio.substring(0, 30) + (user.bio.length > 30 ? '...' : '')) : null;

        const initials = displayName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2)
            .replace(/[^A-Z0-9]/g, 'U');

        const isAlreadyFriend = friends && friends.some(f => f && f.id === userId);
        const hasPendingRequest = sentRequests && sentRequests.some(r => r && r.receiverId === userId);
        const hasIncomingRequest = friendRequests && friendRequests.some(r => r && r.senderId === userId);

        let avatarHtml = '';
        if (photoURL) {
            avatarHtml = `<div class="user-search-avatar" style="background-image: url('${photoURL}');"></div>`;
        } else {
            avatarHtml = `<div class="user-search-avatar"><span>${initials}</span></div>`;
        }

        let actionsHtml = '';

        if (isAlreadyFriend) {
            actionsHtml = `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${displayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
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
            actionsHtml = `
                <button class="friend-action-btn success" data-action="add" title="Add Friend">
                    <i class="fas fa-user-plus"></i>
                </button>
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${displayName}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
            `;
        }

        const userItem = document.createElement('div');
        userItem.className = 'user-search-item';
        userItem.dataset.userId = userId;

        userItem.innerHTML = `
            ${avatarHtml}
            <div class="user-search-info">
                <div class="user-search-name">
                    ${displayName}
                    <span class="user-search-status ${user.online ? 'online' : 'offline'}"></span>
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
                        navigateToChat(btn.dataset.userId, btn.dataset.userName);
                        break;
                    case 'add':
                        sendFriendRequest(userId);
                        break;
                    case 'more':
                        showFriendOptions(user);
                        break;
                    case 'cancel-request':
                        const sentRequest = sentRequests.find(r => r && r.receiverId === userId);
                        if (sentRequest) cancelFriendRequest(sentRequest);
                        break;
                    case 'accept':
                        const incomingRequest = friendRequests.find(r => r && r.senderId === userId);
                        if (incomingRequest) acceptFriendRequestOnline(incomingRequest.id, userId);
                        break;
                    case 'decline':
                        const declineRequest = friendRequests.find(r => r && r.senderId === userId);
                        if (declineRequest) declineFriendRequest(declineRequest);
                        break;
                }
            });
        });

        return userItem;

    }, null);
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

            let statusClass = 'offline';
            let statusText = 'Offline';

            if (detailedData.online) {
                statusClass = 'online';
                statusText = 'Online now';
            } else if (detailedData.lastSeen) {
                try {
                    const lastSeen = new Date(detailedData.lastSeen);
                    const minutesAgo = Math.floor((Date.now() - lastSeen) / 60000);
                    if (minutesAgo < 5) {
                        statusClass = 'online';
                        statusText = 'Online now';
                    } else if (minutesAgo < 15) {
                        statusClass = 'away';
                        statusText = `Last seen ${minutesAgo} minutes ago`;
                    } else {
                        statusText = `Last seen ${formatTimeAgo(lastSeen)}`;
                    }
                } catch (e) {
                    statusText = 'Offline';
                }
            }

            const lastInteraction = getLastInteraction(friendId);
            if (lastInteraction) statusText = lastInteraction;

            const category = friendshipData?.category || 'friend';
            const categoryInfo = friendCategories[category] || friendCategories.friend;

            const displayName = escapeHtml(detailedData.displayName || 'Unknown User');
            const username = detailedData.username ? escapeHtml(detailedData.username) : 'No username';
            const photoURL = detailedData.photoURL ? escapeHtml(detailedData.photoURL) : null;
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
            if (photoURL) {
                avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${photoURL}');"></div>`;
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
                    <div class="friend-profile-status ${statusClass}">${statusText}</div>
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
                        navigateToChat(this.dataset.userId, this.dataset.userName);
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
                        navigateToCall(this.dataset.userId, this.dataset.userName);
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
                        navigateToChat(this.dataset.userId, this.dataset.userName);
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
                        navigateToChat(this.dataset.userId, this.dataset.userName);
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
        const photoURL = userData.photoURL ? escapeHtml(userData.photoURL) : null;
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

        const isIncoming = requestData.type === 'incoming_request' || requestData.status === 'pending';

        const profileModal = document.createElement('div');
        profileModal.className = 'add-friend-modal active';
        profileModal.id = `requestProfileModal_${Date.now()}`;

        let avatarHtml = '';
        if (photoURL) {
            avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${photoURL}'); width: 100px; height: 100px;"></div>`;
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
                    declineFriendRequest(requestData);
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
                    acceptFriendRequestOnline(requestData.id, userId);
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

export const showFriendOptions = function(friendData) {
    if (!isUIActive()) {
        showNotification('Please wait while module initializes...', 'info');
        return null;
    }
    return ErrorHandler.createBoundary('showFriendOptions', () => {
        if (!friendData || !friendData.id) return;

        const friendId = friendData.id;
        const displayName = escapeHtml(friendData.displayName || 'User');
        const photoURL = friendData.photoURL ? escapeHtml(friendData.photoURL) : null;

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
        if (photoURL) {
            avatarHtml = `<div class="friend-profile-avatar" style="background-image: url('${photoURL}'); width: 80px; height: 80px; margin: 0 auto 15px;"></div>`;
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
                navigateToChat(friendId, displayName);
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
                navigateToCall(friendId, displayName);
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
                allChattableFriends.push({ ...friend, _priority: friend.online ? 2 : 3 });
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
            const photoURL = friend.photoURL ? escapeHtml(friend.photoURL) : null;

            const initials = displayName
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2)
                .replace(/[^A-Z0-9]/g, 'U');

            let avatarHtml = '';
            if (photoURL) {
                avatarHtml = `<div class="friend-avatar" style="background-image: url('${photoURL}');"></div>`;
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
                    <div class="friend-status ${friend.online ? 'online' : 'offline'}"></div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">
                        <span class="friend-name-text">${displayName}</span>
                    </div>
                    <div class="friend-details">
                        ${username ? `<span class="friend-username">${username}</span>` : ''}
                        <span>${friend.online ? 'Online' : 'Offline'}</span>
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
        currentCategoryFilter = category;
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
                navigateToChat(userId, userName);
                break;
            case 'call':
                navigateToCall(userId, userName);
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
    return ErrorHandler.createBoundary('handleRequestAction', () => {
        logUI(`Handling request action: ${action} for ${requestData.id}`);

        switch(action) {
            case 'accept':
                acceptFriendRequestOnline(requestData.id, requestData.senderId);
                break;
            case 'decline':
                declineFriendRequest(requestData);
                break;
            case 'cancel':
                cancelFriendRequest(requestData);
                break;
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

    if (activeTabName === 'username') {
        const usernameInput = document.getElementById('usernameInput');
        const username = usernameInput?.value.trim() || '';

        if (!username) return;
        if (!username.startsWith('@')) return;

        const searchTerm = username.substring(1);
        
        // Use the searchFriends function from core for REAL search
        if (typeof searchFriends === 'function') {
            const users = await searchFriends(searchTerm, { includeUsers: true, limit: 10 });
            const user = users.find(u => u.username === searchTerm);
            
            if (!user) {
                showNotification('User not found', 'error');
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
    }
};

function updateFriendPresence(userId, online, lastSeen) {
    [friends, pinnedFriends, mutedFriends, temporaryFriends].forEach(arr => {
        const friend = arr.find(f => f && f.id === userId);
        if (friend) {
            friend.online = online;
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
            fetchAllUsersFromBackend().then(() => renderAllUsersList());
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
                showNotification('Contacts synced successfully', 'success');
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

    // Scan QR modal button - FIXED
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

    // Close camera button - FIXED
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
                const userName = window.selectedChatFriend.displayName || 'User';
                navigateToChat(userId, userName);
                if (domElements.startChatModal) {
                    domElements.startChatModal.classList.remove('active');
                }
                window.selectedChatFriend = null;
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
            if (!isUIActive()) {
                showNotification('Please wait while module initializes...', 'info');
                return;
            }
            logUI(`Tab clicked: ${tabId}`);

            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.friends-section').forEach(section => section.classList.remove('active'));

            const sectionId = categoryTabs[tabId];
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
                updateCurrentSection();
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

    if (domElements.allUsersSearch) {
        domElements.allUsersSearch.addEventListener('input', debounce(function() {
            if (!isUIActive()) return;
            renderAllUsersList();
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
                    renderAllUsersList();
                }

                if (tabName === 'qr' && featureFlags.qrCode) {
                    if (currentUser?.id) {
                        setTimeout(generateUniqueQRCode, 100);
                    }
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
            }
        });
    });

    logUI('Event binding complete');
}

// =============================================
// [18] INITIALIZATION - STRICT LIFECYCLE COMPLIANCE
// =============================================

function initializeUI() {
    if (_uiInitialized) return;
    _uiInitialized = true;
    
    logUI('Initializing UI...');
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
// Version: 4.1
// ✅ INTEGRATED: Real search with searchFriends from core
// ✅ INTEGRATED: Search by first letter with searchFriendsByLetter
// ✅ FIXED: All users search triggers real backend queries
// ✅ FIXED: QR scan sends real requests through core
// ✅ FIXED: Send friend request uses core's sendFriendRequest
// ✅ FIXED: All imports from friend-core.js complete
// ✅ ADDED: displaySearchResults function for real search results
// ✅ ADDED: Search result event handling from core
// ✅ ADDED: Retry button for failed searches
// ✅ ADDED: Loading states during search
// ✅ ADDED: Duplicate event binding prevention with flags
// ✅ ADDED: RefreshDomElements for reliable element references
// ✅ ADDED: Lifecycle-aware UI initialization
// ✅ PRESERVED: All existing UI features and animations
// ✅ PRESERVED: All category filters and friend lists
// ✅ PRESERVED: Camera and QR code functionality
// =============================================