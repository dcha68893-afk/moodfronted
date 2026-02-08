// =============================================
// FRIEND PAGE - UI IMPLEMENTATION
// =============================================

import {
    ParentCoordinator,
    KnectaAuth,
    currentUser,
    userData,
    friends,
    contacts,
    friendRequests,
    sentRequests,
    temporaryFriends,
    pinnedFriends,
    mutedFriends,
    selectedFriend,
    currentCategoryFilter,
    currentSearchTerm,
    isMobile,
    mutualFriendsCache,
    groups,
    allUsers,
    cameraStream,
    currentCamera,
    flashOn,
    apiReady,
    scanningActive,
    isInitialized,
    initializationStarted,
    backgroundSyncInterval,
    isAuthReady,
    backgroundTasksStarted,
    cacheLoaded,
    friendCategories,
    LOCAL_STORAGE_KEYS,
    dataSource,
    initializeParentChildCommunication,
    getValidToken,
    getCurrentUser,
    apiCallWithRetry,
    sendFriendRequest,
    acceptFriendRequestOnline,
    declineFriendRequest,
    cancelFriendRequest,
    loadFriendsFromBackend,
    loadFriendRequestsFromBackend,
    loadSentRequestsFromBackend,
    loadPinnedFriendsFromBackend,
    loadMutedFriendsFromBackend,
    loadContactsFromBackend,
    loadGroupsFromBackend,
    fetchAllUsersFromBackend,
    enhancedInitialize,
    loadCachedDataInstantly,
    startParallelDataLoading,
    escapeHtml,
    formatTimeAgo,
    formatDate,
    getTrustScoreClass,
    checkMobile,
    startCameraScanner,
    stopCameraScanner,
    toggleCamera,
    toggleFlash,
    generateUniqueQRCode,
    showMutualFriends,
    togglePinFriend,
    toggleMuteFriend,
    savePrivateNote,
    getLastInteraction,
    removeFriend,
    blockUser,
    saveFriendsToLocalStorage,
    simulateContactSync,
    updateUIWithUserData,
    updateDataSourceIndicator,
    attemptCachedDataFallback,
    initializeMainFunctionality,
    showAuthError,
    hideAuthError,
    showReconnectionState,
    hideReconnectionState,
    showNotification,
    navigateToChat,
    navigateToCall
} from './friend-core.js';

// =============================================
// UI ELEMENT REFERENCES
// =============================================

const friendDetailsPanel = document.getElementById('friendDetailsPanel');
const addFriendModal = document.getElementById('addFriendModal');
const friendRequestModal = document.getElementById('friendRequestModal');
const startChatModal = document.getElementById('startChatModal');
const mutualFriendsModal = document.getElementById('mutualFriendsModal');
const cameraScannerModal = document.getElementById('cameraScannerModal');
const notification = document.getElementById('notification');

const allFriendsSection = document.getElementById('allFriendsSection');
const contactsSection = document.getElementById('contactsSection');
const friendsSection = document.getElementById('friendsSection');
const requestsSection = document.getElementById('requestsSection');
const temporarySection = document.getElementById('temporarySection');
const pinnedSection = document.getElementById('pinnedSection');
const mutedSection = document.getElementById('mutedSection');

const allFriendsList = document.getElementById('allFriendsList');
const contactsList = document.getElementById('contactsList');
const friendsList = document.getElementById('friendsList');
const requestsList = document.getElementById('requestsList');
const sentRequestsList = document.getElementById('sentRequestsList');
const temporaryList = document.getElementById('temporaryList');
const pinnedList = document.getElementById('pinnedList');
const mutedList = document.getElementById('mutedList');

// =============================================
// UI RENDERING FUNCTIONS
// =============================================

export function updateFriendCounts() {
    const totalFriendsElement = document.getElementById('totalFriends');
    const onlineFriendsElement = document.getElementById('onlineFriends');
    const pinnedFriendsElement = document.getElementById('pinnedFriends');
    const friendsCountElement = document.getElementById('friendsCount');
    const contactsCountElement = document.getElementById('contactsCount');
    const requestsCountElement = document.getElementById('requestsCount');
    const requestsSectionCountElement = document.getElementById('requestsSectionCount');
    const sentRequestsCountElement = document.getElementById('sentRequestsCount');
    const pinnedCountElement = document.getElementById('pinnedCount');
    const mutedCountElement = document.getElementById('mutedCount');
    
    if (totalFriendsElement) totalFriendsElement.textContent = friends.length;
    
    const onlineCount = friends.filter(f => f.online).length;
    if (onlineFriendsElement) onlineFriendsElement.textContent = onlineCount;
    
    if (pinnedFriendsElement) pinnedFriendsElement.textContent = pinnedFriends.length;
    if (friendsCountElement) friendsCountElement.textContent = friends.length;
    if (contactsCountElement) contactsCountElement.textContent = contacts.length;
    if (requestsCountElement) requestsCountElement.textContent = friendRequests.length;
    if (requestsSectionCountElement) requestsSectionCountElement.textContent = friendRequests.length;
    if (sentRequestsCountElement) sentRequestsCountElement.textContent = sentRequests.length;
    if (pinnedCountElement) pinnedCountElement.textContent = pinnedFriends.length;
    if (mutedCountElement) mutedCountElement.textContent = mutedFriends.length;
}

export function updateCurrentSection() {
    updateFriendCounts();
    
    const activeSection = document.querySelector('.friends-section.active');
    if (activeSection) {
        const sectionId = activeSection.id;
        
        switch(sectionId) {
            case 'allFriendsSection':
                renderAllFriendsList();
                break;
                
            case 'contactsSection':
                renderContacts();
                break;
                
            case 'friendsSection':
                renderFriends();
                break;
                
            case 'requestsSection':
                renderFriendRequests();
                renderSentRequests();
                break;
                
            case 'temporarySection':
                renderTemporaryFriends();
                break;
                
            case 'pinnedSection':
                renderPinnedFriends();
                break;
                
            case 'mutedSection':
                renderMutedFriends();
                break;
        }
    }
}

