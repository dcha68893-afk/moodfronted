// =============================================
// RESILIENT MARKETPLACE UI CONTROLLER v6.2
// FAULT-TOLERANT • PROGRESSIVE RENDERING • CORE BRIDGE
// ENHANCED WITH DIAGNOSTICS • RECOVERY AWARE • SESSION SYNC
// UI FAILSAFE • NAVIGATION GUARD • ENVIRONMENT ADAPTIVE
// DETERMINISTIC HANDSHAKE ALIGNMENT • STRICT LIFECYCLE
// STABILIZED UI ACTIONS • CLICK HANDLING ENHANCED
// =============================================

// ----------------------------------------------------------------------
// 1. IMPORT VERIFICATION – STRICT CORE BRIDGE (UPDATED)
// ----------------------------------------------------------------------
import {
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
    
    // Core state and functions
    AppState,
    hasValidSession,
    hasValidUser,
    safeGetElement,
    showStatusMessage,
    validateDataStructure,
    getData,
    updateData,
    handleParentMessage,
    handleParentInit,
    handleRefreshDataRequest,
    fetchData,
    pageCore as corePageCore,
    initializeCore,
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
    bindUIAfterSession,
    getMarketplaceStats,
    getMarketplaceAnalytics,
    getMarketplaceUser,
    isMarketplaceReady,
    isCoreReady,
    loadCachedDataInstantly,
    handleSessionDataFromParent,
    validateSessionSchema,
    processSessionData,
    storeCentralizedToken,
    updateLocalStateFromSession,
    showMarketplaceUI,
    handleSessionUpdate,
    handleParentLogout,
    clearSessionData,
    handleRefreshUI,
    handleForceReload,
    handleApiError,
    handleUnauthorized,
    setupConnectivityListeners,
    initializeTokenSystem,
    isValidToken,
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
    inviteTeamMemberWrapper,
    isActive,
    currentUser as coreCurrentUser,
    sessionData as coreSessionData,
    allListings as coreAllListings,
    myListings as coreMyListings,
    savedItems as coreSavedItems
    
} from './Tool-core.js';

// ----------------------------------------------------------------------
// GLOBAL VARIABLES FROM CORE (with safe fallbacks)
// ----------------------------------------------------------------------
let allListings = coreAllListings || [];
let myListings = coreMyListings || [];
let savedItems = coreSavedItems || [];
let userGroups = [];
let userFriends = [];
let currentUser = coreCurrentUser || null;
let userData = coreCurrentUser || null;
let privateNotes = [];
let currentMoodFilter = null;
let offlineDrafts = [];
let trustStats = {};
let userSubscription = null;
let teamMembers = [];
let leaderboardData = [];
let analyticsData = {};
let streakData = {};
let premiumFeatures = {};
let paymentMethods = [];
let sessionData = coreSessionData || null;
let isBootstrapped = false;
let isAuthReady = false;
let isReady = false;
let handshakeComplete = false;
let sessionValid = false;

// Sync with core periodically
function syncWithCoreState() {
    allListings = coreAllListings || allListings;
    myListings = coreMyListings || myListings;
    savedItems = coreSavedItems || savedItems;
    currentUser = coreCurrentUser || currentUser;
    userData = coreCurrentUser || userData;
    sessionData = coreSessionData || sessionData;
}
setInterval(syncWithCoreState, 1000);

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
    
    // Enhanced UI elements for handshake alignment
    connectionStatusIndicator: null,
    handshakeStatusIndicator: null,
    sessionStatusIndicator: null,
    recoveryStatusIndicator: null,
    environmentIndicator: null,
    debugPanel: null,
    debugToggle: null,
    metricsDisplay: null,
    startupStageIndicator: null,
    connectionStatusBar: null,
    lifecycleStateIndicator: null,
    handshakeProgressBar: null,
    handshakeStageText: null
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
    
    // Enhanced UI elements for handshake alignment (create if not exist)
    createEnhancedUIElements();
}

