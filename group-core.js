// =============================================
// PRODUCTION-READY GROUPS SYSTEM WITH PARENT SESSION AUTHORITY
// =============================================

// ES Module imports for API functionality
import { 
  secureFetch, 
  getUserToken,
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
  getGroupMoods,
  initialize as initApi

} from './js/api-groups.js';

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
    USER_TOKEN: 'USER_TOKEN'
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
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    CHILD_INITIALIZED: 'CHILD_INITIALIZED',
    CHILD_ERROR: 'CHILD_ERROR',
    CHILD_ACTION: 'CHILD_ACTION',
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
// SECURE HANDSHAKE PROTOCOL IMPLEMENTATION
// =============================================

// Secure handshake state
let handshakeInProgress = false;
let sessionValid = false;
let handshakeTimeout = null;
let hasLoggedWaiting = false;
let hasLoggedSuccess = false;
let hasLoggedFailed = false;

/**
 * Initialize secure handshake with parent
 */
export function initializeSecureHandshake() {
    if (handshakeInProgress || parentConnection.handshakeComplete) {
        return;
    }
    
    if (!verifyParentPresence()) {
        handleParentUnavailable();
        return;
    }
    
    setupSecureMessageListener();
    requestSessionFromParent();
}

/**
 * Request session from parent with secure protocol
 */
export function requestSessionFromParent() {
    if (handshakeInProgress) {
        return;
    }
    
    handshakeInProgress = true;
    sessionValid = false;
    
    if (!hasLoggedWaiting) {
        console.log('⏳ [Groups] Waiting for session from parent...');
        hasLoggedWaiting = true;
        hasLoggedSuccess = false;
        hasLoggedFailed = false;
    }
    
    // Send request to parent
    const messageSent = sendMessageToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
        source: 'groups-iframe',
        version: '1.0.0',
        timestamp: Date.now(),
        requestId: 'session_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    });
    
    if (!messageSent) {
        handshakeInProgress = false;
        if (!hasLoggedFailed) {
            console.log('❌ [Groups] Cannot send message to parent');
            hasLoggedFailed = true;
        }
        handleParentUnavailable();
        return;
    }
    
    // Set timeout for handshake
    handshakeTimeout = setTimeout(() => {
        if (!sessionValid) {
            handshakeInProgress = false;
            if (!hasLoggedFailed) {
                console.log('❌ [Groups] Session request failed. Will retry once.');
                hasLoggedFailed = true;
            }
            
            // Single retry as requested
            if (parentConnection.retryCount < 1) {
                parentConnection.retryCount++;
                setTimeout(() => {
                    requestSessionFromParent();
                }, 2000);
            } else {
                handleParentUnavailable();
            }
        }
    }, 5000);
}

/**
 * Setup secure message listener for parent communication
 */
export function setupSecureMessageListener() {
    if (window.secureMessageListenerSetup) {
        return;
    }
    
    window.addEventListener('message', handleSecureParentMessage);
    window.secureMessageListenerSetup = true;
}

/**
 * Handle secure messages from parent window with origin validation
 * @param {MessageEvent} event - Message event
 */
export function handleSecureParentMessage(event) {
    try {
        // Validate origin - accept only from same origin or trusted origins
        const isValidOrigin = validateMessageOrigin(event.origin);
        if (!isValidOrigin) {
            return;
        }
        
        const message = event.data;
        
        if (!message || typeof message !== 'object' || !message.type) {
            return;
        }
        
        // Check source to ensure it's from parent
        if (message.source !== 'parent' && message.source !== 'knecta-parent') {
            return;
        }
        
        switch (message.type) {
            case PARENT_MESSAGE_TYPES.SESSION_DATA:
                handleSecureSessionData(message.data || message);
                break;
            case PARENT_MESSAGE_TYPES.PARENT_READY:
                handleParentReady();
                break;
            case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
                handleSessionUpdate(message.data);
                break;
            case PARENT_MESSAGE_TYPES.LOGOUT:
                handleLogout();
                break;
            default:
                // Handle legacy or custom messages
                if (message.token && message.user) {
                    handleSecureSessionData(message);
                }
        }
    } catch (error) {
        console.warn('[Groups] Error handling secure parent message:', error.message);
    }
}

/**
 * Validate message origin safely
 * @param {string} origin - Message origin
 * @returns {boolean} True if origin is valid
 */
