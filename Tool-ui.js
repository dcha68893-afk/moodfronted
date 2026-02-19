// =============================================
// RESILIENT MARKETPLACE UI CONTROLLER v5.0
// FAULT-TOLERANT • PROGRESSIVE RENDERING • CORE BRIDGE
// ENHANCED WITH DIAGNOSTICS • RECOVERY AWARE • SESSION SYNC
// UI FAILSAFE • NAVIGATION GUARD • ENVIRONMENT ADAPTIVE
// =============================================

// ----------------------------------------------------------------------
// 1. IMPORT VERIFICATION – STRICT CORE BRIDGE
// ----------------------------------------------------------------------
import {
    // ---------- Core State (validated) ----------
    currentUser, userData, myListings, allListings, savedItems, privateNotes,
    userGroups, userFriends, currentMoodFilter, offlineDrafts, trustStats,
    userSubscription, teamMembers, leaderboardData, analyticsData, streakData,
    premiumFeatures, paymentMethods,

    // ---------- Constants (fully preserved) ----------
    LISTING_TYPES, AVAILABILITY, MOOD_CONTEXTS, TRUST_CIRCLES, DURATION_OPTIONS,
    TRUST_INDICATORS, SUBSCRIPTION_PLANS, SERVICE_CATEGORIES, PREMIUM_CATEGORIES,
    DIGITAL_TYPES, PREMIUM_DIGITAL_TYPES, TEMPLATE_TYPES, LOCAL_STORAGE_KEYS,
    PARENT_MESSAGE_TYPES, SESSION_SCHEMA, ENVIRONMENT_TYPES, STARTUP_STAGES,

    // ---------- Core API (strict reference) ----------
    initializeMarketplaceCore,
    isListingExpired,
    isListingVisibleToUser,
    filterListingsByMood,
    getTrustIndicator,
    trackListingView,
    formatTimeAgo,
    showNotification,
    saveToLocalStorage,
    escapeHtml,
    isUserPremium,
    formatTimeRemaining,
    formatFileSize,
    createServiceListing,
    createDigitalListing,
    createPremiumServiceListing,
    createPremiumDigitalListing,
    updateAvailableListingsCount,
    syncOfflineMarketplaceData,
    saveAllMarketplaceData,
    exportAnalyticsData,
    processBulkUpload,
    backupMarketplaceData,
    restoreMarketplaceData,
    downloadDigitalFile,
    updateTeamMemberRole,
    startFreeTrial,
    restorePurchase,
    sendTip,
    processSubscriptionPayment,
    openChat,
    loadAnalyticsData,
    loadLeaderboard,
    inviteTeamMember,
    clearMoodFilter as clearCoreMoodFilter,
    
    // Additional imports needed
    AppState,
    hasValidSession,
    hasValidUser,
    safeGetElement,
    showStatusMessage,
    validateDataStructure,
    getData,
    updateData,
    queueMessageForParent,
    processMessageQueue,
    handleParentMessage,
    handleParentInit,
    handleRefreshDataRequest,
    fetchData,
    pageCore as corePageCore,
    initializeCore,
    startHandshake,
    sendToParent,
    requestSession,
    receiveFromParent,
    shutdownCore,
    syncWithParent,
    checkParentHealth,
    safeInitializeMarketplaceCore,
    bootstrapIframe,
    secureApiCall,
    safeApiCall,
    getCentralToken,
    handleSessionExpired,
    startSecureHandshakeProtocol,
    requestSessionFromParent,
    handleSecureSessionData,
    bindUIAfterSession,
    getMarketplaceStats,
    getMarketplaceAnalytics,
    getMarketplaceUser,
    isMarketplaceReady,
    isCoreReady,
    loadCachedDataInstantly,
    initializeEnhancedParentCommunication,
    handleSecureParentMessage,
    validateParentOrigin,
    validateMessageOrigin,
    startHandshakeProtocol,
    initiateHandshakeRetry,
    handleParentReady,
    handleSessionDataFromParent,
    validateSessionSchema,
    processSessionData,
    storeCentralizedToken,
    updateLocalStateFromSession,
    showMarketplaceUI,
    waitForSessionData,
    handleSessionTimeout,
    handleSessionUpdate,
    handleParentLogout,
    clearSessionData,
    handleRefreshUI,
    handleForceReload,
    handleApiError,
    handleUnauthorized,
    handleParentUnavailable,
    showReconnectionState,
    startReconnectionAttempts,
    hideReconnectionState,
    setupConnectivityListeners,
    initializeTokenSystem,
    isValidToken,
    waitForApiJs,
    handleInitializationFailure,
    handleStandaloneMode,
    initializeEnhancedMarketplace,
    checkUserPremiumStatus,
    loadEnhancedMarketplaceData,
    loadListingsFromBackend,
    loadSpotlightListingsFromBackend,
    updateListingCounts,
    updateTrustStats,
    processFeaturedListing,
    processBoostedListing,
    processPremiumPayment,
    calculatePremiumCost,
    updateAnalyticsData,
    updateListingStreak,
    checkStreakRewards,
    awardTemporaryPremium,
    parseCSV,
    uploadBulkListings,
    cleanupExpiredListings,
    checkDarkMode,
    queueForSync,
    generateSampleMarketplaceData,
    queueApiCall,
    processApiCallQueue,
    authenticatedApiCall,
    makeApiCall,
    startBackgroundJobs,
    requestParentUserData,
    fetchUserDataDirectly,
    processUserData,
    handleParentUserData,
    updateUserDataFromParent,
    handleUserLogout,
    migrateLegacyUserData,
    startFreeTrial as startFreeTrialCore,
    restorePurchase as restorePurchaseCore,
    processSubscriptionPayment as processSubscriptionPaymentCore,
    inviteTeamMember as inviteTeamMemberCore,
    inviteTeamMemberWrapper,
    openChat as openChatCore,
    loadAnalyticsData as loadAnalyticsDataCore,
    loadLeaderboard as loadLeaderboardCore,
    updateTeamMemberRole as updateTeamMemberRoleCore
    
} from './Tool-core.js';

// ----------------------------------------------------------------------
// 2. DOM CACHE – RESILIENT ELEMENT REFERENCES
// ----------------------------------------------------------------------
const DOM = {
    // ----- Modals -----
    marketplaceDetailPanel: null,
    createListingModal: null,
    savedItemsModal: null,
    myNotesModal: null,
    trustStatsModal: null,
    analyticsModal: null,
    premiumOptionsModal: null,
    teamManagementModal: null,
    leaderboardModal: null,
    reactionPickerModal: null,
    notification: null,

    // ----- Marketplace sections -----
    marketplaceListContent: null,
    myListingsAvatar: null,
    myListingsName: null,
    myListingsText: null,
    spotlightSection: null,
    spotlightListings: null,
    premiumStatusBadge: null,
    listingStreak: null,

    // ----- Analytics Chart -----
    analyticsChartCanvas: null,
    analyticsChartInstance: null,

    // ----- Additional elements -----
    backBtn: null,
    detailName: null,
    detailTime: null,
    detailAvatar: null,
    marketplaceDetailContent: null,
    saveListingBtn: null,
    addNoteBtn: null,
    addReactionBtn: null,
    reserveBtn: null,
    tipBtn: null,
    tipAmounts: null,
    contactSellerBtn: null,
    shareListingBtn: null,
    detailMenuBtn: null,
    moodFilterIndicator: null,
    currentMoodFilter: null,
    viewAnalyticsBtn: null,
    viewSavedBtn: null,
    viewNotesBtn: null,
    viewTrustStatsBtn: null,
    premiumOptionsBtn: null,
    viewTeamBtn: null,
    viewLeaderboardBtn: null,
    allTab: null,
    servicesTab: null,
    digitalTab: null,
    friendsTab: null,
    groupsTab: null,
    myTab: null,
    premiumTab: null,
    spotlightTab: null,
    createListingBtn: null,
    createListingQuickBtn: null,
    sellServiceBtn: null,
    sellDigitalBtn: null,
    publishListingBtn: null,
    publishPremiumBtn: null,
    saveDraftBtn: null,
    closeCreateListingModal: null,
    closeAnalyticsModal: null,
    closePremiumModal: null,
    closeTeamModal: null,
    closeLeaderboardModal: null,
    closeReactionModal: null,
    closeSavedModal: null,
    closeNotesModal: null,
    closeTrustStatsModal: null,
    digitalUploadArea: null,
    digitalUploadInput: null,
    bulkUploadArea: null,
    bulkUploadInput: null,
    uploadVideoBtn: null,
    peopleSearch: null,
    groupsList: null,
    peopleList: null,
    groupSelectionContainer: null,
    peopleSelectionContainer: null,
    featuredListingCheckbox: null,
    boostListingCheckbox: null,
    autoRenewCheckbox: null,
    verifiedBadgeCheckbox: null,
    templatePrimaryColor: null,
    templateFont: null,
    expiryDate: null,
    sellerNotes: null,
    teamNotes: null,
    visibilityStart: null,
    visibilityEnd: null,
    serviceTitle: null,
    serviceDescription: null,
    servicePrice: null,
    digitalTitle: null,
    digitalDescription: null,
    digitalPrice: null,
    digitalPreview: null,
    arPreviewFeature: null,
    teamNotesFeature: null,
    analyticsAlertsFeature: null,
    recurringPromoFeature: null,
    scheduleVisibilityFeature: null,
    paymentContainer: null,
    cardPaymentForm: null,
    cardNumber: null,
    cardExpiry: null,
    cardCvc: null,
    cardName: null,
    completePaymentBtn: null,
    cancelPaymentBtn: null,
    startFreeTrialBtn: null,
    restorePurchaseBtn: null,
    inviteTeamMemberBtn: null,
    saveTeamBtn: null,
    refreshLeaderboardBtn: null,
    refreshAnalyticsBtn: null,
    exportAnalyticsBtn: null,
    clearSavedBtn: null,
    addNewNoteBtn: null,
    notificationText: null,
    availableListingsCount: null,
    streakCount: null,
    analyticsViews: null,
    analyticsSaves: null,
    analyticsShares: null,
    analyticsMessages: null,
    analyticsConversion: null,
    analyticsEngagement: null,
    viewsChange: null,
    savesChange: null,
    sharesChange: null,
    messagesChange: null,
    conversionChange: null,
    engagementChange: null,
    engagementHeatmap: null,
    savedItemsGrid: null,
    myNotesList: null,
    teamMembersList: null,
    leaderboardList: null,
    reactionPicker: null,
    
    // New elements for enhanced UI
    connectionStatusIndicator: null,
    handshakeStatusIndicator: null,
    sessionStatusIndicator: null,
    recoveryStatusIndicator: null,
    environmentIndicator: null,
    debugPanel: null,
    debugToggle: null,
    metricsDisplay: null,
    startupStageIndicator: null
};

