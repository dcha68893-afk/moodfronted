// =============================================
// STATUS SYSTEM - USING DIRECT TOKEN ACCESS
// =============================================

// Global variables
let currentUser = null;
let userData = null;
let statuses = [];
let myStatuses = [];
let friendsStatuses = [];
let closeFriendsStatuses = [];
let pinnedStatuses = [];
let mutedStatuses = [];
let microCirclesStatuses = [];
let highlights = [];
let drafts = [];
let scheduledStatuses = [];
let viewedStatuses = new Set();
let mutedUsers = new Set();
let currentViewerStatus = null;
let currentSlideIndex = 0;
let autoAdvanceInterval = null;
let isAutoAdvancePaused = false;
let progressInterval = null;
let currentCategoryFilter = 'all';
let currentIntentFilter = null;
let currentMoodFilter = null;
let isMobile = window.innerWidth <= 768;
let isOfflineMode = false;
let pendingReplies = [];
let pendingReactions = [];
let moodChartData = [];
let streakCount = 0;
let lastPostDate = null;
let activeFilters = new Set();
let selectedDraft = null;

// Authentication variables
let apiReadyReceived = false;
let apiCheckInterval = null;
let authValidated = false;
let accessToken = null;
let refreshToken = null;
let authChecked = false;

// Status types
const statusTypes = {
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
const statusIntents = {
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
const statusMoods = {
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
const statusCategories = {
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
const actionButtons = {
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
const privacySettings = {
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
const durationOptions = {
    '3600': '1 hour',
    '21600': '6 hours',
    '43200': '12 hours',
    '86400': '24 hours',
    '0': 'Permanent'
};

// Report reasons
const reportReasons = {
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
const reactions = {
    'like': '👍',
    'love': '❤️',
    'helpful': '💡',
    'inspiring': '✨',
    'funny': '😂',
    'not-useful': '👎'
};

// Emojis for picker
const emojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '😱', '👍', '👎', '❤️', '🔥', '💯', '✨', '🎉', '🙏', '🤝', '💪', '👏', '🙌', '🤗', '😇', '🥺', '🤯', '😳', '🤪', '😜', '🤓', '😎', '🥶', '😈', '👻', '💀', '👀', '🦄', '🐶', '🐱', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐵', '🦉', '🐣', '🦋', '🐝', '🐙', '🦑', '🐋', '🦈', '🐊', '🦒', '🐘', '🦏', '🦘', '🐫', '🦙', '🦌', '🐎', '🐖', '🐑', '🐕', '🐈', '🐇', '🦔', '🐿️', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'];

// Background options
const backgroundOptions = [
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
const statusTemplates = {
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

// DOM Elements
const createStatusModal = document.getElementById('createStatusModal');
const draftsModal = document.getElementById('draftsModal');
const highlightsModal = document.getElementById('highlightsModal');
const highlightsEditorModal = document.getElementById('highlightsEditorModal');
const memoryTimelineModal = document.getElementById('memoryTimelineModal');
const statsModal = document.getElementById('statsModal');
const scheduleModal = document.getElementById('scheduleModal');
const reportModal = document.getElementById('reportModal');
const statusViewerPanel = document.getElementById('statusViewerPanel');
const notification = document.getElementById('notification');
const errorUI = document.getElementById('errorUI');

// Status sections
const allStatusSection = document.getElementById('allStatusSection');
const friendsStatusSection = document.getElementById('friendsStatusSection');
const closeFriendsStatusSection = document.getElementById('closeFriendsStatusSection');
const pinnedStatusSection = document.getElementById('pinnedStatusSection');
const mutedStatusSection = document.getElementById('mutedStatusSection');
const microCirclesStatusSection = document.getElementById('microCirclesStatusSection');
const myStatusSection = document.getElementById('myStatusSection');

const allStatusList = document.getElementById('allStatusList');
const friendsStatusList = document.getElementById('friendsStatusList');
const closeFriendsStatusList = document.getElementById('closeFriendsStatusList');
const pinnedStatusList = document.getElementById('pinnedStatusList');
const mutedStatusList = document.getElementById('mutedStatusList');
const microCirclesStatusList = document.getElementById('microCirclesStatusList');
const myStatusList = document.getElementById('myStatusList');

// Local Storage Keys
const LOCAL_STORAGE_KEYS = {
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

// Direct token access keys
const TOKEN_KEYS = {
    ACCESS_TOKEN: 'knecta_access_token',
    REFRESH_TOKEN: 'knecta_refresh_token',
    TOKEN_EXPIRY: 'knecta_token_expiry'
};

// API base URL - Will be handled by api.js
const API_BASE_URL = '';

// =============================================
// ENHANCED BOOTSTRAP WITH FAST TOKEN VALIDATION
// =============================================

async function bootstrapIframe() {
    console.log('=== ENHANCED BOOTSTRAP IFRAME START ===');
    
    try {
        // Phase 1: Fast token discovery (parallel)
        const tokenData = await discoverTokensFast();
        
        if (!tokenData.accessToken) {
            console.error('No access token found in any storage location');
            handleAuthError('Please log in to access status features');
            return false;
        }
        
        // Phase 2: Immediate UI update with cached user data
        await updateUIWithCachedUserData();
        
        // Phase 3: Background token validation (non-blocking)
        validateTokenInBackground(tokenData);
        
        // Phase 4: Initialize UI components immediately
        setupEventListeners();
        initializeUIComponents();
        loadCachedDataInstantly();
        
        console.log('=== ENHANCED BOOTSTRAP IFRAME COMPLETE ===');
        return true;
        
    } catch (error) {
        console.error('Enhanced bootstrap error:', error);
        handleAuthError('Failed to initialize. Please try again.');
        return false;
    }
}

// Fast token discovery from all possible storage locations
async function discoverTokensFast() {
    const tokenData = {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null
    };
    
    // Parallel token discovery from all possible locations
    const tokenPromises = [
        // Priority 1: api.js global state
        new Promise(resolve => {
            try {
                if (window.knectaAPI && window.knectaAPI.getToken) {
                    const token = window.knectaAPI.getToken();
                    if (token) {
                        tokenData.accessToken = token;
                        console.log('Found token via api.js getToken()');
                    }
                }
                resolve();
            } catch (e) {
                resolve();
            }
        }),
        
        // Priority 2: localStorage keys
        new Promise(resolve => {
            try {
                const possibleAccessTokenKeys = [
                    'accessToken',
                    'moodchat_token',
                    'knecta_access_token',
                    'token',
                    'auth_token',
                    'knecta_token'
                ];
                
                for (const key of possibleAccessTokenKeys) {
                    const token = localStorage.getItem(key);
                    if (token && token.length > 10 && token !== 'undefined' && token !== 'null') {
                        tokenData.accessToken = token;
                        console.log(`Found token in localStorage: ${key}`);
                        break;
                    }
                }
                
                // Check refresh token
                const possibleRefreshTokenKeys = [
                    'refreshToken',
                    'knecta_refresh_token',
                    'refresh_token'
                ];
                
                for (const key of possibleRefreshTokenKeys) {
                    const token = localStorage.getItem(key);
                    if (token && token.length > 10 && token !== 'undefined' && token !== 'null') {
                        tokenData.refreshToken = token;
                        break;
                    }
                }
                
                resolve();
            } catch (e) {
                resolve();
            }
        }),
        
        // Priority 3: sessionStorage
        new Promise(resolve => {
            try {
                const possibleKeys = [
                    'accessToken',
                    'moodchat_token',
                    'knecta_access_token'
                ];
                
                for (const key of possibleKeys) {
                    const token = sessionStorage.getItem(key);
                    if (token && token.length > 10 && token !== 'undefined' && token !== 'null') {
                        tokenData.accessToken = token;
                        console.log(`Found token in sessionStorage: ${key}`);
                        break;
                    }
                }
                resolve();
            } catch (e) {
                resolve();
            }
        })
    ];
    
    await Promise.all(tokenPromises);
    
    // Check token expiry
    const expiryKey = 'knecta_token_expiry';
    const expiry = localStorage.getItem(expiryKey);
    if (expiry && expiry !== 'undefined' && expiry !== 'null') {
        tokenData.tokenExpiry = new Date(expiry);
    }
    
    console.log('Token discovery complete:', {
        hasAccessToken: !!tokenData.accessToken,
        hasRefreshToken: !!tokenData.refreshToken,
        tokenExpiry: tokenData.tokenExpiry
    });
    
    return tokenData;
}

// Update UI immediately with cached user data
async function updateUIWithCachedUserData() {
    try {
        // Check for user data in multiple locations
        const userSources = [
            // 1. localStorage user cache
            () => {
                const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
                if (cachedUser) {
                    return JSON.parse(cachedUser);
                }
                return null;
            },
            
            // 2. api.js user state
            () => {
                if (window.knectaAPI && window.knectaAPI.getCurrentUser) {
                    return window.knectaAPI.getCurrentUser();
                }
                return null;
            },
            
            // 3. authUser in localStorage
            () => {
                const authUser = localStorage.getItem('authUser');
                if (authUser) {
                    return JSON.parse(authUser);
                }
                return null;
            },
            
            // 4. knecta_user in localStorage
            () => {
                const knectaUser = localStorage.getItem('knecta_user');
                if (knectaUser) {
                    return JSON.parse(knectaUser);
                }
                return null;
            }
        ];
        
        // Try each source in parallel
        for (const source of userSources) {
            try {
                const user = source();
                if (user && user.id) {
                    currentUser = user;
                    userData = user;
                    
                    // Update UI immediately
                    updateUserUIInstantly();
                    
                    console.log('UI updated with cached user:', user.id);
                    return;
                }
            } catch (e) {
                // Continue to next source
            }
        }
        
        console.log('No cached user data found');
        
    } catch (error) {
        console.error('Error updating UI with cached user:', error);
    }
}

// Update user UI instantly without waiting for API
function updateUserUIInstantly() {
    if (!currentUser) return;
    
    // Update user avatar if elements exist
    const avatarElements = document.querySelectorAll('.user-avatar, .status-avatar, .my-status-avatar');
    avatarElements.forEach(avatar => {
        if (currentUser.photoURL) {
            avatar.style.backgroundImage = `url('${currentUser.photoURL}')`;
            avatar.innerHTML = '';
        } else if (currentUser.displayName) {
            const initials = currentUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            avatar.innerHTML = `<span>${initials}</span>`;
        }
    });
    
    // Update user name if elements exist
    const nameElements = document.querySelectorAll('.user-name, .status-user-name');
    nameElements.forEach(element => {
        if (currentUser.displayName) {
            element.textContent = currentUser.displayName;
        }
    });
    
    // Update my status preview
    updateMyStatusPreview();
    
    // Enable create status button
    const createStatusBtn = document.getElementById('createStatusBtn');
    if (createStatusBtn) {
        createStatusBtn.disabled = false;
    }
}

// Background token validation (non-blocking)
async function validateTokenInBackground(tokenData) {
    // Don't block UI - run in background
    setTimeout(async () => {
        try {
            console.log('Starting background token validation...');
            
            // Wait for api.js if not ready
            if (!window.knectaAPI) {
                await waitForApiJs();
            }
            
            if (!window.knectaAPI) {
                console.error('api.js not available for token validation');
                return;
            }
            
            // Use the token we found
            accessToken = tokenData.accessToken;
            refreshToken = tokenData.refreshToken;
            
            // Validate token via api.js
            try {
                const response = await window.knectaAPI.get('/api/auth/me');
                
                if (response && response.user) {
                    // Token is valid - update user data
                    currentUser = response.user;
                    userData = currentUser;
                    authValidated = true;
                    
                    // Cache the validated user
                    localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
                        uid: currentUser.id,
                        id: currentUser.id,
                        displayName: currentUser.displayName,
                        email: currentUser.email,
                        photoURL: currentUser.photoURL
                    }));
                    
                    // Update UI with fresh data
                    updateUserUIInstantly();
                    
                    // Load fresh data from API
                    loadInitialData();
                    
                    console.log('Background token validation successful:', currentUser.id);
                    showNotification(`Welcome back, ${currentUser.displayName || 'User'}!`, 'success');
                    
                } else {
                    throw new Error('Invalid user data in response');
                }
                
            } catch (apiError) {
                console.error('Token validation failed:', apiError);
                
                // Try token refresh if available
                if (refreshToken) {
                    try {
                        const refreshResponse = await window.knectaAPI.post('/api/auth/refresh', {
                            refreshToken: refreshToken
                        });
                        
                        if (refreshResponse && refreshResponse.accessToken) {
                            // Update tokens
                            accessToken = refreshResponse.accessToken;
                            localStorage.setItem('accessToken', accessToken);
                            
                            if (refreshResponse.refreshToken) {
                                refreshToken = refreshResponse.refreshToken;
                                localStorage.setItem('refreshToken', refreshToken);
                            }
                            
                            // Retry validation with new token
                            const retryResponse = await window.knectaAPI.get('/api/auth/me');
                            if (retryResponse && retryResponse.user) {
                                currentUser = retryResponse.user;
                                userData = currentUser;
                                authValidated = true;
                                
                                localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
                                    uid: currentUser.id,
                                    id: currentUser.id,
                                    displayName: currentUser.displayName,
                                    email: currentUser.email,
                                    photoURL: currentUser.photoURL
                                }));
                                
                                updateUserUIInstantly();
                                loadInitialData();
                                
                                console.log('Token refresh successful');
                                return;
                            }
                        }
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError);
                    }
                }
                
                // If validation fails, we still keep the cached UI
                // User can still interact with offline features
                showNotification('Using offline mode. Some features may be limited.', 'warning');
                isOfflineMode = true;
            }
            
        } catch (error) {
            console.error('Background validation error:', error);
            // Don't show error to user - they can still use cached data
        }
    }, 100); // Small delay to ensure UI is responsive first
}

// Wait for api.js with timeout
function waitForApiJs() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds max
        
        const checkApi = () => {
            attempts++;
            
            if (window.knectaAPI) {
                console.log('api.js loaded successfully');
                resolve();
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.warn('api.js not loaded after maximum attempts, proceeding without it');
                resolve(); // Resolve anyway to not block
                return;
            }
            
            setTimeout(checkApi, 100);
        };
        
        checkApi();
    });
}

// Initialize the application with enhanced bootstrap
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Status page loaded - Enhanced initialization');
    
    // Immediately show UI with cached data
    loadCachedDataInstantly();
    setupBasicEventListeners();
    
    // Start enhanced bootstrap process
    setTimeout(async () => {
        await bootstrapIframe();
    }, 50); // Minimal delay for DOM readiness
});

// =============================================
// ENHANCED AUTHENTICATION FUNCTIONS
// =============================================

function handleAuthError(message) {
    console.error('Authentication failed:', message);
    
    // Only show error if we have no cached data
    if (statuses.length === 0 && myStatuses.length === 0) {
        errorUI.classList.add('active');
        document.getElementById('errorTitle').textContent = 'Authentication Required';
        document.getElementById('errorMessage').textContent = message;
        
        const retryBtn = document.getElementById('retryConnectionBtn');
        if (retryBtn) {
            retryBtn.textContent = 'Go to Login';
            retryBtn.onclick = function() {
                // Clear all auth data
                const keysToRemove = [
                    'accessToken', 'moodchat_token', 'knecta_access_token', 'token', 'auth_token',
                    'refreshToken', 'knecta_refresh_token', 'refresh_token',
                    'knecta_token_expiry', 'knecta_current_user', 'authUser', 'knecta_user'
                ];
                
                keysToRemove.forEach(key => {
                    localStorage.removeItem(key);
                    sessionStorage.removeItem(key);
                });
                
                const loginUrl = '/index.html';
                if (window.top !== window.self) {
                    window.top.location.href = loginUrl;
                } else {
                    window.location.href = loginUrl;
                }
            };
        }
        
        const offlineBtn = document.getElementById('offlineModeBtn');
        if (offlineBtn) {
            offlineBtn.style.display = 'block';
        }
    } else {
        // We have cached data, just show warning
        showNotification('Using cached data. Some features may be limited.', 'warning');
        isOfflineMode = true;
    }
}

