// =============================================
// SETTINGS CORE - PRODUCTION IMPLEMENTATION (ES MODULES)
// =============================================

import { 
  secureFetch, 
  getCurrentUser, 
  getUserToken, 
  setUserToken, 
  getSession, 
  initSession,
  logout,
  requestSession,
  validateSession,
  isAuthenticated,
  isSessionValid
} from './js/api.core.js';

// Global variables - NO TOKEN DECLARATIONS
export let currentUser = null;
export let userSettings = {};
export let currentSection = 'profile';
export let unsavedChanges = false;
export let blockedUsers = [];
export let activeSessions = [];
export let userContacts = [];
export let userGroups = [];

// Message handling variables
let lastMessageTime = 0;
let processingMessage = false;
let messageCount = 0;

// AUTH STATE FLAGS (read-only observers)
export let authReady = false;
export let apiInitialized = true;
let apiInitRetries = 0;
export const MAX_API_RETRIES = 5;
export let backgroundTasksStarted = false;
let authCheckInterval = null;
export const AUTH_CHECK_INTERVAL = 30000;

// Token system flags
export let tokenReady = false;
export let tokenAvailable = false;
export let tokenInitialized = false;
export const TOKEN_CHECK_INTERVAL = 1000;
let tokenCheckInterval = null;

// Parent communication state
export let parentCommunicationReady = false;
export let parentSessionReceived = false;
let handshakeAttempts = 0;
export const MAX_HANDSHAKE_ATTEMPTS = 10;
let handshakeInterval = null;
export const HANDSHAKE_RETRY_INTERVAL = 1000;
export let parentOrigin = null;

// Session state from parent
export let parentSessionData = null;
export let sessionValidated = false;

// Enhanced handshake protocol variables
let handshakeInProgress = false;
let handshakeTimeout = null;
let sessionValid = false;
let retryAttempted = false;
const HANDSHAKE_TIMEOUT = 5000;

// Safety guard variables
let handshakeRetryCount = 0;
const MAX_HANDSHAKE_RETRIES = 3;
let processedMessageIds = new Set();
let untrustedOriginLogged = false;
let sessionRequestLogged = false;
let handshakeFailureLogged = false;
let trustedOrigins = new Set();

// Initialize trusted origins
(function initTrustedOrigins() {
    try {
        // Add current origin
        trustedOrigins.add(window.location.origin);
        
        // Add local development environments
        trustedOrigins.add('http://127.0.0.1:5500');
        trustedOrigins.add('http://localhost:5500');
        trustedOrigins.add('http://localhost:3000');
        trustedOrigins.add('http://127.0.0.1:3000');
        
        // Add VPS/Production domains (update as needed)
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            trustedOrigins.add(`https://${hostname}`);
            trustedOrigins.add(`http://${hostname}`);
        }
    } catch (error) {
        // Silent initialization
    }
})();

// Default settings structure
export const DEFAULT_SETTINGS = {
    profile: {
        photoUrl: '',
        displayName: '',
        username: '',
        bio: '',
        phoneNumber: '',
        email: '',
        currentMood: 'neutral',
        currentMoodText: '',
        profileVisibility: 'everyone',
        lastSeen: true,
        onlineStatus: true,
        profilePhotoVisibility: 'everyone'
    },
    
    security: {
        twoFactorAuth: false,
        loginNotifications: true,
        sessionTimeout: '30min',
        appLock: false,
        screenCaptureProtection: true,
        encryption: true,
        biometricBypass: true,
        timeoutWarnings: true,
        enhancedTimeout: false,
        lockScreenAfter: '5min',
        logoutAfter: '8hr'
    },
    
    privacy: {
        whoCanAddMe: 'everyone',
        readReceipts: true,
        typingIndicators: true,
        messageForwarding: true,
        contactDiscovery: true,
        canMessageMe: 'everyone',
        canCallMe: 'everyone',
        canSeeMyStatus: 'friendsOnly',
        canSeeProfilePhoto: 'everyone',
        canSeeLastSeen: 'friendsOnly',
        canForwardMessages: 'friendsOnly',
        canTakeScreenshots: false,
        blockedUsers: []
    },
    
    chat: {
        chatWallpaper: 'default',
        enterKeySends: true,
        mediaAutoDownload: 'wifiOnly',
        saveToCameraRoll: true,
        messageHistory: 'forever',
        disappearingMessages: 'off',
        smartReplies: true,
        messageTranslation: false,
        chatSummarization: false,
        spamDetection: true,
        messageApprovalMode: false,
        keywordFiltering: false
    },
    
    friends: {
        discoverByPhone: true,
        discoverByEmail: true,
        nearbyDiscovery: false,
        qrCodeScanner: true,
        friendSuggestions: true,
        temporaryFriends: true,
        friendshipNotes: true,
        friendCategories: true,
        trustScore: true,
        friendAnalytics: true
    },
    
    groups: {
        autoJoinGroups: false,
        groupInvitations: 'everyone',
        groupPrivacy: 'everyone',
        groupAnnouncements: true,
        autoDownloadGroupMedia: 'wifiOnly',
        messageApprovalModeGroup: false,
        keywordFilteringGroup: false,
        groupSpamDetection: true,
        memberWarnings: true,
        activityTracking: true,
        topContributors: true,
        messageVolumeAnalytics: true,
        groupDataCache: 'activeGroupsOnly'
    },
    
    calls: {
        whoCanCallMe: 'everyone',
        callVerification: true,
        ringtone: 'default',
        callVibration: true,
        autoAnswer: false,
        videoQuality: 'auto',
        cameraDefault: 'front',
        noiseCancellation: true,
        echoCancellation: true,
        liveReactions: true,
        inCallChat: true,
        sharedWhiteboard: true,
        sharedNotes: true,
        polls: true,
        callHistoryCache: '90days'
    },
    
    status: {
        whoCanViewMyStatus: 'friendsOnly',
        autoExpireStatus: '24h',
        replyPermissions: 'friendsOnly',
        downloadPermissions: false,
        hideFromSpecificUsers: [],
        viewCount: true,
        viewerList: true,
        engagementReactions: true,
        autoCaptions: false,
        aiEnhancement: false,
        statusScheduling: false,
        statusCache: '24hours'
    },
    
    notifications: {
        messageNotifications: true,
        groupNotifications: true,
        friendRequestNotifications: true,
        callNotifications: true,
        statusNotifications: true,
        notificationSound: true,
        vibration: true,
        popupNotifications: true,
        notificationLight: true,
        doNotDisturb: false,
        schedule: 'custom',
        allowCalls: true,
        allowMessagesFrom: 'everyone'
    },
    
    appearance: {
        theme: 'auto',
        accentColor: '#0084ff',
        fontSize: 16,
        reduceMotion: false,
        language: 'en',
        timeFormat: '12-hour',
        dateFormat: 'MM/DD/YYYY',
        layoutMode: 'auto',
        moodBasedLayouts: true,
        customIcons: false,
        chatIcon: 'default',
        callIcon: 'default',
        statusIcon: 'default',
        buttonStyles: 'rounded'
    },
    
    storage: {
        autoClearCache: 'never',
        chatCacheSize: 0,
        mediaCacheSize: 0,
        otherCacheSize: 0,
        totalStorageUsed: 0,
        storageTotal: 1024 * 1024 * 1024,
        storageBreakdown: {
            chats: 0,
            media: 0,
            other: 0
        }
    },
    
    mood: {
        moodLinkedTheme: true,
        moodColors: {
            happy: '#FFD700',
            calm: '#4A90E2',
            energetic: '#FF6B6B',
            focused: '#7B68EE',
            relaxed: '#4ECDC4',
            stressed: '#FF8C00',
            tired: '#A9A9A9',
            excited: '#FF1493'
        },
        currentMood: 'neutral',
        manualMoodOverride: 'autoDetect',
        smartNotifications: true,
        stressedModeRules: true,
        focusedModeRules: true,
        happyModeRules: true,
        autoMoodDetection: true,
        updateAfterCalls: true,
        updateAfterStatusPosts: true,
        updateAfterActivity: true,
        moodPrivacyRules: true,
        tiredMoodRule: true,
        stressedMoodRule: true,
        happyMoodRule: true,
        ruleDuration: '6hr'
    },
    
    activity: {
        focusMode: false,
        focusDuration: '1hr',
        focusModeEssentialContacts: true,
        focusModeUrgentCalls: true,
        focusModeWorkMessages: true,
        focusModeFamilyMessages: true,
        autoEnableFocusMode: false,
        autoArchiveChats: false,
        inactivityPeriod: '90',
        excludeImportantChats: true,
        archiveNotifications: true,
        offlineDataControl: 'balanced',
        chatPageCache: '30days',
        callHistoryCacheActivity: '90days',
        groupDataCacheActivity: 'activeGroupsOnly',
        statusCacheActivity: '7days'
    },
    
    intelligence: {
        smartVisibility: true,
        visibleToGroups: [],
        visibleToContacts: [],
        timeBasedVisibility: false,
        activityBasedVisibility: true,
        interactionAnalytics: true,
        mostContacted: 0,
        responseTime: 0,
        activeHours: '',
        engagementScore: 0,
        weeklyReports: true,
        interactionTrends: true,
        moodAutoReplies: true,
        busyMoodTemplate: 'I\'m busy right now, I\'ll get back to you soon.',
        focusedMoodTemplate: 'In focus mode, will respond when available.',
        relaxedMoodTemplate: 'Taking it easy, feel free to chat!',
        smartTemplateSelection: true
    },
    
    personalization: {
        layoutMode: 'auto',
        moodBasedLayouts: true,
        customIcons: false,
        chatIcon: 'default',
        callIcon: 'default',
        statusIcon: 'default',
        buttonStyles: 'rounded',
        quickAccess: true,
        shortcut1: 'tools',
        shortcut2: 'marketplace',
        shortcut3: 'groups',
        shortcutPosition: 'topBar'
    },
    
    safety: {
        invisibleMode: false,
        invisibleDuration: '30min',
        hideFromContacts: [],
        alwaysVisibleTo: [],
        invisibleTimer: 0,
        moodPrivacyRules: true,
        tiredMoodRule: true,
        stressedMoodRule: true,
        happyMoodRule: true,
        ruleDuration: '6hr',
        enhancedTimeout: false,
        lockScreenAfter: '5min',
        logoutAfter: '8hr',
        biometricBypass: true,
        timeoutWarnings: true
    },
    
    advanced: {
        offlineMode: false,
        intranetSupport: false,
        lowBandwidthMode: false,
        debugMode: false,
        proxySettings: {},
        dataSaver: false
    },
    
    backup: {
        autoBackup: true,
        backupFrequency: 'weekly',
        backupLocation: 'cloud',
        lastBackup: null,
        backupSize: 0
    },
    
    danger: {
        accountDeletionRequested: false,
        deletionScheduled: null,
        dataExportRequested: false,
        lastExport: null,
        exportFormat: 'json'
    }
};