export function validateMessageOrigin(origin) {
    try {
        const currentOrigin = window.location.origin;
        
        // Accept same origin always
        if (origin === currentOrigin) {
            return true;
        }
        
        // Accept local development origins
        if (origin === 'http://127.0.0.1:5500' || 
            origin === 'http://localhost:5500' ||
            origin === 'http://localhost:3000' ||
            origin === 'http://127.0.0.1:3000') {
            return true;
        }
        
        // Accept parent origin if we can detect it
        if (window.parent && window.parent.location) {
            try {
                const parentOrigin = window.parent.location.origin;
                if (origin === parentOrigin) {
                    return true;
                }
            } catch (e) {
                // Cannot access parent origin due to cross-origin
            }
        }
        
        // For production, you might want to whitelist specific origins
        const allowedOrigins = [
            currentOrigin,
            'https://your-production-domain.com',
            'https://www.your-production-domain.com'
        ];
        
        return allowedOrigins.includes(origin);
    } catch (error) {
        return false;
    }
}

/**
 * Handle secure session data from parent
 * @param {Object} sessionData - Session data
 */
export function handleSecureSessionData(sessionData) {
    try {
        if (!sessionData || !sessionData.token || !sessionData.user) {
            if (!hasLoggedFailed) {
                console.log('❌ [Groups] Received invalid session from parent');
                hasLoggedFailed = true;
            }
            handshakeInProgress = false;
            return;
        }
        
        // Validate session data
        if (!validateSessionData(sessionData)) {
            if (!hasLoggedFailed) {
                console.log('❌ [Groups] Session validation failed');
                hasLoggedFailed = true;
            }
            handshakeInProgress = false;
            return;
        }
        
        sessionValid = true;
        handshakeInProgress = false;
        
        if (handshakeTimeout) {
            clearTimeout(handshakeTimeout);
            handshakeTimeout = null;
        }
        
        // Update parent connection state
        parentConnection.sessionData = sessionData;
        parentConnection.handshakeComplete = true;
        parentConnection.isConnected = true;
        
        if (!hasLoggedSuccess) {
            console.log('✅ [Groups] Session received successfully');
            hasLoggedSuccess = true;
        }
        
        // Update local state from session
        updateLocalStateFromSession(sessionData);
        
        // Bind UI only after session is validated
        bindUIAfterSession();
        
        // Notify parent that we're ready
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_INITIALIZED, {
            success: true,
            user: sessionData.user.id || 'unknown',
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('[Groups] Error handling secure session data:', error.message);
        handshakeInProgress = false;
    }
}

/**
 * Bind UI only after session is validated (safe UI initialization)
 */
export function bindUIAfterSession() {
    if (!parentConnection.handshakeComplete || !sessionValid) {
        return;
    }
    
    try {
        enableProtectedUI();
        startBackgroundProcesses();
        
        // Ensure UI is only bound once
        if (!isPageInitialized) {
            setTimeout(() => {
                setupUIEventListeners();
                setupResponsiveBehavior();
                updateUserUI();
            }, 100);
        }
    } catch (error) {
        console.error('[Groups] Error binding UI after session:', error.message);
    }
}

// =============================================
// PARENT COORDINATION FUNCTIONS (UPDATED)
// =============================================

/**
 * Initialize parent connection and handshake
 */
export function initializeParentConnection() {
    try {
        // Use secure handshake protocol
        initializeSecureHandshake();
    } catch (error) {
        console.warn('[Groups] Parent connection initialization failed:', error.message);
        handleParentUnavailable();
    }
}

/**
 * Verify parent window presence and same-origin
 * @returns {boolean} True if parent is available and same-origin
 */
export function verifyParentPresence() {
    try {
        if (window === window.parent) {
            return false;
        }
        
        // Try to detect parent origin safely
        try {
            const parentOrigin = window.parent.location.origin;
            const currentOrigin = window.location.origin;
            
            if (parentOrigin !== currentOrigin) {
                // Allow for development environments
                if (parentOrigin.includes('localhost') || parentOrigin.includes('127.0.0.1')) {
                    return true;
                }
                return false;
            }
            
            return true;
        } catch (error) {
            // Cannot access parent location (cross-origin)
            // This is normal in some iframe scenarios
            return true;
        }
    } catch (error) {
        return false;
    }
}

/**
 * Setup message listener for parent communication
 */
export function setupParentMessageListener() {
    if (window.parentMessageListenerSetup) return;
    
    window.addEventListener('message', handleParentMessage);
    window.parentMessageListenerSetup = true;
}

/**
 * Handle messages from parent window
 * @param {MessageEvent} event - Message event
 */
export function handleParentMessage(event) {
    try {
        if (event.origin !== window.location.origin) {
            return;
        }
        
        const message = event.data;
        
        if (!message || typeof message !== 'object' || !message.type) {
            return;
        }
        
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
                if (message.session) {
                    handleLegacySessionMessage(message);
                }
        }
    } catch (error) {
        console.warn('[Groups] Error handling parent message:', error.message);
    }
}

/**
 * Start handshake protocol with parent
 */
