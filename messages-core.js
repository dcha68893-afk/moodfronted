// =============================================
// IFRAME CONTROLLER - CENTRALIZED SESSION AUTHORITY INTEGRATION
// =============================================

// Import API functions from modular API modules
import { 
    secureFetch, 
    getCurrentUser, 
    login, 
    logout, 
    getSessionToken,
    refreshSession,
    validateSession,
    clearSession
} from './js/api.core.js';

import {
    fetchContacts,
    fetchChats,
    fetchMessages,
    sendMessage as apiSendMessage,
    editMessage as apiEditMessage,
    deleteMessage as apiDeleteMessage,
    addReaction as apiAddReaction,
    markChatAsRead as apiMarkChatAsRead,
    clearChatHistory as apiClearChatHistory,
    voteInPoll as apiVoteInPoll,
    reportMessage as apiReportMessage
} from '../messages.js';

console.log('[Iframe Controller] Initializing with centralized session authority');

// Global variables
export let currentUser = null;
export let currentChat = null;
export let currentFriend = null;
export let messages = [];
export let chats = [];
export let contacts = [];
export let isRecording = false;
export let mediaRecorder = null;
export let recordingTimer = null;
export let recordingStartTime = null;
export let typingTimeout = null;
export let isTyping = false;
export let selectedMessage = null;
export let currentThread = null;
export let chatThemes = {};
export let emojiPicker = null;
export let isSyncing = false;
export let audioPlayers = new Map();
export let editingMessageId = null;
export let replyToMessage = null;
export let currentCategory = 'all';
export let activeFormattingTags = new Set();
export let activeAudioElement = null;
export let scheduledMessages = [];
export let offlineQueue = [];
export let messageDrafts = {};
export let silentReactionsEnabled = true;
export let readOnlyMode = false;
export let currentAttachment = null;
export let searchResults = [];
export let currentSearchIndex = -1;
export let multiSendSelectedChats = new Set();
export let recordingCancelTimeout = null;
export let dragStartY = 0;
export let isDraggingToCancel = false;

// =============================================
// PARENT COORDINATION & SESSION MANAGEMENT
// =============================================

// Parent coordination state
let parentConnection = null;
let sessionData = null;
export let isParentReady = false;
export let isSessionReceived = false;
export let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Message types for parent-child communication
export const MESSAGE_TYPES = {
    // Child to Parent
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    REQUEST_UPDATE: 'REQUEST_SESSION_UPDATE',
    API_REQUEST: 'API_REQUEST',
    CHILD_ERROR: 'CHILD_ERROR',
    CHILD_STATE_UPDATE: 'CHILD_STATE_UPDATE',
    
    // Parent to Child
    PARENT_READY: 'PARENT_READY',
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    LOGOUT: 'LOGOUT',
    API_RESPONSE: 'API_RESPONSE',
    FORCE_RELOAD: 'FORCE_RELOAD'
};

// Local Storage Keys (for non-sensitive data only)
export const LOCAL_STORAGE_KEYS = {
    CHATS: 'knecta_chats',
    MESSAGES: 'knecta_messages_',
    CHAT_THEMES: 'knecta_chat_themes',
    OFFLINE_MESSAGES: 'knecta_offline_messages',
    STARRED_MESSAGES: 'knecta_starred_messages',
    CHAT_BACKGROUNDS: 'knecta_chat_backgrounds',
    BLOCKED_USERS: 'knecta_blocked_users',
    ARCHIVED_CHATS: 'knecta_archived_chats',
    USER_SETTINGS: 'knecta_user_settings',
    SYNC_TIMESTAMP: 'knecta_last_sync',
    MESSAGE_DRAFTS: 'knecta_message_drafts',
    SCHEDULED_MESSAGES: 'knecta_scheduled_messages',
    OFFLINE_QUEUE: 'knecta_offline_queue',
    NOTE_MESSAGES: 'knecta_note_messages',
    VIEW_ONCE_MESSAGES: 'knecta_view_once_messages',
    UI_STATE: 'knecta_ui_state'
};

/**
 * Initialize parent coordination system
 * 1. Verify parent presence
 * 2. Establish secure messaging channel
 * 3. Start handshake protocol
 */
export function initializeParentCoordination() {
    console.log('[Parent] Initializing parent coordination system');
    
    // Verify parent presence
    if (!window.parent || window.parent === window) {
        console.error('[Parent] No parent window detected or same window');
        showReconnectState('No parent connection available');
        return;
    }
    
    // Verify same-origin
    try {
        const parentOrigin = window.parent.location.origin;
        const currentOrigin = window.location.origin;
        
        if (parentOrigin !== currentOrigin) {
            console.error('[Parent] Cross-origin parent detected:', parentOrigin, currentOrigin);
            showReconnectState('Security violation: Cross-origin access denied');
            return;
        }
        
        console.log('[Parent] Same-origin verified:', parentOrigin);
    } catch (error) {
        console.error('[Parent] Cannot access parent origin (security restriction):', error);
        // Continue anyway - may be iframed from same origin but restricted
    }
    
    // Setup message event listener
    window.addEventListener('message', handleParentMessage, false);
    
    // Initialize parent connection
    parentConnection = {
        isConnected: false,
        lastHeartbeat: Date.now(),
        sessionId: null,
        parentWindow: window.parent
    };
    
    // Start handshake protocol
    startHandshake();
    
    // Setup heartbeat monitoring
    startHeartbeatMonitoring();
}

/**
 * Handle messages from parent window
 */
function handleParentMessage(event) {
    // Verify message origin (if possible)
    try {
        // Note: We may not be able to check event.origin due to same-origin restrictions
        // But we can validate the message structure
        if (!event.data || typeof event.data !== 'object') {
            console.warn('[Parent] Invalid message format received');
            return;
        }
        
    const { type, data, requestId } = event.data;
    
    if (!MESSAGE_TYPES[type]) {
        console.warn('[Parent] Unknown message type:', type);
        return;
    }
    
    console.log(`[Parent] Received message: ${type}`, data ? '[with data]' : '');
    
    switch (type) {
        case MESSAGE_TYPES.PARENT_READY:
            handleParentReady(data);
            break;
            
        case MESSAGE_TYPES.SESSION_DATA:
            handleSessionData(data);
            break;
            
        case MESSAGE_TYPES.SESSION_UPDATE:
            handleSessionUpdate(data);
            break;
            
        case MESSAGE_TYPES.SESSION_EXPIRED:
            handleSessionExpired();
            break;
            
        case MESSAGE_TYPES.LOGOUT:
            handleLogout();
            break;
            
        case MESSAGE_TYPES.API_RESPONSE:
            handleApiResponse(requestId, data);
            break;
            
        case MESSAGE_TYPES.FORCE_RELOAD:
            handleForceReload();
            break;
            
        default:
            console.warn('[Parent] Unhandled message type:', type);
    }
    
} catch (error) {
    console.error('[Parent] Error handling parent message:', error);
    sendToParent(MESSAGE_TYPES.CHILD_ERROR, {
        error: error.message,
        timestamp: Date.now()
    });
}
}

/**
 * Send message to parent window
 */