// Settings menu structure
export const SETTINGS_MENU = [
    {
        id: 'profile',
        title: 'Profile',
        icon: 'fas fa-user',
        badge: null
    },
    {
        id: 'security',
        title: 'Security',
        icon: 'fas fa-shield-alt',
        badge: null
    },
    {
        id: 'privacy',
        title: 'Privacy',
        icon: 'fas fa-lock',
        badge: null
    },
    {
        id: 'chat',
        title: 'Chat',
        icon: 'fas fa-comments',
        badge: null
    },
    {
        id: 'friends',
        title: 'Friends',
        icon: 'fas fa-user-friends',
        badge: null
    },
    {
        id: 'groups',
        title: 'Groups',
        icon: 'fas fa-users',
        badge: null
    },
    {
        id: 'calls',
        title: 'Calls',
        icon: 'fas fa-phone',
        badge: null
    },
    {
        id: 'status',
        title: 'Status',
        icon: 'fas fa-circle',
        badge: null
    },
    {
        id: 'notifications',
        title: 'Notifications',
        icon: 'fas fa-bell',
        badge: null
    },
    {
        id: 'appearance',
        title: 'Appearance',
        icon: 'fas fa-palette',
        badge: null
    },
    {
        id: 'storage',
        title: 'Storage',
        icon: 'fas fa-database',
        badge: null
    },
    {
        id: 'mood',
        title: 'Mood Settings',
        icon: 'fas fa-smile',
        badge: 'NEW'
    },
    {
        id: 'activity',
        title: 'Smart Activity',
        icon: 'fas fa-brain',
        badge: null
    },
    {
        id: 'intelligence',
        title: 'Interaction Intelligence',
        icon: 'fas fa-robot',
        badge: null
    },
    {
        id: 'personalization',
        title: 'Personalization',
        icon: 'fas fa-sliders-h',
        badge: null
    },
    {
        id: 'safety',
        title: 'Safety & Privacy+',
        icon: 'fas fa-user-secret',
        badge: 'PRO'
    },
    {
        id: 'advanced',
        title: 'Advanced',
        icon: 'fas fa-cogs',
        badge: null
    },
    {
        id: 'backup',
        title: 'Backup & Restore',
        icon: 'fas fa-cloud-upload-alt',
        badge: null
    },
    {
        id: 'danger',
        title: 'Danger Zone',
        icon: 'fas fa-exclamation-triangle',
        badge: '!',
        danger: true
    }
];

// =============================================
// DYNAMIC MENU RENDERING SYSTEM
// =============================================

/**
 * Builds the settings menu dynamically
 */
export function buildSettingsMenu(container = null, config = {}) {
    const {
        sessionAware = true,
        iframeCompatible = true,
        activeSection = currentSection,
        onSectionChange = null
    } = config;
    
    try {
        if (!container) {
            container = document.getElementById('settingsMenu');
        }
        
        if (!container) {
            return false;
        }
        
        let canShowProtectedUI = true;
        if (sessionAware) {
            canShowProtectedUI = checkAuthenticationState();
        }
        
        container.innerHTML = '';
        
        const menuWrapper = document.createElement('div');
        menuWrapper.className = 'settings-menu-wrapper';
        menuWrapper.setAttribute('data-iframe-compatible', iframeCompatible);
        menuWrapper.setAttribute('data-session-aware', sessionAware);
        menuWrapper.setAttribute('data-auth-state', canShowProtectedUI ? 'authenticated' : 'unauthenticated');
        
        const menuItems = filterMenuItems(SETTINGS_MENU, {
            canShowProtectedUI,
            iframeCompatible
        });
        
        const menuHTML = generateMenuHTML(menuItems, {
            activeSection,
            canShowProtectedUI
        });
        
        menuWrapper.innerHTML = menuHTML;
        container.appendChild(menuWrapper);
        
        attachMenuEventListeners(menuWrapper, {
            onSectionChange,
            canShowProtectedUI
        });
        
        enhanceMenuAccessibility(menuWrapper);
        
        return true;
        
    } catch (error) {
        showFallbackMenu(container, error);
        return false;
    }
}

/**
 * Filters menu items based on current state
 */
function filterMenuItems(menuItems, state) {
    const { canShowProtectedUI, iframeCompatible } = state;
    
    return menuItems.filter(item => {
        if (!canShowProtectedUI) {
            return !item.danger && 
                   !['security', 'privacy', 'danger', 'backup'].includes(item.id);
        }
        
        if (iframeCompatible && item.requiresParentNavigation) {
            return false;
        }
        
        return true;
    });
}

/**
 * Generates HTML for menu items
 */
function generateMenuHTML(menuItems, options) {
    const { activeSection, canShowProtectedUI } = options;
    
    return menuItems.map(item => {
        const isActive = item.id === activeSection;
        const isDisabled = !canShowProtectedUI && item.requiresAuth;
        const hasBadge = item.badge && item.badge !== null;
        
        const classes = [
            'settings-menu-item',
            isActive ? 'active' : '',
            isDisabled ? 'disabled' : '',
            item.danger ? 'danger-item' : ''
        ].filter(Boolean).join(' ');
        
        const attributes = [
            `data-section="${item.id}"`,
            `data-badge="${hasBadge ? item.badge : ''}"`,
            isDisabled ? 'aria-disabled="true"' : '',
            `tabindex="${isDisabled ? '-1' : '0'}"`
        ].filter(Boolean).join(' ');
        
        return `
            <div class="${classes}" ${attributes}>
                <div class="menu-item-content">
                    <i class="${item.icon} menu-item-icon"></i>
                    <span class="menu-item-title">${item.title}</span>
                    ${hasBadge ? `<span class="menu-item-badge">${item.badge}</span>` : ''}
                </div>
                ${isActive ? '<i class="fas fa-chevron-right menu-item-arrow"></i>' : ''}
            </div>
        `;
    }).join('');
}

/**
 * Attaches event listeners to menu items
 */
