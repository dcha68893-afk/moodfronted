// =============================================
// MESSAGES UI - UI LOGIC FOR CHAT INTERFACE
// =============================================

import {
    currentUser, currentChat, currentFriend, messages, chats, contacts,
    isRecording, mediaRecorder, recordingTimer, recordingStartTime,
    typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
    emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
    currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
    offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
    currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
    recordingCancelTimeout, dragStartY, isDraggingToCancel,
    isParentReady, isSessionReceived, isInitialized,
    MESSAGE_TYPES, LOCAL_STORAGE_KEYS,
    initializeParentCoordination, sendToParent, apiRequest,
    loadUserSettings, loadMessageDrafts, saveMessageDraft, loadMessageDraft,
    updateDraftBadge, showAttachmentPreview, removeAttachment,
    loadScheduledMessages, loadOfflineQueue, loadContacts, renderContactsList as renderContactsListCore,
    loadChats, renderChatsList as renderChatsListCore, openChat, loadChatByFriendId, createLocalChat,
    loadMessages, renderMessages, markMessageAsViewed, formatMessageText,
    initializeAudioWaveforms, sendMessage, sendMessageWithOptions,
    scheduleMessage, checkScheduledMessages, updateScheduleBadge as updateScheduleBadgeCore, checkOfflineQueue,
    sendToMultipleChats, editMessage, saveEditedMessage, cancelEditMessage,
    deleteMessage, updateChatLastMessage, markChatAsRead,
    showMessageActions as showMessageActionsCore, closeMessageActions as closeMessageActionsCore, handleMessageAction as handleMessageActionCore,
    showForwardMessage, toggleStarMessage as toggleStarMessageCore, showMessageInfo as showMessageInfoCore, showReportModal as showReportModalCore,
    submitReport as submitReportCore, addReaction, initEmojiPicker, toggleEmojiPicker as toggleEmojiPickerCore,
    closeEmojiPickerOnClickOutside as closeEmojiPickerOnClickOutsideCore, toggleFormattingToolbar as toggleFormattingToolbarCore,
    closeFormattingToolbarOnClickOutside as closeFormattingToolbarOnClickOutsideCore, toggleAttachmentOptions as toggleAttachmentOptionsCore,
    closeAttachmentOptionsOnClickOutside as closeAttachmentOptionsOnClickOutsideCore, applyFormatting,
    setupScrollDetection as setupScrollDetectionCore, updateJumpButtonVisibility as updateJumpButtonVisibilityCore, jumpToLatest,
    searchInChat as searchInChatCore, highlightText, escapeRegex, highlightSearchResults as highlightSearchResultsCore,
    removeSearchHighlights as removeSearchHighlightsCore, navigateToSearchResult as navigateToSearchResultCore, scrollToMessage,
    startRecording as startRecordingCore, stopRecording as stopRecordingCore, cancelRecording as cancelRecordingCore, handleAttachment as handleAttachmentCore,
    createNote as createNoteCore, selectImage, selectVideo, selectFile, shareLocation,
    createPoll, voteInPoll, openThread as openThreadCore, loadThreadMessages, showChatInfo as showChatInfoCore,
    loadChatThemes, applyChatTheme, startBackgroundSync as startBackgroundSyncCore, playNotificationSound,
    toggleReadOnly, toggleArchiveChat, toggleBlockUser, clearChatHistory,
    loadMultiSendChats as loadMultiSendChatsCore, updateMultiSendSelection, saveUIState,
    getUserFromURL, openChatPanel, formatTime, formatDate, formatDateTime,
    formatFileSize, escapeHtml, viewMedia, playVideo, playAudio,
    downloadFile, openLocation, retryConnection, initChildSession,
    getCurrentSession, requestSessionUpdate, showReconnectState, hideReconnectState
} from './messages.core.js';

console.log('[UI] Initializing messages UI');

// DOM Elements
const sidebar = document.getElementById('sidebar');
const chatPanel = document.getElementById('chatPanel');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const emojiPickerContainer = document.getElementById('emojiPickerContainer');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTimerEl = document.getElementById('recordingTimer');
const notification = document.getElementById('notification');
const mediaViewer = document.getElementById('mediaViewer');
const threadPanel = document.getElementById('threadPanel');
const chatsList = document.getElementById('chatsList');
const syncingIndicator = document.getElementById('syncingIndicator');
const chatInfoModal = document.getElementById('chatInfoModal');
const reportModal = document.getElementById('reportModal');
const formattingToolbar = document.getElementById('formattingToolbar');
const attachmentOptions = document.getElementById('attachmentOptions');
const contactsSidebar = document.getElementById('contactsSidebar');
const multiSendPanel = document.getElementById('multiSendPanel');
const scheduleModal = document.getElementById('scheduleModal');
const jumpToLatestBtn = document.getElementById('jumpToLatestBtn');
const chatSearchBar = document.getElementById('chatSearchBar');
const searchResultsDiv = document.getElementById('searchResults');
const inChatSearch = document.getElementById('inChatSearch');
const scheduleBadge = document.getElementById('scheduleBadge');
const typingIndicator = document.getElementById('typingIndicator');
const offlineOverlay = document.getElementById('offlineOverlay');
const attachmentPreview = document.getElementById('attachmentPreview');
const sendOptions = document.getElementById('sendOptions');
const sendOptionsOverlay = document.getElementById('sendOptionsOverlay');
const recordingCancelOverlay = document.getElementById('recordingCancelOverlay');
const selectedCount = document.getElementById('selectedCount');
const multiSendAttachmentPreview = document.getElementById('multiSendAttachmentPreview');
const scheduleAttachmentPreview = document.getElementById('scheduleAttachmentPreview');
const authStatusIndicator = document.getElementById('authStatusIndicator');
const authStatusText = document.getElementById('authStatusText');
const backgroundFetchIndicator = document.getElementById('backgroundFetchIndicator');
const parentStatus = document.getElementById('parentStatus');
const reconnectOverlay = document.getElementById('reconnectOverlay');
const reconnectMessage = document.getElementById('reconnectMessage');
const retryConnectionBtn = document.getElementById('retryConnectionBtn');

// =============================================
// INSTANT UI INITIALIZATION
// =============================================

/**
 * Initialize the application after receiving session
 */
export function initializeApplication() {
    if (isInitialized) {
        console.warn('[App] Already initialized');
        return;
    }
    
    console.log('[App] Initializing application with parent session');
    
    // Mark as initialized
    isInitialized = true;
    
    // Load cached non-sensitive data
    loadCachedData();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize emoji picker
    initEmojiPicker();
    
    // Load user settings
    loadUserSettings();
    
    // Load additional cached data in background
    loadChatThemes();
    loadMessageDrafts();
    loadScheduledMessages();
    loadOfflineQueue();
    
    console.log('[App] Application fully initialized with parent coordination');
}

/**
 * Show UI immediately (no loading screens)
 */
export function showUI() {
    console.log('[UI] Showing UI immediately');
    
    // Show sidebar and chat panel structure
    if (sidebar) sidebar.classList.add('active');
    if (chatPanel) chatPanel.classList.add('hidden');
    
    // Enable UI interactions if we have a session
    if (isSessionReceived && currentUser) {
        if (messageInput) messageInput.disabled = false;
        if (sendButton) sendButton.disabled = false;
    }
    
    // Hide reconnect overlay if visible
    hideReconnectState();
    
    // Update parent status
    if (parentStatus) {
        parentStatus.textContent = 'Connected';
        parentStatus.className = 'parent-status connected';
    }
}