function createEnhancedUIElements() {
    // Create status indicators if they don't exist
    const existingStatusBar = document.getElementById('connectionStatusBar');
    if (!existingStatusBar) {
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
            max-width: 400px;
            transition: opacity 0.3s ease;
            opacity: 0.8;
            font-family: monospace;
        `;
        
        statusBar.innerHTML = `
            <span id="connectionStatusIndicator" class="status-dot" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Conn
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
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> Stage
            </span>
            <span id="lifecycleStateIndicator" style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #ff9800;"></span> State
            </span>
            <span id="handshakeProgressBar" style="width: 50px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; margin-left: 4px;">
                <span id="handshakeProgressFill" style="width: 0%; height: 100%; background: #4caf50; display: block; transition: width 0.3s ease;"></span>
            </span>
        `;
        
        document.body.appendChild(statusBar);
        
        DOM.connectionStatusBar = statusBar;
        DOM.connectionStatusIndicator = document.getElementById('connectionStatusIndicator');
        DOM.handshakeStatusIndicator = document.getElementById('handshakeStatusIndicator');
        DOM.sessionStatusIndicator = document.getElementById('sessionStatusIndicator');
        DOM.environmentIndicator = document.getElementById('environmentIndicator');
        DOM.startupStageIndicator = document.getElementById('startupStageIndicator');
        DOM.lifecycleStateIndicator = document.getElementById('lifecycleStateIndicator');
        DOM.handshakeProgressBar = document.getElementById('handshakeProgressBar');
    } else {
        DOM.connectionStatusBar = existingStatusBar;
        DOM.connectionStatusIndicator = document.getElementById('connectionStatusIndicator');
        DOM.handshakeStatusIndicator = document.getElementById('handshakeStatusIndicator');
        DOM.sessionStatusIndicator = document.getElementById('sessionStatusIndicator');
        DOM.environmentIndicator = document.getElementById('environmentIndicator');
        DOM.startupStageIndicator = document.getElementById('startupStageIndicator');
        DOM.lifecycleStateIndicator = document.getElementById('lifecycleStateIndicator');
        DOM.handshakeProgressBar = document.getElementById('handshakeProgressBar');
    }
    
    // Create handshake stage text element
    if (!document.getElementById('handshakeStageText')) {
        const stageText = document.createElement('span');
        stageText.id = 'handshakeStageText';
        stageText.style.cssText = 'margin-left: 8px; font-size: 10px; color: #888;';
        if (DOM.connectionStatusBar) {
            DOM.connectionStatusBar.appendChild(stageText);
        }
        DOM.handshakeStageText = stageText;
    } else {
        DOM.handshakeStageText = document.getElementById('handshakeStageText');
    }
    
    // Create debug toggle if in development or debug mode
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.__IFRAME_DEBUG__) && !document.getElementById('debugToggle')) {
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
            max-width: 450px;
            max-height: 500px;
            overflow: auto;
            display: none;
            backdrop-filter: blur(4px);
            border: 1px solid #444;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(debugPanel);
        DOM.debugPanel = debugPanel;
    } else {
        DOM.debugToggle = document.getElementById('debugToggle');
        DOM.debugPanel = document.getElementById('debugPanel');
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
    
    // Enhanced state for handshake alignment
    lastHealthCheck: 0,
    recoveryModeActive: false,
    handshakeStage: 'idle',
    connectionQuality: 'unknown',
    debugMode: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.__IFRAME_DEBUG__,
    environmentType: ENVIRONMENT_TYPES ? ENVIRONMENT_TYPES.UNKNOWN : 'UNKNOWN',
    startupStage: STARTUP_STAGES ? STARTUP_STAGES.IDLE : 'IDLE',
    lifecycleState: 'BOOT',
    handshakeProgress: 0,
    
    // UI Failsafe state
    pendingActions: [],
    lastActionTime: 0,
    actionQueueEnabled: true,
    handshakeRetryCount: 0,
    listenersInitialized: false
};

// ----------------------------------------------------------------------
// 4. CENTRALIZED EVENT BUS (with automatic cleanup)
// ----------------------------------------------------------------------
const EventController = (function() {
    const listeners = new Set();
    const debouncedHandlers = new Map();
    const intervalHandlers = new Map();
    const warningsShown = new Set();
    let initializationLock = false;

    function canExecuteAction() {
        // Check if parent is responding OR we're in guest/fallback mode
        const health = checkParentHealth ? checkParentHealth() : { connected: true, parentReady: false, handshakeComplete: false };
        // Allow actions if parent is ready and handshake complete, or we're in standalone mode
        const isActiveState = isActive ? isActive() : (health.parentReady === true && health.handshakeComplete === true);
        return isActiveState || health.connected === true || AppState?._STATE?.guestMode || AppState?._STATE?.fallbackMode;
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

    function addListener(element, event, handler, options = {}) {
        if (!element) return () => {};
        if (initializationLock && event === 'click') return () => {};
        
        const wrappedHandler = (e) => {
            try {
                e.preventDefault?.();
                e.stopPropagation?.();
                
                // Check if action can be executed (UI Failsafe)
                if (!canExecuteAction() && (event === 'click' || event === 'submit')) {
                    // Queue action for later
                    queueUIAction(() => {
                        handler(e);
                    });
                    
                    // Visual feedback
                    if (element.style) {
                        const originalOpacity = element.style.opacity;
                        element.style.opacity = '0.5';
                        setTimeout(() => {
                            element.style.opacity = originalOpacity || '';
                        }, 200);
                    }
                    
                    return;
                }
                
                handler(e);
            } catch (err) {
                console.warn(`[EventController] Error in ${event} handler:`, err.message);
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
                console.warn(`[EventController] Interval Error: ${key}`);
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
    
    function lockInitialization() {
        initializationLock = true;
        setTimeout(() => {
            initializationLock = false;
        }, 100);
    }

    return { addListener, removeAll, addDebounced, addInterval, canExecuteAction, queueUIAction, lockInitialization };
})();

// ----------------------------------------------------------------------
// 5. PROCESS QUEUED UI ACTIONS
// ----------------------------------------------------------------------
function processQueuedUIActions() {
    if (UIState.pendingActions.length === 0) return;
    
    const health = checkParentHealth ? checkParentHealth() : { connected: true, parentReady: false, handshakeComplete: false };
    const isActiveState = isActive ? isActive() : (health.parentReady === true && health.handshakeComplete === true);
    if (!isActiveState && !health.connected && !AppState?._STATE?.guestMode) return;
    
    const now = Date.now();
    const actions = UIState.pendingActions.filter(a => now - a.timestamp < 60000); // Keep last minute
    
    UIState.pendingActions = [];
    
    actions.forEach(item => {
        try {
            if (typeof item.action === 'function') {
                item.action();
            }
        } catch (e) {
            console.warn('[UI] Failed to replay queued action:', e.message);
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
            if (!warningsShown.has(uiSectionName)) {
                warningsShown.add(uiSectionName);
                console.warn(`[UI Error][${uiSectionName}] ${error.message}`);
            }
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
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        try {
                            renderFn(...args);
                        } catch (e) {}
                    });
                }
            }
            return null;
        }
    };
}

// ----------------------------------------------------------------------
// 7. PROGRESSIVE RENDERING PIPELINE (UPDATED)
// ----------------------------------------------------------------------
const UIPipeline = {
    initialized: false,
    healthInterval: null,
    
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
        if (this.initialized) return;
        this.renderWithCache();
        this.updateMyListingsPreview();
        this.updatePremiumStatusUI();
        this.updateStreakIndicator();
        this.updateMoodFilterIndicator();
        this.updateConnectionStatus();
        this.updateEnvironmentIndicator();
        this.updateStartupStageIndicator();
        this.updateLifecycleStateIndicator();
        this.updateHandshakeProgress();
        this.startHealthMonitoring();
        this.initialized = true;
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
            this.bindGlobalEventListeners();
        }, 50);
    },
    
    bindGlobalEventListeners() {
        if (UIState.listenersInitialized) return;
        
        // Bind navigation buttons
        if (DOM.backBtn) {
            EventController.addListener(DOM.backBtn, 'click', () => {
                if (DOM.marketplaceDetailPanel) {
                    DOM.marketplaceDetailPanel.classList.remove('active');
                }
            });
        }
        
        if (DOM.closeCreateListingModal) {
            EventController.addListener(DOM.closeCreateListingModal, 'click', () => hideCreateListingModal());
        }
        
        if (DOM.closeAnalyticsModal) {
            EventController.addListener(DOM.closeAnalyticsModal, 'click', () => hideAnalyticsModal());
        }
        
        if (DOM.closePremiumModal) {
            EventController.addListener(DOM.closePremiumModal, 'click', () => hidePremiumOptionsModal());
        }
        
        if (DOM.closeTeamModal) {
            EventController.addListener(DOM.closeTeamModal, 'click', () => hideTeamManagementModal());
        }
        
        if (DOM.closeLeaderboardModal) {
            EventController.addListener(DOM.closeLeaderboardModal, 'click', () => hideLeaderboardModal());
        }
        
        if (DOM.closeReactionModal) {
            EventController.addListener(DOM.closeReactionModal, 'click', () => hideReactionPicker());
        }
        
        if (DOM.closeSavedModal) {
            EventController.addListener(DOM.closeSavedModal, 'click', () => hideSavedItemsModal());
        }
        
        if (DOM.closeNotesModal) {
            EventController.addListener(DOM.closeNotesModal, 'click', () => hideMyNotesModal());
        }
        
        if (DOM.closeTrustStatsModal) {
            EventController.addListener(DOM.closeTrustStatsModal, 'click', () => hideTrustStatsModal());
        }
        
        // Bind create listing buttons
        if (DOM.createListingBtn) {
            EventController.addListener(DOM.createListingBtn, 'click', () => showCreateListingModal());
        }
        
        if (DOM.createListingQuickBtn) {
            EventController.addListener(DOM.createListingQuickBtn, 'click', () => showCreateListingModal());
        }
        
        if (DOM.sellServiceBtn) {
            EventController.addListener(DOM.sellServiceBtn, 'click', () => switchCreateTab('service'));
        }
        
        if (DOM.sellDigitalBtn) {
            EventController.addListener(DOM.sellDigitalBtn, 'click', () => switchCreateTab('digital'));
        }
        
        if (DOM.publishListingBtn) {
            EventController.addListener(DOM.publishListingBtn, 'click', () => publishListingFromModal());
        }
        
        if (DOM.publishPremiumBtn) {
            EventController.addListener(DOM.publishPremiumBtn, 'click', () => publishPremiumListingFromModal());
        }
        
        if (DOM.saveDraftBtn) {
            EventController.addListener(DOM.saveDraftBtn, 'click', () => saveCurrentAsDraft());
        }
        
        // Bind action buttons
        if (DOM.viewAnalyticsBtn) {
            EventController.addListener(DOM.viewAnalyticsBtn, 'click', () => showAnalyticsModal());
        }
        
        if (DOM.viewSavedBtn) {
            EventController.addListener(DOM.viewSavedBtn, 'click', () => showSavedItemsModal());
        }
        
        if (DOM.viewNotesBtn) {
            EventController.addListener(DOM.viewNotesBtn, 'click', () => showMyNotesModal());
        }
        
        if (DOM.viewTrustStatsBtn) {
            EventController.addListener(DOM.viewTrustStatsBtn, 'click', () => showTrustStatsModal());
        }
        
        if (DOM.premiumOptionsBtn) {
            EventController.addListener(DOM.premiumOptionsBtn, 'click', () => showPremiumOptionsModal());
        }
        
        if (DOM.viewTeamBtn) {
            EventController.addListener(DOM.viewTeamBtn, 'click', () => showTeamManagementModal());
        }
        
        if (DOM.viewLeaderboardBtn) {
            EventController.addListener(DOM.viewLeaderboardBtn, 'click', () => showLeaderboardModal());
        }
        
        // Bind category tabs
        if (DOM.allTab) {
            EventController.addListener(DOM.allTab, 'click', () => setActiveTab('all'));
        }
        if (DOM.servicesTab) {
            EventController.addListener(DOM.servicesTab, 'click', () => setActiveTab('services'));
        }
        if (DOM.digitalTab) {
            EventController.addListener(DOM.digitalTab, 'click', () => setActiveTab('digital'));
        }
        if (DOM.friendsTab) {
            EventController.addListener(DOM.friendsTab, 'click', () => setActiveTab('friends'));
        }
        if (DOM.groupsTab) {
            EventController.addListener(DOM.groupsTab, 'click', () => setActiveTab('groups'));
        }
        if (DOM.myTab) {
            EventController.addListener(DOM.myTab, 'click', () => setActiveTab('my'));
        }
        if (DOM.premiumTab) {
            EventController.addListener(DOM.premiumTab, 'click', () => setActiveTab('premium'));
        }
        if (DOM.spotlightTab) {
            EventController.addListener(DOM.spotlightTab, 'click', () => setActiveTab('spotlight'));
        }
        
        // Bind detail panel buttons
        if (DOM.saveListingBtn) {
            EventController.addListener(DOM.saveListingBtn, 'click', () => saveToSavedItems());
        }
        
        if (DOM.addNoteBtn) {
            EventController.addListener(DOM.addNoteBtn, 'click', () => showAddNoteDialog());
        }
        
        if (DOM.addReactionBtn) {
            EventController.addListener(DOM.addReactionBtn, 'click', () => showReactionPicker());
        }
        
        if (DOM.reserveBtn) {
            EventController.addListener(DOM.reserveBtn, 'click', () => reserveListing());
        }
        
        if (DOM.tipBtn) {
            EventController.addListener(DOM.tipBtn, 'click', () => showTipOptions());
        }
        
        if (DOM.contactSellerBtn) {
            EventController.addListener(DOM.contactSellerBtn, 'click', () => contactSeller());
        }
        
        if (DOM.shareListingBtn) {
            EventController.addListener(DOM.shareListingBtn, 'click', () => shareListing());
        }
        
        if (DOM.detailMenuBtn) {
            EventController.addListener(DOM.detailMenuBtn, 'click', () => showDetailMenu());
        }
        
        // Bind upload handlers
        if (DOM.digitalUploadArea && DOM.digitalUploadInput) {
            DOM.digitalUploadArea.addEventListener('click', () => DOM.digitalUploadInput?.click());
            DOM.digitalUploadInput.addEventListener('change', (e) => handleFileUpload(e));
        }
        
        if (DOM.bulkUploadArea && DOM.bulkUploadInput) {
            DOM.bulkUploadArea.addEventListener('click', () => DOM.bulkUploadInput?.click());
            DOM.bulkUploadInput.addEventListener('change', (e) => handleBulkUpload(e));
        }
        
        if (DOM.uploadVideoBtn) {
            EventController.addListener(DOM.uploadVideoBtn, 'click', () => handleVideoUpload());
        }
        
        // Bind team management
        if (DOM.inviteTeamMemberBtn) {
            EventController.addListener(DOM.inviteTeamMemberBtn, 'click', () => inviteTeamMemberAction());
        }
        
        if (DOM.saveTeamBtn) {
            EventController.addListener(DOM.saveTeamBtn, 'click', () => saveTeamChanges());
        }
        
        if (DOM.refreshLeaderboardBtn) {
            EventController.addListener(DOM.refreshLeaderboardBtn, 'click', () => refreshLeaderboard());
        }
        
        if (DOM.refreshAnalyticsBtn) {
            EventController.addListener(DOM.refreshAnalyticsBtn, 'click', () => refreshAnalytics());
        }
        
        if (DOM.exportAnalyticsBtn) {
            EventController.addListener(DOM.exportAnalyticsBtn, 'click', () => exportAnalytics());
        }
        
        if (DOM.clearSavedBtn) {
            EventController.addListener(DOM.clearSavedBtn, 'click', () => clearAllSavedItems());
        }
        
        if (DOM.addNewNoteBtn) {
            EventController.addListener(DOM.addNewNoteBtn, 'click', () => addNewNote());
        }
        
        // Bind payment handlers
        if (DOM.completePaymentBtn) {
            EventController.addListener(DOM.completePaymentBtn, 'click', () => completePayment());
        }
        
        if (DOM.cancelPaymentBtn) {
            EventController.addListener(DOM.cancelPaymentBtn, 'click', () => cancelPayment());
        }
        
        if (DOM.startFreeTrialBtn) {
            EventController.addListener(DOM.startFreeTrialBtn, 'click', () => startFreeTrialWrapper());
        }
        
        if (DOM.restorePurchaseBtn) {
            EventController.addListener(DOM.restorePurchaseBtn, 'click', () => restorePurchaseWrapper());
        }
        
        UIState.listenersInitialized = true;
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
                        if (DOM.debugToggle) DOM.debugToggle.dataset.cleanup = cleanup;
                    } else {
                        // Stop updates
                        if (DOM.debugToggle && DOM.debugToggle.dataset.cleanup) {
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
        const sessionStatus = {
            valid: hasValidSession ? hasValidSession() : false,
            guest: AppState?._STATE?.guestMode || false,
            demo: AppState?._STATE?.demoMode || false
        };
        const environment = AppState?.getEnvironment?.() || { type: 'unknown', latency: 0 };
        
        DOM.debugPanel.innerHTML = `
            <div style="color: #fff; margin-bottom: 8px; font-weight: bold;">🔍 DEBUG PANEL v6.2</div>
            <div><span style="color: #888;">Environment:</span> ${environment.type} (${environment.latency || 0}ms)</div>
            <div><span style="color: #888;">Lifecycle State:</span> ${UIState.lifecycleState}</div>
            <div><span style="color: #888;">Handshake Stage:</span> ${UIState.handshakeStage}</div>
            <div><span style="color: #888;">Handshake Progress:</span> ${UIState.handshakeProgress}%</div>
            <div><span style="color: #888;">Parent Ready:</span> ${health.parentReady ? '✅' : '❌'}</div>
            <div><span style="color: #888;">Handshake Complete:</span> ${health.handshakeComplete ? '✅' : '⏳'}</div>
            <div><span style="color: #888;">Session:</span> ${sessionStatus.valid ? '✅' : '❌'} ${sessionStatus.guest ? '(guest)' : sessionStatus.demo ? '(demo)' : ''}</div>
            <div><span style="color: #888;">Active:</span> ${isActive ? (isActive() ? '✅' : '❌') : (health.parentReady ? '✅' : '❌')}</div>
            <div><span style="color: #888;">Connected:</span> ${health.connected ? '✅' : '❌'}</div>
            <div><span style="color: #888;">Queued messages:</span> ${health.queuedMessages || 0}</div>
            <div><span style="color: #888;">Queued actions:</span> ${UIState.pendingActions.length}</div>
            <div><span style="color: #888;">Frame ID:</span> ${AppState?._STATE?.frameId || 'unknown'}</div>
            <div><span style="color: #888;">Listings:</span> ${allListings?.length || 0} total, ${myListings?.length || 0} mine</div>
            <div><span style="color: #888;">User:</span> ${window.currentUser?.displayName || 'none'}</div>
            <div style="margin-top: 8px; color: #888; font-size: 10px;">${new Date().toLocaleTimeString()}</div>
        `;
    },
    
    updateConnectionStatus() {
        if (!DOM.connectionStatusIndicator) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const parentReady = health.parentReady || false;
        const handshakeComplete = health.handshakeComplete || false;
        const isActiveState = isActive ? isActive() : (parentReady && handshakeComplete);
        
        let connectionColor = '#ff9800';
        let connectionText = 'Connecting';
        
        if (isActiveState && parentReady && handshakeComplete) {
            connectionColor = '#4caf50';
            connectionText = 'Active';
        } else if (parentReady) {
            connectionColor = '#2196F3';
            connectionText = 'Ready';
        } else if (health.missedHeartbeats > 3) {
            connectionColor = '#f44336';
            connectionText = 'Lost';
        }
        
        DOM.connectionStatusIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${connectionColor};"></span> ${connectionText}`;
        
        // Update handshake indicator
        if (DOM.handshakeStatusIndicator) {
            const handshakeColor = handshakeComplete ? '#4caf50' : (parentReady ? '#2196F3' : '#ff9800');
            const handshakeText = handshakeComplete ? 'Complete' : (parentReady ? 'Ready' : 'Pending');
            DOM.handshakeStatusIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${handshakeColor};"></span> ${handshakeText}`;
        }
        
        // Update session indicator
        if (DOM.sessionStatusIndicator) {
            const sessionActive = health.sessionActive || false;
            const guestMode = AppState?._STATE?.guestMode || false;
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
        }
    },
    
    updateEnvironmentIndicator() {
        if (!DOM.environmentIndicator) return;
        
        const environment = AppState?.getEnvironment?.() || { type: ENVIRONMENT_TYPES ? ENVIRONMENT_TYPES.UNKNOWN : 'UNKNOWN' };
        const envColors = {
            [ENVIRONMENT_TYPES?.LOCAL_DEV]: '#4caf50',
            [ENVIRONMENT_TYPES?.RENDER_HOSTED]: '#2196F3',
            [ENVIRONMENT_TYPES?.VPN_NETWORK]: '#ff9800',
            [ENVIRONMENT_TYPES?.PRODUCTION]: '#9c27b0',
            [ENVIRONMENT_TYPES?.UNKNOWN]: '#9e9e9e'
        };
        
        const envNames = {
            [ENVIRONMENT_TYPES?.LOCAL_DEV]: 'Local',
            [ENVIRONMENT_TYPES?.RENDER_HOSTED]: 'Render',
            [ENVIRONMENT_TYPES?.VPN_NETWORK]: 'VPN',
            [ENVIRONMENT_TYPES?.PRODUCTION]: 'Prod',
            [ENVIRONMENT_TYPES?.UNKNOWN]: 'Unknown'
        };
        
        const color = envColors[environment.type] || '#9e9e9e';
        const name = envNames[environment.type] || 'Unknown';
        const latency = environment.latency ? `${environment.latency}ms` : '';
        
        DOM.environmentIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span> ${name} ${latency}`;
    },
    
    updateStartupStageIndicator() {
        if (!DOM.startupStageIndicator) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const stageColors = {
            [STARTUP_STAGES?.IDLE]: '#9e9e9e',
            [STARTUP_STAGES?.WAITING]: '#ff9800',
            [STARTUP_STAGES?.HANDSHAKING]: '#2196F3',
            [STARTUP_STAGES?.SYNCING]: '#9c27b0',
            [STARTUP_STAGES?.ACTIVE]: '#4caf50',
            [STARTUP_STAGES?.DEGRADED]: '#ff9800',
            [STARTUP_STAGES?.RECOVERING]: '#f44336',
            [STARTUP_STAGES?.FAILED]: '#f44336'
        };
        
        const stageNames = {
            [STARTUP_STAGES?.IDLE]: 'Idle',
            [STARTUP_STAGES?.WAITING]: 'Wait',
            [STARTUP_STAGES?.HANDSHAKING]: 'Handshake',
            [STARTUP_STAGES?.SYNCING]: 'Sync',
            [STARTUP_STAGES?.ACTIVE]: 'Active',
            [STARTUP_STAGES?.DEGRADED]: 'Degraded',
            [STARTUP_STAGES?.RECOVERING]: 'Recover',
            [STARTUP_STAGES?.FAILED]: 'Failed'
        };
        
        const stage = health.boot?.state || UIState.startupStage;
        const color = stageColors[stage] || '#9e9e9e';
        const name = stageNames[stage] || stage;
        
        DOM.startupStageIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span> ${name}`;
    },
    
    updateLifecycleStateIndicator() {
        if (!DOM.lifecycleStateIndicator) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const stateColors = {
            'BOOT': '#9e9e9e',
            'INITIALIZING': '#ff9800',
            'READY': '#2196F3',
            'WAIT_PARENT': '#ff9800',
            'ACTIVE': '#4caf50'
        };
        
        const state = health.boot?.state || UIState.lifecycleState;
        const color = stateColors[state] || '#9e9e9e';
        
        DOM.lifecycleStateIndicator.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span> ${state}`;
    },
    
    updateHandshakeProgress() {
        if (!DOM.handshakeProgressBar) return;
        
        const health = checkParentHealth ? checkParentHealth() : {};
        const parentReady = health.parentReady || false;
        const handshakeComplete = health.handshakeComplete || false;
        const sessionActive = health.sessionActive || false;
        
        let progress = 0;
        let stage = 'Idle';
        
        if (handshakeComplete && sessionActive) {
            progress = 100;
            stage = 'Active';
            UIState.handshakeStage = 'active';
        } else if (handshakeComplete) {
            progress = 75;
            stage = 'Syncing';
            UIState.handshakeStage = 'syncing';
        } else if (parentReady) {
            progress = 50;
            stage = 'Ready';
            UIState.handshakeStage = 'ready';
        } else if (health.connected) {
            progress = 25;
            stage = 'Connecting';
            UIState.handshakeStage = 'connecting';
        } else {
            progress = 0;
            stage = 'Idle';
            UIState.handshakeStage = 'idle';
        }
        
        UIState.handshakeProgress = progress;
        const progressFill = DOM.handshakeProgressBar.querySelector('#handshakeProgressFill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
        
        if (DOM.handshakeStageText) {
            DOM.handshakeStageText.textContent = stage;
        }
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
            this.updateLifecycleStateIndicator();
            this.updateHandshakeProgress();
            
            // Update lifecycle state from core
            const health = checkParentHealth ? checkParentHealth() : {};
            if (health.boot?.state) {
                UIState.lifecycleState = health.boot.state;
            }
            if (health.handshakeComplete) {
                UIState.handshakeStage = health.handshakeComplete ? 'complete' : UIState.handshakeStage;
            }
        }, 3000);
    }
};

// ----------------------------------------------------------------------
// 8. CORE BRIDGE – VALIDATED SUBSCRIPTIONS (UPDATED FOR HANDSHAKE)
// ----------------------------------------------------------------------
const CoreBridge = {
    init() {
        window.addEventListener('marketplaceCoreReady', this.handleCoreReady.bind(this));
        window.addEventListener('coreInitialized', this.handleCoreInit.bind(this));
        window.addEventListener('coreDataUpdated', this.handleDataUpdate.bind(this));
        window.addEventListener('marketplaceSessionReady', this.handleSessionReady.bind(this));
        
        // New event listeners for handshake alignment
        window.addEventListener('tools:page-activated', this.handlePageActivated.bind(this));
        window.addEventListener('tools:lifecycle-change', this.handleLifecycleChange.bind(this));
        window.addEventListener('marketplace:navigate', this.handleNavigate.bind(this));
        window.addEventListener('marketplace:recovery-mode', this.handleRecoveryMode.bind(this));
        window.addEventListener('marketplace:environment-updated', this.handleEnvironmentUpdated.bind(this));
        window.addEventListener('marketplace:startup-updated', this.handleStartupUpdated.bind(this));
        window.addEventListener('transport:unresponsive', this.handleTransportUnresponsive.bind(this));
        window.addEventListener('recovery:completed', this.handleRecoveryCompleted.bind(this));
        window.addEventListener('tools:active', this.handleToolsActive.bind(this));
    },

    handleCoreReady(e) {
        console.log('[UI Bridge] Core ready');
        UIPipeline.progressiveEnhancement();
        UIPipeline.liveUpdate();
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateEnvironmentIndicator();
        UIPipeline.updateStartupStageIndicator();
        UIPipeline.updateLifecycleStateIndicator();
        UIPipeline.updateHandshakeProgress();
    },

    handleCoreInit(e) {
        console.log('[UI Bridge] Core initialized');
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
        console.log('[UI Bridge] Session ready');
        this.refreshUserUI();
        UIPipeline.initialRender();
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateEnvironmentIndicator();
        UIPipeline.updateHandshakeProgress();
    },
    
    handleLifecycleChange(e) {
        const { from, to } = e?.detail || {};
        console.log(`[UI Bridge] Lifecycle: ${from} -> ${to}`);
        UIState.lifecycleState = to;
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateStartupStageIndicator();
        UIPipeline.updateLifecycleStateIndicator();
        UIPipeline.updateHandshakeProgress();
        
        // Update startup stage based on lifecycle
        if (to === 'BOOT') UIState.startupStage = STARTUP_STAGES?.IDLE || 'IDLE';
        else if (to === 'INITIALIZING') UIState.startupStage = STARTUP_STAGES?.HANDSHAKING || 'HANDSHAKING';
        else if (to === 'READY') UIState.startupStage = STARTUP_STAGES?.WAITING || 'WAITING';
        else if (to === 'WAIT_PARENT') UIState.startupStage = STARTUP_STAGES?.WAITING || 'WAITING';
        else if (to === 'ACTIVE') UIState.startupStage = STARTUP_STAGES?.ACTIVE || 'ACTIVE';
        
        // If we become active, process any queued actions
        if (to === 'ACTIVE') {
            processQueuedUIActions();
            // Also refresh UI to show all features
            UIPipeline.liveUpdate();
        }
    },
    
    handleToolsActive(e) {
        console.log('[UI Bridge] Tools module active');
        UIState.lifecycleState = 'ACTIVE';
        UIState.startupStage = STARTUP_STAGES?.ACTIVE || 'ACTIVE';
        UIPipeline.updateConnectionStatus();
        UIPipeline.updateStartupStageIndicator();
        UIPipeline.updateLifecycleStateIndicator();
        UIPipeline.updateHandshakeProgress();
        processQueuedUIActions();
    },
    
    handlePageActivated(e) {
        console.log('[UI Bridge] Page activated');
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
        
        if (UIState.recoveryModeActive && DOM.connectionStatusBar) {
            DOM.connectionStatusBar.style.opacity = '1';
            DOM.connectionStatusBar.style.background = 'rgba(244, 67, 54, 0.9)';
        }
    },
    
    handleRecoveryCompleted(e) {
        UIState.recoveryModeActive = false;
        UIPipeline.updateConnectionStatus();
        
        if (DOM.connectionStatusBar) {
            DOM.connectionStatusBar.style.background = 'rgba(0,0,0,0.7)';
        }
        
        // Process any queued actions
        processQueuedUIActions();
    },
    
    handleTransportUnresponsive(e) {
        UIPipeline.updateConnectionStatus();
    },
    
    handleEnvironmentUpdated(e) {
        UIState.environmentType = e?.detail?.type || (ENVIRONMENT_TYPES ? ENVIRONMENT_TYPES.UNKNOWN : 'UNKNOWN');
        UIPipeline.updateEnvironmentIndicator();
    },
    
    handleStartupUpdated(e) {
        UIState.startupStage = e?.detail?.stage || (STARTUP_STAGES ? STARTUP_STAGES.IDLE : 'IDLE');
        UIPipeline.updateStartupStageIndicator();
        UIPipeline.updateHandshakeProgress();
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

// =============================================
// RENDERERS (All wrapped with error boundaries)
// =============================================

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

// =============================================
// Helper Functions (Stubs - These would be fully implemented)
// =============================================

function showCreateListingModal() {
    if (!isActive() && !AppState?._STATE?.guestMode) {
        showNotification('Please wait for connection to complete...', 'info');
        return;
    }
    if (DOM.createListingModal) {
        DOM.createListingModal.classList.add('active');
        resetCreateListingForm();
    }
}

function hideCreateListingModal() {
    if (DOM.createListingModal) {
        DOM.createListingModal.classList.remove('active');
    }
}

function resetCreateListingForm() {
    // Reset form fields
    if (DOM.serviceTitle) DOM.serviceTitle.value = '';
    if (DOM.serviceDescription) DOM.serviceDescription.value = '';
    if (DOM.servicePrice) DOM.servicePrice.value = '';
    if (DOM.digitalTitle) DOM.digitalTitle.value = '';
    if (DOM.digitalDescription) DOM.digitalDescription.value = '';
    if (DOM.digitalPrice) DOM.digitalPrice.value = '';
    if (DOM.featuredListingCheckbox) DOM.featuredListingCheckbox.checked = false;
    if (DOM.boostListingCheckbox) DOM.boostListingCheckbox.checked = false;
    if (DOM.autoRenewCheckbox) DOM.autoRenewCheckbox.checked = false;
    if (DOM.verifiedBadgeCheckbox) DOM.verifiedBadgeCheckbox.checked = false;
}

function switchCreateTab(tab) {
    document.querySelectorAll('.create-listing-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.create-listing-tab-content').forEach(c => c.classList.remove('active'));
    
    const tabBtn = document.querySelector(`.create-listing-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    
    const content = document.getElementById(`${tab}Tab`);
    if (content) content.classList.add('active');
    
    UIState.createListingActiveTab = tab;
    renderers.togglePublishButtons(tab);
}

function updateTrustCircleSelection() {
    const groupContainer = DOM.groupSelectionContainer;
    const peopleContainer = DOM.peopleSelectionContainer;
    
    if (UIState.selectedTrustCircle === 'groups') {
        if (groupContainer) groupContainer.style.display = 'block';
        if (peopleContainer) peopleContainer.style.display = 'none';
    } else if (UIState.selectedTrustCircle === 'selected') {
        if (groupContainer) groupContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'block';
    } else {
        if (groupContainer) groupContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'none';
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > (isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024)) {
            showNotification(`File too large. Max: ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
            return;
        }
        UIState.selectedDigitalFile = file;
        if (DOM.digitalPreview) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    DOM.digitalPreview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">`;
                };
                reader.readAsDataURL(file);
            } else {
                DOM.digitalPreview.innerHTML = `<i class="fas fa-file"></i> ${escapeHtml(file.name)} (${formatFileSize(file.size)})`;
            }
        }
    }
}

function handleVideoUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 200 * 1024 * 1024) {
                showNotification('Video too large. Max 200MB', 'error');
                return;
            }
            UIState.selectedVideoIntro = URL.createObjectURL(file);
            showNotification('Video uploaded successfully', 'success');
        }
    };
    input.click();
}

function handleBulkUpload(e) {
    const file = e.target.files[0];
    if (file && processBulkUpload) {
        processBulkUpload(file);
        showNotification('Bulk upload started', 'info');
    }
}

function publishListingFromModal() {
    if (!isActive() && !AppState?._STATE?.guestMode) {
        showNotification('Please wait for connection to complete...', 'info');
        return;
    }
    
    if (UIState.createListingActiveTab === 'service') {
        const title = DOM.serviceTitle?.value;
        const description = DOM.serviceDescription?.value;
        const price = DOM.servicePrice?.value;
        
        if (!title || !description) {
            showNotification('Please fill in title and description', 'error');
            return;
        }
        
        const listing = createServiceListing(title, description, {
            price: price,
            availability: UIState.selectedAvailability,
            visibility: UIState.selectedTrustCircle,
            moodContext: UIState.selectedMoodContext,
            template: UIState.selectedTemplate
        });
        
        if (listing) {
            showNotification('Listing published successfully!', 'success');
            hideCreateListingModal();
            UIPipeline.liveUpdate();
        } else {
            showNotification('Failed to publish listing', 'error');
        }
    } else if (UIState.createListingActiveTab === 'digital') {
        const title = DOM.digitalTitle?.value;
        const description = DOM.digitalDescription?.value;
        const price = DOM.digitalPrice?.value;
        
        if (!title || !description) {
            showNotification('Please fill in title and description', 'error');
            return;
        }
        
        if (!UIState.selectedDigitalFile) {
            showNotification('Please upload a file', 'error');
            return;
        }
        
        const listing = createDigitalListing(title, description, UIState.selectedDigitalFile, {
            price: price,
            visibility: UIState.selectedTrustCircle,
            moodContext: UIState.selectedMoodContext,
            template: UIState.selectedTemplate
        });
        
        if (listing) {
            showNotification('Digital item published successfully!', 'success');
            hideCreateListingModal();
            UIPipeline.liveUpdate();
        } else {
            showNotification('Failed to publish digital item', 'error');
        }
    }
}

