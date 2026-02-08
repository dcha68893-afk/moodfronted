// =============================================
// STATUS SYSTEM - CENTRALIZED TOKEN ACCESS - CORE
// =============================================

// Import required API modules
import { 
  secureFetch, 
  getCurrentUser, 
  getUserToken,
  login,
  logout,
  validateSession,
  updateSession
} from './js/api.core.js';

import {
  sendParentMessage,
  listenToParentMessages,
  MESSAGE_TYPES
} from './js/api.messages.js';

// Global variables
export let currentUser = null;
export let userData = null;
export let statuses = [];
export let myStatuses = [];
export let friendsStatuses = [];
export let closeFriendsStatuses = [];
export let pinnedStatuses = [];
export let mutedStatuses = [];
export let microCirclesStatuses = [];
export let highlights = [];
export let drafts = [];
export let scheduledStatuses = [];
export let viewedStatuses = new Set();
export let mutedUsers = new Set();
export let currentViewerStatus = null;
export let currentSlideIndex = 0;
export let autoAdvanceInterval = null;
export let isAutoAdvancePaused = false;
export let progressInterval = null;
export let currentCategoryFilter = 'all';
export let currentIntentFilter = null;
export let currentMoodFilter = null;
export let isMobile = window.innerWidth <= 768;
export let isOfflineMode = false;
export let pendingReplies = [];
export let pendingReactions = [];
export let moodChartData = [];
export let streakCount = 0;
export let lastPostDate = null;
export let activeFilters = new Set();
export let selectedDraft = null;

// Authentication variables
export let apiReadyReceived = false;
export let apiCheckInterval = null;
export let authValidated = false;
export let authChecked = false;
export let isBackgroundInitialized = false;
export let isTokenReady = false;
export let tokenReadyCallbacks = [];
export let pendingApiRequests = [];

// Parent Coordination System
export let parentCoordinator = {
    isInitialized: false,
    handshakeComplete: false,
    sessionData: null,
    messageChannel: null,
    handshakeRetries: 0,
    maxHandshakeRetries: 10,
    handshakeInterval: null,
    parentOrigin: null
};

// Status types
export const statusTypes = {
    'text': {
        name: 'Text Status',
        icon: 'fas fa-font',
        color: 'var(--primary-color)'
    },
    'media': {
        name: 'Media Status',
        icon: 'fas fa-image',
        color: 'var(--success-color)'
    },
    'poll': {
        name: 'Poll Status',
        icon: 'fas fa-poll',
        color: 'var(--warning-color)'
    }
};

// Status intents
export const statusIntents = {
    'feedback': {
        name: 'Looking for feedback',
        icon: 'fas fa-comments',
        color: 'var(--intent-feedback)'
    },
    'achievement': {
        name: 'Sharing achievement',
        icon: 'fas fa-trophy',
        color: 'var(--intent-achievement)'
    },
    'advice': {
        name: 'Need advice',
        icon: 'fas fa-hands-helping',
        color: 'var(--intent-advice)'
    },
    'chat': {
        name: 'Available to chat',
        icon: 'fas fa-comment-dots',
        color: 'var(--intent-chat)'
    },
    'venting': {
        name: 'Just venting',
        icon: 'fas fa-wind',
        color: 'var(--intent-venting)'
    },
    'reflection': {
        name: 'Personal reflection',
        icon: 'fas fa-brain',
        color: 'var(--intent-reflection)'
    },
    'question': {
        name: 'Asking a question',
        icon: 'fas fa-question-circle',
        color: 'var(--intent-question)'
    },
    'celebration': {
        name: 'Celebration',
        icon: 'fas fa-glass-cheers',
        color: 'var(--intent-celebration)'
    }
};

// Moods
export const statusMoods = {
    'happy': {
        name: 'Happy',
        emoji: '😊',
        color: 'var(--mood-happy)'
    },
    'stressed': {
        name: 'Stressed',
        emoji: '😫',
        color: 'var(--mood-stressed)'
    },
    'motivated': {
        name: 'Motivated',
        emoji: '💪',
        color: 'var(--mood-motivated)'
    },
    'lonely': {
        name: 'Lonely',
        emoji: '😔',
        color: 'var(--mood-lonely)'
    },
    'excited': {
        name: 'Excited',
        emoji: '🤩',
        color: 'var(--mood-excited)'
    },
    'calm': {
        name: 'Calm',
        emoji: '😌',
        color: 'var(--mood-calm)'
    },
    'sad': {
        name: 'Sad',
        emoji: '😢',
        color: 'var(--mood-sad)'
    },
    'angry': {
        name: 'Angry',
        emoji: '😠',
        color: 'var(--mood-angry)'
    }
};

// Categories
export const statusCategories = {
    'life': {
        name: 'Life',
        icon: 'fas fa-heart',
        color: 'var(--category-life)'
    },
    'business': {
        name: 'Business',
        icon: 'fas fa-briefcase',
        color: 'var(--category-business)'
    },
    'study': {
        name: 'Study',
        icon: 'fas fa-graduation-cap',
        color: 'var(--category-study)'
    },
    'motivation': {
        name: 'Motivation',
        icon: 'fas fa-fire',
        color: 'var(--category-motivation)'
    },
    'event': {
        name: 'Event',
        icon: 'fas fa-calendar-alt',
        color: 'var(--category-event)'
    }
};

// Action buttons
export const actionButtons = {
    'message': {
        name: 'Message me',
        icon: 'fas fa-comments',
        color: 'var(--primary-color)'
    },
    'join': {
        name: 'Join discussion',
        icon: 'fas fa-users',
        color: 'var(--success-color)'
    },
    'vote': {
        name: 'Vote now',
        icon: 'fas fa-vote-yea',
        color: 'var(--warning-color)'
    },
    'book': {
        name: 'Book a call',
        icon: 'fas fa-phone',
        color: 'var(--info-color)'
    },
    'learn': {
        name: 'Learn more',
        icon: 'fas fa-book',
        color: 'var(--primary-color)'
    },
    'support': {
        name: 'Show support',
        icon: 'fas fa-hands-helping',
        color: 'var(--success-color)'
    },
    'collaborate': {
        name: 'Collaborate',
        icon: 'fas fa-handshake',
        color: 'var(--warning-color)'
    },
    'resource': {
        name: 'View resource',
        icon: 'fas fa-external-link-alt',
        color: 'var(--info-color)'
    }
};

