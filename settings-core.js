// =============================================
// SETTINGS CORE - STABILIZED IMPLEMENTATION (ES MODULES)
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

// AUTH STATE FLAGS (read-only observers)
export let authReady = false;
export let apiInitialized = true; // ES modules are always initialized
let apiInitRetries = 0;
export const MAX_API_RETRIES = 5;
export let backgroundTasksStarted = false;
let authCheckInterval = null;
export const AUTH_CHECK_INTERVAL = 30000; // 30 seconds

// Token system flags
export let tokenReady = false;
export let tokenAvailable = false;
export let tokenInitialized = false;
export const TOKEN_CHECK_INTERVAL = 1000; // Check token every 1 second
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

// Default settings structure (222 features organized by section)
export const DEFAULT_SETTINGS = {
    // PROFILE SECTION (22 features)
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
    
    // SECURITY SECTION (11 features)
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
    
    // PRIVACY SECTION (25 features)
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
    
    // CHAT SECTION (12 features)
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
    
    // FRIENDS SECTION (10 features)
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
    
    // GROUPS SECTION (15 features)
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
    
    // CALLS SECTION (18 features)
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
    
    // STATUS SECTION (12 features)
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
    
    // NOTIFICATIONS SECTION (13 features)
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
    
    // APPEARANCE SECTION (13 features)
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
    
    // STORAGE SECTION (7 features)
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
    
    // MOOD SETTINGS SECTION (24 features)
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
    
    // SMART ACTIVITY SECTION (18 features)
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
    
    // INTERACTION INTELLIGENCE SECTION (23 features)
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
    
    // PERSONALIZATION SECTION (17 features)
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
    
    // SAFETY & PRIVACY+ SECTION (19 features)
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
    
    // ADVANCED SECTION (10 features)
    advanced: {
        offlineMode: false,
        intranetSupport: false,
        lowBandwidthMode: false,
        debugMode: false,
        proxySettings: {},
        dataSaver: false
    },
    
    // BACKUP & RESTORE SECTION (11 features)
    backup: {
        autoBackup: true,
        backupFrequency: 'weekly',
        backupLocation: 'cloud',
        lastBackup: null,
        backupSize: 0
    },
    
    // DANGER ZONE SECTION (7 features)
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
 * @param {HTMLElement} container - Container element to render menu into
 * @param {Object} config - Configuration options for menu rendering
 * @param {boolean} config.sessionAware - Whether to check authentication state
 * @param {boolean} config.iframeCompatible - Whether to handle iframe-specific logic
 * @param {string} config.activeSection - Currently active section ID
 * @param {Function} config.onSectionChange - Callback when section changes
 */
export function buildSettingsMenu(container = null, config = {}) {
    const {
        sessionAware = true,
        iframeCompatible = true,
        activeSection = currentSection,
        onSectionChange = null
    } = config;
    
    console.log('[Settings] Building dynamic menu', {
        sessionAware,
        iframeCompatible,
        activeSection,
        hasContainer: !!container
    });
    
    try {
        // Get container if not provided
        if (!container) {
            container = document.getElementById('settingsMenu');
        }
        
        // Validate container exists
        if (!container) {
            console.warn('[Settings] No container found for menu');
            return false;
        }
        
        // Check authentication state if session aware
        let canShowProtectedUI = true;
        if (sessionAware) {
            canShowProtectedUI = checkAuthenticationState();
            if (!canShowProtectedUI) {
                console.log('[Settings] Authentication check failed, showing limited menu');
            }
        }
        
        // Clear existing menu
        container.innerHTML = '';
        
        // Create menu wrapper
        const menuWrapper = document.createElement('div');
        menuWrapper.className = 'settings-menu-wrapper';
        menuWrapper.setAttribute('data-iframe-compatible', iframeCompatible);
        menuWrapper.setAttribute('data-session-aware', sessionAware);
        menuWrapper.setAttribute('data-auth-state', canShowProtectedUI ? 'authenticated' : 'unauthenticated');
        
        // Filter menu items based on authentication
        const menuItems = filterMenuItems(SETTINGS_MENU, {
            canShowProtectedUI,
            iframeCompatible
        });
        
        // Generate menu HTML
        const menuHTML = generateMenuHTML(menuItems, {
            activeSection,
            canShowProtectedUI
        });
        
        menuWrapper.innerHTML = menuHTML;
        container.appendChild(menuWrapper);
        
        // Add event listeners to menu items
        attachMenuEventListeners(menuWrapper, {
            onSectionChange,
            canShowProtectedUI
        });
        
        // Add accessibility attributes
        enhanceMenuAccessibility(menuWrapper);
        
        // Log menu build completion
        console.log(`[Settings] Menu built with ${menuItems.length} items, active: ${activeSection}`);
        
        return true;
        
    } catch (error) {
        console.error('[Settings] Error building menu:', error);
        
        // Show fallback menu on error
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
        // Always show non-danger items in unauthenticated state
        if (!canShowProtectedUI) {
            // Show only safe, non-danger sections
            return !item.danger && 
                   !['security', 'privacy', 'danger', 'backup'].includes(item.id);
        }
        
        // In iframe mode, filter out items that require parent navigation
        if (iframeCompatible && item.requiresParentNavigation) {
            return false;
        }
        
        // Show all items when authenticated
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
        
        // Click handler
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.classList.contains('disabled')) {
                console.log(`[Settings] Section ${sectionId} is disabled`);
                return;
            }
            
            handleSectionChange(sectionId, {
                onSectionChange,
                canShowProtectedUI
            });
        });
        
        // Keyboard navigation
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
            }
            
            // Arrow key navigation
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
    
    console.log(`[Settings] Section change requested: ${sectionId}`);
    
    // Check if we can access this section
    if (!canShowProtectedUI && requiresAuthentication(sectionId)) {
        showAuthenticationRequiredMessage();
        return;
    }
    
    // Check for unsaved changes
    if (unsavedChanges && sectionId !== currentSection) {
        showUnsavedChangesWarning(sectionId);
        return;
    }
    
    // Update current section
    currentSection = sectionId;
    
    // Update UI
    updateActiveMenuState(sectionId);
    
    // Call external callback if provided
    if (onSectionChange && typeof onSectionChange === 'function') {
        onSectionChange(sectionId);
    }
    
    // Load the section
    loadSection(sectionId);
    
    // Notify parent if in iframe mode
    if (window.parent !== window) {
        sendMessageToParent({
            type: 'SECTION_CHANGE',
            childId: 'settings',
            section: sectionId,
            timestamp: Date.now()
        });
    }
}

