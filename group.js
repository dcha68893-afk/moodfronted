// =============================================
// COMPLETE FUNCTIONAL GROUPS SYSTEM WITH UNIQUE FEATURES
// INTEGRATED WITH EXISTING API SYSTEM
// =============================================

// Global variables
let currentUser = null;
let userData = null;
let groups = [];
let myGroups = [];
let joinedGroups = [];
let groupInvites = [];
let adminGroups = [];
let selectedGroup = null;
let currentTypeFilter = 'all';
let currentSearchTerm = '';
let isLoadedFromLocalStorage = false;
let isMobile = window.innerWidth <= 768;
let pendingGroupActions = [];
let offlineOverlayDismissed = false;
let friends = [];
let selectedFriends = [];

// Unique features variables
let groupPurposes = {
    'study': { name: 'Study', icon: '📚', color: '#4CAF50' },
    'prayer': { name: 'Prayer', icon: '🙏', color: '#9C27B0' },
    'work': { name: 'Work', icon: '💼', color: '#2196F3' },
    'family': { name: 'Family', icon: '👨‍👩‍👧‍👦', color: '#FF9800' },
    'event': { name: 'Event', icon: '🎉', color: '#E91E63' },
    'project': { name: 'Project', icon: '📋', color: '#009688' },
    'support': { name: 'Support', icon: '🤝', color: '#3F51B5' },
    'hobby': { name: 'Hobby', icon: '🎨', color: '#FF5722' },
    'fitness': { name: 'Fitness', icon: '💪', color: '#00BCD4' },
    'other': { name: 'Other', icon: '🔮', color: '#607D8B' }
};

let groupMoods = {
    'calm': { name: 'Calm', icon: '😌', color: '#1976d2', bgColor: '#e3f2fd' },
    'busy': { name: 'Busy', icon: '🏃', color: '#f57c00', bgColor: '#fff3e0' },
    'celebratory': { name: 'Celebratory', icon: '🎉', color: '#c2185b', bgColor: '#fce4ec' },
    'silent': { name: 'Silent', icon: '🔇', color: '#616161', bgColor: '#f5f5f5' },
    'urgent': { name: 'Urgent', icon: '🚨', color: '#d32f2f', bgColor: '#ffebee' }
};

let postingRules = {
    'everyone': { name: 'Everyone can post', color: '#4CAF50', bgColor: '#E8F5E9' },
    'admin_only': { name: 'Admin-only posting', color: '#FF9800', bgColor: '#FFF3E0' },
    'scheduled': { name: 'Scheduled posting times', color: '#2196F3', bgColor: '#E3F2FD' },
    'quiet_hours': { name: 'Quiet hours enabled', color: '#9C27B0', bgColor: '#F3E5F5' }
};

let participationModes = {
    'read_only': { name: 'Read Only', icon: '👁️', color: '#666', bgColor: '#F5F5F5' },
    'react_only': { name: 'React Only', icon: '👍', color: '#1976D2', bgColor: '#E3F2FD' },
    'anonymous': { name: 'Anonymous', icon: '🕵️', color: '#7B1FA2', bgColor: '#F3E5F5' }
};

let groupTopics = {
    'announcement': { name: 'Announcement', icon: '📢', color: '#1976d2', bgColor: '#e3f2fd' },
    'question': { name: 'Question', icon: '❓', color: '#7b1fa2', bgColor: '#f3e5f5' },
    'discussion': { name: 'Discussion', icon: '💬', color: '#2e7d32', bgColor: '#e8f5e9' }
};

// Group types with colors and icons
const groupTypes = {
    'public': {
        name: 'Public',
        color: 'var(--success-color)',
        icon: 'fas fa-globe',
        description: 'Anyone can join'
    },
    'private': {
        name: 'Private',
        color: 'var(--warning-color)',
        icon: 'fas fa-lock',
        description: 'Invite only'
    },
    'secret': {
        name: 'Secret',
        color: 'var(--danger-color)',
        icon: 'fas fa-eye-slash',
        description: 'Hidden and invite only'
    },
    'family': {
        name: 'Family',
        color: '#9c27b0',
        icon: 'fas fa-home',
        description: 'Family members only'
    },
    'work': {
        name: 'Work',
        color: '#2196f3',
        icon: 'fas fa-briefcase',
        description: 'Work colleagues'
    }
};

// Group themes
const groupThemes = {
    'blue': {
        name: 'Blue',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#667eea'
    },
    'green': {
        name: 'Green',
        gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        color: '#11998e'
    },
    'red': {
        name: 'Red',
        gradient: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
        color: '#ff416c'
    },
    'purple': {
        name: 'Purple',
        gradient: 'linear-gradient(135deg, #8a2387 0%, #f27121 100%)',
        color: '#8a2387'
    },
    'dark': {
        name: 'Dark',
        gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
        color: '#0f2027'
    }
};

// Group roles with permissions
const groupRoles = {
    'admin': {
        name: 'Admin',
        color: 'var(--role-admin)',
        icon: 'fas fa-crown',
        permissions: ['manage_group', 'add_members', 'remove_members', 'post_messages', 'delete_messages', 'assign_roles', 'manage_events', 'manage_polls', 'manage_calls', 'moderate_chat']
    },
    'moderator': {
        name: 'Moderator',
        color: 'var(--role-moderator)',
        icon: 'fas fa-shield-alt',
        permissions: ['add_members', 'remove_members', 'post_messages', 'delete_messages', 'manage_events', 'moderate_chat']
    },
    'organizer': {
        name: 'Organizer',
        color: 'var(--role-organizer)',
        icon: 'fas fa-calendar-alt',
        permissions: ['manage_events', 'post_messages']
    },
    'helper': {
        name: 'Helper',
        color: 'var(--role-helper)',
        icon: 'fas fa-hands-helping',
        permissions: ['add_members', 'post_messages']
    },
    'member': {
        name: 'Member',
        color: 'var(--role-member)',
        icon: 'fas fa-user',
        permissions: ['post_messages']
    }
};

// Chat & Call variables
let currentChatGroup = null;
let chatMessagesList = [];
let isTyping = false;
let callInProgress = false;
let callStartTime = null;
let callTimer = null;
let localStream = null;
let peerConnections = {};

// Unique features state variables
let currentParticipationMode = 'normal';
let isSilentMode = false;
let isAnonymousMode = false;
let groupNotes = {};
let groupEvents = {};
let transparencyLog = [];
let energySuggestions = [];

// Local Storage Keys
const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    GROUPS: 'knecta_groups',
    MY_GROUPS: 'knecta_my_groups',
    JOINED_GROUPS: 'knecta_joined_groups',
    GROUP_INVITES: 'knecta_group_invites',
    ADMIN_GROUPS: 'knecta_admin_groups',
    LAST_SYNC: 'knecta_groups_last_sync',
    PENDING_ACTIONS: 'knecta_pending_group_actions',
    USER_PROFILE: 'knecta_user_profile',
    OFFLINE_OVERLAY_DISMISSED: 'knecta_offline_overlay_dismissed_groups',
    LAST_CACHE_TIME: 'knecta_groups_last_cache_time',
    FRIENDS: 'knecta_friends',
    GROUP_CHATS: 'knecta_group_chats',
    GROUP_MESSAGES: 'knecta_group_messages_',
    GROUP_TYPING: 'knecta_group_typing_',
    GROUP_CALLS: 'knecta_group_calls',
    GROUP_PURPOSES: 'knecta_group_purposes',
    GROUP_MOODS: 'knecta_group_moods',
    GROUP_POSTING_RULES: 'knecta_group_posting_rules',
    GROUP_NOTES: 'knecta_group_notes_',
    GROUP_EVENTS: 'knecta_group_events_',
    GROUP_TRANSPARENCY: 'knecta_group_transparency_',
    USER_PARTICIPATION_MODES: 'knecta_user_participation_modes',
    // Token storage keys
    ACCESS_TOKEN: 'knecta_access_token',
    REFRESH_TOKEN: 'knecta_refresh_token'
};

// Flag to track if page is already initialized
let isPageInitialized = false;

// Token management variables
let accessToken = null;
let refreshToken = null;
let isTokenValid = false;

// Authentication wait state
let authReady = false;
let authCheckInterval = null;

// =============================================
// AUTHENTICATION WAIT SYSTEM - IFRAME FIX
// =============================================

function waitForAuth() {
    return new Promise((resolve, reject) => {
        console.log('⏳ Groups iframe: Waiting for authentication...');
        
        // Check if auth is already ready via api.js
        if (window.api && window.api.isAuthReady && window.api.isAuthReady()) {
            console.log('✅ Groups iframe: Auth already ready via api.js');
            authReady = true;
            resolve(true);
            return;
        }
        
        // Method 1: Check for existing token
        const token = localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN) || localStorage.getItem('moodchat_token');
        if (token) {
            console.log('✅ Groups iframe: Token found in localStorage');
            authReady = true;
            resolve(true);
            return;
        }
        
        // Method 2: Wait for api.js auth signal
        let attempts = 0;
        const maxAttempts = 30; // 30 * 200ms = 6 seconds max wait
        
        const checkAuth = () => {
            attempts++;
            
            // Check if window.api is available
            if (window.api && window.api.isAuthReady && window.api.isAuthReady()) {
                console.log(`✅ Groups iframe: Auth ready via api.js after ${attempts} attempts`);
                clearInterval(authCheckInterval);
                authReady = true;
                resolve(true);
                return;
            }
            
            // Check for token directly
            const currentToken = localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN) || localStorage.getItem('moodchat_token');
            if (currentToken) {
                console.log(`✅ Groups iframe: Token found after ${attempts} attempts`);
                clearInterval(authCheckInterval);
                authReady = true;
                resolve(true);
                return;
            }
            
            // Check if user data exists
            const userData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
            if (userData) {
                console.log(`✅ Groups iframe: User data found after ${attempts} attempts`);
                clearInterval(authCheckInterval);
                authReady = true;
                resolve(true);
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.log('❌ Groups iframe: Auth timeout after maximum attempts');
                clearInterval(authCheckInterval);
                authReady = false;
                reject(new Error('Authentication timeout'));
            }
        };
        
        // Start checking
        authCheckInterval = setInterval(checkAuth, 200);
        
        // Initial check
        setTimeout(checkAuth, 100);
    });
}

// =============================================
// BOOTSTRAP FUNCTION - SINGLE SOURCE OF TRUTH
// =============================================

async function bootstrapIframe() {
    console.log('=== BOOTSTRAP IFRAME START ===');
    
    try {
        // 1. Wait for authentication to be ready
        await waitForAuth();
        
        if (!authReady) {
            console.log('❌ Groups iframe: Authentication not ready');
            setTimeout(() => {
                if (window.location.pathname.includes('groups.html') || window.location.pathname.includes('group.html')) {
                    console.log('Redirecting to login from groups iframe...');
                    redirectToLogin();
                }
            }, 1000);
            return false;
        }
        
        // 2. Load tokens from localStorage using fallback
        const hasToken = loadTokensFromStorage();
        if (!hasToken) {
            console.log('No authentication token found');
            redirectToLogin();
            return false;
        }
        
        // 3. Validate token with /api/auth/me using api.js
        console.log('Validating token with /api/auth/me...');
        const meResponse = await callApi('GET', '/api/auth/me');
        
        if (!meResponse || !meResponse.success) {
            console.log('Token validation failed:', meResponse?.error);
            
            // Try to use cached user data as fallback
            const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                console.log('Using cached user data as fallback');
                try {
                    currentUser = JSON.parse(cachedUser);
                    userData = {
                        displayName: currentUser.displayName || currentUser.name || 'User',
                        username: currentUser.username || null,
                        email: currentUser.email || null,
                        photoURL: currentUser.photoURL || currentUser.avatar || null
                    };
                    console.log('Fallback user loaded:', currentUser.uid || currentUser.id);
                    return true;
                } catch (e) {
                    console.error('Failed to parse cached user:', e);
                }
            }
            
            redirectToLogin();
            return false;
        }
        
        // 4. Set current user from API response
        currentUser = meResponse.data;
        userData = {
            displayName: currentUser.displayName || currentUser.name || 'User',
            username: currentUser.username || null,
            email: currentUser.email || null,
            photoURL: currentUser.photoURL || currentUser.avatar || null
        };
        
        console.log('User authenticated:', currentUser.id || currentUser._id || currentUser.uid);
        
        // 5. Save user to localStorage
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
            uid: currentUser.id || currentUser._id || currentUser.uid,
            displayName: currentUser.displayName || currentUser.name,
            email: currentUser.email,
            photoURL: currentUser.photoURL || currentUser.avatar
        }));
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
        
        console.log('=== BOOTSTRAP IFRAME COMPLETE ===');
        return true;
        
    } catch (error) {
        console.error('Bootstrap error:', error);
        
        // Try to use cached data as last resort
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                userData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILE) || '{}');
                console.log('Using cached user due to bootstrap error');
                return true;
            } catch (e) {
                console.error('Failed to use cached user:', e);
            }
        }
        
        // Only redirect if we're on a group page
        if (window.location.pathname.includes('groups.html') || window.location.pathname.includes('group.html')) {
            setTimeout(() => {
                redirectToLogin();
            }, 1500);
        }
        return false;
    }
}

// =============================================
// TOKEN MANAGEMENT FUNCTIONS
// =============================================

// Load tokens from localStorage
function loadTokensFromStorage() {
    try {
        // Try main token first
        accessToken = localStorage.getItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
        
        // Fallback to moodchat_token if main token not found
        if (!accessToken) {
            accessToken = localStorage.getItem('moodchat_token');
            if (accessToken) {
                console.log('Using moodchat_token fallback');
                localStorage.setItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
            }
        }
        
        // Load refresh token
        refreshToken = localStorage.getItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
        
        if (accessToken) {
            console.log('Access token loaded from localStorage');
            isTokenValid = true;
            return true;
        } else {
            console.log('No access token found in localStorage');
            isTokenValid = false;
            return false;
        }
    } catch (error) {
        console.error('Error loading tokens from storage:', error);
        isTokenValid = false;
        return false;
    }
}

// Check if token is expired
function isTokenExpired(token) {
    if (!token) return true;
    
    try {
        // Simple JWT token expiration check
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        
        const payload = JSON.parse(atob(parts[1]));
        const expirationTime = payload.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        
        return currentTime >= expirationTime;
    } catch (error) {
        console.error('Error checking token expiration:', error);
        return true;
    }
}

// Refresh token function
async function refreshAccessToken() {
    if (!refreshToken) {
        console.log('No refresh token available');
        redirectToLogin();
        return null;
    }
    
    try {
        console.log('Attempting to refresh access token...');
        
        const response = await callApi('POST', '/api/auth/refresh', {
            refreshToken: refreshToken
        });
        
        if (response && response.success && response.data) {
            const data = response.data;
            
            if (data.accessToken) {
                accessToken = data.accessToken;
                localStorage.setItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
                
                if (data.refreshToken) {
                    refreshToken = data.refreshToken;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
                }
                
                console.log('Access token refreshed successfully');
                isTokenValid = true;
                return accessToken;
            }
        }
        
        console.log('Failed to refresh access token');
        redirectToLogin();
        return null;
        
    } catch (error) {
        console.error('Error refreshing access token:', error);
        redirectToLogin();
        return null;
    }
}

// Redirect to login page
function redirectToLogin() {
    console.log('Redirecting to login page...');
    // Clear all tokens
    localStorage.removeItem(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem('moodchat_token');
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_PROFILE);
    
    // Redirect to the main app login page
    window.location.href = '/index.html?redirect=' + encodeURIComponent(window.location.pathname);
}

// Get current token with auto-refresh
async function getCurrentToken() {
    if (!accessToken) {
        const hasToken = loadTokensFromStorage();
        if (!hasToken) {
            redirectToLogin();
            return null;
        }
    }
    
    if (isTokenExpired(accessToken)) {
        console.log('Access token expired, attempting to refresh...');
        const newToken = await refreshAccessToken();
        return newToken;
    }
    
    return accessToken;
}

// =============================================
// API CALL FUNCTION - SINGLE ENTRY POINT
// =============================================

async function callApi(method, endpoint, data = null, options = {}) {
    // Get current token
    const token = await getCurrentToken();
    if (!token) {
        console.error('No valid token available for API call');
        return { success: false, error: 'Authentication required', requiresAuth: true };
    }
    
    // Use api.js if available
    if (window.api && typeof window.api.callApi === 'function') {
        try {
            return await window.api.callApi(method, endpoint, data, {
                ...options,
                token: token
            });
        } catch (error) {
            console.error('API call via api.js failed:', error);
            return { success: false, error: error.message || 'API call failed' };
        }
    }
    
    // Fallback to direct fetch if api.js not available
    try {
        const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        const fetchOptions = {
            method: method,
            headers: headers,
            credentials: 'include'
        };
        
        if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            fetchOptions.body = JSON.stringify(data);
        }
        
        console.log(`API call: ${method} ${url}`);
        
        const response = await fetch(url, fetchOptions);
        
        // Handle 401 Unauthorized
        if (response.status === 401) {
            console.log('Token expired or invalid, attempting refresh...');
            const newToken = await refreshAccessToken();
            if (newToken) {
                // Retry with new token
                headers.Authorization = `Bearer ${newToken}`;
                const retryResponse = await fetch(url, fetchOptions);
                return await handleApiResponse(retryResponse);
            } else {
                redirectToLogin();
                return { success: false, error: 'Authentication failed', requiresAuth: true };
            }
        }
        
        return await handleApiResponse(response);
        
    } catch (error) {
        console.error(`API ${method} error:`, error);
        return { 
            success: false, 
            error: error.message || 'Network error',
            isOffline: error.message?.includes('Network') || error.message?.includes('Failed to fetch')
        };
    }
}

// Handle API response
async function handleApiResponse(response) {
    try {
        const text = await response.text();
        let data;
        
        try {
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            data = { message: text };
        }
        
        if (response.ok) {
            return { 
                success: true, 
                data: data,
                status: response.status 
            };
        } else {
            return { 
                success: false, 
                error: data.message || data.error || `HTTP ${response.status}`,
                status: response.status,
                data: data 
            };
        }
    } catch (error) {
        return { 
            success: false, 
            error: 'Failed to parse response',
            isOffline: false 
        };
    }
}

