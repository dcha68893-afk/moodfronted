// =============================================
// ENHANCED MARKETPLACE SYSTEM WITH PREMIUM FEATURES
// =============================================

// Global variables (only marketplace-specific)
let currentUser = null;
let userData = null;
let myListings = [];
let allListings = [];
let savedItems = [];
let privateNotes = [];
let userGroups = [];
let userFriends = [];
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

// Marketplace constants
const LISTING_TYPES = {
    SERVICE: 'service',
    DIGITAL: 'digital',
    PHYSICAL: 'physical'
};

const AVAILABILITY = {
    FREE: 'free',
    BUSY: 'busy',
    URGENT: 'urgent'
};

const MOOD_CONTEXTS = {
    HELP: 'help',
    BROWSE: 'browse',
    LEARN: 'learn',
    URGENT: 'urgent',
    CREATIVE: 'creative',
    BUSINESS: 'business'
};

const TRUST_CIRCLES = {
    FRIENDS: 'friends',
    GROUPS: 'groups',
    SELECTED: 'selected',
    PUBLIC: 'public',
    PREMIUM: 'premium',
    MICRO: 'micro'
};

const DURATION_OPTIONS = {
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'event': null
};

const TRUST_INDICATORS = {
    NEW: { text: 'New', class: 'trust-new' },
    RESPONSIVE: { text: 'Responsive', class: 'trust-responsive' },
    RELIABLE: { text: 'Reliable', class: 'trust-reliable' },
    VERIFIED: { text: 'Verified', class: 'trust-verified' },
    PRO: { text: 'Pro', class: 'trust-pro' }
};

const SUBSCRIPTION_PLANS = {
    MONTHLY: { id: 'monthly', price: 9.99, name: 'Monthly' },
    QUARTERLY: { id: 'quarterly', price: 24.99, name: 'Quarterly' },
    YEARLY: { id: 'yearly', price: 79.99, name: 'Yearly' },
    BUSINESS: { id: 'business', price: 199.99, name: 'Business' }
};

const SERVICE_CATEGORIES = [
    'Tutoring', 'Design', 'Repair', 'Writing', 'Consulting',
    'Programming', 'Marketing', 'Cleaning', 'Cooking', 'Fitness',
    'Music Lessons', 'Art', 'Photography', 'Video Editing', 'Translation'
];

const PREMIUM_CATEGORIES = [
    'Business Consulting', 'Executive Coaching', 'VIP Services',
    'Enterprise Solutions', 'Premium Content', 'Exclusive Access'
];

const DIGITAL_TYPES = [
    'Study Notes', 'Templates', 'Design Assets', 'E-books', 'Guides',
    'Worksheets', 'Presentations', 'Code Snippets', 'Audio Lessons', 'Wallpapers'
];

const PREMIUM_DIGITAL_TYPES = [
    'Premium Templates', 'Master Classes', 'Pro Tools',
    'Exclusive Content', 'AR Assets', '3D Models'
];

const TEMPLATE_TYPES = {
    BASIC: 'basic',
    BUSINESS: 'business',
    COACHING: 'coaching',
    CREATIVE: 'creative',
    VIP: 'vip',
    DIGITAL: 'digital'
};

// Local Storage Keys
const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_PROFILE: 'knecta_user_profile',
    MY_LISTINGS: 'knecta_my_listings',
    ALL_LISTINGS: 'knecta_all_listings',
    SAVED_ITEMS: 'knecta_saved_items',
    PRIVATE_NOTES: 'knecta_private_notes',
    OFFLINE_DRAFTS: 'knecta_marketplace_drafts',
    TRUST_STATS: 'knecta_trust_stats',
    MOOD_FILTER: 'knecta_marketplace_mood',
    USER_GROUPS: 'knecta_user_groups',
    USER_FRIENDS: 'knecta_user_friends',
    USER_SUBSCRIPTION: 'knecta_user_subscription',
    TEAM_MEMBERS: 'knecta_team_members',
    LEADERBOARD: 'knecta_leaderboard',
    ANALYTICS: 'knecta_analytics',
    STREAK_DATA: 'knecta_streak_data',
    PREMIUM_FEATURES: 'knecta_premium_features',
    PAYMENT_METHODS: 'knecta_payment_methods',
    PREMIUM_LISTINGS: 'knecta_premium_listings',
    SPOTLIGHT_LISTINGS: 'knecta_spotlight_listings',
    MARKETPLACE_USERS: 'knecta_marketplace_users'
};

// DOM Elements
const marketplaceDetailPanel = document.getElementById('marketplaceDetailPanel');
const createListingModal = document.getElementById('createListingModal');
const savedItemsModal = document.getElementById('savedItemsModal');
const myNotesModal = document.getElementById('myNotesModal');
const trustStatsModal = document.getElementById('trustStatsModal');
const analyticsModal = document.getElementById('analyticsModal');
const premiumOptionsModal = document.getElementById('premiumOptionsModal');
const teamManagementModal = document.getElementById('teamManagementModal');
const leaderboardModal = document.getElementById('leaderboardModal');
const reactionPickerModal = document.getElementById('reactionPickerModal');
const notification = document.getElementById('notification');

// Marketplace sections
const marketplaceListContent = document.getElementById('marketplaceListContent');
const myListingsAvatar = document.getElementById('myListingsAvatar');
const myListingsName = document.getElementById('myListingsName');
const myListingsText = document.getElementById('myListingsText');
const spotlightSection = document.getElementById('spotlightSection');
const spotlightListings = document.getElementById('spotlightListings');
const premiumStatusBadge = document.getElementById('premiumStatusBadge');
const listingStreak = document.getElementById('listingStreak');

// Authentication state
let accessToken = null;
let refreshToken = null;
let tokenRefreshInProgress = false;
let isBootstrapped = false;
let isAuthReady = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Tool.js] Marketplace iframe initialization started');
    
    try {
        // Setup event listeners first (non-data dependent)
        setupEnhancedEventListeners();
        
        // Load cached data for instant display
        loadCachedDataInstantly();
        
        // Start background authentication
        initializeBackgroundAuth();
        
        // Background data fetching
        setTimeout(() => {
            loadEnhancedMarketplaceData();
        }, 1000);
        
    } catch (error) {
        console.error('[Tool.js] Initialization failed:', error);
        showNotification('Failed to load marketplace. Please try again.', 'error');
    }
});

// Get valid token from multiple sources
function getValidToken() {
    // Try parent first
    let token = null;
    
    try {
        if (window.parent && window.parent.AppState && window.parent.AppState.accessToken) {
            token = window.parent.AppState.accessToken;
            console.log('[Tool.js] Token from parent AppState');
        }
    } catch (e) {
        // Parent not accessible, try localStorage
    }
    
    // Try localStorage
    if (!token) {
        token = localStorage.getItem('accessToken') || 
                localStorage.getItem('knecta_auth_token') || 
                sessionStorage.getItem('accessToken');
    }
    
    // If still no token, check parent localStorage via try-catch
    if (!token && window.parent) {
        try {
            token = window.parent.localStorage.getItem('accessToken');
        } catch (e) {
            // Cross-origin restriction
        }
    }
    
    return token;
}

// Initialize background authentication
async function initializeBackgroundAuth() {
    console.log('[Tool.js] Starting background authentication');
    
    try {
        const token = getValidToken();
        
        if (!token) {
            console.warn('[Tool.js] No token found, continuing offline');
            isAuthReady = true;
            return;
        }
        
        accessToken = token;
        
        // Try to validate token with backend in background
        if (typeof window.apiCall === 'function') {
            try {
                const userResponse = await window.apiCall('GET', '/api/auth/me');
                if (userResponse && userResponse.user) {
                    currentUser = userResponse.user;
                    userData = userResponse.user;
                    
                    // Save to localStorage
                    localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(currentUser));
                    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
                    
                    console.log('[Tool.js] User authenticated:', currentUser.displayName || currentUser.email);
                }
            } catch (error) {
                console.warn('[Tool.js] Background auth failed:', error);
                // Continue with cached user
            }
        }
        
        isAuthReady = true;
        console.log('[Tool.js] Background auth completed');
        
    } catch (error) {
        console.error('[Tool.js] Auth initialization error:', error);
        isAuthReady = true; // Don't block UI
    }
}

// SINGLE BOOTSTRAP FUNCTION - Removes parent dependency and race conditions
async function bootstrapIframe() {
    console.log('[Tool.js] Bootstrapping marketplace iframe');
    
    if (isBootstrapped) {
        console.log('[Tool.js] Already bootstrapped');
        return;
    }
    
    // 1. Read token from localStorage using fallback logic
    accessToken = getValidToken();
    
    if (!accessToken) {
        console.log('[Tool.js] No access token found, continuing offline');
        isBootstrapped = true;
        return;
    }
    
    // 2. Validate token expiration
    if (isTokenExpired(accessToken)) {
        console.log('[Tool.js] Access token expired, attempting refresh');
        try {
            await attemptTokenRefresh();
            accessToken = getValidToken();
        } catch (error) {
            console.warn('[Tool.js] Token refresh failed, continuing offline:', error);
        }
    }
    
    // 3. Call /api/auth/me to verify user (if possible)
    try {
        const userResponse = await makeApiCall('GET', '/api/auth/me');
        
        if (userResponse && userResponse.user) {
            currentUser = userResponse.user;
            userData = userResponse.user;
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(currentUser));
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
            
            console.log('[Tool.js] User verified:', currentUser.displayName || currentUser.email);
        }
        
    } catch (error) {
        console.warn('[Tool.js] Failed to verify user, continuing offline:', error);
    }
    
    isBootstrapped = true;
    console.log('[Tool.js] Marketplace iframe bootstrapped successfully');
}

// Helper function to get token from storage with fallback logic
function getTokenFromStorage() {
    return getValidToken();
}

// Helper function to clear authentication storage
function clearAuthStorage() {
    console.log('[Tool.js] Clearing authentication storage');
    
    const tokensToRemove = [
        'accessToken',
        'knecta_auth_token',
        'moodchat_token',
        'refreshToken',
        'knecta_refresh_token'
    ];
    
    tokensToRemove.forEach(token => {
        localStorage.removeItem(token);
        sessionStorage.removeItem(token);
    });
    
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_PROFILE);
    
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    userData = null;
}

// Check if token is expired
function isTokenExpired(token) {
    if (!token) return true;
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.warn('[Tool.js] Invalid JWT token format');
            return true;
        }
        
        const payload = JSON.parse(atob(parts[1]));
        const expirationTime = payload.exp * 1000;
        const currentTime = Date.now();
        
        const isExpired = expirationTime < (currentTime + 60000);
        
        if (isExpired) {
            console.log('[Tool.js] Token expired');
        }
        
        return isExpired;
        
    } catch (error) {
        console.error('[Tool.js] Error parsing token:', error);
        return true;
    }
}

// Attempt to refresh the access token
async function attemptTokenRefresh() {
    if (tokenRefreshInProgress) {
        console.log('[Tool.js] Token refresh already in progress');
        return;
    }
    
    tokenRefreshInProgress = true;
    
    try {
        console.log('[Tool.js] Refreshing access token');
        
        refreshToken = localStorage.getItem('refreshToken') || 
                       localStorage.getItem('knecta_refresh_token');
        
        if (!refreshToken) {
            console.log('[Tool.js] No refresh token available');
            clearAuthStorage();
            return;
        }
        
        const response = await makeApiCall('POST', '/api/auth/refresh', {
            refreshToken: refreshToken
        });
        
        if (response && response.accessToken) {
            accessToken = response.accessToken;
            if (response.refreshToken) {
                refreshToken = response.refreshToken;
            }
            
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('knecta_auth_token', accessToken);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
                localStorage.setItem('knecta_refresh_token', refreshToken);
            }
            
            console.log('[Tool.js] Access token refreshed successfully');
            
        } else {
            throw new Error('No access token in response');
        }
        
    } catch (error) {
        console.error('[Tool.js] Token refresh failed:', error);
        clearAuthStorage();
        throw error;
        
    } finally {
        tokenRefreshInProgress = false;
    }
}

// Unified API call function using api.js
async function makeApiCall(method, endpoint, data = null) {
    const token = getValidToken();
    
    if (!token && endpoint !== '/api/auth/refresh') {
        throw { status: 401, message: 'Authentication required' };
    }
    
    // Use api.js for all API calls if available
    if (typeof window.apiCall === 'function') {
        try {
            const response = await window.apiCall(method, endpoint, data);
            return response;
        } catch (error) {
            console.error(`[Tool.js] API call failed via api.js: ${method} ${endpoint}`, error);
            
            if (error.status === 401 || error.status === 403) {
                clearAuthStorage();
            }
            
            throw error;
        }
    } else {
        // Fallback for when api.js is not available
        return await makeFallbackApiCall(method, endpoint, data);
    }
}

// Fallback API call for when api.js is not available
async function makeFallbackApiCall(method, endpoint, data = null) {
    const token = getValidToken();
    
    if (!token) {
        throw { status: 401, message: 'Authentication required' };
    }
    
    try {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        const options = {
            method: method,
            headers: headers
        };
        
        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            throw { 
                status: response.status, 
                message: response.statusText 
            };
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`[Tool.js] Fallback API call failed: ${method} ${endpoint}`, error);
        throw error;
    }
}

// Authenticated API call wrapper for backward compatibility
async function authenticatedApiCall(method, endpoint, data = null) {
    return await makeApiCall(method, endpoint, data);
}

// Safe API call wrapper for backward compatibility
async function safeApiCall(method, endpoint, data = null) {
    try {
        return await makeApiCall(method, endpoint, data);
    } catch (error) {
        console.error('[Tool.js] Safe API call failed:', error);
        return null;
    }
}

// Redirect to login page
function redirectToLogin() {
    console.log('[Tool.js] Redirecting to login');
    
    const currentPath = window.location.pathname + window.location.search;
    localStorage.setItem('login_redirect', currentPath);
    
    clearAuthStorage();
    
    window.location.href = '/index.html';
}