// Enhanced authenticated request with better error handling
async function makeAuthenticatedRequest(endpoint, options = {}) {
    // If offline mode, queue for later
    if (isOfflineMode) {
        console.log('Offline mode: Queueing request for', endpoint);
        return Promise.reject(new Error('Offline mode'));
    }
    
    // Ensure we have a token
    if (!accessToken) {
        // Try to get token from storage
        const tokenData = await discoverTokensFast();
        if (tokenData.accessToken) {
            accessToken = tokenData.accessToken;
        } else {
            throw new Error('No access token available');
        }
    }
    
    // Ensure api.js is available
    if (!window.knectaAPI) {
        await waitForApiJs();
        if (!window.knectaAPI) {
            throw new Error('API library not available');
        }
    }
    
    try {
        console.log('Making authenticated API call via api.js to:', endpoint);
        
        let response;
        const method = options.method?.toUpperCase() || 'GET';
        
        switch (method) {
            case 'GET':
                response = await window.knectaAPI.get(endpoint);
                break;
            case 'POST':
                response = await window.knectaAPI.post(endpoint, options.body ? JSON.parse(options.body) : {});
                break;
            case 'PUT':
                response = await window.knectaAPI.put(endpoint, options.body ? JSON.parse(options.body) : {});
                break;
            case 'DELETE':
                response = await window.knectaAPI.delete(endpoint);
                break;
            default:
                throw new Error(`Unsupported method: ${method}`);
        }
        
        return response;
        
    } catch (error) {
        console.error('API request error via api.js:', error);
        
        // Check for auth errors
        const isAuthError = error.message?.includes('401') || 
                           error.message?.includes('403') ||
                           error.message?.includes('Unauthorized') || 
                           error.message?.includes('Authentication') || 
                           error.message?.includes('Session');
        
        if (isAuthError && refreshToken) {
            try {
                console.log('Auth error detected, attempting token refresh...');
                
                const refreshResponse = await window.knectaAPI.post('/api/auth/refresh', {
                    refreshToken: refreshToken
                });
                
                if (refreshResponse && refreshResponse.accessToken) {
                    // Save new tokens
                    accessToken = refreshResponse.accessToken;
                    localStorage.setItem('accessToken', accessToken);
                    
                    if (refreshResponse.refreshToken) {
                        refreshToken = refreshResponse.refreshToken;
                        localStorage.setItem('refreshToken', refreshToken);
                    }
                    
                    // Retry the original request
                    console.log('Token refreshed, retrying original request...');
                    return await makeAuthenticatedRequest(endpoint, options);
                }
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
            }
        }
        
        // If we get here, auth failed
        if (isAuthError) {
            console.log('Authentication failed, switching to offline mode');
            isOfflineMode = true;
            showNotification('Network issue. Using offline mode.', 'warning');
        }
        
        throw error;
    }
}

// Initialize status system with fallback
async function initializeStatusSystem() {
    console.log('=== INITIALIZING STATUS SYSTEM ===');
    
    try {
        // Try to load fresh data
        await loadInitialData();
        
        // Update UI
        updateMyStatusPreview();
        updateStreakCounter();
        updateMoodChart();
        
        // Render status list
        renderStatusListInstantly();
        
        if (currentUser) {
            showNotification(`Welcome back, ${currentUser.displayName || 'User'}!`, 'success');
        }
        
        console.log('=== STATUS SYSTEM INITIALIZED SUCCESSFULLY ===');
        
    } catch (error) {
        console.error('Error initializing status system:', error);
        
        // Fallback to cached data
        loadCachedDataInstantly();
        
        if (!isOfflineMode) {
            showNotification('Could not connect to server. Using cached data.', 'warning');
            isOfflineMode = true;
        }
    }
}

// Load cached data instantly for offline use
function loadCachedDataInstantly() {
    console.log('Loading cached data instantly...');
    
    try {
        // Load user from cache
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            console.log('Loaded user from cache');
            
            // Update UI immediately
            updateUserUIInstantly();
        }
        
        // Load statuses
        const statusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            statuses = JSON.parse(statusesData);
            console.log('Loaded statuses from cache:', statuses.length);
        }
        
        // Load my statuses
        const myStatusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_STATUSES);
        if (myStatusesData) {
            myStatuses = JSON.parse(myStatusesData);
        }
        
        // Load viewed statuses
        const viewedStatusesData = localStorage.getItem(LOCAL_STORAGE_KEYS.VIEWED_STATUSES);
        if (viewedStatusesData) {
            viewedStatuses = new Set(JSON.parse(viewedStatusesData));
        }
        
        // Load muted users
        const mutedUsersData = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_USERS);
        if (mutedUsersData) {
            mutedUsers = new Set(JSON.parse(mutedUsersData));
        }
        
        // Load highlights
        const highlightsData = localStorage.getItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
        if (highlightsData) {
            highlights = JSON.parse(highlightsData);
        }
        
        // Load drafts
        const draftsData = localStorage.getItem(LOCAL_STORAGE_KEYS.DRAFTS);
        if (draftsData) {
            drafts = JSON.parse(draftsData);
        }
        
        // Load scheduled statuses
        const scheduledData = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULED);
        if (scheduledData) {
            scheduledStatuses = JSON.parse(scheduledData);
        }
        
        // Load pending replies
        const pendingRepliesData = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_REPLIES);
        if (pendingRepliesData) {
            pendingReplies = JSON.parse(pendingRepliesData);
        }
        
        // Load pending reactions
        const pendingReactionsData = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_REACTIONS);
        if (pendingReactionsData) {
            pendingReactions = JSON.parse(pendingReactionsData);
        }
        
        // Load mood data
        const moodData = localStorage.getItem(LOCAL_STORAGE_KEYS.MOOD_DATA);
        if (moodData) {
            moodChartData = JSON.parse(moodData);
        }
        
        // Load streak data
        const streakData = localStorage.getItem(LOCAL_STORAGE_KEYS.STREAK);
        if (streakData) {
            streakCount = parseInt(streakData);
            const streakElement = document.getElementById('streakCount');
            if (streakElement) {
                streakElement.textContent = streakCount;
            }
        }
        
        // Load last post date
        const lastPostDateData = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE);
        if (lastPostDateData) {
            lastPostDate = new Date(lastPostDateData);
        }
        
        console.log('Cached data loaded successfully');
        
        // Render status list instantly
        renderStatusListInstantly();
        
    } catch (error) {
        console.error('Error loading cached data:', error);
    }
}

// Render status list instantly from cache
function renderStatusListInstantly() {
    if (!allStatusList) return;
    
    allStatusList.innerHTML = '';
    
    if (statuses.length === 0) {
        allStatusList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses yet</p>
                <p class="subtext">Be the first to post a status!</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    statuses.slice(0, 20).forEach(status => {
        addStatusItemInstant(status, fragment);
    });
    
    allStatusList.appendChild(fragment);
    allStatusList.classList.add('instant-load');
}

// Add status item instantly (for offline cache display)
function addStatusItemInstant(statusData, container) {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.dataset.statusId = statusData.id;
    statusItem.dataset.userId = statusData.userId;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const isViewed = viewedStatuses.has(statusData.id);
    const isPinned = statusData.isPinned || false;
    const isMuted = mutedUsers.has(statusData.userId);
    const mood = statusData.mood || 'happy';
    const intent = statusData.intent || 'reflection';
    const category = statusData.category || 'life';
    
    let previewText = '';
    if (statusData.type === 'text') {
        previewText = statusData.text || 'Text status';
    } else if (statusData.type === 'media') {
        previewText = `<i class="fas fa-image"></i> Media status`;
        if (statusData.caption) {
            previewText += `: ${statusData.caption}`;
        }
    } else if (statusData.type === 'poll') {
        previewText = `<i class="fas fa-poll"></i> Poll: ${statusData.question || 'Poll status'}`;
    }
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    statusItem.innerHTML = `
        <div class="status-avatar">
            <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
            <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
                ${user.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="status-indicators">
                ${mood ? `<div class="status-indicator mood" style="background-color: ${statusMoods[mood]?.color || 'var(--mood-happy)'}" title="${statusMoods[mood]?.name || 'Mood'}"></div>` : ''}
                ${intent ? `<div class="status-indicator intent" style="background-color: ${statusIntents[intent]?.color || 'var(--intent-feedback)'}" title="${statusIntents[intent]?.name || 'Intent'}"></div>` : ''}
                ${isPinned ? `<div class="status-indicator pinned" title="Pinned Status"></div>` : ''}
                ${isMuted ? `<div class="status-indicator muted" title="Muted User"></div>` : ''}
            </div>
        </div>
        <div class="status-info">
            <div class="status-name">
                <span class="status-name-text">${escapeHtml(user.displayName || 'Unknown User')}</span>
                <span class="status-time">${timeAgo}</span>
            </div>
            <div class="status-details">
                <span class="status-type" style="color: ${statusTypes[statusData.type]?.color || 'var(--primary-color)'}">
                    <i class="${statusTypes[statusData.type]?.icon || 'fas fa-comment'}"></i>
                    ${statusTypes[statusData.type]?.name || 'Status'}
                </span>
                ${statusData.isSensitive ? '<span class="status-tag privacy"><i class="fas fa-eye-slash"></i> Sensitive</span>' : ''}
                ${statusData.isSilent ? '<span class="status-tag privacy"><i class="fas fa-bell-slash"></i> Silent</span>' : ''}
            </div>
            <div class="status-preview ${statusData.type === 'media' || statusData.type === 'poll' ? statusData.type : ''}">
                ${previewText}
            </div>
            <div class="status-tags">
                ${mood ? `<span class="status-tag mood"><i class="fas fa-brain"></i> ${statusMoods[mood]?.name || 'Mood'}</span>` : ''}
                ${intent ? `<span class="status-tag intent"><i class="fas fa-bullseye"></i> ${statusIntents[intent]?.name || 'Intent'}</span>` : ''}
                ${category ? `<span class="status-tag category"><i class="${statusCategories[category]?.icon || 'fas fa-tag'}"></i> ${statusCategories[category]?.name || 'Category'}</span>` : ''}
                ${statusData.privacy ? `<span class="status-tag privacy"><i class="${privacySettings[statusData.privacy]?.icon || 'fas fa-lock'}"></i> ${privacySettings[statusData.privacy]?.name || 'Privacy'}</span>` : ''}
            </div>
        </div>
        <div class="status-actions">
            <button class="status-action-btn" data-action="view" title="View Status">
                <i class="fas fa-eye"></i>
            </button>
            ${isPinned ? `
            <button class="status-action-btn warning" data-action="unpin" title="Unpin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="pin" title="Pin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            `}
            ${isMuted ? `
            <button class="status-action-btn" data-action="unmute" title="Unmute User">
                <i class="fas fa-volume-up"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="mute" title="Mute User">
                <i class="fas fa-volume-mute"></i>
            </button>
            `}
        </div>
    `;
    
    statusItem.addEventListener('click', (e) => {
        if (!e.target.closest('.status-actions')) {
            showStatusViewer(statusData);
        }
    });
    
    const actionButtons = statusItem.querySelectorAll('.status-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleStatusAction(action, statusData, btn);
        });
    });
    
    container.appendChild(statusItem);
}

// Initialize UI components
function initializeUIComponents() {
    // Initialize emoji picker
    if (document.getElementById('emojiGrid')) {
        initializeEmojiPicker();
    }
    
    // Initialize background options
    if (document.getElementById('backgroundGrid')) {
        initializeBackgroundOptions();
    }
    
    // Initialize intent options
    if (document.getElementById('intentOptions')) {
        initializeIntentOptions();
    }
    
    // Initialize mood options
    if (document.getElementById('moodOptions')) {
        initializeMoodOptions();
    }
    
    // Initialize category options
    if (document.getElementById('categoryOptions')) {
        initializeCategoryOptions();
    }
    
    // Initialize action buttons selector
    if (document.getElementById('actionButtonsSelector')) {
        initializeActionButtonsSelector();
    }
    
    // Initialize privacy options
    if (document.getElementById('privacyOptions')) {
        initializePrivacyOptions();
    }
    
    // Initialize duration options
    if (document.getElementById('durationOptions')) {
        initializeDurationOptions();
    }
    
    // Initialize template options
    if (document.getElementById('templateOptions')) {
        initializeTemplateOptions();
    }
    
    // Initialize report reasons
    if (document.getElementById('reportReasons')) {
        initializeReportReasons();
    }
    
    // Initialize reactions
    if (document.getElementById('reactionsContainer')) {
        initializeReactions();
    }
    
    // Initialize poll options
    if (document.getElementById('pollOptionsContainer')) {
        initializePollOptions();
    }
    
    // Initialize highlight color options
    if (document.getElementById('highlightColorGrid')) {
        initializeHighlightColorOptions();
    }
    
    // Initialize highlight privacy options
    if (document.getElementById('highlightPrivacyOptions')) {
        initializeHighlightPrivacyOptions();
    }
    
    // Initialize repeat options
    if (document.getElementById('repeatOptions')) {
        initializeRepeatOptions();
    }
}

// Initialize emoji picker
function initializeEmojiPicker() {
    const emojiGrid = document.getElementById('emojiGrid');
    if (!emojiGrid) return;
    
    emojiGrid.innerHTML = '';
    emojis.forEach(emoji => {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-btn';
        emojiBtn.textContent = emoji;
        emojiBtn.title = `Add ${emoji}`;
        emojiBtn.addEventListener('click', () => {
            const textInput = document.getElementById('textStatusInput');
            if (textInput) {
                textInput.value += emoji;
                textInput.focus();
                updateTextStatusCounter();
            }
        });
        emojiGrid.appendChild(emojiBtn);
    });
}