function renderAllFriendsList() {
    if (!allFriendsList) return;
    
    allFriendsList.innerHTML = '';
    
    const allToDisplay = [
        ...pinnedFriends,
        ...friends,
        ...contacts,
        ...temporaryFriends
    ];
    
    if (allToDisplay.length === 0) {
        allFriendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <p>No friends yet</p>
                <p class="subtext">Add friends to start connecting</p>
            </div>
        `;
    } else {
        allToDisplay.forEach(item => {
            const type = pinnedFriends.some(f => f.id === item.id) ? 'pinned' :
                       friends.some(f => f.id === item.id) ? 'friend' : 'contact';
            addFriendItem(item, allFriendsList, type);
        });
    }
}

export function renderFriendsListInstantly() {
    if (!allFriendsList) return;
    
    allFriendsList.innerHTML = '';
    
    const allToDisplay = [
        ...pinnedFriends,
        ...friends,
        ...contacts
    ].slice(0, 25);
    
    if (allToDisplay.length === 0) {
        allFriendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <p>No friends yet</p>
                <p class="subtext">Add friends to start connecting</p>
            </div>
        `;
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    allToDisplay.forEach(item => {
        addFriendItemInstant(item, fragment, 
            pinnedFriends.some(f => f.id === item.id) ? 'pinned' : 
            friends.some(f => f.id === item.id) ? 'friend' : 'contact');
    });
    
    allFriendsList.appendChild(fragment);
    allFriendsList.classList.add('instant-load');
}

function addFriendItemInstant(friendData, container, type) {
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';
    friendItem.dataset.userId = friendData.id;
    friendItem.dataset.type = type;
    
    const initials = friendData.displayName ? 
        friendData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    let statusClass = 'offline';
    let statusText = 'Offline';
    
    if (friendData.online) {
        statusClass = 'online';
        statusText = 'Online now';
    }
    
    const lastInteraction = getLastInteraction(friendData.id);
    if (lastInteraction) {
        statusText = lastInteraction;
    }
    
    const userId = friendData.id;
    const mutualCount = mutualFriendsCache[userId] || 0;
    const category = friendData.category || 'friend';
    const categoryInfo = friendCategories[category];
    const isMuted = mutedFriends.some(f => f.id === userId);
    
    friendItem.innerHTML = `
        <div class="friend-avatar" ${friendData.photoURL ? `style="background-image: url('${escapeHtml(friendData.photoURL)}')"` : ''}>
            ${friendData.photoURL ? '' : `<span>${initials}</span>`}
            <div class="friend-status ${statusClass}"></div>
            ${type === 'pinned' ? '<div class="friend-category-badge pinned" title="Pinned Friend"><i class="fas fa-thumbtack"></i></div>' : 
             isMuted ? '<div class="friend-category-badge muted" title="Muted Friend"><i class="fas fa-volume-mute"></i></div>' :
             categoryInfo ? `<div class="friend-category-badge ${category}" title="${categoryInfo.name}"><i class="${categoryInfo.icon}"></i></div>` : ''}
        </div>
        <div class="friend-info">
            <div class="friend-name">
                <span class="friend-name-text">${escapeHtml(friendData.displayName || 'Unknown User')}</span>
                <span class="friend-details">
                    ${friendData.isTemporary ? '<span class="temp-friend-badge"><i class="fas fa-clock"></i> Temp</span>' : ''}
                    ${friendData.isBusiness ? '<span class="business-badge"><i class="fas fa-briefcase"></i> Business</span>' : ''}
                    ${type === 'pinned' ? '<span class="temp-friend-badge"><i class="fas fa-thumbtack"></i> Pinned</span>' : ''}
                    ${isMuted ? '<span class="temp-friend-badge"><i class="fas fa-volume-mute"></i> Muted</span>' : ''}
                </span>
            </div>
            <div class="friend-details">
                ${friendData.username ? `<span class="friend-username">${escapeHtml(friendData.username)}</span>` : ''}
                ${mutualCount > 0 ? `<span class="mutual-friends" data-user-id="${userId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}"><i class="fas fa-users"></i> ${mutualCount} mutual</span>` : ''}
                <span>${statusText}</span>
            </div>
        </div>
        <div class="friend-actions">
            <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Chat">
                <i class="fas fa-comments"></i>
            </button>
            <button class="friend-action-btn call" data-action="call" data-user-id="${userId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Call">
                <i class="fas fa-phone"></i>
            </button>
            ${type === 'contact' ? `
            <button class="friend-action-btn success" data-action="add" title="Add as Friend">
                <i class="fas fa-user-plus"></i>
            </button>
            ` : `
            <button class="friend-action-btn" data-action="more" title="More options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            `}
        </div>
    `;
    
    friendItem.addEventListener('click', (e) => {
        if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
            showFriendDetails(friendData, type);
        }
    });
    
    const actionButtons = friendItem.querySelectorAll('.friend-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleFriendAction(action, friendData, type, btn);
        });
    });
    
    const mutualFriendsElement = friendItem.querySelector('.mutual-friends');
    if (mutualFriendsElement) {
        mutualFriendsElement.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = mutualFriendsElement.dataset.userId;
            const userName = mutualFriendsElement.dataset.userName;
            showMutualFriends(userId, userName);
        });
    }
    
    container.appendChild(friendItem);
}

export function renderContacts() {
    if (!contactsList) return;
    
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-address-book"></i>
                <p>No contacts found</p>
                <p class="subtext">Sync your phone contacts to find friends</p>
            </div>
        `;
        return;
    }
    
    contacts.forEach(contact => {
        addFriendItem(contact, contactsList, 'contact');
    });
}

export function addFriendItem(friendData, container, type) {
    if (currentCategoryFilter !== 'all' && friendData.category !== currentCategoryFilter) {
        if (currentCategoryFilter === 'pinned' && !pinnedFriends.some(f => f.id === friendData.id)) {
            return;
        }
        if (currentCategoryFilter === 'muted' && !mutedFriends.some(f => f.id === friendData.id)) {
            return;
        }
        if (!['pinned', 'muted'].includes(currentCategoryFilter) && friendData.category !== currentCategoryFilter) {
            return;
        }
    }
    
    if (currentSearchTerm && !matchesSearch(friendData, currentSearchTerm)) {
        return;
    }
    
    const friendId = friendData.id;
    const existingItem = container.querySelector(`[data-user-id="${friendId}"]`);
    if (existingItem) {
        existingItem.remove();
    }
    
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';
    friendItem.dataset.userId = friendId;
    friendItem.dataset.type = type;
    
    const initials = friendData.displayName ? 
        friendData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    let statusClass = 'offline';
    let statusText = 'Offline';
    
    if (friendData.online) {
        statusClass = 'online';
        statusText = 'Online now';
    } else if (friendData.lastSeen) {
        const lastSeen = new Date(friendData.lastSeen);
        const minutesAgo = Math.floor((new Date() - lastSeen) / 60000);
        
        if (minutesAgo < 5) {
            statusClass = 'online';
            statusText = 'Online now';
        } else if (minutesAgo < 15) {
            statusClass = 'away';
            statusText = 'Recently';
        } else {
            statusText = `Last seen ${formatTimeAgo(lastSeen)}`;
        }
    }
    
    const lastInteraction = getLastInteraction(friendId);
    if (lastInteraction) {
        statusText = lastInteraction;
    }
    
    const mutualCount = mutualFriendsCache[friendId] || 0;
    const category = friendData.category || 'friend';
    const categoryInfo = friendCategories[category];
    const isPinned = pinnedFriends.some(f => f.id === friendId);
    const isMuted = mutedFriends.some(f => f.id === friendId);
    
    friendItem.innerHTML = `
        <div class="friend-avatar" ${friendData.photoURL ? `style="background-image: url('${escapeHtml(friendData.photoURL)}')"` : ''}>
            ${friendData.photoURL ? '' : `<span>${initials}</span>`}
            <div class="friend-status ${statusClass}"></div>
            ${isPinned ? '<div class="friend-category-badge pinned" title="Pinned Friend"><i class="fas fa-thumbtack"></i></div>' : 
             isMuted ? '<div class="friend-category-badge muted" title="Muted Friend"><i class="fas fa-volume-mute"></i></div>' :
             categoryInfo ? `<div class="friend-category-badge ${category}" title="${categoryInfo.name}"><i class="${categoryInfo.icon}"></i></div>` : ''}
        </div>
        <div class="friend-info">
            <div class="friend-name">
                <span class="friend-name-text">${escapeHtml(friendData.displayName || 'Unknown User')}</span>
                <span class="friend-details">
                    ${friendData.isTemporary ? '<span class="temp-friend-badge"><i class="fas fa-clock"></i> Temp</span>' : ''}
                    ${friendData.isBusiness ? '<span class="business-badge"><i class="fas fa-briefcase"></i> Business</span>' : ''}
                    ${isPinned ? '<span class="temp-friend-badge"><i class="fas fa-thumbtack"></i> Pinned</span>' : ''}
                    ${isMuted ? '<span class="temp-friend-badge"><i class="fas fa-volume-mute"></i> Muted</span>' : ''}
                </span>
            </div>
            <div class="friend-details">
                ${friendData.username ? `<span class="friend-username">${escapeHtml(friendData.username)}</span>` : ''}
                ${mutualCount > 0 ? `<span class="mutual-friends" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}"><i class="fas fa-users"></i> ${mutualCount} mutual</span>` : ''}
                <span>${statusText}</span>
                ${friendData.trustScore ? `<span class="trust-score ${getTrustScoreClass(friendData.trustScore)}"><i class="fas fa-shield-alt"></i> ${friendData.trustScore}/10</span>` : ''}
            </div>
        </div>
        <div class="friend-actions">
            ${type === 'contact' ? `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-action-btn success" data-action="add" title="Add as Friend">
                    <i class="fas fa-user-plus"></i>
                </button>
            ` : ''}
            
            ${type === 'friend' || type === 'pinned' || type === 'muted' || type === 'temporary' ? `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn call" data-action="call" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" title="Start Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="friend-action-btn" data-action="more" title="More options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    friendItem.addEventListener('click', (e) => {
        if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
            showFriendDetails(friendData, type);
        }
    });
    
    const actionButtons = friendItem.querySelectorAll('.friend-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleFriendAction(action, friendData, type, btn);
        });
    });
    
    const mutualFriendsElement = friendItem.querySelector('.mutual-friends');
    if (mutualFriendsElement) {
        mutualFriendsElement.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = mutualFriendsElement.dataset.userId;
            const userName = mutualFriendsElement.dataset.userName;
            showMutualFriends(userId, userName);
        });
    }
    
    container.appendChild(friendItem);
}

export function renderFriends() {
    if (!friendsList) return;
    
    friendsList.innerHTML = '';
    
    if (friends.length === 0) {
        friendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <p>No friends yet</p>
                <p class="subtext">Add friends to start connecting</p>
            </div>
        `;
        return;
    }
    
    const sortedFriends = [...friends].sort((a, b) => {
        const aPinned = pinnedFriends.some(f => f.id === a.id);
        const bPinned = pinnedFriends.some(f => f.id === b.id);
        
        if (aPinned !== bPinned) return bPinned ? 1 : -1;
        if (a.online !== b.online) return b.online ? 1 : -1;
        return (a.displayName || '').localeCompare(b.displayName || '');
    });
    
    sortedFriends.forEach(friend => {
        addFriendItem(friend, friendsList, 'friend');
    });
}