export function sendToParent(type, data = null, requestId = null) {
    if (!window.parent || !parentConnection) {
        console.error('[Parent] Cannot send message: No parent connection');
        return false;
    }
    
    try {
        const message = {
            type: type,
            data: data,
            requestId: requestId,
            timestamp: Date.now(),
            source: 'chat-iframe'
        };
        
        // Send to parent window
        window.parent.postMessage(message, window.location.origin);
        
        console.log(`[Parent] Sent message: ${type}`, data ? '[with data]' : '');
        return true;
        
    } catch (error) {
        console.error('[Parent] Error sending message to parent:', error);
        return false;
    }
}

/**
 * Start handshake protocol with parent
 */
function startHandshake() {
    console.log('[Parent] Starting handshake protocol');
    
    // Send CHILD_READY message
    sendToParent(MESSAGE_TYPES.CHILD_READY, {
        version: '1.0',
        features: ['chat', 'messaging', 'contacts'],
        readyAt: Date.now()
    });
    
    // Schedule REQUEST_SESSION with exponential backoff
    scheduleSessionRequest(0);
}

/**
 * Schedule session request with exponential backoff
 */
function scheduleSessionRequest(attempt) {
    if (isSessionReceived) {
        console.log('[Parent] Session already received, skipping request');
        return;
    }
    
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[Parent] Max reconnection attempts reached');
        showReconnectState('Unable to establish connection with parent');
        return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff up to 30s
    const jitter = Math.random() * 1000; // Add jitter to avoid thundering herd
    
    console.log(`[Parent] Scheduling session request in ${Math.round(delay + jitter)}ms (attempt ${attempt + 1})`);
    
    setTimeout(() => {
        if (!isSessionReceived) {
            sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
                attempt: attempt + 1,
                timestamp: Date.now()
            });
            
            // Schedule next attempt if no response
            if (!isSessionReceived) {
                scheduleSessionRequest(attempt + 1);
            }
        }
    }, delay + jitter);
}

/**
 * Handle PARENT_READY message
 */
function handleParentReady(data) {
    console.log('[Parent] Parent is ready', data);
    
    isParentReady = true;
    parentConnection.isConnected = true;
    parentConnection.lastHeartbeat = Date.now();
    
    // If we haven't received session yet, request it
    if (!isSessionReceived) {
        sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
            immediate: true,
            timestamp: Date.now()
        });
    }
}

/**
 * Handle SESSION_DATA message
 */
function handleSessionData(data) {
    console.log('[Parent] Received session data');
    
    // Validate session data schema
    if (!validateSessionData(data)) {
        console.error('[Parent] Invalid session data schema');
        sendToParent(MESSAGE_TYPES.CHILD_ERROR, {
            error: 'Invalid session data schema',
            receivedData: data
        });
        return;
    }
    
    // Store session data
    sessionData = data;
    isSessionReceived = true;
    reconnectAttempts = 0;
    
    // Extract user data
    if (data.user) {
        currentUser = data.user;
        console.log('[Parent] User authenticated:', currentUser.displayName || currentUser.email || 'Unknown');
    }
    
    // Extract token if available
    if (data.token) {
        console.log('[Parent] Token received (not stored locally)');
    }
    
    // Send acknowledgment
    sendToParent(MESSAGE_TYPES.CHILD_STATE_UPDATE, {
        state: 'authenticated',
        userId: currentUser?.uid,
        timestamp: Date.now()
    });
}

/**
 * Handle SESSION_UPDATE message
 */
function handleSessionUpdate(data) {
    console.log('[Parent] Received session update');
    
    if (!validateSessionData(data)) {
        console.error('[Parent] Invalid session update schema');
        return;
    }
    
    // Update session data
    sessionData = { ...sessionData, ...data };
    
    if (data.user) {
        currentUser = data.user;
        console.log('[Parent] User data updated');
    }
}

/**
 * Handle SESSION_EXPIRED message
 */
function handleSessionExpired() {
    console.warn('[Parent] Session expired');
    
    // Clear local session state
    sessionData = null;
    isSessionReceived = false;
    currentUser = null;
    
    // Request new session
    setTimeout(() => {
        sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
            reason: 'session_expired',
            timestamp: Date.now()
        });
    }, 2000);
}

/**
 * Handle LOGOUT message
 */
function handleLogout() {
    console.log('[Parent] Logout requested by parent');
    
    // Clear all sensitive data
    sessionData = null;
    isSessionReceived = false;
    currentUser = null;
    
    // Clear local storage (keep non-sensitive UI state)
    clearSensitiveLocalStorage();
}

/**
 * Handle API_RESPONSE message
 */
function handleApiResponse(requestId, data) {
    // This would be handled by the API request system
    // Implementation depends on how API requests are managed
    console.log(`[Parent] API response for request ${requestId}`, data);
}

/**
 * Handle FORCE_RELOAD message
 */
function handleForceReload() {
    console.log('[Parent] Force reload requested');
    window.location.reload();
}

/**
 * Validate session data schema
 */
function validateSessionData(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }
    
    // Must have either user object or token
    if (!data.user && !data.token) {
        return false;
    }
    
    // If user object exists, validate it
    if (data.user) {
        if (!data.user.uid || typeof data.user.uid !== 'string') {
            return false;
        }
        
        // Basic user validation
        const requiredUserFields = ['uid', 'email'];
        for (const field of requiredUserFields) {
            if (!data.user[field]) {
                console.warn(`[Parent] Missing required user field: ${field}`);
                return false;
            }
        }
    }
    
    // If token exists, validate it
    if (data.token && typeof data.token !== 'string') {
        return false;
    }
    
    return true;
}

/**
 * Start heartbeat monitoring
 */
function startHeartbeatMonitoring() {
    setInterval(() => {
        if (parentConnection && parentConnection.isConnected) {
            const timeSinceHeartbeat = Date.now() - parentConnection.lastHeartbeat;
            
            if (timeSinceHeartbeat > 60000) { // 60 seconds
                console.warn('[Parent] No heartbeat from parent for', timeSinceHeartbeat, 'ms');
                parentConnection.isConnected = false;
                
                // Try to reconnect
                sendToParent(MESSAGE_TYPES.CHILD_READY, {
                    reconnecting: true,
                    timestamp: Date.now()
                });
            }
        }
    }, 10000); // Check every 10 seconds
}

/**
 * Show reconnect state when parent connection is lost
 */
export function showReconnectState(message) {
    console.error('[Parent] Showing reconnect state:', message);
}

/**
 * Hide reconnect state
 */
export function hideReconnectState() {
    // Implementation in UI file
}

/**
 * Clear sensitive data from local storage
 */
function clearSensitiveLocalStorage() {
    // Clear any potentially sensitive data
    // Note: We never stored tokens, but clear any user-specific cached data
    const sensitiveKeys = [
        'knecta_current_user',
        'knecta_user_profile',
        'knecta_current_chat',
        'knecta_chats',
        'knecta_contacts'
    ];
    
    sensitiveKeys.forEach(key => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('[Parent] Error clearing localStorage key:', key, error);
        }
    });
    
    // Clear all message caches
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('knecta_messages_')) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn('[Parent] Error clearing message cache:', key, error);
            }
        }
    }
}