// Initialize background options
function initializeBackgroundOptions() {
    const backgroundGrid = document.getElementById('backgroundGrid');
    if (!backgroundGrid) return;
    
    backgroundGrid.innerHTML = '';
    backgroundOptions.forEach(bg => {
        const bgOption = document.createElement('div');
        bgOption.className = 'background-option';
        bgOption.dataset.bg = bg.id;
        bgOption.dataset.type = bg.type;
        
        if (bg.type === 'solid') {
            bgOption.style.backgroundColor = bg.color;
            bgOption.textContent = 'A';
        } else if (bg.type === 'gradient') {
            bgOption.style.background = bg.gradient;
            bgOption.textContent = 'G';
        }
        
        bgOption.title = `Background ${bg.id}`;
        bgOption.addEventListener('click', () => {
            document.querySelectorAll('.background-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            bgOption.classList.add('selected');
            localStorage.setItem('selected_background', bg.id);
        });
        
        backgroundGrid.appendChild(bgOption);
    });
    
    // Select first background by default
    const firstBg = backgroundGrid.querySelector('.background-option');
    if (firstBg) {
        firstBg.classList.add('selected');
    }
}

// Initialize intent options
function initializeIntentOptions() {
    const intentOptions = document.getElementById('intentOptions');
    if (!intentOptions) return;
    
    intentOptions.innerHTML = '';
    Object.entries(statusIntents).forEach(([key, intent]) => {
        const intentOption = document.createElement('div');
        intentOption.className = 'intent-option';
        intentOption.dataset.intent = key;
        intentOption.innerHTML = `
            <div class="intent-icon" style="color: ${intent.color}">
                <i class="${intent.icon}"></i>
            </div>
            <div class="intent-name">${intent.name}</div>
        `;
        
        intentOption.addEventListener('click', () => {
            document.querySelectorAll('.intent-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            intentOption.classList.add('selected');
            localStorage.setItem('selected_intent', key);
        });
        
        intentOptions.appendChild(intentOption);
    });
}

// Initialize mood options
function initializeMoodOptions() {
    const moodOptions = document.getElementById('moodOptions');
    if (!moodOptions) return;
    
    moodOptions.innerHTML = '';
    Object.entries(statusMoods).forEach(([key, mood]) => {
        const moodOption = document.createElement('div');
        moodOption.className = 'mood-option';
        moodOption.dataset.mood = key;
        moodOption.classList.add(key);
        moodOption.textContent = mood.emoji;
        moodOption.title = mood.name;
        
        moodOption.addEventListener('click', () => {
            document.querySelectorAll('.mood-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            moodOption.classList.add('selected');
            localStorage.setItem('selected_mood', key);
        });
        
        moodOptions.appendChild(moodOption);
    });
}

// Initialize category options
function initializeCategoryOptions() {
    const categoryOptions = document.getElementById('categoryOptions');
    if (!categoryOptions) return;
    
    categoryOptions.innerHTML = '';
    Object.entries(statusCategories).forEach(([key, category]) => {
        const categoryOption = document.createElement('div');
        categoryOption.className = 'category-option';
        categoryOption.dataset.category = key;
        categoryOption.textContent = category.name;
        
        categoryOption.addEventListener('click', () => {
            document.querySelectorAll('.category-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            categoryOption.classList.add('selected');
            localStorage.setItem('selected_category', key);
        });
        
        categoryOptions.appendChild(categoryOption);
    });
}

// Initialize action buttons selector
function initializeActionButtonsSelector() {
    const actionButtonsSelector = document.getElementById('actionButtonsSelector');
    if (!actionButtonsSelector) return;
    
    actionButtonsSelector.innerHTML = '';
    Object.entries(actionButtons).forEach(([key, button]) => {
        const buttonOption = document.createElement('div');
        buttonOption.className = 'action-button-option';
        buttonOption.dataset.action = key;
        buttonOption.innerHTML = `
            <div style="font-size: 20px; margin-bottom: 8px; color: ${button.color}">
                <i class="${button.icon}"></i>
            </div>
            <div style="font-size: 12px;">${button.name}</div>
        `;
        
        buttonOption.addEventListener('click', () => {
            buttonOption.classList.toggle('selected');
            
            const selectedActions = Array.from(document.querySelectorAll('.action-button-option.selected')).map(opt => opt.dataset.action);
            localStorage.setItem('selected_actions', JSON.stringify(selectedActions));
        });
        
        actionButtonsSelector.appendChild(buttonOption);
    });
}

// Initialize privacy options
function initializePrivacyOptions() {
    const privacyOptions = document.getElementById('privacyOptions');
    if (!privacyOptions) return;
    
    privacyOptions.innerHTML = '';
    Object.entries(privacySettings).forEach(([key, privacy]) => {
        const privacyOption = document.createElement('div');
        privacyOption.className = 'privacy-option';
        privacyOption.dataset.privacy = key;
        privacyOption.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        
        privacyOption.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            privacyOption.classList.add('selected');
            localStorage.setItem('selected_privacy', key);
        });
        
        privacyOptions.appendChild(privacyOption);
    });
    
    // Select "Friends Only" by default
    const friendsPrivacy = privacyOptions.querySelector('[data-privacy="friends"]');
    if (friendsPrivacy) {
        friendsPrivacy.classList.add('selected');
    }
}

// Initialize duration options
function initializeDurationOptions() {
    const durationOptionsElement = document.getElementById('durationOptions');
    if (!durationOptionsElement) return;
    
    durationOptionsElement.innerHTML = '';
    Object.entries(durationOptions).forEach(([key, duration]) => {
        const durationOption = document.createElement('div');
        durationOption.className = 'duration-option';
        durationOption.dataset.duration = key;
        durationOption.textContent = duration;
        
        durationOption.addEventListener('click', () => {
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            durationOption.classList.add('selected');
            localStorage.setItem('selected_duration', key);
        });
        
        durationOptionsElement.appendChild(durationOption);
    });
    
    // Select "24 hours" by default
    const dayDuration = durationOptionsElement.querySelector('[data-duration="86400"]');
    if (dayDuration) {
        dayDuration.classList.add('selected');
    }
}

// Initialize template options
function initializeTemplateOptions() {
    const templateOptions = document.getElementById('templateOptions');
    if (!templateOptions) return;
    
    templateOptions.innerHTML = '';
    Object.entries(statusTemplates).forEach(([key, template]) => {
        const templateOption = document.createElement('div');
        templateOption.className = 'category-option';
        templateOption.dataset.template = key;
        templateOption.textContent = template.name;
        
        templateOption.addEventListener('click', () => {
            const textInput = document.getElementById('textStatusInput');
            if (textInput) {
                textInput.value = template.text;
                updateTextStatusCounter();
            }
            
            // Select corresponding background
            const bgOption = document.querySelector(`.background-option[data-bg="${template.background}"]`);
            if (bgOption) {
                document.querySelectorAll('.background-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                bgOption.classList.add('selected');
            }
            
            // Select mood if available
            if (template.mood) {
                const moodOption = document.querySelector(`.mood-option[data-mood="${template.mood}"]`);
                if (moodOption) {
                    document.querySelectorAll('.mood-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    moodOption.classList.add('selected');
                }
            }
            
            // Select intent if available
            if (template.intent) {
                const intentOption = document.querySelector(`.intent-option[data-intent="${template.intent}"]`);
                if (intentOption) {
                    document.querySelectorAll('.intent-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    intentOption.classList.add('selected');
                }
            }
            
            showNotification(`"${template.name}" template applied`, 'success');
        });
        
        templateOptions.appendChild(templateOption);
    });
}

// Initialize report reasons
function initializeReportReasons() {
    const reportReasonsElement = document.getElementById('reportReasons');
    if (!reportReasonsElement) return;
    
    reportReasonsElement.innerHTML = '';
    Object.entries(reportReasons).forEach(([key, reason]) => {
        const reasonOption = document.createElement('div');
        reasonOption.className = 'category-option';
        reasonOption.dataset.reason = key;
        reasonOption.textContent = reason;
        
        reasonOption.addEventListener('click', () => {
            document.querySelectorAll('#reportReasons .category-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            reasonOption.classList.add('selected');
            updateReportSubmitButton();
        });
        
        reportReasonsElement.appendChild(reasonOption);
    });
}

// Initialize reactions
function initializeReactions() {
    const reactionsContainer = document.getElementById('reactionsContainer');
    if (!reactionsContainer) return;
    
    reactionsContainer.innerHTML = '';
    Object.entries(reactions).forEach(([key, emoji]) => {
        const reactionBtn = document.createElement('button');
        reactionBtn.className = 'reaction-btn';
        reactionBtn.dataset.reaction = key;
        reactionBtn.textContent = emoji;
        reactionBtn.title = key.charAt(0).toUpperCase() + key.slice(1);
        
        reactionBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                addReactionToStatus(currentViewerStatus.id, key);
                reactionBtn.classList.add('selected');
                
                // Remove selected class from other reactions
                document.querySelectorAll('.reaction-btn').forEach(btn => {
                    if (btn !== reactionBtn) {
                        btn.classList.remove('selected');
                    }
                });
            }
        });
        
        reactionsContainer.appendChild(reactionBtn);
    });
}

// Initialize poll options
function initializePollOptions() {
    const pollOptionsContainer = document.getElementById('pollOptionsContainer');
    if (!pollOptionsContainer) return;
    
    // Clear existing options
    pollOptionsContainer.innerHTML = '';
    
    // Add initial 2 options
    for (let i = 1; i <= 2; i++) {
        addPollOption(i);
    }
}

// Add poll option
function addPollOption(index) {
    const pollOptionsContainer = document.getElementById('pollOptionsContainer');
    if (!pollOptionsContainer) return;
    
    const optionItem = document.createElement('div');
    optionItem.className = 'poll-option-item';
    optionItem.innerHTML = `
        <div class="poll-option-number">${index}</div>
        <div class="poll-option-input-wrapper">
            <input type="text" class="text-input poll-option-input" placeholder="Option ${index}" data-index="${index}">
            ${index > 2 ? `
            <button class="remove-poll-option" type="button">
                <i class="fas fa-times"></i>
            </button>
            ` : ''}
        </div>
    `;
    
    // Remove button event
    const removeBtn = optionItem.querySelector('.remove-poll-option');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if (pollOptionsContainer.children.length > 2) {
                optionItem.remove();
                updatePollOptionNumbers();
            } else {
                showNotification('Minimum 2 options required', 'warning');
            }
        });
    }
    
    pollOptionsContainer.appendChild(optionItem);
}

// Update poll option numbers
function updatePollOptionNumbers() {
    const pollOptions = document.querySelectorAll('.poll-option-item');
    pollOptions.forEach((item, index) => {
        const numberElement = item.querySelector('.poll-option-number');
        const inputElement = item.querySelector('.poll-option-input');
        const removeBtn = item.querySelector('.remove-poll-option');
        
        if (numberElement) {
            numberElement.textContent = index + 1;
        }
        
        if (inputElement) {
            inputElement.dataset.index = index + 1;
            inputElement.placeholder = `Option ${index + 1}`;
        }
        
        // Show remove button for options beyond minimum
        if (removeBtn && index >= 2) {
            removeBtn.style.display = 'block';
        } else if (removeBtn) {
            removeBtn.style.display = 'none';
        }
    });
}