// Load cached data for instant display
function loadCachedDataInstantly() {
    console.log('[Tool.js] Loading cached marketplace data');
    
    try {
        // Load user from cache immediately
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            console.log('[Tool.js] Loaded user from cache');
        }
        
        // Load user profile from cache
        const cachedProfile = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILE);
        if (cachedProfile) {
            userData = JSON.parse(cachedProfile);
            
            // Update my listings section
            if (myListingsAvatar) {
                if (userData.photoURL) {
                    myListingsAvatar.style.backgroundImage = `url('${escapeHtml(userData.photoURL)}')`;
                    myListingsAvatar.innerHTML = '';
                } else {
                    const initials = userData.displayName ? 
                        userData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                        'ME';
                    myListingsAvatar.innerHTML = `<span style="color: white; font-size: 20px;">${initials}</span>`;
                }
            }
            
            if (myListingsName) {
                myListingsName.textContent = userData.displayName || 'My Marketplace';
            }
        }
        
        // Load all marketplace users for visibility checks
        let allMarketplaceUsers = [];
        const cachedUsers = localStorage.getItem(LOCAL_STORAGE_KEYS.MARKETPLACE_USERS);
        if (cachedUsers) {
            allMarketplaceUsers = JSON.parse(cachedUsers);
        }
        
        // Load my listings from cache
        const myListingsData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_LISTINGS);
        if (myListingsData) {
            myListings = JSON.parse(myListingsData);
            updateMyListingsPreview();
        }
        
        // Load all listings
        const allListingsData = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
        if (allListingsData) {
            allListings = JSON.parse(allListingsData);
            allListings = allListings.filter(listing => !isListingExpired(listing));
            
            // Ensure all listings have user data for visibility
            allListings = allListings.map(listing => {
                if (!listing.user && listing.userId) {
                    const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                        id: listing.userId,
                        displayName: 'Unknown User',
                        photoURL: '',
                        trustLevel: 'new'
                    };
                    listing.user = listingUser;
                }
                return listing;
            });
        }
        
        // Load premium listings
        const premiumListingsData = localStorage.getItem(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS);
        if (premiumListingsData) {
            const premiumListings = JSON.parse(premiumListingsData);
            premiumListings.forEach(listing => {
                if (!listing.user && listing.userId) {
                    const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                        id: listing.userId,
                        displayName: 'Unknown User',
                        photoURL: '',
                        trustLevel: 'new'
                    };
                    listing.user = listingUser;
                }
            });
            allListings = [...allListings, ...premiumListings];
        }
        
        // Load spotlight listings
        const spotlightListingsData = localStorage.getItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS);
        if (spotlightListingsData) {
            const spotlightData = JSON.parse(spotlightListingsData);
            spotlightData.forEach(listing => {
                if (!listing.user && listing.userId) {
                    const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                        id: listing.userId,
                        displayName: 'Unknown User',
                        photoURL: '',
                        trustLevel: 'new'
                    };
                    listing.user = listingUser;
                }
            });
            renderSpotlightListings(spotlightData);
        }
        
        // Load saved items
        const savedItemsData = localStorage.getItem(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (savedItemsData) {
            savedItems = JSON.parse(savedItemsData);
        }
        
        // Load private notes
        const privateNotesData = localStorage.getItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (privateNotesData) {
            privateNotes = JSON.parse(privateNotesData);
        }
        
        // Load offline drafts
        const draftsData = localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS);
        if (draftsData) {
            offlineDrafts = JSON.parse(draftsData);
        }
        
        // Load trust stats
        const trustStatsData = localStorage.getItem(LOCAL_STORAGE_KEYS.TRUST_STATS);
        if (trustStatsData) {
            trustStats = JSON.parse(trustStatsData);
        }
        
        // Load mood filter
        const moodFilterData = localStorage.getItem(LOCAL_STORAGE_KEYS.MOOD_FILTER);
        if (moodFilterData) {
            currentMoodFilter = moodFilterData;
            updateMoodFilterIndicator();
        }
        
        // Load user groups
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) {
            userGroups = JSON.parse(groupsData);
        }
        
        // Load user friends
        const friendsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (friendsData) {
            userFriends = JSON.parse(friendsData);
        }
        
        // Load user subscription
        const subscriptionData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (subscriptionData) {
            userSubscription = JSON.parse(subscriptionData);
            updatePremiumStatusUI();
        }
        
        // Load team members
        const teamData = localStorage.getItem(LOCAL_STORAGE_KEYS.TEAM_MEMBERS);
        if (teamData) {
            teamMembers = JSON.parse(teamData);
        }
        
        // Load leaderboard
        const leaderboardDataCache = localStorage.getItem(LOCAL_STORAGE_KEYS.LEADERBOARD);
        if (leaderboardDataCache) {
            leaderboardData = JSON.parse(leaderboardDataCache);
        }
        
        // Load analytics
        const analyticsDataCache = localStorage.getItem(LOCAL_STORAGE_KEYS.ANALYTICS);
        if (analyticsDataCache) {
            analyticsData = JSON.parse(analyticsDataCache);
        }
        
        // Load streak data
        const streakDataCache = localStorage.getItem(LOCAL_STORAGE_KEYS.STREAK_DATA);
        if (streakDataCache) {
            streakData = JSON.parse(streakDataCache);
            updateStreakIndicator();
        }
        
        // Load premium features
        const premiumFeaturesCache = localStorage.getItem(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES);
        if (premiumFeaturesCache) {
            premiumFeatures = JSON.parse(premiumFeaturesCache);
        }
        
        // Load payment methods
        const paymentMethodsCache = localStorage.getItem(LOCAL_STORAGE_KEYS.PAYMENT_METHODS);
        if (paymentMethodsCache) {
            paymentMethods = JSON.parse(paymentMethodsCache);
        }
        
        console.log('[Tool.js] Instant marketplace cache load complete');
        
        // Render initial listings
        renderMarketplaceList();
        updateAvailableListingsCount();
        
    } catch (error) {
        console.error('[Tool.js] Error in instant cache load:', error);
    }
}

async function initializeEnhancedMarketplace() {
    console.log('[Tool.js] Enhanced marketplace initialization');
    
    checkDarkMode();
    await checkUserPremiumStatus();
    await loadEnhancedMarketplaceData();
    loadServiceCategories();
    loadGroupsForSelection();
    loadFriendsForSelection();
    cleanupExpiredListings();
    initializeAnalyticsChart();
    generateHeatmap();
    
    console.log('[Tool.js] Enhanced marketplace initialization complete');
}

async function checkUserPremiumStatus() {
    try {
        const localSubscription = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (localSubscription) {
            userSubscription = JSON.parse(localSubscription);
            
            if (userSubscription.expiresAt && new Date(userSubscription.expiresAt) < new Date()) {
                userSubscription = null;
                localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
            } else {
                updatePremiumStatusUI();
                return;
            }
        }
        
        const response = await safeApiCall('GET', '/api/user/subscription');
        if (response && response.subscription) {
            userSubscription = response.subscription;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(userSubscription));
            updatePremiumStatusUI();
        }
        
    } catch (error) {
        console.error('[Tool.js] Error checking premium status:', error);
    }
}

async function loadEnhancedMarketplaceData() {
    try {
        console.log('[Tool.js] Loading enhanced marketplace data in background');
        
        const promises = [
            loadListingsFromBackend(),
            loadUserGroups(),
            loadUserFriends(),
            loadTeamMembers(),
            loadLeaderboard(),
            loadAnalyticsData(),
            loadPremiumFeatures(),
            loadSpotlightListingsFromBackend()
        ];
        
        await Promise.allSettled(promises);
        
        updateListingCounts();
        console.log('[Tool.js] Marketplace data refreshed in background');
        
    } catch (error) {
        console.error('[Tool.js] Error loading marketplace data:', error);
        generateSampleMarketplaceData();
    }
}

async function loadListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/listings');
        
        if (response && response.listings) {
            allListings = response.listings;
            allListings = allListings.filter(listing => !isListingExpired(listing));
            
            renderMarketplaceList();
            updateAvailableListingsCount();
            
            console.log(`[Tool.js] Loaded ${allListings.length} listings from backend`);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading listings from backend:', error);
        throw error;
    }
}

async function loadUserGroups() {
    try {
        const response = await safeApiCall('GET', '/api/user/groups');
        
        if (response && response.groups) {
            userGroups = response.groups;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(userGroups));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading user groups:', error);
    }
}

async function loadUserFriends() {
    try {
        const response = await safeApiCall('GET', '/api/user/friends');
        
        if (response && response.friends) {
            userFriends = response.friends;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_FRIENDS, JSON.stringify(userFriends));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading user friends:', error);
    }
}

async function loadTeamMembers() {
    try {
        if (userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team')) {
            const response = await safeApiCall('GET', '/api/team/members');
            
            if (response && response.members) {
                teamMembers = response.members;
                localStorage.setItem(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, JSON.stringify(teamMembers));
            }
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading team members:', error);
    }
}

async function loadLeaderboard() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/leaderboard');
        
        if (response && response.leaderboard) {
            leaderboardData = response.leaderboard;
            localStorage.setItem(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading leaderboard:', error);
    }
}

async function loadAnalyticsData() {
    try {
        if (isUserPremium()) {
            const response = await safeApiCall('GET', '/api/marketplace/analytics');
            
            if (response && response.analytics) {
                analyticsData = response.analytics;
                localStorage.setItem(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
                updateAnalyticsDashboard();
            }
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading analytics:', error);
    }
}

async function loadPremiumFeatures() {
    try {
        const response = await safeApiCall('GET', '/api/premium/features');
        
        if (response && response.features) {
            premiumFeatures = response.features;
            localStorage.setItem(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, JSON.stringify(premiumFeatures));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading premium features:', error);
    }
}

async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        
        if (response && response.spotlightListings) {
            renderSpotlightListings(response.spotlightListings);
            localStorage.setItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, JSON.stringify(response.spotlightListings));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading spotlight listings:', error);
    }
}

function updatePremiumStatusUI() {
    if (userSubscription && userSubscription.status === 'active') {
        if (premiumStatusBadge) premiumStatusBadge.style.display = 'inline-flex';
        const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
        if (premiumOptionsBtn) premiumOptionsBtn.innerHTML = '<i class="fas fa-crown"></i> Premium';
        
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'block';
        });
        
        const publishPremiumBtn = document.getElementById('publishPremiumBtn');
        if (publishPremiumBtn) publishPremiumBtn.style.display = 'flex';
        
        const uploadInfo = document.querySelector('#digitalUploadArea p:nth-child(4)');
        if (uploadInfo) uploadInfo.textContent = 'Max: 500MB';
        
        const arPreview = document.getElementById('arPreviewFeature');
        if (arPreview) arPreview.style.display = 'block';
        
        if (userSubscription.plan === 'business' || userSubscription.plan === 'team') {
            const teamNotes = document.getElementById('teamNotesFeature');
            if (teamNotes) teamNotes.style.display = 'block';
        }
        
        const analyticsAlerts = document.getElementById('analyticsAlertsFeature');
        if (analyticsAlerts) analyticsAlerts.style.display = 'block';
        
    } else {
        if (premiumStatusBadge) premiumStatusBadge.style.display = 'none';
        const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
        if (premiumOptionsBtn) premiumOptionsBtn.innerHTML = '<i class="fas fa-crown"></i> Premium';
        
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'none';
        });
        
        const publishPremiumBtn = document.getElementById('publishPremiumBtn');
        if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
    }
}

function updateStreakIndicator() {
    if (listingStreak && streakData.currentStreak > 0) {
        listingStreak.style.display = 'flex';
        const streakCount = document.getElementById('streakCount');
        if (streakCount) streakCount.textContent = streakData.currentStreak;
    } else if (listingStreak) {
        listingStreak.style.display = 'none';
    }
}

function updateMyListingsPreview() {
    if (!myListingsText) return;
    
    if (myListings.length > 0) {
        const activeListings = myListings.filter(listing => !isListingExpired(listing));
        myListingsText.textContent = `${activeListings.length} active listings`;
    } else {
        myListingsText.textContent = 'Tap to create your first listing';
    }
}

function renderSpotlightListings(spotlightData) {
    if (!spotlightSection || !spotlightListings) return;
    
    if (!spotlightData || spotlightData.length === 0) {
        spotlightSection.style.display = 'none';
        return;
    }
    
    spotlightSection.style.display = 'block';
    spotlightListings.innerHTML = '';
    
    spotlightData.forEach(listing => {
        if (isListingExpired(listing)) return;
        
        const spotlightItem = document.createElement('div');
        spotlightItem.className = 'spotlight-item';
        spotlightItem.dataset.listingId = listing.id;
        
        spotlightItem.innerHTML = `
            <div class="spotlight-preview">
                <i class="fas fa-star"></i>
            </div>
            <div class="spotlight-info">
                <div class="spotlight-title">
                    <span>${escapeHtml(listing.title.substring(0, 30))}${listing.title.length > 30 ? '...' : ''}</span>
                    <span class="featured-badge">FEATURED</span>
                </div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">
                    ${escapeHtml(listing.description?.substring(0, 50) || '')}${listing.description?.length > 50 ? '...' : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: var(--primary-color);">${listing.price || 'Free'}</span>
                    <span style="font-size: 12px; color: var(--text-secondary);">
                        ${formatTimeAgo(new Date(listing.createdAt))}
                    </span>
                </div>
            </div>
        `;
        
        if (listing.mediaUrl) {
            spotlightItem.querySelector('.spotlight-preview').style.backgroundImage = `url('${escapeHtml(listing.mediaUrl)}')`;
            spotlightItem.querySelector('.spotlight-preview').innerHTML = '';
        }
        
        spotlightItem.addEventListener('click', () => {
            viewListingDetail(listing);
        });
        
        spotlightListings.appendChild(spotlightItem);
    });
}