export function startHandshakeProtocol() {
    parentConnection.retryCount = 0;
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
        childId: 'groups-iframe',
        version: '1.0.0',
        timestamp: Date.now()
    });
    
    scheduleHandshakeRetry();
}

/**
 * Schedule handshake retry with exponential backoff
 */
export function scheduleHandshakeRetry() {
    if (parentConnection.handshakeComplete) return;
    
    if (parentConnection.retryCount >= parentConnection.maxRetries) {
        handleParentUnavailable();
        return;
    }
    
    const delay = parentConnection.retryDelay * Math.pow(2, parentConnection.retryCount);
    parentConnection.retryCount++;
    
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
            return false;
        }
        
        const message = {
            type: type,
            data: data,
            source: 'knecta-groups-iframe',
            timestamp: Date.now(),
            sequenceId: Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        };
        
        // Send to any origin - origin validation happens on receive
        window.parent.postMessage(message, '*');
        return true;
    } catch (error) {
        console.warn('[Groups] Error sending message to parent:', error.message);
        return false;
    }
}

/**
 * Handle parent ready signal
 */
export function handleParentReady() {
    // Use the secure handshake protocol
    requestSessionFromParent();
}

/**
 * Handle session data from parent
 * @param {Object} sessionData - Session data
 */
export function handleSessionData(sessionData) {
    try {
        if (!validateSessionData(sessionData)) {
            sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ERROR, {
                error: 'Invalid session data',
                validationFailed: true
            });
            return;
        }
        
        parentConnection.sessionData = sessionData;
        parentConnection.handshakeComplete = true;
        parentConnection.isConnected = true;
        
        updateLocalStateFromSession(sessionData);
        
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_INITIALIZED, {
            success: true,
            user: sessionData.user?.id || 'unknown',
            timestamp: Date.now()
        });
        
        enableProtectedUI();
        startBackgroundProcesses();
    } catch (error) {
        console.error('[Groups] Error handling session data:', error.message);
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ERROR, {
            error: 'Failed to process session data'
        });
    }
}

/**
 * Validate session data against schema
 * @param {Object} sessionData - Session data to validate
 * @returns {boolean} True if valid
 */
export function validateSessionData(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return false;
    }
    
    const required = SESSION_SCHEMA.required;
    for (const field of required) {
        if (!sessionData[field]) {
            return false;
        }
    }
    
    if (sessionData.user) {
        const userRequired = SESSION_SCHEMA.user.required;
        for (const field of userRequired) {
            if (!sessionData.user[field]) {
                return false;
            }
        }
    }
    
    if (typeof sessionData.token !== 'string' || !sessionData.token) {
        return false;
    }
    
    if (typeof sessionData.timestamp !== 'number' || sessionData.timestamp <= 0) {
        return false;
    }
    
    return true;
}

/**
 * Update local state from session data
 * @param {Object} sessionData - Session data
 */
export function updateLocalStateFromSession(sessionData) {
    try {
        currentUser = sessionData.user;
        
        userData = {
            displayName: currentUser.displayName || currentUser.name || 'User',
            username: currentUser.username || null,
            email: currentUser.email || null,
            photoURL: currentUser.photoURL || currentUser.avatar || null
        };
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
            uid: currentUser.id || currentUser._id || currentUser.uid,
            displayName: currentUser.displayName || currentUser.name,
            email: currentUser.email,
            photoURL: currentUser.photoURL || currentUser.avatar
        }));
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
        saveUnifiedToken(sessionData.token);
        
        authReady = true;
        authCheckComplete = true;
    } catch (error) {
        console.warn('[Groups] Error updating local session state:', error.message);
    }
}

/**
 * Handle session update from parent
 * @param {Object} updateData - Update data
 */
export function handleSessionUpdate(updateData) {
    try {
        if (parentConnection.sessionData) {
            parentConnection.sessionData = {
                ...parentConnection.sessionData,
                ...updateData
            };
            
            if (updateData.user) {
                updateLocalStateFromSession(parentConnection.sessionData);
            }
        }
    } catch (error) {
        console.warn('[Groups] Error handling session update:', error.message);
    }
}

/**
 * Handle logout signal from parent
 */
export function handleLogout() {
    try {
        clearLocalSessionState();
        disableProtectedUI();
        showNotification('Logged out. Please log in again.', 'info');
        
        sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ACTION, {
            action: 'logout_processed',
            timestamp: Date.now()
        });
    } catch (error) {
        console.warn('[Groups] Error handling logout:', error.message);
    }
}

/**
 * Clear local session state
 */