// =============================================
// API INTEGRATION THROUGH MODULAR IMPORTS
// =============================================

/**
 * Make API request using imported secureFetch
 */
export async function apiRequest(endpoint, options = {}) {
    // Block API calls if no session
    if (!isSessionReceived || !currentUser) {
        throw new Error('Authentication required. No valid session.');
    }
    
    try {
        const response = await secureFetch(endpoint, options);
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('[API] Request error:', error);
        throw error;
    }
}

// =============================================
// CORE CHAT FUNCTIONS (UPDATED FOR MODULAR IMPORTS)
// =============================================

export function loadUserSettings() {
    try {
        const settings = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SETTINGS);
        if (!settings) {
            const defaultSettings = {
                autoDownload: false,
                notificationSound: true,
                messagePreview: true,
                onlineStatus: true,
                readReceipts: true,
                typingIndicators: true,
                theme: 'light',
                fontSize: 'medium',
                silentReactions: true,
                readOnlyMode: false,
                autoSaveDrafts: true,
                offlineMode: true,
                viewOnceEnabled: true
            };
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_SETTINGS, JSON.stringify(defaultSettings));
        } else {
            const parsed = JSON.parse(settings);
            silentReactionsEnabled = parsed.silentReactions !== false;
            readOnlyMode = parsed.readOnlyMode === true;
        }
    } catch (error) {
        console.error('Error loading user settings:', error);
    }
}

export function loadMessageDrafts() {
    try {
        const drafts = localStorage.getItem(LOCAL_STORAGE_KEYS.MESSAGE_DRAFTS);
        if (drafts) {
            messageDrafts = JSON.parse(drafts);
        }
    } catch (error) {
        console.error('Error loading message drafts:', error);
    }
}

export function saveMessageDraft() {
    if (!currentChat) return;
    
    const messageInput = document.getElementById('messageInput');
    const attachmentPreview = document.getElementById('attachmentPreview');
    
    const draft = messageInput ? messageInput.value.trim() : '';
    const attachment = currentAttachment ? {
        type: currentAttachment.type,
        data: currentAttachment.data,
        name: currentAttachment.name,
        size: currentAttachment.size
    } : null;
    
    if (draft || attachment) {
        messageDrafts[currentChat.id] = {
            text: draft,
            attachment: attachment,
            timestamp: Date.now()
        };
        localStorage.setItem(LOCAL_STORAGE_KEYS.MESSAGE_DRAFTS, JSON.stringify(messageDrafts));
    } else if (messageDrafts[currentChat.id]) {
        delete messageDrafts[currentChat.id];
        localStorage.setItem(LOCAL_STORAGE_KEYS.MESSAGE_DRAFTS, JSON.stringify(messageDrafts));
    }
}

export function loadMessageDraft() {
    if (!currentChat) return;
}

export function updateDraftBadge(hasDraft) {
    // Implementation in UI file
}

export function showAttachmentPreview(attachment) {
    // Implementation in UI file
}

export function removeAttachment() {
    currentAttachment = null;
}

export function loadScheduledMessages() {
    try {
        const scheduled = localStorage.getItem(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES);
        if (scheduled) {
            scheduledMessages = JSON.parse(scheduled);
        }
    } catch (error) {
        console.error('Error loading scheduled messages:', error);
    }
}

export function loadOfflineQueue() {
    try {
        const queue = localStorage.getItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        if (queue) {
            offlineQueue = JSON.parse(queue);
        }
    } catch (error) {
        console.error('Error loading offline queue:', error);
    }
}

