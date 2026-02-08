// =============================================
// ENHANCED MARKETPLACE SYSTEM WITH PREMIUM FEATURES
// =============================================

// Import ES modules for API integration
import { 
  secureFetch, 
  getCurrentUser, 
  getUserToken, 
  login, 
  logout, 
  refreshToken,
  callApi,
  getUserGroups,
  getUserFriends,
  getTeamMembers,
  updateTeamMemberRole,
  inviteTeamMember
} from './js/api.core.js';

import {
  getMessages,
  sendMessage,
  openChat
} from './js/api.messages.js';

import {
  getAnalyticsData,
  exportAnalytics,
  trackEvent
} from './js/api.core.js';

// Global variables (only marketplace-specific)
export let currentUser = null;
export let userData = null;
export let myListings = [];
export let allListings = [];
export let savedItems = [];
export let privateNotes = [];
export let userGroups = [];
export let userFriends = [];
export let currentMoodFilter = null;
export let offlineDrafts = [];
export let trustStats = {};
export let userSubscription = null;
export let teamMembers = [];
export let leaderboardData = [];
export let analyticsData = {};
export let streakData = {};
export let premiumFeatures = {};
export let paymentMethods = [];

// Parent-Child Communication State - ENHANCED
export let parentDataLoaded = false;
export let directAPILoaded = false;
export let parentDataTimeout = 2000; // 2 seconds timeout for parent data
export let parentCommunicationId = null;
export let dataFetchInProgress = false;

// SESSION CONTROL STATE - NEW
export let parentSessionAuthority = null;
export let sessionData = null;
export let handshakeComplete = false;
export let handshakeRetryCount = 0;
export let maxHandshakeRetries = 10;
export let handshakeRetryDelay = 500;
export let sessionValidationInProgress = false;
export let uiBlockedForSession = true; // Block UI until session confirmed
export let secureMessagingChannel = null;

// Marketplace constants
export const LISTING_TYPES = {
    SERVICE: 'service',
    DIGITAL: 'digital',
    PHYSICAL: 'physical'
};

export const AVAILABILITY = {
    FREE: 'free',
    BUSY: 'busy',
    URGENT: 'urgent'
};

export const MOOD_CONTEXTS = {
    HELP: 'help',
    BROWSE: 'browse',
    LEARN: 'learn',
    URGENT: 'urgent',
    CREATIVE: 'creative',
    BUSINESS: 'business'
};

export const TRUST_CIRCLES = {
    FRIENDS: 'friends',
    GROUPS: 'groups',
    SELECTED: 'selected',
    PUBLIC: 'public',
    PREMIUM: 'premium',
    MICRO: 'micro'
};

export const DURATION_OPTIONS = {
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'event': null
};

export const TRUST_INDICATORS = {
    NEW: { text: 'New', class: 'trust-new' },
    RESPONSIVE: { text: 'Responsive', class: 'trust-responsive' },
    RELIABLE: { text: 'Reliable', class: 'trust-reliable' },
    VERIFIED: { text: 'Verified', class: 'trust-verified' },
    PRO: { text: 'Pro', class: 'trust-pro' }
};

export const SUBSCRIPTION_PLANS = {
    MONTHLY: { id: 'monthly', price: 9.99, name: 'Monthly' },
    QUARTERLY: { id: 'quarterly', price: 24.99, name: 'Quarterly' },
    YEARLY: { id: 'yearly', price: 79.99, name: 'Yearly' },
    BUSINESS: { id: 'business', price: 199.99, name: 'Business' }
};

export const SERVICE_CATEGORIES = [
    'Tutoring', 'Design', 'Repair', 'Writing', 'Consulting',
    'Programming', 'Marketing', 'Cleaning', 'Cooking', 'Fitness',
    'Music Lessons', 'Art', 'Photography', 'Video Editing', 'Translation'
];

export const PREMIUM_CATEGORIES = [
    'Business Consulting', 'Executive Coaching', 'VIP Services',
    'Enterprise Solutions', 'Premium Content', 'Exclusive Access'
];

export const DIGITAL_TYPES = [
    'Study Notes', 'Templates', 'Design Assets', 'E-books', 'Guides',
    'Worksheets', 'Presentations', 'Code Snippets', 'Audio Lessons', 'Wallpapers'
];

export const PREMIUM_DIGITAL_TYPES = [
    'Premium Templates', 'Master Classes', 'Pro Tools',
    'Exclusive Content', 'AR Assets', '3D Models'
];

export const TEMPLATE_TYPES = {
    BASIC: 'basic',
    BUSINESS: 'business',
    COACHING: 'coaching',
    CREATIVE: 'creative',
    VIP: 'vip',
    DIGITAL: 'digital'
};

