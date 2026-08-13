/**
 * GROUP CORE — OPERATIONS
 * API/token gateway, group/member/admin business logic, chat send+receive,
 * friend selection, group CRUD, and server sync.
 *
 * This file is one of three cooperating modules that together replace the
 * former single group-core.js (9,361 lines). It is a real, independently
 * loadable ES module — not an arbitrary text slice — with explicit imports
 * and exports wiring it to the other two.
 *
 * Files: group-core-bootstrap.js -> group-core-operations.js -> group-core-bridge.js
 */

import {
    DEBUG,
    GroupCore,
    LifecycleState,
    MODULE_NAME,
    MODULE_VERSION,
    SafeStorage,
    adminGroups,
    apiRequest,
    currentChatGroup,
    currentUser,
    debugLog,
    groupInvites,
    groups,
    isMobile,
    joinedGroups,
    moduleInitialized,
    myGroups,
    requestSession,
    safeSend,
    selectedGroup,
    sendChildReady,
    session,
    sessionReady,
    sessionReceived,
    setAdminGroups,
    setAuthCheckComplete,
    setAuthReady,
    setCurrentChatGroup,
    setGroupInvites,
    setGroups,
    setJoinedGroups,
    setModuleInitialized,
    setMyGroups,
    setSelectedGroup
} from './group-core-bootstrap.js';
import {
    isGroupOperationReady,
    showGroupOptions,
    updateCurrentSection
} from './group-core-bridge.js';

function updateGroupThemeOnSettingChange(theme) {
    try {
        // Update any open group chat header
        if (currentChatGroup) {
            const themeInfo = groupThemes[theme === 'dark' ? 'dark' : 'blue'];
            const chatAvatar = safeGetElement('#chatAvatar');
            if (chatAvatar && themeInfo) {
                chatAvatar.style.background = themeInfo.gradient;
            }
        }
        
        // Update all group avatars in lists
        document.querySelectorAll('.group-avatar').forEach(avatar => {
            const groupItem = avatar.closest('.group-item');
            if (groupItem && groupItem.dataset.groupId) {
                const group = GroupCore.getGroupById(groupItem.dataset.groupId);
                if (group && group.theme) {
                    const groupThemeInfo = groupThemes[group.theme] || groupThemes.blue;
                    avatar.style.background = groupThemeInfo.gradient;
                }
            }
        });
    } catch (error) {
        debugLog('Error updating group theme:', error);
    }
}

// =============================================
// INITIALIZATION SEQUENCE - DETERMINISTIC PROTOCOL
// =============================================
function initializeModule() {
  // STRICT: Prevent duplicate initialization - CRITICAL FIX
  if (moduleInitialized) {
    console.warn(`[${MODULE_NAME}] ⚠️ Duplicate initialization prevented`);
    return;
  }
  if (LifecycleState.isInitialized()) {
    console.warn(`[${MODULE_NAME}] ⚠️ Already initialized`);
    return;
  }
  if (LifecycleState.getState() !== LifecycleState.STATES.BOOT) {
    console.warn(`[${MODULE_NAME}] ⚠️ Cannot initialize - not in BOOT state (current: ${LifecycleState.getState()})`);
    return;
  }
  setModuleInitialized(true);
  LifecycleState.setInitialized();
  console.log(`[${MODULE_NAME}] Initializing - Version ${MODULE_VERSION}`);

  // STRICT: Transition to INITIALIZING
  LifecycleState.setState(LifecycleState.STATES.INITIALIZING);
  console.log(`[${MODULE_NAME}] State: BOOT → INITIALIZING`);

  // Initialize core dependencies synchronously
  if (typeof initCoreDependencies === 'function') {
    initCoreDependencies();
  }

  // STRICT: Transition to READY
  LifecycleState.setState(LifecycleState.STATES.READY);
  console.log(`[${MODULE_NAME}] State: INITIALIZING → READY`);

  // STRICT: Send CHILD_READY exactly once (transitions to WAIT_PARENT)
  sendChildReady();

  // STRICT: No retry mechanism - WAIT_PARENT is a hard wait state
  console.log(`[${MODULE_NAME}] WAIT_PARENT - waiting for parent ready`);
}

function initCoreDependencies() {
    // Initialize any core dependencies synchronously
    debugLog('Initializing core dependencies');
}

const SECURITY_CONFIG = {
    MAX_STRING_LENGTH: 10000,
    MAX_ARRAY_LENGTH: 1000,
    ALLOWED_PROTOCOLS: ['http:', 'https:', 'ws:', 'wss:'],
    BLOCKED_PATTERNS: [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /onclick/i,
        /onerror/i,
        /onload/i,
        /onmouseover/i,
        /<script/i,
        /<\/script/i
    ]
};

function validateInput(input, maxLength = SECURITY_CONFIG.MAX_STRING_LENGTH) {
    if (input === null || input === undefined) return '';
    
    const str = String(input);
    if (str.length > maxLength) {
        return str.substring(0, maxLength);
    }
    
    for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS) {
        if (pattern.test(str)) {
            return '';
        }
    }
    
    return str;
}

function safeGetElement(selector) {
    try {
        if (!selector || typeof selector !== 'string') return null;
        return document.querySelector(selector);
    } catch (error) {
        return null;
    }
}

const STATUS_MACHINE = (function() {
    'use strict';
    
    const shownStatuses = new Set();
    const lastState = new Map();
    
    const symbols = {
        'INIT': '🚀',
        'SENDING': '📤',
        'WAITING': '⏳',
        'SUCCESS': '✅',
        'FAILED': '❌',
        'READY': '🔵',
        'WARNING': '⚠️',
        'iframe-state': '📱',
        'registration': '📋',
        'session': '🔐'
    };
    
    const colors = {
        'INIT': '#aaa',
        'SENDING': '#33b5e5',
        'WAITING': '#ff8800',
        'SUCCESS': '#00C851',
        'FAILED': '#ff4444',
        'READY': '#0099CC',
        'WARNING': '#ffbb33'
    };
    
    return {
        log: function(context, status, details = '') {
            const key = `${context}:${status}`;
            
            const prev = lastState.get(context);
            if (prev === status) return;
            
            if (shownStatuses.has(key)) return;
            
            lastState.set(context, status);
            shownStatuses.add(key);
            
            const symbol = symbols[status] || symbols[context] || '•';
            
            if (DEBUG || status === 'INIT' || status === 'SUCCESS' || status === 'FAILED') {
                console.log(
                    `%c${symbol} ${status}${details ? ` ${details}` : ''}`,
                    `color: ${colors[status] || colors[context] || '#aaa'}; font-weight: bold;`
                );
            }
        }
    };
})();

window.__STATUS_MACHINE = STATUS_MACHINE;

const groupActionQueue = [];

let isProcessingQueue = false;