/**
 * Load cached non-sensitive data from localStorage
 */
function loadCachedData() {
    console.log('[Cache] Loading cached non-sensitive data');
    
    // Load cached chats (non-sensitive)
    try {
        const cachedChats = localStorage.getItem(LOCAL_STORAGE_KEYS.CHATS);
        if (cachedChats) {
            // Imported chats from core
            console.log(`[Cache] Loaded ${chats.length} cached chats`);
            renderChatsListUI();
        } else {
            // Show empty state
            if (chatsList) {
                chatsList.innerHTML = `
                    <div class="empty-chat">
                        <i class="fas fa-comments empty-chat-icon"></i>
                        <div class="empty-chat-title">No chats yet</div>
                        <div class="empty-chat-message">Start a new chat to begin messaging</div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.warn('[Cache] Error loading cached chats:', error);
    }
    
    // Load cached contacts (non-sensitive)
    try {
        const cachedContacts = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (cachedContacts) {
            // Imported contacts from core
            console.log(`[Cache] Loaded ${contacts.length} cached contacts`);
        }
    } catch (error) {
        console.warn('[Cache] Error loading cached contacts:', error);
    }
    
    // Try to restore last chat session (non-sensitive)
    try {
        const uiState = localStorage.getItem(LOCAL_STORAGE_KEYS.UI_STATE);
        if (uiState && currentUser) {
            const state = JSON.parse(uiState);
            if (state.lastChatId) {
                // Try to find the chat
                const existingChat = chats.find(chat => chat.id === state.lastChatId);
                if (existingChat) {
                    setTimeout(() => {
                        openChat(existingChat);
                    }, 100);
                }
            }
        }
    } catch (error) {
        console.warn('[Cache] Error restoring UI state:', error);
    }
}

/**
 * Update UI with user data
 */
export function updateUIWithUser(user) {
    if (!user) return;
    
    // Update any UI elements that show user info
    const userElements = document.querySelectorAll('[data-user-info]');
    userElements.forEach(element => {
        const prop = element.dataset.userInfo;
        if (user[prop]) {
            element.textContent = user[prop];
        }
    });
    
    // Update avatar if present
    const avatarElements = document.querySelectorAll('[data-user-avatar]');
    avatarElements.forEach(element => {
        if (user.photoURL) {
            element.style.backgroundImage = `url('${user.photoURL}')`;
            element.innerHTML = '';
        } else if (user.displayName) {
            const initials = user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
            element.innerHTML = `<span>${initials}</span>`;
        }
    });
    
    console.log('[UI] Updated with user data');
}

/**
 * Update authentication status display
 */
export function updateAuthStatus(status, message) {
    if (!authStatusIndicator || !authStatusText) return;
    
    // Update status indicator
    authStatusIndicator.className = 'auth-status';
    authStatusIndicator.classList.add(status);
    
    // Update status text
    authStatusText.textContent = message;
    authStatusText.className = 'auth-status-text';
    authStatusText.classList.add(status);
    
    // Auto-hide after 5 seconds if authenticated
    if (status === 'authenticated') {
        setTimeout(() => {
            authStatusIndicator.style.display = 'none';
            authStatusText.style.display = 'none';
        }, 5000);
    } else {
        authStatusIndicator.style.display = 'block';
        authStatusText.style.display = 'block';
    }
}

/**
 * Reset UI to initial state
 */
export function resetUI() {
    // Clear current chat (from core)
    
    // Reset chat panel
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments empty-chat-icon"></i>
                <div class="empty-chat-title">Select a chat</div>
                <div class="empty-chat-message">Choose a conversation from the sidebar</div>
            </div>
        `;
    }
    
    // Reset sidebar
    if (chatsList) {
        chatsList.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments empty-chat-icon"></i>
                <div class="empty-chat-title">No chats yet</div>
                <div class="empty-chat-message">Start a new chat to begin messaging</div>
            </div>
        `;
    }
    
    // Show sidebar, hide chat panel
    if (sidebar) sidebar.classList.add('active');
    if (chatPanel) chatPanel.classList.add('hidden');
    
    // Clear message input
    if (messageInput) {
        messageInput.value = '';
        messageInput.disabled = true;
    }
    
    // Disable send button
    if (sendButton) sendButton.disabled = true;
}

// =============================================
// IMPLEMENTED UI FUNCTIONS
// =============================================

export function renderContactsListUI() {
    const contactsList = document.getElementById('contactsList');
    if (!contactsList) return;
    
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-users empty-chat-icon"></i>
                <div class="empty-chat-title">No contacts yet</div>
                <div class="empty-chat-message">Add friends to start chatting</div>
            </div>
        `;
        return;
    }
    
    contacts.forEach(contact => {
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.dataset.userId = contact.uid;
        
        const initials = contact.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
        
        contactItem.innerHTML = `
            <div class="contact-avatar" ${contact.photoURL ? `style="background-image: url('${contact.photoURL}')"` : ''}>
                ${contact.photoURL ? '' : `<span>${initials}</span>`}
            </div>
            <div class="contact-info">
                <div class="contact-name">${contact.displayName}</div>
                <div class="contact-status">
                    <div class="status-indicator online"></div>
                    <span>Online</span>
                </div>
            </div>
        `;
        
        contactItem.addEventListener('click', () => {
            startChatWithContact(contact);
        });
        
        contactsList.appendChild(contactItem);
    });
}

export async function startChatWithContact(contact) {
    try {
        let existingChat = chats.find(chat => chat.friendId === contact.uid);
        
        if (existingChat) {
            await openChat(existingChat);
        } else {
            await loadChatByFriendId(contact.uid);
        }
        
        if (contactsSidebar) contactsSidebar.classList.add('hidden');
        if (sidebar) sidebar.classList.remove('active');
        if (chatPanel) chatPanel.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error starting chat with contact:', error);
        showNotification('Error starting chat', 'error');
    }
}

export function renderChatsListUI() {
    if (!chatsList) return;
    
    chatsList.innerHTML = '';
    
    let filteredChats = chats;
    
    switch (currentCategory) {
        case 'unread':
            filteredChats = chats.filter(chat => chat.unreadCount > 0 && !chat.archived && !chat.blocked && chat.type !== 'note');
            break;
        case 'archived':
            filteredChats = chats.filter(chat => chat.archived);
            break;
        case 'blocked':
            filteredChats = chats.filter(chat => chat.blocked);
            break;
        case 'notes':
            filteredChats = chats.filter(chat => chat.type === 'note');
            break;
        case 'all':
        default:
            filteredChats = chats.filter(chat => !chat.archived && !chat.blocked && chat.type !== 'note');
            break;
    }
    
    if (filteredChats.length === 0) {
        let emptyMessage = '';
        switch (currentCategory) {
            case 'unread':
                emptyMessage = 'No unread messages';
                break;
            case 'archived':
                emptyMessage = 'No archived chats';
                break;
            case 'blocked':
                emptyMessage = 'No blocked users';
                break;
            case 'notes':
                emptyMessage = 'No notes yet';
                break;
            default:
                emptyMessage = 'Start a new chat to begin messaging';
        }
        
        chatsList.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments empty-chat-icon"></i>
                <div class="empty-chat-title">No chats</div>
                <div class="empty-chat-message">${emptyMessage}</div>
            </div>
        `;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = `chat-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread' : ''} ${chat.archived ? 'archived' : ''} ${chat.blocked ? 'blocked' : ''} ${chat.type === 'note' ? 'note-message' : ''}`;
        chatItem.dataset.chatId = chat.id;
        chatItem.dataset.friendId = chat.friendId;
        
        const initials = chat.type === 'note' ? 'NT' : chat.friendName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
        const lastMessageTime = formatTime(chat.lastMessageAt);
        let lastMessagePreview = chat.lastMessage;
        
        if (chat.blocked) {
            lastMessagePreview = 'This user is blocked';
        } else if (chat.type === 'note') {
            lastMessagePreview = 'Note to self';
        } else if (chat.lastMessage && chat.lastMessage.length > 40) {
            lastMessagePreview = chat.lastMessage.substring(0, 40) + '...';
        }
        
        chatItem.innerHTML = `
            <div class="chat-item-avatar" ${chat.friendAvatar ? `style="background-image: url('${chat.friendAvatar}')"` : ''}>
                ${chat.friendAvatar ? '' : `<span>${initials}</span>`}
                ${chat.type === 'note' ? '<div class="note-indicator"></div>' : ''}
                ${chat.blocked ? `<div class="chat-status" style="background-color: var(--blocked-color);"></div>` : ''}
            </div>
            <div class="chat-item-info">
                <div class="chat-item-header">
                    <div class="chat-item-name">${chat.type === 'note' ? 'Notes' : chat.friendName}</div>
                    <div class="chat-item-time">${lastMessageTime}</div>
                </div>
                <div class="chat-item-preview">
                    <div class="chat-item-message">${lastMessagePreview}</div>
                    ${chat.unreadCount > 0 ? `<div class="chat-item-unread">${chat.unreadCount}</div>` : ''}
                </div>
            </div>
        `;
        
        chatItem.addEventListener('click', () => {
            openChat(chat);
        });
        
        chatsList.appendChild(chatItem);
        
        if (messageDrafts[chat.id]) {
            updateDraftBadgeUI(true);
        }
    });
    
    updateChatCategoryBadges();
}

export function updateChatCategoryBadges() {
    const allCount = chats.filter(chat => !chat.archived && !chat.blocked && chat.type !== 'note').length;
    const unreadCount = chats.filter(chat => chat.unreadCount > 0 && !chat.archived && !chat.blocked && chat.type !== 'note').length;
    const archivedCount = chats.filter(chat => chat.archived).length;
    const blockedCount = chats.filter(chat => chat.blocked).length;
    const notesCount = chats.filter(chat => chat.type === 'note').length;
    
    const allBadge = document.getElementById('allBadge');
    const unreadBadge = document.getElementById('unreadBadge');
    const archivedBadge = document.getElementById('archivedBadge');
    const blockedBadge = document.getElementById('blockedBadge');
    const notesBadge = document.getElementById('notesBadge');
    
    if (allBadge) allBadge.textContent = allCount;
    if (unreadBadge) unreadBadge.textContent = unreadCount;
    if (archivedBadge) archivedBadge.textContent = archivedCount;
    if (blockedBadge) blockedBadge.textContent = blockedCount;
    if (notesBadge) notesBadge.textContent = notesCount;
}

export function updateDraftBadgeUI(hasDraft) {
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${currentChat?.id}"]`);
    if (chatItem) {
        let draftBadge = chatItem.querySelector('.draft-badge');
        if (hasDraft && !draftBadge) {
            draftBadge = document.createElement('div');
            draftBadge.className = 'draft-badge';
            draftBadge.textContent = 'Draft';
            const preview = chatItem.querySelector('.chat-item-preview');
            if (preview) preview.appendChild(draftBadge);
        } else if (!hasDraft && draftBadge) {
            draftBadge.remove();
        }
    }
}

export function loadMessageDraftUI() {
    if (!currentChat || !messageInput) return;
    
    const draft = messageDrafts[currentChat.id];
    if (draft) {
        if (draft.text) {
            messageInput.value = draft.text;
            messageInput.style.height = 'auto';
            messageInput.style.height = (messageInput.scrollHeight) + 'px';
        }
        
        if (draft.attachment) {
            showAttachmentPreview(draft.attachment);
        }
        
        if (draft.text || draft.attachment) {
            updateDraftBadgeUI(true);
        }
    } else {
        updateDraftBadgeUI(false);
    }
}

export function updateScheduleBadgeUI() {
    if (!scheduleBadge) return;
    
    const hasScheduled = scheduledMessages.some(msg => msg.chatId === currentChat?.id);
    scheduleBadge.style.display = hasScheduled ? 'flex' : 'none';
}

export function showMessageActionsUI(message, x, y) {
    selectedMessage = message;
    
    const actionsMenu = document.getElementById('messageActions');
    if (!actionsMenu) return;
    
    actionsMenu.style.left = x + 'px';
    actionsMenu.style.top = y + 'px';
    actionsMenu.classList.add('active');
    
    const starBtn = actionsMenu.querySelector('[data-action="star"]');
    const editBtn = actionsMenu.querySelector('[data-action="edit"]');
    const deleteBtn = actionsMenu.querySelector('[data-action="delete"]');
    const reportBtn = actionsMenu.querySelector('[data-action="report"]');
    const reactLikeBtn = actionsMenu.querySelector('[data-action="react-like"]');
    const reactLoveBtn = actionsMenu.querySelector('[data-action="react-love"]');
    const reactLaughBtn = actionsMenu.querySelector('[data-action="react-laugh"]');
    
    const starredMessages = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.STARRED_MESSAGES) || '{}');
    if (starBtn) {
        if (starredMessages[message.id]) {
            starBtn.innerHTML = '<i class="fas fa-star"></i> Unstar';
            starBtn.classList.add('starred');
        } else {
            starBtn.innerHTML = '<i class="far fa-star"></i> Star';
            starBtn.classList.remove('starred');
        }
    }
    
    if (editBtn) {
        if (message.senderId === currentUser.uid && (message.type === 'text' || message.type === 'note') && !message.deleted) {
            editBtn.style.display = 'flex';
        } else {
            editBtn.style.display = 'none';
        }
    }
    
    if (deleteBtn) {
        if (message.senderId === currentUser.uid) {
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete for everyone';
        } else {
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete for me';
        }
    }
    
    if (reportBtn) {
        if (message.senderId !== currentUser.uid && message.type !== 'note') {
            reportBtn.style.display = 'flex';
        } else {
            reportBtn.style.display = 'none';
        }
    }
    
    if (reactLikeBtn && reactLoveBtn && reactLaughBtn) {
        if (silentReactionsEnabled && !message.deleted) {
            reactLikeBtn.style.display = 'flex';
            reactLoveBtn.style.display = 'flex';
            reactLaughBtn.style.display = 'flex';
        } else {
            reactLikeBtn.style.display = 'none';
            reactLoveBtn.style.display = 'none';
            reactLaughBtn.style.display = 'none';
        }
    }
    
    setTimeout(() => {
        document.addEventListener('click', closeMessageActionsUI);
    }, 10);
}