function publishPremiumListingFromModal() {
    if (!isUserPremium()) {
        showNotification('Premium feature - please upgrade', 'info');
        return;
    }
    
    if (!isActive()) {
        showNotification('Please wait for connection to complete...', 'info');
        return;
    }
    
    const premiumOptions = {
        price: DOM.servicePrice?.value || DOM.digitalPrice?.value,
        featured: DOM.featuredListingCheckbox?.checked || false,
        boosted: DOM.boostListingCheckbox?.checked || false,
        verified: DOM.verifiedBadgeCheckbox?.checked || false,
        autoRenew: DOM.autoRenewCheckbox?.checked || false,
        visibility: UIState.selectedTrustCircle,
        moodContext: UIState.selectedMoodContext,
        template: UIState.selectedTemplate
    };
    
    let listing;
    if (UIState.createListingActiveTab === 'service') {
        const title = DOM.serviceTitle?.value;
        const description = DOM.serviceDescription?.value;
        
        if (!title || !description) {
            showNotification('Please fill in title and description', 'error');
            return;
        }
        
        listing = createPremiumServiceListing(title, description, premiumOptions);
    } else {
        const title = DOM.digitalTitle?.value;
        const description = DOM.digitalDescription?.value;
        
        if (!title || !description) {
            showNotification('Please fill in title and description', 'error');
            return;
        }
        
        if (!UIState.selectedDigitalFile) {
            showNotification('Please upload a file', 'error');
            return;
        }
        
        listing = createPremiumDigitalListing(title, description, UIState.selectedDigitalFile, premiumOptions);
    }
    
    if (listing) {
        showNotification('Premium listing published successfully!', 'success');
        hideCreateListingModal();
        UIPipeline.liveUpdate();
    } else {
        showNotification('Failed to publish premium listing', 'error');
    }
}

