// =============================================
// COMPLETE FUNCTIONAL GROUPS SYSTEM WITH UNIQUE FEATURES
// INTEGRATED WITH EXISTING API SYSTEM AND PARENT SESSION AUTHORITY
// =============================================

// ES Module imports for API functionality
import { 
  secureFetch, 
  getUserToken,
  initialize as initApi,
  request as apiRequest
} from './js/api.core.js';

import {
  getGroups,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  updateGroupSettings,
  getGroupMessages,
  sendGroupMessage as sendGroupMessageAPI,
  getGroupInvites,
  acceptGroupInvite as acceptGroupInviteAPI,
  declineGroupInvite as declineGroupInviteAPI,
  getGroupTransparency,
  getGroupNotes,
  getGroupEvents,
  getGroupPurposes,
  getGroupMoods
} from './api-groups.js';

// Global variables
export let currentUser = null;
export let userData = null;
export let groups = [];
export let myGroups = [];
export let joinedGroups = [];
export let groupInvites = [];
export let adminGroups = [];
export let selectedGroup = null;
export let currentTypeFilter = 'all';
export let currentSearchTerm = '';
export let isLoadedFromLocalStorage = false;
export let isMobile = window.innerWidth <= 768;
export let pendingGroupActions = [];
export let offlineOverlayDismissed = false;
export let friends = [];
export let selectedFriends = [];

// Unique features variables
export let groupPurposes = {
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

export let groupMoods = {
    'calm': { name: 'Calm', icon: '😌', color: '#1976d2', bgColor: '#e3f2fd' },
    'busy': { name: 'Busy', icon: '🏃', color: '#f57c00', bgColor: '#fff3e0' },
    'celebratory': { name: 'Celebratory', icon: '🎉', color: '#c2185b', bgColor: '#fce4ec' },
    'silent': { name: 'Silent', icon: '🔇', color: '#616161', bgColor: '#f5f5f5' },
    'urgent': { name: 'Urgent', icon: '🚨', color: '#d32f2f', bgColor: '#ffebee' }
};

export let postingRules = {
    'everyone': { name: 'Everyone can post', color: '#4CAF50', bgColor: '#E8F5E9' },
    'admin_only': { name: 'Admin-only posting', color: '#FF9800', bgColor: '#FFF3E0' },
    'scheduled': { name: 'Scheduled posting times', color: '#2196F3', bgColor: '#E3F2FD' },
    'quiet_hours': { name: 'Quiet hours enabled', color: '#9C27B0', bgColor: '#F3E5F5' }
};

export let participationModes = {
    'read_only': { name: 'Read Only', icon: '👁️', color: '#666', bgColor: '#F5F5F5' },
    'react_only': { name: 'React Only', icon: '👍', color: '#1976D2', bgColor: '#E3F2FD' },
    'anonymous': { name: 'Anonymous', icon: '🕵️', color: '#7B1FA2', bgColor: '#F3E5F5' }
};

export let groupTopics = {
    'announcement': { name: 'Announcement', icon: '📢', color: '#1976d2', bgColor: '#e3f2fd' },
    'question': { name: 'Question', icon: '❓', color: '#7b1fa2', bgColor: '#f3e5f5' },
    'discussion': { name: 'Discussion', icon: '💬', color: '#2e7d32', bgColor: '#e8f5e9' }
};

// Group types with colors and icons
export const groupTypes = {
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
export const groupThemes = {
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
export const groupRoles = {
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
export let currentChatGroup = null;
export let chatMessagesList = [];
export let isTyping = false;
export let callInProgress = false;
export let callStartTime = null;
export let callTimer = null;
export let localStream = null;
export let peerConnections = {};

// Unique features state variables
export let currentParticipationMode = 'normal';
export let isSilentMode = false;
export let isAnonymousMode = false;
export let groupNotes = {};
export let groupEvents = {};
export let transparencyLog = [];
export let energySuggestions = [];

// Local Storage Keys
export const LOCAL_STORAGE_KEYS = {
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
    USER_TOKEN: 'USER_TOKEN' // Unified token key
};

// Flag to track if page is already initialized
export let isPageInitialized = false;

// Authentication and sync control variables
export let authReady = false;
export let authCheckComplete = false;
export let backgroundSyncRunning = false;
export let syncIntervalId = null;

// Token and API state
export let apiInitialized = false;
export let tokenReadyPromise = null;
export let tokenReadyResolve = null;
export let tokenReadyReject = null;
export let tokenQueue = [];
export let isProcessingTokenQueue = false;

// =============================================
// PARENT SESSION AUTHORITY INTEGRATION
// =============================================

// Parent coordination state
export let parentConnection = {
    isConnected: false,
    handshakeComplete: false,
    sessionData: null,
    messageHandlers: {},
    retryCount: 0,
    maxRetries: 10,
    retryDelay: 1000
};

// Parent detection constants
export const PARENT_MESSAGE_TYPES = {
    // Child to Parent
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    CHILD_INITIALIZED: 'CHILD_INITIALIZED',
    CHILD_ERROR: 'CHILD_ERROR',
    CHILD_ACTION: 'CHILD_ACTION',
    
    // Parent to Child
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    PARENT_READY: 'PARENT_READY',
    REQUEST_STATUS: 'REQUEST_STATUS'
};

// Session validation schema
export const SESSION_SCHEMA = {
    required: ['user', 'token', 'timestamp'],
    user: {
        required: ['id', 'displayName', 'email'],
        optional: ['photoURL', 'username', 'bio', 'status']
    },
    token: 'string',
    timestamp: 'number',
    permissions: 'array'
};

// =============================================
// PARENT COORDINATION FUNCTIONS
// =============================================

/**
 * Initialize parent connection and handshake
 */
export function initializeParentConnection() {
    console.log('[Groups iframe] Initializing parent connection...');
    
    // Verify parent presence
    if (!verifyParentPresence()) {
        console.warn('[Groups iframe] Parent window not available or cross-origin');
        handleParentUnavailable();
        return;
    }
    
    // Setup message listener
    setupParentMessageListener();
    
    // Start handshake protocol
    startHandshakeProtocol();
}

/**
 * Verify parent window presence and same-origin
 * @returns {boolean} True if parent is available and same-origin
 */
export function verifyParentPresence() {
    try {
        // Check if we're in an iframe
        if (window === window.parent) {
            console.log('[Groups iframe] Not in iframe, running standalone');
            return false;
        }
        
        // Try to access parent properties (will throw if cross-origin)
        const parentOrigin = window.parent.location.origin;
        const currentOrigin = window.location.origin;
        
        if (parentOrigin !== currentOrigin) {
            console.warn('[Groups iframe] Cross-origin parent detected:', parentOrigin, 'vs', currentOrigin);
            return false;
        }
        
        console.log('[Groups iframe] Parent window verified, same origin:', parentOrigin);
        return true;
        
    } catch (error) {
        console.warn('[Groups iframe] Cannot access parent window:', error.message);
        return false;
    }
}

/**
 * Setup message listener for parent communication
 */
export function setupParentMessageListener() {
    window.addEventListener('message', handleParentMessage);
    console.log('[Groups iframe] Parent message listener established');
}

/**
 * Handle messages from parent window
 * @param {MessageEvent} event - Message event
 */
export function handleParentMessage(event) {
    // Verify origin (security check)
    if (event.origin !== window.location.origin) {
        console.warn('[Groups iframe] Message from unexpected origin:', event.origin);
        return;
    }
    
    const message = event.data;
    
    if (!message || typeof message !== 'object' || !message.type) {
        console.warn('[Groups iframe] Invalid message format:', message);
        return;
    }
    
    console.log('[Groups iframe] Received message from parent:', message.type);
    
    // Route message to appropriate handler
    switch (message.type) {
        case PARENT_MESSAGE_TYPES.SESSION_DATA:
            handleSessionData(message.data);
            break;
            
        case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
            handleSessionUpdate(message.data);
            break;
            
        case PARENT_MESSAGE_TYPES.LOGOUT:
            handleLogout();
            break;
            
        case PARENT_MESSAGE_TYPES.PARENT_READY:
            handleParentReady();
            break;
            
        case PARENT_MESSAGE_TYPES.REQUEST_STATUS:
            sendStatusToParent();
            break;
            
        default:
            console.log('[Groups iframe] Unknown message type:', message.type);
            
            // Legacy message format support
            if (message.session) {
                handleLegacySessionMessage(message);
            }
    }
}

/**
 * Start handshake protocol with parent
 */
export function startHandshakeProtocol() {
    console.log('[Groups iframe] Starting handshake protocol...');
    
    // Reset retry count
    parentConnection.retryCount = 0;
    
    // Send initial ready signal
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
        childId: 'groups-iframe',
        version: '1.0.0',
        timestamp: Date.now()
    });
    
    // Start exponential backoff retry
    scheduleHandshakeRetry();
}

/**
 * Schedule handshake retry with exponential backoff
 */
export function scheduleHandshakeRetry() {
    if (parentConnection.handshakeComplete) {
        console.log('[Groups iframe] Handshake already complete');
        return;
    }
    
    if (parentConnection.retryCount >= parentConnection.maxRetries) {
        console.error('[Groups iframe] Max handshake retries reached');
        handleParentUnavailable();
        return;
    }
    
    const delay = parentConnection.retryDelay * Math.pow(2, parentConnection.retryCount);
    parentConnection.retryCount++;
    
    console.log(`[Groups iframe] Scheduling handshake retry ${parentConnection.retryCount} in ${delay}ms`);
    
    setTimeout(() => {
        if (!parentConnection.handshakeComplete) {
            sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                retryCount: parentConnection.retryCount,
                timestamp: Date.now()
            });
            scheduleHandshakeRetry();
        }
    }, delay);
}

/**
 * Send message to parent window
 * @param {string} type - Message type
 * @param {Object} data - Message data
 */
export function sendMessageToParent(type, data = {}) {
    try {
        if (!window.parent || !window.parent.postMessage) {
            console.warn('[Groups iframe] Cannot send message: parent window not available');
            return false;
        }
        
        const message = {
            type: type,
            data: data,
            source: 'knecta-groups-iframe',
            timestamp: Date.now()
        };
        
        window.parent.postMessage(message, window.location.origin);
        console.log('[Groups iframe] Sent message to parent:', type);
        return true;
        
    } catch (error) {
        console.error('[Groups iframe] Error sending message to parent:', error);
        return false;
    }
}