// FIX (idempotency): every queued mutation gets one stable id that survives
// re-queue/retry, so the same tap can never be sent to the server twice even
// if processGroupActionQueue() runs again before the first attempt settles
// (e.g. offline -> reconnect -> immediate retry).
let _groupOpSeq = 0;
function _makeOpId() {
    try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
    } catch (_) {}
    return `gop_${Date.now()}_${++_groupOpSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

// FIX: ids of actions that have already been sent to GroupCore, so a
// duplicate queueGroupAction() call (or a re-entrant flush) can't fire the
// same mutation twice — closes the "Hello / Hello" duplicate-send case.
const _dispatchedGroupOpIds = new Set();

function queueGroupAction(action) {
    if (action && typeof action === 'object' && !action.opId) {
        action.opId = _makeOpId();
    }
    if (action && typeof action === 'object') {
        action._retries = action._retries || 0;
    }
    groupActionQueue.push(action);
    
    if (!isProcessingQueue && LifecycleState.isActive() && sessionReady) {
        processGroupActionQueue();
    }
}

// FIX: run a queued action's actual network call, returning the promise so
// the caller can react to success/failure instead of the failure vanishing.
function _dispatchGroupAction(action) {
    switch (action.type) {
        case 'createGroup':
            return GroupCore.createGroup(action.data);
        case 'updateGroup':
            return GroupCore.updateGroup(action.groupId, action.data);
        case 'deleteGroup':
            return GroupCore.deleteGroup(action.groupId);
        case 'addMember':
            return GroupCore.addMember(action.groupId, action.userId, action.role);
        case 'removeMember':
            return GroupCore.removeMember(action.groupId, action.userId);
        case 'leaveGroup':
            return GroupCore.leaveGroup(action.groupId);
        case 'promoteToAdmin':
            return GroupCore.promoteToAdmin(action.groupId, action.userId);
        case 'demoteFromAdmin':
            return GroupCore.demoteFromAdmin(action.groupId, action.userId);
        case 'sendJoinRequest':
            return GroupCore.sendJoinRequest(action.groupId, action.message);
        case 'approveJoinRequest':
            return GroupCore.approveJoinRequest(action.groupId, action.requestId, action.userId);
        case 'rejectJoinRequest':
            return GroupCore.rejectJoinRequest(action.groupId, action.requestId, action.userId);
        case 'sendMessage':
            if (action.groupId && action.content) {
                return GroupCore.sendGroupMessage(action.groupId, action.content, action.topic, action.anonymous, action.clientMessageId || action.opId);
            }
            if (action.fn && typeof action.fn === 'function') {
                return Promise.resolve(action.fn());
            }
            return Promise.resolve();
        case 'joinGroup':
            if (action.groupId) {
                return GroupCore.sendJoinRequest(action.groupId, '');
            }
            return Promise.resolve();
        case 'changeMemberRole':
            if (action.groupId && action.userId && action.role === 'admin') {
                return GroupCore.promoteToAdmin(action.groupId, action.userId);
            } else if (action.groupId && action.userId) {
                return GroupCore.demoteFromAdmin(action.groupId, action.userId);
            }
            return Promise.resolve();
        default:
            return Promise.resolve();
    }
}

const GROUP_ACTION_LABELS = {
    createGroup: 'Create group', updateGroup: 'Update group', deleteGroup: 'Delete group',
    addMember: 'Add member', removeMember: 'Remove member', leaveGroup: 'Leave group',
    promoteToAdmin: 'Promote to admin', demoteFromAdmin: 'Remove admin',
    sendJoinRequest: 'Join request', approveJoinRequest: 'Approve request',
    rejectJoinRequest: 'Reject request', sendMessage: 'Send message', joinGroup: 'Join group',
    changeMemberRole: 'Change role'
};
const GROUP_ACTION_MAX_RETRIES = 2;

function processGroupActionQueue() {
    if (isProcessingQueue) return;
    if (groupActionQueue.length === 0) return;
    
    if (!LifecycleState.isActive() || !sessionReady) {
        return;
    }
    
    isProcessingQueue = true;
    
    const actions = [...groupActionQueue];
    groupActionQueue.length = 0;
    
    actions.forEach(action => {
        try {
            if (typeof action === 'function') {
                action();
                return;
            }
            if (!action || !action.type) return;

            // FIX (idempotency): skip an action id we've already dispatched
            // instead of sending the same mutation to the server again.
            if (action.opId && _dispatchedGroupOpIds.has(action.opId)) {
                return;
            }
            if (action.opId) _dispatchedGroupOpIds.add(action.opId);

            const result = _dispatchGroupAction(action);
            if (result && typeof result.catch === 'function') {
                result.catch(() => {
                    // FIX: a failed queued mutation used to vanish silently.
                    // Retry a bounded number of times, then surface it.
                    if (action.opId) _dispatchedGroupOpIds.delete(action.opId);
                    action._retries = (action._retries || 0) + 1;
                    if (action._retries <= GROUP_ACTION_MAX_RETRIES) {
                        groupActionQueue.push(action);
                        if (!isProcessingQueue && LifecycleState.isActive() && sessionReady) {
                            setTimeout(() => processGroupActionQueue(), 1000 * action._retries);
                        }
                    } else {
                        const label = GROUP_ACTION_LABELS[action.type] || 'Group action';
                        if (typeof reportGroupActionFailure === 'function') {
                            reportGroupActionFailure(label, () => {
                                action._retries = 0;
                                queueGroupAction(action);
                            });
                        }
                    }
                });
            }
        } catch (e) {}
    });
    
    isProcessingQueue = false;
    
    if (groupActionQueue.length > 0) {
        processGroupActionQueue();
    }
}

function safeArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    if (typeof v === 'object' && Array.isArray(v.data)) return v.data;
    return [];
}

function safeObject(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
}

let currentTypeFilter = 'all';

let currentSearchTerm = '';

let isLoadedFromLocalStorage = false;

let pendingGroupActions = [];

let offlineOverlayDismissed = false;

let friends = [];

let selectedFriends = [];

let groupMessages = {};

let groupUnreadCounts = {};

let groupTypingUsers = {};

const groupPurposes = Object.freeze({
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
});

const groupMoods = Object.freeze({
    'calm': { name: 'Calm', icon: '😌', color: '#1976d2', bgColor: '#e3f2fd' },
    'busy': { name: 'Busy', icon: '🏃', color: '#f57c00', bgColor: '#fff3e0' },
    'celebratory': { name: 'Celebratory', icon: '🎉', color: '#c2185b', bgColor: '#fce4ec' },
    'silent': { name: 'Silent', icon: '🔇', color: '#616161', bgColor: '#f5f5f5' },
    'urgent': { name: 'Urgent', icon: '🚨', color: '#d32f2f', bgColor: '#ffebee' }
});

const postingRules = Object.freeze({
    'everyone': { name: 'Everyone can post', color: '#4CAF50', bgColor: '#E8F5E9' },
    'admin_only': { name: 'Admin-only posting', color: '#FF9800', bgColor: '#FFF3E0' },
    'scheduled': { name: 'Scheduled posting times', color: '#2196F3', bgColor: '#E3F2FD' },
    'quiet_hours': { name: 'Quiet hours enabled', color: '#9C27B0', bgColor: '#F3E5F5' }
});

const participationModes = Object.freeze({
    'read_only': { name: 'Read Only', icon: '👁️', color: '#666', bgColor: '#F5F5F5' },
    'react_only': { name: 'React Only', icon: '👍', color: '#1976D2', bgColor: '#E3F2FD' },
    'anonymous': { name: 'Anonymous', icon: '🕵️', color: '#7B1FA2', bgColor: '#F3E5F5' }
});

const groupTopics = Object.freeze({
    'announcement': { name: 'Announcement', icon: '📢', color: '#1976d2', bgColor: '#e3f2fd' },
    'question': { name: 'Question', icon: '❓', color: '#7b1fa2', bgColor: '#f3e5f5' },
    'discussion': { name: 'Discussion', icon: '💬', color: '#2e7d32', bgColor: '#e8f5e8' }
});

const groupTypes = Object.freeze({
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
});

const groupThemes = Object.freeze({
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
});

const groupRoles = Object.freeze({
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
});

let chatMessagesList = [];

let isTyping = false;

let callInProgress = false;

let callStartTime = null;

let callTimer = null;

let localStream = null;

let peerConnections = {};

let currentParticipationMode = 'normal';

let isSilentMode = false;

let isAnonymousMode = false;

let groupNotes = {};

let groupEvents = {};

let transparencyLog = [];

let energySuggestions = [];

const LOCAL_STORAGE_KEYS = Object.freeze({
    GROUPS: 'knecta_groups',
    MY_GROUPS: 'knecta_my_groups',
    JOINED_GROUPS: 'knecta_joined_groups',
    GROUP_INVITES: 'knecta_group_invites',
    ADMIN_GROUPS: 'knecta_admin_groups',
    LAST_SYNC: 'knecta_groups_last_sync',
    PENDING_ACTIONS: 'knecta_pending_group_actions',
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
    GROUP_UNREAD: 'knecta_group_unread_'
    
    // REMOVED: USER, USER_PROFILE, USER_TOKEN, API_BASE - these must come from parent session
});

const API_WRAPPER = {
    _ready: false,
    _readyPromise: null,
    _readyResolve: null,
    _pendingCalls: [],
    _stats: {
        total: 0,
        success: 0,
        failed: 0,
        retried: 0,
        cached: 0
    },
    _cache: new Map(),
    _cacheTTL: 5 * 60 * 1000,
    _maxRetries: 1,
    _retryDelay: 1000,
    _initialized: false,
    
    init() {
        if (this._initialized) return this;
        
        this._readyPromise = new Promise((resolve) => {
            this._readyResolve = resolve;
        });
        
        this._checkAPICore();
        this._initialized = true;
        
        return this;
    },
    
    _checkAPICore() {
        // Check synchronously without setInterval
        if (window.__API_CORE__ && window.__API_CORE__.isReady()) {
            this._ready = true;
            this._readyResolve(window.__API_CORE__);
            this._processPendingCalls();
        } else {
            // If not ready, mark as ready with null (no fallback)
            this._ready = true;
            this._readyResolve(null);
            
            if (this._pendingCalls.length > 0) {
                this._processPendingCallsDegraded();
            }
        }
    },
    
    async whenReady() {
        if (this._ready) return window.__API_CORE__;
        return this._readyPromise;
    },
    
    isReady() {
        return this._ready;
    },
    
    _processPendingCalls() {
        if (this._pendingCalls.length === 0) return;
        
        const pending = [...this._pendingCalls];
        this._pendingCalls = [];
        
        pending.forEach(call => {
            this.request(call.endpoint, call.options)
                .then(call.resolve)
                .catch(call.reject);
        });
    },
    
    _processPendingCallsDegraded() {
        if (this._pendingCalls.length === 0) return;
        
        const pending = [...this._pendingCalls];
        this._pendingCalls = [];
        
        pending.forEach(call => {
            const cacheKey = this._getCacheKey(call.endpoint, call.options);
            const cached = this._getCached(cacheKey);
            
            if (cached) {
                call.resolve({
                    success: true,
                    data: cached,
                    fromCache: true,
                    degraded: true
                });
            } else {
                call.resolve({
                    success: false,
                    status: 'degraded',
                    message: 'API core not available',
                    fromCache: false
                });
            }
        });
    },
    
    _getCacheKey(endpoint, options = {}) {
        const method = options.method || 'GET';
        return `${method}:${endpoint}`;
    },
    
    _setCached(key, data) {
        try {
            this._cache.set(key, {
                data,
                timestamp: Date.now()
            });
            
            if (this._cache.size > 100) {
                const oldestKey = this._cache.keys().next().value;
                this._cache.delete(oldestKey);
            }
        } catch (error) {}
    },
    
    _getCached(key) {
        const cached = this._cache.get(key);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > this._cacheTTL) {
            this._cache.delete(key);
            return null;
        }
        
        return cached.data;
    },
    
    async request(endpoint, options = {}) {
        this._stats.total++;
        
        // Check session readiness
        if (!sessionReady || !session.token) {
            if (options.method === 'GET') {
                const cacheKey = this._getCacheKey(endpoint, options);
                const cached = this._getCached(cacheKey);
                if (cached) {
                    this._stats.cached++;
                    return {
                        success: true,
                        data: cached,
                        fromCache: true,
                        stale: true
                    };
                }
            }
            
            return {
                success: false,
                status: 'no_session',
                message: 'Session not ready',
                fromCache: false
            };
        }
        
        if (endpoint && (endpoint.startsWith('http://') || endpoint.startsWith('https://'))) {
            return {
                success: false,
                status: 'error',
                message: 'Absolute URLs not allowed',
                fromCache: false
            };
        }
        
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const method = options.method || 'GET';
        const cacheKey = this._getCacheKey(cleanEndpoint, options);
        
        if (method === 'GET' && !options.skipCache) {
            const cached = this._getCached(cacheKey);
            if (cached) {
                this._stats.cached++;
                return {
                    success: true,
                    data: cached,
                    fromCache: true
                };
            }
        }
        
        try {
            const response = await apiRequest(cleanEndpoint, method, options.body);
            
            if (response && response.success) {
                this._stats.success++;
                
                if (method === 'GET' && response.data) {
                    this._setCached(cacheKey, response.data);
                }
                
                return response;
            }
            
            this._stats.failed++;
            return {
                success: false,
                status: 'error',
                message: response?.error || 'API request failed',
                fromCache: false
            };
        } catch (error) {
            this._stats.failed++;
            return {
                success: false,
                status: 'error',
                message: error.message || 'Network error',
                fromCache: false
            };
        }
    },
    
    getStats() {
        return { ...this._stats };
    },
    
    clearCache() {
        this._cache.clear();
        this._stats.cached = 0;
    }
};

API_WRAPPER.init();

async function secureApiCall(endpoint, options = {}) {
    try {
        if (!options.skipReadyCheck) {
            await API_WRAPPER.whenReady();
        }
        
        // Check session readiness
        if (!sessionReady || !session.token) {
            return {
                success: false,
                status: 'no_session',
                message: 'Session not ready',
                fromCache: false
            };
        }
        
        const response = await API_WRAPPER.request(endpoint, {
            timeout: options.timeout || 45000,
            retry: 2,
            ...options
        });
        
        return response;
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: error.message || 'Network error',
            fromCache: false
        };
    }
}

async function safeApiCall(endpoint, options = {}) {
    return secureApiCall(endpoint, options);
}

let tokenQueue = [];

let isProcessingTokenQueue = false;

let tokenReadyPromise = null;

let tokenReadyResolve = null;

let tokenReadyReject = null;

let apiInitialized = false;

let isPageInitialized = false;

let __PARENT_READY__ = false;

let __HANDSHAKE_COMPLETE__ = false;

let __SESSION_REQUEST_PENDING__ = false;

let handshakeInProgress = false;

let handshakeAttempts = 0;

function initializeTokenSystem() {
  try {
    tokenReadyPromise = new Promise((resolve, reject) => {
      tokenReadyResolve = resolve;
      tokenReadyReject = reject;
    });

    // DO NOT check localStorage for token - must come from parent
    // Just resolve with null and wait for parent session
    if (tokenReadyResolve) {
      tokenReadyResolve(null);
      setAuthCheckComplete(true);
    }
  } catch (error) {}
}

async function waitForTokenReady() {
  try {
    // Check session memory first
    if (session.token) {
      setAuthReady(true);
      setAuthCheckComplete(true);
      return session.token;
    }
    if (tokenReadyPromise) {
      return await tokenReadyPromise;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function getUnifiedToken() {
    // Only return from session memory, never from localStorage
    return session.token || null;
}

function saveUnifiedToken(token) {
    // NO-OP - tokens must only come from parent
    // This function exists for backward compatibility but does nothing
    debugLog('saveUnifiedToken called but ignored - tokens must come from parent');
}

function getCurrentUserLocal() {
    // Return from session memory, not localStorage
    return session.user || currentUser || null;
}

function getCurrentUser() {
    return getCurrentUserLocal();
}

function queueApiCall(apiCallFunction) {
    return new Promise(async (resolve, reject) => {
        try {
            const queuedCall = {
                fn: apiCallFunction,
                resolve,
                reject,
                timestamp: Date.now()
            };
            
            tokenQueue.push(queuedCall);
            
            if (tokenQueue.length > SECURITY_CONFIG.MAX_ARRAY_LENGTH) {
                tokenQueue.shift();
            }
            
            if (!isProcessingTokenQueue) {
                processTokenQueue();
            }
        } catch (error) {
            reject(error);
        }
    });
}

async function processTokenQueue() {
    if (isProcessingTokenQueue || tokenQueue.length === 0) return;
    
    isProcessingTokenQueue = true;
    
    try {
        const token = session.token; // Get from session, not waitForTokenReady
        
        if (!token) {
            const callsToProcess = [...tokenQueue];
            tokenQueue.length = 0;
            
            for (const call of callsToProcess) {
                try {
                    call.reject(new Error('No authentication token available'));
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
        tokenQueue.forEach(call => {
            call.reject(error);
        });
        tokenQueue.length = 0;
    } finally {
        isProcessingTokenQueue = false;
    }
}

function getUserRoleInGroup(groupData, userId) {
    if (!groupData || !userId) return null;
    
    if (groupData.createdBy === userId) return 'creator';
    
    const member = groupData.members?.find(m => m.userId === userId);
    return member ? member.role : null;
}

function isUserAdmin(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

function canUserManageGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

function canUserAddMembers(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && (m.role === 'admin' || m.role === 'moderator'));
}

function canUserRemoveMembers(groupData, userId, targetUserId) {
    if (!groupData || !userId || !targetUserId) return false;
    
    if (groupData.createdBy === targetUserId) return false;
    
    if (groupData.createdBy === userId) return true;
    
    const userRole = getUserRoleInGroup(groupData, userId);
    const targetRole = getUserRoleInGroup(groupData, targetUserId);
    
    if (userRole === 'admin') {
        return targetRole !== 'admin' && targetRole !== 'creator';
    }
    
    if (userRole === 'moderator') {
        return targetRole === 'member';
    }
    
    return false;
}

function canUserChangeRole(groupData, userId, targetUserId) {
    if (!groupData || !userId || !targetUserId) return false;
    
    if (groupData.createdBy === targetUserId) return false;
    
    if (groupData.createdBy === userId) return true;
    
    return false;
}

function canUserDeleteGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId;
}

function addMemberToGroup(groupId, userId, role = 'member') {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserAddMembers(group, currentUser?.uid || currentUser?.id)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        group.members = [];
    }
    
    if (group.members.some(m => m.userId === userId)) {
        return { success: false, reason: 'already_member' };
    }
    
    const newMember = {
        userId,
        role,
        joinedAt: Date.now()
    };
    
    group.members.push(newMember);
    group.memberCount = group.members.length;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_ADDED', {
        groupId: group.id,
        member: newMember,
        timestamp: Date.now()
    });
    
    return { success: true, member: newMember };
}

function removeMemberFromGroup(groupId, userId) {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserRemoveMembers(group, currentUser?.uid || currentUser?.id, userId)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        return { success: false, reason: 'no_members' };
    }
    
    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) {
        return { success: false, reason: 'not_member' };
    }
    
    const removedMember = group.members[memberIndex];
    group.members.splice(memberIndex, 1);
    group.memberCount = group.members.length;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_REMOVED', {
        groupId: group.id,
        userId,
        removedMember,
        timestamp: Date.now()
    });
    
    return { success: true };
}

function changeMemberRole(groupId, userId, newRole) {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserChangeRole(group, currentUser?.uid || currentUser?.id, userId)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        return { success: false, reason: 'no_members' };
    }
    
    const member = group.members.find(m => m.userId === userId);
    if (!member) {
        return { success: false, reason: 'not_member' };
    }
    
    const oldRole = member.role;
    member.role = newRole;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_ROLE_CHANGED', {
        groupId: group.id,
        userId,
        oldRole,
        newRole,
        timestamp: Date.now()
    });
    
    return { success: true };
}

function deleteGroup(groupId) {
  const group = groups.find(g => g.id === groupId) || myGroups.find(g => g.id === groupId) || adminGroups.find(g => g.id === groupId);
  if (!group) return {
    success: false,
    reason: 'group_not_found'
  };
  if (!canUserDeleteGroup(group, currentUser?.uid || currentUser?.id)) {
    return {
      success: false,
      reason: 'permission_denied'
    };
  }
  setGroups(groups.filter(g => g.id !== groupId));
  setMyGroups(myGroups.filter(g => g.id !== groupId));
  setAdminGroups(adminGroups.filter(g => g.id !== groupId));
  setJoinedGroups(joinedGroups.filter(g => g.id !== groupId));
  setGroupInvites(groupInvites.filter(invite => invite.groupId !== groupId && invite.id !== groupId));
  delete groupMessages[groupId];
  delete groupUnreadCounts[groupId];
  try {
    SafeStorage.removeItem(`group_messages_${groupId}`);
    SafeStorage.removeItem(`group_unread_${groupId}`);
  } catch (e) {}
  GroupCore.saveGroups();
  if (LifecycleState.isActive()) {
    if (currentChatGroup && currentChatGroup.id === groupId) {
      if (typeof closeGroupChatMobile === 'function') {
        closeGroupChatMobile();
      }
      setCurrentChatGroup(null);
    }
  }

  // Use safeSend for parent communication
  safeSend('GROUP_DELETED', {
    groupId,
    timestamp: Date.now()
  });
  return {
    success: true
  };
}

function updateGroupInAllLists(updatedGroup) {
    const groupIndex = groups.findIndex(g => g.id === updatedGroup.id);
    if (groupIndex !== -1) {
        groups[groupIndex] = updatedGroup;
    }
    
    const myIndex = myGroups.findIndex(g => g.id === updatedGroup.id);
    if (myIndex !== -1) {
        myGroups[myIndex] = updatedGroup;
    }
    
    const adminIndex = adminGroups.findIndex(g => g.id === updatedGroup.id);
    if (adminIndex !== -1) {
        adminGroups[adminIndex] = updatedGroup;
    }
    
    const joinedIndex = joinedGroups.findIndex(g => g.id === updatedGroup.id);
    if (joinedIndex !== -1) {
        joinedGroups[joinedIndex] = updatedGroup;
    }
}

// FIX: report failure to the user instead of swallowing it silently, and
// give them a one-tap retry that re-enters the same online/offline path.
function reportGroupActionFailure(actionLabel, retryFn) {
    try {
        showNotification(`${actionLabel} failed. Tap to retry.`, 'error');
        const notification = safeGetElement('#notification');
        if (notification && typeof retryFn === 'function') {
            const retryOnce = () => {
                notification.removeEventListener('click', retryOnce);
                try { retryFn(); } catch (_) {}
            };
            notification.addEventListener('click', retryOnce, { once: true });
        }
    } catch (_) {}
}

const addMemberOnline = async function(groupId, userId, role = 'member') {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'addMember', groupId, userId, role });
        return;
    }
    
    GroupCore.addMember(groupId, userId, role).catch(() => {
        reportGroupActionFailure('Add member', () => addMemberOnline(groupId, userId, role));
    });
};

const removeMemberOnline = async function(groupId, userId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'removeMember', groupId, userId });
        return;
    }
    
    GroupCore.removeMember(groupId, userId).catch(() => {
        reportGroupActionFailure('Remove member', () => removeMemberOnline(groupId, userId));
    });
};

const changeMemberRoleOnline = async function(groupId, userId, role) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'changeMemberRole', groupId, userId, role });
        return;
    }
    
    if (role === 'admin') {
        GroupCore.promoteToAdmin(groupId, userId).catch(() => {
            reportGroupActionFailure('Promote to admin', () => changeMemberRoleOnline(groupId, userId, role));
        });
    } else {
        GroupCore.demoteFromAdmin(groupId, userId).catch(() => {
            reportGroupActionFailure('Remove admin', () => changeMemberRoleOnline(groupId, userId, role));
        });
    }
};

const deleteGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'deleteGroup', groupId });
        return;
    }
    
    GroupCore.deleteGroup(groupId).catch(() => {
        reportGroupActionFailure('Delete group', () => deleteGroupOnline(groupId));
    });
};

function escapeGroupChatHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeGroupChatAttribute(value) {
    return escapeGroupChatHTML(value).replace(/`/g, '&#96;');
}

function getCurrentGroupUserId() {
    return String(session.user?.uid || session.user?.id || '');
}

function normalizeMembersPayload(raw) {
    if (Array.isArray(raw)) {
        return { members: raw, pagination: { totalMembers: raw.length } };
    }
    
    if (raw && Array.isArray(raw.members)) {
        return {
            members: raw.members,
            pagination: raw.pagination || { totalMembers: raw.members.length }
        };
    }
    
    return { members: [], pagination: { totalMembers: 0 } };
}