export async function loadContacts() {
    try {
        // Check if we have a session
        if (!isSessionReceived || !currentUser) {
            console.log('[Contacts] No session, using cached contacts');
            const cachedContacts = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
            if (cachedContacts) {
                contacts = JSON.parse(cachedContacts);
            }
            return;
        }
        
        // Use imported fetchContacts function
        try {
            const contactsData = await fetchContacts();
            if (contactsData && contactsData.contacts) {
                contacts = contactsData.contacts;
                localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
            }
        } catch (error) {
            console.log('[Contacts] Could not fetch fresh contacts:', error.message);
            // Use cached contacts
            const cachedContacts = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
            if (cachedContacts) {
                contacts = JSON.parse(cachedContacts);
            }
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

export async function loadChats() {
    try {
        // Check if we have a session
        if (!isSessionReceived || !currentUser) {
            console.log('[Chats] No session, using cached chats');
            const cachedChats = localStorage.getItem(LOCAL_STORAGE_KEYS.CHATS);
            if (cachedChats) {
                chats = JSON.parse(cachedChats);
            }
            return;
        }
        
        // Use imported fetchChats function
        try {
            const chatsData = await fetchChats();
            if (chatsData && chatsData.chats) {
                chats = chatsData.chats;
                localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
            }
        } catch (error) {
            console.log('[Chats] Could not fetch fresh chats:', error.message);
            // Use cached chats
            const cachedChats = localStorage.getItem(LOCAL_STORAGE_KEYS.CHATS);
            if (cachedChats) {
                chats = JSON.parse(cachedChats);
            }
        }
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

export async function openChat(chat) {
    try {
        if (chat.blocked && chat.type !== 'note') {
            return false;
        }
        
        currentChat = chat;
        currentFriend = {
            uid: chat.friendId,
            displayName: chat.friendName,
            username: chat.friendUsername,
            photoURL: chat.friendAvatar
        };
        
        await loadMessages();
        
        if (chat.unreadCount > 0) {
            await markChatAsRead(chat.id);
        }
        
        applyChatTheme(chat.friendId);
        loadMessageDraft();
        
        // Save UI state
        saveUIState();
        
        return true;
        
    } catch (error) {
        console.error('Error opening chat:', error);
        return false;
    }
}

export async function loadChatByFriendId(friendId) {
    try {
        let existingChat = chats.find(chat => chat.friendId === friendId);
        
        if (existingChat) {
            await openChat(existingChat);
            return;
        }
        
        try {
            // Check if we have a session
            if (!isSessionReceived || !currentUser) {
                console.log('[Chat] No session, creating local chat');
                createLocalChat(friendId, {
                    displayName: 'Unknown User',
                    photoURL: ''
                });
                return;
            }
            
            // Use imported API functions
            try {
                const userResponse = await secureFetch(`/api/user/${friendId}`);
                if (userResponse.ok) {
                    const friendData = await userResponse.json();
                    const chatResponse = await secureFetch('/api/chats', {
                        method: 'POST',
                        body: JSON.stringify({ friendId })
                    });
                    
                    if (chatResponse.ok) {
                        const newChat = await chatResponse.json();
                        chats.unshift(newChat);
                        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
                        
                        await openChat(newChat);
                    }
                }
                
            } catch (error) {
                console.error('Error loading chat by friend ID:', error);
                createLocalChat(friendId, {
                    displayName: 'Unknown User',
                    photoURL: ''
                });
            }
            
        } catch (error) {
            console.error('Error in loadChatByFriendId:', error);
        }
    } catch (error) {
        console.error('Error in loadChatByFriendId:', error);
    }
}

export function createLocalChat(friendId, friendData) {
    const newChat = {
        id: 'chat_' + Date.now(),
        friendId: friendId,
        friendName: friendData.displayName,
        friendUsername: '',
        friendAvatar: friendData.photoURL,
        lastMessage: '',
        lastMessageAt: new Date(),
        unreadCount: 0,
        type: 'direct',
        archived: false,
        blocked: false
    };
    
    chats.unshift(newChat);
    localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
    
    openChat(newChat);
}

export async function loadMessages() {
    try {
        messages = [];
        editingMessageId = null;
        replyToMessage = null;
        
        // Try to load from cache first
        const cachedMessages = localStorage.getItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`);
        if (cachedMessages) {
            messages = JSON.parse(cachedMessages);
        }
        
        // Then try to fetch fresh messages if we have a session
        if (isSessionReceived && currentUser) {
            try {
                const messagesData = await fetchMessages(currentChat.id);
                if (messagesData && messagesData.messages) {
                    messages = messagesData.messages;
                    localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
                }
            } catch (error) {
                console.log('Could not fetch fresh messages:', error.message);
                // Keep cached messages
            }
        }
        
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

export function formatMessageText(text) {
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

export function initializeAudioWaveforms() {
    messages.forEach(message => {
        if (message.type === 'audio' && message.content) {
            const waveformId = `waveform_${message.id}`;
            
            if (!audioPlayers.has(message.id)) {
                try {
                    const wavesurfer = WaveSurfer.create({
                        container: '#' + waveformId,
                        waveColor: message.senderId === currentUser.uid ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.2)',
                        progressColor: message.senderId === currentUser.uid ? '#ffffff' : '#0084ff',
                        cursorWidth: 0,
                        barWidth: 2,
                        barGap: 1,
                        height: 40,
                        responsive: true
                    });
                    
                    wavesurfer.load(message.content);
                    
                    audioPlayers.set(message.id, wavesurfer);
                } catch (error) {
                    console.error('Error creating waveform:', error);
                }
            }
        }
    });
}

export async function sendMessage(content, type = 'text', options = {}) {
    if (!currentChat || !currentUser) {
        return false;
    }
    
    if (!content && type === 'text' && !currentAttachment) {
        return false;
    }
    
    if (readOnlyMode || currentChat.readOnly) {
        return false;
    }
    
    try {
        const messageData = {
            id: 'temp_' + Date.now(),
            senderId: currentUser.uid,
            senderName: currentUser.displayName || 'You',
            content: content,
            type: type,
            timestamp: new Date(),
            status: 'sending',
            chatId: currentChat.id,
            edited: false,
            deleted: false,
            ...options
        };
        
        if (currentAttachment) {
            messageData.type = currentAttachment.type;
            messageData.content = currentAttachment.data;
            messageData.fileName = currentAttachment.name;
            messageData.fileSize = currentAttachment.size;
            if (currentAttachment.duration) {
                messageData.duration = currentAttachment.duration;
            }
        }
        
        if (replyToMessage) {
            messageData.replyTo = {
                messageId: replyToMessage.id,
                senderId: replyToMessage.senderId,
                senderName: replyToMessage.senderName,
                content: replyToMessage.content,
                type: replyToMessage.type,
                contextLabel: 'Replying to:'
            };
        }
        
        const isOnline = navigator.onLine;
        
        if (!isOnline) {
            offlineQueue.push(messageData);
            localStorage.setItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(offlineQueue));
        }
        
        messages.push(messageData);
        
        replyToMessage = null;
        removeAttachment();
        
        saveMessageDraft();
        
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        
        updateChatLastMessage(content, type);
        
        if (isOnline && isSessionReceived) {
            try {
                const savedMessage = await apiSendMessage(currentChat.id, messageData);
                
                const messageIndex = messages.findIndex(m => m.id === messageData.id);
                if (messageIndex !== -1) {
                    messages[messageIndex].id = savedMessage.id;
                    messages[messageIndex].status = 'sent';
                    localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
                }
            } catch (error) {
                console.error('Error sending message to API:', error);
                // Message stays in "sending" state
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Error sending message:', error);
        return false;
    }
}

export async function sendMessageWithOptions(content, options = {}) {
    const messageOptions = {
        viewOnce: options.viewOnce || false,
        expiresAt: options.expiresAt || null,
        type: options.type || 'text',
        isNote: options.isNote || false
    };
    
    if (options.isNote) {
        messageOptions.type = 'note';
        let notesChat = chats.find(chat => chat.type === 'note');
        if (!notesChat) {
            notesChat = {
                id: 'notes_' + Date.now(),
                friendId: currentUser.uid,
                friendName: 'Notes',
                friendUsername: 'notes',
                friendAvatar: '',
                lastMessage: content,
                lastMessageAt: new Date(),
                unreadCount: 0,
                type: 'note',
                archived: false,
                blocked: false
            };
            chats.push(notesChat);
            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        }
        
        currentChat = notesChat;
        await loadMessages();
    }
    
    return await sendMessage(content, messageOptions.type, messageOptions);
}

export async function scheduleMessage(content, scheduleTime, options = {}) {
    if (!scheduleTime || scheduleTime <= Date.now()) {
        await sendMessageWithOptions(content, options);
        return;
    }
    
    const scheduledMessage = {
        id: 'scheduled_' + Date.now(),
        content: content,
        scheduleTime: scheduleTime,
        chatId: currentChat.id,
        options: options,
        status: 'scheduled',
        attachment: currentAttachment
    };
    
    scheduledMessages.push(scheduledMessage);
    localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, JSON.stringify(scheduledMessages));
    
    updateScheduleBadge();
}

export function checkScheduledMessages() {
    const now = Date.now();
    const toSend = [];
    
    scheduledMessages = scheduledMessages.filter(msg => {
        if (msg.scheduleTime <= now && msg.status === 'scheduled') {
            toSend.push(msg);
            return false;
        }
        return true;
    });
    
    toSend.forEach(async (msg) => {
        if (msg.chatId === currentChat?.id) {
            if (msg.attachment) {
                currentAttachment = msg.attachment;
                await sendMessageWithOptions(msg.content, msg.options);
                currentAttachment = null;
            } else {
                await sendMessageWithOptions(msg.content, msg.options);
            }
        }
        localStorage.setItem(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, JSON.stringify(scheduledMessages));
    });
    
    setTimeout(checkScheduledMessages, 60000);
}

export function updateScheduleBadge() {
    // Implementation in UI file
}

export async function checkOfflineQueue() {
    if (!navigator.onLine || offlineQueue.length === 0 || !isSessionReceived) return;
    
    const failedMessages = [];
    
    for (const message of offlineQueue) {
        try {
            await apiSendMessage(message.chatId, message);
            
            const localIndex = messages.findIndex(m => m.id === message.id);
            if (localIndex !== -1) {
                messages.splice(localIndex, 1);
            }
        } catch (error) {
            console.error('Failed to send queued message:', error);
            failedMessages.push(message);
        }
    }
    
    offlineQueue = failedMessages;
    localStorage.setItem(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(offlineQueue));
}

export async function sendToMultipleChats(content, chatIds) {
    if (!content && !currentAttachment) {
        return false;
    }
    
    if (chatIds.length === 0) {
        return false;
    }
    
    // Check session
    if (!isSessionReceived) {
        return false;
    }
    
    const results = [];
    
    for (const chatId of chatIds) {
        try {
            const messageData = {
                content: content,
                type: currentAttachment ? currentAttachment.type : 'text',
                timestamp: new Date(),
                chatId: chatId
            };
            
            if (currentAttachment) {
                messageData.fileName = currentAttachment.name;
                messageData.fileSize = currentAttachment.size;
                if (currentAttachment.duration) {
                    messageData.duration = currentAttachment.duration;
                }
            }
            
            try {
                await apiSendMessage(chatId, messageData);
                
                results.push({ chatId, success: true });
                
                const chat = chats.find(c => c.id === chatId);
                if (chat) {
                    chat.lastMessage = content || `Sent a ${currentAttachment?.type || 'message'}`;
                    chat.lastMessageAt = new Date();
                    localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
                }
            } catch (error) {
                console.error(`Error sending to chat ${chatId}:`, error);
                results.push({ chatId, success: false });
            }
        } catch (error) {
            console.error(`Error in sendToMultipleChats for ${chatId}:`, error);
            results.push({ chatId, success: false });
        }
    }
    
    const successCount = results.filter(r => r.success).length;
    return successCount;
}

export async function editMessage(messageId, newContent) {
    try {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;
        
        messages[messageIndex].content = newContent;
        messages[messageIndex].edited = true;
        messages[messageIndex].editedAt = new Date();
        
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        
        if (isSessionReceived) {
            await apiEditMessage(messageId, { content: newContent });
        }
        
        editingMessageId = null;
        
        return true;
        
    } catch (error) {
        console.error('Error editing message:', error);
        return false;
    }
}

export function saveEditedMessage(messageId) {
    const input = document.getElementById(`editMessageInput_${messageId}`);
    if (input && input.value.trim()) {
        return editMessage(messageId, input.value.trim());
    }
    return false;
}

export function cancelEditMessage() {
    editingMessageId = null;
}

export async function deleteMessage(messageId, forEveryone = false) {
    try {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;
        
        if (forEveryone) {
            messages[messageIndex].deleted = true;
            messages[messageIndex].deletedAt = new Date();
            
            if (isSessionReceived) {
                await apiDeleteMessage(messageId);
            }
        } else {
            messages.splice(messageIndex, 1);
        }
        
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        
        return true;
        
    } catch (error) {
        console.error('Error deleting message:', error);
        return false;
    }
}

export function updateChatLastMessage(content, type) {
    const chatIndex = chats.findIndex(chat => chat.id === currentChat.id);
    if (chatIndex !== -1) {
        chats[chatIndex].lastMessage = content || `Sent a ${type}`;
        chats[chatIndex].lastMessageAt = new Date();
        chats[chatIndex].unreadCount = 0;
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
    }
}

export async function markChatAsRead(chatId) {
    try {
        const chatIndex = chats.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            chats[chatIndex].unreadCount = 0;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        }
        
        if (isSessionReceived) {
            await apiMarkChatAsRead(chatId);
        }
        
        return true;
        
    } catch (error) {
        console.error('Error marking chat as read:', error);
        return false;
    }
}

export function showMessageActions(message, x, y) {
    selectedMessage = message;
}

export function closeMessageActions() {
    // Implementation in UI file
}

export function handleMessageAction(action) {
    if (!selectedMessage) return;
    
    switch (action) {
        case 'reply':
            replyToMessage = selectedMessage;
            break;
            
        case 'edit':
            if (selectedMessage.senderId === currentUser.uid && (selectedMessage.type === 'text' || selectedMessage.type === 'note')) {
                editingMessageId = selectedMessage.id;
            }
            break;
            
        case 'forward':
            showForwardMessage(selectedMessage);
            break;
            
        case 'copy':
            if (selectedMessage.type === 'text' || selectedMessage.type === 'note') {
                navigator.clipboard.writeText(selectedMessage.content);
            } else if (selectedMessage.type === 'image' || selectedMessage.type === 'file') {
                navigator.clipboard.writeText(selectedMessage.content);
            }
            break;
            
        case 'star':
            toggleStarMessage(selectedMessage.id);
            break;
            
        case 'report':
            showReportModal(selectedMessage);
            break;
            
        case 'react-like':
            addReaction(selectedMessage.id, '👍', true);
            break;
            
        case 'react-love':
            addReaction(selectedMessage.id, '❤️', true);
            break;
            
        case 'react-laugh':
            addReaction(selectedMessage.id, '😂', true);
            break;
            
        case 'delete':
            const forEveryone = selectedMessage.senderId === currentUser.uid;
            deleteMessage(selectedMessage.id, forEveryone);
            break;
            
        case 'info':
            showMessageInfo(selectedMessage);
            break;
    }
    
    closeMessageActions();
}

export function showForwardMessage(message) {
    const forwardText = `[Forwarded] ${message.content}`;
    navigator.clipboard.writeText(forwardText);
}

export function toggleStarMessage(messageId) {
    try {
        const starredMessages = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.STARRED_MESSAGES) || '{}');
        
        if (starredMessages[messageId]) {
            delete starredMessages[messageId];
        } else {
            starredMessages[messageId] = true;
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.STARRED_MESSAGES, JSON.stringify(starredMessages));
        
        return !starredMessages[messageId];
        
    } catch (error) {
        console.error('Error toggling star:', error);
        return false;
    }
}

export function showMessageInfo(message) {
    const infoText = `
Message Information:

Sent: ${formatDateTime(message.timestamp)}
${message.edited ? `Edited: ${formatDateTime(message.editedAt)}\n` : ''}
${message.deleted ? `Deleted: ${formatDateTime(message.deletedAt)}\n` : ''}
${message.viewOnce ? `View once: ${message.viewed ? 'Viewed' : 'Not viewed'}\n` : ''}
${message.expiresAt ? `Expires: ${formatDateTime(message.expiresAt)}\n` : ''}
Status: ${message.status || 'unknown'}
Type: ${message.type}
${message.fileName ? `File: ${message.fileName}\n` : ''}
${message.fileSize ? `Size: ${formatFileSize(message.fileSize)}\n` : ''}
${message.duration ? `Duration: ${Math.floor(message.duration / 60)}:${(message.duration % 60).toString().padStart(2, '0')}\n` : ''}
${message.mood ? `Mood: ${message.mood}\n` : ''}
Message ID: ${message.id.substring(0, 8)}...
    `;
    
    return infoText;
}

export function showReportModal(message) {
    localStorage.setItem('knecta_reported_message', JSON.stringify({
        messageId: message.id,
        chatId: currentChat.id,
        senderId: message.senderId,
        content: message.content,
        type: message.type,
        timestamp: new Date()
    }));
}

export function submitReport() {
    const reportText = document.getElementById('reportText');
    if (!reportText) return false;
    
    const reportTextValue = reportText.value.trim();
    if (!reportTextValue) {
        return false;
    }
    
    try {
        const reportData = {
            message: JSON.parse(localStorage.getItem('knecta_reported_message')),
            reason: reportTextValue,
            reporterId: currentUser.uid,
            timestamp: new Date()
        };
        
        const reports = JSON.parse(localStorage.getItem('knecta_reports') || '[]');
        reports.push(reportData);
        localStorage.setItem('knecta_reports', JSON.stringify(reports));
        
        if (isSessionReceived) {
            apiReportMessage(reportData);
        }
        
        return true;
        
    } catch (error) {
        console.error('Error submitting report:', error);
        return false;
    }
}

export async function addReaction(messageId, emoji, silent = false) {
    if (!currentChat || !currentUser) return false;
    
    try {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;
        
        if (!messages[messageIndex].reactions) {
            messages[messageIndex].reactions = {};
        }
        
        if (!messages[messageIndex].reactions[emoji]) {
            messages[messageIndex].reactions[emoji] = [];
        }
        
        const userIndex = messages[messageIndex].reactions[emoji].indexOf(currentUser.uid);
        
        if (userIndex > -1) {
            messages[messageIndex].reactions[emoji].splice(userIndex, 1);
        } else {
            messages[messageIndex].reactions[emoji].push(currentUser.uid);
        }
        
        if (messages[messageIndex].reactions[emoji].length === 0) {
            delete messages[messageIndex].reactions[emoji];
        }
        
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        
        if (!silent && isSessionReceived) {
            await apiAddReaction(messageId, {
                emoji: emoji,
                action: userIndex > -1 ? 'remove' : 'add'
            });
        }
        
        return userIndex > -1 ? 'removed' : 'added';
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        return false;
    }
}

export function initEmojiPicker() {
    emojiPicker = document.querySelector('emoji-picker');
    if (emojiPicker) {
        emojiPicker.addEventListener('emoji-click', event => {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.value += event.detail.unicode;
                messageInput.focus();
            }
        });
    }
}

export function toggleEmojiPicker() {
    // Implementation in UI file
}

export function closeEmojiPickerOnClickOutside(event) {
    // Implementation in UI file
}

export function toggleFormattingToolbar() {
    // Implementation in UI file
}

export function closeFormattingToolbarOnClickOutside(event) {
    // Implementation in UI file
}

export function toggleAttachmentOptions() {
    // Implementation in UI file
}

export function closeAttachmentOptionsOnClickOutside(event) {
    // Implementation in UI file
}

export function applyFormatting(tag) {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const input = messageInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selectedText = input.value.substring(start, end);
    
    let wrappedText = selectedText;
    
    switch (tag) {
        case 'b':
            wrappedText = `**${selectedText}**`;
            break;
        case 'i':
            wrappedText = `*${selectedText}*`;
            break;
        case 'code':
            wrappedText = `\`${selectedText}\``;
            break;
        case 'pre':
            wrappedText = `\`\`\`\n${selectedText}\n\`\`\``;
            break;
    }
    
    input.value = input.value.substring(0, start) + wrappedText + input.value.substring(end);
    input.focus();
    input.setSelectionRange(start + wrappedText.length, start + wrappedText.length);
}

export function setupScrollDetection() {
    // Implementation in UI file
}

export function updateJumpButtonVisibility() {
    // Implementation in UI file
}

export function jumpToLatest() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

export function searchInChat(query) {
    if (!query.trim()) {
        searchResults = [];
        currentSearchIndex = -1;
        return;
    }
    
    searchResults = messages.filter(msg => 
        !msg.deleted && 
        msg.content && 
        msg.content.toLowerCase().includes(query.toLowerCase())
    );
    
    return searchResults;
}

export function highlightText(text, query) {
    if (!text || !query) return escapeHtml(text);
    
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="search-highlight">$1</span>');
}

export function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightSearchResults(query) {
    // Implementation in UI file
}

export function removeSearchHighlights() {
    // Implementation in UI file
}

export function navigateToSearchResult(index) {
    if (index >= 0 && index < searchResults.length) {
        const messageId = searchResults[index].id;
        scrollToMessage(messageId);
    }
}

export function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new RecordRTC(stream, {
            type: 'audio',
            mimeType: 'audio/webm',
            recorderType: RecordRTC.StereoAudioRecorder,
            numberOfAudioChannels: 1,
            desiredSampRate: 16000,
            timeSlice: 1000,
            ondataavailable: function(blob) {}
        });
        
        mediaRecorder.startRecording();
        isRecording = true;
        
        recordingStartTime = Date.now();
        
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const recordingTimerEl = document.getElementById('recordingTimer');
            if (recordingTimerEl) recordingTimerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const recordingCancelOverlay = document.getElementById('recordingCancelOverlay');
            if (elapsed >= 1 && recordingCancelOverlay && !recordingCancelOverlay.classList.contains('active')) {
                recordingCancelOverlay.classList.add('active');
            }
        }, 1000);
        
        return true;
        
    } catch (error) {
        console.error('Error starting recording:', error);
        return false;
    }
}

export async function stopRecording() {
    if (!mediaRecorder || !isRecording) return null;
    
    clearInterval(recordingTimer);
    const recordingCancelOverlay = document.getElementById('recordingCancelOverlay');
    if (recordingCancelOverlay) recordingCancelOverlay.classList.remove('active');
    
    return new Promise((resolve) => {
        mediaRecorder.stopRecording(() => {
            const blob = mediaRecorder.getBlob();
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            
            if (duration < 1) {
                resolve(null);
                return;
            }
            
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result;
                const attachment = {
                    type: 'audio',
                    data: base64data,
                    name: `recording_${Date.now()}.webm`,
                    size: blob.size,
                    duration: duration
                };
                
                mediaRecorder.getInternalRecorder().stream.getTracks().forEach(track => track.stop());
                
                isRecording = false;
                mediaRecorder = null;
                
                resolve(attachment);
            };
            reader.readAsDataURL(blob);
        });
    });
}

