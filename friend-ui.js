// =============================================
// FRIEND PAGE - UI IMPLEMENTATION v2.0.5
// Fault-Tolerant UI Controller for Embedded Application
// Parent: chat.html | Module: friend.ui.js
// =============================================

// =============================================
// [1] IMPORT VERIFICATION - Strict validation
// All imports verified against friend-core.js exports
// No undefined symbols, no renaming, no duplicates
// =============================================

import {
    // Core State - Verified Exports
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

    // Core Systems - Verified Exports
    ParentCoordinator,
    KnectaAuth,
    MessageBus,
    SessionManager,
    Logger,
    ResourceManager,
    SecurityManager,
    ErrorHandler,
    SafetyGuards,

    // Initialization - Verified Exports
    enhancedInitialize,
    initializeParentChildCommunication,
    loadCachedDataInstantly,
    startParallelDataLoading,
    updateUIWithUserData,
    updateDataSourceIndicator,
    attemptCachedDataFallback,
    initializeMainFunctionality,
    showAuthError,
    hideAuthError,
    showReconnectionState,
    hideReconnectionState,

    // API Functions - Verified Exports
    getValidToken,
    getCurrentUser,
    apiCallWithRetry,

    // Friend Request Management - Verified Exports
    sendFriendRequest,
    acceptFriendRequestOnline,
    declineFriendRequest,
    cancelFriendRequest,

    // Data Loading - Verified Exports
    loadFriendsFromBackend,
    loadFriendRequestsFromBackend,
    loadSentRequestsFromBackend,
    loadPinnedFriendsFromBackend,
    loadMutedFriendsFromBackend,
    loadContactsFromBackend,
    loadGroupsFromBackend,
    fetchAllUsersFromBackend,
    saveFriendsToLocalStorage,

    // Friend Management - Verified Exports
    togglePinFriend,
    toggleMuteFriend,
    savePrivateNote,
    getLastInteraction,
    removeFriend,
    blockUser,

    // QR & Camera - Verified Exports
    startCameraScanner,
    stopCameraScanner,
    toggleCamera,
    toggleFlash,
    generateUniqueQRCode,

    // Mutual Friends - Verified Exports
    showMutualFriends,

    // Navigation & UI - Verified Exports
    showNotification,
    navigateToChat,
    navigateToCall,
    simulateContactSync,

    // Utilities - Verified Exports
    escapeHtml,
    formatTimeAgo,
    formatDate,
    getTrustScoreClass,
    checkMobile

} from './friend-core.js';

// =============================================
// [2] UI STATE MANAGEMENT
// =============================================

export const UIState = {
    // UI Element Cache
    elements: new Map(),
    elementQueries: new Map(),
    
    // View History
    history: {
        stack: [],
        maxSize: 10,
        currentIndex: -1
    },
    
    // Render Cache
    renderCache: new Map(),
    renderTimers: new Map(),
    
    // Restore Points
    restorePoints: new Map(),
    
    // Active State
    activeModals: new Set(),
    activeSection: 'allFriendsSection',
    selectedFriendId: null,
    
    // Performance Metrics
    metrics: {
        lastRender: 0,
        renderCount: 0,
        errorCount: 0,
        fallbackCount: 0
    },
    
    // Cache DOM element with error boundary
    getElement(id) {
        return ErrorHandler.createBoundary(`UIElement:${id}`, () => {
            if (this.elements.has(id)) {
                const cached = this.elements.get(id);
                if (cached && document.body.contains(cached)) {
                    return cached;
                }
            }
            
            const element = SafetyGuards.safeGetElement(id);
            if (element) {
                this.elements.set(id, element);
            }
            return element;
        }, null);
    },
    
    // Query selector with cache
    querySelector(selector, parent = document) {
        const key = `${parent === document ? 'document' : parent.id || 'unknown'}:${selector}`;
        
        return ErrorHandler.createBoundary(`UIQuery:${key}`, () => {
            if (this.elementQueries.has(key)) {
                const cached = this.elementQueries.get(key);
                if (cached && document.body.contains(cached)) {
                    return cached;
                }
            }
            
            const element = parent.querySelector(selector);
            if (element) {
                this.elementQueries.set(key, element);
            }
            return element;
        }, null);
    },
    
    // Push view to history
    pushView(sectionId, params = {}) {
        this.history.stack.push({
            sectionId,
            params,
            timestamp: Date.now(),
            scrollPosition: window.scrollY
        });
        
        if (this.history.stack.length > this.history.maxSize) {
            this.history.stack.shift();
        }
        
        this.history.currentIndex = this.history.stack.length - 1;
    },
    
    // Pop view from history
    popView() {
        if (this.history.stack.length > 1) {
            this.history.stack.pop();
            this.history.currentIndex = this.history.stack.length - 1;
            return this.history.stack[this.history.currentIndex];
        }
        return null;
    },
    
    // Create restore point
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
    
    // Restore from point
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
    
    // Clear expired cache
    clearExpiredCache() {
        const now = Date.now();
        
        this.renderTimers.forEach((timestamp, key) => {
            if (now - timestamp > 300000) {
                this.renderCache.delete(key);
                this.renderTimers.delete(key);
            }
        });
    }
};

// =============================================
// [3] UI ERROR BOUNDARIES
// =============================================

export const UIBoundaries = {
    // Render section with error boundary
    renderSection(sectionId, renderFn, fallbackFn = null) {
        return ErrorHandler.createBoundary(`Section:${sectionId}`, () => {
            const startTime = performance.now();
            
            try {
                const result = renderFn();
                
                UIState.metrics.lastRender = performance.now() - startTime;
                UIState.metrics.renderCount++;
                
                return result;
            } catch (error) {
                UIState.metrics.errorCount++;
                
                Logger.error('UIBoundary', `Section ${sectionId} render failed`, error);
                
                if (fallbackFn) {
                    return fallbackFn();
                }
                
                const container = UIState.getElement(sectionId);
                if (container) {
                    container.innerHTML = this.createSectionFallback(sectionId);
                }
                
                return null;
            }
        }, null);
    },
    
    // Create section fallback UI
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
    
    // Create modal fallback
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
    }
};

// =============================================
// [4] UI ELEMENT REFERENCES
// =============================================

// Main containers
const friendDetailsPanel = UIState.getElement('friendDetailsPanel');
const addFriendModal = UIState.getElement('addFriendModal');
const friendRequestModal = UIState.getElement('friendRequestModal');
const startChatModal = UIState.getElement('startChatModal');
const mutualFriendsModal = UIState.getElement('mutualFriendsModal');
const cameraScannerModal = UIState.getElement('cameraScannerModal');
const notification = UIState.getElement('notification');

// Section containers
const allFriendsSection = UIState.getElement('allFriendsSection');
const contactsSection = UIState.getElement('contactsSection');
const friendsSection = UIState.getElement('friendsSection');
const requestsSection = UIState.getElement('requestsSection');
const temporarySection = UIState.getElement('temporarySection');
const pinnedSection = UIState.getElement('pinnedSection');
const mutedSection = UIState.getElement('mutedSection');

// List containers
const allFriendsList = UIState.getElement('allFriendsList');
const contactsList = UIState.getElement('contactsList');
const friendsList = UIState.getElement('friendsList');
const requestsList = UIState.getElement('requestsList');
const sentRequestsList = UIState.getElement('sentRequestsList');
const temporaryList = UIState.getElement('temporaryList');
const pinnedList = UIState.getElement('pinnedList');
const mutedList = UIState.getElement('mutedList');

// =============================================
// [5] RENDERING PIPELINE
// =============================================

