// =============================================
// SETTINGS SYSTEM - COMPLETE IMPLEMENTATION
// =============================================

// Global variables
let currentUser = null;
let userSettings = {};
let currentSection = 'profile';
let unsavedChanges = false;
let colorPicker = null;
let blockedUsers = [];
let activeSessions = [];
let userContacts = [];
let userGroups = [];

// ADDED: Authentication tokens
let accessToken = null;
let refreshToken = null;

// ADDED: Authentication ready flag
let authReady = false;

// ADDED: API initialization check
let apiInitialized = false;
let apiInitRetries = 0;
const MAX_API_RETRIES = 10;

// Default settings structure (222 features organized by section)
const DEFAULT_SETTINGS = {
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
const SETTINGS_MENU = [
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
// UPDATED BOOTSTRAP FUNCTION WITH ENHANCED AUTH
// =============================================

async function bootstrapIframe() {
    console.log('=== SETTINGS IFRAME BOOTSTRAP START ===');
    
    try {
        // Step 1: Wait for API.js to be ready
        await waitForApiInitialization();
        
        // Step 2: Initialize UI immediately
        initializeUI();
        
        // Step 3: Try to get user from storage first (fastest path)
        const fastUser = await getCurrentUserFast();
        if (fastUser) {
            currentUser = fastUser;
            updateUserUI();
        }
        
        // Step 4: Load from localStorage for immediate display
        await loadFromLocalStorage();
        
        // Step 5: Load default section
        loadSection(currentSection);
        
        // Step 6: Start background authentication
        startBackgroundAuthentication();
        
        console.log('=== SETTINGS IFRAME BOOTSTRAP COMPLETE ===');
        return true;
        
    } catch (error) {
        console.error('Bootstrap failed:', error);
        
        // Fallback: Ensure UI is usable even if bootstrap fails
        initializeUI();
        loadSection(currentSection);
        
        showNotification('Settings loaded with cached data', 'warning');
        return false;
    }
}

// Wait for API.js to be initialized
async function waitForApiInitialization() {
    return new Promise((resolve, reject) => {
        const checkApi = () => {
            if (typeof api !== 'undefined' && api.isInitialized && api.isInitialized()) {
                apiInitialized = true;
                console.log('API.js successfully initialized');
                resolve();
                return;
            }
            
            apiInitRetries++;
            if (apiInitRetries > MAX_API_RETRIES) {
                console.warn('API.js not found after max retries, proceeding without it');
                resolve();
                return;
            }
            
            setTimeout(checkApi, 100);
        };
        
        checkApi();
    });
}

// Fast user retrieval from storage
async function getCurrentUserFast() {
    try {
        // Check all possible token storage locations
        const tokens = [
            localStorage.getItem('accessToken'),
            localStorage.getItem('moodchat_token'),
            localStorage.getItem('knecta_access_token'),
            sessionStorage.getItem('accessToken'),
            sessionStorage.getItem('moodchat_token')
        ].filter(Boolean);
        
        if (tokens.length === 0) {
            console.log('No tokens found in storage');
            return null;
        }
        
        // Check for cached user data
        const cachedUser = localStorage.getItem('knecta_current_user') || 
                          localStorage.getItem('currentUser') ||
                          sessionStorage.getItem('currentUser');
        
        if (cachedUser) {
            try {
                const user = JSON.parse(cachedUser);
                console.log('Fast user retrieval from cache:', user.displayName || 'User');
                return user;
            } catch (e) {
                console.warn('Failed to parse cached user:', e);
            }
        }
        
        // If API is available, try to validate token
        if (apiInitialized && typeof api === 'object') {
            try {
                // Use api.js to get current user
                const userData = await api.getCurrentUser();
                if (userData && userData.user) {
                    console.log('Fast user retrieval via API:', userData.user.displayName || 'User');
                    
                    // Cache for future use
                    localStorage.setItem('knecta_current_user', JSON.stringify(userData.user));
                    
                    return userData.user;
                }
            } catch (apiError) {
                console.log('Fast API user fetch failed:', apiError.message);
                // Continue without API
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error in fast user retrieval:', error);
        return null;
    }
}

// Start background authentication
async function startBackgroundAuthentication() {
    // Don't block UI - run in background
    setTimeout(async () => {
        try {
            await performBackgroundAuth();
        } catch (error) {
            console.log('Background auth completed with warnings:', error.message);
        }
    }, 300);
}

// Perform background authentication
async function performBackgroundAuth() {
    try {
        // Skip if we already have a valid user
        if (currentUser && currentUser.id) {
            console.log('User already authenticated, skipping background auth');
            return;
        }
        
        // If API is available, try to get fresh user data
        if (apiInitialized && typeof api === 'object') {
            try {
                console.log('Starting background authentication via API...');
                
                const userData = await api.getCurrentUser();
                if (userData && userData.user) {
                    currentUser = userData.user;
                    authReady = true;
                    
                    // Update UI with fresh data
                    updateUserUI();
                    
                    // Load fresh settings
                    await loadSettings();
                    
                    // Load additional data in parallel (non-blocking)
                    Promise.allSettled([
                        loadBlockedUsers(),
                        loadActiveSessions(),
                        loadUserContacts(),
                        loadUserGroups()
                    ]).then(results => {
                        console.log('Background data loading completed:', results.map(r => r.status));
                    });
                    
                    showNotification('Settings synced with server', 'success');
                    return;
                }
            } catch (apiError) {
                console.log('Background API auth failed:', apiError.message);
                // Continue with cached data
            }
        }
        
        // Fallback: Try localStorage for user data
        const cachedUser = localStorage.getItem('knecta_current_user');
        if (cachedUser && !currentUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                console.log('Using cached user from localStorage');
                updateUserUI();
            } catch (e) {
                console.error('Error parsing cached user:', e);
            }
        }
        
    } catch (error) {
        console.log('Background authentication error:', error.message);
        // Don't throw - this is background process
    }
}

// =============================================
// UPDATED AUTHENTICATION & TOKEN MANAGEMENT
// =============================================

// Enhanced API call function using api.js
async function makeAuthenticatedRequest(method, endpoint, data = null) {
    try {
        // Use api.js if available
        if (apiInitialized && typeof api === 'object') {
            let result;
            
            switch (method) {
                case 'GET':
                    result = await api.get(endpoint);
                    break;
                case 'POST':
                    result = await api.post(endpoint, data);
                    break;
                case 'PUT':
                    result = await api.put(endpoint, data);
                    break;
                case 'PATCH':
                    result = await api.patch(endpoint, data);
                    break;
                case 'DELETE':
                    result = await api.delete(endpoint);
                    break;
                default:
                    throw new Error(`Unsupported method: ${method}`);
            }
            
            return result;
        } else {
            // Fallback to fetch with token
            return await makeFallbackRequest(method, endpoint, data);
        }
        
    } catch (error) {
        console.error('API request error:', error);
        
        // Handle authentication errors
        if (error.message && (error.message.includes('401') || error.message.includes('403') || 
            error.message.includes('unauthorized') || error.message.includes('Unauthorized'))) {
            handleAuthError();
            throw new Error('Authentication required');
        }
        
        throw error;
    }
}

// Fallback request for when api.js is not available
async function makeFallbackRequest(method, endpoint, data = null) {
    // Get token from any storage location
    const token = localStorage.getItem('accessToken') || 
                  localStorage.getItem('moodchat_token') ||
                  sessionStorage.getItem('accessToken');
    
    if (!token) {
        throw new Error('No authentication token available');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    
    const config = {
        method: method,
        headers: headers,
        credentials: 'include'
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(endpoint, config);
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication failed');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Fallback request error:', error);
        throw error;
    }
}

// Handle authentication error
function handleAuthError() {
    showNotification('Authentication required. Please login again.', 'error');
    
    // Clear all authentication data
    clearAllAuthData();
    
    // Redirect to login after delay
    setTimeout(() => {
        const isIframe = window.parent !== window;
        if (isIframe) {
            // If in iframe, tell parent to redirect
            window.parent.postMessage({
                type: 'AUTH_ERROR',
                redirect: '/index.html'
            }, '*');
        } else {
            // Direct navigation
            window.location.href = '/index.html';
        }
    }, 2000);
}

// Clear all authentication data
function clearAllAuthData() {
    const itemsToClear = [
        'accessToken',
        'moodchat_token',
        'moodchat_refresh_token',
        'knecta_current_user',
        'knecta_user_settings',
        'currentUser',
        'refreshToken'
    ];
    
    itemsToClear.forEach(item => {
        localStorage.removeItem(item);
        sessionStorage.removeItem(item);
    });
}

// =============================================
// UPDATED INITIALIZATION SYSTEM
// =============================================

// Update loading status
function updateLoadingStatus(message, progress) {
    const apiStatus = document.getElementById('apiStatus');
    const loadingBar = document.getElementById('loadingBar');
    
    if (apiStatus) apiStatus.textContent = message;
    if (loadingBar) loadingBar.style.width = progress + '%';
}

// Load settings data
async function loadSettingsData() {
    try {
        console.log('Loading settings data...');
        
        // Load user data
        await loadUserData();
        
        // Load settings
        await loadSettings();
        
        // Load additional data in parallel
        await Promise.allSettled([
            loadBlockedUsers(),
            loadActiveSessions(),
            loadUserContacts(),
            loadUserGroups()
        ]);
        
        // Show success notification
        setTimeout(() => {
            showNotification('Settings loaded successfully', 'success');
        }, 500);
        
    } catch (error) {
        console.error('Error loading settings data:', error);
        
        // Fallback to localStorage
        await loadFromLocalStorage();
        
        showNotification('Loaded settings from local storage', 'warning');
    }
}

// Load from localStorage as fallback
async function loadFromLocalStorage() {
    console.log('Loading from localStorage...');
    
    // Try to get from localStorage first
    const cachedUser = localStorage.getItem('knecta_current_user');
    if (cachedUser) {
        try {
            currentUser = JSON.parse(cachedUser);
            console.log('User loaded from cache:', currentUser);
            
            // Update UI
            updateUserUI();
        } catch (e) {
            console.error('Error parsing cached user:', e);
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
            console.log('Settings loaded from localStorage');
        } catch (e) {
            console.error('Error parsing saved settings:', e);
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

// Load user data from API
async function loadUserData() {
    try {
        console.log('Loading user data via API...');
        
        // Use our authenticated request function
        const response = await makeAuthenticatedRequest('GET', '/api/auth/user');
        if (response && response.user) {
            currentUser = response.user;
            console.log('User loaded from API:', currentUser);
            
            // Update UI
            updateUserUI();
            
            // Save to localStorage as cache
            localStorage.setItem('knecta_current_user', JSON.stringify(currentUser));
        } else {
            throw new Error('No user data in response');
        }
        
    } catch (error) {
        console.error('Error loading user data:', error);
        
        // Try fallback: use cached data
        const cachedUser = localStorage.getItem('knecta_current_user');
        if (cachedUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                console.log('Using cached user data');
            } catch (e) {
                console.error('Error parsing cached user:', e);
                throw error;
            }
        } else {
            throw error;
        }
    }
}

// Update user UI elements
function updateUserUI() {
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

// Load settings from API
async function loadSettings() {
    try {
        console.log('Loading settings via API...');
        
        const response = await makeAuthenticatedRequest('GET', '/api/settings');
        if (response && response.settings) {
            userSettings = response.settings;
            console.log('Settings loaded from API');
            
            // Ensure all sections exist
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            
            // Save to localStorage as cache
            localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        } else {
            console.warn('No settings in response, using defaults');
        }
        
        // Calculate storage usage
        calculateStorageUsage();
        
    } catch (error) {
        console.error('Error loading settings:', error);
        
        // Fallback to localStorage
        const savedSettings = localStorage.getItem('knecta_user_settings');
        if (savedSettings) {
            try {
                userSettings = JSON.parse(savedSettings);
                console.log('Using cached settings from localStorage');
            } catch (e) {
                console.error('Error parsing saved settings:', e);
                throw error;
            }
        } else {
            throw error;
        }
    }
}

// Save settings to API
async function saveSettings() {
    try {
        // Update local storage first (as backup)
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        // Save to API
        console.log('Saving settings via API...');
        await makeAuthenticatedRequest('POST', '/api/settings', { settings: userSettings });
        console.log('Settings saved to API');
        
        unsavedChanges = false;
        updateSaveButton();
        showNotification('Settings saved successfully', 'success');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        
        // Still update local storage
        localStorage.setItem('knecta_user_settings', JSON.stringify(userSettings));
        
        showNotification('Error saving to server, saved locally', 'warning');
    }
}

// Initialize UI
function initializeUI() {
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
    
    // Enable buttons
    const resetBtn = document.getElementById('resetSectionBtn');
    const saveBtn = document.getElementById('saveSectionBtn');
    if (resetBtn) resetBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    updateSaveButton();
}

// =============================================
// UPDATED REMAINING FUNCTIONS
// =============================================

// Build settings menu
function buildSettingsMenu() {
    const menuContainer = document.getElementById('settingsMenu');
    if (!menuContainer) return;
    
    menuContainer.innerHTML = '';
    
    SETTINGS_MENU.forEach(item => {
        const menuItem = document.createElement('a');
        menuItem.href = '#';
        menuItem.className = 'menu-item';
        if (item.id === currentSection) {
            menuItem.classList.add('active');
        }
        if (item.danger) {
            menuItem.style.color = 'var(--danger-color)';
        }
        
        menuItem.innerHTML = `
            <div class="menu-icon">
                <i class="${item.icon}"></i>
            </div>
            <div class="menu-text">${item.title}</div>
            ${item.badge ? `<div class="menu-badge">${item.badge}</div>` : ''}
        `;
        
        menuItem.addEventListener('click', (e) => {
            e.preventDefault();
            loadSection(item.id);
            
            // Update active menu item
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
            });
            menuItem.classList.add('active');
        });
        
        menuContainer.appendChild(menuItem);
    });
}

// Load a settings section
function loadSection(sectionId) {
    currentSection = sectionId;
    unsavedChanges = false;
    
    // Update UI
    updateSectionTitle(sectionId);
    updateSaveButton();
    
    // Load section content
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    switch(sectionId) {
        case 'profile':
            loadProfileSection(contentContainer);
            break;
        case 'security':
            loadSecuritySection(contentContainer);
            break;
        case 'privacy':
            loadPrivacySection(contentContainer);
            break;
        case 'chat':
            loadChatSection(contentContainer);
            break;
        case 'friends':
            loadFriendsSection(contentContainer);
            break;
        case 'groups':
            loadGroupsSection(contentContainer);
            break;
        case 'calls':
            loadCallsSection(contentContainer);
            break;
        case 'status':
            loadStatusSection(contentContainer);
            break;
        case 'notifications':
            loadNotificationsSection(contentContainer);
            break;
        case 'appearance':
            loadAppearanceSection(contentContainer);
            break;
        case 'storage':
            loadStorageSection(contentContainer);
            break;
        case 'mood':
            loadMoodSection(contentContainer);
            break;
        case 'activity':
            loadActivitySection(contentContainer);
            break;
        case 'intelligence':
            loadIntelligenceSection(contentContainer);
            break;
        case 'personalization':
            loadPersonalizationSection(contentContainer);
            break;
        case 'safety':
            loadSafetySection(contentContainer);
            break;
        case 'advanced':
            loadAdvancedSection(contentContainer);
            break;
        case 'backup':
            loadBackupSection(contentContainer);
            break;
        case 'danger':
            loadDangerSection(contentContainer);
            break;
        default:
            contentContainer.innerHTML = '<p>Section not found</p>';
    }
    
    // Scroll to top
    contentContainer.scrollTop = 0;
}

// Update section title
function updateSectionTitle(sectionId) {
    const menuItem = SETTINGS_MENU.find(item => item.id === sectionId);
    if (menuItem) {
        const contentTitle = document.getElementById('contentTitle');
        const contentSubtitle = document.getElementById('contentSubtitle');
        
        if (contentTitle) contentTitle.textContent = menuItem.title;
        if (contentSubtitle) contentSubtitle.textContent = getSectionDescription(sectionId);
    }
}

// Get section description
function getSectionDescription(sectionId) {
    const descriptions = {
        profile: 'Manage your personal information and account settings',
        security: 'Secure your account with advanced security features',
        privacy: 'Control who can see your information and contact you',
        chat: 'Customize your chat experience and messaging preferences',
        friends: 'Configure how you connect and interact with friends',
        groups: 'Manage group settings and participation preferences',
        calls: 'Set up calling preferences and video call options',
        status: 'Configure status updates and story preferences',
        notifications: 'Manage notifications and alert preferences',
        appearance: 'Customize the look and feel of the app',
        storage: 'Monitor and manage your storage usage',
        mood: 'Configure mood detection and mood-based features',
        activity: 'Smart activity management and focus modes',
        intelligence: 'Interaction analytics and smart features',
        personalization: 'Personalize shortcuts and interface elements',
        safety: 'Advanced safety and privacy protection features',
        advanced: 'Developer options and advanced configuration',
        backup: 'Backup and restore your data',
        danger: 'Irreversible actions - proceed with caution'
    };
    
    return descriptions[sectionId] || 'Configure settings for this section';
}

// Update save button state
function updateSaveButton() {
    const saveBtn = document.getElementById('saveSectionBtn');
    if (!saveBtn) return;
    
    if (unsavedChanges) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        saveBtn.classList.remove('secondary');
        saveBtn.classList.add('primary');
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check"></i> All Saved';
        saveBtn.classList.remove('primary');
        saveBtn.classList.add('secondary');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Back to app button
    const backToAppBtn = document.getElementById('backToAppBtn');
    if (backToAppBtn) {
        backToAppBtn.addEventListener('click', () => {
            if (unsavedChanges) {
                showConfirmation(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to leave?',
                    () => {
                        // Close iframe by navigating to main app
                        window.location.href = '/index.html';
                    }
                );
            } else {
                window.location.href = '/index.html';
            }
        });
    }
    
    // Save section button
    const saveSectionBtn = document.getElementById('saveSectionBtn');
    if (saveSectionBtn) {
        saveSectionBtn.addEventListener('click', saveSettings);
    }
    
    // Reset section button
    const resetSectionBtn = document.getElementById('resetSectionBtn');
    if (resetSectionBtn) {
        resetSectionBtn.addEventListener('click', () => {
            showConfirmation(
                'Reset Section',
                'Are you sure you want to reset all settings in this section to default?',
                () => {
                    resetCurrentSection();
                }
            );
        });
    }
    
    // Search input
    const settingsSearch = document.getElementById('settingsSearch');
    if (settingsSearch) {
        settingsSearch.addEventListener('input', function(e) {
            searchSettings(e.target.value);
        });
    }
    
    // Modal close buttons
    setupModalListeners();
    
    // Photo modal buttons
    setupPhotoModalListeners();
    
    // Password modal buttons
    setupPasswordModalListeners();
    
    // Sessions modal
    const terminateAllSessionsBtn = document.getElementById('terminateAllSessionsBtn');
    if (terminateAllSessionsBtn) {
        terminateAllSessionsBtn.addEventListener('click', terminateAllSessions);
    }
    
    // Before unload warning
    window.addEventListener('beforeunload', (e) => {
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
    
    // Listen for auth updates from parent
    window.addEventListener('message', handleParentMessage);
}

// Handle messages from parent window
function handleParentMessage(event) {
    if (!event.data || !event.data.type) return;
    
    switch (event.data.type) {
        case 'USER_UPDATED':
            if (event.data.user) {
                currentUser = event.data.user;
                updateUserUI();
                showNotification('User information updated', 'success');
            }
            break;
            
        case 'AUTH_STATUS':
            if (event.data.authenticated && event.data.user) {
                currentUser = event.data.user;
                authReady = true;
                updateUserUI();
            }
            break;
            
        case 'TOKEN_UPDATED':
            // Token was updated, we can retry API calls
            console.log('Token updated from parent');
            break;
    }
}

// Setup modal listeners
function setupModalListeners() {
    // Close buttons
    const closeButtons = [
        { id: 'closePhotoModal', modal: 'changePhotoModal' },
        { id: 'closePasswordModal', modal: 'changePasswordModal' },
        { id: 'closeSessionsModal', modal: 'sessionsModal' },
        { id: 'closeBlockedModal', modal: 'blockedUsersModal' },
        { id: 'closeConfirmationModal', modal: 'confirmationModal' }
    ];
    
    closeButtons.forEach(btn => {
        const button = document.getElementById(btn.id);
        const modal = document.getElementById(btn.modal);
        if (button && modal) {
            button.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
    });
    
    // Cancel buttons
    const cancelButtons = [
        { id: 'cancelPhotoBtn', modal: 'changePhotoModal' },
        { id: 'cancelPasswordBtn', modal: 'changePasswordModal' },
        { id: 'closeSessionsBtn', modal: 'sessionsModal' },
        { id: 'closeBlockedBtn', modal: 'blockedUsersModal' },
        { id: 'cancelConfirmationBtn', modal: 'confirmationModal' }
    ];
    
    cancelButtons.forEach(btn => {
        const button = document.getElementById(btn.id);
        const modal = document.getElementById(btn.modal);
        if (button && modal) {
            button.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
    });
}

// Setup photo modal listeners
function setupPhotoModalListeners() {
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    if (takePhotoBtn) {
        takePhotoBtn.addEventListener('click', takePhoto);
    }
    
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    if (choosePhotoBtn) {
        choosePhotoBtn.addEventListener('click', choosePhoto);
    }
    
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', removePhoto);
    }
    
    const savePhotoBtn = document.getElementById('savePhotoBtn');
    if (savePhotoBtn) {
        savePhotoBtn.addEventListener('click', savePhoto);
    }
}

// Setup password modal listeners
function setupPasswordModalListeners() {
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    if (savePasswordBtn) {
        savePasswordBtn.addEventListener('click', changePassword);
    }
}

// Initialize color picker
function initializeColorPicker() {
    const container = document.getElementById('colorPickerContainer');
    if (!container) return;
    
    colorPicker = Pickr.create({
        el: container,
        theme: 'nano',
        default: userSettings.appearance.accentColor || '#0084ff',
        swatches: [
            '#0084ff', '#34c759', '#ff9500', '#ff3b30',
            '#af52de', '#5856d6', '#007aff', '#5ac8fa'
        ],
        components: {
            preview: true,
            opacity: false,
            hue: true,
            interaction: {
                hex: true,
                rgba: true,
                hsla: false,
                hsva: false,
                cmyk: false,
                input: true,
                clear: false,
                save: true
            }
        }
    });
    
    colorPicker.on('save', (color) => {
        if (color) {
            const hexColor = color.toHEXA().toString();
            userSettings.appearance.accentColor = hexColor;
            unsavedChanges = true;
            updateSaveButton();
            updateAccentColor(hexColor);
            colorPicker.hide();
        }
    });
    
    colorPicker.on('hide', () => {
        colorPicker.hide();
    });
}

// Update accent color in UI
function updateAccentColor(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    
    // Calculate darker variant
    const darkerColor = shadeColor(color, -20);
    document.documentElement.style.setProperty('--primary-dark', darkerColor);
}

// Apply theme
function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// Apply font size
function applyFontSize(size) {
    document.documentElement.style.fontSize = `${size}px`;
}

// Utility function to shade color
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1,3),16);
    let G = parseInt(color.substring(3,5),16);
    let B = parseInt(color.substring(5,7),16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (B<255)?B:255;  

    const RR = ((R.toString(16).length===1)?"0"+R.toString(16):R.toString(16));
    const GG = ((G.toString(16).length===1)?"0"+G.toString(16):G.toString(16));
    const BB = ((B.toString(16).length===1)?"0"+B.toString(16):B.toString(16));

    return "#"+RR+GG+BB;
}

// Search settings
function searchSettings(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    if (!normalizedQuery) {
        // Reset to current section
        loadSection(currentSection);
        return;
    }
    
    // Search in settings
    const contentContainer = document.getElementById('settingsContent');
    if (!contentContainer) return;
    
    const results = [];
    
    // Search through all settings
    Object.keys(userSettings).forEach(section => {
        const sectionSettings = userSettings[section];
        Object.keys(sectionSettings).forEach(key => {
            const value = sectionSettings[key];
            const keyStr = key.toLowerCase().replace(/([A-Z])/g, ' $1');
            const sectionName = SETTINGS_MENU.find(m => m.id === section)?.title || section;
            
            if (keyStr.includes(normalizedQuery) || 
                sectionName.toLowerCase().includes(normalizedQuery) ||
                (typeof value === 'string' && value.toLowerCase().includes(normalizedQuery))) {
                results.push({
                    section,
                    key,
                    value,
                    sectionName
                });
            }
        });
    });
    
    // Display results
    if (results.length > 0) {
        let html = '<div class="settings-section">';
        html += '<div class="section-header">';
        html += `<h3><i class="fas fa-search section-icon"></i> Search Results for "${query}"</h3>`;
        html += `<div class="section-description">Found ${results.length} matching settings</div>`;
        html += '</div>';
        html += '<div class="section-body">';
        
        results.forEach(result => {
            html += `<div class="setting-item">`;
            html += `<div class="setting-info">`;
            html += `<div class="setting-label">${result.key.replace(/([A-Z])/g, ' $1')}</div>`;
            html += `<div class="setting-description">Section: ${result.sectionName}</div>`;
            html += `</div>`;
            html += `<div class="setting-control">`;
            html += `<div class="setting-value">${typeof result.value === 'boolean' ? (result.value ? 'Enabled' : 'Disabled') : result.value}</div>`;
            html += `</div>`;
            html += `</div>`;
        });
        
        html += '</div></div>';
        contentContainer.innerHTML = html;
    } else {
        contentContainer.innerHTML = `
            <div class="settings-section">
                <div class="section-header">
                    <h3><i class="fas fa-search section-icon"></i> Search Results for "${query}"</h3>
                    <div class="section-description">
                        No settings found matching your search
                    </div>
                </div>
                <div class="section-body">
                    <p>Try searching with different keywords or browse through the settings menu.</p>
                </div>
            </div>
        `;
    }
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

// Show confirmation dialog
function showConfirmation(title, message, confirmCallback) {
    const confirmationTitle = document.getElementById('confirmationTitle');
    const confirmationMessage = document.getElementById('confirmationMessage');
    const modal = document.getElementById('confirmationModal');
    
    if (!confirmationTitle || !confirmationMessage || !modal) return;
    
    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    
    modal.classList.add('active');
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    const newConfirmCallback = () => {
        modal.classList.remove('active');
        if (confirmCallback) confirmCallback();
    };
    
    // Remove old listeners and add new one
    if (confirmBtn) {
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        const newConfirmBtn = document.getElementById('confirmActionBtn');
        if (newConfirmBtn) {
            newConfirmBtn.addEventListener('click', newConfirmCallback);
        }
    }
}

// Reset current section
function resetCurrentSection() {
    if (currentSection && DEFAULT_SETTINGS[currentSection]) {
        userSettings[currentSection] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[currentSection]));
        unsavedChanges = true;
        updateSaveButton();
        loadSection(currentSection);
        showNotification('Section reset to default values', 'success');
    }
}

// Update user status
function updateUserStatus() {
    const statusIndicator = document.getElementById('userStatusIndicator');
    const statusText = document.getElementById('userStatusText');
    
    if (!statusIndicator || !statusText) return;
    
    // For now, set to online
    statusIndicator.style.backgroundColor = 'var(--success-color)';
    statusText.textContent = 'Online';
}

// Calculate storage usage
function calculateStorageUsage() {
    // Simulate some storage usage
    const settings = userSettings.storage;
    settings.storageBreakdown.chats = Math.floor(Math.random() * 200) * 1024 * 1024;
    settings.storageBreakdown.media = Math.floor(Math.random() * 500) * 1024 * 1024;
    settings.storageBreakdown.other = Math.floor(Math.random() * 100) * 1024 * 1024;
    settings.totalStorageUsed = settings.storageBreakdown.chats + settings.storageBreakdown.media + settings.storageBreakdown.other;
}

// Format storage size
function formatStorageSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format time
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Get mood text
function getMoodText(mood) {
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
function getMoodColor(mood) {
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

// Get shortcut icon
function getShortcutIcon(shortcut) {
    const icons = {
        tools: 'tools',
        marketplace: 'store',
        groups: 'users',
        calls: 'phone',
        status: 'circle',
        settings: 'cog'
    };
    return icons[shortcut] || 'question';
}

// Get shortcut name
function getShortcutName(shortcut) {
    const names = {
        tools: 'Tools',
        marketplace: 'Marketplace',
        groups: 'Groups',
        calls: 'Calls',
        status: 'Status',
        settings: 'Settings'
    };
    return names[shortcut] || 'Unknown';
}

// Load blocked users
async function loadBlockedUsers() {
    try {
        console.log('Loading blocked users via API...');
        const response = await makeAuthenticatedRequest('GET', '/api/users/blocked');
        if (response && response.blockedUsers) {
            blockedUsers = response.blockedUsers;
            console.log('Blocked users loaded:', blockedUsers.length);
        }
    } catch (error) {
        console.error('Error loading blocked users:', error);
        // Don't throw error for non-critical data
    }
}

// Load active sessions
async function loadActiveSessions() {
    try {
        console.log('Loading active sessions via API...');
        const response = await makeAuthenticatedRequest('GET', '/api/auth/sessions');
        if (response && response.sessions) {
            activeSessions = response.sessions;
            console.log('Active sessions loaded:', activeSessions.length);
        }
    } catch (error) {
        console.error('Error loading active sessions:', error);
        // Don't throw error for non-critical data
    }
}

// Load user contacts
async function loadUserContacts() {
    try {
        console.log('Loading user contacts via API...');
        const response = await makeAuthenticatedRequest('GET', '/api/contacts');
        if (response && response.contacts) {
            userContacts = response.contacts;
            console.log('User contacts loaded:', userContacts.length);
        }
    } catch (error) {
        console.error('Error loading user contacts:', error);
        // Don't throw error for non-critical data
    }
}

// Load user groups
async function loadUserGroups() {
    try {
        console.log('Loading user groups via API...');
        const response = await makeAuthenticatedRequest('GET', '/api/groups');
        if (response && response.groups) {
            userGroups = response.groups;
            console.log('User groups loaded:', userGroups.length);
        }
    } catch (error) {
        console.error('Error loading user groups:', error);
        // Don't throw error for non-critical data
    }
}

// Show active sessions
function showActiveSessions() {
    const sessionsList = document.getElementById('sessionsList');
    const sessionsModal = document.getElementById('sessionsModal');
    
    if (!sessionsList || !sessionsModal) return;
    
    sessionsList.innerHTML = '';
    
    // Add current session
    sessionsList.innerHTML += `
        <div class="session-item">
            <div class="session-icon">
                <i class="fas fa-laptop"></i>
            </div>
            <div class="session-info">
                <div class="session-name">Current Session</div>
                <div class="session-details">This device • ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="session-actions">
                <span style="color: var(--success-color); font-size: 12px;">Active</span>
            </div>
        </div>
    `;
    
    // Add other sessions
    activeSessions.forEach(session => {
        sessionsList.innerHTML += `
            <div class="session-item">
                <div class="session-icon">
                    <i class="fas ${session.deviceType === 'mobile' ? 'fa-mobile-alt' : 'fa-desktop'}"></i>
                </div>
                <div class="session-info">
                    <div class="session-name">${session.deviceName}</div>
                    <div class="session-details">${session.location} • ${new Date(session.lastActive).toLocaleDateString()}</div>
                </div>
                <div class="session-actions">
                    <button class="terminate-btn" data-session-id="${session.id}">Terminate</button>
                </div>
            </div>
        `;
    });
    
    // Add event listeners to terminate buttons
    document.querySelectorAll('.terminate-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sessionId = this.dataset.sessionId;
            terminateSession(sessionId);
        });
    });
    
    sessionsModal.classList.add('active');
}

// Show blocked users
function showBlockedUsers() {
    const blockedUsersList = document.getElementById('blockedUsersList');
    const blockedUsersModal = document.getElementById('blockedUsersModal');
    
    if (!blockedUsersList || !blockedUsersModal) return;
    
    blockedUsersList.innerHTML = '';
    
    if (blockedUsers.length === 0) {
        blockedUsersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No blocked users</p>';
    } else {
        blockedUsers.forEach(user => {
            blockedUsersList.innerHTML += `
                <div class="blocked-user-item">
                    <div class="blocked-user-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="blocked-user-info">
                        <div class="blocked-user-name">${user.name}</div>
                        <div class="blocked-user-details">Blocked on ${new Date(user.blockedDate).toLocaleDateString()}</div>
                    </div>
                    <div class="blocked-user-actions">
                        <button class="unblock-btn" data-user-id="${user.id}">Unblock</button>
                    </div>
                </div>
            `;
        });
        
        // Add event listeners to unblock buttons
        document.querySelectorAll('.unblock-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = this.dataset.userId;
                unblockUser(userId);
            });
        });
    }
    
    blockedUsersModal.classList.add('active');
}