// Initialize highlight color options
function initializeHighlightColorOptions() {
    const highlightColorGrid = document.getElementById('highlightColorGrid');
    if (!highlightColorGrid) return;
    
    highlightColorGrid.innerHTML = '';
    backgroundOptions.forEach(bg => {
        const colorOption = document.createElement('div');
        colorOption.className = 'background-option';
        colorOption.dataset.bg = bg.id;
        colorOption.dataset.type = bg.type;
        
        if (bg.type === 'solid') {
            colorOption.style.backgroundColor = bg.color;
            colorOption.textContent = 'A';
        } else if (bg.type === 'gradient') {
            colorOption.style.background = bg.gradient;
            colorOption.textContent = 'G';
        }
        
        colorOption.title = `Color ${bg.id}`;
        colorOption.addEventListener('click', () => {
            document.querySelectorAll('#highlightColorGrid .background-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            colorOption.classList.add('selected');
        });
        
        highlightColorGrid.appendChild(colorOption);
    });
    
    // Select first color by default
    const firstColor = highlightColorGrid.querySelector('.background-option');
    if (firstColor) {
        firstColor.classList.add('selected');
    }
}

// Initialize highlight privacy options
function initializeHighlightPrivacyOptions() {
    const highlightPrivacyOptions = document.getElementById('highlightPrivacyOptions');
    if (!highlightPrivacyOptions) return;
    
    highlightPrivacyOptions.innerHTML = '';
    ['everyone', 'friends', 'close-friends'].forEach(privacyKey => {
        const privacy = privacySettings[privacyKey];
        if (!privacy) return;
        
        const privacyOption = document.createElement('div');
        privacyOption.className = 'privacy-option';
        privacyOption.dataset.privacy = privacyKey;
        privacyOption.innerHTML = `
            <div class="privacy-icon">
                <i class="${privacy.icon}"></i>
            </div>
            <div class="privacy-details">
                <div class="privacy-name">${privacy.name}</div>
                <div class="privacy-description">${privacy.description}</div>
            </div>
        `;
        
        privacyOption.addEventListener('click', () => {
            document.querySelectorAll('#highlightPrivacyOptions .privacy-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            privacyOption.classList.add('selected');
        });
        
        highlightPrivacyOptions.appendChild(privacyOption);
    });
    
    // Select "friends" by default
    const friendsPrivacy = highlightPrivacyOptions.querySelector('[data-privacy="friends"]');
    if (friendsPrivacy) {
        friendsPrivacy.classList.add('selected');
    }
}

// Initialize repeat options
function initializeRepeatOptions() {
    const repeatOptions = document.getElementById('repeatOptions');
    if (!repeatOptions) return;
    
    repeatOptions.innerHTML = '';
    const repeatOptionsData = {
        'none': 'Don\'t repeat',
        'daily': 'Daily',
        'weekly': 'Weekly',
        'monthly': 'Monthly'
    };
    
    Object.entries(repeatOptionsData).forEach(([key, text]) => {
        const repeatOption = document.createElement('div');
        repeatOption.className = 'repeat-option';
        repeatOption.dataset.repeat = key;
        repeatOption.textContent = text;
        
        repeatOption.addEventListener('click', () => {
            document.querySelectorAll('.repeat-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            repeatOption.classList.add('selected');
        });
        
        repeatOptions.appendChild(repeatOption);
    });
    
    // Select "none" by default
    const noneOption = repeatOptions.querySelector('[data-repeat="none"]');
    if (noneOption) {
        noneOption.classList.add('selected');
    }
}

// Load initial data from API - USING api.js
async function loadInitialData() {
    try {
        console.log('Loading initial data from API via api.js...');
        
        // Parallel data loading
        const loadPromises = [];
        
        // Load statuses
        loadPromises.push((async () => {
            try {
                const statusesResponse = await makeAuthenticatedRequest('/api/statuses');
                if (statusesResponse && statusesResponse.statuses) {
                    statuses = statusesResponse.statuses;
                    console.log('Loaded statuses from API:', statuses.length);
                    
                    // Filter by privacy and sort by time
                    statuses = filterStatusesByPrivacy(statuses);
                    statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    
                    // Save to cache
                    localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
                    
                    // Update UI
                    updateCurrentSection();
                }
            } catch (statusesError) {
                console.error('Error loading statuses from API:', statusesError);
                // Keep cached data if API fails
            }
        })());
        
        // Load my statuses
        loadPromises.push((async () => {
            try {
                const myStatusesResponse = await makeAuthenticatedRequest('/api/statuses/my');
                if (myStatusesResponse && myStatusesResponse.statuses) {
                    myStatuses = myStatusesResponse.statuses;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
                    updateMyStatusPreview();
                }
            } catch (myStatusesError) {
                console.error('Error loading my statuses from API:', myStatusesError);
            }
        })());
        
        // Load highlights
        loadPromises.push((async () => {
            try {
                const highlightsResponse = await makeAuthenticatedRequest('/api/statuses/highlights');
                if (highlightsResponse && highlightsResponse.highlights) {
                    highlights = highlightsResponse.highlights;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
                }
            } catch (highlightsError) {
                console.error('Error loading highlights from API:', highlightsError);
            }
        })());
        
        // Load drafts
        loadPromises.push((async () => {
            try {
                const draftsResponse = await makeAuthenticatedRequest('/api/statuses/drafts');
                if (draftsResponse && draftsResponse.drafts) {
                    drafts = draftsResponse.drafts;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
                }
            } catch (draftsError) {
                console.error('Error loading drafts from API:', draftsError);
            }
        })());
        
        // Load scheduled statuses
        loadPromises.push((async () => {
            try {
                const scheduledResponse = await makeAuthenticatedRequest('/api/statuses/scheduled');
                if (scheduledResponse && scheduledResponse.scheduled) {
                    scheduledStatuses = scheduledResponse.scheduled;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED, JSON.stringify(scheduledStatuses));
                    updateScheduledStatusesList();
                }
            } catch (scheduledError) {
                console.error('Error loading scheduled statuses from API:', scheduledError);
            }
        })());
        
        // Wait for all data to load
        await Promise.all(loadPromises);
        
        // Clear error UI if data loaded successfully
        errorUI.classList.remove('active');
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        throw error;
    }
}

// Filter statuses by privacy (friends can view each other's statuses)
function filterStatusesByPrivacy(statuses) {
    return statuses.filter(status => {
        // If user is muted, skip
        if (mutedUsers.has(status.userId)) {
            return false;
        }
        
        // Check privacy settings
        const privacy = status.privacy || 'friends';
        
        switch(privacy) {
            case 'everyone':
                return true;
            case 'friends':
                // Friends can view each other's statuses
                // In a real implementation, you would check the friendship status
                // For this demo, we'll assume all users are friends
                return true;
            case 'close-friends':
                // Only close friends can view
                // In a real implementation, check if user is in close friends list
                return false;
            case 'except':
                // Everyone except specific people
                // In a real implementation, check if user is in exception list
                return true;
            case 'specific':
                // Only specific people can view
                // In a real implementation, check if user is in specific list
                return false;
            case 'micro-circle':
                // Only micro circle members can view
                // In a real implementation, check if user is in the micro circle
                return false;
            default:
                return true;
        }
    });
}

// Update my status preview
function updateMyStatusPreview() {
    const myStatusRing = document.getElementById('myStatusRing');
    const myStatusAvatar = document.getElementById('myStatusAvatar');
    const myStatusIndicator = document.getElementById('myStatusIndicator');
    const myStatusText = document.getElementById('myStatusText');
    
    if (currentUser && currentUser.photoURL && myStatusAvatar) {
        myStatusAvatar.innerHTML = `<img src="${escapeHtml(currentUser.photoURL)}" style="width: 100%; height: 100%; border-radius: 50%;">`;
    }
    
    if (myStatuses.length > 0) {
        const latestStatus = myStatuses[0];
        if (myStatusRing) myStatusRing.classList.remove('viewed');
        if (myStatusIndicator) myStatusIndicator.classList.remove('viewed');
        if (myStatusText) myStatusText.textContent = getStatusPreviewText(latestStatus);
    } else {
        if (myStatusRing) myStatusRing.classList.add('viewed');
        if (myStatusIndicator) myStatusIndicator.classList.add('viewed');
        if (myStatusText) myStatusText.textContent = 'No recent status';
    }
}

// Update streak counter
function updateStreakCounter() {
    // Check if user posted today
    const today = new Date().toDateString();
    if (lastPostDate && lastPostDate.toDateString() === today) {
        // Already counted today
        return;
    }
    
    // Check if posted yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (lastPostDate && lastPostDate.toDateString() === yesterday.toDateString()) {
        // Continue streak
        streakCount++;
    } else if (lastPostDate) {
        // Broken streak, reset
        streakCount = 1;
    } else {
        // First post
        streakCount = 1;
    }
    
    const streakElement = document.getElementById('streakCount');
    if (streakElement) {
        streakElement.textContent = streakCount;
    }
    localStorage.setItem(LOCAL_STORAGE_KEYS.STREAK, streakCount.toString());
}

// Update mood chart
function updateMoodChart() {
    const moodChart = document.getElementById('moodChart');
    if (!moodChart) return;
    
    moodChart.innerHTML = '';
    
    // Use cached data or generate sample data
    const chartData = moodChartData.length > 0 ? moodChartData : generateSampleMoodData();
    
    chartData.forEach((day, index) => {
        const moodBar = document.createElement('div');
        moodBar.className = 'mood-bar';
        moodBar.style.backgroundColor = statusMoods[day.mood]?.color || 'var(--mood-happy)';
        moodBar.style.height = `${day.value}%`;
        moodBar.title = `Day ${index + 1}: ${statusMoods[day.mood]?.name || 'Happy'} (${day.value}%)`;
        moodChart.appendChild(moodBar);
    });
}

// Generate sample mood data
function generateSampleMoodData() {
    const moods = Object.keys(statusMoods);
    const data = [];
    
    for (let i = 0; i < 30; i++) {
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        data.push({
            mood: randomMood,
            value: 20 + Math.floor(Math.random() * 60) // Random height between 20-80%
        });
    }
    
    return data;
}

// Get status preview text
function getStatusPreviewText(status) {
    if (status.type === 'text') {
        return status.text.length > 30 ? status.text.substring(0, 30) + '...' : status.text;
    } else if (status.type === 'media') {
        return status.caption ? status.caption.substring(0, 30) + '...' : 'Media status';
    } else if (status.type === 'poll') {
        return status.question ? status.question.substring(0, 30) + '...' : 'Poll status';
    }
    return 'Status';
}

// Update current section
function updateCurrentSection() {
    const activeSection = document.querySelector('.statuses-section.active');
    if (activeSection) {
        const sectionId = activeSection.id;
        
        switch(sectionId) {
            case 'allStatusSection':
                if (allStatusList) renderStatusesList(allStatusList, statuses);
                break;
            case 'friendsStatusSection':
                if (friendsStatusList) renderStatusesList(friendsStatusList, filterStatusesByType('friends'));
                break;
            case 'closeFriendsStatusSection':
                if (closeFriendsStatusList) renderStatusesList(closeFriendsStatusList, filterStatusesByType('close-friends'));
                break;
            case 'pinnedStatusSection':
                if (pinnedStatusList) renderStatusesList(pinnedStatusList, filterStatusesByType('pinned'));
                break;
            case 'mutedStatusSection':
                if (mutedStatusList) renderStatusesList(mutedStatusList, filterStatusesByType('muted'));
                break;
            case 'microCirclesStatusSection':
                if (microCirclesStatusList) renderStatusesList(microCirclesStatusList, filterStatusesByType('micro-circle'));
                break;
            case 'myStatusSection':
                if (myStatusList) renderStatusesList(myStatusList, myStatuses);
                break;
        }
    }
}

// Filter statuses by type
function filterStatusesByType(type) {
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

// Render statuses list
function renderStatusesList(container, statusesList) {
    if (!container) return;
    
    container.innerHTML = '';
    
    // Apply additional filters
    let filteredStatuses = statusesList;
    
    if (currentIntentFilter) {
        filteredStatuses = filteredStatuses.filter(status => status.intent === currentIntentFilter);
    }
    
    if (currentMoodFilter) {
        filteredStatuses = filteredStatuses.filter(status => status.mood === currentMoodFilter);
    }
    
    // Apply active filters
    if (activeFilters.size > 0) {
        filteredStatuses = filteredStatuses.filter(status => {
            return Array.from(activeFilters).every(filter => {
                if (filter.startsWith('intent-')) {
                    return status.intent === filter.replace('intent-', '');
                }
                if (filter.startsWith('mood-')) {
                    return status.mood === filter.replace('mood-', '');
                }
                if (filter.startsWith('category-')) {
                    return status.category === filter.replace('category-', '');
                }
                return true;
            });
        });
    }
    
    if (filteredStatuses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No statuses found</p>
                <p class="subtext">${getEmptyStateMessage()}</p>
            </div>
        `;
        return;
    }
    
    filteredStatuses.forEach(status => {
        addStatusItem(status, container);
    });
}

// Get empty state message
function getEmptyStateMessage() {
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

// Add status item to list
function addStatusItem(statusData, container) {
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item';
    statusItem.dataset.statusId = statusData.id;
    statusItem.dataset.userId = statusData.userId;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const isViewed = viewedStatuses.has(statusData.id);
    const isPinned = statusData.isPinned || false;
    const isMuted = mutedUsers.has(statusData.userId);
    const mood = statusData.mood || 'happy';
    const intent = statusData.intent || 'reflection';
    const category = statusData.category || 'life';
    
    let previewText = '';
    let previewClass = '';
    if (statusData.type === 'text') {
        previewText = statusData.text || 'Text status';
    } else if (statusData.type === 'media') {
        previewText = `<i class="fas fa-image"></i> ${statusData.caption ? statusData.caption.substring(0, 40) + (statusData.caption.length > 40 ? '...' : '') : 'Media status'}`;
        previewClass = 'media';
    } else if (statusData.type === 'poll') {
        previewText = `<i class="fas fa-poll"></i> ${statusData.question ? statusData.question.substring(0, 40) + (statusData.question.length > 40 ? '...' : '') : 'Poll status'}`;
        previewClass = 'poll';
    }
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    statusItem.innerHTML = `
        <div class="status-avatar">
            <div class="status-ring ${isViewed ? 'viewed' : ''}"></div>
            <div class="status-avatar-inner" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
                ${user.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="status-indicators">
                ${mood ? `<div class="status-indicator mood" style="background-color: ${statusMoods[mood]?.color || 'var(--mood-happy)'}" title="${statusMoods[mood]?.name || 'Mood'}"></div>` : ''}
                ${intent ? `<div class="status-indicator intent" style="background-color: ${statusIntents[intent]?.color || 'var(--intent-feedback)'}" title="${statusIntents[intent]?.name || 'Intent'}"></div>` : ''}
                ${isPinned ? `<div class="status-indicator pinned" title="Pinned Status"></div>` : ''}
                ${isMuted ? `<div class="status-indicator muted" title="Muted User"></div>` : ''}
            </div>
        </div>
        <div class="status-info">
            <div class="status-name">
                <span class="status-name-text">${escapeHtml(user.displayName || 'Unknown User')}</span>
                <span class="status-time">${timeAgo}</span>
            </div>
            <div class="status-details">
                <span class="status-type" style="color: ${statusTypes[statusData.type]?.color || 'var(--primary-color)'}">
                    <i class="${statusTypes[statusData.type]?.icon || 'fas fa-comment'}"></i>
                    ${statusTypes[statusData.type]?.name || 'Status'}
                </span>
                ${statusData.isSensitive ? '<span class="status-tag privacy"><i class="fas fa-eye-slash"></i> Sensitive</span>' : ''}
                ${statusData.isSilent ? '<span class="status-tag privacy"><i class="fas fa-bell-slash"></i> Silent</span>' : ''}
                ${statusData.duration !== '0' ? `<span class="status-tag privacy"><i class="fas fa-clock"></i> ${durationOptions[statusData.duration] || '24h'}</span>` : ''}
            </div>
            <div class="status-preview ${previewClass}">
                ${previewText}
            </div>
            <div class="status-tags">
                ${mood ? `<span class="status-tag mood"><i class="fas fa-brain"></i> ${statusMoods[mood]?.name || 'Mood'}</span>` : ''}
                ${intent ? `<span class="status-tag intent"><i class="fas fa-bullseye"></i> ${statusIntents[intent]?.name || 'Intent'}</span>` : ''}
                ${category ? `<span class="status-tag category"><i class="${statusCategories[category]?.icon || 'fas fa-tag'}"></i> ${statusCategories[category]?.name || 'Category'}</span>` : ''}
                ${statusData.privacy ? `<span class="status-tag privacy"><i class="${privacySettings[statusData.privacy]?.icon || 'fas fa-lock'}"></i> ${privacySettings[statusData.privacy]?.name || 'Privacy'}</span>` : ''}
            </div>
        </div>
        <div class="status-actions">
            <button class="status-action-btn" data-action="view" title="View Status">
                <i class="fas fa-eye"></i>
            </button>
            ${isPinned ? `
            <button class="status-action-btn warning" data-action="unpin" title="Unpin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="pin" title="Pin Status">
                <i class="fas fa-thumbtack"></i>
            </button>
            `}
            ${isMuted ? `
            <button class="status-action-btn" data-action="unmute" title="Unmute User">
                <i class="fas fa-volume-up"></i>
            </button>
            ` : `
            <button class="status-action-btn" data-action="mute" title="Mute User">
                <i class="fas fa-volume-mute"></i>
            </button>
            `}
        </div>
    `;
    
    statusItem.addEventListener('click', (e) => {
        if (!e.target.closest('.status-actions')) {
            showStatusViewer(statusData);
        }
    });
    
    const actionButtons = statusItem.querySelectorAll('.status-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleStatusAction(action, statusData, btn);
        });
    });
    
    container.appendChild(statusItem);
}

// Handle status action
function handleStatusAction(action, statusData, button) {
    switch(action) {
        case 'view':
            showStatusViewer(statusData);
            break;
        case 'pin':
            pinStatus(statusData);
            break;
        case 'unpin':
            unpinStatus(statusData);
            break;
        case 'mute':
            muteUser(statusData.userId);
            break;
        case 'unmute':
            unmuteUser(statusData.userId);
            break;
    }
}

// Show status viewer
function showStatusViewer(statusData) {
    currentViewerStatus = statusData;
    currentSlideIndex = 0;
    
    // Mark as viewed
    if (!viewedStatuses.has(statusData.id)) {
        viewedStatuses.add(statusData.id);
        localStorage.setItem(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, JSON.stringify(Array.from(viewedStatuses)));
        
        // Update UI
        const statusItem = document.querySelector(`[data-status-id="${statusData.id}"]`);
        if (statusItem) {
            const ring = statusItem.querySelector('.status-ring');
            if (ring) {
                ring.classList.add('viewed');
            }
        }
    }
    
    // Show viewer panel
    statusViewerPanel.classList.add('active');
    
    // Load viewer content
    loadViewerContent(statusData);
    
    // Start auto-advance
    startAutoAdvance();
}

// Load viewer content
function loadViewerContent(statusData) {
    const viewerUserInfo = document.getElementById('viewerUserInfo');
    const viewerContent = document.getElementById('viewerContent');
    const progressIndicators = document.getElementById('progressIndicators');
    const actionButtonsOverlay = document.getElementById('actionButtonsOverlay');
    
    if (!viewerUserInfo || !viewerContent) return;
    
    const user = statusData.user || { displayName: 'Unknown User', photoURL: '', id: statusData.userId };
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const timeAgo = statusData.createdAt ? formatTimeAgo(new Date(statusData.createdAt)) : 'Just now';
    
    // User info
    viewerUserInfo.innerHTML = `
        <div class="viewer-user-avatar" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
            ${user.photoURL ? '' : `<span>${initials}</span>`}
        </div>
        <div class="viewer-user-details">
            <div class="viewer-user-name">${escapeHtml(user.displayName || 'Unknown User')}</div>
            <div class="viewer-status-time">${timeAgo}</div>
        </div>
    `;
    
    // Viewer content based on status type
    viewerContent.innerHTML = '';
    
    if (statusData.type === 'text') {
        const slide = createTextStatusSlide(statusData);
        viewerContent.appendChild(slide);
    } else if (statusData.type === 'media') {
        const slide = createMediaStatusSlide(statusData);
        viewerContent.appendChild(slide);
    } else if (statusData.type === 'poll') {
        const slide = createPollStatusSlide(statusData);
        viewerContent.appendChild(slide);
    }
    
    // Progress indicators
    if (progressIndicators) {
        progressIndicators.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        `;
    }
    
    // Action buttons
    if (actionButtonsOverlay && statusData.actionButtons && statusData.actionButtons.length > 0) {
        actionButtonsOverlay.innerHTML = '';
        statusData.actionButtons.forEach(actionKey => {
            const action = actionButtons[actionKey];
            if (action) {
                const actionButton = document.createElement('button');
                actionButton.className = 'action-button';
                actionButton.innerHTML = `<i class="${action.icon}"></i> ${action.name}`;
                actionButton.addEventListener('click', () => {
                    handleActionButtonClick(actionKey, statusData);
                });
                actionButtonsOverlay.appendChild(actionButton);
            }
        });
    } else if (actionButtonsOverlay) {
        actionButtonsOverlay.innerHTML = '';
    }
    
    // Update mute button state
    const muteUserBtn = document.getElementById('muteUserBtn');
    if (muteUserBtn) {
        if (mutedUsers.has(statusData.userId)) {
            muteUserBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            muteUserBtn.title = 'Unmute User';
        } else {
            muteUserBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            muteUserBtn.title = 'Mute User';
        }
    }
    
    // Update save button state
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    if (saveStatusBtn) {
        // Check if status is already saved in highlights
        const isSaved = highlights.some(h => h.statusIds && h.statusIds.includes(statusData.id));
        if (isSaved) {
            saveStatusBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
            saveStatusBtn.title = 'Remove from Highlights';
            saveStatusBtn.dataset.action = 'unsave';
        } else {
            saveStatusBtn.innerHTML = '<i class="far fa-bookmark"></i>';
            saveStatusBtn.title = 'Save to Highlights';
            saveStatusBtn.dataset.action = 'save';
        }
    }
}

// Create text status slide
function createTextStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide text-status-slide active';
    
    // Get selected background
    const selectedBg = statusData.background || '1';
    const bgOption = backgroundOptions.find(bg => bg.id === selectedBg);
    
    if (bgOption) {
        if (bgOption.type === 'solid') {
            slide.style.backgroundColor = bgOption.color;
        } else if (bgOption.type === 'gradient') {
            slide.style.background = bgOption.gradient;
        }
    }
    
    slide.innerHTML = `
        <div class="text-status-content">${escapeHtml(statusData.text || '')}</div>
        <div class="text-status-author">— ${escapeHtml(statusData.user?.displayName || 'Unknown User')}</div>
    `;
    
    return slide;
}

// Create media status slide
function createMediaStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide media-status-slide active';
    
    let mediaContent = '';
    if (statusData.mediaType === 'image') {
        mediaContent = `<img src="${escapeHtml(statusData.mediaUrl)}" class="media-status-content" alt="Status image">`;
    } else if (statusData.mediaType === 'video') {
        mediaContent = `<video src="${escapeHtml(statusData.mediaUrl)}" class="media-status-content" autoplay muted loop controls></video>`;
    }
    
    slide.innerHTML = `
        ${mediaContent}
        ${statusData.caption ? `<div class="media-caption">${escapeHtml(statusData.caption)}</div>` : ''}
    `;
    
    // Add blur if sensitive
    if (statusData.isSensitive) {
        const mediaElement = slide.querySelector('.media-status-content');
        if (mediaElement) {
            mediaElement.style.filter = 'blur(20px)';
            mediaElement.addEventListener('click', () => {
                mediaElement.style.filter = 'none';
            });
        }
    }
    
    return slide;
}

// Create poll status slide
function createPollStatusSlide(statusData) {
    const slide = document.createElement('div');
    slide.className = 'status-slide poll-status-slide active';
    
    const totalVotes = statusData.options?.reduce((sum, option) => sum + (option.votes || 0), 0) || 0;
    const hasVoted = statusData.hasVoted || false;
    const userVote = statusData.userVote;
    
    let optionsHtml = '';
    if (statusData.options) {
        statusData.options.forEach(option => {
            const percentage = totalVotes > 0 ? Math.round((option.votes || 0) / totalVotes * 100) : 0;
            const isVotedByUser = hasVoted && userVote === option.id;
            optionsHtml += `
                <div class="poll-option ${isVotedByUser ? 'selected' : ''}" data-option="${option.id}">
                    <div class="poll-option-text">${escapeHtml(option.text)}</div>
                    <div class="poll-option-percentage">${percentage}% (${option.votes || 0} votes)</div>
                    <div class="poll-option-bar" style="width: ${percentage}%"></div>
                </div>
            `;
        });
    }
    
    slide.innerHTML = `
        <div class="poll-container">
            <div class="poll-question">${escapeHtml(statusData.question || '')}</div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
            <div class="poll-total-votes">Total votes: ${totalVotes}</div>
            ${hasVoted ? '<div class="poll-voted-message">✓ You have voted</div>' : ''}
        </div>
    `;
    
    // Add vote functionality if not voted yet
    if (!hasVoted) {
        const pollOptions = slide.querySelectorAll('.poll-option');
        pollOptions.forEach(option => {
            option.addEventListener('click', () => {
                voteOnPoll(statusData.id, option.dataset.option);
            });
        });
    }
    
    return slide;
}

// Handle action button click
function handleActionButtonClick(actionKey, statusData) {
    switch(actionKey) {
        case 'message':
            // Navigate to chat with user
            showNotification('Would navigate to chat with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'join':
            // Join discussion (would navigate to group chat)
            showNotification('Would join discussion', 'info');
            break;
        case 'vote':
            // Vote on poll (handled in poll slide)
            const pollSlide = document.querySelector('.poll-status-slide');
            if (pollSlide) {
                pollSlide.scrollIntoView({ behavior: 'smooth' });
            }
            showNotification('Click on a poll option to vote', 'info');
            break;
        case 'book':
            // Book a call
            showNotification('Would book a call with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'learn':
            // Learn more (open URL)
            if (statusData.externalUrl) {
                window.open(statusData.externalUrl, '_blank');
            } else {
                showNotification('No external link available', 'info');
            }
            break;
        case 'support':
            // Show support (add reaction)
            addReactionToStatus(statusData.id, 'love');
            break;
        case 'collaborate':
            // Start collaboration
            showNotification('Would start collaboration with ' + (statusData.user?.displayName || 'user'), 'info');
            break;
        case 'resource':
            // View resource
            if (statusData.resourceUrl) {
                window.open(statusData.resourceUrl, '_blank');
            } else {
                showNotification('No resource link available', 'info');
            }
            break;
    }
}

// Start auto-advance
function startAutoAdvance() {
    if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
    }
    
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    isAutoAdvancePaused = false;
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
        pauseResumeBtn.title = 'Pause';
    }
    
    // Start progress bar animation
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.transition = 'width 5s linear';
        
        progressInterval = setInterval(() => {
            const currentWidth = parseFloat(progressFill.style.width) || 0;
            if (currentWidth < 100) {
                progressFill.style.width = (currentWidth + 1) + '%';
            } else {
                // Move to next status (if there are multiple)
                // For now, just reset
                progressFill.style.width = '0%';
            }
        }, 50); // Update every 50ms for smooth animation
    }
}