function saveCurrentAsDraft() {
    showNotification('Draft saved locally', 'success');
}

function getSelectedGroups() {
    const selected = [];
    document.querySelectorAll('#groupsList .circle-option.selected').forEach(el => {
        selected.push(el.dataset.groupId);
    });
    return selected;
}

function getSelectedUsers() {
    const selected = [];
    document.querySelectorAll('#peopleList .circle-option.selected').forEach(el => {
        selected.push(el.dataset.friendId);
    });
    return selected;
}

function getVisibilitySchedule() {
    return {
        start: DOM.visibilityStart?.value,
        end: DOM.visibilityEnd?.value
    };
}

function getFinalExpiry() {
    if (DOM.expiryDate?.value) {
        return new Date(DOM.expiryDate.value).toISOString();
    }
    const duration = DURATION_OPTIONS?.[UIState.selectedDuration] || 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + duration).toISOString();
}

function getPrivateNotes() {
    return DOM.sellerNotes?.value || '';
}

function getTeamNotes() {
    return DOM.teamNotes?.value || '';
}

function getTeamMembersList() {
    return teamMembers || [];
}

function showAnalyticsModal() {
    if (DOM.analyticsModal) {
        DOM.analyticsModal.classList.add('active');
        updateAnalyticsDashboard();
        renderers.analyticsChart();
    }
}