/**
 * Updates active state in menu
 */
function updateActiveMenuState(activeSectionId) {
    const menuWrapper = document.querySelector('.settings-menu-wrapper');
    if (!menuWrapper) return;
    
    // Remove active class from all items
    const allItems = menuWrapper.querySelectorAll('.settings-menu-item');
    allItems.forEach(item => {
        item.classList.remove('active');
        const arrow = item.querySelector('.menu-item-arrow');
        if (arrow) arrow.remove();
    });
    
    // Add active class to current item
    const activeItem = menuWrapper.querySelector(`[data-section="${activeSectionId}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        
        // Add arrow indicator
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
        
        // Auto-select on arrow navigation with Enter
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
    console.warn('[Settings] Showing fallback menu due to error:', error.message);
    
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
                <small>Limited menu due to error: ${error.message}</small>
            </div>
        </div>
    `;
    
    container.innerHTML = fallbackHTML;
    
    // Add basic event listeners to fallback
    const fallbackItems = container.querySelectorAll('.fallback-item');
    fallbackItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            currentSection = sectionId;
            loadSection(sectionId);
            
            // Update active state
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
    
    // Visual feedback
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
            // Save and switch
            saveSettings().then(() => {
                handleSectionChange(nextSectionId, {
                    onSectionChange: null,
                    canShowProtectedUI: true
                });
            });
        },
        () => {
            // Discard and switch
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
// PARENT COMMUNICATION & SESSION AUTHORITY SYSTEM
// =============================================

// Parent Detection and Verification
export function verifyParentPresence() {
    try {
        if (!window.parent || window.parent === window) {
            console.warn('[Settings] No parent window detected');
            return false;
        }
        
        // Try to get parent origin (with same-origin check)
        try {
            // For same-origin, we can access parent location
            parentOrigin = window.location.origin;
            console.log('[Settings] Parent detected (same-origin):', parentOrigin);
            return true;
        } catch (e) {
            // Cross-origin case - we'll use '*' for postMessage
            parentOrigin = '*';
            console.log('[Settings] Parent detected (cross-origin)');
            return true;
        }
    } catch (error) {
        console.warn('[Settings] Parent verification error:', error.message);
        return false;
    }
}

// Secure messaging channel setup
export function setupSecureMessagingChannel() {
    console.log('[Settings] Setting up secure messaging channel with parent');
    
    // Clear any existing listeners
    window.removeEventListener('message', handleParentMessage);
    
    // Add secure message listener
    window.addEventListener('message', handleParentMessage, false);
    
    parentCommunicationReady = true;
    console.log('[Settings] Secure messaging channel established');
}

// Handshake Protocol with exponential backoff
export function startParentHandshake() {
    console.log('[Settings] Starting parent handshake protocol');
    
    // Clear any existing handshake interval
    if (handshakeInterval) {
        clearInterval(handshakeInterval);
        handshakeInterval = null;
    }
    
    handshakeAttempts = 0;
    
    // Send initial CHILD_READY message
    sendMessageToParent({
        type: 'CHILD_READY',
        childId: 'settings',
        timestamp: Date.now(),
        version: '1.0'
    });
    
    // Start handshake retry with exponential backoff
    handshakeInterval = setInterval(() => {
        if (handshakeAttempts >= MAX_HANDSHAKE_ATTEMPTS) {
            console.error('[Settings] Max handshake attempts reached');
            clearInterval(handshakeInterval);
            handshakeInterval = null;
            
            // Show reconnection state
            showReconnectionState();
            return;
        }
        
        handshakeAttempts++;
        
        if (!parentSessionReceived) {
            // Send REQUEST_SESSION with exponential backoff
            const retryDelay = Math.min(1000 * Math.pow(2, handshakeAttempts - 1), 10000);
            
            setTimeout(() => {
                sendMessageToParent({
                    type: 'REQUEST_SESSION',
                    childId: 'settings',
                    attempt: handshakeAttempts,
                    timestamp: Date.now()
                });
                console.log(`[Settings] Session request sent (attempt ${handshakeAttempts}/${MAX_HANDSHAKE_ATTEMPTS})`);
            }, retryDelay);
        } else {
            // Session received, stop handshake
            clearInterval(handshakeInterval);
            handshakeInterval = null;
            console.log('[Settings] Handshake completed successfully');
        }
    }, HANDSHAKE_RETRY_INTERVAL);
}

// Send message to parent
export function sendMessageToParent(message) {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, parentOrigin || '*');
            console.log('[Settings] Sent to parent:', message.type);
            return true;
        }
        return false;
    } catch (error) {
        console.warn('[Settings] Failed to send message to parent:', error.message);
        return false;
    }
}