function renderMarketplaceList() {
    if (!marketplaceListContent) return;
    
    marketplaceListContent.innerHTML = '';
    
    if (allListings.length === 0) {
        marketplaceListContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-store-alt" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No listings available yet</p>
                <p class="subtext">Be the first to create a listing!</p>
            </div>
        `;
        return;
    }
    
    let filteredListings = allListings;
    if (currentMoodFilter) {
        filteredListings = filterListingsByMood(allListings, currentMoodFilter);
    }
    
    filteredListings.sort((a, b) => {
        const aIsFeatured = a.featured || a.boosted;
        const bIsFeatured = b.featured || b.boosted;
        
        if (aIsFeatured && !bIsFeatured) return -1;
        if (!aIsFeatured && bIsFeatured) return 1;
        
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    filteredListings.forEach(listing => {
        if (isListingVisibleToUser(listing)) {
            addListingItem(listing);
        }
    });
}

function isListingVisibleToUser(listing) {
    if (isListingExpired(listing)) {
        return false;
    }
    
    if (listing.visibility === TRUST_CIRCLES.FRIENDS) {
        return userFriends.some(friend => friend.id === listing.userId) || listing.userId === currentUser?.id;
    } else if (listing.visibility === TRUST_CIRCLES.GROUPS) {
        return listing.allowedGroups && listing.allowedGroups.some(groupId => 
            userGroups.some(group => group.id === groupId)
        ) || listing.userId === currentUser?.id;
    } else if (listing.visibility === TRUST_CIRCLES.SELECTED) {
        return listing.allowedUsers && listing.allowedUsers.includes(currentUser?.id) || listing.userId === currentUser?.id;
    } else if (listing.visibility === TRUST_CIRCLES.PREMIUM) {
        return isUserPremium() || listing.userId === currentUser?.id;
    } else if (listing.visibility === TRUST_CIRCLES.MICRO) {
        return (isUserPremium() && listing.allowedUsers && listing.allowedUsers.includes(currentUser?.id)) || listing.userId === currentUser?.id;
    }
    
    return true;
}

function filterListingsByMood(listings, mood) {
    switch (mood) {
        case MOOD_CONTEXTS.HELP:
            return listings.filter(listing => 
                listing.availability === AVAILABILITY.URGENT || 
                listing.moodContext === MOOD_CONTEXTS.URGENT
            );
        case MOOD_CONTEXTS.LEARN:
            return listings.filter(listing => 
                listing.type === LISTING_TYPES.DIGITAL ||
                listing.category?.toLowerCase().includes('tutor') ||
                listing.category?.toLowerCase().includes('lesson') ||
                listing.title?.toLowerCase().includes('learn')
            );
        case MOOD_CONTEXTS.URGENT:
            return listings.filter(listing => 
                listing.availability === AVAILABILITY.URGENT ||
                listing.expiresSoon
            );
        case MOOD_CONTEXTS.CREATIVE:
            return listings.filter(listing => 
                listing.category?.toLowerCase().includes('art') ||
                listing.category?.toLowerCase().includes('design') ||
                listing.category?.toLowerCase().includes('creative') ||
                listing.template === 'creative'
            );
        case MOOD_CONTEXTS.BUSINESS:
            return listings.filter(listing => 
                listing.category?.toLowerCase().includes('business') ||
                listing.category?.toLowerCase().includes('consult') ||
                listing.template === 'business' ||
                listing.template === 'vip' ||
                listing.premium === true
            );
        default:
            return listings;
    }
}

function addListingItem(listingData) {
    if (!marketplaceListContent) return;
    
    const listingItem = document.createElement('div');
    listingItem.className = 'listing-item';
    if (listingData.featured || listingData.boosted) {
        listingItem.classList.add('featured');
    }
    listingItem.dataset.listingId = listingData.id;
    listingItem.dataset.userId = listingData.userId;
    
    const userAvatar = listingData.user?.photoURL || '';
    const userName = listingData.user?.displayName || 'Unknown User';
    const userInitials = userName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
    
    const availabilityClass = `availability-${listingData.availability || 'free'}`;
    const availabilityText = listingData.availability ? listingData.availability.charAt(0).toUpperCase() + listingData.availability.slice(1) : 'Available';
    
    listingItem.innerHTML = `
        <div class="listing-avatar" style="${listingData.type === LISTING_TYPES.DIGITAL ? 'background-color: #4caf50;' : ''}">
            ${listingData.type === LISTING_TYPES.DIGITAL ? '<i class="fas fa-file-alt"></i>' : 
              listingData.type === LISTING_TYPES.SERVICE ? '<i class="fas fa-tools"></i>' :
              userAvatar ? '' : `<span style="color: white; font-size: 18px;">${userInitials}</span>`}
        </div>
        <div class="listing-info">
            <div class="listing-name">
                <span>${escapeHtml(listingData.title)}</span>
                ${listingData.price ? `<span class="listing-price">${escapeHtml(listingData.price)}</span>` : ''}
                ${listingData.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
                ${listingData.boosted ? '<span class="premium-badge">BOOSTED</span>' : ''}
                ${listingData.verified ? '<span class="verified-badge">VERIFIED</span>' : ''}
                ${listingData.teamListing ? '<span class="team-badge">TEAM</span>' : ''}
            </div>
            <div class="listing-time">
                <span>${formatTimeAgo(new Date(listingData.createdAt))}</span>
                <span class="availability-badge ${availabilityClass}">${availabilityText}</span>
                ${getTrustIndicator(listingData.userId, listingData.user?.trustLevel)}
            </div>
            <div class="listing-preview">
                ${escapeHtml(listingData.description?.substring(0, 60) || '')}${listingData.description?.length > 60 ? '...' : ''}
            </div>
        </div>
    `;
    
    if (userAvatar && listingData.type === LISTING_TYPES.SERVICE) {
        listingItem.querySelector('.listing-avatar').style.backgroundImage = `url('${escapeHtml(userAvatar)}')`;
        listingItem.querySelector('.listing-avatar').innerHTML = '';
    }
    
    listingItem.addEventListener('click', () => {
        viewListingDetail(listingData);
    });
    
    marketplaceListContent.appendChild(listingItem);
}

function getTrustIndicator(userId, trustLevel) {
    if (trustLevel) {
        return `<span class="trust-indicator ${TRUST_INDICATORS[trustLevel.toUpperCase()]?.class || 'trust-new'}">${TRUST_INDICATORS[trustLevel.toUpperCase()]?.text || 'New'}</span>`;
    }
    
    return '<span class="trust-indicator trust-new">New</span>';
}

function isUserPremium() {
    return userSubscription && userSubscription.status === 'active';
}

function viewListingDetail(listingData) {
    if (!marketplaceDetailPanel) return;
    
    const detailName = document.getElementById('detailName');
    const detailTime = document.getElementById('detailTime');
    if (detailName) detailName.textContent = listingData.user?.displayName || 'User';
    if (detailTime) detailTime.textContent = formatTimeAgo(new Date(listingData.createdAt));
    
    const detailAvatar = document.getElementById('detailAvatar');
    if (detailAvatar) {
        if (listingData.user?.photoURL) {
            detailAvatar.style.backgroundImage = `url('${escapeHtml(listingData.user.photoURL)}')`;
            detailAvatar.innerHTML = '';
        } else {
            const initials = listingData.user?.displayName?.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) || 'U';
            detailAvatar.innerHTML = `<span style="color: white; font-size: 20px;">${initials}</span>`;
        }
    }
    
    const detailContent = document.getElementById('marketplaceDetailContent');
    if (!detailContent) return;
    
    detailContent.innerHTML = '';
    
    loadListingDetail(listingData, detailContent);
    
    marketplaceDetailPanel.classList.add('active');
    
    window.currentListingId = listingData.id;
    window.currentListingData = listingData;
    
    trackListingView(listingData.id);
}

function loadListingDetail(listingData, container) {
    if (!container) return;
    
    let detailHTML = '';
    
    if (listingData.videoIntro) {
        detailHTML += `
            <div class="file-preview" style="margin-bottom: 20px;">
                <video controls class="listing-detail-media">
                    <source src="${escapeHtml(listingData.videoIntro)}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
    }
    
    if (listingData.mediaUrl) {
        detailHTML += `
            <div class="file-preview">
                <img src="${escapeHtml(listingData.mediaUrl)}" class="listing-detail-media" alt="${escapeHtml(listingData.title)}">
            </div>
        `;
    }
    
    if (listingData.arPreview && isUserPremium()) {
        detailHTML += `
            <div class="ar-preview-container" style="margin-bottom: 20px;">
                <div class="ar-preview-placeholder">
                    <i class="fas fa-vr-cardboard" style="font-size: 48px; margin-bottom: 10px;"></i>
                    <p>AR Preview Available</p>
                    <button class="action-btn secondary" style="margin-top: 10px;">
                        <i class="fas fa-eye"></i> View in AR
                    </button>
                </div>
            </div>
        `;
    }
    
    detailHTML += `
        <h1 class="listing-detail-title">
            ${escapeHtml(listingData.title)}
            ${listingData.featured ? '<span class="featured-badge">FEATURED</span>' : ''}
            ${listingData.boosted ? '<span class="premium-badge">BOOSTED</span>' : ''}
            ${listingData.verified ? '<span class="verified-badge">VERIFIED</span>' : ''}
        </h1>
        
        <div class="listing-detail-price">
            ${listingData.price ? escapeHtml(listingData.price) : 'Free'}
            ${listingData.acceptsTips ? '<span style="font-size: 14px; color: var(--text-secondary); margin-left: 10px;">(Accepts Tips)</span>' : ''}
        </div>
        
        <div class="listing-detail-description">
            ${escapeHtml(listingData.description || 'No description provided.')}
        </div>
        
        <div class="listing-detail-meta">
            <span class="meta-badge">
                <i class="fas fa-${listingData.type === LISTING_TYPES.DIGITAL ? 'file-alt' : 'tools'}"></i>
                ${listingData.type === LISTING_TYPES.DIGITAL ? 'Digital Item' : 'Service'}
            </span>
            
            <span class="meta-badge availability-${listingData.availability || 'free'}">
                <i class="fas fa-${listingData.availability === 'urgent' ? 'exclamation-circle' : 
                                  listingData.availability === 'busy' ? 'clock' : 'check-circle'}"></i>
                ${listingData.availability ? listingData.availability.charAt(0).toUpperCase() + listingData.availability.slice(1) : 'Available'}
            </span>
            
            ${listingData.visibility ? `
            <span class="meta-badge ${listingData.visibility === 'premium' || listingData.visibility === 'micro' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.visibility === 'friends' ? 'user-friends' : 
                                 listingData.visibility === 'groups' ? 'users' : 
                                 listingData.visibility === 'selected' ? 'user-check' : 
                                 listingData.visibility === 'premium' ? 'crown' :
                                 listingData.visibility === 'micro' ? 'bullseye' : 'globe'}"></i>
                ${listingData.visibility === 'friends' ? 'Friends Only' :
                  listingData.visibility === 'groups' ? 'Group Members' :
                  listingData.visibility === 'selected' ? 'Selected People' :
                  listingData.visibility === 'premium' ? 'Premium Only' :
                  listingData.visibility === 'micro' ? 'Micro-Audience' : 'Public'}
            </span>
            ` : ''}
            
            ${listingData.moodContext ? `
            <span class="meta-badge ${listingData.moodContext === 'creative' || listingData.moodContext === 'business' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.moodContext === 'help' ? 'hands-helping' :
                                 listingData.moodContext === 'learn' ? 'graduation-cap' :
                                 listingData.moodContext === 'urgent' ? 'bolt' :
                                 listingData.moodContext === 'creative' ? 'palette' :
                                 listingData.moodContext === 'business' ? 'briefcase' : 'search'}"></i>
                ${listingData.moodContext === 'help' ? 'Help Needed' :
                  listingData.moodContext === 'learn' ? 'Learning' :
                  listingData.moodContext === 'urgent' ? 'Urgent' :
                  listingData.moodContext === 'creative' ? 'Creative' :
                  listingData.moodContext === 'business' ? 'Business' : 'Browsing'}
            </span>
            ` : ''}
            
            ${listingData.template ? `
            <span class="meta-badge ${listingData.template === 'business' || listingData.template === 'coaching' || listingData.template === 'vip' ? 'premium-feature' : ''}">
                <i class="fas fa-${listingData.template === 'business' ? 'briefcase' :
                                 listingData.template === 'coaching' ? 'chalkboard-teacher' :
                                 listingData.template === 'creative' ? 'palette' :
                                 listingData.template === 'vip' ? 'crown' :
                                 listingData.template === 'digital' ? 'download' : 'file-alt'}"></i>
                ${listingData.template === 'business' ? 'Business' :
                  listingData.template === 'coaching' ? 'Coaching' :
                  listingData.template === 'creative' ? 'Creative' :
                  listingData.template === 'vip' ? 'VIP' :
                  listingData.template === 'digital' ? 'Digital' : 'Basic'}
            </span>
            ` : ''}
            
            <span class="meta-badge trust-${listingData.user?.trustLevel || 'new'}">
                <i class="fas fa-${listingData.user?.trustLevel === 'verified' ? 'shield-alt' : 
                                 listingData.user?.trustLevel === 'pro' ? 'crown' :
                                 listingData.user?.trustLevel === 'responsive' ? 'comments' : 'star'}"></i>
                ${listingData.user?.trustLevel ? listingData.user.trustLevel.charAt(0).toUpperCase() + listingData.user.trustLevel.slice(1) : 'New'}
            </span>
        </div>
        
        ${listingData.teamMembers ? `
        <div style="margin-top: 20px; padding: 15px; background-color: var(--team-color); border-radius: 12px; color: white;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <i class="fas fa-users"></i>
                <div style="font-weight: 600;">Team Listing</div>
            </div>
            <div style="font-size: 14px;">
                Managed by ${listingData.teamMembers.length} team members
            </div>
        </div>
        ` : ''}
        
        ${listingData.expiresAt ? `
        <div style="margin-top: 20px; padding: 15px; background-color: var(--secondary-color); border-radius: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-clock" style="color: var(--warning-color);"></i>
                <div>
                    <div style="font-weight: 500;">Expires ${formatTimeRemaining(new Date(listingData.expiresAt))}</div>
                    <div style="font-size: 14px; color: var(--text-secondary);">
                        Listed ${formatTimeAgo(new Date(listingData.createdAt))}
                    </div>
                </div>
            </div>
            ${listingData.autoRenew ? `
            <div style="margin-top: 10px; padding: 10px; background-color: rgba(52, 199, 89, 0.1); border-radius: 8px; border: 1px solid rgba(52, 199, 89, 0.2);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-sync-alt" style="color: var(--success-color);"></i>
                    <span style="font-size: 14px;">Auto-renew enabled</span>
                </div>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        ${listingData.reactions && listingData.reactions.length > 0 ? `
        <div style="margin-top: 20px;">
            <div style="font-weight: 600; margin-bottom: 10px;">Reactions</div>
            <div class="reaction-picker">
                ${listingData.reactions.map(reaction => `
                    <div class="reaction-option ${reaction.premium ? 'premium' : ''}">
                        ${reaction.emoji}
                        <span style="font-size: 12px; margin-left: 5px;">${reaction.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;
    
    container.innerHTML = detailHTML;
    
    if (listingData.type === LISTING_TYPES.DIGITAL && listingData.fileUrl) {
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'action-btn primary';
        downloadBtn.style.marginTop = '20px';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download File';
        downloadBtn.addEventListener('click', () => {
            downloadDigitalFile(listingData.id, listingData.fileUrl, listingData.fileName);
        });
        container.appendChild(downloadBtn);
    }
    
    const tipBtn = document.getElementById('tipBtn');
    if (tipBtn) {
        tipBtn.addEventListener('click', () => {
            const tipAmounts = document.getElementById('tipAmounts');
            if (tipAmounts) {
                tipAmounts.classList.toggle('show');
            }
        });
    }
}

async function downloadDigitalFile(listingId, fileUrl, fileName) {
    try {
        await safeApiCall('POST', `/api/marketplace/listings/${listingId}/download`);
        
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName || fileUrl.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Download started', 'success');
        
    } catch (error) {
        console.error('[Tool.js] Error downloading file:', error);
        showNotification('Download failed', 'error');
    }
}

function formatTimeRemaining(date) {
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    return 'soon';
}

// Premium Listing Creation Functions
async function createPremiumServiceListing(title, description, premiumOptions = {}) {
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const listing = {
        id: listingId,
        userId: currentUser?.id || currentUser?._id,
        user: userData,
        type: LISTING_TYPES.SERVICE,
        title: title,
        description: description,
        price: premiumOptions.price,
        availability: premiumOptions.availability || AVAILABILITY.FREE,
        visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: premiumOptions.moodContext,
        template: premiumOptions.template,
        featured: premiumOptions.featured || false,
        boosted: premiumOptions.boosted || false,
        verified: premiumOptions.verified || false,
        videoIntro: premiumOptions.videoIntro,
        acceptsTips: premiumOptions.acceptsTips || false,
        autoRenew: premiumOptions.autoRenew || false,
        teamMembers: premiumOptions.teamMembers || [],
        allowedGroups: premiumOptions.allowedGroups,
        allowedUsers: premiumOptions.allowedUsers,
        visibilitySchedule: premiumOptions.visibilitySchedule,
        expiresAt: premiumOptions.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
        privateNotes: premiumOptions.privateNotes,
        teamNotes: premiumOptions.teamNotes,
        premium: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if (premiumOptions.featured) {
        await processFeaturedListing(listing);
    }
    
    if (premiumOptions.boosted) {
        await processBoostedListing(listing);
    }
    
    myListings.unshift(listing);
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    
    const premiumListings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || '[]');
    premiumListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, JSON.stringify(premiumListings));
    
    allListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
    
    try {
        const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
        if (response && response.listing) {
            listing.id = response.listing.id || listingId;
        }
    } catch (error) {
        queueForSync(listing, 'premium_listing');
    }
    
    updateMyListingsPreview();
    addListingItem(listing);
    updateAvailableListingsCount();
    
    updateListingStreak();
    
    allListings.unshift(listing);
    localStorage.setItem('knecta_marketplace_listings', JSON.stringify(allListings));
    
    updateTrustStats('listingCreated');
    
    showNotification('Premium service listing published successfully', 'success');
    
    if (premiumOptions.featured || premiumOptions.boosted) {
        processPremiumPayment(listing, premiumOptions);
    }
    
    return listing;
}

async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const listing = {
        id: listingId,
        userId: currentUser?.id || currentUser?._id,
        user: userData,
        type: LISTING_TYPES.DIGITAL,
        title: title,
        description: description,
        price: premiumOptions.price,
        mediaUrl: fileData.url,
        fileUrl: fileData.url,
        fileName: fileData.name,
        fileSize: fileData.size,
        fileType: fileData.type,
        visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: premiumOptions.moodContext,
        template: premiumOptions.template,
        featured: premiumOptions.featured || false,
        boosted: premiumOptions.boosted || false,
        verified: premiumOptions.verified || false,
        arPreview: premiumOptions.arPreview,
        videoIntro: premiumOptions.videoIntro,
        acceptsTips: premiumOptions.acceptsTips || false,
        autoRenew: premiumOptions.autoRenew || false,
        teamMembers: premiumOptions.teamMembers || [],
        allowedGroups: premiumOptions.allowedGroups,
        allowedUsers: premiumOptions.allowedUsers,
        visibilitySchedule: premiumOptions.visibilitySchedule,
        expiresAt: premiumOptions.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
        privateNotes: premiumOptions.privateNotes,
        teamNotes: premiumOptions.teamNotes,
        premium: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if (premiumOptions.featured) {
        await processFeaturedListing(listing);
    }
    
    if (premiumOptions.boosted) {
        await processBoostedListing(listing);
    }
    
    myListings.unshift(listing);
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    
    const premiumListings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || '[]');
    premiumListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, JSON.stringify(premiumListings));
    
    allListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
    
    try {
        const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
        if (response && response.listing) {
            listing.id = response.listing.id || listingId;
        }
    } catch (error) {
        queueForSync(listing, 'premium_listing');
    }
    
    updateMyListingsPreview();
    addListingItem(listing);
    updateAvailableListingsCount();
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    showNotification('Premium digital listing published successfully', 'success');
    
    if (premiumOptions.featured || premiumOptions.boosted) {
        processPremiumPayment(listing, premiumOptions);
    }
    
    return listing;
}

async function processFeaturedListing(listing) {
    try {
        const spotlightListings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || '[]');
        spotlightListings.unshift(listing);
        localStorage.setItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, JSON.stringify(spotlightListings));
        
        renderSpotlightListings(spotlightListings);
        
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
        
    } catch (error) {
        console.error('[Tool.js] Error processing featured listing:', error);
    }
}

async function processBoostedListing(listing) {
    try {
        await safeApiCall('POST', '/api/marketplace/boost', { 
            listingId: listing.id,
            duration: '24h'
        });
        
    } catch (error) {
        console.error('[Tool.js] Error processing boosted listing:', error);
    }
}

async function processPremiumPayment(listing, options) {
    const paymentAmount = calculatePremiumCost(options);
    
    try {
        const paymentData = {
            amount: paymentAmount,
            currency: 'USD',
            listingId: listing.id,
            features: {
                featured: options.featured,
                boosted: options.boosted,
                verified: options.verified,
                autoRenew: options.autoRenew
            }
        };
        
        const response = await safeApiCall('POST', '/api/payments/process', paymentData);
        
        if (response && response.success) {
            showNotification('Premium features activated successfully', 'success');
            return true;
        }
        
    } catch (error) {
        console.error('[Tool.js] Payment processing failed:', error);
        showNotification('Payment failed. Please try again.', 'error');
    }
    
    return false;
}

function calculatePremiumCost(options) {
    let cost = 0;
    
    if (options.featured) cost += 5;
    if (options.boosted) cost += 3;
    if (options.verified) cost += 10;
    if (options.autoRenew) cost += 1;
    
    return cost;
}

// Tip System
async function sendTip(listingId, amount, customAmount = null) {
    const finalAmount = customAmount || amount;
    
    try {
        const tipData = {
            listingId: listingId,
            amount: finalAmount,
            currency: 'USD',
            message: 'Thanks for your great listing!'
        };
        
        const response = await safeApiCall('POST', '/api/marketplace/tips', tipData);
        
        if (response && response.success) {
            showNotification(`Tip of $${finalAmount} sent successfully!`, 'success');
            
            updateAnalyticsData('tipReceived', finalAmount);
            
            return true;
        }
        
    } catch (error) {
        console.error('[Tool.js] Error sending tip:', error);
        showNotification('Failed to send tip. Please try again.', 'error');
    }
    
    return false;
}

// Analytics Functions
function initializeAnalyticsChart() {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;
    
    window.analyticsChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Views',
                data: [12, 19, 15, 25, 22, 30, 28],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }, {
                label: 'Saves',
                data: [5, 8, 6, 12, 10, 15, 13],
                borderColor: 'rgb(255, 99, 132)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

function updateAnalyticsDashboard() {
    if (!analyticsData) return;
    
    const analyticsViews = document.getElementById('analyticsViews');
    const analyticsSaves = document.getElementById('analyticsSaves');
    const analyticsShares = document.getElementById('analyticsShares');
    const analyticsMessages = document.getElementById('analyticsMessages');
    const analyticsConversion = document.getElementById('analyticsConversion');
    const analyticsEngagement = document.getElementById('analyticsEngagement');
    
    if (analyticsViews) analyticsViews.textContent = analyticsData.views || 0;
    if (analyticsSaves) analyticsSaves.textContent = analyticsData.saves || 0;
    if (analyticsShares) analyticsShares.textContent = analyticsData.shares || 0;
    if (analyticsMessages) analyticsMessages.textContent = analyticsData.messages || 0;
    if (analyticsConversion) analyticsConversion.textContent = analyticsData.conversionRate ? `${analyticsData.conversionRate}%` : '0%';
    if (analyticsEngagement) analyticsEngagement.textContent = analyticsData.avgEngagement ? `${analyticsData.avgEngagement}s` : '0s';
    
    updateChangeIndicator('viewsChange', analyticsData.viewsChange);
    updateChangeIndicator('savesChange', analyticsData.savesChange);
    updateChangeIndicator('sharesChange', analyticsData.sharesChange);
    updateChangeIndicator('messagesChange', analyticsData.messagesChange);
    updateChangeIndicator('conversionChange', analyticsData.conversionChange);
    updateChangeIndicator('engagementChange', analyticsData.engagementChange);
    
    if (isUserPremium() && analyticsData.competitorInsights) {
        const competitorInsights = document.getElementById('competitorInsights');
        if (competitorInsights) {
            competitorInsights.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <strong>Category Average:</strong> ${analyticsData.competitorInsights.categoryAvg} views/day
                </div>
                <div>
                    <strong>Top Performers:</strong> ${analyticsData.competitorInsights.topPerformers} views/day
                </div>
            `;
        }
    }
}