function hideAnalyticsModal() {
    if (DOM.analyticsModal) {
        DOM.analyticsModal.classList.remove('active');
    }
}

function showPremiumOptionsModal() {
    if (DOM.premiumOptionsModal) {
        DOM.premiumOptionsModal.classList.add('active');
    }
}

function hidePremiumOptionsModal() {
    if (DOM.premiumOptionsModal) {
        DOM.premiumOptionsModal.classList.remove('active');
    }
}

function showTeamManagementModal() {
    if (DOM.teamManagementModal) {
        DOM.teamManagementModal.classList.add('active');
        renderers.teamMembers();
    }
}

function hideTeamManagementModal() {
    if (DOM.teamManagementModal) {
        DOM.teamManagementModal.classList.remove('active');
    }
}

function showLeaderboardModal() {
    if (DOM.leaderboardModal) {
        DOM.leaderboardModal.classList.add('active');
        renderers.leaderboard();
    }
}

function hideLeaderboardModal() {
    if (DOM.leaderboardModal) {
        DOM.leaderboardModal.classList.remove('active');
    }
}

function showReactionPicker() {
    if (DOM.reactionPickerModal) {
        DOM.reactionPickerModal.classList.add('active');
    }
}

function hideReactionPicker() {
    if (DOM.reactionPickerModal) {
        DOM.reactionPickerModal.classList.remove('active');
    }
}