export function renderFriendRequests() {
    if (!requestsList) return;
    
    requestsList.innerHTML = '';
    
    if (friendRequests.length === 0) {
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No friend requests</p>
                <p class="subtext">When someone sends you a request, it will appear here</p>
            </div>
        `;
        return;
    }
    
    friendRequests.forEach(request => {
        addFriendRequestItem(request, requestsList, 'incoming');
    });
}

export function renderSentRequests() {
    if (!sentRequestsList) return;
    
    sentRequestsList.innerHTML = '';
    
    if (sentRequests.length === 0) {
        sentRequestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-paper-plane"></i>
                <p>No sent requests</p>
                <p class="subtext">Your sent friend requests will appear here</p>
            </div>
        `;
        return;
    }
    
    sentRequests.forEach(request => {
        addFriendRequestItem(request, sentRequestsList, 'sent');
    });
}

export function addFriendRequestItem(requestData, container, type) {
    const requestItem = document.createElement('div');
    requestItem.className = 'friend-item';
    requestItem.dataset.requestId = requestData.id;
    requestItem.dataset.type = type + '_request';
    
    const userData = requestData.user || requestData.sender || requestData.receiver || requestData;
    const userId = userData.id;
    
    const initials = userData.displayName ? 
        userData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const mutualCount = mutualFriendsCache[userId] || 0;
    
    requestItem.innerHTML = `
        <div class="friend-avatar" ${userData.photoURL ? `style="background-image: url('${escapeHtml(userData.photoURL)}')"` : ''}>
            ${userData.photoURL ? '' : `<span>${initials}</span>`}
        </div>
        <div class="friend-info">
            <div class="friend-name">
                <span class="friend-name-text">${escapeHtml(userData.displayName || 'Unknown User')}</span>
                <div style="font-size: 12px; color: ${type === 'incoming' ? 'var(--success-color)' : 'var(--primary-color)'}; margin-top: 3px;">
                    ${type === 'incoming' ? 'Incoming Request' : 'Sent Request'}
                </div>
            </div>
            <div class="friend-details">
                ${userData.username ? `<span class="friend-username">${escapeHtml(userData.username)}</span>` : ''}
                ${mutualCount > 0 ? `<span class="mutual-friends" data-user-id="${userId}" data-user-name="${escapeHtml(userData.displayName || 'User')}"><i class="fas fa-users"></i> ${mutualCount} mutual</span>` : ''}
                <span>${type === 'incoming' ? 'Received ' : 'Sent '}${formatTimeAgo(new Date(requestData.createdAt || requestData.timestamp || Date.now()))}</span>
            </div>
            ${requestData.note ? `<div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px; font-style: italic;">"${escapeHtml(requestData.note)}"</div>` : ''}
        </div>
        <div class="friend-actions">
            ${type === 'incoming' ? `
                <button class="friend-action-btn success" data-action="accept" title="Accept">
                    <i class="fas fa-check"></i>
                </button>
                <button class="friend-action-btn danger" data-action="decline" title="Decline">
                    <i class="fas fa-times"></i>
                </button>
                <button class="friend-action-btn" data-action="view-profile" title="View Profile">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
            
            ${type === 'sent' ? `
                <button class="friend-action-btn danger" data-action="cancel" title="Cancel Request">
                    <i class="fas fa-times"></i>
                </button>
                <button class="friend-action-btn" data-action="view-profile" title="View Profile">
                    <i class="fas fa-eye"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    requestItem.addEventListener('click', (e) => {
        if (!e.target.closest('.friend-actions') && !e.target.closest('.mutual-friends')) {
            showFriendRequestProfile(requestData);
        }
    });
    
    const actionButtons = requestItem.querySelectorAll('.friend-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleRequestAction(action, requestData, btn);
        });
    });
    
    const mutualFriendsElement = requestItem.querySelector('.mutual-friends');
    if (mutualFriendsElement) {
        mutualFriendsElement.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = mutualFriendsElement.dataset.userId;
            const userName = mutualFriendsElement.dataset.userName;
            showMutualFriends(userId, userName);
        });
    }
    
    container.appendChild(requestItem);
}

export function handleFriendAction(action, friendData, type, button) {
    const userId = button.dataset.userId;
    const userName = button.dataset.userName;
    
    switch(action) {
        case 'start-chat':
            navigateToChat(userId, userName);
            break;
            
        case 'call':
            navigateToCall(userId, userName);
            break;
            
        case 'add':
            sendFriendRequest(friendData.id);
            break;
            
        case 'more':
            showFriendOptions(friendData);
            break;
            
        case 'accept':
            acceptFriendRequestOnline(friendData.id || friendData.requestId, friendData.senderId || friendData.id);
            break;
            
        case 'decline':
            declineFriendRequest(friendData);
            break;
            
        case 'cancel':
            cancelFriendRequest(friendData);
            break;
            
        case 'view-profile':
            showFriendRequestProfile(friendData);
            break;
            
        default:
            console.log('[Friend Page] Unknown action:', action);
    }
}

export function handleRequestAction(action, requestData, button) {
    switch(action) {
        case 'accept':
            acceptFriendRequestOnline(requestData.id, requestData.senderId);
            break;
            
        case 'decline':
            declineFriendRequest(requestData);
            break;
            
        case 'cancel':
            cancelFriendRequest(requestData);
            break;
            
        case 'view-profile':
            showFriendRequestProfile(requestData);
            break;
    }
}

// =============================================
// FILTERING AND SEARCH FUNCTIONS
// =============================================