function updateChangeIndicator(elementId, change) {
    const element = document.getElementById(elementId);
    if (!element || change === undefined) return;
    
    const isPositive = change >= 0;
    element.className = `analytics-card-change ${isPositive ? 'positive' : 'negative'}`;
    element.innerHTML = `
        <i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i>
        ${Math.abs(change)}%
    `;
}

function generateHeatmap() {
    const heatmapGrid = document.getElementById('engagementHeatmap');
    if (!heatmapGrid) return;
    
    heatmapGrid.innerHTML = '';
    
    for (let hour = 0; hour < 24; hour++) {
        for (let day = 0; day < 7; day++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            
            const engagement = Math.floor(Math.random() * 100);
            const intensity = Math.min(Math.floor(engagement / 20), 4);
            
            const colors = [
                'rgba(75, 192, 192, 0.1)',
                'rgba(75, 192, 192, 0.3)',
                'rgba(75, 192, 192, 0.5)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(75, 192, 192, 0.9)'
            ];
            
            cell.style.backgroundColor = colors[intensity];
            cell.title = `${engagement} engagements`;
            
            if (engagement > 50) {
                cell.innerHTML = '🔥';
            }
            
            heatmapGrid.appendChild(cell);
        }
    }
}

function updateAnalyticsData(type, value) {
    if (!analyticsData[type]) {
        analyticsData[type] = 0;
    }
    
    analyticsData[type] += value;
    localStorage.setItem(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
    
    if (analyticsModal && analyticsModal.classList.contains('active')) {
        updateAnalyticsDashboard();
    }
}

// Streak System
function updateListingStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (!streakData.lastListingDate) {
        streakData = {
            currentStreak: 1,
            longestStreak: 1,
            lastListingDate: today,
            totalListings: 1
        };
    } else if (streakData.lastListingDate === today) {
        streakData.totalListings++;
    } else if (streakData.lastListingDate === yesterday) {
        streakData.currentStreak++;
        streakData.totalListings++;
        streakData.lastListingDate = today;
        
        if (streakData.currentStreak > streakData.longestStreak) {
            streakData.longestStreak = streakData.currentStreak;
        }
    } else {
        streakData.currentStreak = 1;
        streakData.totalListings++;
        streakData.lastListingDate = today;
    }
    
    localStorage.setItem(LOCAL_STORAGE_KEYS.STREAK_DATA, JSON.stringify(streakData));
    
    updateStreakIndicator();
    
    checkStreakRewards();
}

function checkStreakRewards() {
    const rewards = {
        3: '🎉 3-day streak! Keep going!',
        7: '🏆 Weekly streak! You earned a badge!',
        30: '👑 Monthly streak! Premium features unlocked for a week!'
    };
    
    if (rewards[streakData.currentStreak]) {
        showNotification(rewards[streakData.currentStreak], 'success');
        
        if (streakData.currentStreak === 30) {
            awardTemporaryPremium(7);
        }
    }
}

function awardTemporaryPremium(days) {
    const tempPremium = {
        status: 'active',
        plan: 'temporary',
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        features: ['featured_listings', 'advanced_analytics']
    };
    
    userSubscription = tempPremium;
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(tempPremium));
    
    updatePremiumStatusUI();
    showNotification(`🎁 You've earned ${days} days of premium access!`, 'success');
}

// Bulk Upload Functions
async function processBulkUpload(file) {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        const content = e.target.result;
        let listings = [];
        
        if (file.type === 'application/json') {
            listings = JSON.parse(content);
        } else if (file.type === 'text/csv') {
            listings = parseCSV(content);
        }
        
        if (listings.length > 0) {
            await uploadBulkListings(listings);
        }
    };
    
    if (file.type === 'application/json') {
        reader.readAsText(file);
    } else if (file.type === 'text/csv') {
        reader.readAsText(file);
    }
}

function parseCSV(content) {
    const lines = content.split('\n');
    const headers = lines[0].split(',');
    const listings = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        const listing = {};
        
        for (let j = 0; j < headers.length; j++) {
            listing[headers[j].trim()] = values[j] ? values[j].trim() : '';
        }
        
        listings.push(listing);
    }
    
    return listings;
}

async function uploadBulkListings(listings) {
    const bulkUploadList = document.getElementById('bulkUploadList');
    if (!bulkUploadList) return;
    
    bulkUploadList.innerHTML = '';
    
    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        
        const item = document.createElement('div');
        item.className = 'bulk-upload-item';
        item.innerHTML = `
            <div>
                <div style="font-weight: 500;">${escapeHtml(listing.title || 'Untitled')}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${listing.type || 'service'}</div>
            </div>
            <div class="loading-spinner"></div>
        `;
        
        bulkUploadList.appendChild(item);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/bulk', listing);
            
            if (response && response.success) {
                item.querySelector('.loading-spinner').style.display = 'none';
                item.innerHTML += '<i class="fas fa-check" style="color: var(--success-color);"></i>';
            }
        } catch (error) {
            item.querySelector('.loading-spinner').style.display = 'none';
            item.innerHTML += '<i class="fas fa-times" style="color: var(--danger-color);"></i>';
        }
    }
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    
    showNotification(`Processed ${listings.length} listings`, 'success');
    
    renderMarketplaceList();
    updateAvailableListingsCount();
    updateMyListingsPreview();
}

// Team Management Functions
function renderTeamMembers() {
    const teamMembersList = document.getElementById('teamMembersList');
    if (!teamMembersList) return;
    
    teamMembersList.innerHTML = '';
    
    if (teamMembers.length === 0) {
        teamMembersList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No team members yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Invite team members to collaborate</p>
            </div>
        `;
        return;
    }
    
    teamMembers.forEach(member => {
        const memberElement = document.createElement('div');
        memberElement.className = 'team-member';
        
        memberElement.innerHTML = `
            <div class="team-member-info">
                <div class="team-member-avatar">
                    ${member.photoURL ? '' : '<i class="fas fa-user"></i>'}
                </div>
                <div>
                    <div style="font-weight: 500;">${escapeHtml(member.displayName)}</div>
                    <div class="team-member-role">${member.role || 'Member'}</div>
                </div>
            </div>
            <div>
                <select class="text-input" style="font-size: 12px; padding: 5px 10px;" data-member-id="${member.id}">
                    <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
                    <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                <button class="marketplace-action-btn remove-member-btn" style="width: 30px; height: 30px; margin-left: 10px;" data-member-id="${member.id}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        if (member.photoURL) {
            memberElement.querySelector('.team-member-avatar').style.backgroundImage = `url('${escapeHtml(member.photoURL)}')`;
            memberElement.querySelector('.team-member-avatar').innerHTML = '';
        }
        
        teamMembersList.appendChild(memberElement);
    });
}

// Leaderboard Functions
function renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    
    leaderboardList.innerHTML = '';
    
    if (leaderboardData.length === 0) {
        leaderboardList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-trophy" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No leaderboard data yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Create listings to appear on the leaderboard</p>
            </div>
        `;
        return;
    }
    
    leaderboardData.forEach((user, index) => {
        const leaderboardItem = document.createElement('div');
        leaderboardItem.className = 'leaderboard-item';
        
        leaderboardItem.innerHTML = `
            <div class="leaderboard-rank">${index + 1}</div>
            <div class="team-member-avatar" style="width: 40px; height: 40px;">
                ${user.photoURL ? '' : '<i class="fas fa-user"></i>'}
            </div>
            <div class="leaderboard-info">
                <div style="font-weight: 500;">${escapeHtml(user.displayName)}</div>
                <div class="leaderboard-stats">
                    <span><i class="fas fa-list"></i> ${user.listingsCount}</span>
                    <span><i class="fas fa-star"></i> ${user.rating || '5.0'}</span>
                    <span><i class="fas fa-check-circle"></i> ${user.successfulTransactions}</span>
                </div>
            </div>
            <div style="font-weight: 700; color: var(--primary-color);">
                ${user.points || 0} pts
            </div>
        `;
        
        if (user.photoURL) {
            leaderboardItem.querySelector('.team-member-avatar').style.backgroundImage = `url('${escapeHtml(user.photoURL)}')`;
            leaderboardItem.querySelector('.team-member-avatar').innerHTML = '';
        }
        
        if (index === 0) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #FFD700, #FFA500)';
            leaderboardItem.style.color = '#000';
        } else if (index === 1) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #C0C0C0, #A9A9A9)';
        } else if (index === 2) {
            leaderboardItem.style.background = 'linear-gradient(45deg, #CD7F32, #8B4513)';
            leaderboardItem.style.color = '#fff';
        }
        
        leaderboardList.appendChild(leaderboardItem);
    });
}

// Export Functions
async function exportAnalytics(format) {
    try {
        const response = await safeApiCall('GET', `/api/analytics/export?format=${format}`);
        
        if (response && response.downloadUrl) {
            const link = document.createElement('a');
            link.href = response.downloadUrl;
            link.download = `analytics_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification(`Exported as ${format.toUpperCase()}`, 'success');
        }
    } catch (error) {
        console.error('[Tool.js] Export failed:', error);
        showNotification('Export failed', 'error');
    }
}

