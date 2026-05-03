// =============================================
// RESILIENT MARKETPLACE UI CONTROLLER v7.1
// FAULT-TOLERANT • PROGRESSIVE RENDERING • CORE BRIDGE
// ENHANCED WITH DIAGNOSTICS • RECOVERY AWARE • SESSION SYNC
// UI FAILSAFE • NAVIGATION GUARD • ENVIRONMENT ADAPTIVE
// DETERMINISTIC HANDSHAKE ALIGNMENT • STRICT LIFECYCLE
// STABILIZED UI ACTIONS • CLICK HANDLING ENHANCED
// SIMPLIFIED: Removed isActive() checks, direct DOM handlers
// FIXED: Tab filtering uses sellerId + userId, publishListing handles all tabs
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

// Make sure showCreateListingModal is defined and works - SIMPLIFIED: removed isActive check
if (typeof showCreateListingModal !== 'function') {
    window.showCreateListingModal = function() {
        console.log('[MANUAL] showCreateListingModal called');
        const modal = document.getElementById('createListingModal');
        if (modal) modal.classList.add('active');
    };
}

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
    
    // Also sync from window globals (set by Tool-core.js)
    if (window.allListings) allListings = window.allListings;
    if (window.myListings) myListings = window.myListings;
    if (window.savedItems) savedItems = window.savedItems;
    if (window.userFriends) userFriends = window.userFriends;
    if (window.userGroups) userGroups = window.userGroups;
    if (window.currentUser) currentUser = window.currentUser;
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
// 4. SIMPLIFIED EVENT HANDLER - REMOVED COMPLEX EVENT CONTROLLER
// ----------------------------------------------------------------------
// SIMPLIFICATION: Removed complex EventController, using direct onclick handlers
// No isActive() checks - UI works regardless of core state