function getGroupMemberCount(groupData, membersPayload = null) {
    if (membersPayload?.pagination?.totalMembers !== undefined) {
        return Number(membersPayload.pagination.totalMembers) || 0;
    }
    if (Array.isArray(groupData?.members)) {
        return groupData.members.length;
    }
    if (groupData?.memberCount !== undefined) {
        return Number(groupData.memberCount) || 0;
    }
    if (groupData?.stats?.totalMembers !== undefined) {
        return Number(groupData.stats.totalMembers) || 0;
    }
    return 0;
}

function normalizeGroupMessage(messageData, fallbackGroupId = null) {
    if (!messageData) return null;
    
    const metadata = messageData.metadata || {};
    const attachment = metadata.attachment || messageData.attachment || null;
    const sender = messageData.sender || {};
    const createdAt = messageData.createdAt || messageData.timestamp || messageData.sentAt || new Date().toISOString();
    
    return {
        ...messageData,
        id: messageData.id || messageData.localId || messageData.clientRequestId || `temp_${Date.now()}`,
        groupId: messageData.groupId || fallbackGroupId || currentChatGroup?.id || null,
        senderId: messageData.senderId || sender.id || messageData.userId || null,
        senderName: messageData.senderName || sender.displayName || sender.username || 'User',
        senderAvatar: messageData.senderAvatar || sender.avatar || metadata.senderAvatar || null,
        content: messageData.content || metadata.caption || '',
        type: messageData.type || attachment?.type || 'text',
        topic: messageData.topic || metadata.topic || null,
        anonymous: Boolean(messageData.anonymous),
        createdAt,
        timestamp: createdAt,
        deliveredAt: messageData.deliveredAt || metadata.deliveredAt || null,
        isRead: Boolean(messageData.isRead || metadata.isRead),
        mediaUrl: messageData.mediaUrl || attachment?.url || metadata.mediaUrl || metadata.url || null,
        thumbnailUrl: messageData.thumbnailUrl || attachment?.thumbnailUrl || metadata.thumbnailUrl || null,
        fileName: messageData.fileName || attachment?.name || metadata.fileName || null,
        mimeType: messageData.mimeType || attachment?.mimeType || metadata.mimeType || null,
        replyTo: messageData.replyTo || metadata.replyTo || null,
        metadata
    };
}

function renderGroupChatPlaceholder(html, variant = '') {
    const chatMessages = safeGetElement('#chatMessages');
    if (!chatMessages) return;
    chatMessages.innerHTML = `<div class="group-chat-placeholder ${variant}" style="padding: 28px 18px; text-align: center; color: var(--text-secondary);">${html}</div>`;
}

function renderGroupChatLoadingState(message = 'Loading group chat...') {
    renderGroupChatPlaceholder(`<i class="fas fa-spinner fa-spin" style="font-size: 22px;"></i><p style="margin-top: 10px;">${escapeGroupChatHTML(message)}</p>`, 'loading');
}

function renderGroupChatEmptyState(groupData = null) {
    const groupName = groupData?.name || currentChatGroup?.name || 'this group';
    renderGroupChatPlaceholder(
        `<i class="fas fa-comments" style="font-size: 34px; opacity: 0.35;"></i><p style="margin-top: 10px; font-weight: 600;">No messages yet</p><p style="margin-top: 6px;">Start the conversation in ${escapeGroupChatHTML(groupName)}.</p>`,
        'empty'
    );
}

function getGroupMessageStatusLabel(message, isSent) {
    if (!isSent) return '';
    if (message.isRead) return 'Seen';
    if (message.deliveredAt) return 'Delivered';
    if (String(message.id || '').startsWith('temp_')) return 'Sending';
    return 'Sent';
}

function buildGroupMessageBody(message) {
    const safeContent = escapeGroupChatHTML(message.content || '').replace(/\n/g, '<br>');
    const safeFileName = escapeGroupChatHTML(message.fileName || 'Attachment');
    
    if (message.type === 'image' && message.mediaUrl) {
        const autoDownload = window.__mediaAutoDownload !== false;
        const safeUrl = escapeGroupChatAttribute(message.mediaUrl);
        const mediaHtml = autoDownload
            ? `<img src="${safeUrl}" alt="${safeFileName}" style="max-width: 240px; width: 100%; border-radius: 14px; display: block;" />`
            : `<div class="group-media-tap-to-load" data-media-url="${safeUrl}" data-media-alt="${safeFileName}"
                    style="width: 240px; max-width: 100%; height: 160px; border-radius: 14px; background: rgba(0,0,0,0.08); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; color: inherit;">
                    <i class="fas fa-image" style="font-size: 22px; opacity: 0.7;"></i>
                    <span style="font-size: 12px; opacity: 0.8;">Tap to load image</span>
               </div>`;
        return `
            <div class="group-message-media image">
                ${mediaHtml}
            </div>
            ${safeContent ? `<div class="message-content">${safeContent}</div>` : ''}
        `;
    }
    
    if ((message.type === 'audio' || (message.mimeType || '').startsWith('audio/')) && message.mediaUrl) {
        return `
            <div class="group-message-media audio" style="margin-bottom: 6px;">
                <audio controls preload="metadata" src="${escapeGroupChatAttribute(message.mediaUrl)}" style="max-width: 100%;"></audio>
            </div>
            ${safeContent ? `<div class="message-content">${safeContent}</div>` : ''}
        `;
    }
    
    if ((message.type === 'file' || message.type === 'document' || message.mediaUrl) && message.mediaUrl) {
        return `
            <div class="group-message-media file" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(0,0,0,0.05); margin-bottom: ${safeContent ? '8px' : '0'};">
                <i class="fas fa-file-alt" style="font-size: 18px;"></i>
                <a href="${escapeGroupChatAttribute(message.mediaUrl)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none; word-break: break-word;">${safeFileName}</a>
            </div>
            ${safeContent ? `<div class="message-content">${safeContent}</div>` : ''}
        `;
    }
    
    return `<div class="message-content">${safeContent || '&nbsp;'}</div>`;
}

function buildGroupMessageMarkup(message) {
    const currentUserId = getCurrentGroupUserId();
    const isSystem = message.type === 'system';
    const isSent = String(message.senderId || '') === currentUserId;
    
    if (isSystem) {
        return {
            className: 'message system',
            html: `
                <div class="message-content">${escapeGroupChatHTML(message.content || '')}</div>
                <div class="message-time">${formatMessageTime(message.createdAt || message.timestamp || new Date())}</div>
            `
        };
    }
    
    const senderInitial = escapeGroupChatHTML((message.senderName || 'U').charAt(0).toUpperCase());
    const statusLabel = getGroupMessageStatusLabel(message, isSent);
    const replyMarkup = message.replyTo?.content
        ? `<div class="message-reply" style="padding: 8px 10px; margin-bottom: 6px; border-left: 3px solid rgba(255,255,255,0.45); background: rgba(0,0,0,0.08); border-radius: 10px;">
                <div style="font-size: 11px; font-weight: 700; margin-bottom: 2px;">${escapeGroupChatHTML(message.replyTo.senderName || 'Reply')}</div>
                <div style="font-size: 12px;">${escapeGroupChatHTML(message.replyTo.content)}</div>
           </div>`
        : '';
    const senderName = message.anonymous ? 'Anonymous' : (isSent ? 'You' : (message.senderName || 'Unknown'));
    const senderAvatarMarkup = isSent ? '' : `
        <div class="message-avatar" style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(0,0,0,0.08); color: var(--text-primary); font-weight: 700;">
            ${message.senderAvatar
                ? `<img src="${escapeGroupChatAttribute(message.senderAvatar)}" alt="${escapeGroupChatAttribute(senderName)}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : `<span>${senderInitial}</span>`}
        </div>
    `;
    
    return {
        className: `message ${isSent ? 'sent' : 'received'}${String(message.id).startsWith('temp_') ? ' pending' : ''}`,
        html: `
            <div class="group-message-row" style="display: flex; align-items: flex-end; gap: 8px; ${isSent ? 'justify-content: flex-end;' : ''}">
                ${senderAvatarMarkup}
                <div class="group-message-bubble" style="max-width: 75%; max-width: min(75%, 540px); flex-shrink: 0; display: flex; flex-direction: column; gap: 4px;">
                    ${!isSent ? `<div class="message-sender" style="font-size: 12px; font-weight: 700; color: var(--text-secondary); padding: 0 4px;">${escapeGroupChatHTML(senderName)}</div>` : ''}
                    <div class="group-message-card" style="padding: 6px 10px 4px 10px; border-radius: 7.5px; background: ${isSent ? '#005c4b' : '#202c33'}; color: #e9edef; box-shadow: 0 1px 1px rgba(0,0,0,0.3); font-size: 14.2px; line-height: 1.45; ${message.isMention ? 'border-left: 3px solid #fbbf24;' : ''}">
                        ${message.isMention ? '<div style="font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:2px;"><i class="fas fa-at"></i> mentioned you</div>' : ''}                        ${replyMarkup}
                        ${buildGroupMessageBody(message)}
                        <div class="message-meta" style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; opacity: 0.8;">
                            ${window.__showTimestamps !== false ? `<span class="message-time">${formatMessageTime(message.createdAt || message.timestamp || new Date())}</span>` : ''}
                            ${isSent && window.__SHOW_READ_RECEIPTS !== false ? `<span class="message-status">${escapeGroupChatHTML(statusLabel)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `
    };
}

function updateGroupChatHeader(groupData, membersPayload = null) {
    if (!groupData) return;
    
    const chatTitle = safeGetElement('#chatTitle');
    const chatMemberCount = safeGetElement('#chatMemberCount');
    const chatActive = safeGetElement('#chatActive');
    const chatAvatar = safeGetElement('#chatAvatar');
    
    const theme = groupData.theme || 'blue';
    const themeInfo = groupThemes[theme] || groupThemes.blue;
    const initials = groupData.name
        ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
        : 'G';
    const groupAvatar = groupData.photoURL || groupData.avatar || null;
    const memberCount = getGroupMemberCount(groupData, membersPayload);
    
    if (chatTitle) chatTitle.textContent = groupData.name || 'Group Chat';
    if (chatMemberCount) chatMemberCount.textContent = `${memberCount} member${memberCount === 1 ? '' : 's'}`;
    if (chatActive) chatActive.textContent = memberCount > 0 ? `${memberCount} participant${memberCount === 1 ? '' : 's'}` : 'No members yet';
    
    if (chatAvatar) {
        if (groupAvatar) {
            chatAvatar.style.background = themeInfo.gradient;
            chatAvatar.style.backgroundImage = `url('${groupAvatar}')`;
            chatAvatar.style.backgroundSize = 'cover';
            chatAvatar.style.backgroundPosition = 'center';
            chatAvatar.innerHTML = '';
        } else {
            chatAvatar.style.backgroundImage = '';
            chatAvatar.style.background = themeInfo.gradient;
            chatAvatar.innerHTML = `<span style="color: white; font-size: 16px;">${escapeGroupChatHTML(initials)}</span>`;
        }
    }
    
    updateChatHeaderUniqueFeatures(groupData);
}

function renderGroupChatMessages(groupId, messages, isRealtime = false) {
    const chatMessages = safeGetElement('#chatMessages');
    if (!chatMessages) return;
    
    const normalized = Array.isArray(messages)
        ? messages
            .map(message => normalizeGroupMessage(message, groupId))
            .filter(Boolean)
            .sort((a, b) => {
                const aTime = new Date(a.createdAt || a.timestamp || 0).getTime();
                const bTime = new Date(b.createdAt || b.timestamp || 0).getTime();
                if (aTime !== bTime) return aTime - bTime;
                return Number(a.id || 0) - Number(b.id || 0);
            })
        : [];
    
    if (normalized.length === 0) {
        renderGroupChatEmptyState(currentChatGroup);
        return;
    }
    
    chatMessages.innerHTML = '';
    normalized.forEach(message => addMessageToChat(message, isRealtime));
    
    const chatMessagesContainer = safeGetElement('#chatMessagesContainer');
    if (chatMessagesContainer) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
}

function updateGroupPrimaryActionState() {
    try {
        const chatInput = safeGetElement('#chatInput');
        const chatSendBtn = safeGetElement('#chatSendBtn');
        const icon = safeGetElement('#chatPrimaryActionIcon');
        if (!chatSendBtn || !icon) return;
        
        const hasText = Boolean(chatInput && chatInput.value && chatInput.value.trim());
        chatSendBtn.dataset.mode = hasText ? 'send' : 'mic';
        chatSendBtn.title = hasText ? 'Send message' : 'Send audio';
        icon.className = hasText ? 'fas fa-paper-plane' : 'fas fa-microphone';
    } catch (error) {}
}

async function uploadGroupAttachment(file, typeHint = 'file') {
    if (!file) return null;
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('description', file.name || 'Group attachment');
        const response = await secureApiCall('/media/upload', {
            method: 'POST',
            body: formData,
            silent: true
        });
        
        if (!response || response.success === false) {
            throw new Error(response?.message || 'Upload failed');
        }
        
        const media = response.data?.media || response.data || null;
        if (!media) throw new Error('Upload response missing media');
        
        const derivedType = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('audio/')
                ? 'audio'
                : typeHint;
        
        return {
            type: derivedType,
            content: '',
            metadata: {
                attachment: {
                    id: media.id || null,
                    url: media.url || media.fileUrl || media.path || null,
                    thumbnailUrl: media.thumbnailUrl || null,
                    name: media.originalName || media.fileName || file.name || 'Attachment',
                    mimeType: media.mimeType || file.type || 'application/octet-stream',
                    size: media.fileSize || media.size || file.size || 0
                }
            }
        };
    } catch (error) {
        console.error('Failed to upload group attachment:', error);
        return null;
    }
}

async function sendGroupAttachment(file, typeHint = 'file') {
    try {
        if (!currentChatGroup || !file) return;
        const uploaded = await uploadGroupAttachment(file, typeHint);
        if (!uploaded) return;
        
        const response = await secureApiCall(`/groups/${currentChatGroup.id}/messages`, {
            method: 'POST',
            body: {
                content: uploaded.content || '',
                type: uploaded.type,
                metadata: uploaded.metadata,
                anonymous: isAnonymousMode
            }
        });
        
        const messageData = response?.data?.message || response?.data;
        if (response && response.success && messageData) {
            GroupCore.saveGroupMessages(currentChatGroup.id, [messageData]);
            addMessageToChat(messageData, true);
        }
    } catch (error) {
        console.error('Failed to send group attachment:', error);
    } finally {
        updateGroupPrimaryActionState();
    }
}