// Safe API call wrapper for background sync
async function safeApiCall(method, endpoint, data = null) {
    try {
        return await callApi(method.toUpperCase(), `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, data);
    } catch (error) {
        console.error('Safe API call error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================
// MAIN INITIALIZATION - UPDATED FOR IFRAME
// =============================================

async function initGroupPage() {
    if (isPageInitialized) {
        console.log('Group page already initialized');
        return;
    }
    
    isPageInitialized = true;
    console.log('=== GROUP PAGE INITIALIZATION START ===');
    
    // 1. Load cached data INSTANTLY for immediate UI display
    console.log('Loading cached data instantly...');
    loadCachedDataInstantly();
    
    // 2. Set up event listeners immediately
    console.log('Setting up event listeners...');
    if (typeof setupEventListeners === 'function') {
        setupEventListeners();
    }
    if (typeof setupGroupInvitesListener === 'function') {
        setupGroupInvitesListener();
    }
    
    // 3. Check mobile
    if (typeof checkMobile === 'function') {
        checkMobile();
        window.addEventListener('resize', checkMobile);
    }
    
    // 4. Start authentication in background (non-blocking)
    console.log('Starting background authentication...');
    setTimeout(async () => {
        try {
            const isAuthenticated = await bootstrapIframe();
            if (!isAuthenticated) {
                console.log('Background authentication failed, using cached data only');
                return;
            }
            
            console.log('Background authentication successful, starting full app initialization...');
            
            // 5. Initialize app with real data
            if (typeof initializeApp === 'function') {
                await initializeApp();
            }
            
            // 6. Start background sync after a delay
            setTimeout(() => {
                if (typeof backgroundSyncWithServer === 'function') {
                    backgroundSyncWithServer();
                }
            }, 2000);
            
            // 7. Set up periodic sync
            setInterval(() => {
                if (typeof backgroundSyncWithServer === 'function') {
                    backgroundSyncWithServer();
                }
            }, 30000); // Sync every 30 seconds
            
            if (typeof processPendingOfflineActions === 'function') {
                processPendingOfflineActions();
            }
            
            console.log('=== GROUP PAGE INITIALIZATION COMPLETE ===');
            
        } catch (error) {
            console.error('Error in background initialization:', error);
            // Continue with cached data
            showNotification('Using cached data. Some features may be limited.', 'info');
        }
    }, 500); // Delay to ensure UI is rendered first
    
    console.log('=== GROUP PAGE UI READY (CACHED DATA) ===');
}

// Load cached data INSTANTLY on page load
function loadCachedDataInstantly() {
    console.log('=== INSTANT CACHE LOAD START (GROUPS) ===');
    
    try {
        // Load groups
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUPS);
        if (groupsData) {
            try {
                groups = JSON.parse(groupsData);
                console.log(`✓ Instant: ${groups.length} groups loaded from cache`);
                isLoadedFromLocalStorage = true;
                
                if (typeof updateGroupCounts === 'function') {
                    updateGroupCounts();
                }
                if (typeof renderGroupsListInstantly === 'function') {
                    renderGroupsListInstantly();
                }
            } catch (e) {
                console.error('Error parsing groups cache:', e);
                groups = [];
            }
        } else {
            console.log('No groups found in cache');
            groups = [];
        }
        
        // Load other group data
        const myGroupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_GROUPS);
        if (myGroupsData) {
            try {
                myGroups = JSON.parse(myGroupsData);
            } catch (e) {
                console.error('Error parsing myGroups cache:', e);
                myGroups = [];
            }
        }
        
        const joinedData = localStorage.getItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS);
        if (joinedData) {
            try {
                joinedGroups = JSON.parse(joinedData);
            } catch (e) {
                console.error('Error parsing joinedGroups cache:', e);
                joinedGroups = [];
            }
        }
        
        const invitesData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_INVITES);
        if (invitesData) {
            try {
                groupInvites = JSON.parse(invitesData);
            } catch (e) {
                console.error('Error parsing groupInvites cache:', e);
                groupInvites = [];
            }
        }
        
        const adminData = localStorage.getItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS);
        if (adminData) {
            try {
                adminGroups = JSON.parse(adminData);
            } catch (e) {
                console.error('Error parsing adminGroups cache:', e);
                adminGroups = [];
            }
        }
        
        // Load friends
        const cachedFriends = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) {
            try {
                friends = JSON.parse(cachedFriends);
                console.log(`✓ Instant: ${friends.length} friends loaded from cache`);
            } catch (e) {
                console.error('Error parsing friends cache:', e);
                friends = [];
            }
        }
        
        // Load user data from cache for immediate display
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                currentUser = JSON.parse(cachedUser);
                userData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILE) || '{}');
                console.log('✓ Instant: User data loaded from cache');
            } catch (e) {
                console.error('Error parsing user cache:', e);
            }
        }
        
        // Load unique features data
        if (typeof loadUniqueFeaturesData === 'function') {
            loadUniqueFeaturesData();
        }
        
        console.log('=== INSTANT CACHE LOAD COMPLETE (GROUPS) ===');
        
    } catch (error) {
        console.error('Error in instant cache load:', error);
    }
}

// Load unique features data from cache
function loadUniqueFeaturesData() {
    try {
        const cachedPurposes = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_PURPOSES);
        if (cachedPurposes) {
            try {
                const purposes = JSON.parse(cachedPurposes);
                groups.forEach(group => {
                    if (purposes[group.id]) {
                        group.purpose = purposes[group.id];
                    }
                });
            } catch (e) {
                console.error('Error parsing purposes cache:', e);
            }
        }
        
        const cachedMoods = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_MOODS);
        if (cachedMoods) {
            try {
                const moods = JSON.parse(cachedMoods);
                groups.forEach(group => {
                    if (moods[group.id]) {
                        group.mood = moods[group.id];
                    }
                });
            } catch (e) {
                console.error('Error parsing moods cache:', e);
            }
        }
        
        const cachedRules = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_POSTING_RULES);
        if (cachedRules) {
            try {
                const rules = JSON.parse(cachedRules);
                groups.forEach(group => {
                    if (rules[group.id]) {
                        group.postingRule = rules[group.id];
                    }
                });
            } catch (e) {
                console.error('Error parsing rules cache:', e);
            }
        }
        
        const cachedModes = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PARTICIPATION_MODES);
        if (cachedModes) {
            try {
                currentParticipationMode = JSON.parse(cachedModes);
            } catch (e) {
                console.error('Error parsing modes cache:', e);
            }
        }
        
        console.log('✓ Instant: Unique features data loaded from cache');
        
    } catch (error) {
        console.error('Error loading unique features data:', error);
    }
}

// Render groups list instantly from cache
function renderGroupsListInstantly() {
    const allGroupsList = document.getElementById('allGroupsList');
    if (!allGroupsList) return;
    
    allGroupsList.innerHTML = '';
    
    if (groups.length === 0) {
        allGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No groups yet</p>
                <p class="subtext">Create or join groups to start connecting</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    const groupsToRender = groups.slice(0, 15);
    
    groupsToRender.forEach(group => {
        addGroupItemInstant(group, fragment, 'group');
    });
    
    allGroupsList.appendChild(fragment);
    
    if (groups.length > 15) {
        setTimeout(() => {
            const remainingGroups = groups.slice(15);
            remainingGroups.forEach(group => {
                addGroupItemInstant(group, allGroupsList, 'group');
            });
        }, 100);
    }
    
    allGroupsList.classList.add('instant-load');
}

// Add group item instantly
function addGroupItemInstant(groupData, container, type) {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.dataset.groupId = groupData.id;
    groupItem.dataset.type = type;
    
    const initials = groupData.name 
        ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
        : 'G';
    
    const groupType = groupData.type || 'private';
    const typeInfo = groupTypes[groupType];
    const theme = groupData.theme || 'blue';
    const themeInfo = groupThemes[theme];
    
    const purpose = groupData.purpose || '';
    const mood = groupData.mood || '';
    const postingRule = groupData.postingRule || 'everyone';
    const purposeInfo = purpose ? groupPurposes[purpose] : null;
    const moodInfo = mood ? groupMoods[mood] : null;
    const ruleInfo = postingRules[postingRule];
    
    const pulse = calculateGroupPulse(groupData);
    
    groupItem.innerHTML = `
        <div class="group-avatar" ${groupData.photoURL ? `style="background-image: url('${groupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
            ${groupData.photoURL ? '' : `<span>${initials}</span>`}
            <div class="group-theme-badge ${theme}"></div>
            <div class="group-type-badge ${groupType}" title="${typeInfo ? typeInfo.name : 'Private'}">
                <i class="${typeInfo ? typeInfo.icon : 'fas fa-lock'}"></i>
            </div>
            ${purposeInfo ? `<div class="group-purpose-badge" style="position: absolute; bottom: -5px; right: -5px; background: ${purposeInfo.color}; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">${purposeInfo.icon}</div>` : ''}
        </div>
        <div class="group-info">
            <div class="group-name">
                <span class="group-name-text">${groupData.name || 'Unnamed Group'}</span>
                ${pulse ? `<span class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</span>` : ''}
                <span class="group-details">
                    ${groupData.isAdmin ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                </span>
            </div>
            <div class="group-details">
                ${purposeInfo ? `<span class="group-purpose-tag">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
                ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                ${groupData.topic ? `<span class="group-topic">${groupData.topic}</span>` : ''}
                <span class="member-count"><i class="fas fa-users"></i> ${groupData.memberCount || 0}</span>
                <span>${typeInfo ? typeInfo.name : 'Private'}</span>
            </div>
            ${ruleInfo ? `<div style="font-size: 11px; color: ${ruleInfo.color}; margin-top: 3px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
        </div>
        <div class="group-actions">
            <button class="group-action-btn chat" data-action="open-chat" title="Open Chat">
                <i class="fas fa-comments"></i>
            </button>
            <button class="group-action-btn" data-action="info" title="Group Info">
                <i class="fas fa-info-circle"></i>
            </button>
        </div>
    `;
    
    groupItem.addEventListener('click', (e) => {
        if (!e.target.closest('.group-actions')) {
            if (typeof showGroupDetails === 'function') {
                showGroupDetails(groupData, type);
            }
        }
    });
    
    const actionButtons = groupItem.querySelectorAll('.group-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (typeof handleGroupAction === 'function') {
                handleGroupAction(action, groupData, type, btn);
            }
        });
    });
    
    container.appendChild(groupItem);
}

async function initializeApp() {
    console.log('=== FULL GROUP APP INITIALIZATION START ===');
    
    showNotification('Groups system ready with unique features', 'success');
    
    // Load friends from API
    if (typeof loadFriends === 'function') {
        await loadFriends();
    }
    
    // Load groups from API
    if (typeof syncGroupsFromServer === 'function') {
        await syncGroupsFromServer();
    }
    
    // Load group invites from API
    if (typeof syncGroupInvitesFromServer === 'function') {
        await syncGroupInvitesFromServer();
    }
    
    console.log('=== FULL GROUP APP INITIALIZATION COMPLETE ===');
}

// Load friends from API
async function loadFriends() {
    if (!currentUser) {
        console.log('loadFriends: No current user, skipping');
        return;
    }
    
    try {
        const response = await safeApiCall('get', 'friends/list');
        if (response && response.success && response.data) {
            friends = response.data;
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            console.log(`Loaded ${friends.length} friends from API`);
        } else {
            console.log('Failed to load friends from API:', response?.error);
        }
    } catch (error) {
        console.error('Error loading friends:', error);
        // Load from cache as fallback
        const cachedFriends = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) {
            try {
                friends = JSON.parse(cachedFriends);
                console.log(`Loaded ${friends.length} friends from cache`);
            } catch (e) {
                console.error('Error parsing cached friends:', e);
            }
        }
    }
}

// Background sync with server
async function backgroundSyncWithServer() {
    if (!currentUser) {
        console.log('Background sync: Skipping - no user');
        return;
    }
    
    console.log('Background sync: Starting server fetch...');
    
    try {
        const syncPromises = [];
        
        if (typeof syncGroupsFromServer === 'function') {
            syncPromises.push(syncGroupsFromServer());
        }
        
        if (typeof syncGroupInvitesFromServer === 'function') {
            syncPromises.push(syncGroupInvitesFromServer());
        }
        
        if (typeof syncUniqueFeaturesData === 'function') {
            syncPromises.push(syncUniqueFeaturesData());
        }
        
        await Promise.allSettled(syncPromises);
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        console.log('Background sync: Completed successfully');
        
    } catch (error) {
        console.log('Background sync: Server appears to be unreachable:', error.message);
    }
}

// Sync unique features data
async function syncUniqueFeaturesData() {
    if (!currentUser) return;
    
    try {
        const purposesResponse = await safeApiCall('get', 'groups/purposes');
        if (purposesResponse && purposesResponse.success && purposesResponse.data) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_PURPOSES, JSON.stringify(purposesResponse.data));
            
            purposesResponse.data.forEach(purpose => {
                const group = groups.find(g => g.id === purpose.groupId);
                if (group) {
                    group.purpose = purpose.purpose;
                }
            });
        }
        
        const moodsResponse = await safeApiCall('get', 'groups/moods');
        if (moodsResponse && moodsResponse.success && moodsResponse.data) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_MOODS, JSON.stringify(moodsResponse.data));
            
            moodsResponse.data.forEach(mood => {
                const group = groups.find(g => g.id === mood.groupId);
                if (group) {
                    group.mood = mood.mood;
                }
            });
        }
        
        const notesResponse = await safeApiCall('get', 'groups/notes');
        if (notesResponse && notesResponse.success && notesResponse.data) {
            notesResponse.data.forEach(note => {
                const key = LOCAL_STORAGE_KEYS.GROUP_NOTES + note.groupId;
                localStorage.setItem(key, JSON.stringify(note.notes));
            });
        }
        
    } catch (error) {
        console.log('Unique features sync error:', error.message);
    }
}

// Sync groups from server
async function syncGroupsFromServer() {
    if (!currentUser) return;
    
    try {
        const response = await safeApiCall('get', 'groups/user');
        
        if (!response || !response.success || !response.data) {
            console.log('No groups found on server or API not available');
            return;
        }
        
        const serverGroups = response.data;
        const serverMyGroups = [];
        const serverJoinedGroups = [];
        const serverAdminGroups = [];
        
        serverGroups.forEach(groupData => {
            const groupWithMeta = {
                ...groupData,
                id: groupData.id || groupData._id,
                type: groupData.privacy || 'private',
                theme: groupData.theme || 'blue',
                memberCount: groupData.members ? groupData.members.length : 0,
                isAdmin: groupData.admins && groupData.admins.includes(currentUser.uid || currentUser.id),
                isCreator: groupData.createdBy === (currentUser.uid || currentUser.id),
                lastActivity: groupData.lastActivity || groupData.createdAt,
                purpose: groupData.purpose || '',
                mood: groupData.mood || '',
                postingRule: groupData.postingRule || 'everyone',
                quietHours: groupData.quietHours || {},
                scheduledPosting: groupData.scheduledPosting || {},
                participationModes: groupData.participationModes || {}
            };
            
            if (groupData.createdBy === (currentUser.uid || currentUser.id)) {
                serverMyGroups.push(groupWithMeta);
            } else if (groupData.admins && groupData.admins.includes(currentUser.uid || currentUser.id)) {
                serverAdminGroups.push(groupWithMeta);
            } else {
                serverJoinedGroups.push(groupWithMeta);
            }
        });
        
        if (JSON.stringify(serverGroups) !== JSON.stringify(groups)) {
            console.log('Group data updated from server');
            groups = serverGroups;
            myGroups = serverMyGroups;
            joinedGroups = serverJoinedGroups;
            adminGroups = serverAdminGroups;
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_GROUPS, JSON.stringify(myGroups));
            localStorage.setItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS, JSON.stringify(joinedGroups));
            localStorage.setItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS, JSON.stringify(adminGroups));
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_CACHE_TIME, Date.now().toString());
            
            const allGroupsSection = document.getElementById('allGroupsSection');
            if (allGroupsSection && allGroupsSection.classList.contains('active')) {
                if (typeof updateCurrentSection === 'function') {
                    updateCurrentSection();
                }
                if (typeof updateGroupCounts === 'function') {
                    updateGroupCounts();
                }
            }
            
            showNotification('Groups list updated', 'success');
        }
        
    } catch (error) {
        console.log('Group sync error:', error.message);
    }
}

// Sync group invites
async function syncGroupInvitesFromServer() {
    if (!currentUser) return;
    
    try {
        const response = await safeApiCall('get', 'groups/invites');
        
        const serverInvites = [];
        
        if (response && response.success && response.data) {
            serverInvites.push(...response.data.map(invite => ({
                ...invite,
                id: invite.id || invite._id,
                type: 'group_invite',
                purpose: invite.purpose || '',
                mood: invite.mood || '',
                postingRule: invite.postingRule || 'everyone'
            })));
        }
        
        if (JSON.stringify(serverInvites) !== JSON.stringify(groupInvites)) {
            console.log('Group invites updated from server');
            groupInvites = serverInvites;
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_INVITES, JSON.stringify(groupInvites));
            
            const invitesCountEl = document.getElementById('invitesCount');
            const invitesSectionCountEl = document.getElementById('invitesSectionCount');
            if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
            if (invitesSectionCountEl) invitesSectionCountEl.textContent = groupInvites.length;
        }
        
    } catch (error) {
        console.log('Group invites sync error:', error.message);
    }
}

// =============================================
// REMAINING FUNCTIONS (PRESERVED)
// =============================================

// Calculate group pulse
function calculateGroupPulse(groupData) {
    if (!groupData.lastActivity) return null;
    
    const lastActivity = new Date(groupData.lastActivity).getTime();
    const now = Date.now();
    const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
    
    if (hoursSinceActivity < 1) {
        return { text: 'Very Active', class: 'pulse-active' };
    } else if (hoursSinceActivity < 6) {
        return { text: 'Active', class: 'pulse-active' };
    } else if (hoursSinceActivity < 24) {
        return { text: 'Quiet', class: 'pulse-quiet' };
    } else if (hoursSinceActivity < 72) {
        return { text: 'Inactive', class: 'pulse-quiet' };
    } else {
        return { text: 'Dormant', class: 'pulse-quiet' };
    }
}

// Update group counts
function updateGroupCounts() {
    const totalGroupsEl = document.getElementById('totalGroups');
    const activeGroupsEl = document.getElementById('activeGroups');
    const totalMembersEl = document.getElementById('totalMembers');
    const myGroupsCountEl = document.getElementById('myGroupsCount');
    const joinedCountEl = document.getElementById('joinedCount');
    const invitesCountEl = document.getElementById('invitesCount');
    const adminCountEl = document.getElementById('adminCount');
    
    if (totalGroupsEl) totalGroupsEl.textContent = groups.length;
    
    const activeGroups = groups.filter(g => g.lastActivity && (Date.now() - new Date(g.lastActivity).getTime()) < 86400000).length;
    if (activeGroupsEl) activeGroupsEl.textContent = activeGroups;
    
    const totalMembers = groups.reduce((sum, group) => sum + (group.memberCount || 0), 0);
    if (totalMembersEl) totalMembersEl.textContent = totalMembers;
    
    if (myGroupsCountEl) myGroupsCountEl.textContent = myGroups.length;
    if (joinedCountEl) joinedCountEl.textContent = joinedGroups.length;
    if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
    if (adminCountEl) adminCountEl.textContent = adminGroups.length;
}

// Update current section
function updateCurrentSection() {
    const activeSection = document.querySelector('.groups-section.active');
    if (activeSection) {
        const sectionId = activeSection.id;
        
        switch(sectionId) {
            case 'allGroupsSection':
                if (typeof renderAllGroups === 'function') renderAllGroups();
                break;
            case 'myGroupsSection':
                if (typeof renderMyGroups === 'function') renderMyGroups();
                break;
            case 'joinedSection':
                if (typeof renderJoinedGroups === 'function') renderJoinedGroups();
                break;
            case 'invitesSection':
                if (typeof renderGroupInvites === 'function') renderGroupInvites();
                break;
            case 'adminSection':
                if (typeof renderAdminGroups === 'function') renderAdminGroups();
                break;
        }
    }
}

// Render all groups
function renderAllGroups() {
    const allGroupsList = document.getElementById('allGroupsList');
    if (!allGroupsList) return;
    
    allGroupsList.innerHTML = '';
    
    if (groups.length === 0) {
        allGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No groups yet</p>
                <p class="subtext">Create or join groups to start connecting</p>
            </div>
        `;
        return;
    }
    
    groups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, allGroupsList, 'group');
        }
    });
    
    if (allGroupsList.children.length === 0) {
        allGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No groups match your filters</p>
                <p class="subtext">Try changing your search or filter criteria</p>
            </div>
        `;
    }
}