function attachMenuEventListeners(menuWrapper, options) {
    const { onSectionChange, canShowProtectedUI } = options;
    
    const menuItems = menuWrapper.querySelectorAll('.settings-menu-item:not(.disabled)');
    
    menuItems.forEach(item => {
        const sectionId = item.getAttribute('data-section');
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.classList.contains('disabled')) {
                return;
            }
            
            handleSectionChange(sectionId, {
                onSectionChange,
                canShowProtectedUI
            });
        });
        
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
            }
            
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                navigateMenuWithKeyboard(e, menuItems, item);
            }
        });
    });
}

/**
 * Handles section change with validation
 */
function handleSectionChange(sectionId, options) {
    const { onSectionChange, canShowProtectedUI } = options;
    
    if (!canShowProtectedUI && requiresAuthentication(sectionId)) {
        showAuthenticationRequiredMessage();
        return;
    }
    
    if (unsavedChanges && sectionId !== currentSection) {
        showUnsavedChangesWarning(sectionId);
        return;
    }
    
    currentSection = sectionId;
    
    updateActiveMenuState(sectionId);
    
    if (onSectionChange && typeof onSectionChange === 'function') {
        onSectionChange(sectionId);
    }
    
    loadSection(sectionId);
    
    if (window.parent !== window) {
        sendMessageToParent({
            type: 'SECTION_CHANGE',
            childId: 'settings',
            section: sectionId,
            timestamp: Date.now(),
            source: 'settings-core'
        });
    }
}

/**
 * Updates active state in menu
 */