// Local Storage Keys
export const LOCAL_STORAGE_KEYS = {
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

// MESSAGE TYPES for parent communication - ENHANCED
export const PARENT_MESSAGE_TYPES = {
    // Child to Parent
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_CONFIRMED: 'SESSION_CONFIRMED',
    UI_READY: 'UI_READY',
    NEED_REFRESH: 'NEED_REFRESH',
    AUTH_ERROR: 'AUTH_ERROR',
    
    // Parent to Child
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    PARENT_READY: 'PARENT_READY',
    REFRESH_UI: 'REFRESH_UI',
    FORCE_RELOAD: 'FORCE_RELOAD'
};

// Session Schema Validation
export const SESSION_SCHEMA = {
    required: ['userId', 'userToken', 'expiresAt'],
    optional: ['displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel', 'groups', 'friends']
};

// Token system state
export let isBootstrapped = false;
export let isAuthReady = false;
export let backgroundJobsStarted = false;
export let tokenInitializationPromise = null;
export let tokenRefreshInProgress = false;

// Queue API calls when token is not ready
export const apiCallQueue = [];
export let isProcessingQueue = false;

// Initialize the application with enhanced parent-child communication
export async function initializeMarketplaceCore() {
    console.log('[Tool.js] Marketplace iframe initialization started with ENHANCED parent-child communication');
    
    try {
        // Show UI immediately (no loading screens)
        showMarketplaceUI();
        
        // Step 1: Initialize enhanced parent-child communication system
        await initializeEnhancedParentCommunication();
        
        // Step 2: Wait for session data from parent
        await waitForSessionData();
        
        // Step 3: After session confirmed, initialize token system
        if (sessionData && sessionData.userToken) {
            initializeTokenSystem();
            
            // Step 4: Start background data fetching after token is ready
            tokenInitializationPromise.then(() => {
                if (!backgroundJobsStarted) {
                    startBackgroundJobs();
                    backgroundJobsStarted = true;
                }
            }).catch(error => {
                console.warn('[Tool.js] Token initialization failed, continuing offline:', error);
                // Continue with cached data
            });
        }
        
    } catch (error) {
        console.error('[Tool.js] Initialization failed:', error);
        handleInitializationFailure(error);
    }
}

// ENHANCED PARENT COMMUNICATION FUNCTIONS

/**
 * 1. Parent Detection & Secure Channel Establishment
 */
export async function initializeEnhancedParentCommunication() {
    console.log('[Tool.js] Initializing ENHANCED parent-child communication system');
    
    // Generate unique ID for this iframe
    parentCommunicationId = 'marketplace_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('[Tool.js] Parent communication ID:', parentCommunicationId);
    
    // Verify presence of window.parent
    if (!window.parent || window.parent === window) {
        console.warn('[Tool.js] Not running in iframe, standalone mode detected');
        handleStandaloneMode();
        return;
    }
    
    // Try to detect same-origin (with error handling for cross-origin)
    let sameOrigin = false;
    try {
        sameOrigin = window.location.origin === window.parent.location.origin;
    } catch (e) {
        console.warn('[Tool.js] Cross-origin iframe detected (cannot access parent location):', e.message);
        // We'll still try to communicate but with caution
    }
    
    console.log('[Tool.js] Same-origin check:', sameOrigin);
    
    // Establish secure messaging channel
    secureMessagingChannel = {
        id: parentCommunicationId,
        origin: window.location.origin,
        parentOrigin: sameOrigin ? window.parent.location.origin : '*',
        sameOrigin: sameOrigin,
        ready: false
    };
    
    // Listen for messages from parent with enhanced security
    setupSecureMessageListener();
    
    // Start handshake protocol
    startHandshakeProtocol();
    
    return new Promise((resolve) => {
        // Resolve after handshake initiated (UI will show immediately)
        resolve();
    });
}

/**
 * Setup secure message listener with validation
 */
export function setupSecureMessageListener() {
    window.addEventListener('message', handleSecureParentMessage, false);
    console.log('[Tool.js] Secure message listener established');
}

/**
 * Enhanced message handler with security checks
 */
export function handleSecureParentMessage(event) {
    // Basic security checks
    if (!validateMessageOrigin(event)) {
        console.warn('[Tool.js] Message from untrusted origin ignored:', event.origin);
        return;
    }
    
    const message = event.data;
    
    // Debug logging
    console.log('[Tool.js] Received secure message:', {
        type: message?.type,
        source: event.source === window.parent ? 'parent' : 'other',
        origin: event.origin,
        timestamp: new Date().toISOString()
    });
    
    // Handle different message types
    switch (message?.type) {
        // PARENT AUTHORITY MESSAGES
        case PARENT_MESSAGE_TYPES.PARENT_READY:
            console.log('[Tool.js] Parent ready signal received');
            handleParentReady(message);
            break;
            
        case PARENT_MESSAGE_TYPES.SESSION_DATA:
            console.log('[Tool.js] Session data received from parent authority');
            handleSessionDataFromParent(message.data);
            break;
            
        case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
            console.log('[Tool.js] Session update received');
            handleSessionUpdate(message.data);
            break;
            
        case PARENT_MESSAGE_TYPES.LOGOUT:
            console.log('[Tool.js] Logout command received');
            handleParentLogout();
            break;
            
        case PARENT_MESSAGE_TYPES.REFRESH_UI:
            console.log('[Tool.js] Refresh UI command received');
            handleRefreshUI();
            break;
            
        case PARENT_MESSAGE_TYPES.FORCE_RELOAD:
            console.log('[Tool.js] Force reload command received');
            handleForceReload();
            break;
            
        // LEGACY MESSAGE SUPPORT (for backward compatibility)
        case 'user_data':
            console.log('[Tool.js] Legacy user data received (migrating to session system)');
            migrateLegacyUserData(message.data);
            break;
            
        case 'user_profile_updated':
            console.log('[Tool.js] User profile updated from parent');
            if (message.data) {
                handleSessionUpdate(message.data);
            }
            break;
            
        case 'user_logged_in':
            console.log('[Tool.js] User logged in notification');
            sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, { force: true });
            break;
            
        case 'user_logged_out':
            console.log('[Tool.js] User logged out notification');
            handleParentLogout();
            break;
            
        case 'session_expired':
            console.log('[Tool.js] Session expired notification');
            handleSessionExpired();
            break;
            
        case 'iframe_response':
            if (message.requestId === parentCommunicationId) {
                console.log('[Tool.js] Response to our request');
                if (message.data && message.data.session) {
                    handleSessionDataFromParent(message.data.session);
                }
            }
            break;
            
        case 'ping':
            sendMessageToParent('pong', {
                id: parentCommunicationId,
                timestamp: Date.now(),
                sessionStatus: !!sessionData
            });
            break;
            
        default:
            console.log('[Tool.js] Unknown message type from parent:', message?.type);
    }
}

/**
 * Validate message origin for security
 */
export function validateMessageOrigin(event) {
    // In production, you should validate against a list of allowed origins
    // const allowedOrigins = ['https://yourdomain.com', 'https://app.yourdomain.com'];
    
    // For development, accept all origins with warning
    if (event.origin !== window.location.origin && !event.origin.includes('localhost')) {
        console.warn('[Tool.js] Message from different origin:', event.origin);
        // Still accept for now, but log warning
    }
    
    // Ensure message is from parent window
    if (event.source !== window.parent) {
        console.warn('[Tool.js] Message not from direct parent, source mismatch');
        return false;
    }
    
    return true;
}

/**
 * 2. Handshake Protocol with Exponential Backoff
 */
export function startHandshakeProtocol() {
    console.log('[Tool.js] Starting handshake protocol with parent');
    
    // Send CHILD_READY signal
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
        id: parentCommunicationId,
        type: 'marketplace',
        version: '2.1',
        features: ['session_authority', 'centralized_auth', 'ui_coordination'],
        timestamp: Date.now()
    });
    
    // Start handshake retry mechanism
    initiateHandshakeRetry();
}

/**
 * Initiate handshake with exponential backoff
 */
export function initiateHandshakeRetry() {
    if (handshakeComplete) {
        console.log('[Tool.js] Handshake already complete');
        return;
    }
    
    if (handshakeRetryCount >= maxHandshakeRetries) {
        console.error('[Tool.js] Max handshake retries reached, entering reconnect state');
        handleParentUnavailable();
        return;
    }
    
    // Calculate delay with exponential backoff
    const delay = handshakeRetryDelay * Math.pow(1.5, handshakeRetryCount);
    handshakeRetryCount++;
    
    console.log(`[Tool.js] Handshake attempt ${handshakeRetryCount}/${maxHandshakeRetries}, delay: ${delay}ms`);
    
    setTimeout(() => {
        if (!handshakeComplete) {
            // Send REQUEST_SESSION
            sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                id: parentCommunicationId,
                retryCount: handshakeRetryCount,
                lastAttempt: Date.now()
            });
            
            // Schedule next retry if still not complete
            if (!handshakeComplete) {
                initiateHandshakeRetry();
            }
        }
    }, delay);
}