export const RenderPipeline = {
    // Pipeline status
    status: {
        skeleton: false,
        initialRender: false,
        progressive: false,
        liveUpdate: false,
        ready: false
    },
    
    // Render queues
    queue: [],
    processing: false,
    
    // Initialize rendering pipeline
    init() {
        this.renderSkeleton();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.renderInitial());
        } else {
            this.renderInitial();
        }
        
        window.addEventListener('friendCoreReady', () => this.renderProgressive());
        
        window.addEventListener('userDataLoaded', () => {
            setTimeout(() => this.enableLiveUpdates(), 500);
        });
    },
    
    // Stage 1: Render skeleton - NEVER BLANK
    renderSkeleton() {
        UIBoundaries.renderSection('allFriendsSection', () => {
            if (allFriendsList && allFriendsList.children.length === 0) {
                allFriendsList.innerHTML = this.createSkeletonLoader('friends', 8);
            }
        });
        
        UIBoundaries.renderSection('friendsSection', () => {
            if (friendsList && friendsList.children.length === 0) {
                friendsList.innerHTML = this.createSkeletonLoader('friends', 5);
            }
        });
        
        UIBoundaries.renderSection('requestsSection', () => {
            if (requestsList && requestsList.children.length === 0) {
                requestsList.innerHTML = this.createSkeletonLoader('requests', 3);
            }
        });
        
        this.status.skeleton = true;
        Logger.info('RenderPipeline', 'Skeleton rendered');
    },
    
    // Create skeleton loader
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
    
    // Stage 2: Initial render - cached data
    renderInitial() {
        UIBoundaries.renderSection('allFriendsSection', () => {
            this.renderFriendsListInstantly();
            this.status.initialRender = true;
        }, () => {
            if (allFriendsList) {
                allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
            }
        });
        
        Logger.info('RenderPipeline', 'Initial render complete');
    },
    
    // Stage 3: Progressive enhancement - full features
    renderProgressive() {
        if (this.status.progressive) return;
        
        UIBoundaries.renderSection('allFriendsSection', () => {
            if (apiReady && cacheLoaded) {
                updateCurrentSection();
                this.status.progressive = true;
            }
        });
        
        Logger.info('RenderPipeline', 'Progressive enhancement complete');
    },
    
    // Stage 4: Live updates - real-time data
    enableLiveUpdates() {
        if (this.status.liveUpdate) return;
        
        this.setupLiveUpdateListeners();
        
        this.status.liveUpdate = true;
        this.status.ready = true;
        
        Logger.info('RenderPipeline', 'Live updates enabled');
    },
    
    // Setup live update listeners
    setupLiveUpdateListeners() {
        window.addEventListener('friendsUpdated', () => {
            this.queueRender('friends', debounce(() => {
                if (UIState.activeSection === 'friendsSection') {
                    renderFriends();
                }
            }, 300));
        });
        
        window.addEventListener('requestsUpdated', () => {
            this.queueRender('requests', debounce(() => {
                if (UIState.activeSection === 'requestsSection') {
                    renderFriendRequests();
                    renderSentRequests();
                }
            }, 300));
        });
        
        window.addEventListener('contactsUpdated', () => {
            this.queueRender('contacts', debounce(() => {
                if (UIState.activeSection === 'contactsSection') {
                    renderContacts();
                }
            }, 300));
        });
        
        this.processQueue();
    },
    
    // Queue render operation
    queueRender(key, renderFn) {
        this.queue.push({ key, renderFn, timestamp: Date.now() });
        
        if (!this.processing) {
            this.processQueue();
        }
    },
    
    // Process render queue with debounce
    processQueue() {
        this.processing = true;
        
        const process = () => {
            if (this.queue.length === 0) {
                this.processing = false;
                return;
            }
            
            const grouped = {};
            this.queue.forEach(item => {
                grouped[item.key] = item;
            });
            
            this.queue = [];
            
            Object.values(grouped).forEach(item => {
                try {
                    item.renderFn();
                } catch (error) {
                    Logger.error('RenderQueue', `Failed to render ${item.key}`, error);
                }
            });
            
            setTimeout(process, 100);
        };
        
        setTimeout(process, 50);
    },
    
    // Quick render with limited items
    renderFriendsListInstantly() {
        return ErrorHandler.createBoundary('renderFriendsListInstantly', () => {
            if (!allFriendsList) return;
            
            allFriendsList.innerHTML = '';
            
            const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
            const friendArray = Array.isArray(friends) ? friends : [];
            const contactArray = Array.isArray(contacts) ? contacts : [];
            
            const allToDisplay = [
                ...pinnedArray,
                ...friendArray,
                ...contactArray
            ].slice(0, 25);
            
            if (allToDisplay.length === 0) {
                allFriendsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-user-friends"></i>
                        <p>No friends yet</p>
                        <p class="subtext">Add friends to start connecting</p>
                    </div>
                `;
                return;
            }
            
            const fragment = document.createDocumentFragment();
            
            allToDisplay.forEach(item => {
                const friendElement = createFriendItemElement(item, 
                    pinnedArray.some(f => f && f.id === item.id) ? 'pinned' : 
                    friendArray.some(f => f && f.id === item.id) ? 'friend' : 'contact',
                    true
                );
                
                if (friendElement) {
                    fragment.appendChild(friendElement);
                }
            });
            
            allFriendsList.appendChild(fragment);
            allFriendsList.classList.add('instant-load');
            
        }, () => {
            if (allFriendsList) {
                allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
            }
        });
    }
};

// =============================================
// [6] CORE INTEGRATION BRIDGE
// =============================================

export const CoreIntegration = {
    // Subscribed events
    subscriptions: new Set(),
    
    // Initialize bridge
    init() {
        this.subscribeToCoreEvents();
        this.setupDataValidation();
    },
    
    // Subscribe to core events with validation
    subscribeToCoreEvents() {
        this.subscribe('friendCoreReady', (event) => {
            const data = this.validateEventData(event);
            if (!data) return;
            
            Logger.info('CoreBridge', 'Friend core ready', { 
                fallbackMode: data.fallbackMode,
                sessionValid: data.sessionValid 
            });
            
            RenderPipeline.renderProgressive();
        });
        
        this.subscribe('parentSessionReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.session) return;
            
            Logger.info('CoreBridge', 'Parent session ready');
            
            if (data.session.user) {
                updateUIWithUserData(data.session.user);
            }
            
            hideAuthError();
            hideReconnectionState();
            updateCurrentSection();
        });
        
        this.subscribe('parentSessionUpdated', (event) => {
            const data = this.validateEventData(event);
            if (!data?.session) return;
            
            Logger.info('CoreBridge', 'Parent session updated');
            
            if (data.session.user) {
                updateUIWithUserData(data.session.user);
            }
        });
        
        this.subscribe('parentSessionLogout', (event) => {
            Logger.info('CoreBridge', 'Parent session logout');
            
            showAuthError('You have been logged out');
            
            updateCurrentSection();
        });
        
        this.subscribe('userDataLoaded', (event) => {
            const data = this.validateEventData(event);
            if (!data?.userData) return;
            
            Logger.info('CoreBridge', 'User data loaded', { source: data.source });
            
            if (featureFlags.qrCode && data.userData.id) {
                setTimeout(generateUniqueQRCode, 300);
            }
            
            updateFriendCounts();
        });
        
        this.subscribe('knectaAuthReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.user) return;
            
            Logger.info('CoreBridge', 'Auth ready');
            
            if (isInitialized) {
                updateCurrentSection();
            }
        });
        
        this.subscribe('knectaCacheReady', (event) => {
            const data = this.validateEventData(event);
            if (!data?.user) return;
            
            Logger.info('CoreBridge', 'Cache ready');
        });
        
        this.subscribe('knectaTokenExpired', () => {
            Logger.warn('CoreBridge', 'Token expired');
            showAuthError('Your session has expired. Please log in again.');
        });
        
        this.subscribe('knectaAuthError', () => {
            Logger.warn('CoreBridge', 'Auth error');
            showAuthError('Authentication error. Please try again.');
        });
        
        this.subscribe('friendCoreFallback', () => {
            Logger.warn('CoreBridge', 'Fallback mode activated');
            
            if (!currentUser) {
                attemptCachedDataFallback();
            }
        });
        
        this.subscribe('friendsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.friends) {
                updateFriendCounts();
                
                if (UIState.activeSection === 'friendsSection') {
                    renderFriends();
                }
            }
        });
        
        this.subscribe('requestsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.requests) {
                updateFriendCounts();
                
                if (UIState.activeSection === 'requestsSection') {
                    renderFriendRequests();
                }
            }
        });
        
        this.subscribe('sentRequestsUpdated', (event) => {
            const data = this.validateEventData(event);
            if (data?.requests) {
                if (UIState.activeSection === 'requestsSection') {
                    renderSentRequests();
                }
            }
        });
    },
    
    // Subscribe to event with validation
    subscribe(eventName, handler) {
        const wrappedHandler = (event) => {
            try {
                handler(event);
            } catch (error) {
                Logger.error('CoreBridge', `Error in ${eventName} handler`, error);
            }
        };
        
        window.addEventListener(eventName, wrappedHandler);
        this.subscriptions.add({ eventName, handler: wrappedHandler });
        
        return this;
    },
    
    // Validate event data - reject malformed payloads
    validateEventData(event) {
        if (!event || typeof event !== 'object') {
            Logger.warn('CoreBridge', 'Invalid event object');
            return null;
        }
        
        if (!event.detail || typeof event.detail !== 'object') {
            return null;
        }
        
        return SecurityManager.sanitizeMessage(event.detail);
    },
    
    // Setup data validation
    setupDataValidation() {
        // Empty function for compatibility
    },
    
    // Clean up subscriptions
    destroy() {
        this.subscriptions.forEach(({ eventName, handler }) => {
            window.removeEventListener(eventName, handler);
        });
        
        this.subscriptions.clear();
        Logger.info('CoreBridge', 'All subscriptions cleared');
    }
};

// =============================================
// [7] EVENT SYSTEM
// =============================================

export const UIEventSystem = {
    // Registered listeners
    listeners: new Map(),
    
    // Debounce timers
    debounceTimers: new Map(),
    
    // Throttle flags
    throttleFlags: new Map(),
    
    // Initialize event system
    init() {
        this.setupGlobalListeners();
        this.setupModalListeners();
        this.setupActionListeners();
        this.setupNavigationListeners();
        this.setupFilterListeners();
        this.setupFormListeners();
        this.setupResizeListener();
        
        Logger.info('UIEventSystem', 'Event system initialized');
    },
    
    // Register listener with automatic cleanup
    register(target, type, handler, options = {}) {
        if (!target || typeof target.addEventListener !== 'function') {
            Logger.warn('UIEventSystem', 'Invalid target for event listener');
            return null;
        }
        
        const { debounce = 0, throttle = 0, once = false } = options;
        
        let wrappedHandler = handler;
        
        if (debounce > 0) {
            wrappedHandler = this.debounce(handler, debounce, `${target.id || 'unknown'}:${type}`);
        }
        
        if (throttle > 0) {
            wrappedHandler = this.throttle(handler, throttle, `${target.id || 'unknown'}:${type}`);
        }
        
        if (once) {
            const originalHandler = wrappedHandler;
            wrappedHandler = (e) => {
                originalHandler(e);
                target.removeEventListener(type, wrappedHandler);
            };
        }
        
        target.addEventListener(type, wrappedHandler, options.passive ? { passive: true } : false);
        
        const key = Symbol('listener');
        this.listeners.set(key, { target, type, handler: wrappedHandler, options });
        
        return key;
    },
    
    // Register multiple listeners at once
    registerMany(listeners) {
        const keys = [];
        
        listeners.forEach(listener => {
            const key = this.register(
                listener.target,
                listener.type,
                listener.handler,
                listener.options || {}
            );
            
            if (key) keys.push(key);
        });
        
        return keys;
    },
    
    // Debounce helper
    debounce(fn, delay, id) {
        return (...args) => {
            if (this.debounceTimers.has(id)) {
                clearTimeout(this.debounceTimers.get(id));
            }
            
            const timer = setTimeout(() => {
                fn.apply(this, args);
                this.debounceTimers.delete(id);
            }, delay);
            
            this.debounceTimers.set(id, timer);
        };
    },
    
    // Throttle helper
    throttle(fn, limit, id) {
        return (...args) => {
            if (!this.throttleFlags.has(id)) {
                fn.apply(this, args);
                this.throttleFlags.set(id, true);
                
                setTimeout(() => {
                    this.throttleFlags.delete(id);
                }, limit);
            }
        };
    },
    
    // Setup global document/window listeners
    setupGlobalListeners() {
        this.register(window, 'resize', () => {
            checkMobile();
            
            if (isMobile && friendDetailsPanel?.classList.contains('active')) {
                document.body.classList.add('mobile-details-open');
            } else {
                document.body.classList.remove('mobile-details-open');
            }
        }, { throttle: 200, passive: true });
        
        this.register(window, 'beforeunload', () => {
            saveFriendsToLocalStorage();
            stopCameraScanner();
            
            if (backgroundSyncInterval) {
                clearInterval(backgroundSyncInterval);
            }
        }, { once: false });
        
        this.register(document, 'click', (e) => {
            document.querySelectorAll('.add-friend-modal.active').forEach(modal => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    UIState.activeModals.delete(modal.id);
                }
            });
        });
        
        this.register(document, 'keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.add-friend-modal.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                    UIState.activeModals.delete(activeModal.id);
                    e.preventDefault();
                }
                
                if (isMobile && friendDetailsPanel?.classList.contains('active')) {
                    friendDetailsPanel.classList.remove('active');
                    UIState.selectedFriendId = null;
                    e.preventDefault();
                }
            }
        });
        
        if ('ontouchstart' in window) {
            this.register(document, 'touchstart', () => {}, { passive: true });
        }
    },
    
    // Setup modal event listeners
    setupModalListeners() {
        const modalListeners = [
            {
                target: UIState.getElement('closeAddFriendModal'),
                type: 'click',
                handler: () => {
                    addFriendModal?.classList.remove('active');
                    UIState.activeModals.delete('addFriendModal');
                }
            },
            {
                target: UIState.getElement('cancelAddFriendBtn'),
                type: 'click',
                handler: () => {
                    addFriendModal?.classList.remove('active');
                    UIState.activeModals.delete('addFriendModal');
                }
            },
            {
                target: UIState.getElement('addFriendBtn'),
                type: 'click',
                handler: () => {
                    addFriendModal?.classList.add('active');
                    UIState.activeModals.add('addFriendModal');
                    
                    const methodsTab = UIState.querySelector('.add-friend-tab[data-tab="methods"]');
                    if (methodsTab) methodsTab.click();
                }
            },
            {
                target: UIState.getElement('closeFriendRequestModal'),
                type: 'click',
                handler: () => {
                    friendRequestModal?.classList.remove('active');
                    UIState.activeModals.delete('friendRequestModal');
                }
            },
            {
                target: UIState.getElement('closeStartChatModal'),
                type: 'click',
                handler: () => {
                    startChatModal?.classList.remove('active');
                    UIState.activeModals.delete('startChatModal');
                    window.selectedChatFriend = null;
                }
            },
            {
                target: UIState.getElement('cancelStartChatBtn'),
                type: 'click',
                handler: () => {
                    startChatModal?.classList.remove('active');
                    UIState.activeModals.delete('startChatModal');
                    window.selectedChatFriend = null;
                }
            },
            {
                target: UIState.getElement('startNewChatBtn'),
                type: 'click',
                handler: () => {
                    showStartChatModal();
                }
            },
            {
                target: UIState.getElement('closeMutualFriendsModal'),
                type: 'click',
                handler: () => {
                    mutualFriendsModal?.classList.remove('active');
                    UIState.activeModals.delete('mutualFriendsModal');
                }
            },
            {
                target: UIState.getElement('closeCameraBtn'),
                type: 'click',
                handler: () => {
                    stopCameraScanner();
                    cameraScannerModal?.classList.remove('active');
                    UIState.activeModals.delete('cameraScannerModal');
                }
            },
            {
                target: UIState.getElement('backBtn'),
                type: 'click',
                handler: () => {
                    friendDetailsPanel?.classList.remove('active');
                    UIState.selectedFriendId = null;
                    
                    const previousView = UIState.popView();
                    if (previousView) {
                        const section = UIState.getElement(previousView.sectionId);
                        if (section) {
                            document.querySelectorAll('.friends-section').forEach(s => s.classList.remove('active'));
                            section.classList.add('active');
                            UIState.activeSection = previousView.sectionId;
                        }
                    }
                }
            }
        ];
        
        this.registerMany(modalListeners);
    },
    
    // Setup action button listeners
    setupActionListeners() {
        const actionListeners = [
            {
                target: UIState.getElement('syncContactsBtn'),
                type: 'click',
                handler: async () => {
                    if (!featureFlags.contactsSync) {
                        showNotification('Contact sync is currently unavailable', 'warning');
                        return;
                    }
                    
                    const btn = UIState.getElement('syncContactsBtn');
                    const originalHtml = btn?.innerHTML;
                    
                    if (btn) {
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
                        btn.disabled = true;
                    }
                    
                    try {
                        await simulateContactSync();
                        await loadContactsFromBackend();
                        renderContacts();
                        showNotification('Contacts synced successfully', 'success');
                    } catch (error) {
                        Logger.error('UI', 'Contact sync failed', error);
                        showNotification('Failed to sync contacts', 'error');
                    } finally {
                        if (btn) {
                            btn.innerHTML = originalHtml || '<i class="fas fa-sync-alt"></i> Sync Contacts';
                            btn.disabled = false;
                        }
                    }
                }
            },
            {
                target: UIState.getElement('scanQRBtn'),
                type: 'click',
                handler: () => {
                    if (!featureFlags.qrCode || !featureFlags.camera) {
                        showNotification('QR code scanning is currently unavailable', 'warning');
                        return;
                    }
                    
                    addFriendModal?.classList.add('active');
                    UIState.activeModals.add('addFriendModal');
                    
                    const qrTab = UIState.querySelector('.add-friend-tab[data-tab="qr"]');
                    if (qrTab) qrTab.click();
                }
            },
            {
                target: UIState.getElement('scanQRBtnModal'),
                type: 'click',
                handler: () => {
                    if (!featureFlags.qrCode || !featureFlags.camera) {
                        showNotification('QR code scanning is currently unavailable', 'warning');
                        return;
                    }
                    
                    cameraScannerModal?.classList.add('active');
                    UIState.activeModals.add('cameraScannerModal');
                    startCameraScanner();
                }
            },
            {
                target: UIState.getElement('discoverBtn'),
                type: 'click',
                handler: () => {
                    if (!featureFlags.discovery) {
                        showNotification('User discovery is currently unavailable', 'warning');
                        return;
                    }
                    
                    addFriendModal?.classList.add('active');
                    UIState.activeModals.add('addFriendModal');
                    
                    const allUsersTab = UIState.querySelector('.add-friend-tab[data-tab="all-users"]');
                    if (allUsersTab) {
                        allUsersTab.click();
                        setTimeout(() => renderAllUsersList(), 50);
                    }
                }
            },
            {
                target: UIState.getElement('toggleCameraBtn'),
                type: 'click',
                handler: toggleCamera
            },
            {
                target: UIState.getElement('toggleFlashBtn'),
                type: 'click',
                handler: toggleFlash
            },
            {
                target: UIState.getElement('confirmStartChatBtn'),
                type: 'click',
                handler: () => {
                    if (window.selectedChatFriend) {
                        const userId = window.selectedChatFriend.id;
                        const userName = window.selectedChatFriend.displayName || 'User';
                        navigateToChat(userId, userName);
                        startChatModal?.classList.remove('active');
                        UIState.activeModals.delete('startChatModal');
                        window.selectedChatFriend = null;
                    }
                }
            },
            {
                target: UIState.getElement('sendFriendRequestBtn'),
                type: 'click',
                handler: handleSendFriendRequest
            },
            {
                target: UIState.getElement('declineRequestBtn'),
                type: 'click',
                handler: () => {
                    friendRequestModal?.classList.remove('active');
                    UIState.activeModals.delete('friendRequestModal');
                    showNotification('Friend request declined', 'info');
                }
            },
            {
                target: UIState.getElement('acceptRequestBtn'),
                type: 'click',
                handler: async function() {
                    const userId = this.dataset.userId;
                    const qrData = this.dataset.qrData ? JSON.parse(this.dataset.qrData) : null;
                    
                    if (qrData && qrData.userId) {
                        await sendFriendRequest(qrData.userId);
                        friendRequestModal?.classList.remove('active');
                        UIState.activeModals.delete('friendRequestModal');
                    } else if (userId) {
                        await acceptFriendRequestOnline(null, userId);
                        friendRequestModal?.classList.remove('active');
                        UIState.activeModals.delete('friendRequestModal');
                    }
                }
            },
            {
                target: UIState.getElement('redirectToLoginBtn'),
                type: 'click',
                handler: () => {
                    if (ParentCoordinator?.state.parentDetected) {
                        ParentCoordinator.sendToParent({
                            type: 'REDIRECT_TO_LOGIN',
                            source: 'friend.html',
                            timestamp: Date.now()
                        });
                    } else {
                        window.location.href = '/index.html';
                    }
                }
            },
            {
                target: UIState.getElement('retryAuthBtn'),
                type: 'click',
                handler: () => {
                    hideAuthError();
                    
                    if (ParentCoordinator?.state.parentDetected) {
                        ParentCoordinator.attemptParentReconnection();
                    } else {
                        enhancedInitialize();
                    }
                }
            }
        ];
        
        this.registerMany(actionListeners);
    },
    
    // Setup navigation listeners (category tabs)
    setupNavigationListeners() {
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
            const tab = UIState.getElement(tabId);
            if (!tab) return;
            
            this.register(tab, 'click', function() {
                document.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                document.querySelectorAll('.friends-section').forEach(section => {
                    section.classList.remove('active');
                });
                
                const sectionId = categoryTabs[tabId];
                const section = UIState.getElement(sectionId);
                if (section) {
                    section.classList.add('active');
                    UIState.activeSection = sectionId;
                    
                    UIState.pushView(sectionId);
                    
                    updateCurrentSection();
                }
            });
        });
    },
    
    // Setup filter listeners
    setupFilterListeners() {
        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            this.register(btn, 'click', function() {
                const category = this.dataset.category;
                filterFriendsByCategory(category);
            });
        });
        
        const friendSearch = UIState.getElement('friendSearch');
        if (friendSearch) {
            this.register(friendSearch, 'input', function() {
                searchFriends(this.value);
            }, { debounce: 300 });
        }
        
        const allUsersSearch = UIState.getElement('allUsersSearch');
        if (allUsersSearch) {
            this.register(allUsersSearch, 'input', function() {
                renderAllUsersList();
            }, { debounce: 300 });
        }
        
        const searchChatUser = UIState.getElement('searchChatUser');
        if (searchChatUser) {
            this.register(searchChatUser, 'input', function() {
                searchChatFriends(this.value);
            }, { debounce: 200 });
        }
    },
    
    // Setup form listeners
    setupFormListeners() {
        document.querySelectorAll('.add-friend-tab').forEach(tab => {
            this.register(tab, 'click', function() {
                const tabName = this.dataset.tab;
                
                document.querySelectorAll('.add-friend-tab').forEach(t => {
                    t.classList.remove('active');
                });
                this.classList.add('active');
                
                document.querySelectorAll('.add-friend-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                const tabContent = UIState.getElement(`${tabName}Tab`);
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
    },
    
    // Setup resize listener
    setupResizeListener() {
        this.register(window, 'resize', () => {
            checkMobile();
            
            if (isMobile && friendDetailsPanel?.classList.contains('active')) {
                friendDetailsPanel.style.width = '100%';
                friendDetailsPanel.style.left = '0';
            } else if (friendDetailsPanel) {
                friendDetailsPanel.style.width = '';
                friendDetailsPanel.style.left = '';
            }
        }, { throttle: 200, passive: true });
    },
    
    // Clean up all listeners
    destroy() {
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        this.throttleFlags.clear();
        
        this.listeners.forEach(({ target, type, handler }) => {
            target.removeEventListener(type, handler);
        });
        
        this.listeners.clear();
        Logger.info('UIEventSystem', 'All listeners cleaned up');
    }
};

// =============================================
// [8] UI RENDERING FUNCTIONS
// =============================================

export function updateFriendCounts() {
    return ErrorHandler.createBoundary('updateFriendCounts', () => {
        const totalFriendsElement = UIState.getElement('totalFriends');
        const onlineFriendsElement = UIState.getElement('onlineFriends');
        const pinnedFriendsElement = UIState.getElement('pinnedFriends');
        const friendsCountElement = UIState.getElement('friendsCount');
        const contactsCountElement = UIState.getElement('contactsCount');
        const requestsCountElement = UIState.getElement('requestsCount');
        const requestsSectionCountElement = UIState.getElement('requestsSectionCount');
        const sentRequestsCountElement = UIState.getElement('sentRequestsCount');
        const pinnedCountElement = UIState.getElement('pinnedCount');
        const mutedCountElement = UIState.getElement('mutedCount');
        
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
}

export function updateCurrentSection() {
    return ErrorHandler.createBoundary('updateCurrentSection', () => {
        updateFriendCounts();
        
        const activeSection = UIState.querySelector('.friends-section.active');
        if (activeSection) {
            const sectionId = activeSection.id;
            UIState.activeSection = sectionId;
            
            switch(sectionId) {
                case 'allFriendsSection':
                    renderAllFriendsList();
                    break;
                case 'contactsSection':
                    renderContacts();
                    break;
                case 'friendsSection':
                    renderFriends();
                    break;
                case 'requestsSection':
                    renderFriendRequests();
                    renderSentRequests();
                    break;
                case 'temporarySection':
                    renderTemporaryFriends();
                    break;
                case 'pinnedSection':
                    renderPinnedFriends();
                    break;
                case 'mutedSection':
                    renderMutedFriends();
                    break;
                default:
                    Logger.debug('UI', `Unknown section: ${sectionId}`);
            }
        }
    }, null);
}

export function renderAllFriendsList() {
    return ErrorHandler.createBoundary('renderAllFriendsList', () => {
        if (!allFriendsList) return;
        
        allFriendsList.innerHTML = '';
        
        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        const friendArray = Array.isArray(friends) ? friends : [];
        const contactArray = Array.isArray(contacts) ? contacts : [];
        const temporaryArray = Array.isArray(temporaryFriends) ? temporaryFriends : [];
        
        const allToDisplay = [
            ...pinnedArray,
            ...friendArray,
            ...contactArray,
            ...temporaryArray
        ];
        
        const uniqueMap = new Map();
        allToDisplay.forEach(item => {
            if (item && item.id) {
                uniqueMap.set(item.id, item);
            }
        });
        
        const uniqueItems = Array.from(uniqueMap.values());
        
        if (uniqueItems.length === 0) {
            allFriendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No friends yet</p>
                    <p class="subtext">Add friends to start connecting</p>
                    <button class="action-btn primary" id="emptyStateAddFriendBtn" style="margin-top: 15px;">
                        <i class="fas fa-user-plus"></i> Add Friend
                    </button>
                </div>
            `;
            
            const emptyBtn = UIState.getElement('emptyStateAddFriendBtn');
            if (emptyBtn) {
                emptyBtn.addEventListener('click', () => {
                    addFriendModal?.classList.add('active');
                    UIState.activeModals.add('addFriendModal');
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
            if (friendElement) {
                fragment.appendChild(friendElement);
            }
        });
        
        allFriendsList.appendChild(fragment);
        allFriendsList.classList.add('rendered');
        
    }, () => {
        if (allFriendsList) {
            allFriendsList.innerHTML = UIBoundaries.createSectionFallback('allFriendsSection');
        }
    });
}

export function renderContacts() {
    return ErrorHandler.createBoundary('renderContacts', () => {
        if (!contactsList) return;
        
        contactsList.innerHTML = '';
        
        const contactArray = Array.isArray(contacts) ? contacts : [];
        
        if (contactArray.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-address-book"></i>
                    <p>No contacts found</p>
                    <p class="subtext">Sync your phone contacts to find friends</p>
                    <button class="action-btn primary" id="contactsSyncBtn" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Sync Contacts
                    </button>
                </div>
            `;
            
            const syncBtn = UIState.getElement('contactsSyncBtn');
            if (syncBtn) {
                syncBtn.addEventListener('click', async () => {
                    if (!featureFlags.contactsSync) {
                        showNotification('Contact sync is currently unavailable', 'warning');
                        return;
                    }
                    
                    syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
                    syncBtn.disabled = true;
                    
                    try {
                        await simulateContactSync();
                        await loadContactsFromBackend();
                        showNotification('Contacts synced successfully', 'success');
                    } catch (error) {
                        showNotification('Failed to sync contacts', 'error');
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
            if (contactElement) {
                fragment.appendChild(contactElement);
            }
        });
        
        contactsList.appendChild(fragment);
        
    }, () => {
        if (contactsList) {
            contactsList.innerHTML = UIBoundaries.createSectionFallback('contactsSection');
        }
    });
}

export function renderFriends() {
    return ErrorHandler.createBoundary('renderFriends', () => {
        if (!friendsList) return;
        
        friendsList.innerHTML = '';
        
        const friendArray = Array.isArray(friends) ? friends : [];
        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        
        if (friendArray.length === 0) {
            friendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No friends yet</p>
                    <p class="subtext">Add friends to start connecting</p>
                    <button class="action-btn primary" id="friendsEmptyAddBtn" style="margin-top: 15px;">
                        <i class="fas fa-user-plus"></i> Add Friend
                    </button>
                </div>
            `;
            
            const addBtn = UIState.getElement('friendsEmptyAddBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    addFriendModal?.classList.add('active');
                    UIState.activeModals.add('addFriendModal');
                });
            }
            
            return;
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
            if (friendElement) {
                fragment.appendChild(friendElement);
            }
        });
        
        friendsList.appendChild(fragment);
        
    }, () => {
        if (friendsList) {
            friendsList.innerHTML = UIBoundaries.createSectionFallback('friendsSection');
        }
    });
}