export function closeMessageActionsUI() {
    const actionsMenu = document.getElementById('messageActions');
    if (actionsMenu) {
        actionsMenu.classList.remove('active');
    }
    document.removeEventListener('click', closeMessageActionsUI);
}

export function handleMessageActionUI(action) {
    if (!selectedMessage) return;
    
    const result = handleMessageActionCore(action);
    if (!result) {
        console.error('Error handling message action:', action);
        return;
    }
    
    switch (action) {
        case 'reply':
            showNotification('Replying to message', 'info');
            break;
            
        case 'edit':
            if (messageInput) messageInput.focus();
            break;
            
        case 'copy':
            showNotification('Copied to clipboard', 'success');
            break;
            
        case 'star':
            showNotification('Message starred', 'success');
            break;
            
        case 'react-like':
        case 'react-love':
        case 'react-laugh':
            showNotification('Reaction added', 'success');
            break;
            
        case 'delete':
            showNotification('Message deleted', 'success');
            break;
    }
    
    closeMessageActionsUI();
}

export function toggleStarMessageUI(messageId) {
    const result = toggleStarMessageCore(messageId);
    if (result) {
        showNotification('Message unstarred', 'success');
    } else {
        showNotification('Message starred', 'success');
    }
}

export function showReportModalUI(message) {
    if (!reportModal) return;
    
    showReportModalCore(message);
    reportModal.classList.add('active');
    const reportText = document.getElementById('reportText');
    if (reportText) reportText.value = '';
}