// Privacy settings
export const privacySettings = {
    'everyone': {
        name: 'Everyone',
        description: 'Visible to all Knecta users',
        icon: 'fas fa-globe'
    },
    'friends': {
        name: 'Friends Only',
        description: 'Visible to your friends only',
        icon: 'fas fa-user-friends'
    },
    'close-friends': {
        name: 'Close Friends',
        description: 'Visible to close friends only',
        icon: 'fas fa-heart'
    },
    'except': {
        name: 'All Except...',
        description: 'Hide from specific people',
        icon: 'fas fa-user-minus'
    },
    'specific': {
        name: 'Specific People...',
        description: 'Share with select individuals',
        icon: 'fas fa-user-check'
    },
    'micro-circle': {
        name: 'Micro Circle',
        description: 'Share with a specific group',
        icon: 'fas fa-users'
    }
};

// Duration options
export const durationOptions = {
    '3600': '1 hour',
    '21600': '6 hours',
    '43200': '12 hours',
    '86400': '24 hours',
    '0': 'Permanent'
};

// Report reasons
export const reportReasons = {
    'spam': 'Spam',
    'inappropriate': 'Inappropriate Content',
    'harassment': 'Harassment',
    'false-info': 'False Information',
    'violence': 'Violence',
    'hate-speech': 'Hate Speech',
    'self-harm': 'Self-Harm',
    'copyright': 'Copyright Violation'
};

// Reactions
export const reactions = {
    'like': '👍',
    'love': '❤️',
    'helpful': '💡',
    'inspiring': '✨',
    'funny': '😂',
    'not-useful': '👎'
};

// Emojis for picker
export const emojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '😱', '👍', '👎', '❤️', '🔥', '💯', '✨', '🎉', '🙏', '🤝', '💪', '👏', '🙌', '🤗', '😇', '🥺', '🤯', '😳', '🤪', '😜', '🤓', '😎', '🥶', '😈', '👻', '💀', '👀', '🦄', '🐶', '🐱', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐵', '🦉', '🐣', '🦋', '🐝', '🐙', '🦑', '🐋', '🦈', '🐊', '🦒', '🐘', '🦏', '🦘', '🐫', '🦙', '🦌', '🐎', '🐖', '🐑', '🐕', '🐈', '🐇', '🦔', '🐿️', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'];

// Background options
export const backgroundOptions = [
    { id: '1', type: 'solid', color: 'var(--status-bg-1)' },
    { id: '2', type: 'solid', color: 'var(--status-bg-2)' },
    { id: '3', type: 'solid', color: 'var(--status-bg-3)' },
    { id: '4', type: 'solid', color: 'var(--status-bg-4)' },
    { id: '5', type: 'solid', color: 'var(--status-bg-5)' },
    { id: '6', type: 'solid', color: 'var(--status-bg-6)' },
    { id: '7', type: 'solid', color: 'var(--status-bg-7)' },
    { id: '8', type: 'solid', color: 'var(--status-bg-8)' },
    { id: 'gradient-1', type: 'gradient', gradient: 'linear-gradient(45deg, #667eea, #764ba2)' },
    { id: 'gradient-2', type: 'gradient', gradient: 'linear-gradient(45deg, #f6d365, #fda085)' },
    { id: 'gradient-3', type: 'gradient', gradient: 'linear-gradient(45deg, #a8edea, #fed6e3)' },
    { id: 'gradient-4', type: 'gradient', gradient: 'linear-gradient(45deg, #ff6b6b, #ffa726)' }
];

// Templates
export const statusTemplates = {
    'motivation': {
        name: 'Motivation',
        text: 'Today is a new opportunity to be better than yesterday. Keep pushing forward! 💪',
        background: 'gradient-2',
        mood: 'motivated',
        intent: 'reflection'
    },
    'question': {
        name: 'Question',
        text: 'What\'s the best piece of advice you\'ve ever received? 🤔',
        background: '3',
        mood: 'curious',
        intent: 'question'
    },
    'achievement': {
        name: 'Achievement',
        text: 'Just reached a personal milestone! Celebrating small wins along the way. 🎉',
        background: 'gradient-1',
        mood: 'happy',
        intent: 'achievement'
    },
    'reflection': {
        name: 'Reflection',
        text: 'Taking a moment to reflect on what truly matters in life. Peace comes from within. ✨',
        background: '6',
        mood: 'calm',
        intent: 'reflection'
    }
};

// Local Storage Keys
export const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'knecta_user_token',
    STATUSES: 'knecta_statuses_cache',
    MY_STATUSES: 'knecta_my_statuses_cache',
    VIEWED_STATUSES: 'knecta_viewed_statuses',
    MUTED_USERS: 'knecta_muted_users',
    HIGHLIGHTS: 'knecta_status_highlights',
    DRAFTS: 'knecta_status_drafts',
    SCHEDULED: 'knecta_scheduled_statuses',
    PENDING_REPLIES: 'knecta_pending_replies',
    PENDING_REACTIONS: 'knecta_pending_reactions',
    MOOD_DATA: 'knecta_mood_data',
    STREAK: 'knecta_posting_streak',
    LAST_POST_DATE: 'knecta_last_post_date',
    OFFLINE_QUEUE: 'knecta_offline_status_queue',
    LAST_SYNC: 'knecta_status_last_sync'
};

// Unified token key
export const UNIFIED_TOKEN_KEY = 'USER_TOKEN';

// =============================================
// PARENT COORDINATION SYSTEM
// =============================================

/**
 * Initialize parent coordination system
 */
export function initializeParentCoordination() {
    if (parentCoordinator.isInitialized) {
        console.warn('[Status] Parent coordination already initialized');
        return;
    }

    console.log('[Status] Initializing parent coordination system');
    
    try {
        // 1. Verify parent presence
        if (!window.parent || window.parent === window) {
            console.error('[Status] No parent window found or same window');
            handleParentUnavailable();
            return;
        }

        // 2. Establish message channel
        parentCoordinator.messageChannel = window;
        parentCoordinator.parentOrigin = window.location.origin;
        
        // 3. Setup message listener using imported function
        listenToParentMessages(handleParentMessage);
        
        // 4. Start handshake protocol
        startHandshakeProtocol();
        
        parentCoordinator.isInitialized = true;
        console.log('[Status] Parent coordination system initialized');
        
    } catch (error) {
        console.error('[Status] Failed to initialize parent coordination:', error);
        handleParentUnavailable();
    }
}

/**
 * Handle parent messages
 */