// Handle messages from parent
function handleParentMessage(event) {
    // Validate message source
    if (!event.data || !event.data.type) return;
    
    console.log('[Settings] Received from parent:', event.data.type);
    
    switch (event.data.type) {
        case 'SESSION_DATA':
            handleSessionData(event.data);
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
    }
}

// Handle SESSION_DATA message
function handleSessionData(data) {
    console.log('[Settings] Processing SESSION_DATA from parent');
    
    // Validate session data schema
    if (!validateSessionData(data)) {
        console.error('[Settings] Invalid session data schema');
        sendMessageToParent({
            type: 'SESSION_ERROR',
            childId: 'settings',
            error: 'Invalid session data schema',
            timestamp: Date.now()
        });
        return;
    }
    
    // Store session data
    parentSessionData = data.session;
    parentSessionReceived = true;
    sessionValidated = true;
    
    // Update local state
    if (data.session.user) {
        currentUser = data.session.user;
        console.log('[Settings] User data received from parent:', currentUser.displayName || currentUser.username);
    }
    
    // Update auth flags
    if (data.session.token) {
        tokenAvailable = true;
        tokenReady = true;
        authReady = true;
    }
    
    // Notify parent of successful receipt
    sendMessageToParent({
        type: 'SESSION_CONFIRMED',
        childId: 'settings',
        timestamp: Date.now()
    });
    
    // Initialize UI with session data
    initializeUIWithSession();
    
    // Start background tasks
    if (!backgroundTasksStarted && tokenReady) {
        startBackgroundTasks();
    }
    
    console.log('[Settings] Session data processed successfully');
}

// Validate session data schema
function validateSessionData(data) {
    try {
        if (!data || !data.session) return false;
        
        const session = data.session;
        
        // Basic required fields
        if (!session.id && !session.token) return false;
        
        // Validate user object if present
        if (session.user) {
            if (typeof session.user !== 'object') return false;
            if (!session.user.id && !session.user.email && !session.user.username) return false;
        }
        
        return true;
    } catch (error) {
        console.warn('[Settings] Session validation error:', error.message);
        return false;
    }
}