export function renderFriendRequests() {
    return ErrorHandler.createBoundary('renderFriendRequests', () => {
        if (!requestsList) return;
        
        requestsList.innerHTML = '';
        
        const requestArray = Array.isArray(friendRequests) ? friendRequests : [];
        
        if (requestArray.length === 0) {
            requestsList.innerHTML = `
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
            if (requestElement) {
                fragment.appendChild(requestElement);
            }
        });
        
        requestsList.appendChild(fragment);
        
    }, () => {
        if (requestsList) {
            requestsList.innerHTML = UIBoundaries.createSectionFallback('requestsSection');
        }
    });
}

export function renderSentRequests() {
    return ErrorHandler.createBoundary('renderSentRequests', () => {
        if (!sentRequestsList) return;
        
        sentRequestsList.innerHTML = '';
        
        const sentArray = Array.isArray(sentRequests) ? sentRequests : [];
        
        if (sentArray.length === 0) {
            sentRequestsList.innerHTML = `
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
            if (requestElement) {
                fragment.appendChild(requestElement);
            }
        });
        
        sentRequestsList.appendChild(fragment);
        
    }, () => {
        if (sentRequestsList) {
            sentRequestsList.innerHTML = UIBoundaries.createSectionFallback('requestsSection');
        }
    });
}