function updateActiveMenuState(activeSectionId) {
    const menuWrapper = document.querySelector('.settings-menu-wrapper');
    if (!menuWrapper) return;
    
    const allItems = menuWrapper.querySelectorAll('.settings-menu-item');
    allItems.forEach(item => {
        item.classList.remove('active');
        const arrow = item.querySelector('.menu-item-arrow');
        if (arrow) arrow.remove();
    });
    
    const activeItem = menuWrapper.querySelector(`[data-section="${activeSectionId}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        
        const arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-right menu-item-arrow';
        activeItem.appendChild(arrow);
    }
}

/**
 * Navigates menu with keyboard
 */
function navigateMenuWithKeyboard(event, menuItems, currentItem) {
    event.preventDefault();
    
    const currentIndex = Array.from(menuItems).indexOf(currentItem);
    let nextIndex = currentIndex;
    
    if (event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % menuItems.length;
    } else if (event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
    }
    
    const nextItem = menuItems[nextIndex];
    if (nextItem && !nextItem.classList.contains('disabled')) {
        nextItem.focus();
        
        if (event.shiftKey) {
            nextItem.click();
        }
    }
}

/**
 * Enhances menu accessibility
 */
function enhanceMenuAccessibility(menuWrapper) {
    menuWrapper.setAttribute('role', 'menu');
    menuWrapper.setAttribute('aria-label', 'Settings navigation menu');
    
    const menuItems = menuWrapper.querySelectorAll('.settings-menu-item');
    menuItems.forEach((item, index) => {
        item.setAttribute('role', 'menuitem');
        item.setAttribute('aria-posinset', index + 1);
        item.setAttribute('aria-setsize', menuItems.length);
    });
}

/**
 * Shows fallback menu on error
 */
function showFallbackMenu(container, error) {
    const fallbackHTML = `
        <div class="settings-menu-fallback">
            <div class="fallback-header">
                <i class="fas fa-cog"></i>
                <span>Settings</span>
            </div>
            <div class="fallback-items">
                <div class="fallback-item active" data-section="profile">
                    <i class="fas fa-user"></i>
                    <span>Profile</span>
                </div>
                <div class="fallback-item" data-section="appearance">
                    <i class="fas fa-palette"></i>
                    <span>Appearance</span>
                </div>
                <div class="fallback-item" data-section="notifications">
                    <i class="fas fa-bell"></i>
                    <span>Notifications</span>
                </div>
            </div>
            <div class="fallback-error">
                <small>Limited menu due to error</small>
            </div>
        </div>
    `;
    
    container.innerHTML = fallbackHTML;
    
    const fallbackItems = container.querySelectorAll('.fallback-item');
    fallbackItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            currentSection = sectionId;
            loadSection(sectionId);
            
            fallbackItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

/**
 * Checks if a section requires authentication
 */
function requiresAuthentication(sectionId) {
    const protectedSections = [
        'security', 'privacy', 'danger', 'backup', 
        'safety', 'advanced', 'storage'
    ];
    return protectedSections.includes(sectionId);
}

/**
 * Shows authentication required message
 */
function showAuthenticationRequiredMessage() {
    showNotification('Authentication required to access this section', 'warning');
    
    const menuWrapper = document.querySelector('.settings-menu-wrapper');
    if (menuWrapper) {
        menuWrapper.classList.add('auth-required-shake');
        setTimeout(() => {
            menuWrapper.classList.remove('auth-required-shake');
        }, 500);
    }
}

/**
 * Shows unsaved changes warning
 */
function showUnsavedChangesWarning(nextSectionId) {
    showConfirmation(
        'Unsaved Changes',
        'You have unsaved changes in the current section. Do you want to save before switching?',
        () => {
            saveSettings().then(() => {
                handleSectionChange(nextSectionId, {
                    onSectionChange: null,
                    canShowProtectedUI: true
                });
            });
        },
        () => {
            unsavedChanges = false;
            updateSaveButton();
            handleSectionChange(nextSectionId, {
                onSectionChange: null,
                canShowProtectedUI: true
            });
        },
        'Save & Switch',
        'Discard & Switch'
    );
}

// =============================================
// ENHANCED SECURE HANDSHAKE PROTOCOL
// =============================================

/**
 * Enhanced secure handshake protocol with parent
 * - Only one request pending at a time
 * - Single retry if session fails
 * - Secure origin validation
 * - Logs once per message type
 * - UI binding only after session validation
 */
function requestSessionFromParent() {
    try {
        if (handshakeInProgress) {
            return;
        }
        
        // Safety: Check retry count
        if (handshakeRetryCount >= MAX_HANDSHAKE_RETRIES) {
            if (!handshakeFailureLogged) {
                console.log('❌ [Handshake] Max retries reached, stopping handshake attempts');
                handshakeFailureLogged = true;
            }
            return;
        }
        
        handshakeInProgress = true;
        retryAttempted = false;
        handshakeRetryCount++;
        
        console.log(`⏳ [Handshake] Attempt ${handshakeRetryCount}/${MAX_HANDSHAKE_RETRIES}: Waiting for session from parent...`);
        
        // Safety: Check if parent exists
        if (!window.parent || window.parent === window) {
            console.log('❌ [Handshake] No parent window found');
            handshakeInProgress = false;
            return;
        }
        
        // Safety: Validate session before sending request
        if (!hasValidSessionToRequest()) {
            if (!sessionRequestLogged) {
                console.log('⚠️ [Handshake] No valid session to request');
                sessionRequestLogged = true;
            }
            handshakeInProgress = false;
            return;
        }
        
        sendMessageToParent({
            type: 'REQUEST_SESSION',
            source: 'settings-core',
            childId: 'settings',
            timestamp: Date.now(),
            version: '1.0',
            messageId: generateMessageId()
        });
        
        // Set timeout for handshake response
        handshakeTimeout = setTimeout(() => {
            if (!sessionValid) {
                handshakeInProgress = false;
                console.log('❌ [Handshake] Session request timed out');
                
                // Single retry if not attempted yet
                if (!retryAttempted && handshakeRetryCount < MAX_HANDSHAKE_RETRIES) {
                    retryAttempted = true;
                    console.log(`🔄 [Handshake] Attempting retry ${handshakeRetryCount + 1}/${MAX_HANDSHAKE_RETRIES}...`);
                    setTimeout(requestSessionFromParent, 1000);
                } else {
                    showReconnectionState();
                }
            }
        }, HANDSHAKE_TIMEOUT);
    } catch (error) {
        console.error('❌ [Handshake] Error in requestSessionFromParent:', error);
        handshakeInProgress = false;
        // Don't propagate error - allow other modules to continue
    }
}

/**
 * Check if we have a valid session to request
 */
function hasValidSessionToRequest() {
    try {
        // Check if parent exists
        if (!window.parent || window.parent === window) {
            return false;
        }
        
        // Check if we're already authenticated
        if (parentSessionReceived && sessionValidated) {
            return false; // No need to request again
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Validate incoming message origin safely with caching
 */
function validateMessageOrigin(event) {
    try {
        // Cache trusted origin on first valid message
        if (!parentOrigin && event.source === window.parent) {
            parentOrigin = event.origin;
            trustedOrigins.add(event.origin);
        }
        
        // Always accept messages from same origin
        if (event.origin === window.location.origin) {
            return true;
        }
        
        // Check cached trusted origins
        if (trustedOrigins.has(event.origin)) {
            return true;
        }
        
        // Log untrusted origin once
        if (!untrustedOriginLogged) {
            console.warn('⚠️ [Security] Untrusted origin attempted communication:', event.origin);
            untrustedOriginLogged = true;
        }
        
        return false;
    } catch (error) {
        // Don't crash on validation error
        return false;
    }
}

// =============================================
// PARENT COMMUNICATION & SESSION AUTHORITY SYSTEM
// =============================================

// Parent Detection and Verification
export function verifyParentPresence() {
    try {
        if (!window.parent || window.parent === window) {
            return false;
        }
        
        try {
            parentOrigin = window.location.origin;
            return true;
        } catch (e) {
            parentOrigin = '*';
            return true;
        }
    } catch (error) {
        return false;
    }
}

// Secure messaging channel setup
export function setupSecureMessagingChannel() {
    try {
        window.removeEventListener('message', handleParentMessage);
        window.addEventListener('message', handleParentMessage, false);
        
        parentCommunicationReady = true;
    } catch (error) {
        console.error('❌ [Communication] Error setting up messaging channel:', error);
        // Continue without messaging channel
    }
}

// Handshake Protocol with exponential backoff
export function startParentHandshake() {
    try {
        if (handshakeInterval) {
            clearInterval(handshakeInterval);
            handshakeInterval = null;
        }
        
        handshakeAttempts = 0;
        
        // Use enhanced handshake protocol
        requestSessionFromParent();
        
        // Keep legacy handshake for compatibility
        sendMessageToParent({
            type: 'CHILD_READY',
            childId: 'settings',
            timestamp: Date.now(),
            version: '1.0',
            source: 'settings-core',
            messageId: generateMessageId()
        });
        
        handshakeInterval = setInterval(() => {
            try {
                if (handshakeAttempts >= MAX_HANDSHAKE_ATTEMPTS) {
                    clearInterval(handshakeInterval);
                    handshakeInterval = null;
                    
                    showReconnectionState();
                    return;
                }
                
                handshakeAttempts++;
                
                if (!parentSessionReceived) {
                    const retryDelay = Math.min(1000 * Math.pow(2, handshakeAttempts - 1), 10000);
                    
                    setTimeout(() => {
                        sendMessageToParent({
                            type: 'REQUEST_SESSION',
                            childId: 'settings',
                            attempt: handshakeAttempts,
                            timestamp: Date.now(),
                            source: 'settings-core',
                            messageId: generateMessageId()
                        });
                    }, retryDelay);
                } else {
                    clearInterval(handshakeInterval);
                    handshakeInterval = null;
                }
            } catch (error) {
                console.error('❌ [Handshake] Error in handshake interval:', error);
                // Continue despite interval error
            }
        }, HANDSHAKE_RETRY_INTERVAL);
    } catch (error) {
        console.error('❌ [Handshake] Error starting parent handshake:', error);
        // Don't crash - allow UI to show fallback state
    }
}

// Generate unique message ID to prevent duplicates
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Send message to parent with safety guards
export function sendMessageToParent(message) {
    try {
        // Safety: Validate parent exists
        if (!window.parent || window.parent === window) {
            return false;
        }
        
        // Safety: Add required fields
        if (!message.source) {
            message.source = 'settings-core';
        }
        if (!message.messageId) {
            message.messageId = generateMessageId();
        }
        if (!message.timestamp) {
            message.timestamp = Date.now();
        }
        
        // Safety: Validate session data before sending
        if (message.type === 'SESSION_DATA' || message.type === 'SESSION_UPDATE') {
            if (!hasValidSessionData(message)) {
                console.warn('⚠️ [Security] Attempted to send invalid session data');
                return false;
            }
        }
        
        window.parent.postMessage(message, parentOrigin || '*');
        return true;
    } catch (error) {
        console.error('❌ [Communication] Error sending message to parent:', error);
        return false;
    }
}

// Validate session data structure
function hasValidSessionData(data) {
    try {
        const session = data.session || data;
        
        if (!session) {
            return false;
        }
        
        // Check for minimum required authentication data
        const hasAuth = session.token || session.accessToken || session.authToken || 
                       session.id_token || session.sessionId || session.userId || 
                       session.id || session.isAuthenticated;
        
        if (!hasAuth) {
            // Allow user-only data for certain message types
            if (session.user && (session.user.id || session.user.email || session.user.username)) {
                return true;
            }
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// Handle messages from parent with comprehensive safety guards
function handleParentMessage(event) {
    // Safety: Wrap entire handler in try/catch
    try {
        // Validate origin first
        if (!validateMessageOrigin(event)) {
            return;
        }
        
        if (!event.data || !event.data.type) return;
        
        // Prevent processing our own messages
        if (event.data.source && event.data.source === 'settings-core') return;
        
        // Safety: Prevent duplicate message processing
        if (event.data.messageId && processedMessageIds.has(event.data.messageId)) {
            return;
        }
        
        // Safety: Validate message structure
        if (!validateIncomingMessageStructure(event.data)) {
            console.warn('⚠️ [Communication] Invalid message structure received');
            return;
        }
        
        const now = Date.now();
        if (now - lastMessageTime < 50) {
            return;
        }
        lastMessageTime = now;
        
        if (processingMessage) {
            return;
        }
        
        processingMessage = true;
        
        try {
            // Add to processed messages set
            if (event.data.messageId) {
                processedMessageIds.add(event.data.messageId);
                // Cleanup old message IDs to prevent memory leak
                if (processedMessageIds.size > 100) {
                    const ids = Array.from(processedMessageIds);
                    processedMessageIds = new Set(ids.slice(-50));
                }
            }
            
            switch (event.data.type) {
                case 'SESSION_DATA':
                    handleEnhancedSessionData(event.data);
                    break;
                    
                case 'SESSION_UPDATE':
                    handleSessionUpdate(event.data);
                    break;
                    
                case 'LOGOUT':
                    handleLogout();
                    break;
                    
                case 'HANDSHAKE_ACK':
                    handleHandshakeAck();
                    break;
                    
                case 'PARENT_READY':
                    handleParentReady();
                    break;
                    
                case 'AUTH_READY':
                    handleAuthReady();
                    break;
                    
                case 'AUTH_LOST':
                    handleAuthLost();
                    break;
                    
                case 'TOKEN_READY':
                    handleTokenReady();
                    break;
                    
                case 'USER_UPDATED':
                    handleUserUpdated(event.data);
                    break;
                    
                default:
                    // Check for enhanced handshake responses
                    if (event.data.type === 'SESSION_DATA' && event.data.source === 'parent') {
                        handleEnhancedSessionData(event.data);
                    }
                    break;
            }
        } catch (error) {
            console.error('❌ [Communication] Error processing parent message:', {
                type: event.data?.type,
                error: error.message,
                timestamp: Date.now()
            });
        } finally {
            processingMessage = false;
        }
    } catch (outerError) {
        console.error('❌ [Communication] Critical error in message handler:', outerError);
        // Don't re-throw - allow other message handlers to continue
    }
}

/**
 * Validate incoming message structure
 */
function validateIncomingMessageStructure(data) {
    try {
        if (!data || typeof data !== 'object') return false;
        if (!data.type || typeof data.type !== 'string') return false;
        if (!data.timestamp || typeof data.timestamp !== 'number') return false;
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Enhanced session data handler with validation
 */
function handleEnhancedSessionData(data) {
    try {
        // Clear handshake timeout
        if (handshakeTimeout) {
            clearTimeout(handshakeTimeout);
            handshakeTimeout = null;
        }
        
        // Validate session data
        if (!data.token && !data.user && !data.session) {
            console.log('❌ [Handshake] Received invalid session from parent');
            handshakeInProgress = false;
            
            // Single retry if not attempted yet
            if (!retryAttempted && handshakeRetryCount < MAX_HANDSHAKE_RETRIES) {
                retryAttempted = true;
                console.log('🔄 [Handshake] Retrying due to invalid session data...');
                setTimeout(requestSessionFromParent, 1000);
            }
            return;
        }
        
        // Validate source verification if provided
        if (data.sourceVerification && !validateSourceVerification(data.sourceVerification)) {
            console.log('❌ [Handshake] Source verification failed');
            handshakeInProgress = false;
            return;
        }
        
        // Session is valid
        sessionValid = true;
        handshakeInProgress = false;
        handshakeRetryCount = 0; // Reset on success
        console.log('✅ [Handshake] Session received successfully');
        
        // Update global state from session
        updateGlobalStateFromSession(data);
        
        // Bind UI only after session validation
        bindUIAfterSession();
    } catch (error) {
        console.error('❌ [Handshake] Error handling enhanced session data:', error);
        handshakeInProgress = false;
        // Don't crash - show reconnection state
        showReconnectionState();
    }
}

/**
 * Validate source verification data
 */
function validateSourceVerification(verification) {
    try {
        // Basic validation - can be enhanced based on requirements
        if (!verification || typeof verification !== 'object') {
            return false;
        }
        
        // Check for required verification fields
        if (verification.timestamp && verification.signature) {
            // Validate timestamp is recent (within 5 minutes)
            const timestamp = parseInt(verification.timestamp);
            const now = Date.now();
            if (now - timestamp > 300000) { // 5 minutes
                return false;
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Update global state from session data
 */
function updateGlobalStateFromSession(sessionData) {
    try {
        // Store session data
        parentSessionData = sessionData.session || sessionData;
        parentSessionReceived = true;
        sessionValidated = true;
        
        // Extract user info
        if (sessionData.user) {
            currentUser = sessionData.user;
        } else if (sessionData.session?.user) {
            currentUser = sessionData.session.user;
        }
        
        // Extract token
        if (sessionData.token || sessionData.session?.token) {
            const token = sessionData.token || sessionData.session.token;
            tokenAvailable = true;
            tokenReady = true;
            authReady = true;
            
            // Store token in api.core.js system
            if (token && token !== 'null' && token !== 'undefined') {
                setUserToken(token);
            }
        }
        
        // Confirm session to parent
        sendMessageToParent({
            type: 'SESSION_CONFIRMED',
            childId: 'settings',
            timestamp: Date.now(),
            received: true,
            validated: true,
            source: 'settings-core',
            messageId: generateMessageId()
        });
    } catch (error) {
        console.error('❌ [Session] Error updating global state:', error);
        // Continue with partial data if possible
    }
}

/**
 * Bind UI only after session is validated
 */
function bindUIAfterSession() {
    try {
        // Initialize UI with session
        initializeUIWithSession();
        
        // Start background tasks if token is ready
        if (!backgroundTasksStarted && tokenReady) {
            startBackgroundTasks();
        }
        
        // Show success notification
        showNotification('Settings loaded successfully', 'success');
    } catch (error) {
        console.error('❌ [UI] Error binding UI after session:', error);
        // Degrade gracefully - show basic UI
        initializeBasicUI();
    }
}

// Validate incoming message structure
function validateIncomingMessage(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.type || typeof data.type !== 'string') return false;
    return true;
}

// Handle HANDSHAKE_ACK
function handleHandshakeAck() {
    sendMessageToParent({
        type: 'CHILD_ACKNOWLEDGED',
        childId: 'settings',
        timestamp: Date.now(),
        source: 'settings-core',
        messageId: generateMessageId()
    });
}

// Handle PARENT_READY
function handleParentReady() {
    // No additional action needed
}

// Handle AUTH_READY
function handleAuthReady() {
    checkTokenAvailability();
}

// Handle AUTH_LOST
function handleAuthLost() {
    tokenReady = false;
    tokenAvailable = false;
    backgroundTasksStarted = false;
}

// Handle TOKEN_READY
function handleTokenReady() {
    checkTokenAvailability();
}

// Handle USER_UPDATED
function handleUserUpdated(data) {
    try {
        if (data.user) {
            currentUser = data.user;
            updateUserUI();
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
        }
    } catch (error) {
        console.error('❌ [User] Error updating user data:', error);
    }
}

// Handle SESSION_DATA message (legacy)
function handleSessionData(data) {
    try {
        if (!validateSessionData(data)) {
            return;
        }
        
        parentSessionData = data.session || data;
        parentSessionReceived = true;
        sessionValidated = true;
        
        if (data.session?.user) {
            currentUser = data.session.user;
        } else if (data.user) {
            currentUser = data.user;
        } else if (data.session?.userId) {
            currentUser = {
                id: data.session.userId,
                displayName: 'User',
                username: 'user'
            };
        }
        
        const hasToken = data.session?.token || data.token || 
                        data.session?.accessToken || data.accessToken;
        if (hasToken) {
            tokenAvailable = true;
            tokenReady = true;
            authReady = true;
        }
        
        sendMessageToParent({
            type: 'SESSION_CONFIRMED',
            childId: 'settings',
            timestamp: Date.now(),
            received: true,
            source: 'settings-core',
            messageId: generateMessageId()
        });
        
        initializeUIWithSession();
        
        if (!backgroundTasksStarted && tokenReady) {
            startBackgroundTasks();
        }
    } catch (error) {
        console.error('❌ [Session] Error handling session data:', error);
    }
}

// Validate session data schema
function validateSessionData(data) {
    try {
        const session = data.session || data;
        
        if (!session) {
            return false;
        }
        
        const hasAuth = session.token || session.accessToken || session.authToken || 
                       session.id_token || session.sessionId || session.userId || 
                       session.id || session.isAuthenticated;
        
        if (!hasAuth) {
            if (session.user && (session.user.id || session.user.email || session.user.username)) {
                return true;
            }
            
            return false;
        }
        
        return true;
        
    } catch (error) {
        return false;
    }
}

// Handle SESSION_UPDATE message
function handleSessionUpdate(data) {
    try {
        if (data.session && data.session.user) {
            currentUser = data.session.user;
            
            updateUserUI();
            
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            
            showNotification('Profile updated', 'success');
        }
    } catch (error) {
        console.error('❌ [Session] Error handling session update:', error);
    }
}

// Handle LOGOUT message
function handleLogout() {
    try {
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        currentUser = null;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        sessionValid = false;
        handshakeInProgress = false;
        handshakeRetryCount = 0;
        
        resetUIForLogout();
        
        sendMessageToParent({
            type: 'LOGOUT_CONFIRMED',
            childId: 'settings',
            timestamp: Date.now(),
            source: 'settings-core',
            messageId: generateMessageId()
        });
    } catch (error) {
        console.error('❌ [Session] Error handling logout:', error);
    }
}

// Initialize UI with session data
function initializeUIWithSession() {
    try {
        initializeUI();
        
        loadFromLocalStorage();
        
        loadSection(currentSection);
        
        startTokenMonitoring();
        
        setTimeout(async () => {
            try {
                await waitForToken(5000);
                if (tokenReady) {
                    startBackgroundTasks();
                }
            } catch (error) {
                // Silent error
            }
        }, 1000);
    } catch (error) {
        console.error('❌ [UI] Error initializing UI with session:', error);
        // Fall back to basic UI
        initializeBasicUI();
    }
}

// Reset UI for logout
export function resetUIForLogout() {
    try {
        const contentContainer = document.getElementById('settingsContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="settings-section">
                    <div class="section-header">
                        <h3><i class="fas fa-sign-out-alt section-icon"></i> Session Ended</h3>
                        <div class="section-description">
                            Your session has ended. Waiting for re-authentication...
                        </div>
                    </div>
                    <div class="section-body">
                        <div style="text-align: center; padding: 40px;">
                            <i class="fas fa-user-clock" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                                Please return to the main app to sign in again.
                            </p>
                            <button class="setting-button" onclick="window.location.href = '/'">
                                <i class="fas fa-home"></i> Return to App
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        const menuContainer = document.getElementById('settingsMenu');
        if (menuContainer) {
            menuContainer.innerHTML = '';
        }
        
        const resetBtn = document.getElementById('resetSectionBtn');
        const saveBtn = document.getElementById('saveSectionBtn');
        if (resetBtn) resetBtn.disabled = true;
        if (saveBtn) saveBtn.disabled = true;
    } catch (error) {
        console.error('❌ [UI] Error resetting UI for logout:', error);
    }
}

// Show reconnection state
export function showReconnectionState() {
    try {
        const contentContainer = document.getElementById('settingsContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="settings-section">
                    <div class="section-header">
                        <h3><i class="fas fa-unlink section-icon"></i> Connection Lost</h3>
                        <div class="section-description">
                            Unable to establish connection with parent app
                        </div>
                    </div>
                    <div class="section-body">
                        <div style="text-align: center; padding: 40px;">
                            <i class="fas fa-sync-alt" style="font-size: 48px; color: var(--text-secondary); margin-bottom: 20px;"></i>
                            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                                Attempting to reconnect...
                            </p>
                            <div class="loading-spinner" style="margin: 0 auto;"></div>
                            <p style="color: var(--text-secondary); margin-top: 20px; font-size: 14px;">
                                If this persists, try refreshing the page or returning to the main app.
                            </p>
                            <button class="setting-button" onclick="location.reload()" style="margin-top: 20px;">
                                <i class="fas fa-redo"></i> Retry Connection
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ [UI] Error showing reconnection state:', error);
    }
}

// Authentication Enforcement - Check if protected UI should be shown
export function checkAuthenticationState() {
    try {
        if (!parentSessionReceived || !sessionValidated) {
            return false;
        }
        
        if (!tokenReady && !authReady) {
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// STABILIZED BOOTSTRAP FUNCTION
// =============================================

export async function bootstrapIframe() {
    try {
        if (!verifyParentPresence()) {
            showReconnectionState();
            return false;
        }
        
        setupSecureMessagingChannel();
        
        // Start enhanced handshake protocol
        startParentHandshake();
        
        initializeBasicUI();
        
        await loadFromLocalStorage();
        
        const sessionReceived = await waitForSession(10000);
        
        if (sessionReceived) {
            return true;
        } else {
            showReconnectionState();
            return false;
        }
        
    } catch (error) {
        console.error('❌ [Bootstrap] Error bootstrapping iframe:', error);
        initializeBasicUI();
        showReconnectionState();
        
        return false;
    }
}

// Wait for session data from parent
export function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (parentSessionReceived && sessionValidated) {
            resolve(true);
            return;
        }
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (parentSessionReceived && sessionValidated) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
    });
}

// Initialize basic UI (non-protected parts)
export function initializeBasicUI() {
    try {
        buildSettingsMenu();
        
        setupBasicEventListeners();
        
        const cachedSettings = localStorage.getItem('knecta_user_settings');
        if (cachedSettings) {
            try {
                const settings = JSON.parse(cachedSettings);
                if (settings.appearance && settings.appearance.theme) {
                    applyTheme(settings.appearance.theme);
                }
                if (settings.appearance && settings.appearance.accentColor) {
                    updateAccentColor(settings.appearance.accentColor);
                }
            } catch (e) {
                // Silent error
            }
        }
    } catch (error) {
        console.error('❌ [UI] Error initializing basic UI:', error);
        // Continue with minimal UI
    }
}

// Setup basic event listeners
export function setupBasicEventListeners() {
    try {
        const backToAppBtn = document.getElementById('backToAppBtn');
        if (backToAppBtn) {
            backToAppBtn.addEventListener('click', () => {
                if (unsavedChanges) {
                    showConfirmation(
                        'Unsaved Changes',
                        'You have unsaved changes. Are you sure you want to leave?',
                        () => {
                            sendMessageToParent({
                                type: 'CHILD_CLOSING',
                                childId: 'settings',
                                timestamp: Date.now(),
                                source: 'settings-core'
                            });
                        }
                    );
                } else {
                    sendMessageToParent({
                        type: 'CHILD_CLOSING',
                        childId: 'settings',
                        timestamp: Date.now(),
                        source: 'settings-core'
                    });
                }
            });
        }
        
        const settingsSearch = document.getElementById('settingsSearch');
        if (settingsSearch) {
            settingsSearch.addEventListener('input', function(e) {
                if (parentSessionReceived) {
                    searchSettings(e.target.value);
                }
            });
        }
        
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    } catch (error) {
        console.error('❌ [UI] Error setting up event listeners:', error);
    }
}

// =============================================
// TOKEN MANAGEMENT SYSTEM
// =============================================

// Start token monitoring system
export function startTokenMonitoring() {
    try {
        if (tokenCheckInterval) {
            clearInterval(tokenCheckInterval);
            tokenCheckInterval = null;
        }
        
        tokenCheckInterval = setInterval(() => {
            try {
                checkTokenAvailability();
            } catch (error) {
                // Silent error in interval
            }
        }, TOKEN_CHECK_INTERVAL);
        
        setTimeout(checkTokenAvailability, 500);
    } catch (error) {
        console.error('❌ [Token] Error starting token monitoring:', error);
    }
}

// Check token availability from parent or api.core.js
export function checkTokenAvailability() {
    try {
        if (parentSessionData && parentSessionData.token) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                
                notifyTokenReady();
            }
            return;
        }
        
        if (!tokenAvailable) {
            const token = getUserToken();
            if (token && token !== '') {
                tokenAvailable = true;
                tokenReady = true;
                
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                
                notifyTokenReady();
            } else if (tokenAvailable) {
                tokenAvailable = false;
                tokenReady = false;
                notifyTokenLost();
            }
        } else {
            const token = getUserToken();
            if (!token || token === '') {
                tokenAvailable = false;
                tokenReady = false;
                notifyTokenLost();
            }
        }
    } catch (error) {
        // Silent error
    }
}

// Notify that token is ready
export function notifyTokenReady() {
    try {
        authReady = true;
        
        if (!backgroundTasksStarted) {
            startBackgroundTasks();
        }
        
        notifyParentAuthState(true);
    } catch (error) {
        console.error('❌ [Token] Error notifying token ready:', error);
    }
}

// Notify that token is lost
export function notifyTokenLost() {
    try {
        authReady = false;
        backgroundTasksStarted = false;
        
        notifyParentAuthState(false);
    } catch (error) {
        console.error('❌ [Token] Error notifying token lost:', error);
    }
}

// Get secure token from parent or api.core.js
export function getSecureToken() {
    try {
        if (parentSessionData && parentSessionData.token) {
            return parentSessionData.token;
        }
        
        const token = getUserToken();
        if (token && token !== '') {
            return token;
        }
        
        const legacyTokens = [
            localStorage.getItem('USER_TOKEN'),
            localStorage.getItem('accessToken'),
            localStorage.getItem('moodchat_token'),
            localStorage.getItem('authToken')
        ];
        
        for (const legacyToken of legacyTokens) {
            if (legacyToken && legacyToken !== 'null' && legacyToken !== 'undefined') {
                setUserToken(legacyToken);
                
                return legacyToken;
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// Secure API request using parent session or centralized token system
export async function secureFetchWrapper(endpoint, method = 'GET', data = null) {
    try {
        if (!tokenAvailable && !parentSessionReceived) {
            throw new Error('Authentication not available');
        }
        
        // Validate endpoint
        if (!endpoint || typeof endpoint !== 'string') {
            throw new Error('Invalid endpoint URL');
        }
        
        // Ensure endpoint is properly formatted
        let normalizedEndpoint = endpoint.trim();
        if (!normalizedEndpoint.startsWith('/')) {
            normalizedEndpoint = '/' + normalizedEndpoint;
        }
        
        // Security: Validate endpoint doesn't contain suspicious patterns
        const suspiciousPatterns = ['..', '//', '\\', 'javascript:', 'data:', 'vbscript:'];
        for (const pattern of suspiciousPatterns) {
            if (normalizedEndpoint.includes(pattern)) {
                throw new Error(`Invalid endpoint format: ${pattern}`);
            }
        }
        
        // Get secure token with validation
        const token = getSecureToken();
        if (!token || token === 'null' || token === 'undefined') {
            throw new Error('Authentication token not available');
        }
        
        // Validate token format (basic check)
        if (token.length < 10) {
            throw new Error('Invalid token format');
        }
        
        // Call secureFetch with correct parameter order: URL first
        const response = await secureFetch(normalizedEndpoint, method, data);
        
        return response;
        
    } catch (error) {
        // Normalize error handling
        let errorMessage = 'Request failed';
        let errorCode = 'UNKNOWN_ERROR';
        
        if (error.message) {
            errorMessage = error.message;
            
            // Classify errors
            if (error.message.includes('401') || error.message.includes('unauthorized')) {
                errorCode = 'AUTH_ERROR';
                tokenAvailable = false;
                tokenReady = false;
                notifyParentAuthError();
            } else if (error.message.includes('403')) {
                errorCode = 'FORBIDDEN';
            } else if (error.message.includes('404')) {
                errorCode = 'NOT_FOUND';
            } else if (error.message.includes('Network') || error.message.includes('fetch')) {
                errorCode = 'NETWORK_ERROR';
                errorMessage = 'Network error: Unable to reach server';
            } else if (error.message.includes('timeout')) {
                errorCode = 'TIMEOUT_ERROR';
                errorMessage = 'Request timeout: Server not responding';
            }
        }
        
        // Preserve settings state by not clearing on network errors
        if (errorCode !== 'NETWORK_ERROR' && errorCode !== 'TIMEOUT_ERROR') {
            // Only clear auth state on auth errors
            if (errorCode === 'AUTH_ERROR') {
                // Don't clear local settings on auth errors
                showNotification('Authentication error - please sign in again', 'error');
            }
        }
        
        // Create enhanced error object
        const enhancedError = new Error(errorMessage);
        enhancedError.code = errorCode;
        enhancedError.endpoint = endpoint;
        enhancedError.timestamp = Date.now();
        
        // Prevent silent failures by re-throwing
        throw enhancedError;
    }
}

// Wait for token to be ready
export function waitForToken(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (tokenReady) {
            resolve(true);
            return;
        }
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (tokenReady) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
    });
}

// =============================================
// STABILIZED AUTH HANDLING
// =============================================

// Start passive auth monitoring
export function startPassiveAuthMonitoring() {
    try {
        if (authCheckInterval) {
            clearInterval(authCheckInterval);
            authCheckInterval = null;
        }
        
        authCheckInterval = setInterval(() => {
            try {
                checkAuthStatePassively();
            } catch (error) {
                // Silent error in interval
            }
        }, AUTH_CHECK_INTERVAL);
        
        setTimeout(checkAuthStatePassively, 1000);
    } catch (error) {
        console.error('❌ [Auth] Error starting passive auth monitoring:', error);
    }
}

// Check auth state passively
function checkAuthStatePassively() {
    try {
        checkTokenAvailability();
    } catch (error) {
        // Silent error
    }
}

// Start background tasks
export function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) {
            return;
        }
        
        if (!tokenReady && !parentSessionReceived) {
            return;
        }
        
        backgroundTasksStarted = true;
        
        Promise.allSettled([
            safeLoadUserData(),
            safeLoadSettings(),
            safeLoadBlockedUsers(),
            safeLoadActiveSessions(),
            safeLoadUserContacts(),
            safeLoadUserGroups()
        ]).then(results => {
            showNotification('Settings synced with server', 'success');
        }).catch(error => {
            // Silent error
        });
    } catch (error) {
        console.error('❌ [Background] Error starting background tasks:', error);
        backgroundTasksStarted = false;
    }
}

// Safe wrapper for user data loading
export async function safeLoadUserData() {
    if (!tokenReady && !parentSessionReceived) {
        return;
    }
    
    try {
        if (parentSessionData && parentSessionData.user) {
            currentUser = parentSessionData.user;
            
            updateUserUI();
            
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            return;
        }
        
        const response = await getCurrentUser();
        if (response && response.user) {
            currentUser = response.user;
            
            updateUserUI();
            
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
        }
    } catch (error) {
        // Silent error
    }
}

// Safe wrapper for settings loading
export async function safeLoadSettings() {
    if (!tokenReady && !parentSessionReceived) {
        return;
    }
    
    try {
        const response = await secureFetchWrapper('/api/settings', 'GET');
        if (response && response.settings) {
            userSettings = response.settings;
            
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            
            localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
            
            calculateStorageUsage();
        }
    } catch (error) {
        // Silent error
    }
}

// Safe wrapper for blocked users
export async function safeLoadBlockedUsers() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('/api/users/blocked', 'GET');
        if (response && response.blockedUsers) {
            blockedUsers = response.blockedUsers;
        }
    } catch (error) {
        // Silent error
    }
}

// Safe wrapper for active sessions
export async function safeLoadActiveSessions() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('/api/auth/sessions', 'GET');
        if (response && response.sessions) {
            activeSessions = response.sessions;
        }
    } catch (error) {
        // Silent error
    }
}

// Safe wrapper for user contacts
export async function safeLoadUserContacts() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('/api/contacts', 'GET');
        if (response && response.contacts) {
            userContacts = response.contacts;
        }
    } catch (error) {
        // Silent error
    }
}

// Safe wrapper for user groups
export async function safeLoadUserGroups() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('/api/group', 'GET');
        if (response && response.groups) {
            userGroups = response.groups;
        }
    } catch (error) {
        // Silent error
    }
}

// =============================================
// STABILIZED REQUEST HANDLING
// =============================================

// Safe request wrapper
export async function makeSafeRequest(endpoint, method = 'GET', data = null) {
    if (!tokenReady && !parentSessionReceived) {
        throw new Error('Authentication not available');
    }
    
    return await secureFetchWrapper(endpoint, method, data);
}

// Save settings safely
export async function saveSettings() {
    try {
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        if (tokenReady || parentSessionReceived) {
            await secureFetchWrapper('/api/settings', 'POST', { settings: userSettings });
        }
        
        unsavedChanges = false;
        updateSaveButton();
        showNotification('Settings saved successfully', 'success');
        
    } catch (error) {
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        showNotification('Error saving to server, saved locally', 'warning');
    }
}

// =============================================
// PARENT COMMUNICATION
// =============================================

// Notify parent about auth state
export function notifyParentAuthState(hasAuth) {
    try {
        sendMessageToParent({
            type: 'IFRAME_AUTH_STATE',
            hasAuth: hasAuth,
            iframeId: 'settings',
            tokenReady: tokenReady,
            timestamp: Date.now(),
            source: 'settings-core',
            messageId: generateMessageId()
        });
    } catch (error) {
        // Silent error
    }
}

// Notify parent about auth error
let authErrorNotified = false;
export function notifyParentAuthError() {
    if (authErrorNotified) return;
    
    try {
        sendMessageToParent({
            type: 'IFRAME_AUTH_ERROR',
            iframeId: 'settings',
            message: 'Authentication required',
            tokenExpired: true,
            timestamp: Date.now(),
            source: 'settings-core',
            messageId: generateMessageId()
        });
        authErrorNotified = true;
    } catch (error) {
        // Silent error
    }
}

// =============================================
// STABILIZED INITIALIZATION
// =============================================

// Load from localStorage as fallback
export async function loadFromLocalStorage() {
    try {
        const cachedUser = localStorage.getItem('knecta_current_user');
        if (cachedUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                
                updateUserUI();
            } catch (e) {
                currentUser = { displayName: 'User' };
            }
        } else {
            currentUser = { displayName: 'User' };
        }
        
        const savedSettings = localStorage.getItem('knecta_user_settings');
        if (savedSettings) {
            try {
                userSettings = JSON.parse(savedSettings);
            } catch (e) {
                userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } else {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        
        Object.keys(DEFAULT_SETTINGS).forEach(section => {
            if (!userSettings[section]) {
                userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
            }
        });
        
        calculateStorageUsage();
    } catch (error) {
        console.error('❌ [Storage] Error loading from localStorage:', error);
        // Initialize with defaults
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        currentUser = { displayName: 'User' };
    }
}

// Update user UI elements
export function updateUserUI() {
    try {
        if (!currentUser) return;
        
        const userNamePreview = document.getElementById('userNamePreview');
        const userAvatarPreview = document.getElementById('userAvatarPreview');
        
        if (userNamePreview) {
            userNamePreview.textContent = currentUser.displayName || 
                                         currentUser.username || 
                                         currentUser.email?.split('@')[0] || 
                                         'User';
        }
        
        if (userAvatarPreview) {
            if (currentUser.photoURL || currentUser.avatar || currentUser.profilePicture) {
                const photoUrl = currentUser.photoURL || currentUser.avatar || currentUser.profilePicture;
                userAvatarPreview.style.backgroundImage = `url('${photoUrl}')`;
                userAvatarPreview.innerHTML = '';
            } else {
                const displayName = currentUser.displayName || currentUser.username || currentUser.email || 'User';
                const initials = displayName
                    .split(' ')
                    .map(word => word[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2);
                
                userAvatarPreview.style.backgroundImage = '';
                userAvatarPreview.innerHTML = `<span style="color: var(--text-secondary); font-size: 18px;">${initials}</span>`;
            }
        }
    } catch (error) {
        console.error('❌ [UI] Error updating user UI:', error);
    }
}

// Initialize UI
export function initializeUI() {
    try {
        buildSettingsMenu();
        
        setupEventListeners();
        
        updateUserStatus();
        
        initializeColorPicker();
        
        if (userSettings.appearance && userSettings.appearance.theme) {
            applyTheme(userSettings.appearance.theme);
        }
        
        if (userSettings.appearance && userSettings.appearance.accentColor) {
            updateAccentColor(userSettings.appearance.accentColor);
        }
        
        const resetBtn = document.getElementById('resetSectionBtn');
        const saveBtn = document.getElementById('saveSectionBtn');
        if (resetBtn) resetBtn.disabled = !(tokenReady || parentSessionReceived);
        if (saveBtn) saveBtn.disabled = !(tokenReady || parentSessionReceived);
        updateSaveButton();
    } catch (error) {
        console.error('❌ [UI] Error initializing UI:', error);
        // Fall back to basic initialization
        initializeBasicUI();
    }
}

// =============================================
// CORE FUNCTION IMPLEMENTATIONS
// =============================================

// Setup event listeners
export function setupEventListeners() {
    try {
        const saveBtn = document.getElementById('saveSectionBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveSettings();
            });
        }
        
        const resetBtn = document.getElementById('resetSectionBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resetCurrentSection();
            });
        }
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                toggleTheme();
            });
        }
        
        const fontSizeIncrease = document.getElementById('fontSizeIncrease');
        const fontSizeDecrease = document.getElementById('fontSizeDecrease');
        const fontSizeReset = document.getElementById('fontSizeReset');
        
        if (fontSizeIncrease) {
            fontSizeIncrease.addEventListener('click', () => {
                changeFontSize('increase');
            });
        }
        
        if (fontSizeDecrease) {
            fontSizeDecrease.addEventListener('click', () => {
                changeFontSize('decrease');
            });
        }
        
        if (fontSizeReset) {
            fontSizeReset.addEventListener('click', () => {
                changeFontSize('reset');
            });
        }
    } catch (error) {
        console.error('❌ [UI] Error setting up event listeners:', error);
    }
}

// Load section
export function loadSection(sectionId) {
    try {
        const contentContainer = document.getElementById('settingsContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="settings-section">
                    <div class="section-header">
                        <h3><i class="fas fa-cog section-icon"></i> ${sectionId}</h3>
                        <div class="section-description">
                            Loading ${sectionId} settings...
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ [UI] Error loading section:', error);
    }
}

// Show notification
export function showNotification(message, type = 'info') {
    try {
        const notification = document.createElement('div');
        notification.className = `settings-notification settings-notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const container = document.getElementById('notificationContainer') || document.body;
        container.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
        
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (notification.parentNode) {
                    notification.classList.add('fade-out');
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }
            });
        }
    } catch (error) {
        console.error('❌ [UI] Error showing notification:', error);
    }
}