export function clearLocalSessionState() {
    currentUser = null;
    userData = null;
    authReady = false;
    
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        localStorage.removeItem('knecta_access_token');
        localStorage.removeItem('moodchat_token');
    } catch (error) {
        console.warn('[Groups] Error clearing localStorage:', error.message);
    }
    
    parentConnection.sessionData = null;
    parentConnection.handshakeComplete = false;
    parentConnection.isConnected = false;
    
    // Reset handshake state
    handshakeInProgress = false;
    sessionValid = false;
    hasLoggedWaiting = false;
    hasLoggedSuccess = false;
    hasLoggedFailed = false;
    
    if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
    }
    
    stopBackgroundProcesses();
}

/**
 * Handle parent unavailable scenario
 */
export function handleParentUnavailable() {
    const cachedUser = getCurrentUserLocal();
    const cachedToken = getUnifiedToken();
    
    if (cachedUser && cachedToken) {
        const sessionData = {
            user: cachedUser,
            token: cachedToken,
            timestamp: Date.now(),
            fromCache: true
        };
        
        updateLocalStateFromSession(sessionData);
        enableProtectedUI();
        startBackgroundProcesses();
        
        showNotification('Running with cached data. Some features may be limited.', 'warning');
    } else {
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
    try {
        const sessionData = {
            user: message.user || message.session?.user,
            token: message.token || message.session?.token,
            timestamp: message.timestamp || Date.now(),
            fromLegacy: true
        };
        
        if (validateSessionData(sessionData)) {
            handleSessionData(sessionData);
        }
    } catch (error) {
        console.warn('[Groups] Error handling legacy session message:', error.message);
    }
}

/**
 * Enable protected UI elements
 */
export function enableProtectedUI() {
    updateUserUI();
}

/**
 * Disable protected UI elements
 */
export function disableProtectedUI() {
    const userElements = document.querySelectorAll('.user-info, .user-avatar');
    userElements.forEach(el => {
        el.style.opacity = '0.5';
    });
}

/**
 * Show reconnect state UI
 */
export function showReconnectState() {
    if (document.getElementById('reconnectOverlay')) return;
    
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
    
    document.getElementById('retryConnectionBtn').addEventListener('click', () => {
        location.reload();
    });
    
    document.getElementById('useCachedDataBtn').addEventListener('click', () => {
        handleParentUnavailable();
        overlay.remove();
    });
}

/**
 * Start background processes after session is ready
 */
export function startBackgroundProcesses() {
    try {
        loadUserDataInBackground();
        startBackgroundSync();
        
        if (typeof processPendingOfflineActions === 'function') {
            processPendingOfflineActions();
        }
    } catch (error) {
        console.warn('[Groups] Error starting background processes:', error.message);
    }
}

/**
 * Stop background processes
 */
export function stopBackgroundProcesses() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
    
    backgroundSyncRunning = false;
}

// =============================================
// TOKEN MANAGEMENT & API INITIALIZATION
// =============================================

/**
 * Initialize token system with parent coordination
 */
export function initializeTokenSystem() {
    tokenReadyPromise = new Promise((resolve, reject) => {
        tokenReadyResolve = resolve;
        tokenReadyReject = reject;
    });
    
    setTimeout(async () => {
        try {
            if (parentConnection.sessionData && parentConnection.sessionData.token) {
                const token = parentConnection.sessionData.token;
                saveUnifiedToken(token);
                authReady = true;
                authCheckComplete = true;
                if (tokenReadyResolve) tokenReadyResolve(token);
                return token;
            }
            
            await waitForTokenReady();
        } catch (error) {
            console.error('[Groups] Token system initialization failed:', error.message);
            if (tokenReadyResolve) tokenReadyResolve(null);
        }
    }, 100);
}

/**
 * Wait for token to be ready (non-blocking)
 * @returns {Promise<string|null>} Token if available, null if not
 */