function handleParentMessage(event) {
    try {
        // Security: Verify message origin
        if (event.origin !== window.location.origin && event.origin !== parentCoordinator.parentOrigin) {
            console.warn('[Status] Message from untrusted origin:', event.origin);
            return;
        }

        const message = event.data;
        if (!message || !message.type) {
            return;
        }

        console.log('[Status] Received message from parent:', message.type);

        switch (message.type) {
            case MESSAGE_TYPES.SESSION_DATA:
                handleSessionData(message.data);
                break;
                
            case MESSAGE_TYPES.SESSION_UPDATE:
                handleSessionUpdate(message.data);
                break;
                
            case MESSAGE_TYPES.LOGOUT:
                handleLogout(message.data);
                break;
                
            case MESSAGE_TYPES.API_RESPONSE:
                handleApiResponse(message.data);
                break;
                
            case MESSAGE_TYPES.API_ERROR:
                handleApiError(message.data);
                break;
                
            case MESSAGE_TYPES.AUTH_VALIDATED:
                handleAuthValidated(message.data);
                break;
                
            default:
                console.log('[Status] Unhandled message type:', message.type);
        }
    } catch (error) {
        console.error('[Status] Error handling parent message:', error);
    }
}

/**
 * Start handshake protocol with parent
 */
export function startHandshakeProtocol() {
    console.log('[Status] Starting handshake protocol');
    
    // Clear any existing handshake interval
    if (parentCoordinator.handshakeInterval) {
        clearInterval(parentCoordinator.handshakeInterval);
    }
    
    // Initial handshake attempt using imported function
    sendParentMessage(MESSAGE_TYPES.CHILD_READY, {
        module: 'status',
        version: '1.0',
        timestamp: Date.now()
    });
    
    // Start retry mechanism with exponential backoff
    parentCoordinator.handshakeRetries = 0;
    parentCoordinator.handshakeInterval = setInterval(() => {
        if (parentCoordinator.handshakeComplete) {
            clearInterval(parentCoordinator.handshakeInterval);
            return;
        }
        
        parentCoordinator.handshakeRetries++;
        
        if (parentCoordinator.handshakeRetries >= parentCoordinator.maxHandshakeRetries) {
            console.error('[Status] Handshake failed after maximum retries');
            clearInterval(parentCoordinator.handshakeInterval);
            handleParentUnavailable();
            return;
        }
        
        // Calculate backoff delay
        const backoffDelay = Math.min(1000 * Math.pow(2, parentCoordinator.handshakeRetries), 10000);
        const jitter = Math.random() * 500;
        
        console.log(`[Status] Handshake retry ${parentCoordinator.handshakeRetries} (delay: ${backoffDelay + jitter}ms)`);
        
        setTimeout(() => {
            if (!parentCoordinator.handshakeComplete) {
                sendParentMessage(MESSAGE_TYPES.REQUEST_SESSION, {
                    module: 'status',
                    retryCount: parentCoordinator.handshakeRetries,
                    timestamp: Date.now()
                });
            }
        }, backoffDelay + jitter);
        
    }, 1000);
}

/**
 * Send message to parent
 */
export function sendToParent(type, data = {}) {
    try {
        if (!window.parent || window.parent === window) {
            console.error('[Status] Cannot send message: no parent window');
            return;
        }

        const message = {
            type,
            data: {
                ...data,
                source: 'status',
                timestamp: Date.now()
            }
        };

        console.log('[Status] Sending to parent:', type);
        sendParentMessage(type, data);
        
    } catch (error) {
        console.error('[Status] Error sending message to parent:', error);
    }
}

/**
 * Handle session data from parent
 */
export function handleSessionData(sessionData) {
    console.log('[Status] Received session data from parent:', sessionData);
    
    try {
        // Validate session data schema using imported function
        if (!validateSessionData(sessionData)) {
            console.error('[Status] Invalid session data schema');
            sendToParent(MESSAGE_TYPES.CHILD_ERROR, {
                error: 'INVALID_SESSION_SCHEMA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        // Store session data
        parentCoordinator.sessionData = sessionData;
        parentCoordinator.handshakeComplete = true;
        
        // Clear handshake retry interval
        if (parentCoordinator.handshakeInterval) {
            clearInterval(parentCoordinator.handshakeInterval);
            parentCoordinator.handshakeInterval = null;
        }
        
        // Update local state with session data
        updateLocalStateWithSession(sessionData);
        
        // Notify parent that session was received
        sendToParent(MESSAGE_TYPES.AUTH_VALIDATED, {
            module: 'status',
            success: true
        });
        
        // Start background initialization with session
        startBackgroundInitializationWithSession();
        
        console.log('[Status] Session data processed successfully');
        
    } catch (error) {
        console.error('[Status] Error handling session data:', error);
        sendToParent(MESSAGE_TYPES.CHILD_ERROR, {
            error: 'SESSION_PROCESSING_ERROR',
            message: error.message
        });
    }
}

/**
 * Validate session data schema
 */
export function validateSessionData(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return false;
    }
    
    // Basic validation
    const requiredFields = ['user', 'token', 'permissions'];
    for (const field of requiredFields) {
        if (!sessionData[field]) {
            console.warn(`[Status] Missing required field: ${field}`);
            return false;
        }
    }
    
    // User validation
    if (!sessionData.user.id || !sessionData.user.displayName) {
        console.warn('[Status] Invalid user data');
        return false;
    }
    
    // Token validation
    if (typeof sessionData.token !== 'string' || sessionData.token.length < 10) {
        console.warn('[Status] Invalid token');
        return false;
    }
    
    return true;
}

/**
 * Update local state with session data
 */
export function updateLocalStateWithSession(sessionData) {
    console.log('[Status] Updating local state with session data');
    
    try {
        // Update current user
        currentUser = sessionData.user;
        userData = sessionData.user;
        
        // Store in localStorage for offline use (non-sensitive data only)
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(sessionData.user));
        
        // Initialize token ready state
        isTokenReady = true;
        triggerTokenReadyCallbacks();
        
        // Process any pending API requests
        processPendingApiRequests();
        
        console.log('[Status] Local state updated with session');
        
    } catch (error) {
        console.error('[Status] Error updating local state:', error);
    }
}

/**
 * Handle session update from parent
 */
export function handleSessionUpdate(updateData) {
    console.log('[Status] Received session update:', updateData);
    
    try {
        if (updateData.user) {
            currentUser = updateData.user;
            userData = updateData.user;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(updateData.user));
        }
        
        if (updateData.token) {
            // Token updated, refresh state
            parentCoordinator.sessionData.token = updateData.token;
        }
        
        if (updateData.permissions) {
            parentCoordinator.sessionData.permissions = updateData.permissions;
        }
        
        console.log('[Status] Session updated successfully');
        
    } catch (error) {
        console.error('[Status] Error handling session update:', error);
    }
}