/**
 * Handle parent ready signal
 */
export function handleParentReady() {
    console.log('[Groups iframe] Parent is ready, requesting session...');
    
    // Immediately request session
    sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
        urgent: true,
        timestamp: Date.now()
    });
}

/**
 * Handle session data from parent
 * @param {Object} sessionData - Session data
 */
export function handleSessionData(sessionData) {
    console.log('[Groups iframe] Received session data from parent');
    
    // Validate session data
    if (!validateSessionData(sessionData)) {
        console.error('[Groups iframe] Invalid session data received');
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ERROR, {
            error: 'Invalid session data',
            validationFailed: true
        });
        return;
    }
    
    // Store session data
    parentConnection.sessionData = sessionData;
    parentConnection.handshakeComplete = true;
    parentConnection.isConnected = true;
    
    console.log('[Groups iframe] Session validated, user:', sessionData.user?.displayName || 'Unknown');
    
    // Update local state with session data
    updateLocalStateFromSession(sessionData);
    
    // Notify parent handshake is complete
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_INITIALIZED, {
        success: true,
        user: sessionData.user?.id || 'unknown',
        timestamp: Date.now()
    });
    
    // Enable protected UI
    enableProtectedUI();
    
    // Start background processes
    startBackgroundProcesses();
}

/**
 * Validate session data against schema
 * @param {Object} sessionData - Session data to validate
 * @returns {boolean} True if valid
 */
export function validateSessionData(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        console.warn('[Groups iframe] Session data is not an object');
        return false;
    }
    
    // Check required fields
    const required = SESSION_SCHEMA.required;
    for (const field of required) {
        if (!sessionData[field]) {
            console.warn(`[Groups iframe] Missing required field: ${field}`);
            return false;
        }
    }
    
    // Validate user object
    if (sessionData.user) {
        const userRequired = SESSION_SCHEMA.user.required;
        for (const field of userRequired) {
            if (!sessionData.user[field]) {
                console.warn(`[Groups iframe] Missing required user field: ${field}`);
                return false;
            }
        }
    }
    
    // Validate token is string
    if (typeof sessionData.token !== 'string' || !sessionData.token) {
        console.warn('[Groups iframe] Invalid token');
        return false;
    }
    
    // Validate timestamp
    if (typeof sessionData.timestamp !== 'number' || sessionData.timestamp <= 0) {
        console.warn('[Groups iframe] Invalid timestamp');
        return false;
    }
    
    return true;
}

/**
 * Update local state from session data
 * @param {Object} sessionData - Session data
 */
export function updateLocalStateFromSession(sessionData) {
    console.log('[Groups iframe] Updating local state from session...');
    
    // Update current user
    currentUser = sessionData.user;
    
    // Update user data
    userData = {
        displayName: currentUser.displayName || currentUser.name || 'User',
        username: currentUser.username || null,
        email: currentUser.email || null,
        photoURL: currentUser.photoURL || currentUser.avatar || null
    };
    
    // Save to local storage for offline use
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
            uid: currentUser.id || currentUser._id || currentUser.uid,
            displayName: currentUser.displayName || currentUser.name,
            email: currentUser.email,
            photoURL: currentUser.photoURL || currentUser.avatar
        }));
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
        
        // Save unified token
        saveUnifiedToken(sessionData.token);
        
    } catch (error) {
        console.warn('[Groups iframe] Error saving session to localStorage:', error);
    }
    
    // Update auth state
    authReady = true;
    authCheckComplete = true;
    
    console.log('[Groups iframe] Local state updated');
}

/**
 * Handle session update from parent
 * @param {Object} updateData - Update data
 */
export function handleSessionUpdate(updateData) {
    console.log('[Groups iframe] Received session update');
    
    // Merge with existing session data
    if (parentConnection.sessionData) {
        parentConnection.sessionData = {
            ...parentConnection.sessionData,
            ...updateData
        };
        
        // Update local state if user data changed
        if (updateData.user) {
            updateLocalStateFromSession(parentConnection.sessionData);
        }
        
        console.log('[Groups iframe] Session updated');
    }
}

/**
 * Handle logout signal from parent
 */
export function handleLogout() {
    console.log('[Groups iframe] Received logout signal from parent');
    
    // Clear local session state
    clearLocalSessionState();
    
    // Disable protected UI
    disableProtectedUI();
    
    // Show logout message
    showNotification('Logged out. Please log in again.', 'info');
    
    // Notify parent we've processed logout
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ACTION, {
        action: 'logout_processed',
        timestamp: Date.now()
    });
}

/**
 * Clear local session state
 */
export function clearLocalSessionState() {
    console.log('[Groups iframe] Clearing local session state');
    
    // Clear variables
    currentUser = null;
    userData = null;
    authReady = false;
    
    // Clear sensitive localStorage items
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        localStorage.removeItem('knecta_access_token');
        localStorage.removeItem('moodchat_token');
        
        // Keep non-sensitive cache for better UX on re-login
    } catch (error) {
        console.warn('[Groups iframe] Error clearing localStorage:', error);
    }
    
    // Reset parent connection (but keep trying to reconnect)
    parentConnection.sessionData = null;
    parentConnection.handshakeComplete = false;
    parentConnection.isConnected = false;
    
    // Stop background processes
    stopBackgroundProcesses();
}

/**
 * Handle parent unavailable scenario
 */
export function handleParentUnavailable() {
    console.warn('[Groups iframe] Parent window unavailable or unresponsive');
    
    // Try to use cached data if available
    const cachedUser = getCurrentUserLocal();
    const cachedToken = getUnifiedToken();
    
    if (cachedUser && cachedToken) {
        console.log('[Groups iframe] Using cached session data');
        
        // Create synthetic session data from cache
        const sessionData = {
            user: cachedUser,
            token: cachedToken,
            timestamp: Date.now(),
            fromCache: true
        };
        
        updateLocalStateFromSession(sessionData);
        enableProtectedUI();
        startBackgroundProcesses();
        
        // Show warning
        showNotification('Running with cached data. Some features may be limited.', 'warning');
        
    } else {
        console.log('[Groups iframe] No cached data available');
        disableProtectedUI();
        showReconnectState();
    }
}

/**
 * Send status to parent
 */
export function sendStatusToParent() {
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ACTION, {
        status: {
            initialized: isPageInitialized,
            handshakeComplete: parentConnection.handshakeComplete,
            hasUser: !!currentUser,
            hasToken: !!getUnifiedToken(),
            uiReady: document.readyState === 'complete',
            timestamp: Date.now()
        }
    });
}

/**
 * Handle legacy session message format
 * @param {Object} message - Legacy message
 */
export function handleLegacySessionMessage(message) {
    console.log('[Groups iframe] Handling legacy session message format');
    
    // Convert legacy format to new format
    const sessionData = {
        user: message.user || message.session?.user,
        token: message.token || message.session?.token,
        timestamp: message.timestamp || Date.now(),
        fromLegacy: true
    };
    
    if (validateSessionData(sessionData)) {
        handleSessionData(sessionData);
    }
}

/**
 * Enable protected UI elements
 */
export function enableProtectedUI() {
    console.log('[Groups iframe] Enabling protected UI');
    
    // Update UI to show logged in state
    updateUserUI();
}

/**
 * Disable protected UI elements
 */
export function disableProtectedUI() {
    console.log('[Groups iframe] Disabling protected UI');
    
    // Show logged out state in UI
    const userElements = document.querySelectorAll('.user-info, .user-avatar');
    userElements.forEach(el => {
        el.style.opacity = '0.5';
    });
}

/**
 * Show reconnect state UI
 */
export function showReconnectState() {
    console.log('[Groups iframe] Showing reconnect state');
    
    // Add reconnect overlay if not exists
    if (!document.getElementById('reconnectOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'reconnectOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.95);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 20px;
            text-align: center;
        `;
        
        overlay.innerHTML = `
            <div style="font-size: 48px; color: var(--primary-color); margin-bottom: 20px;">
                <i class="fas fa-plug"></i>
            </div>
            <h3 style="margin-bottom: 10px;">Connection Lost</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                Unable to connect to parent window. Please refresh or return to the main app.
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="retryConnectionBtn" style="padding: 10px 20px; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Retry Connection
                </button>
                <button id="useCachedDataBtn" style="padding: 10px 20px; background: var(--secondary-color); color: var(--text-primary); border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-database"></i> Use Cached Data
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add event listeners
        document.getElementById('retryConnectionBtn').addEventListener('click', () => {
            location.reload();
        });
        
        document.getElementById('useCachedDataBtn').addEventListener('click', () => {
            handleParentUnavailable();
            overlay.remove();
        });
    }
}

/**
 * Start background processes after session is ready
 */
export function startBackgroundProcesses() {
    console.log('[Groups iframe] Starting background processes');
    
    // Load user data in background
    loadUserDataInBackground();
    
    // Start controlled background sync
    startBackgroundSync();
    
    // Process any pending actions
    if (typeof processPendingOfflineActions === 'function') {
        processPendingOfflineActions();
    }
}

/**
 * Stop background processes
 */
export function stopBackgroundProcesses() {
    console.log('[Groups iframe] Stopping background processes');
    
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
    
    backgroundSyncRunning = false;
}

// =============================================
// TOKEN MANAGEMENT & API INITIALIZATION - UPDATED
// =============================================

/**
 * Initialize token system with parent coordination
 */
export function initializeTokenSystem() {
    console.log('[Groups iframe] Initializing token system with parent coordination...');
    
    // Create token ready promise
    tokenReadyPromise = new Promise((resolve, reject) => {
        tokenReadyResolve = resolve;
        tokenReadyReject = reject;
    });
    
    // Start token initialization in background
    setTimeout(async () => {
        try {
            // First try to get token from parent session
            if (parentConnection.sessionData && parentConnection.sessionData.token) {
                console.log('[Groups iframe] Using token from parent session');
                const token = parentConnection.sessionData.token;
                saveUnifiedToken(token);
                authReady = true;
                authCheckComplete = true;
                if (tokenReadyResolve) tokenReadyResolve(token);
                return token;
            }
            
            // Fallback to imported getUserToken function
            await waitForTokenReady();
            console.log('[Groups iframe] Token system initialized successfully');
            
        } catch (error) {
            console.error('[Groups iframe] Token system initialization failed:', error);
            
            // Even if token fails, we can continue with cached data
            if (tokenReadyResolve) tokenReadyResolve(null);
        }
    }, 100);
}