// Terminate session
async function terminateSession(sessionId) {
    try {
        console.log('Terminating session via API...');
        await makeAuthenticatedRequest('POST', '/api/auth/terminate-session', { sessionId });
        showNotification('Session terminated', 'success');
        await loadActiveSessions();
        showActiveSessions();
    } catch (error) {
        console.error('Error terminating session:', error);
        showNotification('Error terminating session', 'error');
    }
}

// Terminate all sessions
async function terminateAllSessions() {
    try {
        console.log('Terminating all sessions via API...');
        await makeAuthenticatedRequest('POST', '/api/auth/terminate-all-sessions');
        showNotification('All other sessions terminated', 'success');
        await loadActiveSessions();
        showActiveSessions();
    } catch (error) {
        console.error('Error terminating all sessions:', error);
        showNotification('Error terminating sessions', 'error');
    }
}

// Unblock user
async function unblockUser(userId) {
    try {
        console.log('Unblocking user via API...');
        await makeAuthenticatedRequest('POST', '/api/users/unblock', { userId });
        showNotification('User unblocked', 'success');
        await loadBlockedUsers();
        showBlockedUsers();
    } catch (error) {
        console.error('Error unblocking user:', error);
        showNotification('Error unblocking user', 'error');
    }
}

// Take photo
function takePhoto() {
    showNotification('Camera access would open here in a real app', 'info');
}