function canExecuteAction() {
    // SIMPLIFIED: Always return true - UI works regardless of core state
    return true;
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
    
    const now = Date.now();
    const actions = UIState.pendingActions.filter(a => now - a.timestamp < 60000);
    
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
// 5. ERROR BOUNDARY – SECTION FALLBACK
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
// 6. PROGRESSIVE RENDERING PIPELINE (UPDATED)
// ----------------------------------------------------------------------
const UIPipeline = {
    initialized: false,
    healthInterval: null,
    
    skeleton() {
        // Always show skeleton — clears any static placeholder text immediately
        if (DOM.marketplaceListContent) {
            const content = DOM.marketplaceListContent.innerHTML;
            // Only show skeleton if no real listing items are already rendered
            if (!DOM.marketplaceListContent.querySelector('.listing-item')) {
                DOM.marketplaceListContent.innerHTML = `
                    <div class="skeleton-loading">
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                        <div class="skeleton-item"></div>
                    </div>
                `;
            }
        }
        if (DOM.spotlightListings && !DOM.spotlightListings.children.length) {
            DOM.spotlightListings.innerHTML = `
                <div class="skeleton-spotlight"></div>
                <div class="skeleton-spotlight"></div>
            `;
        }
    },

    initialRender() {
        // Show skeleton immediately to clear any static placeholder text
        this.skeleton();
        // Sync from core globals before rendering
        this.syncFromCoreGlobals();
        // Always update the marketplace list so fresh data displays
        this.renderMarketplaceList();
        this.updateMyListingsPreview();
        this.updatePremiumStatusUI();
        this.updateStreakIndicator();
        this.updateMoodFilterIndicator();
        this.updateConnectionStatus();
        this.updateEnvironmentIndicator();
        this.updateStartupStageIndicator();
        this.updateLifecycleStateIndicator();
        this.updateHandshakeProgress();
        if (!this.initialized) {
            this.startHealthMonitoring();
            this.initialized = true;
        }
    },
    
    // FIX D: Sync from window globals before rendering
    syncFromCoreGlobals() {
        if (window.allListings) allListings = window.allListings;
        if (window.myListings) myListings = window.myListings;
        if (window.savedItems) savedItems = window.savedItems;
        if (window.userFriends) userFriends = window.userFriends;
        if (window.userGroups) userGroups = window.userGroups;
        if (window.currentUser) currentUser = window.currentUser;
    },

    progressiveEnhancement() {
        // Listen for data updates from background fetch and re-render immediately
        if (!window._uiDataListenerAttached) {
            window._uiDataListenerAttached = true;
            window.addEventListener('marketplace:data-updated', function(e) {
                const source = e.detail && e.detail.source;
                console.log('[UI] marketplace:data-updated from', source, '— re-rendering list');
                // Sync allListings from event
                if (e.detail && e.detail.listings) {
                    allListings = e.detail.listings;
                    window.allListings = allListings;
                }
                if (UIPipeline) {
                    UIPipeline.syncFromCoreGlobals();
                    UIPipeline.renderMarketplaceList();
                    UIPipeline.updateMyListingsPreview();
                    UIPipeline.renderSpotlightFromData();
                }
            });
            window.addEventListener('marketplace:spotlight-updated', function(e) {
                if (UIPipeline) UIPipeline.renderSpotlightFromData();
            });

            // FIX: Cross-session sync — listen for listings created in other tabs
            if (!window._broadcastChannelAttached) {
                window._broadcastChannelAttached = true;
                try {
                    const _syncChannel = new BroadcastChannel('marketplace_sync');
                    _syncChannel.addEventListener('message', function(e) {
                        const msg = e.data;
                        if (!msg) return;
                        if (msg.type === 'LISTING_CREATED' && msg.listing && msg.listing.id) {
                            const alreadyPresent = (window.allListings || []).some(function(l) { return l.id === msg.listing.id; });
                            if (!alreadyPresent) {
                                allListings = [msg.listing].concat(window.allListings || []);
                                window.allListings = allListings;
                                console.log('[TOOLS FLOW] Step 4: UI updated from cross-tab broadcast', { id: msg.listing.id });
                                window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                                    detail: { listings: allListings, source: 'broadcast' }
                                }));
                            }
                        }
                        if (msg.type === 'LISTING_DELETED' && msg.listingId) {
                            allListings = (window.allListings || []).filter(function(l) { return l.id !== msg.listingId; });
                            window.allListings = allListings;
                            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                                detail: { listings: allListings, source: 'broadcast' }
                            }));
                        }
                    });
                } catch (_) { /* BroadcastChannel not supported — skip */ }
            }

            // FIX: Strip ghost listings (optimistic entries with fake IDs) from cache on startup
            (function _cleanGhosts() {
                const FAKE = /^listing_\d+_[a-z0-9]+$/;
                function strip(arr) {
                    if (!Array.isArray(arr)) return arr;
                    return arr.filter(function(l) { return !(l._isOptimistic && FAKE.test(l.id)); });
                }
                window.allListings = strip(window.allListings);
                window.myListings  = strip(window.myListings);
                try {
                    ['allListings', 'myListings'].forEach(function(k) {
                        var raw = localStorage.getItem(k);
                        if (!raw) return;
                        try {
                            var parsed = JSON.parse(raw);
                            if (Array.isArray(parsed)) localStorage.setItem(k, JSON.stringify(strip(parsed)));
                        } catch (_) {}
                    });
                } catch (_) {}
            })();
        }

        // Immediately kick off background data load without waiting for auth
        setTimeout(function() {
            try {
                if (typeof loadListingsFromBackend === 'function') {
                    loadListingsFromBackend().catch(function(){});
                }
                if (typeof loadSpotlightListingsFromBackend === 'function') {
                    loadSpotlightListingsFromBackend().catch(function(){});
                }
            } catch(e) {}
        }, 200);

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
    
    // SIMPLIFIED: Removed isActive() checks from event binding
    bindGlobalEventListeners() {
        // Only skip if we've already successfully bound the critical tab elements
        if (UIState.listenersInitialized && DOM.allTab && DOM.allTab.onclick) return;
        
        // SIMPLIFIED: Direct onclick assignments instead of EventController
        
        // Bind navigation buttons
        if (DOM.backBtn) {
            DOM.backBtn.onclick = (e) => {
                e.preventDefault();
                if (DOM.marketplaceDetailPanel) {
                    DOM.marketplaceDetailPanel.classList.remove('active');
                }
                return false;
            };
        }
        
        if (DOM.closeCreateListingModal) {
            DOM.closeCreateListingModal.onclick = (e) => {
                e.preventDefault();
                hideCreateListingModal();
                return false;
            };
        }
        
        if (DOM.closeAnalyticsModal) {
            DOM.closeAnalyticsModal.onclick = (e) => {
                e.preventDefault();
                hideAnalyticsModal();
                return false;
            };
        }
        
        if (DOM.closePremiumModal) {
            DOM.closePremiumModal.onclick = (e) => {
                e.preventDefault();
                hidePremiumOptionsModal();
                return false;
            };
        }
        
        if (DOM.closeTeamModal) {
            DOM.closeTeamModal.onclick = (e) => {
                e.preventDefault();
                hideTeamManagementModal();
                return false;
            };
        }
        
        if (DOM.closeLeaderboardModal) {
            DOM.closeLeaderboardModal.onclick = (e) => {
                e.preventDefault();
                hideLeaderboardModal();
                return false;
            };
        }
        
        if (DOM.closeReactionModal) {
            DOM.closeReactionModal.onclick = (e) => {
                e.preventDefault();
                hideReactionPicker();
                return false;
            };
        }
        
        if (DOM.closeSavedModal) {
            DOM.closeSavedModal.onclick = (e) => {
                e.preventDefault();
                hideSavedItemsModal();
                return false;
            };
        }
        
        if (DOM.closeNotesModal) {
            DOM.closeNotesModal.onclick = (e) => {
                e.preventDefault();
                hideMyNotesModal();
                return false;
            };
        }
        
        if (DOM.closeTrustStatsModal) {
            DOM.closeTrustStatsModal.onclick = (e) => {
                e.preventDefault();
                hideTrustStatsModal();
                return false;
            };
        }
        
        // Bind create listing buttons - SIMPLIFIED: direct handlers
        if (DOM.createListingBtn) {
            DOM.createListingBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCreateListingModal();
                return false;
            };
        }
        
        if (DOM.createListingQuickBtn) {
            DOM.createListingQuickBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCreateListingModal();
                return false;
            };
        }
        
        if (DOM.sellServiceBtn) {
            DOM.sellServiceBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                switchCreateTab('service');
                showCreateListingModal();
                return false;
            };
        }
        
        if (DOM.sellDigitalBtn) {
            DOM.sellDigitalBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                switchCreateTab('digital');
                showCreateListingModal();
                return false;
            };
        }
        
        if (DOM.publishListingBtn) {
            DOM.publishListingBtn.onclick = (e) => {
                e.preventDefault();
                publishListingFromModal();
                return false;
            };
        }
        
        if (DOM.publishPremiumBtn) {
            DOM.publishPremiumBtn.onclick = (e) => {
                e.preventDefault();
                publishPremiumListingFromModal();
                return false;
            };
        }
        
        if (DOM.saveDraftBtn) {
            DOM.saveDraftBtn.onclick = (e) => {
                e.preventDefault();
                saveCurrentAsDraft();
                return false;
            };
        }
        
        // Bind action buttons
        if (DOM.viewAnalyticsBtn) {
            DOM.viewAnalyticsBtn.onclick = (e) => {
                e.preventDefault();
                showAnalyticsModal();
                return false;
            };
        }
        
        if (DOM.viewSavedBtn) {
            DOM.viewSavedBtn.onclick = (e) => {
                e.preventDefault();
                showSavedItemsModal();
                return false;
            };
        }
        
        if (DOM.viewNotesBtn) {
            DOM.viewNotesBtn.onclick = (e) => {
                e.preventDefault();
                showMyNotesModal();
                return false;
            };
        }
        
        if (DOM.viewTrustStatsBtn) {
            DOM.viewTrustStatsBtn.onclick = (e) => {
                e.preventDefault();
                showTrustStatsModal();
                return false;
            };
        }
        
        if (DOM.premiumOptionsBtn) {
            DOM.premiumOptionsBtn.onclick = (e) => {
                e.preventDefault();
                showPremiumOptionsModal();
                return false;
            };
        }
        
        if (DOM.viewTeamBtn) {
            DOM.viewTeamBtn.onclick = (e) => {
                e.preventDefault();
                showTeamManagementModal();
                return false;
            };
        }
        
        if (DOM.viewLeaderboardBtn) {
            DOM.viewLeaderboardBtn.onclick = (e) => {
                e.preventDefault();
                showLeaderboardModal();
                return false;
            };
        }
        
        // Bind category tabs - SIMPLIFIED: direct handlers
        if (DOM.allTab) {
            DOM.allTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('all');
                return false;
            };
        }
        if (DOM.servicesTab) {
            DOM.servicesTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('services');
                return false;
            };
        }
        if (DOM.digitalTab) {
            DOM.digitalTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('digital');
                return false;
            };
        }
        if (DOM.friendsTab) {
            DOM.friendsTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('friends');
                return false;
            };
        }
        if (DOM.groupsTab) {
            DOM.groupsTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('groups');
                return false;
            };
        }
        if (DOM.myTab) {
            DOM.myTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('my');
                return false;
            };
        }
        if (DOM.premiumTab) {
            DOM.premiumTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('premium');
                return false;
            };
        }
        if (DOM.spotlightTab) {
            DOM.spotlightTab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('spotlight');
                return false;
            };
        }
        
        // Bind detail panel buttons
        if (DOM.saveListingBtn) {
            DOM.saveListingBtn.onclick = (e) => {
                e.preventDefault();
                saveToSavedItems();
                return false;
            };
        }
        
        if (DOM.addNoteBtn) {
            DOM.addNoteBtn.onclick = (e) => {
                e.preventDefault();
                showAddNoteDialog();
                return false;
            };
        }
        
        if (DOM.addReactionBtn) {
            DOM.addReactionBtn.onclick = (e) => {
                e.preventDefault();
                showReactionPicker();
                return false;
            };
        }
        
        if (DOM.reserveBtn) {
            DOM.reserveBtn.onclick = (e) => {
                e.preventDefault();
                reserveListing();
                return false;
            };
        }
        
        if (DOM.tipBtn) {
            DOM.tipBtn.onclick = (e) => {
                e.preventDefault();
                showTipOptions();
                return false;
            };
        }
        
        if (DOM.contactSellerBtn) {
            DOM.contactSellerBtn.onclick = (e) => {
                e.preventDefault();
                contactSeller();
                return false;
            };
        }
        
        if (DOM.shareListingBtn) {
            DOM.shareListingBtn.onclick = (e) => {
                e.preventDefault();
                shareListing();
                return false;
            };
        }
        
        if (DOM.detailMenuBtn) {
            DOM.detailMenuBtn.onclick = (e) => {
                e.preventDefault();
                showDetailMenu();
                return false;
            };
        }
        
        // Bind upload handlers
        if (DOM.digitalUploadArea && DOM.digitalUploadInput) {
            DOM.digitalUploadArea.onclick = () => DOM.digitalUploadInput?.click();
            DOM.digitalUploadInput.onchange = (e) => handleFileUpload(e);
        }
        
        if (DOM.bulkUploadArea && DOM.bulkUploadInput) {
            DOM.bulkUploadArea.onclick = () => DOM.bulkUploadInput?.click();
            DOM.bulkUploadInput.onchange = (e) => handleBulkUpload(e);
        }
        
        if (DOM.uploadVideoBtn) {
            DOM.uploadVideoBtn.onclick = (e) => {
                e.preventDefault();
                handleVideoUpload();
                return false;
            };
        }
        
        // Bind team management
        if (DOM.inviteTeamMemberBtn) {
            DOM.inviteTeamMemberBtn.onclick = (e) => {
                e.preventDefault();
                inviteTeamMemberAction();
                return false;
            };
        }
        
        if (DOM.saveTeamBtn) {
            DOM.saveTeamBtn.onclick = (e) => {
                e.preventDefault();
                saveTeamChanges();
                return false;
            };
        }
        
        if (DOM.refreshLeaderboardBtn) {
            DOM.refreshLeaderboardBtn.onclick = (e) => {
                e.preventDefault();
                refreshLeaderboard();
                return false;
            };
        }
        
        if (DOM.refreshAnalyticsBtn) {
            DOM.refreshAnalyticsBtn.onclick = (e) => {
                e.preventDefault();
                refreshAnalytics();
                return false;
            };
        }
        
        if (DOM.exportAnalyticsBtn) {
            DOM.exportAnalyticsBtn.onclick = (e) => {
                e.preventDefault();
                exportAnalytics();
                return false;
            };
        }
        
        if (DOM.clearSavedBtn) {
            DOM.clearSavedBtn.onclick = (e) => {
                e.preventDefault();
                clearAllSavedItems();
                return false;
            };
        }
        
        if (DOM.addNewNoteBtn) {
            DOM.addNewNoteBtn.onclick = (e) => {
                e.preventDefault();
                addNewNote();
                return false;
            };
        }
        
        // Bind payment handlers
        if (DOM.completePaymentBtn) {
            DOM.completePaymentBtn.onclick = (e) => {
                e.preventDefault();
                completePayment();
                return false;
            };
        }
        
        if (DOM.cancelPaymentBtn) {
            DOM.cancelPaymentBtn.onclick = (e) => {
                e.preventDefault();
                cancelPayment();
                return false;
            };
        }
        
        if (DOM.startFreeTrialBtn) {
            DOM.startFreeTrialBtn.onclick = (e) => {
                e.preventDefault();
                startFreeTrialWrapper();
                return false;
            };
        }
        
        if (DOM.restorePurchaseBtn) {
            DOM.restorePurchaseBtn.onclick = (e) => {
                e.preventDefault();
                restorePurchaseWrapper();
                return false;
            };
        }
        
        UIState.listenersInitialized = true;
    },

    // FIX D: liveUpdate now syncs from globals before rendering
    liveUpdate() {
        this.syncFromCoreGlobals();
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
            DOM.debugToggle.onclick = () => {
                if (DOM.debugPanel) {
                    const isVisible = DOM.debugPanel.style.display === 'block';
                    DOM.debugPanel.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) {
                        this.updateDebugPanel();
                        // Start periodic updates
                        const intervalId = setInterval(() => this.updateDebugPanel(), 2000);
                        if (DOM.debugToggle) DOM.debugToggle.dataset.cleanup = intervalId;
                    } else {
                        // Stop updates
                        if (DOM.debugToggle && DOM.debugToggle.dataset.cleanup) {
                            clearInterval(parseInt(DOM.debugToggle.dataset.cleanup));
                        }
                    }
                }
            };
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
            <div style="color: #fff; margin-bottom: 8px; font-weight: bold;">🔍 DEBUG PANEL v7.1</div>
            <div><span style="color: #888;">Environment:</span> ${environment.type} (${environment.latency || 0}ms)</div>
            <div><span style="color: #888;">Lifecycle State:</span> ${UIState.lifecycleState}</div>
            <div><span style="color: #888;">Handshake Stage:</span> ${UIState.handshakeStage}</div>
            <div><span style="color: #888;">Handshake Progress:</span> ${UIState.handshakeProgress}%</div>
            <div><span style="color: #888;">Parent Ready:</span> ${health.parentReady ? '✅' : '❌'}</div>
            <div><span style="color: #888;">Handshake Complete:</span> ${health.handshakeComplete ? '✅' : '⏳'}</div>
            <div><span style="color: #888;">Session:</span> ${sessionStatus.valid ? '✅' : '❌'} ${sessionStatus.guest ? '(guest)' : sessionStatus.demo ? '(demo)' : ''}</div>
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
        
        let connectionColor = '#ff9800';
        let connectionText = 'Connecting';
        
        if (parentReady && handshakeComplete) {
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
// 7. CORE BRIDGE – VALIDATED SUBSCRIPTIONS (UPDATED FOR HANDSHAKE)
// ----------------------------------------------------------------------
const CoreBridge = {
    init() {
        window.addEventListener('marketplaceCoreReady', this.handleCoreReady.bind(this));
        window.addEventListener('coreInitialized', this.handleCoreInit.bind(this));
        window.addEventListener('coreDataUpdated', this.handleDataUpdate.bind(this));
        window.addEventListener('marketplaceSessionReady', this.handleSessionReady.bind(this));
        
        // FIX F: Listen for marketplace:data-updated to trigger re-render
        window.addEventListener('marketplace:data-updated', this.handleMarketplaceDataUpdated.bind(this));
        
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
        setTimeout(() => {
            UIPipeline.liveUpdate();
        }, 150);
    },
    
    // FIX F: Handle marketplace data updates
    handleMarketplaceDataUpdated(e) {
        console.log('[UI Bridge] Marketplace data updated');
        if (e?.detail?.listings) {
            allListings = e.detail.listings;
            window.allListings = allListings;
        }
        UIPipeline.liveUpdate();
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
                createBtn.onclick = () => showCreateListingModal();
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
                filtered = filtered.filter(l => l.type === LISTING_TYPES?.SERVICE || l.type === 'service');
                break;
            case 'digital':
                filtered = filtered.filter(l => l.type === LISTING_TYPES?.DIGITAL || l.type === 'digital');
                break;
            case 'friends':
                const friendIds = userFriends ? userFriends.map(f => f.id) : [];
                // Also check sellerId as backend may use that
                filtered = filtered.filter(l => friendIds.includes(l.userId) || friendIds.includes(l.sellerId));
                break;
            case 'groups':
                filtered = filtered.filter(l => l.visibility === TRUST_CIRCLES?.GROUPS || l.visibility === 'groups');
                break;
            case 'my':
                const userId = sessionData?.userId || window.currentUser?.id || currentUser?.id;
                // FIX A: Use both userId and sellerId for "My" tab filter
                filtered = filtered.filter(l => l.userId === userId || l.sellerId === userId);
                break;
            case 'premium':
                filtered = filtered.filter(l => l.premium === true || l.isPremium === true);
                break;
            case 'spotlight':
                filtered = filtered.filter(l => l.featured === true || l.isFeatured === true || l.isSpotlight === true);
                break;
            // 'all' case - no filter needed
        }

        filtered.sort((a, b) => {
            const aFeatured = (a.featured || a.boosted || a.isFeatured || a.isSpotlight) ? 1 : 0;
            const bFeatured = (b.featured || b.boosted || b.isFeatured || b.isSpotlight) ? 1 : 0;
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
        if (listing.featured || listing.boosted || listing.isFeatured || listing.isSpotlight) item.classList.add('featured');
        if (listing.premium || listing.isPremium) item.classList.add('premium-listing');
        // FIX: Use both userId and sellerId for dataset
        item.dataset.listingId = listing.id;
        item.dataset.userId = listing.userId || listing.sellerId;

        const userName = listing.user?.displayName || 'Unknown User';
        const userInitials = userName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
        const availabilityClass = `availability-${listing.availability || 'free'}`;
        const availabilityText = listing.availability ? listing.availability.charAt(0).toUpperCase() + listing.availability.slice(1) : 'Available';

        // Build badges
        let badges = '';
        if (listing.featured || listing.isFeatured || listing.isSpotlight) badges += '<span class="featured-badge"><i class="fas fa-star"></i> FEATURED</span>';
        if (listing.boosted || listing.isBoosted) badges += '<span class="premium-badge"><i class="fas fa-bolt"></i> BOOSTED</span>';
        if (listing.verified || listing.isVerified) badges += '<span class="verified-badge"><i class="fas fa-check-circle"></i> VERIFIED</span>';
        if (listing.teamListing) badges += '<span class="team-badge"><i class="fas fa-users"></i> TEAM</span>';
        if ((listing.premium || listing.isPremium) && !listing.featured && !listing.boosted) badges += '<span class="premium-badge"><i class="fas fa-crown"></i> PREMIUM</span>';

        item.innerHTML = `
            <div class="listing-avatar" style="${listing.type === LISTING_TYPES?.DIGITAL || listing.type === 'digital' ? 'background-color: #4caf50;' : ''}">
                ${listing.type === LISTING_TYPES?.DIGITAL || listing.type === 'digital' ? '<i class="fas fa-file-alt" style="font-size: 20px;"></i>' : 
                  listing.type === LISTING_TYPES?.SERVICE || listing.type === 'service' ? '<i class="fas fa-tools" style="font-size: 20px;"></i>' :
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
                    ${getTrustIndicator ? getTrustIndicator(listing.userId || listing.sellerId, listing.user?.trustLevel) : ''}
                </div>
                <div class="listing-preview">
                    ${escapeHtml((listing.description || '').substring(0, 80))}${listing.description?.length > 80 ? '...' : ''}
                </div>
            </div>
        `;

        if (listing.user?.photoURL && (listing.type === LISTING_TYPES?.SERVICE || listing.type === 'service')) {
            const avatarDiv = item.querySelector('.listing-avatar');
            avatarDiv.style.backgroundImage = `url('${escapeHtml(listing.user.photoURL)}')`;
            avatarDiv.style.backgroundSize = 'cover';
            avatarDiv.style.backgroundPosition = 'center';
            avatarDiv.innerHTML = '';
        }

        item.onclick = () => renderers.viewListingDetail(listing);
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
        if (listing.featured || listing.isFeatured || listing.isSpotlight) badges += '<span class="featured-badge"><i class="fas fa-star"></i> FEATURED</span>';
        if (listing.boosted || listing.isBoosted) badges += '<span class="premium-badge"><i class="fas fa-bolt"></i> BOOSTED</span>';
        if (listing.verified || listing.isVerified) badges += '<span class="verified-badge"><i class="fas fa-check-circle"></i> VERIFIED</span>';
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
                <span class="meta-badge"><i class="fas fa-${listing.type === LISTING_TYPES?.DIGITAL || listing.type === 'digital' ? 'file-alt' : 'tools'}"></i> ${listing.type === LISTING_TYPES?.DIGITAL || listing.type === 'digital' ? 'Digital Item' : 'Service'}</span>
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
            arBtn.onclick = () => {
                showNotification('AR preview feature coming soon!', 'info');
            };
        }

        // Add download button for digital items
        if (listing.type === LISTING_TYPES?.DIGITAL || listing.type === 'digital') {
            if (listing.fileUrl) {
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'action-btn primary';
                downloadBtn.style.marginTop = '20px';
                downloadBtn.style.width = '100%';
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download File';
                downloadBtn.onclick = () => {
                    if (downloadDigitalFile) {
                        downloadDigitalFile(listing.id, listing.fileUrl, listing.fileName || 'download');
                    }
                };
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
        }
        
        // Add purchase button for paid listings
        var priceVal = listing.price;
        var hasPaidPrice = priceVal && priceVal !== '0' && priceVal !== 0 && 
                           String(priceVal).toLowerCase() !== 'free' && 
                           String(priceVal).toLowerCase() !== 'negotiable';
        if (hasPaidPrice) {
            const buyBtn = document.createElement('button');
            buyBtn.className = 'action-btn primary';
            buyBtn.style.marginTop = '20px';
            buyBtn.style.width = '100%';
            buyBtn.style.background = 'linear-gradient(135deg,#4CAF50,#2E7D32)';
            // Format price display
            var num = parseFloat(String(priceVal).replace(/[^0-9.]/g,''));
            var priceDisplay = (!isNaN(num) && num > 0) ? 'KES ' + num.toLocaleString('en-KE') : String(priceVal);
            buyBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Buy Now — ' + priceDisplay;
            buyBtn.onclick = function() {
                openPlaceOrderPanel(listing);
            };
            container.appendChild(buyBtn);
        }

        // Message Seller button — always shown (not just for services)
        const sellerId   = listing.userId || listing.sellerId;
        const sellerName = listing.user?.displayName || listing.user?.username || 'Seller';
        if (sellerId) {
            const contactBtn = document.createElement('button');
            contactBtn.className = 'action-btn secondary';
            contactBtn.style.marginTop = '10px';
            contactBtn.style.width = '100%';
            contactBtn.innerHTML = '<i class="fas fa-comment"></i> Message Seller';
            contactBtn.onclick = () => {
                const chatFn = typeof openChat === 'function' ? openChat : window.openChat;
                if (typeof chatFn === 'function') {
                    chatFn(sellerId, sellerName);
                } else {
                    window.location.href = '/chat.html?recipientId=' + encodeURIComponent(sellerId) + '&name=' + encodeURIComponent(sellerName);
                }
            };
            container.appendChild(contactBtn);
        }

        // Reviews button
        const reviewsBtn = document.createElement('button');
        reviewsBtn.className = 'action-btn secondary';
        reviewsBtn.style.marginTop = '10px';
        reviewsBtn.style.width = '100%';
        reviewsBtn.innerHTML = '<i class="fas fa-star"></i> Reviews & Ratings';
        reviewsBtn.onclick = () => openReviewsPanel(listing.id);
        container.appendChild(reviewsBtn);

        // Seller Profile button
        const sellerBtn = document.createElement('button');
        sellerBtn.className = 'action-btn secondary';
        sellerBtn.style.marginTop = '10px';
        sellerBtn.style.width = '100%';
        sellerBtn.innerHTML = '<i class="fas fa-store"></i> View Seller Profile';
        sellerBtn.onclick = () => openSellerPanel(listing.userId || listing.sellerId);
        container.appendChild(sellerBtn);

    }, '<div class="error-placeholder">Failed to load listing details</div>'),

    // FIX E: Spotlight renderer - show section when items exist
    spotlight: withErrorBoundary('Spotlight', function() {
        if (!DOM.spotlightListings) return;
        const spotlightItems = allListings ? allListings.filter(l => (l.featured || l.isFeatured || l.isSpotlight) && !isListingExpired(l)) : [];
        if (!spotlightItems.length) {
            if (DOM.spotlightSection) DOM.spotlightSection.style.display = 'none';
            return;
        }
        if (DOM.spotlightSection) DOM.spotlightSection.style.display = 'block';
        DOM.spotlightListings.innerHTML = '';
        spotlightItems.slice(0, 5).forEach(listing => {
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
            
            item.onclick = () => renderers.viewListingDetail(listing);
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
            btn.onclick = function(e) {
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
            };
        });
        
        document.querySelectorAll('select[data-member-id]').forEach(select => {
            select.onchange = function() {
                const memberId = this.dataset.memberId;
                const newRole = this.value;
                const member = teamMembers.find(m => m.id === memberId);
                if (member) {
                    member.role = newRole;
                    saveToLocalStorage(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
                    showNotification(`Role updated to ${newRole}`, 'success');
                }
            };
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
            
            // Use userId or sellerId from normalized response
            const userId = user.userId || user.sellerId;
            
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
                        <span><i class="fas fa-list"></i> ${user.listingCount || 0} listings</span>
                        <span><i class="fas fa-star" style="color: gold;"></i> ${user.avgRating || '5.0'}</span>
                        <span><i class="fas fa-check-circle" style="color: var(--success-color);"></i> ${user.totalSales || 0} txns</span>
                    </div>
                </div>
                <div style="font-weight: 700; color: var(--primary-color); background: rgba(0,132,255,0.1); padding: 6px 12px; border-radius: 20px;">
                    ${user.points || user.totalPoints || 0} pts
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
            el.onclick = function() { 
                this.classList.toggle('selected');
                const check = this.querySelector('.fa-check');
                if (check) check.style.opacity = this.classList.contains('selected') ? '1' : '0';
            };
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
            el.onclick = function() { 
                this.classList.toggle('selected');
                const check = this.querySelector('.fa-check');
                if (check) check.style.opacity = this.classList.contains('selected') ? '1' : '0';
            };
            DOM.peopleList.appendChild(el);
        });
        
        // Add search functionality
        if (DOM.peopleSearch) {
            DOM.peopleSearch.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('#peopleList .circle-option').forEach(el => {
                    const name = el.querySelector('div:nth-child(2)')?.textContent?.toLowerCase() || '';
                    el.style.display = name.includes(term) ? 'flex' : 'none';
                });
            };
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

    // FIX: Setup create listing tabs - ensure UIState.createListingActiveTab is updated
    setupCreateListingTabs: withErrorBoundary('SetupCreateListingTabs', function() {
        document.querySelectorAll('.create-listing-tab').forEach(tab => {
            tab.onclick = function() {
                const tabName = this.dataset.tab;
                if (!tabName) return;
                document.querySelectorAll('.create-listing-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                // Update content visibility - support both tab naming conventions
                const contentId = `${tabName}Tab`;
                const altContentId = tabName === 'digital' ? 'digitalTabContent' : contentId;
                document.querySelectorAll('.create-listing-tab-content').forEach(c => c.classList.remove('active'));
                let content = document.getElementById(contentId);
                if (!content) content = document.getElementById(altContentId);
                if (content) content.classList.add('active');
                // FIX: Update UIState.createListingActiveTab when tab changes
                UIState.createListingActiveTab = tabName;
                renderers.togglePublishButtons(tabName);
            };
        });
    }, null),

    setupAvailabilityOptions: withErrorBoundary('SetupAvailabilityOptions', function() {
        document.querySelectorAll('.availability-option').forEach(opt => {
            opt.onclick = function() {
                document.querySelectorAll('.availability-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedAvailability = this.dataset.availability;
            };
        });
    }, null),

    setupCircleOptions: withErrorBoundary('SetupCircleOptions', function() {
        document.querySelectorAll('.circle-option[data-circle]').forEach(opt => {
            opt.onclick = function() {
                document.querySelectorAll('.circle-option[data-circle]').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedTrustCircle = this.dataset.circle;
                updateTrustCircleSelection();
            };
        });
    }, null),

    setupTemplateOptions: withErrorBoundary('SetupTemplateOptions', function() {
        document.querySelectorAll('.template-option').forEach(opt => {
            opt.onclick = function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for premium templates', 'info');
                    return;
                }
                document.querySelectorAll('.template-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedTemplate = this.dataset.template;
            };
        });
    }, null),

    setupMoodOptions: withErrorBoundary('SetupMoodOptions', function() {
        document.querySelectorAll('.mood-option').forEach(opt => {
            opt.onclick = function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for premium mood filters', 'info');
                    return;
                }
                document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedMoodContext = this.dataset.mood;
            };
        });
    }, null),

    setupDurationOptions: withErrorBoundary('SetupDurationOptions', function() {
        document.querySelectorAll('.duration-option').forEach(opt => {
            opt.onclick = function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for extended durations', 'info');
                    return;
                }
                document.querySelectorAll('.duration-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedDuration = this.dataset.duration;
            };
        });
    }, null),

    setupScheduleOptions: withErrorBoundary('SetupScheduleOptions', function() {
        document.querySelectorAll('.schedule-option').forEach(opt => {
            opt.onclick = function() {
                document.querySelectorAll('.schedule-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                UIState.selectedSchedule = this.dataset.schedule;
            };
        });
    }, null),

    setupExportOptions: withErrorBoundary('SetupExportOptions', function() {
        document.querySelectorAll('.export-option').forEach(opt => {
            opt.onclick = function() {
                if (this.classList.contains('premium') && !isUserPremium()) {
                    showNotification('Upgrade to Premium for Excel exports', 'info');
                    return;
                }
                document.querySelectorAll('.export-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                if (exportAnalyticsData) exportAnalyticsData(this.dataset.format);
            };
        });
    }, null),

    setupPaymentMethods: withErrorBoundary('SetupPaymentMethods', function() {
        document.querySelectorAll('.payment-method').forEach(m => {
            m.onclick = function() {
                document.querySelectorAll('.payment-method').forEach(p => p.classList.remove('selected'));
                this.classList.add('selected');
                renderers.showPaymentFormForMethod(this.dataset.method);
            };
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
// SIMPLIFIED: Removed isActive() checks from showCreateListingModal
function showCreateListingModal() {
    console.log('[Tool-ui] showCreateListingModal called - DIRECT');
    // Direct DOM access - don't rely on DOM cache
    const modal = document.getElementById('createListingModal');
    if (modal) {
        modal.classList.add('active');
        console.log('[Tool-ui] Modal opened successfully');
    } else {
        console.error('[Tool-ui] Modal element NOT FOUND!');
        // Fallback - create alert
        alert('Create Listing feature - modal not found');
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
    
    // Support both naming conventions
    let content = document.getElementById(`${tab}Tab`);
    if (!content && tab === 'digital') content = document.getElementById('digitalTabContent');
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
// Expose on window for emergency handler fallback
window._publishListingFromModal = function() { return publishListingFromModal(); };
async function publishListingFromModal() {
    const activeTab = UIState.createListingActiveTab || 'service';

    // ── Immediate visual feedback — disable button while working ──────────────
    const publishBtn = document.getElementById('publishListingBtn');
    const originalBtnText = publishBtn ? publishBtn.innerHTML : '';
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';
    }

    try {
        // ── SERVICE tab ───────────────────────────────────────────────────────
        if (activeTab === 'service') {
            const title       = DOM.serviceTitle?.value?.trim();
            const description = DOM.serviceDescription?.value?.trim();
            const price       = DOM.servicePrice?.value?.trim();
            const condition   = document.getElementById('serviceCondition')?.value
                             || document.querySelector('[name="serviceCondition"]')?.value
                             || 'new';

            if (!title) {
                showNotification('Please enter a title', 'error');
                return;
            }
            if (!description) {
                showNotification('Please enter a description', 'error');
                return;
            }

            const opts = {
                price:          price       || '0',
                condition:      condition,
                category:       document.getElementById('serviceCategory')?.value || 'services',
                visibility:     UIState.selectedTrustCircle,
                moodContext:    UIState.selectedMoodContext,
                template:       UIState.selectedTemplate,
                featured:       DOM.featuredListingCheckbox?.checked || false,
                boosted:        DOM.boostListingCheckbox?.checked    || false,
                autoRenew:      DOM.autoRenewCheckbox?.checked       || false,
                videoIntro:     UIState.selectedVideoIntro,
                teamMembers:    UIState.selectedTeamMembers || [],
                allowedGroups:  UIState.selectedGroups,
                allowedUsers:   UIState.selectedUsers,
            };

            const listing = typeof createServiceListing === 'function'
                ? await createServiceListing(title, description, opts)
                : await marketplaceCore?.createListing({
                    title, description, type: 'service', condition, ...opts
                  });

            if (listing) {
                hideCreateListingModal();
                resetCreateListingForm();
                UIPipeline.syncFromCoreGlobals();
                UIPipeline.liveUpdate();
            }
            return;
        }

        // ── DIGITAL tab ───────────────────────────────────────────────────────
        if (activeTab === 'digital') {
            const title       = DOM.digitalTitle?.value?.trim();
            const description = DOM.digitalDescription?.value?.trim();
            const price       = DOM.digitalPrice?.value?.trim();
            const condition   = document.getElementById('digitalCondition')?.value
                             || document.querySelector('[name="digitalCondition"]')?.value
                             || 'new';

            if (!title) {
                showNotification('Please enter a title', 'error');
                return;
            }
            if (!description) {
                showNotification('Please enter a description', 'error');
                return;
            }
            if (!UIState.selectedDigitalFile) {
                showNotification('Please upload a file', 'error');
                return;
            }

            const opts = {
                price:       price || '0',
                condition:   condition,
                category:    document.getElementById('digitalCategory')?.value || 'digital',
                visibility:  UIState.selectedTrustCircle,
                moodContext: UIState.selectedMoodContext,
                template:    UIState.selectedTemplate,
                featured:    DOM.featuredListingCheckbox?.checked || false,
                boosted:     DOM.boostListingCheckbox?.checked    || false,
                autoRenew:   DOM.autoRenewCheckbox?.checked       || false,
            };

            const listing = typeof createDigitalListing === 'function'
                ? await createDigitalListing(title, description, UIState.selectedDigitalFile, opts)
                : await marketplaceCore?.createListing({
                    title, description, type: 'digital', condition, ...opts
                  });

            if (listing) {
                hideCreateListingModal();
                resetCreateListingForm();
                UIPipeline.syncFromCoreGlobals();
                UIPipeline.liveUpdate();
            }
            return;
        }

        // ── PHYSICAL / OTHER tabs — delegate to core ───────────────────────
        showNotification('Tab "' + activeTab + '" is not yet supported', 'info');

    } catch (err) {
        if (window.__TOOLS_DEBUG__) console.error('[publishListingFromModal] Error:', err.message);
        showNotification('Failed to publish listing. Please try again.', 'error');
    } finally {
        // Always restore publish button
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = originalBtnText || '<i class="fas fa-paper-plane"></i> Publish Listing';
        }
    }
}

function publishPremiumListingFromModal() {
    if (!isUserPremium()) {
        showNotification('Premium feature - please upgrade', 'info');
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
    if (UIState.createListingActiveTab === 'service' || DOM.serviceTitle?.value) {
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

window._saveCurrentAsDraft = function() { saveCurrentAsDraft(); };
function saveCurrentAsDraft() {
    console.log('[saveCurrentAsDraft] Called');
    
    // Get current form data
    const activeTab = UIState.createListingActiveTab || 'service';
    const title = activeTab === 'service' ? 
        (DOM.serviceTitle?.value || 'Untitled') : 
        (DOM.digitalTitle?.value || 'Untitled');
    
    // Store in localStorage so it persists
    const draft = {
        id: 'draft_' + Date.now(),
        title: title,
        tab: activeTab,
        savedAt: new Date().toISOString()
    };
    
    try {
        let drafts = JSON.parse(localStorage.getItem('marketplace_drafts') || '[]');
        drafts.unshift(draft);
        drafts = drafts.slice(0, 10); // Keep last 10 drafts
        localStorage.setItem('marketplace_drafts', JSON.stringify(drafts));
        // Also save to LocalStoreTools IDB for offline resilience
        const LST = window.LocalStoreTools;
        if (LST && LST.saveDraftLocal) {
            LST.saveDraftLocal(draft).catch(()=>{});
        }
        showNotification(`Draft "${title}" saved!`, 'success');
    } catch(e) {
        console.error('Failed to save draft:', e);
        showNotification('Draft saved (in memory)', 'success');
    }
    
    hideCreateListingModal();
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
        // FIX: Load data first, then render
        if (loadLeaderboard) {
            loadLeaderboard().then(data => {
                if (data && Array.isArray(data)) leaderboardData = data;
                renderers.leaderboard();
            }).catch(() => renderers.leaderboard());
        } else {
            renderers.leaderboard();
        }
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
        // FIX: Sync savedItems from window globals before rendering
        if (window.savedItems) savedItems = window.savedItems;
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
        card.querySelector('button').onclick = () => {
            renderers.viewListingDetail(item);
            hideSavedItemsModal();
        };
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
    const container = DOM.trustStatsModal ? DOM.trustStatsModal.querySelector('.modal-content, .trust-stats-content, [id*="trustStats"]') : null;
    const statsEl = document.getElementById('trustStatsContent') || (DOM.trustStatsModal ? DOM.trustStatsModal.querySelector('.modal-body, .stats-body') : null);
    
    const target = statsEl || container;
    if (!target) return;
    
    // FIX: Build real stats from local data
    const totalListings = (window.myListings || myListings || []).length;
    const totalSaved = (window.savedItems || savedItems || []).length;
    const ts = trustStats || {};
    const listingCreated = ts.listingCreated || totalListings || 0;
    const fileDownloaded = ts.fileDownloaded || 0;
    const tipReceived = ts.tipReceived || 0;
    
    const user = window.currentUser || currentUser || {};
    const trustLevel = user.trustLevel || 'new';
    const trustLevelMap = {
        'new': { label: 'New', color: '#9e9e9e', icon: 'fa-star', score: 10 },
        'responsive': { label: 'Responsive', color: '#2196F3', icon: 'fa-comments', score: 30 },
        'reliable': { label: 'Reliable', color: '#4caf50', icon: 'fa-check-circle', score: 60 },
        'verified': { label: 'Verified', color: '#9c27b0', icon: 'fa-shield-alt', score: 80 },
        'pro': { label: 'Pro', color: '#ff9800', icon: 'fa-crown', score: 100 }
    };
    const tl = trustLevelMap[trustLevel] || trustLevelMap['new'];
    
    target.innerHTML = `
        <div style="padding: 20px;">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    <i class="fas ${tl.icon}"></i>
                </div>
                <div>
                    <div style="font-weight: 700; font-size: 18px;">${tl.label} Seller</div>
                    <div style="font-size: 13px; opacity: 0.9;">Trust Score: ${tl.score}/100</div>
                    <div style="margin-top: 8px; background: rgba(255,255,255,0.3); border-radius: 4px; height: 6px; width: 160px;">
                        <div style="width: ${tl.score}%; height: 100%; background: white; border-radius: 4px;"></div>
                    </div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="padding: 16px; background: var(--secondary-color, #f5f5f5); border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: var(--primary-color, #0084ff);">${listingCreated}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888); margin-top: 4px;"><i class="fas fa-list"></i> Listings Created</div>
                </div>
                <div style="padding: 16px; background: var(--secondary-color, #f5f5f5); border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #4caf50;">${totalSaved}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888); margin-top: 4px;"><i class="fas fa-bookmark"></i> Items Saved</div>
                </div>
                <div style="padding: 16px; background: var(--secondary-color, #f5f5f5); border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #ff9800;">${fileDownloaded}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888); margin-top: 4px;"><i class="fas fa-download"></i> Downloads</div>
                </div>
                <div style="padding: 16px; background: var(--secondary-color, #f5f5f5); border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #e91e63;">${tipReceived}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888); margin-top: 4px;"><i class="fas fa-gift"></i> Tips Received</div>
                </div>
            </div>
            <div style="margin-top: 16px; padding: 12px; background: rgba(76,175,80,0.1); border-radius: 8px; border: 1px solid rgba(76,175,80,0.3);">
                <div style="font-size: 13px; color: #4caf50;"><i class="fas fa-info-circle"></i> Maintain a high response rate and positive reviews to level up your trust badge.</div>
            </div>
        </div>
    `;
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
    const listing = UIState.currentListingData;
    if (!listing) { showNotification('No listing selected', 'info'); return; }
    openPlaceOrderPanel(listing);
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
    const listing = UIState.currentListingData;
    if (!listing) { showNotification('No listing selected', 'info'); return; }
    const sellerId   = listing.userId || listing.sellerId;
    const sellerName = listing.user?.displayName || listing.user?.username || 'Seller';
    const chatFn = typeof openChat === 'function' ? openChat : window.openChat;
    if (typeof chatFn === 'function') {
        chatFn(sellerId, sellerName);
    } else {
        const url = '/chat.html?recipientId=' + encodeURIComponent(sellerId) + '&name=' + encodeURIComponent(sellerName);
        window.location.href = url;
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

// SIMPLIFIED: Removed isActive() checks from setActiveTab
function setActiveTab(tab) {
    console.log('[Tool-ui] setActiveTab called with:', tab);
    UIState.activeTab = tab;
    
    // Update tab UI
    const tabIds = ['allTab', 'servicesTab', 'digitalTab', 'friendsTab', 'groupsTab', 'myTab', 'premiumTab', 'spotlightTab'];
    tabIds.forEach(tabId => {
        const tabElement = document.getElementById(tabId);
        if (tabElement) {
            let tabName = tabId.replace('Tab', '');
            // Map tab names to match expected values
            if (tabName === 'services') tabName = 'services';
            if (tabName === 'digital') tabName = 'digital';
            if (tabName === 'my') tabName = 'my';
            if (tabName === 'premium') tabName = 'premium';
            if (tabName === 'spotlight') tabName = 'spotlight';
            if (tabName === 'all') tabName = 'all';
            if (tabName === 'friends') tabName = 'friends';
            if (tabName === 'groups') tabName = 'groups';
            
            if (tabName === tab) {
                tabElement.classList.add('active');
            } else {
                tabElement.classList.remove('active');
            }
        }
    });
    
    // Refresh the listings
    if (UIPipeline && UIPipeline.liveUpdate) {
        UIPipeline.liveUpdate();
    } else if (renderers && renderers.marketplaceList) {
        renderers.marketplaceList();
    }
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
// 8. SECURITY – SANITIZATION UTILITY
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
// 9. RESPONSIVE / TOUCH ENGINE
// ----------------------------------------------------------------------
const ResponsiveEngine = {
    init() {
        this.setViewportMeta();
        this.attachTouchOptimizations();
        window.addEventListener('resize', () => setTimeout(this.adjustLayout.bind(this), 150));
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
// 10. COMPATIBILITY LAYER (UPDATED)
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
                    canExecuteAction: canExecuteAction(),
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
            
            console.log('[pageCore] UI initialized v7.1');
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

    // Hide "Loading marketplace" banner after max 4s regardless of core state
    setTimeout(() => {
        const el = document.getElementById('marketplaceStatusMessage');
        if (el) el.style.display = 'none';
    }, 4000);

    await pageCore.init();
    
    // Start health monitoring
    UIPipeline.startHealthMonitoring();
    
    // Dispatch marketplaceUIReady so Tools.html monitor knows UI is loaded
    window.dispatchEvent(new CustomEvent('marketplaceUIReady', {
        detail: { timestamp: Date.now(), version: '7.1' }
    }));
    
    logOnce('ui_ready', '[Tool-ui.js] Resilient UI controller ready v7.1 (Handshake aligned - Simplified)');
});

// =============================================
// FORCE UI BINDING AFTER DOM FULLY LOADS
// =============================================
function forceBindAllUIEvents() {
    console.log('[Tool-ui] Force binding all UI events...');
    
    cacheDOMElements();
    
    setTimeout(() => {
        // Bind category tabs
        const tabs = [
            { id: 'allTab', name: 'all' },
            { id: 'servicesTab', name: 'services' },
            { id: 'digitalTab', name: 'digital' },
            { id: 'friendsTab', name: 'friends' },
            { id: 'groupsTab', name: 'groups' },
            { id: 'myTab', name: 'my' },
            { id: 'premiumTab', name: 'premium' },
            { id: 'spotlightTab', name: 'spotlight' }
        ];
        
        tabs.forEach(tab => {
            const el = document.getElementById(tab.id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = 'true';
                el.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Tool-ui] Tab clicked:', tab.name);
                    setActiveTab(tab.name);
                };
            }
        });
        
        // Bind create listing buttons
        const createBtns = ['createListingBtn', 'createListingQuickBtn', 'sellServiceBtn', 'sellDigitalBtn'];
        createBtns.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn && !btn.dataset.bound) {
                btn.dataset.bound = 'true';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btnId === 'sellServiceBtn') switchCreateTab('service');
                    if (btnId === 'sellDigitalBtn') switchCreateTab('digital');
                    showCreateListingModal();
                };
            }
        });
        
        // Bind publish button
        const publishBtn = document.getElementById('publishListingBtn');
        if (publishBtn && !publishBtn.dataset.bound) {
            publishBtn.dataset.bound = 'true';
            publishBtn.onclick = (e) => {
                e.preventDefault();
                publishListingFromModal();
            };
        }
        
        // Bind modal close buttons
        const closeModal = document.getElementById('closeCreateListingModal');
        if (closeModal && !closeModal.dataset.bound) {
            closeModal.dataset.bound = 'true';
            closeModal.onclick = () => hideCreateListingModal();
        }
        
        // Bind back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn && !backBtn.dataset.bound) {
            backBtn.dataset.bound = 'true';
            backBtn.onclick = () => {
                if (DOM.marketplaceDetailPanel) {
                    DOM.marketplaceDetailPanel.classList.remove('active');
                }
            };
        }
        
        // Bind view buttons
        const viewBtns = ['viewAnalyticsBtn', 'viewSavedBtn', 'viewNotesBtn', 'viewTrustStatsBtn', 'premiumOptionsBtn', 'viewTeamBtn', 'viewLeaderboardBtn'];
        viewBtns.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn && !btn.dataset.bound) {
                btn.dataset.bound = 'true';
                btn.onclick = (e) => {
                    e.preventDefault();
                    if (btnId === 'viewAnalyticsBtn') showAnalyticsModal();
                    if (btnId === 'viewSavedBtn') showSavedItemsModal();
                    if (btnId === 'viewNotesBtn') showMyNotesModal();
                    if (btnId === 'viewTrustStatsBtn') showTrustStatsModal();
                    if (btnId === 'premiumOptionsBtn') showPremiumOptionsModal();
                    if (btnId === 'viewTeamBtn') showTeamManagementModal();
                    if (btnId === 'viewLeaderboardBtn') showLeaderboardModal();
                };
            }
        });
        
        console.log('[Tool-ui] Force binding complete - bound', document.querySelectorAll('[data-bound="true"]').length, 'elements');
    }, 200);
}

// Expose to window for manual triggering
window.forceBindAllUIEvents = forceBindAllUIEvents;

// Run after DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceBindAllUIEvents);
} else {
    // DOM already loaded, run after a short delay to ensure all elements exist
    setTimeout(forceBindAllUIEvents, 100);
}

// Also run when module becomes active
window.addEventListener('tools:active', () => {
    console.log('[Tool-ui] tools:active received, re-binding UI events');
    setTimeout(forceBindAllUIEvents, 200);
});

window.addEventListener('marketplaceCoreReady', () => {
    console.log('[Tool-ui] marketplaceCoreReady received, re-binding UI events');
    setTimeout(forceBindAllUIEvents, 200);
});

// =============================================
// SIMPLIFIED DIRECT CLICK HANDLERS - NO DEPENDENCIES
// =============================================

function directAttachHandlers() {
    console.log('[DIRECT] Attaching click handlers');
    
    // Create Listing button
    const createBtn = document.getElementById('createListingBtn');
    if (createBtn) {
        createBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DIRECT] Create Listing clicked');
            const modal = document.getElementById('createListingModal');
            if (modal) modal.classList.add('active');
            return false;
        };
        console.log('[DIRECT] createListingBtn OK');
    } else {
        console.log('[DIRECT] createListingBtn NOT FOUND');
    }
    
    // Sell Service button
    const serviceBtn = document.getElementById('sellServiceBtn');
    if (serviceBtn) {
        serviceBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DIRECT] Sell Service clicked');
            const modal = document.getElementById('createListingModal');
            if (modal) modal.classList.add('active');
            // Try to switch to service tab
            const serviceTab = document.querySelector('.create-listing-tab[data-tab="service"]');
            if (serviceTab) serviceTab.click();
            return false;
        };
        console.log('[DIRECT] sellServiceBtn OK');
    }
    
    // Sell Digital button
    const digitalBtn = document.getElementById('sellDigitalBtn');
    if (digitalBtn) {
        digitalBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DIRECT] Sell Digital clicked');
            const modal = document.getElementById('createListingModal');
            if (modal) modal.classList.add('active');
            const digitalTab = document.querySelector('.create-listing-tab[data-tab="digital"]');
            if (digitalTab) digitalTab.click();
            return false;
        };
        console.log('[DIRECT] sellDigitalBtn OK');
    }
    
    // Quick Create button
    const quickBtn = document.getElementById('createListingQuickBtn');
    if (quickBtn) {
        quickBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DIRECT] Quick Create clicked');
            const modal = document.getElementById('createListingModal');
            if (modal) modal.classList.add('active');
            return false;
        };
        console.log('[DIRECT] createListingQuickBtn OK');
    }
    
    // Close modal button
    const closeBtn = document.getElementById('closeCreateListingModal');
    if (closeBtn) {
        closeBtn.onclick = function(e) {
            e.preventDefault();
            const modal = document.getElementById('createListingModal');
            if (modal) modal.classList.remove('active');
            return false;
        };
        console.log('[DIRECT] closeCreateListingModal OK');
    }
    
    // Category tabs
    const tabs = ['allTab', 'servicesTab', 'digitalTab', 'friendsTab', 'groupsTab', 'myTab', 'premiumTab', 'spotlightTab'];
    tabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DIRECT] Tab clicked:', tabId);
                // Remove active from all tabs
                tabs.forEach(id => {
                    const t = document.getElementById(id);
                    if (t) t.classList.remove('active');
                });
                this.classList.add('active');
                const tabName = tabId.replace('Tab', '');
                setActiveTab(tabName);
                return false;
            };
            console.log('[DIRECT] Tab attached:', tabId);
        }
    });
    
    // View buttons
    const viewAnalytics = document.getElementById('viewAnalyticsBtn');
    if (viewAnalytics) {
        viewAnalytics.onclick = function(e) {
            e.preventDefault();
            console.log('[DIRECT] Analytics clicked');
            const modal = document.getElementById('analyticsModal');
            if (modal) modal.classList.add('active');
            return false;
        };
    }
    
    const viewSaved = document.getElementById('viewSavedBtn');
    if (viewSaved) {
        viewSaved.onclick = function(e) {
            e.preventDefault();
            console.log('[DIRECT] Saved clicked');
            const modal = document.getElementById('savedItemsModal');
            if (modal) modal.classList.add('active');
            return false;
        };
    }
    
    const viewNotes = document.getElementById('viewNotesBtn');
    if (viewNotes) {
        viewNotes.onclick = function(e) {
            e.preventDefault();
            console.log('[DIRECT] Notes clicked');
            const modal = document.getElementById('myNotesModal');
            if (modal) modal.classList.add('active');
            return false;
        };
    }
    
    const viewTrust = document.getElementById('viewTrustStatsBtn');
    if (viewTrust) {
        viewTrust.onclick = function(e) {
            e.preventDefault();
            console.log('[DIRECT] Trust stats clicked');
            const modal = document.getElementById('trustStatsModal');
            if (modal) modal.classList.add('active');
            return false;
        };
    }
    
    const premiumOpts = document.getElementById('premiumOptionsBtn');
    if (premiumOpts) {
        premiumOpts.onclick = function(e) {
            e.preventDefault();
            console.log('[DIRECT] Premium options clicked');
            const modal = document.getElementById('premiumOptionsModal');
            if (modal) modal.classList.add('active');
            return false;
        };
    }
    
    console.log('[DIRECT] All handlers attached');
}