export async function waitForTokenReady() {
    const token = getUnifiedToken();
    if (token) {
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(token);
        return token;
    }
    
    if (parentConnection.sessionData && parentConnection.sessionData.token) {
        const parentToken = parentConnection.sessionData.token;
        saveUnifiedToken(parentToken);
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(parentToken);
        return parentToken;
    }
    
    try {
        const apiToken = await getUserToken();
        if (apiToken) {
            saveUnifiedToken(apiToken);
            authReady = true;
            authCheckComplete = true;
            if (tokenReadyResolve) tokenReadyResolve(apiToken);
            return apiToken;
        }
    } catch (error) {
        console.warn('[Groups] Could not get token from getUserToken:', error.message);
    }
    
    try {
        await initApi();
        const apiToken = await getUserToken();
        if (apiToken) {
            saveUnifiedToken(apiToken);
            authReady = true;
            authCheckComplete = true;
            if (tokenReadyResolve) tokenReadyResolve(apiToken);
            return apiToken;
        }
    } catch (error) {
        console.warn('[Groups] Error waiting for api.core.js:', error.message);
    }
    
    const migratedToken = migrateLegacyTokens();
    if (migratedToken) {
        authReady = true;
        authCheckComplete = true;
        if (tokenReadyResolve) tokenReadyResolve(migratedToken);
        return migratedToken;
    }
    
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
        if (parentConnection.sessionData && parentConnection.sessionData.token) {
            return parentConnection.sessionData.token;
        }
        
        const unifiedToken = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (unifiedToken) {
            return unifiedToken;
        }
        
        try {
            const apiToken = getUserToken();
            if (apiToken) {
                saveUnifiedToken(apiToken);
                return apiToken;
            }
        } catch (error) {
            console.warn('[Groups] Error getting token from getUserToken:', error.message);
        }
        
        if (window.parent && window.parent.localStorage) {
            try {
                const parentToken = window.parent.localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
                if (parentToken) {
                    saveUnifiedToken(parentToken);
                    return parentToken;
                }
            } catch (e) {
                console.warn('[Groups] Cannot access parent localStorage:', e.message);
            }
        }
        
        if (window.parent && window.parent.AppState && window.parent.AppState.accessToken) {
            const token = window.parent.AppState.accessToken;
            saveUnifiedToken(token);
            return token;
        }
        
        if (window.AppState && window.AppState.accessToken) {
            const token = window.AppState.accessToken;
            saveUnifiedToken(token);
            return token;
        }
        
        return null;
    } catch (error) {
        console.error('[Groups] Error getting unified token:', error.message);
        return null;
    }
}

/**
 * Save unified token to all storage locations
 * @param {string} token - The token to save
 */
export function saveUnifiedToken(token) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, token);
        localStorage.setItem('knecta_access_token', token);
        localStorage.setItem('moodchat_token', token);
        
        if (window.AppState) {
            window.AppState.accessToken = token;
        }
        
        if (window.parent && window.parent.AppState) {
            try {
                window.parent.AppState.accessToken = token;
            } catch (e) {
                console.warn('[Groups] Cannot update parent AppState:', e.message);
            }
        }
    } catch (error) {
        console.error('[Groups] Error saving unified token:', error.message);
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
    
    for (const key of legacyKeys) {
        try {
            const token = localStorage.getItem(key);
            if (token && !migratedToken) {
                migratedToken = token;
                saveUnifiedToken(token);
                
                setTimeout(() => {
                    localStorage.removeItem(key);
                }, 1000);
                
                break;
            }
        } catch (error) {
            console.warn(`[Groups] Error checking legacy key ${key}:`, error.message);
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
        if (parentConnection.sessionData && parentConnection.sessionData.user) {
            return parentConnection.sessionData.user;
        }
        
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            return JSON.parse(cachedUser);
        }
        
        if (window.parent && window.parent.localStorage) {
            try {
                const parentUser = window.parent.localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
                if (parentUser) {
                    return JSON.parse(parentUser);
                }
            } catch (e) {
                console.warn('[Groups] Cannot access parent localStorage:', e.message);
            }
        }
        
        if (window.parent && window.parent.AppState && window.parent.AppState.currentUser) {
            return window.parent.AppState.currentUser;
        }
        
        if (window.AppState && window.AppState.currentUser) {
            return window.AppState.currentUser;
        }
        
        return null;
    } catch (error) {
        console.error('[Groups] Error getting current user:', error.message);
        return null;
    }
}