// Add group item
function addGroupItem(groupData, container, type) {
    const existingItem = container.querySelector(`[data-group-id="${groupData.id}"]`);
    if (existingItem) {
        existingItem.remove();
    }
    
    if (!matchesFilters(groupData)) {
        return;
    }
    
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.dataset.groupId = groupData.id;
    groupItem.dataset.type = type;
    
    const initials = groupData.name 
        ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
        : 'G';
    
    const groupType = groupData.type || 'private';
    const typeInfo = groupTypes[groupType];
    const theme = groupData.theme || 'blue';
    const themeInfo = groupThemes[theme];
    
    const purpose = groupData.purpose || '';
    const mood = groupData.mood || '';
    const postingRule = groupData.postingRule || 'everyone';
    const purposeInfo = purpose ? groupPurposes[purpose] : null;
    const moodInfo = mood ? groupMoods[mood] : null;
    const ruleInfo = postingRules[postingRule];
    const pulse = calculateGroupPulse(groupData);
    
    groupItem.innerHTML = `
        <div class="group-avatar" ${groupData.photoURL ? `style="background-image: url('${groupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
            ${groupData.photoURL ? '' : `<span>${initials}</span>`}
            <div class="group-theme-badge ${theme}"></div>
            <div class="group-type-badge ${groupType}" title="${typeInfo ? typeInfo.name : 'Private'}">
                <i class="${typeInfo ? typeInfo.icon : 'fas fa-lock'}"></i>
            </div>
            ${purposeInfo ? `<div class="group-purpose-badge" style="position: absolute; bottom: -5px; right: -5px; background: ${purposeInfo.color}; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">${purposeInfo.icon}</div>` : ''}
        </div>
        <div class="group-info">
            <div class="group-name">
                <span class="group-name-text">${groupData.name || 'Unnamed Group'}</span>
                ${pulse ? `<span class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</span>` : ''}
                <span class="group-details">
                    ${groupData.isAdmin ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                    ${groupData.isCreator ? '<span class="role-badge admin"><i class="fas fa-star"></i> Creator</span>' : ''}
                </span>
            </div>
            <div class="group-details">
                ${purposeInfo ? `<span class="group-purpose-tag">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
                ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                ${groupData.topic ? `<span class="group-topic">${groupData.topic}</span>` : ''}
                <span class="member-count"><i class="fas fa-users"></i> ${groupData.memberCount || 0}</span>
                <span>${typeInfo ? typeInfo.name : 'Private'}</span>
                ${groupData.theme ? `<span class="theme-badge ${groupData.theme}"><i class="fas fa-palette"></i> ${groupThemes[groupData.theme].name}</span>` : ''}
            </div>
            ${ruleInfo ? `<div style="font-size: 11px; color: ${ruleInfo.color}; margin-top: 3px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
            ${groupData.description ? `<div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">${groupData.description.substring(0, 100)}${groupData.description.length > 100 ? '...' : ''}</div>` : ''}
        </div>
        <div class="group-actions">
            ${type === 'group_invite' ? `
                <button class="group-action-btn success" data-action="accept-invite" title="Accept Invite">
                    <i class="fas fa-check"></i>
                </button>
                <button class="group-action-btn danger" data-action="decline-invite" title="Decline Invite">
                    <i class="fas fa-times"></i>
                </button>
            ` : `
                <button class="group-action-btn chat" data-action="open-chat" title="Open Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="group-action-btn" data-action="info" title="Group Info">
                    <i class="fas fa-info-circle"></i>
                </button>
                ${type === 'my_group' || type === 'admin' ? `
                    <button class="group-action-btn" data-action="manage" title="Manage Group">
                        <i class="fas fa-cog"></i>
                    </button>
                ` : ''}
                ${type === 'joined' ? `
                    <button class="group-action-btn danger" data-action="leave" title="Leave Group">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                ` : ''}
            `}
        </div>
    `;
    
    groupItem.addEventListener('click', (e) => {
        if (!e.target.closest('.group-actions')) {
            if (typeof showGroupDetails === 'function') {
                showGroupDetails(groupData, type);
            }
        }
    });
    
    const actionButtons = groupItem.querySelectorAll('.group-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleGroupAction(action, groupData, type, btn);
        });
    });
    
    container.appendChild(groupItem);
}

// Handle group actions
function handleGroupAction(action, groupData, type, button) {
    switch(action) {
        case 'open-chat':
            if (typeof openGroupChat === 'function') openGroupChat(groupData);
            break;
        case 'info':
            if (typeof showGroupDetails === 'function') showGroupDetails(groupData, type);
            break;
        case 'manage':
            if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
            break;
        case 'leave':
            if (typeof leaveGroupConfirm === 'function') leaveGroupConfirm(groupData);
            break;
        case 'accept-invite':
            if (typeof acceptGroupInvite === 'function') acceptGroupInvite(groupData);
            break;
        case 'decline-invite':
            if (typeof declineGroupInvite === 'function') declineGroupInvite(groupData);
            break;
        default:
            console.log('Unknown group action:', action);
    }
}

// Open group chat
function openGroupChat(groupData) {
    console.log('Opening inline group chat for:', groupData.name);
    
    currentChatGroup = groupData;
    
    const chatTitle = document.getElementById('chatTitle');
    const chatMemberCount = document.getElementById('chatMemberCount');
    const chatActive = document.getElementById('chatActive');
    const chatAvatar = document.getElementById('chatAvatar');
    
    if (chatTitle) chatTitle.textContent = groupData.name || 'Group Chat';
    if (chatMemberCount) chatMemberCount.textContent = `${groupData.memberCount || 0} members`;
    if (chatActive) chatActive.textContent = 'Active now';
    
    const theme = groupData.theme || 'blue';
    const themeInfo = groupThemes[theme];
    const initials = groupData.name 
        ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
        : 'G';
    
    if (chatAvatar) {
        if (groupData.photoURL) {
            chatAvatar.style.backgroundImage = `url('${groupData.photoURL}')`;
            chatAvatar.innerHTML = '';
        } else {
            chatAvatar.style.background = themeInfo.gradient;
            chatAvatar.innerHTML = `<span style="color: white; font-size: 16px;">${initials}</span>`;
        }
    }
    
    if (typeof updateChatHeaderUniqueFeatures === 'function') {
        updateChatHeaderUniqueFeatures(groupData);
    }
    
    const sidebar = document.getElementById('sidebar');
    const groupChatPanel = document.getElementById('groupChatPanel');
    
    if (isMobile) {
        if (sidebar) sidebar.style.display = 'none';
        if (groupChatPanel) {
            groupChatPanel.style.display = 'flex';
            groupChatPanel.classList.add('active');
        }
        
        const chatHeaderInfo = document.getElementById('chatHeaderInfo');
        if (chatHeaderInfo && !chatHeaderInfo.querySelector('.mobile-back-btn')) {
            const backBtn = document.createElement('button');
            backBtn.className = 'mobile-back-btn';
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
            backBtn.style.cssText = 'background: none; border: none; color: var(--text-primary); cursor: pointer; font-size: 18px; margin-right: 10px;';
            backBtn.addEventListener('click', closeGroupChatMobile);
            chatHeaderInfo.insertBefore(backBtn, chatHeaderInfo.firstChild);
        }
    } else {
        if (typeof hideAllPanels === 'function') hideAllPanels();
        if (groupChatPanel) groupChatPanel.classList.add('active');
    }
    
    const chatMessages = document.getElementById('chatMessages');
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    
    if (chatMessages) chatMessages.innerHTML = '';
    if (chatMessagesContainer) chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    
    if (typeof loadGroupChatMessages === 'function') loadGroupChatMessages(groupData.id);
    if (typeof setupTypingListener === 'function') setupTypingListener(groupData.id);
    
    if (typeof loadUniqueFeaturesPanels === 'function') loadUniqueFeaturesPanels(groupData.id);
    if (typeof checkPostingRules === 'function') checkPostingRules(groupData);
    
    showNotification(`Opened chat: ${groupData.name}`, 'success');
}

// Update chat header with unique features
function updateChatHeaderUniqueFeatures(groupData) {
    const purpose = groupData.purpose || '';
    const chatPurposeTag = document.getElementById('chatPurposeTag');
    if (purpose && groupPurposes[purpose] && chatPurposeTag) {
        const purposeInfo = groupPurposes[purpose];
        chatPurposeTag.textContent = `${purposeInfo.icon} ${purposeInfo.name}`;
        chatPurposeTag.style.backgroundColor = purposeInfo.color + '20';
        chatPurposeTag.style.color = purposeInfo.color;
        chatPurposeTag.style.display = 'inline-block';
    } else if (chatPurposeTag) {
        chatPurposeTag.style.display = 'none';
    }
    
    const pulse = calculateGroupPulse(groupData);
    const chatPulse = document.getElementById('chatPulse');
    if (pulse && chatPulse) {
        chatPulse.textContent = pulse.text;
        chatPulse.className = `group-pulse ${pulse.class}`;
        chatPulse.style.display = 'inline-block';
    } else if (chatPulse) {
        chatPulse.style.display = 'none';
    }
    
    const mood = groupData.mood || '';
    const postingRule = groupData.postingRule || 'everyone';
    const chatMood = document.getElementById('chatMood');
    const chatPostingRules = document.getElementById('chatPostingRules');
    const chatMoodRules = document.getElementById('chatMoodRules');
    
    if (mood && groupMoods[mood] && chatMood) {
        const moodInfo = groupMoods[mood];
        chatMood.innerHTML = `${moodInfo.icon} ${moodInfo.name}`;
        chatMood.className = `group-mood-indicator mood-${mood}`;
        chatMood.style.backgroundColor = moodInfo.bgColor;
        chatMood.style.color = moodInfo.color;
        chatMood.style.display = 'flex';
    } else if (chatMood) {
        chatMood.style.display = 'none';
    }
    
    if (postingRule && postingRules[postingRule] && chatPostingRules) {
        const ruleInfo = postingRules[postingRule];
        chatPostingRules.innerHTML = `<i class="fas fa-comment"></i> ${ruleInfo.name}`;
        chatPostingRules.className = `posting-rules-banner rule-${postingRule.replace('_', '-')}`;
        chatPostingRules.style.backgroundColor = ruleInfo.bgColor;
        chatPostingRules.style.color = ruleInfo.color;
        chatPostingRules.style.display = 'inline-flex';
    } else if (chatPostingRules) {
        chatPostingRules.style.display = 'none';
    }
    
    if (chatMoodRules) {
        if ((chatMood && chatMood.style.display !== 'none') || (chatPostingRules && chatPostingRules.style.display !== 'none')) {
            chatMoodRules.style.display = 'block';
        } else {
            chatMoodRules.style.display = 'none';
        }
    }
}

// Check posting rules
function checkPostingRules(groupData) {
    const postingRule = groupData.postingRule || 'everyone';
    const quietHours = groupData.quietHours || {};
    const scheduledPosting = groupData.scheduledPosting || {};
    
    let canPost = true;
    let reason = '';
    
    if (postingRule === 'admin_only' && !groupData.isAdmin && !groupData.isCreator) {
        canPost = false;
        reason = 'Only admins can post in this group';
    }
    
    if (postingRule === 'quiet_hours' && quietHours.start && quietHours.end) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        
        const [startHour, startMinute] = quietHours.start.split(':').map(Number);
        const [endHour, endMinute] = quietHours.end.split(':').map(Number);
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;
        
        if (currentTime >= startTime && currentTime <= endTime) {
            canPost = false;
            reason = `Quiet hours: ${quietHours.start} - ${quietHours.end}`;
        }
    }
    
    if (postingRule === 'scheduled' && scheduledPosting.start && scheduledPosting.end) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        
        const [startHour, startMinute] = scheduledPosting.start.split(':').map(Number);
        const [endHour, endMinute] = scheduledPosting.end.split(':').map(Number);
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;
        
        if (currentTime < startTime || currentTime > endTime) {
            canPost = false;
            reason = `Posting allowed: ${scheduledPosting.start} - ${scheduledPosting.end}`;
        }
    }
    
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const topicSelection = document.getElementById('topicSelection');
    const silentModeBtn = document.getElementById('silentModeBtn');
    const anonymousModeBtn = document.getElementById('anonymousModeBtn');
    
    if (chatInput && chatSendBtn) {
        if (!canPost) {
            chatInput.placeholder = reason;
            chatInput.disabled = true;
            chatSendBtn.disabled = true;
            showNotification(reason, 'info');
        } else {
            chatInput.placeholder = 'Type a message...';
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
        }
    }
    
    const showTopics = groupData.features && groupData.features.topics === true;
    if (topicSelection) {
        topicSelection.style.display = showTopics ? 'block' : 'none';
    }
    
    const participationModes = groupData.participationModes || {};
    if (silentModeBtn) {
        silentModeBtn.style.display = participationModes.readOnly ? 'block' : 'none';
    }
    if (anonymousModeBtn) {
        anonymousModeBtn.style.display = participationModes.anonymous ? 'block' : 'none';
    }
    
    if (typeof updateParticipationModeButtons === 'function') {
        updateParticipationModeButtons();
    }
}

// Update participation mode buttons
function updateParticipationModeButtons() {
    const silentModeBtn = document.getElementById('silentModeBtn');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const anonymousModeBtn = document.getElementById('anonymousModeBtn');
    
    if (silentModeBtn) {
        if (currentParticipationMode === 'read_only') {
            silentModeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            silentModeBtn.title = 'Exit Silent Mode';
            if (chatInput) chatInput.placeholder = 'Silent mode: Read only';
            if (chatInput) chatInput.disabled = true;
            if (chatSendBtn) chatSendBtn.disabled = true;
        } else {
            silentModeBtn.innerHTML = '<i class="fas fa-eye"></i>';
            silentModeBtn.title = 'Enter Silent Mode';
        }
    }
    
    if (anonymousModeBtn) {
        if (isAnonymousMode) {
            anonymousModeBtn.innerHTML = '<i class="fas fa-user-secret"></i>';
            anonymousModeBtn.title = 'Exit Anonymous Mode';
            if (chatInput) chatInput.placeholder = 'Anonymous mode enabled';
        } else {
            anonymousModeBtn.innerHTML = '<i class="fas fa-user"></i>';
            anonymousModeBtn.title = 'Enter Anonymous Mode';
        }
    }
}

// Load unique features panels
function loadUniqueFeaturesPanels(groupId) {
    if (typeof loadGroupNotes === 'function') loadGroupNotes(groupId);
    if (typeof loadGroupEvents === 'function') loadGroupEvents(groupId);
    if (typeof loadTransparencyLog === 'function') loadTransparencyLog(groupId);
    if (typeof analyzeGroupEnergy === 'function') analyzeGroupEnergy(groupId);
}

// Load group notes
async function loadGroupNotes(groupId) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_NOTES + groupId;
        const cachedNotes = localStorage.getItem(cacheKey);
        
        const groupNotesContent = document.getElementById('groupNotesContent');
        if (groupNotesContent) {
            if (cachedNotes) {
                groupNotesContent.innerHTML = cachedNotes;
            } else {
                groupNotesContent.innerHTML = '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
            }
        }
        
        const response = await safeApiCall('get', `groups/${groupId}/notes`);
        if (response && response.success && response.data && groupNotesContent) {
            const notes = response.data.notes || '';
            groupNotesContent.innerHTML = notes || '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
            localStorage.setItem(cacheKey, notes);
        }
        
        const groupNotesPanel = document.getElementById('groupNotesPanel');
        if (groupNotesPanel && currentChatGroup && (currentChatGroup.isAdmin || currentChatGroup.isCreator || cachedNotes)) {
            groupNotesPanel.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error loading group notes:', error);
        const groupNotesPanel = document.getElementById('groupNotesPanel');
        if (groupNotesPanel) groupNotesPanel.style.display = 'none';
    }
}

// Load group events
async function loadGroupEvents(groupId) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_EVENTS + groupId;
        const cachedEvents = localStorage.getItem(cacheKey);
        
        let events = [];
        if (cachedEvents) {
            try {
                events = JSON.parse(cachedEvents);
            } catch (e) {
                console.error('Error parsing cached events:', e);
            }
        }
        
        // Try to get events from API
        const response = await safeApiCall('get', `groups/${groupId}/events`);
        if (response && response.success && response.data) {
            events = response.data;
            localStorage.setItem(cacheKey, JSON.stringify(events));
        } else {
            // Generate unique events for this user if none exist
            if (events.length === 0 && currentUser) {
                if (typeof generateUniqueEventsForUser === 'function') {
                    events = generateUniqueEventsForUser(groupId, currentUser.uid || currentUser.id);
                    localStorage.setItem(cacheKey, JSON.stringify(events));
                }
            }
        }
        
        const now = new Date();
        const upcomingEvents = events
            .filter(event => new Date(event.date) > now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const eventCountdownDisplay = document.getElementById('eventCountdownDisplay');
        const eventCountdownPanel = document.getElementById('eventCountdownPanel');
        
        if (eventCountdownDisplay && eventCountdownPanel) {
            if (upcomingEvents.length > 0) {
                const nextEvent = upcomingEvents[0];
                const eventDate = new Date(nextEvent.date);
                const timeDiff = eventDate.getTime() - now.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                
                if (daysDiff <= 7) {
                    eventCountdownDisplay.innerHTML = `
                        <div style="font-size: 14px; font-weight: 600;">${nextEvent.title}</div>
                        <div style="font-size: 12px; opacity: 0.9;">${formatDate(eventDate)} • ${daysDiff} day${daysDiff !== 1 ? 's' : ''} to go</div>
                    `;
                    eventCountdownPanel.style.display = 'block';
                } else {
                    eventCountdownPanel.style.display = 'none';
                }
            } else {
                eventCountdownDisplay.innerHTML = 'No upcoming events';
                eventCountdownPanel.style.display = currentChatGroup && (currentChatGroup.isAdmin || currentChatGroup.isCreator) ? 'block' : 'none';
            }
        }
        
    } catch (error) {
        console.error('Error loading group events:', error);
        const eventCountdownPanel = document.getElementById('eventCountdownPanel');
        if (eventCountdownPanel) eventCountdownPanel.style.display = 'none';
    }
}

// Generate unique events for a user based on their ID
function generateUniqueEventsForUser(groupId, userId) {
    const events = [];
    const now = new Date();
    
    // Generate events based on user ID hash for uniqueness
    const userHash = hashCode(userId);
    const eventTemplates = [
        { title: 'Group Study Session', type: 'study', duration: 2 },
        { title: 'Team Meeting', type: 'work', duration: 1 },
        { title: 'Family Gathering', type: 'family', duration: 3 },
        { title: 'Project Review', type: 'project', duration: 2 },
        { title: 'Weekly Check-in', type: 'support', duration: 1 },
        { title: 'Hobby Workshop', type: 'hobby', duration: 4 },
        { title: 'Fitness Challenge', type: 'fitness', duration: 1 },
        { title: 'Prayer Meeting', type: 'prayer', duration: 1 },
        { title: 'Celebration Party', type: 'event', duration: 5 }
    ];
    
    // Create 3 unique events for this user
    for (let i = 0; i < 3; i++) {
        const templateIndex = (userHash + i) % eventTemplates.length;
        const template = eventTemplates[templateIndex];
        
        // Create date 1-14 days from now, based on user hash
        const daysFromNow = 1 + ((userHash + i * 7) % 14);
        const eventDate = new Date(now);
        eventDate.setDate(eventDate.getDate() + daysFromNow);
        
        // Set time based on user hash
        const hour = 9 + ((userHash + i * 3) % 8); // 9 AM to 5 PM
        eventDate.setHours(hour, 0, 0, 0);
        
        events.push({
            id: `event_${groupId}_${userId}_${i}`,
            groupId: groupId,
            title: template.title,
            description: `Join us for a ${template.type} event!`,
            date: eventDate.toISOString(),
            duration: template.duration,
            type: template.type,
            createdBy: 'system',
            attendees: [],
            location: 'Online',
            createdAt: new Date().toISOString()
        });
    }
    
    return events;
}

// Simple hash function for user IDs
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Load transparency log
async function loadTransparencyLog(groupId) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_TRANSPARENCY + groupId;
        const cachedLog = localStorage.getItem(cacheKey);
        
        let log = [];
        if (cachedLog) {
            try {
                log = JSON.parse(cachedLog);
            } catch (e) {
                console.error('Error parsing transparency log:', e);
            }
        } else {
            // Generate initial transparency log
            if (typeof generateInitialTransparencyLog === 'function') {
                log = generateInitialTransparencyLog(groupId);
                localStorage.setItem(cacheKey, JSON.stringify(log));
            }
        }
        
        const response = await safeApiCall('get', `groups/${groupId}/transparency`);
        if (response && response.success && response.data) {
            log = response.data;
            localStorage.setItem(cacheKey, JSON.stringify(log));
        }
        
        const adminTransparencyLog = document.getElementById('adminTransparencyLog');
        const adminTransparencyPanel = document.getElementById('adminTransparencyPanel');
        
        if (adminTransparencyLog && adminTransparencyPanel) {
            if (log.length > 0 && currentChatGroup && currentChatGroup.isAdmin) {
                let logHTML = '';
                log.slice(0, 5).forEach(item => {
                    logHTML += `
                        <div class="transparency-log-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
                            <div><strong>${item.action}</strong></div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                By ${item.by || 'Unknown'} • ${formatTimeAgo(item.timestamp)}
                            </div>
                        </div>
                    `;
                });
                
                adminTransparencyLog.innerHTML = logHTML || 'No recent changes';
                adminTransparencyPanel.style.display = 'block';
            } else {
                adminTransparencyPanel.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('Error loading transparency log:', error);
        const adminTransparencyPanel = document.getElementById('adminTransparencyPanel');
        if (adminTransparencyPanel) adminTransparencyPanel.style.display = 'none';
    }
}

// Generate initial transparency log
function generateInitialTransparencyLog(groupId) {
    const now = new Date();
    return [
        {
            id: `log_${groupId}_1`,
            groupId: groupId,
            action: 'Group created',
            by: currentUser?.uid || currentUser?.id || 'system',
            byName: userData?.displayName || 'System',
            timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(), // 2 days ago
            details: 'Group was created with initial settings'
        },
        {
            id: `log_${groupId}_2`,
            groupId: groupId,
            action: 'Welcome message set',
            by: currentUser?.uid || currentUser?.id || 'system',
            byName: userData?.displayName || 'System',
            timestamp: new Date(now.getTime() - 86400000 * 1).toISOString(), // 1 day ago
            details: 'Welcome message was configured'
        },
        {
            id: `log_${groupId}_3`,
            groupId: groupId,
            action: 'First members joined',
            by: 'system',
            byName: 'System',
            timestamp: new Date(now.getTime() - 43200000).toISOString(), // 12 hours ago
            details: 'Initial members joined the group'
        }
    ];
}

// Analyze group energy
async function analyzeGroupEnergy(groupId) {
    try {
        let messages = [];
        
        const response = await safeApiCall('get', `groups/${groupId}/messages?limit=50`);
        if (response && response.success && response.data) {
            messages = response.data;
        } else {
            // Generate simulated message data for demo
            if (typeof generateSimulatedMessages === 'function') {
                messages = generateSimulatedMessages(groupId);
            }
        }
        
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentMessages = messages.filter(m => new Date(m.timestamp) > oneHourAgo);
        const dailyMessages = messages.filter(m => new Date(m.timestamp) > oneDayAgo);
        
        const messagesPerHour = recentMessages.length;
        const messagesPerDay = dailyMessages.length;
        
        let suggestion = '';
        let icon = 'fas fa-lightbulb';
        
        if (messagesPerHour > 50) {
            suggestion = 'Group is very active! Consider switching to silent mode to reduce notifications.';
            icon = 'fas fa-fire';
        } else if (messagesPerHour > 20) {
            suggestion = 'Group is active. All good!';
            icon = 'fas fa-bolt';
        } else if (messagesPerHour > 5) {
            suggestion = 'Group is moderately active.';
            icon = 'fas fa-chart-line';
        } else if (messagesPerDay < 5) {
            suggestion = 'Group is quiet. Consider sending a check-in message.';
            icon = 'fas fa-volume-mute';
        } else {
            suggestion = 'Group activity is normal.';
            icon = 'fas fa-check-circle';
        }
        
        const energySuggestionContent = document.getElementById('energySuggestionContent');
        const energySuggestionPanel = document.getElementById('energySuggestionPanel');
        
        if (energySuggestionContent && energySuggestionPanel) {
            energySuggestionContent.innerHTML = `<i class="${icon}"></i> ${suggestion} <small>(${messagesPerHour}/hr, ${messagesPerDay}/day)</small>`;
            energySuggestionPanel.style.display = 'block';
        }
        
        energySuggestions.push({
            groupId,
            timestamp: now,
            messagesPerHour,
            messagesPerDay,
            suggestion
        });
        
    } catch (error) {
        console.error('Error analyzing group energy:', error);
        const energySuggestionPanel = document.getElementById('energySuggestionPanel');
        if (energySuggestionPanel) energySuggestionPanel.style.display = 'none';
    }
}

// Generate simulated messages for energy analysis
function generateSimulatedMessages(groupId) {
    const messages = [];
    const now = new Date();
    const members = ['user1', 'user2', 'user3', currentUser?.uid || currentUser?.id || 'user4'];
    const messageTypes = ['text', 'announcement', 'question'];
    
    // Generate messages for the last 24 hours
    for (let i = 0; i < 50; i++) {
        const hoursAgo = Math.random() * 24;
        const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
        const sender = members[Math.floor(Math.random() * members.length)];
        
        messages.push({
            id: `msg_${groupId}_${i}`,
            groupId: groupId,
            senderId: sender,
            senderName: `User ${sender.slice(-1)}`,
            content: `Sample message ${i + 1} in this group`,
            timestamp: timestamp.toISOString(),
            type: messageTypes[Math.floor(Math.random() * messageTypes.length)],
            readBy: members.slice(0, Math.floor(Math.random() * members.length) + 1)
        });
    }
    
    return messages;
}

// Close group chat mobile
function closeGroupChatMobile() {
    const sidebar = document.getElementById('sidebar');
    const groupChatPanel = document.getElementById('groupChatPanel');
    
    if (isMobile) {
        if (sidebar) sidebar.style.display = 'flex';
        if (groupChatPanel) {
            groupChatPanel.style.display = 'none';
            groupChatPanel.classList.remove('active');
        }
        
        const mobileBackBtn = document.querySelector('.mobile-back-btn');
        if (mobileBackBtn) {
            mobileBackBtn.remove();
        }
    }
}

// Hide all panels
function hideAllPanels() {
    const groupDetailsPanel = document.getElementById('groupDetailsPanel');
    const groupChatPanel = document.getElementById('groupChatPanel');
    const groupCallPanel = document.getElementById('groupCallPanel');
    const sidebar = document.getElementById('sidebar');
    
    if (groupDetailsPanel) groupDetailsPanel.classList.remove('active');
    if (groupChatPanel) groupChatPanel.classList.remove('active');
    if (groupCallPanel) groupCallPanel.classList.remove('active');
    
    if (isMobile) {
        if (sidebar) sidebar.style.display = 'flex';
        if (groupChatPanel) groupChatPanel.style.display = 'none';
        if (groupCallPanel) groupCallPanel.style.display = 'none';
    }
}

// Load group chat messages
async function loadGroupChatMessages(groupId) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const cachedMessagesKey = LOCAL_STORAGE_KEYS.GROUP_MESSAGES + groupId;
    const cachedMessages = localStorage.getItem(cachedMessagesKey);
    
    if (cachedMessages) {
        try {
            const messages = JSON.parse(cachedMessages);
            messages.forEach(message => {
                if (typeof addMessageToChat === 'function') {
                    addMessageToChat(message, false);
                }
            });
        } catch (error) {
            console.error('Error loading cached messages:', error);
        }
    }
    
    if (chatMessages.children.length === 0) {
        if (typeof addSystemMessage === 'function') {
            addSystemMessage(`Welcome to the group chat! Start the conversation.`);
        }
    }
    
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    setTimeout(() => {
        if (chatMessagesContainer) {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    }, 100);
    
    try {
        const response = await safeApiCall('get', `groups/${groupId}/messages`);
        if (response && response.success && response.data) {
            response.data.forEach(message => {
                if (typeof addMessageToChat === 'function') {
                    addMessageToChat(message, true);
                }
                if (typeof saveMessageToCache === 'function') {
                    saveMessageToCache(groupId, message);
                }
            });
        }
    } catch (error) {
        console.error('Error loading messages from API:', error);
    }
}

// Add message to chat
function addMessageToChat(messageData, isNew = true) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const isSystem = messageData.type === 'system';
    const isSent = messageData.senderId === (currentUser.uid || currentUser.id);
    const isAnonymous = messageData.anonymous === true;
    const topic = messageData.topic || '';
    const topicInfo = topic ? groupTopics[topic] : null;
    
    if (isSystem) {
        messageElement.className = 'message system';
        messageElement.innerHTML = `
            <div class="message-content">${messageData.content}</div>
            <div class="message-time">${formatMessageTime(messageData.timestamp || new Date())}</div>
        `;
    } else {
        messageElement.className = isSent ? 'message sent' : 'message received';
        const senderName = isAnonymous ? 'Anonymous' : (isSent ? 'You' : (messageData.senderName || 'Unknown'));
        
        messageElement.innerHTML = `
            ${!isSent ? `<div class="message-sender">${senderName} ${isAnonymous ? '<i class="fas fa-user-secret" style="margin-left: 5px; color: var(--text-secondary); font-size: 10px;"></i>' : ''}</div>` : ''}
            ${topicInfo ? `<div class="topic-label topic-${topic}" style="margin-bottom: 3px;">${topicInfo.icon} ${topicInfo.name}</div>` : ''}
            <div class="message-content">${messageData.content}</div>
            <div class="message-time">${formatMessageTime(messageData.timestamp || new Date())}</div>
            <div class="message-actions">
                <button class="message-action-btn" title="React" onclick="reactToMessage('${messageData.id}', this)">
                    <i class="far fa-smile"></i>
                </button>
                <button class="message-action-btn" title="Reply" onclick="replyToMessage('${messageData.id}', '${senderName}')">
                    <i class="fas fa-reply"></i>
                </button>
                ${isSent ? `<button class="message-action-btn" title="Delete" onclick="deleteMessage('${messageData.id}')">
                    <i class="fas fa-trash"></i>
                </button>` : ''}
            </div>
        `;
    }
    
    chatMessages.appendChild(messageElement);
    
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    if (isNew && chatMessagesContainer) {
        setTimeout(() => {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }, 100);
    }
}

// Add system message
function addSystemMessage(content) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message system';
    messageElement.innerHTML = `
        <div class="message-content">${content}</div>
        <div class="message-time">${formatMessageTime(new Date())}</div>
    `;
    chatMessages.appendChild(messageElement);
}

// Save message to cache
function saveMessageToCache(groupId, message) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_MESSAGES + groupId;
        const cachedMessages = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        
        if (!cachedMessages.some(m => m.id === message.id)) {
            cachedMessages.push(message);
            
            if (cachedMessages.length > 100) {
                cachedMessages.splice(0, cachedMessages.length - 100);
            }
            
            localStorage.setItem(cacheKey, JSON.stringify(cachedMessages));
        }
    } catch (error) {
        console.error('Error saving message to cache:', error);
    }
}

// Send group message
async function sendGroupMessage() {
    const chatInput = document.getElementById('chatInput');
    const messageTopic = document.getElementById('messageTopic');
    
    if (!currentChatGroup || !chatInput || !chatInput.value.trim()) return;
    
    const messageContent = chatInput.value.trim();
    const selectedTopic = messageTopic ? messageTopic.value : '';
    
    chatInput.value = '';
    if (typeof adjustTextareaHeight === 'function') adjustTextareaHeight();
    
    const message = {
        groupId: currentChatGroup.id,
        senderId: currentUser.uid || currentUser.id,
        senderName: userData.displayName || 'User',
        content: messageContent,
        timestamp: new Date(),
        type: 'text',
        readBy: [currentUser.uid || currentUser.id],
        topic: selectedTopic || undefined,
        anonymous: isAnonymousMode
    };
    
    const tempMessage = {
        ...message,
        id: 'temp_' + Date.now()
    };
    
    if (typeof addMessageToChat === 'function') addMessageToChat(tempMessage, true);
    
    try {
        const response = await safeApiCall('post', `groups/${currentChatGroup.id}/messages`, {
            content: messageContent,
            topic: selectedTopic || undefined,
            anonymous: isAnonymousMode
        });
        
        if (response && response.success) {
            if (typeof saveMessageToCache === 'function') {
                saveMessageToCache(currentChatGroup.id, {
                    ...tempMessage,
                    id: response.data?.id || tempMessage.id
                });
            }
            
            if (isAnonymousMode) {
                if (typeof toggleAnonymousMode === 'function') toggleAnonymousMode();
            }
        } else {
            showNotification('Failed to send message', 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
    
    if (typeof stopTypingIndicator === 'function') stopTypingIndicator();
}

// Toggle silent mode
function toggleSilentMode() {
    if (currentParticipationMode === 'read_only') {
        currentParticipationMode = 'normal';
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        if (chatInput) chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        if (chatInput) chatInput.placeholder = 'Type a message...';
        showNotification('Exited silent mode', 'success');
    } else {
        currentParticipationMode = 'read_only';
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        if (chatInput) chatInput.disabled = true;
        if (chatSendBtn) chatSendBtn.disabled = true;
        if (chatInput) chatInput.placeholder = 'Silent mode: Read only';
        showNotification('Entered silent mode (read only)', 'info');
    }
    
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PARTICIPATION_MODES, JSON.stringify(currentParticipationMode));
    if (typeof updateParticipationModeButtons === 'function') {
        updateParticipationModeButtons();
    }
}

// Toggle anonymous mode
function toggleAnonymousMode() {
    isAnonymousMode = !isAnonymousMode;
    
    if (isAnonymousMode) {
        showNotification('Anonymous mode enabled', 'info');
    } else {
        showNotification('Anonymous mode disabled', 'success');
    }
    
    if (typeof updateParticipationModeButtons === 'function') {
        updateParticipationModeButtons();
    }
}

// Message reaction handler
window.reactToMessage = function(messageId, button) {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    
    showNotification(`Reacted with ${reaction}`, 'success');
    
    // Update button to show reaction
    button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
    button.style.color = '#FF9800';
};

// Message reply handler
window.replyToMessage = function(messageId, senderName) {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = `@${senderName} `;
        chatInput.focus();
        showNotification(`Replying to ${senderName}`, 'info');
    }
};

// Message delete handler
window.deleteMessage = function(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        // Find and remove the message element
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
        showNotification('Message deleted', 'success');
    }
};

// Setup typing listener
let typingTimeout;
function setupTypingListener(groupId) {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    chatInput.addEventListener('input', () => {
        if (!isTyping) {
            isTyping = true;
            safeApiCall('post', `groups/${groupId}/typing`, { typing: true })
                .catch(() => {});
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            safeApiCall('post', `groups/${groupId}/typing`, { typing: false })
                .catch(() => {});
        }, 1000);
    });
}

// Stop typing indicator
function stopTypingIndicator() {
    isTyping = false;
    if (typingTimeout) clearTimeout(typingTimeout);
}

// Adjust textarea height
function adjustTextareaHeight() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
}

// Format message time
function formatMessageTime(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Open admin management
function openAdminManagement(groupData) {
    if (!groupData.isAdmin && !groupData.isCreator) {
        showNotification('You need admin permissions to manage this group', 'error');
        return;
    }
    
    const adminManagementGroupName = document.getElementById('adminManagementGroupName');
    if (adminManagementGroupName) {
        adminManagementGroupName.textContent = groupData.name;
    }
    
    const adminManagementModal = document.getElementById('adminManagementModal');
    if (adminManagementModal) {
        adminManagementModal.classList.add('active');
    }
    
    if (typeof loadGroupMembersForManagement === 'function') loadGroupMembersForManagement(groupData);
    if (typeof loadGroupSettingsForManagement === 'function') loadGroupSettingsForManagement(groupData);
    if (typeof loadUniqueFeaturesForManagement === 'function') loadUniqueFeaturesForManagement(groupData);
}

// Load group members for management
async function loadGroupMembersForManagement(groupData) {
    const memberList = document.getElementById('memberManagementList');
    if (!memberList) return;
    
    memberList.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading members...</p></div>';
    
    try {
        let memberDetails = [];
        
        const response = await safeApiCall('get', `groups/${groupData.id}/members`);
        
        if (response && response.success && response.data) {
            memberDetails = response.data;
        } else {
            // Generate simulated members for demo
            if (typeof generateSimulatedMembers === 'function') {
                memberDetails = generateSimulatedMembers(groupData.id);
            }
        }
        
        if (typeof renderMembersList === 'function') {
            renderMembersList(memberDetails);
        }
        
    } catch (error) {
        console.error('Error loading members:', error);
        memberList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading members</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

// Generate simulated members for demo
function generateSimulatedMembers(groupId) {
    const members = [];
    const memberNames = ['Alex Johnson', 'Sam Wilson', 'Taylor Smith', 'Jordan Lee', 'Casey Brown'];
    const roles = ['admin', 'moderator', 'member', 'member', 'member'];
    
    for (let i = 0; i < 5; i++) {
        members.push({
            id: `member_${groupId}_${i}`,
            displayName: memberNames[i],
            username: memberNames[i].toLowerCase().replace(' ', ''),
            photoURL: '',
            online: i < 2, // First two are online
            isCreator: i === 0,
            isAdmin: roles[i] === 'admin' || roles[i] === 'moderator'
        });
    }
    
    // Add current user if not already in list
    if (currentUser) {
        members.unshift({
            id: currentUser.uid || currentUser.id,
            displayName: userData?.displayName || 'You',
            username: userData?.username || 'you',
            photoURL: currentUser.photoURL || '',
            online: true,
            isCreator: true,
            isAdmin: true
        });
    }
    
    return members;
}

// Render members list
function renderMembersList(memberDetails) {
    const memberList = document.getElementById('memberManagementList');
    if (!memberList) return;
    
    memberList.innerHTML = '';
    
    memberDetails.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-management-item';
        
        const initials = member.displayName 
            ? member.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'U';
        
        memberItem.innerHTML = `
            <div class="member-management-info">
                <div class="friend-avatar" ${member.photoURL ? `style="background-image: url('${member.photoURL}')"` : ''}>
                    ${member.photoURL ? '' : `<span>${initials}</span>`}
                </div>
                <div>
                    <div style="font-weight: 500;">${member.displayName}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${member.username || ''}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                        ${member.isCreator ? '<span class="role-badge admin"><i class="fas fa-star"></i> Creator</span>' : ''}
                        ${member.isAdmin && !member.isCreator ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                        ${!member.isAdmin && !member.isCreator ? '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="member-management-actions">
                ${!member.isCreator ? `
                    ${member.isAdmin ? `
                        <button class="member-action-btn demote" data-member-id="${member.id}" title="Demote to Member">
                            <i class="fas fa-arrow-down"></i> Demote
                        </button>
                    ` : `
                        <button class="member-action-btn promote" data-member-id="${member.id}" title="Promote to Admin">
                            <i class="fas fa-arrow-up"></i> Promote
                        </button>
                    `}
                    ${member.id !== (currentUser.uid || currentUser.id) ? `
                        <button class="member-action-btn remove" data-member-id="${member.id}" title="Remove from Group">
                            <i class="fas fa-user-times"></i> Remove
                        </button>
                    ` : ''}
                ` : ''}
            </div>
        `;
        
        memberList.appendChild(memberItem);
    });
    
    memberList.querySelectorAll('.member-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const memberId = btn.dataset.memberId;
            const action = btn.classList.contains('promote') ? 'promote' : 
                          btn.classList.contains('demote') ? 'demote' : 'remove';
            
            if (typeof handleMemberAction === 'function') {
                handleMemberAction(action, memberId, groupData);
            }
        });
    });
}

// Handle member action
async function handleMemberAction(action, memberId, groupData) {
    try {
        switch(action) {
            case 'promote':
                await safeApiCall('post', `groups/${groupData.id}/members/${memberId}/promote`);
                showNotification('Member promoted to admin', 'success');
                if (typeof logTransparencyAction === 'function') {
                    logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                }
                break;
            case 'demote':
                await safeApiCall('post', `groups/${groupData.id}/members/${memberId}/demote`);
                showNotification('Admin demoted to member', 'success');
                if (typeof logTransparencyAction === 'function') {
                    logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                }
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    await safeApiCall('delete', `groups/${groupData.id}/members/${memberId}`);
                    showNotification('Member removed from group', 'success');
                    if (typeof logTransparencyAction === 'function') {
                        logTransparencyAction(groupData.id, 'Removed member from group', memberId);
                    }
                }
                break;
        }
        
        if (typeof loadGroupMembersForManagement === 'function') {
            loadGroupMembersForManagement(groupData);
        }
        
    } catch (error) {
        console.error('Error performing member action:', error);
        showNotification('Failed to perform action', 'error');
    }
}

// Log transparency action
async function logTransparencyAction(groupId, action, targetId = null) {
    try {
        const logEntry = {
            groupId,
            action,
            targetId,
            by: currentUser.uid || currentUser.id,
            byName: userData.displayName || 'Unknown',
            timestamp: new Date()
        };
        
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_TRANSPARENCY + groupId;
        const cachedLog = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        cachedLog.unshift(logEntry);
        if (cachedLog.length > 50) cachedLog.pop();
        localStorage.setItem(cacheKey, JSON.stringify(cachedLog));
        
        await safeApiCall('post', `groups/${groupId}/transparency`, logEntry);
        
    } catch (error) {
        console.error('Error logging transparency action:', error);
    }
}

// Load group settings for management
function loadGroupSettingsForManagement(groupData) {
    const adminPublicGroup = document.getElementById('adminPublicGroup');
    const adminApproveMembers = document.getElementById('adminApproveMembers');
    const adminAllowInvites = document.getElementById('adminAllowInvites');
    const adminOnlyAdminsPost = document.getElementById('adminOnlyAdminsPost');
    const adminAllowMedia = document.getElementById('adminAllowMedia');
    const adminDisappearingMessages = document.getElementById('adminDisappearingMessages');
    const adminMentionNotifications = document.getElementById('adminMentionNotifications');
    const adminAnnouncementNotifications = document.getElementById('adminAnnouncementNotifications');
    
    if (adminPublicGroup) adminPublicGroup.checked = groupData.type === 'public';
    if (adminApproveMembers) adminApproveMembers.checked = groupData.moderationSettings?.approveNewMembers || false;
    if (adminAllowInvites) adminAllowInvites.checked = groupData.moderationSettings?.allowInvites || true;
    if (adminOnlyAdminsPost) adminOnlyAdminsPost.checked = groupData.moderationSettings?.onlyAdminsCanPost || false;
    if (adminAllowMedia) adminAllowMedia.checked = groupData.moderationSettings?.allowMediaSharing || true;
    if (adminDisappearingMessages) adminDisappearingMessages.checked = groupData.moderationSettings?.disappearingMessages || false;
    if (adminMentionNotifications) adminMentionNotifications.checked = groupData.notificationSettings?.mentionNotifications || true;
    if (adminAnnouncementNotifications) adminAnnouncementNotifications.checked = groupData.notificationSettings?.announcementNotifications || true;
}

// Load unique features for management
function loadUniqueFeaturesForManagement(groupData) {
    const adminGroupPurpose = document.getElementById('adminGroupPurpose');
    if (adminGroupPurpose) adminGroupPurpose.value = groupData.purpose || '';
    
    document.querySelectorAll('.mood-select-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mood === groupData.mood) {
            btn.classList.add('active');
            btn.style.borderWidth = '2px';
        }
    });
    
    const adminPostingMode = document.getElementById('adminPostingMode');
    if (adminPostingMode) adminPostingMode.value = groupData.postingRule || 'everyone';
    if (typeof updatePostingRulesUI === 'function') updatePostingRulesUI();
    
    if (groupData.quietHours) {
        const adminQuietStart = document.getElementById('adminQuietStart');
        const adminQuietEnd = document.getElementById('adminQuietEnd');
        if (adminQuietStart) adminQuietStart.value = groupData.quietHours.start || '22:00';
        if (adminQuietEnd) adminQuietEnd.value = groupData.quietHours.end || '08:00';
    }
    
    if (groupData.scheduledPosting) {
        const adminPostingStart = document.getElementById('adminPostingStart');
        const adminPostingEnd = document.getElementById('adminPostingEnd');
        if (adminPostingStart) adminPostingStart.value = groupData.scheduledPosting.start || '09:00';
        if (adminPostingEnd) adminPostingEnd.value = groupData.scheduledPosting.end || '18:00';
    }
    
    const participationModes = groupData.participationModes || {};
    const adminEnableReadOnly = document.getElementById('adminEnableReadOnly');
    const adminEnableReactOnly = document.getElementById('adminEnableReactOnly');
    const adminEnableAnonymous = document.getElementById('adminEnableAnonymous');
    
    if (adminEnableReadOnly) adminEnableReadOnly.checked = participationModes.readOnly || false;
    if (adminEnableReactOnly) adminEnableReactOnly.checked = participationModes.reactOnly || false;
    if (adminEnableAnonymous) adminEnableAnonymous.checked = participationModes.anonymous || false;
}

// Update posting rules UI
function updatePostingRulesUI() {
    const adminPostingMode = document.getElementById('adminPostingMode');
    const adminQuietHoursSection = document.getElementById('adminQuietHoursSection');
    const adminScheduledPostingSection = document.getElementById('adminScheduledPostingSection');
    
    if (!adminPostingMode) return;
    
    const mode = adminPostingMode.value;
    if (adminQuietHoursSection) {
        adminQuietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
    }
    if (adminScheduledPostingSection) {
        adminScheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
    }
}

// Save group settings
async function saveGroupSettings(groupData) {
    try {
        const adminPublicGroup = document.getElementById('adminPublicGroup');
        const adminApproveMembers = document.getElementById('adminApproveMembers');
        const adminAllowInvites = document.getElementById('adminAllowInvites');
        const adminOnlyAdminsPost = document.getElementById('adminOnlyAdminsPost');
        const adminAllowMedia = document.getElementById('adminAllowMedia');
        const adminDisappearingMessages = document.getElementById('adminDisappearingMessages');
        const adminMentionNotifications = document.getElementById('adminMentionNotifications');
        const adminAnnouncementNotifications = document.getElementById('adminAnnouncementNotifications');
        const adminGroupPurpose = document.getElementById('adminGroupPurpose');
        const adminPostingMode = document.getElementById('adminPostingMode');
        const adminQuietStart = document.getElementById('adminQuietStart');
        const adminQuietEnd = document.getElementById('adminQuietEnd');
        const adminPostingStart = document.getElementById('adminPostingStart');
        const adminPostingEnd = document.getElementById('adminPostingEnd');
        const adminEnableReadOnly = document.getElementById('adminEnableReadOnly');
        const adminEnableReactOnly = document.getElementById('adminEnableReactOnly');
        const adminEnableAnonymous = document.getElementById('adminEnableAnonymous');
        
        const settings = {
            privacy: adminPublicGroup && adminPublicGroup.checked ? 'public' : 'private',
            moderationSettings: {
                approveNewMembers: adminApproveMembers ? adminApproveMembers.checked : false,
                allowInvites: adminAllowInvites ? adminAllowInvites.checked : true,
                onlyAdminsCanPost: adminOnlyAdminsPost ? adminOnlyAdminsPost.checked : false,
                allowMediaSharing: adminAllowMedia ? adminAllowMedia.checked : true,
                disappearingMessages: adminDisappearingMessages ? adminDisappearingMessages.checked : false
            },
            notificationSettings: {
                mentionNotifications: adminMentionNotifications ? adminMentionNotifications.checked : true,
                announcementNotifications: adminAnnouncementNotifications ? adminAnnouncementNotifications.checked : true
            },
            purpose: adminGroupPurpose ? adminGroupPurpose.value : '',
            mood: document.querySelector('.mood-select-btn.active')?.dataset.mood || '',
            postingRule: adminPostingMode ? adminPostingMode.value : 'everyone',
            quietHours: adminPostingMode && adminPostingMode.value === 'quiet_hours' ? {
                start: adminQuietStart ? adminQuietStart.value : '22:00',
                end: adminQuietEnd ? adminQuietEnd.value : '08:00'
            } : {},
            scheduledPosting: adminPostingMode && adminPostingMode.value === 'scheduled' ? {
                start: adminPostingStart ? adminPostingStart.value : '09:00',
                end: adminPostingEnd ? adminPostingEnd.value : '18:00'
            } : {},
            participationModes: {
                readOnly: adminEnableReadOnly ? adminEnableReadOnly.checked : false,
                reactOnly: adminEnableReactOnly ? adminEnableReactOnly.checked : false,
                anonymous: adminEnableAnonymous ? adminEnableAnonymous.checked : false
            }
        };
        
        const response = await safeApiCall('put', `groups/${groupData.id}/settings`, settings);
        
        if (response && response.success) {
            Object.assign(groupData, settings);
            
            if (typeof logTransparencyAction === 'function') {
                logTransparencyAction(groupData.id, 'Updated group settings');
            }
            
            if (currentChatGroup && currentChatGroup.id === groupData.id) {
                if (typeof updateChatHeaderUniqueFeatures === 'function') {
                    updateChatHeaderUniqueFeatures(groupData);
                }
                if (typeof checkPostingRules === 'function') {
                    checkPostingRules(groupData);
                }
            }
            
            showNotification('Group settings saved successfully', 'success');
            
            const adminManagementModal = document.getElementById('adminManagementModal');
            if (adminManagementModal) adminManagementModal.classList.remove('active');
        } else {
            throw new Error(response?.error || 'Failed to save settings');
        }
        
    } catch (error) {
        console.error('Error saving group settings:', error);
        showNotification('Failed to save settings: ' + error.message, 'error');
    }
}

// Show friend selection
function showFriendSelection() {
    const friendSelectionModal = document.getElementById('friendSelectionModal');
    if (friendSelectionModal) {
        friendSelectionModal.classList.add('active');
    }
    selectedFriends = [];
    
    const friendSelectionContent = document.getElementById('friendSelectionContent');
    if (friendSelectionContent) {
        friendSelectionContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading friends...</p></div>';
    }
    
    setTimeout(() => {
        if (typeof renderFriendSelection === 'function') {
            renderFriendSelection();
        }
    }, 100);
}

// Render friend selection
function renderFriendSelection() {
    const friendSelectionContent = document.getElementById('friendSelectionContent');
    if (!friendSelectionContent) return;
    
    if (friends.length === 0) {
        friendSelectionContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <p>No friends found</p>
                <p class="subtext">Add friends first to invite them to groups</p>
            </div>
        `;
        return;
    }
    
    friendSelectionContent.innerHTML = '';
    
    friends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.dataset.friendId = friend.id;
        
        const initials = friend.displayName 
            ? friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'U';
        
        friendItem.innerHTML = `
            <div class="friend-avatar" ${friend.photoURL ? `style="background-image: url('${friend.photoURL}')"` : ''}>
                ${friend.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="friend-info">
                <div class="friend-name">${friend.displayName}</div>
                <div class="friend-username">${friend.username || ''}</div>
                <div style="font-size: 11px; color: ${friend.online ? 'var(--success-color)' : 'var(--text-secondary)'}; margin-top: 2px;">
                    <i class="fas fa-circle" style="font-size: 8px;"></i> ${friend.online ? 'Online' : 'Offline'}
                </div>
            </div>
            <div class="friend-checkbox">
                <i class="fas fa-check" style="display: none;"></i>
            </div>
        `;
        
        friendItem.addEventListener('click', () => {
            const checkbox = friendItem.querySelector('.friend-checkbox');
            const isSelected = checkbox.classList.contains('selected');
            
            if (isSelected) {
                checkbox.classList.remove('selected');
                checkbox.querySelector('i').style.display = 'none';
                selectedFriends = selectedFriends.filter(id => id !== friend.id);
            } else {
                checkbox.classList.add('selected');
                checkbox.querySelector('i').style.display = 'block';
                selectedFriends.push(friend.id);
            }
            
            if (typeof updateSelectedFriendsList === 'function') {
                updateSelectedFriendsList();
            }
        });
        
        friendSelectionContent.appendChild(friendItem);
    });
}

// Update selected friends list
function updateSelectedFriendsList() {
    const selectedMembersList = document.getElementById('selectedMembersList');
    if (!selectedMembersList) return;
    
    if (selectedFriends.length === 0) {
        selectedMembersList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                <i class="fas fa-users"></i>
                <p>No members selected yet</p>
                <p style="font-size: 14px;">Add friends to your group</p>
            </div>
        `;
        return;
    }
    
    selectedMembersList.innerHTML = '';
    
    selectedFriends.forEach(friendId => {
        const friend = friends.find(f => f.id === friendId);
        if (friend) {
            const initials = friend.displayName 
                ? friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                : 'U';
            
            const memberItem = document.createElement('div');
            memberItem.className = 'friend-item';
            memberItem.style.marginBottom = '5px';
            memberItem.style.padding = '8px';
            
            memberItem.innerHTML = `
                <div class="friend-avatar" ${friend.photoURL ? `style="background-image: url('${friend.photoURL}')"` : ''}>
                    ${friend.photoURL ? '' : `<span>${initials}</span>`}
                </div>
                <div class="friend-info">
                    <div class="friend-name">${friend.displayName}</div>
                    <div class="friend-username">${friend.username || ''}</div>
                </div>
                <div style="color: var(--danger-color); cursor: pointer;" onclick="removeSelectedFriend('${friend.id}')">
                    <i class="fas fa-times"></i>
                </div>
            `;
            
            selectedMembersList.appendChild(memberItem);
        }
    });
}

// Remove selected friend
window.removeSelectedFriend = function(friendId) {
    selectedFriends = selectedFriends.filter(id => id !== friendId);
    if (typeof updateSelectedFriendsList === 'function') {
        updateSelectedFriendsList();
    }
    
    const friendItem = document.querySelector(`.friend-item[data-friend-id="${friendId}"]`);
    if (friendItem) {
        const checkbox = friendItem.querySelector('.friend-checkbox');
        checkbox.classList.remove('selected');
        checkbox.querySelector('i').style.display = 'none';
    }
};

// Create group online
async function createGroupOnline(groupData) {
    try {
        const members = [currentUser.uid || currentUser.id, ...selectedFriends];
        
        const groupDataToSave = {
            name: groupData.name,
            description: groupData.description || '',
            topic: groupData.topic || '',
            privacy: groupData.privacy || 'private',
            theme: groupData.theme || 'blue',
            welcomeMessage: groupData.welcomeMessage || '',
            rules: groupData.rules || [],
            moderationSettings: groupData.moderationSettings || {},
            joinQuestions: groupData.joinQuestions || [],
            customReactions: groupData.customReactions || ['👍', '❤️', '😂'],
            badges: groupData.badges || ['star', 'fire'],
            memberIds: members,
            purpose: groupData.purpose || '',
            mood: groupData.mood || '',
            postingRule: groupData.postingRule || 'everyone',
            quietHours: groupData.quietHours || {},
            scheduledPosting: groupData.scheduledPosting || {},
            participationModes: groupData.participationModes || {}
        };
        
        const response = await safeApiCall('post', 'groups/create', groupDataToSave);
        
        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to create group');
        }
        
        const newGroup = response.data;
        
        groups.push(newGroup);
        myGroups.push(newGroup);
        adminGroups.push(newGroup);
        
        if (typeof saveGroupsToLocalStorage === 'function') saveGroupsToLocalStorage();
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
        
        const inviteLinkInput = document.getElementById('inviteLinkInput');
        const copyInviteLinkBtn = document.getElementById('copyInviteLinkBtn');
        const shareInviteLinkBtn = document.getElementById('shareInviteLinkBtn');
        
        if (inviteLinkInput) inviteLinkInput.value = `${window.location.origin}/group.html?join=${newGroup.id}`;
        if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = false;
        if (shareInviteLinkBtn) shareInviteLinkBtn.disabled = false;
        
        showNotification('Group created successfully!', 'success');
        
        const createGroupModal = document.getElementById('createGroupModal');
        const friendSelectionModal = document.getElementById('friendSelectionModal');
        
        if (createGroupModal) createGroupModal.classList.remove('active');
        if (friendSelectionModal) friendSelectionModal.classList.remove('active');
        
        selectedFriends = [];
        if (typeof showGroupDetails === 'function') {
            showGroupDetails(newGroup, 'my_group');
        }
        
    } catch (error) {
        console.error('Error creating group:', error);
        showNotification('Failed to create group: ' + error.message, 'error');
    }
}

// Join group online
async function joinGroupOnline(groupId) {
    try {
        const response = await safeApiCall('post', `groups/${groupId}/join`);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to join group', 'error');
            return;
        }
        
        const updatedGroup = response.data;
        
        const existingIndex = groups.findIndex(g => g.id === groupId);
        if (existingIndex !== -1) {
            groups[existingIndex] = updatedGroup;
        } else {
            groups.push(updatedGroup);
        }
        
        joinedGroups.push(updatedGroup);
        groupInvites = groupInvites.filter(invite => invite.groupId !== groupId);
        
        if (typeof saveGroupsToLocalStorage === 'function') saveGroupsToLocalStorage();
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
        
        showNotification('Successfully joined the group!', 'success');
        
        const groupInviteModal = document.getElementById('groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {
        console.error('Error joining group:', error);
        showNotification('Failed to join group: ' + error.message, 'error');
    }
}

// Leave group online
async function leaveGroupOnline(groupId) {
    try {
        const response = await safeApiCall('post', `groups/${groupId}/leave`);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to leave group', 'error');
            return;
        }
        
        groups = groups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        
        if (typeof saveGroupsToLocalStorage === 'function') saveGroupsToLocalStorage();
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
        
        showNotification('Successfully left the group', 'success');
        
        const groupDetailsPanel = document.getElementById('groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
        
    } catch (error) {
        console.error('Error leaving group:', error);
        showNotification('Failed to leave group: ' + error.message, 'error');
    }
}

// Accept group invite
async function acceptGroupInvite(inviteData) {
    try {
        const inviteId = inviteData.id || inviteData.inviteId;
        const groupId = inviteData.groupId || inviteData.id;
        
        const response = await safeApiCall('post', `groups/invites/${inviteId}/accept`);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to accept invitation', 'error');
            return;
        }
        
        await joinGroupOnline(groupId);
        
    } catch (error) {
        console.error('Error accepting group invite:', error);
        showNotification('Failed to accept invitation: ' + error.message, 'error');
    }
}

// Decline group invite
async function declineGroupInvite(inviteData) {
    try {
        const inviteId = inviteData.id || inviteData.inviteId;
        
        const response = await safeApiCall('post', `groups/invites/${inviteId}/decline`);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to decline invitation', 'error');
            return;
        }
        
        groupInvites = groupInvites.filter(invite => invite.id !== inviteId);
        
        if (typeof saveGroupsToLocalStorage === 'function') saveGroupsToLocalStorage();
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
        
        showNotification('Invitation declined', 'success');
        
        const groupInviteModal = document.getElementById('groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {
        console.error('Error declining group invite:', error);
        showNotification('Failed to decline invitation: ' + error.message, 'error');
    }
}

// Leave group confirmation
function leaveGroupConfirm(groupData) {
    if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
        leaveGroupOnline(groupData.id);
    }
}

// Show group details
function showGroupDetails(groupData, type) {
    selectedGroup = groupData;
    
    const groupDetailsTitle = document.querySelector('.group-details-title');
    if (groupDetailsTitle) groupDetailsTitle.textContent = 'Group Details';
    
    const sidebar = document.getElementById('sidebar');
    const groupDetailsPanel = document.getElementById('groupDetailsPanel');
    
    if (isMobile) {
        if (sidebar) sidebar.style.display = 'none';
        if (groupDetailsPanel) {
            groupDetailsPanel.style.display = 'flex';
            groupDetailsPanel.classList.add('active');
        }
    } else {
        if (groupDetailsPanel) groupDetailsPanel.classList.add('active');
    }
    
    if (typeof loadGroupDetails === 'function') loadGroupDetails(groupData, type);
}

// Load group details
async function loadGroupDetails(groupData, type) {
    const detailsContent = document.getElementById('groupDetailsContent');
    if (!detailsContent) return;
    
    detailsContent.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i><p>Loading group details...</p></div>';
    
    try {
        const theme = groupData.theme || 'blue';
        const themeInfo = groupThemes[theme];
        const groupType = groupData.type || 'private';
        const typeInfo = groupTypes[groupType];
        
        const initials = groupData.name 
            ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'G';
        
        const userRole = groupData.isCreator ? 'creator' : 
                        groupData.isAdmin ? 'admin' : 'member';
        const roleInfo = groupRoles[userRole];
        
        const welcomeMessage = groupData.welcomeMessage || `Welcome to ${groupData.name}! We're glad to have you here.`;
        const rules = groupData.rules || [];
        
        const purpose = groupData.purpose || '';
        const mood = groupData.mood || '';
        const postingRule = groupData.postingRule || 'everyone';
        const purposeInfo = purpose ? groupPurposes[purpose] : null;
        const moodInfo = mood ? groupMoods[mood] : null;
        const ruleInfo = postingRules[postingRule];
        
        let realMembers = [];
        try {
            const response = await safeApiCall('get', `groups/${groupData.id}/members`);
            if (response && response.success && response.data) {
                realMembers = response.data.slice(0, 5);
            } else {
                if (typeof generateSimulatedMembers === 'function') {
                    realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
                }
            }
        } catch (error) {
            console.log('Error loading members:', error);
            if (typeof generateSimulatedMembers === 'function') {
                realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
            }
        }
        
        detailsContent.innerHTML = `
            <div class="group-profile-header">
                <div class="group-profile-avatar" ${groupData.photoURL ? `style="background-image: url('${groupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
                    ${groupData.photoURL ? '' : `<span style="color: white; font-size: 36px;">${initials}</span>`}
                    ${purposeInfo ? `<div class="group-purpose-badge-large" style="position: absolute; bottom: -10px; right: -10px; background: ${purposeInfo.color}; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;">${purposeInfo.icon}</div>` : ''}
                </div>
                <div class="group-profile-name">${groupData.name || 'Unnamed Group'}</div>
                ${purposeInfo ? `<div class="group-purpose-tag-large" style="margin: 5px 0; font-size: 14px; padding: 6px 12px; background: ${purposeInfo.color}20; color: ${purposeInfo.color}; border-radius: 20px;">${purposeInfo.icon} ${purposeInfo.name}</div>` : ''}
                <div class="group-profile-topic">${groupData.topic || 'No topic set'}</div>
                <div class="group-profile-type ${groupType}">
                    <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                </div>
                <div class="role-badge ${userRole}">
                    <i class="${roleInfo.icon}"></i> ${roleInfo.name}
                </div>
                ${moodInfo ? `<div class="group-mood-indicator mood-${mood}" style="margin: 10px auto; background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 8px 16px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                ${ruleInfo ? `<div class="posting-rules-banner rule-${postingRule.replace('_', '-')}" style="margin: 10px auto; background: ${ruleInfo.bgColor}; color: ${ruleInfo.color}; padding: 8px 16px; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
            </div>
            
            ${welcomeMessage ? `
            <div class="welcome-message">
                <div class="welcome-title">
                    <i class="fas fa-door-open"></i> Welcome!
                </div>
                <div>${welcomeMessage}</div>
            </div>
            ` : ''}
            
            ${groupData.description ? `
            <div class="group-info-section">
                <div class="info-section-title">
                    <i class="fas fa-info-circle"></i>
                    <span>About This Group</span>
                </div>
                <div style="padding: 10px 0;">${groupData.description}</div>
            </div>
            ` : ''}
            
            ${rules.length > 0 ? `
            <div class="rules-section">
                <div class="rules-title">
                    <i class="fas fa-gavel"></i>
                    <span>Group Rules</span>
                </div>
                <ul class="rules-list">
                    ${rules.map(rule => `<li><i class="fas fa-check-circle" style="color: var(--success-color);"></i> ${rule}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
            
            <div class="group-info-section">
                <div class="info-section-title">
                    <i class="fas fa-chart-bar"></i>
                    <span>Group Statistics</span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Members:</span>
                    <span class="info-value">${groupData.memberCount || 0}</span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Created:</span>
                    <span class="info-value">${formatDate(groupData.createdAt || new Date())}</span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Last Activity:</span>
                    <span class="info-value">${formatTimeAgo(groupData.lastActivity || groupData.createdAt || new Date())}</span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Group Theme:</span>
                    <span class="info-value">
                        <div class="theme-badge ${theme}">
                            <i class="fas fa-palette"></i>
                            ${themeInfo.name}
                        </div>
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Privacy:</span>
                    <span class="info-value">
                        <div class="type-display ${groupType}">
                            <i class="${typeInfo.icon}"></i>
                            ${typeInfo.name}
                        </div>
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Activity Pulse:</span>
                    <span class="info-value">
                        ${(() => {
                            const pulse = calculateGroupPulse(groupData);
                            return pulse ? `<div class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</div>` : '<span>Unknown</span>';
                        })()}
                    </span>
                </div>
            </div>
            
            <div class="group-info-section">
                <div class="info-section-title">
                    <i class="fas fa-users"></i>
                    <span>Members (${Math.min(groupData.memberCount || 0, 5)} shown)</span>
                </div>
                <div class="member-list">
                    ${realMembers.length > 0 ? 
                        realMembers.map((member, i) => `
                            <div class="member-item">
                                <div class="member-avatar" ${member.photoURL ? `style="background-image: url('${member.photoURL}')"` : 'style="background: var(--secondary-color)"'}>
                                    ${member.photoURL ? '' : `<span style="color: var(--text-primary); font-size: 14px;">${member.displayName ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U'}</span>`}
                                </div>
                                <div class="member-info">
                                    <div class="member-name">
                                        <span>${member.displayName || 'Unknown User'}</span>
                                        ${member.uid === (currentUser.uid || currentUser.id) ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                         groupData.admins && groupData.admins.includes(member.uid) ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                         '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">
                                        ${member.uid === (currentUser.uid || currentUser.id) ? 'You' : (member.online ? 'Online' : 'Offline')}
                                    </div>
                                </div>
                            </div>
                        `).join('') :
                        Array.from({length: Math.min(groupData.memberCount || 0, 5)}, (_, i) => `
                            <div class="member-item">
                                <div class="member-avatar" style="background: ${i === 0 ? themeInfo.gradient : 'var(--secondary-color)'}">
                                    <span style="color: ${i === 0 ? 'white' : 'var(--text-primary)'}; font-size: 14px;">${i === 0 ? 'Y' : 'M'}</span>
                                </div>
                                <div class="member-info">
                                    <div class="member-name">
                                        <span>${i === 0 ? 'You' : 'Member ' + (i+1)}</span>
                                        ${i === 0 ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                           i < 3 ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                           '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">
                                        ${i === 0 ? 'Online' : (i < 3 ? 'Recently active' : 'Member')}
                                    </div>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
                ${groupData.memberCount > 5 ? `
                    <div style="text-align: center; margin-top: 10px;">
                        <button class="action-btn secondary" id="viewAllMembersBtn" style="width: 100%;">
                            <i class="fas fa-users"></i> View All ${groupData.memberCount} Members
                        </button>
                    </div>
                ` : ''}
            </div>
            
            ${groupData.participationModes ? `
            <div class="group-info-section">
                <div class="info-section-title">
                    <i class="fas fa-user-secret"></i>
                    <span>Participation Modes</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
                    ${groupData.participationModes.readOnly ? `
                        <div class="participation-mode mode-read-only">
                            <i class="fas fa-eye"></i> Read Only
                        </div>
                    ` : ''}
                    ${groupData.participationModes.reactOnly ? `
                        <div class="participation-mode mode-react-only">
                            <i class="fas fa-thumbs-up"></i> React Only
                        </div>
                    ` : ''}
                    ${groupData.participationModes.anonymous ? `
                        <div class="participation-mode mode-anonymous">
                            <i class="fas fa-user-secret"></i> Anonymous
                        </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            <div class="action-buttons">
                <button class="action-btn success" id="openGroupChatBtn">
                    <i class="fas fa-comments"></i> Open Chat
                </button>
                
                ${type === 'my_group' || type === 'admin' ? `
                    <button class="action-btn primary" id="manageGroupBtn">
                        <i class="fas fa-cog"></i> Manage
                    </button>
                ` : ''}
                
                ${type === 'joined' ? `
                    <button class="action-btn danger" id="leaveGroupBtn">
                        <i class="fas fa-sign-out-alt"></i> Leave Group
                    </button>
                ` : ''}
                
                <button class="action-btn secondary" id="groupOptionsBtn">
                    <i class="fas fa-ellipsis-h"></i> Options
                </button>
            </div>
        `;
        
        const openGroupChatBtn = document.getElementById('openGroupChatBtn');
        const manageGroupBtn = document.getElementById('manageGroupBtn');
        const leaveGroupBtn = document.getElementById('leaveGroupBtn');
        const groupOptionsBtn = document.getElementById('groupOptionsBtn');
        const viewAllMembersBtn = document.getElementById('viewAllMembersBtn');
        
        if (openGroupChatBtn) {
            openGroupChatBtn.addEventListener('click', () => {
                if (typeof openGroupChat === 'function') openGroupChat(groupData);
            });
        }
        
        if (manageGroupBtn) {
            manageGroupBtn.addEventListener('click', () => {
                if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
            });
        }
        
        if (leaveGroupBtn) {
            leaveGroupBtn.addEventListener('click', () => {
                if (typeof leaveGroupConfirm === 'function') leaveGroupConfirm(groupData);
            });
        }
        
        if (groupOptionsBtn) {
            groupOptionsBtn.addEventListener('click', () => {
                if (typeof showGroupOptions === 'function') showGroupOptions(groupData);
            });
        }
        
        if (viewAllMembersBtn) {
            viewAllMembersBtn.addEventListener('click', () => {
                showNotification('Full member list would open here', 'info');
            });
        }
        
    } catch (error) {
        console.error('Error loading group details:', error);
        detailsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading group details</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

// Show group options
function showGroupOptions(groupData) {
    const options = [
        { icon: 'fas fa-share-alt', text: 'Share Group', action: () => shareGroup(groupData) },
        { icon: 'fas fa-bell', text: 'Mute Notifications', action: () => muteGroup(groupData) },
        { icon: 'fas fa-star', text: 'Add to Favorites', action: () => favoriteGroup(groupData) },
        { icon: 'fas fa-flag', text: 'Report Group', action: () => reportGroup(groupData) },
        { icon: 'fas fa-ban', text: 'Block Group', action: () => blockGroup(groupData) },
        { icon: 'fas fa-qrcode', text: 'Group QR Code', action: () => showGroupQRCode(groupData) },
        { icon: 'fas fa-link', text: 'Copy Invite Link', action: () => copyInviteLink(groupData) },
        { icon: 'fas fa-sticky-note', text: 'View Group Notes', action: () => viewGroupNotes(groupData) },
        { icon: 'fas fa-calendar-alt', text: 'View Events', action: () => viewGroupEvents(groupData) },
        { icon: 'fas fa-chart-line', text: 'View Analytics', action: () => viewGroupAnalytics(groupData) }
    ];
    
    if (groupData.isAdmin || groupData.isCreator) {
        options.unshift(
            { icon: 'fas fa-user-plus', text: 'Invite Members', action: () => inviteMembers(groupData) },
            { icon: 'fas fa-edit', text: 'Edit Group Info', action: () => editGroupInfo(groupData) },
            { icon: 'fas fa-user-shield', text: 'Manage Roles', action: () => manageRoles(groupData) },
            { icon: 'fas fa-calendar-plus', text: 'Create Event', action: () => createEvent(groupData) },
            { icon: 'fas fa-poll', text: 'Create Poll', action: () => createPoll(groupData) },
            { icon: 'fas fa-bullseye', text: 'Change Purpose/Mood', action: () => changePurposeMood(groupData) },
            { icon: 'fas fa-comment-slash', text: 'Update Posting Rules', action: () => updatePostingRules(groupData) },
            { icon: 'fas fa-history', text: 'View Change History', action: () => viewChangeHistory(groupData) }
        );
    }
    
    if (typeof showOptionsModal === 'function') {
        showOptionsModal('Group Options', options, groupData.name);
    }
}

// View group notes
function viewGroupNotes(groupData) {
    const groupNotesPanel = document.getElementById('groupNotesPanel');
    if (currentChatGroup && currentChatGroup.id === groupData.id) {
        if (groupNotesPanel) {
            groupNotesPanel.style.display = groupNotesPanel.style.display === 'none' ? 'block' : 'none';
        }
    } else {
        if (typeof openGroupChat === 'function') openGroupChat(groupData);
        setTimeout(() => {
            if (groupNotesPanel) groupNotesPanel.style.display = 'block';
        }, 100);
    }
}

// View group events
function viewGroupEvents(groupData) {
    const eventCountdownPanel = document.getElementById('eventCountdownPanel');
    if (currentChatGroup && currentChatGroup.id === groupData.id) {
        if (eventCountdownPanel) {
            eventCountdownPanel.style.display = eventCountdownPanel.style.display === 'none' ? 'block' : 'none';
        }
    } else {
        if (typeof openGroupChat === 'function') openGroupChat(groupData);
        setTimeout(() => {
            if (eventCountdownPanel) eventCountdownPanel.style.display = 'block';
        }, 100);
    }
}

// View group analytics
function viewGroupAnalytics(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
    const analyticsTab = document.querySelector('.admin-management-tab[data-tab="analytics"]');
    if (analyticsTab) {
        analyticsTab.click();
        if (typeof loadGroupAnalytics === 'function') loadGroupAnalytics(groupData);
    }
}

// Load group analytics
async function loadGroupAnalytics(groupData) {
    try {
        const analyticsDailyMessages = document.getElementById('analyticsDailyMessages');
        const analyticsActiveMembers = document.getElementById('analyticsActiveMembers');
        const analyticsEngagementRate = document.getElementById('analyticsEngagementRate');
        const groupPulseInsight = document.getElementById('groupPulseInsight');
        
        if (analyticsDailyMessages) {
            // Generate random but consistent data based on group ID
            const groupHash = hashCode(groupData.id);
            const dailyMessages = 20 + (groupHash % 30); // 20-50 messages
            analyticsDailyMessages.textContent = dailyMessages;
        }
        
        if (analyticsActiveMembers) {
            const activeMembers = Math.min(5 + (hashCode(groupData.id) % (groupData.memberCount || 10)), groupData.memberCount || 10);
            analyticsActiveMembers.textContent = activeMembers;
        }
        
        if (analyticsEngagementRate) {
            const engagementRate = 30 + (hashCode(groupData.id) % 50); // 30-80%
            analyticsEngagementRate.textContent = engagementRate + '%';
        }
        
        if (groupPulseInsight) {
            const pulse = calculateGroupPulse(groupData);
            let insight = '';
            
            if (pulse?.class === 'pulse-active') {
                insight = 'Group is highly active with good engagement. Consider scheduling regular events to maintain momentum.';
            } else if (pulse?.class === 'pulse-quiet') {
                insight = 'Group activity is low. Try posting discussion topics or scheduling events to boost engagement.';
            } else {
                insight = 'Group activity is steady. Monitor engagement and adjust content strategy as needed.';
            }
            
            groupPulseInsight.innerHTML = `<p style="margin: 0;">${insight}</p>`;
        }
        
        // Load chart if available
        const analyticsChart = document.getElementById('analyticsChart');
        if (analyticsChart && window.Chart) {
            if (typeof renderAnalyticsChart === 'function') {
                renderAnalyticsChart(analyticsChart, groupData);
            }
        }
        
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Render analytics chart
function renderAnalyticsChart(canvas, groupData) {
    const ctx = canvas.getContext('2d');
    const groupHash = hashCode(groupData.id);
    
    // Generate data based on group hash for consistency
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map((_, i) => 10 + (groupHash + i * 7) % 40);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Messages',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: true
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Change purpose/mood
function changePurposeMood(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
    const purposeTab = document.querySelector('.admin-management-tab[data-tab="purpose"]');
    if (purposeTab) {
        purposeTab.click();
    }
}

// Update posting rules
function updatePostingRules(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
    const purposeTab = document.querySelector('.admin-management-tab[data-tab="purpose"]');
    if (purposeTab) {
        purposeTab.click();
    }
}

// View change history
function viewChangeHistory(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
    const transparencyTab = document.querySelector('.admin-management-tab[data-tab="transparency"]');
    if (transparencyTab) {
        transparencyTab.click();
    }
}

// Show options modal
function showOptionsModal(title, options, subtitle = '') {
    const modal = document.createElement('div');
    modal.className = 'options-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; z-index: 1002; min-width: 300px; max-width: 90%; max-height: 80vh; overflow-y: auto;">
            <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
                <div style="font-weight: 600;">${title}</div>
                ${subtitle ? `<div style="font-size: 14px; color: var(--text-secondary); margin-top: 5px;">${subtitle}</div>` : ''}
            </div>
            <div>
                ${options.map(option => {
                    return `
                        <div style="padding: 15px 20px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; gap: 12px; transition: background 0.2s;"
                             onmouseover="this.style.backgroundColor='var(--secondary-color)'" onmouseout="this.style.backgroundColor='transparent'" onclick="document.querySelector('.options-modal').remove(); ${option.action.toString().replace(/"/g, '&quot;')}();">
                            <i class="${option.icon}" style="color: var(--primary-color); width: 20px;"></i>
                            <span>${option.text}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="padding: 15px 20px; text-align: center;">
                <button onclick="document.querySelector('.options-modal').remove();" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 8px 16px; border-radius: 8px;">Cancel</button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
}

// Share group
function shareGroup(groupData) {
    const shareUrl = `${window.location.origin}/group.html?id=${groupData.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: groupData.name,
            text: `Join ${groupData.name} on Knecta Chat`,
            url: shareUrl
        });
    } else {
        navigator.clipboard.writeText(shareUrl);
        showNotification('Group link copied to clipboard', 'success');
    }
}

// Mute group
function muteGroup(groupData) {
    const mutedGroups = JSON.parse(localStorage.getItem('knecta_muted_groups') || '[]');
    
    if (!mutedGroups.includes(groupData.id)) {
        mutedGroups.push(groupData.id);
        localStorage.setItem('knecta_muted_groups', JSON.stringify(mutedGroups));
        showNotification('Group notifications muted', 'success');
    } else {
        showNotification('Group already muted', 'info');
    }
}

// Favorite group
function favoriteGroup(groupData) {
    const favoriteGroups = JSON.parse(localStorage.getItem('knecta_favorite_groups') || '[]');
    
    if (!favoriteGroups.includes(groupData.id)) {
        favoriteGroups.push(groupData.id);
        localStorage.setItem('knecta_favorite_groups', JSON.stringify(favoriteGroups));
        showNotification('Group added to favorites', 'success');
    } else {
        showNotification('Group already in favorites', 'info');
    }
}

// Report group
function reportGroup(groupData) {
    const reason = prompt(`Why are you reporting "${groupData.name}"?\n1. Spam\n2. Harassment\n3. Inappropriate content\n4. Fake group\n5. Other\n\nEnter reason number:`, '1');
    
    if (reason) {
        const reports = JSON.parse(localStorage.getItem('knecta_group_reports') || '[]');
        reports.push({
            groupId: groupData.id,
            groupName: groupData.name,
            reason: reason,
            timestamp: Date.now()
        });
        localStorage.setItem('knecta_group_reports', JSON.stringify(reports));
        showNotification('Group has been reported. Thank you for helping keep our community safe.', 'success');
    }
}

// Block group
function blockGroup(groupData) {
    if (confirm(`Are you sure you want to block "${groupData.name}"? You will no longer see this group or receive notifications from it.`)) {
        const blockedGroups = JSON.parse(localStorage.getItem('knecta_blocked_groups') || '[]');
        blockedGroups.push({
            groupId: groupData.id,
            groupName: groupData.name,
            timestamp: Date.now()
        });
        localStorage.setItem('knecta_blocked_groups', JSON.stringify(blockedGroups));
        
        groups = groups.filter(g => g.id !== groupData.id);
        myGroups = myGroups.filter(g => g.id !== groupData.id);
        joinedGroups = joinedGroups.filter(g => g.id !== groupData.id);
        adminGroups = adminGroups.filter(g => g.id !== groupData.id);
        
        if (typeof saveGroupsToLocalStorage === 'function') saveGroupsToLocalStorage();
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
        
        showNotification('Group blocked successfully', 'success');
        
        const groupDetailsPanel = document.getElementById('groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
    }
}

// Show group QR code
function showGroupQRCode(groupData) {
    const modal = document.createElement('div');
    modal.className = 'qr-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001; display: flex; align-items: center; justify-content: center;';
    
    const inviteLink = `${window.location.origin}/group.html?join=${groupData.id}`;
    
    modal.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; z-index: 1002; padding: 30px; text-align: center; min-width: 300px; max-width: 90%;">
            <h3 style="margin-top: 0;">${groupData.name} QR Code</h3>
            <div id="qrCodeContainer" style="margin: 20px auto; width: 200px; height: 200px;"></div>
            <p style="font-size: 14px; color: var(--text-secondary); margin: 20px 0;">Scan to join group</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="downloadQRCode()" style="background: var(--primary-color); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Download</button>
                <button onclick="document.querySelector('.qr-modal').remove();" style="background: var(--secondary-color); color: var(--text-primary); border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
    
    // Generate QR code
    setTimeout(() => {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (qrContainer && window.QRCode) {
            new QRCode(qrContainer, {
                text: inviteLink,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }, 100);
}

// Download QR code
window.downloadQRCode = function() {
    const qrCanvas = document.querySelector('#qrCodeContainer canvas');
    if (qrCanvas) {
        const link = document.createElement('a');
        link.download = 'group-qr-code.png';
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
        showNotification('QR code downloaded', 'success');
    }
};

// Copy invite link
function copyInviteLink(groupData) {
    const inviteLink = `${window.location.origin}/group.html?join=${groupData.id}`;
    navigator.clipboard.writeText(inviteLink);
    showNotification('Invite link copied to clipboard', 'success');
}

// Invite members
function inviteMembers(groupData) {
    if (typeof showFriendSelection === 'function') showFriendSelection();
}

// Edit group info
function editGroupInfo(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
}

// Manage roles
function manageRoles(groupData) {
    if (typeof openAdminManagement === 'function') openAdminManagement(groupData);
}

// Create event
function createEvent(groupData) {
    const modal = document.createElement('div');
    modal.className = 'event-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; z-index: 1002; padding: 30px; min-width: 400px; max-width: 90%; max-height: 90vh; overflow-y: auto;">
            <h3 style="margin-top: 0;">Create Event for ${groupData.name}</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Event Title *</label>
                <input type="text" id="eventTitle" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Enter event title">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Description</label>
                <textarea id="eventDescription" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; min-height: 80px;" placeholder="Describe your event"></textarea>
            </div>
            
            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Date *</label>
                    <input type="date" id="eventDate" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Time *</label>
                    <input type="time" id="eventTime" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Duration (hours)</label>
                <input type="number" id="eventDuration" min="0.5" max="24" step="0.5" value="1" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Event Type</label>
                <select id="eventType" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
                    <option value="meeting">Meeting</option>
                    <option value="social">Social</option>
                    <option value="workshop">Workshop</option>
                    <option value="celebration">Celebration</option>
                    <option value="other">Other</option>
                </select>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="saveNewEvent()" style="background: var(--success-color); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Create Event</button>
                <button onclick="document.querySelector('.event-modal').remove();" style="background: var(--secondary-color); color: var(--text-primary); border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toISOString().split('T')[0];
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
    
    // Set default values after DOM is ready
    setTimeout(() => {
        const eventDateInput = document.getElementById('eventDate');
        const eventTimeInput = document.getElementById('eventTime');
        if (eventDateInput) eventDateInput.value = formattedDate;
        if (eventTimeInput) eventTimeInput.value = '18:00';
    }, 100);
}

// Save new event
window.saveNewEvent = function() {
    const eventTitle = document.getElementById('eventTitle');
    const eventDate = document.getElementById('eventDate');
    const eventTime = document.getElementById('eventTime');
    
    if (!eventTitle || !eventTitle.value.trim()) {
        showNotification('Please enter an event title', 'error');
        return;
    }
    
    if (!eventDate || !eventDate.value) {
        showNotification('Please select a date', 'error');
        return;
    }
    
    if (!eventTime || !eventTime.value) {
        showNotification('Please select a time', 'error');
        return;
    }
    
    const eventDateTime = new Date(`${eventDate.value}T${eventTime.value}`);
    const eventDescription = document.getElementById('eventDescription')?.value || '';
    const eventDuration = document.getElementById('eventDuration')?.value || '1';
    const eventType = document.getElementById('eventType')?.value || 'meeting';
    
    // Save event to local storage
    const event = {
        id: `event_${currentChatGroup?.id || 'global'}_${Date.now()}`,
        groupId: currentChatGroup?.id || 'global',
        title: eventTitle.value.trim(),
        description: eventDescription,
        date: eventDateTime.toISOString(),
        duration: parseFloat(eventDuration),
        type: eventType,
        createdBy: currentUser?.uid || currentUser?.id || 'user',
        attendees: [currentUser?.uid || currentUser?.id || 'user'],
        location: 'Online',
        createdAt: new Date().toISOString()
    };
    
    const cacheKey = LOCAL_STORAGE_KEYS.GROUP_EVENTS + (currentChatGroup?.id || 'global');
    const cachedEvents = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    cachedEvents.push(event);
    localStorage.setItem(cacheKey, JSON.stringify(cachedEvents));
    
    // Close modal
    const modal = document.querySelector('.event-modal');
    if (modal) modal.remove();
    
    showNotification('Event created successfully!', 'success');
    
    // Reload events if in group chat
    if (currentChatGroup && typeof loadGroupEvents === 'function') {
        loadGroupEvents(currentChatGroup.id);
    }
};

// Create poll
function createPoll(groupData) {
    const modal = document.createElement('div');
    modal.className = 'poll-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; z-index: 1002; padding: 30px; min-width: 400px; max-width: 90%; max-height: 90vh; overflow-y: auto;">
            <h3 style="margin-top: 0;">Create Poll for ${groupData.name}</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Poll Question *</label>
                <input type="text" id="pollQuestion" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="What would you like to ask?">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Options (2-10) *</label>
                <div id="pollOptions">
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <input type="text" class="poll-option" style="flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Option 1">
                        <button onclick="removePollOption(this)" style="background: var(--danger-color); color: white; border: none; border-radius: 6px; width: 40px; cursor: pointer; display: none;">×</button>
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <input type="text" class="poll-option" style="flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Option 2">
                        <button onclick="removePollOption(this)" style="background: var(--danger-color); color: white; border: none; border-radius: 6px; width: 40px; cursor: pointer; display: none;">×</button>
                    </div>
                </div>
                <button onclick="addPollOption()" style="background: var(--secondary-color); color: var(--text-primary); border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; margin-top: 10px;">+ Add Option</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Duration</label>
                <select id="pollDuration" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;">
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24" selected>24 hours</option>
                    <option value="168">7 days</option>
                    <option value="0">No limit</option>
                </select>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="allowMultipleVotes">
                    <span>Allow multiple votes</span>
                </label>
                <label style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                    <input type="checkbox" id="anonymousPoll" checked>
                    <span>Anonymous voting</span>
                </label>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="saveNewPoll()" style="background: var(--success-color); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Create Poll</button>
                <button onclick="document.querySelector('.poll-modal').remove();" style="background: var(--secondary-color); color: var(--text-primary); border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
}

// Add poll option
window.addPollOption = function() {
    const pollOptions = document.getElementById('pollOptions');
    if (!pollOptions) return;
    
    const optionCount = pollOptions.querySelectorAll('.poll-option').length;
    if (optionCount >= 10) {
        showNotification('Maximum 10 options allowed', 'error');
        return;
    }
    
    const newOption = document.createElement('div');
    newOption.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px;';
    newOption.innerHTML = `
        <input type="text" class="poll-option" style="flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px;" placeholder="Option ${optionCount + 1}">
        <button onclick="removePollOption(this)" style="background: var(--danger-color); color: white; border: none; border-radius: 6px; width: 40px; cursor: pointer;">×</button>
    `;
    
    pollOptions.appendChild(newOption);
};

// Remove poll option
window.removePollOption = function(button) {
    const optionDiv = button.parentElement;
    if (optionDiv && optionDiv.parentElement) {
        const optionCount = optionDiv.parentElement.querySelectorAll('.poll-option').length;
        if (optionCount > 2) {
            optionDiv.remove();
        } else {
            showNotification('Minimum 2 options required', 'error');
        }
    }
};

// Save new poll
window.saveNewPoll = function() {
    const pollQuestion = document.getElementById('pollQuestion');
    const pollOptions = document.querySelectorAll('.poll-option');
    
    if (!pollQuestion || !pollQuestion.value.trim()) {
        showNotification('Please enter a poll question', 'error');
        return;
    }
    
    const options = Array.from(pollOptions)
        .map(input => input.value.trim())
        .filter(value => value.length > 0);
    
    if (options.length < 2) {
        showNotification('Please enter at least 2 options', 'error');
        return;
    }
    
    const pollDuration = document.getElementById('pollDuration')?.value || '24';
    const allowMultipleVotes = document.getElementById('allowMultipleVotes')?.checked || false;
    const anonymousPoll = document.getElementById('anonymousPoll')?.checked || true;
    
    // Create poll message
    const pollMessage = {
        groupId: currentChatGroup?.id || 'global',
        senderId: currentUser?.uid || currentUser?.id || 'user',
        senderName: userData?.displayName || 'User',
        content: pollQuestion.value.trim(),
        timestamp: new Date(),
        type: 'poll',
        pollData: {
            options: options.map((opt, i) => ({ id: i, text: opt, votes: 0 })),
            duration: parseInt(pollDuration),
            allowMultipleVotes: allowMultipleVotes,
            anonymous: anonymousPoll,
            voters: [],
            endTime: pollDuration === '0' ? null : new Date(Date.now() + parseInt(pollDuration) * 60 * 60 * 1000)
        }
    };
    
    // Send poll as message
    if (currentChatGroup) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            const pollElement = document.createElement('div');
            pollElement.className = 'message sent poll';
            pollElement.innerHTML = `
                <div class="message-sender">You</div>
                <div class="message-content" style="background: var(--secondary-color); padding: 15px; border-radius: 10px;">
                    <div style="font-weight: 600; margin-bottom: 10px;">📊 ${pollQuestion.value.trim()}</div>
                    <div id="pollOptionsContainer" style="margin-bottom: 10px;">
                        ${options.map((opt, i) => `
                            <div style="margin-bottom: 8px;">
                                <button onclick="voteOnPoll(${i}, this)" style="width: 100%; text-align: left; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: white; cursor: pointer;">
                                    ${opt} <span style="float: right; color: var(--text-secondary); font-size: 12px;">0 votes</span>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${pollDuration === '0' ? 'No time limit' : `Ends in ${pollDuration} hour${pollDuration === '1' ? '' : 's'}`} • ${anonymousPoll ? 'Anonymous' : 'Public'} voting
                    </div>
                </div>
                <div class="message-time">${formatMessageTime(new Date())}</div>
            `;
            chatMessages.appendChild(pollElement);
            
            // Scroll to bottom
            const chatMessagesContainer = document.getElementById('chatMessagesContainer');
            if (chatMessagesContainer) {
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }
        }
    }
    
    // Close modal
    const modal = document.querySelector('.poll-modal');
    if (modal) modal.remove();
    
    showNotification('Poll created successfully!', 'success');
};

// Vote on poll
window.voteOnPoll = function(optionId, button) {
    const optionDiv = button.parentElement;
    const votesSpan = button.querySelector('span');
    
    if (votesSpan) {
        const currentVotes = parseInt(votesSpan.textContent) || 0;
        votesSpan.textContent = `${currentVotes + 1} votes`;
        votesSpan.style.color = 'var(--success-color)';
        button.style.borderColor = 'var(--success-color)';
        button.style.backgroundColor = 'var(--success-color)10';
        
        showNotification('Vote recorded!', 'success');
    }
};

// Show group invite details
function showGroupInviteDetails(inviteData) {
    const groupData = inviteData.groupData || inviteData;
    
    const inviteName = document.getElementById('inviteName');
    const inviteTopic = document.getElementById('inviteTopic');
    const inviteMemberCount = document.getElementById('inviteMemberCount');
    const invitedBy = document.getElementById('invitedBy');
    const invitePurpose = document.getElementById('invitePurpose');
    const inviteMood = document.getElementById('inviteMood');
    const avatar = document.getElementById('inviteAvatar');
    
    if (inviteName) inviteName.textContent = groupData.name || 'Unnamed Group';
    if (inviteTopic) inviteTopic.textContent = groupData.topic || 'No topic';
    if (inviteMemberCount) inviteMemberCount.innerHTML = `<i class="fas fa-users"></i> ${groupData.memberCount || 0} members`;
    if (invitedBy) invitedBy.textContent = inviteData.invitedByName || 'Unknown';
    
    const purpose = groupData.purpose || '';
    const mood = groupData.mood || '';
    const purposeInfo = purpose ? groupPurposes[purpose] : null;
    const moodInfo = mood ? groupMoods[mood] : null;
    
    if (purposeInfo && invitePurpose) {
        invitePurpose.textContent = `${purposeInfo.icon} ${purposeInfo.name}`;
        invitePurpose.style.backgroundColor = purposeInfo.color + '20';
        invitePurpose.style.color = purposeInfo.color;
        invitePurpose.style.display = 'inline-block';
    } else if (invitePurpose) {
        invitePurpose.style.display = 'none';
    }
    
    if (moodInfo && inviteMood) {
        inviteMood.innerHTML = `${moodInfo.icon} ${moodInfo.name}`;
        inviteMood.className = `group-mood-indicator mood-${mood}`;
        inviteMood.style.backgroundColor = moodInfo.bgColor;
        inviteMood.style.color = moodInfo.color;
        inviteMood.style.display = 'flex';
    } else if (inviteMood) {
        inviteMood.style.display = 'none';
    }
    
    if (avatar) {
        if (groupData.photoURL) {
            avatar.style.backgroundImage = `url('${groupData.photoURL}')`;
            avatar.innerHTML = '';
        } else {
            const initials = groupData.name 
                ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                : 'G';
            avatar.innerHTML = `<span style="color: white; font-size: 24px;">${initials}</span>`;
        }
    }
    
    window.currentInvite = inviteData;
    
    const groupInviteModal = document.getElementById('groupInviteModal');
    if (groupInviteModal) {
        groupInviteModal.classList.add('active');
    }
}

// Check filters
function matchesFilters(groupData) {
    if (currentTypeFilter !== 'all' && groupData.type !== currentTypeFilter) {
        return false;
    }
    
    if (currentSearchTerm && !matchesSearch(groupData, currentSearchTerm)) {
        return false;
    }
    
    return true;
}

// Check search
function matchesSearch(groupData, searchTerm) {
    if (!searchTerm) return true;
    
    const searchIn = [
        groupData.name || '',
        groupData.topic || '',
        groupData.description || '',
        groupData.purpose ? groupPurposes[groupData.purpose]?.name || '' : ''
    ].join(' ').toLowerCase();
    
    return searchIn.includes(searchTerm.toLowerCase());
}

// Filter groups by type
function filterGroupsByType(type) {
    currentTypeFilter = type;
    if (typeof updateCurrentSection === 'function') updateCurrentSection();
    
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.type-filter-btn[data-type="${type}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

// Search groups
function searchGroups(searchTerm) {
    currentSearchTerm = searchTerm.toLowerCase().trim();
    if (typeof updateCurrentSection === 'function') updateCurrentSection();
}

// Save groups to local storage
function saveGroupsToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.MY_GROUPS, JSON.stringify(myGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS, JSON.stringify(joinedGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_INVITES, JSON.stringify(groupInvites));
        localStorage.setItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS, JSON.stringify(adminGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_ACTIONS, JSON.stringify(pendingGroupActions));
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_CACHE_TIME, Date.now().toString());
        console.log('Groups saved to local storage');
    } catch (error) {
        console.error('Error saving groups to local storage:', error);
    }
}

// Format time ago
function formatTimeAgo(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now - dateObj;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
}

// Format date
function formatDate(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notificationText = document.getElementById('notificationText');
    const notification = document.getElementById('notification');
    
    if (!notificationText || !notification) return;
    
    notificationText.textContent = message;
    
    notification.className = 'notification';
    notification.classList.add(type);
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

// Process pending offline actions
function processPendingOfflineActions() {
    try {
        const pendingActions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_ACTIONS) || '[]');
        if (pendingActions.length > 0) {
            console.log('Processing pending group actions...');
        }
    } catch (error) {
        console.error('Error processing pending offline actions:', error);
    }
}

// Update create group posting rules UI
function updateCreateGroupPostingRulesUI() {
    const postingRulesSelect = document.getElementById('postingRulesSelect');
    const quietHoursSection = document.getElementById('quietHoursSection');
    const scheduledPostingSection = document.getElementById('scheduledPostingSection');
    
    if (!postingRulesSelect) return;
    
    const mode = postingRulesSelect.value;
    if (quietHoursSection) {
        quietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
    }
    if (scheduledPostingSection) {
        scheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Category tabs
    const allTab = document.getElementById('allTab');
    const myGroupsTab = document.getElementById('myGroupsTab');
    const joinedTab = document.getElementById('joinedTab');
    const invitesTab = document.getElementById('invitesTab');
    const adminTab = document.getElementById('adminTab');
    
    const allGroupsSection = document.getElementById('allGroupsSection');
    const myGroupsSection = document.getElementById('myGroupsSection');
    const joinedSection = document.getElementById('joinedSection');
    const invitesSection = document.getElementById('invitesSection');
    const adminSection = document.getElementById('adminSection');
    
    if (allTab) {
        allTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (allGroupsSection) allGroupsSection.classList.add('active');
            if (typeof updateCurrentSection === 'function') updateCurrentSection();
        });
    }
    
    if (myGroupsTab) {
        myGroupsTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (myGroupsSection) myGroupsSection.classList.add('active');
            if (typeof updateCurrentSection === 'function') updateCurrentSection();
        });
    }
    
    if (joinedTab) {
        joinedTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (joinedSection) joinedSection.classList.add('active');
            if (typeof updateCurrentSection === 'function') updateCurrentSection();
        });
    }
    
    if (invitesTab) {
        invitesTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (invitesSection) invitesSection.classList.add('active');
            if (typeof updateCurrentSection === 'function') updateCurrentSection();
        });
    }
    
    if (adminTab) {
        adminTab.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.groups-section').forEach(section => section.classList.remove('active'));
            if (adminSection) adminSection.classList.add('active');
            if (typeof updateCurrentSection === 'function') updateCurrentSection();
        });
    }
    
    // Type filter buttons
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            if (typeof filterGroupsByType === 'function') filterGroupsByType(type);
        });
    });
    
    // Search input
    const groupSearch = document.getElementById('groupSearch');
    if (groupSearch) {
        groupSearch.addEventListener('input', function() {
            if (typeof searchGroups === 'function') searchGroups(this.value);
        });
    }
    
    // Create group button
    const createGroupBtn = document.getElementById('createGroupBtn');
    const createGroupModal = document.getElementById('createGroupModal');
    
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            if (createGroupModal) {
                createGroupModal.classList.add('active');
                const basicTab = document.querySelector('.create-group-tab[data-tab="basic"]');
                if (basicTab) basicTab.click();
                
                // Reset form
                const groupNameInput = document.getElementById('groupNameInput');
                const groupDescriptionInput = document.getElementById('groupDescriptionInput');
                const groupTopicInput = document.getElementById('groupTopicInput');
                const groupTypeSelect = document.getElementById('groupTypeSelect');
                const welcomeMessageInput = document.getElementById('welcomeMessageInput');
                const groupRulesInput = document.getElementById('groupRulesInput');
                const approveNewMembers = document.getElementById('approveNewMembers');
                const onlyAdminsCanPost = document.getElementById('onlyAdminsCanPost');
                const allowMediaSharing = document.getElementById('allowMediaSharing');
                const enableDisappearingMessages = document.getElementById('enableDisappearingMessages');
                const groupPurposeSelect = document.getElementById('groupPurposeSelect');
                const postingRulesSelect = document.getElementById('postingRulesSelect');
                const enableReadOnlyMode = document.getElementById('enableReadOnlyMode');
                const enableReactOnlyMode = document.getElementById('enableReactOnlyMode');
                const enableAnonymousMode = document.getElementById('enableAnonymousMode');
                
                if (groupNameInput) groupNameInput.value = '';
                if (groupDescriptionInput) groupDescriptionInput.value = '';
                if (groupTopicInput) groupTopicInput.value = '';
                if (groupTypeSelect) groupTypeSelect.value = 'private';
                if (welcomeMessageInput) welcomeMessageInput.value = '';
                if (groupRulesInput) groupRulesInput.value = '1. Be respectful to all members\n2. No spam or self-promotion\n3. Keep discussions relevant to the group topic\n4. No hate speech or harassment';
                if (approveNewMembers) approveNewMembers.checked = true;
                if (onlyAdminsCanPost) onlyAdminsCanPost.checked = false;
                if (allowMediaSharing) allowMediaSharing.checked = true;
                if (enableDisappearingMessages) enableDisappearingMessages.checked = false;
                if (groupPurposeSelect) groupPurposeSelect.value = '';
                if (postingRulesSelect) postingRulesSelect.value = 'everyone';
                if (enableReadOnlyMode) enableReadOnlyMode.checked = false;
                if (enableReactOnlyMode) enableReactOnlyMode.checked = false;
                if (enableAnonymousMode) enableAnonymousMode.checked = false;
                
                // Reset theme selection
                document.querySelectorAll('.theme-option').forEach(option => {
                    const icon = option.querySelector('i');
                    if (icon) icon.style.display = 'none';
                });
                const blueThemeOption = document.querySelector('.theme-option[data-theme="blue"]');
                if (blueThemeOption) {
                    const icon = blueThemeOption.querySelector('i');
                    if (icon) icon.style.display = 'inline';
                }
                
                // Reset mood selection
                document.querySelectorAll('.mood-option').forEach(option => {
                    const icon = option.querySelector('i');
                    if (icon) icon.style.display = 'none';
                });
                const calmMoodOption = document.querySelector('.mood-option[data-mood="calm"]');
                if (calmMoodOption) {
                    const icon = calmMoodOption.querySelector('i');
                    if (icon) icon.style.display = 'inline';
                }
                
                // Reset reactions
                document.querySelectorAll('.reaction-option').forEach(option => {
                    option.style.borderColor = 'var(--border-color)';
                });
                
                // Reset badges
                document.querySelectorAll('.badge-option').forEach(option => {
                    option.style.borderColor = 'var(--border-color)';
                });
                const starBadge = document.querySelector('.badge-option[data-badge="star"]');
                if (starBadge) starBadge.style.borderColor = 'var(--primary-color)';
                const fireBadge = document.querySelector('.badge-option[data-badge="fire"]');
                if (fireBadge) fireBadge.style.borderColor = 'var(--primary-color)';
                
                selectedFriends = [];
                if (typeof updateSelectedFriendsList === 'function') updateSelectedFriendsList();
            }
        });
    }
    
    // Quick action buttons
    const discoverGroupsBtn = document.getElementById('discoverGroupsBtn');
    if (discoverGroupsBtn) {
        discoverGroupsBtn.addEventListener('click', () => {
            showNotification('Group discovery feature would open here', 'info');
        });
    }
    
    const groupInvitesBtn = document.getElementById('groupInvitesBtn');
    if (groupInvitesBtn) {
        groupInvitesBtn.addEventListener('click', () => {
            if (typeof showMobileSection === 'function') showMobileSection('invites');
        });
    }
    
    const groupEventsBtn = document.getElementById('groupEventsBtn');
    if (groupEventsBtn) {
        groupEventsBtn.addEventListener('click', () => {
            showNotification('Group events feature would open here', 'info');
        });
    }
    
    // Create group modal tabs
    document.querySelectorAll('.create-group-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.create-group-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.create-group-tab-content').forEach(content => content.classList.remove('active'));
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) tabContent.classList.add('active');
            
            if (tabName === 'purpose') {
                if (typeof updateCreateGroupPostingRulesUI === 'function') {
                    updateCreateGroupPostingRulesUI();
                }
            }
        });
    });
    
    // Posting rules change listener
    const postingRulesSelect = document.getElementById('postingRulesSelect');
    if (postingRulesSelect) {
        postingRulesSelect.addEventListener('change', updateCreateGroupPostingRulesUI);
    }
    
    // Theme selection
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', function() {
            const theme = this.dataset.theme;
            document.querySelectorAll('.theme-option').forEach(opt => {
                const icon = opt.querySelector('i');
                if (icon) icon.style.display = 'none';
            });
            
            const icon = this.querySelector('i');
            if (icon) icon.style.display = 'inline';
        });
    });
    
    // Mood selection
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            const mood = this.dataset.mood;
            document.querySelectorAll('.mood-option').forEach(opt => {
                const icon = opt.querySelector('i');
                if (icon) icon.style.display = 'none';
            });
            
            const icon = this.querySelector('i');
            if (icon) icon.style.display = 'inline';
        });
    });
    
    // Reaction selection
    document.querySelectorAll('.reaction-option').forEach(option => {
        option.addEventListener('click', function() {
            const reaction = this.dataset.reaction;
            if (this.style.borderColor === 'var(--primary-color)') {
                this.style.borderColor = 'var(--border-color)';
            } else {
                this.style.borderColor = 'var(--primary-color)';
            }
        });
    });
    
    // Badge selection
    document.querySelectorAll('.badge-option').forEach(option => {
        option.addEventListener('click', function() {
            const badge = this.dataset.badge;
            if (this.style.borderColor === 'var(--primary-color)') {
                this.style.borderColor = 'var(--border-color)';
            } else {
                this.style.borderColor = 'var(--primary-color)';
            }
        });
    });
    
    // Create group button in modal
    const createGroupBtnModal = document.getElementById('createGroupBtnModal');
    if (createGroupBtnModal) {
        createGroupBtnModal.addEventListener('click', async () => {
            const groupNameInput = document.getElementById('groupNameInput');
            const groupPurposeSelect = document.getElementById('groupPurposeSelect');
            
            if (!groupNameInput || !groupNameInput.value.trim()) {
                showNotification('Please enter a group name', 'error');
                return;
            }
            
            if (groupPurposeSelect && !groupPurposeSelect.value) {
                showNotification('Please select a group purpose', 'error');
                return;
            }
            
            const selectedTheme = document.querySelector('.theme-option i[style*="display: inline"]')?.parentNode?.dataset.theme || 'blue';
            const selectedMood = document.querySelector('.mood-option i[style*="display: inline"]')?.parentNode?.dataset.mood || 'calm';
            const selectedReactions = Array.from(document.querySelectorAll('.reaction-option[style*="border-color: var(--primary-color)"]')).map(el => el.dataset.reaction);
            const selectedBadges = Array.from(document.querySelectorAll('.badge-option[style*="border-color: var(--primary-color)"]')).map(el => el.dataset.badge);
            
            const postingRule = document.getElementById('postingRulesSelect')?.value || 'everyone';
            let quietHours = {};
            let scheduledPosting = {};
            
            if (postingRule === 'quiet_hours') {
                const quietStartTime = document.getElementById('quietStartTime');
                const quietEndTime = document.getElementById('quietEndTime');
                if (quietStartTime && quietEndTime) {
                    quietHours = {
                        start: quietStartTime.value,
                        end: quietEndTime.value
                    };
                }
            } else if (postingRule === 'scheduled') {
                const postingStartTime = document.getElementById('postingStartTime');
                const postingEndTime = document.getElementById('postingEndTime');
                if (postingStartTime && postingEndTime) {
                    scheduledPosting = {
                        start: postingStartTime.value,
                        end: postingEndTime.value
                    };
                }
            }
            
            const groupData = {
                name: groupNameInput.value.trim(),
                description: document.getElementById('groupDescriptionInput')?.value.trim() || '',
                topic: document.getElementById('groupTopicInput')?.value.trim() || '',
                privacy: document.getElementById('groupTypeSelect')?.value || 'private',
                theme: selectedTheme,
                mood: selectedMood,
                postingRule: postingRule,
                quietHours: quietHours,
                scheduledPosting: scheduledPosting
            };
            
            if (typeof createGroupOnline === 'function') {
                await createGroupOnline(groupData);
            }
        });
    }
    
    // Chat functionality
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');
    const chatCallBtn = document.getElementById('chatCallBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendGroupMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGroupMessage();
            }
        });
        
        chatInput.addEventListener('input', adjustTextareaHeight);
    }
    
    if (chatCallBtn) {
        chatCallBtn.addEventListener('click', startGroupCall);
    }
    
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', closeGroupChatMobile);
    }
    
    // Silent mode button
    const silentModeBtn = document.getElementById('silentModeBtn');
    if (silentModeBtn) {
        silentModeBtn.addEventListener('click', toggleSilentMode);
    }
    
    // Anonymous mode button
    const anonymousModeBtn = document.getElementById('anonymousModeBtn');
    if (anonymousModeBtn) {
        anonymousModeBtn.addEventListener('click', toggleAnonymousMode);
    }
    
    // Edit notes button
    const editNotesBtn = document.getElementById('editNotesBtn');
    const groupNotesContent = document.getElementById('groupNotesContent');
    const groupNotesEditor = document.getElementById('groupNotesEditor');
    const notesEditorActions = document.getElementById('notesEditorActions');
    const saveNotesBtn = document.getElementById('saveNotesBtn');
    const cancelNotesEditBtn = document.getElementById('cancelNotesEditBtn');
    
    if (editNotesBtn) {
        editNotesBtn.addEventListener('click', () => {
            groupNotesEditor.value = groupNotesContent.textContent;
            groupNotesContent.style.display = 'none';
            groupNotesEditor.style.display = 'block';
            notesEditorActions.style.display = 'block';
        });
    }
    
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', async () => {
            const notes = groupNotesEditor.value;
            groupNotesContent.innerHTML = notes;
            groupNotesEditor.style.display = 'none';
            groupNotesContent.style.display = 'block';
            notesEditorActions.style.display = 'none';
            
            if (currentChatGroup) {
                const response = await safeApiCall('post', `groups/${currentChatGroup.id}/notes`, { notes });
                if (response && response.success) {
                    showNotification('Notes saved successfully', 'success');
                }
            }
        });
    }
    
    if (cancelNotesEditBtn) {
        cancelNotesEditBtn.addEventListener('click', () => {
            groupNotesEditor.style.display = 'none';
            groupNotesContent.style.display = 'block';
            notesEditorActions.style.display = 'none';
        });
    }
    
    // Add event button
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => {
            if (typeof createEvent === 'function') createEvent(currentChatGroup);
        });
    }
    
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const groupDetailsPanel = document.getElementById('groupDetailsPanel');
            
            if (isMobile) {
                if (sidebar) sidebar.style.display = 'flex';
                if (groupDetailsPanel) {
                    groupDetailsPanel.style.display = 'none';
                    groupDetailsPanel.classList.remove('active');
                }
            } else {
                if (groupDetailsPanel) groupDetailsPanel.classList.remove('active');
            }
            selectedGroup = null;
        });
    }
    
    // Close create group modal
    const closeCreateGroupModal = document.getElementById('closeCreateGroupModal');
    if (closeCreateGroupModal) {
        closeCreateGroupModal.addEventListener('click', () => {
            if (createGroupModal) createGroupModal.classList.remove('active');
        });
    }
    
    // Cancel create group button
    const cancelCreateGroupBtn = document.getElementById('cancelCreateGroupBtn');
    if (cancelCreateGroupBtn) {
        cancelCreateGroupBtn.addEventListener('click', () => {
            if (createGroupModal) createGroupModal.classList.remove('active');
        });
    }
    
    // Close admin management
    const closeAdminManagementBtn = document.getElementById('closeAdminManagementBtn');
    if (closeAdminManagementBtn) {
        closeAdminManagementBtn.addEventListener('click', () => {
            const adminManagementModal = document.getElementById('adminManagementModal');
            if (adminManagementModal) adminManagementModal.classList.remove('active');
        });
    }
    
    // Save admin settings
    const saveAdminSettingsBtn = document.getElementById('saveAdminSettingsBtn');
    if (saveAdminSettingsBtn) {
        saveAdminSettingsBtn.addEventListener('click', () => {
            if (selectedGroup && typeof saveGroupSettings === 'function') {
                saveGroupSettings(selectedGroup);
            }
        });
    }
    
    // Admin posting mode change
    const adminPostingMode = document.getElementById('adminPostingMode');
    if (adminPostingMode) {
        adminPostingMode.addEventListener('change', updatePostingRulesUI);
    }
    
    // Admin mood selection
    document.querySelectorAll('.mood-select-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.mood-select-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderWidth = '1px';
            });
            this.classList.add('active');
            this.style.borderWidth = '2px';
        });
    });
    
    // Cancel friend selection
    const cancelFriendSelectionBtn = document.getElementById('cancelFriendSelectionBtn');
    if (cancelFriendSelectionBtn) {
        cancelFriendSelectionBtn.addEventListener('click', () => {
            const friendSelectionModal = document.getElementById('friendSelectionModal');
            if (friendSelectionModal) friendSelectionModal.classList.remove('active');
        });
    }
    
    // Confirm friend selection
    const confirmFriendSelectionBtn = document.getElementById('confirmFriendSelectionBtn');
    if (confirmFriendSelectionBtn) {
        confirmFriendSelectionBtn.addEventListener('click', () => {
            showNotification(`Selected ${selectedFriends.length} friends`, 'success');
            const friendSelectionModal = document.getElementById('friendSelectionModal');
            if (friendSelectionModal) friendSelectionModal.classList.remove('active');
        });
    }
    
    // Accept invite button
    const acceptInviteBtn = document.getElementById('acceptInviteBtn');
    if (acceptInviteBtn) {
        acceptInviteBtn.addEventListener('click', () => {
            if (window.currentInvite && typeof acceptGroupInvite === 'function') {
                acceptGroupInvite(window.currentInvite);
            }
        });
    }
    
    // Decline invite button
    const declineInviteBtn = document.getElementById('declineInviteBtn');
    if (declineInviteBtn) {
        declineInviteBtn.addEventListener('click', () => {
            if (window.currentInvite && typeof declineGroupInvite === 'function') {
                declineGroupInvite(window.currentInvite);
            }
        });
    }
}