function setupGroupAttachmentControls() {
  try {
    const attachBtn = safeGetElement('#chatAttachBtn');
    const cameraBtn = safeGetElement('#chatCameraBtn');
    const micBtn = safeGetElement('#chatMicBtn');
    const attachInput = safeGetElement('#groupAttachmentInput');
    const cameraInput = safeGetElement('#groupCameraInput');
    const audioInput = safeGetElement('#groupAudioInput');
    const dropdownBtn = safeGetElement('#chatDropdownBtn');
    const moreBtn = safeGetElement('#chatMoreBtn');
    const backBtn = safeGetElement('#chatBackBtn');
    const closeBtn = safeGetElement('#closeChatBtn');
    const callBtn = safeGetElement('#chatCallBtn');
    const videoBtn = safeGetElement('#chatVideoCallBtn');

    // FIX-CAMERA-FILE-CONFLICT: attachBtn/attachInput (and cameraInput) are already
    // bound by group.html's own setupInput(), which shows a Camera-vs-Choose-File
    // menu and opens a freshly-created capture="environment" input for the camera
    // option. Binding a second, competing click handler here that jumped straight
    // to attachInput.click() (the generic file/gallery picker, no capture attr) is
    // what made the camera icon "open the file picker" instead of the camera — and
    // binding a second 'change' handler on the same inputs double-sent every file.
    // Left unbound intentionally; do not re-add these bindings.
    if (dropdownBtn && moreBtn && !dropdownBtn._groupDropdownBound) {
      dropdownBtn._groupDropdownBound = true;
      dropdownBtn.addEventListener('click', () => moreBtn.click());
    }
    const closeHandler = () => {
      if (typeof hideAllPanels === 'function') hideAllPanels();
      if (typeof closeGroupChatMobile === 'function') closeGroupChatMobile();
      setCurrentChatGroup(null);
      // FIX: notify chat.html so it can restore its default header —
      // without this, the group-specific header icons (voice/video
      // call, more-options) stayed visible/stuck because chat.html
      // only ever learns to switch INTO group-header mode (see
      // GROUP_PANEL_OPEN below); nothing told it to switch back out.
      try {
        window.parent.postMessage({
          type: 'GROUP_PANEL_CLOSE',
          source: 'group-module',
          timestamp: Date.now()
        }, '*');
      } catch (_) {}
    };
    if (backBtn && !backBtn._groupBackBound && !backBtn._gcCl) {
      backBtn._groupBackBound = true;
      backBtn.addEventListener('click', closeHandler);
    }
    if (closeBtn && !closeBtn._groupCloseBound && !closeBtn._gcCl) {
      closeBtn._groupCloseBound = true;
      closeBtn.addEventListener('click', closeHandler);
    }
    const startCall = async (callType = 'voice') => {
      if (!currentChatGroup) return;
      const membersResponse = await secureApiCall(`/groups/${currentChatGroup.id}/members?limit=100`, {
        silent: true
      }).catch(() => null);
      const membersPayload = normalizeMembersPayload(membersResponse?.data);
      const currentUserId = getCurrentGroupUserId();
      const participantIds = membersPayload.members.map(member => member.userId || member.user?.id || member.id).filter(id => id && String(id) !== currentUserId);
      if (window.parent && typeof window.parent.__dispatchCallToIframe === 'function') {
        // FIX-GROUP-CALL-NOTICE: the 7th arg (extraCtx) carries groupId/groupName/
        // isGroupCall/participantIds through chat.html -> calls-ui.js -> calls-core.js
        // -> POST /calls. Without it, the call is indistinguishable from a 1:1 call to
        // a "user" whose id happens to equal the group id, so the backend never resolves
        // real group members and never notifies anyone else to join/decline.
        window.parent.__dispatchCallToIframe(currentChatGroup.id, currentChatGroup.name, callType, 'group', currentChatGroup.id, 'group-module', {
          groupId: currentChatGroup.id,
          groupName: currentChatGroup.name,
          isGroupCall: true,
          participantIds
        });
        return;
      }
      if (window.callCore?.startGroupCall) {
        window.callCore.startGroupCall(participantIds, callType, {
          groupId: currentChatGroup.id,
          groupName: currentChatGroup.name,
          isGroupCall: true
        });
      }
    };
    if (callBtn && !callBtn._groupVoiceBound && !callBtn._gcC) {
      callBtn._groupVoiceBound = true;
      callBtn.addEventListener('click', () => {
        startCall('voice').catch(() => {});
      });
    }
    if (videoBtn && !videoBtn._groupVideoBound && !videoBtn._gcCV) {
      videoBtn._groupVideoBound = true;
      videoBtn.addEventListener('click', () => {
        startCall('video').catch(() => {});
      });
    }
  } catch (error) {}
}

const openGroupChat = async function (groupData) {
  if (!isGroupOperationReady()) {
    queueGroupAction(() => openGroupChat(groupData));
    return;
  }
  try {
    if (!groupData) return;
    if (!sessionReceived) {
      requestSession();
      return;
    }
    setCurrentChatGroup(groupData);
    GroupCore.resetGroupUnreadCount(groupData.id);
    updateGroupChatHeader(groupData);
    renderGroupChatLoadingState('Loading messages...');
    setupGroupAttachmentControls();
    const sidebar = safeGetElement('#sidebar');
    const groupChatPanel = safeGetElement('#groupChatPanel');
    if (isMobile) {
      if (sidebar) {
        sidebar.style.display = 'none';
        sidebar.classList.add('hidden');
      }
      if (groupChatPanel) {
        groupChatPanel.style.display = 'flex';
        groupChatPanel.classList.add('active');
      }
      const chatHeaderInfo = safeGetElement('#chatHeaderInfo');
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
    try {
      const [groupDetailsResponse, membersResponse] = await Promise.all([GroupCore.getGroupDetails(groupData.id).catch(() => null), secureApiCall(`/groups/${groupData.id}/members`, {
        silent: true
      }).catch(() => null)]);
      const resolvedGroup = groupDetailsResponse?.data || GroupCore.getGroupById(groupData.id) || groupData;
      const membersPayload = normalizeMembersPayload(membersResponse?.data);
      resolvedGroup.memberCount = getGroupMemberCount(resolvedGroup, membersPayload);
      setCurrentChatGroup(resolvedGroup);
      GroupCore.updateGroupInLists(resolvedGroup);
      GroupCore.saveGroups();
      updateGroupChatHeader(resolvedGroup, membersPayload);

      // FIX: chat.html's header only switches into "group mode" (showing
      // its own voice/video/more icons for the open group) when it
      // receives a GROUP_PANEL_OPEN message — see showGroupHeader() in
      // chat.html. That message was only ever sent by a separate, older
      // openPanel() function in group.html that isn't the code path
      // actually used to open a group chat (openGroupChat, here), so
      // the parent header never learned a group was open and kept
      // showing (or hid) the wrong icons. Send it from the code path
      // that's actually used.
      try {
        window.parent.postMessage({
          type: 'GROUP_PANEL_OPEN',
          payload: {
            id: resolvedGroup.id,
            name: resolvedGroup.name,
            memberCount: resolvedGroup.memberCount,
            stats: resolvedGroup.stats,
            purpose: resolvedGroup.purpose,
            isPublic: resolvedGroup.isPublic
          },
          source: 'group-module',
          timestamp: Date.now()
        }, '*');
      } catch (_) {}

      // P1 FIX: Sync slow mode interval and posting rule from DB into client engine
      try {
        const modEngine = window.__GroupModerationEngine;
        if (modEngine && typeof modEngine.syncFromGroup === 'function') {
          modEngine.syncFromGroup(resolvedGroup);
        }
      } catch (_) {}
    } catch (headerError) {}

    // FIX-024: Join the socket room BEFORE fetching message history.
    // Without this, messages that arrive during the ~500ms API load window are missed forever.
    // The room join is idempotent on the server — safe to call every time.
    try {
      const rt = window.KynectaRealtime;
      if (rt && typeof rt.emit === 'function') {
        rt.emit('join', {
          room: `group:${groupData.id}`
        });
        rt.emit('join', {
          room: `group_${groupData.id}`
        });
      } else if (rt && rt._socket && typeof rt._socket.emit === 'function') {
        rt._socket.emit('join', {
          room: `group:${groupData.id}`
        });
        rt._socket.emit('join', {
          room: `group_${groupData.id}`
        });
      }
    } catch (_) {}
    await loadGroupChatMessages(groupData.id);
    setupTypingListener(groupData.id);
    // FIX (duplicate-screen bug): loadUniqueFeaturesPanels() renders the
    // legacy Notes / Event Countdown / Transparency panels as extra
    // blocks stacked directly underneath the chat panel every time a
    // group chat is opened. That functionality now lives in the Group
    // Tools panel (the header's "wrench" icon, id=groupOSTabBtn, backed
    // by group-os.js + smart-groups.js), which the user opens
    // deliberately instead of having it forced onto the chat screen. Both
    // systems read/write the same group notes/events, so nothing is
    // lost — this just stops it from auto-rendering on top of the chat.
    // loadUniqueFeaturesPanels(groupData.id);
    checkPostingRules(currentChatGroup || groupData);
  } catch (error) {}
};

function updateChatHeaderUniqueFeatures(groupData) {
    try {
        if (!groupData) return;
        
        const purpose = groupData.purpose || '';
        const chatPurposeTag = safeGetElement('#chatPurposeTag');
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
        const chatPulse = safeGetElement('#chatPulse');
        if (pulse && chatPulse) {
            chatPulse.textContent = pulse.text;
            chatPulse.className = `group-pulse ${pulse.class}`;
            chatPulse.style.display = 'inline-block';
        } else if (chatPulse) {
            chatPulse.style.display = 'none';
        }
        
        const mood = groupData.mood || '';
        const postingRule = groupData.postingRule || 'everyone';
        const chatMood = safeGetElement('#chatMood');
        const chatPostingRules = safeGetElement('#chatPostingRules');
        const chatMoodRules = safeGetElement('#chatMoodRules');
        
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
    } catch (error) {}
}

function checkPostingRules(groupData) {
    try {
        if (!groupData) return;
        
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
        
        const chatInput = safeGetElement('#chatInput');
        const chatSendBtn = safeGetElement('#chatSendBtn');
        const topicSelection = safeGetElement('#topicSelection');
        const silentModeBtn = safeGetElement('#silentModeBtn');
        const anonymousModeBtn = safeGetElement('#anonymousModeBtn');
        
        if (chatInput && chatSendBtn) {
            if (!canPost) {
                chatInput.placeholder = reason;
                chatInput.disabled = true;
                chatSendBtn.disabled = true;
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
    } catch (error) {}
}

function updateParticipationModeButtons() {
    try {
        const silentModeBtn = safeGetElement('#silentModeBtn');
        const chatInput = safeGetElement('#chatInput');
        const chatSendBtn = safeGetElement('#chatSendBtn');
        const anonymousModeBtn = safeGetElement('#anonymousModeBtn');
        
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
    } catch (error) {}
}

function loadUniqueFeaturesPanels(groupId) {
    try {
        loadGroupNotes(groupId);
        loadGroupEvents(groupId);
        loadTransparencyLog(groupId);
        analyzeGroupEnergy(groupId);
    } catch (error) {}
}

async function loadGroupNotes(groupId) {
    try {
        const cacheKey = `group_notes_${groupId}`;
        const cachedNotes = SafeStorage.getItem(cacheKey);
        
        const groupNotesContent = safeGetElement('#groupNotesContent');
        if (groupNotesContent) {
            if (cachedNotes) {
                groupNotesContent.innerHTML = cachedNotes;
            } else {
                groupNotesContent.innerHTML = '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
            }
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/notes`, { silent: true });
            if (response && response.success && response.data && groupNotesContent) {
                const notes = response.data.notes || '';
                groupNotesContent.innerHTML = notes || '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
                SafeStorage.setItem(cacheKey, notes);
            }
        } catch (error) {}
        
        const groupNotesPanel = safeGetElement('#groupNotesPanel');
        // FIX-PHASE16: Show notes panel to ALL members, not just admins/creators.
        // Previously checking isAdmin||isCreator meant the panel stayed hidden for
        // regular members — even though they can read notes. Admin-only actions
        // (edit/save) are controlled inside the panel's own buttons, not by hiding it.
        if (groupNotesPanel && currentChatGroup) {
            groupNotesPanel.style.display = 'block';
        }
    } catch (error) {
        const groupNotesPanel = safeGetElement('#groupNotesPanel');
        if (groupNotesPanel) groupNotesPanel.style.display = 'none';
    }
}

async function loadGroupEvents(groupId) {
    try {
        const cacheKey = `group_events_${groupId}`;
        const cachedEvents = SafeStorage.getItem(cacheKey);
        
        let events = [];
        if (cachedEvents) {
            try {
                events = cachedEvents;
            } catch (e) {}
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/events`, { silent: true });
            if (response && response.success && response.data) {
                events = response.data;
                SafeStorage.setItem(cacheKey, events);
            }
        } catch (error) {}
        
        const now = new Date();
        const upcomingEvents = events
            .filter(event => new Date(event.date) > now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const eventCountdownDisplay = safeGetElement('#eventCountdownDisplay');
        const eventCountdownPanel = safeGetElement('#eventCountdownPanel');
        
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
                // FIX-PHASE16: Show events panel to all members (admin creates, members view)
                eventCountdownPanel.style.display = currentChatGroup ? 'block' : 'none';
            }
        }
    } catch (error) {
        const eventCountdownPanel = safeGetElement('#eventCountdownPanel');
        if (eventCountdownPanel) eventCountdownPanel.style.display = 'none';
    }
}

async function loadTransparencyLog(groupId) {
    try {
        const cacheKey = `group_transparency_${groupId}`;
        const cachedLog = SafeStorage.getItem(cacheKey);
        
        let log = [];
        if (cachedLog) {
            try {
                log = cachedLog;
            } catch (e) {}
        } else {
            log = generateInitialTransparencyLog(groupId);
            SafeStorage.setItem(cacheKey, log);
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/transparency`, { silent: true });
            if (response && response.success && response.data) {
                log = response.data;
                SafeStorage.setItem(cacheKey, log);
            }
        } catch (error) {}
        
        const adminTransparencyLog = safeGetElement('#adminTransparencyLog');
        const adminTransparencyPanel = safeGetElement('#adminTransparencyPanel');
        
        if (adminTransparencyLog && adminTransparencyPanel) {
            // FIX-PHASE16: Show transparency log to all members (it's a read-only audit log).
            // Admins see admin-specific actions; members see group-level changes.
            if (log.length > 0 && currentChatGroup) {
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
        const adminTransparencyPanel = safeGetElement('#adminTransparencyPanel');
        if (adminTransparencyPanel) adminTransparencyPanel.style.display = 'none';
    }
}

function generateInitialTransparencyLog(groupId) {
    try {
        const now = new Date();
        return [
            {
                id: `log_${groupId}_1`,
                groupId: groupId,
                action: 'Group created',
                by: session.user?.uid || session.user?.id || 'system',
                byName: session.user?.displayName || 'System',
                timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(),
                details: 'Group was created with initial settings'
            },
            {
                id: `log_${groupId}_2`,
                groupId: groupId,
                action: 'Welcome message set',
                by: session.user?.uid || session.user?.id || 'system',
                byName: session.user?.displayName || 'System',
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
    } catch (error) {
        return [];
    }
}

async function analyzeGroupEnergy(groupId) {
    try {
        let messages = [];
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/messages`, { params: { limit: 50 }, silent: true });
            if (response && response.success && response.data) {
                messages = response.data;
            }
        } catch (error) {
            messages = [];
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
        
        const energySuggestionContent = safeGetElement('#energySuggestionContent');
        const energySuggestionPanel = safeGetElement('#energySuggestionPanel');
        
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
        const energySuggestionPanel = safeGetElement('#energySuggestionPanel');
        if (energySuggestionPanel) energySuggestionPanel.style.display = 'none';
    }
}

function closeGroupChatMobile() {
    try {
        const sidebar = safeGetElement('#sidebar');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        
        if (isMobile) {
            if (sidebar) { sidebar.style.display=''; sidebar.classList.remove('hidden'); }
            if (groupChatPanel) { groupChatPanel.style.display='none'; groupChatPanel.classList.remove('active'); }
            const mb=document.querySelector('.mobile-back-btn,.gc-mb'); if(mb)mb.remove();
        }
    } catch (error) {}
}

function hideAllPanels() {
    try {
        const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        const groupCallPanel = safeGetElement('#groupCallPanel');
        const sidebar = safeGetElement('#sidebar');
        
        if (groupDetailsPanel) groupDetailsPanel.classList.remove('active');
        if (groupChatPanel) groupChatPanel.classList.remove('active');
        if (groupCallPanel) groupCallPanel.classList.remove('active');
        
        if (isMobile) {
            if (sidebar) sidebar.style.display = 'flex';
            if (groupChatPanel) groupChatPanel.style.display = 'none';
            if (groupCallPanel) groupCallPanel.style.display = 'none';
        }
    } catch (error) {}
}

async function loadGroupChatMessages(groupId) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const cachedMessagesKey = `group_messages_${groupId}`;
        const cachedMessages = SafeStorage.getItem(cachedMessagesKey);
        const cachedList = Array.isArray(cachedMessages) ? cachedMessages : [];
        
        if (cachedList.length > 0) {
            renderGroupChatMessages(groupId, cachedList, false);
        } else {
            renderGroupChatLoadingState('Fetching group conversation...');
        }
        
        try {
            const response = await GroupCore.loadGroupMessages(groupId, 50);
            if (response && response.success && response.data) {
                renderGroupChatMessages(groupId, response.data, true);
            } else if (cachedList.length === 0) {
                renderGroupChatEmptyState(currentChatGroup);
            }
        } catch (error) {
            if (cachedList.length === 0) {
                renderGroupChatEmptyState(currentChatGroup);
            }
        }
    } catch (error) {}
}