function cacheDOMElements() {
    // Modals
    DOM.marketplaceDetailPanel = document.getElementById('marketplaceDetailPanel');
    DOM.createListingModal = document.getElementById('createListingModal');
    DOM.savedItemsModal = document.getElementById('savedItemsModal');
    DOM.myNotesModal = document.getElementById('myNotesModal');
    DOM.trustStatsModal = document.getElementById('trustStatsModal');
    DOM.analyticsModal = document.getElementById('analyticsModal');
    DOM.premiumOptionsModal = document.getElementById('premiumOptionsModal');
    DOM.teamManagementModal = document.getElementById('teamManagementModal');
    DOM.leaderboardModal = document.getElementById('leaderboardModal');
    DOM.reactionPickerModal = document.getElementById('reactionPickerModal');
    DOM.notification = document.getElementById('notification');
    DOM.notificationText = document.getElementById('notificationText');

    // Marketplace sections
    DOM.marketplaceListContent = document.getElementById('marketplaceListContent');
    DOM.myListingsAvatar = document.getElementById('myListingsAvatar');
    DOM.myListingsName = document.getElementById('myListingsName');
    DOM.myListingsText = document.getElementById('myListingsText');
    DOM.spotlightSection = document.getElementById('spotlightSection');
    DOM.spotlightListings = document.getElementById('spotlightListings');
    DOM.premiumStatusBadge = document.getElementById('premiumStatusBadge');
    DOM.listingStreak = document.getElementById('listingStreak');
    DOM.availableListingsCount = document.getElementById('availableListingsCount');
    DOM.streakCount = document.getElementById('streakCount');

    // Detail panel elements
    DOM.backBtn = document.getElementById('backBtn');
    DOM.detailName = document.getElementById('detailName');
    DOM.detailTime = document.getElementById('detailTime');
    DOM.detailAvatar = document.getElementById('detailAvatar');
    DOM.marketplaceDetailContent = document.getElementById('marketplaceDetailContent');
    DOM.saveListingBtn = document.getElementById('saveListingBtn');
    DOM.addNoteBtn = document.getElementById('addNoteBtn');
    DOM.addReactionBtn = document.getElementById('addReactionBtn');
    DOM.reserveBtn = document.getElementById('reserveBtn');
    DOM.tipBtn = document.getElementById('tipBtn');
    DOM.tipAmounts = document.getElementById('tipAmounts');
    DOM.contactSellerBtn = document.getElementById('contactSellerBtn');
    DOM.shareListingBtn = document.getElementById('shareListingBtn');
    DOM.detailMenuBtn = document.getElementById('detailMenuBtn');

    // Filter indicators
    DOM.moodFilterIndicator = document.getElementById('moodFilterIndicator');
    DOM.currentMoodFilter = document.getElementById('currentMoodFilter');

    // Action buttons
    DOM.viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
    DOM.viewSavedBtn = document.getElementById('viewSavedBtn');
    DOM.viewNotesBtn = document.getElementById('viewNotesBtn');
    DOM.viewTrustStatsBtn = document.getElementById('viewTrustStatsBtn');
    DOM.premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
    DOM.viewTeamBtn = document.getElementById('viewTeamBtn');
    DOM.viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');

    // Category tabs
    DOM.allTab = document.getElementById('allTab');
    DOM.servicesTab = document.getElementById('servicesTab');
    DOM.digitalTab = document.getElementById('digitalTab');
    DOM.friendsTab = document.getElementById('friendsTab');
    DOM.groupsTab = document.getElementById('groupsTab');
    DOM.myTab = document.getElementById('myTab');
    DOM.premiumTab = document.getElementById('premiumTab');
    DOM.spotlightTab = document.getElementById('spotlightTab');

    // Create listing buttons
    DOM.createListingBtn = document.getElementById('createListingBtn');
    DOM.createListingQuickBtn = document.getElementById('createListingQuickBtn');
    DOM.sellServiceBtn = document.getElementById('sellServiceBtn');
    DOM.sellDigitalBtn = document.getElementById('sellDigitalBtn');
    DOM.publishListingBtn = document.getElementById('publishListingBtn');
    DOM.publishPremiumBtn = document.getElementById('publishPremiumBtn');
    DOM.saveDraftBtn = document.getElementById('saveDraftBtn');

    // Close buttons
    DOM.closeCreateListingModal = document.getElementById('closeCreateListingModal');
    DOM.closeAnalyticsModal = document.getElementById('closeAnalyticsModal');
    DOM.closePremiumModal = document.getElementById('closePremiumModal');
    DOM.closeTeamModal = document.getElementById('closeTeamModal');
    DOM.closeLeaderboardModal = document.getElementById('closeLeaderboardModal');
    DOM.closeReactionModal = document.getElementById('closeReactionModal');
    DOM.closeSavedModal = document.getElementById('closeSavedModal');
    DOM.closeNotesModal = document.getElementById('closeNotesModal');
    DOM.closeTrustStatsModal = document.getElementById('closeTrustStatsModal');

    // Upload areas
    DOM.digitalUploadArea = document.getElementById('digitalUploadArea');
    DOM.digitalUploadInput = document.getElementById('digitalUploadInput');
    DOM.bulkUploadArea = document.getElementById('bulkUploadArea');
    DOM.bulkUploadInput = document.getElementById('bulkUploadInput');
    DOM.uploadVideoBtn = document.getElementById('uploadVideoBtn');

    // Selection containers
    DOM.peopleSearch = document.getElementById('peopleSearch');
    DOM.groupsList = document.getElementById('groupsList');
    DOM.peopleList = document.getElementById('peopleList');
    DOM.groupSelectionContainer = document.getElementById('groupSelectionContainer');
    DOM.peopleSelectionContainer = document.getElementById('peopleSelectionContainer');

    // Premium checkboxes
    DOM.featuredListingCheckbox = document.getElementById('featuredListingCheckbox');
    DOM.boostListingCheckbox = document.getElementById('boostListingCheckbox');
    DOM.autoRenewCheckbox = document.getElementById('autoRenewCheckbox');
    DOM.verifiedBadgeCheckbox = document.getElementById('verifiedBadgeCheckbox');

    // Template settings
    DOM.templatePrimaryColor = document.getElementById('templatePrimaryColor');
    DOM.templateFont = document.getElementById('templateFont');

    // Form inputs
    DOM.expiryDate = document.getElementById('expiryDate');
    DOM.sellerNotes = document.getElementById('sellerNotes');
    DOM.teamNotes = document.getElementById('teamNotes');
    DOM.visibilityStart = document.getElementById('visibilityStart');
    DOM.visibilityEnd = document.getElementById('visibilityEnd');
    DOM.serviceTitle = document.getElementById('serviceTitle');
    DOM.serviceDescription = document.getElementById('serviceDescription');
    DOM.servicePrice = document.getElementById('servicePrice');
    DOM.digitalTitle = document.getElementById('digitalTitle');
    DOM.digitalDescription = document.getElementById('digitalDescription');
    DOM.digitalPrice = document.getElementById('digitalPrice');
    DOM.digitalPreview = document.getElementById('digitalPreview');

    // Premium features
    DOM.arPreviewFeature = document.getElementById('arPreviewFeature');
    DOM.teamNotesFeature = document.getElementById('teamNotesFeature');
    DOM.analyticsAlertsFeature = document.getElementById('analyticsAlertsFeature');
    DOM.recurringPromoFeature = document.getElementById('recurringPromoFeature');
    DOM.scheduleVisibilityFeature = document.getElementById('scheduleVisibilityFeature');

    // Payment elements
    DOM.paymentContainer = document.getElementById('paymentContainer');
    DOM.cardPaymentForm = document.getElementById('cardPaymentForm');
    DOM.cardNumber = document.getElementById('cardNumber');
    DOM.cardExpiry = document.getElementById('cardExpiry');
    DOM.cardCvc = document.getElementById('cardCvc');
    DOM.cardName = document.getElementById('cardName');
    DOM.completePaymentBtn = document.getElementById('completePaymentBtn');
    DOM.cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    DOM.startFreeTrialBtn = document.getElementById('startFreeTrialBtn');
    DOM.restorePurchaseBtn = document.getElementById('restorePurchaseBtn');

    // Team management
    DOM.inviteTeamMemberBtn = document.getElementById('inviteTeamMemberBtn');
    DOM.saveTeamBtn = document.getElementById('saveTeamBtn');
    DOM.refreshLeaderboardBtn = document.getElementById('refreshLeaderboardBtn');

    // Analytics
    DOM.refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
    DOM.exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');
    DOM.clearSavedBtn = document.getElementById('clearSavedBtn');
    DOM.addNewNoteBtn = document.getElementById('addNewNoteBtn');

    // Analytics values
    DOM.analyticsViews = document.getElementById('analyticsViews');
    DOM.analyticsSaves = document.getElementById('analyticsSaves');
    DOM.analyticsShares = document.getElementById('analyticsShares');
    DOM.analyticsMessages = document.getElementById('analyticsMessages');
    DOM.analyticsConversion = document.getElementById('analyticsConversion');
    DOM.analyticsEngagement = document.getElementById('analyticsEngagement');
    DOM.viewsChange = document.getElementById('viewsChange');
    DOM.savesChange = document.getElementById('savesChange');
    DOM.sharesChange = document.getElementById('sharesChange');
    DOM.messagesChange = document.getElementById('messagesChange');
    DOM.conversionChange = document.getElementById('conversionChange');
    DOM.engagementChange = document.getElementById('engagementChange');

    // Heatmap
    DOM.engagementHeatmap = document.getElementById('engagementHeatmap');

    // Charts
    DOM.analyticsChartCanvas = document.getElementById('analyticsChart');

    // Lists
    DOM.savedItemsGrid = document.getElementById('savedItemsGrid');
    DOM.myNotesList = document.getElementById('myNotesList');
    DOM.teamMembersList = document.getElementById('teamMembersList');
    DOM.leaderboardList = document.getElementById('leaderboardList');

    // Reaction picker
    DOM.reactionPicker = document.getElementById('reactionPicker');
    
    // New elements (create them if they don't exist)
    createEnhancedUIElements();
}

function createEnhancedUIElements() {
    // Create status indicators if they don't exist
    if (!document.getElementById('connectionStatusBar')) {
        const statusBar = document.createElement('div');
        statusBar.id = 'connectionStatusBar';
        statusBar.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            display: flex;
            gap: 8px;
            z-index: 10000;
            font-size: 11px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            backdrop-filter: blur(4px);
            pointer-events: none;
            flex-wrap: wrap;
            max-width: 300px;
            transition: opacity 0.3s ease;
            opacity: 0.8;
        `;
        
        statusBar.innerHTML = `
            <span id="connectionStatusIndicator" class="status-dot" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Connecting
            </span>
            <span id="handshakeStatusIndicator" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Handshake
            </span>
            <span id="sessionStatusIndicator" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Session
            </span>
            <span id="environmentIndicator" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #4caf50;"></span> Env
            </span>
            <span id="startupStageIndicator" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Startup
            </span>
        `;
        
        document.body.appendChild(statusBar);
        
        DOM.connectionStatusIndicator = document.getElementById('connectionStatusIndicator');
        DOM.handshakeStatusIndicator = document.getElementById('handshakeStatusIndicator');
        DOM.sessionStatusIndicator = document.getElementById('sessionStatusIndicator');
        DOM.environmentIndicator = document.getElementById('environmentIndicator');
        DOM.startupStageIndicator = document.getElementById('startupStageIndicator');
    }
    
    // Create debug toggle if in development or debug mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.__IFRAME_DEBUG__) {
        if (!document.getElementById('debugToggle')) {
            const debugBtn = document.createElement('button');
            debugBtn.id = 'debugToggle';
            debugBtn.innerHTML = '🐛 Debug';
            debugBtn.style.cssText = `
                position: fixed;
                bottom: 60px;
                left: 10px;
                z-index: 10000;
                background: #333;
                color: white;
                border: none;
                border-radius: 20px;
                padding: 8px 16px;
                font-size: 12px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s;
                min-width: 44px;
                min-height: 44px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            `;
            debugBtn.addEventListener('mouseenter', () => debugBtn.style.opacity = '1');
            debugBtn.addEventListener('mouseleave', () => debugBtn.style.opacity = '0.6');
            document.body.appendChild(debugBtn);
            DOM.debugToggle = debugBtn;
            
            const debugPanel = document.createElement('div');
            debugPanel.id = 'debugPanel';
            debugPanel.style.cssText = `
                position: fixed;
                bottom: 110px;
                left: 10px;
                z-index: 10000;
                background: rgba(0,0,0,0.95);
                color: #0f0;
                padding: 15px;
                border-radius: 8px;
                font-family: monospace;
                font-size: 12px;
                max-width: 400px;
                max-height: 400px;
                overflow: auto;
                display: none;
                backdrop-filter: blur(4px);
                border: 1px solid #444;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            `;
            document.body.appendChild(debugPanel);
            DOM.debugPanel = debugPanel;
        }
    }
}

// ----------------------------------------------------------------------
// 3. UI STATE CACHE & HISTORY (Restore points)
// ----------------------------------------------------------------------
const UIState = {
    currentListingId: null,
    currentListingData: null,
    selectedDigitalFile: null,
    selectedVideoIntro: null,
    selectedAvailability: AVAILABILITY ? AVAILABILITY.FREE : 'free',
    selectedTrustCircle: TRUST_CIRCLES ? TRUST_CIRCLES.FRIENDS : 'friends',
    selectedTemplate: TEMPLATE_TYPES ? TEMPLATE_TYPES.BASIC : 'basic',
    selectedMoodContext: MOOD_CONTEXTS ? MOOD_CONTEXTS.BROWSE : 'browse',
    selectedDuration: '7d',
    selectedSchedule: 'daily',
    selectedPlan: null,
    activeTab: 'all',
    createListingActiveTab: 'service',
    viewHistory: [],
    lastRenderTimestamp: 0,
    isRendering: false,
    
    // Enhanced state
    lastHealthCheck: 0,
    recoveryModeActive: false,
    handshakeStage: 'idle',
    connectionQuality: 'unknown',
    debugMode: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.__IFRAME_DEBUG__,
    environmentType: ENVIRONMENT_TYPES.UNKNOWN,
    startupStage: STARTUP_STAGES.IDLE,
    
    // UI Failsafe state
    pendingActions: [],
    lastActionTime: 0,
    actionQueueEnabled: true
};

// ----------------------------------------------------------------------
// 4. CENTRALIZED EVENT BUS (with automatic cleanup)
// ----------------------------------------------------------------------
const EventController = (function() {
    const listeners = new Set();
    const debouncedHandlers = new Map();
    const intervalHandlers = new Map();
    const warningsShown = new Set();

    function addListener(element, event, handler, options = {}) {
        if (!element) return () => {};
        const wrappedHandler = (e) => {
            try { 
                // Check if action can be executed (UI Failsafe)
                if (!canExecuteAction() && (e.type === 'click' || e.type === 'submit')) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Queue action for later
                    queueUIAction(() => {
                        handler(e);
                    });
                    
                    // Visual feedback
                    if (element.style) {
                        element.style.opacity = '0.5';
                        setTimeout(() => {
                            element.style.opacity = '';
                        }, 200);
                    }
                    
                    return;
                }
                
                handler(e); 
            } catch (err) {
                logOnce('event_error', `UI Event error: ${event}`);
                if (window.diagnosticsAgent) {
                    window.diagnosticsAgent.logWarning(`UI Event error: ${event}`, { error: err.message });
                }
            }
        };
        element.addEventListener(event, wrappedHandler, options);
        const entry = { element, event, wrappedHandler, options };
        listeners.add(entry);
        return () => removeListener(entry);
    }

    function removeListener(entry) {
        try {
            entry.element.removeEventListener(entry.event, entry.wrappedHandler, entry.options);
            listeners.delete(entry);
        } catch (e) {}
    }

    function addDebounced(key, fn, wait) {
        if (debouncedHandlers.has(key)) clearTimeout(debouncedHandlers.get(key));
        debouncedHandlers.set(key, setTimeout(() => {
            fn();
            debouncedHandlers.delete(key);
        }, wait));
    }
    
    function addInterval(key, fn, interval) {
        if (intervalHandlers.has(key)) clearInterval(intervalHandlers.get(key));
        const id = setInterval(() => {
            try {
                fn();
            } catch (err) {
                logOnce('interval_error', `Interval Error: ${key}`);
            }
        }, interval);
        intervalHandlers.set(key, id);
        return () => {
            clearInterval(id);
            intervalHandlers.delete(key);
        };
    }

    function removeAll() {
        listeners.forEach(entry => {
            try {
                entry.element.removeEventListener(entry.event, entry.wrappedHandler, entry.options);
            } catch (e) {}
        });
        listeners.clear();
        debouncedHandlers.forEach(t => clearTimeout(t));
        debouncedHandlers.clear();
        intervalHandlers.forEach(id => clearInterval(id));
        intervalHandlers.clear();
    }

    function logOnce(key, message) {
        if (!warningsShown.has(key)) {
            warningsShown.add(key);
            console.warn(`[EventController] ${message}`);
        }
    }

    return { addListener, removeAll, addDebounced, addInterval };
})();

// ----------------------------------------------------------------------
// 5. UI FAILSAFE - Protects UI during disconnection
// ----------------------------------------------------------------------
function canExecuteAction() {
    // Check if parent is responding OR we're in guest/fallback mode
    const health = checkParentHealth ? checkParentHealth() : { responding: true };
    return health.responding || AppState?._STATE?.guestMode || AppState?._STATE?.fallbackMode;
}

function queueUIAction(action) {
    if (!UIState.actionQueueEnabled) return;
    
    UIState.pendingActions.push({
        action,
        timestamp: Date.now()
    });
    
    // Limit queue size
    if (UIState.pendingActions.length > 50) {
        UIState.pendingActions.shift();
    }
}

function processQueuedUIActions() {
    if (UIState.pendingActions.length === 0) return;
    if (!canExecuteAction()) return;
    
    const now = Date.now();
    const actions = UIState.pendingActions.filter(a => now - a.timestamp < 60000); // Keep last minute
    
    UIState.pendingActions = [];
    
    actions.forEach(item => {
        try {
            if (typeof item.action === 'function') {
                item.action();
            }
        } catch (e) {
            logOnce('action_replay_failed', 'Failed to replay queued action');
        }
    });
}

// Start periodic queue processing
setInterval(processQueuedUIActions, 5000);

// ----------------------------------------------------------------------
// 6. ERROR BOUNDARY – SECTION FALLBACK
// ----------------------------------------------------------------------
function withErrorBoundary(uiSectionName, renderFn, fallbackHTML = '') {
    const warningsShown = new Set();
    
    return function(...args) {
        try {
            return renderFn(...args);
        } catch (error) {
            logOnce(`ui_error_${uiSectionName}`, `[UI Error][${uiSectionName}] ${error.message}`);
            if (window.diagnosticsAgent) {
                window.diagnosticsAgent.logError(error, { section: uiSectionName });
            }
            if (fallbackHTML && args[0] instanceof HTMLElement) {
                const container = args[0];
                container.innerHTML = `<div class="error-boundary-fallback" data-section="${uiSectionName}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>This section could not be loaded.</p>
                    <button class="error-retry-btn" data-section="${uiSectionName}">Retry</button>
                </div>`;
                const retryBtn = container.querySelector('.error-retry-btn');
                if (retryBtn) retryBtn.addEventListener('click', () => {
                    renderFn(...args);
                });
            }
            return null;
        }
    };
}