// Setup group invites listener
function setupGroupInvitesListener() {
    if (!currentUser) return;
    
    // Already handled by background sync interval
}

// Check mobile
function checkMobile() {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        document.body.classList.add('mobile');
        const sidebar = document.getElementById('sidebar');
        const groupChatPanel = document.getElementById('groupChatPanel');
        
        if (groupChatPanel && groupChatPanel.classList.contains('active')) {
            if (sidebar) sidebar.style.display = 'none';
            if (groupChatPanel) groupChatPanel.style.display = 'flex';
        } else {
            if (sidebar) sidebar.style.display = 'flex';
            if (groupChatPanel) groupChatPanel.style.display = 'none';
        }
    } else {
        document.body.classList.remove('mobile');
        const sidebar = document.getElementById('sidebar');
        const groupChatPanel = document.getElementById('groupChatPanel');
        
        if (sidebar) sidebar.style.display = 'flex';
        if (groupChatPanel) groupChatPanel.style.display = 'flex';
        
        const mobileBackBtn = document.querySelector('.mobile-back-btn');
        if (mobileBackBtn) {
            mobileBackBtn.remove();
        }
    }
}

// Show mobile section
function showMobileSection(section) {
    document.querySelectorAll('.groups-section').forEach(s => {
        s.classList.remove('active');
    });
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    switch(section) {
        case 'all':
            const allGroupsSection = document.getElementById('allGroupsSection');
            const allTab = document.getElementById('allTab');
            if (allGroupsSection) allGroupsSection.classList.add('active');
            if (allTab) allTab.classList.add('active');
            break;
        case 'my':
            const myGroupsSection = document.getElementById('myGroupsSection');
            const myGroupsTab = document.getElementById('myGroupsTab');
            if (myGroupsSection) myGroupsSection.classList.add('active');
            if (myGroupsTab) myGroupsTab.classList.add('active');
            break;
        case 'joined':
            const joinedSection = document.getElementById('joinedSection');
            const joinedTab = document.getElementById('joinedTab');
            if (joinedSection) joinedSection.classList.add('active');
            if (joinedTab) joinedTab.classList.add('active');
            break;
        case 'invites':
            const invitesSection = document.getElementById('invitesSection');
            const invitesTab = document.getElementById('invitesTab');
            if (invitesSection) invitesSection.classList.add('active');
            if (invitesTab) invitesTab.classList.add('active');
            break;
        case 'admin':
            const adminSection = document.getElementById('adminSection');
            const adminTab = document.getElementById('adminTab');
            if (adminSection) adminSection.classList.add('active');
            if (adminTab) adminTab.classList.add('active');
            break;
    }
    
    if (typeof updateCurrentSection === 'function') updateCurrentSection();
}