export function renderTemporaryFriends() {
    return ErrorHandler.createBoundary('renderTemporaryFriends', () => {
        if (!temporaryList) return;
        
        temporaryList.innerHTML = '';
        
        const temporaryArray = Array.isArray(temporaryFriends) ? temporaryFriends : [];
        
        if (temporaryArray.length === 0) {
            temporaryList.innerHTML = `
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
            if (friendElement) {
                fragment.appendChild(friendElement);
            }
        });
        
        temporaryList.appendChild(fragment);
        
    }, () => {
        if (temporaryList) {
            temporaryList.innerHTML = UIBoundaries.createSectionFallback('temporarySection');
        }
    });
}

export function renderPinnedFriends() {
    return ErrorHandler.createBoundary('renderPinnedFriends', () => {
        if (!pinnedList) return;
        
        pinnedList.innerHTML = '';
        
        const pinnedArray = Array.isArray(pinnedFriends) ? pinnedFriends : [];
        
        if (pinnedArray.length === 0) {
            pinnedList.innerHTML = `
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
            if (friendElement) {
                fragment.appendChild(friendElement);
            }
        });
        
        pinnedList.appendChild(fragment);
        
    }, () => {
        if (pinnedList) {
            pinnedList.innerHTML = UIBoundaries.createSectionFallback('pinnedSection');
        }
    });
}