// Backup & Restore Functions
async function backupMarketplaceData() {
    try {
        const backupData = {
            myListings: myListings,
            savedItems: savedItems,
            privateNotes: privateNotes,
            offlineDrafts: offlineDrafts,
            trustStats: trustStats,
            analyticsData: analyticsData,
            premiumFeatures: premiumFeatures,
            timestamp: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `marketplace_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showNotification('Backup created successfully', 'success');
        
    } catch (error) {
        console.error('[Tool.js] Backup failed:', error);
        showNotification('Backup failed', 'error');
    }
}

async function restoreMarketplaceData(file) {
    try {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const backupData = JSON.parse(e.target.result);
            
            if (!backupData.timestamp || !backupData.myListings) {
                throw new Error('Invalid backup file');
            }
            
            myListings = backupData.myListings || [];
            savedItems = backupData.savedItems || [];
            privateNotes = backupData.privateNotes || [];
            offlineDrafts = backupData.offlineDrafts || [];
            trustStats = backupData.trustStats || {};
            analyticsData = backupData.analyticsData || {};
            premiumFeatures = backupData.premiumFeatures || {};
            
            saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
            
            updateMyListingsPreview();
            renderMarketplaceList();
            updateAvailableListingsCount();
            
            showNotification('Data restored successfully', 'success');
        };
        
        reader.readAsText(file);
        
    } catch (error) {
        console.error('[Tool.js] Restore failed:', error);
        showNotification('Restore failed: Invalid backup file', 'error');
    }
}

// Helper Functions
function isListingExpired(listing) {
    if (!listing.expiresAt) return false;
    return new Date(listing.expiresAt) < new Date();
}

function cleanupExpiredListings() {
    const expiredListings = allListings.filter(listing => isListingExpired(listing));
    if (expiredListings.length > 0) {
        allListings = allListings.filter(listing => !isListingExpired(listing));
        localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
        
        myListings = myListings.filter(listing => !isListingExpired(listing));
        saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        console.log(`[Tool.js] Cleaned up ${expiredListings.length} expired listings`);
    }
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
}

function showNotification(message, type = 'success') {
    const notificationText = document.getElementById('notificationText');
    if (!notificationText) return;
    
    notificationText.textContent = message;
    
    notification.className = 'notification';
    notification.classList.add(type);
    
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('[Tool.js] Error saving to localStorage:', error);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function checkDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.setAttribute('data-theme', 'dark');
    }
}

function queueForSync(data, type) {
    const syncQueue = JSON.parse(localStorage.getItem('knecta_sync_queue') || '[]');
    syncQueue.push({
        type: 'marketplace_' + type,
        data: data,
        timestamp: Date.now(),
        retryCount: 0
    });
    localStorage.setItem('knecta_sync_queue', JSON.stringify(syncQueue));
}

function updateMoodFilterIndicator() {
    const indicator = document.getElementById('moodFilterIndicator');
    const filterText = document.getElementById('currentMoodFilter');
    
    if (!indicator || !filterText) return;
    
    if (currentMoodFilter) {
        indicator.style.display = 'flex';
        
        switch (currentMoodFilter) {
            case MOOD_CONTEXTS.HELP:
                filterText.textContent = 'Help Needed';
                break;
            case MOOD_CONTEXTS.LEARN:
                filterText.textContent = 'Learning Mode';
                break;
            case MOOD_CONTEXTS.URGENT:
                filterText.textContent = 'Urgent';
                break;
            case MOOD_CONTEXTS.CREATIVE:
                filterText.textContent = 'Creative Mode';
                break;
            case MOOD_CONTEXTS.BUSINESS:
                filterText.textContent = 'Business Mode';
                break;
            default:
                filterText.textContent = 'Browsing';
        }
    } else {
        indicator.style.display = 'none';
    }
}

function loadServiceCategories() {
    const serviceTitleInput = document.getElementById('serviceTitle');
    if (serviceTitleInput) {
        const datalist = document.createElement('datalist');
        datalist.id = 'serviceCategories';
        
        SERVICE_CATEGORIES.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            datalist.appendChild(option);
        });
        
        PREMIUM_CATEGORIES.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.className = 'premium-option';
            datalist.appendChild(option);
        });
        
        document.body.appendChild(datalist);
        serviceTitleInput.setAttribute('list', 'serviceCategories');
    }
}

function loadGroupsForSelection() {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList) return;
    
    groupsList.innerHTML = '';
    
    userGroups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'circle-option';
        groupItem.dataset.groupId = group.id;
        
        groupItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background-color: #ccc; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-users"></i>
                </div>
                <div>
                    <div style="font-weight: 500;">${escapeHtml(group.name)}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${group.memberCount || 0} members</div>
                </div>
            </div>
        `;
        
        groupItem.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
        
        groupsList.appendChild(groupItem);
    });
}