// Handle SESSION_UPDATE message
function handleSessionUpdate(data) {
    console.log('[Settings] Processing SESSION_UPDATE from parent');
    
    if (data.session && data.session.user) {
        currentUser = data.session.user;
        
        // Update UI immediately
        updateUserUI();
        
        // Save to localStorage as cache
        localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
        
        showNotification('Profile updated', 'success');
    }
}

// Handle LOGOUT message
function handleLogout() {
    console.log('[Settings] Processing LOGOUT from parent');
    
    // Clear all session-related data
    parentSessionData = null;
    parentSessionReceived = false;
    sessionValidated = false;
    currentUser = null;
    tokenReady = false;
    tokenAvailable = false;
    authReady = false;
    backgroundTasksStarted = false;
    
    // Clear UI state
    resetUIForLogout();
    
    // Notify parent
    sendMessageToParent({
        type: 'LOGOUT_CONFIRMED',
        childId: 'settings',
        timestamp: Date.now()
    });
    
    console.log('[Settings] Logout processed, awaiting new session');
}

// Handle HANDSHAKE_ACK
function handleHandshakeAck() {
    console.log('[Settings] Parent acknowledged handshake');
    // Parent is ready, continue with normal operations
}

// Handle PARENT_READY
function handleParentReady() {
    console.log('[Settings] Parent reported ready');
    // Parent is ready, we can proceed
}

// Handle AUTH_READY
function handleAuthReady() {
    console.log('[Settings] Parent reported auth ready');
    checkTokenAvailability();
}

// Handle AUTH_LOST
function handleAuthLost() {
    console.log('[Settings] Parent reported auth lost');
    tokenReady = false;
    tokenAvailable = false;
    backgroundTasksStarted = false;
}

// Handle TOKEN_READY
function handleTokenReady() {
    console.log('[Settings] Parent reported token ready');
    checkTokenAvailability();
}

// Handle USER_UPDATED
function handleUserUpdated(data) {
    if (data.user) {
        currentUser = data.user;
        updateUserUI();
        localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
    }
}

// Initialize UI with session data
function initializeUIWithSession() {
    console.log('[Settings] Initializing UI with session data');
    
    // Step 1: Initialize UI immediately
    initializeUI();
    
    // Step 2: Load from localStorage for immediate display
    loadFromLocalStorage();
    
    // Step 3: Load default section
    loadSection(currentSection);
    
    // Step 4: Start token monitoring
    startTokenMonitoring();
    
    // Step 5: Try to get token in background
    setTimeout(async () => {
        try {
            await waitForToken(5000);
            if (tokenReady) {
                console.log('[Settings] Token ready during initialization');
                startBackgroundTasks();
            } else {
                console.log('[Settings] Token not ready yet, will retry in background');
            }
        } catch (error) {
            console.warn('[Settings] Token wait error:', error.message);
        }
    }, 1000);
    
    console.log('[Settings] UI initialized with session data');
}

// Reset UI for logout
export function resetUIForLogout() {
    // Show waiting state
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
    
    // Disable menu
    const menuContainer = document.getElementById('settingsMenu');
    if (menuContainer) {
        menuContainer.innerHTML = '';
    }
    
    // Disable buttons
    const resetBtn = document.getElementById('resetSectionBtn');
    const saveBtn = document.getElementById('saveSectionBtn');
    if (resetBtn) resetBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
}

// Show reconnection state
export function showReconnectionState() {
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
}

// Authentication Enforcement - Check if protected UI should be shown
export function checkAuthenticationState() {
    if (!parentSessionReceived || !sessionValidated) {
        console.log('[Settings] Waiting for parent session before showing protected UI');
        return false;
    }
    
    if (!tokenReady && !authReady) {
        console.log('[Settings] Waiting for authentication before showing protected UI');
        return false;
    }
    
    return true;
}

// =============================================
// STABILIZED BOOTSTRAP FUNCTION (UPDATED)
// =============================================