// Show confirmation dialog
export function showConfirmation(title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel') {
    try {
        const modal = document.createElement('div');
        modal.className = 'settings-confirmation-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="modal-button cancel">${cancelText}</button>
                    <button class="modal-button confirm">${confirmText}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('.modal-button.cancel');
        const confirmBtn = modal.querySelector('.modal-button.confirm');
        const overlay = modal.querySelector('.modal-overlay');
        
        const closeModal = () => {
            modal.classList.add('fade-out');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        };
        
        closeBtn.addEventListener('click', () => {
            if (onCancel && typeof onCancel === 'function') onCancel();
            closeModal();
        });
        
        cancelBtn.addEventListener('click', () => {
            if (onCancel && typeof onCancel === 'function') onCancel();
            closeModal();
        });
        
        confirmBtn.addEventListener('click', () => {
            if (onConfirm && typeof onConfirm === 'function') onConfirm();
            closeModal();
        });
        
        overlay.addEventListener('click', () => {
            if (onCancel && typeof onCancel === 'function') onCancel();
            closeModal();
        });
    } catch (error) {
        console.error('❌ [UI] Error showing confirmation dialog:', error);
    }
}

// Update save button
export function updateSaveButton() {
    try {
        const saveBtn = document.getElementById('saveSectionBtn');
        if (saveBtn) {
            saveBtn.disabled = !unsavedChanges;
            saveBtn.textContent = unsavedChanges ? 'Save Changes' : 'No Changes';
            saveBtn.title = unsavedChanges ? 'You have unsaved changes' : 'All changes are saved';
        }
    } catch (error) {
        console.error('❌ [UI] Error updating save button:', error);
    }
}

