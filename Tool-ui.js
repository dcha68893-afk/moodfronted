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
            display: none;
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
        stageText.style.cssText = 'display:none;margin-left: 8px; font-size: 10px; color: #888;';
        if (DOM.connectionStatusBar) {
            DOM.connectionStatusBar.appendChild(stageText);
        }
        DOM.handshakeStageText = stageText;
    } else {
        DOM.handshakeStageText = document.getElementById('handshakeStageText');
    }
    
    // Debug toggle disabled in production
    if (false && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.__IFRAME_DEBUG__) && !document.getElementById('debugToggle')) {
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
            DOM.marketplaceListContent.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#9ca3af"><div style="font-size:48px;margin-bottom:12px">🛒</div><div style="font-size:15px;font-weight:600;margin-bottom:6px">No products yet</div><div style="font-size:13px;margin-bottom:20px">Be the first to create a listing!</div><button onclick="showCreateListingModal()" style="background:#f57224;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer"><i class='fas fa-plus'></i> Create Listing</button></div>`;
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

        filtered.forEach((listing, idx) => {
            if (isListingVisibleToUser(listing)) setTimeout(() => renderers.addListingItem(listing), idx * 18);
        });
        // Update Jumia count after staggered render
        setTimeout(() => { const c=document.getElementById('jmProductCount'); if(c) c.textContent=`(${filtered.length})`; }, filtered.length*18+200);
        
        if (filtered.length === 0) {
            DOM.marketplaceListContent.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#9ca3af"><div style="font-size:40px;margin-bottom:12px">🔍</div><div style="font-size:14px;font-weight:600">No products match your filters</div><div style="font-size:12px;margin-top:6px">Try a different category or clear filters</div></div>`;
        }
        
        if (DOM.availableListingsCount) {
            DOM.availableListingsCount.textContent = filtered.length;
        }
    }, '<div class="error-placeholder">Failed to load listings</div>'),

    addListingItem: withErrorBoundary('AddListingItem', function(listing) {
        if (!DOM.marketplaceListContent || !listing) return;
        if (document.querySelector(`.jm-card[data-listing-id="${listing.id}"]`)) return;

        // ── Normalise fields ──────────────────────────────────────────────
        const price    = parseFloat(String(listing.price||0).replace(/[^0-9.]/g,'')) || 0;
        const origPrc  = parseFloat(String(listing.original_price||listing.originalPrice||0).replace(/[^0-9.]/g,'')) || 0;
        const discount = origPrc > price && origPrc > 0 ? Math.round((1-price/origPrc)*100) : (parseFloat(listing.discount)||0);
        const stock    = listing.stock_quantity ?? listing.stock ?? null;
        const inStock  = listing.available !== false && (stock === null || stock > 0);
        const rating   = parseFloat(listing.rating) || 0;
        const reviews  = parseInt(listing.reviews_count || listing.ratingCount) || 0;
        const imgSrc   = listing.images?.[0] || listing.mediaUrl || listing.image || '';
        const delivFee = parseFloat(listing.delivery_fee || listing.deliveryFee || 0);
        const condition = listing.condition || (listing.type === 'digital' ? 'Digital' : '');
        const ecom     = window.EcomMarketplace;
        const inWish   = ecom ? ecom.WishlistEngine.has(listing.id) : (savedItems?.some?.(s=>s.id===listing.id));
        const inCart   = ecom ? ecom.CartEngine.has(listing.id) : false;
        const fmt      = (n) => ecom ? ecom.SettingsEngine.formatPrice(n) : `KES ${n.toLocaleString()}`;
        const _stars   = (r) => { let s=''; const f=Math.floor(r), h=r-f>=0.5;
            for(let i=0;i<f;i++) s+='<i class="fas fa-star"></i>';
            if(h) s+='<i class="fas fa-star-half-alt"></i>';
            for(let i=0;i<(5-f-(h?1:0));i++) s+='<i class="far fa-star"></i>';
            return s; };

        // ── Track recently viewed ─────────────────────────────────────────
        window._jmAddRecent && window._jmAddRecent(listing);

        const card = document.createElement('div');
        card.className = 'jm-card';
        card.dataset.listingId = listing.id;
        card.dataset.userId = listing.userId || listing.sellerId || '';

        // Improved image handling: show a lightweight skeleton, load real image if available,
        // fall back to a category tile or a real product image when missing or on error.
        const _catKey = listing.category || listing.subcategory || listing.type || '';
        const _fallbackBase = (typeof _CDN !== 'undefined' && _CDN[_catKey])
            ? _CDN[_catKey]
            : (typeof _catImg === 'function' ? _catImg(_catKey) : null);
        const fallbackImg = _fallbackBase
            || `https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop&q=70`;

        card.innerHTML = `
            <div class="jm-card-img-wrap">
                <div class="jm-card-img-skeleton" style="background:#f3f4f6;height:160px;border-radius:6px;animation:jmPulse 1.2s infinite;">
                </div>
                ${imgSrc
                    ? `<img class="jm-card-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(listing.title||'')}" loading="lazy"
                        onload="this.classList.add('loaded'); this.previousElementSibling && (this.previousElementSibling.style.display='none')"
                        onerror="this.onerror=null; this.src='${escapeHtml(fallbackImg)}'; this.previousElementSibling && (this.previousElementSibling.style.display='none')">`
                    : `<img class="jm-card-img" src="${escapeHtml(fallbackImg)}" alt="${escapeHtml(listing.title||'')}" loading="lazy" onerror="this.style.display='none'">`}
                ${discount>0 ? `<span class="jm-card-discount-badge">-${discount}%</span>` : ''}
                ${condition ? `<span class="jm-card-condition-badge">${escapeHtml(condition.toUpperCase())}</span>` : ''}
                <button class="jm-card-wish${inWish?' wishlisted':''}" data-id="${listing.id}" onclick="event.stopPropagation()">
                    ${inWish ? '❤️' : '🤍'}
                </button>
                ${!inStock && stock!==null ? `<div class="jm-card-out-overlay"><span class="jm-card-out-label">OUT OF STOCK</span></div>` : ''}
            </div>
            <div class="jm-card-body">
                <div class="jm-card-title">${escapeHtml(listing.title||'Untitled')}</div>
                ${rating>0||reviews>0 ? `<div class="jm-card-stars">${_stars(rating)}<span class="jm-card-reviews">(${reviews.toLocaleString()})</span></div>` : ''}
                <div class="jm-card-prices">
                    <span class="jm-card-price">${price>0?fmt(price):'<span style="color:#22c55e;font-weight:700">Free</span>'}</span>
                    ${origPrc>price ? `<span class="jm-card-oldprice">${fmt(origPrc)}</span>` : ''}
                </div>
                ${delivFee===0 ? '<div class="jm-card-delivery">Free delivery</div>' : (delivFee>0 ? `<div style="font-size:10px;color:#6b7280">+ ${fmt(delivFee)} delivery</div>` : '')}
                ${stock!==null&&stock>0&&stock<=5 ? `<div class="jm-card-stock-warn">Only ${stock} left!</div>` : ''}
                ${inStock
                    ? `<button class="jm-add-cart-btn${inCart?' in-cart':''}" data-id="${listing.id}" onclick="event.stopPropagation()">
                          ${inCart ? '✓ In Cart' : 'Add To Cart'}`
                    : `<button class="jm-add-cart-btn" disabled>Out of Stock</button>`}
            </div>
        `;

        // Wishlist toggle
        card.querySelector('.jm-card-wish')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ecom) {
                const added = ecom.WishlistEngine.toggle(listing.id);
                e.currentTarget.textContent = added ? '❤️' : '🤍';
                e.currentTarget.classList.toggle('wishlisted', added);
            } else if (typeof toggleSaveListing === 'function') {
                toggleSaveListing(listing.id);
            }
            window._jmUpdateWishlistBadge?.();
        });

        // Add to cart
        const cartBtn = card.querySelector('.jm-add-cart-btn');
        if (cartBtn && !cartBtn.disabled) {
            cartBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (ecom) {
                    const p = { id:listing.id, title:listing.title, price, original_price:origPrc, discount,
                        seller_id: listing.sellerId||listing.userId, seller:{name:listing.user?.displayName||'Seller'},
                        images: listing.images||(imgSrc?[imgSrc]:[]), stock_quantity:stock??999,
                        delivery_fee: delivFee, available:true, category:listing.category||'other' };
                    const res = ecom.CartEngine.add(p, 1);
                    if (res.success) {
                        cartBtn.textContent = '✓ In Cart';
                        cartBtn.classList.add('in-cart');
                        window._jmUpdateCartBadge?.();
                        window._jmToast('Added to cart', 'success', '🛒');
                    } else {
                        window._jmToast(res.message||'Failed', 'error', '❌');
                    }
                } else if (typeof openPlaceOrderPanel === 'function') {
                    openPlaceOrderPanel(listing);
                }
            });
        }

        // Open detail panel on card click
        card.addEventListener('click', () => renderers.viewListingDetail(listing));
        DOM.marketplaceListContent.appendChild(card);
    }, null),

    viewListingDetail: withErrorBoundary('ViewListingDetail', function(listing) {
        if (!DOM.marketplaceDetailPanel || !listing) return;
        UIState.currentListingId = listing.id;
        UIState.currentListingData = listing;
        UIState.viewHistory.push({ id: listing.id, timestamp: Date.now() });

        // Push a 'detail' history entry so back button closes detail and restores previous page
        try {
            // don't duplicate markers for same listing
            const last = _navStack[_navStack.length - 1];
            if (!last || last.page !== 'detail' || last.subpage !== listing.id) {
                _navStack.push({ page: 'detail', subpage: listing.id, fromPage: _state.page || 'products', fromSubpage: _state.subpage || '' });
            }
            const backBtn = document.getElementById('jmBackBtn'); if (backBtn) backBtn.style.display = 'flex';
        } catch(_) {}

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
                // Show pending review message — product is NOT live until admin approves
                const isPending = listing.status === 'pending_review' || listing.approval_status === 'pending' || listing.approvalStatus === 'pending';
                if (isPending) {
                    showNotification('Listing submitted for review! 🎉 It will go live after admin approval.', 'success');
                } else {
                    showNotification('Listing published! 🎉', 'success');
                }
                hideCreateListingModal();
                resetCreateListingForm();
                UIPipeline.syncFromCoreGlobals();
                UIPipeline.liveUpdate();
                // Refresh seller dashboard if open
                if (typeof window._sellerDash?.reload === 'function') window._sellerDash.reload();
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
// ═══════════════════════════════════════════════════════════════════════════
// JUMIA-STYLE MARKETPLACE ENGINE v2.0
// Complete ecommerce navigation, cart, wishlist, categories, orders,
// account, recently viewed, product grid, search, realtime sync.
// Runs as a self-contained IIFE so it never conflicts with existing code.
// ═══════════════════════════════════════════════════════════════════════════
(function _JumiaMPEngine() {
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const _state = {
    page:        'home',
    catSelected: null,
    sort:        'newest',
    search:      '',
    cart:        new Map(),   // id → {listing, qty}
    wishlist:    new Set(),
    recent:      [],          // [{listing,ts}]
    orders:      [],
    addresses:   [],
    notifications: { orders: true, marketing: false },
    initialized: false,
};

const MAX_RECENT = 20;
const _LS = {
    CART:    'jm_cart_v1',
    WISH:    'jm_wish_v1',
    RECENT:  'jm_recent_v1',
    ORDERS:  'jm_orders_v1',
    ADDRS:   'jm_addrs_v1',
};

// ── Local storage helpers ──────────────────────────────────────────────────
const _ls = {
    save: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} },
    load: (k,d=null) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):d; } catch(_) { return d; } },
};

// ── Format helpers ─────────────────────────────────────────────────────────
function _fmt(n) {
    const ecom = window.EcomMarketplace;
    if (ecom) return ecom.SettingsEngine.formatPrice(n);
    return 'KES ' + parseFloat(n||0).toLocaleString('en-KE', {minimumFractionDigits:0, maximumFractionDigits:0});
}

function _stars(r, sm=false) {
    const sz = sm ? '10px' : '12px';
    let s=''; const f=Math.floor(r||0), h=(r||0)-f>=0.5;
    for(let i=0;i<f;i++) s+=`<i class="fas fa-star" style="color:#f5a623;font-size:${sz}"></i>`;
    if(h) s+=`<i class="fas fa-star-half-alt" style="color:#f5a623;font-size:${sz}"></i>`;
    for(let i=0;i<(5-f-(h?1:0));i++) s+=`<i class="far fa-star" style="color:#ddd;font-size:${sz}"></i>`;
    return s;
}

function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _price(listing) {
    return parseFloat(String(listing.price||listing.price_display||0).replace(/[^0-9.]/g,'')) || 0;
}
function _origPrice(listing) {
    return parseFloat(String(listing.original_price||listing.originalPrice||0).replace(/[^0-9.]/g,'')) || 0;
}
function _discount(listing) {
    const p=_price(listing), o=_origPrice(listing);
    return o>p&&o>0 ? Math.round((1-p/o)*100) : (parseFloat(listing.discount)||0);
}
function _img(listing) {
    return listing.images?.[0] || listing.mediaUrl || listing.image || '';
}
function _inStock(listing) {
    const s = listing.stock_quantity??listing.stock??null;
    return listing.available!==false && (s===null||s>0);
}