/**
 * Wait for token to be ready (non-blocking)
 * @returns {Promise<string|null>} Token if available, null if not
 */
export async function waitForTokenReady() {
    // Check if we already have a valid token
    const token = getUnifiedToken();
    if (token) {
        console.log('[Groups iframe] Token already available');
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(token);
        return token;
    }
    
    // Try to get token from parent session first
    if (parentConnection.sessionData && parentConnection.sessionData.token) {
        const parentToken = parentConnection.sessionData.token;
        console.log('[Groups iframe] Got token from parent session');
        saveUnifiedToken(parentToken);
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(parentToken);
        return parentToken;
    }
    
    // Try to get token from imported getUserToken function
    try {
        const apiToken = await getUserToken();
        if (apiToken) {
            console.log('[Groups iframe] Got token from imported getUserToken');
            saveUnifiedToken(apiToken);
            authReady = true;
            authCheckComplete = true;
            if (tokenReadyResolve) tokenReadyResolve(apiToken);
            return apiToken;
        }
    } catch (error) {
        console.log('[Groups iframe] Could not get token from getUserToken:', error.message);
    }
    
    // Wait for api.core.js initialization
    try {
        console.log('[Groups iframe] Waiting for api.core.js initialization...');
        await initApi();
        
        const apiToken = await getUserToken();
        if (apiToken) {
            console.log('[Groups iframe] Got token after api.core.js initialization');
            saveUnifiedToken(apiToken);
            authReady = true;
            authCheckComplete = true;
            if (tokenReadyResolve) tokenReadyResolve(apiToken);
            return apiToken;
        }
    } catch (error) {
        console.log('[Groups iframe] Error waiting for api.core.js:', error.message);
    }
    
    // Fallback to legacy tokens with migration
    const migratedToken = migrateLegacyTokens();
    if (migratedToken) {
        console.log('[Groups iframe] Using migrated legacy token');
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(migratedToken);
        return migratedToken;
    }
    
    // No token available, but we can still show UI with cached data
    console.log('[Groups iframe] No token available, will use cached data');
    authReady = false;
    authCheckComplete = true;
    if (tokenReadyResolve) tokenReadyResolve(null);
    return null;
}

/**
 * Get unified token from all possible sources with parent priority
 * @returns {string|null} Token or null if not found
 */
export function getUnifiedToken() {
    try {
        // 1. Check parent session first (highest priority)
        if (parentConnection.sessionData && parentConnection.sessionData.token) {
            console.log('[Groups iframe] Using token from parent session');
            return parentConnection.sessionData.token;
        }
        
        // 2. Check central USER_TOKEN storage
        const unifiedToken = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (unifiedToken) {
            console.log('[Groups iframe] Using unified token from localStorage');
            return unifiedToken;
        }
        
        // 3. Try imported getUserToken function
        try {
            const apiToken = getUserToken();
            if (apiToken) {
                console.log('[Groups iframe] Using token from imported getUserToken');
                saveUnifiedToken(apiToken);
                return apiToken;
            }
        } catch (error) {
            console.log('[Groups iframe] Error getting token from getUserToken:', error.message);
        }
        
        // 4. Try parent window localStorage (for iframe scenarios)
        if (window.parent && window.parent.localStorage) {
            try {
                const parentToken = window.parent.localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
                if (parentToken) {
                    console.log('[Groups iframe] Using token from parent localStorage');
                    saveUnifiedToken(parentToken);
                    return parentToken;
                }
            } catch (e) {
                console.log('[Groups iframe] Cannot access parent localStorage:', e.message);
            }
        }
        
        // 5. Check AppState in parent or current window
        if (window.parent && window.parent.AppState && window.parent.AppState.accessToken) {
            console.log('[Groups iframe] Using token from parent AppState');
            const token = window.parent.AppState.accessToken;
            saveUnifiedToken(token);
            return token;
        }
        
        if (window.AppState && window.AppState.accessToken) {
            console.log('[Groups iframe] Using token from current AppState');
            const token = window.AppState.accessToken;
            saveUnifiedToken(token);
            return token;
        }
        
        console.log('[Groups iframe] No unified token found');
        return null;
        
    } catch (error) {
        console.error('[Groups iframe] Error getting unified token:', error);
        return null;
    }
}

/**
 * Save unified token to all storage locations
 * @param {string} token - The token to save
 */
export function saveUnifiedToken(token) {
    try {
        // Save to central location
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, token);
        
        // Also save to legacy locations for backward compatibility
        localStorage.setItem('knecta_access_token', token);
        localStorage.setItem('moodchat_token', token);
        
        // Update AppState if available
        if (window.AppState) {
            window.AppState.accessToken = token;
        }
        
        // Notify parent if in iframe
        if (window.parent && window.parent.AppState) {
            try {
                window.parent.AppState.accessToken = token;
            } catch (e) {
                console.log('[Groups iframe] Cannot update parent AppState:', e.message);
            }
        }
        
        console.log('[Groups iframe] Unified token saved');
    } catch (error) {
        console.error('[Groups iframe] Error saving unified token:', error);
    }
}

/**
 * Migrate legacy tokens to unified system
 * @returns {string|null} Migrated token or null
 */
export function migrateLegacyTokens() {
    const legacyKeys = [
        'knecta_access_token',
        'moodchat_token',
        'authToken',
        'accessToken'
    ];
    
    let migratedToken = null;
    
    // Check all legacy locations
    for (const key of legacyKeys) {
        try {
            const token = localStorage.getItem(key);
            if (token && !migratedToken) {
                console.log(`[Groups iframe] Migrating token from ${key}`);
                migratedToken = token;
                saveUnifiedToken(token);
                
                // Clean up legacy token after migration
                setTimeout(() => {
                    localStorage.removeItem(key);
                }, 1000);
                
                break;
            }
        } catch (error) {
            console.log(`[Groups iframe] Error checking legacy key ${key}:`, error.message);
        }
    }
    
    return migratedToken;
}

/**
 * Get current user from multiple sources with parent priority - LOCAL VERSION
 * @returns {Object|null} User object or null if not found
 */
export function getCurrentUserLocal() {
    try {
        // 1. Try parent session first (highest priority)
        if (parentConnection.sessionData && parentConnection.sessionData.user) {
            return parentConnection.sessionData.user;
        }
        
        // 2. Try unified storage
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            return JSON.parse(cachedUser);
        }
        
        // 3. Try parent window
        if (window.parent && window.parent.localStorage) {
            try {
                const parentUser = window.parent.localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
                if (parentUser) {
                    return JSON.parse(parentUser);
                }
            } catch (e) {
                console.log('[Groups iframe] Cannot access parent localStorage:', e.message);
            }
        }
        
        // 4. Try AppState
        if (window.parent && window.parent.AppState && window.parent.AppState.currentUser) {
            return window.parent.AppState.currentUser;
        }
        
        if (window.AppState && window.AppState.currentUser) {
            return window.AppState.currentUser;
        }
        
        console.log('[Groups iframe] No user found');
        return null;
        
    } catch (error) {
        console.error('[Groups iframe] Error getting current user:', error);
        return null;
    }
}

// =============================================
// SECURE API CALL SYSTEM - INTEGRATED WITH api.core.JS AND PARENT COORDINATION
// =============================================

/**
 * Queue API call until token is ready
 * @param {Function} apiCallFunction - Function that makes API call
 * @returns {Promise} Promise that resolves with API response
 */
export function queueApiCall(apiCallFunction) {
    return new Promise(async (resolve, reject) => {
        const queuedCall = {
            fn: apiCallFunction,
            resolve,
            reject,
            timestamp: Date.now()
        };
        
        tokenQueue.push(queuedCall);
        
        // Process queue if not already processing
        if (!isProcessingTokenQueue) {
            processTokenQueue();
        }
    });
}

/**
 * Process queued API calls
 */