/**
 * Handle parent ready signal
 */
export function handleParentReady(message) {
    console.log('[Tool.js] Parent ready, establishing session authority');
    
    parentSessionAuthority = {
        ready: true,
        version: message.version || '1.0',
        capabilities: message.capabilities || [],
        timestamp: Date.now()
    };
    
    // Immediately request session data
    sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
        id: parentCommunicationId,
        urgent: true,
        requireValidation: true
    });
    
    // Reset retry counter since we made contact
    handshakeRetryCount = 0;
}

/**
 * 3. Session Consumption & Validation
 */
export function handleSessionDataFromParent(sessionDataFromParent) {
    if (sessionValidationInProgress) {
        console.log('[Tool.js] Session validation already in progress, ignoring duplicate');
        return;
    }
    
    console.log('[Tool.js] Processing session data from parent authority');
    
    // Validate session schema
    if (!validateSessionSchema(sessionDataFromParent)) {
        console.error('[Tool.js] Invalid session schema received');
        sendMessageToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'INVALID_SESSION_SCHEMA',
            received: Object.keys(sessionDataFromParent || {})
        });
        return;
    }
    
    // Mark validation in progress
    sessionValidationInProgress = true;
    
    try {
        // Process the session data
        processSessionData(sessionDataFromParent);
        
        // Mark handshake as complete
        handshakeComplete = true;
        handshakeRetryCount = 0;
        
        // Store session data
        sessionData = sessionDataFromParent;
        
        // Update local state with session data
        updateLocalStateFromSession(sessionData);
        
        // Send confirmation to parent
        sendMessageToParent(PARENT_MESSAGE_TYPES.SESSION_CONFIRMED, {
            id: parentCommunicationId,
            userId: sessionData.userId,
            timestamp: Date.now()
        });
        
        // Unblock UI
        uiBlockedForSession = false;
        
        console.log('[Tool.js] Session consumption complete, UI ready');
        
        // Send UI ready signal
        sendMessageToParent(PARENT_MESSAGE_TYPES.UI_READY, {
            id: parentCommunicationId,
            component: 'marketplace',
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('[Tool.js] Session processing failed:', error);
        sendMessageToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'SESSION_PROCESSING_FAILED',
            message: error.message
        });
    } finally {
        sessionValidationInProgress = false;
    }
}

/**
 * Validate session schema
 */
export function validateSessionSchema(session) {
    if (!session || typeof session !== 'object') {
        console.error('[Tool.js] Session data is not an object');
        return false;
    }
    
    // Check required fields
    for (const field of SESSION_SCHEMA.required) {
        if (!session.hasOwnProperty(field) || session[field] === undefined || session[field] === null) {
            console.error(`[Tool.js] Missing required session field: ${field}`);
            return false;
        }
    }
    
    // Validate userToken
    if (!session.userToken || typeof session.userToken !== 'string' || session.userToken.length < 10) {
        console.error('[Tool.js] Invalid userToken in session');
        return false;
    }
    
    // Validate expiresAt if present
    if (session.expiresAt) {
        const expiresDate = new Date(session.expiresAt);
        if (isNaN(expiresDate.getTime())) {
            console.error('[Tool.js] Invalid expiresAt date in session');
            return false;
        }
    }
    
    console.log('[Tool.js] Session schema validation passed');
    return true;
}

/**
 * Process session data from parent
 */
export function processSessionData(sessionDataFromParent) {
    console.log(`[Tool.js] Processing session for user: ${sessionDataFromParent.userId}`);
    
    // Extract user data from session
    const userDataFromSession = {
        id: sessionDataFromParent.userId,
        displayName: sessionDataFromParent.displayName || 'User',
        email: sessionDataFromParent.email || '',
        photoURL: sessionDataFromParent.photoURL || '',
        isPremium: sessionDataFromParent.isPremium || false,
        subscription: sessionDataFromParent.subscription || null,
        trustLevel: sessionDataFromParent.trustLevel || 'new',
        groups: sessionDataFromParent.groups || [],
        friends: sessionDataFromParent.friends || []
    };
    
    // Set current user
    currentUser = userDataFromSession;
    userData = userDataFromSession;
    
    // Store user token in centralized location (for API integration)
    if (sessionDataFromParent.userToken) {
        storeCentralizedToken(sessionDataFromParent.userToken);
    }
    
    // Mark parent data as loaded
    parentDataLoaded = true;
    dataFetchInProgress = false;
    
    console.log(`[Tool.js] Session processed successfully for: ${currentUser.displayName}`);
}

/**
 * Store token in centralized location
 */
export function storeCentralizedToken(token) {
    // Store in localStorage for backward compatibility
    localStorage.setItem('USER_TOKEN', token);
    
    console.log('[Tool.js] Token stored in centralized location');
}

/**
 * Update local state from session
 */
export function updateLocalStateFromSession(session) {
    // Update user groups if provided
    if (session.groups && Array.isArray(session.groups)) {
        userGroups = session.groups;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
    }
    
    // Update user friends if provided
    if (session.friends && Array.isArray(session.friends)) {
        userFriends = session.friends;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
    }
    
    // Update subscription if provided
    if (session.subscription) {
        userSubscription = session.subscription;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
    }
    
    console.log('[Tool.js] Local state updated from session');
}

/**
 * 4. Authentication Enforcement & UI Blocking
 */
export function showMarketplaceUI() {
    console.log('[Tool.js] Showing marketplace UI immediately');
    
    // Ensure marketplace UI is visible
    const marketplaceContainer = document.getElementById('marketplaceContainer');
    if (marketplaceContainer) {
        marketplaceContainer.style.display = 'block';
        marketplaceContainer.style.opacity = '1';
        marketplaceContainer.style.visibility = 'visible';
    }
    
    // Hide any loading indicators
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    
    console.log('[Tool.js] Marketplace UI displayed');
}

/**
 * Wait for session data with timeout
 */
export async function waitForSessionData() {
    console.log('[Tool.js] Waiting for session data from parent...');
    
    return new Promise((resolve) => {
        // Check if we already have session data
        if (sessionData) {
            console.log('[Tool.js] Already have session data, proceeding');
            resolve();
            return;
        }
        
        // Set timeout for session wait (30 seconds max)
        const sessionWaitTimeout = setTimeout(() => {
            console.warn('[Tool.js] Session wait timeout, proceeding with limited functionality');
            handleSessionTimeout();
            resolve();
        }, 30000);
        
        // Check periodically if session is loaded
        const checkInterval = setInterval(() => {
            if (sessionData || !uiBlockedForSession) {
                clearInterval(checkInterval);
                clearTimeout(sessionWaitTimeout);
                console.log('[Tool.js] Session data received, proceeding');
                resolve();
            }
        }, 100);
    });
}