export function cancelRecording() {
    if (!mediaRecorder || !isRecording) return false;
    
    clearInterval(recordingTimer);
    const recordingCancelOverlay = document.getElementById('recordingCancelOverlay');
    if (recordingCancelOverlay) recordingCancelOverlay.classList.remove('active');
    mediaRecorder.stopRecording();
    
    mediaRecorder.getInternalRecorder().stream.getTracks().forEach(track => track.stop());
    
    isRecording = false;
    mediaRecorder = null;
    
    return true;
}

export function handleAttachment(type) {
    switch (type) {
        case 'image':
            selectImage();
            break;
        case 'video':
            selectVideo();
            break;
        case 'audio':
            startRecording();
            break;
        case 'file':
            selectFile();
            break;
        case 'location':
            shareLocation();
            break;
        case 'poll':
            createPoll();
            break;
        case 'note':
            createNote();
            break;
    }
}

export function createNote() {
    const messageInput = document.getElementById('messageInput');
    const noteContent = messageInput ? messageInput.value.trim() : '';
    if (!noteContent && !currentAttachment) {
        return false;
    }
    
    return sendMessageWithOptions(noteContent || 'Note', { isNote: true });
}

export function selectImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    
    return new Promise((resolve) => {
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }
            
            if (file.size > 10 * 1024 * 1024) {
                resolve(null);
                return;
            }
            
            try {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result;
                    const attachment = {
                        type: 'image',
                        data: base64data,
                        name: file.name,
                        size: file.size
                    };
                    resolve(attachment);
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                console.error('Error uploading image:', error);
                resolve(null);
            }
        };
        
        input.click();
    });
}