/**
 * Handle logout from parent
 */
export function handleLogout(logoutData) {
    console.log('[Status] Received logout command');
    
    try {
        // Clear all session data
        parentCoordinator.sessionData = null;
        parentCoordinator.handshakeComplete = false;
        
        // Clear local user data
        currentUser = null;
        userData = null;
        localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
        
        // Show logout state
        sendToParent(MESSAGE_TYPES.CHILD_READY, {
            module: 'status',
            loggedOut: true,
            timestamp: Date.now()
        });
        
        console.log('[Status] Logout processed successfully');
        
    } catch (error) {
        console.error('[Status] Error handling logout:', error);
    }
}

/**
 * Handle parent unavailable
 */
export function handleParentUnavailable() {
    console.log('[Status] Parent unavailable, entering standalone mode');
    
    // Load cached data for basic UI
    loadCachedDataInstantly();
}

/**
 * Start background initialization with session
 */
export function startBackgroundInitializationWithSession() {
    if (isBackgroundInitialized) {
        console.log('[Status] Background already initialized');
        return;
    }
    
    console.log('[Status] Starting background initialization with session');
    
    try {
        // Load fresh data in background
        setTimeout(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                console.log('[Status] Background initialization complete');
                
                // Notify parent that UI is ready
                sendToParent(MESSAGE_TYPES.UI_READY, {
                    module: 'status',
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('[Status] Background initialization error:', error);
            }
        }, 1000);
        
    } catch (error) {
        console.error('[Status] Error starting background initialization:', error);
    }
}

/**
 * Make API request through parent
 */
export async function makeParentApiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Generate unique request ID
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Setup response handler
            const responseHandler = (event) => {
                try {
                    if (event.origin !== window.location.origin) {
                        return;
                    }
                    
                    const message = event.data;
                    if (!message || !message.type || !message.data || message.data.requestId !== requestId) {
                        return;
                    }
                    
                    if (message.type === MESSAGE_TYPES.API_RESPONSE) {
                        window.removeEventListener('message', responseHandler);
                        resolve(message.data.response);
                    } else if (message.type === MESSAGE_TYPES.API_ERROR) {
                        window.removeEventListener('message', responseHandler);
                        reject(new Error(message.data.error || 'API Error'));
                    }
                } catch (error) {
                    window.removeEventListener('message', responseHandler);
                    reject(error);
                }
            };
            
            // Listen for response
            window.addEventListener('message', responseHandler);
            
            // Send request to parent using imported function
            sendParentMessage(MESSAGE_TYPES.API_REQUEST, {
                requestId,
                endpoint,
                options: {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    credentials: 'include'
                }
            });
            
            // Set timeout
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, 30000);
            
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Handle API response from parent
 */
export function handleApiResponse(responseData) {
    // This is handled in the promise-based makeParentApiRequest
    console.log('[Status] API response received:', responseData.requestId);
}

/**
 * Handle API error from parent
 */
export function handleApiError(errorData) {
    // This is handled in the promise-based makeParentApiRequest
    console.error('[Status] API error received:', errorData);
}

/**
 * Handle auth validated
 */
export function handleAuthValidated(data) {
    console.log('[Status] Auth validated by parent:', data);
    
    if (data.success) {
        // Auth successful
        isTokenReady = true;
        triggerTokenReadyCallbacks();
    }
}

// =============================================
// CENTRALIZED TOKEN ACCESS SYSTEM (UPDATED)
// =============================================

/**
 * Wait for api.core.js to be ready and token available
 * @returns {Promise<boolean>} True when token is ready
 */
export function waitForTokenReady() {
    return new Promise((resolve) => {
        if (isTokenReady) {
            resolve(true);
            return;
        }

        // First check parent session
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) {
            isTokenReady = true;
            resolve(true);
            triggerTokenReadyCallbacks();
            return;
        }

        // Fallback to legacy check using imported function
        const checkToken = () => {
            const token = getUnifiedToken();
            if (token) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }

            // Wait and check again
            setTimeout(checkToken, 100);
        };

        checkToken();
    });
}

/**
 * Register callback when token is ready
 * @param {Function} callback - Function to call when token is ready
 */
export function onTokenReady(callback) {
    if (isTokenReady) {
        callback();
    } else {
        tokenReadyCallbacks.push(callback);
    }
}

/**
 * Trigger all token ready callbacks
 */
export function triggerTokenReadyCallbacks() {
    while (tokenReadyCallbacks.length > 0) {
        const callback = tokenReadyCallbacks.shift();
        try {
            callback();
        } catch (error) {
            console.error('[Status] Token ready callback error:', error);
        }
    }
}

/**
 * Get unified token from centralized source
 * @returns {string|null} Token or null if not available
 */
export function getUnifiedToken() {
    // Priority 1: Parent session
    if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData && parentCoordinator.sessionData.token) {
        return parentCoordinator.sessionData.token;
    }

    // Priority 2: Imported function from api.core.js
    try {
        const token = getUserToken();
        if (token && typeof token === 'string' && token.length > 10) {
            return token;
        }
    } catch (error) {
        console.warn('[Status] Failed to get token from api.core.js:', error.message);
    }

    // Priority 3: Unified localStorage key
    try {
        const token = localStorage.getItem(UNIFIED_TOKEN_KEY);
        if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
            if (token.split('.').length === 3) {
                return token;
            }
        }
    } catch (error) {
        console.warn('[Status] Error reading unified token:', error.message);
    }

    // Priority 4: Legacy token migration (one-time check)
    const legacyToken = migrateLegacyTokens();
    if (legacyToken) {
        return legacyToken;
    }

    return null;
}

/**
 * Migrate legacy tokens to unified system
 * @returns {string|null} Migrated token or null
 */
export function migrateLegacyTokens() {
    const legacyKeys = [
        'knecta_access_token',
        'accessToken',
        'moodchat_token',
        'auth_token',
        'knecta_token'
    ];

    for (const key of legacyKeys) {
        try {
            const token = localStorage.getItem(key);
            if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
                if (token.split('.').length === 3) {
                    // Store in unified location
                    localStorage.setItem(UNIFIED_TOKEN_KEY, token);
                    console.log('[Status] Migrated legacy token from', key);
                    return token;
                }
            }
        } catch (error) {
            console.warn('[Status] Error checking legacy token', key, ':', error.message);
        }
    }

    return null;
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if authenticated
 */