/**
 * Handle session timeout
 */
export function handleSessionTimeout() {
    console.log('[Tool.js] Session timeout - proceeding with limited functionality');
    
    // Show notification to user
    showNotification('Waiting for authentication. Some features may be limited.', 'warning');
    
    // Unblock UI but with limited functionality
    uiBlockedForSession = false;
    
    // Use cached data if available
    const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
    if (cachedUser) {
        try {
            const parsedUser = JSON.parse(cachedUser);
            currentUser = parsedUser;
            userData = parsedUser;
        } catch (e) {
            console.warn('[Tool.js] Failed to parse cached user data:', e);
        }
    }
}

/**
 * Handle session updates from parent
 */
export function handleSessionUpdate(updatedData) {
    console.log('[Tool.js] Handling session update from parent');
    
    // Validate update data
    if (!updatedData || typeof updatedData !== 'object') {
        console.warn('[Tool.js] Invalid session update data');
        return;
    }
    
    // Merge with existing session data
    if (sessionData) {
        sessionData = { ...sessionData, ...updatedData };
    } else {
        sessionData = updatedData;
    }
    
    // Update local state
    if (updatedData.userId && currentUser) {
        currentUser = { ...currentUser, ...updatedData };
        userData = { ...userData, ...updatedData };
        
        // Save to localStorage (non-sensitive data only)
        if (updatedData.displayName || updatedData.photoURL || updatedData.isPremium) {
            saveToLocalStorage(LOCAL_STORAGE_KEYS.USER, currentUser);
            saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_PROFILE, userData);
        }
        
        // Update premium status if subscription changed
        if (updatedData.subscription) {
            userSubscription = updatedData.subscription;
        }
    }
    
    console.log('[Tool.js] Session update processed');
}

/**
 * Handle parent logout command
 */
export function handleParentLogout() {
    console.log('[Tool.js] Handling parent logout command');
    
    // Clear all session data
    clearSessionData();
    
    // Show notification
    showNotification('You have been logged out.', 'warning');
    
    console.log('[Tool.js] Logout processing complete');
}

/**
 * Clear all session data
 */
export function clearSessionData() {
    // Clear session data
    sessionData = null;
    currentUser = null;
    userData = null;
    userSubscription = null;
    handshakeComplete = false;
    
    // Clear sensitive data from localStorage
    localStorage.removeItem('USER_TOKEN');
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
    
    // Reset parent communication flags
    parentDataLoaded = false;
    directAPILoaded = false;
    
    console.log('[Tool.js] Session data cleared');
}

/**
 * Handle refresh UI command
 */
export function handleRefreshUI() {
    console.log('[Tool.js] Refreshing UI per parent command');
}

/**
 * Handle force reload command
 */
export function handleForceReload() {
    console.log('[Tool.js] Force reload requested by parent');
    
    // Save any unsaved data
    saveAllMarketplaceData();
    
    // Reload the iframe
    window.location.reload();
}

/**
 * 5. API Integration via Centralized Channels
 */

/**
 * Enhanced secure API call that uses parent session authority
 */
export async function secureApiCall(method, endpoint, data = null, options = {}) {
    console.log(`[Tool.js] Secure API call: ${method} ${endpoint}`);
    
    // Check if we have valid session
    if (!sessionData || !sessionData.userToken) {
        console.warn('[Tool.js] No valid session for API call, queuing or rejecting');
        
        // If this is a critical call, request session refresh
        if (method !== 'GET' || endpoint.includes('/auth/')) {
            sendMessageToParent(PARENT_MESSAGE_TYPES.NEED_REFRESH, {
                reason: 'api_call_without_session',
                endpoint: endpoint,
                method: method
            });
        }
        
        throw new Error('No valid session available for API call');
    }
    
    // Queue API calls if token is not ready yet
    if (!isAuthReady) {
        return queueApiCall(method, endpoint, data, options);
    }
    
    // Use imported callApi function
    try {
        console.log('[Tool.js] Using callApi from api.core.js for secure request');
        const response = await callApi(method, endpoint, data);
        return response;
    } catch (error) {
        return handleApiError(error, method, endpoint);
    }
}

/**
 * Handle API errors with parent notification
 */
export async function handleApiError(error, method, endpoint) {
    console.error(`[Tool.js] API call failed: ${method} ${endpoint}`, error.message || error);
    
    // Notify parent of API error
    sendMessageToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
        error: 'API_CALL_FAILED',
        endpoint: endpoint,
        method: method,
        message: error.message
    });
    
    // If auth error, handle it
    if (error.status === 401 || error.status === 403) {
        return handleUnauthorized();
    }
    
    // Re-throw other errors
    throw error;
}

/**
 * Handle unauthorized responses with parent coordination
 */
export async function handleUnauthorized() {
    console.warn('[Tool.js] Unauthorized API call detected');
    
    // Notify parent immediately
    sendMessageToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
        error: 'UNAUTHORIZED_API_CALL',
        timestamp: Date.now()
    });
    
    // Clear local token
    localStorage.removeItem('USER_TOKEN');
    
    // Show user notification
    showNotification('Session expired. Please log in again.', 'error');
    
    // Wait for parent to handle session refresh
    return null;
}

/**
 * Safe API call wrapper for backward compatibility
 */
export async function safeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch (error) {
        console.warn('[Tool.js] Safe API call failed:', error.message || error);
        return null;
    }
}

/**
 * 6. Fallback Handling & Reconnection
 */
export function handleParentUnavailable() {
    console.error('[Tool.js] Parent unavailable, entering reconnection state');
    
    // Show reconnection UI
    showReconnectionState();
    
    // Periodically attempt to reconnect
    startReconnectionAttempts();
}

/**
 * Show reconnection state UI
 */
export function showReconnectionState() {
    // Create or show reconnection message
    let reconnectMsg = document.getElementById('reconnectionMessage');
    if (!reconnectMsg) {
        reconnectMsg = document.createElement('div');
        reconnectMsg.id = 'reconnectionMessage';
        reconnectMsg.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 193, 7, 0.9);
            color: #000;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        reconnectMsg.innerHTML = `
            <i class="fas fa-sync-alt fa-spin"></i>
            <span>Reconnecting to parent session...</span>
        `;
        document.body.appendChild(reconnectMsg);
    }
    
    reconnectMsg.style.display = 'flex';
    
    console.log('[Tool.js] Reconnection state displayed');
}

/**
 * Start reconnection attempts
 */
export function startReconnectionAttempts() {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 20;
    
    const attemptReconnection = () => {
        if (handshakeComplete || reconnectAttempts >= maxReconnectAttempts) {
            console.log('[Tool.js] Reconnection attempts stopped');
            return;
        }
        
        reconnectAttempts++;
        console.log(`[Tool.js] Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        
        // Send handshake request
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
            id: parentCommunicationId,
            type: 'marketplace',
            reconnection: true,
            attempt: reconnectAttempts,
            timestamp: Date.now()
        });
        
        // Schedule next attempt with exponential backoff
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
        setTimeout(attemptReconnection, delay);
    };
    
    // Start first attempt after 2 seconds
    setTimeout(attemptReconnection, 2000);
}