export function submitReportUI() {
    const result = submitReportCore();
    if (result) {
        if (reportModal) reportModal.classList.remove('active');
        showNotification('Report submitted. Thank you for helping keep our community safe.', 'success');
    } else {
        showNotification('Please describe the issue', 'warning');
    }
}

export function toggleEmojiPickerUI() {
    if (!emojiPickerContainer) return;
    
    emojiPickerContainer.classList.toggle('active');
    
    if (emojiPickerContainer.classList.contains('active')) {
        setTimeout(() => {
            document.addEventListener('click', closeEmojiPickerOnClickOutsideUI);
        }, 10);
    } else {
        document.removeEventListener('click', closeEmojiPickerOnClickOutsideUI);
    }
}

export function closeEmojiPickerOnClickOutsideUI(event) {
    if (!emojiPickerContainer) return;
    
    if (!emojiPickerContainer.contains(event.target) && !event.target.closest('#emojiBtn')) {
        emojiPickerContainer.classList.remove('active');
        document.removeEventListener('click', closeEmojiPickerOnClickOutsideUI);
    }
}

export function toggleFormattingToolbarUI() {
    if (!formattingToolbar) return;
    
    formattingToolbar.classList.toggle('active');
    
    const text = messageInput ? messageInput.value.substring(messageInput.selectionStart, messageInput.selectionEnd) : '';
    document.querySelectorAll('.format-btn').forEach(btn => {
        if (!text) {
            btn.classList.remove('active');
            return;
        }
        
        const tag = btn.dataset.tag;
        if (tag === 'b' && text.startsWith('**') && text.endsWith('**')) {
            btn.classList.add('active');
        } else if (tag === 'i' && text.startsWith('*') && text.endsWith('*')) {
            btn.classList.add('active');
        } else if (tag === 'code' && text.startsWith('`') && text.endsWith('`')) {
            btn.classList.add('active');
        } else if (tag === 'pre' && text.startsWith('```') && text.endsWith('```')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    if (formattingToolbar.classList.contains('active')) {
        setTimeout(() => {
            document.addEventListener('click', closeFormattingToolbarOnClickOutsideUI);
        }, 10);
    } else {
        document.removeEventListener('click', closeFormattingToolbarOnClickOutsideUI);
    }
}

export function closeFormattingToolbarOnClickOutsideUI(event) {
    if (!formattingToolbar) return;
    
    if (!formattingToolbar.contains(event.target) && !event.target.closest('#formatBtn')) {
        formattingToolbar.classList.remove('active');
        document.removeEventListener('click', closeFormattingToolbarOnClickOutsideUI);
    }
}

export function toggleAttachmentOptionsUI() {
    if (!attachmentOptions) return;
    
    attachmentOptions.classList.toggle('active');
    
    if (attachmentOptions.classList.contains('active')) {
        setTimeout(() => {
            document.addEventListener('click', closeAttachmentOptionsOnClickOutsideUI);
        }, 10);
    } else {
        document.removeEventListener('click', closeAttachmentOptionsOnClickOutsideUI);
    }
}

export function closeAttachmentOptionsOnClickOutsideUI(event) {
    if (!attachmentOptions) return;
    
    if (!attachmentOptions.contains(event.target) && !event.target.closest('#attachBtn')) {
        attachmentOptions.classList.remove('active');
        document.removeEventListener('click', closeAttachmentOptionsOnClickOutsideUI);
    }
}

export function setupScrollDetectionUI() {
    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', updateJumpButtonVisibilityUI);
    }
}

export function updateJumpButtonVisibilityUI() {
    if (!jumpToLatestBtn || !messagesContainer) return;
    
    const container = messagesContainer;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    
    if (scrollBottom > 300) {
        jumpToLatestBtn.classList.add('visible');
    } else {
        jumpToLatestBtn.classList.remove('visible');
    }
}

export function searchInChatUI(query) {
    if (!searchResultsDiv) return;
    
    const results = searchInChatCore(query);
    if (!results) return;
    
    if (!query.trim()) {
        searchResultsDiv.classList.remove('active');
        searchResults = [];
        currentSearchIndex = -1;
        removeSearchHighlightsUI();
        return;
    }
    
    if (results.length === 0) {
        searchResultsDiv.innerHTML = `
            <div class="search-result-item" style="text-align: center; padding: 20px; color: #65676b;">
                No results found for "${query}"
            </div>
        `;
    } else {
        const resultsHtml = results.map((msg, index) => `
            <div class="search-result-item" onclick="navigateToSearchResultUI(${index})">
                <div style="font-weight: 500; margin-bottom: 4px;">
                    ${msg.senderId === currentUser.uid ? 'You' : currentFriend?.displayName || 'Unknown'}
                </div>
                <div style="font-size: 13px; color: var(--text-secondary);">
                    ${highlightText(msg.content, query)}
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    ${formatTime(msg.timestamp)}
                </div>
            </div>
        `).join('');
        
        searchResultsDiv.innerHTML = resultsHtml;
    }
    
    searchResultsDiv.classList.add('active');
    highlightSearchResultsUI(query);
}

export function highlightSearchResultsUI(query) {
    const messageItems = document.querySelectorAll('.message-item');
    messageItems.forEach(item => {
        const content = item.dataset.searchable || '';
        if (content.toLowerCase().includes(query.toLowerCase())) {
            item.classList.add('message-searching');
        } else {
            item.classList.remove('message-searching');
        }
    });
}

export function removeSearchHighlightsUI() {
    document.querySelectorAll('.message-searching').forEach(item => {
        item.classList.remove('message-searching');
    });
}

export function navigateToSearchResultUI(index) {
    if (index >= 0 && index < searchResults.length) {
        const messageId = searchResults[index].id;
        scrollToMessage(messageId);
        if (searchResultsDiv) searchResultsDiv.classList.remove('active');
        if (inChatSearch) inChatSearch.value = '';
        removeSearchHighlightsUI();
    }
}

export async function startRecordingUI() {
    const result = await startRecordingCore();
    if (!result) {
        showNotification('Microphone access denied', 'error');
        return;
    }
    
    if (recordingIndicator) recordingIndicator.style.display = 'flex';
    
    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) attachBtn.classList.add('recording');
}

export async function stopRecordingUI() {
    const attachment = await stopRecordingCore();
    if (!attachment) {
        showNotification('Recording too short', 'warning');
        return;
    }
    
    if (recordingIndicator) recordingIndicator.style.display = 'none';
    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) attachBtn.classList.remove('recording');
    
    currentAttachment = attachment;
    showAttachmentPreview(attachment);
    saveMessageDraft();
}