function loadFriendsForSelection() {
    const peopleList = document.getElementById('peopleList');
    if (!peopleList) return;
    
    peopleList.innerHTML = '';
    
    userFriends.forEach(friend => {
        const friendItem = document.createElement('div');
        friendItem.className = 'circle-option';
        friendItem.dataset.friendId = friend.id;
        
        friendItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background-color: #ccc; display: flex; align-items: center; justify-content: center;">
                    ${friend.photoURL ? '' : '<i class="fas fa-user"></i>'}
                </div>
                <div style="font-weight: 500;">${escapeHtml(friend.displayName)}</div>
            </div>
        `;
        
        if (friend.photoURL) {
            friendItem.querySelector('div').style.backgroundImage = `url('${escapeHtml(friend.photoURL)}')`;
            friendItem.querySelector('div').innerHTML = '';
        }
        
        friendItem.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
        
        peopleList.appendChild(friendItem);
    });
}

function updateListingCounts() {
    const servicesCount = document.getElementById('servicesCount');
    if (servicesCount) {
        const serviceListings = allListings.filter(listing => listing.type === LISTING_TYPES.SERVICE);
        servicesCount.textContent = serviceListings.length;
    }
    
    updateAvailableListingsCount();
}

function updateAvailableListingsCount() {
    const availableCount = document.getElementById('availableListingsCount');
    if (availableCount) {
        availableCount.textContent = allListings.length;
    }
}

function trackListingView(listingId) {
    if (!analyticsData.views) analyticsData.views = 0;
    analyticsData.views++;
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    
    try {
        safeApiCall('POST', `/api/marketplace/listings/${listingId}/view`);
    } catch (error) {
        console.error('[Tool.js] Error tracking view:', error);
    }
}

function updateTrustStats(action) {
    if (!trustStats[action]) trustStats[action] = 0;
    trustStats[action]++;
    saveToLocalStorage(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
}

function createServiceListing(title, description, options = {}) {
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const listing = {
        id: listingId,
        userId: currentUser?.id || currentUser?._id,
        user: userData,
        type: LISTING_TYPES.SERVICE,
        title: title,
        description: description,
        price: options.price,
        availability: options.availability || AVAILABILITY.FREE,
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        visibilitySchedule: options.visibilitySchedule,
        expiresAt: options.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    myListings.unshift(listing);
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    
    allListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
    
    try {
        safeApiCall('POST', '/api/marketplace/listings', listing).then(response => {
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
            }
        }).catch(error => {
            queueForSync(listing, 'listing');
        });
    } catch (error) {
        queueForSync(listing, 'listing');
    }
    
    updateMyListingsPreview();
    addListingItem(listing);
    updateAvailableListingsCount();
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    showNotification('Service listing published successfully', 'success');
    
    return listing;
}

function createDigitalListing(title, description, fileData, options = {}) {
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const listing = {
        id: listingId,
        userId: currentUser?.id || currentUser?._id,
        user: userData,
        type: LISTING_TYPES.DIGITAL,
        title: title,
        description: description,
        price: options.price,
        mediaUrl: fileData.url,
        fileUrl: fileData.url,
        fileName: fileData.name,
        fileSize: fileData.size,
        fileType: fileData.type,
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        visibilitySchedule: options.visibilitySchedule,
        expiresAt: options.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    myListings.unshift(listing);
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    
    allListings.unshift(listing);
    localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
    
    try {
        safeApiCall('POST', '/api/marketplace/listings', listing).then(response => {
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
            }
        }).catch(error => {
            queueForSync(listing, 'listing');
        });
    } catch (error) {
        queueForSync(listing, 'listing');
    }
    
    updateMyListingsPreview();
    addListingItem(listing);
    updateAvailableListingsCount();
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    showNotification('Digital listing published successfully', 'success');
    
    return listing;
}

// Sample data generation for demo/offline mode
function generateSampleMarketplaceData() {
    const sampleUsers = [
        { id: 'user_1', displayName: 'Alex Johnson', photoURL: '', trustLevel: 'reliable', isPremium: true },
        { id: 'user_2', displayName: 'Maria Garcia', photoURL: '', trustLevel: 'verified', isPremium: true },
        { id: 'user_3', displayName: 'David Smith', photoURL: '', trustLevel: 'responsive' },
        { id: 'user_4', displayName: 'Sarah Wilson', photoURL: '', trustLevel: 'pro', isPremium: true },
        { id: 'user_5', displayName: 'James Brown', photoURL: '', trustLevel: 'new' },
        { id: 'user_6', displayName: 'Emma Davis', photoURL: '', trustLevel: 'reliable' },
        { id: 'user_7', displayName: 'Michael Lee', photoURL: '', trustLevel: 'responsive', isPremium: true },
        { id: 'user_8', displayName: 'Sophia Taylor', photoURL: '', trustLevel: 'verified', isPremium: true }
    ];
    
    localStorage.setItem(LOCAL_STORAGE_KEYS.MARKETPLACE_USERS, JSON.stringify(sampleUsers));
    
    if (allListings.length === 0) {
        const sampleListings = [
            {
                id: 'listing_1',
                userId: 'user_1',
                user: sampleUsers[0],
                type: LISTING_TYPES.SERVICE,
                title: 'Professional Graphic Design',
                description: 'Creating stunning logos, banners, and social media graphics. Fast delivery and unlimited revisions.',
                price: '$50',
                availability: AVAILABILITY.FREE,
                visibility: TRUST_CIRCLES.PUBLIC,
                moodContext: MOOD_CONTEXTS.CREATIVE,
                template: TEMPLATE_TYPES.CREATIVE,
                featured: true,
                boosted: true,
                verified: true,
                premium: true,
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'listing_2',
                userId: 'user_2',
                user: sampleUsers[1],
                type: LISTING_TYPES.SERVICE,
                title: 'Math Tutoring - All Levels',
                description: 'Experienced math tutor specializing in algebra, calculus, and statistics. Online sessions available.',
                price: '$30/hour',
                availability: AVAILABILITY.FREE,
                visibility: TRUST_CIRCLES.FRIENDS,
                moodContext: MOOD_CONTEXTS.LEARN,
                template: TEMPLATE_TYPES.COACHING,
                premium: true,
                createdAt: new Date(Date.now() - 7200000).toISOString(),
                expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'listing_3',
                userId: 'user_3',
                user: sampleUsers[2],
                type: LISTING_TYPES.DIGITAL,
                title: 'Resume Template Pack',
                description: '10 professionally designed resume templates in Word and PDF format. ATS-friendly and customizable.',
                price: '$15',
                availability: AVAILABILITY.FREE,
                visibility: TRUST_CIRCLES.PUBLIC,
                moodContext: MOOD_CONTEXTS.BUSINESS,
                template: TEMPLATE_TYPES.BUSINESS,
                fileUrl: '#',
                fileName: 'resume_templates.zip',
                fileSize: '2.5 MB',
                fileType: 'application/zip',
                createdAt: new Date(Date.now() - 10800000).toISOString(),
                expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'listing_4',
                userId: 'user_4',
                user: sampleUsers[3],
                type: LISTING_TYPES.SERVICE,
                title: 'Website Development',
                description: 'Full-stack web development with React, Node.js, and MongoDB. Responsive design and SEO optimized.',
                price: '$500+',
                availability: AVAILABILITY.BUSY,
                visibility: TRUST_CIRCLES.PREMIUM,
                moodContext: MOOD_CONTEXTS.BUSINESS,
                template: TEMPLATE_TYPES.BUSINESS,
                featured: true,
                premium: true,
                createdAt: new Date(Date.now() - 14400000).toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'listing_5',
                userId: 'user_5',
                user: sampleUsers[4],
                type: LISTING_TYPES.SERVICE,
                title: 'Phone Repair Services',
                description: 'Screen replacement, battery change, and software issues for all major smartphone brands.',
                price: 'Starting at $40',
                availability: AVAILABILITY.URGENT,
                visibility: TRUST_CIRCLES.PUBLIC,
                moodContext: MOOD_CONTEXTS.HELP,
                template: TEMPLATE_TYPES.BASIC,
                createdAt: new Date(Date.now() - 18000000).toISOString(),
                expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'listing_6',
                userId: 'user_6',
                user: sampleUsers[5],
                type: LISTING_TYPES.DIGITAL,
                title: 'Study Notes - Organic Chemistry',
                description: 'Comprehensive notes covering all major topics in organic chemistry. Perfect for exam preparation.',
                price: 'Free',
                availability: AVAILABILITY.FREE,
                visibility: TRUST_CIRCLES.GROUPS,
                moodContext: MOOD_CONTEXTS.LEARN,
                template: TEMPLATE_TYPES.DIGITAL,
                fileUrl: '#',
                fileName: 'organic_chemistry_notes.pdf',
                fileSize: '3.2 MB',
                fileType: 'application/pdf',
                createdAt: new Date(Date.now() - 21600000).toISOString(),
                expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];
        
        allListings = sampleListings;
        localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
        
        const spotlightListings = sampleListings.filter(l => l.featured);
        localStorage.setItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, JSON.stringify(spotlightListings));
        renderSpotlightListings(spotlightListings);
        
        if (userFriends.length === 0) {
            userFriends = sampleUsers.slice(0, 4);
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_FRIENDS, JSON.stringify(userFriends));
        }
        
        if (userGroups.length === 0) {
            userGroups = [
                { id: 'group_1', name: 'Students Union', memberCount: 45 },
                { id: 'group_2', name: 'Freelancers Network', memberCount: 23 },
                { id: 'group_3', name: 'Tech Enthusiasts', memberCount: 67 }
            ];
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(userGroups));
        }
        
        if (Object.keys(analyticsData).length === 0) {
            analyticsData = {
                views: 245,
                saves: 42,
                shares: 18,
                messages: 56,
                conversionRate: 12.5,
                avgEngagement: 45,
                viewsChange: 15,
                savesChange: 8,
                sharesChange: 22,
                messagesChange: 5,
                conversionChange: 3,
                engagementChange: 10
            };
            localStorage.setItem(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
        }
        
        if (leaderboardData.length === 0) {
            leaderboardData = sampleUsers.map((user, index) => ({
                ...user,
                listingsCount: Math.floor(Math.random() * 20) + 5,
                rating: (Math.random() * 2 + 3).toFixed(1),
                successfulTransactions: Math.floor(Math.random() * 100) + 20,
                points: Math.floor(Math.random() * 1000) + 500
            })).sort((a, b) => b.points - a.points);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
        }
        
        renderMarketplaceList();
        updateAvailableListingsCount();
        updateListingCounts();
        
        console.log('[Tool.js] Sample marketplace data generated for demo');
    }
}

// Enhanced Event Listeners Setup
function setupEnhancedEventListeners() {
    const allTab = document.getElementById('allTab');
    const servicesTab = document.getElementById('servicesTab');
    const digitalTab = document.getElementById('digitalTab');
    const friendsTab = document.getElementById('friendsTab');
    const groupsTab = document.getElementById('groupsTab');
    const myTab = document.getElementById('myTab');
    const premiumTab = document.getElementById('premiumTab');
    const spotlightTab = document.getElementById('spotlightTab');
    
    if (allTab) allTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderMarketplaceList();
    });
    
    if (servicesTab) servicesTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderServicesList();
    });
    
    if (digitalTab) digitalTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderDigitalList();
    });
    
    if (friendsTab) friendsTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderFriendsListings();
    });
    
    if (groupsTab) groupsTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderGroupListings();
    });
    
    if (myTab) myTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderMyListings();
    });
    
    if (premiumTab) premiumTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderPremiumListings();
    });
    
    if (spotlightTab) spotlightTab.addEventListener('click', function() {
        document.querySelectorAll('.marketplace-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
        renderSpotlightTab();
    });
    
    const createListingBtn = document.getElementById('createListingBtn');
    if (createListingBtn) createListingBtn.addEventListener('click', () => {
        showCreateListingModal();
    });
    
    const createListingQuickBtn = document.getElementById('createListingQuickBtn');
    if (createListingQuickBtn) createListingQuickBtn.addEventListener('click', () => {
        showCreateListingModal();
    });
    
    const sellServiceBtn = document.getElementById('sellServiceBtn');
    if (sellServiceBtn) sellServiceBtn.addEventListener('click', () => {
        showCreateListingModal();
        const serviceTab = document.querySelector('.create-listing-tab[data-tab="service"]');
        if (serviceTab) serviceTab.click();
    });
    
    const sellDigitalBtn = document.getElementById('sellDigitalBtn');
    if (sellDigitalBtn) sellDigitalBtn.addEventListener('click', () => {
        showCreateListingModal();
        const digitalTab = document.querySelector('.create-listing-tab[data-tab="digital"]');
        if (digitalTab) digitalTab.click();
    });
    
    const premiumOptionsBtn = document.getElementById('premiumOptionsBtn');
    if (premiumOptionsBtn) premiumOptionsBtn.addEventListener('click', () => {
        showPremiumOptionsModal();
    });
    
    const viewAnalyticsBtn = document.getElementById('viewAnalyticsBtn');
    if (viewAnalyticsBtn) viewAnalyticsBtn.addEventListener('click', () => {
        if (isUserPremium()) {
            showAnalyticsModal();
        } else {
            showNotification('Upgrade to Premium for advanced analytics', 'info');
            showPremiumOptionsModal();
        }
    });
    
    const viewSavedBtn = document.getElementById('viewSavedBtn');
    if (viewSavedBtn) viewSavedBtn.addEventListener('click', () => {
        showSavedItemsModal();
    });
    
    const viewNotesBtn = document.getElementById('viewNotesBtn');
    if (viewNotesBtn) viewNotesBtn.addEventListener('click', () => {
        showMyNotesModal();
    });
    
    document.querySelectorAll('.create-listing-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.create-listing-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.create-listing-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            if (tabName === 'circles') {
                updateTrustCircleSelection();
            }
            
            if (tabName === 'premium' && !isUserPremium()) {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
                if (publishListingBtn) publishListingBtn.style.display = 'flex';
            } else if (tabName === 'premium' && isUserPremium()) {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'flex';
                if (publishListingBtn) publishListingBtn.style.display = 'none';
            } else {
                const publishPremiumBtn = document.getElementById('publishPremiumBtn');
                const publishListingBtn = document.getElementById('publishListingBtn');
                if (publishPremiumBtn) publishPremiumBtn.style.display = 'none';
                if (publishListingBtn) publishListingBtn.style.display = 'flex';
            }
        });
    });
    
    document.querySelectorAll('.availability-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.availability-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedAvailability = this.dataset.availability;
        });
    });
    
    document.querySelectorAll('.circle-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.circle-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedTrustCircle = this.dataset.circle;
            updateTrustCircleSelection();
        });
    });
    
    document.querySelectorAll('.template-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for premium templates', 'info');
                return;
            }
            
            document.querySelectorAll('.template-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedTemplate = this.dataset.template;
        });
    });
    
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for premium mood filters', 'info');
                return;
            }
            
            document.querySelectorAll('.mood-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedMoodContext = this.dataset.mood;
        });
    });
    
    document.querySelectorAll('.duration-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for extended durations', 'info');
                return;
            }
            
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedDuration = this.dataset.duration;
        });
    });
    
    document.querySelectorAll('.schedule-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.schedule-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            window.selectedSchedule = this.dataset.schedule;
        });
    });
    
    document.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for Excel exports', 'info');
                return;
            }
            
            document.querySelectorAll('.export-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            const format = this.dataset.format;
            exportAnalytics(format);
        });
    });
    
    const digitalUploadArea = document.getElementById('digitalUploadArea');
    const digitalUploadInput = document.getElementById('digitalUploadInput');
    
    if (digitalUploadArea && digitalUploadInput) {
        digitalUploadArea.addEventListener('click', () => {
            digitalUploadInput.click();
        });
        
        digitalUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            digitalUploadArea.style.borderColor = 'var(--primary-color)';
            digitalUploadArea.style.backgroundColor = 'rgba(0, 132, 255, 0.05)';
        });
        
        digitalUploadArea.addEventListener('dragleave', () => {
            digitalUploadArea.style.borderColor = '';
            digitalUploadArea.style.backgroundColor = '';
        });
        
        digitalUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            digitalUploadArea.style.borderColor = '';
            digitalUploadArea.style.backgroundColor = '';
            
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
        
        digitalUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }
    
    const bulkUploadArea = document.getElementById('bulkUploadArea');
    const bulkUploadInput = document.getElementById('bulkUploadInput');
    
    if (bulkUploadArea && bulkUploadInput) {
        bulkUploadArea.addEventListener('click', () => {
            if (!isUserPremium()) {
                showNotification('Upgrade to Premium for bulk uploads', 'info');
                return;
            }
            bulkUploadInput.click();
        });
        
        bulkUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                processBulkUpload(e.target.files[0]);
            }
        });
    }
    
    const uploadVideoBtn = document.getElementById('uploadVideoBtn');
    if (uploadVideoBtn) {
        uploadVideoBtn.addEventListener('click', () => {
            if (!isUserPremium()) {
                showNotification('Upgrade to Premium for video intros', 'info');
                return;
            }
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleVideoUpload(e.target.files[0]);
                }
            });
            input.click();
        });
    }
    
    const publishListingBtn = document.getElementById('publishListingBtn');
    if (publishListingBtn) publishListingBtn.addEventListener('click', () => {
        publishListingFromModal();
    });
    
    const publishPremiumBtn = document.getElementById('publishPremiumBtn');
    if (publishPremiumBtn) publishPremiumBtn.addEventListener('click', () => {
        publishPremiumListingFromModal();
    });
    
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => {
        saveCurrentAsDraft();
    });
    
    const closeCreateListingModal = document.getElementById('closeCreateListingModal');
    if (closeCreateListingModal) closeCreateListingModal.addEventListener('click', () => {
        if (createListingModal) createListingModal.classList.remove('active');
    });
    
    const closeAnalyticsModal = document.getElementById('closeAnalyticsModal');
    if (closeAnalyticsModal) closeAnalyticsModal.addEventListener('click', () => {
        if (analyticsModal) analyticsModal.classList.remove('active');
    });
    
    const closePremiumModal = document.getElementById('closePremiumModal');
    if (closePremiumModal) closePremiumModal.addEventListener('click', () => {
        if (premiumOptionsModal) premiumOptionsModal.classList.remove('active');
    });
    
    const closeTeamModal = document.getElementById('closeTeamModal');
    if (closeTeamModal) closeTeamModal.addEventListener('click', () => {
        if (teamManagementModal) teamManagementModal.classList.remove('active');
    });
    
    const closeLeaderboardModal = document.getElementById('closeLeaderboardModal');
    if (closeLeaderboardModal) closeLeaderboardModal.addEventListener('click', () => {
        if (leaderboardModal) leaderboardModal.classList.remove('active');
    });
    
    const closeReactionModal = document.getElementById('closeReactionModal');
    if (closeReactionModal) closeReactionModal.addEventListener('click', () => {
        if (reactionPickerModal) reactionPickerModal.classList.remove('active');
    });
    
    const closeSavedModal = document.getElementById('closeSavedModal');
    if (closeSavedModal) closeSavedModal.addEventListener('click', () => {
        if (savedItemsModal) savedItemsModal.classList.remove('active');
    });
    
    const closeNotesModal = document.getElementById('closeNotesModal');
    if (closeNotesModal) closeNotesModal.addEventListener('click', () => {
        if (myNotesModal) myNotesModal.classList.remove('active');
    });
    
    const closeTrustStatsModal = document.getElementById('closeTrustStatsModal');
    if (closeTrustStatsModal) closeTrustStatsModal.addEventListener('click', () => {
        if (trustStatsModal) trustStatsModal.classList.remove('active');
    });
    
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', () => {
        if (marketplaceDetailPanel) marketplaceDetailPanel.classList.remove('active');
    });
    
    const saveListingBtn = document.getElementById('saveListingBtn');
    if (saveListingBtn) saveListingBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            saveToSavedItems(listingId);
        }
    });
    
    const addNoteBtn = document.getElementById('addNoteBtn');
    if (addNoteBtn) addNoteBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            showAddNoteDialog(listingId);
        }
    });
    
    const addReactionBtn = document.getElementById('addReactionBtn');
    if (addReactionBtn) addReactionBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            showReactionPicker(listingId);
        }
    });
    
    const reserveBtn = document.getElementById('reserveBtn');
    if (reserveBtn) reserveBtn.addEventListener('click', () => {
        const listingId = getCurrentListingId();
        if (listingId) {
            reserveListing(listingId);
        }
    });
    
    const tipBtn = document.getElementById('tipBtn');
    if (tipBtn) tipBtn.addEventListener('click', () => {
        const tipAmounts = document.getElementById('tipAmounts');
        if (tipAmounts) tipAmounts.classList.toggle('show');
    });
    
    document.querySelectorAll('.tip-option').forEach(option => {
        option.addEventListener('click', async function() {
            const listingId = getCurrentListingId();
            if (!listingId) return;
            
            const amount = this.dataset.amount;
            
            if (amount === 'custom') {
                const customAmount = prompt('Enter custom tip amount ($):');
                if (customAmount && !isNaN(customAmount) && parseFloat(customAmount) > 0) {
                    await sendTip(listingId, null, parseFloat(customAmount));
                }
            } else {
                await sendTip(listingId, parseFloat(amount));
            }
            
            const tipAmounts = document.getElementById('tipAmounts');
            if (tipAmounts) tipAmounts.classList.remove('show');
        });
    });
    
    const contactSellerBtn = document.getElementById('contactSellerBtn');
    if (contactSellerBtn) contactSellerBtn.addEventListener('click', () => {
        const currentListing = getCurrentListing();
        if (currentListing) {
            openChat(currentListing.userId, currentListing.user?.displayName || 'Seller');
        }
    });
    
    const shareListingBtn = document.getElementById('shareListingBtn');
    if (shareListingBtn) shareListingBtn.addEventListener('click', () => {
        const currentListing = getCurrentListing();
        if (currentListing) {
            shareListing(currentListing);
        }
    });
    
    const detailMenuBtn = document.getElementById('detailMenuBtn');
    if (detailMenuBtn) detailMenuBtn.addEventListener('click', () => {
        showDetailMenu();
    });
    
    const peopleSearch = document.getElementById('peopleSearch');
    if (peopleSearch) {
        peopleSearch.addEventListener('input', (e) => {
            filterFriends(e.target.value);
        });
    }
    
    const moodFilterIndicator = document.getElementById('moodFilterIndicator');
    if (moodFilterIndicator) moodFilterIndicator.addEventListener('click', () => {
        clearMoodFilter();
    });
    
    const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
    if (refreshAnalyticsBtn) refreshAnalyticsBtn.addEventListener('click', async () => {
        try {
            await loadAnalyticsData();
            showNotification('Analytics refreshed', 'success');
        } catch (error) {
            showNotification('Failed to refresh analytics', 'error');
        }
    });
    
    const exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');
    if (exportAnalyticsBtn) exportAnalyticsBtn.addEventListener('click', () => {
        const selectedFormat = document.querySelector('.export-option.selected')?.dataset.format || 'csv';
        exportAnalytics(selectedFormat);
    });
    
    document.querySelectorAll('[data-plan-select]').forEach(button => {
        button.addEventListener('click', function() {
            const plan = this.dataset.planSelect;
            showPaymentForm(plan);
        });
    });
    
    document.querySelectorAll('.payment-method').forEach(method => {
        method.addEventListener('click', function() {
            document.querySelectorAll('.payment-method').forEach(m => {
                m.classList.remove('selected');
            });
            this.classList.add('selected');
            
            const methodType = this.dataset.method;
            showPaymentFormForMethod(methodType);
        });
    });
    
    const completePaymentBtn = document.getElementById('completePaymentBtn');
    if (completePaymentBtn) completePaymentBtn.addEventListener('click', async () => {
        await processSubscriptionPayment();
    });
    
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', () => {
        const paymentContainer = document.getElementById('paymentContainer');
        if (paymentContainer) paymentContainer.style.display = 'none';
    });
    
    const startFreeTrialBtn = document.getElementById('startFreeTrialBtn');
    if (startFreeTrialBtn) startFreeTrialBtn.addEventListener('click', async () => {
        await startFreeTrial();
    });
    
    const restorePurchaseBtn = document.getElementById('restorePurchaseBtn');
    if (restorePurchaseBtn) restorePurchaseBtn.addEventListener('click', async () => {
        await restorePurchase();
    });
    
    const inviteTeamMemberBtn = document.getElementById('inviteTeamMemberBtn');
    if (inviteTeamMemberBtn) inviteTeamMemberBtn.addEventListener('click', () => {
        inviteTeamMember();
    });
    
    const saveTeamBtn = document.getElementById('saveTeamBtn');
    if (saveTeamBtn) saveTeamBtn.addEventListener('click', async () => {
        await saveTeamChanges();
    });
    
    const refreshLeaderboardBtn = document.getElementById('refreshLeaderboardBtn');
    if (refreshLeaderboardBtn) refreshLeaderboardBtn.addEventListener('click', async () => {
        await loadLeaderboard();
        renderLeaderboard();
        showNotification('Leaderboard refreshed', 'success');
    });
    
    document.querySelectorAll('.reaction-option').forEach(option => {
        option.addEventListener('click', function() {
            if (this.classList.contains('premium') && !isUserPremium()) {
                showNotification('Upgrade to Premium for exclusive reactions', 'info');
                return;
            }
            
            const reaction = this.dataset.reaction;
            const listingId = window.currentListingId;
            
            if (listingId) {
                addReaction(listingId, reaction);
            }
        });
    });
    
    window.addEventListener('online', () => {
        showNotification('Back online - syncing marketplace data', 'info');
        syncOfflineMarketplaceData();
    });
    
    window.addEventListener('offline', () => {
        showNotification('Marketplace working offline', 'info');
    });
    
    window.addEventListener('beforeunload', () => {
        saveAllMarketplaceData();
    });
    
    setupBackupRestoreButtons();
}

function getCurrentListingId() {
    return window.currentListingId;
}

function getCurrentListing() {
    return window.currentListingData;
}

function updateTrustCircleSelection() {
    const groupsContainer = document.getElementById('groupSelectionContainer');
    const peopleContainer = document.getElementById('peopleSelectionContainer');
    
    if (window.selectedTrustCircle === TRUST_CIRCLES.GROUPS) {
        if (groupsContainer) groupsContainer.style.display = 'block';
        if (peopleContainer) peopleContainer.style.display = 'none';
    } else if (window.selectedTrustCircle === TRUST_CIRCLES.SELECTED || window.selectedTrustCircle === TRUST_CIRCLES.MICRO) {
        if (groupsContainer) groupsContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'block';
    } else {
        if (groupsContainer) groupsContainer.style.display = 'none';
        if (peopleContainer) peopleContainer.style.display = 'none';
    }
}

function handleFileUpload(file) {
    const preview = document.getElementById('digitalPreview');
    if (!preview) return;
    
    const allowedTypes = ['.pdf', '.doc', '.docx', '.zip', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.mp4', '.mov', '.avi'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
        showNotification('File type not supported', 'error');
        return;
    }
    
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showNotification(`File size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    const progressBar = document.getElementById('uploadProgress');
    if (progressBar) progressBar.style.width = '0%';
    
    const reader = new FileReader();
    reader.onloadstart = function() {
        if (progressBar) progressBar.style.width = '10%';
    };
    
    reader.onprogress = function(e) {
        if (e.lengthComputable && progressBar) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percentLoaded + '%';
        }
    };
    
    reader.onload = function(e) {
        if (progressBar) {
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.width = '0%';
            }, 500);
        }
        
        preview.innerHTML = '';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.width = '100%';
            img.style.maxHeight = '200px';
            img.style.objectFit = 'contain';
            preview.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = e.target.result;
            video.controls = true;
            video.style.width = '100%';
            video.style.maxHeight = '200px';
            preview.appendChild(video);
        } else {
            const icon = document.createElement('div');
            icon.style.textAlign = 'center';
            icon.style.padding = '40px';
            icon.innerHTML = `
                <i class="fas fa-file-alt" style="font-size: 64px; color: var(--primary-color); margin-bottom: 15px;"></i>
                <div style="font-weight: 500;">${escapeHtml(file.name)}</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatFileSize(file.size)}
                </div>
            `;
            preview.appendChild(icon);
        }
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div>
                <div style="font-weight: 500;">${escapeHtml(file.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${formatFileSize(file.size)} • ${fileExtension.toUpperCase().replace('.', '')}</div>
            </div>
            <button class="marketplace-action-btn remove-file-btn" style="width: 36px; height: 36px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        fileInfo.querySelector('.remove-file-btn').addEventListener('click', () => {
            preview.innerHTML = '';
            window.selectedDigitalFile = null;
        });
        
        preview.appendChild(fileInfo);
        
        window.selectedDigitalFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
        };
    };
    
    reader.readAsDataURL(file);
}