/**
 * Hide reconnection state
 */
export function hideReconnectionState() {
    const reconnectMsg = document.getElementById('reconnectionMessage');
    if (reconnectMsg) {
        reconnectMsg.style.display = 'none';
    }
    
    console.log('[Tool.js] Reconnection state hidden, features re-enabled');
}

/**
 * 7. Re-Synchronization & Event Listening
 */

/**
 * Setup connectivity listeners
 */
export function setupConnectivityListeners() {
    window.addEventListener('online', () => {
        console.log('[Tool.js] Browser online, checking parent connection');
        sendMessageToParent('ping', { type: 'connectivity_check' });
    });
    
    window.addEventListener('offline', () => {
        console.warn('[Tool.js] Browser offline, caching operations');
        showNotification('Working offline - changes will sync when back online', 'info');
    });
    
    console.log('[Tool.js] Connectivity listeners established');
}

/**
 * 8. Initialization Safety & Singleton Enforcement
 */

/**
 * Initialize token system with session data
 */
export function initializeTokenSystem() {
    console.log('[Tool.js] Initializing token system with session data');
    
    // Singleton check
    if (tokenInitializationPromise) {
        console.log('[Tool.js] Token system already initializing');
        return tokenInitializationPromise;
    }
    
    tokenInitializationPromise = new Promise(async (resolve, reject) => {
        try {
            // Wait for session data
            if (!sessionData || !sessionData.userToken) {
                throw new Error('No session data available for token initialization');
            }
            
            // Verify token is valid
            if (!isValidToken(sessionData.userToken)) {
                throw new Error('Invalid token in session data');
            }
            
            // Set token in centralized location
            storeCentralizedToken(sessionData.userToken);
            
            // Mark auth as ready
            isAuthReady = true;
            
            console.log('[Tool.js] Token system initialized successfully with session data');
            resolve();
            
        } catch (error) {
            console.error('[Tool.js] Token system initialization failed:', error);
            isAuthReady = true; // Allow offline mode
            reject(error);
        }
    });
    
    return tokenInitializationPromise;
}

/**
 * Check if token is valid
 */
export function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    if (token === 'undefined' || token === 'null' || token === '') return false;
    if (token.length < 10) return false; // Basic length check
    
    return true;
}

/**
 * Wait for api.core.js to be imported and ready
 */
export async function waitForApiJs() {
    return new Promise((resolve) => {
        const checkApiJs = () => {
            if (typeof callApi === 'function' && typeof getUserToken === 'function') {
                console.log('[Tool.js] api.core.js detected with session integration');
                resolve();
            } else {
                console.log('[Tool.js] Waiting for api.core.js...');
                setTimeout(checkApiJs, 100);
            }
        };
        
        // Timeout after 5 seconds
        setTimeout(() => {
            console.warn('[Tool.js] api.core.js not detected, proceeding without it');
            resolve();
        }, 5000);
        
        checkApiJs();
    });
}

/**
 * 9. Error Management & Parent Reporting
 */

/**
 * Handle initialization failure
 */
export function handleInitializationFailure(error) {
    console.error('[Tool.js] Initialization failed:', error);
    
    // Report to parent
    sendMessageToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
        error: 'INITIALIZATION_FAILED',
        component: 'marketplace',
        message: error.message,
        stack: error.stack
    });
    
    // Show user-friendly error
    showNotification('Failed to load marketplace. Some features may be limited.', 'error');
    
    // Still show UI with limited functionality
    showMarketplaceUI();
}

/**
 * Send message to parent with enhanced error handling
 */
export function sendMessageToParent(type, data = {}) {
    if (!window.parent || window.parent === window) {
        console.warn(`[Tool.js] Cannot send message ${type}: not in iframe`);
        return false;
    }
    
    try {
        const message = {
            type: type,
            source: 'marketplace_iframe',
            id: parentCommunicationId,
            timestamp: Date.now(),
            version: '2.1',
            data: data
        };
        
        console.log(`[Tool.js] Sending message to parent: ${type}`, Object.keys(data));
        
        // Send message to parent
        // Use specific origin if we know it, otherwise use '*'
        const targetOrigin = secureMessagingChannel?.sameOrigin ? 
            secureMessagingChannel.parentOrigin : '*';
        
        window.parent.postMessage(message, targetOrigin);
        
        return true;
    } catch (error) {
        console.error(`[Tool.js] Error sending message ${type} to parent:`, error);
        return false;
    }
}

/**
 * 10. Compatibility & Legacy Support
 */

/**
 * Migrate legacy user data to session system
 */
export function migrateLegacyUserData(legacyData) {
    console.log('[Tool.js] Migrating legacy user data to session system');
    
    // Convert legacy format to session format
    const sessionData = {
        userId: legacyData.id || legacyData._id || 'unknown',
        userToken: getCentralizedToken() || '',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // Default 1 hour
        displayName: legacyData.displayName || '',
        email: legacyData.email || '',
        photoURL: legacyData.photoURL || '',
        isPremium: legacyData.isPremium || false,
        subscription: legacyData.subscription || null,
        trustLevel: legacyData.trustLevel || 'new'
    };
    
    // Process as session data
    handleSessionDataFromParent(sessionData);
}

/**
 * Get centralized token with legacy support
 */
export function getCentralToken() {
    // Priority 1: Use session data if available
    if (sessionData && sessionData.userToken) {
        console.log('[Tool.js] Token from session data');
        return sessionData.userToken;
    }
    
    // Priority 2: Use imported getUserToken() if available
    if (typeof getUserToken === 'function') {
        try {
            const token = getUserToken();
            if (token) {
                console.log('[Tool.js] Token from getUserToken()');
                return token;
            }
        } catch (e) {
            console.warn('[Tool.js] Failed to get token from getUserToken():', e);
        }
    }
    
    // Priority 3: Check for legacy tokens
    const legacyTokens = [
        'accessToken',
        'moodchat_token', 
        'authToken',
        'knecta_auth_token',
        'USER_TOKEN'
    ];
    
    for (const tokenKey of legacyTokens) {
        const legacyToken = localStorage.getItem(tokenKey);
        if (legacyToken) {
            console.log(`[Tool.js] Found legacy token ${tokenKey}`);
            return legacyToken;
        }
    }
    
    return null;
}

/**
 * Handle standalone mode (not in iframe)
 */