export function renderMutedFriends() {
    return ErrorHandler.createBoundary('renderMutedFriends', () => {
        if (!mutedList) return;
        
        mutedList.innerHTML = '';
        
        const mutedArray = Array.isArray(mutedFriends) ? mutedFriends : [];
        
        if (mutedArray.length === 0) {
            mutedList.innerHTML = `
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
            if (friendElement) {
                fragment.appendChild(friendElement);
            }
        });
        
        mutedList.appendChild(fragment);
        
    }, () => {
        if (mutedList) {
            mutedList.innerHTML = UIBoundaries.createSectionFallback('mutedSection');
        }
    });
}

export function renderAllUsersList() {
    return ErrorHandler.createBoundary('renderAllUsersList', () => {
        const allUsersListElement = UIState.getElement('allUsersList');
        const allUsersStatusElement = UIState.getElement('allUsersStatus');
        const allUsersSearchElement = UIState.getElement('allUsersSearch');
        
        if (!allUsersListElement) return;
        
        const searchTerm = allUsersSearchElement ? allUsersSearchElement.value.toLowerCase().trim() : '';
        
        const userArray = Array.isArray(allUsers) ? allUsers : [];
        const currentUserId = currentUser?.id;
        
        let filteredUsers = userArray.filter(user => {
            if (!user || !user.id) return false;
            if (user.id === currentUserId) return false;
            
            if (!searchTerm) return true;
            
            const searchIn = [
                user.displayName || '',
                user.username || '',
                user.email || '',
                user.bio || '',
                user.interests ? user.interests.join(' ') : ''
            ].join(' ').toLowerCase();
            
            return searchIn.includes(searchTerm);
        });
        
        filteredUsers.sort((a, b) => {
            if (a.online !== b.online) return b.online ? 1 : -1;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        
        if (allUsersStatusElement) {
            allUsersStatusElement.textContent = `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} found${searchTerm ? ` for "${escapeHtml(searchTerm)}"` : ''}`;
        }
        
        allUsersListElement.innerHTML = '';
        
        if (filteredUsers.length === 0) {
            allUsersListElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No users found${searchTerm ? ' matching your search' : ''}</p>
                    <p class="subtext">${searchTerm ? 'Try a different search term' : 'Check back later for new users'}</p>
                </div>
            `;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        filteredUsers.forEach(user => {
            const userItem = createUserSearchItemElement(user);
            if (userItem) {
                fragment.appendChild(userItem);
            }
        });
        
        allUsersListElement.appendChild(fragment);
        
    }, () => {
        const allUsersListElement = UIState.getElement('allUsersList');
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
                    fetchAllUsersFromBackend().then(() => renderAllUsersList());
                });
            }
        }
    });
}