export function cancelRecordingUI() {
    const result = cancelRecordingCore();
    if (!result) return;
    
    if (recordingIndicator) recordingIndicator.style.display = 'none';
    const attachBtn = document.getElementById('attachBtn');
    if (attachBtn) attachBtn.classList.remove('recording');
    
    showNotification('Recording cancelled', 'info');
}

export async function handleAttachmentUI(type) {
    switch (type) {
        case 'image':
            const imageAttachment = await selectImage();
            if (imageAttachment) {
                currentAttachment = imageAttachment;
                showAttachmentPreview(imageAttachment);
                saveMessageDraft();
            }
            break;
        case 'video':
            const videoAttachment = await selectVideo();
            if (videoAttachment) {
                currentAttachment = videoAttachment;
                showAttachmentPreview(videoAttachment);
                saveMessageDraft();
            }
            break;
        case 'audio':
            await startRecordingUI();
            break;
        case 'file':
            const fileAttachment = await selectFile();
            if (fileAttachment) {
                currentAttachment = fileAttachment;
                showAttachmentPreview(fileAttachment);
                saveMessageDraft();
            }
            break;
        case 'location':
            const locationAttachment = await shareLocation();
            if (locationAttachment) {
                currentAttachment = locationAttachment;
                showAttachmentPreview(locationAttachment);
                saveMessageDraft();
            }
            break;
        case 'poll':
            const pollData = createPoll();
            if (pollData) {
                await sendMessage('', 'poll', pollData);
            }
            break;
        case 'note':
            await createNoteUI();
            break;
    }
    
    if (attachmentOptions) attachmentOptions.classList.remove('active');
}

export async function createNoteUI() {
    const result = await createNoteCore();
    if (result && messageInput) {
        messageInput.value = '';
        showNotification('Note created', 'success');
    } else {
        showNotification('Enter note content first', 'warning');
    }
}

export async function voteInPollUI(messageId, optionIndex) {
    const result = await voteInPoll(messageId, optionIndex);
    if (result) {
        renderMessages();
    } else {
        showNotification('Error voting', 'error');
    }
}

export function openThreadUI(messageId) {
    openThreadCore(messageId);
    if (threadPanel) threadPanel.classList.add('active');
    
    loadThreadMessages(messageId);
}