export function handleStandaloneMode() {
    console.log('[Tool.js] Running in standalone mode');
    
    // Show notification
    showNotification('Running in standalone mode. Parent coordination disabled.', 'warning');
    
    // Unblock UI
    uiBlockedForSession = false;
    
    // Try to load user data from localStorage
    const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
    if (cachedUser) {
        try {
            const parsedUser = JSON.parse(cachedUser);
            currentUser = parsedUser;
            userData = parsedUser;
        } catch (e) {
            console.warn('[Tool.js] Failed to parse cached user data:', e);
        }
    }
}

/**
 * Bootstrap iframe with session integration
 */
export async function bootstrapIframe() {
    console.log('[Tool.js] Bootstrapping marketplace iframe with session integration');
    
    if (isBootstrapped) {
        console.log('[Tool.js] Already bootstrapped');
        return;
    }
    
    // Wait for session data
    if (!sessionData) {
        console.warn('[Tool.js] No session data available, bootstrapping with limited functionality');
    }
    
    // Wait for token system initialization
    try {
        await tokenInitializationPromise;
    } catch (error) {
        console.warn('[Tool.js] Token system not ready, continuing offline');
    }
    
    // Load cached data for immediate UI
    loadCachedDataInstantly();
    
    // Verify auth if we have a token
    if (sessionData && sessionData.userToken) {
        try {
            // Try to validate via secure API call
            const userResponse = await secureApiCall('GET', '/api/auth/verify');
            if (userResponse && userResponse.valid) {
                console.log('[Tool.js] Session verified via secure API');
            }
        } catch (error) {
            console.warn('[Tool.js] Session verification failed:', error.message);
            // Continue with cached user
        }
    }
    
    isBootstrapped = true;
    console.log('[Tool.js] Marketplace iframe bootstrapped successfully with session integration');
}

// Load cached data for instant display
export function loadCachedDataInstantly() {
    console.log('[Tool.js] Loading cached marketplace data (non-sensitive)');
    
    try {
        // Load user from cache immediately (non-sensitive data only)
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                const parsedUser = JSON.parse(cachedUser);
                // Only use non-sensitive fields
                if (parsedUser.displayName || parsedUser.photoURL) {
                    if (!currentUser) currentUser = {};
                    if (!userData) userData = {};
                    
                    currentUser.displayName = parsedUser.displayName || currentUser.displayName;
                    currentUser.photoURL = parsedUser.photoURL || currentUser.photoURL;
                    userData.displayName = parsedUser.displayName || userData.displayName;
                    userData.photoURL = parsedUser.photoURL || userData.photoURL;
                    
                    console.log('[Tool.js] Loaded non-sensitive user data from cache');
                }
            } catch (e) {
                console.warn('[Tool.js] Failed to parse cached user data:', e);
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
        }
        
        // Load user groups (non-sensitive)
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) {
            userGroups = JSON.parse(groupsData);
        }
        
        // Load user friends (non-sensitive)
        const friendsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (friendsData) {
            userFriends = JSON.parse(friendsData);
        }
        
        // Load user subscription (non-sensitive)
        const subscriptionData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (subscriptionData) {
            userSubscription = JSON.parse(subscriptionData);
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
        
    } catch (error) {
        console.error('[Tool.js] Error in instant cache load:', error);
    }
}

export async function initializeEnhancedMarketplace() {
    console.log('[Tool.js] Enhanced marketplace initialization');
    
    checkDarkMode();
    await checkUserPremiumStatus();
    await loadEnhancedMarketplaceData();
    cleanupExpiredListings();
    
    console.log('[Tool.js] Enhanced marketplace initialization complete');
}

export async function checkUserPremiumStatus() {
    try {
        const localSubscription = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (localSubscription) {
            userSubscription = JSON.parse(localSubscription);
            
            if (userSubscription.expiresAt && new Date(userSubscription.expiresAt) < new Date()) {
                userSubscription = null;
                localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
            } else {
                return;
            }
        }
        
        const response = await safeApiCall('GET', '/api/user/subscription');
        if (response && response.subscription) {
            userSubscription = response.subscription;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(userSubscription));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error checking premium status:', error);
    }
}

export async function loadEnhancedMarketplaceData() {
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

export async function loadListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/listings');
        
        if (response && response.listings) {
            allListings = response.listings;
            allListings = allListings.filter(listing => !isListingExpired(listing));
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading listings from backend:', error);
        throw error;
    }
}

export async function loadUserGroups() {
    try {
        const groups = await getUserGroups();
        
        if (groups && Array.isArray(groups)) {
            userGroups = groups;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(userGroups));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading user groups:', error);
    }
}

export async function loadUserFriends() {
    try {
        const friends = await getUserFriends();
        
        if (friends && Array.isArray(friends)) {
            userFriends = friends;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_FRIENDS, JSON.stringify(userFriends));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading user friends:', error);
    }
}

export async function loadTeamMembers() {
    try {
        if (userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team')) {
            const members = await getTeamMembers();
            
            if (members && Array.isArray(members)) {
                teamMembers = members;
                localStorage.setItem(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, JSON.stringify(teamMembers));
            }
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading team members:', error);
    }
}

export async function loadLeaderboard() {
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

export async function loadAnalyticsData() {
    try {
        if (isUserPremium()) {
            const analytics = await getAnalyticsData();
            
            if (analytics) {
                analyticsData = analytics;
                localStorage.setItem(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
            }
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading analytics:', error);
    }
}

export async function loadPremiumFeatures() {
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

export async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        
        if (response && response.spotlightListings) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, JSON.stringify(response.spotlightListings));
        }
        
    } catch (error) {
        console.error('[Tool.js] Error loading spotlight listings:', error);
    }
}

export function updateListingCounts() {
    updateAvailableListingsCount();
}

export function updateAvailableListingsCount() {
}

export function isUserPremium() {
    return userSubscription && userSubscription.status === 'active';
}

export function isListingVisibleToUser(listing) {
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

export function filterListingsByMood(listings, mood) {
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

export function getTrustIndicator(userId, trustLevel) {
    if (trustLevel) {
        return `<span class="trust-indicator ${TRUST_INDICATORS[trustLevel.toUpperCase()]?.class || 'trust-new'}">${TRUST_INDICATORS[trustLevel.toUpperCase()]?.text || 'New'}</span>`;
    }
    
    return '<span class="trust-indicator trust-new">New</span>';
}

export async function trackListingView(listingId) {
    if (!analyticsData.views) analyticsData.views = 0;
    analyticsData.views++;
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    
    try {
        safeApiCall('POST', `/api/marketplace/listings/${listingId}/view`);
    } catch (error) {
        console.error('[Tool.js] Error tracking view:', error);
    }
}

export function updateTrustStats(action) {
    if (!trustStats[action]) trustStats[action] = 0;
    trustStats[action]++;
    saveToLocalStorage(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
}

// Premium Listing Creation Functions
export async function createPremiumServiceListing(title, description, premiumOptions = {}) {
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
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    if (premiumOptions.featured || premiumOptions.boosted) {
        processPremiumPayment(listing, premiumOptions);
    }
    
    return listing;
}

export async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
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
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    if (premiumOptions.featured || premiumOptions.boosted) {
        processPremiumPayment(listing, premiumOptions);
    }
    
    return listing;
}

export async function processFeaturedListing(listing) {
    try {
        const spotlightListings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || '[]');
        spotlightListings.unshift(listing);
        localStorage.setItem(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, JSON.stringify(spotlightListings));
        
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
        
    } catch (error) {
        console.error('[Tool.js] Error processing featured listing:', error);
    }
}

export async function processBoostedListing(listing) {
    try {
        await safeApiCall('POST', '/api/marketplace/boost', { 
            listingId: listing.id,
            duration: '24h'
        });
        
    } catch (error) {
        console.error('[Tool.js] Error processing boosted listing:', error);
    }
}

export async function processPremiumPayment(listing, options) {
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
            return true;
        }
        
    } catch (error) {
        console.error('[Tool.js] Payment processing failed:', error);
    }
    
    return false;
}