function addMessageToChat(messageData, isNew = true) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const safeMessageData = normalizeGroupMessage(messageData);
        if (!safeMessageData) return;
        
        const existingPlaceholder = chatMessages.querySelector('.group-chat-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();
        
        const tempId = messageData?._tempId || messageData?.tempId || null;
        if (tempId) {
            const tempElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
            if (tempElement) tempElement.remove();
        }
        
        let messageElement = chatMessages.querySelector(`[data-message-id="${safeMessageData.id}"]`);
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.dataset.messageId = safeMessageData.id || '';
            chatMessages.appendChild(messageElement);
        }
        
        const markup = buildGroupMessageMarkup(safeMessageData);
        messageElement.className = markup.className;
        messageElement.innerHTML = markup.html;
        
        const chatMessagesContainer = safeGetElement('#chatMessagesContainer');
        if (isNew && chatMessagesContainer) {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    } catch (error) {}
}

function addSystemMessage(content) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.dataset.messageId = `system_${Date.now()}`;
        messageElement.innerHTML = `
            <div class="message-content">${escapeGroupChatHTML(content)}</div>
            <div class="message-time">${formatMessageTime(new Date())}</div>
        `;
        chatMessages.appendChild(messageElement);
    } catch (error) {}
}

function saveMessageToCache(groupId, message) {
    try {
        GroupCore.saveGroupMessages(groupId, [message]);
    } catch (error) {}
}

const sendGroupMessageOnline = async function(groupId, messageData) {
    try {
        const response = await GroupCore.sendGroupMessage(groupId, messageData.content, messageData.topic, messageData.anonymous);
        return response;
    } catch (error) {
        console.error('Failed to send message online:', error);
        throw error;
    }
};