export async function bootstrapIframe() {
    console.log('[Settings] Bootstrap starting (iframe mode with parent coordination)...');
    
    try {
        // Step 1: Parent detection
        if (!verifyParentPresence()) {
            console.error('[Settings] Parent window not detected');
            showReconnectionState();
            return false;
        }
        
        // Step 2: Setup secure messaging
        setupSecureMessagingChannel();
        
        // Step 3: Start handshake protocol
        startParentHandshake();
        
        // Step 4: Load basic UI immediately (non-protected parts)
        initializeBasicUI();
        
        // Step 5: Load cached data for immediate display
        await loadFromLocalStorage();
        
        // Step 6: Wait for session data (with timeout)
        const sessionReceived = await waitForSession(10000); // 10 second timeout
        
        if (sessionReceived) {
            console.log('[Settings] Bootstrap complete with session data');
            return true;
        } else {
            console.warn('[Settings] Bootstrap completed without session data, showing reconnection state');
            showReconnectionState();
            return false;
        }
        
    } catch (error) {
        console.warn('[Settings] Bootstrap error:', error.message);
        
        // Fallback: Ensure basic UI is usable
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
            if (parentSessionReceived && sessionValidated) {
                clearInterval(checkInterval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
    });
}

// Initialize basic UI (non-protected parts)
export function initializeBasicUI() {
    console.log('[Settings] Initializing basic UI');
    
    // Build settings menu structure (disabled state)
    buildSettingsMenu();
    
    // Setup basic event listeners
    setupBasicEventListeners();
    
    // Apply basic theme from localStorage if available
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
            // Ignore parse errors
        }
    }
}

// Setup basic event listeners
export function setupBasicEventListeners() {
    // Back to app button
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
                            timestamp: Date.now()
                        });
                        // Let parent handle navigation
                    }
                );
            } else {
                sendMessageToParent({
                    type: 'CHILD_CLOSING',
                    childId: 'settings',
                    timestamp: Date.now()
                });
            }
        });
    }
    
    // Search input (basic functionality)
    const settingsSearch = document.getElementById('settingsSearch');
    if (settingsSearch) {
        settingsSearch.addEventListener('input', function(e) {
            if (parentSessionReceived) {
                searchSettings(e.target.value);
            }
        });
    }
    
    // Before unload warning
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
}

// =============================================
// TOKEN MANAGEMENT SYSTEM (UPDATED FOR PARENT COORDINATION)
// =============================================

// Start token monitoring system
export function startTokenMonitoring() {
    console.log('[Settings] Starting token monitoring with parent coordination...');
    
    // Clear any existing interval
    if (tokenCheckInterval) {
        clearInterval(tokenCheckInterval);
        tokenCheckInterval = null;
    }
    
    // Set up token monitoring
    tokenCheckInterval = setInterval(() => {
        checkTokenAvailability();
    }, TOKEN_CHECK_INTERVAL);
    
    // Initial check
    setTimeout(checkTokenAvailability, 500);
}

// Check token availability from parent or api.core.js
export function checkTokenAvailability() {
    try {
        // First check parent session
        if (parentSessionData && parentSessionData.token) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                console.log('[Settings] Token available from parent session');
                
                // Start background tasks if not started
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                
                // Notify parent if needed
                notifyTokenReady();
            }
            return;
        }
        
        // Check api.core.js for token
        if (!tokenAvailable) {
            const token = getUserToken();
            if (token && token !== '') {
                tokenAvailable = true;
                tokenReady = true;
                console.log('[Settings] Token detected via api.core.js');
                
                // Start background tasks if not started
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                
                // Notify token is ready
                notifyTokenReady();
            } else if (tokenAvailable) {
                // Token was lost
                tokenAvailable = false;
                tokenReady = false;
                console.log('[Settings] Token lost via api.core.js');
                
                // Notify token lost
                notifyTokenLost();
            }
        } else {
            // Check if token is still valid via api.core.js
            const token = getUserToken();
            if (!token || token === '') {
                tokenAvailable = false;
                tokenReady = false;
                console.log('[Settings] Token lost via api.core.js check');
                notifyTokenLost();
            }
        }
    } catch (error) {
        console.warn('[Settings] Token check error:', error.message);
        // Don't throw - passive monitoring
    }
}

// Notify that token is ready (triggers background data loading)
export function notifyTokenReady() {
    console.log('[Settings] Token ready, starting background data sync');
    
    // Update auth state
    authReady = true;
    
    // Start background tasks if not started
    if (!backgroundTasksStarted) {
        startBackgroundTasks();
    }
    
    // Notify parent iframe
    notifyParentAuthState(true);
}

// Notify that token is lost
export function notifyTokenLost() {
    console.log('[Settings] Token lost, pausing background tasks');
    
    // Update auth state
    authReady = false;
    backgroundTasksStarted = false;
    
    // Notify parent iframe
    notifyParentAuthState(false);
}