export function calculatePremiumCost(options) {
    let cost = 0;
    
    if (options.featured) cost += 5;
    if (options.boosted) cost += 3;
    if (options.verified) cost += 10;
    if (options.autoRenew) cost += 1;
    
    return cost;
}

// Tip System
export async function sendTip(listingId, amount, customAmount = null) {
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
            updateAnalyticsData('tipReceived', finalAmount);
            
            return true;
        }
        
    } catch (error) {
        console.error('[Tool.js] Error sending tip:', error);
    }
    
    return false;
}

// Analytics Functions
export function updateAnalyticsData(type, value) {
    if (!analyticsData[type]) {
        analyticsData[type] = 0;
    }
    
    analyticsData[type] += value;
    localStorage.setItem(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
}

// Streak System
export function updateListingStreak() {
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
    
    checkStreakRewards();
}

export function checkStreakRewards() {
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

export function awardTemporaryPremium(days) {
    const tempPremium = {
        status: 'active',
        plan: 'temporary',
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        features: ['featured_listings', 'advanced_analytics']
    };
    
    userSubscription = tempPremium;
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, JSON.stringify(tempPremium));
}

// Bulk Upload Functions
export async function processBulkUpload(file) {
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

export function parseCSV(content) {
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

export async function uploadBulkListings(listings) {
    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/bulk', listing);
            
            if (response && response.success) {
            }
        } catch (error) {
        }
    }
    
    saveToLocalStorage(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
}

// Export Functions
export async function exportAnalyticsData(format) {
    try {
        const result = await exportAnalytics(format);
        
        if (result && result.downloadUrl) {
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `analytics_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        }
    } catch (error) {
        console.error('[Tool.js] Export failed:', error);
    }
}

// Backup & Restore Functions
export async function backupMarketplaceData() {
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
        
    } catch (error) {
        console.error('[Tool.js] Backup failed:', error);
    }
}

export async function restoreMarketplaceData(file) {
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
        };
        
        reader.readAsText(file);
        
    } catch (error) {
        console.error('[Tool.js] Restore failed:', error);
    }
}

// Helper Functions
export function isListingExpired(listing) {
    if (!listing.expiresAt) return false;
    return new Date(listing.expiresAt) < new Date();
}

export function cleanupExpiredListings() {
    const expiredListings = allListings.filter(listing => isListingExpired(listing));
    if (expiredListings.length > 0) {
        allListings = allListings.filter(listing => !isListingExpired(listing));
        localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_LISTINGS, JSON.stringify(allListings));
        
        myListings = myListings.filter(listing => !isListingExpired(listing));
        saveToLocalStorage(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        console.log(`[Tool.js] Cleaned up ${expiredListings.length} expired listings`);
    }
}

export function formatTimeAgo(date) {
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

export function showNotification(message, type = 'success') {
    const notificationText = document.getElementById('notificationText');
    if (!notificationText) return;
    
    notificationText.textContent = message;
    
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.className = 'notification';
    notification.classList.add(type);
    
    notification.classList.add('active');
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

export function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('[Tool.js] Error saving to localStorage:', error);
    }
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function checkDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.setAttribute('data-theme', 'dark');
    }
}

export function queueForSync(data, type) {
    const syncQueue = JSON.parse(localStorage.getItem('knecta_sync_queue') || '[]');
    syncQueue.push({
        type: 'marketplace_' + type,
        data: data,
        timestamp: Date.now(),
        retryCount: 0
    });
    localStorage.setItem('knecta_sync_queue', JSON.stringify(syncQueue));
}

export function formatTimeRemaining(date) {
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    return 'soon';
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function createServiceListing(title, description, options = {}) {
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
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    return listing;
}

export function createDigitalListing(title, description, fileData, options = {}) {
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
    
    updateListingStreak();
    
    updateTrustStats('listingCreated');
    
    return listing;
}

// Sample data generation for demo/offline mode
export function generateSampleMarketplaceData() {
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
        
        console.log('[Tool.js] Sample marketplace data generated for demo');
    }
}

export async function syncOfflineMarketplaceData() {
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

export function saveAllMarketplaceData() {
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

export function queueApiCall(method, endpoint, data, options) {
    return new Promise((resolve, reject) => {
        apiCallQueue.push({
            method,
            endpoint,
            data,
            options,
            resolve,
            reject,
            timestamp: Date.now()
        });
        
        console.log(`[Tool.js] Queued API call: ${method} ${endpoint} (queue size: ${apiCallQueue.length})`);
        
        // Start processing queue if not already doing so
        if (!isProcessingQueue) {
            processApiCallQueue();
        }
    });
}

export async function processApiCallQueue() {
    if (isProcessingQueue || apiCallQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    // Wait for token to be ready
    try {
        await tokenInitializationPromise;
    } catch (error) {
        console.warn('[Tool.js] Token initialization failed, clearing queue');
        // Reject all queued calls
        apiCallQueue.forEach(call => {
            call.reject(new Error('Token initialization failed'));
        });
        apiCallQueue.length = 0;
        isProcessingQueue = false;
        return;
    }
    
    console.log(`[Tool.js] Processing API call queue (${apiCallQueue.length} calls)`);
    
    // Process each call in the queue
    while (apiCallQueue.length > 0) {
        const call = apiCallQueue.shift();
        
        try {
            const result = await secureApiCall(call.method, call.endpoint, call.data, call.options);
            call.resolve(result);
        } catch (error) {
            call.reject(error);
        }
        
        // Small delay between calls to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    isProcessingQueue = false;
    console.log('[Tool.js] API call queue processed');
}

// Authenticated API call wrapper for backward compatibility
export async function authenticatedApiCall(method, endpoint, data = null) {
    return await safeApiCall(method, endpoint, data);
}

// Backward compatibility for existing code
export async function makeApiCall(method, endpoint, data = null) {
    return await secureApiCall(method, endpoint, data);
}

// Start background jobs only once
export function startBackgroundJobs() {
    if (!isAuthReady || backgroundJobsStarted) {
        return;
    }
    
    console.log('[Tool.js] Starting background data jobs');
    backgroundJobsStarted = true;
    
    // Start background data loading
    setTimeout(() => {
        loadEnhancedMarketplaceData().catch(error => {
            console.warn('[Tool.js] Background data load failed:', error.message);
        });
    }, 1000);
    
    // Check premium status in background
    setTimeout(() => {
        checkUserPremiumStatus().catch(error => {
            console.warn('[Tool.js] Premium status check failed:', error.message);
        });
    }, 1500);
}

// Handle session expired
export function handleSessionExpired() {
    console.log('[Tool.js] Handling session expired notification');
    
    // Clear authentication token
    localStorage.removeItem('USER_TOKEN');
    
    // Show session expired message
    showNotification('Your session has expired. Please log in again.', 'error');
    
    // Try to refresh token if possible
    if (typeof refreshToken === 'function') {
        refreshToken().catch(() => {
            // If refresh fails, trigger logout
            handleParentLogout();
        });
    } else {
        // If no refresh function, trigger logout
        handleParentLogout();
    }
}

// Request user data from parent (legacy function)
export function requestParentUserData() {
    console.log('[Tool.js] Requesting user data from parent...');
    
    const requestSent = sendMessageToParent('get_user_data', {
        fields: ['id', 'displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel']
    });
    
    if (requestSent) {
        // Set timeout for parent response
        setTimeout(() => {
            if (!parentDataLoaded && !dataFetchInProgress) {
                console.log('[Tool.js] Parent data request timeout, falling back to direct API');
                fetchUserDataDirectly();
            }
        }, parentDataTimeout);
    } else {
        console.log('[Tool.js] Could not send request to parent, falling back to direct API');
        fetchUserDataDirectly();
    }
}

// Fetch user data directly from API (legacy function)
export async function fetchUserDataDirectly() {
    if (dataFetchInProgress) {
        console.log('[Tool.js] User data fetch already in progress');
        return;
    }
    
    console.log('[Tool.js] Fetching user data directly from API...');
    dataFetchInProgress = true;
    
    try {
        // Check if we have a valid token first
        const token = getCentralToken();
        if (!token) {
            console.warn('[Tool.js] No authentication token available for direct API fetch');
            
            // Check if we have cached user data
            const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                console.log('[Tool.js] Using cached user data');
                const parsedUser = JSON.parse(cachedUser);
                processUserData(parsedUser, 'cache');
                dataFetchInProgress = false;
                return;
            }
            
            throw new Error('No authentication token available');
        }
        
        // Use secure API call to fetch user profile
        const response = await secureApiCall('GET', '/api/user/profile');
        
        if (response && response.user) {
            console.log('[Tool.js] Successfully fetched user data from API:', response.user);
            
            // Mark that direct API data is loaded
            directAPILoaded = true;
            parentDataLoaded = false; // Ensure we don't try to load from parent again
            dataFetchInProgress = false;
            
            // Process the user data
            processUserData(response.user, 'api');
            
            // Notify parent that we have user data (in case parent wants to sync)
            sendMessageToParent('user_data_loaded', {
                source: 'direct_api',
                userId: response.user.id
            });
        } else {
            throw new Error('Invalid response from user profile API');
        }
        
    } catch (error) {
        console.error('[Tool.js] Failed to fetch user data directly:', error);
        dataFetchInProgress = false;
        
        // If we're in an iframe and haven't received parent data yet, wait a bit longer
        if (window.parent !== window && !parentDataLoaded) {
            console.log('[Tool.js] Will retry parent data request');
            // Could implement a retry mechanism here
        } else {
            // Try to use cached data as last resort
            const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                console.log('[Tool.js] Falling back to cached user data');
                const parsedUser = JSON.parse(cachedUser);
                processUserData(parsedUser, 'cache_fallback');
            } else {
                console.warn('[Tool.js] No user data available from any source');
                showNotification('Unable to load user profile. Some features may be limited.', 'warning');
            }
        }
    }
}

// Process user data from any source (legacy function)
export function processUserData(userDataFromSource, source) {
    console.log(`[Tool.js] Processing user data from ${source}:`, {
        id: userDataFromSource.id,
        displayName: userDataFromSource.displayName,
        email: userDataFromSource.email
    });
    
    // Set current user
    currentUser = userDataFromSource;
    userData = userDataFromSource;
    
    // Save to localStorage for offline use
    saveToLocalStorage(LOCAL_STORAGE_KEYS.USER, currentUser);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_PROFILE, userData);
    
    // Log the source for debugging
    console.log(`[Tool.js] User data loaded from ${source}:`, {
        id: currentUser.id,
        name: currentUser.displayName,
        source: source
    });
}

// Handle user data received from parent (legacy function)
export function handleParentUserData(userDataFromParent) {
    if (parentDataLoaded || dataFetchInProgress) {
        console.log('[Tool.js] Already loaded user data, ignoring duplicate from parent');
        return;
    }
    
    console.log('[Tool.js] Processing user data from parent:', userDataFromParent);
    
    // Validate the data
    if (!userDataFromParent || (!userDataFromParent.id && !userDataFromParent.email)) {
        console.warn('[Tool.js] Invalid user data received from parent:', userDataFromParent);
        
        // If we got invalid data from parent, try direct API
        if (!dataFetchInProgress) {
            fetchUserDataDirectly();
        }
        return;
    }
    
    // Mark that parent data is loaded
    parentDataLoaded = true;
    dataFetchInProgress = false;
    
    // Process the user data
    processUserData(userDataFromParent, 'parent');
}

// Update user data when parent sends updates (legacy function)
export function updateUserDataFromParent(updatedData) {
    console.log('[Tool.js] Updating user data from parent update:', updatedData);
    
    // Merge with existing data
    if (currentUser) {
        currentUser = { ...currentUser, ...updatedData };
    } else {
        currentUser = updatedData;
    }
    
    if (userData) {
        userData = { ...userData, ...updatedData };
    } else {
        userData = updatedData;
    }
    
    // Save to localStorage
    saveToLocalStorage(LOCAL_STORAGE_KEYS.USER, currentUser);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.USER_PROFILE, userData);
    
    // Check premium status if subscription data was updated
    if (updatedData.subscription) {
        userSubscription = updatedData.subscription;
    }
}

// Handle user logout (legacy function)
export function handleUserLogout() {
    console.log('[Tool.js] Handling user logout notification');
    
    // Clear user data
    currentUser = null;
    userData = null;
    userSubscription = null;
    
    // Clear localStorage (but keep some cached data for re-login)
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
    
    showNotification('You have been logged out.', 'warning');
}