// Search settings
export function searchSettings(query) {
    // Search implementation
}

// Apply theme
export function applyTheme(theme) {
    try {
        document.documentElement.setAttribute('data-theme', theme);
    } catch (error) {
        console.error('❌ [UI] Error applying theme:', error);
    }
}

// Update accent color
export function updateAccentColor(color) {
    try {
        document.documentElement.style.setProperty('--accent-color', color);
    } catch (error) {
        console.error('❌ [UI] Error updating accent color:', error);
    }
}

// Initialize color picker
export function initializeColorPicker() {
    // Color picker initialization
}

// Update user status
export function updateUserStatus() {
    // User status update
}

// Reset current section
export function resetCurrentSection() {
    // Reset section implementation
}

// Toggle theme
export function toggleTheme() {
    // Theme toggle implementation
}

// Change font size
export function changeFontSize(action) {
    // Font size change implementation
}

// Calculate storage usage
export function calculateStorageUsage() {
    // Storage calculation
}

// Format storage size
export function formatStorageSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get mood text
export function getMoodText(mood) {
    const moodTexts = {
        neutral: 'Neutral',
        happy: 'Happy',
        calm: 'Calm',
        energetic: 'Energetic',
        focused: 'Focused',
        relaxed: 'Relaxed',
        stressed: 'Stressed',
        tired: 'Tired',
        excited: 'Excited'
    };
    return moodTexts[mood] || 'Neutral';
}