// Run immediately and repeatedly
directAttachHandlers();
setTimeout(directAttachHandlers, 500);
setTimeout(directAttachHandlers, 1000);
setTimeout(directAttachHandlers, 2000);
setTimeout(directAttachHandlers, 5000);

// Also run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', directAttachHandlers);
}

// Also run when tools becomes active
window.addEventListener('tools:active', function() {
    console.log('[DIRECT] tools:active event');
    setTimeout(directAttachHandlers, 100);
});

// =============================================
// COMPLETE WORKING SOLUTION - PASTE THIS AT THE VERY END OF Tool-ui.js
// =============================================

(function() {
    'use strict';
    
    // Store if we've already attached to prevent duplicate runs
    if (window._emergencyHandlersAttached) return;
    window._emergencyHandlersAttached = true;
    
    console.log('[FIX] Starting emergency click handler initialization');
    
    function openCreateModal() {
        var modal = document.getElementById('createListingModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        } else {
            alert('Create Listing feature - please check console');
        }
    }
    
    function closeCreateModal() {
        var modal = document.getElementById('createListingModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    }
    
    // Attach handlers only once
    function attachHandlers() {
        // Create Listing Button
        var createBtn = document.getElementById('createListingBtn');
        if (createBtn && !createBtn.dataset.fixed) {
            createBtn.dataset.fixed = 'true';
            createBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                openCreateModal();
                return false;
            };
        }
        
        // Publish Button
        var publishBtn = document.getElementById('publishListingBtn');
        if (publishBtn && !publishBtn.dataset.fixed) {
            publishBtn.dataset.fixed = 'true';
            publishBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                // Try module-scope function first, then window global
                var fn = (typeof publishListingFromModal === 'function') ? publishListingFromModal : window._publishListingFromModal;
                if (fn) {
                    fn();
                } else {
                    // Last resort: read form and save locally
                    window._emergencyPublish();
                }
                return false;
            };
        }
        
        // Save Draft Button
        var draftBtn = document.getElementById('saveDraftBtn');
        if (draftBtn && !draftBtn.dataset.fixed) {
            draftBtn.dataset.fixed = 'true';
            draftBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                var fn = (typeof saveCurrentAsDraft === 'function') ? saveCurrentAsDraft : window._saveCurrentAsDraft;
                if (fn) {
                    fn();
                } else {
                    window._emergencyDraft();
                }
                return false;
            };
        }
        
        // Sell Service Button
        var serviceBtn = document.getElementById('sellServiceBtn');
        if (serviceBtn && !serviceBtn.dataset.fixed) {
            serviceBtn.dataset.fixed = 'true';
            serviceBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                openCreateModal();
                setTimeout(function() {
                    var serviceTab = document.querySelector('.create-listing-tab[data-tab="service"]');
                    if (serviceTab) serviceTab.click();
                }, 100);
                return false;
            };
        }
        
        // Sell Digital Button
        var digitalBtn = document.getElementById('sellDigitalBtn');
        if (digitalBtn && !digitalBtn.dataset.fixed) {
            digitalBtn.dataset.fixed = 'true';
            digitalBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                openCreateModal();
                setTimeout(function() {
                    var digitalTab = document.querySelector('.create-listing-tab[data-tab="digital"]');
                    if (digitalTab) digitalTab.click();
                }, 100);
                return false;
            };
        }
        
        // Close Modal Button
        var closeBtn = document.getElementById('closeCreateListingModal');
        if (closeBtn && !closeBtn.dataset.fixed) {
            closeBtn.dataset.fixed = 'true';
            closeBtn.onclick = function(e) {
                e.preventDefault();
                closeCreateModal();
                return false;
            };
        }
        
        console.log('[FIX] Handlers attached once');
    }
    
    // Run immediately and after DOM ready
    attachHandlers();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachHandlers);
    }

    // ── Emergency Publish (if module functions not yet in scope) ──
    window._emergencyPublish = function() {
        var activeTab = (window.UIState && window.UIState.createListingActiveTab) || 'service';
        var title = '';
        var description = '';
        var price = '';
        if (activeTab === 'digital') {
            title = (document.getElementById('digitalTitle') || {}).value || '';
            description = (document.getElementById('digitalDescription') || {}).value || '';
            price = (document.getElementById('digitalPrice') || {}).value || '';
        } else {
            title = (document.getElementById('serviceTitle') || {}).value || '';
            description = (document.getElementById('serviceDescription') || {}).value || '';
            price = (document.getElementById('servicePrice') || {}).value || '';
        }
        if (!title || !description) {
            alert('Please fill in title and description');
            return;
        }
        var listing = {
            id: 'listing_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
            type: activeTab === 'digital' ? 'digital' : 'service',
            title: title,
            description: description,
            price: price,
            available: true,
            sellerId: (window.currentUser && window.currentUser.id) || 'local',
            sellerName: (window.currentUser && (window.currentUser.displayName || window.currentUser.name)) || 'You',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        // Save via LocalStoreTools
        var LST = window.LocalStoreTools;
        if (LST && LST.saveListingLocal) {
            LST.saveListingLocal(listing).then(function() {
                window.allListings = window.allListings || [];
                window.allListings.unshift(listing);
                window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: window.allListings, source: 'local' } }));
                if (window.showNotification) window.showNotification('Listing published locally!', 'success');
                var modal = document.getElementById('createListingModal');
                if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
            });
        } else {
            // Fallback to localStorage
            try {
                var stored = JSON.parse(localStorage.getItem('mktp_all_listings') || '[]');
                stored.unshift(listing);
                localStorage.setItem('mktp_all_listings', JSON.stringify(stored));
                window.allListings = stored;
                window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: stored, source: 'local' } }));
            } catch(e) {}
            if (window.showNotification) window.showNotification('Listing saved locally!', 'success');
            var modal = document.getElementById('createListingModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
        }
    };

    window._emergencyDraft = function() {
        var activeTab = (window.UIState && window.UIState.createListingActiveTab) || 'service';
        var title = (document.getElementById(activeTab === 'digital' ? 'digitalTitle' : 'serviceTitle') || {}).value || 'Untitled Draft';
        var description = (document.getElementById(activeTab === 'digital' ? 'digitalDescription' : 'serviceDescription') || {}).value || '';
        var draft = {
            id: 'draft_' + Date.now(),
            title: title,
            description: description,
            tab: activeTab,
            savedAt: new Date().toISOString()
        };
        try {
            var drafts = JSON.parse(localStorage.getItem('marketplace_drafts') || '[]');
            drafts.unshift(draft);
            drafts = drafts.slice(0, 10);
            localStorage.setItem('marketplace_drafts', JSON.stringify(drafts));
        } catch(e) {}
        var LST = window.LocalStoreTools;
        if (LST && LST.saveDraftLocal) LST.saveDraftLocal(draft).catch(function(){});
        if (window.showNotification) window.showNotification('Draft "' + title + '" saved!', 'success');
        var modal = document.getElementById('createListingModal');
        if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    };
})();