// =============================================
// [9] UI ELEMENT CREATORS
// =============================================

function createFriendItemElement(friendData, type, instantMode = false) {
    if (!friendData || !friendData.id) {
        Logger.warn('UI', 'Invalid friend data for element creation');
        return null;
    }
    
    return ErrorHandler.createBoundary(`createFriendItem:${friendData.id}`, () => {
        const friendId = friendData.id;
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.userId = friendId;
        friendItem.dataset.type = type;
        
        const displayName = escapeHtml(friendData.displayName || 'Unknown User');
        const username = friendData.username ? escapeHtml(friendData.username) : null;
        const photoURL = friendData.photoURL ? escapeHtml(friendData.photoURL) : null;
        
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
        if (lastInteraction) {
            statusText = lastInteraction;
        }
        
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
            avatarHtml = `
                <div class="friend-avatar">
                    <span>${initials}</span>
                </div>
            `;
        }
        
        let badgesHtml = '';
        if (isTemporary) {
            badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-clock"></i> Temp</span>';
        }
        if (isBusiness) {
            badgesHtml += '<span class="business-badge"><i class="fas fa-briefcase"></i> Business</span>';
        }
        if (isPinned) {
            badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-thumbtack"></i> Pinned</span>';
        }
        if (isMuted) {
            badgesHtml += '<span class="temp-friend-badge"><i class="fas fa-volume-mute"></i> Muted</span>';
        }
        
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
            if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
                showFriendDetails(friendData, type);
            }
        });
        
        const actionButtons = friendItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleFriendAction(action, friendData, type, btn);
            });
        });
        
        const mutualFriendsElement = friendItem.querySelector('.mutual-friends');
        if (mutualFriendsElement) {
            mutualFriendsElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = mutualFriendsElement.dataset.userId;
                const userName = mutualFriendsElement.dataset.userName;
                showMutualFriends(userId, userName);
            });
        }
        
        return friendItem;
        
    }, null);
}

function createFriendRequestItemElement(requestData, type) {
    if (!requestData || !requestData.id) {
        Logger.warn('UI', 'Invalid request data for element creation');
        return null;
    }
    
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
            avatarHtml = `
                <div class="friend-avatar">
                    <span>${initials}</span>
                </div>
            `;
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
            if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
                showFriendRequestProfile(requestData);
            }
        });
        
        const actionButtons = requestItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleRequestAction(action, requestData, btn);
            });
        });
        
        const mutualFriendsElement = requestItem.querySelector('.mutual-friends');
        if (mutualFriendsElement) {
            mutualFriendsElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = mutualFriendsElement.dataset.userId;
                const userName = mutualFriendsElement.dataset.userName;
                showMutualFriends(userId, userName);
            });
        }
        
        return requestItem;
        
    }, null);
}

function createUserSearchItemElement(user) {
    if (!user || !user.id) {
        return null;
    }
    
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
            avatarHtml = `
                <div class="user-search-avatar">
                    <span>${initials}</span>
                </div>
            `;
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
            if (!e.target.closest('.user-search-actions')) {
                showFriendDetails(user, 'user');
            }
        });
        
        const actionButtons = userItem.querySelectorAll('.friend-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                
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
// [10] FRIEND DETAILS AND PROFILE FUNCTIONS
// =============================================

export function showFriendDetails(friendData, type) {
    return ErrorHandler.createBoundary('showFriendDetails', () => {
        if (!friendData || !friendData.id) {
            showNotification('Invalid friend data', 'error');
            return;
        }
        
        UIState.selectedFriendId = friendData.id;
        
        const titleElement = UIState.querySelector('.friend-details-title');
        if (titleElement) {
            titleElement.textContent = type === 'user' ? 'User Profile' : 'Friend Details';
        }
        
        if (friendDetailsPanel) {
            friendDetailsPanel.classList.add('active');
            UIState.pushView(UIState.activeSection, { friendId: friendData.id });
            
            if (isMobile) {
                window.scrollTo(0, 0);
                document.body.classList.add('mobile-details-open');
            }
        }
        
        loadFriendDetails(friendData, type);
        
    }, null);
}

export async function loadFriendDetails(friendData, type) {
    return ErrorHandler.createBoundary('loadFriendDetails', async () => {
        const detailsContent = UIState.getElement('friendDetailsContent');
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
            
            if (type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary' || type === 'user') {
                try {
                    const response = await apiCallWithRetry(`/api/users/${friendData.id}`, null, 1);
                    if (response?.user) {
                        detailedData = { ...detailedData, ...response.user };
                    }
                } catch (error) {
                    Logger.debug('UI', 'Using cached user data', { userId: friendData.id });
                }
            }
            
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
            if (lastInteraction) {
                statusText = lastInteraction;
            }
            
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
                avatarHtml = `
                    <div class="friend-profile-avatar">
                        <span style="color: white; font-size: 36px;">${initials}</span>
                    </div>
                `;
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
                    showMutualFriends(friendId, displayName);
                });
            }
            
            if (type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary') {
                const startChatBtn = UIState.getElement('startChatDetailsBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        navigateToChat(this.dataset.userId, this.dataset.userName);
                    });
                }
                
                const callBtn = UIState.getElement('callFriendBtn');
                if (callBtn) {
                    callBtn.addEventListener('click', function() {
                        navigateToCall(this.dataset.userId, this.dataset.userName);
                    });
                }
                
                const optionsBtn = UIState.getElement('friendOptionsBtn');
                if (optionsBtn) {
                    optionsBtn.addEventListener('click', () => {
                        showFriendOptions(friendData);
                    });
                }
                
                const saveNotesBtn = UIState.getElement('saveNotesBtn');
                if (saveNotesBtn) {
                    saveNotesBtn.addEventListener('click', () => {
                        const notesTextarea = UIState.getElement('friendNotesTextarea');
                        if (notesTextarea) {
                            savePrivateNote(friendId, notesTextarea.value);
                        }
                    });
                }
            }
            
            if (type === 'contact') {
                const startChatBtn = UIState.getElement('startChatWithContactBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        navigateToChat(this.dataset.userId, this.dataset.userName);
                    });
                }
                
                const addContactBtn = UIState.getElement('addContactBtn');
                if (addContactBtn) {
                    addContactBtn.addEventListener('click', () => {
                        sendFriendRequest(friendId);
                    });
                }
            }
            
            if (type === 'user') {
                const startChatBtn = UIState.getElement('startChatWithUserBtn');
                if (startChatBtn) {
                    startChatBtn.addEventListener('click', function() {
                        navigateToChat(this.dataset.userId, this.dataset.userName);
                    });
                }
                
                const addUserBtn = UIState.getElement('addUserBtn');
                if (addUserBtn) {
                    addUserBtn.addEventListener('click', () => {
                        sendFriendRequest(friendId);
                    });
                }
                
                const addUserAsFriendBtn = UIState.getElement('addUserAsFriendBtn');
                if (addUserAsFriendBtn) {
                    addUserAsFriendBtn.addEventListener('click', () => {
                        sendFriendRequest(friendId);
                    });
                }
            }
            
        } catch (error) {
            Logger.error('UI', 'Error loading friend details', error);
            
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
                    loadFriendDetails(friendData, type);
                });
            }
        }
        
    }, null);
}