// Get mood color
export function getMoodColor(mood) {
    const colors = {
        neutral: '#A9A9A9',
        happy: '#FFD700',
        calm: '#4A90E2',
        energetic: '#FF6B6B',
        focused: '#7B68EE',
        relaxed: '#4ECDC4',
        stressed: '#FF8C00',
        tired: '#808080',
        excited: '#FF1493'
    };
    return colors[mood] || '#A9A9A9';
}

// Terminate session
export async function terminateSession(sessionId) {
    try {
        await makeSafeRequest('/api/auth/terminate-session', 'POST', { sessionId });
        showNotification('Session terminated', 'success');
        await safeLoadActiveSessions();
        showActiveSessions();
    } catch (error) {
        showNotification('Error terminating session', 'error');
    }
}

// Terminate all sessions
export async function terminateAllSessions() {
    try {
        await makeSafeRequest('/api/auth/terminate-all-sessions', 'POST');
        showNotification('All other sessions terminated', 'success');
        await safeLoadActiveSessions();
        showActiveSessions();
    } catch (error) {
        showNotification('Error terminating sessions', 'error');
    }
}

// Unblock user
export async function unblockUser(userId) {
    try {
        await makeSafeRequest('/api/users/unblock', 'POST', { userId });
        showNotification('User unblocked', 'success');
        await safeLoadBlockedUsers();
        showBlockedUsers();
    } catch (error) {
        showNotification('Error unblocking user', 'error');
    }
}