// Pause/resume auto-advance
function toggleAutoAdvance() {
    isAutoAdvancePaused = !isAutoAdvancePaused;
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    
    if (isAutoAdvancePaused) {
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        if (pauseResumeBtn) {
            pauseResumeBtn.innerHTML = '<i class="fas fa-play"></i>';
            pauseResumeBtn.title = 'Resume';
        }
    } else {
        startAutoAdvance();
        if (pauseResumeBtn) {
            pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseResumeBtn.title = 'Pause';
        }
    }
}

// Add reaction to status - USING api.js
async function addReactionToStatus(statusId, reaction) {
    try {
        // Check if we're in offline mode
        if (isOfflineMode) {
            // Store for later sync
            pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
            localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, JSON.stringify(pendingReactions));
            showNotification(`Reacted with ${reactions[reaction]} (offline)`, 'success');
            return;
        }
        
        console.log('Adding reaction via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/${statusId}/react`, {
            method: 'POST',
            body: JSON.stringify({ reaction })
        });
        
        if (response && response.success) {
            showNotification(`Reacted with ${reactions[reaction]}`, 'success');
        }
    } catch (error) {
        console.error('Error adding reaction:', error);
        showNotification('Failed to add reaction', 'error');
    }
}

// Vote on poll - USING api.js
async function voteOnPoll(statusId, optionId) {
    try {
        // Check if we're in offline mode
        if (isOfflineMode) {
            showNotification('Cannot vote while offline', 'warning');
            return;
        }
        
        console.log('Voting on poll via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/${statusId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ optionId })
        });
        
        if (response && response.success) {
            showNotification('Vote recorded', 'success');
            
            // Update poll display locally
            if (currentViewerStatus && currentViewerStatus.id === statusId) {
                // Mark the option as voted
                const pollOption = document.querySelector(`.poll-option[data-option="${optionId}"]`);
                if (pollOption) {
                    pollOption.classList.add('selected');
                    
                    // Update vote count locally
                    if (currentViewerStatus.options) {
                        const option = currentViewerStatus.options.find(opt => opt.id === optionId);
                        if (option) {
                            option.votes = (option.votes || 0) + 1;
                            currentViewerStatus.hasVoted = true;
                            currentViewerStatus.userVote = optionId;
                            
                            // Update display
                            const totalVotes = currentViewerStatus.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
                            const pollOptions = document.querySelectorAll('.poll-option');
                            pollOptions.forEach(opt => {
                                const optId = opt.dataset.option;
                                const optionData = currentViewerStatus.options.find(o => o.id === optId);
                                if (optionData) {
                                    const percentage = totalVotes > 0 ? Math.round((optionData.votes || 0) / totalVotes * 100) : 0;
                                    const percentageElement = opt.querySelector('.poll-option-percentage');
                                    const barElement = opt.querySelector('.poll-option-bar');
                                    
                                    if (percentageElement) {
                                        percentageElement.textContent = `${percentage}% (${optionData.votes || 0} votes)`;
                                    }
                                    if (barElement) {
                                        barElement.style.width = `${percentage}%`;
                                    }
                                }
                            });
                            
                            // Update total votes
                            const totalVotesElement = document.querySelector('.poll-total-votes');
                            if (totalVotesElement) {
                                totalVotesElement.textContent = `Total votes: ${totalVotes}`;
                            }
                            
                            // Add voted message
                            const pollContainer = document.querySelector('.poll-container');
                            if (pollContainer && !document.querySelector('.poll-voted-message')) {
                                const votedMessage = document.createElement('div');
                                votedMessage.className = 'poll-voted-message';
                                votedMessage.textContent = '✓ You have voted';
                                pollContainer.appendChild(votedMessage);
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error voting on poll:', error);
        showNotification('Failed to vote', 'error');
    }
}

// Pin status - USING api.js
async function pinStatus(statusData) {
    try {
        console.log('Pinning status via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/${statusData.id}/pin`, {
            method: 'POST'
        });
        
        if (response && response.success) {
            statusData.isPinned = true;
            pinnedStatuses.push(statusData);
            showNotification('Status pinned', 'success');
            updateCurrentSection();
        }
    } catch (error) {
        console.error('Error pinning status:', error);
        showNotification('Failed to pin status', 'error');
    }
}

// Unpin status - USING api.js
async function unpinStatus(statusData) {
    try {
        console.log('Unpinning status via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/${statusData.id}/pin`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            statusData.isPinned = false;
            pinnedStatuses = pinnedStatuses.filter(s => s.id !== statusData.id);
            showNotification('Status unpinned', 'success');
            updateCurrentSection();
        }
    } catch (error) {
        console.error('Error unpinning status:', error);
        showNotification('Failed to unpin status', 'error');
    }
}

// Mute user - USING api.js
async function muteUser(userId) {
    try {
        console.log('Muting user via api.js');
        const response = await makeAuthenticatedRequest(`/api/users/${userId}/mute`, {
            method: 'POST'
        });
        
        if (response && response.success) {
            mutedUsers.add(userId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_USERS, JSON.stringify(Array.from(mutedUsers)));
            showNotification('User muted', 'success');
            updateCurrentSection();
        }
    } catch (error) {
        console.error('Error muting user:', error);
        showNotification('Failed to mute user', 'error');
    }
}

// Unmute user - USING api.js
async function unmuteUser(userId) {
    try {
        console.log('Unmuting user via api.js');
        const response = await makeAuthenticatedRequest(`/api/users/${userId}/mute`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            mutedUsers.delete(userId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_USERS, JSON.stringify(Array.from(mutedUsers)));
            showNotification('User unmuted', 'success');
            updateCurrentSection();
        }
    } catch (error) {
        console.error('Error unmuting user:', error);
        showNotification('Failed to unmute user', 'error');
    }
}

// Post status - USING api.js
async function postStatus(statusData) {
    try {
        // Check if we're in offline mode
        if (isOfflineMode) {
            // Store in offline queue
            const offlineQueue = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
            statusData.id = 'offline_' + Date.now();
            statusData.createdAt = new Date().toISOString();
            offlineQueue.push(statusData);
            localStorage.setItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(offlineQueue));
            
            // Update local cache
            statuses.unshift(statusData);
            myStatuses.unshift(statusData);
            localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            
            // Update streak
            lastPostDate = new Date();
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
            updateStreakCounter();
            
            showNotification('Status saved offline. Will post when connected.', 'success');
            updateMyStatusPreview();
            updateCurrentSection();
            return;
        }
        
        console.log('Posting status via api.js');
        const response = await makeAuthenticatedRequest('/api/statuses/create', {
            method: 'POST',
            body: JSON.stringify(statusData)
        });
        
        if (response && response.status) {
            // Update local cache
            statuses.unshift(response.status);
            myStatuses.unshift(response.status);
            localStorage.setItem(LOCAL_STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MY_STATUSES, JSON.stringify(myStatuses));
            
            // Update streak
            lastPostDate = new Date();
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
            updateStreakCounter();
            
            // Update mood data
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
                updateMoodChart();
            }
            
            showNotification('Status posted successfully', 'success');
            updateMyStatusPreview();
            updateCurrentSection();
        }
    } catch (error) {
        console.error('Error posting status:', error);
        showNotification('Failed to post status', 'error');
    }
}

// Schedule status - USING api.js
async function scheduleStatus(statusData, scheduleTime) {
    try {
        console.log('Scheduling status via api.js');
        const response = await makeAuthenticatedRequest('/api/statuses/schedule', {
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
            showNotification('Status scheduled successfully', 'success');
            updateScheduledStatusesList();
        }
    } catch (error) {
        console.error('Error scheduling status:', error);
        showNotification('Failed to schedule status', 'error');
    }
}

// Save draft
function saveDraft(statusData) {
    try {
        statusData.id = 'draft_' + Date.now();
        statusData.createdAt = new Date().toISOString();
        statusData.isDraft = true;
        drafts.unshift(statusData);
        localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
        showNotification('Draft saved successfully', 'success');
        updateDraftsList();
    } catch (error) {
        console.error('Error saving draft:', error);
        showNotification('Failed to save draft', 'error');
    }
}

// Report status - USING api.js
async function reportStatus(statusId, reason, details) {
    try {
        console.log('Reporting status via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/${statusId}/report`, {
            method: 'POST',
            body: JSON.stringify({
                reason,
                details
            })
        });
        
        if (response && response.success) {
            showNotification('Report submitted successfully', 'success');
        }
    } catch (error) {
        console.error('Error reporting status:', error);
        showNotification('Failed to submit report', 'error');
    }
}

// Update text status counter
function updateTextStatusCounter() {
    const textInput = document.getElementById('textStatusInput');
    const counter = document.getElementById('textStatusCounter');
    
    if (textInput && counter) {
        const length = textInput.value.length;
        counter.textContent = `${length}/500`;
        counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
    }
}

// Update report details counter
function updateReportDetailsCounter() {
    const reportDetails = document.getElementById('reportDetails');
    const counter = document.getElementById('reportDetailsCounter');
    
    if (reportDetails && counter) {
        const length = reportDetails.value.length;
        counter.textContent = `${length}/500`;
        counter.style.color = length > 500 ? 'var(--danger-color)' : 'var(--text-secondary)';
        updateReportSubmitButton();
    }
}

// Update report submit button
function updateReportSubmitButton() {
    const reportDetails = document.getElementById('reportDetails');
    const selectedReason = document.querySelector('#reportReasons .category-option.selected');
    const submitBtn = document.getElementById('submitReportBtn');
    
    if (reportDetails && selectedReason && submitBtn) {
        const hasDetails = reportDetails.value.trim().length >= 10;
        const hasReason = selectedReason !== null;
        submitBtn.disabled = !(hasDetails && hasReason);
    }
}

// Show highlights modal
function showHighlightsModal() {
    highlightsModal.classList.add('active');
    loadHighlightsContent();
}

// Load highlights content
function loadHighlightsContent() {
    const highlightsContent = document.getElementById('highlightsContent');
    if (!highlightsContent) return;
    
    highlightsContent.innerHTML = '';
    
    if (highlights.length === 0) {
        highlightsContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); width: 100%;">
                <i class="fas fa-star" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No highlights yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Save important statuses to highlights</p>
            </div>
        `;
        return;
    }
    
    highlights.forEach(highlight => {
        const highlightItem = document.createElement('div');
        highlightItem.className = 'highlight-item';
        highlightItem.innerHTML = `
            <div class="highlight-cover" style="background: ${highlight.color || 'var(--highlight-gradient)'}">
                <i class="${highlight.icon || 'fas fa-star'}"></i>
            </div>
            <div class="highlight-info">
                <div class="highlight-name">${escapeHtml(highlight.name)}</div>
                <div class="highlight-count">${highlight.count || 0} statuses</div>
            </div>
        `;
        
        highlightItem.addEventListener('click', () => {
            // Show highlight content
            showNotification(`Opening ${highlight.name}`, 'info');
        });
        
        highlightsContent.appendChild(highlightItem);
    });
}

// Show highlights editor
function showHighlightsEditor(highlight = null) {
    const editorTitle = document.getElementById('highlightEditorTitle');
    const nameInput = document.getElementById('highlightNameInput');
    const iconSelect = document.getElementById('highlightIconSelect');
    
    if (editorTitle && nameInput && iconSelect) {
        if (highlight) {
            editorTitle.textContent = 'Edit Highlight';
            nameInput.value = highlight.name || '';
            iconSelect.value = highlight.icon || 'fas fa-star';
            
            // Select color
            const colorGrid = document.getElementById('highlightColorGrid');
            if (colorGrid && highlight.color) {
                const colorOption = colorGrid.querySelector(`[data-bg="${highlight.color}"]`);
                if (colorOption) {
                    document.querySelectorAll('#highlightColorGrid .background-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    colorOption.classList.add('selected');
                }
            }
            
            // Select privacy
            const privacyOptions = document.getElementById('highlightPrivacyOptions');
            if (privacyOptions && highlight.privacy) {
                const privacyOption = privacyOptions.querySelector(`[data-privacy="${highlight.privacy}"]`);
                if (privacyOption) {
                    document.querySelectorAll('#highlightPrivacyOptions .privacy-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    privacyOption.classList.add('selected');
                }
            }
        } else {
            editorTitle.textContent = 'Create Highlight';
            nameInput.value = '';
            iconSelect.value = 'fas fa-star';
        }
    }
    
    highlightsEditorModal.classList.add('active');
}

// Save highlight - USING api.js
async function saveHighlight() {
    const nameInput = document.getElementById('highlightNameInput');
    const iconSelect = document.getElementById('highlightIconSelect');
    const selectedColor = document.querySelector('#highlightColorGrid .background-option.selected');
    const selectedPrivacy = document.querySelector('#highlightPrivacyOptions .privacy-option.selected');
    
    if (!nameInput || !nameInput.value.trim()) {
        showNotification('Please enter a highlight name', 'error');
        return;
    }
    
    const highlight = {
        id: 'highlight_' + Date.now(),
        name: nameInput.value.trim(),
        icon: iconSelect.value,
        color: selectedColor ? selectedColor.dataset.bg : 'gradient-1',
        privacy: selectedPrivacy ? selectedPrivacy.dataset.privacy : 'friends',
        count: 0,
        statusIds: [],
        createdAt: new Date().toISOString()
    };
    
    try {
        console.log('Saving highlight via api.js');
        const response = await makeAuthenticatedRequest('/api/statuses/highlights', {
            method: 'POST',
            body: JSON.stringify(highlight)
        });
        
        if (response && response.success) {
            highlights.push(highlight);
            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
            
            showNotification('Highlight saved successfully', 'success');
            highlightsEditorModal.classList.remove('active');
            loadHighlightsContent();
        }
    } catch (error) {
        console.error('Error saving highlight:', error);
        showNotification('Failed to save highlight', 'error');
    }
}

// Show memory timeline modal
function showMemoryTimelineModal() {
    memoryTimelineModal.classList.add('active');
    loadMemoryTimelineContent();
}

// Load memory timeline content
function loadMemoryTimelineContent() {
    const memoryTimelineContent = document.getElementById('memoryTimelineContent');
    if (!memoryTimelineContent) return;
    
    // Group statuses by month
    const groupedByMonth = {};
    myStatuses.forEach(status => {
        const date = new Date(status.createdAt);
        const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        if (!groupedByMonth[monthYear]) {
            groupedByMonth[monthYear] = [];
        }
        groupedByMonth[monthYear].push(status);
    });
    
    memoryTimelineContent.innerHTML = '';
    
    Object.entries(groupedByMonth).forEach(([monthYear, monthStatuses]) => {
        const monthSection = document.createElement('div');
        monthSection.className = 'timeline-month';
        
        let daysHtml = '';
        monthStatuses.slice(0, 10).forEach(status => {
            const date = new Date(status.createdAt);
            const day = date.getDate();
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            
            daysHtml += `
                <div class="timeline-day" data-status-id="${status.id}">
                    <div class="timeline-date">${day} ${month}</div>
                    <div class="timeline-status">${getStatusPreviewText(status)}</div>
                    ${status.mood ? `<div class="timeline-mood" style="background-color: ${statusMoods[status.mood]?.color || 'var(--mood-happy)'}"></div>` : ''}
                </div>
            `;
        });
        
        monthSection.innerHTML = `
            <div class="timeline-month-header">${monthYear}</div>
            <div class="timeline-days">
                ${daysHtml}
            </div>
        `;
        
        // Add click events to days
        const dayElements = monthSection.querySelectorAll('.timeline-day');
        dayElements.forEach(dayElement => {
            dayElement.addEventListener('click', () => {
                const statusId = dayElement.dataset.statusId;
                const status = myStatuses.find(s => s.id === statusId);
                if (status) {
                    showStatusViewer(status);
                    memoryTimelineModal.classList.remove('active');
                }
            });
        });
        
        memoryTimelineContent.appendChild(monthSection);
    });
}

// Show stats modal
function showStatsModal() {
    statsModal.classList.add('active');
    loadStatsContent();
}

// Load stats content
function loadStatsContent() {
    const statsContent = document.getElementById('statsContent');
    if (!statsContent) return;
    
    // Calculate stats
    const totalStatuses = myStatuses.length;
    const totalViews = myStatuses.reduce((sum, status) => sum + (status.views || 0), 0);
    const avgViewTime = myStatuses.length > 0 ? 
        Math.round(myStatuses.reduce((sum, status) => sum + (status.avgViewTime || 0), 0) / myStatuses.length) : 0;
    const totalReactions = myStatuses.reduce((sum, status) => sum + (status.reactions || 0), 0);
    const engagementRate = totalViews > 0 ? Math.round((totalReactions / totalViews) * 100) : 0;
    
    const mostPopularMood = getMostPopularMood();
    
    // Update quick stats
    const totalStatusesStat = document.getElementById('totalStatusesStat');
    const totalViewsStat = document.getElementById('totalViewsStat');
    const totalReactionsStat = document.getElementById('totalReactionsStat');
    const streakStat = document.getElementById('streakStat');
    const avgViewTimeStat = document.getElementById('avgViewTimeStat');
    const engagementRateStat = document.getElementById('engagementRateStat');
    
    if (totalStatusesStat) totalStatusesStat.textContent = totalStatuses;
    if (totalViewsStat) totalViewsStat.textContent = totalViews;
    if (totalReactionsStat) totalReactionsStat.textContent = totalReactions;
    if (streakStat) streakStat.textContent = streakCount;
    if (avgViewTimeStat) avgViewTimeStat.textContent = avgViewTime + 's';
    if (engagementRateStat) engagementRateStat.textContent = engagementRate + '%';
    
    // Update chart
    updateStatsChart();
    
    // Load recent viewers
    loadRecentViewers();
}

// Update stats chart
function updateStatsChart() {
    const viewsChart = document.getElementById('viewsChart');
    if (!viewsChart) return;
    
    // Generate sample data for demo
    const chartData = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        chartData.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            views: Math.floor(Math.random() * 100) + 10
        });
    }
    
    // Create simple bar chart
    viewsChart.innerHTML = '';
    const chartHeight = 200;
    const maxViews = Math.max(...chartData.map(d => d.views));
    
    const chartContainer = document.createElement('div');
    chartContainer.style.display = 'flex';
    chartContainer.style.alignItems = 'flex-end';
    chartContainer.style.gap = '2px';
    chartContainer.style.height = chartHeight + 'px';
    chartContainer.style.width = '100%';
    
    chartData.forEach((data, index) => {
        const bar = document.createElement('div');
        bar.style.flex = '1';
        bar.style.height = (data.views / maxViews * 100) + '%';
        bar.style.backgroundColor = 'var(--primary-color)';
        bar.style.borderRadius = '2px 2px 0 0';
        bar.style.position = 'relative';
        bar.title = `${data.date}: ${data.views} views`;
        
        // Add hover effect
        bar.addEventListener('mouseenter', () => {
            bar.style.backgroundColor = '#0073e6';
        });
        bar.addEventListener('mouseleave', () => {
            bar.style.backgroundColor = 'var(--primary-color)';
        });
        
        chartContainer.appendChild(bar);
    });
    
    viewsChart.appendChild(chartContainer);
}

// Load recent viewers
function loadRecentViewers() {
    const recentViewersList = document.getElementById('recentViewersList');
    if (!recentViewersList) return;
    
    recentViewersList.innerHTML = '';
    
    // Generate sample viewers for demo
    const sampleViewers = [
        { name: 'Alex Johnson', time: '2 hours ago', avatar: 'AJ' },
        { name: 'Sam Wilson', time: '5 hours ago', avatar: 'SW' },
        { name: 'Taylor Swift', time: '1 day ago', avatar: 'TS' },
        { name: 'John Doe', time: '2 days ago', avatar: 'JD' },
        { name: 'Jane Smith', time: '3 days ago', avatar: 'JS' }
    ];
    
    sampleViewers.forEach(viewer => {
        const viewerItem = document.createElement('div');
        viewerItem.className = 'viewer-item';
        viewerItem.innerHTML = `
            <div class="viewer-avatar">${viewer.avatar}</div>
            <div class="viewer-info">
                <div class="viewer-name">${viewer.name}</div>
                <div class="viewer-time">${viewer.time}</div>
            </div>
        `;
        recentViewersList.appendChild(viewerItem);
    });
}

// Get most popular mood
function getMostPopularMood() {
    const moodCounts = {};
    myStatuses.forEach(status => {
        if (status.mood) {
            moodCounts[status.mood] = (moodCounts[status.mood] || 0) + 1;
        }
    });
    
    let mostPopular = null;
    let maxCount = 0;
    
    Object.entries(moodCounts).forEach(([mood, count]) => {
        if (count > maxCount) {
            mostPopular = mood;
            maxCount = count;
        }
    });
    
    return mostPopular;
}

// Show drafts modal
function showDraftsModal() {
    draftsModal.classList.add('active');
    updateDraftsList();
}

// Update drafts list
function updateDraftsList() {
    const allDraftsList = document.getElementById('allDraftsList');
    if (!allDraftsList) return;
    
    allDraftsList.innerHTML = '';
    
    if (drafts.length === 0) {
        allDraftsList.innerHTML = `
            <div class="drafts-empty">
                <i class="fas fa-file-alt"></i>
                <p>No drafts yet</p>
                <p class="subtext">Save a status as draft to see it here</p>
            </div>
        `;
        return;
    }
    
    drafts.forEach(draft => {
        const draftItem = document.createElement('div');
        draftItem.className = 'draft-item';
        draftItem.dataset.draftId = draft.id;
        
        let previewText = '';
        if (draft.type === 'text') {
            previewText = draft.text || 'Text draft';
        } else if (draft.type === 'media') {
            previewText = `📷 ${draft.caption || 'Media draft'}`;
        } else if (draft.type === 'poll') {
            previewText = `📊 ${draft.question || 'Poll draft'}`;
        }
        
        const timeAgo = draft.createdAt ? formatTimeAgo(new Date(draft.createdAt)) : 'Just now';
        
        draftItem.innerHTML = `
            <div class="draft-preview">${escapeHtml(previewText.substring(0, 100) + (previewText.length > 100 ? '...' : ''))}</div>
            <div class="draft-meta">
                <span>${timeAgo} • ${draft.type || 'Unknown'}</span>
                <div class="draft-actions">
                    <button class="draft-action-btn" data-action="edit" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="draft-action-btn danger" data-action="delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Handle selection
        draftItem.addEventListener('click', (e) => {
            if (!e.target.closest('.draft-actions')) {
                draftItem.classList.toggle('selected');
                if (draftItem.classList.contains('selected')) {
                    selectedDraft = draft;
                    const loadDraftBtn = document.getElementById('loadDraftBtn');
                    if (loadDraftBtn) {
                        loadDraftBtn.disabled = false;
                    }
                } else {
                    selectedDraft = null;
                    const loadDraftBtn = document.getElementById('loadDraftBtn');
                    if (loadDraftBtn) {
                        loadDraftBtn.disabled = true;
                    }
                }
            }
        });
        
        // Handle draft actions
        const actionButtons = draftItem.querySelectorAll('.draft-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleDraftAction(action, draft);
            });
        });
        
        allDraftsList.appendChild(draftItem);
    });
}