export function isAuthenticated() {
    // First check parent session
    if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) {
        return true;
    }
    
    // Fallback to token check using imported function
    return getUnifiedToken() !== null;
}

/**
 * Queue API request until token is ready
 * @param {Function} requestFunction - Function that returns Promise
 * @returns {Promise<any>} Request result
 */
export async function queueApiRequest(requestFunction) {
    if (isTokenReady) {
        return requestFunction();
    }

    return new Promise((resolve, reject) => {
        pendingApiRequests.push({ requestFunction, resolve, reject });
        
        // Start token readiness check if not already started
        if (!apiCheckInterval) {
            startTokenReadinessCheck();
        }
    });
}

/**
 * Process pending API requests
 */
export function processPendingApiRequests() {
    while (pendingApiRequests.length > 0) {
        const { requestFunction, resolve, reject } = pendingApiRequests.shift();
        requestFunction().then(resolve).catch(reject);
    }
}

/**
 * Start checking for token readiness
 */
export function startTokenReadinessCheck() {
    if (apiCheckInterval) {
        clearInterval(apiCheckInterval);
    }

    apiCheckInterval = setInterval(() => {
        if (isTokenReady || getUnifiedToken() || parentCoordinator.handshakeComplete) {
            clearInterval(apiCheckInterval);
            apiCheckInterval = null;
            isTokenReady = true;
            processPendingApiRequests();
            triggerTokenReadyCallbacks();
        }
    }, 100);
}

/**
 * Make secure API call with centralized token handling
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<any>} API response
 */
export async function secureApiCall(endpoint, options = {}) {
    // If offline mode, queue for later
    if (isOfflineMode && options.method && options.method !== 'GET') {
        console.log('[Status] Offline mode: Queueing request for', endpoint);
        return Promise.reject(new Error('Offline mode'));
    }

    // Check if we should use parent API
    if (parentCoordinator.handshakeComplete) {
        try {
            console.log('[Status] Using parent API for:', endpoint);
            return await makeParentApiRequest(endpoint, options);
        } catch (error) {
            console.error('[Status] Parent API request failed:', error);
            // Fall back to direct API call
        }
    }

    // Check if token is ready
    const token = getUnifiedToken();
    if (!token) {
        console.log('[Status] Token not available, queuing request');
        return queueApiRequest(() => secureApiCall(endpoint, options));
    }

    try {
        console.log('[Status] Making secure API call to:', endpoint);
        
        // Use imported secureFetch function from api.core.js
        const response = await secureFetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        return response;
        
    } catch (error) {
        console.error('[Status] Secure API call error:', error);
        
        // Check for auth errors
        const isAuthError = error.message?.includes('401') || 
                           error.message?.includes('403') ||
                           error.message?.includes('Unauthorized') || 
                           error.message?.includes('Authentication') || 
                           error.message?.includes('Session');
        
        if (isAuthError) {
            console.log('[Status] Authentication failed, switching to offline mode');
            isOfflineMode = true;
            handleAuthError('Authentication failed. Using offline mode.');
        }
        
        throw error;
    }
}

// =============================================
// INSTANT UI RENDERING WITH CACHED DATA
// =============================================

/**
 * Initialize UI immediately with cached data (non-blocking)
 */
export function initializeUIWithCachedData() {
    console.log('[Status] Initializing UI with cached data');
    
    try {
        // Load user from cache
        loadUserFromCache();
        
        // Load all cached data
        loadCachedDataInstantly();
        
        console.log('[Status] UI rendered with cached data');
        
        // Start background initialization after parent coordination
        if (parentCoordinator.handshakeComplete) {
            startBackgroundInitializationWithSession();
        } else {
            // Wait for parent handshake
            setTimeout(() => {
                if (!parentCoordinator.handshakeComplete) {
                    console.log('[Status] Parent handshake pending, showing cached data');
                }
            }, 2000);
        }
        
    } catch (error) {
        console.error('[Status] Error initializing UI with cached data:', error);
    }
}

/**
 * Load user from cache
 */
export function loadUserFromCache() {
    try {
        const userData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (userData && userData !== 'undefined' && userData !== 'null') {
            const user = JSON.parse(userData);
            if (user && typeof user === 'object' && user.id) {
                currentUser = user;
                userData = user;
            }
        }
    } catch (error) {
        console.warn('[Status] Error loading user from cache:', error.message);
    }
}

/**
 * Load cached data instantly for offline use
 */
export function loadCachedDataInstantly() {
    console.log('[Status] Loading cached data instantly...');
    
    try {
        // Load statuses
        const statusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            try {
                statuses = JSON.parse(statusesData);
                console.log('[Status] Loaded statuses from cache:', statuses.length);
            } catch (parseError) {
                console.error('[Status] Error parsing cached statuses:', parseError);
            }
        }
        
        // Load my statuses
        const myStatusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_STATUSES);
        if (myStatusesData) {
            try {
                myStatuses = JSON.parse(myStatusesData);
            } catch (parseError) {
                console.error('[Status] Error parsing cached my statuses:', parseError);
            }
        }
        
        // Load viewed statuses
        const viewedStatusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.VIEWED_STATUSES);
        if (viewedStatusesData) {
            try {
                viewedStatuses = new Set(JSON.parse(viewedStatusesData));
            } catch (parseError) {
                console.error('[Status] Error parsing viewed statuses:', parseError);
            }
        }
        
        // Load muted users
        const mutedUsersData = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_USERS);
        if (mutedUsersData) {
            try {
                mutedUsers = new Set(JSON.parse(mutedUsersData));
            } catch (parseError) {
                console.error('[Status] Error parsing muted users:', parseError);
            }
        }
        
        // Load highlights
        const highlightsData = localStorage.getItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
        if (highlightsData) {
            try {
                highlights = JSON.parse(highlightsData);
            } catch (parseError) {
                console.error('[Status] Error parsing highlights:', parseError);
            }
        }
        
        // Load drafts
        const draftsData = localStorage.getItem(LOCAL_STORAGE_KEYS.DRAFTS);
        if (draftsData) {
            try {
                drafts = JSON.parse(draftsData);
            } catch (parseError) {
                console.error('[Status] Error parsing drafts:', parseError);
            }
        }
        
        // Load scheduled statuses
        const scheduledData = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULED);
        if (scheduledData) {
            try {
                scheduledStatuses = JSON.parse(scheduledData);
            } catch (parseError) {
                console.error('[Status] Error parsing scheduled statuses:', parseError);
            }
        }
        
        // Load pending replies
        const pendingRepliesData = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_REPLIES);
        if (pendingRepliesData) {
            try {
                pendingReplies = JSON.parse(pendingRepliesData);
            } catch (parseError) {
                console.error('[Status] Error parsing pending replies:', parseError);
            }
        }
        
        // Load pending reactions
        const pendingReactionsData = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_REACTIONS);
        if (pendingReactionsData) {
            try {
                pendingReactions = JSON.parse(pendingReactionsData);
            } catch (parseError) {
                console.error('[Status] Error parsing pending reactions:', parseError);
            }
        }
        
        // Load mood data
        const moodData = localStorage.getItem(LOCAL_STORAGE_KEYS.MOOD_DATA);
        if (moodData) {
            try {
                moodChartData = JSON.parse(moodData);
            } catch (parseError) {
                console.error('[Status] Error parsing mood data:', parseError);
            }
        }
        
        // Load streak data
        const streakData = localStorage.getItem(LOCAL_STORAGE_KEYS.STREAK);
        if (streakData) {
            try {
                streakCount = parseInt(streakData);
            } catch (parseError) {
                console.error('[Status] Error parsing streak data:', parseError);
            }
        }
        
        // Load last post date
        const lastPostDateData = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE);
        if (lastPostDateData) {
            try {
                lastPostDate = new Date(lastPostDateData);
            } catch (parseError) {
                console.error('[Status] Error parsing last post date:', parseError);
            }
        }
        
        console.log('[Status] Cached data loaded successfully');
        
    } catch (error) {
        console.error('[Status] Error loading cached data:', error);
    }
}