// Get secure token from parent or api.core.js (with fallback to legacy tokens)
export function getSecureToken() {
    try {
        // First try to get from parent session
        if (parentSessionData && parentSessionData.token) {
            return parentSessionData.token;
        }
        
        // Then try to get from api.core.js
        const token = getUserToken();
        if (token && token !== '') {
            return token;
        }
        
        // Fallback to legacy tokens (for backward compatibility)
        const legacyTokens = [
            localStorage.getItem('USER_TOKEN'),
            localStorage.getItem('accessToken'),
            localStorage.getItem('moodchat_token'),
            localStorage.getItem('authToken')
        ];
        
        for (const legacyToken of legacyTokens) {
            if (legacyToken && legacyToken !== 'null' && legacyToken !== 'undefined') {
                console.log('[Settings] Using legacy token for backward compatibility');
                
                // Migrate to centralized token system if possible
                setUserToken(legacyToken);
                
                return legacyToken;
            }
        }
        
        return null;
    } catch (error) {
        console.warn('[Settings] Error getting secure token:', error.message);
        return null;
    }
}

// Secure API request using parent session or centralized token system
export async function secureFetchWrapper(method, endpoint, data = null) {
    // Check if we have authentication
    if (!tokenAvailable && !parentSessionReceived) {
        console.warn('[Settings] No authentication available for secure request:', endpoint);
        throw new Error('Authentication not available');
    }
    
    try {
        // Use imported secureFetch from api.core.js
        return await secureFetch(method, endpoint, data);
        
    } catch (error) {
        console.warn('[Settings] Secure fetch error:', error.message, endpoint);
        
        // Check for auth errors
        if (error.message && (
            error.message.includes('401') || 
            error.message.includes('403') || 
            error.message.includes('unauthorized') || 
            error.message.includes('Unauthorized') ||
            error.message.includes('Session expired')
        )) {
            console.warn('[Settings] Auth error detected');
            tokenAvailable = false;
            tokenReady = false;
            
            // Notify parent once
            notifyParentAuthError();
        }
        
        throw error;
    }
}

// Wait for token to be ready (non-blocking)
export function waitForToken(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (tokenReady) {
            resolve(true);
            return;
        }
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (tokenReady) {
                clearInterval(checkInterval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(false); // Resolve with false instead of rejecting to avoid blocking
            }
        }, 100);
    });
}

// =============================================
// STABILIZED AUTH HANDLING (UPDATED)
// =============================================

// Start passive auth monitoring (no active requests, only listens)
export function startPassiveAuthMonitoring() {
    // Clear any existing interval
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }
    
    // Set up auth state monitoring (passive, no requests)
    authCheckInterval = setInterval(() => {
        checkAuthStatePassively();
    }, AUTH_CHECK_INTERVAL);
    
    // Initial check
    setTimeout(checkAuthStatePassively, 1000);
}

// Check auth state passively (read-only, no mutations)
function checkAuthStatePassively() {
    try {
        // Check if token is available
        checkTokenAvailability();
    } catch (error) {
        console.warn('[Settings] Passive auth check error:', error.message);
        // Don't throw - passive monitoring
    }
}

// Start background tasks (only when token is ready)
export function startBackgroundTasks() {
    if (backgroundTasksStarted) {
        console.log('[Settings] Background tasks already started');
        return;
    }
    
    if (!tokenReady && !parentSessionReceived) {
        console.log('[Settings] Token not ready and no parent session, skipping background tasks');
        return;
    }
    
    backgroundTasksStarted = true;
    console.log('[Settings] Starting background tasks');
    
    // Load data in background (non-blocking)
    Promise.allSettled([
        safeLoadUserData(),
        safeLoadSettings(),
        safeLoadBlockedUsers(),
        safeLoadActiveSessions(),
        safeLoadUserContacts(),
        safeLoadUserGroups()
    ]).then(results => {
        console.log('[Settings] Background data loading completed');
        showNotification('Settings synced with server', 'success');
    }).catch(error => {
        console.warn('[Settings] Background tasks completed with warnings:', error.message);
    });
}

// Safe wrapper for user data loading
export async function safeLoadUserData() {
    if (!tokenReady && !parentSessionReceived) {
        console.log('[Settings] No authentication, skipping user data load');
        return;
    }
    
    try {
        // Use parent session data if available
        if (parentSessionData && parentSessionData.user) {
            currentUser = parentSessionData.user;
            console.log('[Settings] User loaded from parent session');
            
            // Update UI
            updateUserUI();
            
            // Save to localStorage as cache
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
            return;
        }
        
        // Use imported getCurrentUser from api.core.js
        const response = await getCurrentUser();
        if (response && response.user) {
            currentUser = response.user;
            console.log('[Settings] User loaded from API');
            
            // Update UI
            updateUserUI();
            
            // Save to localStorage as cache
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
        }
    } catch (error) {
        console.warn('[Settings] User data load warning:', error.message);
        // Use cached data - don't throw
    }
}