// Handle draft action
function handleDraftAction(action, draft) {
    switch(action) {
        case 'edit':
            loadDraft(draft);
            break;
        case 'delete':
            deleteDraft(draft.id);
            break;
    }
}

// Load draft into editor
function loadDraft(draft) {
    if (!draft) return;
    
    // Open create status modal
    createStatusModal.classList.add('active');
    
    // Set text based on draft type
    if (draft.type === 'text') {
        const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
        if (textTab) {
            textTab.click();
        }
        const textInput = document.getElementById('textStatusInput');
        if (textInput && draft.text) {
            textInput.value = draft.text;
            updateTextStatusCounter();
        }
    } else if (draft.type === 'media') {
        const mediaTab = document.querySelector('.create-status-tab[data-tab="media"]');
        if (mediaTab) {
            mediaTab.click();
        }
        const captionInput = document.getElementById('mediaCaptionInput');
        if (captionInput && draft.caption) {
            captionInput.value = draft.caption;
        }
    } else if (draft.type === 'poll') {
        const pollTab = document.querySelector('.create-status-tab[data-tab="poll"]');
        if (pollTab) {
            pollTab.click();
        }
        const questionInput = document.getElementById('pollQuestionInput');
        if (questionInput && draft.question) {
            questionInput.value = draft.question;
        }
    }
    
    // Close drafts modal
    draftsModal.classList.remove('active');
    showNotification('Draft loaded', 'success');
}