// =============================================
// SECURE API CALL SYSTEM
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
    
    try {
        const token = await tokenReadyPromise;
        
        if (!token) {
            const callsToProcess = [...tokenQueue];
            tokenQueue.length = 0;
            
            for (const call of callsToProcess) {
                try {
                    const fnString = call.fn.toString();
                    const endpointMatch = fnString.match(/['"`]([^'"`]+)['"`]/);
                    
                    if (endpointMatch) {
                        const endpoint = endpointMatch[1];
                        const cacheKey = `api_cache_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        const cached = localStorage.getItem(cacheKey);
                        
                        if (cached) {
                            try {
                                const cachedData = JSON.parse(cached);
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
                    
                    call.reject(new Error('No authentication token available and no cached data'));
                } catch (error) {
                    call.reject(error);
                }
            }
            return;
        }
        
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
        console.error('[Groups] Error processing token queue:', error.message);
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
    if (typeof apiRequest === 'function') {
        try {
            return await apiRequest({
                url: endpoint,
                method: method,
                data: data,
                ...options
            });
        } catch (error) {
            console.warn('[Groups] apiRequest failed, falling back:', error.message);
        }
    }
    
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
            console.warn('[Groups] secureFetch failed, falling back:', error.message);
        }
    }
    
    const apiCall = async (token) => {
        if (!token) {
            throw new Error('No authentication token available');
        }
        
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
        
        if (response.status === 401) {
            localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            
            sendMessageToParent(PARENT_MESSAGE_TYPES.CHILD_ERROR, {
                error: 'Authentication failed',
                statusCode: 401,
                endpoint: endpoint,
                timestamp: Date.now()
            });
            
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
    
    const token = getUnifiedToken();
    if (!token) {
        return queueApiCall(apiCall);
    }
    
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
    const isGetRequest = method.toUpperCase() === 'GET';
    const cacheKey = isGetRequest ? `api_cache_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}` : null;
    
    if (isGetRequest && !options.forceRefresh) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const cachedData = JSON.parse(cached);
                const cacheAge = Date.now() - (cachedData.timestamp || 0);
                
                if (cacheAge < 5 * 60 * 1000) {
                    return { 
                        success: true, 
                        data: cachedData.data,
                        fromCache: true 
                    };
                }
            } catch (error) {
                console.warn('[Groups] Error reading cache:', error.message);
            }
        }
    }
    
    try {
        const apiEndpoint = endpoint.startsWith('http') ? endpoint : 
                           endpoint.startsWith('/api/') ? endpoint : 
                           `/api/${endpoint}`;
        
        const result = await secureApiCall(method, apiEndpoint, data, options);
        
        if (isGetRequest && result.success && result.data && cacheKey) {
            try {
                localStorage.setItem(cacheKey, JSON.stringify({
                    data: result.data,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.warn('[Groups] Error caching data:', error.message);
            }
        }
        
        return result;
    } catch (error) {
        console.warn('[Groups] API call error:', error.message);
        
        if (isGetRequest && cacheKey) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const cachedData = JSON.parse(cached);
                    return { 
                        success: true, 
                        data: cachedData.data,
                        fromCache: true,
                        isOffline: true
                    };
                } catch (e) {
                    // Cache is corrupted
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
// MAIN INITIALIZATION
// =============================================

/**
 * Initialize the group page with parent coordination and immediate UI rendering
 */
export async function initGroupPage() {
    if (isPageInitialized) return;
    
    isPageInitialized = true;
    
    try {
        // Initialize secure handshake first
        initializeSecureHandshake();
        
        loadCachedDataInstantly();
        initializeTokenSystem();
        
        // Setup basic UI listeners that don't require auth
        setTimeout(setupUIEventListeners, 100);
        setupResponsiveBehavior();
        
        // Check if we have session after a delay
        setTimeout(() => {
            if (parentConnection.handshakeComplete && parentConnection.sessionData) {
                // UI binding happens automatically via bindUIAfterSession()
            } else if (getCurrentUserLocal() && getUnifiedToken()) {
                enableProtectedUI();
                startBackgroundProcesses();
                showNotification('Using cached data. Reconnecting to server...', 'info');
            }
        }, 1000);
    } catch (error) {
        console.error('[Groups] Initialization error:', error.message);
        showNotification('Failed to initialize groups. Please refresh the page.', 'error');
    }
}

/**
 * Load user data in background with parent coordination
 */
export async function loadUserDataInBackground() {
    try {
        if (!parentConnection.handshakeComplete || !parentConnection.sessionData) {
            return;
        }
        
        const response = await safeApiCall('GET', '/api/auth/me', null, { silent: true });
        
        if (response && response.success && response.data) {
            currentUser = response.data;
            userData = {
                displayName: currentUser.displayName || currentUser.name || 'User',
                username: currentUser.username || null,
                email: currentUser.email || null,
                photoURL: currentUser.photoURL || currentUser.avatar || null
            };
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify({
                uid: currentUser.id || currentUser._id || currentUser.uid,
                displayName: currentUser.displayName || currentUser.name,
                email: currentUser.email,
                photoURL: currentUser.photoURL || currentUser.avatar
            }));
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_PROFILE, JSON.stringify(userData));
            
            updateUserUI();
        }
    } catch (error) {
        console.warn('[Groups] Background user data load error:', error.message);
    }
}

/**
 * Update UI with user data
 */
export function updateUserUI() {
    // Implementation depends on specific UI elements
}

/**
 * Setup UI event listeners
 */
export function setupUIEventListeners() {
    // Implementation depends on specific UI elements
}

/**
 * Setup responsive behavior
 */
export function setupResponsiveBehavior() {
    // Implementation depends on specific UI needs
}

// =============================================
// CORE GROUP FUNCTIONS
// =============================================

/**
 * Load cached data instantly on page load for immediate UI rendering
 */
export function loadCachedDataInstantly() {
    try {
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUPS);
        if (groupsData) {
            groups = JSON.parse(groupsData);
            isLoadedFromLocalStorage = true;
            updateGroupCounts();
        }
        
        const myGroupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.MY_GROUPS);
        if (myGroupsData) myGroups = JSON.parse(myGroupsData);
        
        const joinedData = localStorage.getItem(LOCAL_STORAGE_KEYS.JOINED_GROUPS);
        if (joinedData) joinedGroups = JSON.parse(joinedData);
        
        const invitesData = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_INVITES);
        if (invitesData) groupInvites = JSON.parse(invitesData);
        
        const adminData = localStorage.getItem(LOCAL_STORAGE_KEYS.ADMIN_GROUPS);
        if (adminData) adminGroups = JSON.parse(adminData);
        
        const cachedFriends = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) friends = JSON.parse(cachedFriends);
        
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USER_PROFILE) || '{}');
        }
        
        loadUniqueFeaturesData();
    } catch (error) {
        console.error('[Groups] Error in instant cache load:', error.message);
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
        console.error('[Groups] Error loading unique features data:', error.message);
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
            console.warn('Unknown group action:', action);
    }
}