export function showChatInfoUI(chat) {
    const chatInfo = showChatInfoCore(chat);
    const chatInfoBody = document.getElementById('chatInfoBody');
    if (!chatInfoBody) return;
    
    let html = '';
    chatInfo.sections.forEach(section => {
        html += `
            <div class="chat-info-section">
                <div class="chat-info-title">${section.title}</div>
        `;
        
        section.items.forEach(item => {
            html += `
                <div class="chat-info-item">
                    <div class="chat-info-label">${item.label}</div>
                    <div class="chat-info-value">${item.value}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    html += `
        <div class="chat-info-section">
            <div class="chat-info-title">Actions</div>
            <div class="chat-info-actions">
                ${chat.type !== 'note' ? `
                <button class="chat-info-btn primary" id="chatInfoBlockBtn">
                    <i class="fas fa-ban"></i>
                    ${chat.blocked ? 'Unblock User' : 'Block User'}
                </button>
                ` : ''}
                <button class="chat-info-btn warning" id="chatInfoArchiveBtn">
                    <i class="fas fa-archive"></i>
                    ${chat.archived ? 'Unarchive Chat' : 'Archive Chat'}
                </button>
                <button class="chat-info-btn warning" id="chatInfoReadOnlyBtn">
                    <i class="fas fa-eye"></i>
                    ${chat.readOnly ? 'Enable Writing' : 'Read Only'}
                </button>
                <button class="chat-info-btn danger" id="chatInfoClearBtn">
                    <i class="fas fa-trash"></i>
                    Clear Chat History
                </button>
            </div>
        </div>
    `;
    
    chatInfoBody.innerHTML = html;
    
    const chatInfoName = document.getElementById('chatInfoName');
    if (chatInfoName) chatInfoName.textContent = chatInfo.title;
    
    if (chatInfoModal) chatInfoModal.classList.add('active');
    
    if (chat.type !== 'note') {
        const blockBtn = document.getElementById('chatInfoBlockBtn');
        if (blockBtn) {
            blockBtn.addEventListener('click', async () => {
                const result = await toggleBlockUser(chat.friendId, !chat.blocked);
                if (result) {
                    if (chatInfoModal) chatInfoModal.classList.remove('active');
                    renderChatsListUI();
                }
            });
        }
    }
    
    const archiveBtn = document.getElementById('chatInfoArchiveBtn');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
            const result = await toggleArchiveChat(chat.id, !chat.archived);
            if (result) {
                if (chatInfoModal) chatInfoModal.classList.remove('active');
                renderChatsListUI();
            }
        });
    }
    
    const readOnlyBtn = document.getElementById('chatInfoReadOnlyBtn');
    if (readOnlyBtn) {
        readOnlyBtn.addEventListener('click', async () => {
            const result = await toggleReadOnly(chat.id, !chat.readOnly);
            if (result) {
                if (chatInfoModal) chatInfoModal.classList.remove('active');
                if (currentChat && currentChat.id === chat.id) {
                    if (messageInput) messageInput.disabled = chat.readOnly;
                    if (sendButton) sendButton.disabled = chat.readOnly;
                    if (chat.readOnly) {
                        showNotification('Chat is now read-only', 'info');
                    } else {
                        showNotification('Chat writing enabled', 'success');
                    }
                }
                renderChatsListUI();
            }
        });
    }
    
    const clearBtn = document.getElementById('chatInfoClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (confirm('Clear all messages in this chat?')) {
                const result = await clearChatHistory(chat.id);
                if (result) {
                    if (chatInfoModal) chatInfoModal.classList.remove('active');
                    renderMessages();
                    showNotification('Chat history cleared', 'success');
                }
            }
        });
    }
}

export function startBackgroundSyncUI() {
    startBackgroundSyncCore();
    
    window.addEventListener('online', () => {
        checkOfflineQueue();
        updateNetworkStatus();
    });
    
    window.addEventListener('offline', () => {
        updateNetworkStatus();
    });
}

export function showNotification(message, type = 'success') {
    if (!notification) return;
    
    const notificationText = document.getElementById('notificationText');
    if (notificationText) notificationText.textContent = message;
    
    notification.className = 'notification';
    notification.classList.add(type, 'active');
    
    const icon = notification.querySelector('i');
    if (icon) {
        switch (type) {
            case 'success':
                icon.className = 'fas fa-check-circle';
                break;
            case 'error':
                icon.className = 'fas fa-exclamation-circle';
                break;
            case 'warning':
                icon.className = 'fas fa-exclamation-triangle';
                break;
            case 'info':
                icon.className = 'fas fa-info-circle';
                break;
        }
    }
    
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

export function showContactsSidebar() {
    if (sidebar) sidebar.classList.add('hidden');
    if (contactsSidebar) contactsSidebar.classList.remove('hidden');
}

export function backToChatList() {
    if (sidebar) sidebar.classList.add('active');
    if (chatPanel) chatPanel.classList.add('hidden');
    if (contactsSidebar) contactsSidebar.classList.add('hidden');
    
    saveMessageDraft();
    saveUIState();
    
    const chatFriendName = document.getElementById('chatFriendName');
    const chatStatusText = document.getElementById('chatStatusText');
    if (chatFriendName) chatFriendName.textContent = 'Select a chat';
    if (chatStatusText) chatStatusText.textContent = 'Tap on a chat to start messaging';
    
    if (chatSearchBar) chatSearchBar.classList.remove('active');
    if (searchResultsDiv) searchResultsDiv.classList.remove('active');
}

export function updateNetworkStatus() {
    if (!offlineOverlay) return;
    
    if (!navigator.onLine) {
        offlineOverlay.classList.add('active');
    } else {
        offlineOverlay.classList.remove('active');
    }
}

export function loadMultiSendChatsUI() {
    const availableChats = loadMultiSendChatsCore();
    const multiSendList = document.getElementById('multiSendChatsList');
    if (!multiSendList) return;
    
    multiSendList.innerHTML = '';
    multiSendSelectedChats.clear();
    
    if (availableChats.length === 0) {
        multiSendList.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comments empty-chat-icon"></i>
                <div class="empty-chat-title">No chats available</div>
                <div class="empty-chat-message">Create chats to use multi-send</div>
            </div>
        `;
        return;
    }
    
    availableChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        
        const initials = chat.friendName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
        
        chatItem.innerHTML = `
            <div class="chat-item-avatar" ${chat.friendAvatar ? `style="background-image: url('${chat.friendAvatar}')"` : ''}>
                ${chat.friendAvatar ? '' : `<span>${initials}</span>`}
            </div>
            <div class="chat-item-info">
                <div class="chat-item-header">
                    <div class="chat-item-name">${chat.friendName}</div>
                    <div class="chat-item-checkbox">
                        <input type="checkbox" class="multi-send-checkbox" data-chat-id="${chat.id}">
                    </div>
                </div>
                <div class="chat-item-preview">
                    <div class="chat-item-message">${chat.lastMessage ? chat.lastMessage.substring(0, 40) + (chat.lastMessage.length > 40 ? '...' : '') : 'No messages yet'}</div>
                </div>
            </div>
        `;
        
        chatItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('multi-send-checkbox')) {
                const checkbox = chatItem.querySelector('.multi-send-checkbox');
                checkbox.checked = !checkbox.checked;
                updateMultiSendSelection(chat.id, checkbox.checked);
                chatItem.classList.toggle('selected', checkbox.checked);
                updateSelectedCount();
            }
        });
        
        const checkbox = chatItem.querySelector('.multi-send-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            updateMultiSendSelection(chat.id, checkbox.checked);
            chatItem.classList.toggle('selected', checkbox.checked);
            updateSelectedCount();
        });
        
        multiSendList.appendChild(chatItem);
    });
    
    if (currentAttachment && multiSendAttachmentPreview) {
        multiSendAttachmentPreview.style.display = 'flex';
        multiSendAttachmentPreview.innerHTML = `
            <img src="${currentAttachment.data}" alt="Preview" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;">
            <div class="attachment-preview-info">
                <div style="font-weight: 500; font-size: 12px;">${currentAttachment.type}</div>
                <div style="font-size: 10px; color: #65676b;">${currentAttachment.name || 'Attachment'}</div>
            </div>
        `;
    }
}

export function updateSelectedCount() {
    if (!selectedCount) return;
    
    selectedCount.textContent = `${multiSendSelectedChats.size} selected`;
}

// =============================================
// EVENT LISTENERS SETUP
// =============================================