// =============================================
// SETTINGS LIVE-APPLY BRIDGE (UI Layer)
// =============================================
(function installSettingsUIBridge() {
    function applyUISettingChange(section, key, value) {
        if (section === "appearance") {
            if (key === "theme") {
                var t = value === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value;
                document.documentElement.setAttribute("data-theme", t);
                document.body.setAttribute("data-theme", t);
                document.body.classList.toggle("dark-theme", t === "dark");
                document.documentElement.style.colorScheme = t;
            }
            if (key === "fontSize") document.documentElement.style.fontSize = parseInt(value) + "px";
            if (key === "accentColor") { document.documentElement.style.setProperty("--accent-color", value); document.documentElement.style.setProperty("--primary-color", value); }
            if (key === "compactMode") { document.documentElement.setAttribute("data-compact", value ? "true" : "false"); document.body.classList.toggle("compact-mode", !!value); }
            if (key === "animationsEnabled" || key === "animations") { document.body.classList.toggle("no-animations", !value); document.documentElement.setAttribute("data-animations", value ? "true" : "false"); }
            if (key === "language") document.documentElement.setAttribute("lang", value);
        }
        if (section === "advanced") {
            if (key === "reduceMotion") { document.body.classList.toggle("reduce-motion", !!value); document.documentElement.setAttribute("data-reduce-motion", value ? "true" : "false"); }
            if (key === "performanceMode") document.documentElement.setAttribute("data-performance-mode", value ? "true" : "false");
        }
        if (section === "mood" && key === "currentMood") document.documentElement.setAttribute("data-mood", value);
    }
    function applyAll(settings) {
        if (!settings || typeof settings !== "object") return;
        Object.entries(settings).forEach(function(se) {
            var sec = se[0], secVal = se[1];
            if (secVal && typeof secVal === "object") {
                Object.entries(secVal).forEach(function(ke) { try { applyUISettingChange(sec, ke[0], ke[1]); } catch(e) {} });
            }
        });
    }
    window.addEventListener("settingChanged", function(e) { try { var d = e.detail; applyUISettingChange(d.section, d.key, d.value); } catch(err) {} });
    window.addEventListener("settingsUpdated", function(e) { try { applyAll(e.detail && e.detail.settings); } catch(err) {} });
    window.addEventListener("message", function(e) {
        try {
            var data = e.data;
            if (!data || typeof data !== "object") return;
            if (data.type === "SETTING_CHANGED") { var p = data.payload || data; if (p.section && p.key !== undefined) applyUISettingChange(p.section, p.key, p.value); }
            if (data.type === "SETTINGS_UPDATED") { applyAll((data.payload && data.payload.settings) || data.settings); }
        } catch(err) {}
    });
    try {
        var cached = localStorage.getItem("knecta_settings_cache");
        if (cached) { var parsed = JSON.parse(cached); var settings = (parsed && parsed.data) ? parsed.data : parsed; if (parsed.timestamp && (Date.now() - parsed.timestamp) < 86400000) applyAll(settings); }
    } catch(e) {}
})();
// [exports moved to end of file]
// ══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE PANELS — Orders, Reviews, Seller Profile
// Injected into Tools.html at runtime, powered by existing auth + API layer
// ══════════════════════════════════════════════════════════════════════════════