export function selectVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = false;
    
    return new Promise((resolve) => {
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }
            
            if (file.size > 50 * 1024 * 1024) {
                resolve(null);
                return;
            }
            
            try {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(file);
                video.currentTime = 1;
                
                video.onloadeddata = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);
                    
                    const thumbnail = canvas.toDataURL('image/jpeg');
                    
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result;
                        const attachment = {
                            type: 'video',
                            data: base64data,
                            name: file.name,
                            size: file.size,
                            thumbnail: thumbnail,
                            duration: video.duration
                        };
                        resolve(attachment);
                    };
                    reader.readAsDataURL(file);
                };
                
            } catch (error) {
                console.error('Error uploading video:', error);
                resolve(null);
            }
        };
        
        input.click();
    });
}

export function selectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    
    return new Promise((resolve) => {
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }
            
            if (file.size > 100 * 1024 * 1024) {
                resolve(null);
                return;
            }
            
            try {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result;
                    const attachment = {
                        type: 'file',
                        data: base64data,
                        name: file.name,
                        size: file.size
                    };
                    resolve(attachment);
                };
                reader.readAsDataURL(file);
                
            } catch (error) {
                console.error('Error uploading file:', error);
                resolve(null);
            }
        };
        
        input.click();
    });
}

export function shareLocation() {
    if (!navigator.geolocation) {
        return Promise.resolve(null);
    }
    
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const locationName = `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
                    const mapURL = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;
                    
                    const attachment = {
                        type: 'location',
                        data: mapURL,
                        name: locationName,
                        latitude: latitude,
                        longitude: longitude
                    };
                    resolve(attachment);
                    
                } catch (error) {
                    console.error('Error getting location:', error);
                    resolve(null);
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

export function createPoll() {
    const question = prompt('Enter poll question:');
    if (!question) return null;
    
    const options = [];
    for (let i = 1; i <= 4; i++) {
        const option = prompt(`Enter option ${i} (leave empty to finish):`);
        if (!option) break;
        options.push({
            text: option,
            votes: 0,
            voters: []
        });
    }
    
    if (options.length < 2) {
        return null;
    }
    
    return { question, options };
}

export async function voteInPoll(messageId, optionIndex) {
    try {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;
        
        const poll = messages[messageIndex];
        
        if (poll.userVote !== null) {
            const prevOption = poll.options[poll.userVote];
            prevOption.votes = Math.max(0, prevOption.votes - 1);
            const voterIndex = prevOption.voters.indexOf(currentUser.uid);
            if (voterIndex > -1) {
                prevOption.voters.splice(voterIndex, 1);
            }
        }
        
        poll.options[optionIndex].votes++;
        poll.options[optionIndex].voters.push(currentUser.uid);
        poll.userVote = optionIndex;
        
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        
        if (isSessionReceived) {
            await apiVoteInPoll(messageId, { optionIndex: optionIndex });
        }
        
        return true;
        
    } catch (error) {
        console.error('Error voting in poll:', error);
        return false;
    }
}

export function openThread(messageId) {
    currentThread = messageId;
}

export async function loadThreadMessages(messageId) {
    try {
        // Thread loading logic
        return true;
    } catch (error) {
        console.error('Error loading thread messages:', error);
        return false;
    }
}

export function showChatInfo(chat) {
    return {
        title: chat.type === 'note' ? 'Notes' : chat.friendName,
        sections: [
            {
                title: 'Chat Information',
                items: [
                    { label: 'Name', value: chat.type === 'note' ? 'Notes' : chat.friendName },
                    { label: 'Status', value: chat.blocked ? 'Blocked' : chat.archived ? 'Archived' : chat.type === 'note' ? 'Notes' : 'Active' },
                    { label: 'Last Message', value: formatTime(chat.lastMessageAt) },
                    { label: 'Unread Messages', value: chat.unreadCount },
                    { label: 'Chat Type', value: chat.type === 'group' ? 'Group' : chat.type === 'note' ? 'Notes' : 'Direct' },
                    { label: 'Read Only', value: chat.readOnly ? 'Yes' : 'No' }
                ]
            }
        ]
    };
}

export function loadChatThemes() {
    try {
        const themes = localStorage.getItem(LOCAL_STORAGE_KEYS.CHAT_THEMES);
        if (themes) {
            chatThemes = JSON.parse(themes);
        }
    } catch (error) {
        console.error('Error loading chat themes:', error);
    }
}

export function applyChatTheme(friendId) {
    const theme = chatThemes[friendId];
    if (theme) {
        document.documentElement.style.setProperty('--chat-bubble-sent', theme.sentColor);
        document.documentElement.style.setProperty('--chat-bubble-received', theme.receivedColor);
        document.documentElement.style.setProperty('--chat-background', theme.background);
        document.documentElement.style.setProperty('--chat-font-family', theme.fontFamily);
    } else {
        document.documentElement.style.setProperty('--chat-bubble-sent', 'var(--primary-color)');
        document.documentElement.style.setProperty('--chat-bubble-received', 'var(--secondary-color)');
        document.documentElement.style.setProperty('--chat-background', 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23ffffff"/></svg>\')');
        document.documentElement.style.setProperty('--chat-font-family', '\'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif');
    }
}

export function startBackgroundSync() {
    setInterval(async () => {
        try {
            if (!isSyncing && navigator.onLine && isSessionReceived) {
                isSyncing = true;
                
                try {
                    const chatsData = await fetchChats();
                    if (chatsData && chatsData.chats) {
                        chats = chatsData.chats;
                        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
                    }
                } catch (error) {
                    console.error('Error syncing chats:', error);
                }
                
                try {
                    const contactsData = await fetchContacts();
                    if (contactsData && contactsData.contacts) {
                        contacts = contactsData.contacts;
                        localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
                    }
                } catch (error) {
                    console.error('Error syncing contacts:', error);
                }
                
                if (currentChat) {
                    try {
                        const messagesData = await fetchMessages(currentChat.id);
                        if (messagesData && messagesData.messages) {
                            messages = messagesData.messages;
                            localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
                        }
                    } catch (error) {
                        console.error('Error syncing messages:', error);
                    }
                }
                
                await checkOfflineQueue();
                
                isSyncing = false;
            }
        } catch (error) {
            console.error('Background sync error:', error);
            isSyncing = false;
        }
    }, 30000);
    
    setInterval(() => {
        if (currentChat) {
            localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
            saveMessageDraft();
        }
        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        saveUIState();
    }, 60000);
    
    window.addEventListener('online', () => {
        checkOfflineQueue();
    });
}

export function playNotificationSound() {
    const settings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USER_SETTINGS) || '{}');
    if (settings.notificationSound !== false) {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    }
}

export async function toggleReadOnly(chatId, readOnly) {
    try {
        const chatIndex = chats.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            chats[chatIndex].readOnly = readOnly;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
            
            if (currentChat && currentChat.id === chatId) {
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error toggling read-only mode:', error);
        return false;
    }
}

export async function toggleArchiveChat(chatId, archive) {
    try {
        const archivedChats = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS) || '[]');
        
        if (archive) {
            if (!archivedChats.includes(chatId)) {
                archivedChats.push(chatId);
            }
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) {
                archivedChats.splice(index, 1);
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, JSON.stringify(archivedChats));
        
        const chatIndex = chats.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            chats[chatIndex].archived = archive;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
            
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('Error toggling archive:', error);
        return false;
    }
}

export async function toggleBlockUser(friendId, block) {
    try {
        const blockedUsers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BLOCKED_USERS) || '[]');
        
        if (block) {
            if (!blockedUsers.includes(friendId)) {
                blockedUsers.push(friendId);
            }
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) {
                blockedUsers.splice(index, 1);
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.BLOCKED_USERS, JSON.stringify(blockedUsers));
        
        chats.forEach(chat => {
            if (chat.friendId === friendId) {
                chat.blocked = block;
            }
        });
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        
        await loadChats();
        
        return true;
        
    } catch (error) {
        console.error('Error toggling block:', error);
        return false;
    }
}

export async function clearChatHistory(chatId) {
    try {
        localStorage.removeItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${chatId}`);
        
        const chatIndex = chats.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            chats[chatIndex].lastMessage = '';
            chats[chatIndex].unreadCount = 0;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        }
        
        if (currentChat && currentChat.id === chatId) {
            messages = [];
        }
        
        if (isSessionReceived) {
            await apiClearChatHistory(chatId);
        }
        
        return true;
        
    } catch (error) {
        console.error('Error clearing chat history:', error);
        return false;
    }
}