export async function processTokenQueue() {
    if (isProcessingTokenQueue || tokenQueue.length === 0) return;
    
    isProcessingTokenQueue = true;
    console.log(`[Groups iframe] Processing ${tokenQueue.length} queued API calls`);
    
    try {
        // Wait for token to be ready
        const token = await tokenReadyPromise;
        
        if (!token) {
            console.log('[Groups iframe] No token available, rejecting queued calls');
            
            // Check if we should use cached data instead
            const firstCall = tokenQueue[0];
            const shouldUseCache = firstCall && firstCall.fn.name === 'apiCall' && 
                                 firstCall.fn.toString().includes('GET');
            
            if (shouldUseCache) {
                console.log('[Groups iframe] Attempting to use cached data for GET requests');
                
                const callsToProcess = [...tokenQueue];
                tokenQueue.length = 0;
                
                for (const call of callsToProcess) {
                    try {
                        // Try to extract endpoint from function to check cache
                        const fnString = call.fn.toString();
                        const endpointMatch = fnString.match(/['"`]([^'"`]+)['"`]/);
                        
                        if (endpointMatch) {
                            const endpoint = endpointMatch[1];
                            const cacheKey = `api_cache_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
                            const cached = localStorage.getItem(cacheKey);
                            
                            if (cached) {
                                try {
                                    const cachedData = JSON.parse(cached);
                                    console.log(`[Groups iframe] Returning cached data for ${endpoint}`);
                                    call.resolve({
                                        success: true,
                                        data: cachedData.data,
                                        fromCache: true,
                                        isOffline: true
                                    });
                                    continue;
                                } catch (e) {
                                    // Cache is corrupted
                                }
                            }
                        }
                        
                        // No cache available, reject
                        call.reject(new Error('No authentication token available and no cached data'));
                    } catch (error) {
                        call.reject(error);
                    }
                }
            } else {
                // Reject all calls
                tokenQueue.forEach(call => {
                    call.reject(new Error('No authentication token available'));
                });
                tokenQueue.length = 0;
            }
            return;
        }
        
        // Process all queued calls with valid token
        const callsToProcess = [...tokenQueue];
        tokenQueue.length = 0;
        
        for (const call of callsToProcess) {
            try {
                const result = await call.fn(token);
                call.resolve(result);
            } catch (error) {
                call.reject(error);
            }
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error processing token queue:', error);
        tokenQueue.forEach(call => {
            call.reject(error);
        });
        tokenQueue.length = 0;
    } finally {
        isProcessingTokenQueue = false;
    }
}

/**
 * Make secure API call with unified token handling and parent coordination
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} endpoint - API endpoint
 * @param {Object|null} data - Request body data
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} API response object
 */
export async function secureApiCall(method, endpoint, data = null, options = {}) {
    // Always route through imported apiRequest if available (parent-coordinated)
    if (typeof apiRequest === 'function') {
        try {
            console.log('[Groups iframe] Routing API call through imported apiRequest');
            return await apiRequest({
                url: endpoint,
                method: method,
                data: data,
                ...options
            });
        } catch (error) {
            console.log('[Groups iframe] apiRequest failed, falling back:', error.message);
            // Fall through to our implementation
        }
    }
    
    // Use imported secureFetch if available
    if (typeof secureFetch === 'function') {
        try {
            return await secureFetch(endpoint, {
                method,
                body: data ? JSON.stringify(data) : null,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
        } catch (error) {
            console.log('[Groups iframe] secureFetch failed, falling back:', error.message);
            // Fall through to our implementation
        }
    }
    
    // Our implementation with parent coordination
    const apiCall = async (token) => {
        // Verify we have a token (should always be true if we reach here)
        if (!token) {
            throw new Error('No authentication token available');
        }
        
        // Ensure endpoint is absolute
        const url = endpoint.startsWith('http') ? endpoint : 
                   endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        const fetchOptions = {
            method: method.toUpperCase(),
            headers: headers,
            credentials: 'include',
            ...options
        };
        
        if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            fetchOptions.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, fetchOptions);
        
        // Handle 401 Unauthorized
        if (response.status === 401) {
            console.log('[Groups iframe] Token expired or invalid');
            
            // Clear invalid token
            localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            
            // Notify parent about auth failure
            sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ERROR, {
                error: 'Authentication failed',
                statusCode: 401,
                endpoint: endpoint,
                timestamp: Date.now()
            });
            
            // Show user-friendly message
            if (!options.silent) {
                showNotification('Your session has expired. Please log in again.', 'error');
            }
            
            return { 
                success: false, 
                error: 'Authentication failed',
                requiresAuth: true,
                status: 401
            };
        }
        
        const responseData = await response.json().catch(() => ({}));
        
        if (response.ok) {
            return { 
                success: true, 
                data: responseData,
                status: response.status 
            };
        } else {
            return { 
                success: false, 
                error: responseData.message || responseData.error || `HTTP ${response.status}`,
                status: response.status,
                data: responseData 
            };
        }
    };
    
    // Queue the call if token isn't ready
    const token = getUnifiedToken();
    if (!token) {
        return queueApiCall(apiCall);
    }
    
    // Token is ready, make the call
    return apiCall(token);
}

/**
 * Safe API call wrapper with error handling, caching, and parent coordination
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object|null} data - Request body
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} API response
 */
export async function safeApiCall(method, endpoint, data = null, options = {}) {
    // Generate cache key for GET requests
    const isGetRequest = method.toUpperCase() === 'GET';
    const cacheKey = isGetRequest ? `api_cache_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}` : null;
    
    // Try to return cached data immediately for GET requests
    if (isGetRequest && !options.forceRefresh) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const cachedData = JSON.parse(cached);
                const cacheAge = Date.now() - (cachedData.timestamp || 0);
                
                // Use cache if less than 5 minutes old
                if (cacheAge < 5 * 60 * 1000) {
                    console.log(`[Groups iframe] Using cached data for ${endpoint}`);
                    return { 
                        success: true, 
                        data: cachedData.data,
                        fromCache: true 
                    };
                }
            } catch (error) {
                console.log('[Groups iframe] Error reading cache:', error.message);
            }
        }
    }
    
    try {
        // Use absolute URL for API calls
        const apiEndpoint = endpoint.startsWith('http') ? endpoint : 
                           endpoint.startsWith('/api/') ? endpoint : 
                           `/api/${endpoint}`;
        
        const result = await secureApiCall(method, apiEndpoint, data, options);
        
        // Cache successful GET responses
        if (isGetRequest && result.success && result.data && cacheKey) {
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    data: result.data,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.log('[Groups iframe] Error caching data:', error.message);
            }
        }
        
        return result;
        
    } catch (error) {
        console.log('[Groups iframe] API call error:', error.message);
        
        // For GET requests, try to return stale cache if available
        if (isGetRequest && cacheKey) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const cachedData = JSON.parse(cached);
                    console.log(`[Groups iframe] Returning stale cache for ${endpoint}`);
                    return { 
                        success: true, 
                        data: cachedData.data,
                        fromCache: true,
                        isOffline: true
                    };
                } catch (e) {
                    // Cache is corrupted, ignore
                }
            }
        }
        
        return { 
            success: false, 
            error: error.message || 'Network error',
            isOffline: true 
        };
    }
}

// =============================================
// MAIN INITIALIZATION - UPDATED WITH PARENT COORDINATION
// =============================================

/**
 * Initialize the group page with parent coordination and immediate UI rendering
 */
export async function initGroupPage() {
    if (isPageInitialized) {
        console.log('[Groups iframe] Page already initialized');
        return;
    }
    
    // Mark as initializing
    isPageInitialized = true;
    console.log('[Groups iframe] Initialization started with parent coordination');
    
    // STEP 1: Set up parent connection and handshake
    console.log('[Groups iframe] Setting up parent connection...');
    initializeParentConnection();
    
    // STEP 2: Load cached data instantly for immediate UI rendering
    console.log('[Groups iframe] Loading instant cache...');
    loadCachedDataInstantly();
    
    // STEP 3: Initialize token system in background (non-blocking)
    console.log('[Groups iframe] Initializing token system in background...');
    initializeTokenSystem();
    
    // STEP 4: Set up UI event listeners (non-blocking)
    console.log('[Groups iframe] Setting up UI event listeners...');
    setTimeout(setupUIEventListeners, 100);
    
    // STEP 5: Setup responsive behavior
    console.log('[Groups iframe] Setting up responsive behavior...');
    setupResponsiveBehavior();
    
    // STEP 6: Start background processes after a short delay
    // (These will be enabled once parent session is received)
    setTimeout(() => {
        console.log('[Groups iframe] Starting background processes check...');
        
        // Check if we already have session from parent
        if (parentConnection.handshakeComplete && parentConnection.sessionData) {
            console.log('[Groups iframe] Parent session already available, starting processes');
            enableProtectedUI();
            startBackgroundProcesses();
        } else if (getCurrentUserLocal() && getUnifiedToken()) {
            // We have cached data, enable UI with warning
            console.log('[Groups iframe] Using cached session data');
            enableProtectedUI();
            startBackgroundProcesses();
            showNotification('Using cached data. Reconnecting to server...', 'info');
        } else {
            console.log('[Groups iframe] Waiting for parent session...');
            // UI will remain in limited mode until session arrives
        }
    }, 1000);
    
    console.log('[Groups iframe] UI ready with cached data, waiting for parent session...');
}

/**
 * Load user data in background with parent coordination
 */
export async function loadUserDataInBackground() {
    try {
        // Only try to get fresh data if we have a valid session
        if (!parentConnection.handshakeComplete || !parentConnection.sessionData) {
            console.log('[Groups iframe] No parent session, skipping background user data load');
            return;
        }
        
        // Use safeApiCall which respects parent coordination
        const response = await safeApiCall('GET', '/api/auth/me', null, { silent: true });
        
        if (response && response.success && response.data) {
            currentUser = response.data;
            userData = {
                displayName: currentUser.displayName || currentUser.name || 'User',
                username: currentUser.username || null,
                email: currentUser.email || null,
                photoURL: currentUser.photoURL || currentUser.avatar || null
            };
            
            // Save to localStorage
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
                uid: currentUser.id || currentUser._id || currentUser.uid,
                displayName: currentUser.displayName || currentUser.name,
                email: currentUser.email,
                photoURL: currentUser.photoURL || currentUser.avatar
            }));
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
            
            console.log('[Groups iframe] User data updated from server');
            
            // Update UI if needed
            updateUserUI();
        }
        
    } catch (error) {
        console.log('[Groups iframe] Background user data load error:', error.message);
        // Use cached data - this is fine, we'll try again later
    }
}

/**
 * Update UI with user data
 */
export function updateUserUI() {
    // Update any user-specific UI elements here
    console.log('[Groups iframe] User UI updated');
}

/**
 * Setup UI event listeners
 */
export function setupUIEventListeners() {
    console.log('[Groups iframe] Setting up UI event listeners...');
    
    // Add your UI event listeners here
    // This is a placeholder - implement based on your actual UI elements
}

/**
 * Setup responsive behavior
 */
export function setupResponsiveBehavior() {
    console.log('[Groups iframe] Setting up responsive behavior...');
    
    // Add responsive behavior setup here
    // This is a placeholder - implement based on your actual responsive needs
}

// =============================================
// CORE GROUP FUNCTIONS (UNCHANGED)
// =============================================

/**
 * Load cached data instantly on page load for immediate UI rendering
 */
export function loadCachedDataInstantly() {
    console.log('[Groups iframe] Loading instant cache...');
    
    try {
        // Load groups
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUPS);
        if (groupsData) {
            groups = JSON.parse(groupsData);
            console.log(`[Groups iframe] Instant: ${groups.length} groups loaded from cache`);
            isLoadedFromLocalStorage = true;
            
            updateGroupCounts();
        }
        
        // Load other group data
        const myGroupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_GROUPS);
        if (myGroupsData) myGroups = JSON.parse(myGroupsData);
        
        const joinedData = localStorage.getItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS);
        if (joinedData) joinedGroups = JSON.parse(joinedData);
        
        const invitesData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_INVITES);
        if (invitesData) groupInvites = JSON.parse(invitesData);
        
        const adminData = localStorage.getItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS);
        if (adminData) adminGroups = JSON.parse(adminData);
        
        // Load friends
        const cachedFriends = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) friends = JSON.parse(cachedFriends);
        
        // Load user data from cache
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILE) || '{}');
        }
        
        // Load unique features data
        loadUniqueFeaturesData();
        
        console.log('[Groups iframe] Instant cache load complete');
        
    } catch (error) {
        console.error('[Groups iframe] Error in instant cache load:', error);
    }
}

/**
 * Load unique features data from cache
 */