const sendGroupMessage = async function() {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'sendMessage', fn: sendGroupMessage });
        return;
    }

    // P1 FIX: Request push notification permission on first use (non-blocking)
    if (window.PushNotificationService && Notification?.permission === 'default') {
        window.PushNotificationService.requestPermission().catch(() => {});
    }

    try {
        const chatInput = safeGetElement('#chatInput');
        const messageTopic = safeGetElement('#messageTopic');
        const sendBtn = safeGetElement('#chatSendBtn');

        if (!currentChatGroup || !chatInput) return;
        if (sendBtn?.dataset.mode === 'mic' && !chatInput.value.trim()) {
            // P1 FIX: Use KynectaVoiceRecorder instead of file input
            if (window.KynectaVoiceRecorder) {
                try {
                    const chatId = currentChatGroup?.chatId;
                    if (!chatId) { safeGetElement('#groupAudioInput')?.click(); return; }

                    // Temporarily override upload endpoint for group context
                    const origBase = window.API_BASE_URL;
                    const result = await window.KynectaVoiceRecorder.startRecording();
                    if (!result) return; // cancelled

                    // Build voice note message
                    const voiceMsg = {
                        groupId: currentChatGroup.id,
                        senderId: session?.user?.uid || session?.user?.id,
                        senderName: session?.user?.displayName || 'User',
                        content: '',
                        type: 'voice_note',
                        mediaUrl: result.url,
                        duration: result.duration,
                        waveform: result.waveform,
                        timestamp: new Date(),
                        readBy: [session?.user?.uid || session?.user?.id],
                        anonymous: isAnonymousMode,
                    };

                    // Upload to group messages endpoint if local blob
                    if (result.local && result.url) {
                        try {
                            const ext = result.mimeType?.includes('ogg') ? 'ogg' : 'webm';
                            const blobResp = await fetch(result.url);
                            const blob = await blobResp.blob();
                            const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: result.mimeType || 'audio/webm' });
                            const form = new FormData();
                            form.append('file', file);
                            form.append('type', 'voice_note');
                            form.append('duration', String(result.duration || 0));
                            form.append('waveform', result.waveform || '');
                            const uploadResp = await secureApiCall(`/media/upload`, { method: 'POST', body: form, silent: true });
                            if (uploadResp?.data?.mediaUrl) voiceMsg.mediaUrl = uploadResp.data.mediaUrl;
                        } catch (_) {}
                    }

                    const tempMsg = { ...voiceMsg, id: 'temp_' + Date.now() };
                    addMessageToChat(tempMsg, true);
                    sendGroupMessage(voiceMsg).catch(() => {});
                } catch (err) {
                    console.error('[GroupCore] Voice recording error:', err);
                    safeGetElement('#groupAudioInput')?.click();
                }
            } else {
                safeGetElement('#groupAudioInput')?.click();
            }
            return;
        }
        if (!chatInput.value.trim()) return;
        
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const messageContent = chatInput.value.trim();
        const selectedTopic = messageTopic ? messageTopic.value : '';
        
        chatInput.value = '';
        adjustTextareaHeight();
        updateGroupPrimaryActionState();
        
        const message = {
            groupId: currentChatGroup.id,
            senderId: session.user?.uid || session.user?.id,
            senderName: session.user?.displayName || 'User',
            content: messageContent,
            timestamp: new Date(),
            type: 'text',
            readBy: [session.user?.uid || session.user?.id],
            topic: selectedTopic || undefined,
            anonymous: isAnonymousMode
        };
        
        // FIX (offline-queue idempotency): this id is generated once, used
        // as both the optimistic temp element's id AND the clientMessageId
        // sent to the server. If the send fails and gets queued, and/or the
        // queue itself retries it, the SAME id travels with every attempt —
        // the server (POST /groups/:id/messages) now dedupes on
        // (senderId, clientMessageId), so no attempt can create a second
        // "Hello" even if it's sent more than once.
        const clientMessageId = (window.crypto && typeof window.crypto.randomUUID === 'function')
            ? window.crypto.randomUUID()
            : `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const tempMessage = {
            ...message,
            id: clientMessageId,
            clientMessageId
        };
        
        addMessageToChat(tempMessage, true);
        
        try {
            const response = await GroupCore.sendGroupMessage(currentChatGroup.id, messageContent, selectedTopic, isAnonymousMode, clientMessageId);
            
            if (response && response.success) {
                const confirmedId = response.data?.id || tempMessage.id;
                // Update the temp element's id in-place — avoids a duplicate message appearing
                const tempEl = document.querySelector(`[data-message-id="${tempMessage.id}"]`);
                if (tempEl) {
                    tempEl.dataset.messageId = confirmedId;
                    tempEl.classList.remove('sending', 'pending');
                }
                const finalMessage = { ...tempMessage, id: confirmedId };
                GroupCore.saveGroupMessages(currentChatGroup.id, [finalMessage]);
                if (isAnonymousMode) {
                    toggleAnonymousMode();
                }
            } else {
                throw new Error(response?.error || 'Failed to send message');
            }
        } catch (error) {
            queueGroupAction({
                type: 'sendMessage',
                groupId: currentChatGroup.id,
                content: messageContent,
                topic: selectedTopic,
                anonymous: isAnonymousMode,
                clientMessageId,
                opId: clientMessageId
            });
        }
        
        stopTypingIndicator();
    } catch (error) {}
};

function toggleSilentMode() {
    try {
        if (currentParticipationMode === 'read_only') {
            currentParticipationMode = 'normal';
            const chatInput = safeGetElement('#chatInput');
            const chatSendBtn = safeGetElement('#chatSendBtn');
            if (chatInput) chatInput.disabled = false;
            if (chatSendBtn) chatSendBtn.disabled = false;
            if (chatInput) chatInput.placeholder = 'Type a message...';
        } else {
            currentParticipationMode = 'read_only';
            const chatInput = safeGetElement('#chatInput');
            const chatSendBtn = safeGetElement('#chatSendBtn');
            if (chatInput) chatInput.disabled = true;
            if (chatSendBtn) chatSendBtn.disabled = true;
            if (chatInput) chatInput.placeholder = 'Silent mode: Read only';
        }
        
        SafeStorage.setItem('participationMode', currentParticipationMode);
        updateParticipationModeButtons();
    } catch (error) {}
}

function toggleAnonymousMode() {
    try {
        isAnonymousMode = !isAnonymousMode;
        updateParticipationModeButtons();
    } catch (error) {}
}

function reactToMessage(messageId, button) {
    try {
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const reaction = reactions[Math.floor(Math.random() * reactions.length)];
        
        button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
        button.style.color = '#FF9800';
    } catch (error) {}
}

function replyToMessage(messageId, senderName) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (chatInput) {
            chatInput.value = `@${senderName} `;
            chatInput.focus();
            updateGroupPrimaryActionState();
        }
    } catch (error) {}
}

function deleteMessage(messageId) {
    try {
        if (confirm('Are you sure you want to delete this message?')) {
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        }
    } catch (error) {}
}

let typingTimeout;

function setupTypingListener(groupId) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;

        // FIX: preserve whatever the user has already typed (and focus/
        // cursor position) across the clone-and-replace below — see
        // rationale above this function. cloneNode(true) does not carry
        // over the live `.value` the user typed, only the original HTML.
        const _preservedValue = chatInput.value;
        const _hadFocus = document.activeElement === chatInput;
        const _selStart = chatInput.selectionStart;
        const _selEnd = chatInput.selectionEnd;

        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);

        if (_preservedValue) {
            newChatInput.value = _preservedValue;
            if (_hadFocus) {
                newChatInput.focus();
                try { newChatInput.setSelectionRange(_selStart, _selEnd); } catch (_) {}
            }
        }
        
        newChatInput.addEventListener('input', () => {
            try {
                adjustTextareaHeight();
                updateGroupPrimaryActionState();
                if (window.__SHOW_TYPING_INDICATORS === false) return; // setting disabled: don't broadcast typing status
                if (!isTyping) {
                    isTyping = true;
                    GroupCore.handleTyping(groupId, session.user?.uid || session.user?.id, true);
                    secureApiCall(`/groups/${groupId}/typing`, { 
                        method: 'POST',
                        body: { typing: true },
                        silent: true
                    }).catch(() => {});
                }
                
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    try {
                        isTyping = false;
                        GroupCore.handleTyping(groupId, session.user?.uid || session.user?.id, false);
                        secureApiCall(`/groups/${groupId}/typing`, { 
                            method: 'POST',
                            body: { typing: false },
                            silent: true
                        }).catch(() => {});
                    } catch (error) {}
                }, 1000);
            } catch (error) {}
        });
        
        newChatInput.addEventListener('keydown', (event) => {
            try {
                if (window.__enterToSend === false) return; // setting disabled: Enter inserts a newline instead
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (newChatInput.value.trim()) {
                        sendGroupMessage().catch?.(() => {});
                    }
                }
            } catch (error) {}
        });
        
        updateGroupPrimaryActionState();
    } catch (error) {}
}

function stopTypingIndicator() {
    try {
        isTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
    } catch (error) {}
}

function adjustTextareaHeight() {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;
        
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
        updateGroupPrimaryActionState();
    } catch (error) {}
}

function formatMessageTime(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return '--:--';
    }
}

const openAdminManagement = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => openAdminManagement(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!groupData.isAdmin && !groupData.isCreator) {
            return;
        }
        
        const adminManagementGroupName = safeGetElement('#adminManagementGroupName');
        if (adminManagementGroupName) {
            adminManagementGroupName.textContent = groupData.name;
        }
        
        const adminManagementModal = safeGetElement('#adminManagementModal');
        if (adminManagementModal) {
            adminManagementModal.classList.add('active');
        }
        
        loadGroupMembersForManagement(groupData);
        loadGroupSettingsForManagement(groupData);
        loadUniqueFeaturesForManagement(groupData);
        
    } catch (error) {}
};

async function loadGroupMembersForManagement(groupData) {
    try {
        const memberList = safeGetElement('#memberManagementList');
        if (!memberList) return;
        
        memberList.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading members...</p></div>';
        
        try {
            const response = await secureApiCall(`/groups/${groupData.id}/members`, { silent: true });
            
            if (response && response.success && response.data) {
                renderMembersList(normalizeMembersPayload(response.data).members);
            } else {
                memberList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error loading members</p>
                        <p class="subtext">Please try again later</p>
                    </div>
                `;
            }
        } catch (error) {
            memberList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading members</p>
                    <p class="subtext">Please try again later</p>
                </div>
            `;
        }
    } catch (error) {}
}

// =============================================
// FIX (REAL-PRESENCE — group module): group member management had no
// online/last-active indicator at all. group-core-patch.js already caches
// the friends list from chat.html's FRIENDS_LIST_UPDATE broadcast into
// window.__friendsList (which carries isOnline/lastSeen) — this builds a
// lookup table from that plus live FRIEND_ONLINE/FRIEND_OFFLINE events, and
// renderMembersList() below reads it per member. Note: members who are not
// also a friend of the viewer won't have live presence data (the app only
// pushes presence for the friend graph), so those members simply show no
// dot rather than a wrong one — real data or nothing, not a guess.
// =============================================
window.__groupPresenceCache = window.__groupPresenceCache || new Map();

function _ingestFriendsListForGroupPresence(friends) {
    if (!Array.isArray(friends)) return;
    friends.forEach((f) => {
        if (!f || f.id == null) return;
        const online = f.isOnline === true || f.online === true || f.status === 'online';
        window.__groupPresenceCache.set(String(f.id), {
            online,
            lastSeen: f.lastSeen || f.last_seen || f.lastActive || null
        });
    });
}

function _formatGroupPresenceLabel(entry) {
    if (!entry) return '';
    if (entry.online) return 'Active now';
    if (entry.lastSeen) {
        const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(entry.lastSeen).getTime()) / 60000));
        if (minutesAgo < 1) return 'Active just now';
        return `Active ${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`;
    }
    return '';
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'FRIENDS_LIST_UPDATE' && d.payload) {
        _ingestFriendsListForGroupPresence(d.payload.friends);
    } else if (d.type === 'FRIEND_ONLINE' || d.type === 'FRIEND_OFFLINE') {
        const p = d.payload || {};
        if (p.userId == null) return;
        window.__groupPresenceCache.set(String(p.userId), {
            online: d.type === 'FRIEND_ONLINE',
            lastSeen: p.lastSeen || (d.type === 'FRIEND_OFFLINE' ? Date.now() : null)
        });
        // Live-patch already-rendered rows without a full re-render
        const row = document.querySelector(`.member-management-item[data-member-userid="${p.userId}"]`);
        if (row) {
            const label = row.querySelector('.member-presence-label');
            const dot = row.querySelector('.member-presence-dot');
            const entry = window.__groupPresenceCache.get(String(p.userId));
            if (label) label.textContent = _formatGroupPresenceLabel(entry);
            if (dot) dot.style.display = entry && entry.online ? 'inline-block' : 'none';
        }
    }
});

function renderMembersList(memberDetails) {
    try {
        const memberList = safeGetElement('#memberManagementList');
        if (!memberList) return;
        
        memberList.innerHTML = '';
        
        memberDetails.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-management-item';
            memberItem.dataset.memberUserid = String(member.id);

            const initials = member.displayName 
                ? member.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                : 'U';

            const _presenceEntry = window.__groupPresenceCache ? window.__groupPresenceCache.get(String(member.id)) : null;
            const _presenceLabel = _formatGroupPresenceLabel(_presenceEntry);
            
            memberItem.innerHTML = `
                <div class="member-management-info">
                    <div class="friend-avatar" style="position:relative;${member.photoURL ? `background-image: url('${member.photoURL}')` : ''}">
                        ${member.photoURL ? '' : `<span>${initials}</span>`}
                        <span class="member-presence-dot" style="display:${_presenceEntry && _presenceEntry.online ? 'inline-block' : 'none'};position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:#00a884;border:2px solid var(--bg-primary, #111);"></span>
                    </div>
                    <div>
                        <div style="font-weight: 500;">${member.displayName}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${member.username || ''}</div>
                        <div class="member-presence-label" style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${_presenceLabel}</div>
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
                        ${member.id !== (session.user?.uid || session.user?.id) ? `
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
                try {
                    const memberId = btn.dataset.memberId;
                    const action = btn.classList.contains('promote') ? 'promote' : 
                                  btn.classList.contains('demote') ? 'demote' : 'remove';
                    
                    handleMemberAction(action, memberId, selectedGroup);
                } catch (error) {}
            });
        });
    } catch (error) {}
}

async function handleMemberAction(action, memberId, groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => handleMemberAction(action, memberId, groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        let success = false;
        
        switch(action) {
            case 'promote':
                // FIX (duplicate network call): GroupCore.promoteToAdmin already
                // sends PUT /groups/:id/members/:userId/role — the extra
                // POST .../promote below hit a route that doesn't exist on the
                // backend (only PUT .../role is registered), so it silently
                // 404'd on every single click via the .catch(() => {}). Removed.
                success = (await GroupCore.promoteToAdmin(groupData.id, memberId)).success;
                if (success) logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                break;
            case 'demote':
                // FIX (duplicate network call): same as 'promote' above —
                // GroupCore.demoteFromAdmin already sends the real request;
                // the extra POST .../demote hit a nonexistent route.
                success = (await GroupCore.demoteFromAdmin(groupData.id, memberId)).success;
                if (success) logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    // FIX (duplicate network call): GroupCore.removeMember already
                    // sends DELETE /groups/:id/members/:userId — the extra DELETE
                    // call below hit the exact same endpoint a second time on
                    // every tap. Removed.
                    success = (await GroupCore.removeMember(groupData.id, memberId)).success;
                    if (success) logTransparencyAction(groupData.id, 'Removed member from group', memberId);
                }
                break;
        }
        
        if (success) {
            loadGroupMembersForManagement(groupData);
        } else {
            reportGroupActionFailure(
                action === 'promote' ? 'Promote to admin' : action === 'demote' ? 'Remove admin' : 'Remove member',
                () => handleMemberAction(action, memberId, groupData)
            );
        }
    } catch (error) {
        reportGroupActionFailure('Member action', () => handleMemberAction(action, memberId, groupData));
    }
}

async function logTransparencyAction(groupId, action, targetId = null) {
    try {
        const logEntry = {
            groupId,
            action,
            targetId,
            by: session.user?.uid || session.user?.id,
            byName: session.user?.displayName || 'Unknown',
            timestamp: new Date()
        };
        
        const cacheKey = `group_transparency_${groupId}`;
        const cachedLog = SafeStorage.getItem(cacheKey) || [];
        cachedLog.unshift(logEntry);
        if (cachedLog.length > 50) cachedLog.pop();
        SafeStorage.setItem(cacheKey, cachedLog);
        
        await secureApiCall(`/groups/${groupId}/transparency`, {
            method: 'POST',
            body: logEntry,
            silent: true
        });
    } catch (error) {}
}

function loadGroupSettingsForManagement(groupData) {
    try {
        if (!groupData) return;
        
        const adminPublicGroup = safeGetElement('#adminPublicGroup');
        const adminApproveMembers = safeGetElement('#adminApproveMembers');
        const adminAllowInvites = safeGetElement('#adminAllowInvites');
        const adminOnlyAdminsPost = safeGetElement('#adminOnlyAdminsPost');
        const adminAllowMedia = safeGetElement('#adminAllowMedia');
        const adminDisappearingMessages = safeGetElement('#adminDisappearingMessages');
        const adminMentionNotifications = safeGetElement('#adminMentionNotifications');
        const adminAnnouncementNotifications = safeGetElement('#adminAnnouncementNotifications');
        
        if (adminPublicGroup) adminPublicGroup.checked = groupData.type === 'public';
        if (adminApproveMembers) adminApproveMembers.checked = groupData.moderationSettings?.approveNewMembers || false;
        if (adminAllowInvites) adminAllowInvites.checked = groupData.moderationSettings?.allowInvites || true;
        if (adminOnlyAdminsPost) adminOnlyAdminsPost.checked = groupData.moderationSettings?.onlyAdminsCanPost || false;
        if (adminAllowMedia) adminAllowMedia.checked = groupData.moderationSettings?.allowMediaSharing || true;
        if (adminDisappearingMessages) adminDisappearingMessages.checked = groupData.moderationSettings?.disappearingMessages || false;
        if (adminMentionNotifications) adminMentionNotifications.checked = groupData.notificationSettings?.mentionNotifications || true;
        if (adminAnnouncementNotifications) adminAnnouncementNotifications.checked = groupData.notificationSettings?.announcementNotifications || true;
    } catch (error) {}
}

function loadUniqueFeaturesForManagement(groupData) {
    try {
        if (!groupData) return;
        
        const adminGroupPurpose = safeGetElement('#adminGroupPurpose');
        if (adminGroupPurpose) adminGroupPurpose.value = groupData.purpose || '';
        
        document.querySelectorAll('.mood-select-btn').forEach(btn => {
            try {
                btn.classList.remove('active');
                if (btn.dataset.mood === groupData.mood) {
                    btn.classList.add('active');
                    btn.style.borderWidth = '2px';
                }
            } catch (error) {}
        });
        
        const adminPostingMode = safeGetElement('#adminPostingMode');
        if (adminPostingMode) adminPostingMode.value = groupData.postingRule || 'everyone';
        updatePostingRulesUI();
        
        if (groupData.quietHours) {
            const adminQuietStart = safeGetElement('#adminQuietStart');
            const adminQuietEnd = safeGetElement('#adminQuietEnd');
            if (adminQuietStart) adminQuietStart.value = groupData.quietHours.start || '22:00';
            if (adminQuietEnd) adminQuietEnd.value = groupData.quietHours.end || '08:00';
        }
        
        if (groupData.scheduledPosting) {
            const adminPostingStart = safeGetElement('#adminPostingStart');
            const adminPostingEnd = safeGetElement('#adminPostingEnd');
            if (adminPostingStart) adminPostingStart.value = groupData.scheduledPosting.start || '09:00';
            if (adminPostingEnd) adminPostingEnd.value = groupData.scheduledPosting.end || '18:00';
        }
        
        const participationModes = groupData.participationModes || {};
        const adminEnableReadOnly = safeGetElement('#adminEnableReadOnly');
        const adminEnableReactOnly = safeGetElement('#adminEnableReactOnly');
        const adminEnableAnonymous = safeGetElement('#adminEnableAnonymous');
        
        if (adminEnableReadOnly) adminEnableReadOnly.checked = participationModes.readOnly || false;
        if (adminEnableReactOnly) adminEnableReactOnly.checked = participationModes.reactOnly || false;
        if (adminEnableAnonymous) adminEnableAnonymous.checked = participationModes.anonymous || false;
    } catch (error) {}
}

function updatePostingRulesUI() {
    try {
        const adminPostingMode = safeGetElement('#adminPostingMode');
        const adminQuietHoursSection = safeGetElement('#adminQuietHoursSection');
        const adminScheduledPostingSection = safeGetElement('#adminScheduledPostingSection');
        
        if (!adminPostingMode) return;
        
        const mode = adminPostingMode.value;
        if (adminQuietHoursSection) {
            adminQuietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
        }
        if (adminScheduledPostingSection) {
            adminScheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
        }
    } catch (error) {}
}

const saveGroupSettings = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => saveGroupSettings(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        const adminPublicGroup = safeGetElement('#adminPublicGroup');
        const adminApproveMembers = safeGetElement('#adminApproveMembers');
        const adminAllowInvites = safeGetElement('#adminAllowInvites');
        const adminOnlyAdminsPost = safeGetElement('#adminOnlyAdminsPost');
        const adminAllowMedia = safeGetElement('#adminAllowMedia');
        const adminDisappearingMessages = safeGetElement('#adminDisappearingMessages');
        const adminMentionNotifications = safeGetElement('#adminMentionNotifications');
        const adminAnnouncementNotifications = safeGetElement('#adminAnnouncementNotifications');
        const adminGroupPurpose = safeGetElement('#adminGroupPurpose');
        const adminPostingMode = safeGetElement('#adminPostingMode');
        const adminQuietStart = safeGetElement('#adminQuietStart');
        const adminQuietEnd = safeGetElement('#adminQuietEnd');
        const adminPostingStart = safeGetElement('#adminPostingStart');
        const adminPostingEnd = safeGetElement('#adminPostingEnd');
        const adminEnableReadOnly = safeGetElement('#adminEnableReadOnly');
        const adminEnableReactOnly = safeGetElement('#adminEnableReactOnly');
        const adminEnableAnonymous = safeGetElement('#adminEnableAnonymous');
        
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

        // P1 FIX: Also send moderation-critical fields to dedicated endpoint that persists them as DB columns
        const adminSlowModeInput = safeGetElement('#adminSlowModeInterval');
        const adminDisappearingTimerInput = safeGetElement('#adminDisappearingTimer');
        const adminBlockedWordsInput = safeGetElement('#adminBlockedWords');
        const modSettingsPayload = {
            postingRule: (() => {
                const rule = adminPostingMode ? adminPostingMode.value : 'open';
                // Normalize: 'everyone' (legacy) → 'open'
                return rule === 'everyone' ? 'open' : rule;
            })(),
        };
        if (adminSlowModeInput) modSettingsPayload.slowModeInterval = parseInt(adminSlowModeInput.value) || 0;
        if (adminDisappearingTimerInput) modSettingsPayload.disappearingTimer = parseInt(adminDisappearingTimerInput.value) || 0;
        else if (adminDisappearingMessages) modSettingsPayload.disappearingTimer = adminDisappearingMessages.checked ? 86400 : 0;
        if (adminBlockedWordsInput && adminBlockedWordsInput.value) {
            modSettingsPayload.blockedWords = adminBlockedWordsInput.value.split(',').map(w => w.trim()).filter(Boolean);
        }
        if (adminPostingMode && adminPostingMode.value === 'scheduled') {
            modSettingsPayload.scheduledPostingStart = adminPostingStart ? adminPostingStart.value : null;
            modSettingsPayload.scheduledPostingEnd   = adminPostingEnd   ? adminPostingEnd.value   : null;
        }
        // Fire moderation settings endpoint (non-blocking, best-effort)
        secureApiCall(`/groups/${groupData.id}/moderation-settings`, {
            method: 'PUT', body: JSON.stringify(modSettingsPayload),
            headers: { 'Content-Type': 'application/json' }
        }).catch(() => {});
        
        const response = await GroupCore.updateGroup(groupData.id, settings);
        
        if (response && response.success) {
            Object.assign(groupData, settings);
            
            updateGroupInAllLists(groupData);
            
            logTransparencyAction(groupData.id, 'Updated group settings');
            
            if (currentChatGroup && currentChatGroup.id === groupData.id) {
                updateChatHeaderUniqueFeatures(groupData);
                checkPostingRules(groupData);
            }
            
            const adminManagementModal = safeGetElement('#adminManagementModal');
            if (adminManagementModal) adminManagementModal.classList.remove('active');
            
            GroupCore.saveGroups();
        } else {
            throw new Error(response?.error || 'Failed to save settings');
        }
    } catch (error) {
        reportGroupActionFailure('Save group settings', () => saveGroupSettings(groupData));
    }
};

async function showFriendSelection() {
    try {
        const friendSelectionModal = safeGetElement('#friendSelectionModal');
        if (friendSelectionModal) friendSelectionModal.classList.add('active');
        selectedFriends = [];

        const friendSelectionContent = safeGetElement('#friendSelectionContent');
        if (friendSelectionContent) {
            friendSelectionContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading friends...</p></div>';
        }

        // FIXED: Actually fetch friends from the real API
        try {
            let token = null;
            
            // Try authStorage first (most reliable)
            if (typeof window.getAuthSession === 'function') {
                const authSession = window.getAuthSession();
                if (authSession && authSession.token) {
                    token = authSession.token;
                }
            }
            
            // Fallback to session and localStorage
            if (!token) {
                token = (session && session.token) ||
                          localStorage.getItem('authToken') ||
                          localStorage.getItem('token') ||
                          localStorage.getItem('auth_token') ||
                          sessionStorage.getItem('auth_token');
            }
            if (token) {
                const rawBase =
                    window.__API_CORE?.getBaseUrl?.() ||
                    window.api?.env?.getBaseUrl?.() ||
                    window.__getApiBase?.() ||
                    window.parent?.__API_CORE?.getBaseUrl?.() ||
                    window.parent?.api?.env?.getBaseUrl?.() ||
                    window.parent?.__getApiBase?.() ||
                    '/api';
                const requestUrl = `${String(rawBase).replace(/\/+$/, '').replace(/\/api\/?$/, '/api')}/friends`;
                const res = await fetch(requestUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    // friends.js returns { success, data: { friends: [...] } }
                    const raw = data?.data?.friends || data?.data || data?.friends || [];
                    friends = raw.map(f => ({
                        id: f.id,
                        displayName: f.displayName || [f.firstName, f.lastName].filter(Boolean).join(' ') || f.username || 'Unknown',
                        username: f.username || '',
                        photoURL: f.avatar || null,
                        online: f.status === 'online'
                    }));
                }
            }
        } catch (fetchErr) {
            console.warn('[showFriendSelection] Could not fetch friends:', fetchErr.message);
        }

        renderFriendSelection();
    } catch (error) {
        console.error('[showFriendSelection]', error);
    }
}

function renderFriendSelection() {
    try {
        const friendSelectionContent = safeGetElement('#friendSelectionContent');
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
            try {
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
                    try {
                        const checkbox = friendItem.querySelector('.friend-checkbox');
                        const isSelected = checkbox.classList.contains('selected');
                        
                        if (isSelected) {
                            checkbox.classList.remove('selected');
                            checkbox.querySelector('i').style.display = 'none';
                            selectedFriends = selectedFriends.filter(id => id !== friend.id);
                        } else {
                            const cap = window.__maxGroupSize;
                            // +1 accounts for the creator, who is a member but not in selectedFriends
                            if (typeof cap === 'number' && cap > 0 && selectedFriends.length + 1 >= cap) {
                                if (typeof showNotification === 'function') {
                                    showNotification(`This group is limited to ${cap} members in your settings.`, 'error');
                                }
                                return;
                            }
                            checkbox.classList.add('selected');
                            checkbox.querySelector('i').style.display = 'block';
                            selectedFriends.push(friend.id);
                        }
                        
                        updateSelectedFriendsList();
                    } catch (error) {}
                });
                
                friendSelectionContent.appendChild(friendItem);
            } catch (error) {}
        });
    } catch (error) {}
}

function updateSelectedFriendsList() {
    try {
        const selectedMembersList = safeGetElement('#selectedMembersList');
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
            try {
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
                        <div style="color: var(--danger-color); cursor: pointer;" onclick="window.removeSelectedFriend('${friend.id}')">
                            <i class="fas fa-times"></i>
                        </div>
                    `;
                    
                    selectedMembersList.appendChild(memberItem);
                }
            } catch (error) {}
        });
    } catch (error) {}
}