// Clear chat cache
export async function clearChatCache() {
    try {
        await makeSafeRequest('/api/storage/clear-chat-cache', 'POST');
        
        userSettings.storage.storageBreakdown.chats = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.media + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Chat cache cleared', 'success');
        
    } catch (error) {
        showNotification('Error clearing chat cache', 'error');
    }
}

// Clear media cache
export async function clearMediaCache() {
    try {
        await makeSafeRequest('/api/storage/clear-media-cache', 'POST');
        
        userSettings.storage.storageBreakdown.media = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.chats + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Media cache cleared', 'success');
        
    } catch (error) {
        showNotification('Error clearing media cache', 'error');
    }
}

// Show active sessions
export function showActiveSessions() {
    // Show active sessions implementation
}

// Show blocked users
export function showBlockedUsers() {
    // Show blocked users implementation
}

// =============================================
// AUTO-START HANDSHAKE ON LOAD
// =============================================

// Auto-initialize handshake when document is ready
document.addEventListener('DOMContentLoaded', function() {
    try {
        if (window.parent !== window) {
            // Small delay to ensure everything is loaded
            setTimeout(() => {
                requestSessionFromParent();
            }, 100);
        }
    } catch (error) {
        console.error('❌ [Handshake] Error in auto-start handshake:', error);
        // Don't crash - allow page to load without handshake
    }
});

// Export enhanced handshake functions
export { requestSessionFromParent, validateMessageOrigin };