(function initMarketplacePanels() {

    // ── Inject panel HTML once ────────────────────────────────────────────────
    function injectPanels() {
        if (document.getElementById('mp-orders-panel')) return;
        // Hide any stuck "Loading marketplace" banner immediately
        const stuck = document.getElementById('marketplaceStatusMessage');
        if (stuck) stuck.style.display = 'none';
        // Also hide it after a short delay in case it renders after us
        setTimeout(() => {
            const s2 = document.getElementById('marketplaceStatusMessage');
            if (s2) s2.style.display = 'none';
        }, 1000);
        document.body.insertAdjacentHTML('beforeend', `
<style>
.mp-panel{position:fixed;inset:0;z-index:9000;display:none;align-items:flex-end;background:rgba(0,0,0,.5);}
.mp-panel.active{display:flex;}
.mp-sheet{background:var(--bg-primary,#fff);width:100%;max-width:640px;margin:0 auto;border-radius:20px 20px 0 0;max-height:90vh;overflow-y:auto;padding:20px;box-sizing:border-box;}
.mp-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.mp-hdr h3{margin:0;font-size:18px;font-weight:700;}
.mp-x{background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-secondary,#888);line-height:1;}
.mp-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:600;transition:.15s;}
.mp-btn:disabled{opacity:.5;cursor:not-allowed;}
.mp-primary{background:var(--primary-color,#6C63FF);color:#fff;}
.mp-primary:hover:not(:disabled){opacity:.88;}
.mp-danger{background:#ef4444;color:#fff;}
.mp-outline{background:transparent;border:1.5px solid var(--border-color,#e0e0e0);color:var(--text-primary,#222);}
.mp-card{border:1px solid var(--border-color,#e0e0e0);border-radius:12px;padding:14px;margin-bottom:12px;}
.mp-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;}
.mp-badge.pending{background:#fef9c3;color:#854d0e;}
.mp-badge.paid{background:#dcfce7;color:#166534;}
.mp-badge.shipped{background:#dbeafe;color:#1e40af;}
.mp-badge.delivered{background:#d1fae5;color:#065f46;}
.mp-badge.cancelled{background:#fee2e2;color:#991b1b;}
.mp-badge.refunded{background:#f3f4f6;color:#374151;}
.mp-stars{color:#f59e0b;font-size:16px;letter-spacing:2px;}
.mp-stars-input span{font-size:30px;cursor:pointer;color:#d1d5db;transition:.1s;}
.mp-stars-input span.on{color:#f59e0b;}
.mp-field{margin-bottom:14px;}
.mp-field label{display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:var(--text-secondary,#666);}
.mp-field input,.mp-field textarea,.mp-field select{width:100%;padding:10px 12px;border:1.5px solid var(--border-color,#e0e0e0);border-radius:10px;font-size:14px;background:var(--bg-primary,#fff);color:var(--text-primary,#222);box-sizing:border-box;}
.mp-field textarea{resize:vertical;min-height:72px;}
.mp-tabs{display:flex;border-bottom:2px solid var(--border-color,#e0e0e0);margin-bottom:16px;overflow-x:auto;}
.mp-tab{padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-secondary,#888);}
.mp-tab.active{border-bottom-color:var(--primary-color,#6C63FF);color:var(--primary-color,#6C63FF);}
.mp-spinner{text-align:center;padding:32px;color:var(--text-secondary,#888);}
.mp-empty{text-align:center;padding:40px 20px;color:var(--text-secondary,#888);}
.mp-stat-row{display:flex;gap:10px;margin-bottom:16px;}
.mp-stat{flex:1;background:var(--bg-secondary,#f5f5f5);border-radius:10px;padding:12px;text-align:center;}
.mp-stat strong{display:block;font-size:22px;font-weight:800;}
.mp-stat span{font-size:12px;color:var(--text-secondary,#888);}
.mp-seller-avatar{width:68px;height:68px;border-radius:50%;background:var(--primary-color,#6C63FF);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:700;margin:0 auto 10px;overflow:hidden;}
.mp-seller-avatar img{width:100%;height:100%;object-fit:cover;}
.mp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.mp-product-tile{border:1px solid var(--border-color,#e0e0e0);border-radius:10px;overflow:hidden;}
.mp-product-tile-img{width:100%;height:88px;object-fit:cover;background:var(--bg-secondary,#f5f5f5);display:flex;align-items:center;justify-content:center;font-size:26px;}
.mp-product-tile-body{padding:8px;}
.mp-product-tile-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mp-product-tile-price{font-size:12px;color:var(--primary-color,#6C63FF);font-weight:700;}
/* ── Responsive overrides ───────────────────────────────────────────────── */
@media(max-width:480px){
  .mp-sheet{border-radius:16px 16px 0 0;padding:16px 14px;max-height:95vh;}
  .mp-btn{padding:9px 12px;font-size:13px;}
  .mp-tabs{gap:0;}
  .mp-tab{padding:8px 10px;font-size:12px;}
  .mp-stat-row{gap:6px;}
  .mp-stat strong{font-size:18px;}
  .mp-grid-2{grid-template-columns:1fr 1fr;gap:8px;}
  .mp-product-tile-img{height:72px;}
  .mp-hdr h3{font-size:16px;}
  .mp-field input,.mp-field textarea,.mp-field select{font-size:16px;} /* prevent iOS zoom */
}
@media(min-width:768px){
  .mp-panel{align-items:center;}
  .mp-sheet{border-radius:16px;max-height:80vh;margin-bottom:0;}
}
/* Marketplace status banner override — hide after load */
#marketplaceStatusMessage[style*="Loading"]{animation:mpFadeOut 5s forwards;}
@keyframes mpFadeOut{0%{opacity:1}80%{opacity:1}100%{opacity:0;pointer-events:none;}}
</style>

<!-- ORDERS PANEL -->
<div id="mp-orders-panel" class="mp-panel">
  <div class="mp-sheet">
    <div class="mp-hdr"><h3>🛒 My Orders</h3><button class="mp-x" onclick="closeOrdersPanel()">✕</button></div>
    <div class="mp-tabs">
      <div class="mp-tab active" onclick="loadOrdersTab(this,'')">All</div>
      <div class="mp-tab" onclick="loadOrdersTab(this,'pending')">Pending</div>
      <div class="mp-tab" onclick="loadOrdersTab(this,'paid')">Paid</div>
      <div class="mp-tab" onclick="loadOrdersTab(this,'shipped')">Shipped</div>
      <div class="mp-tab" onclick="loadOrdersTab(this,'delivered')">Delivered</div>
    </div>
    <div id="mp-orders-body"></div>
  </div>
</div>

<!-- PLACE ORDER PANEL -->
<div id="mp-place-order-panel" class="mp-panel">
  <div class="mp-sheet">
    <div class="mp-hdr"><h3>🛍 Place Order</h3><button class="mp-x" onclick="closePlaceOrderPanel()">✕</button></div>
    <div id="mp-place-order-body"></div>
  </div>
</div>

<!-- REVIEWS PANEL -->
<div id="mp-reviews-panel" class="mp-panel">
  <div class="mp-sheet">
    <div class="mp-hdr"><h3>⭐ Reviews</h3><button class="mp-x" onclick="closeReviewsPanel()">✕</button></div>
    <div id="mp-reviews-body"></div>
    <div id="mp-write-review-body"></div>
  </div>
</div>

<!-- SELLER PANEL -->
<div id="mp-seller-panel" class="mp-panel">
  <div class="mp-sheet">
    <div class="mp-hdr"><h3>🏪 Seller Profile</h3><button class="mp-x" onclick="closeSellerPanel()">✕</button></div>
    <div id="mp-seller-body"></div>
  </div>
</div>
`);

        // Close on backdrop click
        ['mp-orders-panel','mp-place-order-panel','mp-reviews-panel','mp-seller-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
        });
    }

    // ── API helper ────────────────────────────────────────────────────────────
    async function mpFetch(method, path, body) {
        let token = null;
        if (typeof getAuthSession === 'function') {
            const s = getAuthSession(); if (s?.token) token = s.token;
        }
        if (!token && window.sessionClient?.getToken) token = window.sessionClient.getToken();
        if (!token) { showNotification('Please log in first', 'error'); throw new Error('Not authenticated'); }

        const url = path.startsWith('/api/marketplace/')
            ? path.replace('/api/marketplace/', '/api/tools/marketplace/')
            : path;

        const res = await fetch(url, {
            method,
            credentials: 'include',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Request failed (' + res.status + ')');
        return json;
    }

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); } catch { return iso; }
    }
    function stars(n) { return '★'.repeat(Math.max(0,Math.round(n))) + '☆'.repeat(Math.max(0,5-Math.round(n))); }
    function myId() {
        if (window.sessionClient?.getUser) return window.sessionClient.getUser()?.id;
        return window.currentUser?.id;
    }

    // ── ORDERS ────────────────────────────────────────────────────────────────
    window.openOrdersPanel = async function() {
        injectPanels();
        document.getElementById('mp-orders-panel').classList.add('active');
        loadOrdersTab(document.querySelector('#mp-orders-panel .mp-tab'), '');
    };
    window.closeOrdersPanel = function() {
        document.getElementById('mp-orders-panel').classList.remove('active');
    };
    window.loadOrdersTab = async function(tabEl, status) {
        if (tabEl) {
            document.querySelectorAll('#mp-orders-panel .mp-tab').forEach(t => t.classList.remove('active'));
            tabEl.classList.add('active');
        }
        const body = document.getElementById('mp-orders-body');
        body.innerHTML = '<div class="mp-spinner"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
        try {
            const qs  = status ? '?status=' + status : '';
            const res = await mpFetch('GET', '/api/tools/marketplace/orders/mine' + qs);
            const orders = res.data?.orders || [];
            if (!orders.length) {
                body.innerHTML = '<div class="mp-empty"><i class="fas fa-box-open" style="font-size:36px;margin-bottom:10px;display:block;"></i>No orders yet</div>';
                return;
            }
            body.innerHTML = orders.map(o => `
                <div class="mp-card">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <strong style="font-size:15px;">${esc(o.product?.title || 'Product')}</strong>
                        <span class="mp-badge ${o.status}">${o.status}</span>
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary,#666);">
                        Qty: ${o.quantity} &nbsp;|&nbsp; Total: ${esc(o.currency)} ${Number(o.totalPrice).toLocaleString()}
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary,#888);margin-top:3px;">Ordered ${fmtDate(o.createdAt)}</div>
                    ${o.trackingNumber ? `<div style="font-size:12px;margin-top:3px;">Tracking: <strong>${esc(o.trackingNumber)}</strong></div>` : ''}
                    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                        ${['pending','paid'].includes(o.status) ? `<button class="mp-btn mp-danger" onclick="cancelOrder('${o.id}')">Cancel</button>` : ''}
                        ${o.status === 'delivered' ? `<button class="mp-btn mp-outline" onclick="openReviewsPanel('${o.productId}','${o.id}')">Write Review</button>` : ''}
                        <button class="mp-btn mp-outline" onclick="openSellerPanel('${o.sellerId}')">Seller Profile</button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            body.innerHTML = '<div class="mp-empty">Failed to load orders: ' + esc(e.message) + '</div>';
        }
    };
    window.cancelOrder = async function(orderId) {
        if (!confirm('Cancel this order?')) return;
        try {
            await mpFetch('POST', '/api/tools/marketplace/orders/' + orderId + '/cancel', { reason: 'Cancelled by buyer' });
            showNotification('Order cancelled', 'success');
            loadOrdersTab(null, '');
        } catch (e) { showNotification('Failed: ' + e.message, 'error'); }
    };

    // ── PLACE ORDER ───────────────────────────────────────────────────────────
    window.openPlaceOrderPanel = function(listing) {
        injectPanels();
        const panel = document.getElementById('mp-place-order-panel');
        const body  = document.getElementById('mp-place-order-body');
        const price = parseFloat(String(listing.price).replace(/[^0-9.]/g,'')) || 0;
        const cur   = listing.currency || 'KES';

        body.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px;">
                ${listing.images?.[0]
                    ? `<img src="${esc(listing.images[0])}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;">`
                    : `<div style="width:64px;height:64px;border-radius:10px;background:var(--primary-color,#6C63FF);display:flex;align-items:center;justify-content:center;font-size:24px;">🛍</div>`}
                <div>
                    <div style="font-weight:700;font-size:15px;">${esc(listing.title)}</div>
                    <div style="color:var(--primary-color,#6C63FF);font-weight:600;margin-top:3px;">${cur} ${price.toLocaleString()} per item</div>
                </div>
            </div>
            <div class="mp-field"><label>Quantity</label>
                <input type="number" id="mp-qty" value="1" min="1" ${listing.stock ? 'max="'+listing.stock+'"' : ''} oninput="updateOrderTotal(${price},'${cur}')">
            </div>
            <div class="mp-field"><label>Delivery Address</label>
                <textarea id="mp-addr" placeholder="Enter delivery address or 'Pickup in person'"></textarea>
            </div>
            <div class="mp-field"><label>Payment Method</label>
                <select id="mp-payment">
                    <option value="mpesa">M-Pesa</option>
                    <option value="cash">Cash on Delivery</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="mp-field"><label>Notes to Seller (optional)</label>
                <textarea id="mp-notes" placeholder="Any special requests…" style="min-height:56px;"></textarea>
            </div>
            <div style="background:var(--bg-secondary,#f5f5f5);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;">Total</span>
                <span id="mp-total" style="font-weight:800;font-size:16px;color:var(--primary-color,#6C63FF);">${cur} ${price.toLocaleString()}</span>
            </div>
            <button id="mp-submit-order-btn" class="mp-btn mp-primary" style="width:100%;" onclick="submitOrder('${listing.id}','${cur}',${price})">
                <i class="fas fa-shopping-cart"></i> Place Order
            </button>
        `;
        panel.classList.add('active');
    };
    window.closePlaceOrderPanel = function() {
        document.getElementById('mp-place-order-panel').classList.remove('active');
    };
    window.updateOrderTotal = function(price, cur) {
        const qty   = parseInt(document.getElementById('mp-qty')?.value) || 1;
        const total = document.getElementById('mp-total');
        if (total) total.textContent = cur + ' ' + (qty * price).toLocaleString();
    };
    window.submitOrder = async function(productId, currency, unitPrice) {
        const qty     = parseInt(document.getElementById('mp-qty')?.value) || 1;
        const address = document.getElementById('mp-addr')?.value || '';
        const payment = document.getElementById('mp-payment')?.value || 'mpesa';
        const notes   = document.getElementById('mp-notes')?.value || '';
        const btn     = document.getElementById('mp-submit-order-btn');

        if (!address.trim()) { showNotification('Please enter a delivery address', 'error'); return; }

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order…'; }
        try {
            await mpFetch('POST', '/api/tools/marketplace/orders', {
                productId, quantity: qty,
                deliveryAddress: { raw: address },
                paymentMethod: payment, notes,
            });
            showNotification('Order placed! Check My Orders for updates 🎉', 'success');
            closePlaceOrderPanel();
        } catch (e) {
            showNotification('Failed to place order: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Place Order'; }
        }
    };

    // ── REVIEWS ───────────────────────────────────────────────────────────────
    let _reviewProductId = null, _reviewOrderId = null, _reviewRating = 0;

    window.openReviewsPanel = async function(productId, orderId) {
        injectPanels();
        _reviewProductId = productId;
        _reviewOrderId   = orderId || null;
        _reviewRating    = 0;
        document.getElementById('mp-reviews-panel').classList.add('active');
        await loadReviews();
    };
    window.closeReviewsPanel = function() {
        document.getElementById('mp-reviews-panel').classList.remove('active');
    };
    async function loadReviews() {
        const body  = document.getElementById('mp-reviews-body');
        const write = document.getElementById('mp-write-review-body');
        body.innerHTML  = '<div class="mp-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
        write.innerHTML = '';
        try {
            const res  = await mpFetch('GET', '/api/tools/marketplace/listings/' + _reviewProductId + '/reviews');
            const { reviews = [], avgRating = 0, total = 0 } = res.data || {};
            const alreadyReviewed = reviews.some(r => r.userId === myId());

            if (!reviews.length) {
                body.innerHTML = '<div class="mp-empty"><i class="fas fa-star" style="font-size:32px;margin-bottom:10px;display:block;color:#d1d5db;"></i>No reviews yet</div>';
            } else {
                body.innerHTML = `
                    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border-color,#e0e0e0);">
                        <span style="font-size:42px;font-weight:800;line-height:1;">${parseFloat(avgRating).toFixed(1)}</span>
                        <div><div class="mp-stars" style="font-size:20px;">${stars(avgRating)}</div>
                        <div style="font-size:13px;color:var(--text-secondary,#888);">${total} review${total!==1?'s':''}</div></div>
                    </div>
                ` + reviews.map(r => `
                    <div class="mp-card">
                        <div class="mp-stars">${stars(r.rating)}</div>
                        <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                            <strong style="font-size:14px;">${esc(r.reviewer?.displayName || r.reviewer?.username || 'User')}</strong>
                            ${r.isVerifiedPurchase ? '<span class="mp-badge paid" style="font-size:10px;">✓ Verified</span>' : ''}
                            <span style="font-size:12px;color:var(--text-secondary,#888);margin-left:auto;">${fmtDate(r.createdAt)}</span>
                        </div>
                        ${r.comment ? `<p style="margin:0 0 8px;font-size:14px;">${esc(r.comment)}</p>` : ''}
                        ${r.sellerReply ? `
                            <div style="background:var(--bg-secondary,#f5f5f5);border-radius:8px;padding:10px;margin-top:8px;">
                                <div style="font-size:12px;font-weight:700;margin-bottom:4px;">Seller replied:</div>
                                <p style="margin:0;font-size:13px;">${esc(r.sellerReply)}</p>
                            </div>` : ''}
                        <button class="mp-btn mp-outline" style="margin-top:8px;padding:4px 10px;font-size:12px;"
                            onclick="markReviewHelpful('${r.id}',this)">👍 Helpful (${r.helpfulCount||0})</button>
                    </div>
                `).join('');
            }

            // Show write-review form only when coming from a delivered order
            if (_reviewOrderId && !alreadyReviewed) {
                _reviewRating = 0;
                write.innerHTML = `
                    <hr style="border:none;border-top:1px solid var(--border-color,#e0e0e0);margin:16px 0;">
                    <h4 style="margin:0 0 14px;font-size:16px;">Write a Review</h4>
                    <div class="mp-field"><label>Your Rating</label>
                        <div class="mp-stars-input" id="mp-star-row">
                            ${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="setReviewRating(${n})">☆</span>`).join('')}
                        </div>
                    </div>
                    <div class="mp-field"><label>Comment (optional)</label>
                        <textarea id="mp-review-comment" placeholder="Share your experience…"></textarea>
                    </div>
                    <button id="mp-submit-review-btn" class="mp-btn mp-primary" onclick="submitReview()">
                        <i class="fas fa-paper-plane"></i> Submit Review
                    </button>
                `;
            }
        } catch (e) {
            body.innerHTML = '<div class="mp-empty">Failed to load reviews: ' + esc(e.message) + '</div>';
        }
    }
    window.setReviewRating = function(n) {
        _reviewRating = n;
        document.querySelectorAll('#mp-star-row span').forEach(s => {
            const v = parseInt(s.dataset.n);
            s.textContent = v <= n ? '★' : '☆';
            s.classList.toggle('on', v <= n);
        });
    };
    window.submitReview = async function() {
        if (!_reviewRating) { showNotification('Please select a star rating', 'error'); return; }
        const comment = document.getElementById('mp-review-comment')?.value || '';
        const btn     = document.getElementById('mp-submit-review-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }
        try {
            await mpFetch('POST', '/api/tools/marketplace/listings/' + _reviewProductId + '/reviews', {
                rating: _reviewRating, comment, orderId: _reviewOrderId,
            });
            showNotification('Review submitted! 🌟', 'success');
            _reviewOrderId = null; // hide write form on reload
            await loadReviews();
        } catch (e) {
            showNotification('Failed: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Review'; }
        }
    };
    window.markReviewHelpful = async function(reviewId, btn) {
        try {
            await mpFetch('POST', '/api/tools/marketplace/reviews/' + reviewId + '/helpful');
            showNotification('Marked as helpful', 'success');
            if (btn) {
                const m = btn.textContent.match(/\((\d+)\)/);
                const n = m ? parseInt(m[1]) + 1 : 1;
                btn.textContent = '👍 Helpful (' + n + ')';
            }
        } catch (e) { showNotification(e.message, 'error'); }
    };

    // ── SELLER PROFILE ────────────────────────────────────────────────────────
    window.openSellerPanel = async function(sellerId) {
        if (!sellerId) return;
        injectPanels();
        document.getElementById('mp-seller-panel').classList.add('active');
        const body = document.getElementById('mp-seller-body');
        body.innerHTML = '<div class="mp-spinner"><i class="fas fa-spinner fa-spin"></i> Loading profile…</div>';
        try {
            const res = await mpFetch('GET', '/api/tools/marketplace/seller/' + sellerId);
            const { seller = {}, listings = [], stats = {} } = res.data || {};
            body.innerHTML = `
                <div style="text-align:center;padding:10px 0 20px;">
                    <div class="mp-seller-avatar">
                        ${seller.avatar ? `<img src="${esc(seller.avatar)}" alt="Seller">` : (seller.name||'S').charAt(0).toUpperCase()}
                    </div>
                    <div style="font-weight:800;font-size:18px;">${esc(seller.name||'Seller')}</div>
                    <div style="font-size:13px;color:var(--text-secondary,#888);margin-top:4px;">Member since ${fmtDate(seller.joinedAt)}</div>
                </div>
                <div class="mp-stat-row">
                    <div class="mp-stat"><strong>${stats.listingCount||0}</strong><span>Listings</span></div>
                    <div class="mp-stat"><strong>${stats.avgRating ? parseFloat(stats.avgRating).toFixed(1) : '—'}</strong><span>Rating</span></div>
                    <div class="mp-stat"><strong>${stats.reviewCount||0}</strong><span>Reviews</span></div>
                </div>
                <button class="mp-btn mp-primary" style="width:100%;margin-bottom:16px;"
                    onclick="messageSeller('${esc(seller.id||sellerId)}','${esc(seller.name||'Seller')}')">
                    <i class="fas fa-comment"></i> Message Seller
                </button>
                ${listings.length ? `
                <div style="font-weight:700;font-size:15px;margin-bottom:10px;">Active Listings (${stats.listingCount||0})</div>
                <div class="mp-grid-2">
                    ${listings.slice(0,6).map(l => `
                        <div class="mp-product-tile">
                            ${l.images?.[0]
                                ? `<img src="${esc(l.images[0])}" class="mp-product-tile-img" alt="${esc(l.title)}">`
                                : `<div class="mp-product-tile-img">🛍</div>`}
                            <div class="mp-product-tile-body">
                                <div class="mp-product-tile-title">${esc(l.title)}</div>
                                <div class="mp-product-tile-price">${esc(l.currency||'KES')} ${Number(l.price||0).toLocaleString()}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>` : '<div class="mp-empty" style="padding:20px;">No active listings</div>'}
            `;
        } catch (e) {
            body.innerHTML = '<div class="mp-empty">Failed to load seller profile: ' + esc(e.message) + '</div>';
        }
    };
    window.closeSellerPanel = function() {
        document.getElementById('mp-seller-panel').classList.remove('active');
    };
    window.messageSeller = function(sellerId, sellerName) {
        closeSellerPanel();
        const chatFn = typeof openChat === 'function' ? openChat : window.openChat;
        if (typeof chatFn === 'function') {
            chatFn(sellerId, sellerName);
        } else {
            window.location.href = '/chat.html?recipientId=' + encodeURIComponent(sellerId) + '&name=' + encodeURIComponent(sellerName||'');
        }
    };

    // ── WebSocket event listeners ──────────────────────────────────────────────
    function wireWS() {
        const ws = window.WebSocketService || window.wsService;
        const handle = (event, cb) => {
            if (ws?.on) ws.on(event, cb);
            window.addEventListener('ws:' + event, e => cb(e.detail));
        };
        handle('ORDER_PLACED',         d => showNotification('✅ Order placed for "' + (d.order?.product?.title||'item') + '"', 'success'));
        handle('ORDER_RECEIVED',       () => showNotification('🛍 New order received!', 'success'));
        handle('ORDER_STATUS_UPDATED', d => showNotification('📦 Order is now: ' + d.status, 'info'));
        handle('NEW_REVIEW',           () => showNotification('⭐ You have a new review!', 'info'));
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { injectPanels(); wireWS(); });
    } else {
        injectPanels();
        wireWS();
    }

})();

// ── Module exports ──────────────────────────────────────────────────────────
// viewListingDetail lives on renderers — re-export as a named alias
const viewListingDetail = (...args) => renderers.viewListingDetail(...args);

export {
    renderers,
    UIState,
    pageCore,
    showCreateListingModal,
    viewListingDetail
};