export function showFriendRequestProfile(requestData) {
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
            avatarHtml = `
                <div class="friend-profile-avatar" style="width: 100px; height: 100px;">
                    <span style="color: white; font-size: 36px;">${initials}</span>
                </div>
            `;
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
        UIState.activeModals.add(profileModal.id);
        
        const closeBtn = profileModal.querySelector('.close-profile-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(profileModal);
                UIState.activeModals.delete(profileModal.id);
            });
        }
        
        const closeProfileBtn = profileModal.querySelector('.close-profile-btn');
        if (closeProfileBtn) {
            closeProfileBtn.addEventListener('click', () => {
                document.body.removeChild(profileModal);
                UIState.activeModals.delete(profileModal.id);
            });
        }
        
        const mutualFriendsLink = profileModal.querySelector('.mutual-friends-link');
        if (mutualFriendsLink) {
            mutualFriendsLink.addEventListener('click', () => {
                showMutualFriends(userId, displayName);
                document.body.removeChild(profileModal);
                UIState.activeModals.delete(profileModal.id);
            });
        }
        
        if (isIncoming) {
            const declineBtn = profileModal.querySelector('.decline-profile-btn');
            if (declineBtn) {
                declineBtn.addEventListener('click', () => {
                    declineFriendRequest(requestData);
                    document.body.removeChild(profileModal);
                    UIState.activeModals.delete(profileModal.id);
                });
            }
            
            const acceptBtn = profileModal.querySelector('.accept-profile-btn');
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => {
                    acceptFriendRequestOnline(requestData.id, userId);
                    document.body.removeChild(profileModal);
                    UIState.activeModals.delete(profileModal.id);
                });
            }
        } else {
            const cancelBtn = profileModal.querySelector('.cancel-profile-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    cancelFriendRequest(requestData);
                    document.body.removeChild(profileModal);
                    UIState.activeModals.delete(profileModal.id);
                });
            }
        }
        
    }, null);
}

// =============================================
// [11] FRIEND OPTIONS AND MANAGEMENT FUNCTIONS
// =============================================

export function showFriendOptions(friendData) {
    return ErrorHandler.createBoundary('showFriendOptions', () => {
        if (!friendData || !friendData.id) {
            showNotification('Invalid friend data', 'error');
            return;
        }
        
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
            avatarHtml = `
                <div class="friend-profile-avatar" style="width: 80px; height: 80px; margin: 0 auto 15px;">
                    <span style="color: white; font-size: 24px;">${initials}</span>
                </div>
            `;
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
        UIState.activeModals.add(optionsModal.id);
        
        const closeModal = () => {
            document.body.removeChild(optionsModal);
            UIState.activeModals.delete(optionsModal.id);
        };
        
        const closeBtn = optionsModal.querySelector('.close-options-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        
        const closeOptionsBtn = optionsModal.querySelector('.close-options-btn');
        if (closeOptionsBtn) closeOptionsBtn.addEventListener('click', closeModal);
        
        const changeCategoryBtn = optionsModal.querySelector('#changeCategoryBtn');
        if (changeCategoryBtn) {
            changeCategoryBtn.addEventListener('click', () => {
                closeModal();
                showChangeCategoryModal(friendData);
            });
        }
        
        const togglePinBtn = optionsModal.querySelector('#togglePinBtn');
        if (togglePinBtn) {
            togglePinBtn.addEventListener('click', async () => {
                closeModal();
                await togglePinFriend(friendData);
            });
        }
        
        const toggleMuteBtn = optionsModal.querySelector('#toggleMuteBtn');
        if (toggleMuteBtn) {
            toggleMuteBtn.addEventListener('click', async () => {
                closeModal();
                await toggleMuteFriend(friendData);
            });
        }
        
        const viewChatHistoryBtn = optionsModal.querySelector('#viewChatHistoryBtn');
        if (viewChatHistoryBtn) {
            viewChatHistoryBtn.addEventListener('click', () => {
                closeModal();
                navigateToChat(friendId, displayName);
            });
        }
        
        const viewCallHistoryBtn = optionsModal.querySelector('#viewCallHistoryBtn');
        if (viewCallHistoryBtn) {
            viewCallHistoryBtn.addEventListener('click', () => {
                closeModal();
                navigateToCall(friendId, displayName);
            });
        }
        
        const removeFriendBtn = optionsModal.querySelector('#removeFriendBtn');
        if (removeFriendBtn) {
            removeFriendBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to remove ${displayName} from your friends?`)) {
                    closeModal();
                    await removeFriend(friendData);
                }
            });
        }
        
        const blockUserBtn = optionsModal.querySelector('#blockUserBtn');
        if (blockUserBtn) {
            blockUserBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to block ${displayName}? They will not be able to contact you.`)) {
                    closeModal();
                    await blockUser(friendData);
                }
            });
        }
        
    }, null);
}

export function showChangeCategoryModal(friendData) {
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
        UIState.activeModals.add(modal.id);
        
        const closeModal = () => {
            document.body.removeChild(modal);
            UIState.activeModals.delete(modal.id);
        };
        
        const closeBtn = modal.querySelector('.close-category-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        
        const cancelBtn = modal.querySelector('.close-category-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        
        const saveBtn = modal.querySelector('#saveCategoryBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const newCategorySelect = modal.querySelector('#newCategorySelect');
                const newCategory = newCategorySelect ? newCategorySelect.value : 'friend';
                
                try {
                    const token = getValidToken();
                    if (!token) {
                        showNotification('Authentication required', 'error');
                        closeModal();
                        return;
                    }
                    
                    const response = await apiCallWithRetry(`/api/friends/${friendId}/category`, {
                        method: 'PUT',
                        body: JSON.stringify({ category: newCategory })
                    }, 1);
                    
                    if (response?.success) {
                        const friendIndex = friends.findIndex(f => f && f.id === friendId);
                        if (friendIndex !== -1) {
                            friends[friendIndex].category = newCategory;
                            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
                        }
                        
                        updateCurrentSection();
                        showNotification('Category updated successfully', 'success');
                    }
                } catch (error) {
                    Logger.error('UI', 'Failed to update category', error);
                    showNotification('Failed to update category', 'error');
                }
                
                closeModal();
            });
        }
        
    }, null);
}

// =============================================
// [12] START CHAT MODAL FUNCTIONS
// =============================================

export function showStartChatModal() {
    return ErrorHandler.createBoundary('showStartChatModal', () => {
        if (!startChatModal) return;
        
        startChatModal.classList.add('active');
        UIState.activeModals.add('startChatModal');
        
        window.selectedChatFriend = null;
        
        const confirmBtn = UIState.getElement('confirmStartChatBtn');
        if (confirmBtn) confirmBtn.disabled = true;
        
        const searchInput = UIState.getElement('searchChatUser');
        if (searchInput) searchInput.value = '';
        
        populateChatFriendsList();
        
    }, null);
}