// ----------------------------------------------------------------------
// 7. PROGRESSIVE RENDERING PIPELINE
// ----------------------------------------------------------------------
const UIPipeline = {
    skeleton() {
        if (DOM.marketplaceListContent && !DOM.marketplaceListContent.children.length) {
            DOM.marketplaceListContent.innerHTML = `
                <div class="skeleton-loading">
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                </div>
            `;
        }
        if (DOM.spotlightListings && !DOM.spotlightListings.children.length) {
            DOM.spotlightListings.innerHTML = `
                <div class="skeleton-spotlight"></div>
                <div class="skeleton-spotlight"></div>
            `;
        }
    },

    initialRender() {
        this.renderWithCache();
        this.updateMyListingsPreview();
        this.updatePremiumStatusUI();
        this.updateStreakIndicator();
        this.updateMoodFilterIndicator();
        this.updateConnectionStatus();
        this.updateEnvironmentIndicator();
        this.startHealthMonitoring();
    },

    progressiveEnhancement() {
        setTimeout(() => {
            this.renderSpotlightFromData();
            if (typeof Chart !== 'undefined') this.initAnalyticsChart();
            this.loadServiceCategories();
            this.loadGroupsForSelection();
            this.loadFriendsForSelection();
            this.generateHeatmap();
            this.setupCreateListingTabs();
            this.setupAvailabilityOptions();
            this.setupCircleOptions();
            this.setupTemplateOptions();
            this.setupMoodOptions();
            this.setupDurationOptions();
            this.setupScheduleOptions();
            this.setupExportOptions();
            this.setupPaymentMethods();
            this.setupDebugTools();
        }, 50);
    },

    liveUpdate() {
        this.renderMarketplaceList();
    },

    renderWithCache() {
        if (!DOM.marketplaceListContent) return;
        const cached = this.getCachedListings();
        if (cached.length) {
            DOM.marketplaceListContent.innerHTML = '';
            cached.forEach(listing => renderers.addListingItem(listing));
        }
    },

    getCachedListings() {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEYS ? LOCAL_STORAGE_KEYS.ALL_LISTINGS : 'allListings');
            return stored ? JSON.parse(stored).filter(l => !isListingExpired(l)) : [];
        } catch {
            return [];
        }
    },

    renderMarketplaceList: function() {
        return renderers.marketplaceList();
    },

    renderSpotlightFromData: function() {
        return renderers.spotlight();
    },

    updateMyListingsPreview: function() {
        return renderers.myListingsPreview();
    },

    updatePremiumStatusUI: function() {
        return renderers.premiumStatusUI();
    },

    updateStreakIndicator: function() {
        return renderers.streakIndicator();
    },

    updateMoodFilterIndicator: function() {
        return renderers.moodFilterIndicator();
    },

    initAnalyticsChart: function() {
        return renderers.analyticsChart();
    },

    loadServiceCategories: function() {
        return renderers.loadServiceCategories();
    },

    loadGroupsForSelection: function() {
        return renderers.loadGroupsForSelection();
    },

    loadFriendsForSelection: function() {
        return renderers.loadFriendsForSelection();
    },

    generateHeatmap: function() {
        return renderers.generateHeatmap();
    },

    setupCreateListingTabs: function() {
        return renderers.setupCreateListingTabs();
    },

    setupAvailabilityOptions: function() {
        return renderers.setupAvailabilityOptions();
    },

    setupCircleOptions: function() {
        return renderers.setupCircleOptions();
    },

    setupTemplateOptions: function() {
        return renderers.setupTemplateOptions();
    },

    setupMoodOptions: function() {
        return renderers.setupMoodOptions();
    },

    setupDurationOptions: function() {
        return renderers.setupDurationOptions();
    },

    setupScheduleOptions: function() {
        return renderers.setupScheduleOptions();
    },

    setupExportOptions: function() {
        return renderers.setupExportOptions();
    },

    setupPaymentMethods: function() {
        return renderers.setupPaymentMethods();
    },
    
    setupDebugTools: function() {
        if (DOM.debugToggle) {
            EventController.addListener(DOM.debugToggle, 'click', () => {
                if (DOM.debugPanel) {
                    const isVisible = DOM.debugPanel.style.display === 'block';
                    DOM.debugPanel.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) {
                        this.updateDebugPanel();
                        // Start periodic updates
                        const cleanup = EventController.addInterval('debug-update', () => this.updateDebugPanel(), 2000);
                        DOM.debugToggle.dataset.cleanup = cleanup;
                    } else {
                        // Stop updates
                        if (DOM.debugToggle.dataset.cleanup) {
                            const cleanupFn = DOM.debugToggle.dataset.cleanup;
                            if (typeof cleanupFn === 'function') cleanupFn();
                        }
                    }
                }
            });
        }
    },
    
    updateDebugPanel() {
        if (!DOM.debugPanel) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const handshakeStatus = window.marketplaceCore?.diagnostics?.getStatus?.()?.handshake || {};
        const sessionStatus = {
            valid: hasValidSession ? hasValidSession() : false,
            guest: AppState?._STATE?.guestMode || false,
            demo: AppState?._STATE?.demoMode || false
        };
        const environment = AppState?.getEnvironment?.() || { type: 'unknown', latency: 0 };
        const startupStatus = AppState?.getStartupStatus?.() || { stage: 'unknown' };
        const recoveryStatus = AppState?.getRecoveryStatus?.() || { inProgress: false };
        
        DOM.debugPanel.innerHTML = `
            <div style="color: #fff; margin-bottom: 8px; font-weight: bold;">🔍 DEBUG PANEL v5.0</div>
            <div><span style="color: #888;">Environment:</span> ${environment.type} (${environment.latency || 0}ms) ${environment.isVPN ? '🌐 VPN' : ''}</div>
            <div><span style="color: #888;">Startup:</span> ${startupStatus.stage || 'unknown'} (${startupStatus.attempts || 0}/${startupStatus.maxAttempts || 0})</div>
            <div><span style="color: #888;">Handshake:</span> ${handshakeStatus.stage || 'unknown'} (${handshakeStatus.complete ? '✅' : '⏳'})</div>
            <div><span style="color: #888;">Session:</span> ${sessionStatus.valid ? '✅' : '❌'} ${sessionStatus.guest ? '(guest)' : sessionStatus.demo ? '(demo)' : ''}</div>
            <div><span style="color: #888;">Parent responding:</span> ${health.responding ? '✅' : '❌'}</div>
            <div><span style="color: #888;">Recovery:</span> ${recoveryStatus.inProgress ? '🔄' : '✓'} ${recoveryStatus.strategy || ''}</div>
            <div><span style="color: #888;">Last message:</span> ${health.lastMessage ? new Date(health.lastMessage).toLocaleTimeString() : 'never'}</div>
            <div><span style="color: #888;">Missed heartbeats:</span> ${health.missedHeartbeats || 0}</div>
            <div><span style="color: #888;">Listings:</span> ${allListings?.length || 0} total, ${myListings?.length || 0} mine</div>
            <div><span style="color: #888;">User:</span> ${window.currentUser?.displayName || 'none'}</div>
            <div><span style="color: #888;">Frame ID:</span> ${AppState?._STATE?.frameId || 'unknown'}</div>
            <div><span style="color: #888;">Queued actions:</span> ${UIState.pendingActions.length}</div>
            <div style="margin-top: 8px; color: #888; font-size: 10px;">${new Date().toLocaleTimeString()}</div>
        `;
    },
    
    updateConnectionStatus() {
        if (!DOM.connectionStatusIndicator || !DOM.handshakeStatusIndicator || !DOM.sessionStatusIndicator) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const handshakeComplete = AppState?._STATE?.handshakeComplete || false;
        const sessionActive = AppState?._STATE?.sessionActive || false;
        const guestMode = AppState?._STATE?.guestMode || false;
        const recoveryMode = AppState?._STATE?.recoveryMode || false;
        
        // Connection status
        let connectionColor = '#ff9800';
        let connectionText = 'Connecting';
        
        if (health.responding) {
            connectionColor = '#4caf50';
            connectionText = 'Connected';
        } else if (health.missedHeartbeats > 3) {
            connectionColor = '#f44336';
            connectionText = 'Disconnected';
        }
        
        DOM.connectionStatusIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${connectionColor};"></span> ${connectionText}`;
        
        // Handshake status
        const handshakeColor = handshakeComplete ? '#4caf50' : '#ff9800';
        DOM.handshakeStatusIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${handshakeColor};"></span> ${handshakeComplete ? 'Complete' : 'Pending'}`;
        
        // Session status
        let sessionColor = '#f44336';
        let sessionText = 'Inactive';
        if (sessionActive) {
            sessionColor = '#4caf50';
            sessionText = 'Active';
        } else if (guestMode) {
            sessionColor = '#ff9800';
            sessionText = 'Guest';
        }
        DOM.sessionStatusIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${sessionColor};"></span> ${sessionText}`;
    },
    
    updateEnvironmentIndicator() {
        if (!DOM.environmentIndicator) return;
        
        const environment = AppState?.getEnvironment?.() || { type: ENVIRONMENT_TYPES.UNKNOWN };
        const envColors = {
            [ENVIRONMENT_TYPES.LOCAL_DEV]: '#4caf50',
            [ENVIRONMENT_TYPES.RENDER_HOSTED]: '#2196F3',
            [ENVIRONMENT_TYPES.VPN_NETWORK]: '#ff9800',
            [ENVIRONMENT_TYPES.PRODUCTION]: '#9c27b0',
            [ENVIRONMENT_TYPES.UNKNOWN]: '#9e9e9e'
        };
        
        const envNames = {
            [ENVIRONMENT_TYPES.LOCAL_DEV]: 'Local',
            [ENVIRONMENT_TYPES.RENDER_HOSTED]: 'Render',
            [ENVIRONMENT_TYPES.VPN_NETWORK]: 'VPN',
            [ENVIRONMENT_TYPES.PRODUCTION]: 'Prod',
            [ENVIRONMENT_TYPES.UNKNOWN]: 'Unknown'
        };
        
        const color = envColors[environment.type] || '#9e9e9e';
        const name = envNames[environment.type] || 'Unknown';
        const latency = environment.latency ? `${environment.latency}ms` : '';
        
        DOM.environmentIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span> ${name} ${latency}`;
    },
    
    updateStartupStageIndicator() {
        if (!DOM.startupStageIndicator) return;
        
        const startupStatus = AppState?.getStartupStatus?.() || { stage: STARTUP_STAGES.IDLE };
        const stageColors = {
            [STARTUP_STAGES.IDLE]: '#9e9e9e',
            [STARTUP_STAGES.WAITING]: '#ff9800',
            [STARTUP_STAGES.HANDSHAKING]: '#2196F3',
            [STARTUP_STAGES.SYNCING]: '#9c27b0',
            [STARTUP_STAGES.ACTIVE]: '#4caf50',
            [STARTUP_STAGES.DEGRADED]: '#ff9800',
            [STARTUP_STAGES.RECOVERING]: '#f44336',
            [STARTUP_STAGES.FAILED]: '#f44336'
        };
        
        const stageNames = {
            [STARTUP_STAGES.IDLE]: 'Idle',
            [STARTUP_STAGES.WAITING]: 'Waiting',
            [STARTUP_STAGES.HANDSHAKING]: 'Handshake',
            [STARTUP_STAGES.SYNCING]: 'Syncing',
            [STARTUP_STAGES.ACTIVE]: 'Active',
            [STARTUP_STAGES.DEGRADED]: 'Degraded',
            [STARTUP_STAGES.RECOVERING]: 'Recovering',
            [STARTUP_STAGES.FAILED]: 'Failed'
        };
        
        const color = stageColors[startupStatus.stage] || '#9e9e9e';
        const name = stageNames[startupStatus.stage] || startupStatus.stage;
        
        DOM.startupStageIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span> ${name}`;
    },
    
    startHealthMonitoring() {
        // Clear any existing intervals
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
        
        this.healthInterval = setInterval(() => {
            this.updateConnectionStatus();
            this.updateEnvironmentIndicator();
            this.updateStartupStageIndicator();
        }, 3000);
    }
};

// ----------------------------------------------------------------------
// 8. CORE BRIDGE – VALIDATED SUBSCRIPTIONS
// ----------------------------------------------------------------------
const CoreBridge = {
    init() {
        window.addEventListener('marketplaceCoreReady', this.handleCoreReady.bind(this));
        window.addEventListener('coreInitialized', this.handleCoreInit.bind(this));
        window.addEventListener('coreDataUpdated', this.handleDataUpdate.bind(this));
        window.addEventListener('marketplaceSessionReady', this.handleSessionReady.bind(this));
        
        // New event listeners
        window.addEventListener('marketplace:page-activated', this.handlePageActivated.bind(this));
        window.addEventListener('marketplace:navigate', this.handleNavigate.bind(this));
        window.addEventListener('marketplace:recovery-mode', this.handleRecoveryMode.bind(this));
        window.addEventListener('marketplace:environment-updated', this.handleEnvironmentUpdated.bind(this));
        window.addEventListener('marketplace:startup-updated', this.handleStartupUpdated.bind(this));
        window.addEventListener('transport:unresponsive', this.handleTransportUnresponsive.bind(this));
        window.addEventListener('recovery:completed', this.handleRecoveryCompleted.bind(this));
    },

    handleCoreReady(e) {
        logOnce('core_ready', '[UI Bridge] Core ready');
        UIPipeline.progressiveEnhancement();
        UIPipeline.liveUpdate();
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateEnvironmentIndicator();
        UIPipeline.updateStartupStageIndicator();
    },

    handleCoreInit(e) {
        logOnce('core_init', '[UI Bridge] Core initialized');
        UIPipeline.initialRender();
    },

    handleDataUpdate(e) {
        const { type, data } = e?.detail || {};
        if (!type) return;
        EventController.addDebounced('data-update-render', () => {
            UIPipeline.liveUpdate();
        }, 150);
    },

    handleSessionReady(e) {
        logOnce('session_ready', '[UI Bridge] Session ready');
        this.refreshUserUI();
        UIPipeline.initialRender();
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateEnvironmentIndicator();
    },
    
    handlePageActivated(e) {
        logOnce('page_activated', '[UI Bridge] Page activated');
        if (e?.detail?.refresh) {
            UIPipeline.liveUpdate();
        }
    },
    
    handleNavigate(e) {
        if (e?.detail?.hash) {
            const element = document.getElementById(e.detail.hash.replace('#', ''));
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        }
    },
    
    handleRecoveryMode(e) {
        UIState.recoveryModeActive = e?.detail?.active || false;
        UIPipeline.updateConnectionStatus();
        
        if (UIState.recoveryModeActive) {
            // Show subtle indicator without blocking UI
            const statusBar = document.getElementById('connectionStatusBar');
            if (statusBar) {
                statusBar.style.opacity = '1';
                statusBar.style.background = 'rgba(244, 67, 54, 0.9)';
            }
        }
    },
    
    handleRecoveryCompleted(e) {
        UIState.recoveryModeActive = false;
        UIPipeline.updateConnectionStatus();
        
        const statusBar = document.getElementById('connectionStatusBar');
        if (statusBar) {
            statusBar.style.background = 'rgba(0,0,0,0.7)';
        }
        
        // Process any queued actions
        processQueuedUIActions();
    },
    
    handleTransportUnresponsive(e) {
        UIPipeline.updateConnectionStatus();
    },
    
    handleEnvironmentUpdated(e) {
        UIState.environmentType = e?.detail?.type || ENVIRONMENT_TYPES.UNKNOWN;
        UIPipeline.updateEnvironmentIndicator();
    },
    
    handleStartupUpdated(e) {
        UIState.startupStage = e?.detail?.stage || STARTUP_STAGES.IDLE;
        UIPipeline.updateStartupStageIndicator();
    },

    refreshUserUI() {
        if (DOM.myListingsAvatar) {
            if (window.userData?.photoURL) {
                DOM.myListingsAvatar.style.backgroundImage = `url('${escapeHtml(window.userData.photoURL)}')`;
                DOM.myListingsAvatar.style.backgroundSize = 'cover';
                DOM.myListingsAvatar.style.backgroundPosition = 'center';
                DOM.myListingsAvatar.innerHTML = '';
            } else {
                const initials = window.userData?.displayName
                    ? window.userData.displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
                    : 'ME';
                DOM.myListingsAvatar.innerHTML = `<span style="color: white; font-size: 20px; font-weight: 500;">${initials}</span>`;
                DOM.myListingsAvatar.style.backgroundImage = '';
            }
        }
        if (DOM.myListingsName) {
            DOM.myListingsName.innerHTML = window.userData?.displayName || 'My Marketplace';
            if (streakData?.currentStreak > 0) {
                DOM.myListingsName.innerHTML += ` <span class="streak-indicator" style="display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; background: #ff9800; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;"><i class="fas fa-fire"></i> ${streakData.currentStreak}</span>`;
            }
        }
    }
};