function removeSelectedFriend(friendId) {
    try {
        selectedFriends = selectedFriends.filter(id => id !== friendId);
        updateSelectedFriendsList();
        
        const friendItem = document.querySelector(`.friend-item[data-friend-id="${friendId}"]`);
        if (friendItem) {
            const checkbox = friendItem.querySelector('.friend-checkbox');
            checkbox.classList.remove('selected');
            checkbox.querySelector('i').style.display = 'none';
        }
    } catch (error) {}
}

const createGroupOnline = async function(groupData) {
    if (window.__allowGroupCreation === false) {
        const msg = 'Group creation is turned off in your settings.';
        if (typeof showNotification === 'function') showNotification(msg, 'error');
        throw new Error(msg);
    }
    // FIX: Instead of silently returning when not ready, wait up to 8s for
    // the parent handshake and session to arrive, then show a clear error.
    if (!isGroupOperationReady()) {
        if (typeof showNotification === 'function') {
            showNotification('Connecting to server\u2026', 'info');
        }
        // Poll every 200ms for up to 8 seconds
        const ready = await new Promise(resolve => {
            let elapsed = 0;
            const iv = setInterval(() => {
                elapsed += 200;
                if (isGroupOperationReady()) { clearInterval(iv); resolve(true); }
                else if (elapsed >= 8000) { clearInterval(iv); resolve(false); }
            }, 200);
        });
        if (!ready) {
            const msg = 'Not connected to server. Please refresh and try again.';
            if (typeof showNotification === 'function') showNotification(msg, 'error');
            throw new Error(msg);
        }
    }

    try {
        if (!groupData) return;

        // FIX: If session not yet received, request it and wait up to 5s
        if (!sessionReceived) {
            requestSession();
            const sessionArrived = await new Promise(resolve => {
                let elapsed = 0;
                const iv = setInterval(() => {
                    elapsed += 200;
                    if (sessionReceived) { clearInterval(iv); resolve(true); }
                    else if (elapsed >= 5000) { clearInterval(iv); resolve(false); }
                }, 200);
            });
            if (!sessionArrived) {
                const msg = 'Session not ready \u2014 please try again.';
                if (typeof showNotification === 'function') showNotification(msg, 'error');
                throw new Error(msg);
            }
        }
        
        const creatorId = session.user?.uid || session.user?.id;
        const members = [...new Set([creatorId, ...safeArray(selectedFriends), ...safeArray(groupData?.memberIds)])].filter(Boolean);
        
        const groupDataToSave = {
            name: groupData.name,
            description: groupData.description || '',
            topic: groupData.topic || '',
            privacy: groupData.privacy || 'private',
            theme: groupData.theme || 'blue',
            welcomeMessage: groupData.welcomeMessage || '',
            rules: groupData.rules || [],
            moderationSettings: groupData.moderationSettings || {},
            joinQuestions: [],
            customReactions: groupData.customReactions || ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}'],
            badges: ['star', 'fire'],
            memberIds: members,
            purpose: groupData.purpose || '',
            mood: groupData.mood || '',
            postingRule: groupData.postingRule || 'everyone',
            quietHours: groupData.quietHours || {},
            scheduledPosting: groupData.scheduledPosting || {},
            participationModes: groupData.participationModes || {}
        };
        
        // Call GroupCore.createGroup — with the patch applied, this returns immediately
        // (optimistic local group) without waiting for the backend.
        let response = null;
        try {
            response = await GroupCore.createGroup(groupDataToSave);
        } catch (error) {
            console.warn('[GROUP CREATE] createGroup error:', error.message);
        }
        
        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to create group');
        }
        
        const newGroup = response.data;
        
        // Push to globals in case patch didn't already (dedup by id)
        if (!groups.some(g => g.id === newGroup.id)) groups.push(newGroup);
        if (!myGroups.some(g => g.id === newGroup.id)) myGroups.push(newGroup);
        if (!adminGroups.some(g => g.id === newGroup.id)) adminGroups.push(newGroup);
        
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        
        // Close modals immediately — group is already visible in UI
        const createGroupModal = safeGetElement('#createGroupModal');
        const friendSelectionModal = safeGetElement('#friendSelectionModal');

        if (createGroupModal) {
            createGroupModal.classList.remove('active');
            createGroupModal.style.display = 'none';
        }
        if (friendSelectionModal) {
            friendSelectionModal.classList.remove('active');
            friendSelectionModal.style.display = 'none';
        }

        const inviteLinkInput = safeGetElement('#inviteLinkInput');
        const copyInviteLinkBtn = safeGetElement('#copyInviteLinkBtn');
        const shareInviteLinkBtn = safeGetElement('#shareInviteLinkBtn');
        
        if (inviteLinkInput) inviteLinkInput.value = `${window.location.origin}/group.html?join=${newGroup.id}`;
        if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = false;
        if (shareInviteLinkBtn) shareInviteLinkBtn.disabled = false;

        const allInvites = [...new Set([
            ...safeArray(selectedFriends),
            ...safeArray(window.__pendingGroupInvites),
            ...safeArray(groupData?.memberIds)
        ])].filter(friendId => String(friendId) !== String(creatorId));
        if (allInvites.length > 0) {
            const groupId = newGroup.id || newGroup.group?.id;
            if (groupId) {
                let addedMembers = 0;
                let invitedMembers = 0;
                for (const friendId of allInvites) {
                    if (!friendId) continue;
                    try {
                        const inviteResponse = await secureApiCall(`/group-members/${groupId}/invitations`, {
                            method: 'POST',
                            body: JSON.stringify({ inviteeId: friendId, role: 'member' }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const inviteData = safeObject(inviteResponse?.data || inviteResponse);
                        const action = inviteData.action || inviteResponse?.action || (inviteResponse?.success ? 'invite_sent' : 'failed');
                        if (action === 'member_added' || action === 'already_member') addedMembers++;
                        else if (action === 'invite_required' || action === 'invite_sent') invitedMembers++;
                    } catch (inviteErr) {
                        debugLog(`[createGroupOnline] Invite failed for ${friendId}:`, inviteErr.message);
                    }
                }
                if (typeof showNotification === 'function') {
                    if (addedMembers > 0) showNotification(`${addedMembers} member${addedMembers > 1 ? 's' : ''} added immediately`, 'success');
                    if (invitedMembers > 0) showNotification(`${invitedMembers} invitation${invitedMembers > 1 ? 's' : ''} sent`, 'info');
                }
            }
        }

        selectedFriends = [];
        try { window.__pendingGroupInvites = []; } catch(_) {}
        try { window.GroupSyncEngine?.syncAll?.({ silent: true }).catch(() => {}); } catch (_) {}
        showGroupDetails(newGroup, 'my_group');
        
        safeSend('GROUP_CREATED', {
            group: newGroup,
            timestamp: Date.now()
        });

        // FIX: Return the created group so callers (createGroupAsync) can use it
        return { success: true, group: newGroup, data: newGroup };
        
    } catch (error) {
        console.error('[GROUP CREATE] Failed:', error?.message || error);
        if (typeof showNotification === 'function') {
            showNotification(error?.message || 'Failed to create group', 'error');
        }
        throw error;
    }
};

const joinGroupOnline = async function (groupId) {
  if (!isGroupOperationReady()) {
    queueGroupAction({
      type: 'joinGroup',
      groupId
    });
    return;
  }
  try {
    if (!sessionReceived) {
      requestSession();
      return;
    }
    const response = await GroupCore.sendJoinRequest(groupId);
    if (!response || !response.success) {
      reportGroupActionFailure('Join group', () => joinGroupOnline(groupId));
      return;
    }
    const detailsResponse = await GroupCore.getGroupDetails(groupId).catch(() => null);
    const updatedGroup = detailsResponse?.data || GroupCore.getGroupById(groupId) || response.data || {
      id: groupId
    };
    const existingIndex = groups.findIndex(g => String(g.id) === String(groupId));
    if (existingIndex !== -1) {
      groups[existingIndex] = updatedGroup;
    } else {
      groups.push(updatedGroup);
    }
    const joinedIndex = joinedGroups.findIndex(g => String(g.id) === String(groupId));
    if (joinedIndex === -1) joinedGroups.push(updatedGroup);else joinedGroups[joinedIndex] = updatedGroup;
    setGroupInvites(groupInvites.filter(invite => String(invite.groupId) !== String(groupId)));
    GroupCore.saveGroups();
    updateGroupCounts();
    updateCurrentSection();
    const groupInviteModal = safeGetElement('#groupInviteModal');
    if (groupInviteModal) groupInviteModal.classList.remove('active');

    // Use safeSend for parent communication
    safeSend('MEMBER_ADDED', {
      groupId,
      member: {
        userId: session.user?.uid || session.user?.id,
        role: 'member',
        joinedAt: Date.now()
      },
      timestamp: Date.now()
    });
  } catch (error) {
    reportGroupActionFailure('Join group', () => joinGroupOnline(groupId));
  }
};

const leaveGroupOnline = async function (groupId) {
  if (!isGroupOperationReady()) {
    queueGroupAction({
      type: 'leaveGroup',
      groupId
    });
    return;
  }
  try {
    if (!sessionReceived) {
      requestSession();
      return;
    }
    const response = await GroupCore.leaveGroup(groupId);
    if (!response || !response.success) {
      reportGroupActionFailure('Leave group', () => leaveGroupOnline(groupId));
      return;
    }
    setGroups(groups.filter(g => g.id !== groupId));
    setJoinedGroups(joinedGroups.filter(g => g.id !== groupId));
    setAdminGroups(adminGroups.filter(g => g.id !== groupId));
    GroupCore.saveGroups();
    updateGroupCounts();
    updateCurrentSection();
    const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
    if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
      groupDetailsPanel.classList.remove('active');
      setSelectedGroup(null);
    }
    if (currentChatGroup && currentChatGroup.id === groupId) {
      if (typeof closeGroupChatMobile === 'function') {
        closeGroupChatMobile();
      }
      setCurrentChatGroup(null);
    }

    // Use safeSend for parent communication
    safeSend('MEMBER_REMOVED', {
      groupId,
      userId: session.user?.uid || session.user?.id,
      timestamp: Date.now()
    });
  } catch (error) {
    reportGroupActionFailure('Leave group', () => leaveGroupOnline(groupId));
  }
};

async function acceptGroupInvite(inviteData) {
  if (!isGroupOperationReady()) {
    queueGroupAction(() => acceptGroupInvite(inviteData));
    return;
  }
  try {
    if (!sessionReceived) {
      requestSession();
      return;
    }
    const inviteId = inviteData.id || inviteData.inviteId;
    const groupId = inviteData.groupId || inviteData.id;

    // FIXED: correct endpoint is /api/group-members/invitations/:id/accept
    const response = await secureApiCall(`/group-members/invitations/${inviteId}/accept`, {
      method: 'POST'
    });
    if (!response || !response.success) {
      reportGroupActionFailure('Accept invite', () => acceptGroupInvite(inviteData));
      return;
    }

    // Update local state — add to joinedGroups
    const detailsResponse = await GroupCore.getGroupDetails(groupId).catch(() => null);
    const groupData = detailsResponse?.data || response.data?.group || GroupCore.getGroupById(groupId);
    if (groupData) {
      const upsert = list => {
        const idx = list.findIndex(g => String(g.id) === String(groupId));
        if (idx === -1) list.push(groupData);else list[idx] = groupData;
      };
      upsert(joinedGroups);
      upsert(groups);
    }
    setGroupInvites(groupInvites.filter(inv => (inv.id || inv.inviteId) !== inviteId));
    GroupCore.saveGroups();
    updateGroupCounts();
    updateCurrentSection();
    const groupInviteModal = safeGetElement('#groupInviteModal');
    if (groupInviteModal) groupInviteModal.classList.remove('active');
  } catch (error) {
    reportGroupActionFailure('Accept invite', () => acceptGroupInvite(inviteData));
  }
}

async function declineGroupInvite(inviteData) {
  if (!isGroupOperationReady()) {
    queueGroupAction(() => declineGroupInvite(inviteData));
    return;
  }
  try {
    if (!sessionReceived) {
      requestSession();
      return;
    }
    const inviteId = inviteData.id || inviteData.inviteId;

    // FIXED: correct endpoint is /api/group-members/invitations/:id/reject
    const response = await secureApiCall(`/group-members/invitations/${inviteId}/reject`, {
      method: 'POST'
    });
    if (!response || !response.success) {
      reportGroupActionFailure('Decline invite', () => declineGroupInvite(inviteData));
      return;
    }
    setGroupInvites(groupInvites.filter(invite => (invite.id || invite.inviteId) !== inviteId));
    GroupCore.saveGroups();
    updateGroupCounts();
    updateCurrentSection();
    const groupInviteModal = safeGetElement('#groupInviteModal');
    if (groupInviteModal) groupInviteModal.classList.remove('active');
  } catch (error) {
    reportGroupActionFailure('Decline invite', () => declineGroupInvite(inviteData));
  }
}

function leaveGroupConfirm(groupData) {
    try {
        if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
            leaveGroupOnline(groupData.id);
        }
    } catch (error) {}
}

const showGroupDetails = async function (groupData, type) {
  if (!isGroupOperationReady()) {
    queueGroupAction(() => showGroupDetails(groupData, type));
    return;
  }
  try {
    if (!groupData) return;
    setSelectedGroup(groupData);
    const groupDetailsTitle = document.querySelector('.group-details-title');
    if (groupDetailsTitle) groupDetailsTitle.textContent = 'Group Details';
    const sidebar = safeGetElement('#sidebar');
    const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
    if (isMobile) {
      if (sidebar) sidebar.style.display = 'none';
      if (groupDetailsPanel) {
        groupDetailsPanel.style.display = 'flex';
        groupDetailsPanel.classList.add('active');
      }
    } else {
      if (groupDetailsPanel) groupDetailsPanel.classList.add('active');
    }
    await loadGroupDetails(groupData, type);
  } catch (error) {}
};