function populateChatFriendsList() {
    return ErrorHandler.createBoundary('populateChatFriendsList', () => {
        const chatFriendsList = UIState.getElement('chatFriendsList');
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
                document.querySelectorAll('#chatFriendsList .friend-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                friendItem.classList.add('selected');
                window.selectedChatFriend = friend;
                
                const confirmBtn = UIState.getElement('confirmStartChatBtn');
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
// [13] FILTERING AND SEARCH FUNCTIONS
// =============================================

export function filterFriendsByCategory(category) {
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
        
        Logger.debug('UI', `Filtered by category: ${category}`);
        
    }, null);
}

export function searchFriends(searchTerm) {
    return ErrorHandler.createBoundary('searchFriends', () => {
        currentSearchTerm = searchTerm ? searchTerm.toLowerCase().trim() : '';
        updateCurrentSection();
    }, null);
}

// =============================================
// [14] ACTION HANDLERS
// =============================================

export function handleFriendAction(action, friendData, type, button) {
    return ErrorHandler.createBoundary('handleFriendAction', () => {
        const userId = button?.dataset?.userId || friendData?.id;
        const userName = button?.dataset?.userName || friendData?.displayName || 'User';
        
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
                
            case 'accept':
                acceptFriendRequestOnline(friendData.id || friendData.requestId, friendData.senderId || userId);
                break;
                
            case 'decline':
                declineFriendRequest(friendData);
                break;
                
            case 'cancel':
                cancelFriendRequest(friendData);
                break;
                
            case 'view-profile':
                showFriendRequestProfile(friendData);
                break;
                
            default:
                Logger.debug('UI', `Unknown friend action: ${action}`);
        }
    }, null);
}

// ⚠️⚠️⚠️ FIXED: This function is now defined ONLY ONCE ⚠️⚠️⚠️
export function handleRequestAction(action, requestData, button) {
    return ErrorHandler.createBoundary('handleRequestAction', () => {
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
                Logger.debug('UI', `Unknown request action: ${action}`);
        }
    }, null);
}

async function handleSendFriendRequest() {
    const activeTab = UIState.querySelector('.add-friend-tab.active');
    if (!activeTab) {
        showNotification('Please select a method', 'warning');
        return;
    }
    
    const activeTabName = activeTab.dataset.tab;
    
    if (activeTabName === 'username') {
        const usernameInput = UIState.getElement('usernameInput');
        const username = usernameInput?.value.trim() || '';
        
        if (!username) {
            showNotification('Please enter a username', 'error');
            return;
        }
        
        if (!username.startsWith('@')) {
            showNotification('Username must start with @', 'error');
            return;
        }
        
        try {
            const response = await apiCallWithRetry(`/api/users/search?username=${encodeURIComponent(username)}`);
            
            if (!response?.user) {
                showNotification('User not found', 'error');
                return;
            }
            
            const user = response.user;
            
            if (user.id === currentUser?.id) {
                showNotification('You cannot add yourself as a friend', 'warning');
                return;
            }
            
            const categorySelect = UIState.getElement('friendCategorySelect');
            const category = categorySelect?.value || 'friend';
            const noteInput = UIState.getElement('friendNote');
            const note = noteInput?.value.trim() || '';
            const isBusiness = category === 'business';
            
            await sendFriendRequest(user.id, category, note, false, null, isBusiness);
            
            if (usernameInput) usernameInput.value = '';
            if (noteInput) noteInput.value = '';
            
        } catch (error) {
            Logger.error('UI', 'Failed to send friend request', error);
            showNotification('Failed to send friend request', 'error');
        }
        
    } else if (activeTabName === 'all-users') {
        showNotification('Please select a user from the list and click the "Add Friend" button', 'info');
    } else {
        showNotification('Please enter the required information', 'warning');
    }
}

// =============================================
// [15] INITIALIZATION AND SETUP
// =============================================

// Debounce utility
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Setup auth error buttons
function setupAuthErrorButtons() {
    const redirectBtn = UIState.getElement('redirectToLoginBtn');
    const retryBtn = UIState.getElement('retryAuthBtn');
    
    if (redirectBtn) {
        UIEventSystem.register(redirectBtn, 'click', () => {
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
    
    if (retryBtn) {
        UIEventSystem.register(retryBtn, 'click', () => {
            hideAuthError();
            
            if (ParentCoordinator?.state?.parentDetected) {
                ParentCoordinator.attemptParentReconnection();
            } else {
                enhancedInitialize();
            }
        });
    }
}

// Setup retry buttons for error boundaries
function setupRetryButtons() {
    document.addEventListener('click', (e) => {
        const retryBtn = e.target.closest('.retry-section-btn');
        if (retryBtn) {
            const sectionId = retryBtn.dataset.section;
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
            if (modalId === 'cameraScannerModal' && featureFlags.camera) {
                startCameraScanner();
            }
            return;
        }
        
        const retryUsersBtn = e.target.closest('.retry-users-btn');
        if (retryUsersBtn) {
            fetchAllUsersFromBackend().then(() => renderAllUsersList());
            return;
        }
    });
}

// Setup window error handler
function setupWindowErrorHandler() {
    window.addEventListener('error', (event) => {
        if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'VIDEO')) {
            event.preventDefault();
            return true;
        }
        
        Logger.error('Window', 'Uncaught error', event.error || event.message);
        return false;
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        Logger.error('Window', 'Unhandled promise rejection', event.reason);
        event.preventDefault();
        return false;
    });
}

// =============================================
// [16] PERFORMANCE MONITORING
// =============================================

export const UIPerformance = {
    marks: new Map(),
    measures: new Map(),
    
    startMark(name) {
        if (performance && performance.mark) {
            const markName = `ui:${name}:start`;
            performance.mark(markName);
            this.marks.set(name, markName);
        }
    },
    
    endMark(name) {
        if (performance && performance.mark && this.marks.has(name)) {
            const startMark = this.marks.get(name);
            const endMark = `ui:${name}:end`;
            
            performance.mark(endMark);
            performance.measure(`ui:${name}`, startMark, endMark);
            
            const measures = performance.getEntriesByName(`ui:${name}`);
            if (measures.length > 0) {
                this.measures.set(name, measures[measures.length - 1]);
                
                if (measures[measures.length - 1].duration > 100) {
                    Logger.warn('Performance', `Slow UI operation: ${name}`, {
                        duration: measures[measures.length - 1].duration
                    });
                }
            }
            
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(`ui:${name}`);
            
            this.marks.delete(name);
        }
    },
    
    clear() {
        this.marks.clear();
        this.measures.clear();
    }
};

// =============================================
// [17] DOM READY INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    Logger.info('UI', 'DOM Content Loaded - Starting UI initialization');
    
    UIPerformance.startMark('totalInit');
    
    setupWindowErrorHandler();
    setupAuthErrorButtons();
    setupRetryButtons();
    
    UIEventSystem.init();
    CoreIntegration.init();
    RenderPipeline.init();
    
    enhancedInitialize().catch(error => {
        Logger.error('UI', 'Failed to initialize friend core', error);
        
        if (!cacheLoaded) {
            loadCachedDataInstantly();
            RenderPipeline.renderFriendsListInstantly();
        }
    });
    
    checkMobile();
    
    setInterval(() => {
        UIState.clearExpiredCache();
    }, 600000);
    
    UIPerformance.endMark('totalInit');
    
    Logger.info('UI', 'UI initialization complete', {
        mobile: isMobile,
        apiReady,
        cacheLoaded
    });
});

// =============================================
// [18] CLEANUP ON UNLOAD
// =============================================

window.addEventListener('beforeunload', () => {
    saveFriendsToLocalStorage();
    stopCameraScanner();
    
    if (backgroundSyncInterval) {
        clearInterval(backgroundSyncInterval);
    }
    
    UIEventSystem.destroy();
    CoreIntegration.destroy();
    UIPerformance.clear();
    
    Logger.info('UI', 'UI cleanup complete');
});

// =============================================
// [19] EXPORTS - SINGLE EXPORT BLOCK, NO DUPLICATES
// =============================================


    
    // Filtering
    
    // Actions