export function loadMultiSendChats() {
    const availableChats = chats.filter(chat => 
        !chat.archived && !chat.blocked && chat.type !== 'note'
    );
    
    return availableChats;
}

export function updateMultiSendSelection(chatId, selected) {
    if (selected) {
        multiSendSelectedChats.add(chatId);
    } else {
        multiSendSelectedChats.delete(chatId);
    }
}

export function saveUIState() {
    try {
        const uiState = {
            lastChatId: currentChat?.id,
            lastCategory: currentCategory,
            timestamp: Date.now()
        };
        localStorage.setItem(LOCAL_STORAGE_KEYS.UI_STATE, JSON.stringify(uiState));
    } catch (error) {
        console.warn('[UI] Error saving UI state:', error);
    }
}

// =============================================
// AUTO-LOAD CHAT FROM URL PARAMETERS
// =============================================

export function getUserFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId') || urlParams.get('friendId') || urlParams.get('user');
    const username = urlParams.get('username') || urlParams.get('name') || 'Unknown User';
    const userAvatar = urlParams.get('avatar') || urlParams.get('photoURL') || '';
    
    if (userId) {
        return {
            userId: userId,
            username: decodeURIComponent(username),
            userAvatar: userAvatar
        };
    }
    return null;
}

export async function openChatPanel(userId, username, userAvatar = '') {
    try {
        if (!currentUser) {
            return false;
        }
        
        currentFriend = {
            uid: userId,
            displayName: username,
            photoURL: userAvatar
        };
        
        let existingChat = chats.find(chat => chat.friendId === userId);
        
        if (existingChat) {
            currentChat = existingChat;
            await loadMessages();
            applyChatTheme(userId);
        } else {
            try {
                if (isSessionReceived) {
                    const userResponse = await secureFetch(`/api/user/${userId}`);
                    if (userResponse.ok) {
                        const friendData = await userResponse.json();
                        const chatResponse = await secureFetch('/api/chats', {
                            method: 'POST',
                            body: JSON.stringify({ friendId: userId })
                        });
                        
                        if (chatResponse.ok) {
                            const newChat = await chatResponse.json();
                            chats.unshift(newChat);
                            localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
                            currentChat = newChat;
                            await loadMessages();
                            applyChatTheme(userId);
                            return true;
                        }
                    }
                } else {
                    console.log('No session, creating local chat');
                    createLocalChat(userId, {
                        displayName: username,
                        photoURL: userAvatar
                    });
                }
            } catch (error) {
                console.log('Could not fetch chat from API, creating local chat:', error);
                createLocalChat(userId, {
                    displayName: username,
                    photoURL: userAvatar
                });
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Error opening chat panel:', error);
        return false;
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

export function formatTime(date) {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now - messageDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    const hours = messageDate.getHours();
    const minutes = messageDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    
    return `${messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function formatDate(date) {
    if (!date) return 'Unknown';
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDate = new Date(date);
    
    if (messageDate.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else if (today.getFullYear() === messageDate.getFullYear()) {
        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    } else {
        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
}

export function formatDateTime(date) {
    if (!date) return 'Unknown';
    
    const messageDate = new Date(date);
    return messageDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// GLOBAL FUNCTIONS FOR EVENT HANDLERS
// =============================================

export function viewMedia(url, fileName) {
    return { url, fileName };
}

export function playVideo(url) {
    return url;
}

export function playAudio(messageId, url, duration) {
    const wavesurfer = audioPlayers.get(messageId);
    if (wavesurfer) {
        if (activeAudioElement && activeAudioElement !== messageId) {
            const otherWavesurfer = audioPlayers.get(activeAudioElement);
            if (otherWavesurfer) {
                otherWavesurfer.pause();
            }
        }
        
        if (wavesurfer.isPlaying()) {
            wavesurfer.pause();
            return 'paused';
        } else {
            wavesurfer.play();
            activeAudioElement = messageId;
            
            wavesurfer.on('audioprocess', () => {
                // Progress handling in UI
            });
            
            wavesurfer.on('finish', () => {
                activeAudioElement = null;
            });
            
            return 'playing';
        }
    }
    return 'error';
}

export function downloadFile(url, fileName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
}

export function openLocation(latitude, longitude) {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, '_blank');
    return url;
}

export function retryConnection() {
    initializeParentCoordination();
    return true;
}

// =============================================
// INITIALIZE THE APPLICATION
// =============================================

export function initChildSession() {
    return new Promise((resolve) => {
        if (isSessionReceived && currentUser) {
            resolve({ user: currentUser, sessionData });
        } else {
            // Wait for session
            const checkInterval = setInterval(() => {
                if (isSessionReceived && currentUser) {
                    clearInterval(checkInterval);
                    resolve({ user: currentUser, sessionData });
                }
            }, 100);
        }
    });
}

export function getCurrentSession() {
    return isSessionReceived ? { user: currentUser, sessionData } : null;
}

export function requestSessionUpdate() {
    if (parentConnection && parentConnection.isConnected) {
        sendToParent(MESSAGE_TYPES.REQUEST_UPDATE, {
            timestamp: Date.now()
        });
        return true;
    }
    return false;
}