// Render my groups
function renderMyGroups() {
    const myGroupsList = document.getElementById('myGroupsList');
    if (!myGroupsList) return;
    
    myGroupsList.innerHTML = '';
    
    if (myGroups.length === 0) {
        myGroupsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>You haven't created any groups</p>
                <p class="subtext">Create your first group to get started</p>
            </div>
        `;
        return;
    }
    
    myGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, myGroupsList, 'my_group');
        }
    });
}

// Render joined groups
function renderJoinedGroups() {
    const joinedList = document.getElementById('joinedList');
    if (!joinedList) return;
    
    joinedList.innerHTML = '';
    
    if (joinedGroups.length === 0) {
        joinedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>You haven't joined any groups</p>
                <p class="subtext">Join groups to connect with others</p>
            </div>
        `;
        return;
    }
    
    joinedGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, joinedList, 'joined');
        }
    });
}

// Render group invites
function renderGroupInvites() {
    const invitesList = document.getElementById('invitesList');
    if (!invitesList) return;
    
    invitesList.innerHTML = '';
    
    if (groupInvites.length === 0) {
        invitesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-envelope"></i>
                <p>No group invites</p>
                <p class="subtext">When someone invites you to a group, it will appear here</p>
            </div>
        `;
        return;
    }
    
    groupInvites.forEach(invite => {
        addGroupInviteItem(invite, invitesList);
    });
}

// Add group invite item
function addGroupInviteItem(inviteData, container) {
    const inviteItem = document.createElement('div');
    inviteItem.className = 'group-item';
    inviteItem.dataset.inviteId = inviteData.id;
    inviteItem.dataset.type = 'group_invite';
    
    const groupData = inviteData.groupData || inviteData;
    const initials = groupData.name 
        ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
        : 'G';
    
    const groupType = groupData.type || 'private';
    const typeInfo = groupTypes[groupType];
    
    const purpose = groupData.purpose || '';
    const mood = groupData.mood || '';
    const purposeInfo = purpose ? groupPurposes[purpose] : null;
    const moodInfo = mood ? groupMoods[mood] : null;
    
    inviteItem.innerHTML = `
        <div class="group-avatar" ${groupData.photoURL ? `style="background-image: url('${groupData.photoURL}')"` : ''}>
            ${groupData.photoURL ? '' : `<span>${initials}</span>`}
            <div class="group-type-badge ${groupType}" title="${typeInfo ? typeInfo.name : 'Private'}">
                <i class="${typeInfo ? typeInfo.icon : 'fas fa-lock'}"></i>
            </div>
        </div>
        <div class="group-info">
            <div class="group-name">
                <span class="group-name-text">${groupData.name || 'Unnamed Group'}</span>
                ${purposeInfo ? `<span class="group-purpose-tag" style="font-size: 11px;">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
            </div>
            <div class="group-details">
                ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                ${groupData.topic ? `<span class="group-topic">${groupData.topic}</span>` : ''}
                <span class="member-count"><i class="fas fa-users"></i> ${groupData.memberCount || 0}</span>
                <span>${typeInfo ? typeInfo.name : 'Private'}</span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">Invited by ${inviteData.invitedByName || 'Unknown'}</div>
        </div>
        <div class="group-actions">
            <button class="group-action-btn success" data-action="accept-invite" title="Accept Invite">
                <i class="fas fa-check"></i>
            </button>
            <button class="group-action-btn danger" data-action="decline-invite" title="Decline Invite">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    inviteItem.addEventListener('click', (e) => {
        if (!e.target.closest('.group-actions')) {
            if (typeof showGroupInviteDetails === 'function') showGroupInviteDetails(inviteData);
        }
    });
    
    const actionButtons = inviteItem.querySelectorAll('.group-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === 'accept-invite') {
                if (typeof acceptGroupInvite === 'function') acceptGroupInvite(inviteData);
            } else if (action === 'decline-invite') {
                if (typeof declineGroupInvite === 'function') declineGroupInvite(inviteData);
            }
        });
    });
    
    container.appendChild(inviteItem);
}

// Render admin groups
function renderAdminGroups() {
    const adminList = document.getElementById('adminList');
    if (!adminList) return;
    
    adminList.innerHTML = '';
    
    if (adminGroups.length === 0) {
        adminList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-crown"></i>
                <p>You don't admin any groups</p>
                <p class="subtext">Create or be promoted in groups to see them here</p>
            </div>
        `;
        return;
    }
    
    adminGroups.forEach(group => {
        if (matchesFilters(group)) {
            addGroupItem(group, adminList, 'admin');
        }
    });
}

// Start group call (simulated for now)
function startGroupCall() {
    showNotification('Group call feature would start here', 'info');
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing group page...');
    initGroupPage();
});

// Also try to initialize if DOM is already loaded
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    console.log('DOM already ready, initializing group page immediately...');
    setTimeout(initGroupPage, 100);
}