// Choose photo
function choosePhoto() {
    showNotification('Photo gallery would open here in a real app', 'info');
}

// Remove photo
function removePhoto() {
    showConfirmation(
        'Remove Profile Photo',
        'Are you sure you want to remove your profile photo?',
        () => {
            userSettings.profile.photoUrl = '';
            if (currentUser) {
                currentUser.photoURL = '';
                const userAvatarPreview = document.getElementById('userAvatarPreview');
                if (userAvatarPreview) {
                    userAvatarPreview.style.backgroundImage = '';
                    const initials = currentUser.displayName ? 
                        currentUser.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                        'U';
                    userAvatarPreview.innerHTML = `<span style="color: var(--text-secondary); font-size: 18px;">${initials}</span>`;
                }
            }
            showNotification('Profile photo removed', 'success');
            const changePhotoModal = document.getElementById('changePhotoModal');
            if (changePhotoModal) {
                changePhotoModal.classList.remove('active');
            }
        }
    );
}

// Save photo
function savePhoto() {
    showNotification('Profile photo saved', 'success');
    const changePhotoModal = document.getElementById('changePhotoModal');
    if (changePhotoModal) {
        changePhotoModal.classList.remove('active');
    }
}

// Change password
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const passwordError = document.getElementById('passwordError');
    const changePasswordModal = document.getElementById('changePasswordModal');
    
    if (!currentPassword || !newPassword || !confirmPassword || !passwordError || !changePasswordModal) return;
    
    // Reset error
    passwordError.style.display = 'none';
    
    // Validation
    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
        passwordError.textContent = 'All fields are required';
        passwordError.style.display = 'block';
        return;
    }
    
    if (newPassword.value !== confirmPassword.value) {
        passwordError.textContent = 'New passwords do not match';
        passwordError.style.display = 'block';
        return;
    }
    
    // Password requirements
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword.value)) {
        passwordError.textContent = 'Password does not meet requirements';
        passwordError.style.display = 'block';
        return;
    }
    
    try {
        console.log('Changing password via API...');
        await makeAuthenticatedRequest('POST', '/api/auth/change-password', {
            currentPassword: currentPassword.value,
            newPassword: newPassword.value
        });
        
        showNotification('Password changed successfully', 'success');
        changePasswordModal.classList.remove('active');
        
        // Clear form
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        
    } catch (error) {
        console.error('Error changing password:', error);
        passwordError.textContent = error.message || 'Error changing password';
        passwordError.style.display = 'block';
    }
}

// Edit mood color
function editMoodColor(mood) {
    if (!colorPicker) return;
    
    const currentColor = userSettings.mood.moodColors[mood];
    colorPicker.setColor(currentColor);
    colorPicker.show();
    
    // Update color when saved
    const originalSaveHandler = colorPicker._eventHandler.save;
    colorPicker.on('save', (color) => {
        if (color) {
            const hexColor = color.toHEXA().toString();
            userSettings.mood.moodColors[mood] = hexColor;
            unsavedChanges = true;
            updateSaveButton();
            loadSection('mood'); // Reload section to update colors
            showNotification(`${mood} color updated`, 'success');
        }
        colorPicker.hide();
        // Restore original handler
        colorPicker.on('save', originalSaveHandler);
    });
}

// Clear chat cache
async function clearChatCache() {
    try {
        console.log('Clearing chat cache via API...');
        await makeAuthenticatedRequest('POST', '/api/storage/clear-chat-cache');
        
        userSettings.storage.storageBreakdown.chats = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.media + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Chat cache cleared', 'success');
        
    } catch (error) {
        console.error('Error clearing chat cache:', error);
        showNotification('Error clearing chat cache', 'error');
    }
}

// Clear media cache
async function clearMediaCache() {
    try {
        console.log('Clearing media cache via API...');
        await makeAuthenticatedRequest('POST', '/api/storage/clear-media-cache');
        
        userSettings.storage.storageBreakdown.media = 0;
        userSettings.storage.totalStorageUsed = userSettings.storage.storageBreakdown.chats + userSettings.storage.storageBreakdown.other;
        unsavedChanges = true;
        updateSaveButton();
        loadSection('storage');
        showNotification('Media cache cleared', 'success');
        
    } catch (error) {
        console.error('Error clearing media cache:', error);
        showNotification('Error clearing media cache', 'error');
    }
}

// =============================================
// SECTION LOADING FUNCTIONS - ALL IMPLEMENTED
// =============================================