export function loadUniqueFeaturesData() {
    try {
        const cachedPurposes = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_PURPOSES);
        if (cachedPurposes) {
            const purposes = JSON.parse(cachedPurposes);
            groups.forEach(group => {
                if (purposes[group.id]) {
                    group.purpose = purposes[group.id];
                }
            });
        }
        
        const cachedMoods = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_MOODS);
        if (cachedMoods) {
            const moods = JSON.parse(cachedMoods);
            groups.forEach(group => {
                if (moods[group.id]) {
                    group.mood = moods[group.id];
                }
            });
        }
        
        const cachedRules = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_POSTING_RULES);
        if (cachedRules) {
            const rules = JSON.parse(cachedRules);
            groups.forEach(group => {
                if (rules[group.id]) {
                    group.postingRule = rules[group.id];
                }
            });
        }
        
        const cachedModes = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PARTICIPATION_MODES);
        if (cachedModes) {
            currentParticipationMode = JSON.parse(cachedModes);
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error loading unique features data:', error);
    }
}

/**
 * Calculate group activity pulse based on last activity time
 * @param {Object} groupData - Group object
 * @returns {Object|null} Pulse object with text and class, or null if no activity
 */
export function calculateGroupPulse(groupData) {
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

/**
 * Update group counts in the UI
 */
export function updateGroupCounts() {
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

/**
 * Update current active section based on UI state
 */
export function updateCurrentSection() {
    const activeSection = document.querySelector('.groups-section.active');
    if (activeSection) {
        const sectionId = activeSection.id;
        
        switch(sectionId) {
            case 'allGroupsSection':
                renderAllGroups();
                break;
            case 'myGroupsSection':
                renderMyGroups();
                break;
            case 'joinedSection':
                renderJoinedGroups();
                break;
            case 'invitesSection':
                renderGroupInvites();
                break;
            case 'adminSection':
                renderAdminGroups();
                break;
        }
    }
}

/**
 * Render all groups with filters applied
 */
export function renderAllGroups() {
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

/**
 * Add group item to container
 * @param {Object} groupData - Group data
 * @param {HTMLElement} container - Container element
 * @param {string} type - Group type (group, my_group, joined, admin, group_invite)
 */
export function addGroupItem(groupData, container, type) {
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
            showGroupDetails(groupData, type);
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

/**
 * Handle group action button clicks
 * @param {string} action - Action type
 * @param {Object} groupData - Group data
 * @param {string} type - Group type
 * @param {HTMLElement} button - Button element
 */
export function handleGroupAction(action, groupData, type, button) {
    switch(action) {
        case 'open-chat':
            openGroupChat(groupData);
            break;
        case 'info':
            showGroupDetails(groupData, type);
            break;
        case 'manage':
            openAdminManagement(groupData);
            break;
        case 'leave':
            leaveGroupConfirm(groupData);
            break;
        case 'accept-invite':
            acceptGroupInviteLocal(groupData);
            break;
        case 'decline-invite':
            declineGroupInviteLocal(groupData);
            break;
        default:
            console.log('Unknown group action:', action);
    }
}

// =============================================
// BACKGROUND SYNC FUNCTIONS (UPDATED)
// =============================================

/**
 * Start controlled background sync (runs once per lifecycle)
 */
export function startBackgroundSync() {
    if (backgroundSyncRunning) {
        console.log('[Groups iframe] Background sync already running');
        return;
    }
    
    // Only sync if we have valid authentication
    if (!authReady) {
        console.log('[Groups iframe] Background sync skipped - auth not ready');
        return;
    }
    
    // Check if we have parent session
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        console.log('[Groups iframe] Background sync skipped - no valid session');
        return;
    }
    
    backgroundSyncRunning = true;
    console.log('[Groups iframe] Starting controlled background sync');
    
    // Initial sync
    setTimeout(() => {
        backgroundSyncWithServer();
    }, 2000);
    
    // Set up periodic sync with cleanup
    syncIntervalId = setInterval(() => {
        if (authReady && (parentConnection.handshakeComplete || getUnifiedToken())) {
            backgroundSyncWithServer();
        } else {
            console.log('[Groups iframe] Background sync paused - auth/session not ready');
            // Clear interval if auth is lost
            clearInterval(syncIntervalId);
            syncIntervalId = null;
            backgroundSyncRunning = false;
        }
    }, 30000);
    
    // Process pending actions
    if (typeof processPendingOfflineActions === 'function') {
        processPendingOfflineActions();
    }
}

/**
 * Background sync with server for groups data
 */
export async function backgroundSyncWithServer() {
    if (!authReady) {
        console.log('[Groups iframe] Background sync: Skipping - auth not ready');
        return;
    }
    
    // Check if we have a valid session
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        console.log('[Groups iframe] Background sync: Skipping - no valid session');
        return;
    }
    
    console.log('[Groups iframe] Background sync: Starting...');
    
    try {
        await syncGroupsFromServer();
        await syncGroupInvitesFromServer();
        await syncUniqueFeaturesData();
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        console.log('[Groups iframe] Background sync: Completed successfully');
        
    } catch (error) {
        console.log('[Groups iframe] Background sync: Server appears to be unreachable:', error.message);
    }
}

// =============================================
// CHAT AND GROUP MANAGEMENT FUNCTIONS (UPDATED WITH IMPORTS)
// =============================================

/**
 * Open group chat panel
 * @param {Object} groupData - Group data
 */
export function openGroupChat(groupData) {
    console.log('[Groups iframe] Opening inline group chat for:', groupData.name);
    
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
    
    updateChatHeaderUniqueFeatures(groupData);
    
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
        hideAllPanels();
        if (groupChatPanel) groupChatPanel.classList.add('active');
    }
    
    const chatMessages = document.getElementById('chatMessages');
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    
    if (chatMessages) chatMessages.innerHTML = '';
    if (chatMessagesContainer) chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    
    loadGroupChatMessages(groupData.id);
    setupTypingListener(groupData.id);
    
    loadUniqueFeaturesPanels(groupData.id);
    checkPostingRules(groupData);
    
    showNotification(`Opened chat: ${groupData.name}`, 'success');
}

/**
 * Update chat header with unique features
 * @param {Object} groupData - Group data
 */
export function updateChatHeaderUniqueFeatures(groupData) {
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

/**
 * Check posting rules and update UI accordingly
 * @param {Object} groupData - Group data
 */
export function checkPostingRules(groupData) {
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
    
    updateParticipationModeButtons();
}

/**
 * Update participation mode buttons UI
 */
export function updateParticipationModeButtons() {
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

/**
 * Load all unique features panels for a group
 * @param {string} groupId - Group ID
 */
export function loadUniqueFeaturesPanels(groupId) {
    loadGroupNotes(groupId);
    loadGroupEvents(groupId);
    loadTransparencyLog(groupId);
    analyzeGroupEnergy(groupId);
}

/**
 * Load group notes from cache or imported API
 * @param {string} groupId - Group ID
 */
export async function loadGroupNotes(groupId) {
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
        
        const response = await getGroupNotes(groupId);
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
        console.error('[Groups iframe] Error loading group notes:', error);
        const groupNotesPanel = document.getElementById('groupNotesPanel');
        if (groupNotesPanel) groupNotesPanel.style.display = 'none';
    }
}

/**
 * Load group events from cache or imported API
 * @param {string} groupId - Group ID
 */
export async function loadGroupEvents(groupId) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_EVENTS + groupId;
        const cachedEvents = localStorage.getItem(cacheKey);
        
        let events = [];
        if (cachedEvents) {
            try {
                events = JSON.parse(cachedEvents);
            } catch (e) {
                console.error('[Groups iframe] Error parsing cached events:', e);
            }
        }
        
        const response = await getGroupEvents(groupId);
        if (response && response.success && response.data) {
            events = response.data;
            localStorage.setItem(cacheKey, JSON.stringify(events));
        } else {
            if (events.length === 0 && currentUser) {
                events = generateUniqueEventsForUser(groupId, currentUser.uid || currentUser.id);
                localStorage.setItem(cacheKey, JSON.stringify(events));
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
        console.error('[Groups iframe] Error loading group events:', error);
        const eventCountdownPanel = document.getElementById('eventCountdownPanel');
        if (eventCountdownPanel) eventCountdownPanel.style.display = 'none';
    }
}

/**
 * Generate unique events for a user based on their ID
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Array} Array of event objects
 */
export function generateUniqueEventsForUser(groupId, userId) {
    const events = [];
    const now = new Date();
    
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
    
    for (let i = 0; i < 3; i++) {
        const templateIndex = (userHash + i) % eventTemplates.length;
        const template = eventTemplates[templateIndex];
        
        const daysFromNow = 1 + ((userHash + i * 7) % 14);
        const eventDate = new Date(now);
        eventDate.setDate(eventDate.getDate() + daysFromNow);
        
        const hour = 9 + ((userHash + i * 3) % 8);
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

/**
 * Simple hash function for user IDs
 * @param {string} str - String to hash
 * @returns {number} Hash code
 */
export function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Load transparency log from cache or imported API
 * @param {string} groupId - Group ID
 */
export async function loadTransparencyLog(groupId) {
    try {
        const cacheKey = LOCAL_STORAGE_KEYS.GROUP_TRANSPARENCY + groupId;
        const cachedLog = localStorage.getItem(cacheKey);
        
        let log = [];
        if (cachedLog) {
            try {
                log = JSON.parse(cachedLog);
            } catch (e) {
                console.error('[Groups iframe] Error parsing transparency log:', e);
            }
        } else {
            log = generateInitialTransparencyLog(groupId);
            localStorage.setItem(cacheKey, JSON.stringify(log));
        }
        
        const response = await getGroupTransparency(groupId);
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
        console.error('[Groups iframe] Error loading transparency log:', error);
        const adminTransparencyPanel = document.getElementById('adminTransparencyPanel');
        if (adminTransparencyPanel) adminTransparencyPanel.style.display = 'none';
    }
}

/**
 * Generate initial transparency log
 * @param {string} groupId - Group ID
 * @returns {Array} Initial transparency log entries
 */
export function generateInitialTransparencyLog(groupId) {
    const now = new Date();
    return [
        {
            id: `log_${groupId}_1`,
            groupId: groupId,
            action: 'Group created',
            by: currentUser?.uid || currentUser?.id || 'system',
            byName: userData?.displayName || 'System',
            timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(),
            details: 'Group was created with initial settings'
        },
        {
            id: `log_${groupId}_2`,
            groupId: groupId,
            action: 'Welcome message set',
            by: currentUser?.uid || currentUser?.id || 'system',
            byName: userData?.displayName || 'System',
            timestamp: new Date(now.getTime() - 86400000 * 1).toISOString(),
            details: 'Welcome message was configured'
        },
        {
            id: `log_${groupId}_3`,
            groupId: groupId,
            action: 'First members joined',
            by: 'system',
            byName: 'System',
            timestamp: new Date(now.getTime() - 43200000).toISOString(),
            details: 'Initial members joined the group'
        }
    ];
}

/**
 * Analyze group energy and activity level
 * @param {string} groupId - Group ID
 */
export async function analyzeGroupEnergy(groupId) {
    try {
        let messages = [];
        
        const response = await getGroupMessages(groupId, { limit: 50 });
        if (response && response.success && response.data) {
            messages = response.data;
        } else {
            messages = generateSimulatedMessages(groupId);
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
        console.error('[Groups iframe] Error analyzing group energy:', error);
        const energySuggestionPanel = document.getElementById('energySuggestionPanel');
        if (energySuggestionPanel) energySuggestionPanel.style.display = 'none';
    }
}

/**
 * Generate simulated messages for energy analysis
 * @param {string} groupId - Group ID
 * @returns {Array} Simulated messages
 */
export function generateSimulatedMessages(groupId) {
    const messages = [];
    const now = new Date();
    const members = ['user1', 'user2', 'user3', currentUser?.uid || currentUser?.id || 'user4'];
    const messageTypes = ['text', 'announcement', 'question'];
    
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

/**
 * Close group chat on mobile
 */
export function closeGroupChatMobile() {
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

/**
 * Hide all panels
 */
export function hideAllPanels() {
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

/**
 * Load group chat messages from cache or imported API
 * @param {string} groupId - Group ID
 */
export async function loadGroupChatMessages(groupId) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const cachedMessagesKey = LOCAL_STORAGE_KEYS.GROUP_MESSAGES + groupId;
    const cachedMessages = localStorage.getItem(cachedMessagesKey);
    
    if (cachedMessages) {
        try {
            const messages = JSON.parse(cachedMessages);
            messages.forEach(message => {
                addMessageToChat(message, false);
            });
        } catch (error) {
            console.error('[Groups iframe] Error loading cached messages:', error);
        }
    }
    
    if (chatMessages.children.length === 0) {
        addSystemMessage(`Welcome to the group chat! Start the conversation.`);
    }
    
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    setTimeout(() => {
        if (chatMessagesContainer) {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    }, 100);
    
    try {
        const response = await getGroupMessages(groupId);
        if (response && response.success && response.data) {
            response.data.forEach(message => {
                addMessageToChat(message, true);
                saveMessageToCache(groupId, message);
            });
        }
    } catch (error) {
        console.error('[Groups iframe] Error loading messages from imported API:', error);
    }
}

/**
 * Add message to chat UI
 * @param {Object} messageData - Message data
 * @param {boolean} isNew - Whether this is a new message
 */
export function addMessageToChat(messageData, isNew = true) {
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

/**
 * Add system message to chat
 * @param {string} content - Message content
 */
export function addSystemMessage(content) {
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

/**
 * Save message to cache
 * @param {string} groupId - Group ID
 * @param {Object} message - Message object
 */
export function saveMessageToCache(groupId, message) {
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
        console.error('[Groups iframe] Error saving message to cache:', error);
    }
}

/**
 * Send group message using imported function
 */
export async function sendGroupMessageLocal() {
    const chatInput = document.getElementById('chatInput');
    const messageTopic = document.getElementById('messageTopic');
    
    if (!currentChatGroup || !chatInput || !chatInput.value.trim()) return;
    
    const messageContent = chatInput.value.trim();
    const selectedTopic = messageTopic ? messageTopic.value : '';
    
    chatInput.value = '';
    adjustTextareaHeight();
    
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
    
    addMessageToChat(tempMessage, true);
    
    try {
        const response = await sendGroupMessageAPI(currentChatGroup.id, {
            content: messageContent,
            topic: selectedTopic || undefined,
            anonymous: isAnonymousMode
        });
        
        if (response && response.success) {
            saveMessageToCache(currentChatGroup.id, {
                ...tempMessage,
                id: response.data?.id || tempMessage.id
            });
            
            if (isAnonymousMode) {
                toggleAnonymousMode();
            }
        } else {
            showNotification('Failed to send message', 'error');
        }
    } catch (error) {
        console.error('[Groups iframe] Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
    
    stopTypingIndicator();
}

/**
 * Toggle silent mode
 */
export function toggleSilentMode() {
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
    updateParticipationModeButtons();
}

/**
 * Toggle anonymous mode
 */
export function toggleAnonymousMode() {
    isAnonymousMode = !isAnonymousMode;
    
    if (isAnonymousMode) {
        showNotification('Anonymous mode enabled', 'info');
    } else {
        showNotification('Anonymous mode disabled', 'success');
    }
    
    updateParticipationModeButtons();
}

/**
 * Message reaction handler (exposed to window)
 * @param {string} messageId - Message ID
 * @param {HTMLElement} button - Button element
 */
export function reactToMessage(messageId, button) {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    
    showNotification(`Reacted with ${reaction}`, 'success');
    
    button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
    button.style.color = '#FF9800';
}

/**
 * Message reply handler (exposed to window)
 * @param {string} messageId - Message ID
 * @param {string} senderName - Sender name
 */
export function replyToMessage(messageId, senderName) {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = `@${senderName} `;
        chatInput.focus();
        showNotification(`Replying to ${senderName}`, 'info');
    }
}

/**
 * Message delete handler (exposed to window)
 * @param {string} messageId - Message ID
 */
export function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
        showNotification('Message deleted', 'success');
    }
}

/**
 * Setup typing indicator listener
 * @param {string} groupId - Group ID
 */
let typingTimeout;
export function setupTypingListener(groupId) {
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

/**
 * Stop typing indicator
 */
export function stopTypingIndicator() {
    isTyping = false;
    if (typingTimeout) clearTimeout(typingTimeout);
}

/**
 * Adjust textarea height based on content
 */
export function adjustTextareaHeight() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
}

/**
 * Format message time
 * @param {Date|string} date - Date object or string
 * @returns {string} Formatted time
 */
export function formatMessageTime(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Open admin management modal
 * @param {Object} groupData - Group data
 */
export function openAdminManagement(groupData) {
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
    
    loadGroupMembersForManagement(groupData);
    loadGroupSettingsForManagement(groupData);
    loadUniqueFeaturesForManagement(groupData);
}

/**
 * Load group members for management using imported API
 * @param {Object} groupData - Group data
 */
export async function loadGroupMembersForManagement(groupData) {
    const memberList = document.getElementById('memberManagementList');
    if (!memberList) return;
    
    memberList.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading members...</p></div>';
    
    try {
        let memberDetails = [];
        
        const response = await getGroupMembers(groupData.id);
        
        if (response && response.success && response.data) {
            memberDetails = response.data;
        } else {
            memberDetails = generateSimulatedMembers(groupData.id);
        }
        
        renderMembersList(memberDetails);
        
    } catch (error) {
        console.error('[Groups iframe] Error loading members:', error);
        memberList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading members</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

/**
 * Generate simulated members for demo
 * @param {string} groupId - Group ID
 * @returns {Array} Simulated members
 */
export function generateSimulatedMembers(groupId) {
    const members = [];
    const memberNames = ['Alex Johnson', 'Sam Wilson', 'Taylor Smith', 'Jordan Lee', 'Casey Brown'];
    const roles = ['admin', 'moderator', 'member', 'member', 'member'];
    
    for (let i = 0; i < 5; i++) {
        members.push({
            id: `member_${groupId}_${i}`,
            displayName: memberNames[i],
            username: memberNames[i].toLowerCase().replace(' ', ''),
            photoURL: '',
            online: i < 2,
            isCreator: i === 0,
            isAdmin: roles[i] === 'admin' || roles[i] === 'moderator'
        });
    }
    
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

/**
 * Render members list in management modal
 * @param {Array} memberDetails - Array of member objects
 */
export function renderMembersList(memberDetails) {
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
            
            handleMemberAction(action, memberId, selectedGroup);
        });
    });
}

/**
 * Handle member action in management
 * @param {string} action - Action type (promote, demote, remove)
 * @param {string} memberId - Member ID
 * @param {Object} groupData - Group data
 */
export async function handleMemberAction(action, memberId, groupData) {
    try {
        switch(action) {
            case 'promote':
                await safeApiCall('post', `groups/${groupData.id}/members/${memberId}/promote`);
                showNotification('Member promoted to admin', 'success');
                logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                break;
            case 'demote':
                await safeApiCall('post', `groups/${groupData.id}/members/${memberId}/demote`);
                showNotification('Admin demoted to member', 'success');
                logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    await safeApiCall('delete', `groups/${groupData.id}/members/${memberId}`);
                    showNotification('Member removed from group', 'success');
                    logTransparencyAction(groupData.id, 'Removed member from group', memberId);
                }
                break;
        }
        
        loadGroupMembersForManagement(groupData);
        
    } catch (error) {
        console.error('[Groups iframe] Error performing member action:', error);
        showNotification('Failed to perform action', 'error');
    }
}

/**
 * Log transparency action using imported function
 * @param {string} groupId - Group ID
 * @param {string} action - Action description
 * @param {string|null} targetId - Target user ID (optional)
 */
export async function logTransparencyAction(groupId, action, targetId = null) {
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
        console.error('[Groups iframe] Error logging transparency action:', error);
    }
}

/**
 * Load group settings for management
 * @param {Object} groupData - Group data
 */
export function loadGroupSettingsForManagement(groupData) {
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

/**
 * Load unique features for management
 * @param {Object} groupData - Group data
 */
export function loadUniqueFeaturesForManagement(groupData) {
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
    updatePostingRulesUI();
    
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

/**
 * Update posting rules UI in admin management
 */
export function updatePostingRulesUI() {
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

/**
 * Save group settings using imported API
 * @param {Object} groupData - Group data
 */
export async function saveGroupSettings(groupData) {
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
        
        const response = await updateGroupSettings(groupData.id, settings);
        
        if (response && response.success) {
            Object.assign(groupData, settings);
            
            logTransparencyAction(groupData.id, 'Updated group settings');
            
            if (currentChatGroup && currentChatGroup.id === groupData.id) {
                updateChatHeaderUniqueFeatures(groupData);
                checkPostingRules(groupData);
            }
            
            showNotification('Group settings saved successfully', 'success');
            
            const adminManagementModal = document.getElementById('adminManagementModal');
            if (adminManagementModal) adminManagementModal.classList.remove('active');
        } else {
            throw new Error(response?.error || 'Failed to save settings');
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error saving group settings:', error);
        showNotification('Failed to save settings: ' + error.message, 'error');
    }
}

/**
 * Show friend selection modal
 */
export function showFriendSelection() {
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
        renderFriendSelection();
    }, 100);
}

/**
 * Render friend selection list
 */
export function renderFriendSelection() {
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
            
            updateSelectedFriendsList();
        });
        
        friendSelectionContent.appendChild(friendItem);
    });
}

/**
 * Update selected friends list
 */
export function updateSelectedFriendsList() {
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

/**
 * Remove selected friend (exposed to window)
 * @param {string} friendId - Friend ID
 */
export function removeSelectedFriend(friendId) {
    selectedFriends = selectedFriends.filter(id => id !== friendId);
    updateSelectedFriendsList();
    
    const friendItem = document.querySelector(`.friend-item[data-friend-id="${friendId}"]`);
    if (friendItem) {
        const checkbox = friendItem.querySelector('.friend-checkbox');
        checkbox.classList.remove('selected');
        checkbox.querySelector('i').style.display = 'none';
    }
}

/**
 * Create group online using imported API
 * @param {Object} groupData - Group data
 */
export async function createGroupOnline(groupData) {
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
        
        const response = await createGroup(groupDataToSave);
        
        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to create group');
        }
        
        const newGroup = response.data;
        
        groups.push(newGroup);
        myGroups.push(newGroup);
        adminGroups.push(newGroup);
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
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
        showGroupDetails(newGroup, 'my_group');
        
    } catch (error) {
        console.error('[Groups iframe] Error creating group:', error);
        showNotification('Failed to create group: ' + error.message, 'error');
    }
}

/**
 * Join group online using imported API
 * @param {string} groupId - Group ID
 */
export async function joinGroupOnline(groupId) {
    try {
        const response = await joinGroup(groupId);
        
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
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        showNotification('Successfully joined the group!', 'success');
        
        const groupInviteModal = document.getElementById('groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {
        console.error('[Groups iframe] Error joining group:', error);
        showNotification('Failed to join group: ' + error.message, 'error');
    }
}

/**
 * Leave group online using imported API
 * @param {string} groupId - Group ID
 */
export async function leaveGroupOnline(groupId) {
    try {
        const response = await leaveGroup(groupId);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to leave group', 'error');
            return;
        }
        
        groups = groups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        showNotification('Successfully left the group', 'success');
        
        const groupDetailsPanel = document.getElementById('groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error leaving group:', error);
        showNotification('Failed to leave group: ' + error.message, 'error');
    }
}

/**
 * Accept group invite using imported API - LOCAL VERSION
 * @param {Object} inviteData - Invite data
 */
export async function acceptGroupInviteLocal(inviteData) {
    try {
        const inviteId = inviteData.id || inviteData.inviteId;
        const groupId = inviteData.groupId || inviteData.id;
        
        const response = await acceptGroupInviteAPI(inviteId);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to accept invitation', 'error');
            return;
        }
        
        await joinGroupOnline(groupId);
        
    } catch (error) {
        console.error('[Groups iframe] Error accepting group invite:', error);
        showNotification('Failed to accept invitation: ' + error.message, 'error');
    }
}

/**
 * Decline group invite using imported API - LOCAL VERSION
 * @param {Object} inviteData - Invite data
 */
export async function declineGroupInviteLocal(inviteData) {
    try {
        const inviteId = inviteData.id || inviteData.inviteId;
        
        const response = await declineGroupInviteAPI(inviteId);
        
        if (!response || !response.success) {
            showNotification(response?.error || 'Failed to decline invitation', 'error');
            return;
        }
        
        groupInvites = groupInvites.filter(invite => invite.id !== inviteId);
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        showNotification('Invitation declined', 'success');
        
        const groupInviteModal = document.getElementById('groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {
        console.error('[Groups iframe] Error declining group invite:', error);
        showNotification('Failed to decline invitation: ' + error.message, 'error');
    }
}

/**
 * Show confirmation dialog for leaving group
 * @param {Object} groupData - Group data
 */
export function leaveGroupConfirm(groupData) {
    if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
        leaveGroupOnline(groupData.id);
    }
}

/**
 * Show group details panel
 * @param {Object} groupData - Group data
 * @param {string} type - Group type
 */
export function showGroupDetails(groupData, type) {
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
    
    loadGroupDetails(groupData, type);
}

/**
 * Load group details into the panel
 * @param {Object} groupData - Group data
 * @param {string} type - Group type
 */
export async function loadGroupDetails(groupData, type) {
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
                realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
            }
        } catch (error) {
            console.log('[Groups iframe] Error loading members:', error);
            realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
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
                openGroupChat(groupData);
            });
        }
        
        if (manageGroupBtn) {
            manageGroupBtn.addEventListener('click', () => {
                openAdminManagement(groupData);
            });
        }
        
        if (leaveGroupBtn) {
            leaveGroupBtn.addEventListener('click', () => {
                leaveGroupConfirm(groupData);
            });
        }
        
        if (groupOptionsBtn) {
            groupOptionsBtn.addEventListener('click', () => {
                showGroupOptions(groupData);
            });
        }
        
        if (viewAllMembersBtn) {
            viewAllMembersBtn.addEventListener('click', () => {
                showNotification('Full member list would open here', 'info');
            });
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error loading group details:', error);
        detailsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading group details</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

/**
 * Show group options menu
 * @param {Object} groupData - Group data
 */
export function showGroupOptions(groupData) {
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
    
    showOptionsModal('Group Options', options, groupData.name);
}

/**
 * View group notes
 * @param {Object} groupData - Group data
 */
export function viewGroupNotes(groupData) {
    const groupNotesPanel = document.getElementById('groupNotesPanel');
    if (currentChatGroup && currentChatGroup.id === groupData.id) {
        if (groupNotesPanel) {
            groupNotesPanel.style.display = groupNotesPanel.style.display === 'none' ? 'block' : 'none';
        }
    } else {
        openGroupChat(groupData);
        setTimeout(() => {
            if (groupNotesPanel) groupNotesPanel.style.display = 'block';
        }, 100);
    }
}

/**
 * View group events
 * @param {Object} groupData - Group data
 */
export function viewGroupEvents(groupData) {
    const eventCountdownPanel = document.getElementById('eventCountdownPanel');
    if (currentChatGroup && currentChatGroup.id === groupData.id) {
        if (eventCountdownPanel) {
            eventCountdownPanel.style.display = eventCountdownPanel.style.display === 'none' ? 'block' : 'none';
        }
    } else {
        openGroupChat(groupData);
        setTimeout(() => {
            if (eventCountdownPanel) eventCountdownPanel.style.display = 'block';
        }, 100);
    }
}

/**
 * View group analytics
 * @param {Object} groupData - Group data
 */
export function viewGroupAnalytics(groupData) {
    openAdminManagement(groupData);
    const analyticsTab = document.querySelector('.admin-management-tab[data-tab="analytics"]');
    if (analyticsTab) {
        analyticsTab.click();
        loadGroupAnalytics(groupData);
    }
}

/**
 * Load group analytics
 * @param {Object} groupData - Group data
 */
export async function loadGroupAnalytics(groupData) {
    try {
        const analyticsDailyMessages = document.getElementById('analyticsDailyMessages');
        const analyticsActiveMembers = document.getElementById('analyticsActiveMembers');
        const analyticsEngagementRate = document.getElementById('analyticsEngagementRate');
        const groupPulseInsight = document.getElementById('groupPulseInsight');
        
        if (analyticsDailyMessages) {
            const groupHash = hashCode(groupData.id);
            const dailyMessages = 20 + (groupHash % 30);
            analyticsDailyMessages.textContent = dailyMessages;
        }
        
        if (analyticsActiveMembers) {
            const activeMembers = Math.min(5 + (hashCode(groupData.id) % (groupData.memberCount || 10)), groupData.memberCount || 10);
            analyticsActiveMembers.textContent = activeMembers;
        }
        
        if (analyticsEngagementRate) {
            const engagementRate = 30 + (hashCode(groupData.id) % 50);
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
        
        const analyticsChart = document.getElementById('analyticsChart');
        if (analyticsChart && window.Chart) {
            renderAnalyticsChart(analyticsChart, groupData);
        }
        
    } catch (error) {
        console.error('[Groups iframe] Error loading analytics:', error);
    }
}

/**
 * Render analytics chart
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} groupData - Group data
 */
export function renderAnalyticsChart(canvas, groupData) {
    const ctx = canvas.getContext('2d');
    const groupHash = hashCode(groupData.id);
    
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

/**
 * Change purpose/mood
 * @param {Object} groupData - Group data
 */
export function changePurposeMood(groupData) {
    openAdminManagement(groupData);
    const purposeTab = document.querySelector('.admin-management-tab[data-tab="purpose"]');
    if (purposeTab) {
        purposeTab.click();
    }
}

/**
 * Update posting rules
 * @param {Object} groupData - Group data
 */
export function updatePostingRules(groupData) {
    openAdminManagement(groupData);
    const purposeTab = document.querySelector('.admin-management-tab[data-tab="purpose"]');
    if (purposeTab) {
        purposeTab.click();
    }
}

/**
 * View change history
 * @param {Object} groupData - Group data
 */
export function viewChangeHistory(groupData) {
    openAdminManagement(groupData);
    const transparencyTab = document.querySelector('.admin-management-tab[data-tab="transparency"]');
    if (transparencyTab) {
        transparencyTab.click();
    }
}

/**
 * Show options modal
 * @param {string} title - Modal title
 * @param {Array} options - Array of option objects
 * @param {string} subtitle - Modal subtitle
 */
export function showOptionsModal(title, options, subtitle = '') {
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

/**
 * Share group
 * @param {Object} groupData - Group data
 */
export function shareGroup(groupData) {
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

/**
 * Mute group notifications
 * @param {Object} groupData - Group data
 */
export function muteGroup(groupData) {
    const mutedGroups = JSON.parse(localStorage.getItem('knecta_muted_groups') || '[]');
    
    if (!mutedGroups.includes(groupData.id)) {
        mutedGroups.push(groupData.id);
        localStorage.setItem('knecta_muted_groups', JSON.stringify(mutedGroups));
        showNotification('Group notifications muted', 'success');
    } else {
        showNotification('Group already muted', 'info');
    }
}

/**
 * Add group to favorites
 * @param {Object} groupData - Group data
 */
export function favoriteGroup(groupData) {
    const favoriteGroups = JSON.parse(localStorage.getItem('knecta_favorite_groups') || '[]');
    
    if (!favoriteGroups.includes(groupData.id)) {
        favoriteGroups.push(groupData.id);
        localStorage.setItem('knecta_favorite_groups', JSON.stringify(favoriteGroups));
        showNotification('Group added to favorites', 'success');
    } else {
        showNotification('Group already in favorites', 'info');
    }
}

/**
 * Report group
 * @param {Object} groupData - Group data
 */
export function reportGroup(groupData) {
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

/**
 * Block group
 * @param {Object} groupData - Group data
 */
export function blockGroup(groupData) {
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
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        showNotification('Group blocked successfully', 'success');
        
        const groupDetailsPanel = document.getElementById('groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
    }
}

/**
 * Show group QR code
 * @param {Object} groupData - Group data
 */
export function showGroupQRCode(groupData) {
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

/**
 * Download QR code (exposed to window)
 */
export function downloadQRCode() {
    const qrCanvas = document.querySelector('#qrCodeContainer canvas');
    if (qrCanvas) {
        const link = document.createElement('a');
        link.download = 'group-qr-code.png';
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
        showNotification('QR code downloaded', 'success');
    }
}

/**
 * Copy invite link to clipboard
 * @param {Object} groupData - Group data
 */
export function copyInviteLink(groupData) {
    const inviteLink = `${window.location.origin}/group.html?join=${groupData.id}`;
    navigator.clipboard.writeText(inviteLink);
    showNotification('Invite link copied to clipboard', 'success');
}

/**
 * Invite members to group
 * @param {Object} groupData - Group data
 */
export function inviteMembers(groupData) {
    showFriendSelection();
}

/**
 * Edit group info
 * @param {Object} groupData - Group data
 */
export function editGroupInfo(groupData) {
    openAdminManagement(groupData);
}

/**
 * Manage roles
 * @param {Object} groupData - Group data
 */
export function manageRoles(groupData) {
    openAdminManagement(groupData);
}

/**
 * Create event
 * @param {Object} groupData - Group data
 */
export function createEvent(groupData) {
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
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = tomorrow.toISOString().split('T')[0];
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        const eventDateInput = document.getElementById('eventDate');
        const eventTimeInput = document.getElementById('eventTime');
        if (eventDateInput) eventDateInput.value = formattedDate;
        if (eventTimeInput) eventTimeInput.value = '18:00';
    }, 100);
}

/**
 * Save new event (exposed to window)
 */
export function saveNewEvent() {
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
    
    const modal = document.querySelector('.event-modal');
    if (modal) modal.remove();
    
    showNotification('Event created successfully!', 'success');
    
    if (currentChatGroup) {
        loadGroupEvents(currentChatGroup.id);
    }
}

/**
 * Create poll
 * @param {Object} groupData - Group data
 */
export function createPoll(groupData) {
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

/**
 * Add poll option (exposed to window)
 */
export function addPollOption() {
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
}

/**
 * Remove poll option (exposed to window)
 * @param {HTMLElement} button - Remove button
 */
export function removePollOption(button) {
    const optionDiv = button.parentElement;
    if (optionDiv && optionDiv.parentElement) {
        const optionCount = optionDiv.parentElement.querySelectorAll('.poll-option').length;
        if (optionCount > 2) {
            optionDiv.remove();
        } else {
            showNotification('Minimum 2 options required', 'error');
        }
    }
}

/**
 * Save new poll (exposed to window)
 */
export function saveNewPoll() {
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
            
            const chatMessagesContainer = document.getElementById('chatMessagesContainer');
            if (chatMessagesContainer) {
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }
        }
    }
    
    const modal = document.querySelector('.poll-modal');
    if (modal) modal.remove();
    
    showNotification('Poll created successfully!', 'success');
}

/**
 * Vote on poll (exposed to window)
 * @param {number} optionId - Option ID
 * @param {HTMLElement} button - Vote button
 */
export function voteOnPoll(optionId, button) {
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
}

/**
 * Show group invite details
 * @param {Object} inviteData - Invite data
 */
export function showGroupInviteDetails(inviteData) {
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

// =============================================
// DATA SYNC FUNCTIONS (UPDATED FOR PARENT COORDINATION AND IMPORTS)
// =============================================

/**
 * Sync groups from server with cache fallback using imported API
 */
export async function syncGroupsFromServer() {
    if (!authReady) return;
    
    // Check if we have a valid session
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        console.log('[Groups iframe] Group sync: Skipping - no valid session');
        return;
    }
    
    try {
        const response = await getGroups();
        
        if (!response || !response.success || !response.data) {
            console.log('[Groups iframe] No groups found on server or API not available');
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
            console.log('[Groups iframe] Group data updated from server');
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
                updateCurrentSection();
                updateGroupCounts();
            }
            
            showNotification('Groups list updated', 'success');
        }
        
    } catch (error) {
        console.log('[Groups iframe] Group sync error:', error.message);
    }
}

/**
 * Sync group invites from server using imported API
 */
export async function syncGroupInvitesFromServer() {
    if (!authReady) return;
    
    // Check if we have a valid session
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        console.log('[Groups iframe] Group invites sync: Skipping - no valid session');
        return;
    }
    
    try {
        const response = await getGroupInvites();
        
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
            console.log('[Groups iframe] Group invites updated from server');
            groupInvites = serverInvites;
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_INVITES, JSON.stringify(groupInvites));
            
            const invitesCountEl = document.getElementById('invitesCount');
            const invitesSectionCountEl = document.getElementById('invitesSectionCount');
            if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
            if (invitesSectionCountEl) invitesSectionCountEl.textContent = groupInvites.length;
        }
        
    } catch (error) {
        console.log('[Groups iframe] Group invites sync error:', error.message);
    }
}