// Delete draft
function deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft?')) {
        return;
    }
    
    drafts = drafts.filter(draft => draft.id !== draftId);
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    showNotification('Draft deleted', 'success');
    updateDraftsList();
}

// Delete all drafts
function deleteAllDrafts() {
    if (drafts.length === 0) {
        showNotification('No drafts to delete', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to delete all drafts? This action cannot be undone.')) {
        return;
    }
    
    drafts = [];
    localStorage.setItem(LOCAL_STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
    showNotification('All drafts deleted', 'success');
    updateDraftsList();
}

// Update scheduled statuses list
function updateScheduledStatusesList() {
    const scheduledStatusesList = document.getElementById('scheduledStatusesList');
    if (!scheduledStatusesList) return;
    
    scheduledStatusesList.innerHTML = '';
    
    if (scheduledStatuses.length === 0) {
        scheduledStatusesList.innerHTML = `
            <div class="schedule-empty">
                <i class="fas fa-clock"></i>
                <p>No scheduled statuses</p>
                <p class="subtext">Schedule a status to see it here</p>
            </div>
        `;
        return;
    }
    
    scheduledStatuses.forEach(scheduled => {
        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        
        const scheduledFor = new Date(scheduled.scheduledFor);
        const timeString = scheduledFor.toLocaleString();
        
        scheduleItem.innerHTML = `
            <div class="schedule-info">
                <h4>${scheduled.type || 'Status'} - ${getStatusPreviewText(scheduled)}</h4>
                <div class="schedule-time">Scheduled for: ${timeString}</div>
            </div>
            <div class="schedule-actions">
                <button class="edit-btn" data-action="edit" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="cancel-btn" data-action="cancel" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Handle schedule actions
        const actionButtons = scheduleItem.querySelectorAll('button');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleScheduleAction(action, scheduled);
            });
        });
        
        scheduledStatusesList.appendChild(scheduleItem);
    });
}

// Handle schedule action
function handleScheduleAction(action, scheduled) {
    switch(action) {
        case 'edit':
            // Load scheduled status for editing
            showNotification('Edit scheduled status feature coming soon', 'info');
            break;
        case 'cancel':
            cancelScheduledStatus(scheduled.id);
            break;
    }
}

// Cancel scheduled status - USING api.js
async function cancelScheduledStatus(scheduleId) {
    if (!confirm('Are you sure you want to cancel this scheduled status?')) {
        return;
    }
    
    try {
        console.log('Cancelling scheduled status via api.js');
        const response = await makeAuthenticatedRequest(`/api/statuses/schedule/${scheduleId}`, {
            method: 'DELETE'
        });
        
        if (response && response.success) {
            scheduledStatuses = scheduledStatuses.filter(s => s.id !== scheduleId);
            localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED, JSON.stringify(scheduledStatuses));
            showNotification('Scheduled status cancelled', 'success');
            updateScheduledStatusesList();
        }
    } catch (error) {
        console.error('Error cancelling scheduled status:', error);
        showNotification('Failed to cancel scheduled status', 'error');
    }
}

// Add filter tag
function addFilterTag(filter, label) {
    const filterTags = document.getElementById('filterTags');
    if (!filterTags) return;
    
    // Check if filter already exists
    if (activeFilters.has(filter)) return;
    
    activeFilters.add(filter);
    
    const filterTag = document.createElement('div');
    filterTag.className = 'filter-tag active';
    filterTag.dataset.filter = filter;
    filterTag.innerHTML = `
        ${label}
        <i class="fas fa-times"></i>
    `;
    
    filterTag.addEventListener('click', () => {
        removeFilterTag(filter);
    });
    
    filterTags.appendChild(filterTag);
    
    // Show clear filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.style.display = 'block';
    }
    
    updateCurrentSection();
}

// Remove filter tag
function removeFilterTag(filter) {
    activeFilters.delete(filter);
    
    const filterTag = document.querySelector(`.filter-tag[data-filter="${filter}"]`);
    if (filterTag) {
        filterTag.remove();
    }
    
    // Hide clear filters button if no filters
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn && activeFilters.size === 0) {
        clearFiltersBtn.style.display = 'none';
    }
    
    updateCurrentSection();
}

// Clear all filters
function clearAllFilters() {
    activeFilters.clear();
    
    const filterTags = document.getElementById('filterTags');
    if (filterTags) {
        filterTags.innerHTML = '';
    }
    
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.style.display = 'none';
    }
    
    updateCurrentSection();
}

// Show notification
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

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Setup basic event listeners (don't require auth)
function setupBasicEventListeners() {
    // Create status button
    const createStatusBtn = document.getElementById('createStatusBtn');
    if (createStatusBtn) {
        createStatusBtn.addEventListener('click', () => {
            createStatusModal.classList.add('active');
            const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
            if (textTab) {
                textTab.click();
            }
        });
    }
    
    // Close create status modal
    const closeCreateStatusModal = document.getElementById('closeCreateStatusModal');
    if (closeCreateStatusModal) {
        closeCreateStatusModal.addEventListener('click', () => {
            createStatusModal.classList.remove('active');
        });
    }
    
    // Close notification
    const closeNotificationBtn = document.getElementById('closeNotificationBtn');
    if (closeNotificationBtn) {
        closeNotificationBtn.addEventListener('click', () => {
            notification.classList.remove('active');
        });
    }
    
    // Window resize
    window.addEventListener('resize', () => {
        isMobile = window.innerWidth <= 768;
    });
}

// Setup event listeners
function setupEventListeners() {
    // Create status button (already handled in basic)
    
    // Close create status modal (already handled in basic)
    
    // Create status tabs
    document.querySelectorAll('.create-status-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.create-status-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.create-status-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
    
    // Text status input counter
    const textStatusInput = document.getElementById('textStatusInput');
    if (textStatusInput) {
        textStatusInput.addEventListener('input', updateTextStatusCounter);
        updateTextStatusCounter();
    }
    
    // Clear text button
    const clearTextBtn = document.getElementById('clearTextBtn');
    if (clearTextBtn) {
        clearTextBtn.addEventListener('click', () => {
            if (textStatusInput) {
                textStatusInput.value = '';
                updateTextStatusCounter();
            }
        });
    }
    
    // Media upload area
    const mediaUploadArea = document.getElementById('mediaUploadArea');
    const mediaFileInput = document.getElementById('mediaFileInput');
    
    if (mediaUploadArea && mediaFileInput) {
        mediaUploadArea.addEventListener('click', () => {
            mediaFileInput.click();
        });
        
        mediaFileInput.addEventListener('change', handleMediaUpload);
        
        // Add drag and drop support
        mediaUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            mediaUploadArea.style.backgroundColor = 'rgba(0, 132, 255, 0.1)';
        });
        
        mediaUploadArea.addEventListener('dragleave', () => {
            mediaUploadArea.style.backgroundColor = '';
        });
        
        mediaUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            mediaUploadArea.style.backgroundColor = '';
            
            if (e.dataTransfer.files.length > 0) {
                const files = e.dataTransfer.files;
                const fileArray = Array.from(files);
                handleMediaUpload({ target: { files: fileArray } });
            }
        });
    }
    
    // Add poll option
    const addPollOptionBtn = document.getElementById('addPollOptionBtn');
    if (addPollOptionBtn) {
        addPollOptionBtn.addEventListener('click', () => {
            const pollOptionsContainer = document.getElementById('pollOptionsContainer');
            if (!pollOptionsContainer) return;
            
            const optionCount = pollOptionsContainer.children.length + 1;
            if (optionCount > 6) {
                showNotification('Maximum 6 options allowed', 'warning');
                return;
            }
            
            addPollOption(optionCount);
        });
    }
    
    // Post status button
    const postStatusBtn = document.getElementById('postStatusBtn');
    if (postStatusBtn) {
        postStatusBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) return;
            
            const activeTabName = activeTab.dataset.tab;
            let statusData = {
                type: activeTabName,
                userId: currentUser?.id,
                user: currentUser,
                createdAt: new Date().toISOString(),
                views: 0,
                reactions: 0
            };
            
            // Get metadata
            const selectedIntent = document.querySelector('.intent-option.selected')?.dataset.intent;
            const selectedMood = document.querySelector('.mood-option.selected')?.dataset.mood;
            const selectedCategory = document.querySelector('.category-option.selected')?.dataset.category;
            const selectedPrivacy = document.querySelector('.privacy-option.selected')?.dataset.privacy;
            const selectedDuration = document.querySelector('.duration-option.selected')?.dataset.duration;
            const selectedActions = Array.from(document.querySelectorAll('.action-button-option.selected')).map(opt => opt.dataset.action);
            
            if (selectedIntent) statusData.intent = selectedIntent;
            if (selectedMood) statusData.mood = selectedMood;
            if (selectedCategory) statusData.category = selectedCategory;
            if (selectedPrivacy) statusData.privacy = selectedPrivacy;
            if (selectedDuration) statusData.duration = selectedDuration;
            if (selectedActions.length > 0) statusData.actionButtons = selectedActions;
            
            // Advanced options
            const sensitiveToggle = document.getElementById('sensitiveContentToggle');
            const silentToggle = document.getElementById('silentModeToggle');
            const translateToggle = document.getElementById('autoTranslateToggle');
            const offlineToggle = document.getElementById('offlineQueueToggle');
            
            if (sensitiveToggle) statusData.isSensitive = sensitiveToggle.checked;
            if (silentToggle) statusData.isSilent = silentToggle.checked;
            if (translateToggle) statusData.autoTranslate = translateToggle.checked;
            if (offlineToggle) statusData.offlineQueue = offlineToggle.checked;
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Please enter text for your status', 'error');
                    return;
                }
                
                statusData.text = text;
                const selectedBg = document.querySelector('.background-option.selected');
                if (selectedBg) {
                    statusData.background = selectedBg.dataset.bg;
                }
                
            } else if (activeTabName === 'media') {
                // Check if media is uploaded
                const mediaPreview = document.getElementById('mediaPreview');
                if (!mediaPreview || mediaPreview.children.length === 0) {
                    showNotification('Please upload at least one media file', 'error');
                    return;
                }
                
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                statusData.caption = caption;
                statusData.mediaType = 'image'; // Simplified - in real app would detect type
                statusData.mediaUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; // Placeholder
                
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Please enter a question for your poll', 'error');
                    return;
                }
                
                const options = Array.from(document.querySelectorAll('.poll-option-input')).map(input => ({
                    id: `option_${input.dataset.index}`,
                    text: input.value.trim(),
                    votes: 0
                })).filter(opt => opt.text);
                
                if (options.length < 2) {
                    showNotification('Please enter at least 2 options', 'error');
                    return;
                }
                
                statusData.question = question;
                statusData.options = options;
                const durationSelect = document.getElementById('pollDurationSelect');
                if (durationSelect) {
                    statusData.duration = durationSelect.value;
                }
            }
            
            postStatus(statusData);
            createStatusModal.classList.remove('active');
        });
    }
    
    // Save draft button
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) return;
            
            const activeTabName = activeTab.dataset.tab;
            let draftData = {
                type: activeTabName,
                createdAt: new Date().toISOString()
            };
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.text = text;
                const selectedBg = document.querySelector('.background-option.selected');
                if (selectedBg) {
                    draftData.background = selectedBg.dataset.bg;
                }
            } else if (activeTabName === 'media') {
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                if (!caption) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.caption = caption;
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Nothing to save', 'warning');
                    return;
                }
                draftData.question = question;
                
                const options = Array.from(document.querySelectorAll('.poll-option-input')).map(input => ({
                    id: `option_${input.dataset.index}`,
                    text: input.value.trim(),
                    votes: 0
                })).filter(opt => opt.text);
                
                if (options.length < 2) {
                    showNotification('Please enter at least 2 options to save as draft', 'error');
                    return;
                }
                
                draftData.options = options;
            }
            
            // Get metadata
            const selectedIntent = document.querySelector('.intent-option.selected')?.dataset.intent;
            const selectedMood = document.querySelector('.mood-option.selected')?.dataset.mood;
            const selectedCategory = document.querySelector('.category-option.selected')?.dataset.category;
            
            if (selectedIntent) draftData.intent = selectedIntent;
            if (selectedMood) draftData.mood = selectedMood;
            if (selectedCategory) draftData.category = selectedCategory;
            
            saveDraft(draftData);
            createStatusModal.classList.remove('active');
        });
    }
    
    // Schedule button
    const scheduleStatusBtn = document.getElementById('scheduleStatusBtn');
    if (scheduleStatusBtn) {
        scheduleStatusBtn.addEventListener('click', () => {
            scheduleModal.classList.add('active');
            
            // Set default date/time (tomorrow at same time)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            const timeStr = tomorrow.toTimeString().split(':').slice(0, 2).join(':');
            
            const scheduleDate = document.getElementById('scheduleDate');
            const scheduleTime = document.getElementById('scheduleTime');
            
            if (scheduleDate) scheduleDate.value = dateStr;
            if (scheduleTime) scheduleTime.value = timeStr;
        });
    }
    
    // Close schedule modal
    const closeScheduleModal = document.getElementById('closeScheduleModal');
    if (closeScheduleModal) {
        closeScheduleModal.addEventListener('click', () => {
            scheduleModal.classList.remove('active');
        });
    }
    
    // Confirm schedule
    const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
    if (confirmScheduleBtn) {
        confirmScheduleBtn.addEventListener('click', () => {
            const scheduleDate = document.getElementById('scheduleDate');
            const scheduleTime = document.getElementById('scheduleTime');
            
            if (!scheduleDate || !scheduleTime || !scheduleDate.value || !scheduleTime.value) {
                showNotification('Please select both date and time', 'error');
                return;
            }
            
            const scheduleDateTime = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
            if (scheduleDateTime <= new Date()) {
                showNotification('Please select a future date and time', 'error');
                return;
            }
            
            // Get status data from create modal
            const activeTab = document.querySelector('.create-status-tab.active');
            if (!activeTab) {
                showNotification('Please create a status first', 'error');
                return;
            }
            
            const activeTabName = activeTab.dataset.tab;
            let statusData = {
                type: activeTabName,
                userId: currentUser?.id,
                user: currentUser
            };
            
            if (activeTabName === 'text') {
                const textInput = document.getElementById('textStatusInput');
                const text = textInput ? textInput.value.trim() : '';
                if (!text) {
                    showNotification('Please enter text for your status', 'error');
                    return;
                }
                statusData.text = text;
            } else if (activeTabName === 'media') {
                const captionInput = document.getElementById('mediaCaptionInput');
                const caption = captionInput ? captionInput.value.trim() : '';
                statusData.caption = caption;
            } else if (activeTabName === 'poll') {
                const questionInput = document.getElementById('pollQuestionInput');
                const question = questionInput ? questionInput.value.trim() : '';
                if (!question) {
                    showNotification('Please enter a question for your poll', 'error');
                    return;
                }
                statusData.question = question;
            }
            
            // Get repeat option
            const selectedRepeat = document.querySelector('.repeat-option.selected')?.dataset.repeat || 'none';
            
            scheduleStatus(statusData, scheduleDateTime.toISOString());
            showNotification('Status scheduled successfully', 'success');
            scheduleModal.classList.remove('active');
            createStatusModal.classList.remove('active');
        });
    }
    
    // Category tabs
    const categoryTabs = {
        'allTab': 'allStatusSection',
        'friendsTab': 'friendsStatusSection',
        'closeFriendsTab': 'closeFriendsStatusSection',
        'pinnedTab': 'pinnedStatusSection',
        'mutedTab': 'mutedStatusSection',
        'microCirclesTab': 'microCirclesStatusSection',
        'myStatusTab': 'myStatusSection'
    };
    
    Object.keys(categoryTabs).forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                document.querySelectorAll('.statuses-section').forEach(section => {
                    section.classList.remove('active');
                });
                
                const sectionId = categoryTabs[tabId];
                document.getElementById(sectionId).classList.add('active');
                updateCurrentSection();
            });
        }
    });
    
    // Intent & mood filter buttons
    document.querySelectorAll('.category-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            let label = '';
            
            if (filter.startsWith('intent-')) {
                const intentKey = filter.replace('intent-', '');
                label = statusIntents[intentKey]?.name || intentKey;
                addFilterTag(filter, label);
            } else if (filter.startsWith('mood-')) {
                const moodKey = filter.replace('mood-', '');
                label = statusMoods[moodKey]?.name || moodKey;
                addFilterTag(filter, label);
            }
        });
    });
    
    // Clear filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }
    
    // Viewer back button
    const viewerBackBtn = document.getElementById('viewerBackBtn');
    if (viewerBackBtn) {
        viewerBackBtn.addEventListener('click', () => {
            statusViewerPanel.classList.remove('active');
            stopAutoAdvance();
        });
    }
    
    // Pause/resume button
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) {
        pauseResumeBtn.addEventListener('click', toggleAutoAdvance);
    }
    
    // Mute user button
    const muteUserBtn = document.getElementById('muteUserBtn');
    if (muteUserBtn) {
        muteUserBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                if (mutedUsers.has(currentViewerStatus.userId)) {
                    unmuteUser(currentViewerStatus.userId);
                } else {
                    muteUser(currentViewerStatus.userId);
                }
            }
        });
    }
    
    // Share status button
    const shareStatusBtn = document.getElementById('shareStatusBtn');
    if (shareStatusBtn) {
        shareStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                // Use Web Share API if available
                if (navigator.share) {
                    navigator.share({
                        title: 'Status from ' + (currentViewerStatus.user?.displayName || 'User'),
                        text: currentViewerStatus.text || currentViewerStatus.caption || currentViewerStatus.question || 'Check out this status',
                        url: window.location.href
                    }).catch(error => {
                        console.log('Error sharing:', error);
                    });
                } else {
                    // Fallback to clipboard
                    navigator.clipboard.writeText(window.location.href).then(() => {
                        showNotification('Link copied to clipboard', 'success');
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                    });
                }
            }
        });
    }
    
    // Save status button
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    if (saveStatusBtn) {
        saveStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                const action = saveStatusBtn.dataset.action;
                
                if (action === 'save') {
                    // Save to highlights
                    if (highlights.length === 0) {
                        showNotification('Please create a highlight first', 'info');
                        showHighlightsModal();
                    } else {
                        // Add to first highlight for simplicity
                        const highlight = highlights[0];
                        if (!highlight.statusIds) {
                            highlight.statusIds = [];
                        }
                        if (!highlight.statusIds.includes(currentViewerStatus.id)) {
                            highlight.statusIds.push(currentViewerStatus.id);
                            highlight.count = highlight.statusIds.length;
                            localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
                            
                            saveStatusBtn.innerHTML = '<i class="fas fa-bookmark"></i>';
                            saveStatusBtn.title = 'Remove from Highlights';
                            saveStatusBtn.dataset.action = 'unsave';
                            showNotification('Status saved to highlights', 'success');
                        }
                    }
                } else if (action === 'unsave') {
                    // Remove from highlights
                    highlights.forEach(highlight => {
                        if (highlight.statusIds && highlight.statusIds.includes(currentViewerStatus.id)) {
                            highlight.statusIds = highlight.statusIds.filter(id => id !== currentViewerStatus.id);
                            highlight.count = highlight.statusIds.length;
                        }
                    });
                    localStorage.setItem(LOCAL_STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights));
                    
                    saveStatusBtn.innerHTML = '<i class="far fa-bookmark"></i>';
                    saveStatusBtn.title = 'Save to Highlights';
                    saveStatusBtn.dataset.action = 'save';
                    showNotification('Status removed from highlights', 'success');
                }
            }
        });
    }
    
    // Report status button
    const reportStatusBtn = document.getElementById('reportStatusBtn');
    if (reportStatusBtn) {
        reportStatusBtn.addEventListener('click', () => {
            if (currentViewerStatus) {
                reportModal.classList.add('active');
            }
        });
    }
    
    // Close report modal
    const closeReportModal = document.getElementById('closeReportModal');
    if (closeReportModal) {
        closeReportModal.addEventListener('click', () => {
            reportModal.classList.remove('active');
        });
    }
    
    // Report details counter
    const reportDetails = document.getElementById('reportDetails');
    if (reportDetails) {
        reportDetails.addEventListener('input', updateReportDetailsCounter);
    }
    
    // Anonymous report toggle
    const anonymousReportToggle = document.getElementById('anonymousReportToggle');
    if (anonymousReportToggle) {
        anonymousReportToggle.addEventListener('change', updateReportSubmitButton);
    }
    
    // Submit report
    const submitReportBtn = document.getElementById('submitReportBtn');
    if (submitReportBtn) {
        submitReportBtn.addEventListener('click', () => {
            const selectedReason = document.querySelector('#reportReasons .category-option.selected')?.dataset.reason;
            const reportDetails = document.getElementById('reportDetails');
            const details = reportDetails ? reportDetails.value.trim() : '';
            const anonymousToggle = document.getElementById('anonymousReportToggle');
            const isAnonymous = anonymousToggle ? anonymousToggle.checked : false;
            
            if (!selectedReason) {
                showNotification('Please select a reason', 'error');
                return;
            }
            
            if (details.length < 10) {
                showNotification('Please provide more details (minimum 10 characters)', 'error');
                return;
            }
            
            if (currentViewerStatus) {
                reportStatus(currentViewerStatus.id, selectedReason, details);
                showNotification(`Report submitted ${isAnonymous ? 'anonymously' : ''}`, 'success');
                reportModal.classList.remove('active');
            }
        });
    }
    
    // Send reply
    const sendReplyBtn = document.getElementById('sendReplyBtn');
    if (sendReplyBtn) {
        sendReplyBtn.addEventListener('click', () => {
            const replyInput = document.getElementById('replyInput');
            if (!replyInput) return;
            
            const replyText = replyInput.value.trim();
            if (!replyText) return;
            
            if (currentViewerStatus) {
                // In a real implementation, this would send a reply to the status
                showNotification('Reply sent: ' + replyText, 'success');
                replyInput.value = '';
            }
        });
    }
    
    // Reply input enter key
    const replyInput = document.getElementById('replyInput');
    if (replyInput) {
        replyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const sendReplyBtn = document.getElementById('sendReplyBtn');
                if (sendReplyBtn) {
                    sendReplyBtn.click();
                }
            }
        });
    }
    
    // View highlights
    const viewHighlightsBtn = document.getElementById('viewHighlightsBtn');
    if (viewHighlightsBtn) {
        viewHighlightsBtn.addEventListener('click', showHighlightsModal);
    }
    
    const closeHighlightsModal = document.getElementById('closeHighlightsModal');
    if (closeHighlightsModal) {
        closeHighlightsModal.addEventListener('click', () => {
            highlightsModal.classList.remove('active');
        });
    }
    
    // Create highlight
    const createHighlightBtn = document.getElementById('createHighlightBtn');
    if (createHighlightBtn) {
        createHighlightBtn.addEventListener('click', () => {
            showHighlightsEditor();
        });
    }
    
    // Close highlights editor
    const closeHighlightsEditor = document.getElementById('closeHighlightsEditor');
    if (closeHighlightsEditor) {
        closeHighlightsEditor.addEventListener('click', () => {
            highlightsEditorModal.classList.remove('active');
        });
    }
    
    // Cancel highlight
    const cancelHighlightBtn = document.getElementById('cancelHighlightBtn');
    if (cancelHighlightBtn) {
        cancelHighlightBtn.addEventListener('click', () => {
            highlightsEditorModal.classList.remove('active');
        });
    }
    
    // Save highlight
    const saveHighlightBtn = document.getElementById('saveHighlightBtn');
    if (saveHighlightBtn) {
        saveHighlightBtn.addEventListener('click', saveHighlight);
    }
    
    // View timeline
    const viewTimelineBtn = document.getElementById('viewTimelineBtn');
    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', showMemoryTimelineModal);
    }
    
    const closeMemoryTimelineModal = document.getElementById('closeMemoryTimelineModal');
    if (closeMemoryTimelineModal) {
        closeMemoryTimelineModal.addEventListener('click', () => {
            memoryTimelineModal.classList.remove('active');
        });
    }
    
    // Export timeline
    const exportTimelineBtn = document.getElementById('exportTimelineBtn');
    if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener('click', () => {
            // Create a blob with the timeline data
            const timelineData = {
                user: currentUser?.displayName || 'User',
                exportDate: new Date().toISOString(),
                totalStatuses: myStatuses.length,
                statuses: myStatuses.map(s => ({
                    date: s.createdAt,
                    type: s.type,
                    text: s.text || s.caption || s.question,
                    mood: s.mood,
                    intent: s.intent
                }))
            };
            
            const blob = new Blob([JSON.stringify(timelineData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `timeline-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('Timeline exported successfully', 'success');
        });
    }
    
    // View stats
    const viewStatsBtn = document.getElementById('viewStatsBtn');
    if (viewStatsBtn) {
        viewStatsBtn.addEventListener('click', showStatsModal);
    }
    
    const closeStatsModal = document.getElementById('closeStatsModal');
    if (closeStatsModal) {
        closeStatsModal.addEventListener('click', () => {
            statsModal.classList.remove('active');
        });
    }
    
    // Refresh stats
    const refreshStatsBtn = document.getElementById('refreshStatsBtn');
    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', () => {
            loadStatsContent();
            showNotification('Stats refreshed', 'success');
        });
    }
    
    // View drafts
    const viewDraftsBtn = document.getElementById('viewDraftsBtn');
    if (viewDraftsBtn) {
        viewDraftsBtn.addEventListener('click', showDraftsModal);
    }
    
    const closeDraftsModal = document.getElementById('closeDraftsModal');
    if (closeDraftsModal) {
        closeDraftsModal.addEventListener('click', () => {
            draftsModal.classList.remove('active');
        });
    }
    
    // Delete all drafts
    const deleteAllDraftsBtn = document.getElementById('deleteAllDraftsBtn');
    if (deleteAllDraftsBtn) {
        deleteAllDraftsBtn.addEventListener('click', deleteAllDrafts);
    }
    
    // Load draft
    const loadDraftBtn = document.getElementById('loadDraftBtn');
    if (loadDraftBtn) {
        loadDraftBtn.addEventListener('click', () => {
            if (selectedDraft) {
                loadDraft(selectedDraft);
            }
        });
    }
    
    // View scheduled
    const viewScheduledBtn = document.getElementById('viewScheduledBtn');
    if (viewScheduledBtn) {
        viewScheduledBtn.addEventListener('click', () => {
            scheduleModal.classList.add('active');
        });
    }
    
    // View my status
    const viewMyStatusBtn = document.getElementById('viewMyStatusBtn');
    if (viewMyStatusBtn) {
        viewMyStatusBtn.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
            } else {
                showNotification('You have no statuses yet', 'info');
            }
        });
    }
    
    // Edit my status
    const editMyStatusBtn = document.getElementById('editMyStatusBtn');
    if (editMyStatusBtn) {
        editMyStatusBtn.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                // Load latest status for editing
                const latestStatus = myStatuses[0];
                createStatusModal.classList.add('active');
                const textTab = document.querySelector('.create-status-tab[data-tab="text"]');
                if (textTab) {
                    textTab.click();
                }
                
                if (latestStatus.type === 'text' && latestStatus.text) {
                    const textInput = document.getElementById('textStatusInput');
                    if (textInput) {
                        textInput.value = latestStatus.text;
                        updateTextStatusCounter();
                    }
                }
                
                showNotification('Loaded latest status for editing', 'success');
            } else {
                createStatusModal.classList.add('active');
            }
        });
    }
    
    // My status preview click
    const myStatusPreview = document.getElementById('myStatusPreview');
    if (myStatusPreview) {
        myStatusPreview.addEventListener('click', () => {
            if (myStatuses.length > 0) {
                showStatusViewer(myStatuses[0]);
            } else {
                createStatusModal.classList.add('active');
            }
        });
    }
    
    // Notification time select
    const notificationTimeSelect = document.getElementById('notificationTimeSelect');
    const scheduleNotificationToggle = document.getElementById('scheduleNotificationToggle');
    
    if (notificationTimeSelect && scheduleNotificationToggle) {
        scheduleNotificationToggle.addEventListener('change', function() {
            notificationTimeSelect.disabled = !this.checked;
        });
    }
    
    // Error UI buttons
    const retryConnectionBtn = document.getElementById('retryConnectionBtn');
    if (retryConnectionBtn) {
        retryConnectionBtn.addEventListener('click', async () => {
            errorUI.classList.remove('active');
            showNotification('Retrying connection...', 'info');
            
            try {
                // Reload tokens and reinitialize
                const success = await bootstrapIframe();
                if (!success) {
                    errorUI.classList.add('active');
                }
            } catch (error) {
                errorUI.classList.add('active');
            }
        });
    }
    
    const offlineModeBtn = document.getElementById('offlineModeBtn');
    if (offlineModeBtn) {
        offlineModeBtn.addEventListener('click', () => {
            errorUI.classList.remove('active');
            isOfflineMode = true;
            showNotification('Offline mode enabled', 'warning');
            loadCachedDataInstantly();
        });
    }
    
    // Close notification (already handled in basic)
    
    // Window resize (already handled in basic)
    
    // Before unload
    window.addEventListener('beforeunload', () => {
        stopAutoAdvance();
    });
}