async function loadGroupDetails(groupData, type) {
    try {
        const detailsContent = safeGetElement('#groupDetailsContent');
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
            let realMemberTotal = getGroupMemberCount(groupData);
            try {
                const response = await secureApiCall(`/groups/${groupData.id}/members`, { silent: true });
                if (response && response.success && response.data) {
                    const membersPayload = normalizeMembersPayload(response.data);
                    realMembers = membersPayload.members.slice(0, 5);
                    realMemberTotal = getGroupMemberCount(groupData, membersPayload);
                }
            } catch (error) {}
            
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
                    ${moodInfo ? `<div class="group-mood-indicator mood-${mood}" style="margin: 10px auto; background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 8px 16px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">${moodInfo.icon} ${moodInfo.name}</div>` : ''}
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
                        <span class="info-value">${realMemberTotal}</span>
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
                        <span>Members (${Math.min(realMemberTotal || 0, 5)} shown)</span>
                    </div>
                    <div class="member-list">
                        ${realMembers.length > 0 ? 
                            realMembers.map((member, i) => `
                                <div class="member-item">
                                    <div class="member-avatar" ${(member.user?.avatar || member.photoURL) ? `style="background-image: url('${member.user?.avatar || member.photoURL}')"` : 'style="background: var(--secondary-color)"'}>
                                        ${(member.user?.avatar || member.photoURL) ? '' : `<span style="color: var(--text-primary); font-size: 14px;">${((member.user?.firstName || member.user?.lastName) ? [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') : (member.user?.username || member.displayName || '')).split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U'}</span>`}
                                    </div>
                                    <div class="member-info">
                                        <div class="member-name">
                                            <span>${((member.user?.firstName || member.user?.lastName) ? [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') : (member.user?.username || member.displayName)) || 'Unknown User'}</span>
                                            ${String(member.userId || member.uid || member.id) === String(session.user?.uid || session.user?.id) ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                             ['owner', 'admin'].includes(member.role) ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                             '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">
                                            ${String(member.userId || member.uid || member.id) === String(session.user?.uid || session.user?.id) ? 'You' : ((member.user?.status === 'online' || member.online) ? 'Online' : 'Offline')}
                                        </div>
                                    </div>
                                </div>
                            `).join('') :
                            Array.from({length: Math.min(realMemberTotal || 0, 5)}, (_, i) => `
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
                    ${realMemberTotal > 5 ? `
                        <div style="text-align: center; margin-top: 10px;">
                            <button class="action-btn secondary" id="viewAllMembersBtn" style="width: 100%;">
                                <i class="fas fa-users"></i> View All ${realMemberTotal} Members
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
            
            const openGroupChatBtn = safeGetElement('#openGroupChatBtn');
            const manageGroupBtn = safeGetElement('#manageGroupBtn');
            const leaveGroupBtn = safeGetElement('#leaveGroupBtn');
            const groupOptionsBtn = safeGetElement('#groupOptionsBtn');
            const viewAllMembersBtn = safeGetElement('#viewAllMembersBtn');
            
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
                viewAllMembersBtn.addEventListener('click', () => {});
            }
            
        } catch (error) {
            detailsContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading group details</p>
                    <p class="subtext">Please try again later</p>
                </div>
            `;
        }
    } catch (error) {}
}

// =============================================
// DATA SYNC FUNCTIONS - UPDATED WITH SESSION CHECK
// =============================================
async function syncGroupsFromServer() {
  if (!sessionReady && !sessionReceived) return;
  try {
    const response = await GroupCore.requestGroupList();
    if (!response || !response.success) {
      return;
    }
    const groupsData = response.data;
    const serverGroups = groupsData.groups || [];
    const serverMyGroups = groupsData.myGroups || [];
    const serverJoinedGroups = groupsData.joinedGroups || [];
    const serverAdminGroups = groupsData.adminGroups || [];
    if (JSON.stringify(serverGroups) !== JSON.stringify(groups)) {
      setGroups(serverGroups);
      setMyGroups(serverMyGroups);
      setJoinedGroups(serverJoinedGroups);
      setAdminGroups(serverAdminGroups);
      SafeStorage.setItem('groups', groups);
      SafeStorage.setItem('myGroups', myGroups);
      SafeStorage.setItem('joinedGroups', joinedGroups);
      SafeStorage.setItem('adminGroups', adminGroups);
      SafeStorage.setItem('lastCacheTime', Date.now().toString());
      const allGroupsSection = safeGetElement('#allGroupsSection');
      if (allGroupsSection && allGroupsSection.classList.contains('active')) {
        updateCurrentSection();
        updateGroupCounts();
      }
    }
  } catch (error) {}
}

async function syncGroupInvitesFromServer() {
  if (!sessionReady && !sessionReceived) return;
  try {
    const response = await secureApiCall('/groups/invites/user', {
      silent: true
    });
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
      setGroupInvites(serverInvites);
      SafeStorage.setItem('groupInvites', groupInvites);
      const invitesCountEl = safeGetElement('#invitesCount');
      const invitesSectionCountEl = safeGetElement('#invitesSectionCount');
      if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
      if (invitesSectionCountEl) invitesSectionCountEl.textContent = groupInvites.length;
    }
  } catch (error) {}
}

async function syncUniqueFeaturesData() {
    if (!sessionReady && !sessionReceived) return;
    
    try {
        const purposesResponse = await secureApiCall('/groups/purposes', { silent: true });
        if (purposesResponse && purposesResponse.success && purposesResponse.data) {
            SafeStorage.setItem('groupPurposes', purposesResponse.data);
            
            purposesResponse.data.forEach(purpose => {
                const group = groups.find(g => g.id === purpose.groupId);
                if (group) {
                    group.purpose = purpose.purpose;
                }
            });
        }
        
        const moodsResponse = await secureApiCall('/groups/moods', { silent: true });
        if (moodsResponse && moodsResponse.success && moodsResponse.data) {
            SafeStorage.setItem('groupMoods', moodsResponse.data);
            
            moodsResponse.data.forEach(mood => {
                const group = groups.find(g => g.id === mood.groupId);
                if (group) {
                    group.mood = mood.mood;
                }
            });
        }
        
    } catch (error) {}
}

function matchesFilters(groupData) {
    try {
        if (!groupData) return false;
        
        if (currentTypeFilter !== 'all' && groupData.type !== currentTypeFilter) {
            return false;
        }
        
        if (currentSearchTerm && !matchesSearch(groupData, currentSearchTerm)) {
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

function matchesSearch(groupData, searchTerm) {
    try {
        if (!searchTerm) return true;
        
        const searchIn = [
            groupData.name || '',
            groupData.topic || '',
            groupData.description || '',
            groupData.purpose ? groupPurposes[groupData.purpose]?.name || '' : ''
        ].join(' ').toLowerCase();
        
        return searchIn.includes(searchTerm.toLowerCase());
    } catch (error) {
        return false;
    }
}

function filterGroupsByType(type) {
    try {
        currentTypeFilter = type;
        updateCurrentSection();
        
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.type-filter-btn[data-type="${type}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    } catch (error) {}
}

function searchGroups(searchTerm) {
    try {
        currentSearchTerm = searchTerm.toLowerCase().trim();
        updateCurrentSection();
    } catch (error) {}
}

function saveGroupsToLocalStorage() {
    GroupCore.saveGroups();
}

function formatTimeAgo(date) {
    try {
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
    } catch (error) {
        return '--';
    }
}

function formatDate(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return '--';
    }
}

function showNotification(message, type = 'success') {
    try {
        const notificationText = safeGetElement('#notificationText');
        const notification = safeGetElement('#notification');
        
        if (!notificationText || !notification) return;
        
        notificationText.textContent = message;
        
        notification.className = 'notification';
        notification.classList.add(type);
        notification.classList.add('active');
        
        setTimeout(() => {
            try {
                notification.classList.remove('active');
            } catch (error) {}
        }, 3000);
    } catch (error) {}
}

function processPendingOfflineActions() {
    try {
        const pendingActions = SafeStorage.getItem('pendingActions') || [];
        if (pendingActions.length > 0) {}
    } catch (error) {}
}

function updateCreateGroupPostingRulesUI() {
    try {
        const postingRulesSelect = safeGetElement('#postingRulesSelect');
        const quietHoursSection = safeGetElement('#quietHoursSection');
        const scheduledPostingSection = safeGetElement('#scheduledPostingSection');
        
        if (!postingRulesSelect) return;
        
        const mode = postingRulesSelect.value;
        if (quietHoursSection) {
            quietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
        }
        if (scheduledPostingSection) {
            scheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
        }
    } catch (error) {}
}

function loadCachedDataInstantly() {
    GroupCore.loadCachedData();
    updateGroupCounts();
}

function loadUniqueFeaturesData() {
    try {
        const cachedPurposes = SafeStorage.getItem('groupPurposes');
        if (cachedPurposes) {
            const purposes = cachedPurposes;
            groups.forEach(group => {
                if (purposes[group.id]) {
                    group.purpose = purposes[group.id];
                }
            });
        }
        
        const cachedMoods = SafeStorage.getItem('groupMoods');
        if (cachedMoods) {
            const moods = cachedMoods;
            groups.forEach(group => {
                if (moods[group.id]) {
                    group.mood = moods[group.id];
                }
            });
        }
        
        const cachedRules = SafeStorage.getItem('groupPostingRules');
        if (cachedRules) {
            const rules = cachedRules;
            groups.forEach(group => {
                if (rules[group.id]) {
                    group.postingRule = rules[group.id];
                }
            });
        }
        
        const cachedModes = SafeStorage.getItem('participationMode');
        if (cachedModes) {
            currentParticipationMode = cachedModes;
        }
    } catch (error) {}
}

function calculateGroupPulse(groupData) {
    try {
        if (!groupData || !groupData.lastActivity) return null;
        
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
    } catch (error) {
        return null;
    }
}

function updateGroupCounts() {
  try {
    // FIX (2026-07-13): the real data-loading path — requestGroupList() calling
    // GET /groups/user — only ever populated GroupCore.myGroups / .joinedGroups /
    // .adminGroups / .groups (the object's own properties). It never touched
    // these bare module-level `myGroups`/`joinedGroups`/`adminGroups`/`groups`
    // variables, which stayed permanently empty arrays from their initial
    // declaration. The 'groups:list-updated' event correctly carried the fresh
    // counts as its payload, but the listener wired to it (group-ui-patch.js)
    // called updateGroupCounts() with no arguments, so this function always
    // rendered 0 for My Groups / Joined / Admin regardless of real data.
    // Prefer the live GroupCore arrays; fall back to the local ones only if
    // GroupCore isn't available for some reason.
    const GC = typeof window !== 'undefined' && window.GroupCore ? window.GroupCore : null;
    const liveGroups = GC && Array.isArray(GC.groups) ? GC.groups : groups;
    const liveMyGroups = GC && Array.isArray(GC.myGroups) ? GC.myGroups : myGroups;
    const liveJoined = GC && Array.isArray(GC.joinedGroups) ? GC.joinedGroups : joinedGroups;
    const liveAdmin = GC && Array.isArray(GC.adminGroups) ? GC.adminGroups : adminGroups;
    // groupInvites IS kept correctly in sync by syncGroupInvitesFromServer(), so no GC fallback needed there.

    const totalGroupsEl = safeGetElement('#totalGroups');
    const activeGroupsEl = safeGetElement('#activeGroups');
    const totalMembersEl = safeGetElement('#totalMembers');
    const myGroupsCountEl = safeGetElement('#myGroupsCount');
    const joinedCountEl = safeGetElement('#joinedCount');
    const invitesCountEl = safeGetElement('#invitesCount');
    const adminCountEl = safeGetElement('#adminCount');
    if (totalGroupsEl) totalGroupsEl.textContent = liveGroups.length;
    const activeGroups = liveGroups.filter(g => g.lastActivity && Date.now() - new Date(g.lastActivity).getTime() < 86400000).length;
    if (activeGroupsEl) activeGroupsEl.textContent = activeGroups;
    const totalMembers = liveGroups.reduce((sum, group) => sum + (group.memberCount || 0), 0);
    if (totalMembersEl) totalMembersEl.textContent = totalMembers;
    if (myGroupsCountEl) myGroupsCountEl.textContent = liveMyGroups.length;
    if (joinedCountEl) joinedCountEl.textContent = liveJoined.length;
    if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
    if (adminCountEl) adminCountEl.textContent = liveAdmin.length;

    // Keep the local module-level arrays in sync too, so any other code
    // still reading the bare `myGroups`/`joinedGroups`/`adminGroups`/`groups`
    // variables (e.g. renderGroupsListSecure()) sees the real data as well.
    if (GC) {
      try {
        setGroups(liveGroups);
        setMyGroups(liveMyGroups);
        setJoinedGroups(liveJoined);
        setAdminGroups(liveAdmin);
      } catch (_) {}
    }
  } catch (error) {}
}

// FIX-GROUP-COUNTS-GLOBAL: group-ui.js / group-ui-patch.js call this guarded by
// `typeof updateGroupCounts === 'function'` against the *global* scope. Since
// this file is an ES module, the bare function declaration above was never
// visible outside this module, so those guards always failed and the My
// Groups / Joined / Admin tab badges stayed frozen at 0 even though this
// function's own logic (and the data behind it) was already correct.

export {
    API_WRAPPER,
    LOCAL_STORAGE_KEYS,
    acceptGroupInvite,
    addMemberOnline,
    addMemberToGroup,
    addMessageToChat,
    addSystemMessage,
    adjustTextareaHeight,
    analyzeGroupEnergy,
    apiInitialized,
    calculateGroupPulse,
    callInProgress,
    callStartTime,
    callTimer,
    canUserAddMembers,
    canUserChangeRole,
    canUserDeleteGroup,
    canUserManageGroup,
    canUserRemoveMembers,
    changeMemberRole,
    changeMemberRoleOnline,
    chatMessagesList,
    checkPostingRules,
    closeGroupChatMobile,
    createGroupOnline,
    currentParticipationMode,
    currentSearchTerm,
    currentTypeFilter,
    declineGroupInvite,
    deleteGroup,
    deleteGroupOnline,
    deleteMessage,
    energySuggestions,
    filterGroupsByType,
    formatDate,
    formatMessageTime,
    formatTimeAgo,
    friends,
    generateInitialTransparencyLog,
    getCurrentUser,
    getCurrentUserLocal,
    getUnifiedToken,
    getUserRoleInGroup,
    groupEvents,
    groupMessages,
    groupMoods,
    groupNotes,
    groupPurposes,
    groupRoles,
    groupThemes,
    groupTopics,
    groupTypes,
    groupTypingUsers,
    groupUnreadCounts,
    handleMemberAction,
    hideAllPanels,
    initializeModule,
    initializeTokenSystem,
    isAnonymousMode,
    isLoadedFromLocalStorage,
    isPageInitialized,
    isProcessingTokenQueue,
    isSilentMode,
    isTyping,
    isUserAdmin,
    joinGroupOnline,
    leaveGroupConfirm,
    leaveGroupOnline,
    loadCachedDataInstantly,
    loadGroupChatMessages,
    loadGroupDetails,
    loadGroupEvents,
    loadGroupMembersForManagement,
    loadGroupNotes,
    loadGroupSettingsForManagement,
    loadTransparencyLog,
    loadUniqueFeaturesData,
    loadUniqueFeaturesForManagement,
    loadUniqueFeaturesPanels,
    localStream,
    logTransparencyAction,
    matchesFilters,
    matchesSearch,
    offlineOverlayDismissed,
    openAdminManagement,
    openGroupChat,
    participationModes,
    peerConnections,
    pendingGroupActions,
    postingRules,
    processPendingOfflineActions,
    processTokenQueue,
    queueApiCall,
    queueGroupAction,
    reactToMessage,
    removeMemberFromGroup,
    removeMemberOnline,
    removeSelectedFriend,
    renderFriendSelection,
    renderMembersList,
    replyToMessage,
    safeApiCall,
    safeGetElement,
    saveGroupSettings,
    saveGroupsToLocalStorage,
    saveMessageToCache,
    saveUnifiedToken,
    searchGroups,
    secureApiCall,
    selectedFriends,
    sendGroupMessage,
    sendGroupMessageOnline,
    setupTypingListener,
    showFriendSelection,
    showGroupDetails,
    showNotification,
    stopTypingIndicator,
    syncGroupInvitesFromServer,
    syncGroupsFromServer,
    syncUniqueFeaturesData,
    toggleAnonymousMode,
    toggleSilentMode,
    tokenQueue,
    tokenReadyPromise,
    tokenReadyReject,
    tokenReadyResolve,
    transparencyLog,
    updateChatHeaderUniqueFeatures,
    updateCreateGroupPostingRulesUI,
    updateGroupCounts,
    updateGroupInAllLists,
    updateGroupPrimaryActionState,
    updateGroupThemeOnSettingChange,
    updateParticipationModeButtons,
    updatePostingRulesUI,
    updateSelectedFriendsList,
    waitForTokenReady
};