// =============================================
// BACKGROUND SYNC FUNCTIONS
// =============================================

/**
 * Start controlled background sync (runs once per lifecycle)
 */
export function startBackgroundSync() {
    if (backgroundSyncRunning) {
        return;
    }
    
    if (!authReady) {
        return;
    }
    
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        return;
    }
    
    backgroundSyncRunning = true;
    
    setTimeout(() => {
        backgroundSyncWithServer();
    }, 2000);
    
    syncIntervalId = setInterval(() => {
        if (authReady && (parentConnection.handshakeComplete || getUnifiedToken())) {
            backgroundSyncWithServer();
        } else {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
            backgroundSyncRunning = false;
        }
    }, 30000);
    
    if (typeof processPendingOfflineActions === 'function') {
        processPendingOfflineActions();
    }
}

/**
 * Background sync with server for groups data
 */
export async function backgroundSyncWithServer() {
    if (!authReady) {
        return;
    }
    
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        return;
    }
    
    try {
        await syncGroupsFromServer();
        await syncGroupInvitesFromServer();
        await syncUniqueFeaturesData();
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
    } catch (error) {
        console.warn('[Groups] Background sync: Server appears to be unreachable:', error.message);
    }
}

// =============================================
// CHAT AND GROUP MANAGEMENT FUNCTIONS
// =============================================

/**
 * Open group chat panel
 * @param {Object} groupData - Group data
 */
export function openGroupChat(groupData) {
    try {
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
    } catch (error) {
        console.error('[Groups] Error opening group chat:', error.message);
        showNotification('Failed to open chat', 'error');
    }
}

/**
 * Update chat header with unique features
 * @param {Object} groupData - Group data
 */
export function updateChatHeaderUniqueFeatures(groupData) {
    try {
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
    } catch (error) {
        console.warn('[Groups] Error updating chat header features:', error.message);
    }
}

/**
 * Check posting rules and update UI accordingly
 * @param {Object} groupData - Group data
 */
export function checkPostingRules(groupData) {
    try {
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
    } catch (error) {
        console.warn('[Groups] Error checking posting rules:', error.message);
    }
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
        console.error('[Groups] Error loading group notes:', error.message);
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
                console.error('[Groups] Error parsing cached events:', e.message);
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
        console.error('[Groups] Error loading group events:', error.message);
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
                console.error('[Groups] Error parsing transparency log:', e.message);
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
        console.error('[Groups] Error loading transparency log:', error.message);
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
        console.error('[Groups] Error analyzing group energy:', error.message);
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
            console.error('[Groups] Error loading cached messages:', error.message);
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
        console.error('[Groups] Error loading messages from imported API:', error.message);
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
        console.error('[Groups] Error saving message to cache:', error.message);
    }
}

/**
 * Send group message using imported function
 */
export async function sendGroupMessageLocal() {
    try {
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
            throw new Error(response?.error || 'Failed to send message');
        }
        
        stopTypingIndicator();
    } catch (error) {
        console.error('[Groups] Error sending message:', error.message);
        showNotification('Failed to send message', 'error');
    }
}

/**
 * Toggle silent mode
 */
export function toggleSilentMode() {
    try {
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
    } catch (error) {
        console.warn('[Groups] Error toggling silent mode:', error.message);
    }
}

/**
 * Toggle anonymous mode
 */
export function toggleAnonymousMode() {
    try {
        isAnonymousMode = !isAnonymousMode;
        
        if (isAnonymousMode) {
            showNotification('Anonymous mode enabled', 'info');
        } else {
            showNotification('Anonymous mode disabled', 'success');
        }
        
        updateParticipationModeButtons();
    } catch (error) {
        console.warn('[Groups] Error toggling anonymous mode:', error.message);
    }
}