// ----------------------------------------------------------------------
// 9. RENDERERS (all wrapped with error boundaries)
// ----------------------------------------------------------------------
const renderers = {
    marketplaceList: withErrorBoundary('MarketplaceList', function() {
        if (!DOM.marketplaceListContent) return;
        DOM.marketplaceListContent.innerHTML = '';

        if (!allListings || allListings.length === 0) {
            DOM.marketplaceListContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-store-alt" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No listings available yet</p>
                    <p class="subtext">Be the first to create a listing!</p>
                    <button class="action-btn primary" style="margin-top: 20px;" id="emptyStateCreateBtn">
                        <i class="fas fa-plus"></i> Create Listing
                    </button>
                </div>
            `;
            const createBtn = document.getElementById('emptyStateCreateBtn');
            if (createBtn) {
                createBtn.addEventListener('click', () => showCreateListingModal());
            }
            return;
        }

        let filtered = [...allListings];
        if (currentMoodFilter) {
            filtered = filterListingsByMood(filtered, currentMoodFilter);
        }

        // Apply active tab filter
        switch (UIState.activeTab) {
            case 'services':
                filtered = filtered.filter(l => l.type === LISTING_TYPES?.SERVICE);
                break;
            case 'digital':
                filtered = filtered.filter(l => l.type === LISTING_TYPES?.DIGITAL);
                break;
            case 'friends':
                const friendIds = userFriends ? userFriends.map(f => f.id) : [];
                filtered = filtered.filter(l => friendIds.includes(l.userId));
                break;
            case 'groups':
                filtered = filtered.filter(l => l.visibility === TRUST_CIRCLES?.GROUPS);
                break;
            case 'my':
                const userId = sessionData?.userId || window.currentUser?.id;
                filtered = filtered.filter(l => l.userId === userId);
                break;
            case 'premium':
                filtered = filtered.filter(l => l.premium === true);
                break;
            case 'spotlight':
                filtered = filtered.filter(l => l.featured === true);
                break;
        }

        filtered.sort((a, b) => {
            const aFeatured = a.featured || a.boosted ? 1 : 0;
            const bFeatured = b.featured || b.boosted ? 1 : 0;
            if (aFeatured !== bFeatured) return bFeatured - aFeatured;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        filtered.forEach(listing => {
            if (isListingVisibleToUser(listing)) this.addListingItem(listing);
        });
        
        if (filtered.length === 0) {
            DOM.marketplaceListContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-filter" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>No listings match your filters</p>
                    <p class="subtext">Try a different category or clear your mood filter</p>
                </div>
            `;
        }
        
        if (DOM.availableListingsCount) {
            DOM.availableListingsCount.textContent = filtered.length;
        }
    }, '<div class="error-placeholder">Failed to load listings</div>'),

    addListingItem: withErrorBoundary('AddListingItem', function(listing) {
        if (!DOM.marketplaceListContent || !listing) return;
        
        // Check if already exists
        if (document.querySelector(`.listing-item[data-listing-id="${listing.id}"]`)) return;
        
        const item = document.createElement('div');
        item.className = 'listing-item';
        if (listing.featured || listing.boosted) item.classList.add('featured');
        if (listing.premium) item.classList.add('premium-listing');
        item.dataset.listingId = listing.id;
        item.dataset.userId = listing.userId;

        const userName = listing.user?.displayName || 'Unknown User';
        const userInitials = userName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
        const availabilityClass = `availability-${listing.availability || 'free'}`;
        const availabilityText = listing.availability ? listing.availability.charAt(0).toUpperCase() + listing.availability.slice(1) : 'Available';

        // Build badges
        let badges = '';
        if (listing.featured) badges += '<span class="featured-badge"><i class="fas fa-star"></i> FEATURED</span>';
        if (listing.boosted) badges += '<span class="premium-badge"><i class="fas fa-bolt"></i> BOOSTED</span>';
        if (listing.verified) badges += '<span class="verified-badge"><i class="fas fa-check-circle"></i> VERIFIED</span>';
        if (listing.teamListing) badges += '<span class="team-badge"><i class="fas fa-users"></i> TEAM</span>';
        if (listing.premium && !listing.featured && !listing.boosted) badges += '<span class="premium-badge"><i class="fas fa-crown"></i> PREMIUM</span>';

        item.innerHTML = `
            <div class="listing-avatar" style="${listing.type === LISTING_TYPES?.DIGITAL ? 'background-color: #4caf50;' : ''}">
                ${listing.type === LISTING_TYPES?.DIGITAL ? '<i class="fas fa-file-alt" style="font-size: 20px;"></i>' : 
                  listing.type === LISTING_TYPES?.SERVICE ? '<i class="fas fa-tools" style="font-size: 20px;"></i>' :
                  listing.user?.photoURL ? '' : `<span style="color: white; font-size: 18px; font-weight: 500;">${escapeHtml(userInitials)}</span>`}
            </div>
            <div class="listing-info">
                <div class="listing-name">
                    <span class="listing-title">${escapeHtml(listing.title || 'Untitled')}</span>
                    ${listing.price ? `<span class="listing-price">${escapeHtml(listing.price)}</span>` : ''}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0;">
                    ${badges}
                </div>
                <div class="listing-time">
                    <span><i class="far fa-clock"></i> ${listing.createdAt ? formatTimeAgo(new Date(listing.createdAt)) : 'Just now'}</span>
                    <span class="availability-badge ${availabilityClass}"><i class="fas fa-${listing.availability === 'urgent' ? 'exclamation-circle' : listing.availability === 'busy' ? 'clock' : 'check-circle'}"></i> ${availabilityText}</span>
                    ${getTrustIndicator ? getTrustIndicator(listing.userId, listing.user?.trustLevel) : ''}
                </div>
                <div class="listing-preview">
                    ${escapeHtml((listing.description || '').substring(0, 80))}${listing.description?.length > 80 ? '...' : ''}
                </div>
            </div>
        `;

        if (listing.user?.photoURL && listing.type === LISTING_TYPES?.SERVICE) {
            const avatarDiv = item.querySelector('.listing-avatar');
            avatarDiv.style.backgroundImage = `url('${escapeHtml(listing.user.photoURL)}')`;
            avatarDiv.style.backgroundSize = 'cover';
            avatarDiv.style.backgroundPosition = 'center';
            avatarDiv.innerHTML = '';
        }

        item.addEventListener('click', () => renderers.viewListingDetail(listing));
        DOM.marketplaceListContent.appendChild(item);
    }, null),

    viewListingDetail: withErrorBoundary('ViewListingDetail', function(listing) {
        if (!DOM.marketplaceDetailPanel || !listing) return;
        UIState.currentListingId = listing.id;
        UIState.currentListingData = listing;
        UIState.viewHistory.push({ id: listing.id, timestamp: Date.now() });

        if (DOM.detailName) DOM.detailName.textContent = listing.user?.displayName || 'User';
        if (DOM.detailTime) {
            DOM.detailTime.innerHTML = `<i class="far fa-clock"></i> ${listing.createdAt ? formatTimeAgo(new Date(listing.createdAt)) : 'Just now'}`;
        }

        if (DOM.detailAvatar) {
            if (listing.user?.photoURL) {
                DOM.detailAvatar.style.backgroundImage = `url('${escapeHtml(listing.user.photoURL)}')`;
                DOM.detailAvatar.style.backgroundSize = 'cover';
                DOM.detailAvatar.style.backgroundPosition = 'center';
                DOM.detailAvatar.innerHTML = '';
            } else {
                const initials = listing.user?.displayName?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'U';
                DOM.detailAvatar.innerHTML = `<span style="color: white; font-size: 24px; font-weight: 500;">${initials}</span>`;
                DOM.detailAvatar.style.backgroundImage = '';
            }
        }

        if (DOM.marketplaceDetailContent) {
            this.renderListingDetailContent(listing, DOM.marketplaceDetailContent);
        }

        DOM.marketplaceDetailPanel.classList.add('active');
        if (trackListingView) trackListingView(listing.id);
        
        // Update save button state
        if (DOM.saveListingBtn) {
            const isSaved = savedItems?.some(item => item.id === listing.id);
            DOM.saveListingBtn.innerHTML = `<i class="fas fa-${isSaved ? 'bookmark' : 'bookmark'}"></i>`;
            DOM.saveListingBtn.style.color = isSaved ? 'var(--primary-color)' : '';
        }
    }, null),

    renderListingDetailContent: withErrorBoundary('ListingDetailContent', function(listing, container) {
        if (!container) return;
        let html = '';

        // Media section
        if (listing.videoIntro) {
            html += `<div class="file-preview" style="margin-bottom: 20px;">
                <video controls class="listing-detail-media" poster="${listing.mediaUrl || ''}">
                    <source src="${escapeHtml(listing.videoIntro)}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>`;
        } else if (listing.mediaUrl) {
            html += `<div class="file-preview">
                <img src="${escapeHtml(listing.mediaUrl)}" class="listing-detail-media" alt="${escapeHtml(listing.title)}" loading="lazy">
            </div>`;
        }
        
        // AR Preview for premium
        if (listing.arPreview && isUserPremium()) {
            html += `<div class="ar-preview-container" style="margin-bottom: 20px;">
                <div class="ar-preview-placeholder">
                    <i class="fas fa-vr-cardboard" style="font-size: 48px; margin-bottom: 10px; color: var(--primary-color);"></i>
                    <p style="font-weight: 500;">AR Preview Available</p>
                    <button class="action-btn secondary" style="margin-top: 10px;" id="viewArBtn">
                        <i class="fas fa-eye"></i> View in AR
                    </button>
                </div>
            </div>`;
        }

        // Title and badges
        let badges = '';
        if (listing.featured) badges += '<span class="featured-badge"><i class="fas fa-star"></i> FEATURED</span>';
        if (listing.boosted) badges += '<span class="premium-badge"><i class="fas fa-bolt"></i> BOOSTED</span>';
        if (listing.verified) badges += '<span class="verified-badge"><i class="fas fa-check-circle"></i> VERIFIED</span>';
        if (listing.teamListing) badges += '<span class="team-badge"><i class="fas fa-users"></i> TEAM</span>';

        html += `
            <h1 class="listing-detail-title">
                ${escapeHtml(listing.title || 'Untitled')}
                <div style="display: inline-flex; gap: 8px; margin-left: 10px;">${badges}</div>
            </h1>
            <div class="listing-detail-price">
                ${listing.price ? escapeHtml(listing.price) : 'Free'}
                ${listing.acceptsTips ? '<span class="tips-badge" style="margin-left: 10px;"><i class="fas fa-gift"></i> Accepts Tips</span>' : ''}
            </div>
            <div class="listing-detail-description">
                ${escapeHtml(listing.description || 'No description provided.').replace(/\n/g, '<br>')}
            </div>
            
            <div class="listing-detail-meta">
                <span class="meta-badge"><i class="fas fa-${listing.type === LISTING_TYPES?.DIGITAL ? 'file-alt' : 'tools'}"></i> ${listing.type === LISTING_TYPES?.DIGITAL ? 'Digital Item' : 'Service'}</span>
                <span class="meta-badge availability-${listing.availability || 'free'}"><i class="fas fa-${listing.availability === 'urgent' ? 'exclamation-circle' : listing.availability === 'busy' ? 'clock' : 'check-circle'}"></i> ${listing.availability ? listing.availability.charAt(0).toUpperCase() + listing.availability.slice(1) : 'Available'}</span>
                ${listing.visibility ? `<span class="meta-badge ${listing.visibility === 'premium' || listing.visibility === 'micro' ? 'premium-feature' : ''}"><i class="fas fa-${listing.visibility === 'friends' ? 'user-friends' : listing.visibility === 'groups' ? 'users' : listing.visibility === 'selected' ? 'user-check' : listing.visibility === 'premium' ? 'crown' : listing.visibility === 'micro' ? 'bullseye' : 'globe'}"></i> ${listing.visibility === 'friends' ? 'Friends Only' : listing.visibility === 'groups' ? 'Group Members' : listing.visibility === 'selected' ? 'Selected People' : listing.visibility === 'premium' ? 'Premium Only' : listing.visibility === 'micro' ? 'Micro-Audience' : 'Public'}</span>` : ''}
                ${listing.moodContext ? `<span class="meta-badge ${listing.moodContext === 'creative' || listing.moodContext === 'business' ? 'premium-feature' : ''}"><i class="fas fa-${listing.moodContext === 'help' ? 'hands-helping' : listing.moodContext === 'learn' ? 'graduation-cap' : listing.moodContext === 'urgent' ? 'bolt' : listing.moodContext === 'creative' ? 'palette' : listing.moodContext === 'business' ? 'briefcase' : 'search'}"></i> ${listing.moodContext === 'help' ? 'Help Needed' : listing.moodContext === 'learn' ? 'Learning' : listing.moodContext === 'urgent' ? 'Urgent' : listing.moodContext === 'creative' ? 'Creative' : listing.moodContext === 'business' ? 'Business' : 'Browsing'}</span>` : ''}
                ${listing.template ? `<span class="meta-badge ${listing.template === 'business' || listing.template === 'coaching' || listing.template === 'vip' ? 'premium-feature' : ''}"><i class="fas fa-${listing.template === 'business' ? 'briefcase' : listing.template === 'coaching' ? 'chalkboard-teacher' : listing.template === 'creative' ? 'palette' : listing.template === 'vip' ? 'crown' : listing.template === 'digital' ? 'download' : 'file-alt'}"></i> ${listing.template === 'business' ? 'Business' : listing.template === 'coaching' ? 'Coaching' : listing.template === 'creative' ? 'Creative' : listing.template === 'vip' ? 'VIP' : listing.template === 'digital' ? 'Digital' : 'Basic'}</span>` : ''}
                <span class="meta-badge trust-${listing.user?.trustLevel || 'new'}"><i class="fas fa-${listing.user?.trustLevel === 'verified' ? 'shield-alt' : listing.user?.trustLevel === 'pro' ? 'crown' : listing.user?.trustLevel === 'responsive' ? 'comments' : 'star'}"></i> ${listing.user?.trustLevel ? listing.user.trustLevel.charAt(0).toUpperCase() + listing.user.trustLevel.slice(1) : 'New'}</span>
            </div>
            
            ${listing.teamMembers && listing.teamMembers.length > 0 ? `<div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;"><i class="fas fa-users" style="font-size: 20px;"></i><div style="font-weight: 600;">Team Listing</div></div>
                <div style="font-size: 14px;">Managed by ${listing.teamMembers.length} team member${listing.teamMembers.length > 1 ? 's' : ''}</div>
                <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${listing.teamMembers.map(m => `<span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 12px;">${escapeHtml(m.name || 'Team Member')}</span>`).join('')}
                </div>
            </div>` : ''}
            
            ${listing.expiresAt ? `<div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border-radius: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-clock" style="color: var(--warning-color); font-size: 20px;"></i>
                    <div>
                        <div style="font-weight: 500;">Expires ${formatTimeRemaining ? formatTimeRemaining(new Date(listing.expiresAt)) : listing.expiresAt}</div>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-top: 4px;">Listed ${formatTimeAgo(new Date(listing.createdAt || Date.now()))}</div>
                    </div>
                </div>
                ${listing.autoRenew ? `<div style="margin-top: 10px; padding: 10px; background-color: rgba(52, 199, 89, 0.1); border-radius: 8px; border: 1px solid rgba(52, 199, 89, 0.2);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-sync-alt" style="color: var(--success-color);"></i>
                        <span style="font-size: 14px;">Auto-renew enabled</span>
                    </div>
                </div>` : ''}
            </div>` : ''}
            
            ${listing.reactions?.length ? `<div style="margin-top: 20px;">
                <div style="font-weight: 600; margin-bottom: 10px;">Reactions</div>
                <div class="reaction-picker" style="justify-content: flex-start;">
                    ${listing.reactions.map(r => `<div class="reaction-option ${r.premium ? 'premium' : ''}" style="cursor: default;">${r.emoji}<span style="font-size: 12px; margin-left: 5px; font-weight: 600;">${r.count}</span></div>`).join('')}
                </div>
            </div>` : ''}
        `;

        container.innerHTML = html;

        // Add AR button handler
        const arBtn = document.getElementById('viewArBtn');
        if (arBtn) {
            arBtn.addEventListener('click', () => {
                showNotification('AR preview feature coming soon!', 'info');
            });
        }

        // Add download button for digital items
        if (listing.type === LISTING_TYPES?.DIGITAL && listing.fileUrl) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'action-btn primary';
            downloadBtn.style.marginTop = '20px';
            downloadBtn.style.width = '100%';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download File';
            downloadBtn.addEventListener('click', () => {
                if (downloadDigitalFile) {
                    downloadDigitalFile(listing.id, listing.fileUrl, listing.fileName || 'download');
                }
            });
            container.appendChild(downloadBtn);
            
            // Add file info if available
            if (listing.fileName || listing.fileSize) {
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                fileInfo.style.marginBottom = '10px';
                fileInfo.style.padding = '10px';
                fileInfo.style.background = 'var(--secondary-color)';
                fileInfo.style.borderRadius = '8px';
                fileInfo.innerHTML = `
                    <span><i class="fas fa-file"></i> ${escapeHtml(listing.fileName || 'File')}</span>
                    <span style="float: right;">${listing.fileSize ? formatFileSize(listing.fileSize) : ''}</span>
                `;
                container.insertBefore(fileInfo, downloadBtn);
            }
        }
        
        // Add contact button for services
        if (listing.type === LISTING_TYPES?.SERVICE) {
            const contactBtn = document.createElement('button');
            contactBtn.className = 'action-btn secondary';
            contactBtn.style.marginTop = '20px';
            contactBtn.style.width = '100%';
            contactBtn.innerHTML = '<i class="fas fa-comment"></i> Message Seller';
            contactBtn.addEventListener('click', () => {
                if (openChat) {
                    openChat(listing.userId, listing.user?.displayName || 'Seller');
                }
            });
            container.appendChild(contactBtn);
        }
    }, '<div class="error-placeholder">Failed to load listing details</div>'),

    spotlight: withErrorBoundary('Spotlight', function() {
        if (!DOM.spotlightSection || !DOM.spotlightListings) return;
        const spotlight = allListings ? allListings.filter(l => l.featured && !isListingExpired(l)) : [];
        if (!spotlight.length) {
            DOM.spotlightSection.style.display = 'none';
            return;
        }
        DOM.spotlightSection.style.display = 'block';
        DOM.spotlightListings.innerHTML = '';
        spotlight.slice(0, 5).forEach(listing => {
            const item = document.createElement('div');
            item.className = 'spotlight-item';
            item.dataset.listingId = listing.id;
            
            const previewContent = listing.mediaUrl ? 
                `<div class="spotlight-preview" style="background-image: url('${escapeHtml(listing.mediaUrl)}'); background-size: cover; background-position: center;"></div>` :
                `<div class="spotlight-preview"><i class="fas fa-star" style="font-size: 24px; color: gold;"></i></div>`;
            
            item.innerHTML = `
                ${previewContent}
                <div class="spotlight-info">
                    <div class="spotlight-title">
                        <span>${escapeHtml(listing.title.substring(0, 40))}${listing.title.length > 40 ? '...' : ''}</span>
                        <span class="featured-badge" style="font-size: 10px;">FEATURED</span>
                    </div>
                    <div class="spotlight-seller">
                        <i class="fas fa-user-circle"></i> ${escapeHtml(listing.user?.displayName || 'Unknown')}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                        <span class="listing-price">${listing.price || 'Free'}</span>
                        <span style="font-size: 11px; color: var(--text-secondary);"><i class="far fa-clock"></i> ${formatTimeAgo(new Date(listing.createdAt || Date.now()))}</span>
                    </div>
                </div>
            `;
            
            item.addEventListener('click', () => renderers.viewListingDetail(listing));
            DOM.spotlightListings.appendChild(item);
        });
    }, null),

    myListingsPreview: withErrorBoundary('MyListingsPreview', function() {
        if (!DOM.myListingsText) return;
        const active = myListings ? myListings.filter(l => !isListingExpired(l)) : [];
        DOM.myListingsText.innerHTML = active.length ? 
            `<i class="fas fa-check-circle" style="color: var(--success-color);"></i> ${active.length} active listing${active.length > 1 ? 's' : ''}` : 
            'Tap to create your first listing';
    }, null),

    premiumStatusUI: withErrorBoundary('PremiumStatusUI', function() {
        const isPremiumActive = isUserPremium();
        if (DOM.premiumStatusBadge) DOM.premiumStatusBadge.style.display = isPremiumActive ? 'inline-flex' : 'none';
        if (DOM.premiumOptionsBtn) {
            DOM.premiumOptionsBtn.innerHTML = isPremiumActive ? 
                '<i class="fas fa-crown" style="color: gold;"></i> Premium' : 
                '<i class="fas fa-crown"></i> Upgrade';
        }
        
        document.querySelectorAll('.premium-feature').forEach(el => el.style.display = isPremiumActive ? 'block' : 'none');
        if (DOM.publishPremiumBtn) DOM.publishPremiumBtn.style.display = isPremiumActive ? 'flex' : 'none';
        
        const uploadInfo = document.querySelector('#digitalUploadArea p:nth-child(4)');
        if (uploadInfo) uploadInfo.innerHTML = isPremiumActive ? 
            '<i class="fas fa-check-circle" style="color: var(--success-color);"></i> Max: 500MB' : 
            '<i class="fas fa-info-circle"></i> Max: 50MB (Upgrade for 500MB)';
        
        if (DOM.arPreviewFeature) DOM.arPreviewFeature.style.display = isPremiumActive ? 'block' : 'none';
        if (DOM.teamNotesFeature) DOM.teamNotesFeature.style.display = (isPremiumActive && (userSubscription?.plan === 'business' || userSubscription?.plan === 'team')) ? 'block' : 'none';
        if (DOM.analyticsAlertsFeature) DOM.analyticsAlertsFeature.style.display = isPremiumActive ? 'block' : 'none';
        if (DOM.recurringPromoFeature) DOM.recurringPromoFeature.style.display = isPremiumActive ? 'block' : 'none';
        if (DOM.scheduleVisibilityFeature) DOM.scheduleVisibilityFeature.style.display = isPremiumActive ? 'block' : 'none';
    }, null),

    streakIndicator: withErrorBoundary('StreakIndicator', function() {
        if (!DOM.listingStreak) return;
        if (streakData?.currentStreak > 0) {
            DOM.listingStreak.style.display = 'inline-flex';
            if (DOM.streakCount) DOM.streakCount.textContent = streakData.currentStreak;
        } else {
            DOM.listingStreak.style.display = 'none';
        }
    }, null),

    moodFilterIndicator: withErrorBoundary('MoodFilterIndicator', function() {
        if (!DOM.moodFilterIndicator || !DOM.currentMoodFilter) return;
        if (currentMoodFilter) {
            DOM.moodFilterIndicator.style.display = 'flex';
            const labels = {
                [MOOD_CONTEXTS?.HELP]: 'Need Help',
                [MOOD_CONTEXTS?.LEARN]: 'Learning',
                [MOOD_CONTEXTS?.URGENT]: 'Urgent',
                [MOOD_CONTEXTS?.CREATIVE]: 'Creative',
                [MOOD_CONTEXTS?.BUSINESS]: 'Business'
            };
            DOM.currentMoodFilter.innerHTML = `<i class="fas fa-${currentMoodFilter === 'help' ? 'hands-helping' : currentMoodFilter === 'learn' ? 'graduation-cap' : currentMoodFilter === 'urgent' ? 'bolt' : currentMoodFilter === 'creative' ? 'palette' : currentMoodFilter === 'business' ? 'briefcase' : 'filter'}"></i> ${labels[currentMoodFilter] || 'Browsing'}`;
        } else {
            DOM.moodFilterIndicator.style.display = 'none';
        }
    }, null),

    teamMembers: withErrorBoundary('TeamMembers', function() {
        if (!DOM.teamMembersList) return;
        if (!teamMembers || !teamMembers.length) {
            DOM.teamMembersList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i><p>No team members yet</p><p style="font-size: 14px; margin-top: 10px;">Invite team members to collaborate</p></div>';
            return;
        }
        DOM.teamMembersList.innerHTML = '';
        teamMembers.forEach(member => {
            const el = document.createElement('div');
            el.className = 'team-member';
            el.innerHTML = `
                <div class="team-member-info">
                    <div class="team-member-avatar" style="background: ${member.photoURL ? `url('${escapeHtml(member.photoURL)}') center/cover` : '#667eea'};">
                        ${member.photoURL ? '' : '<i class="fas fa-user" style="color: white;"></i>'}
                    </div>
                    <div>
                        <div style="font-weight: 500;">${escapeHtml(member.displayName || member.email || 'Team Member')}</div>
                        <div class="team-member-role">${member.role || 'Member'} · Joined ${member.joinedAt ? formatTimeAgo(new Date(member.joinedAt)) : 'recently'}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <select class="text-input" style="font-size: 12px; padding: 5px 10px; width: 100px;" data-member-id="${escapeHtml(member.id)}">
                        <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
                        <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    <button class="marketplace-action-btn remove-member-btn" style="width: 36px; height: 36px; background: rgba(244, 67, 54, 0.1); color: #f44336;" data-member-id="${escapeHtml(member.id)}" title="Remove member">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            DOM.teamMembersList.appendChild(el);
        });
        
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const memberId = this.dataset.memberId;
                if (memberId && confirm('Remove this team member?')) {
                    const index = teamMembers.findIndex(m => m.id === memberId);
                    if (index !== -1) {
                        teamMembers.splice(index, 1);
                        saveToLocalStorage(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
                        renderers.teamMembers();
                        showNotification('Team member removed', 'success');
                    }
                }
            });
        });
        
        document.querySelectorAll('select[data-member-id]').forEach(select => {
            select.addEventListener('change', function() {
                const memberId = this.dataset.memberId;
                const newRole = this.value;
                const member = teamMembers.find(m => m.id === memberId);
                if (member) {
                    member.role = newRole;
                    saveToLocalStorage(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
                    showNotification(`Role updated to ${newRole}`, 'success');
                }
            });
        });
    }, null),

    leaderboard: withErrorBoundary('Leaderboard', function() {
        if (!DOM.leaderboardList) return;
        if (!leaderboardData || !leaderboardData.length) {
            DOM.leaderboardList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-trophy" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i><p>No leaderboard data yet</p><p style="font-size: 14px; margin-top: 10px;">Create listings to appear on the leaderboard</p></div>';
            return;
        }
        DOM.leaderboardList.innerHTML = '';
        leaderboardData.slice(0, 10).forEach((user, i) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            // Medal for top 3
            let medalHtml = '';
            if (i === 0) medalHtml = '<span style="color: gold; margin-left: 5px;">🥇</span>';
            else if (i === 1) medalHtml = '<span style="color: silver; margin-left: 5px;">🥈</span>';
            else if (i === 2) medalHtml = '<span style="color: #cd7f32; margin-left: 5px;">🥉</span>';
            
            item.innerHTML = `
                <div class="leaderboard-rank" style="background: ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? '#cd7f32' : 'rgba(0,0,0,0.1)'}; color: ${i < 3 ? 'white' : 'inherit'};">
                    ${i + 1}
                </div>
                <div class="team-member-avatar" style="width: 48px; height: 48px; background: ${user.photoURL ? `url('${escapeHtml(user.photoURL)}') center/cover` : '#667eea'};">
                    ${user.photoURL ? '' : '<i class="fas fa-user" style="color: white;"></i>'}
                </div>
                <div class="leaderboard-info">
                    <div style="font-weight: 600; display: flex; align-items: center;">
                        ${escapeHtml(user.displayName || 'Anonymous')}
                        ${medalHtml}
                    </div>
                    <div class="leaderboard-stats">
                        <span><i class="fas fa-list"></i> ${user.listingsCount || 0} listings</span>
                        <span><i class="fas fa-star" style="color: gold;"></i> ${user.rating || '5.0'}</span>
                        <span><i class="fas fa-check-circle" style="color: var(--success-color);"></i> ${user.successfulTransactions || 0} txns</span>
                    </div>
                </div>
                <div style="font-weight: 700; color: var(--primary-color); background: rgba(0,132,255,0.1); padding: 6px 12px; border-radius: 20px;">
                    ${user.points || 0} pts
                </div>
            `;
            
            DOM.leaderboardList.appendChild(item);
        });
    }, null),

    analyticsChart: withErrorBoundary('AnalyticsChart', function() {
        if (!DOM.analyticsChartCanvas || !window.Chart) return;
        if (DOM.analyticsChartInstance) DOM.analyticsChartInstance.destroy();
        
        // Generate sample data or use real analytics
        const viewsData = analyticsData?.dailyViews || [12, 19, 15, 25, 22, 30, 28];
        const savesData = analyticsData?.dailySaves || [5, 8, 6, 12, 10, 15, 13];
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        DOM.analyticsChartInstance = new Chart(DOM.analyticsChartCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: days,
                datasets: [
                    { 
                        label: 'Views', 
                        data: viewsData, 
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    { 
                        label: 'Saves', 
                        data: savesData, 
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
                        }
                    }
                }
            }
        });
    }, null),

    loadServiceCategories: withErrorBoundary('LoadServiceCategories', function() {
        const input = DOM.serviceTitle;
        if (!input) return;
        let datalist = document.getElementById('serviceCategories');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'serviceCategories';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = '';
        const categories = [...(SERVICE_CATEGORIES || []), ...(PREMIUM_CATEGORIES || [])];
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            if (PREMIUM_CATEGORIES && PREMIUM_CATEGORIES.includes(cat)) opt.className = 'premium-option';
            datalist.appendChild(opt);
        });
        input.setAttribute('list', 'serviceCategories');
    }, null),

    loadGroupsForSelection: withErrorBoundary('LoadGroupsForSelection', function() {
        if (!DOM.groupsList || !userGroups) return;
        DOM.groupsList.innerHTML = '';
        userGroups.forEach(g => {
            const el = document.createElement('div');
            el.className = 'circle-option';
            el.dataset.groupId = g.id;
            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white;">
                        <i class="fas fa-users"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${escapeHtml(g.name)}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${g.memberCount || 0} members</div>
                    </div>
                    <i class="fas fa-check" style="color: var(--primary-color); opacity: 0;"></i>
                </div>
            `;
            el.addEventListener('click', function() { 
                this.classList.toggle('selected');
                const check = this.querySelector('.fa-check');
                if (check) check.style.opacity = this.classList.contains('selected') ? '1' : '0';
            });
            DOM.groupsList.appendChild(el);
        });
    }, null),

    loadFriendsForSelection: withErrorBoundary('LoadFriendsForSelection', function() {
        if (!DOM.peopleList || !userFriends) return;
        DOM.peopleList.innerHTML = '';
        userFriends.forEach(f => {
            const el = document.createElement('div');
            el.className = 'circle-option';
            el.dataset.friendId = f.id;
            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${f.photoURL ? `url('${escapeHtml(f.photoURL)}') center/cover` : '#667eea'}; display: flex; align-items: center; justify-content: center; color: white;">
                        ${f.photoURL ? '' : '<i class="fas fa-user"></i>'}
                    </div>
                    <div style="flex: 1; font-weight: 500;">${escapeHtml(f.displayName)}</div>
                    <i class="fas fa-check" style="color: var(--primary-color); opacity: 0;"></i>
                </div>
            `;
            el.addEventListener('click', function() { 
                this.classList.toggle('selected');
                const check = this.querySelector('.fa-check');
                if (check) check.style.opacity = this.classList.contains('selected') ? '1' : '0';
            });
            DOM.peopleList.appendChild(el);
        });
        
        // Add search functionality
        if (DOM.peopleSearch) {
            DOM.peopleSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('#peopleList .circle-option').forEach(el => {
                    const name = el.querySelector('div:nth-child(2)')?.textContent?.toLowerCase() || '';
                    el.style.display = name.includes(term) ? 'flex' : 'none';
                });
            });
        }
    }, null),

    generateHeatmap: withErrorBoundary('GenerateHeatmap', function() {
        if (!DOM.engagementHeatmap) return;
        DOM.engagementHeatmap.innerHTML = '';
        for (let i = 0; i < 168; i++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            const engagement = Math.floor(Math.random() * 100);
            const intensity = Math.min(Math.floor(engagement / 20), 4);
            const colors = ['rgba(75,192,192,0.1)', 'rgba(75,192,192,0.3)', 'rgba(75,192,192,0.5)', 'rgba(75,192,192,0.7)', 'rgba(75,192,192,0.9)'];
            cell.style.backgroundColor = colors[intensity];
            cell.title = `${engagement} engagements`;
            if (engagement > 80) cell.innerHTML = '🔥';
            else if (engagement > 60) cell.innerHTML = '⭐';
            else if (engagement > 40) cell.innerHTML = '•';
            DOM.engagementHeatmap.appendChild(cell);
        }
    }, null),

    setupCreateListingTabs: withErrorBoundary('SetupCreateListingTabs', function() {
        document.querySelectorAll('.create-listing-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                if (!tabName) return;
                document.querySelectorAll('.create-listing-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                document.querySelectorAll('.create-listing-tab-content').forEach(c => c.classList.remove('active'));
                const content = document.getElementById(`${tabName}Tab`);
                if (content) content.classList.add('active');
                UIState.createListingActiveTab = tabName;
                if (tabName === 'circles') updateTrustCircleSelection();
                renderers.togglePublishButtons(tabName);
            });
        });
    }, null),

    setupAvailabilityOptions: withErrorBoundary('SetupAvailabilityOptions', function() {
        document.querySelectorAll('.availability-option').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.availability-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedAvailability = this.dataset.availability;
            });
        });
    }, null),

    setupCircleOptions: withErrorBoundary('SetupCircleOptions', function() {
        document.querySelectorAll('.circle-option[data-circle]').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.circle-option[data-circle]').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedTrustCircle = this.dataset.circle;
                updateTrustCircleSelection();
            });
        });
    }, null),

    setupTemplateOptions: withErrorBoundary('SetupTemplateOptions', function() {
        document.querySelectorAll('.template-option').forEach(opt => {
            opt.addEventListener('click', function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for premium templates', 'info');
                    return;
                }
                document.querySelectorAll('.template-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedTemplate = this.dataset.template;
            });
        });
    }, null),

    setupMoodOptions: withErrorBoundary('SetupMoodOptions', function() {
        document.querySelectorAll('.mood-option').forEach(opt => {
            opt.addEventListener('click', function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for premium mood filters', 'info');
                    return;
                }
                document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedMoodContext = this.dataset.mood;
            });
        });
    }, null),

    setupDurationOptions: withErrorBoundary('SetupDurationOptions', function() {
        document.querySelectorAll('.duration-option').forEach(opt => {
            opt.addEventListener('click', function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for extended durations', 'info');
                    return;
                }
                document.querySelectorAll('.duration-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedDuration = this.dataset.duration;
            });
        });
    }, null),

    setupScheduleOptions: withErrorBoundary('SetupScheduleOptions', function() {
        document.querySelectorAll('.schedule-option').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.schedule-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedSchedule = this.dataset.schedule;
            });
        });
    }, null),

    setupExportOptions: withErrorBoundary('SetupExportOptions', function() {
        document.querySelectorAll('.export-option').forEach(opt => {
            opt.addEventListener('click', function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for Excel exports', 'info');
                    return;
                }
                document.querySelectorAll('.export-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                if (exportAnalyticsData) exportAnalyticsData(this.dataset.format);
            });
        });
    }, null),

    setupPaymentMethods: withErrorBoundary('SetupPaymentMethods', function() {
        document.querySelectorAll('.payment-method').forEach(m => {
            m.addEventListener('click', function() {
                document.querySelectorAll('.payment-method').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                renderers.showPaymentFormForMethod(this.dataset.method);
            });
        });
    }, null),

    togglePublishButtons: withErrorBoundary('TogglePublishButtons', function(tab) {
        if (!DOM.publishPremiumBtn || !DOM.publishListingBtn) return;
        if (tab === 'premium' && isUserPremium()) {
            DOM.publishPremiumBtn.style.display = 'flex';
            DOM.publishListingBtn.style.display = 'none';
        } else {
            DOM.publishPremiumBtn.style.display = 'none';
            DOM.publishListingBtn.style.display = 'flex';
        }
    }, null),

    showPaymentFormForMethod: withErrorBoundary('ShowPaymentFormForMethod', function(method) {
        if (!DOM.cardPaymentForm) return;
        DOM.cardPaymentForm.style.display = method === 'card' ? 'block' : 'none';
        if (method === 'card') {
            DOM.paymentContainer.style.display = 'block';
        }
    }, null)
};

const {
    marketplaceList: renderMarketplaceList,
    addListingItem,
    viewListingDetail,
    renderListingDetailContent,
    spotlight: renderSpotlightFromData,
    myListingsPreview: updateMyListingsPreview,
    premiumStatusUI: updatePremiumStatusUI,
    streakIndicator: updateStreakIndicator,
    moodFilterIndicator: updateMoodFilterIndicator,
    teamMembers: renderTeamMembers,
    leaderboard: renderLeaderboard,
    analyticsChart: initAnalyticsChart,
    loadServiceCategories,
    loadGroupsForSelection,
    loadFriendsForSelection,
    generateHeatmap,
    togglePublishButtons,
    showPaymentFormForMethod
} = renderers;

// ----------------------------------------------------------------------
// 10. SECURITY – SANITIZATION UTILITY
// ----------------------------------------------------------------------
const sanitize = {
    html: (str) => escapeHtml ? escapeHtml(str) : String(str).replace(/[&<>"]/g, function(c) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        }[c];
    }),
    url: (url) => {
        if (!url) return '';
        const disallowed = ['javascript:', 'data:', 'vbscript:'];
        return disallowed.some(p => url.trim().toLowerCase().startsWith(p)) ? '' : url;
    },
    object: (obj) => {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch {
            return {};
        }
    }
};

// ----------------------------------------------------------------------
// 11. RESPONSIVE / TOUCH ENGINE
// ----------------------------------------------------------------------
const ResponsiveEngine = {
    init() {
        this.setViewportMeta();
        this.attachTouchOptimizations();
        window.addEventListener('resize', () => EventController.addDebounced('resize', this.adjustLayout.bind(this), 150));
        this.adjustLayout();
    },

    setViewportMeta() {
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes';
            document.head.appendChild(meta);
        }
    },

    attachTouchOptimizations() {
        document.querySelectorAll('button, .listing-item, .spotlight-item, .circle-option, .template-option, .availability-option, .mood-option, .duration-option, .schedule-option, .export-option').forEach(el => {
            el.addEventListener('touchstart', () => {}, { passive: true });
        });
    },

    adjustLayout() {
        const width = window.innerWidth;
        const isMobile = width <= 480;
        const isTablet = width > 480 && width <= 1024;
        document.documentElement.style.setProperty('--touch-target-size', isMobile ? '44px' : '36px');
        document.documentElement.style.setProperty('--font-scale', isMobile ? '0.9' : isTablet ? '1' : '1');
        
        // Adjust modal widths
        const modals = document.querySelectorAll('.create-listing-modal, .analytics-modal, .premium-options-modal, .team-management-modal');
        modals.forEach(modal => {
            if (modal.classList.contains('active')) {
                modal.style.padding = isMobile ? '10px' : '20px';
            }
        });
    }
};

// ----------------------------------------------------------------------
// 12. COMPATIBILITY LAYER
// ----------------------------------------------------------------------
const pageCore = {
    init: async () => {
        try {
            UIPipeline.skeleton();
            if (initializeMarketplaceCore) await initializeMarketplaceCore();
            CoreBridge.init();
            UIPipeline.initialRender();
            UIPipeline.progressiveEnhancement();
            
            // Expose to window for debugging
            window.marketplaceUI = { 
                renderMarketplaceList, 
                showCreateListingModal, 
                viewListingDetail, 
                renderers, 
                UIState,
                DOM,
                refresh: () => {
                    renderMarketplaceList();
                    updateMyListingsPreview();
                    updatePremiumStatusUI();
                },
                getDiagnostics: () => window.marketplaceCore?.diagnostics?.getReport?.(),
                getStatus: () => ({
                    canExecuteAction: canExecuteAction(),
                    pendingActions: UIState.pendingActions.length,
                    recoveryMode: UIState.recoveryModeActive,
                    environment: UIState.environmentType
                })
            };
            
            logOnce('ui_initialized', '[pageCore] UI initialized');
        } catch (err) {
            logOnce('ui_init_failed', '[pageCore.init] Failed');
        }
    }
};

// ----------------------------------------------------------------------
// 13. EVENT LISTENER SETUP (CENTRALIZED)
// ----------------------------------------------------------------------
function setupAllEventListeners() {
    // Category tabs
    if (DOM.allTab) EventController.addListener(DOM.allTab, 'click', () => {
        setActiveCategory('all');
        renderMarketplaceList();
    });
    if (DOM.servicesTab) EventController.addListener(DOM.servicesTab, 'click', () => {
        setActiveCategory('services');
        renderFilteredByType(LISTING_TYPES?.SERVICE, 'No services found');
    });
    if (DOM.digitalTab) EventController.addListener(DOM.digitalTab, 'click', () => {
        setActiveCategory('digital');
        renderFilteredByType(LISTING_TYPES?.DIGITAL, 'No digital items found');
    });
    if (DOM.friendsTab) EventController.addListener(DOM.friendsTab, 'click', () => {
        setActiveCategory('friends');
        renderFriendsListings();
    });
    if (DOM.groupsTab) EventController.addListener(DOM.groupsTab, 'click', () => {
        setActiveCategory('groups');
        renderGroupListings();
    });
    if (DOM.myTab) EventController.addListener(DOM.myTab, 'click', () => {
        setActiveCategory('my');
        renderMyListings();
    });
    if (DOM.premiumTab) EventController.addListener(DOM.premiumTab, 'click', () => {
        setActiveCategory('premium');
        renderPremiumListings();
    });
    if (DOM.spotlightTab) EventController.addListener(DOM.spotlightTab, 'click', () => {
        setActiveCategory('spotlight');
        renderSpotlightTab();
    });

    function setActiveCategory(tabId) {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`${tabId}Tab`);
        if (activeBtn) activeBtn.classList.add('active');
        UIState.activeTab = tabId;
    }

    // Create listing buttons
    if (DOM.createListingBtn) EventController.addListener(DOM.createListingBtn, 'click', showCreateListingModal);
    if (DOM.createListingQuickBtn) EventController.addListener(DOM.createListingQuickBtn, 'click', showCreateListingModal);
    if (DOM.sellServiceBtn) EventController.addListener(DOM.sellServiceBtn, 'click', () => {
        showCreateListingModal();
        switchCreateTab('service');
    });
    if (DOM.sellDigitalBtn) EventController.addListener(DOM.sellDigitalBtn, 'click', () => {
        showCreateListingModal();
        switchCreateTab('digital');
    });

    // Publish buttons
    if (DOM.publishListingBtn) EventController.addListener(DOM.publishListingBtn, 'click', publishListingFromModal);
    if (DOM.publishPremiumBtn) EventController.addListener(DOM.publishPremiumBtn, 'click', publishPremiumListingFromModal);
    if (DOM.saveDraftBtn) EventController.addListener(DOM.saveDraftBtn, 'click', saveCurrentAsDraft);

    // Close buttons
    const closeMap = {
        closeCreateListingModal: DOM.createListingModal,
        closeAnalyticsModal: DOM.analyticsModal,
        closePremiumModal: DOM.premiumOptionsModal,
        closeTeamModal: DOM.teamManagementModal,
        closeLeaderboardModal: DOM.leaderboardModal,
        closeReactionModal: DOM.reactionPickerModal,
        closeSavedModal: DOM.savedItemsModal,
        closeNotesModal: DOM.myNotesModal,
        closeTrustStatsModal: DOM.trustStatsModal
    };
    
    Object.entries(closeMap).forEach(([id, modal]) => {
        const btn = document.getElementById(id);
        if (btn && modal) {
            EventController.addListener(btn, 'click', () => {
                modal.classList.remove('active');
            });
        }
    });

    // Back button
    if (DOM.backBtn) EventController.addListener(DOM.backBtn, 'click', () => {
        if (DOM.marketplaceDetailPanel) DOM.marketplaceDetailPanel.classList.remove('active');
    });

    // Action buttons in detail panel
    if (DOM.saveListingBtn) EventController.addListener(DOM.saveListingBtn, 'click', () => {
        if (UIState.currentListingId) saveToSavedItems(UIState.currentListingId);
    });
    if (DOM.addNoteBtn) EventController.addListener(DOM.addNoteBtn, 'click', () => {
        if (UIState.currentListingId) showAddNoteDialog(UIState.currentListingId);
    });
    if (DOM.addReactionBtn) EventController.addListener(DOM.addReactionBtn, 'click', () => {
        if (UIState.currentListingId) showReactionPicker(UIState.currentListingId);
    });
    if (DOM.reserveBtn) EventController.addListener(DOM.reserveBtn, 'click', () => {
        if (UIState.currentListingId) reserveListing(UIState.currentListingId);
    });
    if (DOM.tipBtn) EventController.addListener(DOM.tipBtn, 'click', () => {
        if (DOM.tipAmounts) DOM.tipAmounts.classList.toggle('show');
    });
    if (DOM.contactSellerBtn) EventController.addListener(DOM.contactSellerBtn, 'click', () => {
        if (UIState.currentListingData && openChat) {
            openChat(UIState.currentListingData.userId, UIState.currentListingData.user?.displayName || 'Seller');
        }
    });
    if (DOM.shareListingBtn) EventController.addListener(DOM.shareListingBtn, 'click', () => {
        if (UIState.currentListingData) shareListing(UIState.currentListingData);
    });
    if (DOM.detailMenuBtn) EventController.addListener(DOM.detailMenuBtn, 'click', showDetailMenu);

    // Tip options
    document.querySelectorAll('.tip-option').forEach(opt => {
        EventController.addListener(opt, 'click', async function() {
            if (!UIState.currentListingId) return;
            const amount = this.dataset.amount;
            if (amount === 'custom') {
                const custom = prompt('Enter custom tip amount ($):');
                if (custom && !isNaN(custom) && parseFloat(custom) > 0 && sendTip) await sendTip(UIState.currentListingId, null, parseFloat(custom));
            } else {
                if (sendTip) await sendTip(UIState.currentListingId, parseFloat(amount));
            }
            if (DOM.tipAmounts) DOM.tipAmounts.classList.remove('show');
        });
    });

    // Mood filter
    if (DOM.moodFilterIndicator) EventController.addListener(DOM.moodFilterIndicator, 'click', clearMoodFilter);

    // Analytics
    if (DOM.refreshAnalyticsBtn) EventController.addListener(DOM.refreshAnalyticsBtn, 'click', async () => {
        try {
            if (loadAnalyticsData) await loadAnalyticsData();
            updateAnalyticsDashboard();
            showNotification('Analytics refreshed', 'success');
        } catch {
            showNotification('Failed to refresh analytics', 'error');
        }
    });
    if (DOM.exportAnalyticsBtn) EventController.addListener(DOM.exportAnalyticsBtn, 'click', () => {
        const selected = document.querySelector('.export-option.selected')?.dataset.format || 'csv';
        if (exportAnalyticsData) exportAnalyticsData(selected);
    });

    // View buttons
    if (DOM.viewAnalyticsBtn) EventController.addListener(DOM.viewAnalyticsBtn, 'click', () => {
        isUserPremium() ? showAnalyticsModal() : (showNotification('Upgrade to Premium for advanced analytics', 'info'), showPremiumOptionsModal());
    });
    if (DOM.viewSavedBtn) EventController.addListener(DOM.viewSavedBtn, 'click', showSavedItemsModal);
    if (DOM.viewNotesBtn) EventController.addListener(DOM.viewNotesBtn, 'click', showMyNotesModal);
    if (DOM.viewTrustStatsBtn) EventController.addListener(DOM.viewTrustStatsBtn, 'click', () => DOM.trustStatsModal?.classList.add('active'));
    if (DOM.premiumOptionsBtn) EventController.addListener(DOM.premiumOptionsBtn, 'click', showPremiumOptionsModal);
    if (DOM.viewTeamBtn) EventController.addListener(DOM.viewTeamBtn, 'click', showTeamManagementModal);
    if (DOM.viewLeaderboardBtn) EventController.addListener(DOM.viewLeaderboardBtn, 'click', showLeaderboardModal);

    // Team management
    if (DOM.inviteTeamMemberBtn) EventController.addListener(DOM.inviteTeamMemberBtn, 'click', inviteTeamMemberAction);
    if (DOM.saveTeamBtn) EventController.addListener(DOM.saveTeamBtn, 'click', async () => {
        try {
            const changes = [];
            document.querySelectorAll('select[data-member-id]').forEach(sel => changes.push({ memberId: sel.dataset.memberId, role: sel.value }));
            if (updateTeamMemberRole) await updateTeamMemberRole(changes);
            showNotification('Team updated', 'success');
            if (DOM.teamManagementModal) DOM.teamManagementModal.classList.remove('active');
        } catch {
            showNotification('Team update failed', 'error');
        }
    });

    // Leaderboard
    if (DOM.refreshLeaderboardBtn) EventController.addListener(DOM.refreshLeaderboardBtn, 'click', async () => {
        if (loadLeaderboard) await loadLeaderboard();
        renderLeaderboard();
        showNotification('Leaderboard refreshed', 'success');
    });

    // Plan selection
    document.querySelectorAll('[data-plan-select]').forEach(btn => {
        EventController.addListener(btn, 'click', function() {
            showPaymentForm(this.dataset.planSelect);
        });
    });

    // Payment
    if (DOM.completePaymentBtn) EventController.addListener(DOM.completePaymentBtn, 'click', async () => {
        if (processSubscriptionPayment) await processSubscriptionPayment();
        if (DOM.paymentContainer) DOM.paymentContainer.style.display = 'none';
        if (DOM.premiumOptionsModal) DOM.premiumOptionsModal.classList.remove('active');
    });
    if (DOM.cancelPaymentBtn) EventController.addListener(DOM.cancelPaymentBtn, 'click', () => {
        if (DOM.paymentContainer) DOM.paymentContainer.style.display = 'none';
    });
    if (DOM.startFreeTrialBtn) EventController.addListener(DOM.startFreeTrialBtn, 'click', startFreeTrial);
    if (DOM.restorePurchaseBtn) EventController.addListener(DOM.restorePurchaseBtn, 'click', restorePurchase);

    // Digital upload
    if (DOM.digitalUploadArea && DOM.digitalUploadInput) {
        EventController.addListener(DOM.digitalUploadArea, 'click', () => DOM.digitalUploadInput.click());
        EventController.addListener(DOM.digitalUploadArea, 'dragover', (e) => {
            e.preventDefault();
            DOM.digitalUploadArea.style.borderColor = 'var(--primary-color)';
            DOM.digitalUploadArea.style.backgroundColor = 'rgba(0,132,255,0.05)';
        });
        EventController.addListener(DOM.digitalUploadArea, 'dragleave', () => {
            DOM.digitalUploadArea.style.borderColor = '';
            DOM.digitalUploadArea.style.backgroundColor = '';
        });
        EventController.addListener(DOM.digitalUploadArea, 'drop', (e) => {
            e.preventDefault();
            DOM.digitalUploadArea.style.borderColor = '';
            DOM.digitalUploadArea.style.backgroundColor = '';
            if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
        });
        EventController.addListener(DOM.digitalUploadInput, 'change', (e) => {
            if (e.target.files.length) handleFileUpload(e.target.files[0]);
        });
    }

    // Bulk upload
    if (DOM.bulkUploadArea && DOM.bulkUploadInput) {
        EventController.addListener(DOM.bulkUploadArea, 'click', () => {
            if (!isUserPremium()) {
                showNotification('Upgrade to Premium for bulk uploads', 'info');
                return;
            }
            DOM.bulkUploadInput.click();
        });
        EventController.addListener(DOM.bulkUploadInput, 'change', (e) => {
            if (e.target.files.length && processBulkUpload) processBulkUpload(e.target.files[0]);
        });
    }

    // Video upload
    if (DOM.uploadVideoBtn) EventController.addListener(DOM.uploadVideoBtn, 'click', () => {
        if (!isUserPremium()) {
            showNotification('Upgrade to Premium for video intros', 'info');
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.addEventListener('change', (e) => {
            if (e.target.files.length) handleVideoUpload(e.target.files[0]);
        });
        input.click();
    });

    // Saved items
    if (DOM.clearSavedBtn) EventController.addListener(DOM.clearSavedBtn, 'click', () => {
        if (confirm('Clear all saved items?')) {
            savedItems.length = 0;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
            showSavedItemsModal();
            showNotification('Saved items cleared', 'success');
        }
    });

    // Notes
    if (DOM.addNewNoteBtn) EventController.addListener(DOM.addNewNoteBtn, 'click', () => {
        showAddNoteDialog(null);
    });

    // Window events
    EventController.addListener(window, 'online', () => {
        showNotification('Back online - syncing marketplace data', 'info');
        if (syncOfflineMarketplaceData) syncOfflineMarketplaceData();
        processQueuedUIActions();
    });
    EventController.addListener(window, 'offline', () => {
        showNotification('Working offline - changes will sync when back online', 'info');
    });
    EventController.addListener(window, 'beforeunload', () => {
        if (saveAllMarketplaceData) saveAllMarketplaceData();
    });
    
    // Reaction picker
    if (DOM.reactionPicker) {
        DOM.reactionPicker.querySelectorAll('.reaction-option').forEach(opt => {
            EventController.addListener(opt, 'click', function() {
                const reaction = this.dataset.reaction;
                if (reaction && UIState.currentListingId) {
                    // Add reaction logic here
                    showNotification(`Reacted with ${reaction}`, 'success');
                    if (DOM.reactionPickerModal) DOM.reactionPickerModal.classList.remove('active');
                }
            });
        });
    }
    
    // Initialize trust circle selection
    updateTrustCircleSelection();
}

// ----------------------------------------------------------------------
// 14. MODAL / HELPER FUNCTIONS
// ----------------------------------------------------------------------
function showCreateListingModal() {
    if (!DOM.createListingModal) return;
    DOM.createListingModal.classList.add('active');
    resetCreateListingForm();
    
    // Switch to appropriate tab based on user state
    if (!hasValidUser() && !AppState?._STATE?.guestMode) {
        switchCreateTab('service');
    }
}

function resetCreateListingForm() {
    const fields = [
        DOM.serviceTitle, DOM.serviceDescription, DOM.servicePrice,
        DOM.digitalTitle, DOM.digitalDescription, DOM.digitalPrice,
        DOM.expiryDate, DOM.sellerNotes, DOM.teamNotes,
        DOM.visibilityStart, DOM.visibilityEnd
    ];
    fields.forEach(el => {
        if (el) el.value = '';
    });
    
    document.querySelectorAll('.availability-option, .circle-option, .template-option, .mood-option, .duration-option, .schedule-option').forEach(o => o.classList.remove('selected'));
    
    const defaultAvail = document.querySelector('.availability-option[data-availability="free"]');
    if (defaultAvail) defaultAvail.classList.add('selected');
    
    const defaultCircle = document.querySelector('.circle-option[data-circle="friends"]');
    if (defaultCircle) defaultCircle.classList.add('selected');
    
    const defaultTemplate = document.querySelector('.template-option[data-template="basic"]');
    if (defaultTemplate) defaultTemplate.classList.add('selected');
    
    const defaultMood = document.querySelector('.mood-option[data-mood="browse"]');
    if (defaultMood) defaultMood.classList.add('selected');
    
    const defaultDuration = document.querySelector('.duration-option[data-duration="7d"]');
    if (defaultDuration) defaultDuration.classList.add('selected');
    
    UIState.selectedDigitalFile = null;
    UIState.selectedVideoIntro = null;
    
    if (DOM.digitalPreview) DOM.digitalPreview.innerHTML = '';
    if (DOM.featuredListingCheckbox) DOM.featuredListingCheckbox.checked = false;
    if (DOM.boostListingCheckbox) DOM.boostListingCheckbox.checked = false;
    if (DOM.autoRenewCheckbox) DOM.autoRenewCheckbox.checked = false;
    if (DOM.verifiedBadgeCheckbox) DOM.verifiedBadgeCheckbox.checked = false;
    
    updatePremiumFeaturesVisibility();
    updateTrustCircleSelection();
}

function switchCreateTab(tab) {
    const tabEl = document.querySelector(`.create-listing-tab[data-tab="${tab}"]`);
    if (tabEl) tabEl.click();
}

function updateTrustCircleSelection() {
    if (!DOM.groupSelectionContainer || !DOM.peopleSelectionContainer) return;
    
    if (UIState.selectedTrustCircle === TRUST_CIRCLES?.GROUPS) {
        DOM.groupSelectionContainer.style.display = 'block';
        DOM.peopleSelectionContainer.style.display = 'none';
    } else if (UIState.selectedTrustCircle === TRUST_CIRCLES?.SELECTED || UIState.selectedTrustCircle === TRUST_CIRCLES?.MICRO) {
        DOM.groupSelectionContainer.style.display = 'none';
        DOM.peopleSelectionContainer.style.display = 'block';
    } else {
        DOM.groupSelectionContainer.style.display = 'none';
        DOM.peopleSelectionContainer.style.display = 'none';
    }
}

function handleFileUpload(file) {
    if (!file) return;
    const allowed = ['.pdf', '.doc', '.docx', '.zip', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.mp4', '.mov', '.avi'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
        showNotification('File type not supported', 'error');
        return;
    }
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification(`File size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    // Show preview
    if (DOM.digitalPreview) {
        DOM.digitalPreview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(0,132,255,0.1); border-radius: 8px;">
                <i class="fas fa-${file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'}" style="font-size: 24px;"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${escapeHtml(file.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${formatFileSize(file.size)}</div>
                </div>
                <i class="fas fa-check-circle" style="color: var(--success-color);"></i>
            </div>
        `;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        UIState.selectedDigitalFile = { name: file.name, size: file.size, type: file.type, url: e.target.result };
        showNotification(`File "${file.name}" uploaded`, 'success');
    };
    reader.readAsDataURL(file);
}

function handleVideoUpload(file) {
    if (!file) return;
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification(`Video size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    if (DOM.uploadVideoBtn) {
        DOM.uploadVideoBtn.innerHTML = '<i class="fas fa-check"></i> Video Added';
        DOM.uploadVideoBtn.style.background = 'var(--success-color)';
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        UIState.selectedVideoIntro = { name: file.name, size: file.size, type: file.type, url: e.target.result };
        showNotification('Video intro uploaded successfully', 'success');
    };
    reader.readAsDataURL(file);
}

function publishListingFromModal() {
    const activeTab = UIState.createListingActiveTab;
    if (activeTab === 'service' || activeTab === 'digital') {
        const titleEl = activeTab === 'service' ? DOM.serviceTitle : DOM.digitalTitle;
        const descEl = activeTab === 'service' ? DOM.serviceDescription : DOM.digitalDescription;
        const priceEl = activeTab === 'service' ? DOM.servicePrice : DOM.digitalPrice;
        
        const title = titleEl?.value.trim();
        const desc = descEl?.value.trim();
        const price = priceEl?.value.trim();
        
        if (!title) { showNotification('Please enter a title', 'error'); return; }
        if (activeTab === 'digital' && !UIState.selectedDigitalFile) { showNotification('Please upload a digital file', 'error'); return; }
        
        const expiresAt = getFinalExpiry();
        const opts = {
            price,
            availability: UIState.selectedAvailability,
            visibility: UIState.selectedTrustCircle,
            moodContext: UIState.selectedMoodContext,
            template: UIState.selectedTemplate,
            allowedGroups: getSelectedGroups(),
            allowedUsers: getSelectedUsers(),
            visibilitySchedule: getVisibilitySchedule(),
            expiresAt,
            privateNotes: getPrivateNotes(),
            teamNotes: getTeamNotes()
        };
        
        let listing;
        if (activeTab === 'service' && createServiceListing) listing = createServiceListing(title, desc || '', opts);
        else if (activeTab === 'digital' && createDigitalListing) listing = createDigitalListing(title, desc || '', UIState.selectedDigitalFile, opts);
        
        if (listing) {
            showNotification('Listing published', 'success');
            if (DOM.createListingModal) DOM.createListingModal.classList.remove('active');
            updateMyListingsPreview();
            addListingItem(listing);
            if (updateAvailableListingsCount) updateAvailableListingsCount();
        }
    } else showNotification('Please complete the form', 'info');
}

function publishPremiumListingFromModal() {
    if (!isUserPremium()) { showNotification('Premium subscription required', 'error'); return; }
    
    const activeTab = UIState.createListingActiveTab;
    if (activeTab === 'service' || activeTab === 'digital') {
        const titleEl = activeTab === 'service' ? DOM.serviceTitle : DOM.digitalTitle;
        const descEl = activeTab === 'service' ? DOM.serviceDescription : DOM.digitalDescription;
        const priceEl = activeTab === 'service' ? DOM.servicePrice : DOM.digitalPrice;
        
        const title = titleEl?.value.trim();
        const desc = descEl?.value.trim();
        
        if (!title) { showNotification('Please enter a title', 'error'); return; }
        if (activeTab === 'digital' && !UIState.selectedDigitalFile) { showNotification('Please upload a digital file', 'error'); return; }
        
        const featured = DOM.featuredListingCheckbox?.checked || false;
        const boosted = DOM.boostListingCheckbox?.checked || false;
        const autoRenew = DOM.autoRenewCheckbox?.checked || false;
        const verified = DOM.verifiedBadgeCheckbox?.checked || false;
        const templateColor = DOM.templatePrimaryColor?.value || '#0084ff';
        const templateFont = DOM.templateFont?.value || 'Default';
        
        const opts = {
            price: priceEl?.value.trim(),
            availability: UIState.selectedAvailability,
            visibility: UIState.selectedTrustCircle,
            moodContext: UIState.selectedMoodContext,
            template: UIState.selectedTemplate,
            templateSettings: { color: templateColor, font: templateFont },
            featured,
            boosted,
            autoRenew,
            verified,
            acceptsTips: true,
            videoIntro: UIState.selectedVideoIntro?.url,
            teamMembers: getTeamMembersList(),
            allowedGroups: getSelectedGroups(),
            allowedUsers: getSelectedUsers(),
            visibilitySchedule: getVisibilitySchedule(),
            expiresAt: getFinalExpiry(),
            privateNotes: getPrivateNotes(),
            teamNotes: getTeamNotes()
        };
        
        let listing;
        if (activeTab === 'service' && createPremiumServiceListing) listing = createPremiumServiceListing(title, desc || '', opts);
        else if (activeTab === 'digital' && createPremiumDigitalListing) listing = createPremiumDigitalListing(title, desc || '', UIState.selectedDigitalFile, opts);
        
        if (listing) {
            showNotification('Premium listing published', 'success');
            if (DOM.createListingModal) DOM.createListingModal.classList.remove('active');
            updateMyListingsPreview();
            addListingItem(listing);
            if (updateAvailableListingsCount) updateAvailableListingsCount();
        }
    }
}

function saveCurrentAsDraft() {
    const activeTab = UIState.createListingActiveTab;
    let draft = { type: activeTab, savedAt: new Date().toISOString(), id: 'draft_' + Date.now() };
    
    if (activeTab === 'service') {
        draft.title = DOM.serviceTitle?.value.trim();
        if (!draft.title) { showNotification('No service to save as draft', 'warning'); return; }
        draft.description = DOM.serviceDescription?.value.trim() || '';
        draft.price = DOM.servicePrice?.value.trim() || '';
    } else if (activeTab === 'digital') {
        draft.title = DOM.digitalTitle?.value.trim();
        if (!draft.title) { showNotification('No digital item to save as draft', 'warning'); return; }
        draft.description = DOM.digitalDescription?.value.trim() || '';
        draft.price = DOM.digitalPrice?.value.trim() || '';
        draft.file = UIState.selectedDigitalFile;
    } else if (activeTab === 'premium') {
        const t = DOM.serviceTitle?.value.trim() || DOM.digitalTitle?.value.trim();
        if (!t) { showNotification('No premium listing to save as draft', 'warning'); return; }
        draft.title = t;
        draft.featured = DOM.featuredListingCheckbox?.checked || false;
        draft.boosted = DOM.boostListingCheckbox?.checked || false;
        draft.verified = DOM.verifiedBadgeCheckbox?.checked || false;
        draft.autoRenew = DOM.autoRenewCheckbox?.checked || false;
        draft.videoIntro = UIState.selectedVideoIntro;
    } else return;
    
    draft.availability = UIState.selectedAvailability;
    draft.visibility = UIState.selectedTrustCircle;
    draft.moodContext = UIState.selectedMoodContext;
    draft.template = UIState.selectedTemplate;
    draft.duration = UIState.selectedDuration;
    draft.privateNotes = getPrivateNotes();
    draft.teamNotes = getTeamNotes();
    
    if (offlineDrafts) {
        offlineDrafts.unshift(draft);
        if (saveToLocalStorage) saveToLocalStorage(LOCAL_STORAGE_KEYS?.OFFLINE_DRAFTS || 'offlineDrafts', offlineDrafts);
    }
    showNotification('Draft saved', 'success');
}

function getSelectedGroups() {
    return Array.from(document.querySelectorAll('#groupsList .circle-option.selected')).map(o => o.dataset.groupId);
}

function getSelectedUsers() {
    return Array.from(document.querySelectorAll('#peopleList .circle-option.selected')).map(o => o.dataset.friendId);
}

function getVisibilitySchedule() {
    const start = DOM.visibilityStart?.value;
    const end = DOM.visibilityEnd?.value;
    return (start && end) ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null;
}

function getFinalExpiry() {
    const custom = DOM.expiryDate?.value;
    if (custom) return new Date(custom).toISOString();
    
    const duration = UIState.selectedDuration;
    const durationMs = DURATION_OPTIONS ? DURATION_OPTIONS[duration] : 
        duration === '24h' ? 86400000 :
        duration === '3d' ? 259200000 :
        duration === '7d' ? 604800000 :
        duration === '14d' ? 1209600000 :
        duration === '30d' ? 2592000000 : 604800000;
    
    return duration === 'event' ? null : new Date(Date.now() + durationMs).toISOString();
}

function getPrivateNotes() {
    return DOM.sellerNotes?.value.trim() || '';
}

function getTeamNotes() {
    return DOM.teamNotes?.value.trim() || '';
}

function getTeamMembersList() {
    if (userSubscription?.plan === 'business' || userSubscription?.plan === 'team') {
        return teamMembers ? teamMembers.map(m => ({ id: m.id, name: m.displayName, role: m.role || 'member' })) : [];
    }
    return [];
}

function showAnalyticsModal() {
    if (!DOM.analyticsModal) return;
    DOM.analyticsModal.classList.add('active');
    updateAnalyticsDashboard();
    if (initAnalyticsChart) initAnalyticsChart();
}

function showPremiumOptionsModal() {
    if (!DOM.premiumOptionsModal) return;
    DOM.premiumOptionsModal.classList.add('active');
    if (DOM.paymentContainer) DOM.paymentContainer.style.display = 'none';
}

function showTeamManagementModal() {
    if (!DOM.teamManagementModal) return;
    DOM.teamManagementModal.classList.add('active');
    renderTeamMembers();
}

function showLeaderboardModal() {
    if (!DOM.leaderboardModal) return;
    DOM.leaderboardModal.classList.add('active');
    renderLeaderboard();
}

function showReactionPicker(listingId) {
    if (!DOM.reactionPickerModal) return;
    DOM.reactionPickerModal.classList.add('active');
    UIState.currentListingId = listingId;
}

function showSavedItemsModal() {
    if (!DOM.savedItemsModal) return;
    DOM.savedItemsModal.classList.add('active');
    if (!DOM.savedItemsGrid) return;
    
    if (!savedItems || !savedItems.length) {
        DOM.savedItemsGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-bookmark" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i><p>No saved items yet</p><p style="font-size: 14px; margin-top: 10px;">Save listings you\'re interested in</p></div>';
        return;
    }
    
    DOM.savedItemsGrid.innerHTML = '';
    savedItems.slice().reverse().forEach(item => {
        const el = document.createElement('div');
        el.className = 'saved-item';
        el.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500;">${escapeHtml(item.title)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                        <i class="far fa-clock"></i> Saved ${formatTimeAgo(new Date(item.savedAt || item.createdAt || Date.now()))}
                    </div>
                </div>
                <i class="fas fa-chevron-right" style="color: var(--text-secondary);"></i>
            </div>
        `;
        el.addEventListener('click', () => { 
            viewListingDetail(item); 
            if (DOM.savedItemsModal) DOM.savedItemsModal.classList.remove('active');
        });
        DOM.savedItemsGrid.appendChild(el);
    });
}

function showMyNotesModal() {
    if (!DOM.myNotesModal) return;
    DOM.myNotesModal.classList.add('active');
    if (!DOM.myNotesList) return;
    
    if (!privateNotes || !privateNotes.length) {
        DOM.myNotesList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-sticky-note" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i><p>No notes yet</p><p style="font-size: 14px; margin-top: 10px;">Add private notes to listings</p></div>';
        return;
    }
    
    DOM.myNotesList.innerHTML = '';
    privateNotes.slice().reverse().forEach(n => {
        const el = document.createElement('div');
        el.className = 'note-item';
        el.innerHTML = `
            <div style="font-weight: 500;">${escapeHtml(n.note.substring(0, 60))}${n.note.length > 60 ? '...' : ''}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                <i class="far fa-clock"></i> ${formatTimeAgo(new Date(n.createdAt || Date.now()))}
            </div>
        `;
        DOM.myNotesList.appendChild(el);
    });
}

function saveToSavedItems(listingId) {
    const listing = allListings ? allListings.find(l => l.id === listingId) : null;
    if (listing && savedItems && !savedItems.some(i => i.id === listingId)) {
        savedItems.push({ ...listing, savedAt: new Date().toISOString() });
        if (saveToLocalStorage) saveToLocalStorage(LOCAL_STORAGE_KEYS?.SAVED_ITEMS || 'savedItems', savedItems);
        showNotification('Listing saved', 'success');
        if (DOM.saveListingBtn) {
            DOM.saveListingBtn.innerHTML = '<i class="fas fa-bookmark" style="color: var(--primary-color);"></i>';
        }
    } else {
        showNotification('Already saved', 'info');
    }
}

function showAddNoteDialog(listingId) {
    const note = prompt('Add a private note:');
    if (note && note.trim() && privateNotes) {
        privateNotes.push({ 
            listingId, 
            note: note.trim(), 
            createdAt: new Date().toISOString() 
        });
        if (saveToLocalStorage) saveToLocalStorage(LOCAL_STORAGE_KEYS?.PRIVATE_NOTES || 'privateNotes', privateNotes);
        showNotification('Note added', 'success');
        showMyNotesModal();
    }
}

function showDetailMenu() {
    const items = ['Report Listing', 'Block User', 'Copy Link', 'Open in Browser'];
    const idx = prompt('Select action:\n' + items.map((m, i) => `${i + 1}. ${m}`).join('\n'));
    if (idx) {
        const n = parseInt(idx) - 1;
        if (n === 2) {
            navigator.clipboard?.writeText(window.location.href).then(() => showNotification('Link copied', 'success'));
        } else if (n >= 0 && n < items.length) showNotification(`Action: ${items[n]}`, 'info');
    }
}

function reserveListing(listingId) { 
    showNotification('Listing reserved', 'success'); 
}

function shareListing(listing) {
    if (navigator.share) {
        navigator.share({ 
            title: listing.title, 
            text: listing.description, 
            url: window.location.href + '?listing=' + listing.id 
        }).catch(() => {
            navigator.clipboard?.writeText(window.location.href + '?listing=' + listing.id)
                .then(() => showNotification('Link copied', 'success'));
        });
    } else {
        navigator.clipboard?.writeText(window.location.href + '?listing=' + listing.id)
            .then(() => showNotification('Link copied', 'success'));
    }
}

function clearMoodFilter() {
    if (clearCoreMoodFilter) clearCoreMoodFilter();
    updateMoodFilterIndicator();
    renderMarketplaceList();
    showNotification('Mood filter cleared', 'info');
}

function showPaymentForm(plan) {
    if (DOM.paymentContainer) { 
        DOM.paymentContainer.style.display = 'block'; 
        UIState.selectedPlan = plan; 
    }
}

function updatePremiumFeaturesVisibility() {
    const isPremium = isUserPremium();
    document.querySelectorAll('.premium-feature').forEach(f => f.style.display = isPremium ? 'block' : 'none');
    document.querySelectorAll('.premium-option').forEach(o => o.disabled = !isPremium);
}

function updateAnalyticsDashboard() {
    const metrics = [
        { el: DOM.analyticsViews, key: 'views', formatter: (v) => v || 0 },
        { el: DOM.analyticsSaves, key: 'saves', formatter: (v) => v || 0 },
        { el: DOM.analyticsShares, key: 'shares', formatter: (v) => v || 0 },
        { el: DOM.analyticsMessages, key: 'messages', formatter: (v) => v || 0 },
        { el: DOM.analyticsConversion, key: 'conversionRate', formatter: (v) => v ? `${v}%` : '0%' },
        { el: DOM.analyticsEngagement, key: 'avgEngagement', formatter: (v) => v ? `${v}s` : '0s' }
    ];
    
    metrics.forEach(({ el, key, formatter }) => {
        if (el) el.textContent = formatter(analyticsData?.[key]);
    });
    
    const changes = [
        { el: DOM.viewsChange, key: 'viewsChange' },
        { el: DOM.savesChange, key: 'savesChange' },
        { el: DOM.sharesChange, key: 'sharesChange' },
        { el: DOM.messagesChange, key: 'messagesChange' },
        { el: DOM.conversionChange, key: 'conversionChange' },
        { el: DOM.engagementChange, key: 'engagementChange' }
    ];
    
    changes.forEach(({ el, key }) => {
        if (el && analyticsData?.[key] !== undefined) {
            const val = analyticsData[key];
            const pos = val >= 0;
            el.className = `analytics-card-change ${pos ? 'positive' : 'negative'}`;
            el.innerHTML = `<i class="fas fa-arrow-${pos ? 'up' : 'down'}"></i> ${Math.abs(val)}%`;
        }
    });
}

function renderFilteredByType(type, emptyMsg) {
    const filtered = allListings ? allListings.filter(l => l.type === type && isListingVisibleToUser(l)) : [];
    renderFilteredListings(filtered, emptyMsg);
}

function renderFriendsListings() {
    const friendIds = userFriends ? userFriends.map(f => f.id) : [];
    const filtered = allListings ? allListings.filter(l => friendIds.includes(l.userId) && isListingVisibleToUser(l)) : [];
    renderFilteredListings(filtered, 'No friend listings found');
}

function renderGroupListings() {
    const filtered = allListings ? allListings.filter(l => l.visibility === TRUST_CIRCLES?.GROUPS && isListingVisibleToUser(l)) : [];
    renderFilteredListings(filtered, 'No group listings found');
}

function renderMyListings() {
    const userId = sessionData?.userId || window.currentUser?.id;
    const filtered = allListings ? allListings.filter(l => l.userId === userId && !isListingExpired(l)) : [];
    renderFilteredListings(filtered, 'You have no active listings');
}

function renderPremiumListings() {
    const filtered = allListings ? allListings.filter(l => l.premium === true && isListingVisibleToUser(l)) : [];
    renderFilteredListings(filtered, 'No premium listings found');
}

function renderSpotlightTab() {
    const filtered = allListings ? allListings.filter(l => l.featured === true && isListingVisibleToUser(l)) : [];
    renderFilteredListings(filtered, 'No featured listings found');
}

function renderFilteredListings(listings, emptyMsg) {
    if (!DOM.marketplaceListContent) return;
    DOM.marketplaceListContent.innerHTML = '';
    
    if (!listings.length) {
        DOM.marketplaceListContent.innerHTML = `<div class="empty-state"><i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i><p>${emptyMsg}</p><p class="subtext">Try a different category or create your own listing</p></div>`;
        return;
    }
    
    listings.forEach(l => addListingItem(l));
    
    if (DOM.availableListingsCount) {
        DOM.availableListingsCount.textContent = listings.length;
    }
}

function inviteTeamMemberAction() {
    const email = prompt('Enter team member email:');
    if (email && inviteTeamMember) {
        inviteTeamMember(email)
            .then(() => showNotification('Invitation sent', 'success'))
            .catch(() => showNotification('Invitation failed', 'error'));
    }
}

// ----------------------------------------------------------------------
// 15. LOGGING UTILITY (Single message only)
// ----------------------------------------------------------------------
const logOnce = (function() {
    const shown = new Set();
    return function(key, message) {
        if (!shown.has(key)) {
            shown.add(key);
            console.log(message);
        }
    };
})();

// ----------------------------------------------------------------------
// 16. INITIALIZATION (Single Entry Point)
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();
    UIPipeline.skeleton();
    ResponsiveEngine.init();
    await pageCore.init();
    setupAllEventListeners();
    
    // Expose to window for debugging
    window.marketplaceUI = { 
        renderMarketplaceList, 
        showCreateListingModal, 
        viewListingDetail, 
        renderers, 
        UIState,
        DOM,
        refresh: () => {
            renderMarketplaceList();
            updateMyListingsPreview();
            updatePremiumStatusUI();
            updateConnectionStatus();
        },
        getDiagnostics: () => window.marketplaceCore?.diagnostics?.getReport?.(),
        getStatus: () => ({
            canExecuteAction: canExecuteAction(),
            pendingActions: UIState.pendingActions.length,
            recoveryMode: UIState.recoveryModeActive,
            environment: UIState.environmentType
        })
    };
    
    logOnce('ui_ready', '[Tool-ui.js] Resilient UI controller ready v5.0');
});

// ----------------------------------------------------------------------
// 17. PRESERVED EXPORTS (Full Compatibility)
// ----------------------------------------------------------------------
export {
    renderMarketplaceList,
    showCreateListingModal,
    viewListingDetail,
    renderers,
    UIState,
    pageCore
};