// Safe wrapper for settings loading
export async function safeLoadSettings() {
    if (!tokenReady && !parentSessionReceived) {
        console.log('[Settings] No authentication, skipping settings load');
        return;
    }
    
    try {
        const response = await secureFetchWrapper('GET', '/api/settings');
        if (response && response.settings) {
            userSettings = response.settings;
            console.log('[Settings] Settings loaded from API');
            
            // Ensure all sections exist
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            
            // Save to localStorage as cache
            localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
            
            // Calculate storage usage
            calculateStorageUsage();
        }
    } catch (error) {
        console.warn('[Settings] Settings load warning:', error.message);
        // Use cached settings - don't throw
    }
}

// Safe wrapper for blocked users
export async function safeLoadBlockedUsers() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('GET', '/api/users/blocked');
        if (response && response.blockedUsers) {
            blockedUsers = response.blockedUsers;
        }
    } catch (error) {
        // Silent fail for non-critical data
    }
}

// Safe wrapper for active sessions
export async function safeLoadActiveSessions() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('GET', '/api/auth/sessions');
        if (response && response.sessions) {
            activeSessions = response.sessions;
        }
    } catch (error) {
        // Silent fail for non-critical data
    }
}

// Safe wrapper for user contacts
export async function safeLoadUserContacts() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('GET', '/api/contacts');
        if (response && response.contacts) {
            userContacts = response.contacts;
        }
    } catch (error) {
        // Silent fail for non-critical data
    }
}

// Safe wrapper for user groups
export async function safeLoadUserGroups() {
    if (!tokenReady && !parentSessionReceived) return;
    
    try {
        const response = await secureFetchWrapper('GET', '/api/groups');
        if (response && response.groups) {
            userGroups = response.groups;
        }
    } catch (error) {
        // Silent fail for non-critical data
    }
}

// =============================================
// STABILIZED REQUEST HANDLING (UPDATED)
// =============================================

// Safe request wrapper (respects authentication state)
export async function makeSafeRequest(method, endpoint, data = null) {
    // Check if we can make requests
    if (!tokenReady && !parentSessionReceived) {
        console.warn('[Settings] Skipping request: no authentication', endpoint);
        throw new Error('Authentication not available');
    }
    
    // Use secureFetch for all API requests
    return await secureFetchWrapper(method, endpoint, data);
}

// Save settings safely
export async function saveSettings() {
    try {
        // Update local storage first (as backup)
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        // Save to API if authenticated
        if (tokenReady || parentSessionReceived) {
            await secureFetchWrapper('POST', '/api/settings', { settings: userSettings });
            console.log('[Settings] Settings saved to API');
        } else {
            console.log('[Settings] Not authenticated, saved locally only');
        }
        
        unsavedChanges = false;
        updateSaveButton();
        showNotification('Settings saved successfully', 'success');
        
    } catch (error) {
        console.warn('[Settings] Settings save warning:', error.message);
        
        // Still update local storage
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        showNotification('Error saving to server, saved locally', 'warning');
    }
}

// =============================================
// PARENT COMMUNICATION (UPDATED)
// =============================================

// Notify parent about auth state (one-way communication)
export function notifyParentAuthState(hasAuth) {
    try {
        sendMessageToParent({
            type: 'IFRAME_AUTH_STATE',
            hasAuth: hasAuth,
            iframeId: 'settings',
            tokenReady: tokenReady,
            timestamp: Date.now()
        });
    } catch (error) {
        console.warn('[Settings] Failed to notify parent:', error.message);
    }
}

// Notify parent about auth error (one-time)
let authErrorNotified = false;
export function notifyParentAuthError() {
    if (authErrorNotified) return;
    
    try {
        sendMessageToParent({
            type: 'IFRAME_AUTH_ERROR',
            iframeId: 'settings',
            message: 'Authentication required',
            tokenExpired: true,
            timestamp: Date.now()
        });
        authErrorNotified = true;
    } catch (error) {
        console.warn('[Settings] Failed to notify parent about auth error:', error.message);
    }
}

// =============================================
// STABILIZED INITIALIZATION (UPDATED)
// =============================================