// =============================================
// BACKGROUND INITIALIZATION
// =============================================

/**
 * Start background initialization when token is ready
 */
export async function startBackgroundInitialization() {
    if (isBackgroundInitialized) {
        console.log('[Status] Background already initialized');
        return;
    }
    
    console.log('[Status] Starting background initialization');
    
    try {
        // Wait for token readiness (non-blocking)
        onTokenReady(async () => {
            try {
                console.log('[Status] Token ready, loading fresh data in background');
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                console.log('[Status] Background initialization complete');
                
                // Notify parent that UI is ready
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.error('[Status] Background data loading error:', error);
            }
        });
        
        // Also check immediately in case token is already ready
        if (getUnifiedToken() || parentCoordinator.handshakeComplete) {
            console.log('[Status] Token/session already available, starting immediate background load');
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                console.log('[Status] Background initialization complete');
                
                // Notify parent that UI is ready
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.error('[Status] Immediate background load error:', error);
            }
        }
        
    } catch (error) {
        console.error('[Status] Background initialization error:', error);
    }
}

/**
 * Load fresh data in background for silent updates
 */
export async function loadFreshDataInBackground() {
    try {
        console.log('[Status] Loading fresh data in background');
        
        const loadPromises = [];
        
        loadPromises.push(safeApiOperation(() => loadStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadMyStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadHighlightsInBackground()));
        loadPromises.push(safeApiOperation(() => loadUserDataInBackground()));
        
        await Promise.allSettled(loadPromises);
        
        console.log('[Status] Background data loading complete');
        
    } catch (error) {
        console.error('[Status] Background data loading error:', error);
    }
}

/**
 * Safe API operation with error containment
 * @param {Function} operation - Async operation
 * @returns {Promise<any>}
 */
export async function safeApiOperation(operation) {
    try {
        if (!isAuthenticated()) {
            throw new Error('Not authenticated');
        }
        
        return await operation();
    } catch (error) {
        console.log('[Status] Safe API operation failed:', error.message);
        
        // Don't switch to offline mode automatically
        // User can still use cached data
        return null;
    }
}

/**
 * Load statuses in background
 */
export async function loadStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses');
        if (response && response.statuses) {
            statuses = response.statuses;
            statuses = filterStatusesByPrivacy(statuses);
            statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            
            console.log('[Status] Statuses updated from background:', statuses.length);
        }
    } catch (error) {
        console.log('[Status] Failed to load statuses in background:', error.message);
        throw error;
    }
}

/**
 * Load my statuses in background
 */
export async function loadMyStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/my');
        if (response && response.statuses) {
            myStatuses = response.statuses;
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            console.log('[Status] My statuses updated from background:', myStatuses.length);
        }
    } catch (error) {
        console.log('[Status] Failed to load my statuses in background:', error.message);
        throw error;
    }
}

/**
 * Load highlights in background
 */
export async function loadHighlightsInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/highlights');
        if (response && response.highlights) {
            highlights = response.highlights;
            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            console.log('[Status] Highlights updated from background:', highlights.length);
        }
    } catch (error) {
        console.log('[Status] Failed to load highlights in background:', error.message);
        throw error;
    }
}

/**
 * Load user data in background
 */
export async function loadUserDataInBackground() {
    try {
        const response = await secureApiCall('/api/user/me');
        if (response && response.user) {
            currentUser = response.user;
            userData = response.user;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(response.user));
            console.log('[Status] User data updated from background');
        }
    } catch (error) {
        console.log('[Status] Failed to load user data in background:', error.message);
        throw error;
    }
}

// =============================================
// ENHANCED BOOTSTRAP WITH CENTRALIZED TOKEN
// =============================================

/**
 * Enhanced bootstrap process
 * @returns {Promise<boolean>} Success status
 */
export async function bootstrapApplication() {
    console.log('[Status] Enhanced application bootstrap start');
    
    try {
        // Phase 1: Initialize parent coordination
        initializeParentCoordination();
        
        // Phase 2: Immediate UI with cached data (non-blocking)
        initializeUIWithCachedData();
        
        // Phase 3: Start token readiness check
        startTokenReadinessCheck();
        
        // Phase 5: Notify parent that child is loaded
        setTimeout(() => {
            sendToParent(MESSAGE_TYPES.CHILD_LOADED, {
                module: 'status',
                timestamp: Date.now()
            });
        }, 500);
        
        return true;
        
    } catch (error) {
        console.error('[Status] Enhanced bootstrap error:', error);
        return false;
    }
}

// =============================================
// AUTHENTICATION ERROR HANDLING
// =============================================

/**
 * Handle authentication errors gracefully
 * @param {string} message - Error message
 */