/**
 * Sync unique features data from server using imported APIs
 */
export async function syncUniqueFeaturesData() {
    if (!authReady) return;
    
    // Check if we have a valid session
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        console.log('[Groups iframe] Unique features sync: Skipping - no valid session');
        return;
    }
    
    try {
        const purposesResponse = await getGroupPurposes();
        if (purposesResponse && purposesResponse.success && purposesResponse.data) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_PURPOSES, JSON.stringify(purposesResponse.data));
            
            purposesResponse.data.forEach(purpose => {
                const group = groups.find(g => g.id === purpose.groupId);
                if (group) {
                    group.purpose = purpose.purpose;
                }
            });
        }
        
        const moodsResponse = await getGroupMoods();
        if (moodsResponse && moodsResponse.success && moodsResponse.data) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_MOODS, JSON.stringify(moodsResponse.data));
            
            moodsResponse.data.forEach(mood => {
                const group = groups.find(g => g.id === mood.groupId);
                if (group) {
                    group.mood = mood.mood;
                }
            });
        }
        
    } catch (error) {
        console.log('[Groups iframe] Unique features sync error:', error.message);
    }
}

/**
 * Check if group matches current filters
 * @param {Object} groupData - Group data
 * @returns {boolean} True if group matches filters
 */
export function matchesFilters(groupData) {
    if (currentTypeFilter !== 'all' && groupData.type !== currentTypeFilter) {
        return false;
    }
    
    if (currentSearchTerm && !matchesSearch(groupData, currentSearchTerm)) {
        return false;
    }
    
    return true;
}