function showSavedItemsModal() {
    if (DOM.savedItemsModal) {
        DOM.savedItemsModal.classList.add('active');
        renderSavedItems();
    }
}

function hideSavedItemsModal() {
    if (DOM.savedItemsModal) {
        DOM.savedItemsModal.classList.remove('active');
    }
}

function renderSavedItems() {
    if (!DOM.savedItemsGrid) return;
    if (!savedItems || savedItems.length === 0) {
        DOM.savedItemsGrid.innerHTML = '<div style="text-align: center; padding: 40px;">No saved items</div>';
        return;
    }
    DOM.savedItemsGrid.innerHTML = '';
    savedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'saved-item-card';
        card.innerHTML = `
            <div style="font-weight: 600;">${escapeHtml(item.title)}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${item.price || 'Free'}</div>
            <button class="action-btn secondary" style="margin-top: 10px;" data-id="${item.id}">View</button>
        `;
        card.querySelector('button').addEventListener('click', () => {
            renderers.viewListingDetail(item);
            hideSavedItemsModal();
        });
        DOM.savedItemsGrid.appendChild(card);
    });
}

function showMyNotesModal() {
    if (DOM.myNotesModal) {
        DOM.myNotesModal.classList.add('active');
        renderMyNotes();
    }
}

function hideMyNotesModal() {
    if (DOM.myNotesModal) {
        DOM.myNotesModal.classList.remove('active');
    }
}

function renderMyNotes() {
    if (!DOM.myNotesList) return;
    if (!privateNotes || privateNotes.length === 0) {
        DOM.myNotesList.innerHTML = '<div style="text-align: center; padding: 40px;">No private notes</div>';
        return;
    }
    DOM.myNotesList.innerHTML = '';
    privateNotes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        noteEl.innerHTML = `
            <div style="font-weight: 500;">${escapeHtml(note.title || 'Note')}</div>
            <div style="font-size: 14px; margin-top: 8px;">${escapeHtml(note.content || '').substring(0, 100)}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px;">${formatTimeAgo(new Date(note.createdAt))}</div>
        `;
        DOM.myNotesList.appendChild(noteEl);
    });
}

function showTrustStatsModal() {
    if (DOM.trustStatsModal) {
        DOM.trustStatsModal.classList.add('active');
        renderTrustStats();
    }
}

function hideTrustStatsModal() {
    if (DOM.trustStatsModal) {
        DOM.trustStatsModal.classList.remove('active');
    }
}

function renderTrustStats() {
    // Implementation would show trust statistics
}

function saveToSavedItems() {
    if (UIState.currentListingData) {
        const exists = savedItems.some(item => item.id === UIState.currentListingData.id);
        if (!exists) {
            savedItems.push(UIState.currentListingData);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
            showNotification('Item saved', 'success');
            if (DOM.saveListingBtn) {
                DOM.saveListingBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
                DOM.saveListingBtn.style.color = 'var(--primary-color)';
            }
        } else {
            const index = savedItems.findIndex(item => item.id === UIState.currentListingData.id);
            if (index !== -1) {
                savedItems.splice(index, 1);
                saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
                showNotification('Item removed from saved', 'info');
                if (DOM.saveListingBtn) {
                    DOM.saveListingBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
                    DOM.saveListingBtn.style.color = '';
                }
            }
        }
    }
}