export function handleAuthError(message) {
    console.error('[Status] Authentication failed:', message);
    
    // Notify parent about auth error
    if (parentCoordinator.handshakeComplete) {
        sendToParent(MESSAGE_TYPES.NEEDS_AUTH, {
            module: 'status',
            error: message,
            timestamp: Date.now()
        });
    }
    
    if (statuses.length === 0 && myStatuses.length === 0) {
        console.log('[Status] Auth error with no cached data');
    } else {
        console.log('[Status] Using cached data. Some features may be limited.');
        isOfflineMode = true;
    }
}

/**
 * Initialize status system with fallback to cached data
 */
export async function initializeStatusSystem() {
    console.log('[Status] Initializing status system');
    
    try {
        // Try to load fresh data with timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading data')), 10000)
        );
        
        await Promise.race([loadInitialData(), timeoutPromise]);
        
        if (currentUser) {
            console.log(`[Status] Welcome back, ${currentUser.displayName || 'User'}!`);
        }
        
        console.log('[Status] Status system initialized successfully');
        
    } catch (error) {
        console.error('[Status] Error initializing status system:', error);
        
        // Fallback to cached data
        loadCachedDataInstantly();
        
        if (!isOfflineMode) {
            console.log('[Status] Could not connect to server. Using cached data.');
            isOfflineMode = true;
        }
    }
}

/**
 * Load initial data from API
 */