/**
 * Check if group matches search term
 * @param {Object} groupData - Group data
 * @param {string} searchTerm - Search term
 * @returns {boolean} True if group matches search
 */
export function matchesSearch(groupData, searchTerm) {
    if (!searchTerm) return true;
    
    const searchIn = [
        groupData.name || '',
        groupData.topic || '',
        groupData.description || '',
        groupData.purpose ? groupPurposes[groupData.purpose]?.name || '' : ''
    ].join(' ').toLowerCase();
    
    return searchIn.includes(searchTerm.toLowerCase());
}

/**
 * Filter groups by type
 * @param {string} type - Group type to filter by
 */
export function filterGroupsByType(type) {
    currentTypeFilter = type;
    updateCurrentSection();
    
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.type-filter-btn[data-type="${type}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

/**
 * Search groups by term
 * @param {string} searchTerm - Search term
 */
export function searchGroups(searchTerm) {
    currentSearchTerm = searchTerm.toLowerCase().trim();
    updateCurrentSection();
}

/**
 * Save groups to local storage
 */
export function saveGroupsToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.MY_GROUPS, JSON.stringify(myGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS, JSON.stringify(joinedGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_INVITES, JSON.stringify(groupInvites));
        localStorage.setItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS, JSON.stringify(adminGroups));
        localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_ACTIONS, JSON.stringify(pendingGroupActions));
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_CACHE_TIME, Date.now().toString());
        console.log('[Groups iframe] Groups saved to local storage');
    } catch (error) {
        console.error('[Groups iframe] Error saving groups to local storage:', error);
    }
}

/**
 * Format time ago string
 * @param {Date|string} date - Date object or string
 * @returns {string} Formatted time ago
 */
export function formatTimeAgo(date) {
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

/**
 * Format date string
 * @param {Date|string} date - Date object or string
 * @returns {string} Formatted date
 */
export function formatDate(date) {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info, warning)
 */
export function showNotification(message, type = 'success') {
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

/**
 * Process pending offline actions
 */
export function processPendingOfflineActions() {
    try {
        const pendingActions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_ACTIONS) || '[]');
        if (pendingActions.length > 0) {
            console.log('[Groups iframe] Processing pending group actions...');
        }
    } catch (error) {
        console.error('[Groups iframe] Error processing pending offline actions:', error);
    }
}

/**
 * Update create group posting rules UI
 */
export function updateCreateGroupPostingRulesUI() {
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