function handleVideoUpload(file) {
    const maxSize = isUserPremium() ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showNotification(`Video size must be less than ${isUserPremium() ? '500MB' : '50MB'}`, 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        window.selectedVideoIntro = {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
        };
        
        showNotification('Video intro uploaded successfully', 'success');
    };
    
    reader.readAsDataURL(file);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function filterFriends(searchTerm) {
    const peopleList = document.getElementById('peopleList');
    if (!peopleList) return;
    
    const friendItems = peopleList.querySelectorAll('.circle-option');
    friendItems.forEach(item => {
        const friendName = item.querySelector('div:nth-child(2)').textContent.toLowerCase();
        if (friendName.includes(searchTerm.toLowerCase())) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showCreateListingModal() {
    if (!createListingModal) return;
    
    createListingModal.classList.add('active');
    
    const serviceTitle = document.getElementById('serviceTitle');
    const serviceDescription = document.getElementById('serviceDescription');
    const servicePrice = document.getElementById('servicePrice');
    const digitalTitle = document.getElementById('digitalTitle');
    const digitalDescription = document.getElementById('digitalDescription');
    const digitalPrice = document.getElementById('digitalPrice');
    const expiryDate = document.getElementById('expiryDate');
    const sellerNotes = document.getElementById('sellerNotes');
    const teamNotes = document.getElementById('teamNotes');
    const visibilityStart = document.getElementById('visibilityStart');
    const visibilityEnd = document.getElementById('visibilityEnd');
    const templatePrimaryColor = document.getElementById('templatePrimaryColor');
    const templateFont = document.getElementById('templateFont');
    
    if (serviceTitle) serviceTitle.value = '';
    if (serviceDescription) serviceDescription.value = '';
    if (servicePrice) servicePrice.value = '';
    if (digitalTitle) digitalTitle.value = '';
    if (digitalDescription) digitalDescription.value = '';
    if (digitalPrice) digitalPrice.value = '';
    if (expiryDate) expiryDate.value = '';
    if (sellerNotes) sellerNotes.value = '';
    if (teamNotes) teamNotes.value = '';
    if (visibilityStart) visibilityStart.value = '';
    if (visibilityEnd) visibilityEnd.value = '';
    if (templatePrimaryColor) templatePrimaryColor.value = '#0084ff';
    if (templateFont) templateFont.value = 'Default';
    
    document.querySelectorAll('.availability-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.circle-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.template-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.mood-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.duration-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    document.querySelectorAll('.schedule-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    const digitalPreview = document.getElementById('digitalPreview');
    if (digitalPreview) {
        digitalPreview.innerHTML = '';
    }
    
    const featuredListingCheckbox = document.getElementById('featuredListingCheckbox');
    const boostListingCheckbox = document.getElementById('boostListingCheckbox');
    const priorityMessagingCheckbox = document.getElementById('priorityMessagingCheckbox');
    const autoRenewCheckbox = document.getElementById('autoRenewCheckbox');
    const verifiedBadgeCheckbox = document.getElementById('verifiedBadgeCheckbox');
    const alertPoorPerformance = document.getElementById('alertPoorPerformance');
    const alertTrending = document.getElementById('alertTrending');
    const autoPublishBulk = document.getElementById('autoPublishBulk');
    const scheduleBulk = document.getElementById('scheduleBulk');
    
    if (featuredListingCheckbox) featuredListingCheckbox.checked = false;
    if (boostListingCheckbox) boostListingCheckbox.checked = false;
    if (priorityMessagingCheckbox) priorityMessagingCheckbox.checked = false;
    if (autoRenewCheckbox) autoRenewCheckbox.checked = false;
    if (verifiedBadgeCheckbox) verifiedBadgeCheckbox.checked = false;
    if (alertPoorPerformance) alertPoorPerformance.checked = false;
    if (alertTrending) alertTrending.checked = false;
    if (autoPublishBulk) autoPublishBulk.checked = false;
    if (scheduleBulk) scheduleBulk.checked = false;
    
    window.selectedAvailability = AVAILABILITY.FREE;
    window.selectedTrustCircle = TRUST_CIRCLES.FRIENDS;
    window.selectedTemplate = TEMPLATE_TYPES.BASIC;
    window.selectedMoodContext = MOOD_CONTEXTS.BROWSE;
    window.selectedDuration = '7d';
    window.selectedSchedule = 'daily';
    window.selectedDigitalFile = null;
    window.selectedVideoIntro = null;
    
    const freeAvailability = document.querySelector('.availability-option[data-availability="free"]');
    const friendsCircle = document.querySelector('.circle-option[data-circle="friends"]');
    const basicTemplate = document.querySelector('.template-option[data-template="basic"]');
    const browseMood = document.querySelector('.mood-option[data-mood="browse"]');
    const sevenDayDuration = document.querySelector('.duration-option[data-duration="7d"]');
    
    if (freeAvailability) freeAvailability.classList.add('selected');
    if (friendsCircle) friendsCircle.classList.add('selected');
    if (basicTemplate) basicTemplate.classList.add('selected');
    if (browseMood) browseMood.classList.add('selected');
    if (sevenDayDuration) sevenDayDuration.classList.add('selected');
    
    updatePremiumFeaturesVisibility();
}

function updatePremiumFeaturesVisibility() {
    if (isUserPremium()) {
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'block';
        });
        document.querySelectorAll('.premium-option').forEach(option => {
            option.disabled = false;
        });
    } else {
        document.querySelectorAll('.premium-feature').forEach(feature => {
            feature.style.display = 'none';
        });
    }
}

function showAnalyticsModal() {
    if (!analyticsModal) return;
    
    analyticsModal.classList.add('active');
    updateAnalyticsDashboard();
}

function showPremiumOptionsModal() {
    if (!premiumOptionsModal) return;
    
    premiumOptionsModal.classList.add('active');
    const paymentContainer = document.getElementById('paymentContainer');
    if (paymentContainer) paymentContainer.style.display = 'none';
}

function showTeamManagementModal() {
    if (!teamManagementModal) return;
    
    teamManagementModal.classList.add('active');
    renderTeamMembers();
}

function showLeaderboardModal() {
    if (!leaderboardModal) return;
    
    leaderboardModal.classList.add('active');
    renderLeaderboard();
}

function showReactionPicker(listingId) {
    if (!reactionPickerModal) return;
    
    reactionPickerModal.classList.add('active');
    window.currentListingId = listingId;
}

function publishListingFromModal() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    const price = tabName === 'service' ? 
        document.getElementById('servicePrice')?.value.trim() : 
        document.getElementById('digitalPrice')?.value.trim();
    
    const visibility = window.selectedTrustCircle || TRUST_CIRCLES.FRIENDS;
    const moodContext = window.selectedMoodContext || MOOD_CONTEXTS.BROWSE;
    const duration = window.selectedDuration || '7d';
    const expiresAt = duration === 'event' ? null : new Date(Date.now() + DURATION_OPTIONS[duration]).toISOString();
    
    const customExpiry = document.getElementById('expiryDate')?.value;
    const finalExpiry = customExpiry ? new Date(customExpiry).toISOString() : expiresAt;
    
    const privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    const teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    
    let allowedGroups = [];
    let allowedUsers = [];
    
    if (visibility === TRUST_CIRCLES.GROUPS) {
        allowedGroups = Array.from(document.querySelectorAll('#groupsList .circle-option.selected'))
            .map(opt => opt.dataset.groupId);
    } else if (visibility === TRUST_CIRCLES.SELECTED || visibility === TRUST_CIRCLES.MICRO) {
        allowedUsers = Array.from(document.querySelectorAll('#peopleList .circle-option.selected'))
            .map(opt => opt.dataset.friendId);
    }
    
    const visibilityStart = document.getElementById('visibilityStart')?.value;
    const visibilityEnd = document.getElementById('visibilityEnd')?.value;
    const visibilitySchedule = (visibilityStart && visibilityEnd) ? {
        start: new Date(visibilityStart).toISOString(),
        end: new Date(visibilityEnd).toISOString()
    } : null;
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('Please enter a service title', 'error');
                return;
            }
            
            const serviceData = {
                title: serviceTitle,
                description: serviceDescription || '',
                price: price || '',
                availability: window.selectedAvailability || AVAILABILITY.FREE,
                visibility: visibility,
                moodContext: moodContext,
                template: window.selectedTemplate || TEMPLATE_TYPES.BASIC,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            createServiceListing(serviceTitle, serviceDescription || '', serviceData);
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('Please enter an item title', 'error');
                return;
            }
            
            if (!window.selectedDigitalFile) {
                showNotification('Please upload a digital file', 'error');
                return;
            }
            
            const digitalData = {
                title: digitalTitle,
                description: digitalDescription || '',
                price: price || '',
                visibility: visibility,
                moodContext: moodContext,
                template: window.selectedTemplate || TEMPLATE_TYPES.BASIC,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            createDigitalListing(digitalTitle, digitalDescription || '', window.selectedDigitalFile, digitalData);
            break;
            
        default:
            showNotification('Please complete the listing form', 'info');
            return;
    }
    
    if (createListingModal) createListingModal.classList.remove('active');
}

function publishPremiumListingFromModal() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    const featured = document.getElementById('featuredListingCheckbox')?.checked || false;
    const boosted = document.getElementById('boostListingCheckbox')?.checked || false;
    const priorityMessaging = document.getElementById('priorityMessagingCheckbox')?.checked || false;
    const autoRenew = document.getElementById('autoRenewCheckbox')?.checked || false;
    const verified = document.getElementById('verifiedBadgeCheckbox')?.checked || false;
    const acceptsTips = true;
    
    const price = tabName === 'service' ? 
        document.getElementById('serviceTitle')?.value.trim() : 
        document.getElementById('digitalTitle')?.value.trim();
    
    const visibility = window.selectedTrustCircle || TRUST_CIRCLES.FRIENDS;
    const moodContext = window.selectedMoodContext || MOOD_CONTEXTS.BROWSE;
    const duration = window.selectedDuration || '7d';
    const expiresAt = duration === 'event' ? null : new Date(Date.now() + DURATION_OPTIONS[duration]).toISOString();
    
    const customExpiry = document.getElementById('expiryDate')?.value;
    const finalExpiry = customExpiry ? new Date(customExpiry).toISOString() : expiresAt;
    
    const privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    const teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    
    const template = window.selectedTemplate || TEMPLATE_TYPES.BASIC;
    const templateColor = document.getElementById('templatePrimaryColor')?.value || '#0084ff';
    const templateFont = document.getElementById('templateFont')?.value || 'Default';
    
    const schedule = window.selectedSchedule || 'daily';
    
    let allowedGroups = [];
    let allowedUsers = [];
    
    if (visibility === TRUST_CIRCLES.GROUPS) {
        allowedGroups = Array.from(document.querySelectorAll('#groupsList .circle-option.selected'))
            .map(opt => opt.dataset.groupId);
    } else if (visibility === TRUST_CIRCLES.SELECTED || visibility === TRUST_CIRCLES.MICRO) {
        allowedUsers = Array.from(document.querySelectorAll('#peopleList .circle-option.selected'))
            .map(opt => opt.dataset.friendId);
    }
    
    const visibilityStart = document.getElementById('visibilityStart')?.value;
    const visibilityEnd = document.getElementById('visibilityEnd')?.value;
    const visibilitySchedule = (visibilityStart && visibilityEnd) ? {
        start: new Date(visibilityStart).toISOString(),
        end: new Date(visibilityEnd).toISOString()
    } : null;
    
    let teamMembersList = [];
    if (userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team')) {
        teamMembersList = teamMembers.map(member => ({
            id: member.id,
            role: member.role || 'member'
        }));
    }
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('Please enter a service title', 'error');
                return;
            }
            
            const premiumServiceData = {
                title: serviceTitle,
                description: serviceDescription || '',
                price: price || '',
                availability: window.selectedAvailability || AVAILABILITY.FREE,
                visibility: visibility,
                moodContext: moodContext,
                template: template,
                templateSettings: {
                    color: templateColor,
                    font: templateFont
                },
                featured: featured,
                boosted: boosted,
                priorityMessaging: priorityMessaging,
                verified: verified,
                acceptsTips: acceptsTips,
                autoRenew: autoRenew,
                videoIntro: window.selectedVideoIntro?.url,
                teamMembers: teamMembersList,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                recurringPromotions: featured ? schedule : null,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            createPremiumServiceListing(serviceTitle, serviceDescription || '', premiumServiceData);
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('Please enter an item title', 'error');
                return;
            }
            
            if (!window.selectedDigitalFile) {
                showNotification('Please upload a digital file', 'error');
                return;
            }
            
            const premiumDigitalData = {
                title: digitalTitle,
                description: digitalDescription || '',
                price: price || '',
                visibility: visibility,
                moodContext: moodContext,
                template: template,
                templateSettings: {
                    color: templateColor,
                    font: templateFont
                },
                featured: featured,
                boosted: boosted,
                priorityMessaging: priorityMessaging,
                verified: verified,
                acceptsTips: acceptsTips,
                autoRenew: autoRenew,
                arPreview: true,
                videoIntro: window.selectedVideoIntro?.url,
                teamMembers: teamMembersList,
                allowedGroups: allowedGroups,
                allowedUsers: allowedUsers,
                visibilitySchedule: visibilitySchedule,
                recurringPromotions: featured ? schedule : null,
                expiresAt: finalExpiry,
                privateNotes: privateNotes,
                teamNotes: teamNotes
            };
            
            createPremiumDigitalListing(digitalTitle, digitalDescription || '', window.selectedDigitalFile, premiumDigitalData);
            break;
            
        default:
            showNotification('Please complete the premium listing form', 'info');
            return;
    }
    
    if (createListingModal) createListingModal.classList.remove('active');
}