// Load from localStorage as fallback (always works)
export async function loadFromLocalStorage() {
    console.log('[Settings] Loading from localStorage...');
    
    // Try to get from localStorage first
    const cachedUser = localStorage.getItem('knecta_current_user');
    if (cachedUser) {
        try {
            currentUser = JSON.parse(cachedUser);
            console.log('[Settings] User loaded from cache');
            
            // Update UI
            updateUserUI();
        } catch (e) {
            console.warn('[Settings] Error parsing cached user:', e.message);
            currentUser = { displayName: 'User' };
        }
    } else {
        currentUser = { displayName: 'User' };
    }
    
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('knecta_user_settings');
    if (savedSettings) {
        try {
            userSettings = JSON.parse(savedSettings);
            console.log('[Settings] Settings loaded from localStorage');
        } catch (e) {
            console.warn('[Settings] Error parsing saved settings:', e.message);
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
    } else {
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    
    // Ensure all sections exist
    Object.keys(DEFAULT_SETTINGS).forEach(section => {
        if (!userSettings[section]) {
            userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
        }
    });
    
    // Calculate storage usage
    calculateStorageUsage();
}

// Update user UI elements
export function updateUserUI() {
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
            // Create initials from display name
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
}

// Initialize UI (always works)
export function initializeUI() {
    // Build settings menu
    buildSettingsMenu();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update user status
    updateUserStatus();
    
    // Initialize color picker
    initializeColorPicker();
    
    // Apply current theme
    if (userSettings.appearance && userSettings.appearance.theme) {
        applyTheme(userSettings.appearance.theme);
    }
    
    // Apply accent color
    if (userSettings.appearance && userSettings.appearance.accentColor) {
        updateAccentColor(userSettings.appearance.accentColor);
    }
    
    // Enable buttons if authenticated
    const resetBtn = document.getElementById('resetSectionBtn');
    const saveBtn = document.getElementById('saveSectionBtn');
    if (resetBtn) resetBtn.disabled = !(tokenReady || parentSessionReceived);
    if (saveBtn) saveBtn.disabled = !(tokenReady || parentSessionReceived);
    updateSaveButton();
}

// Calculate storage usage
export function calculateStorageUsage() {
    // Simulate some storage usage
    const settings = userSettings.storage;
    settings.storageBreakdown.chats = Math.floor(Math.random() * 200) * 1024 * 1024;
    settings.storageBreakdown.media = Math.floor(Math.random() * 500) * 1024 * 1024;
    settings.storageBreakdown.other = Math.floor(Math.random() * 100) * 1024 * 1024;
    settings.totalStorageUsed = settings.storageBreakdown.chats + settings.storageBreakdown.media + settings.storageBreakdown.other;
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

// Terminate session (secure version using token system)
export async function terminateSession(sessionId) {
    try {
        await makeSafeRequest('POST', '/api/auth/terminate-session', { sessionId });
        showNotification('Session terminated', 'success');
        // Refresh sessions list
        await safeLoadActiveSessions();
        showActiveSessions();
    } catch (error) {
        console.warn('[Settings] Error terminating session:', error.message);
        showNotification('Error terminating session', 'error');
    }
}

// Terminate all sessions (secure version using token system)
export async function terminateAllSessions() {
    try {
        await makeSafeRequest('POST', '/api/auth/terminate-all-sessions');
        showNotification('All other sessions terminated', 'success');
        // Refresh sessions list
        await safeLoadActiveSessions();
        showActiveSessions();
    } catch (error) {
        console.warn('[Settings] Error terminating all sessions:', error.message);
        showNotification('Error terminating sessions', 'error');
    }
}

// Unblock user (secure version using token system)
export async function unblockUser(userId) {
    try {
        await makeSafeRequest('POST', '/api/users/unblock', { userId });
        showNotification('User unblocked', 'success');
        // Refresh blocked users list
        await safeLoadBlockedUsers();
        showBlockedUsers();
    } catch (error) {
        console.warn('[Settings] Error unblocking user:', error.message);
        showNotification('Error unblocking user', 'error');
    }
}

// Clear chat cache (secure version using token system)
export async function clearChatCache() {
    try {
        await makeSafeRequest('POST', '/api/storage/clear-chat-cache');
        
        userSettings.storage.storageBreakdown.chats = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.media + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Chat cache cleared', 'success');
        
    } catch (error) {
        console.warn('[Settings] Error clearing chat cache:', error.message);
        showNotification('Error clearing chat cache', 'error');
    }
}

// Clear media cache (secure version using token system)
export async function clearMediaCache() {
    try {
        await makeSafeRequest('POST', '/api/storage/clear-media-cache');
        
        userSettings.storage.storageBreakdown.media = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.chats + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Media cache cleared', 'success');
        
    } catch (error) {
        console.warn('[Settings] Error clearing media cache:', error.message);
        showNotification('Error clearing media cache', 'error');
    }
}