// Handle media upload
function handleMediaUpload(event) {
    const files = event.target.files;
    const mediaPreview = document.getElementById('mediaPreview');
    
    if (!mediaPreview) return;
    
    mediaPreview.innerHTML = '';
    
    for (let i = 0; i < Math.min(files.length, 5); i++) {
        const file = files[i];
        const fileType = file.type.split('/')[0];
        
        if (fileType !== 'image' && fileType !== 'video') {
            showNotification('Only images and videos are supported', 'error');
            continue;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-preview-item';
            
            if (fileType === 'image') {
                mediaItem.innerHTML = `
                    <img src="${e.target.result}" class="media-preview-image" alt="Preview">
                    <button class="remove-media-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else if (fileType === 'video') {
                mediaItem.innerHTML = `
                    <video src="${e.target.result}" class="media-preview-image" controls></video>
                    <button class="remove-media-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            
            // Remove button
            const removeBtn = mediaItem.querySelector('.remove-media-btn');
            removeBtn.addEventListener('click', () => {
                mediaItem.remove();
            });
            
            mediaPreview.appendChild(mediaItem);
        };
        
        reader.readAsDataURL(file);
    }
}

// Stop auto-advance
function stopAutoAdvance() {
    if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
    }
    
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

console.log('Enhanced status system initialized successfully');