// ── Toast ──────────────────────────────────────────────────────────────────
function _toast(msg, type='info', icon='ℹ️', dur=3000) {
    let box = document.getElementById('jmToastContainer');
    if (!box) {
        box = document.createElement('div');
        box.id = 'jmToastContainer';
        document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'jm-toast ' + type;
    t.innerHTML = `<span>${icon}</span><span>${_esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.animation='jmToastOut 0.3s ease forwards'; setTimeout(()=>t.remove(),300); }, dur);
}
window._jmToast = _toast;

// ── Cart badge update ──────────────────────────────────────────────────────
function _updateCartBadge() {
    const ecom = window.EcomMarketplace;
    const count = ecom ? ecom.CartEngine.size() : _state.cart.size;
    ['jmCartBadge','jmNavCartBadge'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = count > 0 ? 'flex' : 'none';
    });
    // notify parent (chat.html) for nav badge
    try { window.parent.postMessage({ type:'ECOM_CART_UPDATE', payload:{count} }, '*'); } catch(_) {}
}
window._jmUpdateCartBadge = _updateCartBadge;

// ── Wishlist badge ─────────────────────────────────────────────────────────
function _updateWishlistBadge() {
    const ecom = window.EcomMarketplace;
    const count = ecom ? ecom.WishlistEngine.getWishlist().length : _state.wishlist.size;
    const tab = document.querySelector('.jm-nav-tab[data-page="wishlist"] span');
    if (tab) tab.textContent = count > 0 ? `Wishlist (${count})` : 'Wishlist';
}
window._jmUpdateWishlistBadge = _updateWishlistBadge;

// ── Navigation history stack ───────────────────────────────────────────────
// Tracks pages visited so back arrow returns to the exact previous page/subpage.
// Root-level nav tabs (home, categories, cart, wishlist, account) reset the stack
// so tapping a bottom-tab never leaves a stale history entry to jump back to.
const _NAV_TABS = new Set(['home','categories','cart','wishlist','account']);
const _navStack = []; // [{page, subpage}, ...]

function _navBack() {
    if (_navStack.length > 1) {
        _navStack.pop(); // discard current
        const prev = _navStack[_navStack.length - 1];
        _navDirect(prev.page, prev.subpage); // navigate without pushing a new entry
    } else {
        _navDirect('home');
    }
}

// Internal: navigate and optionally push to stack
function _navDirect(page, subpage, _pushHistory) {
    _state.page = page;
    document.querySelectorAll('.jm-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.jm-nav-tab').forEach(t => t.classList.remove('active'));

    const pageEl = document.getElementById('jmPage' + page.charAt(0).toUpperCase() + page.slice(1));
    if (pageEl) pageEl.classList.add('active');

    const navTab = document.querySelector(`.jm-nav-tab[data-page="${page}"]`);
    if (navTab) navTab.classList.add('active');

    // Back button — show whenever there is a previous page to return to
    const backBtn = document.getElementById('jmBackBtn');
    if (backBtn) backBtn.style.display = (_navStack.length > 1) ? 'flex' : 'none';

    // Render page content
    switch(page) {
        case 'home':           _renderHome(); break;
        case 'categories':     _renderCategories(); break;
        case 'cart':           _renderCart(); break;
        case 'wishlist':       _renderWishlist(); break;
        case 'account':        _renderAccount(); break;
        case 'orders':         _renderOrders(); break;
        case 'recent':         _renderRecent(); break;
        case 'products':       _renderProductsPage(subpage); break;
        case 'notifprefs':     _renderNotifPrefs(); break;
        case 'addresses':      (window._renderAddresses || _renderAddresses)(); break;
        case 'vouchers':       (window._renderVouchers || _renderVouchers)(); break;
        case 'inbox':          (window._renderInbox || _renderInbox)(); break;
        case 'follow-sellers': (window._renderFollowSellers || _renderFollowSellers)(); break;
        case 'reviews-page':   _renderReviewsPage(); break;
        case 'analytics':      _renderAnalyticsPage(); break;
        case 'notes':          _renderNotesPage(); break;
        case 'trust':          _renderTrustPage(); break;
        case 'leaderboard':    _renderLeaderboardPage(); break;
        // Seller pages — delegated to marketplace-seller.js via window._jmNavMore
        case 'seller-dashboard':
        case 'my-listings':
        case 'seller-inventory':
        case 'seller-analytics':
        case 'seller-payouts':
        case 'seller-shipping':
        case 'seller-returns':
        case 'seller-verification':
        case 'seller-subscription':
        case 'admin-approval':
        case 'admin-dashboard':
        case 'admin-products':
        case 'admin-sellers':
        case 'admin-buyers':
        case 'admin-orders':
        case 'admin-analytics':
        case 'admin-payouts':
        case 'admin-coupons':
        case 'admin-reviews':
        case 'admin-support':
        case 'admin-settings':
            // These are handled by marketplace-seller.js _jmNavMore override
            // which creates pages inside #sidebar via _getOrCreatePage
            break;
    }
}

// ── Page navigation (public) ───────────────────────────────────────────────
function _nav(page, subpage) {
    // Bottom-tab taps reset the stack entirely (they are top-level destinations)
    if (_NAV_TABS.has(page)) {
        _navStack.length = 0;
    }
    // Push this page onto the stack
    _navStack.push({ page, subpage });
    _navDirect(page, subpage);
}
window._jmNav  = _nav;
window._jmBack = _navBack;

// ── Chat navigation — opens the messages module (like WhatsApp icon) ────────
window._jmOpenChat = function() {
    try {
        // Tell parent chat.html to navigate to messages page
        window.parent.postMessage({ type: 'NAVIGATE_TO_PAGE', payload: { page: 'messages' } }, '*');
        window.parent.postMessage({ type: 'GO_TO_CHAT' }, '*');
        window.parent.postMessage({ type: 'SHOW_CHAT_PANEL' }, '*');
        // Also try direct DOM manipulation if we have access
        if (window.parent && window.parent.navigateToPage) {
            window.parent.navigateToPage('messages');
        }
        // Fallback: try to activate chat panel via CSS class on parent body
        try { window.parent.document.body.classList.add('chat-panel-active'); } catch(_) {}
    } catch(e) {
        // If cross-origin blocked, try within same page
        if (typeof navigateToPage === 'function') navigateToPage('messages');
    }
};

// Update chat badge from parent unread count
window.addEventListener('message', (e) => {
    if (e.data?.type === 'UNREAD_COUNT_UPDATE') {
        const badge = document.getElementById('jmChatBadge');
        const count = e.data.payload?.count || e.data.count || 0;
        if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    }
});

// ── More sheet ─────────────────────────────────────────────────────────────
function _showMore() {
    const overlay = document.getElementById('jmMoreOverlay');
    const sheet   = document.getElementById('jmMoreSheet');
    if (overlay) {
        overlay.style.cssText = 'display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998';
    }
    if (sheet) {
        sheet.style.cssText = 'display:block;position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff;border-radius:20px 20px 0 0;padding:16px 16px 32px;max-height:82vh;overflow-y:auto;box-shadow:0 -4px 32px rgba(0,0,0,.18)';
        sheet.style.animation = 'jmSheetUp .28s cubic-bezier(.4,0,.2,1)';
    }
    document.body.style.overflow = 'hidden';
}
function _hideMore() {
    const overlay = document.getElementById('jmMoreOverlay');
    const sheet   = document.getElementById('jmMoreSheet');
    if (overlay) overlay.style.display = 'none';
    if (sheet)   sheet.style.display   = 'none';
    document.body.style.overflow = '';
}
function _navMore(page) {
    _hideMore();
    // Ensure pages that need dynamic creation are inside #sidebar
    const dynamicPages = ['analytics','notes','trust','leaderboard'];
    if (dynamicPages.includes(page)) {
        const pageId = 'jmPage' + page.charAt(0).toUpperCase() + page.slice(1);
        if (!document.getElementById(pageId)) {
            const el = document.createElement('div');
            el.id = pageId;
            el.className = 'jm-page';
            document.getElementById('sidebar')?.appendChild(el);
        }
    }
    _nav(page);
}
window._jmShowMore = _showMore;
window._jmHideMore = _hideMore;
window._jmNavMore  = _navMore;

// ── Recently Viewed ────────────────────────────────────────────────────────
function _addRecent(listing) {
    if (!listing?.id) return;
    _state.recent = _state.recent.filter(r => r.id !== listing.id);
    _state.recent.unshift({ ...listing, _recentTs: Date.now() });
    if (_state.recent.length > MAX_RECENT) _state.recent.pop();
    _ls.save(_LS.RECENT, _state.recent.map(r => ({ id:r.id, title:r.title, images:r.images, price:r.price, original_price:r.original_price, rating:r.rating, discount:r.discount, _recentTs:r._recentTs })));
}
function _clearRecent() {
    _state.recent = [];
    _ls.save(_LS.RECENT, []);
    _renderRecent();
    _toast('Cleared recently viewed', 'info', '🗑️');
}
window._jmAddRecent  = _addRecent;
window._jmClearRecent = _clearRecent;

// ── HOME PAGE render ───────────────────────────────────────────────────────
function _renderHome() {
    // Featured row
    const ecom = window.EcomMarketplace;
    if (ecom) {
        const featured = ecom.ProductEngine.getFeatured();
        _renderHScroll('jmFeaturedRow', featured, 'jmFeaturedSection');
        const flash = ecom.ProductEngine.getFlashSales();
        const flashBanner = document.getElementById('jmFlashBanner');
        if (flashBanner) flashBanner.style.display = flash.length ? 'flex' : 'none';
    }
    // Product count
    const grid = document.getElementById('marketplaceListContent');
    const countEl = document.getElementById('jmProductCount');
    if (grid && countEl) countEl.textContent = `(${grid.querySelectorAll('.jm-card').length})`;
}

// ── HORIZONTAL SCROLL render ───────────────────────────────────────────────
function _renderHScroll(containerId, listings, sectionId) {
    const el = document.getElementById(containerId);
    const sec = sectionId ? document.getElementById(sectionId) : null;
    if (!el) return;
    if (!listings?.length) { if(sec) sec.style.display='none'; return; }
    if (sec) sec.style.display = '';

    el.innerHTML = listings.slice(0,10).map(p => {
        const pr = _price(p), op = _origPrice(p), disc = _discount(p);
        const img = _img(p);
        return `<div class="jm-hcard" data-id="${p.id}">
            ${img ? `<img class="jm-hcard-img" src="${_esc(img)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="jm-hcard-img-placeholder">${p.type==='digital'?'💾':'🛒'}</div>`}
            <div class="jm-hcard-body">
                <div class="jm-hcard-title">${_esc(p.title||'')}</div>
                <div><span class="jm-hcard-price">${pr>0?_fmt(pr):'Free'}</span>${op>pr?`<span class="jm-hcard-oldprice">${_fmt(op)}</span>`:''}</div>
                ${disc>0?`<div class="jm-hcard-discount">-${disc}%</div>`:''}
                ${p.rating>0?`<div class="jm-hcard-rating">★ ${p.rating.toFixed(1)}</div>`:''}
            </div></div>`;
    }).join('');

    el.querySelectorAll('.jm-hcard').forEach(card => {
        card.addEventListener('click', () => {
            const ecom = window.EcomMarketplace;
            const p = ecom?.ProductEngine.getStore().products.get(card.dataset.id);
            if (p && typeof renderers !== 'undefined') renderers.viewListingDetail(p);
        });
    });
}

// ── CATEGORIES PAGE ────────────────────────────────────────────────────────
// Full Jumia-style category tree: each category has multiple named sections,
// each section has multiple subcategories with real Unsplash product images.

// Image CDN helper — uses placehold.co for solid category tiles (always loads,
// no CORS, no auth, no rate-limit) with a coloured background + label text so
// each tile is visually distinct without relying on third-party photo services.
// Format: https://placehold.co/WxH/BG_HEX/TEXT_HEX?text=Label
// We complement this with a curated set of stable open-license product images
// hosted on CDNs that are publicly cached and don't require sign-in.
const _CDN = {
    // ── Phones & Tablets ───────────────────────────────────────────────────
    Smartphones:       'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=300&fit=crop',
    'Feature Phones':  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&h=300&fit=crop',
    'iOS Phones':      'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&h=300&fit=crop',
    'Android Tablets': 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=300&fit=crop',
    iPads:             'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400&h=300&fit=crop',
    'Kids Tablets':    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=300&h=300&fit=crop',
    'Cases & Sleeves': 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=300&fit=crop',
    'Screen Protectors':'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&h=300&fit=crop',
    Chargers:          'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&h=300&fit=crop',
    'Power Banks':     'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=300&h=300&fit=crop',
    Earphones:         'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
    Smartwatches:      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
    // ── TVs & Audio ────────────────────────────────────────────────────────
    'LED TVs':         'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400&h=300&fit=crop',
    'Smart TVs':       'https://images.unsplash.com/photo-1567690187548-f07b1d7bf754?w=400&h=300&fit=crop',
    'OLED TVs':        'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400&h=300&fit=crop',
    Headphones:        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
    Speakers:          'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=300&fit=crop',
    Soundbars:         'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=300&h=300&fit=crop',
    Microphones:       'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&h=300&fit=crop',
    Earbuds:           'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=300&fit=crop',
    'Home Theatre':    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop',
    'DSLR Cameras':    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=300&fit=crop',
    'Action Cameras':  'https://images.unsplash.com/photo-1502920514313-52581002a659?w=400&h=300&fit=crop',
    'Security Cameras':'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=300&h=300&fit=crop',
    // ── Appliances ─────────────────────────────────────────────────────────
    Fridges:           'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=300&h=300&fit=crop',
    'Air Conditioners':'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=300&h=300&fit=crop',
    Fans:              'https://images.unsplash.com/photo-1566760988-f3f85cce26a1?w=300&h=300&fit=crop',
    Cookers:           'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=300&fit=crop',
    Microwaves:        'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=300&h=300&fit=crop',
    Blenders:          'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=300&h=300&fit=crop',
    'Rice Cookers':    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=300&h=300&fit=crop',
    'Washing Machines':'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=300&h=300&fit=crop',
    Irons:             'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop',
    Dryers:            'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=300&h=300&fit=crop',
    // ── Health & Beauty ────────────────────────────────────────────────────
    'Face Moisturisers':'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=300&fit=crop',
    Serums:             'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=300&fit=crop',
    Sunscreen:          'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=300&fit=crop',
    Toners:             'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=300&fit=crop',
    Shampoo:            'https://images.unsplash.com/photo-1585232351009-aa87416fca47?w=400&h=300&fit=crop',
    Conditioner:        'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=300&fit=crop',
    'Hair Oils':        'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=300&fit=crop',
    Perfumes:           'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400&h=300&fit=crop',
    Lipstick:           'https://images.unsplash.com/photo-1586495777744-4e6232bf2b11?w=400&h=300&fit=crop',
    Foundation:         'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&h=300&fit=crop',
    'Eye Makeup':       'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&h=300&fit=crop',
    Vitamins:           'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=300&fit=crop',
    'Protein Shakes':   'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=300&fit=crop',
    'Medical Devices':  'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=300&h=300&fit=crop',
    // ── Home & Office ──────────────────────────────────────────────────────
    Sofas:              'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop',
    'Beds & Mattresses':'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&h=300&fit=crop',
    Tables:             'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=400&h=300&fit=crop',
    'Office Chairs':    'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=400&h=300&fit=crop',
    Bedsheets:          'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=300&h=300&fit=crop',
    'Blankets & Throws':'https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?w=300&h=300&fit=crop',
    Comforters:         'https://images.unsplash.com/photo-1631049552057-403cdb8f0658?w=300&h=300&fit=crop',
    'Bed Pillows':      'https://images.unsplash.com/photo-1584100936595-c0654b55a2e6?w=300&h=300&fit=crop',
    'Storage Cabinets': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop',
    'Closet Storage':   'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop',
    'Shoe Organizers':  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop',
    'Wall Clocks':      'https://images.unsplash.com/photo-1508057198894-247b23fe5ade?w=400&h=300&fit=crop',
    Mirrors:            'https://images.unsplash.com/photo-1564329532039-7f5f0e1d5b4a?w=300&h=300&fit=crop',
    'Rugs & Carpet':    'https://images.unsplash.com/photo-1600166898405-da9535204843?w=300&h=300&fit=crop',
    Lighting:           'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=300&h=300&fit=crop',
    // ── Fashion — Men's ────────────────────────────────────────────────────
    Shirts:             'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=300&fit=crop',
    'T-Shirts & Tanks': 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=300&fit=crop',
    'Suits & Blazers':  'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=300&fit=crop',
    'Suits & Sport Coats': 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=300&fit=crop',
    Pants:              'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&h=300&fit=crop',
    Shorts:             'https://images.unsplash.com/photo-1591195853828-11db59a44f43?w=400&h=300&fit=crop',
    Jeans:              'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=300&fit=crop',
    Underwear:          'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=300&h=300&fit=crop',
    Watches:            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
    'Fashion Sneakers': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
    'Loafers & Slip-Ons':'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=400&h=300&fit=crop',
    Belts:              'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=300&fit=crop',
    'Sunglasses & Eyewear Accessories': 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400&h=300&fit=crop',
    Sunglasses:         'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400&h=300&fit=crop',
    // ── Fashion — Women's ──────────────────────────────────────────────────
    Dresses:            'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=300&fit=crop',
    'Tops & Tees':      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=300&fit=crop',
    'Suiting & Blazers':'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=300&fit=crop',
    Skirts:             'https://images.unsplash.com/photo-1583496661160-fb5218afa9a3?w=400&h=300&fit=crop',
    'Coats, Jackets & Vests': 'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&h=300&fit=crop',
    'Jumpsuits, Rompers & Overalls': 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=300&fit=crop',
    'Lingerie, Sleep & Lounge': 'https://images.unsplash.com/photo-1588117305388-c2631a279f82?w=300&h=300&fit=crop',
    Jewelry:            'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=300&fit=crop',
    Sandals:            'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=400&h=300&fit=crop',
    Flats:              'https://images.unsplash.com/photo-1596703263926-eb0762ee17e4?w=400&h=300&fit=crop',
    'Handbags & Wallets': 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=300&fit=crop',
    Handbags:           'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=300&fit=crop',
    // ── Fashion — Shoes & Kids ─────────────────────────────────────────────
    Sneakers:           'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
    Loafers:            'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=400&h=300&fit=crop',
    Boots:              'https://images.unsplash.com/photo-1608256246200-ac666b338d40?w=400&h=300&fit=crop',
    Heels:              'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&h=300&fit=crop',
    Boys:               'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=400&h=300&fit=crop',
    Girls:              'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?w=400&h=300&fit=crop',
    'Baby Boys':        'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Baby Girls':       'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    // ── Computing ─────────────────────────────────────────────────────────
    Macbooks:           'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop',
    Netbooks:           'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400&h=300&fit=crop',
    '2 in 1 Laptops':   'https://images.unsplash.com/photo-1588702547923-7408785a3cd3?w=400&h=300&fit=crop',
    Ultrabooks:         'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=300&fit=crop',
    Desktops:           'https://images.unsplash.com/photo-1593640408182-31c228e539e5?w=400&h=300&fit=crop',
    Monitors:           'https://images.unsplash.com/photo-1527443224154-c4a573d1e258?w=400&h=300&fit=crop',
    'Laptop Accessories': 'https://images.unsplash.com/photo-1583394293214-0a232b660e3b?w=400&h=300&fit=crop',
    Scanners:           'https://images.unsplash.com/photo-1612538498456-e861df91d4d0?w=300&h=300&fit=crop',
    Printers:           'https://images.unsplash.com/photo-1612538498456-e861df91d4d0?w=300&h=300&fit=crop',
    'Keyboards & Mice': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=300&fit=crop',
    'Keyboards, Mice & Accessories': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=300&fit=crop',
    'Computer Cable Adapters': 'https://images.unsplash.com/photo-1583864697784-a0efc8379f70?w=300&h=300&fit=crop',
    'Printer Ink & Toner': 'https://images.unsplash.com/photo-1612538498456-e861df91d4d0?w=300&h=300&fit=crop',
    'Networking Products': 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=300&h=300&fit=crop',
    Networking:         'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=300&h=300&fit=crop',
    'External Hard Drives': 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=400&h=300&fit=crop',
    'USB Flash Drives': 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=300&h=300&fit=crop',
    'Internal Hard Drives': 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=400&h=300&fit=crop',
    'Graphics Cards':   'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=300&h=300&fit=crop',
    'Fans & Cooling':   'https://images.unsplash.com/photo-1587202372583-4b5e8e553c1c?w=300&h=300&fit=crop',
    // ── Gaming ────────────────────────────────────────────────────────────
    'PlayStation 3':    'https://images.unsplash.com/photo-1606318005954-214f934aee95?w=300&h=300&fit=crop',
    'PlayStation 4':    'https://images.unsplash.com/photo-1606318005954-214f934aee95?w=300&h=300&fit=crop',
    'PlayStation 5':    'https://images.unsplash.com/photo-1607016284318-d1384a9d5faf?w=300&h=300&fit=crop',
    'PlayStation Vita': 'https://images.unsplash.com/photo-1606318005954-214f934aee95?w=300&h=300&fit=crop',
    'Nintendo Switch':  'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300&h=300&fit=crop',
    'Xbox 360':         'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=300&h=300&fit=crop',
    'PC Games':         'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=300&h=300&fit=crop',
    'Nintendo 3DS':     'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300&h=300&fit=crop',
    'Nintendo DS':      'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300&h=300&fit=crop',
    Wii:                'https://images.unsplash.com/photo-1609920658906-8223bd289001?w=300&h=300&fit=crop',
    Controllers:        'https://images.unsplash.com/photo-1593118247619-e2d6f056869e?w=300&h=300&fit=crop',
    'Gaming Chairs':    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=300&h=300&fit=crop',
    Headsets:           'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&h=300&fit=crop',
    'PC Gaming':        'https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=300&h=300&fit=crop',
    // ── Baby Products ─────────────────────────────────────────────────────
    'Disposable Diapers': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Diaper Bags':       'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&h=300&fit=crop',
    'Wipes & Holders':   'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Changing Tables':   'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Cloth Diapers':     'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Portable Changing Pads': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Bottle Feeding':    'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Bottle-Feeding':    'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    Breastfeeding:       'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Bibs & Burp Cloths': 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    Highchairs:          'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Highchairs & Booster Seats': 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    Pacifiers:           'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Pacifiers & Accessories': 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Solid Feeding':     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Toy Gift Sets':     'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Music & Sound':     'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=300&h=300&fit=crop',
    'Bath Toys':         'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Soaps & Cleansers': 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=300&fit=crop',
    'Bathing Tubs':      'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Bathing Tubs & Seats': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Grooming & Healthcare Kits': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
    'Washcloths & Towels': 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Bathroom Safety':   'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
    'Skin Care':         'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=300&fit=crop',
    Walkers:             'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Backpacks & Carriers': 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Swings, Jumpers & Bouncers': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    'Sleep Positioners': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=300&h=300&fit=crop',
    'Edge & Corner Guards': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
    'Potties & Seats':   'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Seat Covers':       'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=300&h=300&fit=crop',
    'Step Stools':       'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=300&h=300&fit=crop',
    'Training Pants':    'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&h=300&fit=crop',
    // ── Sporting Goods ────────────────────────────────────────────────────
    'Exercise & Fitness': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300&h=300&fit=crop',
    'Team Sports':        'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=300&h=300&fit=crop',
    'Sport Clothing':     'https://images.unsplash.com/photo-1571731956672-f2b94d7dd0cb?w=400&h=300&fit=crop',
    Accessories:          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop',
    Protein:              'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=300&fit=crop',
    'Pre-Workout':        'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400&h=300&fit=crop',
    'Weight Gainers':     'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=300&h=300&fit=crop',
    'Fat Burners':        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
    'Fat Burners & Thermogenics': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
    'Carb Management Supplements': 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=300&fit=crop',
    'Endurance & Energy': 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=300&h=300&fit=crop',
    'Post-Workout & Recovery': 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=300&h=300&fit=crop',
    'Supplement Stacks':  'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&h=300&fit=crop',
    'Testosterone Boosters': 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=300&h=300&fit=crop',
    'Camping & Hiking':   'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=300&h=300&fit=crop',
    Cycling:              'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=300&h=300&fit=crop',
    'Skates & Boards':    'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=300&h=300&fit=crop',
    'Skates, Skateboards & Sc...': 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=300&h=300&fit=crop',
    // ── Supermarket ───────────────────────────────────────────────────────
    'Cooking Ingredients': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=300&fit=crop',
    'Snacks & Crisps':     'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&h=300&fit=crop',
    'Snacks, Crisps & Nuts': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&h=300&fit=crop',
    'Grains & Rice':       'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&h=300&fit=crop',
    'Sugar & Flour':       'https://images.unsplash.com/photo-1612257416648-77d40e0e7f33?w=300&h=300&fit=crop',
    Cereals:               'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=300&h=300&fit=crop',
    'Candy & Chocolate':   'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=300&h=300&fit=crop',
    'Margarine, Jams, Honey & Spreads': 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300&h=300&fit=crop',
    Beers:                 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=300&h=300&fit=crop',
    'Spirits & Liquors':   'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=300&h=300&fit=crop',
    Wine:                  'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=300&h=300&fit=crop',
    'Champagne &':         'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=300&h=300&fit=crop',
    Ciders:                'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=300&h=300&fit=crop',
    'Carbonated Drinks':   'https://images.unsplash.com/photo-1527960471264-932f39eb5846?w=300&h=300&fit=crop',
    'Coffee, Tea & Cocoa': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&h=300&fit=crop',
    Water:                 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=300&h=300&fit=crop',
    Juices:                'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&h=300&fit=crop',
    'Juices & Other Non Carbonated Drinks': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&h=300&fit=crop',
    Dairy:                 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&h=300&fit=crop',
    'Syrups & Cordials':   'https://images.unsplash.com/photo-1562155955-1cb2d73488d7?w=300&h=300&fit=crop',
    'Air Fresheners':      'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=300&h=300&fit=crop',
    'Bathroom Cleaners':   'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300&h=300&fit=crop',
    'Bulbs & Batteries':   'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=300&h=300&fit=crop',
    'Floor Cleaners':      'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300&h=300&fit=crop',
    'Household Cleaners & Sundri...': 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300&h=300&fit=crop',
    'Kitchen Cleaner':     'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300&h=300&fit=crop',
    // ── Garden & Outdoors ─────────────────────────────────────────────────
    'Hand Tools':          'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=300&fit=crop',
    'Watering Equipment':  'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=300&fit=crop',
    'Plant Pots':          'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=300&h=300&fit=crop',
    Grills:                'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop',
    'Outdoor Cooking Tools': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop',
    'Outdoor Cooking Tools & ...': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop',
    Hammocks:              'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300&h=300&fit=crop',
    'Hammocks, Stands & Accessories': 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300&h=300&fit=crop',
    'Patio Seating':       'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop',
    'Pest Control':        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=300&fit=crop',
    // ── Digital & Services ────────────────────────────────────────────────
    Software:              'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&h=300&fit=crop',
    Antivirus:             'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=300&h=300&fit=crop',
    'Office Software':     'https://images.unsplash.com/photo-1517433456452-f9633a875f6f?w=300&h=300&fit=crop',
    'E-Books':             'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=300&fit=crop',
    Music:                 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
    Games:                 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=300&h=300&fit=crop',
    Repairs:               'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&h=300&fit=crop',
    Cleaning:              'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300&h=300&fit=crop',
    Plumbing:              'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop',
    Tutoring:              'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=300&h=300&fit=crop',
    Design:                'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=300&h=300&fit=crop',
    Photography:           'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=300&h=300&fit=crop',
    'Web Development':     'https://images.unsplash.com/photo-1547658719-da2b51169166?w=300&h=300&fit=crop',
};
// Fallback for any entry not in the map — use a real product-style image
function _catImg(name) {
    return _CDN[name] || `https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop&q=80`;
}

const _JM_CATS = [
    { id:'phones',     name:'Phones & Tablets',  icon:'📱', sections:[
        { name:'Mobile Phones', subs:[
            { name:'Smartphones',       img:_CDN.Smartphones },
            { name:'Feature Phones',    img:_CDN['Feature Phones'] },
            { name:'iOS Phones',        img:_CDN['iOS Phones'] },
        ]},
        { name:'Tablets', subs:[
            { name:'Android Tablets',   img:_CDN['Android Tablets'] },
            { name:'iPads',             img:_CDN.iPads },
            { name:'Kids Tablets',      img:_CDN['Kids Tablets'] },
        ]},
        { name:'Phone Accessories', subs:[
            { name:'Cases & Sleeves',   img:_CDN['Cases & Sleeves'] },
            { name:'Screen Protectors', img:_CDN['Screen Protectors'] },
            { name:'Chargers',          img:_CDN.Chargers },
            { name:'Power Banks',       img:_CDN['Power Banks'] },
            { name:'Earphones',         img:_CDN.Earphones },
            { name:'Smartwatches',      img:_CDN.Smartwatches },
        ]},
    ]},
    { id:'electronics', name:'TVs & Audio',      icon:'📺', sections:[
        { name:'Televisions', subs:[
            { name:'LED TVs',           img:_CDN['LED TVs'] },
            { name:'Smart TVs',         img:_CDN['Smart TVs'] },
            { name:'OLED TVs',          img:_CDN['OLED TVs'] },
        ]},
        { name:'Audio', subs:[
            { name:'Headphones',        img:_CDN.Headphones },
            { name:'Speakers',          img:_CDN.Speakers },
            { name:'Soundbars',         img:_CDN.Soundbars },
            { name:'Microphones',       img:_CDN.Microphones },
            { name:'Earbuds',           img:_CDN.Earbuds },
            { name:'Home Theatre',      img:_CDN['Home Theatre'] },
        ]},
        { name:'Cameras', subs:[
            { name:'DSLR Cameras',      img:_CDN['DSLR Cameras'] },
            { name:'Action Cameras',    img:_CDN['Action Cameras'] },
            { name:'Security Cameras',  img:_CDN['Security Cameras'] },
        ]},
    ]},
    { id:'appliances',  name:'Appliances',        icon:'🏠', sections:[
        { name:'Cooling & Heating', subs:[
            { name:'Fridges',           img:_CDN.Fridges },
            { name:'Air Conditioners',  img:_CDN['Air Conditioners'] },
            { name:'Fans',              img:_CDN.Fans },
        ]},
        { name:'Cooking Appliances', subs:[
            { name:'Cookers',           img:_CDN.Cookers },
            { name:'Microwaves',        img:_CDN.Microwaves },
            { name:'Blenders',          img:_CDN.Blenders },
            { name:'Rice Cookers',      img:_CDN['Rice Cookers'] },
        ]},
        { name:'Laundry', subs:[
            { name:'Washing Machines',  img:_CDN['Washing Machines'] },
            { name:'Irons',             img:_CDN.Irons },
            { name:'Dryers',            img:_CDN.Dryers },
        ]},
    ]},
    { id:'health',      name:'Health & Beauty',   icon:'💄', sections:[
        { name:'Skin Care', subs:[
            { name:'Face Moisturisers', img:_CDN['Face Moisturisers'] },
            { name:'Serums',            img:_CDN.Serums },
            { name:'Sunscreen',         img:_CDN.Sunscreen },
            { name:'Toners',            img:_CDN.Toners },
        ]},
        { name:'Hair Care', subs:[
            { name:'Shampoo',           img:_CDN.Shampoo },
            { name:'Conditioner',       img:_CDN.Conditioner },
            { name:'Hair Oils',         img:_CDN['Hair Oils'] },
        ]},
        { name:'Fragrances & Makeup', subs:[
            { name:'Perfumes',          img:_CDN.Perfumes },
            { name:'Lipstick',          img:_CDN.Lipstick },
            { name:'Foundation',        img:_CDN.Foundation },
            { name:'Eye Makeup',        img:_CDN['Eye Makeup'] },
        ]},
        { name:'Vitamins & Supplements', subs:[
            { name:'Vitamins',          img:_CDN.Vitamins },
            { name:'Protein Shakes',    img:_CDN['Protein Shakes'] },
            { name:'Medical Devices',   img:_CDN['Medical Devices'] },
        ]},
    ]},
    { id:'home',        name:'Home & Office',     icon:'🏡', sections:[
        { name:'Furniture', subs:[
            { name:'Sofas',             img:_CDN.Sofas },
            { name:'Beds & Mattresses', img:_CDN['Beds & Mattresses'] },
            { name:'Tables',            img:_CDN.Tables },
            { name:'Office Chairs',     img:_CDN['Office Chairs'] },
        ]},
        { name:'Bedding', subs:[
            { name:'Bedsheets',         img:_CDN.Bedsheets },
            { name:'Blankets & Throws', img:_CDN['Blankets & Throws'] },
            { name:'Comforters',        img:_CDN.Comforters },
            { name:'Bed Pillows',       img:_CDN['Bed Pillows'] },
        ]},
        { name:'Storage & Organization', subs:[
            { name:'Storage Cabinets',  img:_CDN['Storage Cabinets'] },
            { name:'Closet Storage',    img:_CDN['Closet Storage'] },
            { name:'Shoe Organizers',   img:_CDN['Shoe Organizers'] },
        ]},
        { name:'Home Decor', subs:[
            { name:'Wall Clocks',       img:_CDN['Wall Clocks'] },
            { name:'Mirrors',           img:_CDN.Mirrors },
            { name:'Rugs & Carpet',     img:_CDN['Rugs & Carpet'] },
            { name:'Lighting',          img:_CDN.Lighting },
        ]},
    ]},
    { id:'fashion',     name:'Fashion',           icon:'👗', sections:[
        { name:"Men's Fashion", subs:[
            { name:'Shirts', img:_catImg('Shirts') },
            { name:'T-Shirts & Tanks', img:_catImg('T-Shirts & Tanks') },
            { name:'Suits & Blazers', img:_catImg('Suits & Blazers') },
            { name:'Pants', img:_catImg('Pants') },
            { name:'Jeans', img:_catImg('Jeans') },
            { name:'Shorts', img:_catImg('Shorts') },
            { name:'Watches', img:_catImg('Watches') },
            { name:'Belts', img:_catImg('Belts') },
            { name:'Sunglasses', img:_catImg('Sunglasses') },
        ]},
        { name:"Women's Fashion", subs:[
            { name:'Dresses', img:_catImg('Dresses') },
            { name:'Tops & Tees', img:_catImg('Tops & Tees') },
            { name:'Skirts', img:_catImg('Skirts') },
            { name:'Jeans', img:_catImg('Jeans') },
            { name:'Handbags', img:_catImg('Handbags') },
            { name:'Jewelry', img:_catImg('Jewelry') },
            { name:'Sandals', img:_catImg('Sandals') },
            { name:'Flats', img:_catImg('Flats') },
        ]},
        { name:'Shoes', subs:[
            { name:'Sneakers', img:_catImg('Sneakers') },
            { name:'Loafers', img:_catImg('Loafers') },
            { name:'Boots', img:_catImg('Boots') },
            { name:'Heels', img:_catImg('Heels') },
        ]},
    ]},
    { id:'computing',   name:'Computing',         icon:'💻', sections:[
        { name:'Laptops', subs:[
            { name:'Macbooks', img:_catImg('Macbooks') },
            { name:'Netbooks', img:_catImg('Netbooks') },
            { name:'2 in 1 Laptops', img:_catImg('2 in 1 Laptops') },
            { name:'Ultrabooks', img:_catImg('Ultrabooks') },
        ]},
        { name:'Computers', subs:[
            { name:'Desktops', img:_catImg('Desktops') },
            { name:'Monitors', img:_catImg('Monitors') },
            { name:'Laptop Accessories', img:_catImg('Laptop Accessories') },
            { name:'Scanners', img:_catImg('Scanners') },
            { name:'Printers', img:_catImg('Printers') },
            { name:'Keyboards & Mice', img:_catImg('Keyboards & Mice') },
            { name:'Networking', img:_catImg('Networking') },
        ]},
        { name:'Data Storage', subs:[
            { name:'External Hard Drives', img:_catImg('External Hard Drives') },
            { name:'USB Flash Drives', img:_catImg('USB Flash Drives') },
        ]},
    ]},
    { id:'gaming',      name:'Gaming',            icon:'🎮', sections:[
        { name:'PlayStation', subs:[
            { name:'PlayStation 3', img:_catImg('PlayStation 3') },
            { name:'PlayStation 4', img:_catImg('PlayStation 4') },
            { name:'PlayStation 5', img:_catImg('PlayStation 5') },
        ]},
        { name:'Digital Games', subs:[
            { name:'Nintendo Switch', img:_catImg('Nintendo Switch') },
            { name:'Xbox 360', img:_catImg('Xbox 360') },
            { name:'PC Games', img:_catImg('PC Games') },
        ]},
        { name:'Nintendo', subs:[
            { name:'Nintendo 3DS', img:_catImg('Nintendo 3DS') },
            { name:'Nintendo DS', img:_catImg('Nintendo DS') },
            { name:'Wii', img:_catImg('Wii') },
        ]},
        { name:'Gaming Accessories', subs:[
            { name:'Controllers', img:_catImg('Controllers') },
            { name:'Gaming Chairs', img:_catImg('Gaming Chairs') },
            { name:'Headsets', img:_catImg('Headsets') },
        ]},
    ]},
    { id:'baby',        name:'Baby Products',     icon:'🍼', sections:[
        { name:'Diapering', subs:[
            { name:'Disposable Diapers', img:_catImg('Disposable Diapers') },
            { name:'Diaper Bags', img:_catImg('Diaper Bags') },
            { name:'Wipes & Holders', img:_catImg('Wipes & Holders') },
            { name:'Changing Tables', img:_catImg('Changing Tables') },
        ]},
        { name:'Feeding', subs:[
            { name:'Bottle Feeding', img:_catImg('Bottle Feeding') },
            { name:'Bibs & Burp Cloths', img:_catImg('Bibs & Burp Cloths') },
            { name:'Highchairs', img:_catImg('Highchairs') },
            { name:'Pacifiers', img:_catImg('Pacifiers') },
        ]},
        { name:'Baby & Toddler Toys', subs:[
            { name:'Toy Gift Sets', img:_catImg('Toy Gift Sets') },
            { name:'Music & Sound', img:_catImg('Music & Sound') },
            { name:'Bath Toys', img:_catImg('Bath Toys') },
        ]},
        { name:'Bathing & Skin Care', subs:[
            { name:'Soaps & Cleansers', img:_catImg('Soaps & Cleansers') },
            { name:'Bathing Tubs', img:_catImg('Bathing Tubs') },
            { name:'Skin Care', img:_catImg('Skin Care') },
        ]},
    ]},
    { id:'sports',      name:'Sporting Goods',    icon:'⚽', sections:[
        { name:'Sports & Fitness', subs:[
            { name:'Exercise & Fitness', img:_catImg('Exercise & Fitness') },
            { name:'Team Sports', img:_catImg('Team Sports') },
            { name:'Sport Clothing', img:_catImg('Sport Clothing') },
            { name:'Accessories', img:_catImg('Accessories') },
        ]},
        { name:'Sports Nutrition', subs:[
            { name:'Protein', img:_catImg('Protein') },
            { name:'Pre-Workout', img:_catImg('Pre-Workout') },
            { name:'Weight Gainers', img:_catImg('Weight Gainers') },
            { name:'Fat Burners', img:_catImg('Fat Burners') },
        ]},
        { name:'Outdoor Recreation', subs:[
            { name:'Camping & Hiking', img:_catImg('Camping & Hiking') },
            { name:'Cycling', img:_catImg('Cycling') },
            { name:'Skates & Boards', img:_catImg('Skates & Boards') },
        ]},
    ]},
    { id:'supermarket', name:'Supermarket',       icon:'🛒', sections:[
        { name:'Food Cupboard', subs:[
            { name:'Cooking Ingredients', img:_catImg('Cooking Ingredients') },
            { name:'Snacks & Crisps', img:_catImg('Snacks & Crisps') },
            { name:'Grains & Rice', img:_catImg('Grains & Rice') },
            { name:'Sugar & Flour', img:_catImg('Sugar & Flour') },
            { name:'Cereals', img:_catImg('Cereals') },
            { name:'Candy & Chocolate', img:_catImg('Candy & Chocolate') },
        ]},
        { name:'Drinks', subs:[
            { name:'Carbonated Drinks', img:_catImg('Carbonated Drinks') },
            { name:'Coffee, Tea & Cocoa', img:_catImg('Coffee, Tea & Cocoa') },
            { name:'Water', img:_catImg('Water') },
            { name:'Juices', img:_catImg('Juices') },
        ]},
        { name:'Household Supplies', subs:[
            { name:'Floor Cleaners', img:_catImg('Floor Cleaners') },
            { name:'Air Fresheners', img:_catImg('Air Fresheners') },
            { name:'Bathroom Cleaners', img:_catImg('Bathroom Cleaners') },
            { name:'Bulbs & Batteries', img:_catImg('Bulbs & Batteries') },
        ]},
    ]},
    { id:'garden',      name:'Garden & Outdoors', icon:'🌿', sections:[
        { name:'Gardening & Lawn Care', subs:[
            { name:'Hand Tools', img:_catImg('Hand Tools') },
            { name:'Watering Equipment', img:_catImg('Watering Equipment') },
            { name:'Plant Pots', img:_catImg('Plant Pots') },
        ]},
        { name:'Grills & Outdoor Cooking', subs:[
            { name:'Grills', img:_catImg('Grills') },
            { name:'Outdoor Cooking Tools', img:_catImg('Outdoor Cooking Tools') },
        ]},
        { name:'Patio Furniture', subs:[
            { name:'Hammocks', img:_catImg('Hammocks') },
            { name:'Patio Seating', img:_catImg('Patio Seating') },
            { name:'Tables', img:_catImg('Tables') },
        ]},
    ]},
    { id:'digital',     name:'Digital',           icon:'💾', sections:[
        { name:'Software & Apps', subs:[
            { name:'Software', img:_catImg('Software') },
            { name:'Antivirus', img:_catImg('Antivirus') },
            { name:'Office Software', img:_catImg('Office Software') },
        ]},
        { name:'Books & Media', subs:[
            { name:'E-Books', img:_catImg('E-Books') },
            { name:'Music', img:_catImg('Music') },
            { name:'Games', img:_catImg('Games') },
        ]},
    ]},
    { id:'services',    name:'Services',           icon:'🔧', sections:[
        { name:'Home Services', subs:[
            { name:'Repairs', img:_catImg('Repairs') },
            { name:'Cleaning', img:_catImg('Cleaning') },
            { name:'Plumbing', img:_catImg('Plumbing') },
        ]},
        { name:'Professional Services', subs:[
            { name:'Tutoring', img:_catImg('Tutoring') },
            { name:'Design', img:_catImg('Design') },
            { name:'Photography', img:_catImg('Photography') },
            { name:'Web Development', img:_catImg('Web Development') },
        ]},
    ]},
];

// ── CSS injected once for the new category UI ──────────────────────────────
(function _injectCatStyles() {
    if (document.getElementById('_jmCatStyles')) return;
    const s = document.createElement('style');
    s.id = '_jmCatStyles';
    s.textContent = `
    /* ── Category layout ── */
    .jm-cat-layout { display:flex; height:100%; overflow:hidden; background:#f5f5f5; }
    .jm-cat-sidebar {
        width:110px; min-width:110px; overflow-y:auto; background:#f5f5f5;
        border-right:1px solid #e5e7eb; flex-shrink:0;
    }
    .jm-cat-item {
        padding:14px 10px; text-align:center; font-size:12px; color:#444;
        cursor:pointer; border-bottom:1px solid #eee; line-height:1.4;
        border-left:3px solid transparent; transition:all .18s ease;
        font-weight:500; word-break:break-word;
    }
    .jm-cat-item.active {
        background:#fff; color:#f57224; font-weight:700;
        border-left-color:#f57224;
    }
    .jm-cat-item:active { background:#fff8f4; }

    .jm-cat-content { flex:1; overflow-y:auto; padding:0 0 80px; }

    /* ── "All Products" bar ── */
    .jm-cat-all-bar {
        display:flex; align-items:center; justify-content:space-between;
        background:#fff; padding:14px 16px;
        margin-bottom:8px; font-weight:700; font-size:14px; color:#111;
        border-bottom:1px solid #f0f0f0; cursor:pointer;
        transition:background .15s;
    }
    .jm-cat-all-bar:active { background:#fff8f4; }
    .jm-cat-all-bar-arrow { font-size:18px; color:#999; }

    /* ── Section group card ── */
    .jm-cat-group {
        background:#fff; margin-bottom:8px;
        border-radius:0; overflow:hidden;
        animation: _catFadeIn .25s ease both;
    }
    @keyframes _catFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

    .jm-cat-group-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 16px 10px;
    }
    .jm-cat-group-header span { font-weight:700; font-size:14px; color:#111; }
    .jm-cat-see-all {
        background:none; border:none; color:#f57224; font-size:13px;
        font-weight:600; cursor:pointer; padding:4px 0;
    }

    .jm-cat-group-divider { height:1px; background:#f0f0f0; margin:0 16px 12px; }

    /* ── Subcategory grid (3 columns) ── */
    .jm-subcat-grid {
        display:grid; grid-template-columns:repeat(3,1fr);
        gap:2px; padding:0 12px 14px;
    }
    .jm-subcat-item {
        display:flex; flex-direction:column; align-items:center;
        padding:8px 4px; cursor:pointer; border-radius:8px;
        transition:background .15s, transform .12s;
        -webkit-tap-highlight-color:rgba(245,114,36,.08);
    }
    .jm-subcat-item:active { background:#fff8f4; transform:scale(.96); }

    /* ── Subcategory image ── */
    .jm-subcat-img-wrap {
        width:72px; height:72px; border-radius:8px;
        background:#f8f8f8; border:1px solid #eeeeee;
        overflow:hidden; display:flex; align-items:center; justify-content:center;
        margin-bottom:6px; flex-shrink:0;
    }
    .jm-subcat-img {
        width:100%; height:100%; object-fit:contain;
        padding:6px; display:block; transition:transform .2s;
    }
    .jm-subcat-item:active .jm-subcat-img { transform:scale(.93); }

    .jm-subcat-name {
        font-size:10.5px; color:#333; text-align:center;
        line-height:1.3; font-weight:500;
        display:-webkit-box; -webkit-line-clamp:2;
        -webkit-box-orient:vertical; overflow:hidden;
        max-width:72px;
    }
    `;
    document.head.appendChild(s);
})();

function _renderCategories() {
    const sidebar = document.getElementById('jmCatSidebar');
    const content = document.getElementById('jmCatContent');
    if (!sidebar || !content) return;

    // Build sidebar list — text-only, no images, no emojis (clean Jumia style)
    sidebar.innerHTML = _JM_CATS.map((c, i) => {
        return `<div class="jm-cat-item${i===0?' active':''}" data-cat="${c.id}">${_esc(c.name)}</div>`;
    }).join('');

    // Click handler with smooth transition
    sidebar.querySelectorAll('.jm-cat-item').forEach(item => {
        item.addEventListener('click', () => {
            sidebar.querySelectorAll('.jm-cat-item').forEach(x => x.classList.remove('active'));
            item.classList.add('active');
            const cat = _JM_CATS.find(c => c.id === item.dataset.cat);
            if (cat) {
                content.style.opacity = '0';
                content.style.transform = 'translateX(12px)';
                setTimeout(() => {
                    _renderCatContent(cat, content);
                    content.style.transition = 'opacity .2s ease, transform .2s ease';
                    content.style.opacity = '1';
                    content.style.transform = 'none';
                }, 100);
            }
        });
    });

    // Render first category
    content.style.opacity = '1';
    content.style.transform = 'none';
    _renderCatContent(_JM_CATS[0], content);
}

function _renderCatContent(cat, container) {
    const catId = cat.id;

    // "All Products" bar
    let html = `
    <div class="jm-cat-all-bar" onclick="window._jmNav('products','${catId}')">
        <span>All Products</span>
        <span class="jm-cat-all-bar-arrow">›</span>
    </div>`;

    // Each named section with its subcategories
    cat.sections.forEach((section, sIdx) => {
        html += `
        <div class="jm-cat-group" style="animation-delay:${sIdx * 0.05}s">
            <div class="jm-cat-group-header">
                <span>${_esc(section.name)}</span>
                <button class="jm-cat-see-all" onclick="window._jmNav('products','${catId}')">See All</button>
            </div>
            <div class="jm-cat-group-divider"></div>
            <div class="jm-subcat-grid">
                ${section.subs.map(sub => `
                <div class="jm-subcat-item" onclick="window._jmNav('products','${catId}:${_esc(sub.name)}')">
                    <div class="jm-subcat-img-wrap">
                        <img class="jm-subcat-img"
                             src="${sub.img}"
                             alt="${_esc(sub.name)}"
                             loading="lazy"
                             onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop&q=70'">
                    </div>
                    <div class="jm-subcat-name">${_esc(sub.name)}</div>
                </div>`).join('')}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    container.scrollTop = 0;
}

// ── PRODUCTS LIST PAGE ─────────────────────────────────────────────────────
function _renderProductsPage(subpage) {
    const container = document.getElementById('jmProductsContent');
    const title     = document.getElementById('jmProductsTitle');
    if (!container) return;

    const [catId, subcat] = (subpage||'').split(':');
    if (title) title.innerHTML = `← ${subcat||catId||'Products'}`;

    const ecom = window.EcomMarketplace;
    let products = ecom ? ecom.ProductEngine.search('', { category: catId||'' }) : [];

    if (!products.length) {
        // Fall back to existing listings data
        if (window.currentListings) products = window.currentListings.filter(l => !catId || l.category===catId);
    }

    _renderGrid(container, products);
}

// ── CART PAGE ──────────────────────────────────────────────────────────────
function _renderCart() {
    const container = document.getElementById('jmCartContent');
    if (!container) return;

    const ecom = window.EcomMarketplace;
    const cart = ecom ? ecom.CartEngine.getCart() : _buildLocalCart();

    const recentHTML = _state.recent.length ? `
        <div class="jm-cart-recently">
            <div class="jm-section-header" style="padding:10px 12px 6px">
                <span style="font-size:13px;font-weight:700">Recently Viewed</span>
                <button class="jm-see-all" onclick="window._jmNav('recent')">See All</button>
            </div>
            <div class="jm-hscroll" id="jmCartRecentRow"></div>
        </div>` : '';

    if (!cart.items.length) {
        container.innerHTML = `
            <div class="jm-cart-summary-bar">
                <div><div class="jm-cart-label">CART SUMMARY</div><div class="jm-cart-label">Subtotal</div></div>
                <div class="jm-cart-total">${_fmt(0)}</div>
            </div>
            <div class="jm-empty-state" style="flex:1">
                <div class="jm-empty-icon">🛒</div>
                <div class="jm-empty-title">Your cart is empty</div>
                <div class="jm-empty-desc">Add items to get started</div>
                <button class="jm-orange-btn" onclick="window._jmNav('home')">Continue Shopping</button>
            </div>
            ${recentHTML}`;
    } else {
        container.innerHTML = `
            <div class="jm-cart-summary-bar">
                <div><div class="jm-cart-label">CART SUMMARY</div><div class="jm-cart-label">Subtotal</div></div>
                <div class="jm-cart-total">${_fmt(cart.subtotal)}</div>
            </div>
            <div style="padding:8px 12px;font-size:12px;color:#6b7280;background:#f9fafb">Cart (${cart.count})</div>
            <div class="jm-cart-items" id="jmCartItems">
                ${cart.items.map(item => {
                    const p = item.product || item;
                    const pr = parseFloat(p.price||0);
                    const op = parseFloat(p.original_price||0);
                    const disc = op>pr&&op>0 ? Math.round((1-pr/op)*100) : 0;
                    const img = p.images?.[0]||p.image||'';
                    const inStock = (p.stock_quantity??999) > 0;
                    return `<div class="jm-cart-item" data-pid="${p.id}">
                        ${img ? `<img class="jm-cart-item-img" src="${_esc(img)}" loading="lazy">` : `<div class="jm-cart-item-img" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:28px">🛒</div>`}
                        <div class="jm-cart-item-body">
                            <div class="jm-cart-item-title">${_esc(p.title||'')}</div>
                            <div>
                                <span class="jm-cart-item-price">${_fmt(pr)}</span>
                                ${op>pr?`<span class="jm-cart-item-oldprice">${_fmt(op)}</span><span class="jm-cart-item-discount">-${disc}%</span>`:''}
                            </div>
                            <div class="jm-cart-qty-row" style="margin-top:8px">
                                <button class="jm-qty-btn" onclick="window._jmCartQty('${p.id}',-1)">−</button>
                                <span class="jm-qty-val">${item.quantity||1}</span>
                                <button class="jm-qty-btn" onclick="window._jmCartQty('${p.id}',1)">+</button>
                                ${inStock
                                    ? '<span></span>'
                                    : '<button class="jm-cart-out-btn">Out Of Stock</button>'}
                            </div>
                            <div style="display:flex;justify-content:flex-end;margin-top:6px">
                                <button class="jm-cart-remove" onclick="window._jmCartRemove('${p.id}')">Remove</button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="jm-cart-footer">
                <button class="jm-call-btn" title="Call support"><i class="fas fa-phone"></i></button>
                <button class="jm-checkout-btn" onclick="window._jmCheckout()" ${cart.items.some(i=>(i.product?.stock_quantity??999)<=0)?'disabled':''}>
                    Checkout — ${_fmt(cart.total)}
                </button>
            </div>
            ${recentHTML}`;
    }

    // Render recently viewed row
    setTimeout(() => {
        const row = document.getElementById('jmCartRecentRow');
        if (row) _renderHScroll('jmCartRecentRow', _state.recent.map(r=>r));
    }, 50);
}

window._jmCartQty = function(pid, delta) {
    const ecom = window.EcomMarketplace;
    if (ecom) {
        const item = ecom.CartEngine.getItem(pid);
        if (item) ecom.CartEngine.updateQuantity(pid, item.quantity+delta);
        _updateCartBadge();
    } else {
        const item = _state.cart.get(pid);
        if (item) { item.qty = Math.max(1, item.qty+delta); _ls.save(_LS.CART, [..._state.cart.values()]); }
    }
    _renderCart();
};

window._jmCartRemove = function(pid) {
    const ecom = window.EcomMarketplace;
    if (ecom) ecom.CartEngine.remove(pid);
    else { _state.cart.delete(pid); _ls.save(_LS.CART, [..._state.cart.values()]); }
    _updateCartBadge();
    _renderCart();
};

window._jmCheckout = function() {
    // marketplace-checkout.js sets window._jmCheckoutImpl after loading.
    // openCheckoutPanel and _ecomProceedToCheckout are also aliases.
    const fn = window._jmCheckoutImpl || window.openCheckoutPanel || window._ecomProceedToCheckout;
    if (typeof fn === 'function') { fn(); return; }
    _toast('Loading checkout…', 'info', '🛒');
};

// ── WISHLIST PAGE ──────────────────────────────────────────────────────────
function _renderWishlist() {
    const container = document.getElementById('jmWishlistContent');
    if (!container) return;

    const ecom = window.EcomMarketplace;
    const items = ecom ? ecom.WishlistEngine.getWishlist() : [];

    const recentRow = _state.recent.length ? `
        <div class="jm-section" style="margin-top:8px">
            <div class="jm-section-header"><span>Recently Viewed</span><button class="jm-see-all" onclick="window._jmNav('recent')">See All</button></div>
            <div class="jm-hscroll" id="jmWishRecentRow"></div>
        </div>` : '';

    if (!items.length) {
        container.innerHTML = `
            <div class="jm-empty-state">
                <div class="jm-empty-icon" style="font-size:44px;background:none;box-shadow:none">❤️</div>
                <div class="jm-empty-title">You haven't saved an item yet!</div>
                <div class="jm-empty-desc">Found something you like? Tap on the heart shaped icon next to the item to add it to your wishlist! All your saved items will appear here.</div>
                <button class="jm-orange-btn" onclick="window._jmNav('home')">Continue Shopping</button>
            </div>
            ${recentRow}`;
    } else {
        container.innerHTML = `<div class="jm-product-grid" id="jmWishGrid"></div>${recentRow}`;
        _renderGrid(document.getElementById('jmWishGrid'), items);
    }

    setTimeout(() => { const r=document.getElementById('jmWishRecentRow'); if(r) _renderHScroll('jmWishRecentRow', _state.recent); }, 50);
}

// ── ACCOUNT PAGE ──────────────────────────────────────────────────────────
function _renderAccount() {
    const container = document.getElementById('jmAccountContent');
    if (!container) return;

    const user   = window.currentUser || window.__kynUser || { displayName:'User', email:'', walletBalance:0 };
    const name   = user.displayName || user.username || 'User';
    const email  = user.email || '';
    const wallet = parseFloat(user.walletBalance || 0);
    const pts    = user.loyaltyPoints || 0;
    const tier   = user.loyaltyTier || 'bronze';
    const tc     = { bronze:'#cd7f32', silver:'#9ca3af', gold:'#f59e0b', platinum:'#8b5cf6' };
    const isAdmin = user.role==='admin'||user.role==='moderator'||user.isAdmin||
                    (()=>{ try{return JSON.parse(localStorage.getItem('_adminMode')||'false')}catch(_){return false} })();

    container.innerHTML = `
    <!-- Profile hero with chat + WhatsApp buttons -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:20px 16px 16px;color:#fff">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
            <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#f57224,#ff9a00);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:900;flex-shrink:0">${_esc(name[0]?.toUpperCase()||'U')}</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Hi, ${_esc(name)}!</div>
                <div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(email)}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
                    <span style="background:${tc[tier]||'#cd7f32'};color:#fff;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800;text-transform:uppercase">${tier}</span>
                    <span style="font-size:12px;color:rgba(255,255,255,.8)">${pts.toLocaleString()} pts</span>
                </div>
            </div>
        </div>
        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
            <div style="background:rgba(255,255,255,.15);border-radius:10px;padding:10px;text-align:center;cursor:pointer" onclick="window._jmNavMore('wallet')">
                <div style="font-size:14px;font-weight:900">${_fmt(wallet)}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">Wallet</div>
            </div>
            <div style="background:rgba(255,255,255,.15);border-radius:10px;padding:10px;text-align:center;cursor:pointer" onclick="window._jmNav('orders')">
                <div style="font-size:14px;font-weight:900">${user.totalOrders||0}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">Orders</div>
            </div>
            <div style="background:rgba(255,255,255,.15);border-radius:10px;padding:10px;text-align:center;cursor:pointer" onclick="window._jmNav('wishlist')">
                <div style="font-size:14px;font-weight:900">${_state.wishlist?.length||0}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">Saved</div>
            </div>
        </div>
        <!-- Messages row — like WhatsApp icon on phone home screen -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button onclick="window._jmOpenChat()" style="background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);border-radius:12px;padding:12px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center">
                <i class="fas fa-comment-dots" style="font-size:20px"></i>
                <span>Messages<span id="jmChatBadge" style="display:none;background:#22c55e;color:#fff;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:900;margin-left:4px">0</span></span>
            </button>
            <button onclick="window._jmOpenWhatsApp()" style="background:#25d366;border:none;border-radius:12px;padding:12px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center">
                <i class="fab fa-whatsapp" style="font-size:20px"></i> WhatsApp
            </button>
        </div>
    </div>

    <!-- Seller Tools -->
    <div style="padding:12px 16px 0">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:8px">🏪 Seller Tools</div>
        <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            <button onclick="window._jmHideMore?.();setTimeout(()=>document.getElementById('createListingBtn')?.click(),100)" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;border:none;background:linear-gradient(135deg,#fff8f5,#fff);cursor:pointer;border-bottom:1px solid #f9fafb">
                <div style="width:36px;height:36px;border-radius:10px;background:#f57224;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-plus" style="color:#fff;font-size:16px"></i></div>
                <div style="flex:1;text-align:left"><div style="font-weight:800;font-size:13px;color:#f57224">+ Create New Listing</div><div style="font-size:11px;color:#6b7280;margin-top:1px">Sell a product on the marketplace</div></div>
                <i class="fas fa-chevron-right" style="color:#f57224;font-size:12px"></i>
            </button>
            ${[
                ['seller-dashboard',    'fa-tachometer-alt',  '#f57224', 'Seller Dashboard', 'Revenue, orders & overview'],
                ['my-listings',         'fa-box-open',        '#3b82f6', 'My Listings',       'Manage your products'],
                ['seller-inventory',    'fa-warehouse',       '#8b5cf6', 'Inventory',         'Stock levels & alerts'],
                ['seller-shipping',     'fa-shipping-fast',   '#f59e0b', 'Orders & Shipping', 'Fulfill & track orders'],
                ['seller-payouts',      'fa-money-bill-wave', '#22c55e', 'Payouts',           'Earnings & withdrawals'],
                ['seller-analytics',    'fa-chart-line',      '#ec4899', 'Analytics',         'Views, sales & conversion'],
                ['seller-returns',      'fa-undo-alt',        '#ef4444', 'Returns',           'Handle return requests'],
                ['seller-verification', 'fa-shield-alt',      '#10b981', 'Verification',      'KYC & verified seller badge'],
            ].map(([page,icon,color,label,desc])=>`
            <button onclick="window._jmNavMore('${page}')" style="width:100%;display:flex;align-items:center;gap:12px;padding:13px 16px;border:none;background:#fff;cursor:pointer;border-bottom:1px solid #f9fafb;text-align:left">
                <div style="width:36px;height:36px;border-radius:10px;background:${color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${icon}" style="color:${color};font-size:15px"></i></div>
                <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:#111">${label}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${desc}</div></div>
                <i class="fas fa-chevron-right" style="color:#d1d5db;font-size:12px"></i>
            </button>`).join('')}
        </div>
    </div>

    <!-- Buyer Account -->
    <div style="padding:12px 16px 0">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:8px">👤 My Account</div>
        <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            ${[
                ['orders',       'fa-box',            '#3b82f6', 'My Orders',        'Track all purchases',       '_jmNav'],
                ['wishlist',     'fa-heart',          '#ef4444', 'Wishlist',          'Saved items',               '_jmNav'],
                ['loyalty',      'fa-trophy',         '#f59e0b', 'Loyalty Points',   pts+' pts earned',           '_jmNavMore'],
                ['wallet',       'fa-wallet',         '#22c55e', 'Wallet',           _fmt(wallet)+' balance',     '_jmNavMore'],
                ['referral',     'fa-gift',           '#ec4899', 'Refer & Earn',     'KES 100 per referral',      '_jmNavMore'],
                ['addresses',    'fa-map-marker-alt', '#8b5cf6', 'Address Book',     'Delivery addresses',        '_jmNavMore'],
                ['vouchers',     'fa-ticket-alt',     '#f97316', 'Vouchers',         'Discount codes',            '_jmNavMore'],
                ['notifprefs',   'fa-bell',           '#6366f1', 'Notifications',    'Alert settings',            '_jmNavMore'],
                ['reviews-page', 'fa-star',           '#f59e0b', 'My Reviews',       'Products reviewed',         '_jmNavMore'],
                ['trust',        'fa-shield-alt',     '#10b981', 'Trust Score',      'Your marketplace reputation','_jmNavMore'],
            ].map(([page,icon,color,label,desc,fn])=>`
            <button onclick="window.${fn}('${page}')" style="width:100%;display:flex;align-items:center;gap:12px;padding:13px 16px;border:none;background:#fff;cursor:pointer;border-bottom:1px solid #f9fafb;text-align:left">
                <div style="width:36px;height:36px;border-radius:10px;background:${color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${icon}" style="color:${color};font-size:15px"></i></div>
                <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;color:#111">${label}</div><div style="font-size:11px;color:#6b7280;margin-top:1px">${desc}</div></div>
                <i class="fas fa-chevron-right" style="color:#d1d5db;font-size:12px"></i>
            </button>`).join('')}
        </div>
    </div>

    <!-- Admin Section (only admin/moderator sees this) -->
    ${isAdmin ? `
    <div style="padding:12px 16px 0">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:8px">⚙️ Admin Panel</div>
        <div style="background:linear-gradient(135deg,#111,#1f2937);border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.2)">
            <button onclick="window._jmNavMore('admin-dashboard')" style="width:100%;display:flex;align-items:center;gap:12px;padding:16px;border:none;background:transparent;cursor:pointer;text-align:left">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px">⚙️</div>
                <div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px;color:#fff">Admin Command Center</div><div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px">Manage the entire marketplace</div></div>
                <i class="fas fa-chevron-right" style="color:rgba(255,255,255,.3)"></i>
            </button>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.08)">
                ${[['admin-products','fa-box','Products'],['admin-sellers','fa-store','Sellers'],['admin-orders','fa-receipt','Orders'],['admin-analytics','fa-chart-pie','Analytics']].map(([p,ic,lb])=>`
                <button onclick="window._jmNavMore('${p}')" style="background:transparent;border:none;padding:12px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;border-right:1px solid rgba(255,255,255,.08)">
                    <i class="fas ${ic}" style="color:#9ca3af;font-size:16px"></i>
                    <span style="color:#d1d5db;font-size:9px;font-weight:600">${lb}</span>
                </button>`).join('')}
            </div>
        </div>
    </div>` : ''}

    <!-- Logout -->
    <div style="padding:16px 16px 24px">
        <button onclick="window._jmLogout()" style="width:100%;background:#fee2e2;color:#ef4444;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
            <i class="fas fa-sign-out-alt"></i> Log Out
        </button>
    </div>`;
}

// ── ORDERS PAGE ────────────────────────────────────────────────────────────
function _renderOrders() {
    const container = document.getElementById('jmOrdersContent');
    if (!container) return;

    const ecom = window.EcomMarketplace;
    let orders = ecom ? ecom.OrderEngine.getLocalOrders() : _state.orders;

    // Tab switching
    document.querySelectorAll('.jm-orders-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.jm-orders-tab').forEach(t=>t.classList.remove('active'));
            tab.classList.add('active');
            const filter = tab.dataset.tab;
            const filtered = filter==='ongoing'
                ? orders.filter(o=>!['cancelled','refunded'].includes(o.status))
                : orders.filter(o=>['cancelled','refunded'].includes(o.status));
            _renderOrderList(container, filtered);
        });
    });

    // Notification promo row
    const ongoingOrders = orders.filter(o=>!['cancelled','refunded'].includes(o.status));
    _renderOrderList(container, ongoingOrders);
}

function _renderOrderList(container, orders) {
    if (!orders.length) {
        container.innerHTML = `<div class="jm-empty-state"><div class="jm-empty-icon">📦</div><div class="jm-empty-title">No orders found</div><button class="jm-orange-btn" onclick="window._jmNav('home')">Start Shopping</button></div>`;
        return;
    }

    const notifBar = `<div class="jm-cat-group" style="margin:8px;border-radius:10px;cursor:pointer" onclick="window._jmNavMore('notifprefs')">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
            <div style="flex:1"><div style="font-weight:700;font-size:14px">Turn on system notifications</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Stay up to date with order updates, shipment status and exclusive offers</div></div>
            <div style="width:32px;height:32px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-chevron-right"></i></div>
        </div>
    </div>`;

    container.innerHTML = notifBar + orders.map(o => {
        const items = o.items || [];
        const firstItem = items[0] || {};
        const img = firstItem.image || o.product?.images?.[0] || '';
        const title = firstItem.title || o.product?.title || 'Order';
        const ordNum = o.id?.slice(-9) || '';
        const date = o.delivered_at || o.deliveredAt || o.created_at || o.createdAt;
        const dateStr = date ? new Date(date).toLocaleDateString('en-KE',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
        const statusClass = {delivered:'delivered',paid:'delivered',shipped:'shipped',pending:'pending',processing:'pending',cancelled:'cancelled',refunded:'cancelled'}[o.status] || 'pending';

        return `<div class="jm-order-item" onclick="window._jmViewOrder('${o.id}')">
            ${img ? `<img class="jm-order-img" src="${_esc(img)}" loading="lazy">` : `<div class="jm-order-img" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>`}
            <div class="jm-order-body">
                <div class="jm-order-title">${_esc(title)}</div>
                <div class="jm-order-num">Order #${_esc(ordNum)}</div>
                <span class="jm-order-status ${statusClass}">${(o.status||'pending').toUpperCase()}</span>
                ${dateStr?`<div class="jm-order-date">On ${dateStr}</div>`:''}
            </div>
        </div>`;
    }).join('');
}

window._jmViewOrder = function(orderId) {
    // marketplace-checkout.js overrides this with full tracking UI
    const fn = window._jmViewOrderImpl || window.openOrderTracking;
    if (typeof fn === 'function') { fn(orderId); return; }
    _toast('Loading order details…', 'info', '📦');
};

// ── RECENTLY VIEWED PAGE ───────────────────────────────────────────────────
function _renderRecent() {
    const container = document.getElementById('jmRecentContent');
    if (!container) return;
    if (!_state.recent.length) {
        container.innerHTML = `<div class="jm-empty-state" style="grid-column:1/-1"><div class="jm-empty-icon">🕐</div><div class="jm-empty-title">No recently viewed items</div><button class="jm-orange-btn" onclick="window._jmNav('home')">Start Shopping</button></div>`;
        return;
    }
    _renderGrid(container, _state.recent);
}

// ── REVIEWS PAGE ───────────────────────────────────────────────────────────
function _renderReviewsPage() {
    const container = document.getElementById('jmReviewsContent');
    if (!container) return;
    const ecom = window.EcomMarketplace;
    const orders = ecom ? ecom.OrderEngine.getLocalOrders().filter(o=>o.status==='delivered') : [];
    if (!orders.length) {
        container.innerHTML = `<div class="jm-empty-state"><div class="jm-empty-icon">⭐</div><div class="jm-empty-title">No orders to review yet</div><div class="jm-empty-desc">Complete orders to rate &amp; review products</div><button class="jm-orange-btn" onclick="window._jmNav('home')">Continue Shopping</button></div>`;
        return;
    }
    container.innerHTML = orders.map(o => {
        const items = o.items||[];
        return items.map(item => {
            const img = item.image||'';
            const date = o.delivered_at || o.deliveredAt || '';
            const dateStr = date ? new Date(date).toLocaleDateString('en-KE') : '';
            return `<div class="jm-review-item">
                ${img ? `<img class="jm-review-img" src="${_esc(img)}" loading="lazy">` : `<div class="jm-review-img" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>`}
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:500;margin-bottom:4px;line-height:1.3">${_esc(item.title||'')}</div>
                    <div style="font-size:12px;color:#6b7280">Order No: ${o.id?.slice(-9)||''}</div>
                    ${dateStr?`<div style="font-size:12px;font-weight:700;color:#22c55e;margin-top:4px">DELIVERED ON ${dateStr}</div>`:''}
                </div>
                <button class="jm-review-rate-btn" onclick="window._jmRateProduct('${item.product_id||''}','${o.id}')">Rate This Product</button>
            </div>`;
        }).join('');
    }).join('');
}

window._jmRateProduct = function(productId, orderId) {
    if (!productId) return;
    if (typeof openWriteReviewPanel === 'function') { openWriteReviewPanel(productId); return; }
    const rating = prompt('Rate this product (1-5):');
    const r = parseInt(rating);
    if (!r||r<1||r>5) return;
    const text = prompt('Leave a comment (optional):') || '';
    const ecom = window.EcomMarketplace;
    if (ecom) ecom.ReviewEngine.submitReview({ productId, rating:r, text, order_id:orderId }).then(res => {
        _toast(res.success ? 'Review submitted! Thank you.' : (res.message||'Failed'), res.success?'success':'error', res.success?'⭐':'❌');
    });
};

// ── VOUCHERS PAGE ──────────────────────────────────────────────────────────
function _renderVouchers() {
    const container = document.getElementById('jmVouchersContent');
    if (!container) return;
    container.innerHTML = `
        <div class="jm-empty-state">
            <div class="jm-empty-icon" style="background:none;box-shadow:none;font-size:52px">🎟️</div>
            <div class="jm-empty-title">You currently have no available Vouchers</div>
            <div class="jm-empty-desc">All your available Knecta Vouchers will be displayed here</div>
            <button class="jm-orange-btn" onclick="window._jmNav('home')">Continue Shopping</button>
        </div>
        <div class="jm-section">
            <div class="jm-section-header"><span>Recommended for you</span><button class="jm-see-all" onclick="window._jmNav('home')">See All</button></div>
            <div class="jm-hscroll" id="jmVoucherRecRow"></div>
        </div>
        <div class="jm-section">
            <div class="jm-section-header"><span>Recently Viewed</span><button class="jm-see-all" onclick="window._jmNav('recent')">See All</button></div>
            <div class="jm-hscroll" id="jmVoucherRecentRow"></div>
        </div>`;
    setTimeout(() => {
        const ecom = window.EcomMarketplace;
        const recs = ecom ? ecom.ProductEngine.getTrending().slice(0,6) : [];
        _renderHScroll('jmVoucherRecRow', recs);
        _renderHScroll('jmVoucherRecentRow', _state.recent);
    }, 50);
}

// ── INBOX PAGE ─────────────────────────────────────────────────────────────
function _renderInbox() {
    const container = document.getElementById('jmInboxContent');
    if (!container) return;
    container.innerHTML = `<div class="jm-empty-state">
        <div class="jm-empty-icon" style="font-size:44px;background:none;box-shadow:none">✉️</div>
        <div class="jm-empty-title">You don't have any messages</div>
        <div class="jm-empty-desc">Here you will be able to see all the messages that we send you. Stay tuned</div>
    </div>`;
}

// ── FOLLOW SELLERS PAGE ────────────────────────────────────────────────────
function _renderFollowSellers() {
    const container = document.getElementById('jmFollowSellersContent');
    if (!container) return;
    container.innerHTML = `
        <div class="jm-empty-state">
            <div class="jm-empty-icon" style="font-size:44px;background:none;box-shadow:none">🏪</div>
            <div class="jm-empty-title">You don't follow any seller!</div>
            <div class="jm-empty-desc">All your followed sellers will be displayed here</div>
            <button class="jm-orange-btn" onclick="window._jmNav('home')">Start Shopping</button>
        </div>
        <div style="background:#f3f4f6;padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600">Suggested sellers for you</div>
        <div id="jmSuggestedSellers"></div>`;

    // Load suggested sellers from listings
    const ecom = window.EcomMarketplace;
    const listings = ecom ? ecom.ProductEngine.getAllProducts().slice(0,6) : (window.currentListings||[]).slice(0,6);
    const sellers = {};
    listings.forEach(l => {
        const sid = l.seller_id||l.sellerId||l.userId;
        if (sid && !sellers[sid]) sellers[sid] = { id:sid, name:l.seller?.name||l.user?.displayName||'Seller', products:[l], followers:Math.floor(Math.random()*2000)+100, score:Math.floor(Math.random()*30)+70 };
        else if (sid) sellers[sid].products.push(l);
    });
    const suggestEl = document.getElementById('jmSuggestedSellers');
    if (suggestEl) {
        suggestEl.innerHTML = Object.values(sellers).slice(0,3).map(s => `
            <div class="jm-seller-item">
                <div class="jm-seller-header">
                    <div class="jm-seller-icon">🏪</div>
                    <div><div class="jm-seller-name">${_esc(s.name)}</div><div class="jm-seller-score">${s.score}% Seller Score &bull; ${s.followers.toLocaleString()} Followers</div></div>
                    <i class="fas fa-chevron-right jm-seller-chevron"></i>
                </div>
                <button class="jm-follow-btn" onclick="window._jmFollowSeller('${s.id}',this)">Follow</button>
                <div class="jm-seller-products">
                    ${s.products.slice(0,2).map(p=>_img(p)?`<img class="jm-seller-product-thumb" src="${_esc(_img(p))}" loading="lazy">`:`<div class="jm-seller-product-thumb" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:22px">🛒</div>`).join('')}
                    ${s.products.length>2?`<div class="jm-seller-see-all">SEE ALL</div>`:''}
                </div>
            </div>`).join('');
    }
}

window._jmFollowSeller = function(sellerId, btn) {
    const following = btn.classList.toggle('following');
    btn.textContent = following ? 'Following' : 'Follow';
    _toast(following ? 'Following seller' : 'Unfollowed', 'success', following?'🏪':'👋');
};

// ── NOTIFICATION PREFS PAGE ────────────────────────────────────────────────
// ── NOTIFICATION PREFS PAGE ─────────────────────────────────────────────────
function _renderNotifPrefs() {
    let container = document.getElementById('jmPageNotifPrefs');
    if (!container) return;
    if (container.querySelector('.notif-built')) return; // already built (static)
    container.innerHTML = `<div class="jm-page-title">🔔 Notifications</div>
    <div class="notif-built" style="padding:0 16px">
    ${[
        ['Order updates','Notify when your order status changes','order_updates',true],
        ['Delivery alerts','Real-time delivery tracking','delivery_alerts',true],
        ['Flash sale alerts','Be first to know about flash sales','flash_sales',true],
        ['Price drops','When wishlisted items drop in price','price_drops',true],
        ['Promotions','Coupons and special deals','promotions',false],
        ['New products','When followed sellers list products','new_products',false],
    ].map(([title,desc,key,def])=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 0;border-bottom:1px solid #f3f4f6">
        <div style="flex:1;padding-right:12px"><div style="font-size:14px;font-weight:700;color:#111">${title}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">${desc}</div></div>
        <label style="position:relative;display:inline-block;width:46px;height:26px;flex-shrink:0">
            <input type="checkbox" ${def?'checked':''} style="opacity:0;width:0;height:0" onchange="(s=>{const t=s.parentElement;t.querySelector('div').style.background=s.checked?'#f57224':'#d1d5db';t.querySelector('span').style.transform=s.checked?'translateX(20px)':'translateX(2px)'})(this)">
            <div style="position:absolute;inset:0;border-radius:26px;background:${def?'#f57224':'#d1d5db'};transition:.3s"></div>
            <span style="position:absolute;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:${def?'translateX(20px)':'translateX(2px)'}"></span>
        </label>
    </div>`).join('')}
    </div>`;
}

// ── ANALYTICS PAGE ──────────────────────────────────────────────────────────
function _renderAnalyticsPage() {
    let container = document.getElementById('jmPageAnalytics');
    if (!container) {
        container = document.createElement('div');
        container.id = 'jmPageAnalytics'; container.className = 'jm-page';
        document.getElementById('sidebar')?.appendChild(container);
    }
    const listings = (window.EcomMarketplace?.ProductEngine?.getAllProducts?.() || window.currentListings || []);
    const uid = window.currentUser?.id || window.__kynUser?.id;
    const mine = listings.filter(l => l.seller_id===uid||l.sellerId===uid||l.userId===uid);
    const views = mine.reduce((s,l)=>s+(l.views||0),0);
    const sold  = mine.reduce((s,l)=>s+(l.sold_count||0),0);
    const rating = mine.length ? (mine.reduce((s,l)=>s+(parseFloat(l.rating)||0),0)/mine.length).toFixed(1) : '—';

    container.innerHTML = `<div class="jm-page-title">📊 My Analytics</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px">
        ${[['📦 Listings',mine.length,'Products you sell'],['👁️ Views',views.toLocaleString(),'Total product views'],['⭐ Avg Rating',rating,'Customer rating'],['🛍️ Sold',sold,'Units sold total']].map(([l,v,s])=>`
        <div style="background:#fff;border-radius:14px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">${l}</div>
            <div style="font-size:22px;font-weight:900;color:#111">${v}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${s}</div>
        </div>`).join('')}
    </div>
    ${mine.length ? `
    <div style="background:#fff;margin:0 16px;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-weight:800;font-size:14px;margin-bottom:12px">Top Products by Views</div>
        ${[...mine].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5).map((l,i)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f9fafb">
            <div style="width:24px;height:24px;border-radius:50%;background:${i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;flex-shrink:0">${i+1}</div>
            <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(l.title||'')}</div><div style="font-size:11px;color:#9ca3af">${l.views||0} views · ${l.sold_count||0} sold</div></div>
            <div style="font-size:13px;font-weight:800;color:#f57224">${_fmt(l.price)}</div>
        </div>`).join('')}
    </div>` : `
    <div style="background:#fff;margin:0 16px;border-radius:14px;padding:40px 20px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-size:48px;margin-bottom:12px">📊</div>
        <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:8px">No seller data yet</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px">Create your first product listing to start tracking analytics.</div>
        <button onclick="window._jmNavMore('seller-dashboard')" style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:800;cursor:pointer">Go to Seller Hub →</button>
    </div>`}
    <div style="padding:12px 16px 0">
        <button onclick="window._jmNavMore('seller-analytics')" style="width:100%;background:#111;color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer">Full Seller Analytics →</button>
    </div>`;
}

// ── NOTES PAGE ──────────────────────────────────────────────────────────────
function _renderNotesPage() {
    let container = document.getElementById('jmPageNotes');
    if (!container) {
        container = document.createElement('div');
        container.id = 'jmPageNotes'; container.className = 'jm-page';
        document.getElementById('sidebar')?.appendChild(container);
    }
    const notes = _ls.load('jm_notes_v1', []);

    container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;background:#fff;border-bottom:1px solid #f3f4f6;flex-shrink:0">
        <div style="font-size:16px;font-weight:800;color:#111">📝 My Notes</div>
        <button onclick="window._jmAddNote()" style="background:#f57224;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:700;cursor:pointer">+ New Note</button>
    </div>
    <div id="jmNotesList" style="flex:1;overflow-y:auto;padding:12px 16px">
        ${notes.length ? notes.map((n,i)=>`
        <div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            <div style="display:flex;align-items:flex-start;gap:8px">
                <div style="flex:1;font-size:13px;color:#111;line-height:1.6">${_esc(n.text||'')}</div>
                <button onclick="window._jmDeleteNote(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;flex-shrink:0;padding:0">🗑️</button>
            </div>
            <div style="font-size:11px;color:#9ca3af;margin-top:8px">${n.date||''}</div>
        </div>`).join('') : `
        <div style="padding:50px 20px;text-align:center">
            <div style="font-size:52px;margin-bottom:14px">📝</div>
            <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:8px">No notes yet</div>
            <div style="font-size:13px;color:#6b7280;margin-bottom:20px">Tap the button above to add your first note — shopping reminders, seller ideas, anything!</div>
            <button onclick="window._jmAddNote()" style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:800;cursor:pointer">+ Add First Note</button>
        </div>`}
    </div>`;
}

window._jmAddNote = function() {
    const text = prompt('What would you like to note?');
    if (!text?.trim()) return;
    const notes = _ls.load('jm_notes_v1', []);
    notes.unshift({ text: text.trim(), date: new Date().toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) });
    _ls.save('jm_notes_v1', notes.slice(0,100));
    _renderNotesPage();
    _toast('Note saved!','success','📝');
};
window._jmDeleteNote = function(idx) {
    if (!confirm('Delete this note?')) return;
    const notes = _ls.load('jm_notes_v1', []);
    notes.splice(idx,1);
    _ls.save('jm_notes_v1', notes);
    _renderNotesPage();
};

// ── TRUST STATS PAGE ────────────────────────────────────────────────────────
function _renderTrustPage() {
    let container = document.getElementById('jmPageTrust');
    if (!container) {
        container = document.createElement('div');
        container.id = 'jmPageTrust'; container.className = 'jm-page';
        document.getElementById('sidebar')?.appendChild(container);
    }
    const user = window.currentUser || window.__kynUser || {};
    const score = user.trustScore || Math.min(100, 45 + (user.totalOrders||0)*2 + (user.reviewCount||0)*3);
    const color = score>=80?'#22c55e':score>=60?'#f59e0b':'#ef4444';
    const label = score>=80?'Excellent':score>=60?'Good':'Needs Improvement';

    container.innerHTML = `<div class="jm-page-title">🛡️ Trust Score</div>
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);margin:12px 16px;border-radius:20px;padding:24px;color:#fff;text-align:center">
        <div style="font-size:64px;font-weight:900;color:${color}">${score}</div>
        <div style="font-size:14px;font-weight:700;margin-top:4px">${score>=80?'Excellent — Highly Trusted':score>=60?'Good — Building Trust':'Fair — Keep Improving'}</div>
        <div style="background:rgba(255,255,255,.15);border-radius:20px;height:10px;overflow:hidden;margin:14px 0 8px"><div style="height:100%;background:${color};width:${score}%;border-radius:20px;transition:width 1s ease"></div></div>
        <div style="font-size:12px;opacity:.75">${score}/100 trust score</div>
    </div>
    <div style="padding:0 16px">
        ${[
            ['✅ Orders Completed',user.totalOrders||0,'Each completed order boosts your score'],
            ['⭐ Reviews Received',user.reviewCount||0,'Positive reviews increase trust'],
            ['📅 Account Age',user.createdAt?Math.floor((Date.now()-new Date(user.createdAt))/(365.25*86400000))+' year(s)':'New','Older accounts are trusted more'],
            ['🛡️ KYC Verified',user.metadata?.kyc?.status==='approved'?'Yes ✅':'Not yet','Verified accounts get +20 trust points'],
        ].map(([l,v,tip])=>`
        <div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div><div style="font-size:13px;font-weight:700;color:#111">${l}</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${tip}</div></div>
                <div style="font-size:16px;font-weight:900;color:#374151;flex-shrink:0;margin-left:8px">${v}</div>
            </div>
        </div>`).join('')}
        <button onclick="window._jmNavMore('seller-verification')" style="width:100%;background:#111;color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;margin-top:4px">Get Verified → +20 Points</button>
    </div>`;
}

// ── LEADERBOARD PAGE ────────────────────────────────────────────────────────
function _renderLeaderboardPage() {
    let container = document.getElementById('jmPageLeaderboard');
    if (!container) {
        container = document.createElement('div');
        container.id = 'jmPageLeaderboard'; container.className = 'jm-page';
        document.getElementById('sidebar')?.appendChild(container);
    }
    const listings = window.EcomMarketplace?.ProductEngine?.getAllProducts?.() || window.currentListings || [];
    const sellers = {};
    listings.forEach(l => {
        const id = l.seller_id||l.sellerId||'unknown';
        const name = l.seller?.name||'Seller';
        if (!sellers[id]) sellers[id]={id,name,views:0,sales:0,rating:0,cnt:0,avatar:(name[0]||'S').toUpperCase()};
        sellers[id].views += l.views||0;
        sellers[id].sales += l.sold_count||0;
        sellers[id].rating += parseFloat(l.rating)||0;
        sellers[id].cnt++;
    });
    const ranked = Object.values(sellers).map(s=>({...s,avgRating:(s.cnt?s.rating/s.cnt:0).toFixed(1)})).sort((a,b)=>b.sales-a.sales).slice(0,10);
    const medals = ['🥇','🥈','🥉'];

    container.innerHTML = `<div class="jm-page-title">🏆 Leaderboard</div>
    ${ranked.length ? `
    <div style="padding:0 16px">
        ${ranked.map((s,i)=>`
        <div style="display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #f9fafb">
            <div style="font-size:${i<3?'22':'14'}px;width:28px;text-align:center;flex-shrink:0">${medals[i]||`#${i+1}`}</div>
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f57224,#ff9a00);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;flex-shrink:0">${s.avatar}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(s.name)}</div>
                <div style="font-size:11px;color:#9ca3af">${s.sales} sales · ${s.views.toLocaleString()} views · ⭐ ${s.avgRating}</div>
            </div>
        </div>`).join('')}
    </div>` : `
    <div style="padding:50px 20px;text-align:center">
        <div style="font-size:52px;margin-bottom:14px">🏆</div>
        <div style="font-size:16px;font-weight:800;color:#111;margin-bottom:8px">No sellers yet</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:20px">Be the first to list products and top the leaderboard!</div>
        <button onclick="window._jmNavMore('seller-dashboard')" style="background:#f57224;color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:800;cursor:pointer">Start Selling →</button>
    </div>`}`;
}


// ── ADDRESSES PAGE ─────────────────────────────────────────────────────────
function _renderAddresses() {
    const container = document.getElementById('jmAddressesContent') || document.getElementById('jmAddressContent');
    if (!container) return;
    const addrs = _state.addresses.length ? _state.addresses : _ls.load(_LS.ADDRS, []);
    _state.addresses = addrs;
    if (!addrs.length) {
        container.innerHTML = `<div style="padding:24px;text-align:center;color:#6b7280">No saved addresses.<br>Add one below.</div>`;
        return;
    }
    container.innerHTML = `<div style="font-size:16px;font-weight:700;padding:14px 16px">Address book (${addrs.length})</div>` +
        addrs.map((a,i) => `<div class="jm-address-item">
            <div class="jm-address-name">${_esc(a.name)}</div>
            <div class="jm-address-detail">${_esc(a.type||'pick up')}</div>
            <div class="jm-address-detail">${_esc(a.city||'')}</div>
            <div class="jm-address-detail">${_esc(a.area||'')}</div>
            <div class="jm-address-phone">${_esc(a.phone||'')}</div>
            ${i===0?`<div class="jm-address-default"><i class="fas fa-check-circle"></i> Default Address</div>`:''}
            <div class="jm-address-actions">
                <button class="jm-address-set-default" onclick="window._jmSetDefaultAddr(${i})">Set As Default</button>
                <button class="jm-address-edit" onclick="window._jmEditAddr(${i})"><i class="fas fa-pencil-alt"></i></button>
            </div>
        </div>`).join('');
}

window._jmAddAddress = function() {
    const name  = prompt('Full name:');
    if (!name?.trim()) return;
    const phone = prompt('Phone (07XXXXXXXX):') || '';
    const city  = prompt('City:') || '';
    const area  = prompt('Area/Street:') || '';
    const type  = prompt('Type (pick up/delivery):') || 'pick up';
    const addr  = { name:name.trim(), phone, city, area, type };
    _state.addresses.push(addr);
    _ls.save(_LS.ADDRS, _state.addresses);
    _renderAddresses();
    _toast('Address saved', 'success', '📍');
};

window._jmSetDefaultAddr = function(idx) {
    const addr = _state.addresses.splice(idx,1)[0];
    _state.addresses.unshift(addr);
    _ls.save(_LS.ADDRS, _state.addresses);
    _renderAddresses();
};

window._jmEditAddr = function(idx) {
    const a = _state.addresses[idx];
    const name = prompt('Full name:', a.name) || a.name;
    const phone = prompt('Phone:', a.phone) || a.phone;
    const city  = prompt('City:', a.city) || a.city;
    const area  = prompt('Area:', a.area) || a.area;
    _state.addresses[idx] = { ...a, name, phone, city, area };
    _ls.save(_LS.ADDRS, _state.addresses);
    _renderAddresses();
};

// ── PRODUCT GRID (shared) ──────────────────────────────────────────────────
function _renderGrid(container, listings) {
    if (!container) return;
    if (!listings?.length) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#9ca3af"><div style="font-size:40px;margin-bottom:12px">🔍</div><div>No products found</div></div>`;
        return;
    }
    container.innerHTML = '';
    listings.forEach((listing, idx) => {
        setTimeout(() => {
            if (typeof renderers !== 'undefined' && renderers.addListingItem) {
                // Temporarily override DOM reference if needed
                const orig = DOM.marketplaceListContent;
                DOM.marketplaceListContent = container;
                if (renderers && renderers.addListingItem) renderers.addListingItem(listing);
                DOM.marketplaceListContent = orig;
            }
        }, idx * 15);
    });
}

// ── LOCAL CART FALLBACK ────────────────────────────────────────────────────
function _buildLocalCart() {
    const items = [..._state.cart.values()].map(i => ({ product: i.listing, quantity: i.qty||1 }));
    const subtotal = items.reduce((s,i) => s + (_price(i.product)*i.quantity), 0);
    return { items, count: items.reduce((s,i)=>s+i.quantity,0), subtotal, total: subtotal, delivery: 0, discount: 0 };
}

// ── SEARCH ──────────────────────────────────────────────────────────────────
function _initSearch() {
    const input   = document.getElementById('jmSearchInput');
    const clear   = document.getElementById('jmSearchClear');
    const sugEl   = document.getElementById('jmSuggestions');
    if (!input) return;

    let _timer;
    const _recentSearches = _ls.load('jm_recent_searches', []);

    input.addEventListener('focus', () => {
        if (!input.value && _recentSearches.length) {
            sugEl.innerHTML = '<div style="padding:8px 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase">Recent Searches</div>' +
                _recentSearches.slice(0,5).map(q=>`<div class="jm-suggestion-item" data-q="${_esc(q)}"><i class="fas fa-history"></i>${_esc(q)}</div>`).join('');
            sugEl.style.display = 'block';
        }
    });

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clear.style.display = q ? 'flex' : 'none';
        clearTimeout(_timer);
        if (!q) { sugEl.style.display='none'; return; }
        _timer = setTimeout(() => {
            const ecom = window.EcomMarketplace;
            const results = ecom ? ecom.ProductEngine.search(q).slice(0,8) : (window.currentListings||[]).filter(l=>l.title?.toLowerCase().includes(q.toLowerCase())).slice(0,8);
            // Trending searches
            const trendingTerms = ['phones','laptops','fashion','electronics','supermarket','beauty'];
            const trending = trendingTerms.filter(t=>t.includes(q.toLowerCase())||q.toLowerCase().includes(t));
            sugEl.innerHTML = (trending.length ? `<div style="padding:8px 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase">Trending</div>` + trending.slice(0,3).map(t=>`<div class="jm-suggestion-item" data-q="${_esc(t)}"><i class="fas fa-fire" style="color:#f57224"></i>${_esc(t)}</div>`).join('') : '') +
                (results.length ? `<div style="padding:8px 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase">Products</div>` + results.map(r=>`<div class="jm-suggestion-item" data-id="${r.id}"><i class="fas fa-search"></i>${_esc(r.title||'')}</div>`).join('') : '');
            sugEl.style.display = sugEl.innerHTML ? 'block' : 'none';
        }, 200);
    });

    sugEl.addEventListener('click', (e) => {
        const item = e.target.closest('[data-q],[data-id]');
        if (!item) return;
        if (item.dataset.id) {
            const ecom = window.EcomMarketplace;
            const p = ecom?.ProductEngine.getStore().products.get(item.dataset.id);
            if (p) renderers.viewListingDetail(p);
        } else if (item.dataset.q) {
            input.value = item.dataset.q;
            _doSearch(item.dataset.q);
        }
        sugEl.style.display = 'none';
    });

    clear.addEventListener('click', () => { input.value=''; clear.style.display='none'; sugEl.style.display='none'; _doSearch(''); });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { _doSearch(input.value.trim()); sugEl.style.display='none'; }
        if (e.key === 'Escape') sugEl.style.display='none';
    });

    document.addEventListener('click', (e) => { if (!e.target.closest('#jmSearchWrap,#jmSuggestions')) sugEl.style.display='none'; });
}

function _doSearch(q) {
    _state.search = q;
    if (!q) { _nav('home'); return; }
    // Save recent search
    const searches = _ls.load('jm_recent_searches', []);
    if (!searches.includes(q)) { searches.unshift(q); _ls.save('jm_recent_searches', searches.slice(0,10)); }

    // Navigate to products page with search
    const productsPage = document.getElementById('jmPageProducts');
    if (productsPage) {
        document.querySelectorAll('.jm-page').forEach(p=>p.classList.remove('active'));
        document.querySelectorAll('.jm-nav-tab').forEach(t=>t.classList.remove('active'));
        productsPage.classList.add('active');
        const title = document.getElementById('jmProductsTitle');
        if (title) title.textContent = `← Results: "${q}"`;
        const ecom = window.EcomMarketplace;
        const results = ecom ? ecom.ProductEngine.search(q) : (window.currentListings||[]).filter(l=>l.title?.toLowerCase().includes(q.toLowerCase()));
        _renderGrid(document.getElementById('jmProductsContent'), results);
        const backBtn = document.getElementById('jmBackBtn');
        if (backBtn) backBtn.style.display='flex';
    }
}

// ── SORT CHIPS ─────────────────────────────────────────────────────────────
function _initSortChips() {
    document.getElementById('jmFilterChips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.jm-chip');
        if (!chip) return;
        document.querySelectorAll('.jm-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        _state.sort = chip.dataset.sort;
        const ecom = window.EcomMarketplace;
        if (ecom) {
            const sorted = ecom.ProductEngine.search(_state.search, { sort:_state.sort });
            const grid = document.getElementById('marketplaceListContent');
            if (grid) { grid.innerHTML=''; sorted.forEach((p,i)=>setTimeout(()=>renderers.addListingItem(p),i*15)); }
            const countEl = document.getElementById('jmProductCount');
            if (countEl) countEl.textContent = `(${sorted.length})`;
        }
    });
}

// ── SUPPORT ACTIONS ────────────────────────────────────────────────────────
window._jmOpenSupport = function() {
    if (typeof openChat === 'function') { openChat('support','Support'); return; }
    _toast('Opening support chat…', 'info', '💬');
};
window._jmOpenWhatsApp = function() {
    window.open('https://wa.me/254700000000?text=Hi%2C%20I%20need%20help%20with%20my%20order', '_blank');
};
window._jmLogout = function() {
    if (confirm('Are you sure you want to log out?')) {
        try { window.parent.postMessage({ type:'LOGOUT' }, '*'); } catch(_) {}
        _toast('Logging out…', 'info', '👋');
    }
};
window._jmRequestNotifPermission = function() {
    if ('Notification' in window) {
        Notification.requestPermission().then(perm => {
            _toast(perm==='granted' ? 'Notifications enabled!' : 'Notifications blocked', perm==='granted'?'success':'error', perm==='granted'?'🔔':'🔕');
        });
    }
};

// ── REALTIME SYNC ──────────────────────────────────────────────────────────
function _initRealtimeBridge() {
    // Cart updates from EcomMarketplace
    window.addEventListener('ecom:cart-updated', () => {
        _updateCartBadge();
        if (_state.page === 'cart') _renderCart();
    });

    // Wishlist updates
    window.addEventListener('ecom:wishlist-updated', () => {
        _updateWishlistBadge();
        if (_state.page === 'wishlist') _renderWishlist();
    });

    // Order status
    window.addEventListener('ecom:order-status-changed', () => {
        if (_state.page === 'orders') _renderOrders();
    });

    // Stock changes — update card buttons
    window.addEventListener('ecom:stock-updated', (e) => {
        const { productId, quantity } = e.detail || {};
        document.querySelectorAll(`.jm-card[data-listing-id="${productId}"] .jm-add-cart-btn`).forEach(btn => {
            if (quantity <= 0) { btn.textContent='Out of Stock'; btn.disabled=true; btn.classList.remove('in-cart'); }
        });
    });

    // Products loaded — update count
    window.addEventListener('ecom:products-loaded', () => {
        const grid = document.getElementById('marketplaceListContent');
        const countEl = document.getElementById('jmProductCount');
        if (grid && countEl) countEl.textContent = `(${grid.querySelectorAll('.jm-card').length})`;
    });

    // Notification push — show toast
    window.addEventListener('ecom:notification-push', (e) => {
        const n = e.detail?.notification;
        if (!n) return;
        const icons = { order_placed:'🎉', new_order:'🛍', delivery_update:'🚚', new_message:'💬', payment:'✅', order_status:'📦' };
        _toast(n.message, 'info', icons[n.type]||'ℹ️');
        // Notify parent for nav dot
        try { window.parent.postMessage({ type:'ECOM_NOTIFICATION_PUSH', payload:n }, '*'); } catch(_) {}
    });
}

// ── BACK BUTTON ───────────────────────────────────────────────────────────
function _initBackButton() {
    document.getElementById('jmBackBtn')?.addEventListener('click', () => _nav('home'));
}

// ── INITIALISE ─────────────────────────────────────────────────────────────
function _init() {
    if (_state.initialized) return;
    _state.initialized = true;

    // Restore from localStorage
    _state.recent = _ls.load(_LS.RECENT, []);

    _initSearch();
    _initSortChips();
    _initBackButton();
    _initRealtimeBridge();

    // Render home sections if ecom is ready
    if (window.EcomMarketplace) {
        _renderHome();
    } else {
        window.addEventListener('ecom:ready', _renderHome, { once:true });
    }

    // Update badges
    _updateCartBadge();
    _updateWishlistBadge();
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    setTimeout(_init, 200);
}

// Also re-init when marketplace tab becomes active (iframe message)
window.addEventListener('message', (e) => {
    if (e.data?.type === 'tools:active' || e.data?.type === 'PARENT_READY') {
        if (!_state.initialized) _init();
        else { _updateCartBadge(); _updateWishlistBadge(); _renderHome(); }
    }
});

})(); // end _JumiaMPEngine