function saveCurrentAsDraft() {
    const activeTab = document.querySelector('.create-listing-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    let draftData = {};
    
    switch (tabName) {
        case 'service':
            const serviceTitle = document.getElementById('serviceTitle')?.value.trim();
            const serviceDescription = document.getElementById('serviceDescription')?.value.trim();
            
            if (!serviceTitle) {
                showNotification('No service to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'service',
                title: serviceTitle,
                description: serviceDescription || '',
                price: document.getElementById('servicePrice')?.value.trim() || '',
                availability: window.selectedAvailability,
                visibility: window.selectedTrustCircle,
                moodContext: window.selectedMoodContext,
                template: window.selectedTemplate,
                duration: window.selectedDuration
            };
            break;
            
        case 'digital':
            const digitalTitle = document.getElementById('digitalTitle')?.value.trim();
            const digitalDescription = document.getElementById('digitalDescription')?.value.trim();
            
            if (!digitalTitle) {
                showNotification('No digital item to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'digital',
                title: digitalTitle,
                description: digitalDescription || '',
                price: document.getElementById('digitalPrice')?.value.trim() || '',
                file: window.selectedDigitalFile,
                visibility: window.selectedTrustCircle,
                moodContext: window.selectedMoodContext,
                template: window.selectedTemplate,
                duration: window.selectedDuration
            };
            break;
            
        case 'premium':
            const premiumTitle = document.getElementById('serviceTitle')?.value.trim() || document.getElementById('digitalTitle')?.value.trim();
            
            if (!premiumTitle) {
                showNotification('No premium listing to save as draft', 'warning');
                return;
            }
            
            draftData = {
                type: 'premium',
                title: premiumTitle,
                featured: document.getElementById('featuredListingCheckbox')?.checked || false,
                boosted: document.getElementById('boostListingCheckbox')?.checked || false,
                verified: document.getElementById('verifiedBadgeCheckbox')?.checked || false,
                autoRenew: document.getElementById('autoRenewCheckbox')?.checked || false,
                videoIntro: window.selectedVideoIntro,
                visibility: window.selectedTrustCircle,
                duration: window.selectedDuration
            };
            break;
            
        default:
            showNotification('Cannot save draft from this tab', 'warning');
            return;
    }
    
    draftData.privateNotes = document.getElementById('sellerNotes')?.value.trim() || '';
    draftData.teamNotes = document.getElementById('teamNotes')?.value.trim() || '';
    draftData.savedAt = new Date().toISOString();
    draftData.id = 'draft_' + Date.now();
    
    offlineDrafts.unshift(draftData);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
    
    showNotification('Draft saved', 'success');
}

function showPaymentForm(plan) {
    const paymentContainer = document.getElementById('paymentContainer');
    if (paymentContainer) {
        paymentContainer.style.display = 'block';
        window.selectedPlan = plan;
    }
}

function showPaymentFormForMethod(method) {
    const cardPaymentForm = document.getElementById('cardPaymentForm');
    if (cardPaymentForm) cardPaymentForm.style.display = 'none';
    
    if (method === 'card') {
        if (cardPaymentForm) cardPaymentForm.style.display = 'block';
    }
}

async function processSubscriptionPayment() {
    const selectedMethod = document.querySelector('.payment-method.selected')?.dataset.method;
    
    if (!selectedMethod) {
        showNotification('Please select a payment method', 'error');
        return;
    }
    
    try {
        const paymentData = {
            plan: window.selectedPlan,
            paymentMethod: selectedMethod,
            amount: SUBSCRIPTION_PLANS[window.selectedPlan.toUpperCase()]?.price || 9.99
        };
        
        if (selectedMethod === 'card') {
            paymentData.cardDetails = {
                number: document.getElementById('cardNumber')?.value || '',
                expiry: document.getElementById('cardExpiry')?.value || '',
                cvc: document.getElementById('cardCvc')?.value || '',
                name: document.getElementById('cardName')?.value || ''
            };
        }
        
        const response = await safeApiCall('POST', '/api/subscriptions/purchase', paymentData);
        
        if (response && response.success) {
            userSubscription = response.subscription;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(userSubscription));
            
            updatePremiumStatusUI();
            if (premiumOptionsModal) premiumOptionsModal.classList.remove('active');
            
            showNotification('Premium subscription activated successfully!', 'success');
        }
        
    } catch (error) {
        console.error('[Tool.js] Payment failed:', error);
        showNotification('Payment failed. Please try again.', 'error');
    }
}

async function startFreeTrial() {
    try {
        const response = await safeApiCall('POST', '/api/subscriptions/trial');
        
        if (response && response.success) {
            userSubscription = response.subscription;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(userSubscription));
            
            updatePremiumStatusUI();
            if (premiumOptionsModal) premiumOptionsModal.classList.remove('active');
            
            showNotification('7-day free trial started!', 'success');
        }
        
    } catch (error) {
        console.error('[Tool.js] Free trial failed:', error);
        showNotification('Free trial not available', 'error');
    }
}

async function restorePurchase() {
    try {
        const response = await safeApiCall('POST', '/api/subscriptions/restore');
        
        if (response && response.success) {
            userSubscription = response.subscription;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(userSubscription));
            
            updatePremiumStatusUI();
            if (premiumOptionsModal) premiumOptionsModal.classList.remove('active');
            
            showNotification('Purchase restored successfully!', 'success');
        } else {
            showNotification('No previous purchase found', 'info');
        }
        
    } catch (error) {
        console.error('[Tool.js] Restore failed:', error);
        showNotification('Restore failed', 'error');
    }
}

async function inviteTeamMember() {
    const email = prompt('Enter team member email:');
    if (!email) return;
    
    try {
        const response = await safeApiCall('POST', '/api/team/invite', { email });
        
        if (response && response.success) {
            showNotification('Invitation sent successfully', 'success');
        }
        
    } catch (error) {
        console.error('[Tool.js] Invitation failed:', error);
        showNotification('Invitation failed', 'error');
    }
}

async function saveTeamChanges() {
    try {
        const roleChanges = [];
        document.querySelectorAll('select[data-member-id]').forEach(select => {
            roleChanges.push({
                memberId: select.dataset.memberId,
                role: select.value
            });
        });
        
        const response = await safeApiCall('POST', '/api/team/update', { roleChanges });
        
        if (response && response.success) {
            showNotification('Team updated successfully', 'success');
            if (teamManagementModal) teamManagementModal.classList.remove('active');
        }
        
    } catch (error) {
        console.error('[Tool.js] Team update failed:', error);
        showNotification('Team update failed', 'error');
    }
}

async function addReaction(listingId, reaction) {
    try {
        const response = await safeApiCall('POST', `/api/marketplace/listings/${listingId}/reactions`, {
            reaction: reaction,
            premium: reaction.length > 2
        });
        
        if (response && response.success) {
            showNotification('Reaction added!', 'success');
            if (reactionPickerModal) reactionPickerModal.classList.remove('active');
        }
        
    } catch (error) {
        console.error('[Tool.js] Reaction failed:', error);
        showNotification('Failed to add reaction', 'error');
    }
}

function setupBackupRestoreButtons() {
    if (isUserPremium()) {
        const actionsContainer = document.querySelector('.my-listings-actions');
        if (actionsContainer) {
            if (!document.getElementById('backupDataBtn')) {
                const backupBtn = document.createElement('button');
                backupBtn.className = 'my-listing-action-btn secondary';
                backupBtn.id = 'backupDataBtn';
                backupBtn.innerHTML = '<i class="fas fa-download"></i> Backup';
                backupBtn.addEventListener('click', backupMarketplaceData);
                actionsContainer.appendChild(backupBtn);
            }
            
            if (!document.getElementById('restoreDataBtn')) {
                const restoreBtn = document.createElement('button');
                restoreBtn.className = 'my-listing-action-btn secondary';
                restoreBtn.id = 'restoreDataBtn';
                restoreBtn.innerHTML = '<i class="fas fa-upload"></i> Restore';
                restoreBtn.addEventListener('click', () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            restoreMarketplaceData(e.target.files[0]);
                        }
                    });
                    input.click();
                });
                actionsContainer.appendChild(restoreBtn);
            }
        }
    }
}

function renderPremiumListings() {
    const premiumListings = allListings.filter(listing => 
        listing.premium === true && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(premiumListings, 'No premium listings found');
}

function renderSpotlightTab() {
    const spotlightListings = allListings.filter(listing => 
        listing.featured === true && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(spotlightListings, 'No featured listings found');
}

function renderServicesList() {
    const serviceListings = allListings.filter(listing => 
        listing.type === LISTING_TYPES.SERVICE && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(serviceListings, 'No services found');
}

function renderDigitalList() {
    const digitalListings = allListings.filter(listing => 
        listing.type === LISTING_TYPES.DIGITAL && 
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(digitalListings, 'No digital items found');
}

function renderFriendsListings() {
    const friendIds = userFriends.map(friend => friend.id);
    const friendListings = allListings.filter(listing => 
        friendIds.includes(listing.userId) &&
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(friendListings, 'No friend listings found');
}

function renderGroupListings() {
    const groupListings = allListings.filter(listing => 
        listing.visibility === TRUST_CIRCLES.GROUPS &&
        isListingVisibleToUser(listing)
    );
    
    renderFilteredListings(groupListings, 'No group listings found');
}

function renderMyListings() {
    const myActiveListings = myListings.filter(listing => !isListingExpired(listing));
    renderFilteredListings(myActiveListings, 'You have no active listings');
}

function renderFilteredListings(listings, emptyMessage) {
    if (!marketplaceListContent) return;
    
    marketplaceListContent.innerHTML = '';
    
    if (listings.length === 0) {
        marketplaceListContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>${emptyMessage}</p>
                <p class="subtext">Try a different category or create your own listing</p>
            </div>
        `;
        return;
    }
    
    listings.forEach(listing => {
        addListingItem(listing);
    });
}

async function syncOfflineMarketplaceData() {
    const syncQueue = JSON.parse(localStorage.getItem('knecta_sync_queue') || '[]');
    const marketplaceItems = syncQueue.filter(item => item.type.startsWith('marketplace_'));
    
    if (marketplaceItems.length === 0) return;
    
    showNotification(`Syncing ${marketplaceItems.length} marketplace items...`, 'info');
    
    for (let i = 0; i < marketplaceItems.length; i++) {
        const item = marketplaceItems[i];
        try {
            if (item.type === 'marketplace_listing') {
                await safeApiCall('POST', '/api/marketplace/listings', item.data);
                syncQueue.splice(syncQueue.indexOf(item), 1);
            } else if (item.type === 'marketplace_premium_listing') {
                await safeApiCall('POST', '/api/marketplace/listings/premium', item.data);
                syncQueue.splice(syncQueue.indexOf(item), 1);
            }
        } catch (error) {
            item.retryCount = (item.retryCount || 0) + 1;
            
            if (item.retryCount > 3) {
                syncQueue.splice(syncQueue.indexOf(item), 1);
            }
        }
    }
    
    localStorage.setItem('knecta_sync_queue', JSON.stringify(syncQueue));
    
    if (marketplaceItems.length > 0) {
        showNotification('Marketplace data synced', 'success');
    }
}

function saveAllMarketplaceData() {
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.STREAK_DATA, streakData);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
    
    if (userSubscription) {
        saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
    }
    
    console.log('[Tool.js] All marketplace data saved to localStorage');
}

// Utility functions for missing features
function saveToSavedItems(listingId) {
    const listing = allListings.find(l => l.id === listingId);
    if (listing && !savedItems.find(item => item.id === listingId)) {
        savedItems.push(listing);
        saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
        showNotification('Listing saved', 'success');
    }
}

function showAddNoteDialog(listingId) {
    const note = prompt('Add a private note for this listing:');
    if (note) {
        privateNotes.push({
            listingId: listingId,
            note: note,
            createdAt: new Date().toISOString()
        });
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        showNotification('Note added', 'success');
    }
}

function showDetailMenu() {
    const menuItems = [
        'Report Listing',
        'Block User',
        'Copy Link',
        'Open in Browser'
    ];
    
    const selected = prompt('Select action:\n' + menuItems.map((item, i) => `${i + 1}. ${item}`).join('\n'));
    if (selected) {
        const index = parseInt(selected) - 1;
        if (index >= 0 && index < menuItems.length) {
            if (index === 2) {
                navigator.clipboard.writeText(window.location.href);
                showNotification('Link copied to clipboard', 'success');
            } else {
                showNotification(`Action: ${menuItems[index]}`, 'info');
            }
        }
    }
}

function reserveListing(listingId) {
    showNotification('Listing reserved - you will be notified when available', 'success');
}

function openChat(userId, userName) {
    showNotification(`Opening chat with ${userName}`, 'info');
}

function shareListing(listing) {
    if (navigator.share) {
        navigator.share({
            title: listing.title,
            text: listing.description,
            url: window.location.href + '?listing=' + listing.id
        });
    } else {
        navigator.clipboard.writeText(window.location.href + '?listing=' + listing.id);
        showNotification('Link copied to clipboard', 'success');
    }
}

function clearMoodFilter() {
    currentMoodFilter = null;
    localStorage.removeItem(LOCAL_STORAGE_KEYS.MOOD_FILTER);
    updateMoodFilterIndicator();
    renderMarketplaceList();
    showNotification('Mood filter cleared', 'info');
}

function showSavedItemsModal() {
    if (!savedItemsModal) return;
    
    savedItemsModal.classList.add('active');
    const savedItemsGrid = document.getElementById('savedItemsGrid');
    if (savedItemsGrid) {
        savedItemsGrid.innerHTML = '';
        
        if (savedItems.length === 0) {
            savedItemsGrid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-bookmark" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No saved items yet</p>
                    <p style="font-size: 14px; margin-top: 10px;">Save listings you're interested in</p>
                </div>
            `;
            return;
        }
        
        savedItems.forEach(item => {
            const savedItem = document.createElement('div');
            savedItem.className = 'saved-item';
            savedItem.innerHTML = `
                <div style="font-weight: 500;">${escapeHtml(item.title)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatTimeAgo(new Date(item.createdAt))}
                </div>
            `;
            savedItem.addEventListener('click', () => {
                viewListingDetail(item);
                savedItemsModal.classList.remove('active');
            });
            savedItemsGrid.appendChild(savedItem);
        });
    }
    
    const clearSavedBtn = document.getElementById('clearSavedBtn');
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all saved items?')) {
                savedItems = [];
                saveToLocalStorage(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
                showSavedItemsModal();
                showNotification('All saved items cleared', 'success');
            }
        });
    }
}

function showMyNotesModal() {
    if (!myNotesModal) return;
    
    myNotesModal.classList.add('active');
    const myNotesList = document.getElementById('myNotesList');
    if (myNotesList) {
        myNotesList.innerHTML = '';
        
        if (privateNotes.length === 0) {
            myNotesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-sticky-note" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No notes yet</p>
                    <p style="font-size: 14px; margin-top: 10px;">Add private notes to listings</p>
                </div>
            `;
            return;
        }
        
        privateNotes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'note-item';
            noteItem.innerHTML = `
                <div style="font-weight: 500;">${escapeHtml(note.note.substring(0, 50))}${note.note.length > 50 ? '...' : ''}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                    ${formatTimeAgo(new Date(note.createdAt))}
                </div>
            `;
            myNotesList.appendChild(noteItem);
        });
    }
    
    const addNewNoteBtn = document.getElementById('addNewNoteBtn');
    if (addNewNoteBtn) {
        addNewNoteBtn.addEventListener('click', () => {
            const note = prompt('Enter your private note:');
            if (note) {
                privateNotes.unshift({
                    note: note,
                    createdAt: new Date().toISOString()
                });
                saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
                showMyNotesModal();
                showNotification('Note added', 'success');
            }
        });
    }
}

console.log('[Tool.js] Enhanced marketplace system initialized successfully');
console.log('[Tool.js] Premium features enabled: Featured Listings, Advanced Analytics, Team Tools, AR Previews, Bulk Uploads, Backup & Restore');
console.log('[Tool.js] Direct token access enabled: Yes');
console.log('[Tool.js] Bootstrapped:', isBootstrapped);