export function setupEventListeners() {
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            
            clearTimeout(window.draftSaveTimeout);
            window.draftSaveTimeout = setTimeout(saveMessageDraft, 1000);
            
            if (!isTyping) {
                isTyping = true;
                if (currentChat && isSessionReceived) {
                    // Send typing indicator through parent
                    sendToParent('TYPING_START', {
                        chatId: currentChat.id,
                        userId: currentUser.uid
                    });
                }
            }
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                if (currentChat && isSessionReceived) {
                    // Send typing stop through parent
                    sendToParent('TYPING_STOP', {
                        chatId: currentChat.id,
                        userId: currentUser.uid
                    });
                }
            }, 1000);
        });
        
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return;
                } else {
                    e.preventDefault();
                    if (this.value.trim() || currentAttachment) {
                        sendMessage(this.value.trim());
                    }
                }
            }
        });
    }
    
    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (messageInput && (messageInput.value.trim() || currentAttachment)) {
                const result = await sendMessage(messageInput.value.trim());
                if (result) {
                    messageInput.value = '';
                    messageInput.style.height = 'auto';
                    if (messagesContainer) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                } else {
                    showNotification('Please select a chat first', 'warning');
                }
            }
        });
        
        let sendPressTimer;
        sendButton.addEventListener('mousedown', () => {
            sendPressTimer = setTimeout(() => {
                if (sendOptions) sendOptions.classList.add('active');
                if (sendOptionsOverlay) sendOptionsOverlay.classList.add('active');
            }, 500);
        });
        
        sendButton.addEventListener('mouseup', () => {
            clearTimeout(sendPressTimer);
        });
        
        sendButton.addEventListener('mouseleave', () => {
            clearTimeout(sendPressTimer);
        });
    }
    
    if (sendOptionsOverlay) {
        sendOptionsOverlay.addEventListener('click', () => {
            if (sendOptions) sendOptions.classList.remove('active');
            sendOptionsOverlay.classList.remove('active');
        });
    }
    
    if (sendOptions) {
        document.querySelectorAll('#sendOptions .action-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                const content = messageInput ? messageInput.value.trim() : '';
                
                if (!content && !currentAttachment) {
                    showNotification('Message cannot be empty', 'warning');
                    return;
                }
                
                let result = false;
                switch (action) {
                    case 'send-normal':
                        result = await sendMessage(content);
                        break;
                    case 'send-view-once':
                        result = await sendMessageWithOptions(content, { viewOnce: true });
                        break;
                    case 'send-expire-1h':
                        result = await sendMessageWithOptions(content, { expiresAt: Date.now() + 3600000 });
                        break;
                    case 'send-expire-1d':
                        result = await sendMessageWithOptions(content, { expiresAt: Date.now() + 86400000 });
                        break;
                    case 'send-note':
                        result = await sendMessageWithOptions(content, { isNote: true });
                        break;
                }
                
                if (result) {
                    if (messageInput) messageInput.value = '';
                    if (messagesContainer) {
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                }
                sendOptions.classList.remove('active');
                if (sendOptionsOverlay) sendOptionsOverlay.classList.remove('active');
            });
        });
    }
    
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPickerUI);
    
    const formatBtn = document.getElementById('formatBtn');
    if (formatBtn) formatBtn.addEventListener('click', toggleFormattingToolbarUI);
    
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            applyFormatting(tag);
        });
    });
    
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => {
            const content = messageInput ? messageInput.value.trim() : '';
            if (!content && !currentAttachment) {
                showNotification('Enter message first', 'warning');
                return;
            }
            
            const scheduleMessageInput = document.getElementById('scheduleMessage');
            if (scheduleMessageInput) scheduleMessageInput.value = content;
            
            if (currentAttachment && scheduleAttachmentPreview) {
                scheduleAttachmentPreview.style.display = 'flex';
                scheduleAttachmentPreview.innerHTML = `
                    <img src="${currentAttachment.data}" alt="Preview" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px;">
                    <div class="attachment-preview-info">
                        <div style="font-weight: 500; font-size: 12px;">${currentAttachment.type}</div>
                        <div style="font-size: 10px; color: #65676b;">${currentAttachment.name || 'Attachment'}</div>
                    </div>
                `;
            } else if (scheduleAttachmentPreview) {
                scheduleAttachmentPreview.style.display = 'none';
            }
            
            if (scheduleModal) scheduleModal.classList.add('active');
        });
    }
    
    const cancelScheduleBtn = document.getElementById('cancelScheduleBtn');
    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener('click', () => {
            if (scheduleModal) scheduleModal.classList.remove('active');
        });
    }
    
    const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
    if (confirmScheduleBtn) {
        confirmScheduleBtn.addEventListener('click', async () => {
            const scheduleMessageInput = document.getElementById('scheduleMessage');
            const scheduleDate = document.getElementById('scheduleDate');
            const scheduleTime = document.getElementById('scheduleTime');
            const sendNow = document.getElementById('sendNow');
            
            if (!scheduleMessageInput || !scheduleDate || !scheduleTime || !sendNow) return;
            
            const content = scheduleMessageInput.value.trim();
            const date = scheduleDate.value;
            const time = scheduleTime.value;
            const sendNowChecked = sendNow.checked;
            
            if (!content && !currentAttachment) {
                showNotification('Message cannot be empty', 'warning');
                return;
            }
            
            if (sendNowChecked || (!date && !time)) {
                const result = await sendMessage(content);
                if (result) {
                    if (scheduleModal) scheduleModal.classList.remove('active');
                    if (messageInput) messageInput.value = '';
                }
            } else {
                const scheduleTimeValue = new Date(`${date}T${time}`).getTime();
                if (scheduleTimeValue <= Date.now()) {
                    showNotification('Schedule time must be in the future', 'warning');
                    return;
                }
                
                await scheduleMessage(content, scheduleTimeValue, {
                    attachment: currentAttachment
                });
                if (scheduleModal) scheduleModal.classList.remove('active');
                if (messageInput) messageInput.value = '';
                showNotification(`Message scheduled for ${formatTime(scheduleTimeValue)}`, 'success');
            }
        });
    }
    
    const closeScheduleBtn = document.getElementById('closeScheduleBtn');
    if (closeScheduleBtn) {
        closeScheduleBtn.addEventListener('click', () => {
            if (scheduleModal) scheduleModal.classList.remove('active');
        });
    }
    
    const attachBtn = document.getElementById('attachBtn');
    let pressTimer;
    
    if (attachBtn) {
        attachBtn.addEventListener('mousedown', () => {
            pressTimer = setTimeout(() => {
                startRecordingUI();
            }, 500);
        });
        
        attachBtn.addEventListener('mouseup', async () => {
            clearTimeout(pressTimer);
            if (isRecording) {
                await stopRecordingUI();
            } else {
                toggleAttachmentOptionsUI();
            }
        });
        
        attachBtn.addEventListener('mouseleave', async () => {
            clearTimeout(pressTimer);
            if (isRecording) {
                await stopRecordingUI();
            }
        });
    }
    
    const cancelRecordingOverlayBtn = document.getElementById('cancelRecordingOverlayBtn');
    if (cancelRecordingOverlayBtn) {
        cancelRecordingOverlayBtn.addEventListener('click', cancelRecordingUI);
    }
    
    if (recordingCancelOverlay) {
        recordingCancelOverlay.addEventListener('touchstart', (e) => {
            dragStartY = e.touches[0].clientY;
        });
        
        recordingCancelOverlay.addEventListener('touchmove', (e) => {
            if (!isRecording) return;
            
            const currentY = e.touches[0].clientY;
            const diff = dragStartY - currentY;
            
            if (diff > 100) {
                isDraggingToCancel = true;
                recordingCancelOverlay.style.backgroundColor = 'rgba(255, 59, 48, 0.8)';
            }
        });
        
        recordingCancelOverlay.addEventListener('touchend', () => {
            if (isDraggingToCancel && isRecording) {
                cancelRecordingUI();
            }
            isDraggingToCancel = false;
            recordingCancelOverlay.style.backgroundColor = '';
        });
    }
    
    if (attachBtn) {
        attachBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            pressTimer = setTimeout(() => {
                startRecordingUI();
            }, 500);
        });
        
        attachBtn.addEventListener('touchend', async (e) => {
            e.preventDefault();
            clearTimeout(pressTimer);
            if (isRecording) {
                await stopRecordingUI();
            } else {
                toggleAttachmentOptionsUI();
            }
        });
    }
    
    document.querySelectorAll('.attachment-option').forEach(option => {
        option.addEventListener('click', () => {
            const type = option.dataset.type;
            handleAttachmentUI(type);
        });
    });
    
    const cancelRecordingBtn = document.getElementById('cancelRecordingBtn');
    if (cancelRecordingBtn) {
        cancelRecordingBtn.addEventListener('click', cancelRecordingUI);
    }
    
    if (jumpToLatestBtn) {
        jumpToLatestBtn.addEventListener('click', jumpToLatest);
    }
    
    const chatSearchBtn = document.getElementById('chatSearchBtn');
    if (chatSearchBtn) {
        chatSearchBtn.addEventListener('click', () => {
            if (chatSearchBar) {
                chatSearchBar.classList.add('active');
                const inChatSearch = document.getElementById('inChatSearch');
                if (inChatSearch) inChatSearch.focus();
            }
        });
    }
    
    const closeChatSearchBtn = document.getElementById('closeChatSearchBtn');
    if (closeChatSearchBtn) {
        closeChatSearchBtn.addEventListener('click', () => {
            if (chatSearchBar) chatSearchBar.classList.remove('active');
            if (searchResultsDiv) searchResultsDiv.classList.remove('active');
            removeSearchHighlightsUI();
        });
    }
    
    if (inChatSearch) {
        inChatSearch.addEventListener('input', function() {
            searchInChatUI(this.value);
        });
    }
    
    const dismissOfflineBtn = document.getElementById('dismissOfflineBtn');
    if (dismissOfflineBtn) {
        dismissOfflineBtn.addEventListener('click', () => {
            if (offlineOverlay) offlineOverlay.classList.remove('active');
        });
    }
    
    const backToChatsBtn = document.getElementById('backToChatsBtn');
    if (backToChatsBtn) backToChatsBtn.addEventListener('click', backToChatList);
    
    const backToChatsFromContactsBtn = document.getElementById('backToChatsFromContactsBtn');
    if (backToChatsFromContactsBtn) {
        backToChatsFromContactsBtn.addEventListener('click', () => {
            if (contactsSidebar) contactsSidebar.classList.add('hidden');
            if (sidebar) sidebar.classList.remove('active');
        });
    }
    
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            window.location.href = '../friend.html?startChat=true';
        });
    }
    
    const multiSendToggleBtn = document.getElementById('multiSendToggleBtn');
    if (multiSendToggleBtn) {
        multiSendToggleBtn.addEventListener('click', () => {
            if (multiSendPanel) {
                multiSendPanel.classList.add('active');
                loadMultiSendChatsUI();
            }
        });
    }
    
    const closeMultiSendBtn = document.getElementById('closeMultiSendBtn');
    if (closeMultiSendBtn) {
        closeMultiSendBtn.addEventListener('click', () => {
            if (multiSendPanel) {
                multiSendPanel.classList.remove('active');
                multiSendSelectedChats.clear();
            }
        });
    }
    
    const multiSendBtn = document.getElementById('multiSendBtn');
    if (multiSendBtn) {
        multiSendBtn.addEventListener('click', async () => {
            const multiSendInput = document.getElementById('multiSendInput');
            const content = multiSendInput ? multiSendInput.value.trim() : '';
            const chatIds = Array.from(multiSendSelectedChats);
            const successCount = await sendToMultipleChats(content, chatIds);
            if (successCount > 0) {
                showNotification(`Sent to ${successCount} of ${chatIds.length} chats`, 'success');
                if (multiSendInput) multiSendInput.value = '';
                multiSendSelectedChats.clear();
                updateSelectedCount();
                if (multiSendPanel) multiSendPanel.classList.remove('active');
                renderChatsListUI();
            } else {
                showNotification('Select at least one chat', 'warning');
            }
        });
    }
    
    const chatSearch = document.getElementById('chatSearch');
    if (chatSearch) {
        chatSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const chatItems = document.querySelectorAll('.chat-item');
            
            chatItems.forEach(item => {
                const name = item.querySelector('.chat-item-name');
                const message = item.querySelector('.chat-item-message');
                
                if (name && message) {
                    const nameText = name.textContent.toLowerCase();
                    const messageText = message.textContent.toLowerCase();
                    
                    if (nameText.includes(searchTerm) || messageText.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                }
            });
        });
    }
    
    const contactSearch = document.getElementById('contactSearch');
    if (contactSearch) {
        contactSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const contactItems = document.querySelectorAll('.contact-item');
            
            contactItems.forEach(item => {
                const name = item.querySelector('.contact-name');
                const status = item.querySelector('.contact-status');
                
                if (name && status) {
                    const nameText = name.textContent.toLowerCase();
                    const statusText = status.textContent.toLowerCase();
                    
                    if (nameText.includes(searchTerm) || statusText.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                }
            });
        });
    }
    
    const multiSendSearch = document.getElementById('multiSendSearch');
    if (multiSendSearch) {
        multiSendSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const chatItems = document.querySelectorAll('#multiSendChatsList .chat-item');
            
            chatItems.forEach(item => {
                const name = item.querySelector('.chat-item-name');
                if (name) {
                    const nameText = name.textContent.toLowerCase();
                    if (nameText.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                }
            });
        });
    }
    
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.category-tab').forEach(t => {
                t.classList.remove('active');
            });
            
            tab.classList.add('active');
            
            currentCategory = tab.dataset.category;
            
            renderChatsListUI();
        });
    });
    
    const messageActions = document.getElementById('messageActions');
    if (messageActions) {
        document.querySelectorAll('#messageActions .action-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                handleMessageActionUI(action);
            });
        });
    }
    
    const closeMediaViewer = document.getElementById('closeMediaViewer');
    if (closeMediaViewer) {
        closeMediaViewer.addEventListener('click', () => {
            if (mediaViewer) mediaViewer.classList.remove('active');
        });
    }
    
    const closeThreadBtn = document.getElementById('closeThreadBtn');
    if (closeThreadBtn) {
        closeThreadBtn.addEventListener('click', () => {
            if (threadPanel) threadPanel.classList.remove('active');
            currentThread = null;
        });
    }
    
    const closeChatInfoBtn = document.getElementById('closeChatInfoBtn');
    if (closeChatInfoBtn) {
        closeChatInfoBtn.addEventListener('click', () => {
            if (chatInfoModal) chatInfoModal.classList.remove('active');
        });
    }
    
    const cancelReportBtn = document.getElementById('cancelReportBtn');
    if (cancelReportBtn) {
        cancelReportBtn.addEventListener('click', () => {
            if (reportModal) reportModal.classList.remove('active');
        });
    }
    
    const submitReportBtn = document.getElementById('submitReportBtn');
    if (submitReportBtn) {
        submitReportBtn.addEventListener('click', submitReportUI);
    }
    
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    if (voiceCallBtn) {
        voiceCallBtn.addEventListener('click', () => {
            if (currentFriend && currentChat && currentChat.type !== 'note') {
                window.location.href = `../calls.html?call=${currentFriend.uid}&type=voice`;
            } else {
                showNotification('Please select a chat first', 'warning');
            }
        });
    }
    
    const videoCallBtn = document.getElementById('videoCallBtn');
    if (videoCallBtn) {
        videoCallBtn.addEventListener('click', () => {
            if (currentFriend && currentChat && currentChat.type !== 'note') {
                window.location.href = `../calls.html?call=${currentFriend.uid}&type=video`;
            } else {
                showNotification('Please select a chat first', 'warning');
            }
        });
    }
    
    const chatOptionsBtn = document.getElementById('chatOptionsBtn');
    if (chatOptionsBtn) {
        chatOptionsBtn.addEventListener('click', () => {
            if (currentChat) {
                showChatInfoUI(currentChat);
            } else {
                showNotification('Please select a chat first', 'warning');
            }
        });
    }
    
    if (retryConnectionBtn) {
        retryConnectionBtn.addEventListener('click', () => {
            retryConnection();
        });
    }
    
    window.addEventListener('beforeunload', () => {
        saveMessageDraft();
        saveUIState();
        localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
        if (currentChat) {
            localStorage.setItem(`${LOCAL_STORAGE_KEYS.MESSAGES}${currentChat.id}`, JSON.stringify(messages));
        }
        
        audioPlayers.forEach(wavesurfer => {
            if (wavesurfer.isPlaying()) {
                wavesurfer.pause();
            }
        });
    });
    
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
}

// =============================================
// INITIALIZE THE APPLICATION
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[App] Initializing iframe controller with parent coordination...');
    
    // Show UI immediately
    showUI();
    
    // Start parent coordination
    initializeParentCoordination();
    
    // Setup scroll detection
    setupScrollDetectionUI();
    
    console.log('[App] Iframe controller ready, waiting for parent session...');
});