function showAddNoteDialog() {
    const note = prompt('Add a private note about this listing:');
    if (note) {
        privateNotes.push({
            id: UIState.currentListingId,
            title: UIState.currentListingData?.title,
            content: note,
            createdAt: new Date().toISOString()
        });
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        showNotification('Note added', 'success');
    }
}

function showDetailMenu() {
    // Show detail menu options
}

function reserveListing() {
    showNotification('Reservation feature coming soon', 'info');
}

function shareListing() {
    if (navigator.share && UIState.currentListingData) {
        navigator.share({
            title: UIState.currentListingData.title,
            text: UIState.currentListingData.description,
            url: window.location.href
        });
    } else {
        showNotification('Copy link to share', 'info');
    }
}

function showTipOptions() {
    if (DOM.tipAmounts) {
        DOM.tipAmounts.style.display = DOM.tipAmounts.style.display === 'none' ? 'flex' : 'none';
    }
}

function contactSeller() {
    if (UIState.currentListingData && openChat) {
        openChat(UIState.currentListingData.userId, UIState.currentListingData.user?.displayName);
    }
}

function clearMoodFilter() {
    if (clearCoreMoodFilter) {
        clearCoreMoodFilter();
        currentMoodFilter = null;
        UIPipeline.liveUpdate();
        UIPipeline.updateMoodFilterIndicator();
        showNotification('Mood filter cleared', 'success');
    }
}

function setActiveTab(tab) {
    UIState.activeTab = tab;
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`${tab}Tab`);
    if (activeTab) activeTab.classList.add('active');
    UIPipeline.liveUpdate();
}

function updateAnalyticsDashboard() {
    if (DOM.analyticsViews) DOM.analyticsViews.textContent = analyticsData?.views || 0;
    if (DOM.analyticsSaves) DOM.analyticsSaves.textContent = analyticsData?.saves || 0;
    if (DOM.analyticsShares) DOM.analyticsShares.textContent = analyticsData?.shares || 0;
    if (DOM.analyticsMessages) DOM.analyticsMessages.textContent = analyticsData?.messages || 0;
    if (DOM.analyticsConversion) DOM.analyticsConversion.textContent = `${analyticsData?.conversion || 0}%`;
    if (DOM.analyticsEngagement) DOM.analyticsEngagement.textContent = analyticsData?.engagement || 0;
}

function refreshLeaderboard() {
    if (loadLeaderboard) {
        loadLeaderboard().then(() => {
            renderers.leaderboard();
            showNotification('Leaderboard refreshed', 'success');
        });
    }
}

function refreshAnalytics() {
    if (loadAnalyticsData) {
        loadAnalyticsData().then(() => {
            updateAnalyticsDashboard();
            renderers.analyticsChart();
            showNotification('Analytics refreshed', 'success');
        });
    }
}

function exportAnalytics() {
    if (exportAnalyticsData) {
        exportAnalyticsData('json');
    }
}

function clearAllSavedItems() {
    if (confirm('Clear all saved items?')) {
        savedItems.length = 0;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
        renderSavedItems();
        showNotification('All saved items cleared', 'success');
    }
}

function addNewNote() {
    const note = prompt('Add a new note:');
    if (note) {
        privateNotes.push({
            id: Date.now().toString(),
            title: 'Note',
            content: note,
            createdAt: new Date().toISOString()
        });
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        renderMyNotes();
        showNotification('Note added', 'success');
    }
}

function completePayment() {
    showNotification('Payment processing...', 'info');
    setTimeout(() => {
        showNotification('Payment successful!', 'success');
        hidePaymentForm();
    }, 2000);
}

function cancelPayment() {
    hidePaymentForm();
    showNotification('Payment cancelled', 'info');
}

function hidePaymentForm() {
    if (DOM.paymentContainer) {
        DOM.paymentContainer.style.display = 'none';
    }
    if (DOM.cardPaymentForm) {
        DOM.cardPaymentForm.style.display = 'none';
    }
}

function startFreeTrialWrapper() {
    if (startFreeTrial) {
        startFreeTrial();
    }
}

function restorePurchaseWrapper() {
    if (restorePurchase) {
        restorePurchase();
    }
}

function inviteTeamMemberAction() {
    const email = prompt('Enter email address to invite:');
    if (email && inviteTeamMember) {
        inviteTeamMember(email);
    }
}

function saveTeamChanges() {
    saveToLocalStorage(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
    showNotification('Team changes saved', 'success');
}

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
// 12. COMPATIBILITY LAYER (UPDATED)
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
                renderMarketplaceList: renderers.marketplaceList, 
                showCreateListingModal, 
                viewListingDetail: renderers.viewListingDetail, 
                renderers, 
                UIState,
                DOM,
                refresh: () => {
                    renderers.marketplaceList();
                    renderers.myListingsPreview();
                    renderers.premiumStatusUI();
                    UIPipeline.updateConnectionStatus();
                    UIPipeline.updateEnvironmentIndicator();
                    UIPipeline.updateStartupStageIndicator();
                    UIPipeline.updateLifecycleStateIndicator();
                    UIPipeline.updateHandshakeProgress();
                },
                getDiagnostics: () => window.marketplaceCore?.diagnostics?.getReport?.(),
                getStatus: () => ({
                    canExecuteAction: EventController.canExecuteAction(),
                    pendingActions: UIState.pendingActions.length,
                    recoveryMode: UIState.recoveryModeActive,
                    environment: UIState.environmentType,
                    lifecycleState: UIState.lifecycleState,
                    handshakeStage: UIState.handshakeStage,
                    handshakeProgress: UIState.handshakeProgress
                }),
                getHandshakeStatus: () => {
                    const health = checkParentHealth ? checkParentHealth() : {};
                    return {
                        parentReady: health.parentReady || false,
                        handshakeComplete: health.handshakeComplete || false,
                        sessionActive: health.sessionActive || false,
                        lifecycleState: UIState.lifecycleState,
                        handshakeStage: UIState.handshakeStage,
                        active: isActive ? isActive() : false
                    };
                }
            };
            
            console.log('[pageCore] UI initialized v6.2');
        } catch (err) {
            console.warn('[pageCore.init] Failed:', err.message);
        }
    }
};

// ----------------------------------------------------------------------
// LOGGING UTILITY (Single message only)
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
// INITIALIZATION (Single Entry Point)
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();
    UIPipeline.skeleton();
    ResponsiveEngine.init();
    await pageCore.init();
    
    // Start health monitoring
    UIPipeline.startHealthMonitoring();
    
    logOnce('ui_ready', '[Tool-ui.js] Resilient UI controller ready v6.2 (Handshake aligned)');
});

// ----------------------------------------------------------------------
// PRESERVED EXPORTS (Full Compatibility)
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// PRESERVED EXPORTS (Full Compatibility)
// ----------------------------------------------------------------------
export {
    renderers,
    UIState,
    pageCore,
    showCreateListingModal,
    viewListingDetail
};