export function filterFriendsByCategory(category) {
    currentCategoryFilter = category;
    updateCurrentSection();
    
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.category-filter-btn[data-category="${category}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

export function searchFriends(searchTerm) {
    currentSearchTerm = searchTerm.toLowerCase().trim();
    updateCurrentSection();
}

function matchesSearch(friendData, searchTerm) {
    if (!searchTerm) return true;
    
    const searchIn = [
        friendData.displayName || '',
        friendData.username || '',
        friendData.email || '',
        friendData.phoneNumber || ''
    ].join(' ').toLowerCase();
    
    return searchIn.includes(searchTerm);
}

// =============================================
// ALL USERS TAB FUNCTIONS
// =============================================

export function renderAllUsersList() {
    const allUsersListElement = document.getElementById('allUsersList');
    const allUsersStatusElement = document.getElementById('allUsersStatus');
    const allUsersSearchElement = document.getElementById('allUsersSearch');
    
    if (!allUsersListElement) return;
    
    const searchTerm = allUsersSearchElement ? allUsersSearchElement.value.toLowerCase() : '';
    
    const filteredUsers = allUsers.filter(user => {
        if (!searchTerm) return true;
        
        const searchIn = [
            user.displayName || '',
            user.username || '',
            user.email || '',
            user.bio || '',
            user.interests ? user.interests.join(' ') : ''
        ].join(' ').toLowerCase();
        
        return searchIn.includes(searchTerm);
    });
    
    if (allUsersStatusElement) {
        allUsersStatusElement.textContent = `${filteredUsers.length} users found${searchTerm ? ` for "${searchTerm}"` : ''}`;
    }
    
    allUsersListElement.innerHTML = '';
    
    if (filteredUsers.length === 0) {
        allUsersListElement.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No users found${searchTerm ? ' matching your search' : ''}</p>
                <p style="font-size: 14px; margin-top: 10px;">${searchTerm ? 'Try a different search term' : 'Check back later for new users'}</p>
            </div>
        `;
        return;
    }
    
    filteredUsers.forEach(user => {
        const userItem = createUserSearchItem(user);
        allUsersListElement.appendChild(userItem);
    });
}

function createUserSearchItem(user) {
    const userId = user.id;
    const initials = user.displayName ? 
        user.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
        'U';
    
    const isAlreadyFriend = friends.some(f => f.id === userId);
    const hasPendingRequest = sentRequests.some(r => r.receiverId === userId);
    const hasIncomingRequest = friendRequests.some(r => r.senderId === userId);
    
    const userItem = document.createElement('div');
    userItem.className = 'user-search-item';
    userItem.dataset.userId = userId;
    
    userItem.innerHTML = `
        <div class="user-search-avatar" ${user.photoURL ? `style="background-image: url('${escapeHtml(user.photoURL)}')"` : ''}>
            ${user.photoURL ? '' : `<span>${initials}</span>`}
        </div>
        <div class="user-search-info">
            <div class="user-search-name">
                ${escapeHtml(user.displayName || 'Unknown User')}
                <span class="user-search-status ${user.online ? 'online' : 'offline'}"></span>
            </div>
            <div class="user-search-username">
                ${user.username ? escapeHtml(user.username) : 'No username'}
                ${user.bio ? ' • ' + escapeHtml(user.bio.substring(0, 30) + (user.bio.length > 30 ? '...' : '')) : ''}
            </div>
        </div>
        <div class="user-search-actions">
            ${isAlreadyFriend ? `
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${escapeHtml(user.displayName || 'User')}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
                <button class="friend-action-btn" data-action="more" title="More options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            ` : hasPendingRequest ? `
                <button class="friend-action-btn danger" data-action="cancel-request" title="Cancel Request">
                    <i class="fas fa-clock"></i>
                </button>
            ` : hasIncomingRequest ? `
                <button class="friend-action-btn success" data-action="accept" title="Accept Request">
                    <i class="fas fa-check"></i>
                </button>
                <button class="friend-action-btn danger" data-action="decline" title="Decline Request">
                    <i class="fas fa-times"></i>
                </button>
            ` : `
                <button class="friend-action-btn success" data-action="add" title="Add Friend">
                    <i class="fas fa-user-plus"></i>
                </button>
                <button class="friend-action-btn chat" data-action="start-chat" data-user-id="${userId}" data-user-name="${escapeHtml(user.displayName || 'User')}" title="Start Chat">
                    <i class="fas fa-comments"></i>
                </button>
            `}
        </div>
    `;
    
    userItem.addEventListener('click', (e) => {
        if (!e.target.closest('.user-search-actions')) {
            showFriendDetails(user, 'user');
        }
    });
    
    const actionButtons = userItem.querySelectorAll('.friend-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            
            if (action === 'start-chat') {
                const userId = btn.dataset.userId;
                const userName = btn.dataset.userName;
                navigateToChat(userId, userName);
            } else if (action === 'add') {
                sendFriendRequest(userId);
            } else if (action === 'more') {
                showFriendOptions(user);
            } else if (action === 'cancel-request') {
                const sentRequest = sentRequests.find(r => r.receiverId === userId);
                if (sentRequest) {
                    cancelFriendRequest(sentRequest);
                }
            } else if (action === 'accept') {
                const incomingRequest = friendRequests.find(r => r.senderId === userId);
                if (incomingRequest) {
                    acceptFriendRequestOnline(incomingRequest.id, userId);
                }
            } else if (action === 'decline') {
                const incomingRequest = friendRequests.find(r => r.senderId === userId);
                if (incomingRequest) {
                    declineFriendRequest(incomingRequest);
                }
            }
        });
    });
    
    return userItem;
}

// =============================================
// FRIEND DETAILS AND PROFILE FUNCTIONS
// =============================================

export function showFriendDetails(friendData, type) {
    selectedFriend = friendData;
    document.querySelector('.friend-details-title').textContent = 'Friend Details';
    friendDetailsPanel.classList.add('active');
    loadFriendDetails(friendData, type);
}

export async function loadFriendDetails(friendData, type) {
    const detailsContent = document.getElementById('friendDetailsContent');
    detailsContent.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 15px;"></i><p>Loading friend details...</p></div>';
    
    try {
        let detailedData = friendData;
        
        if (type === 'friend' || type === 'contact' || type === 'user') {
            try {
                const friendId = friendData.id;
                const response = await apiCallWithRetry(`/api/users/${friendId}`, null, 1);
                if (response && response.user) {
                    detailedData = { ...detailedData, ...response.user };
                }
            } catch (error) {
                // Silently fail - use cached data
            }
        }
        
        let friendshipData = null;
        if (type === 'friend') {
            const friend = friends.find(f => f.id === friendData.id);
            if (friend) {
                friendshipData = {
                    category: friend.category || 'friend',
                    notes: friend.notes || '',
                    isTemporary: friend.isTemporary || false,
                    expiresAt: friend.expiresAt || null,
                    isBusiness: friend.isBusiness || false,
                    trustScore: friend.trustScore || 5,
                    addedAt: friend.addedAt || new Date()
                };
            }
        }
        
        const friendId = detailedData.id;
        const mutualCount = mutualFriendsCache[friendId] || 0;
        
        let statusClass = 'offline';
        let statusText = 'Offline';
        
        if (detailedData.online) {
            statusClass = 'online';
            statusText = 'Online now';
        } else if (detailedData.lastSeen) {
            const lastSeen = new Date(detailedData.lastSeen);
            const minutesAgo = Math.floor((new Date() - lastSeen) / 60000);
            
            if (minutesAgo < 5) {
                statusClass = 'online';
                statusText = 'Online now';
            } else if (minutesAgo < 15) {
                statusClass = 'away';
                statusText = `Last seen ${minutesAgo} minutes ago`;
            } else {
                statusText = `Last seen ${formatTimeAgo(lastSeen)}`;
            }
        }
        
        const lastInteraction = getLastInteraction(friendId);
        if (lastInteraction) {
            statusText = lastInteraction;
        }
        
        const category = friendshipData?.category || 'friend';
        const categoryInfo = friendCategories[category];
        const initials = detailedData.displayName ? 
            detailedData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
            'U';
        
        let notes = friendshipData?.notes || '';
        if (window.privateNotes && window.privateNotes[friendId]) {
            notes = window.privateNotes[friendId];
        }
        
        const isPinned = pinnedFriends.some(f => f.id === friendId);
        const isMuted = mutedFriends.some(f => f.id === friendId);
        const isAlreadyFriend = friends.some(f => f.id === friendId);
        const hasPendingRequest = sentRequests.some(r => r.receiverId === friendId);
        const hasIncomingRequest = friendRequests.some(r => r.senderId === friendId);
        
        detailsContent.innerHTML = `
            <div class="friend-profile-header">
                <div class="friend-profile-avatar" ${detailedData.photoURL ? `style="background-image: url('${escapeHtml(detailedData.photoURL)}')"` : ''}>
                    ${detailedData.photoURL ? '' : `<span style="color: white; font-size: 36px;">${initials}</span>`}
                    ${isPinned ? '<div class="friend-category-badge pinned" style="width: 30px; height: 30px; font-size: 12px;"><i class="fas fa-thumbtack"></i></div>' : ''}
                    ${isMuted ? '<div class="friend-category-badge muted" style="width: 30px; height: 30px; font-size: 12px;"><i class="fas fa-volume-mute"></i></div>' : ''}
                </div>
                <div class="friend-profile-name">${escapeHtml(detailedData.displayName || 'Unknown User')}</div>
                <div class="friend-profile-username">${escapeHtml(detailedData.username || 'No username')}</div>
                <div class="friend-profile-status ${statusClass}">${statusText}</div>
            </div>
            
            <div class="friend-info-section">
                <div class="info-section-title">
                    <i class="fas fa-info-circle"></i>
                    <span>Basic Information</span>
                </div>
                
                ${friendshipData ? `
                <div class="info-item">
                    <span class="info-label">Friendship Category:</span>
                    <span class="info-value">
                        <div class="category-display ${category}">
                            <i class="${categoryInfo.icon}"></i>
                            ${categoryInfo.name}
                        </div>
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Friends Since:</span>
                    <span class="info-value">${formatDate(new Date(friendshipData.addedAt || friendshipData.createdAt || Date.now()))}</span>
                </div>
                
                ${friendshipData.isTemporary ? `
                <div class="info-item">
                    <span class="info-label">Expires:</span>
                    <span class="info-value">${friendshipData.expiresAt ? formatDate(new Date(friendshipData.expiresAt)) : 'Never'}</span>
                </div>
                ` : ''}
                
                ${friendshipData.isBusiness ? `
                <div class="info-item">
                    <span class="info-label">Business Contact:</span>
                    <span class="info-value">Yes</span>
                </div>
                ` : ''}
                
                ` : ''}
                
                <div class="info-item">
                    <span class="info-label">Mutual Friends:</span>
                    <span class="info-value">
                        <span class="mutual-friends" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}" style="cursor: pointer;">
                            <i class="fas fa-users"></i> ${mutualCount} mutual
                        </span>
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Trust Score:</span>
                    <span class="info-value">
                        <div class="trust-score ${getTrustScoreClass(friendData.trustScore || 5)}">
                            <i class="fas fa-shield-alt"></i>
                            ${friendData.trustScore || 5}/10
                        </div>
                    </span>
                </div>
                
                ${detailedData.email ? `
                <div class="info-item">
                    <span class="info-label">Email:</span>
                    <span class="info-value">${escapeHtml(detailedData.email)}</span>
                </div>
                ` : ''}
                
                ${detailedData.phoneNumber ? `
                <div class="info-item">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${escapeHtml(detailedData.phoneNumber)}</span>
                </div>
                ` : ''}
                
                ${detailedData.bio ? `
                <div class="info-item">
                    <span class="info-label">Bio:</span>
                    <span class="info-value">${escapeHtml(detailedData.bio)}</span>
                </div>
                ` : ''}
                
                ${detailedData.interests && detailedData.interests.length > 0 ? `
                <div class="info-item">
                    <span class="info-label">Interests:</span>
                    <span class="info-value">${detailedData.interests.map(interest => escapeHtml(interest)).join(', ')}</span>
                </div>
                ` : ''}
            </div>
            
            ${!isAlreadyFriend && !hasPendingRequest && !hasIncomingRequest ? `
            <div class="friend-info-section">
                <div class="info-section-title">
                    <i class="fas fa-user-plus"></i>
                    <span>Add as Friend</span>
                </div>
                <p style="margin-bottom: 15px; color: var(--text-secondary);">You can add this user as a friend to start chatting and sharing.</p>
                <div class="action-buttons">
                    <button class="action-btn success" id="addUserAsFriendBtn">
                        <i class="fas fa-user-plus"></i> Send Friend Request
                    </button>
                </div>
            </div>
            ` : ''}
            
            ${isAlreadyFriend ? `
            <div class="friend-info-section">
                <div class="info-section-title">
                    <i class="fas fa-sticky-note"></i>
                    <span>Private Notes</span>
                </div>
                <textarea class="notes-textarea" id="friendNotesTextarea" placeholder="Add private notes about this friend...">${escapeHtml(notes)}</textarea>
                <button class="action-btn secondary" id="saveNotesBtn" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-save"></i> Save Notes
                </button>
            </div>
            ` : ''}
            
            <div class="action-buttons">
                ${type === 'friend' || type === 'pinned' || type === 'muted' ? `
                <button class="action-btn success" id="startChatDetailsBtn" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}">
                    <i class="fas fa-comments"></i> Start Chat
                </button>
                <button class="action-btn primary" id="callFriendBtn" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}">
                    <i class="fas fa-phone"></i> Start Call
                </button>
                <button class="action-btn secondary" id="friendOptionsBtn">
                    <i class="fas fa-cog"></i> Options
                </button>
                ` : ''}
                
                ${type === 'contact' ? `
                <button class="action-btn success" id="startChatWithContactBtn" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}">
                    <i class="fas fa-comments"></i> Start Chat
                </button>
                <button class="action-btn primary" id="addContactBtn">
                    <i class="fas fa-user-plus"></i> Add as Friend
                </button>
                ` : ''}
                
                ${type === 'user' && !isAlreadyFriend && !hasPendingRequest ? `
                <button class="action-btn success" id="startChatWithUserBtn" data-user-id="${friendId}" data-user-name="${escapeHtml(friendData.displayName || 'User')}">
                    <i class="fas fa-comments"></i> Start Chat
                </button>
                <button class="action-btn primary" id="addUserBtn">
                    <i class="fas fa-user-plus"></i> Add as Friend
                </button>
                ` : ''}
                
                ${type === 'incoming_request' ? `
                <button class="action-btn success" id="acceptRequestDetailsBtn">
                    <i class="fas fa-check"></i> Accept
                </button>
                <button class="action-btn danger" id="declineRequestDetailsBtn">
                    <i class="fas fa-times"></i> Decline
                </button>
                <button class="action-btn secondary" id="viewProfileBtn">
                    <i class="fas fa-eye"></i> View Full Profile
                </button>
                ` : ''}
            </div>
        `;
        
        if (type === 'friend' || type === 'pinned' || type === 'muted') {
            document.getElementById('startChatDetailsBtn').addEventListener('click', function() {
                const userId = this.dataset.userId;
                const userName = this.dataset.userName;
                navigateToChat(userId, userName);
            });
            
            document.getElementById('callFriendBtn').addEventListener('click', function() {
                const userId = this.dataset.userId;
                const userName = this.dataset.userName;
                navigateToCall(userId, userName);
            });
            
            document.getElementById('friendOptionsBtn').addEventListener('click', () => {
                showFriendOptions(friendData);
            });
            
            if (document.getElementById('saveNotesBtn')) {
                document.getElementById('saveNotesBtn').addEventListener('click', () => {
                    const notes = document.getElementById('friendNotesTextarea').value;
                    savePrivateNote(friendId, notes);
                });
            }
            
            const mutualFriendsElement = detailsContent.querySelector('.mutual-friends');
            if (mutualFriendsElement) {
                mutualFriendsElement.addEventListener('click', () => {
                    const userId = mutualFriendsElement.dataset.userId;
                    const userName = mutualFriendsElement.dataset.userName;
                    showMutualFriends(userId, userName);
                });
            }
        }
        
        if (type === 'contact') {
            document.getElementById('startChatWithContactBtn').addEventListener('click', function() {
                const userId = this.dataset.userId;
                const userName = this.dataset.userName;
                navigateToChat(userId, userName);
            });
            
            document.getElementById('addContactBtn').addEventListener('click', () => {
                sendFriendRequest(friendId);
            });
        }
        
        if (type === 'user') {
            if (document.getElementById('startChatWithUserBtn')) {
                document.getElementById('startChatWithUserBtn').addEventListener('click', function() {
                    const userId = this.dataset.userId;
                    const userName = this.dataset.userName;
                    navigateToChat(userId, userName);
                });
            }
            
            if (document.getElementById('addUserBtn')) {
                document.getElementById('addUserBtn').addEventListener('click', () => {
                    sendFriendRequest(friendId);
                });
            }
            
            if (document.getElementById('addUserAsFriendBtn')) {
                document.getElementById('addUserAsFriendBtn').addEventListener('click', () => {
                    sendFriendRequest(friendId);
                });
            }
        }
        
        if (type === 'incoming_request') {
            document.getElementById('acceptRequestDetailsBtn').addEventListener('click', () => {
                acceptFriendRequestOnline(friendData.id || friendData.requestId, friendData.senderId || friendId);
            });
            
            document.getElementById('declineRequestDetailsBtn').addEventListener('click', () => {
                declineFriendRequest(friendData);
            });
            
            document.getElementById('viewProfileBtn').addEventListener('click', () => {
                showFriendRequestProfile(friendData);
            });
        }
        
    } catch (error) {
        console.log('[Friend Page] Error loading friend details:', error.message);
        detailsContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading friend details</p>
                <p class="subtext">Please try again later</p>
            </div>
        `;
    }
}

export function showFriendRequestProfile(requestData) {
    const userData = requestData.user || requestData.sender || requestData.receiver || requestData;
    const userId = userData.id;
    
    const profileModal = document.createElement('div');
    profileModal.className = 'add-friend-modal active';
    profileModal.innerHTML = `
        <div class="add-friend-container friend-request-profile">
            <div class="add-friend-header">
                <h3>${requestData.type === 'incoming_request' || requestData.status === 'pending' ? 'Friend Request' : 'Sent Request'}</h3>
                <button class="add-friend-btn close-profile-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 25px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <div class="friend-profile-avatar" ${userData.photoURL ? `style="background-image: url('${escapeHtml(userData.photoURL)}'); width: 100px; height: 100px;"` : 'style="width: 100px; height: 100px;"'}>
                        ${userData.photoURL ? '' : `<span style="color: white; font-size: 36px;">${userData.displayName ? userData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 'U'}</span>`}
                    </div>
                    <div class="friend-profile-name" style="font-size: 20px; margin-top: 15px;">${escapeHtml(userData.displayName || 'Unknown User')}</div>
                    <div class="friend-profile-username">${escapeHtml(userData.username || 'No username')}</div>
                    <div style="margin-top: 10px; padding: 6px 12px; background-color: ${requestData.type === 'incoming_request' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0, 132, 255, 0.1)'}; color: ${requestData.type === 'incoming_request' ? 'var(--success-color)' : 'var(--primary-color)'}; border-radius: 20px; font-size: 14px; display: inline-block;">
                        ${requestData.type === 'incoming_request' ? 'Incoming Friend Request' : 'Sent Friend Request'}
                    </div>
                    ${userData.bio ? `<div style="margin-top: 10px; color: var(--text-secondary); font-size: 14px;">${escapeHtml(userData.bio)}</div>` : ''}
                </div>
                
                <div class="friend-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-info-circle"></i>
                        <span>Request Information</span>
                    </div>
                    
                    ${userData.email ? `
                    <div class="info-item">
                        <span class="info-label">Email:</span>
                        <span class="info-value">${escapeHtml(userData.email)}</span>
                    </div>
                    ` : ''}
                    
                    <div class="info-item">
                        <span class="info-label">Request Date:</span>
                        <span class="info-value">${formatDate(new Date(requestData.createdAt || requestData.timestamp || Date.now()))}</span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Mutual Friends:</span>
                        <span class="info-value">
                            <span class="mutual-friends" data-user-id="${userId}" data-user-name="${escapeHtml(userData.displayName || 'User')}" style="cursor: pointer;">
                                <i class="fas fa-users"></i> ${mutualFriendsCache[userId] || 0} mutual
                            </span>
                        </span>
                    </div>
                    
                    ${requestData.note ? `
                    <div class="info-item">
                        <span class="info-label">Request Note:</span>
                        <span class="info-value">"${escapeHtml(requestData.note)}"</span>
                    </div>
                    ` : ''}
                    
                    ${requestData.category ? `
                    <div class="info-item">
                        <span class="info-label">Category:</span>
                        <span class="info-value">
                            <div class="category-display ${requestData.category}">
                                <i class="${friendCategories[requestData.category]?.icon || 'fas fa-user'}"></i>
                                ${friendCategories[requestData.category]?.name || requestData.category}
                            </div>
                        </span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="request-actions">
                    <button class="action-btn secondary close-profile-btn" style="flex: 1;">
                        <i class="fas fa-times"></i> Close
                    </button>
                    ${requestData.type === 'incoming_request' || requestData.status === 'pending' ? `
                    <button class="action-btn danger decline-profile-btn" style="flex: 1;">
                        <i class="fas fa-times"></i> Decline
                    </button>
                    <button class="action-btn success accept-profile-btn" style="flex: 1;">
                        <i class="fas fa-check"></i> Accept
                    </button>
                    ` : `
                    <button class="action-btn danger cancel-profile-btn" style="flex: 1;">
                        <i class="fas fa-times"></i> Cancel Request
                    </button>
                    `}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(profileModal);
    
    profileModal.querySelector('.close-profile-modal').addEventListener('click', () => {
        document.body.removeChild(profileModal);
    });
    
    profileModal.querySelector('.close-profile-btn').addEventListener('click', () => {
        document.body.removeChild(profileModal);
    });
    
    const mutualFriendsElement = profileModal.querySelector('.mutual-friends');
    if (mutualFriendsElement) {
        mutualFriendsElement.addEventListener('click', () => {
            const userId = mutualFriendsElement.dataset.userId;
            const userName = mutualFriendsElement.dataset.userName;
            showMutualFriends(userId, userName);
            document.body.removeChild(profileModal);
        });
    }
    
    if (requestData.type === 'incoming_request' || requestData.status === 'pending') {
        profileModal.querySelector('.decline-profile-btn').addEventListener('click', () => {
            declineFriendRequest(requestData);
            document.body.removeChild(profileModal);
        });
        
        profileModal.querySelector('.accept-profile-btn').addEventListener('click', () => {
            acceptFriendRequestOnline(requestData.id, userId);
            document.body.removeChild(profileModal);
        });
    } else {
        profileModal.querySelector('.cancel-profile-btn').addEventListener('click', () => {
            cancelFriendRequest(requestData);
            document.body.removeChild(profileModal);
        });
    }
}

// =============================================
// FRIEND OPTIONS AND MANAGEMENT FUNCTIONS
// =============================================

export function showFriendOptions(friendData) {
    const optionsModal = document.createElement('div');
    optionsModal.className = 'add-friend-modal active';
    optionsModal.innerHTML = `
        <div class="add-friend-container">
            <div class="add-friend-header">
                <h3>Friend Options</h3>
                <button class="add-friend-btn close-options-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 25px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div class="friend-profile-avatar" ${friendData.photoURL ? `style="background-image: url('${escapeHtml(friendData.photoURL)}'); width: 80px; height: 80px; margin: 0 auto 15px;"` : 'style="width: 80px; height: 80px; margin: 0 auto 15px;"'}>
                        ${friendData.photoURL ? '' : `<span style="color: white; font-size: 24px;">${friendData.displayName ? friendData.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 'U'}</span>`}
                    </div>
                    <div class="friend-profile-name" style="font-size: 18px;">${escapeHtml(friendData.displayName || 'Unknown User')}</div>
                </div>
                
                <div class="action-buttons" style="flex-direction: column; gap: 10px;">
                    <button class="action-btn secondary" id="changeCategoryBtn">
                        <i class="fas fa-tag"></i> Change Category
                    </button>
                    <button class="action-btn secondary" id="togglePinBtn">
                        <i class="fas fa-thumbtack"></i> ${pinnedFriends.some(f => f.id === friendData.id) ? 'Unpin Friend' : 'Pin Friend'}
                    </button>
                    <button class="action-btn secondary" id="toggleMuteBtn">
                        <i class="fas fa-volume-mute"></i> ${mutedFriends.some(f => f.id === friendData.id) ? 'Unmute Friend' : 'Mute Friend'}
                    </button>
                    <button class="action-btn secondary" id="viewChatHistoryBtn">
                        <i class="fas fa-history"></i> View Chat History
                    </button>
                    <button class="action-btn secondary" id="viewCallHistoryBtn">
                        <i class="fas fa-phone-history"></i> View Call History
                    </button>
                    <button class="action-btn warning" id="removeFriendBtn">
                        <i class="fas fa-user-minus"></i> Remove Friend
                    </button>
                    <button class="action-btn danger" id="blockUserBtn">
                        <i class="fas fa-ban"></i> Block User
                    </button>
                </div>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border-color);">
                <button class="action-btn secondary close-options-btn" style="width: 100%;">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(optionsModal);
    
    optionsModal.querySelector('.close-options-modal').addEventListener('click', () => {
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('.close-options-btn').addEventListener('click', () => {
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#changeCategoryBtn').addEventListener('click', () => {
        showChangeCategoryModal(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#togglePinBtn').addEventListener('click', () => {
        togglePinFriend(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#toggleMuteBtn').addEventListener('click', () => {
        toggleMuteFriend(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#viewChatHistoryBtn').addEventListener('click', () => {
        viewChatHistory(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#viewCallHistoryBtn').addEventListener('click', () => {
        viewCallHistory(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#removeFriendBtn').addEventListener('click', () => {
        removeFriend(friendData);
        document.body.removeChild(optionsModal);
    });
    
    optionsModal.querySelector('#blockUserBtn').addEventListener('click', () => {
        blockUser(friendData);
        document.body.removeChild(optionsModal);
    });
}

export function viewChatHistory(friendData) {
    navigateToChat(friendData.id, friendData.displayName || 'User');
}

export function viewCallHistory(friendData) {
    navigateToCall(friendData.id, friendData.displayName || 'User');
}

export function showChangeCategoryModal(friendData) {
    const modal = document.createElement('div');
    modal.className = 'add-friend-modal active';
    modal.innerHTML = `
        <div class="add-friend-container">
            <div class="add-friend-header">
                <h3>Change Category</h3>
                <button class="add-friend-btn close-category-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 25px;">
                <div class="input-group">
                    <label class="input-label">Select New Category</label>
                    <select class="text-input" id="newCategorySelect">
                        <option value="acquaintance">Acquaintance</option>
                        <option value="friend" selected>Friend</option>
                        <option value="close-friend">Close Friend</option>
                        <option value="family">Family</option>
                        <option value="business">Business</option>
                    </select>
                </div>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                <button class="action-btn secondary close-category-btn">Cancel</button>
                <button class="action-btn primary" id="saveCategoryBtn">Save Category</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-category-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.close-category-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#saveCategoryBtn').addEventListener('click', async () => {
        const newCategory = modal.querySelector('#newCategorySelect').value;
        
        try {
            const token = getValidToken();
            if (!token) {
                showNotification('Authentication required', 'error');
                return;
            }
            
            const response = await apiCallWithRetry(`/api/friends/${friendData.id}/category`, {
                method: 'PUT',
                body: JSON.stringify({ category: newCategory })
            }, 1);
            
            if (response && response.success) {
                const friendIndex = friends.findIndex(f => f.id === friendData.id);
                if (friendIndex !== -1) {
                    friends[friendIndex].category = newCategory;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
                }
                
                updateCurrentSection();
                showNotification('Category updated successfully', 'success');
            }
        } catch (error) {
            console.log('[Friend Page] Failed to update category:', error.message);
            showNotification('Failed to update category', 'error');
        }
        
        document.body.removeChild(modal);
    });
}