export async function loadInitialData() {
    try {
        console.log('[Status] Loading initial data from API');
        
        const loadPromises = [];
        
        loadPromises.push(safeApiOperation(async () => {
            const statusesResponse = await secureApiCall('/api/statuses');
            if (statusesResponse && statusesResponse.statuses) {
                statuses = statusesResponse.statuses;
                console.log('[Status] Loaded statuses from API:', statuses.length);
                
                statuses = filterStatusesByPrivacy(statuses);
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const myStatusesResponse = await secureApiCall('/api/statuses/my');
            if (myStatusesResponse && myStatusesResponse.statuses) {
                myStatuses = myStatusesResponse.statuses;
                localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const highlightsResponse = await secureApiCall('/api/statuses/highlights');
            if (highlightsResponse && highlightsResponse.highlights) {
                highlights = highlightsResponse.highlights;
                localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const userResponse = await secureApiCall('/api/user/me');
            if (userResponse && userResponse.user) {
                currentUser = userResponse.user;
                userData = userResponse.user;
                localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(userResponse.user));
            }
        }));
        
        await Promise.allSettled(loadPromises);
        
        console.log('[Status] Initial data loaded successfully');
        
    } catch (error) {
        console.error('[Status] Error loading initial data:', error);
        throw error;
    }
}

// =============================================
// CORE STATUS FUNCTIONS
// =============================================

/**
 * Filter statuses by privacy
 * @param {Array} statuses - Statuses to filter
 * @returns {Array} Filtered statuses
 */
export function filterStatusesByPrivacy(statuses) {
    return statuses.filter(status => {
        if (mutedUsers.has(status.userId)) {
            return false;
        }
        
        const privacy = status.privacy || 'friends';
        
        switch(privacy) {
            case 'everyone':
                return true;
            case 'friends':
                return true;
            case 'close-friends':
                return false;
            case 'except':
                return true;
            case 'specific':
                return false;
            case 'micro-circle':
                return false;
            default:
                return true;
        }
    });
}

/**
 * Get status preview text
 * @param {Object} status - Status object
 * @returns {string} Preview text
 */
export function getStatusPreviewText(status) {
    if (status.type === 'text') {
        return status.text.length > 30 ? status.text.substring(0, 30) + '...' : status.text;
    } else if (status.type === 'media') {
        return status.caption ? status.caption.substring(0, 30) + '...' : 'Media status';
    } else if (status.type === 'poll') {
        return status.question ? status.question.substring(0, 30) + '...' : 'Poll status';
    }
    return 'Status';
}

/**
 * Update current section based on active tab
 */
export function updateCurrentSection() {
    console.log('[Status] Update current section');
}

/**
 * Filter statuses by type
 * @param {string} type - Filter type
 * @returns {Array} Filtered statuses
 */
export function filterStatusesByType(type) {
    switch(type) {
        case 'friends':
            return statuses.filter(status => status.privacy === 'friends' || status.privacy === 'everyone');
        case 'close-friends':
            return statuses.filter(status => status.privacy === 'close-friends');
        case 'pinned':
            return statuses.filter(status => status.isPinned);
        case 'muted':
            return statuses.filter(status => mutedUsers.has(status.userId));
        case 'micro-circle':
            return statuses.filter(status => status.privacy === 'micro-circle');
        default:
            return statuses;
    }
}

/**
 * Get empty state message based on current filters
 * @returns {string} Empty state message
 */
export function getEmptyStateMessage() {
    if (activeFilters.size > 0) {
        return `No statuses match your filters`;
    }
    if (currentIntentFilter) {
        return `No statuses with "${statusIntents[currentIntentFilter]?.name || currentIntentFilter}" intent`;
    }
    if (currentMoodFilter) {
        return `No statuses with "${statusMoods[currentMoodFilter]?.name || currentMoodFilter}" mood`;
    }
    return 'Be the first to post a status!';
}

// =============================================
// STATUS ACTIONS - WITH SECURE API CALLS
// =============================================

/**
 * Add reaction to status
 * @param {string} statusId - Status ID
 * @param {string} reaction - Reaction type
 */
export async function addReactionToStatus(statusId, reaction) {
    try {
        if (isOfflineMode) {
            pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
            localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, JSON.stringify(pendingReactions));
            return;
        }
        
        const response = await secureApiCall(`/api/statuses/${statusId}/react`, {
            method: 'POST',
            body: JSON.stringify({ reaction })
        });
        
        return response;
    } catch (error) {
        console.error('[Status] Error adding reaction:', error);
        throw error;
    }
}

/**
 * Vote on poll
 * @param {string} statusId - Status ID
 * @param {string} optionId - Option ID
 */
export async function voteOnPoll(statusId, optionId) {
    try {
        if (isOfflineMode) {
            return;
        }
        
        const response = await secureApiCall(`/api/statuses/${statusId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ optionId })
        });
        
        return response;
    } catch (error) {
        console.error('[Status] Error voting on poll:', error);
        throw error;
    }
}

/**
 * Pin status
 * @param {Object} statusData - Status data
 */
export async function pinStatus(statusData) {
    try {
        const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
            method: 'POST'
        });
        
        if (response && response.success) {
            statusData.isPinned = true;
            pinnedStatuses.push(statusData);
        }
        return response;
    } catch (error) {
        console.error('[Status] Error pinning status:', error);
        throw error;
    }
}

/**
 * Unpin status
 * @param {Object} statusData - Status data
 */
export async function unpinStatus(statusData) {
    try {
        const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            statusData.isPinned = false;
            pinnedStatuses = pinnedStatuses.filter(s => s.id !== statusData.id);
        }
        return response;
    } catch (error) {
        console.error('[Status] Error unpinning status:', error);
        throw error;
    }
}

/**
 * Mute user
 * @param {string} userId - User ID
 */
export async function muteUser(userId) {
    try {
        const response = await secureApiCall(`/api/users/${userId}/mute`, {
            method: 'POST'
        });
        
        if (response && response.success) {
            mutedUsers.add(userId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_USERS, JSON.stringify(Array.from(mutedUsers)));
        }
        return response;
    } catch (error) {
        console.error('[Status] Error muting user:', error);
        throw error;
    }
}

/**
 * Unmute user
 * @param {string} userId - User ID
 */
export async function unmuteUser(userId) {
    try {
        const response = await secureApiCall(`/api/users/${userId}/mute`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            mutedUsers.delete(userId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_USERS, JSON.stringify(Array.from(mutedUsers)));
        }
        return response;
    } catch (error) {
        console.error('[Status] Error unmuting user:', error);
        throw error;
    }
}

/**
 * Post status
 * @param {Object} statusData - Status data
 */
export async function postStatus(statusData) {
    try {
        if (isOfflineMode) {
            const offlineQueue = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
            statusData.id = 'offline_' + Date.now();
            statusData.createdAt = new Date().toISOString();
            offlineQueue.push(statusData);
            localStorage.setItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(offlineQueue));
            
            statuses.unshift(statusData);
            myStatuses.unshift(statusData);
            localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            
            lastPostDate = new Date();
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
            updateStreakCounter();
            
            return { success: true, status: statusData };
        }
        
        const response = await secureApiCall('/api/statuses/create', {
            method: 'POST',
            body: JSON.stringify(statusData)
        });
        
        if (response && response.status) {
            statuses.unshift(response.status);
            myStatuses.unshift(response.status);
            localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            
            lastPostDate = new Date();
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
            updateStreakCounter();
            
            if (statusData.mood) {
                moodChartData.push({
                    mood: statusData.mood,
                    value: 50 + Math.floor(Math.random() * 30),
                    date: new Date().toISOString()
                });
                if (moodChartData.length > 30) {
                    moodChartData = moodChartData.slice(-30);
                }
                localStorage.setItem(LOCAL_STORAGE_KEYS.MOOD_DATA, JSON.stringify(moodChartData));
            }
        }
        return response;
    } catch (error) {
        console.error('[Status] Error posting status:', error);
        throw error;
    }
}

/**
 * Update streak counter
 */
export function updateStreakCounter() {
    const today = new Date().toDateString();
    if (lastPostDate && lastPostDate.toDateString() === today) {
        return;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (lastPostDate && lastPostDate.toDateString() === yesterday.toDateString()) {
        streakCount++;
    } else if (lastPostDate) {
        streakCount = 1;
    } else {
        streakCount = 1;
    }
    
    localStorage.setItem(LOCAL_STORAGE_KEYS.STREAK, streakCount.toString());
}

/**
 * Schedule status
 * @param {Object} statusData - Status data
 * @param {string} scheduleTime - Schedule time
 */
export async function scheduleStatus(statusData, scheduleTime) {
    try {
        const response = await secureApiCall('/api/statuses/schedule', {
            method: 'POST',
            body: JSON.stringify({
                ...statusData,
                scheduledFor: scheduleTime
            })
        });
        
        if (response && response.success) {
            scheduledStatuses.push({
                ...statusData,
                scheduledFor: scheduleTime
            });
            localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED, JSON.stringify(scheduledStatuses));
        }
        return response;
    } catch (error) {
        console.error('[Status] Error scheduling status:', error);
        throw error;
    }
}

/**
 * Save draft
 * @param {Object} statusData - Status data
 */
export function saveDraft(statusData) {
    try {
        statusData.id = 'draft_' + Date.now();
        statusData.createdAt = new Date().toISOString();
        statusData.isDraft = true;
        drafts.unshift(statusData);
        localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
        return { success: true };
    } catch (error) {
        console.error('[Status] Error saving draft:', error);
        throw error;
    }
}

/**
 * Report status
 * @param {string} statusId - Status ID
 * @param {string} reason - Report reason
 * @param {string} details - Report details
 */
export async function reportStatus(statusId, reason, details) {
    try {
        const response = await secureApiCall(`/api/statuses/${statusId}/report`, {
            method: 'POST',
            body: JSON.stringify({
                reason,
                details
            })
        });
        
        return response;
    } catch (error) {
        console.error('[Status] Error reporting status:', error);
        throw error;
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format time ago
 * @param {Date} date - Date to format
 * @returns {string} Formatted time ago string
 */
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

/**
 * Retry operation with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>} Operation result
 */
export async function retryOperation(operation, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.log(`[Status] Retry ${i + 1}/${maxRetries} failed:`, error.message);
            
            if (i < maxRetries - 1) {
                const delay = Math.min(1000 * Math.pow(2, i), 10000);
                const jitter = Math.random() * 200;
                await new Promise(resolve => setTimeout(resolve, delay + jitter));
            }
        }
    }
    
    throw lastError;
}

/**
 * Generate sample mood data for demo
 * @returns {Array} Sample mood data
 */
export function generateSampleMoodData() {
    const moods = Object.keys(statusMoods);
    const data = [];
    
    for (let i = 0; i < 30; i++) {
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        data.push({
            mood: randomMood,
            value: 20 + Math.floor(Math.random() * 60)
        });
    }
    
    return data;
}

// =============================================
// APPLICATION INITIALIZATION
// =============================================

/**
 * Initialize the application with centralized token system
 */
export function initPageCore() {
    console.log('[Status] Page loaded - Centralized token initialization');
    
    // Start enhanced bootstrap process with parent coordination
    setTimeout(async () => {
        try {
            await bootstrapApplication();
        } catch (error) {
            console.error('[Status] Bootstrap failed:', error);
        }
    }, 50);
}

console.log('[Status] Centralized token status system core initialized successfully');