/**
 * Message reaction handler (exposed to window)
 * @param {string} messageId - Message ID
 * @param {HTMLElement} button - Button element
 */
export function reactToMessage(messageId, button) {
    try {
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const reaction = reactions[Math.floor(Math.random() * reactions.length)];
        
        showNotification(`Reacted with ${reaction}`, 'success');
        
        button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
        button.style.color = '#FF9800';
    } catch (error) {
        console.warn('[Groups] Error reacting to message:', error.message);
    }
}

/**
 * Message reply handler (exposed to window)
 * @param {string} messageId - Message ID
 * @param {string} senderName - Sender name
 */
export function replyToMessage(messageId, senderName) {
    try {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = `@${senderName} `;
            chatInput.focus();
            showNotification(`Replying to ${senderName}`, 'info');
        }
    } catch (error) {
        console.warn('[Groups] Error replying to message:', error.message);
    }
}

/**
 * Message delete handler (exposed to window)
 * @param {string} messageId - Message ID
 */
export function deleteMessage(messageId) {
    try {
        if (confirm('Are you sure you want to delete this message?')) {
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
            showNotification('Message deleted', 'success');
        }
    } catch (error) {
        console.warn('[Groups] Error deleting message:', error.message);
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
    try {
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
    } catch (error) {
        console.error('[Groups] Error opening admin management:', error.message);
        showNotification('Failed to open management panel', 'error');
    }
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
        console.error('[Groups] Error loading members:', error.message);
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
        console.error('[Groups] Error performing member action:', error.message);
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
        console.error('[Groups] Error logging transparency action:', error.message);
    }
}

/**
 * Load group settings for management
 * @param {Object} groupData - Group data
 */
export function loadGroupSettingsForManagement(groupData) {
    try {
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
    } catch (error) {
        console.warn('[Groups] Error loading group settings:', error.message);
    }
}

/**
 * Load unique features for management
 * @param {Object} groupData - Group data
 */
export function loadUniqueFeaturesForManagement(groupData) {
    try {
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
    } catch (error) {
        console.warn('[Groups] Error loading unique features:', error.message);
    }
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
        console.error('[Groups] Error saving group settings:', error.message);
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
    try {
        selectedFriends = selectedFriends.filter(id => id !== friendId);
        updateSelectedFriendsList();
        
        const friendItem = document.querySelector(`.friend-item[data-friend-id="${friendId}"]`);
        if (friendItem) {
            const checkbox = friendItem.querySelector('.friend-checkbox');
            checkbox.classList.remove('selected');
            checkbox.querySelector('i').style.display = 'none';
        }
    } catch (error) {
        console.warn('[Groups] Error removing selected friend:', error.message);
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
        console.error('[Groups] Error creating group:', error.message);
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
        console.error('[Groups] Error joining group:', error.message);
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
        console.error('[Groups] Error leaving group:', error.message);
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
        console.error('[Groups] Error accepting group invite:', error.message);
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
        console.error('[Groups] Error declining group invite:', error.message);
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
    try {
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
    } catch (error) {
        console.error('[Groups] Error showing group details:', error.message);
        showNotification('Failed to load group details', 'error');
    }
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
        console.error('[Groups] Error loading group details:', error.message);
        detailsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading group details</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

// =============================================
// DATA SYNC FUNCTIONS
// =============================================

/**
 * Sync groups from server with cache fallback using imported API
 */
export async function syncGroupsFromServer() {
    if (!authReady) return;
    
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
        return;
    }
    
    try {
        const response = await getGroups();
        
        if (!response || !response.success || !response.data) {
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
        console.warn('[Groups] Group sync error:', error.message);
    }
}

/**
 * Sync group invites from server using imported API
 */
export async function syncGroupInvitesFromServer() {
    if (!authReady) return;
    
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
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
            groupInvites = serverInvites;
            localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_INVITES, JSON.stringify(groupInvites));
            
            const invitesCountEl = document.getElementById('invitesCount');
            const invitesSectionCountEl = document.getElementById('invitesSectionCount');
            if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
            if (invitesSectionCountEl) invitesSectionCountEl.textContent = groupInvites.length;
        }
    } catch (error) {
        console.warn('[Groups] Group invites sync error:', error.message);
    }
}

/**
 * Sync unique features data from server using imported APIs
 */
export async function syncUniqueFeaturesData() {
    if (!authReady) return;
    
    if (!parentConnection.handshakeComplete && !getUnifiedToken()) {
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
        console.warn('[Groups] Unique features sync error:', error.message);
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
    } catch (error) {
        console.error('[Groups] Error saving groups to local storage:', error.message);
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
            // Process pending actions
        }
    } catch (error) {
        console.error('[Groups] Error processing pending offline actions:', error.message);
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