// =============================================
// TEMPORARY, PINNED, AND MUTED FRIENDS FUNCTIONS
// =============================================

export function renderTemporaryFriends() {
    if (!temporaryList) return;
    
    temporaryList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-clock"></i>
            <p>No temporary friends</p>
            <p class="subtext">Temporary friends expire after a set time</p>
        </div>
    `;
}

export function renderPinnedFriends() {
    if (!pinnedList) return;
    
    if (pinnedFriends.length === 0) {
        pinnedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-thumbtack"></i>
                <p>No pinned friends</p>
                <p class="subtext">Pin important friends to keep them at the top</p>
            </div>
        `;
        return;
    }
    
    pinnedFriends.forEach(friend => {
        addFriendItem(friend, pinnedList, 'pinned');
    });
}

export function renderMutedFriends() {
    if (!mutedList) return;
    
    if (mutedFriends.length === 0) {
        mutedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-volume-mute"></i>
                <p>No muted friends</p>
                <p class="subtext">Mute friends to disable notifications</p>
            </div>
        `;
        return;
    }
    
    mutedFriends.forEach(friend => {
        addFriendItem(friend, mutedList, 'muted');
    });
}

// =============================================
// START CHAT MODAL FUNCTIONS
// =============================================

export function showStartChatModal() {
    startChatModal.classList.add('active');
    populateChatFriendsList();
    window.selectedChatFriend = null;
    document.getElementById('confirmStartChatBtn').disabled = true;
    document.getElementById('searchChatUser').value = '';
}

function populateChatFriendsList() {
    const chatFriendsList = document.getElementById('chatFriendsList');
    if (!chatFriendsList) return;
    
    chatFriendsList.innerHTML = '';
    
    const allChattableFriends = [
        ...pinnedFriends,
        ...friends.filter(f => f.online),
        ...friends.filter(f => !f.online),
        ...contacts
    ];
    
    if (allChattableFriends.length === 0) {
        chatFriendsList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                <i class="fas fa-user-friends" style="font-size: 24px; margin-bottom: 10px;"></i>
                <p>No friends available to chat</p>
                <p style="font-size: 14px; margin-top: 10px;">Add friends first to start chatting</p>
            </div>
        `;
        return;
    }
    
    allChattableFriends.forEach(friend => {
        const friendId = friend.id;
        const initials = friend.displayName ? 
            friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
            'U';
        
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.style.cursor = 'pointer';
        friendItem.style.marginBottom = '8px';
        friendItem.innerHTML = `
            <div class="friend-avatar" ${friend.photoURL ? `style="background-image: url('${escapeHtml(friend.photoURL)}')"` : ''}>
                ${friend.photoURL ? '' : `<span>${initials}</span>`}
                <div class="friend-status ${friend.online ? 'online' : 'offline'}"></div>
            </div>
            <div class="friend-info">
                <div class="friend-name">
                    <span class="friend-name-text">${escapeHtml(friend.displayName || 'Unknown User')}</span>
                </div>
                <div class="friend-details">
                    ${friend.username ? `<span class="friend-username">${escapeHtml(friend.username)}</span>` : ''}
                    <span>${friend.online ? 'Online' : 'Offline'}</span>
                </div>
            </div>
        `;
        
        friendItem.addEventListener('click', () => {
            document.querySelectorAll('#chatFriendsList .friend-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            friendItem.classList.add('selected');
            window.selectedChatFriend = friend;
            document.getElementById('confirmStartChatBtn').disabled = false;
        });
        
        chatFriendsList.appendChild(friendItem);
    });
}

function searchChatFriends(searchTerm) {
    const items = document.querySelectorAll('#chatFriendsList .friend-item');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const name = item.querySelector('.friend-name-text').textContent.toLowerCase();
        const username = item.querySelector('.friend-username')?.textContent.toLowerCase() || '';
        
        if (name.includes(term) || username.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// =============================================
// EVENT LISTENERS SETUP
// =============================================

export function setupEventListeners() {
    // Mutual friends modal
    document.getElementById('closeMutualFriendsModal').addEventListener('click', () => {
        mutualFriendsModal.classList.remove('active');
    });
    
    // Camera scanner
    document.getElementById('closeCameraBtn').addEventListener('click', () => {
        stopCameraScanner();
        cameraScannerModal.classList.remove('active');
    });
    
    document.getElementById('toggleCameraBtn').addEventListener('click', toggleCamera);
    document.getElementById('toggleFlashBtn').addEventListener('click', toggleFlash);
    
    // Category tabs
    const categoryTabs = {
        'allTab': 'allFriendsSection',
        'contactsTab': 'contactsSection',
        'friendsTab': 'friendsSection',
        'requestsTab': 'requestsSection',
        'temporaryTab': 'temporarySection',
        'pinnedTab': 'pinnedSection',
        'mutedTab': 'mutedSection'
    };
    
    Object.keys(categoryTabs).forEach(tabId => {
        document.getElementById(tabId).addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.friends-section').forEach(section => {
                section.classList.remove('active');
            });
            
            const sectionId = categoryTabs[tabId];
            document.getElementById(sectionId).classList.add('active');
            updateCurrentSection();
        });
    });
    
    // Category filter buttons
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            filterFriendsByCategory(category);
        });
    });
    
    // Search input
    document.getElementById('friendSearch').addEventListener('input', function() {
        searchFriends(this.value);
    });
    
    // Add friend button
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        addFriendModal.classList.add('active');
        document.querySelector('.add-friend-tab[data-tab="methods"]').click();
    });
    
    // Start New Chat button
    document.getElementById('startNewChatBtn').addEventListener('click', () => {
        showStartChatModal();
    });
    
    // Quick action buttons
    document.getElementById('syncContactsBtn').addEventListener('click', () => {
        simulateContactSync();
    });
    
    document.getElementById('scanQRBtn').addEventListener('click', () => {
        addFriendModal.classList.add('active');
        document.querySelector('.add-friend-tab[data-tab="qr"]').click();
    });
    
    document.getElementById('discoverBtn').addEventListener('click', () => {
        addFriendModal.classList.add('active');
        document.querySelector('.add-friend-tab[data-tab="nearby"]').click();
    });
    
    // Add friend modal tabs
    document.querySelectorAll('.add-friend-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            document.querySelectorAll('.add-friend-tab').forEach(t => {
                t.classList.remove('active');
            });
            this.classList.add('active');
            
            document.querySelectorAll('.add-friend-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabContent = document.getElementById(`${tabName}Tab`);
            if (tabContent) {
                tabContent.classList.add('active');
                
                if (tabName === 'all-users') {
                    renderAllUsersList();
                }
            }
        });
    });
    
    // Scan QR button in modal
    document.getElementById('scanQRBtnModal').addEventListener('click', () => {
        cameraScannerModal.classList.add('active');
        startCameraScanner();
    });
    
    // All users search input
    const allUsersSearch = document.getElementById('allUsersSearch');
    if (allUsersSearch) {
        allUsersSearch.addEventListener('input', () => {
            renderAllUsersList();
        });
    }
    
    // Send friend request button
    document.getElementById('sendFriendRequestBtn').addEventListener('click', async () => {
        const activeTab = document.querySelector('.add-friend-tab.active');
        if (!activeTab) return;
        
        const activeTabName = activeTab.dataset.tab;
        
        if (activeTabName === 'username') {
            const usernameInput = document.getElementById('usernameInput').value.trim();
            
            if (!usernameInput) {
                showNotification('Please enter a username', 'error');
                return;
            }
            
            if (!usernameInput.startsWith('@')) {
                showNotification('Username must start with @', 'error');
                return;
            }
            
            try {
                const response = await apiCallWithRetry(`/api/users/search?username=${encodeURIComponent(usernameInput)}`);
                
                if (!response || !response.user) {
                    showNotification('User not found', 'error');
                    return;
                }
                
                const userData = response.user;
                
                if (userData.id === currentUser.id) {
                    showNotification('You cannot add yourself as a friend', 'warning');
                    return;
                }
                
                const category = document.getElementById('friendCategorySelect').value || 'friend';
                const note = document.getElementById('friendNote').value.trim();
                const isBusiness = category === 'business';
                
                sendFriendRequest(userData.id, category, note, false, null, isBusiness);
                
            } catch (error) {
                showNotification('Error searching for user', 'error');
            }
            
        } else if (activeTabName === 'all-users') {
            showNotification('Please select a user from the list and click the "Add Friend" button next to their name', 'info');
        } else {
            showNotification('Please select a method and enter required information', 'warning');
        }
    });
    
    // Close modals
    document.getElementById('closeAddFriendModal').addEventListener('click', () => {
        addFriendModal.classList.remove('active');
    });
    
    document.getElementById('cancelAddFriendBtn').addEventListener('click', () => {
        addFriendModal.classList.remove('active');
    });
    
    // Start Chat Modal event listeners
    document.getElementById('closeStartChatModal').addEventListener('click', () => {
        startChatModal.classList.remove('active');
    });
    
    document.getElementById('cancelStartChatBtn').addEventListener('click', () => {
        startChatModal.classList.remove('active');
    });
    
    document.getElementById('confirmStartChatBtn').addEventListener('click', () => {
        if (window.selectedChatFriend) {
            const userId = window.selectedChatFriend.id;
            const userName = window.selectedChatFriend.displayName || 'User';
            navigateToChat(userId, userName);
            startChatModal.classList.remove('active');
        }
    });
    
    const searchChatUser = document.getElementById('searchChatUser');
    if (searchChatUser) {
        searchChatUser.addEventListener('input', function() {
            searchChatFriends(this.value);
        });
    }
    
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        friendDetailsPanel.classList.remove('active');
        selectedFriend = null;
    });
    
    // Friend request modal buttons
    document.getElementById('declineRequestBtn').addEventListener('click', () => {
        friendRequestModal.classList.remove('active');
        showNotification('Friend request declined', 'info');
    });
    
    document.getElementById('acceptRequestBtn').addEventListener('click', async function() {
        const userId = this.dataset.userId;
        const userName = this.dataset.userName;
        const qrData = this.dataset.qrData ? JSON.parse(this.dataset.qrData) : null;
        
        if (qrData && qrData.userId) {
            sendFriendRequest(qrData.userId);
            friendRequestModal.classList.remove('active');
        } else if (userId) {
            acceptFriendRequestOnline(null, userId);
        }
    });
    
    // Window resize
    window.addEventListener('resize', checkMobile);
    
    // Before unload
    window.addEventListener('beforeunload', () => {
        saveFriendsToLocalStorage();
        stopCameraScanner();
        if (backgroundSyncInterval) {
            clearInterval(backgroundSyncInterval);
            backgroundSyncInterval = null;
        }
    });
    
    // Listen for user data updates from auth system
    window.addEventListener('knectaAuthReady', (event) => {
        if (event.detail && event.detail.user) {
            currentUser = event.detail.user;
            userData = currentUser;
            
            if (isInitialized) {
                updateCurrentSection();
            }
        }
    });
    
    // Listen for user data loaded from parent-child communication
    window.addEventListener('userDataLoaded', (event) => {
        if (event.detail && event.detail.userData) {
            currentUser = event.detail.userData;
            userData = currentUser;
            
            if (isInitialized) {
                updateCurrentSection();
            }
        }
    });
    
    // Add parent coordination specific listeners
    window.addEventListener('parentSessionReady', () => {
        console.log('[Friend Page] Parent session ready - enabling UI');
        hideAuthError();
        hideReconnectionState();
    });
    
    window.addEventListener('parentSessionLogout', () => {
        console.log('[Friend Page] Parent logout - disabling UI');
        showAuthError('You have been logged out');
    });
    
    // Initial mobile check
    checkMobile();
}

// =============================================
// INITIALIZATION COMPLETION
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Friend Page] DOM Content Loaded - Starting UI initialization');
    
    setupAuthErrorButtons();
    setupEventListeners();
    enhancedInitialize();
});

function setupAuthErrorButtons() {
    const redirectBtn = document.getElementById('redirectToLoginBtn');
    const retryBtn = document.getElementById('retryAuthBtn');
    
    if (redirectBtn) {
        redirectBtn.addEventListener('click', function() {
            if (window.parentCoordinator) {
                window.parentCoordinator.sendToParent({
                    type: 'REDIRECT_TO_LOGIN',
                    source: 'friend.html',
                    timestamp: Date.now()
                });
            } else {
                if (window.parent && window.parent.location) {
                    window.parent.location.href = '/login.html';
                } else {
                    window.location.href = '/login.html';
                }
            }
        });
    }
    
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            hideAuthError();
            
            if (window.parentCoordinator) {
                window.parentCoordinator.attemptParentReconnection();
            }
        });
    }
}