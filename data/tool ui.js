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

        let filtered = Array.isArray(allListings) ? [...allListings] : [];
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
        if (document.querySelector(`.listing-item[data-listing-id="${listing.id}"]`)) return;

        // ── Normalise product fields (works with both old listing schema and new product schema) ──
        const ecom    = window.EcomMarketplace;
        const price   = parseFloat(String(listing.price  || listing.price_display || 0).replace(/[^0-9.]/g, '')) || 0;
        const origPrc = parseFloat(String(listing.original_price || listing.originalPrice || 0).replace(/[^0-9.]/g, '')) || 0;
        const stock   = listing.stock_quantity ?? listing.stockQuantity ?? null;
        const rating  = parseFloat(listing.rating) || 0;
        const reviews = parseInt(listing.reviews_count || listing.reviewsCount) || 0;
        const inStock = listing.available !== false && (stock === null || stock > 0);
        const imgSrc  = (listing.images?.[0]) || listing.mediaUrl || listing.image || '';
        const sellerName = listing.seller?.name || listing.user?.displayName || listing.sellerName || 'Seller';
        const isWishlisted = ecom ? ecom.WishlistEngine.has(listing.id) : (savedItems?.some(s=>s.id===listing.id));
        const inCart  = ecom ? ecom.CartEngine.has(listing.id) : false;
        const discount= origPrc > price && origPrc > 0 ? Math.round((1 - price/origPrc)*100) : (parseFloat(listing.discount)||0);
        const isFlash = listing.is_flash_sale || listing.isFlashSale;
        const isFeatured = listing.featured || listing.isFeatured || listing.isSpotlight || listing.is_featured;
        const isVerified = listing.verified || listing.isVerified || listing.seller?.verified;

        // ── Stars HTML ──
        const _stars = (r) => {
            const full = Math.floor(r), half = r - full >= 0.5;
            let s = '';
            for (let i=0;i<full;i++) s += '<i class="fas fa-star" style="color:#f5a623"></i>';
            if (half) s += '<i class="fas fa-star-half-alt" style="color:#f5a623"></i>';
            const empty = 5 - full - (half?1:0);
            for (let i=0;i<empty;i++) s += '<i class="far fa-star" style="color:#d1d5db"></i>';
            return s;
        };

        // ── Price display ──
        const fmt = (n) => ecom ? ecom.SettingsEngine.formatPrice(n) : `KES ${n.toLocaleString()}`;
        const priceHTML = price > 0
            ? `<span class="listing-price" style="color:var(--primary-color,#f57224);font-size:16px;font-weight:700">${fmt(price)}</span>${origPrc > price ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:12px;margin-left:6px">${fmt(origPrc)}</span>` : ''}`
            : `<span class="listing-price" style="color:#22c55e;font-weight:700">Free</span>`;

        const item = document.createElement('div');
        item.className = 'listing-item ecom-product-card';
        if (isFeatured) item.classList.add('featured');
        if (listing.premium || listing.isPremium) item.classList.add('premium-listing');
        item.dataset.listingId = listing.id;
        item.dataset.userId = listing.userId || listing.sellerId || listing.seller_id || '';
        item.style.cssText = 'cursor:pointer;background:var(--card-bg,#fff);border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);transition:box-shadow 0.2s,transform 0.15s;display:flex;flex-direction:column;position:relative;';

        item.innerHTML = `
            <!-- Image area -->
            <div style="position:relative;width:100%;padding-top:56.25%;background:#f3f4f6;overflow:hidden;flex-shrink:0;">
                ${imgSrc
                    ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(listing.title||'')}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 0.3s;" onerror="this.style.display='none'">`
                    : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;color:#9ca3af">${listing.type==='digital'?'💾':listing.type==='service'?'🔧':'🛒'}</div>`}
                <!-- Badges overlay -->
                <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:4px;pointer-events:none;">
                    ${discount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">-${discount}%</span>` : ''}
                    ${isFlash ? `<span style="background:#f59e0b;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">⚡ FLASH</span>` : ''}
                    ${isFeatured ? `<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">★ TOP</span>` : ''}
                </div>
                <!-- Wishlist button -->
                <button class="ecom-wish-btn" data-pid="${listing.id}" style="position:absolute;top:8px;right:8px;background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;backdrop-filter:blur(4px);z-index:2;" title="Wishlist" onclick="event.stopPropagation()">
                    ${isWishlisted ? '❤️' : '🤍'}
                </button>
                <!-- Out of stock overlay -->
                ${!inStock && stock !== null ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:13px;font-weight:700;background:#ef4444;padding:6px 14px;border-radius:20px">OUT OF STOCK</span></div>` : ''}
            </div>
            <!-- Info area -->
            <div style="padding:10px 12px 12px;display:flex;flex-direction:column;flex:1;gap:4px;">
                <div style="font-size:13px;color:#6b7280;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(listing.title||'Untitled')}</div>
                <!-- Rating -->
                ${rating > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:11px;">${_stars(rating)}<span style="color:#6b7280">(${reviews.toLocaleString()})</span></div>` : ''}
                <!-- Price -->
                <div style="margin-top:2px;">${priceHTML}</div>
                <!-- Seller + shipping info -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                    <div style="font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:3px;">
                        ${isVerified ? '<span title="Verified Seller" style="color:#3b82f6">✓</span>' : ''}
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">${escapeHtml(sellerName)}</span>
                    </div>
                    ${listing.delivery_fee === 0 || listing.deliveryFee === 0 ? '<span style="font-size:10px;color:#22c55e;font-weight:600">Free delivery</span>' : listing.location ? `<span style="font-size:10px;color:#9ca3af">📍 ${escapeHtml(listing.location)}</span>` : ''}
                </div>
                <!-- Stock indicator -->
                ${stock !== null && stock > 0 && stock <= 5 ? `<div style="font-size:11px;color:#f59e0b;font-weight:600">Only ${stock} left!</div>` : ''}
                <!-- Add to Cart button -->
                ${inStock ? `<button class="ecom-cart-btn" data-pid="${listing.id}" style="margin-top:8px;background:var(--primary-color,#f57224);color:#fff;border:none;border-radius:8px;padding:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;transition:background 0.2s;" onclick="event.stopPropagation()">
                    ${inCart ? '<i class="fas fa-check"></i> In Cart' : '<i class="fas fa-shopping-cart"></i> Add to Cart'}
                </button>` : `<button disabled style="margin-top:8px;background:#e5e7eb;color:#9ca3af;border:none;border-radius:8px;padding:8px;font-size:12px;font-weight:600;cursor:not-allowed;width:100%;">Out of Stock</button>`}
            </div>
        `;

        // ── Event handlers ──
        // Wishlist toggle
        const wishBtn = item.querySelector('.ecom-wish-btn');
        if (wishBtn) {
            wishBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (ecom) {
                    const added = ecom.WishlistEngine.toggle(listing.id);
                    wishBtn.textContent = added ? '❤️' : '🤍';
                } else {
                    // Fallback: use existing toggleSave
                    if (typeof toggleSaveListing === 'function') toggleSaveListing(listing.id);
                }
            });
        }

        // Add to cart
        const cartBtn = item.querySelector('.ecom-cart-btn');
        if (cartBtn && inStock) {
            cartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (ecom) {
                    // Build product object from listing
                    const product = {
                        id: listing.id, title: listing.title, price,
                        original_price: origPrc, discount, seller_id: listing.seller_id || listing.sellerId || listing.userId,
                        seller: { name: sellerName }, images: listing.images || (imgSrc ? [imgSrc] : []),
                        stock_quantity: stock ?? 999, delivery_fee: parseFloat(listing.delivery_fee || listing.deliveryFee) || 0,
                        available: inStock, category: listing.category || 'general',
                    };
                    const result = ecom.CartEngine.add(product);
                    if (result.success) {
                        cartBtn.innerHTML = '<i class="fas fa-check"></i> In Cart';
                        cartBtn.style.background = '#22c55e';
                        _updateCartBadge();
                    } else {
                        cartBtn.textContent = result.message || 'Failed';
                        setTimeout(() => { cartBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Add to Cart'; cartBtn.style.background = ''; }, 2000);
                    }
                } else {
                    if (typeof showNotification === 'function') showNotification('Product added to cart', 'success');
                }
            });
        }

        // Hover effects
        item.addEventListener('mouseenter', () => { item.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; item.style.transform = 'translateY(-2px)'; });
        item.addEventListener('mouseleave', () => { item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; item.style.transform = ''; });

        // Open detail panel on click
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

        const ecom    = window.EcomMarketplace;
        const price   = parseFloat(String(listing.price||0).replace(/[^0-9.]/g,'')) || 0;
        const origPrc = parseFloat(String(listing.original_price||listing.originalPrice||0).replace(/[^0-9.]/g,'')) || 0;
        const stock   = listing.stock_quantity ?? listing.stockQuantity ?? null;
        const rating  = parseFloat(listing.rating) || 0;
        const reviews = parseInt(listing.reviews_count || listing.reviewsCount) || 0;
        const inStock = listing.available !== false && (stock === null || stock > 0);
        const images  = (listing.images?.length ? listing.images : listing.mediaUrl ? [listing.mediaUrl] : []);
        const sellerName = listing.seller?.name || listing.user?.displayName || listing.sellerName || 'Seller';
        const sellerId   = listing.seller?.id || listing.seller_id || listing.userId || listing.sellerId;
        const sellerRating = parseFloat(listing.seller?.rating) || 0;
        const discount = origPrc > price && origPrc > 0 ? Math.round((1-price/origPrc)*100) : (parseFloat(listing.discount)||0);
        const fmt      = (n) => ecom ? ecom.SettingsEngine.formatPrice(n) : `KES ${parseFloat(n).toLocaleString()}`;
        const inWish   = ecom ? ecom.WishlistEngine.has(listing.id) : false;
        const inCart   = ecom ? ecom.CartEngine.has(listing.id) : false;
        const _stars   = (r,sm=false)=>{const full=Math.floor(r),half=r-full>=0.5,sz=sm?'11px':'14px';let s='';for(let i=0;i<full;i++)s+=`<i class="fas fa-star" style="color:#f5a623;font-size:${sz}"></i>`;if(half)s+=`<i class="fas fa-star-half-alt" style="color:#f5a623;font-size:${sz}"></i>`;const e=5-full-(half?1:0);for(let i=0;i<e;i++)s+=`<i class="far fa-star" style="color:#d1d5db;font-size:${sz}"></i>`;return s;};

        container.innerHTML = `
        <div class="ecom-detail-wrap" style="font-family:system-ui,sans-serif;padding-bottom:24px;">

            <!-- Image Gallery -->
            <div style="position:relative;background:#f3f4f6;border-radius:12px;overflow:hidden;margin-bottom:16px;">
                ${images.length > 0
                    ? `<div id="ecom-gallery" style="position:relative;width:100%;padding-top:66%;overflow:hidden;">
                        <img id="ecom-main-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(listing.title||'')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;" loading="lazy">
                        ${discount > 0 ? `<span style="position:absolute;top:12px;left:12px;background:#ef4444;color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;">-${discount}%</span>` : ''}
                        ${images.length > 1 ? `
                        <button id="ecom-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);">‹</button>
                        <button id="ecom-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);">›</button>
                        ` : ''}
                      </div>
                      ${images.length > 1 ? `<div id="ecom-thumbs" style="display:flex;gap:8px;padding:8px 12px;overflow-x:auto;">
                        ${images.map((img,i)=>`<img src="${escapeHtml(img)}" data-idx="${i}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid ${i===0?'var(--primary-color,#f57224)':'transparent'};flex-shrink:0;" loading="lazy">`).join('')}
                      </div>` : ''}`
                    : `<div style="width:100%;height:200px;display:flex;align-items:center;justify-content:center;font-size:64px;">${listing.type==='digital'?'💾':listing.type==='service'?'🔧':'🛒'}</div>`}
                ${!inStock && stock !== null ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:16px;font-weight:700;background:#ef4444;padding:10px 24px;border-radius:24px;">OUT OF STOCK</span></div>` : ''}
            </div>

            <!-- Title & Price -->
            <h2 style="font-size:17px;font-weight:600;line-height:1.4;margin:0 0 8px;color:var(--text-primary,#111)">${escapeHtml(listing.title||'Untitled')}</h2>

            <!-- Badges -->
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${listing.featured||listing.isFeatured?'<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;">★ FEATURED</span>':''}
                ${listing.verified||listing.isVerified?'<span style="background:#3b82f6;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;">✓ VERIFIED</span>':''}
                ${listing.is_flash_sale||listing.isFlashSale?'<span style="background:#f59e0b;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;">⚡ FLASH SALE</span>':''}
                ${listing.isPremium||listing.premium?'<span style="background:#d97706;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;">👑 PREMIUM</span>':''}
                ${listing.condition?`<span style="background:#f3f4f6;color:#374151;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;">${escapeHtml(listing.condition.toUpperCase())}</span>`:''}
            </div>

            <!-- Rating -->
            ${rating > 0 || reviews > 0 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <span style="font-size:16px;font-weight:700;color:#111">${rating.toFixed(1)}</span>
                <div>${_stars(rating)}</div>
                <span style="color:#6b7280;font-size:13px;">${reviews.toLocaleString()} review${reviews!==1?'s':''}</span>
            </div>` : ''}

            <!-- Price block -->
            <div style="background:linear-gradient(135deg,#fff9f0,#fff);border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
                <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:26px;font-weight:800;color:var(--primary-color,#f57224)">${price > 0 ? fmt(price) : '<span style="color:#22c55e">Free</span>'}</span>
                    ${origPrc > price ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:15px;">${fmt(origPrc)}</span>` : ''}
                    ${discount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;">-${discount}%</span>` : ''}
                </div>
                ${discount > 0 && origPrc > price ? `<div style="font-size:12px;color:#22c55e;margin-top:4px;font-weight:600;">You save ${fmt(origPrc-price)}</div>` : ''}
                ${listing.delivery_fee === 0 || listing.deliveryFee === 0 ? '<div style="font-size:12px;color:#22c55e;margin-top:4px;font-weight:600;">🚚 Free delivery</div>' : listing.delivery_fee ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Delivery: ${fmt(parseFloat(listing.delivery_fee||0))}</div>` : ''}
            </div>

            <!-- Stock indicator -->
            ${stock !== null ? `<div style="margin-bottom:12px;font-size:13px;">
                ${stock > 5 ? `<span style="color:#22c55e;font-weight:600;">✓ In Stock</span>` : stock > 0 ? `<span style="color:#f59e0b;font-weight:600;">⚠ Only ${stock} left</span>` : `<span style="color:#ef4444;font-weight:600;">✗ Out of Stock</span>`}
                ${listing.sold_count > 0 ? `<span style="color:#6b7280;margin-left:12px;">${parseInt(listing.sold_count||0).toLocaleString()} sold</span>` : ''}
            </div>` : ''}

            <!-- Quantity selector + action buttons -->
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
                ${inStock ? `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
                    <span style="font-size:13px;color:#374151;font-weight:500;">Qty:</span>
                    <div style="display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                        <button id="ecom-qty-dec" style="padding:8px 14px;border:none;background:#f9fafb;cursor:pointer;font-size:16px;font-weight:600;">−</button>
                        <span id="ecom-qty-val" style="padding:8px 16px;font-size:15px;font-weight:600;min-width:40px;text-align:center;">1</span>
                        <button id="ecom-qty-inc" style="padding:8px 14px;border:none;background:#f9fafb;cursor:pointer;font-size:16px;font-weight:600;">+</button>
                    </div>
                </div>
                <button id="ecom-add-cart-btn" style="background:var(--primary-color,#f57224);color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;">
                    <i class="fas fa-shopping-cart"></i> ${inCart ? 'Update Cart' : 'Add to Cart'}
                </button>
                <button id="ecom-buy-now-btn" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fas fa-bolt"></i> Buy Now
                </button>` : `<button disabled style="background:#e5e7eb;color:#9ca3af;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;width:100%;">Out of Stock</button>`}
                <button id="ecom-wish-detail-btn" style="background:${inWish?'#fee2e2':'#f9fafb'};color:${inWish?'#ef4444':'#374151'};border:1px solid ${inWish?'#fca5a5':'#e5e7eb'};border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;">
                    ${inWish ? '<i class="fas fa-heart"></i> Remove from Wishlist' : '<i class="far fa-heart"></i> Add to Wishlist'}
                </button>
            </div>

            <!-- Description -->
            <div style="margin-bottom:16px;">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;color:#111;">Product Description</h3>
                <div style="font-size:14px;color:#374151;line-height:1.6;white-space:pre-line;">${escapeHtml(listing.description||'No description provided.')}</div>
            </div>

            <!-- Delivery info -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
                <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:#166534;">🚚 Delivery & Location</h3>
                ${listing.location ? `<div style="font-size:13px;color:#374151;margin-bottom:6px;">📍 Ships from: <strong>${escapeHtml(listing.location)}</strong></div>` : ''}
                <div style="font-size:13px;color:#374151;margin-bottom:6px;">📦 Estimated delivery: <strong>1-3 business days</strong></div>
                ${listing.delivery_fee === 0 || listing.deliveryFee === 0
                    ? '<div style="font-size:13px;font-weight:600;color:#22c55e;">✓ Free delivery on this item</div>'
                    : listing.delivery_fee ? `<div style="font-size:13px;color:#374151;">Delivery fee: <strong>${fmt(parseFloat(listing.delivery_fee))}</strong></div>` : ''}
                <button id="ecom-delivery-calc" style="margin-top:10px;background:transparent;color:#16a34a;border:1px solid #86efac;border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:600;">Calculate delivery to my location</button>
            </div>

            <!-- Seller info -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
                <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:#111;">🏪 About the Seller</h3>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary-color,#f57224),#ff9a00);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">
                        ${escapeHtml((sellerName[0]||'S').toUpperCase())}
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:14px;color:#111;">${escapeHtml(sellerName)} ${listing.seller?.verified||listing.isVerified?'<span style="color:#3b82f6;font-size:13px;">✓</span>':''}</div>
                        ${sellerRating > 0 ? `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">${_stars(sellerRating,true)}<span style="font-size:11px;color:#6b7280;">${sellerRating.toFixed(1)}</span></div>` : ''}
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button id="ecom-chat-seller-btn" style="flex:1;background:var(--primary-color,#f57224);color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <i class="fas fa-comment"></i> Chat Seller
                    </button>
                    <button id="ecom-seller-profile-btn" style="flex:1;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <i class="fas fa-store"></i> View Shop
                    </button>
                </div>
            </div>

            <!-- Reviews section -->
            <div style="margin-bottom:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <h3 style="font-size:15px;font-weight:700;color:#111;">⭐ Reviews (${reviews.toLocaleString()})</h3>
                    <button id="ecom-write-review-btn" style="background:transparent;color:var(--primary-color,#f57224);border:1px solid var(--primary-color,#f57224);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600;">Write Review</button>
                </div>
                ${rating > 0 ? `<div style="display:flex;align-items:center;gap:16px;background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:10px;">
                    <div style="text-align:center;"><div style="font-size:36px;font-weight:800;color:#111">${rating.toFixed(1)}</div><div>${_stars(rating)}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">${reviews.toLocaleString()} reviews</div></div>
                </div>` : ''}
                <div id="ecom-reviews-list" style="display:flex;flex-direction:column;gap:10px;">
                    <div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">Loading reviews…</div>
                </div>
                ${reviews > 5 ? `<button id="ecom-load-more-reviews" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;margin-top:8px;font-weight:600;color:#374151;">Load more reviews</button>` : ''}
            </div>

            <!-- Related products placeholder -->
            <div>
                <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;color:#111;">🛍 Related Products</h3>
                <div id="ecom-related-products" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;">
                    <div style="color:#9ca3af;font-size:13px;padding:8px;">Loading…</div>
                </div>
            </div>

            <!-- Share -->
            <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
                <button id="ecom-share-btn" style="flex:1;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:600;">
                    <i class="fas fa-share-alt"></i> Share
                </button>
                <button id="ecom-report-btn" style="background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;font-size:13px;cursor:pointer;">
                    <i class="fas fa-flag"></i>
                </button>
            </div>
        </div>`;

        // ── Wire up all buttons ──
        const _$ = (id) => container.querySelector('#' + id);
        let _qty = 1;
        const _maxQty = stock ?? 999;

        // Quantity controls
        _$('ecom-qty-dec')?.addEventListener('click', () => { if(_qty>1){_qty--;_$('ecom-qty-val').textContent=_qty;} });
        _$('ecom-qty-inc')?.addEventListener('click', () => { if(_qty<_maxQty){_qty++;_$('ecom-qty-val').textContent=_qty;} });

        // Add to Cart
        const _addBtn = _$('ecom-add-cart-btn');
        if (_addBtn && inStock) {
            _addBtn.addEventListener('click', () => {
                if (ecom) {
                    const p = { id:listing.id, title:listing.title, price, original_price:origPrc, discount,
                        seller_id:sellerId, seller:{name:sellerName}, images, stock_quantity:_maxQty,
                        delivery_fee:parseFloat(listing.delivery_fee||listing.deliveryFee||0), available:true, category:listing.category||'general' };
                    const res = ecom.CartEngine.add(p, _qty);
                    if (res.success) {
                        _addBtn.innerHTML = '<i class="fas fa-check"></i> Added to Cart';
                        _addBtn.style.background = '#22c55e';
                        _updateCartBadge();
                        setTimeout(()=>{ _addBtn.innerHTML='<i class="fas fa-shopping-cart"></i> Add to Cart'; _addBtn.style.background=''; }, 2000);
                    } else {
                        ecom.NotificationEngine.show(res.message || 'Failed', 'error', '❌');
                    }
                }
            });
        }

        // Buy Now
        _$('ecom-buy-now-btn')?.addEventListener('click', () => {
            if (ecom) {
                const p = { id:listing.id, title:listing.title, price, seller_id:sellerId,
                    seller:{name:sellerName}, images, stock_quantity:_maxQty, delivery_fee:parseFloat(listing.delivery_fee||0),
                    available:true, category:listing.category||'general' };
                ecom.CartEngine.add(p, _qty);
                _updateCartBadge();
                openCheckoutPanel();
            }
        });

        // Wishlist
        const _wishBtn = _$('ecom-wish-detail-btn');
        _wishBtn?.addEventListener('click', () => {
            if (ecom) {
                const added = ecom.WishlistEngine.toggle(listing.id);
                _wishBtn.innerHTML = added ? '<i class="fas fa-heart"></i> Remove from Wishlist' : '<i class="far fa-heart"></i> Add to Wishlist';
                _wishBtn.style.background = added ? '#fee2e2' : '#f9fafb';
                _wishBtn.style.color = added ? '#ef4444' : '#374151';
                _wishBtn.style.borderColor = added ? '#fca5a5' : '#e5e7eb';
            }
        });

        // Chat seller
        _$('ecom-chat-seller-btn')?.addEventListener('click', () => {
            if (ecom) { ecom.ChatBridge.openWithSeller({ ...listing, seller_id:sellerId, seller:{id:sellerId,name:sellerName} }); }
            else if (typeof openChat === 'function') { openChat(sellerId, sellerName); }
        });

        // Seller profile
        _$('ecom-seller-profile-btn')?.addEventListener('click', () => { if(sellerId) openSellerPanel(sellerId); });

        // Delivery calculator
        _$('ecom-delivery-calc')?.addEventListener('click', () => {
            const area = prompt('Enter your area/city for delivery estimate:');
            if (area && ecom) {
                const fee = ecom.DeliveryEngine.calculateFee(listing.location||'', area);
                alert(`Estimated delivery from ${listing.location||'seller location'} to ${area}:\nKES ${fee}`);
            }
        });

        // Write review
        _$('ecom-write-review-btn')?.addEventListener('click', () => openWriteReviewPanel(listing.id));

        // Share
        _$('ecom-share-btn')?.addEventListener('click', () => {
            const url = `${window.location.origin}/?product=${listing.id}`;
            if (navigator.share) { navigator.share({ title: listing.title, url }); }
            else { navigator.clipboard?.writeText(url).then(()=>{ if(typeof showNotification==='function') showNotification('Link copied!','success'); }); }
        });

        // Gallery navigation
        if (images.length > 1) {
            let curIdx = 0;
            const mainImg = _$('ecom-main-img');
            const thumbs  = container.querySelectorAll('#ecom-thumbs img');
            const _setImg = (idx) => {
                curIdx = (idx + images.length) % images.length;
                if (mainImg) mainImg.src = escapeHtml(images[curIdx]);
                thumbs.forEach((t,i)=>{ t.style.borderColor = i===curIdx ? 'var(--primary-color,#f57224)' : 'transparent'; });
            };
            _$('ecom-prev')?.addEventListener('click', (e)=>{ e.stopPropagation(); _setImg(curIdx-1); });
            _$('ecom-next')?.addEventListener('click', (e)=>{ e.stopPropagation(); _setImg(curIdx+1); });
            thumbs.forEach((t,i)=>{ t.addEventListener('click', (e)=>{ e.stopPropagation(); _setImg(i); }); });
        }

        // Load reviews asynchronously
        if (ecom && reviews > 0) {
            ecom.ReviewEngine.getReviews(listing.id, { limit: 5 }).then(revList => {
                const rl = _$('ecom-reviews-list');
                if (!rl) return;
                if (!revList.length) { rl.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">No reviews yet. Be the first!</div>'; return; }
                rl.innerHTML = revList.map(r => `
                    <div style="background:#f9fafb;border-radius:10px;padding:12px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">${(r.user?.name||r.username||'U')[0].toUpperCase()}</div>
                                <div>
                                    <div style="font-size:13px;font-weight:600;">${escapeHtml(r.user?.name||r.username||'User')}</div>
                                    <div style="font-size:11px;color:#9ca3af;">${r.created_at ? formatTimeAgo(new Date(r.created_at)) : ''}</div>
                                </div>
                            </div>
                            <div style="display:flex;gap:1px;">${'<i class="fas fa-star" style="color:#f5a623;font-size:12px;"></i>'.repeat(r.rating||0)}</div>
                        </div>
                        ${r.text ? `<div style="font-size:13px;color:#374151;line-height:1.5;">${escapeHtml(r.text)}</div>` : ''}
                        ${r.images?.length ? `<div style="display:flex;gap:6px;margin-top:8px;">${r.images.map(img=>`<img src="${escapeHtml(img)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">`).join('')}</div>` : ''}
                        ${r.seller_response ? `<div style="background:#f0fdf4;border-left:3px solid #22c55e;padding:8px 10px;margin-top:8px;border-radius:0 6px 6px 0;font-size:12px;color:#166534;"><strong>Seller response:</strong> ${escapeHtml(r.seller_response)}</div>` : ''}
                    </div>`).join('');
            }).catch(() => {
                const rl = _$('ecom-reviews-list');
                if (rl) rl.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">No reviews yet. Be the first!</div>';
            });
        } else {
            const rl = _$('ecom-reviews-list');
            if (rl) rl.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">No reviews yet. Be the first!</div>';
        }

        // Load related products asynchronously
        const relEl = _$('ecom-related-products');
        if (relEl && ecom) {
            const related = ecom.ProductEngine.search('', { category: listing.category||'general' })
                .filter(p => p.id !== listing.id).slice(0, 6);
            if (related.length) {
                relEl.innerHTML = related.map(p => `
                    <div data-pid="${p.id}" style="flex-shrink:0;width:120px;cursor:pointer;background:#f9fafb;border-radius:10px;overflow:hidden;border:1px solid #f3f4f6;">
                        <div style="width:100%;height:90px;background:#e5e7eb;overflow:hidden;">
                            ${p.images[0] ? `<img src="${escapeHtml(p.images[0])}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;">🛒</div>`}
                        </div>
                        <div style="padding:6px 8px;">
                            <div style="font-size:11px;font-weight:500;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.title)}</div>
                            <div style="font-size:12px;font-weight:700;color:var(--primary-color,#f57224);margin-top:2px;">${p.price>0?`KES ${p.price.toLocaleString()}`:'Free'}</div>
                        </div>
                    </div>`).join('');
                relEl.querySelectorAll('[data-pid]').forEach(el => {
                    el.addEventListener('click', () => {
                        const p = ecom.ProductEngine.getStore().products.get(el.dataset.pid);
                        if (p) renderers.viewListingDetail(p);
                    });
                });
            } else {
                relEl.innerHTML = '<div style="color:#9ca3af;font-size:13px;">No related products found</div>';
            }
        }

    }, '<div class="error-placeholder">Failed to load product details</div>'),

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
    console.log('[PUBLISH] Starting publish, activeTab:', activeTab);
    
    // Check we have a function to call
    console.log('[PUBLISH] createServiceListing available:', typeof createServiceListing);
    console.log('[PUBLISH] DOM.serviceTitle:', DOM.serviceTitle?.value);

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
                console.log('[PUBLISH] ✅ Listing created:', listing.id);
                showNotification('Listing published! 🎉', 'success');
                hideCreateListingModal();
                resetCreateListingForm();
                UIPipeline.syncFromCoreGlobals();
                UIPipeline.liveUpdate();
            } else {
                console.warn('[PUBLISH] createServiceListing returned null/undefined');
                showNotification('Could not publish listing. Check console for details.', 'error');
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
        console.error('[PUBLISH] ERROR:', err.message, err);
        showNotification('Failed to publish: ' + (err.message || 'Unknown error'), 'error');
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
        _loadSavedItems();
        setTimeout(renderSavedItems, 100); // Allow async IDB load
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
        _loadNotes(); // Reload from storage each time
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
        DOM.myNotesList.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-secondary);">
                <i class="fas fa-sticky-note" style="font-size:36px;margin-bottom:12px;display:block;opacity:0.4;"></i>
                <p>No private notes yet</p>
                <p style="font-size:13px;margin-top:6px;">Tap "Add Note" to create one</p>
            </div>`;
        return;
    }
    DOM.myNotesList.innerHTML = '';
    privateNotes.slice().reverse().forEach((note, idx) => {
        const realIdx = privateNotes.length - 1 - idx;
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        noteEl.style.cssText = 'border:1px solid var(--border-color,#e0e0e0);border-radius:10px;padding:14px;margin-bottom:10px;';
        noteEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                <div style="font-weight:600;font-size:14px;">${escapeHtml(note.title || 'Note')}</div>
                <button class="delete-note-btn" data-idx="${realIdx}" style="background:none;border:none;color:#f44336;cursor:pointer;padding:2px 6px;font-size:16px;" title="Delete">✕</button>
            </div>
            <div style="font-size:14px;line-height:1.5;">${escapeHtml(note.content || '')}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:8px;">
                <i class="far fa-clock"></i> ${formatTimeAgo(new Date(note.createdAt))}
                ${note.listingId ? `<span style="margin-left:8px;"><i class="fas fa-link"></i> Linked to listing</span>` : ''}
            </div>
        `;
        DOM.myNotesList.appendChild(noteEl);
    });
    // Wire delete buttons
    DOM.myNotesList.querySelectorAll('.delete-note-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const i = parseInt(this.dataset.idx);
            privateNotes.splice(i, 1);
            _saveNotes();
            renderMyNotes();
            showNotification('Note deleted', 'info');
        };
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
    if (!UIState.currentListingData) return;
    const listing = UIState.currentListingData;
    const exists = savedItems.some(item => item.id === listing.id);
    if (!exists) {
        savedItems.push(listing);
        _persistSavedItems();
        showNotification('Item saved', 'success');
        if (DOM.saveListingBtn) DOM.saveListingBtn.style.color = 'var(--primary-color)';
    } else {
        savedItems = savedItems.filter(item => item.id !== listing.id);
        _persistSavedItems();
        showNotification('Removed from saved', 'info');
        if (DOM.saveListingBtn) DOM.saveListingBtn.style.color = '';
    }
}

function _persistSavedItems() {
    try { localStorage.setItem('mp_saved_items', JSON.stringify(savedItems)); } catch(e) {}
    try {
        const LST = window.LocalStoreTools;
        if (LST && LST.saveSavedItem) {
            savedItems.forEach(item => LST.saveSavedItem(item).catch(() => {}));
        }
    } catch(e) {}
    window.savedItems = savedItems;
}

function _loadSavedItems() {
    try {
        const raw = localStorage.getItem('mp_saved_items');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) { savedItems = parsed; window.savedItems = savedItems; return; }
        }
    } catch(e) {}
    try {
        const LST = window.LocalStoreTools;
        if (LST && LST.getAllSaved) {
            LST.getAllSaved().then(items => {
                if (Array.isArray(items) && items.length > 0) {
                    savedItems = items; window.savedItems = savedItems;
                }
            }).catch(() => {});
        }
    } catch(e) {}
}

function showAddNoteDialog() {
    const note = prompt('Add a private note about this listing:');
    if (note) {
        const entry = {
            id: 'note_' + Date.now(),
            listingId: UIState.currentListingId,
            title: UIState.currentListingData?.title || 'Listing',
            content: note,
            createdAt: new Date().toISOString()
        };
        privateNotes.push(entry);
        _saveNotes();
        showNotification('Note added', 'success');
    }
}

function _saveNotes() {
    // Save to localStorage
    try { localStorage.setItem('mp_private_notes', JSON.stringify(privateNotes)); } catch(e) {}
    // Save to LocalStoreTools IDB
    try {
        const LST = window.LocalStoreTools;
        if (LST && LST.saveNote) {
            privateNotes.forEach(n => LST.saveNote(n).catch(() => {}));
        }
    } catch(e) {}
}

function _loadNotes() {
    // Load from localStorage first (fastest)
    try {
        const raw = localStorage.getItem('mp_private_notes');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                privateNotes = parsed;
                return;
            }
        }
    } catch(e) {}
    // Load from LocalStoreTools IDB
    try {
        const LST = window.LocalStoreTools;
        if (LST && LST.getAllNotes) {
            LST.getAllNotes().then(notes => {
                if (Array.isArray(notes) && notes.length > 0) {
                    privateNotes = notes;
                }
            }).catch(() => {});
        }
    } catch(e) {}
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
        savedItems = [];
        window.savedItems = [];
        try { localStorage.removeItem('mp_saved_items'); } catch(e) {}
        try {
            const LST = window.LocalStoreTools;
            if (LST && LST.getAllSaved) {
                LST.getAllSaved().then(items => {
                    (items || []).forEach(item => LST.deleteSavedItem && LST.deleteSavedItem(item.id));
                }).catch(() => {});
            }
        } catch(e) {}
        renderSavedItems();
        showNotification('All saved items cleared', 'success');
    }
}

function addNewNote() {
    const note = prompt('Add a new note:');
    if (note) {
        const entry = {
            id: 'note_' + Date.now(),
            title: 'General Note',
            content: note,
            createdAt: new Date().toISOString()
        };
        privateNotes.push(entry);
        _saveNotes();
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

    // Load persisted data immediately
    _loadNotes();
    _loadSavedItems();

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
    if (!window._toolsActiveHandled) {
        window._toolsActiveHandled = true;
        console.log('[Tool-ui] tools:active received, re-binding UI events');
        setTimeout(forceBindAllUIEvents, 200);
        setTimeout(() => { window._toolsActiveHandled = false; }, 5000);
    }
});

window.addEventListener('marketplaceCoreReady', () => {
    if (!window._coreReadyHandled) {
        window._coreReadyHandled = true;
        console.log('[Tool-ui] marketplaceCoreReady received, re-binding UI events');
        setTimeout(forceBindAllUIEvents, 200);
    }
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

// Run once and after DOM ready only
directAttachHandlers();
setTimeout(directAttachHandlers, 800);

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

// ══════════════════════════════════════════════════════════════════════════════
// ECOMMERCE HELPER FUNCTIONS — Cart badge, checkout panel, review writer
// ══════════════════════════════════════════════════════════════════════════════

/** Update the cart count badge in the header */
function _updateCartBadge() {
    const ecom = window.EcomMarketplace;
    const count = ecom ? ecom.CartEngine.size() : 0;
    let badge = document.getElementById('ecom-cart-count-badge');
    if (!badge) {
        // Try to find any cart button and attach badge
        const cartBtns = document.querySelectorAll('[data-cart-trigger],[id*="cart"],[class*="cart-btn"]');
        cartBtns.forEach(btn => {
            let b = btn.querySelector('.ecom-cart-badge');
            if (!b) {
                b = document.createElement('span');
                b.className = 'ecom-cart-badge';
                b.id = 'ecom-cart-count-badge';
                b.style.cssText = 'position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;line-height:1;';
                btn.style.position = 'relative';
                btn.appendChild(b);
                badge = b;
            }
        });
    }
    if (badge) badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
    if (badge) badge.style.display = count > 0 ? 'flex' : 'none';

    // Also dispatch event for any badge listeners
    window.dispatchEvent(new CustomEvent('ecom:cart-badge-update', { detail: { count } }));
}

/** Open the full checkout/cart sidebar */
function openCheckoutPanel() {
    const ecom = window.EcomMarketplace;
    // Remove existing panel if any
    let panel = document.getElementById('ecom-checkout-panel');
    if (panel) panel.remove();

    const cart = ecom ? ecom.CartEngine.getCart() : { items: [], total: 0, subtotal: 0, delivery: 0, count: 0 };
    const fmt  = (n) => ecom ? ecom.SettingsEngine.formatPrice(n) : `KES ${parseFloat(n||0).toLocaleString()}`;

    panel = document.createElement('div');
    panel.id = 'ecom-checkout-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;width:min(400px,100vw);height:100vh;background:#fff;z-index:99998;box-shadow:-8px 0 32px rgba(0,0,0,0.2);display:flex;flex-direction:column;transition:transform 0.3s ease;overflow:hidden;';

    panel.innerHTML = `
    <!-- Header -->
    <div style="background:var(--primary-color,#f57224);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;">
            <i class="fas fa-shopping-cart" style="font-size:20px;"></i>
            <h2 style="margin:0;font-size:18px;font-weight:700;">Your Cart (${cart.count})</h2>
        </div>
        <button onclick="document.getElementById('ecom-checkout-panel').remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">×</button>
    </div>

    <!-- Cart Items -->
    <div id="ecom-checkout-items" style="flex:1;overflow-y:auto;padding:16px;">
        ${cart.items.length === 0 ? `
        <div style="text-align:center;padding:48px 20px;color:#9ca3af;">
            <div style="font-size:64px;margin-bottom:16px;">🛒</div>
            <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Your cart is empty</div>
            <div style="font-size:14px;">Add products to get started</div>
        </div>` : cart.items.map(item => `
        <div data-cart-item="${item.product.id}" style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #f3f4f6;align-items:flex-start;">
            <div style="width:72px;height:72px;border-radius:10px;overflow:hidden;flex-shrink:0;background:#f3f4f6;">
                ${item.product.images?.[0] ? `<img src="${escapeHtml(item.product.images[0])}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;">🛒</div>`}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:#111;line-height:1.3;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(item.product.title)}</div>
                <div style="font-size:14px;font-weight:700;color:var(--primary-color,#f57224);margin-bottom:8px;">${fmt(item.product.price)}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="_ecomQtyChange('${item.product.id}',-1)" style="background:#f3f4f6;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">−</button>
                    <span style="font-size:14px;font-weight:600;min-width:24px;text-align:center;">${item.quantity}</span>
                    <button onclick="_ecomQtyChange('${item.product.id}',1)" style="background:#f3f4f6;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">+</button>
                    <button onclick="_ecomRemoveItem('${item.product.id}')" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:13px;margin-left:auto;">Remove</button>
                </div>
                ${item.product.delivery_fee > 0 ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">+ ${fmt(item.product.delivery_fee)} delivery</div>` : '<div style="font-size:11px;color:#22c55e;margin-top:4px;">Free delivery</div>'}
            </div>
            <div style="font-size:14px;font-weight:700;color:#111;flex-shrink:0;">${fmt(item.product.price * item.quantity)}</div>
        </div>`).join('')}
    </div>

    <!-- Summary & Checkout -->
    ${cart.items.length > 0 ? `
    <div style="flex-shrink:0;padding:16px;border-top:1px solid #f3f4f6;background:#fff;">
        <div style="background:#f9fafb;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#6b7280;">
                <span>Subtotal (${cart.count} items)</span><span>${fmt(cart.subtotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#6b7280;">
                <span>Delivery</span><span>${cart.delivery > 0 ? fmt(cart.delivery) : '<span style="color:#22c55e">Free</span>'}</span>
            </div>
            ${cart.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#22c55e;"><span>Savings</span><span>-${fmt(cart.discount)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#111;border-top:1px solid #e5e7eb;padding-top:10px;margin-top:6px;">
                <span>Total</span><span style="color:var(--primary-color,#f57224)">${fmt(cart.total)}</span>
            </div>
        </div>
        <button id="ecom-proceed-checkout-btn" onclick="_ecomProceedToCheckout()" style="width:100%;background:var(--primary-color,#f57224);color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;">
            <i class="fas fa-lock"></i> Proceed to Checkout
        </button>
        <button onclick="document.getElementById('ecom-checkout-panel').remove()" style="width:100%;background:#f3f4f6;color:#374151;border:none;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">
            Continue Shopping
        </button>
    </div>` : ''}
    `;

    document.body.appendChild(panel);
    requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });
}
window.openCheckoutPanel = openCheckoutPanel;

// Cart quantity helpers (called from onclick in injected HTML)
window._ecomQtyChange = function(productId, delta) {
    const ecom = window.EcomMarketplace;
    if (!ecom) return;
    const item = ecom.CartEngine.getItem(productId);
    if (!item) return;
    ecom.CartEngine.updateQuantity(productId, item.quantity + delta);
    _updateCartBadge();
    openCheckoutPanel(); // Re-render
};
window._ecomRemoveItem = function(productId) {
    const ecom = window.EcomMarketplace;
    if (ecom) ecom.CartEngine.remove(productId);
    _updateCartBadge();
    openCheckoutPanel(); // Re-render
};
window._ecomProceedToCheckout = function() {
    const panel = document.getElementById('ecom-checkout-panel');
    const body = panel?.querySelector('#ecom-checkout-items');
    if (body) {
        const ecom = window.EcomMarketplace;
        const fmt = (n) => ecom ? ecom.SettingsEngine.formatPrice(n) : `KES ${parseFloat(n||0).toLocaleString()}`;
        const cart = ecom ? ecom.CartEngine.getCart() : null;
        if (!cart || !cart.items.length) return;

        body.innerHTML = `
        <h3 style="font-size:16px;font-weight:700;margin:0 0 16px;">Delivery Details</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div><label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">FULL NAME</label>
                <input id="eco-ch-name" type="text" placeholder="Your full name" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
            <div><label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">PHONE NUMBER</label>
                <input id="eco-ch-phone" type="tel" placeholder="07XXXXXXXX" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>
            <div><label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">DELIVERY ADDRESS</label>
                <textarea id="eco-ch-addr" placeholder="Street, Area, City" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;min-height:72px;box-sizing:border-box;resize:vertical;"></textarea></div>
            <div><label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">PAYMENT METHOD</label>
                <select id="eco-ch-pay" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
                    <option value="mpesa">📱 M-Pesa (STK Push)</option>
                    <option value="card">💳 Card Payment</option>
                    <option value="cash">💵 Cash on Delivery</option>
                    <option value="wallet">👛 Wallet</option>
                </select></div>
            <div id="eco-ch-mpesa-hint" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;font-size:13px;color:#166534;">
                📲 You'll receive an M-Pesa prompt on your phone. Enter your PIN to complete payment.
            </div>
            <div style="background:#f9fafb;border-radius:10px;padding:12px;">
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#111;">
                    <span>Order Total</span><span style="color:var(--primary-color,#f57224)">${fmt(cart.total)}</span>
                </div>
            </div>
        </div>`;

        const footer = panel.querySelector('[id="ecom-proceed-checkout-btn"]')?.closest('div');
        if (footer) {
            footer.querySelector('#ecom-proceed-checkout-btn').textContent = '';
            footer.querySelector('#ecom-proceed-checkout-btn').innerHTML = '<i class="fas fa-lock"></i> Place Order & Pay';
            footer.querySelector('#ecom-proceed-checkout-btn').onclick = _ecomPlaceOrder;
        }

        // Toggle mpesa hint
        document.getElementById('eco-ch-pay')?.addEventListener('change', function() {
            const hint = document.getElementById('eco-ch-mpesa-hint');
            if (hint) hint.style.display = this.value === 'mpesa' ? 'block' : 'none';
        });
    }
};
window._ecomPlaceOrder = async function() {
    const ecom = window.EcomMarketplace;
    if (!ecom) return;
    const name   = document.getElementById('eco-ch-name')?.value?.trim();
    const phone  = document.getElementById('eco-ch-phone')?.value?.trim();
    const addr   = document.getElementById('eco-ch-addr')?.value?.trim();
    const payMth = document.getElementById('eco-ch-pay')?.value || 'mpesa';
    const btn    = document.getElementById('ecom-proceed-checkout-btn');

    if (!name || !addr) { ecom.NotificationEngine.show('Please fill in all required fields', 'error', '❌'); return; }
    if (payMth === 'mpesa' && !phone) { ecom.NotificationEngine.show('Phone number required for M-Pesa', 'error', '❌'); return; }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Order…'; }

    try {
        const result = await ecom.OrderEngine.checkout({
            address: { name, phone, raw: addr },
            payment_method: payMth, phone, notes: '',
        });

        if (result.success) {
            document.getElementById('ecom-checkout-panel')?.remove();
            _updateCartBadge();

            // Initiate payment if M-Pesa
            if (payMth === 'mpesa' && result.order?.id) {
                setTimeout(async () => {
                    const pRes = await ecom.PaymentEngine.initiateMpesa({ phone, amount: result.order.total, orderId: result.order.id });
                    if (pRes.success) {
                        ecom.NotificationEngine.show(pRes.message, 'success', '📱');
                    }
                }, 500);
            }

            ecom.NotificationEngine.show('Order placed successfully! 🎉', 'success', '✅');
        }
    } catch (e) {
        ecom.NotificationEngine.show('Order failed: ' + e.message, 'error', '❌');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-lock"></i> Place Order & Pay'; }
    }
};

/** Open write-review panel for a product */
function openWriteReviewPanel(productId) {
    // If openReviewsPanel already exists (from the MP IIFE), use it
    if (typeof window.openReviewsPanel === 'function') {
        window.openReviewsPanel(productId, null);
        return;
    }
    // Minimal fallback
    const rating = prompt('Rate this product (1-5 stars):');
    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) { alert('Invalid rating'); return; }
    const comment = prompt('Leave a comment (optional):') || '';
    const ecom = window.EcomMarketplace;
    if (ecom) {
        ecom.ReviewEngine.submitReview({ productId, rating: ratingNum, text: comment })
            .then(r => { if (r.success) alert('Review submitted! Thank you.'); else alert('Failed: ' + r.message); });
    }
}
window.openWriteReviewPanel = openWriteReviewPanel;

// Listen to ecom cart events and update badge
window.addEventListener('ecom:cart-updated', () => _updateCartBadge());
window.addEventListener('ecom:ready', () => { _updateCartBadge(); console.log('[UI] Ecom marketplace ready'); });

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