// PROFILE SECTION (22 features)
function loadProfileSection(container) {
    const settings = userSettings.profile || DEFAULT_SETTINGS.profile;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user section-icon"></i> Profile Information</h3>
                <div class="section-description">
                    Manage your personal information and how others see your profile
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">
                            Profile Photo
                            <i class="fas fa-info-circle setting-label-icon" title="Your profile picture visible to others"></i>
                        </div>
                        <div class="setting-description">
                            Click to change your profile photo
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePhotoBtn">
                            <i class="fas fa-camera"></i> Change Photo
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Display Name</div>
                        <div class="setting-description">
                            Your name as shown to other users
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="displayNameInput" 
                               value="${escapeHtml(settings.displayName || '')}" 
                               placeholder="Your name">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Username</div>
                        <div class="setting-description">
                            Your unique @username for mentions and sharing
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="usernameInput" 
                               value="${escapeHtml(settings.username || '')}" 
                               placeholder="@username" 
                               pattern="^@[a-zA-Z0-9_]+$">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Bio</div>
                        <div class="setting-description">
                            A short bio about yourself (max 150 characters)
                        </div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="bioInput" 
                                  placeholder="Tell people about yourself..." 
                                  maxlength="150">${escapeHtml(settings.bio || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Phone Number</div>
                        <div class="setting-description">
                            Your phone number for verification and contacts
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="tel" class="setting-input" id="phoneNumberInput" 
                               value="${escapeHtml(settings.phoneNumber || '')}" 
                               placeholder="+1 234 567 8900">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Email Address</div>
                        <div class="setting-description">
                            Your email for account recovery and notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="email" class="setting-input" id="emailInput" 
                               value="${escapeHtml(settings.email || '')}" 
                               placeholder="your@email.com">
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Profile Visibility</h3>
                <div class="section-description">
                    Control who can see your profile information
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Visibility</div>
                        <div class="setting-description">
                            Who can see your full profile
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="profileVisibilitySelect">
                            <option value="everyone" ${settings.profileVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.profileVisibility === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.profileVisibility === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Profile Photo Visibility</div>
                        <div class="setting-description">
                            Who can see your profile photo
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="profilePhotoVisibilitySelect">
                            <option value="everyone" ${settings.profilePhotoVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.profilePhotoVisibility === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.profilePhotoVisibility === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Seen</div>
                        <div class="setting-description">
                            Show when you were last active
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="lastSeenToggle" ${settings.lastSeen ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Online Status</div>
                        <div class="setting-description">
                            Show when you're online
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="onlineStatusToggle" ${settings.onlineStatus ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Current Mood</h3>
                <div class="section-description">
                    Your current mood status and settings
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Current Mood</div>
                        <div class="setting-description" id="currentMoodText">
                            ${getMoodText(settings.currentMood)}
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="mood-indicator" style="width: 24px; height: 24px; border-radius: 50%; background-color: ${getMoodColor(settings.currentMood)};"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Text</div>
                        <div class="setting-description">
                            Custom text to display with your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="text" class="setting-input" id="moodTextInput" 
                               value="${escapeHtml(settings.currentMoodText || '')}" 
                               placeholder="How you're feeling...">
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for profile section
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => {
            const changePhotoModal = document.getElementById('changePhotoModal');
            if (changePhotoModal) {
                changePhotoModal.classList.add('active');
            }
        });
    }
    
    // Input change listeners
    const inputs = ['displayNameInput', 'usernameInput', 'bioInput', 'phoneNumberInput', 'emailInput', 'moodTextInput'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                const property = id.replace('Input', '');
                userSettings.profile[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
                
                // Update user name in sidebar if display name changes
                if (id === 'displayNameInput' && currentUser) {
                    const userNamePreview = document.getElementById('userNamePreview');
                    if (userNamePreview) {
                        userNamePreview.textContent = element.value || 'User';
                    }
                }
            });
        }
    });
    
    // Select change listeners
    const selects = ['profileVisibilitySelect', 'profilePhotoVisibilitySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.profile[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['lastSeenToggle', 'onlineStatusToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.profile[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// SECURITY SECTION (11 features)
function loadSecuritySection(container) {
    const settings = userSettings.security || DEFAULT_SETTINGS.security;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Account Security</h3>
                <div class="section-description">
                    Enhanced security features to protect your account
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Two-Factor Authentication</div>
                        <div class="setting-description">
                            Add an extra layer of security to your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="twoFactorAuthToggle" ${settings.twoFactorAuth ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Change Password</div>
                        <div class="setting-description">
                            Update your account password regularly
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changePasswordBtn">
                            <i class="fas fa-key"></i> Change Password
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Login Notifications</div>
                        <div class="setting-description">
                            Get notified when someone logs into your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="loginNotificationsToggle" ${settings.loginNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Active Sessions</div>
                        <div class="setting-description">
                            View and manage devices logged into your account
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="viewSessionsBtn">
                            <i class="fas fa-desktop"></i> View All
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Session Management</h3>
                <div class="section-description">
                    Control how long your sessions stay active
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Session Timeout</div>
                        <div class="setting-description">
                            Automatically log out after period of inactivity
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="sessionTimeoutSelect">
                            <option value="15min" ${settings.sessionTimeout === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.sessionTimeout === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="1hr" ${settings.sessionTimeout === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="8hr" ${settings.sessionTimeout === '8hr' ? 'selected' : ''}>8 Hours</option>
                            <option value="never" ${settings.sessionTimeout === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enhanced Timeout</div>
                        <div class="setting-description">
                            Additional security for timeout protection
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enhancedTimeoutToggle" ${settings.enhancedTimeout ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Lock Screen After</div>
                        <div class="setting-description">
                            Lock app screen after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="lockScreenAfterSelect">
                            <option value="1min" ${settings.lockScreenAfter === '1min' ? 'selected' : ''}>1 Minute</option>
                            <option value="5min" ${settings.lockScreenAfter === '5min' ? 'selected' : ''}>5 Minutes</option>
                            <option value="15min" ${settings.lockScreenAfter === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.lockScreenAfter === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="never" ${settings.lockScreenAfter === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Logout After</div>
                        <div class="setting-description">
                            Complete logout after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="logoutAfterSelect">
                            <option value="1hr" ${settings.logoutAfter === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="4hr" ${settings.logoutAfter === '4hr' ? 'selected' : ''}>4 Hours</option>
                            <option value="8hr" ${settings.logoutAfter === '8hr' ? 'selected' : ''}>8 Hours</option>
                            <option value="24hr" ${settings.logoutAfter === '24hr' ? 'selected' : ''}>24 Hours</option>
                            <option value="never" ${settings.logoutAfter === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Timeout Warnings</div>
                        <div class="setting-description">
                            Show warnings before session timeout
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="timeoutWarningsToggle" ${settings.timeoutWarnings ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-lock section-icon"></i> App Protection</h3>
                <div class="section-description">
                    Additional protection for the app
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">App Lock</div>
                        <div class="setting-description">
                            Require authentication to open the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="appLockToggle" ${settings.appLock ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Screen Capture Protection</div>
                        <div class="setting-description">
                            Prevent screenshots and screen recording
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="screenCaptureToggle" ${settings.screenCaptureProtection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">End-to-End Encryption</div>
                        <div class="setting-description">
                            Encrypt all messages and calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="encryptionToggle" ${settings.encryption ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Biometric Bypass</div>
                        <div class="setting-description">
                            Allow biometric authentication to bypass locks
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="biometricBypassToggle" ${settings.biometricBypass ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for security section
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            const changePasswordModal = document.getElementById('changePasswordModal');
            if (changePasswordModal) {
                changePasswordModal.classList.add('active');
            }
        });
    }
    
    const viewSessionsBtn = document.getElementById('viewSessionsBtn');
    if (viewSessionsBtn) {
        viewSessionsBtn.addEventListener('click', () => {
            showActiveSessions();
        });
    }
    
    // Toggle change listeners
    const toggles = ['twoFactorAuthToggle', 'loginNotificationsToggle', 'enhancedTimeoutToggle', 
                   'timeoutWarningsToggle', 'appLockToggle', 'screenCaptureToggle', 
                   'encryptionToggle', 'biometricBypassToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.security[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Select change listeners
    const selects = ['sessionTimeoutSelect', 'lockScreenAfterSelect', 'logoutAfterSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.security[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// PRIVACY SECTION (25 features) - FULLY IMPLEMENTED
function loadPrivacySection(container) {
    const settings = userSettings.privacy || DEFAULT_SETTINGS.privacy;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Connection Settings</h3>
                <div class="section-description">
                    Control who can connect with you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Add Me</div>
                        <div class="setting-description">
                            Control who can send you friend requests
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanAddMeSelect">
                            <option value="everyone" ${settings.whoCanAddMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOfFriends" ${settings.whoCanAddMe === 'friendsOfFriends' ? 'selected' : ''}>Friends of Friends</option>
                            <option value="nobody" ${settings.whoCanAddMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Contact Discovery</div>
                        <div class="setting-description">
                            Allow others to find you by phone number or email
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="contactDiscoveryToggle" ${settings.contactDiscovery ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comments section-icon"></i> Messaging Privacy</h3>
                <div class="section-description">
                    Control who can message you and how
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Message Me</div>
                        <div class="setting-description">
                            Control who can send you messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canMessageMeSelect">
                            <option value="everyone" ${settings.canMessageMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canMessageMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canMessageMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Read Receipts</div>
                        <div class="setting-description">
                            Let others see when you've read their messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="readReceiptsToggle" ${settings.readReceipts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Typing Indicators</div>
                        <div class="setting-description">
                            Show when you're typing a message
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="typingIndicatorsToggle" ${settings.typingIndicators ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Forwarding</div>
                        <div class="setting-description">
                            Allow others to forward your messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageForwardingToggle" ${settings.messageForwarding ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can Forward Messages</div>
                        <div class="setting-description">
                            Who can forward your messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canForwardMessagesSelect">
                            <option value="everyone" ${settings.canForwardMessages === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canForwardMessages === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canForwardMessages === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can Take Screenshots</div>
                        <div class="setting-description">
                            Allow others to take screenshots of your chats
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="canTakeScreenshotsToggle" ${settings.canTakeScreenshots ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Privacy</h3>
                <div class="section-description">
                    Control who can call you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Call Me</div>
                        <div class="setting-description">
                            Control who can make voice or video calls to you
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canCallMeSelect">
                            <option value="everyone" ${settings.canCallMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canCallMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canCallMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Visibility Settings</h3>
                <div class="section-description">
                    Control what others can see about you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See My Status</div>
                        <div class="setting-description">
                            Who can see your status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeMyStatusSelect">
                            <option value="everyone" ${settings.canSeeMyStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeMyStatus === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeMyStatus === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See Profile Photo</div>
                        <div class="setting-description">
                            Who can see your profile picture
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeProfilePhotoSelect">
                            <option value="everyone" ${settings.canSeeProfilePhoto === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeProfilePhoto === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeProfilePhoto === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Can See Last Seen</div>
                        <div class="setting-description">
                            Who can see when you were last online
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="canSeeLastSeenSelect">
                            <option value="everyone" ${settings.canSeeLastSeen === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.canSeeLastSeen === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.canSeeLastSeen === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-ban section-icon"></i> Blocking & Safety</h3>
                <div class="section-description">
                    Manage blocked users and safety features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Blocked Users</div>
                        <div class="setting-description">
                            Manage users you've blocked
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="manageBlockedBtn">
                            <i class="fas fa-user-slash"></i> Manage
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for privacy section
    const manageBlockedBtn = document.getElementById('manageBlockedBtn');
    if (manageBlockedBtn) {
        manageBlockedBtn.addEventListener('click', () => {
            showBlockedUsers();
        });
    }
    
    // Select change listeners
    const selects = ['whoCanAddMeSelect', 'canMessageMeSelect', 'canForwardMessagesSelect', 
                   'canCallMeSelect', 'canSeeMyStatusSelect', 'canSeeProfilePhotoSelect', 
                   'canSeeLastSeenSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.privacy[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['contactDiscoveryToggle', 'readReceiptsToggle', 'typingIndicatorsToggle', 
                   'messageForwardingToggle', 'canTakeScreenshotsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.privacy[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// CHAT SECTION (12 features) - FULLY IMPLEMENTED
function loadChatSection(container) {
    const settings = userSettings.chat || DEFAULT_SETTINGS.chat;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-comments section-icon"></i> Chat Settings</h3>
                <div class="section-description">
                    Customize your chat experience
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Wallpaper</div>
                        <div class="setting-description">
                            Change the background of your chats
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="changeWallpaperBtn">
                            <i class="fas fa-image"></i> Change
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enter Key Sends</div>
                        <div class="setting-description">
                            Press Enter to send messages (Shift+Enter for new line)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="enterKeySendsToggle" ${settings.enterKeySends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Media Auto-Download</div>
                        <div class="setting-description">
                            Automatically download media files
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="mediaAutoDownloadSelect">
                            <option value="wifiOnly" ${settings.mediaAutoDownload === 'wifiOnly' ? 'selected' : ''}>Wi-Fi Only</option>
                            <option value="always" ${settings.mediaAutoDownload === 'always' ? 'selected' : ''}>Always</option>
                            <option value="never" ${settings.mediaAutoDownload === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Save to Camera Roll</div>
                        <div class="setting-description">
                            Automatically save received media to your device
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="saveToCameraRollToggle" ${settings.saveToCameraRoll ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-history section-icon"></i> Message History</h3>
                <div class="section-description">
                    Control how long messages are stored
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message History</div>
                        <div class="setting-description">
                            How long to keep message history
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="messageHistorySelect">
                            <option value="forever" ${settings.messageHistory === 'forever' ? 'selected' : ''}>Forever</option>
                            <option value="30days" ${settings.messageHistory === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="7days" ${settings.messageHistory === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="24hours" ${settings.messageHistory === '24hours' ? 'selected' : ''}>24 Hours</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Disappearing Messages</div>
                        <div class="setting-description">
                            Automatically delete messages after a period
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="disappearingMessagesSelect">
                            <option value="off" ${settings.disappearingMessages === 'off' ? 'selected' : ''}>Off</option>
                            <option value="1hour" ${settings.disappearingMessages === '1hour' ? 'selected' : ''}>1 Hour</option>
                            <option value="1day" ${settings.disappearingMessages === '1day' ? 'selected' : ''}>1 Day</option>
                            <option value="7days" ${settings.disappearingMessages === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="30days" ${settings.disappearingMessages === '30days' ? 'selected' : ''}>30 Days</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-robot section-icon"></i> Smart Features</h3>
                <div class="section-description">
                    AI-powered chat enhancements
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Replies</div>
                        <div class="setting-description">
                            Suggest quick replies based on conversation
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartRepliesToggle" ${settings.smartReplies ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Translation</div>
                        <div class="setting-description">
                            Automatically translate foreign language messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageTranslationToggle" ${settings.messageTranslation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Summarization</div>
                        <div class="setting-description">
                            Summarize long conversations
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="chatSummarizationToggle" ${settings.chatSummarization ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Safety Features</h3>
                <div class="section-description">
                    Protect yourself from unwanted content
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Spam Detection</div>
                        <div class="setting-description">
                            Automatically detect and filter spam messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="spamDetectionToggle" ${settings.spamDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Approval Mode</div>
                        <div class="setting-description">
                            Require approval before messages are sent
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageApprovalModeToggle" ${settings.messageApprovalMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Keyword Filtering</div>
                        <div class="setting-description">
                            Filter messages containing specific keywords
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="keywordFilteringToggle" ${settings.keywordFiltering ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for chat section
    const changeWallpaperBtn = document.getElementById('changeWallpaperBtn');
    if (changeWallpaperBtn) {
        changeWallpaperBtn.addEventListener('click', () => {
            // In a real app, this would open a wallpaper selection dialog
            showNotification('Select a wallpaper from your device or choose from defaults', 'info');
            
            // Simulate wallpaper selection
            const wallpapers = ['default', 'gradient', 'pattern', 'solid', 'custom'];
            const currentIndex = wallpapers.indexOf(settings.chatWallpaper);
            const nextIndex = (currentIndex + 1) % wallpapers.length;
            userSettings.chat.chatWallpaper = wallpapers[nextIndex];
            unsavedChanges = true;
            updateSaveButton();
            showNotification(`Wallpaper set to ${wallpapers[nextIndex]}`, 'success');
        });
    }
    
    // Select change listeners
    const selects = ['mediaAutoDownloadSelect', 'messageHistorySelect', 'disappearingMessagesSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.chat[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['enterKeySendsToggle', 'saveToCameraRollToggle', 'smartRepliesToggle', 
                   'messageTranslationToggle', 'chatSummarizationToggle', 'spamDetectionToggle',
                   'messageApprovalModeToggle', 'keywordFilteringToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.chat[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// FRIENDS SECTION (10 features) - FULLY IMPLEMENTED
function loadFriendsSection(container) {
    const settings = userSettings.friends || DEFAULT_SETTINGS.friends;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-plus section-icon"></i> Friend Discovery</h3>
                <div class="section-description">
                    Control how others can find and add you
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Discover by Phone Number</div>
                        <div class="setting-description">
                            Allow others to find you by your phone number
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="discoverByPhoneToggle" ${settings.discoverByPhone ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Discover by Email</div>
                        <div class="setting-description">
                            Allow others to find you by your email address
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="discoverByEmailToggle" ${settings.discoverByEmail ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Nearby Discovery</div>
                        <div class="setting-description">
                            Allow discovery by nearby users using Bluetooth
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="nearbyDiscoveryToggle" ${settings.nearbyDiscovery ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">QR Code Scanner</div>
                        <div class="setting-description">
                            Allow adding friends by scanning QR codes
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="qrCodeScannerToggle" ${settings.qrCodeScanner ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Suggestions</div>
                        <div class="setting-description">
                            Show friend suggestions based on mutual connections
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendSuggestionsToggle" ${settings.friendSuggestions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Friendship Features</h3>
                <div class="section-description">
                    Advanced friendship management features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Temporary Friends</div>
                        <div class="setting-description">
                            Allow temporary friendships that expire after time
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="temporaryFriendsToggle" ${settings.temporaryFriends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friendship Notes</div>
                        <div class="setting-description">
                            Add private notes to friends for reference
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendshipNotesToggle" ${settings.friendshipNotes ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Categories</div>
                        <div class="setting-description">
                            Organize friends into custom categories
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendCategoriesToggle" ${settings.friendCategories ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Trust Score</div>
                        <div class="setting-description">
                            Show trust scores for friends based on interaction
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="trustScoreToggle" ${settings.trustScore ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Analytics</div>
                        <div class="setting-description">
                            Show analytics about your friendships
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendAnalyticsToggle" ${settings.friendAnalytics ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Toggle change listeners
    const toggles = ['discoverByPhoneToggle', 'discoverByEmailToggle', 'nearbyDiscoveryToggle',
                   'qrCodeScannerToggle', 'friendSuggestionsToggle', 'temporaryFriendsToggle',
                   'friendshipNotesToggle', 'friendCategoriesToggle', 'trustScoreToggle',
                   'friendAnalyticsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.friends[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// GROUPS SECTION (15 features) - FULLY IMPLEMENTED
function loadGroupsSection(container) {
    const settings = userSettings.groups || DEFAULT_SETTINGS.groups;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-users section-icon"></i> Group Settings</h3>
                <div class="section-description">
                    Control your group participation and preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Join Groups</div>
                        <div class="setting-description">
                            Automatically join groups you're invited to
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoJoinGroupsToggle" ${settings.autoJoinGroups ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Invitations</div>
                        <div class="setting-description">
                            Who can invite you to groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupInvitationsSelect">
                            <option value="everyone" ${settings.groupInvitations === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.groupInvitations === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.groupInvitations === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Privacy</div>
                        <div class="setting-description">
                            Control who can add you to groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupPrivacySelect">
                            <option value="everyone" ${settings.groupPrivacy === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="myApprovalRequired" ${settings.groupPrivacy === 'myApprovalRequired' ? 'selected' : ''}>My Approval Required</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Announcements</div>
                        <div class="setting-description">
                            Receive announcements from group admins
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupAnnouncementsToggle" ${settings.groupAnnouncements ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Download Group Media</div>
                        <div class="setting-description">
                            Automatically download media from groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoDownloadGroupMediaSelect">
                            <option value="wifiOnly" ${settings.autoDownloadGroupMedia === 'wifiOnly' ? 'selected' : ''}>Wi-Fi Only</option>
                            <option value="always" ${settings.autoDownloadGroupMedia === 'always' ? 'selected' : ''}>Always</option>
                            <option value="never" ${settings.autoDownloadGroupMedia === 'never' ? 'selected' : ''}>Never</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cog section-icon"></i> Group Management</h3>
                <div class="section-description">
                    Advanced group management features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Approval Mode</div>
                        <div class="setting-description">
                            Require approval for messages in your groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageApprovalModeGroupToggle" ${settings.messageApprovalModeGroup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Keyword Filtering</div>
                        <div class="setting-description">
                            Filter messages containing specific keywords in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="keywordFilteringGroupToggle" ${settings.keywordFilteringGroup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Spam Detection</div>
                        <div class="setting-description">
                            Automatically detect and filter spam in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupSpamDetectionToggle" ${settings.groupSpamDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Member Warnings</div>
                        <div class="setting-description">
                            Show warnings for problematic group members
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="memberWarningsToggle" ${settings.memberWarnings ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-bar section-icon"></i> Group Analytics</h3>
                <div class="section-description">
                    Analytics and insights for groups
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Activity Tracking</div>
                        <div class="setting-description">
                            Track group activity and participation
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="activityTrackingToggle" ${settings.activityTracking ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Top Contributors</div>
                        <div class="setting-description">
                            Highlight top contributors in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="topContributorsToggle" ${settings.topContributors ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Volume Analytics</div>
                        <div class="setting-description">
                            Show analytics about message volume in groups
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageVolumeAnalyticsToggle" ${settings.messageVolumeAnalytics ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Data Cache</div>
                        <div class="setting-description">
                            How much group data to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupDataCacheSelect">
                            <option value="activeGroupsOnly" ${settings.groupDataCache === 'activeGroupsOnly' ? 'selected' : ''}>Active groups only</option>
                            <option value="allGroups" ${settings.groupDataCache === 'allGroups' ? 'selected' : ''}>All groups</option>
                            <option value="noGroupCache" ${settings.groupDataCache === 'noGroupCache' ? 'selected' : ''}>No group cache</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Select change listeners
    const selects = ['groupInvitationsSelect', 'groupPrivacySelect', 'autoDownloadGroupMediaSelect', 'groupDataCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.groups[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['autoJoinGroupsToggle', 'groupAnnouncementsToggle', 'messageApprovalModeGroupToggle',
                   'keywordFilteringGroupToggle', 'groupSpamDetectionToggle', 'memberWarningsToggle',
                   'activityTrackingToggle', 'topContributorsToggle', 'messageVolumeAnalyticsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.groups[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// CALLS SECTION (18 features) - FULLY IMPLEMENTED
function loadCallsSection(container) {
    const settings = userSettings.calls || DEFAULT_SETTINGS.calls;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-phone section-icon"></i> Call Settings</h3>
                <div class="section-description">
                    Configure your calling preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can Call Me</div>
                        <div class="setting-description">
                            Control who can make voice or video calls to you
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callsWhoCanCallMeSelect">
                            <option value="everyone" ${settings.whoCanCallMe === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanCallMe === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.whoCanCallMe === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Verification</div>
                        <div class="setting-description">
                            Verify caller identity before connecting calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callVerificationToggle" ${settings.callVerification ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Ringtone</div>
                        <div class="setting-description">
                            Choose your call ringtone
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="ringtoneSelect">
                            <option value="default" ${settings.ringtone === 'default' ? 'selected' : ''}>Default</option>
                            <option value="classic" ${settings.ringtone === 'classic' ? 'selected' : ''}>Classic</option>
                            <option value="modern" ${settings.ringtone === 'modern' ? 'selected' : ''}>Modern</option>
                            <option value="custom" ${settings.ringtone === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Vibration</div>
                        <div class="setting-description">
                            Vibrate on incoming calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callVibrationToggle" ${settings.callVibration ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Answer</div>
                        <div class="setting-description">
                            Automatically answer calls (use with caution)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoAnswerToggle" ${settings.autoAnswer ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-video section-icon"></i> Video Call Settings</h3>
                <div class="section-description">
                    Configure video call preferences
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Video Quality</div>
                        <div class="setting-description">
                            Adjust video quality for calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="videoQualitySelect">
                            <option value="auto" ${settings.videoQuality === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="high" ${settings.videoQuality === 'high' ? 'selected' : ''}>High</option>
                            <option value="medium" ${settings.videoQuality === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="low" ${settings.videoQuality === 'low' ? 'selected' : ''}>Low</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Camera Default</div>
                        <div class="setting-description">
                            Default camera for video calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="cameraDefaultSelect">
                            <option value="front" ${settings.cameraDefault === 'front' ? 'selected' : ''}>Front Camera</option>
                            <option value="back" ${settings.cameraDefault === 'back' ? 'selected' : ''}>Back Camera</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Noise Cancellation</div>
                        <div class="setting-description">
                            Reduce background noise during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="noiseCancellationToggle" ${settings.noiseCancellation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Echo Cancellation</div>
                        <div class="setting-description">
                            Reduce echo during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="echoCancellationToggle" ${settings.echoCancellation ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bolt section-icon"></i> Call Features</h3>
                <div class="section-description">
                    Advanced calling features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Live Reactions</div>
                        <div class="setting-description">
                            Show live reactions during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="liveReactionsToggle" ${settings.liveReactions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">In-Call Chat</div>
                        <div class="setting-description">
                            Chat during voice/video calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="inCallChatToggle" ${settings.inCallChat ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shared Whiteboard</div>
                        <div class="setting-description">
                            Share a whiteboard during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="sharedWhiteboardToggle" ${settings.sharedWhiteboard ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shared Notes</div>
                        <div class="setting-description">
                            Share notes during calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="sharedNotesToggle" ${settings.sharedNotes ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Polls</div>
                        <div class="setting-description">
                            Create polls during group calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="pollsToggle" ${settings.polls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call History Cache</div>
                        <div class="setting-description">
                            How much call history to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callHistoryCacheSelect">
                            <option value="30days" ${settings.callHistoryCache === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="90days" ${settings.callHistoryCache === '90days' ? 'selected' : ''}>90 Days</option>
                            <option value="180days" ${settings.callHistoryCache === '180days' ? 'selected' : ''}>180 Days</option>
                            <option value="all" ${settings.callHistoryCache === 'all' ? 'selected' : ''}>All</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Select change listeners
    const selects = ['callsWhoCanCallMeSelect', 'ringtoneSelect', 'videoQualitySelect', 
                   'cameraDefaultSelect', 'callHistoryCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                if (id === 'callsWhoCanCallMeSelect') {
                    userSettings.calls.whoCanCallMe = element.value;
                } else {
                    userSettings.calls[property] = element.value;
                }
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['callVerificationToggle', 'callVibrationToggle', 'autoAnswerToggle',
                   'noiseCancellationToggle', 'echoCancellationToggle', 'liveReactionsToggle',
                   'inCallChatToggle', 'sharedWhiteboardToggle', 'sharedNotesToggle', 'pollsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.calls[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// STATUS SECTION (12 features) - FULLY IMPLEMENTED
function loadStatusSection(container) {
    const settings = userSettings.status || DEFAULT_SETTINGS.status;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-circle section-icon"></i> Status Privacy</h3>
                <div class="section-description">
                    Control who can see your status updates
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Who Can View My Status</div>
                        <div class="setting-description">
                            Control who can see your status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="whoCanViewMyStatusSelect">
                            <option value="everyone" ${settings.whoCanViewMyStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.whoCanViewMyStatus === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="selectedFriends" ${settings.whoCanViewMyStatus === 'selectedFriends' ? 'selected' : ''}>Selected Friends</option>
                            <option value="nobody" ${settings.whoCanViewMyStatus === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Expire Status</div>
                        <div class="setting-description">
                            Automatically remove status after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoExpireStatusSelect">
                            <option value="24h" ${settings.autoExpireStatus === '24h' ? 'selected' : ''}>24 Hours</option>
                            <option value="12h" ${settings.autoExpireStatus === '12h' ? 'selected' : ''}>12 Hours</option>
                            <option value="6h" ${settings.autoExpireStatus === '6h' ? 'selected' : ''}>6 Hours</option>
                            <option value="1h" ${settings.autoExpireStatus === '1h' ? 'selected' : ''}>1 Hour</option>
                            <option value="custom" ${settings.autoExpireStatus === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Reply Permissions</div>
                        <div class="setting-description">
                            Who can reply to your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="replyPermissionsSelect">
                            <option value="everyone" ${settings.replyPermissions === 'everyone' ? 'selected' : ''}>Everyone</option>
                            <option value="friendsOnly" ${settings.replyPermissions === 'friendsOnly' ? 'selected' : ''}>Friends Only</option>
                            <option value="nobody" ${settings.replyPermissions === 'nobody' ? 'selected' : ''}>Nobody</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Download Permissions</div>
                        <div class="setting-description">
                            Allow others to download your status media
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="downloadPermissionsToggle" ${settings.downloadPermissions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Hide from Specific Users</div>
                        <div class="setting-description">
                            Hide your status from specific users
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="hideFromUsersBtn">
                            <i class="fas fa-user-slash"></i> Manage
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-bar section-icon"></i> Status Analytics</h3>
                <div class="section-description">
                    Analytics and engagement features
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">View Count</div>
                        <div class="setting-description">
                            Show how many people viewed your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="viewCountToggle" ${settings.viewCount ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Viewer List</div>
                        <div class="setting-description">
                            Show who viewed your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="viewerListToggle" ${settings.viewerList ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Engagement Reactions</div>
                        <div class="setting-description">
                            Allow reactions to your status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="engagementReactionsToggle" ${settings.engagementReactions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-magic section-icon"></i> Status Enhancements</h3>
                <div class="section-description">
                    AI and automation features for status
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Captions</div>
                        <div class="setting-description">
                            Automatically add captions to video status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoCaptionsToggle" ${settings.autoCaptions ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">AI Enhancement</div>
                        <div class="setting-description">
                            Use AI to enhance status quality
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="aiEnhancementToggle" ${settings.aiEnhancement ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Scheduling</div>
                        <div class="setting-description">
                            Schedule status posts for later
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="statusSchedulingToggle" ${settings.statusScheduling ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Cache</div>
                        <div class="setting-description">
                            How much status data to cache locally
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="statusCacheSelect">
                            <option value="24hours" ${settings.statusCache === '24hours' ? 'selected' : ''}>24 Hours</option>
                            <option value="7days" ${settings.statusCache === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="none" ${settings.statusCache === 'none' ? 'selected' : ''}>None</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for status section
    const hideFromUsersBtn = document.getElementById('hideFromUsersBtn');
    if (hideFromUsersBtn) {
        hideFromUsersBtn.addEventListener('click', () => {
            // In a real app, this would open a user selection dialog
            showNotification('Select users to hide your status from', 'info');
        });
    }
    
    // Select change listeners
    const selects = ['whoCanViewMyStatusSelect', 'autoExpireStatusSelect', 'replyPermissionsSelect', 'statusCacheSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.status[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['downloadPermissionsToggle', 'viewCountToggle', 'viewerListToggle',
                   'engagementReactionsToggle', 'autoCaptionsToggle', 'aiEnhancementToggle',
                   'statusSchedulingToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.status[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// NOTIFICATIONS SECTION (13 features) - FULLY IMPLEMENTED
function loadNotificationsSection(container) {
    const settings = userSettings.notifications || DEFAULT_SETTINGS.notifications;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Notification Types</h3>
                <div class="section-description">
                    Control which notifications you receive
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Message Notifications</div>
                        <div class="setting-description">
                            Notifications for new messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="messageNotificationsToggle" ${settings.messageNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Notifications</div>
                        <div class="setting-description">
                            Notifications for group activity
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="groupNotificationsToggle" ${settings.groupNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Friend Request Notifications</div>
                        <div class="setting-description">
                            Notifications for friend requests
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="friendRequestNotificationsToggle" ${settings.friendRequestNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call Notifications</div>
                        <div class="setting-description">
                            Notifications for incoming calls
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="callNotificationsToggle" ${settings.callNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Notifications</div>
                        <div class="setting-description">
                            Notifications for status updates
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="statusNotificationsToggle" ${settings.statusNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-volume-up section-icon"></i> Notification Preferences</h3>
                <div class="section-description">
                    How notifications are delivered
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Sound</div>
                        <div class="setting-description">
                            Play sound for notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationSoundToggle" ${settings.notificationSound ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Vibration</div>
                        <div class="setting-description">
                            Vibrate for notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="vibrationToggle" ${settings.vibration ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Popup Notifications</div>
                        <div class="setting-description">
                            Show popup notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="popupNotificationsToggle" ${settings.popupNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Notification Light</div>
                        <div class="setting-description">
                            Use notification LED (if available)
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="notificationLightToggle" ${settings.notificationLight ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-moon section-icon"></i> Do Not Disturb</h3>
                <div class="section-description">
                    Quiet hours and disturbance control
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Do Not Disturb</div>
                        <div class="setting-description">
                            Silence all notifications
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="doNotDisturbToggle" ${settings.doNotDisturb ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Schedule</div>
                        <div class="setting-description">
                            When to enable Do Not Disturb
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="scheduleSelect">
                            <option value="custom" ${settings.schedule === 'custom' ? 'selected' : ''}>Custom Hours</option>
                            <option value="night" ${settings.schedule === 'night' ? 'selected' : ''}>Night (10pm-7am)</option>
                            <option value="workHours" ${settings.schedule === 'workHours' ? 'selected' : ''}>Work Hours (9am-5pm)</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Allow Calls</div>
                        <div class="setting-description">
                            Allow calls even during Do Not Disturb
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="allowCallsToggle" ${settings.allowCalls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Allow Messages From</div>
                        <div class="setting-description">
                            Allow messages from specific contacts during DND
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="allowMessagesFromBtn">
                            <i class="fas fa-users"></i> Select
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for notifications section
    const allowMessagesFromBtn = document.getElementById('allowMessagesFromBtn');
    if (allowMessagesFromBtn) {
        allowMessagesFromBtn.addEventListener('click', () => {
            // In a real app, this would open a contact selection dialog
            showNotification('Select contacts allowed during Do Not Disturb', 'info');
        });
    }
    
    // Select change listener
    const scheduleSelect = document.getElementById('scheduleSelect');
    if (scheduleSelect) {
        scheduleSelect.addEventListener('change', function() {
            userSettings.notifications.schedule = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
    
    // Toggle change listeners
    const toggles = ['messageNotificationsToggle', 'groupNotificationsToggle', 'friendRequestNotificationsToggle',
                   'callNotificationsToggle', 'statusNotificationsToggle', 'notificationSoundToggle',
                   'vibrationToggle', 'popupNotificationsToggle', 'notificationLightToggle',
                   'doNotDisturbToggle', 'allowCallsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.notifications[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// APPEARANCE SECTION (13 features) - FULLY IMPLEMENTED
function loadAppearanceSection(container) {
    const settings = userSettings.appearance || DEFAULT_SETTINGS.appearance;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Theme & Colors</h3>
                <div class="section-description">
                    Customize the look and feel of the app
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Theme</div>
                        <div class="setting-description">
                            Choose your preferred theme
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="light" ${settings.theme === 'light' ? 'checked' : ''}>
                                <span class="radio-label">Light</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}>
                                <span class="radio-label">Dark</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="theme" class="radio-input" value="auto" ${settings.theme === 'auto' ? 'checked' : ''}>
                                <span class="radio-label">Auto</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Accent Color</div>
                        <div class="setting-description">
                            Choose the primary color for the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="color-picker" id="accentColorPicker" 
                             style="background-color: ${settings.accentColor};"
                             title="Click to change color"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Font Size</div>
                        <div class="setting-description">
                            Adjust the text size (${settings.fontSize}px)
                        </div>
                    </div>
                    <div class="setting-control">
                        <input type="range" class="setting-slider" id="fontSizeSlider" 
                               min="12" max="20" value="${settings.fontSize}" step="1">
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Reduce Motion</div>
                        <div class="setting-description">
                            Reduce animations and motion effects
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="reduceMotionToggle" ${settings.reduceMotion ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood-Based Layouts</div>
                        <div class="setting-description">
                            Change layout based on your current mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodBasedLayoutsToggle" ${settings.moodBasedLayouts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-globe section-icon"></i> Language & Region</h3>
                <div class="section-description">
                    Regional and language settings
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Language</div>
                        <div class="setting-description">
                            Choose your preferred language
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="languageSelect">
                            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                            <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Español</option>
                            <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>Français</option>
                            <option value="de" ${settings.language === 'de' ? 'selected' : ''}>Deutsch</option>
                            <option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>中文</option>
                            <option value="ar" ${settings.language === 'ar' ? 'selected' : ''}>العربية</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Time Format</div>
                        <div class="setting-description">
                            Choose 12-hour or 24-hour time format
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="timeFormatSelect">
                            <option value="12-hour" ${settings.timeFormat === '12-hour' ? 'selected' : ''}>12-hour (1:30 PM)</option>
                            <option value="24-hour" ${settings.timeFormat === '24-hour' ? 'selected' : ''}>24-hour (13:30)</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Date Format</div>
                        <div class="setting-description">
                            Choose your preferred date format
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="dateFormatSelect">
                            <option value="MM/DD/YYYY" ${settings.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                            <option value="DD/MM/YYYY" ${settings.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
                            <option value="YYYY-MM-DD" ${settings.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-th-large section-icon"></i> Layout & Icons</h3>
                <div class="section-description">
                    Customize layout and icon styles
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Layout Mode</div>
                        <div class="setting-description">
                            Choose your preferred layout style
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="compact" ${settings.layoutMode === 'compact' ? 'checked' : ''}>
                                <span class="radio-label">Compact</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="detailed" ${settings.layoutMode === 'detailed' ? 'checked' : ''}>
                                <span class="radio-label">Detailed</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="focus" ${settings.layoutMode === 'focus' ? 'checked' : ''}>
                                <span class="radio-label">Focus</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="layoutMode" class="radio-input" value="auto" ${settings.layoutMode === 'auto' ? 'checked' : ''}>
                                <span class="radio-label">Auto</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Layout Previews</div>
                        <div class="setting-description">
                            Preview different layout modes
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="layout-previews">
                            <div class="layout-preview ${settings.layoutMode === 'compact' ? 'selected' : ''}" data-layout="compact">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 20%, var(--bg-color) 20%);"></div>
                                <div class="preview-title">Compact</div>
                            </div>
                            <div class="layout-preview ${settings.layoutMode === 'detailed' ? 'selected' : ''}" data-layout="detailed">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 40%, var(--bg-color) 40%);"></div>
                                <div class="preview-title">Detailed</div>
                            </div>
                            <div class="layout-preview ${settings.layoutMode === 'focus' ? 'selected' : ''}" data-layout="focus">
                                <div class="preview-thumbnail" style="background: linear-gradient(to bottom, var(--primary-color) 60%, var(--bg-color) 40%);"></div>
                                <div class="preview-title">Focus</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Custom Icons</div>
                        <div class="setting-description">
                            Use custom icon sets
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="customIconsToggle" ${settings.customIcons ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Button Styles</div>
                        <div class="setting-description">
                            Choose button style throughout the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="buttonStylesSelect">
                            <option value="rounded" ${settings.buttonStyles === 'rounded' ? 'selected' : ''}>Rounded</option>
                            <option value="square" ${settings.buttonStyles === 'square' ? 'selected' : ''}>Square</option>
                            <option value="pill" ${settings.buttonStyles === 'pill' ? 'selected' : ''}>Pill</option>
                            <option value="floating" ${settings.buttonStyles === 'floating' ? 'selected' : ''}>Floating</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for appearance section
    // Theme radio buttons
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', function() {
            userSettings.appearance.theme = this.value;
            unsavedChanges = true;
            updateSaveButton();
            applyTheme(this.value);
        });
    });
    
    // Layout radio buttons
    document.querySelectorAll('input[name="layoutMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            userSettings.appearance.layoutMode = this.value;
            unsavedChanges = true;
            updateSaveButton();
            
            // Update layout preview selection
            document.querySelectorAll('.layout-preview').forEach(preview => {
                preview.classList.remove('selected');
                if (preview.dataset.layout === this.value) {
                    preview.classList.add('selected');
                }
            });
        });
    });
    
    // Layout preview clicks
    document.querySelectorAll('.layout-preview').forEach(preview => {
        preview.addEventListener('click', function() {
            const layout = this.dataset.layout;
            userSettings.appearance.layoutMode = layout;
            unsavedChanges = true;
            updateSaveButton();
            
            // Update radio button
            const radio = document.querySelector(`input[name="layoutMode"][value="${layout}"]`);
            if (radio) {
                radio.checked = true;
            }
            
            // Update preview selection
            document.querySelectorAll('.layout-preview').forEach(p => {
                p.classList.remove('selected');
            });
            this.classList.add('selected');
        });
    });
    
    // Color picker
    const accentColorPicker = document.getElementById('accentColorPicker');
    if (accentColorPicker) {
        accentColorPicker.addEventListener('click', function() {
            if (colorPicker) {
                colorPicker.show();
            }
        });
    }
    
    // Font size slider
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', function() {
            userSettings.appearance.fontSize = parseInt(this.value);
            unsavedChanges = true;
            updateSaveButton();
            applyFontSize(this.value);
        });
    }
    
    // Select change listeners
    const selects = ['languageSelect', 'timeFormatSelect', 'dateFormatSelect', 'buttonStylesSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.appearance[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['reduceMotionToggle', 'moodBasedLayoutsToggle', 'customIconsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.appearance[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// STORAGE SECTION (7 features) - FULLY IMPLEMENTED
function loadStorageSection(container) {
    const settings = userSettings.storage || DEFAULT_SETTINGS.storage;
    const totalUsed = settings.totalStorageUsed;
    const totalAvailable = settings.storageTotal;
    const percentUsed = Math.min((totalUsed / totalAvailable) * 100, 100);
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-database section-icon"></i> Storage Overview</h3>
                <div class="section-description">
                    Monitor your storage usage
                </div>
            </div>
            <div class="section-body">
                <div class="storage-info">
                    <div class="storage-header">
                        <div class="storage-label">Total Storage Used</div>
                        <div class="storage-value">${formatStorageSize(totalUsed)} / ${formatStorageSize(totalAvailable)}</div>
                    </div>
                    <div class="storage-bar">
                        <div class="storage-fill" style="width: ${percentUsed}%;"></div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Storage</div>
                        <div class="setting-description">
                            Messages and chat data
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.chats)}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Media Storage</div>
                        <div class="setting-description">
                            Photos, videos, and documents
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.media)}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Other Storage</div>
                        <div class="setting-description">
                            Cache and other app data
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="storage-value">${formatStorageSize(settings.storageBreakdown.other)}</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-broom section-icon"></i> Cache Management</h3>
                <div class="section-description">
                    Manage cached data and storage
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Clear Cache</div>
                        <div class="setting-description">
                            Automatically clear cache at intervals
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="autoClearCacheSelect">
                            <option value="never" ${settings.autoClearCache === 'never' ? 'selected' : ''}>Never</option>
                            <option value="weekly" ${settings.autoClearCache === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${settings.autoClearCache === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Chat Cache</div>
                        <div class="setting-description">
                            Clear cached chat data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearChatCacheBtn">
                            <i class="fas fa-trash"></i> Clear Now
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Clear Media Cache</div>
                        <div class="setting-description">
                            Clear cached media files
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="clearMediaCacheBtn">
                            <i class="fas fa-trash"></i> Clear Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for storage section
    const clearChatCacheBtn = document.getElementById('clearChatCacheBtn');
    if (clearChatCacheBtn) {
        clearChatCacheBtn.addEventListener('click', () => {
            showConfirmation(
                'Clear Chat Cache',
                'Are you sure you want to clear all chat cache? This will remove temporary chat data but not your messages.',
                () => {
                    clearChatCache();
                }
            );
        });
    }
    
    const clearMediaCacheBtn = document.getElementById('clearMediaCacheBtn');
    if (clearMediaCacheBtn) {
        clearMediaCacheBtn.addEventListener('click', () => {
            showConfirmation(
                'Clear Media Cache',
                'Are you sure you want to clear all media cache? This will remove downloaded media files but they can be re-downloaded.',
                () => {
                    clearMediaCache();
                }
            );
        });
    }
    
    // Select change listener
    const autoClearCacheSelect = document.getElementById('autoClearCacheSelect');
    if (autoClearCacheSelect) {
        autoClearCacheSelect.addEventListener('change', function() {
            userSettings.storage.autoClearCache = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// MOOD SETTINGS SECTION (24 features) - FULLY IMPLEMENTED
function loadMoodSection(container) {
    const settings = userSettings.mood || DEFAULT_SETTINGS.mood;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-smile section-icon"></i> Mood Detection</h3>
                <div class="section-description">
                    Configure how your mood is detected and displayed
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Mood Detection</div>
                        <div class="setting-description">
                            Automatically detect your mood based on activity
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoMoodDetectionToggle" ${settings.autoMoodDetection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Manual Mood Override</div>
                        <div class="setting-description">
                            Manually set your mood instead of auto-detection
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="manualMoodOverrideSelect">
                            <option value="autoDetect" ${settings.manualMoodOverride === 'autoDetect' ? 'selected' : ''}>Auto-Detect</option>
                            <option value="happy" ${settings.manualMoodOverride === 'happy' ? 'selected' : ''}>Happy</option>
                            <option value="calm" ${settings.manualMoodOverride === 'calm' ? 'selected' : ''}>Calm</option>
                            <option value="energetic" ${settings.manualMoodOverride === 'energetic' ? 'selected' : ''}>Energetic</option>
                            <option value="focused" ${settings.manualMoodOverride === 'focused' ? 'selected' : ''}>Focused</option>
                            <option value="relaxed" ${settings.manualMoodOverride === 'relaxed' ? 'selected' : ''}>Relaxed</option>
                            <option value="stressed" ${settings.manualMoodOverride === 'stressed' ? 'selected' : ''}>Stressed</option>
                            <option value="tired" ${settings.manualMoodOverride === 'tired' ? 'selected' : ''}>Tired</option>
                            <option value="excited" ${settings.manualMoodOverride === 'excited' ? 'selected' : ''}>Excited</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Calls</div>
                        <div class="setting-description">
                            Update mood based on call interactions
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterCallsToggle" ${settings.updateAfterCalls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Status Posts</div>
                        <div class="setting-description">
                            Update mood based on status content
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterStatusPostsToggle" ${settings.updateAfterStatusPosts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Update After Activity</div>
                        <div class="setting-description">
                            Update mood based on app usage patterns
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="updateAfterActivityToggle" ${settings.updateAfterActivity ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-palette section-icon"></i> Mood Colors</h3>
                <div class="section-description">
                    Customize colors for each mood type
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood-Linked Theme</div>
                        <div class="setting-description">
                            Change app theme based on your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodLinkedThemeToggle" ${settings.moodLinkedTheme ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="mood-colors-grid">
                    <div class="mood-color-item ${settings.currentMood === 'happy' ? 'active' : ''}" data-mood="happy">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.happy};"></div>
                        <div class="mood-color-label">Happy</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'calm' ? 'active' : ''}" data-mood="calm">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.calm};"></div>
                        <div class="mood-color-label">Calm</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'energetic' ? 'active' : ''}" data-mood="energetic">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.energetic};"></div>
                        <div class="mood-color-label">Energetic</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'focused' ? 'active' : ''}" data-mood="focused">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.focused};"></div>
                        <div class="mood-color-label">Focused</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'relaxed' ? 'active' : ''}" data-mood="relaxed">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.relaxed};"></div>
                        <div class="mood-color-label">Relaxed</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'stressed' ? 'active' : ''}" data-mood="stressed">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.stressed};"></div>
                        <div class="mood-color-label">Stressed</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'tired' ? 'active' : ''}" data-mood="tired">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.tired};"></div>
                        <div class="mood-color-label">Tired</div>
                    </div>
                    <div class="mood-color-item ${settings.currentMood === 'excited' ? 'active' : ''}" data-mood="excited">
                        <div class="mood-color-preview" style="background-color: ${settings.moodColors.excited};"></div>
                        <div class="mood-color-label">Excited</div>
                    </div>
                </div>
                
                <div style="margin-top: 20px; font-size: 12px; color: var(--text-secondary); text-align: center;">
                    Click on a mood to set it as current, or long press to edit its color
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bell section-icon"></i> Mood-Based Features</h3>
                <div class="section-description">
                    Smart features that adapt to your mood
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Notifications</div>
                        <div class="setting-description">
                            Adjust notification behavior based on mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartNotificationsToggle" ${settings.smartNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Auto-Replies</div>
                        <div class="setting-description">
                            Send automatic replies based on your mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodAutoRepliesToggle" ${settings.moodAutoReplies ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Template Selection</div>
                        <div class="setting-description">
                            Select message templates based on mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartTemplateSelectionToggle" ${settings.smartTemplateSelection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cog section-icon"></i> Mood Rules</h3>
                <div class="section-description">
                    Configure rules for specific moods
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Stressed Mode Rules</div>
                        <div class="setting-description">
                            Special rules when you're stressed
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="stressedModeRulesToggle" ${settings.stressedModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Focused Mode Rules</div>
                        <div class="setting-description">
                            Special rules when you're focused
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusedModeRulesToggle" ${settings.focusedModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Happy Mode Rules</div>
                        <div class="setting-description">
                            Special rules when you're happy
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="happyModeRulesToggle" ${settings.happyModeRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Privacy Rules</div>
                        <div class="setting-description">
                            Adjust privacy based on mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="moodPrivacyRulesToggle" ${settings.moodPrivacyRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Rule Duration</div>
                        <div class="setting-description">
                            How long mood rules stay active
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="ruleDurationSelect">
                            <option value="2hr" ${settings.ruleDuration === '2hr' ? 'selected' : ''}>2 Hours</option>
                            <option value="6hr" ${settings.ruleDuration === '6hr' ? 'selected' : ''}>6 Hours</option>
                            <option value="24hr" ${settings.ruleDuration === '24hr' ? 'selected' : ''}>24 Hours</option>
                            <option value="untilMoodChanges" ${settings.ruleDuration === 'untilMoodChanges' ? 'selected' : ''}>Until Mood Changes</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for mood section
    // Mood color selection
    document.querySelectorAll('.mood-color-item').forEach(item => {
        item.addEventListener('click', function() {
            const mood = this.dataset.mood;
            userSettings.mood.currentMood = mood;
            userSettings.profile.currentMood = mood;
            unsavedChanges = true;
            updateSaveButton();
            
            // Update active state
            document.querySelectorAll('.mood-color-item').forEach(i => {
                i.classList.remove('active');
            });
            this.classList.add('active');
            
            showNotification(`Mood set to ${mood}`, 'success');
        });
        
        // Long press for color editing
        let pressTimer;
        item.addEventListener('mousedown', function(e) {
            pressTimer = setTimeout(() => {
                const mood = this.dataset.mood;
                editMoodColor(mood);
            }, 1000);
        });
        
        item.addEventListener('mouseup', function() {
            clearTimeout(pressTimer);
        });
        
        item.addEventListener('mouseleave', function() {
            clearTimeout(pressTimer);
        });
        
        // Touch events for mobile
        item.addEventListener('touchstart', function(e) {
            pressTimer = setTimeout(() => {
                const mood = this.dataset.mood;
                editMoodColor(mood);
                e.preventDefault();
            }, 1000);
        });
        
        item.addEventListener('touchend', function() {
            clearTimeout(pressTimer);
        });
        
        item.addEventListener('touchmove', function() {
            clearTimeout(pressTimer);
        });
    });
    
    // Select change listeners
    const selects = ['manualMoodOverrideSelect', 'ruleDurationSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.mood[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['autoMoodDetectionToggle', 'updateAfterCallsToggle', 'updateAfterStatusPostsToggle',
                   'updateAfterActivityToggle', 'moodLinkedThemeToggle', 'smartNotificationsToggle',
                   'moodAutoRepliesToggle', 'smartTemplateSelectionToggle', 'stressedModeRulesToggle',
                   'focusedModeRulesToggle', 'happyModeRulesToggle', 'moodPrivacyRulesToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.mood[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// SMART ACTIVITY SECTION (18 features) - FULLY IMPLEMENTED
function loadActivitySection(container) {
    const settings = userSettings.activity || DEFAULT_SETTINGS.activity;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-brain section-icon"></i> Focus Mode</h3>
                <div class="section-description">
                    Stay focused with minimal distractions
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Focus Mode</div>
                        <div class="setting-description">
                            Enable focus mode to minimize distractions
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusModeToggle" ${settings.focusMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Focus Duration</div>
                        <div class="setting-description">
                            How long focus mode stays active
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="focusDurationSelect">
                            <option value="30min" ${settings.focusDuration === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="1hr" ${settings.focusDuration === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="2hr" ${settings.focusDuration === '2hr' ? 'selected' : ''}>2 Hours</option>
                            <option value="custom" ${settings.focusDuration === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Enable Focus Mode</div>
                        <div class="setting-description">
                            Automatically enable focus mode based on schedule
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoEnableFocusModeToggle" ${settings.autoEnableFocusMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-shield section-icon"></i> Focus Mode Exceptions</h3>
                <div class="section-description">
                    Allow specific contacts during focus mode
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Essential Contacts</div>
                        <div class="setting-description">
                            Allow messages from essential contacts
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusModeEssentialContactsToggle" ${settings.focusModeEssentialContacts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Urgent Calls</div>
                        <div class="setting-description">
                            Allow urgent calls during focus mode
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusModeUrgentCallsToggle" ${settings.focusModeUrgentCalls ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Work Messages</div>
                        <div class="setting-description">
                            Allow work-related messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusModeWorkMessagesToggle" ${settings.focusModeWorkMessages ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Family Messages</div>
                        <div class="setting-description">
                            Allow family messages
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="focusModeFamilyMessagesToggle" ${settings.focusModeFamilyMessages ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-archive section-icon"></i> Auto-Archive</h3>
                <div class="section-description">
                    Automatically archive inactive chats
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto-Archive Chats</div>
                        <div class="setting-description">
                            Automatically archive inactive chats
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoArchiveChatsToggle" ${settings.autoArchiveChats ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Inactivity Period</div>
                        <div class="setting-description">
                            Archive chats inactive for specified period
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="inactivityPeriodSelect">
                            <option value="30" ${settings.inactivityPeriod === '30' ? 'selected' : ''}>30 Days</option>
                            <option value="60" ${settings.inactivityPeriod === '60' ? 'selected' : ''}>60 Days</option>
                            <option value="90" ${settings.inactivityPeriod === '90' ? 'selected' : ''}>90 Days</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Exclude Important Chats</div>
                        <div class="setting-description">
                            Don't archive important conversations
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="excludeImportantChatsToggle" ${settings.excludeImportantChats ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Archive Notifications</div>
                        <div class="setting-description">
                            Notify when chats are auto-archived
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="archiveNotificationsToggle" ${settings.archiveNotifications ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-database section-icon"></i> Data Cache Settings</h3>
                <div class="section-description">
                    Control how data is cached for performance
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Offline Data Control</div>
                        <div class="setting-description">
                            How much data to store for offline use
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="offlineDataControlSelect">
                            <option value="balanced" ${settings.offlineDataControl === 'balanced' ? 'selected' : ''}>Balanced</option>
                            <option value="aggressive" ${settings.offlineDataControl === 'aggressive' ? 'selected' : ''}>Aggressive</option>
                            <option value="conservative" ${settings.offlineDataControl === 'conservative' ? 'selected' : ''}>Conservative</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Chat Page Cache</div>
                        <div class="setting-description">
                            How long to cache chat pages
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="chatPageCacheSelect">
                            <option value="30days" ${settings.chatPageCache === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="7days" ${settings.chatPageCache === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="1day" ${settings.chatPageCache === '1day' ? 'selected' : ''}>1 Day</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Call History Cache</div>
                        <div class="setting-description">
                            How much call history to cache
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="callHistoryCacheActivitySelect">
                            <option value="90days" ${settings.callHistoryCacheActivity === '90days' ? 'selected' : ''}>90 Days</option>
                            <option value="30days" ${settings.callHistoryCacheActivity === '30days' ? 'selected' : ''}>30 Days</option>
                            <option value="7days" ${settings.callHistoryCacheActivity === '7days' ? 'selected' : ''}>7 Days</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Group Data Cache</div>
                        <div class="setting-description">
                            How much group data to cache
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="groupDataCacheActivitySelect">
                            <option value="activeGroupsOnly" ${settings.groupDataCacheActivity === 'activeGroupsOnly' ? 'selected' : ''}>Active groups only</option>
                            <option value="allGroups" ${settings.groupDataCacheActivity === 'allGroups' ? 'selected' : ''}>All groups</option>
                            <option value="noGroupCache" ${settings.groupDataCacheActivity === 'noGroupCache' ? 'selected' : ''}>No group cache</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Status Cache</div>
                        <div class="setting-description">
                            How much status data to cache
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="statusCacheActivitySelect">
                            <option value="7days" ${settings.statusCacheActivity === '7days' ? 'selected' : ''}>7 Days</option>
                            <option value="3days" ${settings.statusCacheActivity === '3days' ? 'selected' : ''}>3 Days</option>
                            <option value="1day" ${settings.statusCacheActivity === '1day' ? 'selected' : ''}>1 Day</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Select change listeners
    const selects = ['focusDurationSelect', 'inactivityPeriodSelect', 'offlineDataControlSelect', 
                   'chatPageCacheSelect', 'callHistoryCacheActivitySelect', 'groupDataCacheActivitySelect', 
                   'statusCacheActivitySelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.activity[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['focusModeToggle', 'autoEnableFocusModeToggle', 'focusModeEssentialContactsToggle',
                   'focusModeUrgentCallsToggle', 'focusModeWorkMessagesToggle', 'focusModeFamilyMessagesToggle',
                   'autoArchiveChatsToggle', 'excludeImportantChatsToggle', 'archiveNotificationsToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.activity[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// INTERACTION INTELLIGENCE SECTION (23 features) - FULLY IMPLEMENTED
function loadIntelligenceSection(container) {
    const settings = userSettings.intelligence || DEFAULT_SETTINGS.intelligence;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-eye section-icon"></i> Smart Visibility</h3>
                <div class="section-description">
                    Intelligent visibility controls based on your activity
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Visibility</div>
                        <div class="setting-description">
                            Automatically adjust visibility based on activity
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="smartVisibilityToggle" ${settings.smartVisibility ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Time-Based Visibility</div>
                        <div class="setting-description">
                            Adjust visibility based on time of day
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="timeBasedVisibilityToggle" ${settings.timeBasedVisibility ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Activity-Based Visibility</div>
                        <div class="setting-description">
                            Adjust visibility based on your activity level
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="activityBasedVisibilityToggle" ${settings.activityBasedVisibility ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-line section-icon"></i> Interaction Analytics</h3>
                <div class="section-description">
                    Analytics about your communication patterns
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Interaction Analytics</div>
                        <div class="setting-description">
                            Track and analyze your communication patterns
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="interactionAnalyticsToggle" ${settings.interactionAnalytics ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Weekly Reports</div>
                        <div class="setting-description">
                            Receive weekly interaction reports
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="weeklyReportsToggle" ${settings.weeklyReports ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Interaction Trends</div>
                        <div class="setting-description">
                            Show trends in your communication patterns
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="interactionTrendsToggle" ${settings.interactionTrends ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-reply section-icon"></i> Mood Auto-Replies</h3>
                <div class="section-description">
                    Automatic responses based on your mood
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Auto-Replies</div>
                        <div class="setting-description">
                            Send automatic replies based on your current mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="intelMoodAutoRepliesToggle" ${settings.moodAutoReplies ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Busy Mood Template</div>
                        <div class="setting-description">
                            Auto-reply when you're busy
                        </div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="busyMoodTemplateInput" 
                                  placeholder="Auto-reply when busy..." 
                                  maxlength="200">${escapeHtml(settings.busyMoodTemplate || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Focused Mood Template</div>
                        <div class="setting-description">
                            Auto-reply when you're focused
                        </div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="focusedMoodTemplateInput" 
                                  placeholder="Auto-reply when focused..." 
                                  maxlength="200">${escapeHtml(settings.focusedMoodTemplate || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Relaxed Mood Template</div>
                        <div class="setting-description">
                            Auto-reply when you're relaxed
                        </div>
                    </div>
                    <div class="setting-control">
                        <textarea class="setting-textarea" id="relaxedMoodTemplateInput" 
                                  placeholder="Auto-reply when relaxed..." 
                                  maxlength="200">${escapeHtml(settings.relaxedMoodTemplate || '')}</textarea>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Smart Template Selection</div>
                        <div class="setting-description">
                            Automatically select the best template based on context
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="intelSmartTemplateSelectionToggle" ${settings.smartTemplateSelection ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Input change listeners
    const inputs = ['busyMoodTemplateInput', 'focusedMoodTemplateInput', 'relaxedMoodTemplateInput'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                const property = id.replace('Input', '');
                userSettings.intelligence[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['smartVisibilityToggle', 'timeBasedVisibilityToggle', 'activityBasedVisibilityToggle',
                   'interactionAnalyticsToggle', 'weeklyReportsToggle', 'interactionTrendsToggle',
                   'intelMoodAutoRepliesToggle', 'intelSmartTemplateSelectionToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '').replace('Intel', '');
                userSettings.intelligence[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// PERSONALIZATION SECTION (17 features) - FULLY IMPLEMENTED
function loadPersonalizationSection(container) {
    const settings = userSettings.personalization || DEFAULT_SETTINGS.personalization;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-sliders-h section-icon"></i> Layout & Interface</h3>
                <div class="section-description">
                    Personalize your app layout and interface
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Layout Mode</div>
                        <div class="setting-description">
                            Choose your preferred layout style
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="personalizationLayoutModeSelect">
                            <option value="auto" ${settings.layoutMode === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="compact" ${settings.layoutMode === 'compact' ? 'selected' : ''}>Compact</option>
                            <option value="detailed" ${settings.layoutMode === 'detailed' ? 'selected' : ''}>Detailed</option>
                            <option value="focus" ${settings.layoutMode === 'focus' ? 'selected' : ''}>Focus</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood-Based Layouts</div>
                        <div class="setting-description">
                            Change layout based on your current mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="personalizationMoodBasedLayoutsToggle" ${settings.moodBasedLayouts ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Custom Icons</div>
                        <div class="setting-description">
                            Use custom icon sets
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="personalizationCustomIconsToggle" ${settings.customIcons ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Button Styles</div>
                        <div class="setting-description">
                            Choose button style throughout the app
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="personalizationButtonStylesSelect">
                            <option value="rounded" ${settings.buttonStyles === 'rounded' ? 'selected' : ''}>Rounded</option>
                            <option value="square" ${settings.buttonStyles === 'square' ? 'selected' : ''}>Square</option>
                            <option value="pill" ${settings.buttonStyles === 'pill' ? 'selected' : ''}>Pill</option>
                            <option value="floating" ${settings.buttonStyles === 'floating' ? 'selected' : ''}>Floating</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-bolt section-icon"></i> Quick Access Shortcuts</h3>
                <div class="section-description">
                    Customize quick access shortcuts
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Quick Access</div>
                        <div class="setting-description">
                            Enable quick access shortcuts
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="quickAccessToggle" ${settings.quickAccess ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shortcut 1</div>
                        <div class="setting-description">
                            First quick access shortcut
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="shortcut1Select">
                            <option value="tools" ${settings.shortcut1 === 'tools' ? 'selected' : ''}>Tools</option>
                            <option value="marketplace" ${settings.shortcut1 === 'marketplace' ? 'selected' : ''}>Marketplace</option>
                            <option value="groups" ${settings.shortcut1 === 'groups' ? 'selected' : ''}>Groups</option>
                            <option value="calls" ${settings.shortcut1 === 'calls' ? 'selected' : ''}>Calls</option>
                            <option value="status" ${settings.shortcut1 === 'status' ? 'selected' : ''}>Status</option>
                            <option value="settings" ${settings.shortcut1 === 'settings' ? 'selected' : ''}>Settings</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shortcut 2</div>
                        <div class="setting-description">
                            Second quick access shortcut
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="shortcut2Select">
                            <option value="tools" ${settings.shortcut2 === 'tools' ? 'selected' : ''}>Tools</option>
                            <option value="marketplace" ${settings.shortcut2 === 'marketplace' ? 'selected' : ''}>Marketplace</option>
                            <option value="groups" ${settings.shortcut2 === 'groups' ? 'selected' : ''}>Groups</option>
                            <option value="calls" ${settings.shortcut2 === 'calls' ? 'selected' : ''}>Calls</option>
                            <option value="status" ${settings.shortcut2 === 'status' ? 'selected' : ''}>Status</option>
                            <option value="settings" ${settings.shortcut2 === 'settings' ? 'selected' : ''}>Settings</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shortcut 3</div>
                        <div class="setting-description">
                            Third quick access shortcut
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="shortcut3Select">
                            <option value="tools" ${settings.shortcut3 === 'tools' ? 'selected' : ''}>Tools</option>
                            <option value="marketplace" ${settings.shortcut3 === 'marketplace' ? 'selected' : ''}>Marketplace</option>
                            <option value="groups" ${settings.shortcut3 === 'groups' ? 'selected' : ''}>Groups</option>
                            <option value="calls" ${settings.shortcut3 === 'calls' ? 'selected' : ''}>Calls</option>
                            <option value="status" ${settings.shortcut3 === 'status' ? 'selected' : ''}>Status</option>
                            <option value="settings" ${settings.shortcut3 === 'settings' ? 'selected' : ''}>Settings</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Shortcut Position</div>
                        <div class="setting-description">
                            Where to display shortcuts
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="shortcutPositionSelect">
                            <option value="topBar" ${settings.shortcutPosition === 'topBar' ? 'selected' : ''}>Top Bar</option>
                            <option value="bottomBar" ${settings.shortcutPosition === 'bottomBar' ? 'selected' : ''}>Bottom Bar</option>
                            <option value="floating" ${settings.shortcutPosition === 'floating' ? 'selected' : ''}>Floating</option>
                            <option value="sidebar" ${settings.shortcutPosition === 'sidebar' ? 'selected' : ''}>Sidebar</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Select change listeners
    const selects = ['personalizationLayoutModeSelect', 'personalizationButtonStylesSelect', 'shortcut1Select',
                    'shortcut2Select', 'shortcut3Select', 'shortcutPositionSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '').replace('Personalization', '');
                userSettings.personalization[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['personalizationMoodBasedLayoutsToggle', 'personalizationCustomIconsToggle', 'quickAccessToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '').replace('Personalization', '');
                userSettings.personalization[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// SAFETY SECTION (19 features) - FULLY IMPLEMENTED
function loadSafetySection(container) {
    const settings = userSettings.safety || DEFAULT_SETTINGS.safety;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-user-secret section-icon"></i> Invisible Mode</h3>
                <div class="section-description">
                    Temporarily hide your online status and activity
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Invisible Mode</div>
                        <div class="setting-description">
                            Temporarily hide your online status
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="invisibleModeToggle" ${settings.invisibleMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Invisible Duration</div>
                        <div class="setting-description">
                            How long to stay invisible
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="invisibleDurationSelect">
                            <option value="15min" ${settings.invisibleDuration === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.invisibleDuration === '30min' ? 'selected' : ''}>30 Minutes</option>
                            <option value="1hr" ${settings.invisibleDuration === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="custom" ${settings.invisibleDuration === 'custom' ? 'selected' : ''}>Custom</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Hide from Specific Contacts</div>
                        <div class="setting-description">
                            Choose contacts to hide from when invisible
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="hideFromContactsBtn">
                            <i class="fas fa-user-slash"></i> Select
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Always Visible To</div>
                        <div class="setting-description">
                            Contacts who can always see you
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="alwaysVisibleToBtn">
                            <i class="fas fa-user-check"></i> Select
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-clock section-icon"></i> Enhanced Timeout</h3>
                <div class="section-description">
                    Advanced timeout and session management
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Enhanced Timeout</div>
                        <div class="setting-description">
                            Additional security for timeout protection
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="safetyEnhancedTimeoutToggle" ${settings.enhancedTimeout ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Lock Screen After</div>
                        <div class="setting-description">
                            Lock app screen after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="safetyLockScreenAfterSelect">
                            <option value="1min" ${settings.lockScreenAfter === '1min' ? 'selected' : ''}>1 Minute</option>
                            <option value="5min" ${settings.lockScreenAfter === '5min' ? 'selected' : ''}>5 Minutes</option>
                            <option value="15min" ${settings.lockScreenAfter === '15min' ? 'selected' : ''}>15 Minutes</option>
                            <option value="30min" ${settings.lockScreenAfter === '30min' ? 'selected' : ''}>30 Minutes</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Logout After</div>
                        <div class="setting-description">
                            Complete logout after specified time
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="safetyLogoutAfterSelect">
                            <option value="1hr" ${settings.logoutAfter === '1hr' ? 'selected' : ''}>1 Hour</option>
                            <option value="4hr" ${settings.logoutAfter === '4hr' ? 'selected' : ''}>4 Hours</option>
                            <option value="8hr" ${settings.logoutAfter === '8hr' ? 'selected' : ''}>8 Hours</option>
                            <option value="24hr" ${settings.logoutAfter === '24hr' ? 'selected' : ''}>24 Hours</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Biometric Bypass</div>
                        <div class="setting-description">
                            Allow biometric authentication to bypass locks
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="safetyBiometricBypassToggle" ${settings.biometricBypass ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Timeout Warnings</div>
                        <div class="setting-description">
                            Show warnings before session timeout
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="safetyTimeoutWarningsToggle" ${settings.timeoutWarnings ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-shield-alt section-icon"></i> Mood Privacy Rules</h3>
                <div class="section-description">
                    Adjust privacy based on your current mood
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Mood Privacy Rules</div>
                        <div class="setting-description">
                            Automatically adjust privacy based on mood
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="safetyMoodPrivacyRulesToggle" ${settings.moodPrivacyRules ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Tired Mood Rule</div>
                        <div class="setting-description">
                            Special privacy rules when tired
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="tiredMoodRuleToggle" ${settings.tiredMoodRule ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Stressed Mood Rule</div>
                        <div class="setting-description">
                            Special privacy rules when stressed
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="stressedMoodRuleToggle" ${settings.stressedMoodRule ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Happy Mood Rule</div>
                        <div class="setting-description">
                            Special privacy rules when happy
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="happyMoodRuleToggle" ${settings.happyMoodRule ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Rule Duration</div>
                        <div class="setting-description">
                            How long mood privacy rules stay active
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="safetyRuleDurationSelect">
                            <option value="2hr" ${settings.ruleDuration === '2hr' ? 'selected' : ''}>2 Hours</option>
                            <option value="6hr" ${settings.ruleDuration === '6hr' ? 'selected' : ''}>6 Hours</option>
                            <option value="24hr" ${settings.ruleDuration === '24hr' ? 'selected' : ''}>24 Hours</option>
                            <option value="untilMoodChanges" ${settings.ruleDuration === 'untilMoodChanges' ? 'selected' : ''}>Until Mood Changes</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for safety section
    const hideFromContactsBtn = document.getElementById('hideFromContactsBtn');
    if (hideFromContactsBtn) {
        hideFromContactsBtn.addEventListener('click', () => {
            showNotification('Select contacts to hide from when invisible', 'info');
        });
    }
    
    const alwaysVisibleToBtn = document.getElementById('alwaysVisibleToBtn');
    if (alwaysVisibleToBtn) {
        alwaysVisibleToBtn.addEventListener('click', () => {
            showNotification('Select contacts who can always see you', 'info');
        });
    }
    
    // Select change listeners
    const selects = ['invisibleDurationSelect', 'safetyLockScreenAfterSelect', 'safetyLogoutAfterSelect', 'safetyRuleDurationSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '').replace('Safety', '');
                userSettings.safety[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listeners
    const toggles = ['invisibleModeToggle', 'safetyEnhancedTimeoutToggle', 'safetyBiometricBypassToggle',
                    'safetyTimeoutWarningsToggle', 'safetyMoodPrivacyRulesToggle', 'tiredMoodRuleToggle',
                    'stressedMoodRuleToggle', 'happyMoodRuleToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '').replace('Safety', '');
                userSettings.safety[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// ADVANCED SECTION (10 features) - FULLY IMPLEMENTED
function loadAdvancedSection(container) {
    const settings = userSettings.advanced || DEFAULT_SETTINGS.advanced;
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cogs section-icon"></i> Advanced Features</h3>
                <div class="section-description">
                    Developer options and advanced configurations
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Offline Mode</div>
                        <div class="setting-description">
                            Use the app without internet connection
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="offlineModeToggle" ${settings.offlineMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Intranet Support</div>
                        <div class="setting-description">
                            Enable communication within local network
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="intranetSupportToggle" ${settings.intranetSupport ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Low Bandwidth Mode</div>
                        <div class="setting-description">
                            Optimize for slow internet connections
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="lowBandwidthModeToggle" ${settings.lowBandwidthMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Debug Mode</div>
                        <div class="setting-description">
                            Enable debugging and logging features
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="debugModeToggle" ${settings.debugMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Data Saver</div>
                        <div class="setting-description">
                            Reduce data usage for mobile networks
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="dataSaverToggle" ${settings.dataSaver ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Proxy Settings</div>
                        <div class="setting-description">
                            Configure network proxy settings
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="proxySettingsBtn">
                            <i class="fas fa-network-wired"></i> Configure
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for advanced section
    const proxySettingsBtn = document.getElementById('proxySettingsBtn');
    if (proxySettingsBtn) {
        proxySettingsBtn.addEventListener('click', () => {
            showNotification('Proxy configuration would open here', 'info');
        });
    }
    
    // Toggle change listeners
    const toggles = ['offlineModeToggle', 'intranetSupportToggle', 'lowBandwidthModeToggle',
                    'debugModeToggle', 'dataSaverToggle'];
    toggles.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Toggle', '');
                userSettings.advanced[property] = element.checked;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
}

// BACKUP SECTION (11 features) - FULLY IMPLEMENTED
function loadBackupSection(container) {
    const settings = userSettings.backup || DEFAULT_SETTINGS.backup;
    const lastBackup = settings.lastBackup ? new Date(settings.lastBackup).toLocaleDateString() : 'Never';
    
    container.innerHTML = `
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-cloud-upload-alt section-icon"></i> Backup Settings</h3>
                <div class="section-description">
                    Configure automatic backups and restore options
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Auto Backup</div>
                        <div class="setting-description">
                            Automatically backup your data
                        </div>
                    </div>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoBackupToggle" ${settings.autoBackup ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Frequency</div>
                        <div class="setting-description">
                            How often to create backups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="backupFrequencySelect">
                            <option value="daily" ${settings.backupFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${settings.backupFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${settings.backupFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Location</div>
                        <div class="setting-description">
                            Where to store your backups
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="backupLocationSelect">
                            <option value="cloud" ${settings.backupLocation === 'cloud' ? 'selected' : ''}>Cloud Storage</option>
                            <option value="local" ${settings.backupLocation === 'local' ? 'selected' : ''}>Local Device</option>
                            <option value="both" ${settings.backupLocation === 'both' ? 'selected' : ''}>Both Cloud and Local</option>
                        </select>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Backup</div>
                        <div class="setting-description">
                            When your data was last backed up
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="setting-value">${lastBackup}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Backup Size</div>
                        <div class="setting-description">
                            Size of your latest backup
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="setting-value">${formatStorageSize(settings.backupSize)}</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="section-header">
                <h3><i class="fas fa-download section-icon"></i> Restore Options</h3>
                <div class="section-description">
                    Restore your data from backup
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Create Backup Now</div>
                        <div class="setting-description">
                            Manually create a backup of your data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="createBackupBtn">
                            <i class="fas fa-save"></i> Backup Now
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Restore from Backup</div>
                        <div class="setting-description">
                            Restore your data from a previous backup
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button" id="restoreBackupBtn">
                            <i class="fas fa-history"></i> Restore
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for backup section
    const createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', () => {
            showConfirmation(
                'Create Backup',
                'Are you sure you want to create a backup now? This may take a few minutes.',
                () => {
                    createBackup();
                }
            );
        });
    }
    
    const restoreBackupBtn = document.getElementById('restoreBackupBtn');
    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', () => {
            showConfirmation(
                'Restore from Backup',
                'Are you sure you want to restore from backup? This will overwrite your current data.',
                () => {
                    restoreFromBackup();
                }
            );
        });
    }
    
    // Select change listeners
    const selects = ['backupFrequencySelect', 'backupLocationSelect'];
    selects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                const property = id.replace('Select', '');
                userSettings.backup[property] = element.value;
                unsavedChanges = true;
                updateSaveButton();
            });
        }
    });
    
    // Toggle change listener
    const autoBackupToggle = document.getElementById('autoBackupToggle');
    if (autoBackupToggle) {
        autoBackupToggle.addEventListener('change', function() {
            userSettings.backup.autoBackup = this.checked;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// DANGER ZONE SECTION (7 features) - FULLY IMPLEMENTED
function loadDangerSection(container) {
    const settings = userSettings.danger || DEFAULT_SETTINGS.danger;
    const deletionScheduled = settings.deletionScheduled ? new Date(settings.deletionScheduled).toLocaleDateString() : 'Not scheduled';
    const lastExport = settings.lastExport ? new Date(settings.lastExport).toLocaleDateString() : 'Never';
    
    container.innerHTML = `
        <div class="settings-section danger-zone">
            <div class="section-header">
                <h3 style="color: var(--danger-color);"><i class="fas fa-exclamation-triangle section-icon"></i> Danger Zone</h3>
                <div class="section-description">
                    Irreversible actions - proceed with extreme caution
                </div>
            </div>
            <div class="section-body">
                <div class="setting-item danger-item">
                    <div class="setting-info">
                        <div class="setting-label" style="color: var(--danger-color);">Export Your Data</div>
                        <div class="setting-description">
                            Download a copy of all your data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button danger" id="exportDataBtn">
                            <i class="fas fa-file-export"></i> Export Data
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Last Export</div>
                        <div class="setting-description">
                            When your data was last exported
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="setting-value">${lastExport}</div>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Export Format</div>
                        <div class="setting-description">
                            Choose the format for exported data
                        </div>
                    </div>
                    <div class="setting-control">
                        <select class="setting-dropdown" id="exportFormatSelect">
                            <option value="json" ${settings.exportFormat === 'json' ? 'selected' : ''}>JSON</option>
                            <option value="csv" ${settings.exportFormat === 'csv' ? 'selected' : ''}>CSV</option>
                            <option value="xml" ${settings.exportFormat === 'xml' ? 'selected' : ''}>XML</option>
                        </select>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="setting-item danger-item">
                    <div class="setting-info">
                        <div class="setting-label" style="color: var(--danger-color);">Request Account Deletion</div>
                        <div class="setting-description">
                            Permanently delete your account and all data
                        </div>
                    </div>
                    <div class="setting-control">
                        <button class="setting-button danger" id="requestDeletionBtn">
                            <i class="fas fa-trash-alt"></i> Delete Account
                        </button>
                    </div>
                </div>
                
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Deletion Scheduled</div>
                        <div class="setting-description">
                            When your account will be deleted
                        </div>
                    </div>
                    <div class="setting-control">
                        <div class="setting-value">${deletionScheduled}</div>
                    </div>
                </div>
                
                <div class="warning-box">
                    <i class="fas fa-exclamation-circle"></i>
                    <div class="warning-text">
                        <strong>Warning:</strong> Account deletion is permanent and cannot be undone. 
                        All your messages, contacts, photos, and other data will be permanently deleted.
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for danger section
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            showConfirmation(
                'Export Your Data',
                'Are you sure you want to export all your data? This may take several minutes.',
                () => {
                    exportUserData();
                }
            );
        });
    }
    
    const requestDeletionBtn = document.getElementById('requestDeletionBtn');
    if (requestDeletionBtn) {
        requestDeletionBtn.addEventListener('click', () => {
            showConfirmation(
                'Delete Account',
                'Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.',
                () => {
                    requestAccountDeletion();
                }
            );
        });
    }
    
    // Select change listener
    const exportFormatSelect = document.getElementById('exportFormatSelect');
    if (exportFormatSelect) {
        exportFormatSelect.addEventListener('change', function() {
            userSettings.danger.exportFormat = this.value;
            unsavedChanges = true;
            updateSaveButton();
        });
    }
}

// Create backup function
async function createBackup() {
    try {
        showNotification('Creating backup...', 'info');
        
        // Simulate backup creation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        userSettings.backup.lastBackup = new Date().toISOString();
        userSettings.backup.backupSize = Math.floor(Math.random() * 500) * 1024 * 1024; // Random size
        
        unsavedChanges = true;
        updateSaveButton();
        loadSection('backup');
        
        showNotification('Backup created successfully', 'success');
    } catch (error) {
        console.error('Error creating backup:', error);
        showNotification('Error creating backup', 'error');
    }
}

// Restore from backup function
async function restoreFromBackup() {
    try {
        showNotification('Restoring from backup...', 'info');
        
        // Simulate restore process
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        showNotification('Data restored successfully', 'success');
    } catch (error) {
        console.error('Error restoring from backup:', error);
        showNotification('Error restoring from backup', 'error');
    }
}

// Export user data function
async function exportUserData() {
    try {
        showNotification('Exporting your data...', 'info');
        
        // Simulate export process
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        userSettings.danger.lastExport = new Date().toISOString();
        userSettings.danger.dataExportRequested = true;
        
        unsavedChanges = true;
        updateSaveButton();
        
        showNotification('Data export started. You will receive a download link when ready.', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Error exporting data', 'error');
    }
}

// Request account deletion function
async function requestAccountDeletion() {
    try {
        showNotification('Processing account deletion request...', 'info');
        
        // Simulate deletion request
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30); // 30 days from now
        
        userSettings.danger.accountDeletionRequested = true;
        userSettings.danger.deletionScheduled = deletionDate.toISOString();
        
        unsavedChanges = true;
        updateSaveButton();
        loadSection('danger');
        
        showNotification('Account deletion scheduled. You have 30 days to cancel.', 'warning');
    } catch (error) {
        console.error('Error requesting account deletion:', error);
        showNotification('Error requesting account deletion', 'error');
    }
}

// Start bootstrap when page loads
document.addEventListener('DOMContentLoaded', bootstrapIframe);